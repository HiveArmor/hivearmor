package graph

import (
	"testing"

	"github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
)

func TestEmitMatch_ExceptionSuppressesBeforeAlert(t *testing.T) {
	var fired []*plugins.Alert
	eval := New("http://127.0.0.1:1", "neo4j", "pass", func(a *plugins.Alert) {
		fired = append(fired, a)
	}, nil)

	rule := &rules.Rule{
		ID:          77,
		Name:        "[TEST] Graph offense",
		Type:        "graph_offense",
		Category:    "lateral",
		Description: "test",
		AlertFields: []string{"sourceIP", "targetHost", "user"},
	}

	rules.ReplaceExceptionsForTest([]rules.DetectionException{{
		ID:     9,
		RuleID: "77",
		Active: true,
		Conditions: []rules.ExceptionCondition{
			{Field: "host.name", Operator: "is", Value: "approved-scanner"},
		},
	}})
	t.Cleanup(func() { rules.ReplaceExceptionsForTest(nil) })

	suppressedBefore, _, _ := rules.ExceptionCounters()

	eval.emitMatch(rule, map[string]string{
		"sourceIP":   "203.0.113.9",
		"targetHost": "dc01",
		"user":       "svc-scan",
		"host.name":  "approved-scanner",
	})
	assert.Empty(t, fired, "active exception must suppress graph offense alert")

	suppressedAfter, _, _ := rules.ExceptionCounters()
	assert.Equal(t, suppressedBefore+1, suppressedAfter)

	// Distinct dedup key + non-matching host should emit.
	eval.emitMatch(rule, map[string]string{
		"sourceIP":   "203.0.113.10",
		"targetHost": "dc01",
		"user":       "alice",
		"host.name":  "FIN-WKS-044",
	})
	assert.Len(t, fired, 1)
	assert.Equal(t, "[TEST] Graph offense", fired[0].Name)
}

func TestEventForExceptionMatch_PromotesCypherColumns(t *testing.T) {
	rule := &rules.Rule{ID: 1, Name: "x", AlertFields: []string{"sourceIP"}}
	ev := eventForExceptionMatch(rule, map[string]string{
		"sourceIP":   "198.51.100.7",
		"user":       "bob",
		"targetHost": "filesrv",
	})
	assert.NotNil(t, ev.Origin)
	assert.Equal(t, "198.51.100.7", ev.Origin.Ip)
	assert.Equal(t, "bob", ev.Origin.User)
	assert.NotNil(t, ev.Target)
	assert.Equal(t, "filesrv", ev.Target.Host)
}
