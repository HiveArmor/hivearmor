// Package risk implements Risk-Based Alerting: events from risk-scored rules
// accumulate a score per origin key; when the threshold is exceeded an alert fires.
package risk

import (
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/threatwinds/go-sdk/plugins"
)

const (
	defaultThreshold = 100.0
	decayRate        = 0.10 // 10% per hour
)

type riskEntry struct {
	score     float64
	lastDecay time.Time
	ip        string
	user      string
	dataType  string
}

var (
	mu      sync.Mutex
	scores  = map[string]*riskEntry{}
	flushFn func(*plugins.Alert)
)

// Init starts the risk engine background workers.
// alertFn is called whenever a risk threshold is exceeded.
func Init(alertFn func(*plugins.Alert)) {
	flushFn = alertFn
	go decayLoop()
	go flushLoop()
}

// AddScore adds riskScore points to the key derived from the event.
func AddScore(event *plugins.Event, riskScore int) {
	key := riskKey(event)
	if key == "" {
		return
	}
	mu.Lock()
	e, ok := scores[key]
	if !ok {
		ip, user := sides(event)
		e = &riskEntry{
			lastDecay: time.Now(),
			ip:        ip,
			user:      user,
			dataType:  event.DataType,
		}
		scores[key] = e
	}
	e.score += float64(riskScore)
	mu.Unlock()
}

func riskKey(event *plugins.Event) string {
	ip, user := sides(event)
	if ip == "" && user == "" {
		return ""
	}
	return ip + "|" + user + "|" + event.DataType
}

func sides(event *plugins.Event) (ip, user string) {
	if event.Origin != nil {
		ip = event.Origin.Ip
		user = event.Origin.User
	}
	return
}

// decayLoop applies exponential decay every hour.
func decayLoop() {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	for range tick.C {
		now := time.Now()
		mu.Lock()
		for _, e := range scores {
			elapsed := now.Sub(e.lastDecay).Hours()
			e.score *= math.Pow(1-decayRate, elapsed)
			e.lastDecay = now
		}
		mu.Unlock()
	}
}

// flushLoop checks for entries exceeding the threshold every 60s.
func flushLoop() {
	tick := time.NewTicker(60 * time.Second)
	defer tick.Stop()
	for range tick.C {
		mu.Lock()
		for key, e := range scores {
			if e.score >= defaultThreshold {
				alert := buildRiskAlert(e)
				e.score = 0
				mu.Unlock()
				if flushFn != nil {
					flushFn(alert)
				}
				mu.Lock()
				_ = key
			}
		}
		mu.Unlock()
	}
}

func buildRiskAlert(e *riskEntry) *plugins.Alert {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	alert := &plugins.Alert{
		Id:          uuid.New().String(),
		Timestamp:   now,
		LastUpdate:  now,
		Name:        "Risk Threshold Exceeded",
		Category:    "risk",
		Description: "Accumulated risk score exceeded threshold",
		Severity:    "2",
		DataType:    e.dataType,
		ImpactScore: 6,
	}
	if e.ip != "" || e.user != "" {
		alert.Adversary = &plugins.Side{Ip: e.ip, User: e.user}
	}
	return alert
}
