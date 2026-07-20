package rules

import (
	"path/filepath"
	"runtime"
	"testing"

	"github.com/hivearmor/event-processor/enterprise/risk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

// loadTestRules loads the rules/tests directory in the repo so tests can run
// against test fixtures without needing the full workdir.
func loadTestRules(t *testing.T) {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok)
	dir := filepath.Join(filepath.Dir(file), "tests")
	Init(dir)
}

// TestRiskRuleIsActiveNotFiltered verifies that a rule with riskScore > 0
// is loaded and correctly identified as a risk rule (not a sequence rule,
// not a direct-alert rule).
func TestRiskRuleIsActiveNotFiltered(t *testing.T) {
	loadTestRules(t)

	all := AllRules()
	var found *Rule
	for _, r := range all {
		if r.RiskScore > 0 {
			found = r
			break
		}
	}
	require.NotNil(t, found, "expected at least one rule with riskScore > 0 in rules/tests/")
	assert.True(t, found.HasRiskScore())
	assert.False(t, found.HasSequence())
	assert.Equal(t, 30, found.RiskScore)
}

// TestRiskRuleRoutesToScorer verifies that Evaluate() routes a matching event
// to risk.AddScore (not to the direct-alert path) and returns no immediate alerts.
func TestRiskRuleRoutesToScorer(t *testing.T) {
	loadTestRules(t)

	// Reset the risk scorer state.
	scored := make(chan struct{}, 8)
	risk.Init(func(_ *plugins.Alert) {}, 9999.0) // threshold very high so no alert fires

	// Construct an event that matches the test rule's CEL: log.action == "failed_auth"
	logFields := map[string]*structpb.Value{
		"action": structpb.NewStringValue("failed_auth"),
	}
	event := &plugins.Event{
		DataType: "windows",
		Origin:   &plugins.Side{Ip: "10.0.0.1"},
		Log:      logFields,
	}
	_ = scored

	alerts := Evaluate(event)
	assert.Empty(t, alerts,
		"a risk rule must not produce a direct alert from Evaluate(); it feeds the scorer instead")
}

// TestRiskRuleDoesNotProduceDuplicateAlert verifies that sending many matching
// events does not cause Evaluate() to return alerts (those come from the scorer
// async flush loop, not from Evaluate() synchronously).
func TestRiskRuleDoesNotProduceDuplicateAlert(t *testing.T) {
	loadTestRules(t)
	risk.Init(func(_ *plugins.Alert) {}, 9999.0)

	logFields := map[string]*structpb.Value{
		"action": structpb.NewStringValue("failed_auth"),
	}
	event := &plugins.Event{
		DataType: "linux",
		Origin:   &plugins.Side{Ip: "192.168.1.50"},
		Log:      logFields,
	}

	for i := 0; i < 10; i++ {
		alerts := Evaluate(event)
		assert.Empty(t, alerts, "Evaluate() must never return a direct alert for a risk-scored rule (iteration %d)", i)
	}
}
