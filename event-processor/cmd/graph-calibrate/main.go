// graph-calibrate — measures the natural distribution of each graph_offense
// rule's grouping metric against a REAL Neo4j graph, so an operator can set the
// rule threshold from observed data (threshold = P99 + margin) instead of a
// guessed constant.
//
// It runs the "denominator" of each rule — the same MATCH/WITH the rule uses,
// but WITHOUT the `WHERE <metric> >= N` cut and WITHOUT the alert LIMIT — then
// reports count / min / median / P90 / P95 / P99 / max of the metric across all
// grouping keys, plus a recommended threshold.
//
// It NEVER writes to the graph (read-only Cypher) and it changes no rule files.
//
// Usage (from repo root):
//
//	cd event-processor && go run ./cmd/graph-calibrate/ \
//	  --uri http://localhost:7474 --user neo4j --pass "$NEO4J_PASSWORD"
//
// Flags fall back to NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD env vars, matching
// the event-processor's own config keys.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"sort"
	"time"
)

// probe is one rule's calibration query. `metricQuery` MUST return a single
// numeric column named `metric`, one row per grouping key (no threshold, no
// LIMIT). `current` is the threshold the shipped rule uses today.
type probe struct {
	ruleID      string
	ruleName    string
	metricName  string // human label for the metric (e.g. "hosts per privileged user")
	current     int
	metricQuery string
}

// The 4 shipped graph rules (9125–9128). Each metricQuery mirrors the rule's
// own MATCH/WITH time-window, returns the per-key metric with the >= cut and the
// LIMIT removed. Windows match the rules exactly.
var probes = []probe{
	{
		ruleID: "9125", ruleName: "GRAPH-PRIV-USER-HOST-FANOUT",
		metricName: "distinct hosts per privileged user (2h)", current: 8,
		metricQuery: `
MATCH (u:User)-[l:LOGGED_INTO]->(h:Host)
WHERE u.privileged = true AND l.lastSeen > datetime() - duration('PT2H')
WITH u, count(DISTINCT h) AS metric
RETURN metric`,
	},
	{
		ruleID: "9126", ruleName: "GRAPH-HOST-MANY-RISKY-EXTERNAL",
		metricName: "distinct risk-scored external IPs per host (3h)", current: 4,
		metricQuery: `
MATCH (h:Host)-[c:COMMUNICATED_WITH]->(ip:IpAddress)
WHERE c.lastSeen > datetime() - duration('PT3H') AND coalesce(ip.riskScore,0) > 0
  AND NOT ip.address STARTS WITH '10.' AND NOT ip.address STARTS WITH '192.168.' AND NOT ip.address STARTS WITH '172.'
WITH h, count(DISTINCT ip) AS metric
RETURN metric`,
	},
	{
		ruleID: "9127", ruleName: "GRAPH-SHARED-IP-MANY-ACCOUNTS",
		metricName: "distinct accounts per source IP (1h)", current: 6,
		metricQuery: `
MATCH (ip:IpAddress)<-[l:LOGGED_INTO_FROM]-(u:User)
WHERE l.lastSeen > datetime() - duration('PT1H')
WITH ip, count(DISTINCT u) AS metric
RETURN metric`,
	},
	{
		ruleID: "9128", ruleName: "GRAPH-NEW-EXTERNAL-MULTI-HOST",
		metricName: "distinct hosts per new external IP (4h)", current: 2,
		metricQuery: `
MATCH (h:Host)-[c:COMMUNICATED_WITH]->(ip:IpAddress)
WHERE ip.firstSeen > datetime() - duration('P1D') AND c.lastSeen > datetime() - duration('PT4H')
  AND NOT ip.address STARTS WITH '10.' AND NOT ip.address STARTS WITH '192.168.' AND NOT ip.address STARTS WITH '172.'
WITH ip, count(DISTINCT h) AS metric
RETURN metric`,
	},
}

type cypherStatement struct {
	Statement          string   `json:"statement"`
	ResultDataContents []string `json:"resultDataContents"`
}
type cypherRequest struct {
	Statements []cypherStatement `json:"statements"`
}
type cypherError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type cypherResponse struct {
	Results []struct {
		Columns []string `json:"columns"`
		Data    []struct {
			Row []json.RawMessage `json:"row"`
		} `json:"data"`
	} `json:"results"`
	Errors []cypherError `json:"errors"`
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	// nearest-rank on a 0-indexed sorted slice
	rank := p / 100 * float64(len(sorted)-1)
	lo := int(math.Floor(rank))
	hi := int(math.Ceil(rank))
	if lo == hi {
		return sorted[lo]
	}
	frac := rank - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}

func runMetric(client *http.Client, uri, user, pass, query string) ([]float64, error) {
	body, _ := json.Marshal(cypherRequest{Statements: []cypherStatement{{Statement: query, ResultDataContents: []string{"row"}}}})
	req, err := http.NewRequest("POST", uri+"/db/neo4j/tx/commit", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(data))
	}
	var cr cypherResponse
	if err := json.Unmarshal(data, &cr); err != nil {
		return nil, err
	}
	if len(cr.Errors) > 0 {
		return nil, fmt.Errorf("cypher %s: %s", cr.Errors[0].Code, cr.Errors[0].Message)
	}
	var out []float64
	if len(cr.Results) == 0 {
		return out, nil
	}
	for _, row := range cr.Results[0].Data {
		if len(row.Row) == 0 {
			continue
		}
		var n float64
		if err := json.Unmarshal(row.Row[0], &n); err == nil {
			out = append(out, n)
		}
	}
	return out, nil
}

func main() {
	uri := flag.String("uri", env("NEO4J_URI", "http://localhost:7474"), "Neo4j HTTP URI (http://host:7474)")
	user := flag.String("user", env("NEO4J_USER", "neo4j"), "Neo4j user")
	pass := flag.String("pass", env("NEO4J_PASSWORD", ""), "Neo4j password")
	margin := flag.Float64("margin", 1.25, "recommended threshold = ceil(P99 * margin)")
	flag.Parse()

	if *pass == "" {
		fmt.Fprintln(os.Stderr, "error: no password (set --pass or NEO4J_PASSWORD)")
		os.Exit(2)
	}
	client := &http.Client{Timeout: 30 * time.Second}

	fmt.Printf("graph-rule calibration — %s (margin ×%.2f)\n", *uri, *margin)
	fmt.Println("Read-only. Reports the observed distribution of each rule's metric so you can")
	fmt.Println("set threshold = ceil(P99 × margin). Run against a REAL, representative graph.")
	fmt.Println()

	failed := 0
	for _, p := range probes {
		vals, err := runMetric(client, *uri, *user, *pass, p.metricQuery)
		fmt.Printf("── %s (%s)\n   metric: %s\n", p.ruleID, p.ruleName, p.metricName)
		if err != nil {
			fmt.Printf("   ERROR: %v\n\n", err)
			failed++
			continue
		}
		if len(vals) == 0 {
			fmt.Printf("   no grouping keys matched in-window — graph empty or window has no data.\n")
			fmt.Printf("   current threshold: %d (cannot recommend without data)\n\n", p.current)
			continue
		}
		sort.Float64s(vals)
		p90 := percentile(vals, 90)
		p95 := percentile(vals, 95)
		p99 := percentile(vals, 99)
		rec := int(math.Ceil(p99 * *margin))
		if rec < 2 {
			rec = 2
		}
		fmt.Printf("   n=%d  min=%.0f  median=%.0f  P90=%.0f  P95=%.0f  P99=%.0f  max=%.0f\n",
			len(vals), vals[0], percentile(vals, 50), p90, p95, p99, vals[len(vals)-1])
		fmt.Printf("   current threshold: %d\n", p.current)
		fmt.Printf("   RECOMMENDED (ceil P99×%.2f): %d", *margin, rec)
		switch {
		case rec > p.current:
			fmt.Printf("  → RAISE from %d (current would over-fire on normal activity)\n", p.current)
		case rec < p.current:
			fmt.Printf("  → could LOWER from %d (current may miss real offenses)\n", p.current)
		default:
			fmt.Printf("  → current %d looks well-calibrated\n", p.current)
		}
		fmt.Println()
	}
	if failed > 0 {
		os.Exit(1)
	}
}
