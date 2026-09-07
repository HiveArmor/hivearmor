package rules

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/structpb"
)

func writeRiskRule(t *testing.T, dir, name, yamlBody string) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(yamlBody), 0o644))
}

func matchingRiskEvent(dataType, action, ip string) *plugins.Event {
	return &plugins.Event{
		DataType: dataType,
		Origin:   &plugins.Side{Ip: ip},
		Log: map[string]*structpb.Value{
			"action": structpb.NewStringValue(action),
		},
	}
}

func stubOpenSearch(t *testing.T, hitCount int64) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "v3-hive-log-")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"hits": map[string]any{
				"total": map[string]any{"value": hitCount},
				"hits":  []map[string]any{},
			},
		})
	}))
}

func TestRiskRuleWhereOnlyScoresWithoutAfterEvents(t *testing.T) {
	dir := t.TempDir()
	writeRiskRule(t, dir, "where-only.yml", `
id: 19111
name: "[TEST] Risk where-only"
dataTypes: [windows]
category: Credential Access
technique: T1003.001
adversary: origin
description: where-only risk rule (9111-9113 style)
riskScore: 45
where: 'safe("log.action", "") == "lsass_dump" && safe("origin.ip", "") != ""'
`)
	require.Empty(t, LoadFromDir(dir).Invalid)

	var scored []int
	SetAddScoreFn(func(_ *plugins.Event, score int) { scored = append(scored, score) })
	t.Cleanup(func() { SetAddScoreFn(nil) })

	alerts := Evaluate(matchingRiskEvent("windows", "lsass_dump", "203.0.113.10"))
	assert.Empty(t, alerts)
	assert.Equal(t, []int{45}, scored)
}

func TestAfterEventsSatisfiedBlocksWhenLookbackMisses(t *testing.T) {
	rule := &Rule{
		ID: 19114,
		Correlation: []SearchRequest{{
			IndexPattern: "v3-hive-log-*",
			With: []Expression{{
				Field:    "origin.ip",
				Operator: "filter_term",
				Value:    "{{.origin.ip}}",
			}},
			Within: "10m",
			Count:  8,
		}},
	}
	event := matchingRiskEvent("dns", "dns_tunnel", "198.51.100.20")
	t.Cleanup(func() {
		searchBase = ""
		searchClient = nil
	})

	searchBase = ""
	searchClient = nil
	assert.False(t, afterEventsSatisfied(rule, event), "empty OpenSearch config is an afterEvents miss")

	miss := stubOpenSearch(t, 2)
	defer miss.Close()
	searchBase = miss.URL
	searchClient = miss.Client()
	assert.False(t, afterEventsSatisfied(rule, event), "count below threshold must miss")

	hit := stubOpenSearch(t, 8)
	defer hit.Close()
	searchBase = hit.URL
	searchClient = hit.Client()
	assert.True(t, afterEventsSatisfied(rule, event), "count at threshold must match")
}

func TestRiskRuleAfterEventsMustMatchBeforeScore(t *testing.T) {
	dir := t.TempDir()
	writeRiskRule(t, dir, "after-events.yml", `
id: 19114
name: "[TEST] Risk afterEvents"
dataTypes: [dns]
category: Command and Control
technique: T1071.004
adversary: origin
description: afterEvents must pass before addScoreFn
riskScore: 20
where: 'safe("log.action", "") == "dns_tunnel" && safe("origin.ip", "") != ""'
afterEvents:
  - indexPattern: v3-hive-log-*
    with:
      - field: origin.ip
        operator: filter_term
        value: "{{.origin.ip}}"
    within: 10m
    count: 8
`)
	report := LoadFromDir(dir)
	require.Empty(t, report.Invalid)
	require.Equal(t, 1, report.Loaded)
	loaded := GetRules("dns")
	require.Len(t, loaded, 1)
	require.NotEmpty(t, loaded[0].AfterEvents, "YAML afterEvents must parse")
	require.NotEmpty(t, loaded[0].Correlation, "Normalize must copy afterEvents to Correlation")

	var mu sync.Mutex
	var scored []int
	SetAddScoreFn(func(_ *plugins.Event, score int) {
		mu.Lock()
		scored = append(scored, score)
		mu.Unlock()
	})
	t.Cleanup(func() {
		SetAddScoreFn(nil)
		searchBase = ""
		searchClient = nil
	})

	event := matchingRiskEvent("dns", "dns_tunnel", "198.51.100.20")

	searchBase = ""
	searchClient = nil
	Evaluate(event)
	mu.Lock()
	assert.Empty(t, scored, "empty OpenSearch config must not score afterEvents risk rules")
	mu.Unlock()

	miss := stubOpenSearch(t, 2)
	defer miss.Close()
	searchBase = miss.URL
	searchClient = miss.Client()
	Evaluate(event)
	mu.Lock()
	assert.Empty(t, scored, "afterEvents miss must not call addScoreFn")
	mu.Unlock()

	hit := stubOpenSearch(t, 8)
	defer hit.Close()
	searchBase = hit.URL
	searchClient = hit.Client()
	Evaluate(event)
	mu.Lock()
	assert.Equal(t, []int{20}, scored, "afterEvents match must score before addScoreFn returns")
	mu.Unlock()
}

func TestEnterpriseRisk9114KeepsV3HiveAfterEvents(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok)
	dir := filepath.Join(filepath.Dir(file), "..", "builtin-rules", "enterprise-pack")
	report := LoadFromDir(dir)
	require.Empty(t, report.Invalid)

	var found *Rule
	for _, r := range AllRules() {
		if r.ID == 9114 {
			found = r
			break
		}
	}
	require.NotNil(t, found)
	require.NotEmpty(t, found.AfterEvents)
	require.NotEmpty(t, found.Correlation, "Normalize must copy afterEvents into Correlation")
	assert.Equal(t, "v3-hive-log-*", found.AfterEvents[0].IndexPattern)
	assert.Equal(t, int64(8), found.AfterEvents[0].Count)
}
