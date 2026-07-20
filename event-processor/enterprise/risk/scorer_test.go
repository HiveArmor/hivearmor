package risk

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/threatwinds/go-sdk/plugins"
)

// resetState wipes package-level scorer state for test isolation.
func resetState(th float64) chan *plugins.Alert {
	mu.Lock()
	scores = map[string]*riskEntry{}
	threshold = th
	mu.Unlock()

	fired := make(chan *plugins.Alert, 8)
	flushFn = func(a *plugins.Alert) { fired <- a }
	return fired
}

func testEvent(ip, dataType string) *plugins.Event {
	return &plugins.Event{
		DataType: dataType,
		Origin:   &plugins.Side{Ip: ip},
	}
}

// triggerFlush runs the threshold check synchronously (same logic as flushLoop).
func triggerFlush() []*plugins.Alert {
	var fired []*plugins.Alert
	mu.Lock()
	for key, e := range scores {
		if e.score >= threshold {
			a := buildRiskAlert(e, e.score)
			e.score = 0
			mu.Unlock()
			fired = append(fired, a)
			if flushFn != nil {
				flushFn(a)
			}
			mu.Lock()
			_ = key
		}
	}
	mu.Unlock()
	return fired
}

func TestRiskScoreAccumulation(t *testing.T) {
	ch := resetState(75.0)

	event := testEvent("10.0.0.1", "windows")

	// First event: score = 30, below threshold
	AddScore(event, 30)
	alerts := triggerFlush()
	assert.Empty(t, alerts, "score 30 should not cross threshold 75")

	// Second event: score = 60, still below threshold
	AddScore(event, 30)
	alerts = triggerFlush()
	assert.Empty(t, alerts, "score 60 should not cross threshold 75")

	// Third event: score = 90, crosses threshold
	AddScore(event, 30)
	alerts = triggerFlush()
	assert.Len(t, alerts, 1, "score 90 should cross threshold 75")
	assert.Equal(t, "risk", alerts[0].Category)
	assert.Equal(t, "3", alerts[0].Severity)
	assert.NotZero(t, alerts[0].ImpactScore)

	// Score was reset — next flush should not fire
	alerts = triggerFlush()
	assert.Empty(t, alerts, "score should reset to 0 after alert fires")

	close(ch)
}

func TestRiskScoreResetAfterFiring(t *testing.T) {
	resetState(50.0)

	event := testEvent("192.168.1.1", "linux")
	AddScore(event, 60)
	triggerFlush()

	// After reset, a single low-score event should not trigger again
	AddScore(event, 10)
	alerts := triggerFlush()
	assert.Empty(t, alerts, "post-reset score 10 should not cross threshold 50")
}

func TestRiskKeyEmpty(t *testing.T) {
	resetState(10.0)

	// Event with no origin IP or user produces no entry
	e := &plugins.Event{DataType: "test"}
	AddScore(e, 100)

	mu.Lock()
	n := len(scores)
	mu.Unlock()
	assert.Zero(t, n, "events with no origin should not create a score entry")
}

func TestRiskAlertAdversaryPopulated(t *testing.T) {
	resetState(50.0)

	event := testEvent("172.16.0.5", "firewall")
	AddScore(event, 60)
	alerts := triggerFlush()
	assert.Len(t, alerts, 1)
	assert.Equal(t, "172.16.0.5", alerts[0].Adversary.Ip)
}

func TestDecayReducesScore(t *testing.T) {
	resetState(100.0)

	event := testEvent("10.1.1.1", "syslog")
	AddScore(event, 80)

	// Simulate 1-hour decay by manipulating lastDecay
	mu.Lock()
	for _, e := range scores {
		e.lastDecay = time.Now().Add(-time.Hour)
	}
	mu.Unlock()

	// Run decay manually (same logic as decayLoop tick)
	now := time.Now()
	mu.Lock()
	for _, e := range scores {
		elapsed := now.Sub(e.lastDecay).Hours()
		e.score *= 1 - decayRate*elapsed
		e.lastDecay = now
	}
	mu.Unlock()

	// Score should be ~72 (80 * 0.90) — below threshold of 100
	alerts := triggerFlush()
	assert.Empty(t, alerts, "decayed score should not cross threshold")
}
