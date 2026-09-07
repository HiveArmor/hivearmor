package rules

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestObserveCorrelation_missAndErrorAndHit(t *testing.T) {
	ResetCorrelationCountersForTest()

	ObserveCorrelation(false, nil)
	ObserveCorrelation(true, nil)
	ObserveCorrelation(false, errAfterEventsUnconfigured)
	ObserveCorrelation(false, errors.New("timeout"))

	checks, misses, errs := CorrelationCounters()
	assert.Equal(t, uint64(4), checks)
	assert.Equal(t, uint64(1), misses, "unconfigured/error must not count as index misses")
	assert.Equal(t, uint64(2), errs)

	rate, ok := AfterEventsMissRate()
	require.True(t, ok)
	assert.InDelta(t, 0.25, rate, 1e-9)
}

func TestAfterEventsMissRate_unavailableWithoutChecks(t *testing.T) {
	ResetCorrelationCountersForTest()
	rate, ok := AfterEventsMissRate()
	assert.False(t, ok)
	assert.Equal(t, 0.0, rate)

	snap := CorrelationSnapshot()
	assert.Equal(t, false, snap["afterEventsMissRateAvailable"])
	assert.Nil(t, snap["afterEventsMissRate"])
	assert.Equal(t, "v3-hive-<type>-YYYY.MM.DD", snap["indexPatternConstraint"])
	assert.Equal(t, uint64(0), snap["correlationChecks"])
}

func TestExecuteSearchRequest_unconfiguredIsErrorNotMiss(t *testing.T) {
	ResetCorrelationCountersForTest()
	prev := searchBase
	searchBase = ""
	t.Cleanup(func() { searchBase = prev })

	matched, hits, err := executeSearchRequest(SearchRequest{IndexPattern: "v3-hive-log-*", Within: "15m"}, `{}`)
	require.Error(t, err)
	assert.ErrorIs(t, err, errAfterEventsUnconfigured)
	assert.False(t, matched)
	assert.Nil(t, hits)

	ObserveCorrelation(matched, err)
	_, misses, errs := CorrelationCounters()
	assert.Equal(t, uint64(0), misses)
	assert.Equal(t, uint64(1), errs)
}

func TestCorrelationSnapshot_doesNotChangeIndexPattern(t *testing.T) {
	ResetCorrelationCountersForTest()
	ObserveCorrelation(false, nil)
	ObserveCorrelation(false, nil)
	ObserveCorrelation(true, nil)
	snap := CorrelationSnapshot()
	assert.Equal(t, "v3-hive-<type>-YYYY.MM.DD", snap["indexPatternConstraint"])
	assert.Equal(t, true, snap["afterEventsMissRateAvailable"])
	rate, _ := snap["afterEventsMissRate"].(float64)
	assert.InDelta(t, 2.0/3.0, rate, 1e-9)
	assert.Equal(t, uint64(2), snap["afterEventsMisses"])
}
