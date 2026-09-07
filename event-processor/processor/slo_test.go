package processor

import (
	"testing"
	"time"

	"github.com/hivearmor/sdk/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSnapshotIngestAlertSLO_unavailableWithoutSamples(t *testing.T) {
	ResetIngestAlertSLOForTest()
	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, false, snap["available"])
	assert.Nil(t, snap["p50Ms"])
	assert.Nil(t, snap["p95Ms"])
	assert.Nil(t, snap["breached"])
	assert.Equal(t, 0, snap["sampleCount"])
	assert.Equal(t, int64(sloTargetP95Ms), snap["targetP95Ms"])
	honesty, _ := snap["honesty"].(string)
	assert.Contains(t, honesty, "not measurable")
}

func TestRecordIngestAlertLatency_percentiles(t *testing.T) {
	ResetIngestAlertSLOForTest()
	base := time.Date(2026, 9, 7, 12, 0, 0, 0, time.UTC)
	// 10 samples: 100, 200, ... 1000ms
	for i := 1; i <= 10; i++ {
		event := &plugins.Event{
			Id:        "evt",
			Timestamp: base.Format(time.RFC3339Nano),
		}
		recordIngestAlertLatency(event, base.Add(time.Duration(i*100)*time.Millisecond))
	}
	p50, p95, n, ok := ingestAlertPercentiles()
	require.True(t, ok)
	assert.Equal(t, 10, n)
	assert.Equal(t, int64(500), p50)
	assert.Equal(t, int64(1000), p95)

	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, true, snap["available"])
	assert.Equal(t, int64(500), snap["p50Ms"])
	assert.Equal(t, int64(1000), snap["p95Ms"])
	assert.Equal(t, false, snap["breached"])
}

func TestRecordIngestAlertLatency_unmeasurableTimestamp(t *testing.T) {
	ResetIngestAlertSLOForTest()
	recordIngestAlertLatency(&plugins.Event{Id: "evt", Timestamp: ""}, time.Now())
	recordIngestAlertLatency(&plugins.Event{Id: "evt", Timestamp: "not-a-time"}, time.Now())
	recordIngestAlertLatency(nil, time.Now())
	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, false, snap["available"])
	assert.Equal(t, uint64(3), snap["skippedUnmeasurable"])
	assert.Nil(t, snap["p50Ms"])
}

func TestRecordIngestAlertLatency_negativeClockSkewSkipped(t *testing.T) {
	ResetIngestAlertSLOForTest()
	future := time.Now().UTC().Add(5 * time.Minute)
	recordIngestAlertLatency(&plugins.Event{
		Id:        "evt",
		Timestamp: future.Format(time.RFC3339Nano),
	}, time.Now().UTC())
	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, false, snap["available"])
	assert.Equal(t, uint64(1), snap["skippedUnmeasurable"])
}

func TestPercentileNearestRank(t *testing.T) {
	sorted := []int64{10, 20, 30, 40, 50}
	assert.Equal(t, int64(30), percentileNearestRank(sorted, 0.50))
	assert.Equal(t, int64(50), percentileNearestRank(sorted, 0.95))
	assert.Equal(t, int64(10), percentileNearestRank(sorted, 0))
	assert.Equal(t, int64(50), percentileNearestRank(sorted, 1))
	assert.Equal(t, int64(0), percentileNearestRank(nil, 0.5))
}

func TestPersistRequired_recordsSLOOnAlertWrite(t *testing.T) {
	ResetIngestAlertSLOForTest()
	ingest := time.Now().UTC().Add(-1500 * time.Millisecond)
	store := &fakeStore{}
	err := PersistRequired(ProcessingOutcome{
		Event: &plugins.Event{
			Id:        "evt-slo",
			Timestamp: ingest.Format(time.RFC3339Nano),
		},
		Alerts: []*plugins.Alert{{Id: "alert-slo"}},
	}, store)
	require.NoError(t, err)
	snap := SnapshotIngestAlertSLO()
	require.Equal(t, true, snap["available"], snap)
	assert.Equal(t, 1, snap["sampleCount"])
	p50, ok := snap["p50Ms"].(int64)
	require.True(t, ok)
	assert.GreaterOrEqual(t, p50, int64(1000))
}

func TestPersistRequired_noAlertsDoesNotInventSLO(t *testing.T) {
	ResetIngestAlertSLOForTest()
	store := &fakeStore{}
	err := PersistRequired(ProcessingOutcome{
		Event: &plugins.Event{
			Id:        "evt-none",
			Timestamp: time.Now().UTC().Add(-time.Second).Format(time.RFC3339Nano),
		},
	}, store)
	require.NoError(t, err)
	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, false, snap["available"])
	assert.Equal(t, 0, snap["sampleCount"])
}

func TestPersistRequired_failedAlertDoesNotRecordSLO(t *testing.T) {
	ResetIngestAlertSLOForTest()
	store := &fakeStore{failAlert: assert.AnError}
	err := PersistRequired(ProcessingOutcome{
		Event: &plugins.Event{
			Id:        "evt-fail",
			Timestamp: time.Now().UTC().Add(-time.Second).Format(time.RFC3339Nano),
		},
		Alerts: []*plugins.Alert{{Id: "alert-fail"}},
	}, store)
	require.Error(t, err)
	snap := SnapshotIngestAlertSLO()
	assert.Equal(t, false, snap["available"])
}
