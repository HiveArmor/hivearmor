// graph-validate: end-to-end validation for T05 graph_offense detection.
//
// Tests:
//   Test 1 — Graph offense rules load from YAML
//   Test 2 — Lateral movement pattern detected in Neo4j
//   Test 3 — Alert includes kill-chain entity fields
//   Test 4 — Deduplication suppresses a second identical match
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hivearmor/event-processor/enterprise/graph"
	"github.com/hivearmor/event-processor/rules"
	"github.com/threatwinds/go-sdk/plugins"
)

const (
	neo4jURI  = "http://localhost:7474"
	neo4jUser = "neo4j"
	neo4jPass = "localdev123!"
)

func main() {
	rulesDir := resolveRulesDir()
	fmt.Printf("Loading graph_offense rules from: %s\n\n", rulesDir)

	rules.Init(rulesDir)
	time.Sleep(200 * time.Millisecond)

	// ─── TEST 1: rules load ────────────────────────────────────────────────────
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("TEST 1: Graph offense rule load")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	loaded := rules.GraphOffenseRules()
	if len(loaded) == 0 {
		fail("No graph_offense rules loaded — check rules directory")
	}
	fmt.Printf("PASS — %d graph_offense rules loaded:\n", len(loaded))
	for _, r := range loaded {
		fmt.Printf("  • %s  (interval=%ds)\n", r.Name, r.CheckIntervalSeconds)
	}

	// ─── Seed test data for lateral movement ──────────────────────────────────
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("SEEDING: Lateral movement test graph data")
	fmt.Println("═══════════════════════════════════════════════════════════════")
	seedLateralMovement()

	// ─── TEST 2 + 3: alert fires with expected fields ─────────────────────────
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("TEST 2: Lateral movement pattern detected")
	fmt.Println("TEST 3: Alert includes kill-chain entity fields")
	fmt.Println("═══════════════════════════════════════════════════════════════")

	lateralRule := findRule(loaded, "Multi-Stage Lateral Movement Kill Chain")
	if lateralRule == nil {
		fail("Could not find 'Multi-Stage Lateral Movement Kill Chain' rule")
	}

	var capturedAlerts []*plugins.Alert
	alertFn := func(a *plugins.Alert) {
		capturedAlerts = append(capturedAlerts, a)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	eval := graph.New(neo4jURI, neo4jUser, neo4jPass, alertFn, []*rules.Rule{lateralRule})
	eval.RunOnce(ctx, lateralRule)

	if len(capturedAlerts) == 0 {
		fail("No alert generated — lateral movement pattern not detected")
	}
	a := capturedAlerts[0]
	fmt.Printf("PASS TEST 2 — Alert fired: %q\n", a.Name)
	fmt.Printf("  severity=%s  category=%s  dataType=%s\n", a.Severity, a.Category, a.DataType)

	// Verify kill-chain fields are present in alert.Events[0].Log
	requiredFields := []string{"user", "pivotHost", "targetHost", "externalIP"}
	missingFields := []string{}
	logValues := map[string]string{}
	if len(a.Events) > 0 && a.Events[0].Log != nil {
		for k, v := range a.Events[0].Log {
			logValues[k] = v.GetStringValue()
		}
	}
	for _, f := range requiredFields {
		if v, ok := logValues[f]; !ok || v == "" {
			missingFields = append(missingFields, f)
		}
	}
	if len(missingFields) > 0 {
		fail("TEST 3 FAIL — missing kill-chain fields in alert.Events[0].Log: %v\nfound fields: %v", missingFields, logValues)
	}
	fmt.Printf("PASS TEST 3 — All kill-chain fields present in alert.Events[0].Log:\n")
	for k, v := range logValues {
		fmt.Printf("  %-20s = %s\n", k, v)
	}

	// ─── TEST 4: deduplication ────────────────────────────────────────────────
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Println("TEST 4: Deduplication — same pattern must not fire a second alert")
	fmt.Println("═══════════════════════════════════════════════════════════════")

	countBefore := len(capturedAlerts)
	eval.RunOnce(ctx, lateralRule) // same evaluator, same dedup state
	countAfter := len(capturedAlerts)
	if countAfter > countBefore {
		fail("TEST 4 FAIL — duplicate alert was emitted (count went %d → %d)", countBefore, countAfter)
	}
	fmt.Printf("PASS TEST 4 — Second run produced 0 new alerts (dedup suppressed duplicate)\n")
	fmt.Printf("  alerts before second run: %d  |  after: %d  |  diff: 0\n", countBefore, countAfter)

	// ─── Summary ──────────────────────────────────────────────────────────────
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════════════")
	fmt.Printf("ALL TESTS PASSED\n")
	fmt.Println("═══════════════════════════════════════════════════════════════")
}

func seedLateralMovement() {
	now := time.Now().UTC().Format(time.RFC3339)
	// MERGE nodes and relationships so re-runs are idempotent
	cypher := fmt.Sprintf(`
MERGE (u:User {username: 'validate-user'})
  SET u.riskScore = 50, u.firstSeen = '%s', u.lastSeen = '%s'
MERGE (h1:Host {hostname: 'validate-pivot-host'})
  SET h1.riskScore = 30, h1.firstSeen = '%s', h1.lastSeen = '%s'
MERGE (h2:Host {hostname: 'validate-target-host'})
  SET h2.riskScore = 20, h2.firstSeen = '%s', h2.lastSeen = '%s'
MERGE (extIP:IpAddress {address: '198.51.100.99'})
  SET extIP.riskScore = 0, extIP.isMalicious = false, extIP.firstSeen = '%s', extIP.lastSeen = '%s'
MERGE (u)-[r1:LOGGED_INTO]->(h1)
  SET r1.lastSeen = '%s', r1.count = 1, r1.date = '%s'
MERGE (u)-[r2:LOGGED_INTO]->(h2)
  SET r2.lastSeen = '%s', r2.count = 1, r2.date = '%s'
MERGE (h1)-[c:COMMUNICATED_WITH]->(extIP)
  SET c.lastSeen = '%s', c.count = 3, c.date = '%s'
RETURN 'seeded' AS result
`, now, now, now, now, now, now, now, now, now, now[:10], now, now[:10], now, now[:10])

	result := runCypher(cypher)
	if strings.Contains(result, `"seeded"`) {
		fmt.Println("OK — validate-user, validate-pivot-host, validate-target-host, 198.51.100.99 seeded")
	} else {
		log.Printf("WARN — unexpected seed result: %s", result)
	}
}

func runCypher(stmt string) string {
	body, _ := json.Marshal(map[string]any{
		"statements": []map[string]any{{
			"statement":          stmt,
			"resultDataContents": []string{"row"},
		}},
	})
	req, _ := http.NewRequest("POST", neo4jURI+"/db/neo4j/tx/commit", bytes.NewReader(body))
	req.SetBasicAuth(neo4jUser, neo4jPass)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	cl := &http.Client{Timeout: 15 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		log.Fatalf("Neo4j request failed: %v", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return string(data)
}

func findRule(rs []*rules.Rule, name string) *rules.Rule {
	for _, r := range rs {
		if r.Name == name {
			return r
		}
	}
	return nil
}

func resolveRulesDir() string {
	// Try builtin-rules/graph relative to this binary's source location
	candidates := []string{
		"builtin-rules/graph",
		filepath.Join(os.Getenv("GOPATH"), "src/github.com/hivearmor/event-processor/builtin-rules/graph"),
	}
	// Also check $PWD up the tree
	wd, _ := os.Getwd()
	for dir := wd; dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		candidates = append(candidates, filepath.Join(dir, "builtin-rules/graph"))
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	log.Fatal("Could not find builtin-rules/graph directory; run from event-processor/")
	return ""
}

func fail(format string, args ...any) {
	fmt.Printf("FAIL — "+format+"\n", args...)
	os.Exit(1)
}
