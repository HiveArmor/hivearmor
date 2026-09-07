package processor

import (
	"math"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/hivearmor/sdk/plugins"
)

const (
	// DET-SLO-001 — sliding window of persist-required → alert latencies.
	sloWindowSize  = 1024
	sloTargetP95Ms = 60_000
	sloHonesty     = "STAGING CANDIDATE — p50/p95 is event @timestamp to required alert persist (last 1024 samples). Unavailable until an alert is persisted with a parseable timestamp. Target p95 < 60s is a staging default, not a contractual SLO."
	sloUnavailable = "STAGING CANDIDATE — ingest→alert latency is not measurable yet (no persisted alerts with a parseable @timestamp)."
)

type ingestAlertSLOState struct {
	mu      sync.Mutex
	samples []int64
	next    int
	filled  int
}

var ingestAlertSLO ingestAlertSLOState
var ingestAlertUnmeasurable atomic.Uint64

// SnapshotIngestAlertSLO returns DET-SLO-001 p50/p95 for persist-required → alert.
// available is false when no measurable samples exist — callers must not invent zeros.
func SnapshotIngestAlertSLO() map[string]any {
	p50, p95, n, ok := ingestAlertPercentiles()
	skipped := ingestAlertUnmeasurable.Load()
	out := map[string]any{
		"sampleCount":            n,
		"targetP95Ms":            int64(sloTargetP95Ms),
		"window":                 "last_1024_alert_persists",
		"skippedUnmeasurable":    skipped,
		"indexPatternConstraint": "v3-hive-<type>-YYYY.MM.DD",
	}
	if !ok {
		out["available"] = false
		out["p50Ms"] = nil
		out["p95Ms"] = nil
		out["breached"] = nil
		out["honesty"] = sloUnavailable
		return out
	}
	breached := p95 > sloTargetP95Ms
	out["available"] = true
	out["p50Ms"] = p50
	out["p95Ms"] = p95
	out["breached"] = breached
	out["honesty"] = sloHonesty
	return out
}

func recordIngestAlertLatency(event *plugins.Event, persistAt time.Time) {
	if event == nil {
		ingestAlertUnmeasurable.Add(1)
		return
	}
	ingestAt, ok := parseEventTimestamp(event.Timestamp)
	if !ok {
		ingestAlertUnmeasurable.Add(1)
		return
	}
	latency := persistAt.Sub(ingestAt).Milliseconds()
	if latency < 0 {
		ingestAlertUnmeasurable.Add(1)
		return
	}
	ingestAlertSLO.mu.Lock()
	defer ingestAlertSLO.mu.Unlock()
	if ingestAlertSLO.samples == nil {
		ingestAlertSLO.samples = make([]int64, sloWindowSize)
	}
	ingestAlertSLO.samples[ingestAlertSLO.next] = latency
	ingestAlertSLO.next = (ingestAlertSLO.next + 1) % sloWindowSize
	if ingestAlertSLO.filled < sloWindowSize {
		ingestAlertSLO.filled++
	}
}

func ingestAlertPercentiles() (p50, p95 int64, n int, ok bool) {
	ingestAlertSLO.mu.Lock()
	defer ingestAlertSLO.mu.Unlock()
	n = ingestAlertSLO.filled
	if n == 0 {
		return 0, 0, 0, false
	}
	copied := make([]int64, n)
	if n < sloWindowSize {
		copy(copied, ingestAlertSLO.samples[:n])
	} else {
		copy(copied, ingestAlertSLO.samples)
	}
	sort.Slice(copied, func(i, j int) bool { return copied[i] < copied[j] })
	return percentileNearestRank(copied, 0.50), percentileNearestRank(copied, 0.95), n, true
}

func percentileNearestRank(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	if p <= 0 {
		return sorted[0]
	}
	if p >= 1 {
		return sorted[len(sorted)-1]
	}
	idx := int(math.Ceil(p*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func parseEventTimestamp(raw string) (time.Time, bool) {
	if raw == "" {
		return time.Time{}, false
	}
	layouts := []string{time.RFC3339Nano, time.RFC3339}
	for _, layout := range layouts {
		if ts, err := time.Parse(layout, raw); err == nil {
			return ts, true
		}
	}
	return time.Time{}, false
}

// ResetIngestAlertSLOForTest clears the sliding window. Tests only.
func ResetIngestAlertSLOForTest() {
	ingestAlertSLO.mu.Lock()
	ingestAlertSLO.samples = nil
	ingestAlertSLO.next = 0
	ingestAlertSLO.filled = 0
	ingestAlertSLO.mu.Unlock()
	ingestAlertUnmeasurable.Store(0)
}
