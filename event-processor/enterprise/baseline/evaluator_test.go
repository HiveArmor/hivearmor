package baseline

import (
	"testing"

	ha_rules "github.com/hivearmor/event-processor/rules"
	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
)

func seedAnomalousBaseline(t *testing.T, dataSource, action string) {
	t.Helper()
	t.Setenv("BASELINE_MIN_SAMPLES", "1")
	ReplaceBaselinesForTest(map[string]AnomalyState{
		dataSource + "|" + action: {
			Mean:       10,
			StdDev:     1,
			SampleSize: 100,
		},
	})
	ResetDedupForTest()
	t.Cleanup(func() {
		ReplaceBaselinesForTest(nil)
		ResetDedupForTest()
	})
}

func TestEvaluate_ExceptionSuppressesBeforeAlert(t *testing.T) {
	const dataSource = "windows"
	const action = "process_create"
	seedAnomalousBaseline(t, dataSource, action)

	ha_rules.ReplaceExceptionsForTest([]ha_rules.DetectionException{{
		ID:     11,
		RuleID: ha_rules.BaselineAnomalyRuleID,
		Active: true,
		Conditions: []ha_rules.ExceptionCondition{
			{Field: "host.name", Operator: "is", Value: "approved-scanner"},
			{Field: "dataSource", Operator: "is", Value: dataSource},
		},
	}})
	t.Cleanup(func() { ha_rules.ReplaceExceptionsForTest(nil) })

	var fired []*plugins.Alert
	tracker := NewTracker()
	alertFn := func(a *plugins.Alert) { fired = append(fired, a) }

	suppressedBefore, _, _ := ha_rules.ExceptionCounters()

	// mean=10, std=1 → anomaly when count > 13. Record 14 events.
	excepted := &plugins.Event{
		DataSource: dataSource,
		Action:     action,
		DataType:   "windows",
		Origin:     &plugins.Side{Host: "approved-scanner", User: "svc-scan", Ip: "192.0.2.10"},
	}
	for i := 0; i < 14; i++ {
		Evaluate(excepted, tracker, alertFn)
	}
	assert.Empty(t, fired, "active baseline:anomaly exception must suppress before alert emit")

	suppressedAfter, _, _ := ha_rules.ExceptionCounters()
	assert.Equal(t, suppressedBefore+1, suppressedAfter, "exceptionsSuppressed must increment once (hourly dedup after suppress)")

	// Non-matching host still alerts (fresh tracker + dedup for a different metric pair).
	otherSource := "linux"
	otherAction := "user_login"
	seedAnomalousBaseline(t, otherSource, otherAction)
	otherTracker := NewTracker()
	other := &plugins.Event{
		DataSource: otherSource,
		Action:     otherAction,
		DataType:   "linux",
		Origin:     &plugins.Side{Host: "FIN-WKS-044", User: "alice", Ip: "192.0.2.20"},
	}
	for i := 0; i < 14; i++ {
		Evaluate(other, otherTracker, alertFn)
	}
	assert.Len(t, fired, 1)
	assert.Contains(t, fired[0].Name, "Anomalous activity")
	assert.Equal(t, "ANOMALY", fired[0].Category)
}

func TestEvaluate_NoExceptionStillAlerts(t *testing.T) {
	const dataSource = "firewall"
	const action = "deny"
	seedAnomalousBaseline(t, dataSource, action)
	ha_rules.ReplaceExceptionsForTest(nil)

	var fired []*plugins.Alert
	tracker := NewTracker()
	ev := &plugins.Event{
		DataSource: dataSource,
		Action:     action,
		Origin:     &plugins.Side{Host: "edge-01"},
	}
	for i := 0; i < 14; i++ {
		Evaluate(ev, tracker, func(a *plugins.Alert) { fired = append(fired, a) })
	}
	assert.Len(t, fired, 1)
}
