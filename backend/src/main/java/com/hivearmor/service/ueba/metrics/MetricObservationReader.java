package com.hivearmor.service.ueba.metrics;

import java.time.LocalDate;
import java.util.stream.DoubleStream;

/**
 * Abstraction for reading metric observations from OpenSearch.
 *
 * <p>Each implementation resolves observations for one or more metrics in
 * {@link UebaMetrics#METRIC_SET}. All OpenSearch queries MUST be constructed
 * through {@code SearchUtil} DSL, and all index patterns MUST be obtained from
 * {@code MsspIndexResolver} — no raw {@code v3-hive-*} strings.
 *
 * <p>Used by {@code HaUebaBaselineService} for computing peer-group baselines
 * over a rolling 30-day window, and by {@code HaUebaDeviationEngine} for
 * observing the current-hour value of each metric.
 */
public interface MetricObservationReader {

    /**
     * Returns the OpenSearch data type that this reader queries (e.g. "authentication").
     * The value is passed to {@code MsspIndexResolver.resolveIndexPattern(dataType)}
     * to obtain the target index pattern.
     *
     * @param metricName the metric being observed
     * @return the data type string for index resolution
     */
    String dataTypeFor(String metricName);

    /**
     * Reads daily metric observations for the given members within a date range.
     *
     * <p>Used by {@code HaUebaBaselineService.computeBaselines} to aggregate
     * observations over the 30-day computation window.
     *
     * @param metricName the metric to observe
     * @param memberUserIds user identifiers in the peer group
     * @param fromInclusive start of the observation window (inclusive)
     * @param toExclusive end of the observation window (exclusive)
     * @return stream of observed double values — one per member per day that has data
     */
    DoubleStream readDailyObservations(String metricName, java.util.List<String> memberUserIds,
                                       LocalDate fromInclusive, LocalDate toExclusive);

    /**
     * Reads the current-hour observation for a single user and metric.
     *
     * <p>Used by {@code HaUebaDeviationEngine.scoreUser} for z-score computation.
     *
     * @param userId the user to observe
     * @param metricName the metric to observe
     * @param runTs the scoring run timestamp (truncated to the hour)
     * @return the observed double value
     */
    double readCurrentValue(String userId, String metricName, java.time.Instant runTs);
}
