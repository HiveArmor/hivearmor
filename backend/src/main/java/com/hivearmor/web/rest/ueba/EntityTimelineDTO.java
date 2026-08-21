package com.hivearmor.web.rest.ueba;

import com.hivearmor.domain.ueba.HaUebaBaseline;
import com.hivearmor.domain.ueba.HaUebaDeviation;

import java.time.Instant;
import java.util.List;

/**
 * REST response DTO for the entity timeline endpoint.
 *
 * <p>Aggregates deviation data points and baseline bands for a single user,
 * consumed by the frontend scatter chart ({@code EntityTimelinePage}).
 *
 * <p>Used by {@code GET /api/ha-ueba/entity-timeline?userId=...}.
 */
public record EntityTimelineDTO(
    List<TimelinePoint> points,
    List<BaselineBand> baselines
) {

    /**
     * A single deviation data point rendered as a scatter dot on the timeline.
     */
    public record TimelinePoint(
        String metricName,
        Instant runTs,
        double zScore,
        int points,
        double observed
    ) {}

    /**
     * Baseline band for one metric — rendered as a markArea band on the chart
     * centered on the mean and extending ±1 standard deviation.
     */
    public record BaselineBand(
        String metricName,
        double mean,
        double stddev
    ) {}

    /**
     * Builds the timeline DTO from deviation rows and the user's latest baselines.
     *
     * @param deviations deviation rows for the user, ordered by runTs
     * @param baselines  latest baseline rows for the user's peer group
     * @return assembled timeline DTO
     */
    public static EntityTimelineDTO of(List<HaUebaDeviation> deviations, List<HaUebaBaseline> baselines) {
        List<TimelinePoint> timelinePoints = deviations.stream()
            .map(d -> new TimelinePoint(
                d.getMetricName(),
                d.getRunTs(),
                d.getZScore(),
                d.getPoints(),
                d.getObservedValue() != null ? d.getObservedValue() : 0.0
            ))
            .toList();

        List<BaselineBand> baselineBands = baselines.stream()
            .map(b -> new BaselineBand(
                b.getMetricName(),
                b.getBaselineMean(),
                b.getBaselineStddev()
            ))
            .toList();

        return new EntityTimelineDTO(timelinePoints, baselineBands);
    }
}
