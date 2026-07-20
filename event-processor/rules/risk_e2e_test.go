package rules

import (
	"testing"
	"time"

	"github.com/hivearmor/event-processor/enterprise/risk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/threatwinds/go-sdk/plugins"
	"google.golang.org/protobuf/types/known/structpb"
)

// TestLiveRiskAlert is the end-to-end validation for Validation Test 3.
//
// It wires rule loader → CEL engine → risk scorer with a threshold of 25
// (rule riskScore is 30, so a single matching event crosses it) and confirms
// that the scorer's flushLoop fires an alert with:
//   - Category == "risk"
//   - Severity == "3" (high)
//   - Adversary.Ip populated
//   - ImpactScore > 0
func TestLiveRiskAlert(t *testing.T) {
	loadTestRules(t)

	fired := make(chan *plugins.Alert, 4)
	// Threshold of 25: rule adds 30 per event, so one event crosses it immediately.
	risk.Init(func(a *plugins.Alert) { fired <- a }, 25.0)
	SetAddScoreFn(risk.AddScore)

	logFields := map[string]*structpb.Value{
		"action": structpb.NewStringValue("failed_auth"),
	}
	event := &plugins.Event{
		DataType: "windows",
		Origin:   &plugins.Side{Ip: "203.0.113.42"},
		Log:      logFields,
	}

	// Feed one event — score = 30, crosses threshold of 25.
	alerts := Evaluate(event)
	assert.Empty(t, alerts, "Evaluate() must not return a direct alert for risk rules")

	// The flushLoop fires every 60s. Force an immediate flush by calling the
	// exported test helper in the risk package.
	risk.ForceFlush()

	select {
	case alert := <-fired:
		assert.Equal(t, "risk", alert.Category, "alert category must be 'risk'")
		assert.Equal(t, "3", alert.Severity, "risk alerts must be high severity (3)")
		require.NotNil(t, alert.Adversary, "adversary must be populated")
		assert.Equal(t, "203.0.113.42", alert.Adversary.Ip)
		assert.Greater(t, alert.ImpactScore, uint32(0), "ImpactScore must carry the accumulated score")
		t.Logf("PASS: risk alert fired — category=%s severity=%s adversary.ip=%s impactScore=%d",
			alert.Category, alert.Severity, alert.Adversary.Ip, alert.ImpactScore)
	case <-time.After(2 * time.Second):
		t.Fatal("timeout: expected a risk alert to fire within 2s after ForceFlush()")
	}
}

// TestLiveRiskAlertMultipleEvents confirms the accumulation path:
// three events at riskScore=30, threshold=75 → fires after crossing.
func TestLiveRiskAlertMultipleEvents(t *testing.T) {
	loadTestRules(t)

	fired := make(chan *plugins.Alert, 4)
	risk.Init(func(a *plugins.Alert) { fired <- a }, 75.0)
	SetAddScoreFn(risk.AddScore)

	logFields := map[string]*structpb.Value{
		"action": structpb.NewStringValue("failed_auth"),
	}
	event := &plugins.Event{
		DataType: "linux",
		Origin:   &plugins.Side{Ip: "198.51.100.7"},
		Log:      logFields,
	}

	// Two events: 30 + 30 = 60 — below threshold.
	Evaluate(event)
	Evaluate(event)
	risk.ForceFlush()

	select {
	case a := <-fired:
		t.Fatalf("unexpected alert after 60 score (threshold 75): %+v", a)
	case <-time.After(200 * time.Millisecond):
		// expected — no alert yet
	}

	// Third event: 60 + 30 = 90 — crosses threshold.
	Evaluate(event)
	risk.ForceFlush()

	select {
	case alert := <-fired:
		assert.Equal(t, "risk", alert.Category)
		assert.Equal(t, "198.51.100.7", alert.Adversary.Ip)
		assert.GreaterOrEqual(t, alert.ImpactScore, uint32(75))
		t.Logf("PASS: risk alert fired after accumulation — impactScore=%d", alert.ImpactScore)
	case <-time.After(2 * time.Second):
		t.Fatal("timeout: expected a risk alert after 90 score crossing threshold 75")
	}
}
