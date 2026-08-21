package baseline

import (
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/hivearmor/sdk/plugins"
)

var (
	dedupMu  sync.Mutex
	dedupMap = map[string]time.Time{}

	// defaultTracker is the package-level tracker initialized by InitEvaluator.
	defaultTracker *Tracker
	// defaultAlertFn is the package-level alert callback initialized by InitEvaluator.
	defaultAlertFn func(*plugins.Alert)
)

// InitEvaluator sets up the anomaly evaluator with a tracker and alert callback.
// Call this from main.go after baseline.Init(). Both the Kafka consumer and the
// inject handler then call EvaluateEvent(event) without needing to hold a reference.
func InitEvaluator(alertFn func(*plugins.Alert)) *Tracker {
	defaultTracker = NewTracker()
	defaultAlertFn = alertFn
	return defaultTracker
}

// EvaluateEvent is a convenience wrapper that uses the package-level tracker and alertFn.
// Safe to call before InitEvaluator (no-op if not initialized).
func EvaluateEvent(event *plugins.Event) {
	if defaultTracker == nil || defaultAlertFn == nil {
		return
	}
	Evaluate(event, defaultTracker, defaultAlertFn)
}

// Evaluate checks if the current event rate for a given dataSource+action is anomalous.
// It records the event, checks the baseline, and fires an alert via alertFn if an anomaly
// is detected and not deduplicated within the current hour.
func Evaluate(event *plugins.Event, tracker *Tracker, alertFn func(*plugins.Alert)) {
	tracker.Record(event.DataSource, event.Action)
	count := tracker.CurrentHourCount(event.DataSource, event.Action)

	minSamples := getMinSamples()
	state, ok := GetBaseline(event.DataSource, event.Action)
	if !ok || state.SampleSize < minSamples {
		return
	}

	if !IsAnomaly(event.DataSource, event.Action, count) {
		return
	}

	if isDeduplicated(event.DataSource, event.Action) {
		return
	}

	alertFn(BuildAnomalyAlert(event))
	markDeduplicated(event.DataSource, event.Action)
}

// getMinSamples reads BASELINE_MIN_SAMPLES from the environment.
// Defaults to 72 if not set or unparseable.
func getMinSamples() int {
	raw := os.Getenv("BASELINE_MIN_SAMPLES")
	if raw == "" {
		return 72
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 72
	}
	return v
}

// isDeduplicated returns true if an alert has already been fired for this
// dataSource+action within the current hour.
func isDeduplicated(dataSource, action string) bool {
	key := dataSource + "|" + action
	now := time.Now()
	currentHour := now.Truncate(time.Hour)

	dedupMu.Lock()
	defer dedupMu.Unlock()

	last, exists := dedupMap[key]
	if !exists {
		return false
	}
	return last.Truncate(time.Hour).Equal(currentHour)
}

// markDeduplicated records that an alert was fired for this dataSource+action.
func markDeduplicated(dataSource, action string) {
	key := dataSource + "|" + action

	dedupMu.Lock()
	defer dedupMu.Unlock()

	dedupMap[key] = time.Now()
}
