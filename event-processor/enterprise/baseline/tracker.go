package baseline

import (
	"sync"
	"time"
)

// hourBucket stores the event count for a single hour.
type hourBucket struct {
	hour  int     // time.Now().Hour() when this bucket was created/last reset
	count float64
}

// Tracker provides thread-safe per-hour event counting keyed by dataSource|action.
type Tracker struct {
	mu     sync.Mutex
	counts map[string]*hourBucket // key = dataSource|action
}

// NewTracker creates a new Tracker ready for use.
func NewTracker() *Tracker {
	return &Tracker{
		counts: make(map[string]*hourBucket),
	}
}

// Record increments the event count for the given dataSource and action in the current hour.
// If the hour has changed since the last record, the count resets to 1.
func (t *Tracker) Record(dataSource, action string) {
	key := dataSource + "|" + action
	currentHour := time.Now().Hour()

	t.mu.Lock()
	defer t.mu.Unlock()

	bucket, ok := t.counts[key]
	if !ok || bucket.hour != currentHour {
		t.counts[key] = &hourBucket{hour: currentHour, count: 1}
		return
	}
	bucket.count++
}

// CurrentHourCount returns the event count for the given dataSource and action in the current hour.
// Returns 0 if there is no bucket or the bucket belongs to a different hour.
func (t *Tracker) CurrentHourCount(dataSource, action string) float64 {
	key := dataSource + "|" + action
	currentHour := time.Now().Hour()

	t.mu.Lock()
	defer t.mu.Unlock()

	bucket, ok := t.counts[key]
	if !ok || bucket.hour != currentHour {
		return 0
	}
	return bucket.count
}
