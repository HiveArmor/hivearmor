// Package sequence provides stateful multi-step rule detection with time windows.
package sequence

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
)

// SequenceRule defines a multi-step detection rule.
type SequenceRule struct {
	ID    string
	Name  string
	Steps []StepDef
}

// StepDef is one step in a sequence.
type StepDef struct {
	// Where is a CEL expression evaluated against the event JSON.
	Where  string
	Within time.Duration
}

// inProgressSeq tracks a partially matched sequence for a given key.
type inProgressSeq struct {
	ruleID      string
	matchedStep int
	stepTimes   []time.Time
}

var (
	mu       sync.Mutex
	state    = map[string][]inProgressSeq{} // key = adversaryKey
	rules    []SequenceRule
	celOnce  sync.Once
	celCache *plugins.CELCache
	alertFn  func(*plugins.Alert)
)

// Init registers sequence rules and starts the expiry sweeper.
func Init(seqRules []SequenceRule, fn func(*plugins.Alert)) {
	rules = seqRules
	alertFn = fn
	go expiryLoop()
}

// Process evaluates an event against all in-progress sequences and all rule step 0 conditions.
func Process(event *plugins.Event) {
	key := adversaryKey(event)
	if key == "" {
		return
	}
	eventJSON, _ := json.Marshal(eventMap(event))
	s := string(eventJSON)

	mu.Lock()
	defer mu.Unlock()

	// Advance existing sequences
	var updated []inProgressSeq
	for _, ips := range state[key] {
		rule := ruleByID(ips.ruleID)
		if rule == nil {
			continue
		}
		nextStep := ips.matchedStep
		if nextStep >= len(rule.Steps) {
			continue
		}
		stepDef := rule.Steps[nextStep]
		ok, celErr := getCEL().Evaluate(&s, stepDef.Where)
		if celErr != nil {
			log.Printf("[sequence.Process] CEL error rule.id=%s step=%d expression=%q error=%v",
				ips.ruleID, nextStep, stepDef.Where, celErr)
			ok = false
		}
		if !ok {
			// Keep it alive unless the window passed
			if time.Since(ips.stepTimes[len(ips.stepTimes)-1]) < stepDef.Within {
				updated = append(updated, ips)
			}
			continue
		}
		ips.matchedStep++
		ips.stepTimes = append(ips.stepTimes, time.Now())
		if ips.matchedStep >= len(rule.Steps) {
			// Sequence complete — fire alert
			if alertFn != nil {
				alertFn(buildSeqAlert(event, rule))
			}
			// Don't keep this sequence
			continue
		}
		updated = append(updated, ips)
	}
	state[key] = updated

	// Try to start step 0 of any rule
	for _, rule := range rules {
		if len(rule.Steps) == 0 {
			continue
		}
		ok, celErr := getCEL().Evaluate(&s, rule.Steps[0].Where)
		if celErr != nil {
			log.Printf("[sequence.Process] CEL error initialising rule.id=%s step=0 expression=%q error=%v",
				rule.ID, rule.Steps[0].Where, celErr)
			continue
		}
		if !ok {
			continue
		}
		seq := inProgressSeq{
			ruleID:      rule.ID,
			matchedStep: 1,
			stepTimes:   []time.Time{time.Now()},
		}
		if len(rule.Steps) == 1 {
			if alertFn != nil {
				alertFn(buildSeqAlert(event, &rule))
			}
			continue
		}
		state[key] = append(state[key], seq)
	}
}

func getCEL() *plugins.CELCache {
	celOnce.Do(func() {
		celCache = plugins.NewCELCache("com.hivearmor.sequence")
	})
	return celCache
}

// expiryLoop removes stale in-progress sequences every minute.
func expiryLoop() {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	for range tick.C {
		mu.Lock()
		for key, seqs := range state {
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
				delete(state, key)
			} else {
				state[key] = alive
			}
		}
		mu.Unlock()
	}
}

func ruleByID(id string) *SequenceRule {
	for i := range rules {
		if rules[i].ID == id {
			return &rules[i]
		}
	}
	return nil
}

func adversaryKey(event *plugins.Event) string {
	if event.Origin != nil {
		return event.Origin.Ip + "|" + event.Origin.User
	}
	return ""
}

func eventMap(e *plugins.Event) map[string]any {
	return map[string]any{
		"dataType":   e.DataType,
		"dataSource": e.DataSource,
		"raw":        e.Raw,
		"action":     e.Action,
	}
}

func buildSeqAlert(event *plugins.Event, rule *SequenceRule) *plugins.Alert {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	a := &plugins.Alert{
		Id:          uuid.New().String(),
		Timestamp:   now,
		LastUpdate:  now,
		Name:        rule.Name,
		Category:    "sequence",
		Description: "Multi-step sequence rule matched",
		Severity:    "3",
		DataType:    event.DataType,
		ImpactScore: 8,
		Events:      []*plugins.Event{event},
	}
	if event.Origin != nil {
		a.Adversary = event.Origin
	}
	if event.Target != nil {
		a.Target = event.Target
	}
	return a
}
