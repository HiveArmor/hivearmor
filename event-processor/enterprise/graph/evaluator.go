package graph

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hivearmor/event-processor/rules"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

const defaultInterval = 60 * time.Second

// AlertFn is called for each confirmed graph offense match.
type AlertFn func(*plugins.Alert)

// Evaluator runs Cypher queries against Neo4j on a per-rule schedule and emits alerts.
type Evaluator struct {
	neo4jURI  string
	neo4jUser string
	neo4jPass string
	http      *http.Client
	alertFn   AlertFn
	rules     []*rules.Rule

	dedupMu sync.Mutex
	dedupTTL map[string]time.Time
}

// New creates an Evaluator.
func New(neo4jURI, user, pass string, alertFn AlertFn, rs []*rules.Rule) *Evaluator {
	return &Evaluator{
		neo4jURI:  neo4jURI,
		neo4jUser: user,
		neo4jPass: pass,
		http: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			},
		},
		alertFn:  alertFn,
		rules:    rs,
		dedupTTL: make(map[string]time.Time),
	}
}

// Start launches one goroutine per rule and blocks until ctx is cancelled.
func (e *Evaluator) Start(ctx context.Context) {
	log.Printf("Graph offense evaluator started with %d rules", len(e.rules))

	var wg sync.WaitGroup
	for _, r := range e.rules {
		wg.Add(1)
		go func(rule *rules.Rule) {
			defer wg.Done()
			e.runRuleLoop(ctx, rule)
		}(r)
	}
	wg.Wait()
}

func (e *Evaluator) runRuleLoop(ctx context.Context, rule *rules.Rule) {
	interval := defaultInterval
	if rule.CheckIntervalSeconds > 0 {
		interval = time.Duration(rule.CheckIntervalSeconds) * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.evaluateRule(ctx, rule)
		}
	}
}

// cypher HTTP API request/response shapes
type cypherRequest struct {
	Statements []cypherStatement `json:"statements"`
}

type cypherStatement struct {
	Statement  string `json:"statement"`
	ResultDataContents []string `json:"resultDataContents"`
}

type cypherResponse struct {
	Results []struct {
		Columns []string        `json:"columns"`
		Data    []struct {
			Row []any `json:"row"`
		} `json:"data"`
	} `json:"results"`
	Errors []struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
}

// RunOnce executes a single rule query immediately, outside of the scheduled ticker.
// Useful for on-demand evaluation and testing.
func (e *Evaluator) RunOnce(ctx context.Context, rule *rules.Rule) {
	e.evaluateRule(ctx, rule)
}

func (e *Evaluator) evaluateRule(ctx context.Context, rule *rules.Rule) {
	if rule.CypherQuery == "" {
		return
	}

	reqBody, err := json.Marshal(cypherRequest{
		Statements: []cypherStatement{{
			Statement:          rule.CypherQuery,
			ResultDataContents: []string{"row"},
		}},
	})
	if err != nil {
		log.Printf("[graph] rule %q: marshal request: %v", rule.Name, err)
		return
	}

	url := fmt.Sprintf("%s/db/neo4j/tx/commit", e.neo4jURI)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		log.Printf("[graph] rule %q: build request: %v", rule.Name, err)
		return
	}
	req.SetBasicAuth(e.neo4jUser, e.neo4jPass)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := e.http.Do(req)
	if err != nil {
		log.Printf("[graph] rule %q: HTTP error: %v", rule.Name, err)
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		log.Printf("[graph] rule %q: HTTP %d: %s", rule.Name, resp.StatusCode, string(data))
		return
	}

	var cr cypherResponse
	if err := json.Unmarshal(data, &cr); err != nil {
		log.Printf("[graph] rule %q: parse response: %v", rule.Name, err)
		return
	}
	if len(cr.Errors) > 0 {
		log.Printf("[graph] rule %q: Cypher error: %s — %s", rule.Name, cr.Errors[0].Code, cr.Errors[0].Message)
		return
	}
	if len(cr.Results) == 0 {
		return
	}

	result := cr.Results[0]
	for _, row := range result.Data {
		fields := zipFields(result.Columns, row.Row)
		dedupKey := buildDedupKey(rule, fields)
		if !e.isNew(dedupKey, 4*time.Hour) {
			continue
		}
		alert := e.buildAlert(rule, fields)
		if e.alertFn != nil {
			e.alertFn(alert)
		}
	}
}

// zipFields pairs column names with row values into a string map.
func zipFields(cols []string, row []any) map[string]string {
	m := make(map[string]string, len(cols))
	for i, col := range cols {
		if i < len(row) {
			m[col] = fmt.Sprintf("%v", row[i])
		}
	}
	return m
}

// buildDedupKey produces a stable key from the rule name and alertFields values.
func buildDedupKey(rule *rules.Rule, fields map[string]string) string {
	key := rule.Name
	for _, f := range rule.AlertFields {
		if v, ok := fields[f]; ok {
			key += "|" + f + "=" + v
		}
	}
	return key
}

// isNew returns true and records the key if it hasn't been seen within ttl.
func (e *Evaluator) isNew(key string, ttl time.Duration) bool {
	e.dedupMu.Lock()
	defer e.dedupMu.Unlock()
	if exp, ok := e.dedupTTL[key]; ok && time.Now().Before(exp) {
		return false
	}
	e.dedupTTL[key] = time.Now().Add(ttl)
	// Prune expired entries to bound memory usage
	if len(e.dedupTTL) > 10000 {
		now := time.Now()
		for k, v := range e.dedupTTL {
			if now.After(v) {
				delete(e.dedupTTL, k)
			}
		}
	}
	return true
}

func (e *Evaluator) buildAlert(rule *rules.Rule, fields map[string]string) *plugins.Alert {
	alert := &plugins.Alert{
		Id:          uuid.New().String(),
		Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
		Name:        rule.Name,
		Category:    rule.Category,
		Description: rule.Description,
		References:  rule.References,
		DataType:    "graph_offense",
	}

	// Map severity: YAML severity field (1-4) → alert severity string (1-3)
	switch {
	case rule.Severity >= 4:
		alert.Severity = "3"
	case rule.Severity >= 3:
		alert.Severity = "2"
	default:
		alert.Severity = "1"
	}

	if rule.Impact != nil {
		alert.Impact = &plugins.Impact{
			Confidentiality: rule.Impact.Confidentiality,
			Integrity:       rule.Impact.Integrity,
			Availability:    rule.Impact.Availability,
		}
		alert.ImpactScore = rule.Impact.Confidentiality + rule.Impact.Integrity + rule.Impact.Availability
	}

	// Promote first alertFields value to adversary.ip / target.host where applicable
	if ip, ok := fields["sourceIP"]; ok {
		alert.Adversary = &plugins.Side{Ip: ip}
	}
	if host, ok := fields["targetHost"]; ok {
		alert.Target = &plugins.Side{Host: host}
	}
	if user, ok := fields["user"]; ok && alert.Adversary != nil {
		alert.Adversary.User = user
	}

	// Attach matched field values as deduplicateBy so WriteAlert dedup works
	for _, f := range rule.AlertFields {
		if _, ok := fields[f]; ok {
			alert.DeduplicateBy = append(alert.DeduplicateBy, f)
		}
	}

	// Attach a synthetic Event carrying the Cypher result fields so analysts can
	// see the matched kill-chain entities in the alert detail view.
	graphEvent := buildGraphEvent(rule, fields)
	alert.Events = []*plugins.Event{graphEvent}

	return alert
}

// buildGraphEvent packs Cypher result fields into a synthetic Event for the alert.
func buildGraphEvent(rule *rules.Rule, fields map[string]string) *plugins.Event {
	logMap := make(map[string]*structpb.Value, len(rule.AlertFields))
	for _, f := range rule.AlertFields {
		if v, ok := fields[f]; ok {
			logMap[f] = structpb.NewStringValue(v)
		}
	}
	return &plugins.Event{
		Id:        uuid.New().String(),
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		DataType:  "graph_offense",
		Raw:       fmt.Sprintf("graph_offense rule=%q", rule.Name),
		Log:       logMap,
	}
}
