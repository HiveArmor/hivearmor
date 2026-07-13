package rules

import (
	"bytes"
	"log"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/threatwinds/go-sdk/plugins"
)

// withTestRules temporarily replaces the rule store for the duration of fn.
func withTestRules(testRules []*Rule, fn func()) {
	mu.Lock()
	old := byType
	newMap := map[string][]*Rule{}
	for _, r := range testRules {
		for _, dt := range r.DataTypes {
			newMap[dt] = append(newMap[dt], r)
		}
	}
	byType = newMap
	mu.Unlock()

	fn()

	mu.Lock()
	byType = old
	mu.Unlock()
}

// makeTestEvent returns a minimal Event for the given dataType.
func makeTestEvent(dataType, id string) *plugins.Event {
	return &plugins.Event{
		Id:       id,
		DataType: dataType,
	}
}

func TestEvaluate_LogsCELErrorInsteadOfSilentDrop(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(nil)

	// Reset rate-limiter so this test always logs.
	celErrorsMu.Lock()
	celErrorsSeen = map[string]time.Time{}
	celErrorsMu.Unlock()

	rule := &Rule{
		ID:        9999,
		Name:      "broken-rule",
		DataTypes: []string{"syslog"},
		Where:     `this is not valid CEL !!!`,
		Impact:    &Impact{},
	}
	withTestRules([]*Rule{rule}, func() {
		alerts := Evaluate(makeTestEvent("syslog", "ev-001"))
		assert.Empty(t, alerts, "broken rule must not produce alerts")
	})

	out := buf.String()
	assert.Contains(t, out, "CEL error", "must log CEL error")
	assert.Contains(t, out, "9999", "must include rule ID")
	assert.Contains(t, out, "broken-rule", "must include rule name")
	assert.Contains(t, out, "this is not valid", "must include expression")
}

func TestEvaluate_DoesNotLogDuplicateCELErrorWithin60s(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(nil)

	// Prime the rate-limiter so the error was "just seen".
	celErrorsMu.Lock()
	celErrorsSeen = map[string]time.Time{
		"9998::bad expr": time.Now(),
	}
	celErrorsMu.Unlock()

	rule := &Rule{
		ID:        9998,
		Name:      "dup-rule",
		DataTypes: []string{"syslog"},
		Where:     `bad expr`,
		Impact:    &Impact{},
	}
	withTestRules([]*Rule{rule}, func() {
		for i := 0; i < 10; i++ {
			Evaluate(makeTestEvent("syslog", "ev-dup"))
		}
	})

	count := strings.Count(buf.String(), "CEL error")
	assert.Equal(t, 0, count, "error already seen within 60s must not be re-logged")
}

func TestEvaluate_RelogsAfterRateLimitWindow(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(nil)

	// Set last-seen to just beyond the interval.
	celErrorsMu.Lock()
	celErrorsSeen = map[string]time.Time{
		"9997::stale expr": time.Now().Add(-(celErrorLogInterval + time.Second)),
	}
	celErrorsMu.Unlock()

	rule := &Rule{
		ID:        9997,
		Name:      "stale-rule",
		DataTypes: []string{"syslog"},
		Where:     `stale expr`,
		Impact:    &Impact{},
	}
	withTestRules([]*Rule{rule}, func() {
		Evaluate(makeTestEvent("syslog", "ev-stale"))
	})

	assert.Contains(t, buf.String(), "CEL error", "must re-log after rate-limit window expires")
}

func TestEvaluate_NilEventReturnsNil(t *testing.T) {
	assert.Nil(t, Evaluate(nil))
}

func TestEvaluate_ValidRuleProducesAlertWithoutLogging(t *testing.T) {
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(nil)

	celErrorsMu.Lock()
	celErrorsSeen = map[string]time.Time{}
	celErrorsMu.Unlock()

	rule := &Rule{
		ID:        1,
		Name:      "always-match",
		DataTypes: []string{"syslog"},
		Where:     `true`,
		Impact:    &Impact{Confidentiality: 3, Integrity: 3, Availability: 3},
	}
	withTestRules([]*Rule{rule}, func() {
		alerts := Evaluate(makeTestEvent("syslog", "ev-ok"))
		assert.NotEmpty(t, alerts, "valid rule must fire")
	})

	assert.NotContains(t, buf.String(), "CEL error", "no error log for a valid rule")
}

func TestShouldLogCELError_ConcurrentSafety(t *testing.T) {
	celErrorsMu.Lock()
	celErrorsSeen = map[string]time.Time{}
	celErrorsMu.Unlock()

	var wg sync.WaitGroup
	logCount := 0
	var mu sync.Mutex

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if shouldLogCELError(42, "expr") {
				mu.Lock()
				logCount++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	assert.Equal(t, 1, logCount, "only one goroutine should win the first-log slot")
}
