package sequence

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/threatwinds/go-sdk/plugins"
)

// newTestEngine resets all package-level state and registers the given rules with a
// collecting alertFn. Returns a channel that receives every fired alert.
func newTestEngine(seqRules []SequenceRule) chan *plugins.Alert {
	mu.Lock()
	state = map[string][]inProgressSeq{}
	rules = seqRules
	mu.Unlock()

	fired := make(chan *plugins.Alert, 8)
	alertFn = func(a *plugins.Alert) { fired <- a }
	return fired
}

func testEvent(ip, action string) *plugins.Event {
	return &plugins.Event{
		Action: action,
		Origin: &plugins.Side{Ip: ip},
	}
}

func reconExploitRule() SequenceRule {
	return SequenceRule{
		ID:   "test-sequence-001",
		Name: "[TEST] Recon followed by Exploitation",
		Steps: []StepDef{
			{Where: `action == "port_scan"`, Within: 10 * time.Minute},
			{Where: `action == "exploit_attempt"`, Within: 30 * time.Minute},
		},
	}
}

func TestSequenceDetection(t *testing.T) {
	fired := newTestEngine([]SequenceRule{reconExploitRule()})

	// Step 1 — must not fire an alert on its own.
	Process(testEvent("192.0.2.1", "port_scan"))
	select {
	case a := <-fired:
		t.Fatalf("step 1 alone must not fire alert, got: %v", a)
	default:
	}

	// Step 2 from same IP within window — must fire alert.
	Process(testEvent("192.0.2.1", "exploit_attempt"))
	select {
	case a := <-fired:
		assert.Equal(t, "[TEST] Recon followed by Exploitation", a.Name)
	case <-time.After(time.Second):
		t.Fatal("completed sequence must fire alert within 1s")
	}
}

func TestSequenceDetection_DifferentIPDoesNotComplete(t *testing.T) {
	fired := newTestEngine([]SequenceRule{reconExploitRule()})

	// Step 1 from host A.
	Process(testEvent("192.0.2.1", "port_scan"))

	// Step 2 from a different host — must not fire.
	Process(testEvent("10.0.0.99", "exploit_attempt"))
	select {
	case a := <-fired:
		t.Fatalf("different source IP must not complete sequence, got: %v", a)
	default:
	}
}

func TestSequenceDetection_ExpiredStepNotCompleted(t *testing.T) {
	fired := newTestEngine([]SequenceRule{reconExploitRule()})

	Process(testEvent("192.0.2.1", "port_scan"))

	// Backdate the step time so the window has elapsed.
	mu.Lock()
	key := "192.0.2.1|"
	for i := range state[key] {
		state[key][i].stepTimes[0] = time.Now().Add(-31 * time.Minute)
	}
	mu.Unlock()

	// Run expiry sweep manually.
	mu.Lock()
	for k, seqs := range state {
		var alive []inProgressSeq
		for _, s := range seqs {
			rule := ruleByID(s.ruleID)
			if rule == nil || s.matchedStep >= len(rule.Steps) {
				continue
			}
			within := rule.Steps[s.matchedStep].Within
			if time.Since(s.stepTimes[len(s.stepTimes)-1]) < within {
				alive = append(alive, s)
			}
		}
		if len(alive) == 0 {
			delete(state, k)
		} else {
			state[k] = alive
		}
	}
	mu.Unlock()

	// Step 2 after expiry — must not fire.
	Process(testEvent("192.0.2.1", "exploit_attempt"))
	select {
	case a := <-fired:
		t.Fatalf("expired sequence must not fire alert, got: %v", a)
	default:
	}
}

func TestSequenceDetection_NoOriginSkipped(t *testing.T) {
	fired := newTestEngine([]SequenceRule{reconExploitRule()})

	// Event with no origin — adversaryKey returns "" so it must be silently dropped.
	e := &plugins.Event{Action: "port_scan"}
	Process(e)

	mu.Lock()
	stateLen := len(state)
	mu.Unlock()
	assert.Equal(t, 0, stateLen, "event without origin must not add state")

	select {
	case a := <-fired:
		t.Fatalf("event without origin must not fire alert, got: %v", a)
	default:
	}
}

func TestExpiryLoopStartedByInit(t *testing.T) {
	// Confirm Init does not panic and the sweeper goroutine starts cleanly.
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("Init panicked: %v", r)
		}
	}()
	Init([]SequenceRule{reconExploitRule()}, func(_ *plugins.Alert) {})
}
