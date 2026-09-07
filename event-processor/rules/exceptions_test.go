package rules

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExceptionCondMatch_Operators(t *testing.T) {
	fields := map[string]string{
		"origin.host": "approved-scanner",
		"origin.ip":   "10.99.1.5",
		"origin.user": "svc-scan",
	}

	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "host.name", Operator: "is", Value: "approved-scanner"}, fields))
	assert.False(t, exceptionCondMatch(ExceptionCondition{Field: "host.name", Operator: "is", Value: "other"}, fields))
	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "host.name", Operator: "is_not", Value: "other"}, fields))
	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "origin.host", Operator: "contains", Value: "scanner"}, fields))
	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "source.ip", Operator: "starts_with", Value: "10.99."}, fields))
	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "origin.user", Operator: "ends_with", Value: "scan"}, fields))
	assert.True(t, exceptionCondMatch(ExceptionCondition{Field: "host.name", Operator: "in", Value: "a, approved-scanner, b"}, fields))
	assert.False(t, exceptionCondMatch(ExceptionCondition{Field: "host.name", Operator: "unknown_op", Value: "approved-scanner"}, fields))
}

func TestExceptionMatches_ActiveOnlyAndAND(t *testing.T) {
	setExceptions([]DetectionException{
		{
			ID:     1,
			RuleID: "42",
			Active: true,
			Conditions: []ExceptionCondition{
				{Field: "host.name", Operator: "is", Value: "approved-scanner"},
				{Field: "user.name", Operator: "is", Value: "svc-scan"},
			},
		},
		{
			ID:     2,
			RuleID: "42",
			Active: false, // should never be loaded; belt-and-suspenders
			Conditions: []ExceptionCondition{
				{Field: "host.name", Operator: "is", Value: "anything"},
			},
		},
	})
	t.Cleanup(func() { setExceptions(nil) })

	event := &plugins.Event{
		Origin: &plugins.Side{Host: "approved-scanner", User: "svc-scan"},
	}
	assert.True(t, ExceptionMatches("42", event))

	partial := &plugins.Event{
		Origin: &plugins.Side{Host: "approved-scanner", User: "other"},
	}
	assert.False(t, ExceptionMatches("42", partial))
	assert.False(t, ExceptionMatches("99", event))
}

func TestLoadExceptionsFromFile_AndEvaluateSkip(t *testing.T) {
	dir := t.TempDir()
	excDir := filepath.Join(dir, "exceptions")
	require.NoError(t, os.MkdirAll(excDir, 0o755))
	yamlBody := `
exceptions:
  - id: 9001
    ruleId: "7"
    active: true
    conditions:
      - field: host.name
        operator: is
        value: approved-scanner
  - id: 9002
    ruleId: "7"
    active: false
    conditions:
      - field: host.name
        operator: is
        value: should-not-apply
`
	require.NoError(t, os.WriteFile(filepath.Join(excDir, "exceptions.yaml"), []byte(yamlBody), 0o644))
	require.NoError(t, LoadExceptionsFromFile(filepath.Join(excDir, "exceptions.yaml")))
	t.Cleanup(func() { setExceptions(nil) })

	suppressedBefore, activeCount, _ := ExceptionCounters()
	assert.Equal(t, 1, activeCount)

	before := byType
	t.Cleanup(func() {
		mu.Lock()
		byType = before
		mu.Unlock()
	})

	mu.Lock()
	byType = map[string][]*Rule{
		"windows": {{
			ID:        7,
			Name:      "test-exception-rule",
			Where:     `origin.host != ""`,
			DataTypes: []string{"windows"},
		}},
	}
	mu.Unlock()

	matchEvent := &plugins.Event{
		Id:       "e1",
		DataType: "windows",
		Origin:   &plugins.Side{Host: "approved-scanner"},
	}
	alerts := Evaluate(matchEvent)
	assert.Empty(t, alerts, "active exception must suppress alert")

	suppressedAfter, _, _ := ExceptionCounters()
	assert.Equal(t, suppressedBefore+1, suppressedAfter)

	other := &plugins.Event{
		Id:       "e2",
		DataType: "windows",
		Origin:   &plugins.Side{Host: "FIN-WKS-044"},
	}
	alerts = Evaluate(other)
	assert.Len(t, alerts, 1, "non-matching host should still alert")
}
