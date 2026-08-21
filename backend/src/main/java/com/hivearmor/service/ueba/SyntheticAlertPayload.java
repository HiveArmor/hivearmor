package com.hivearmor.service.ueba;

import java.time.Instant;
import java.util.List;

/**
 * Payload describing a synthetic UEBA alert emitted when a user's summed
 * deviation score exceeds the {@code Total_Score_Threshold} (75).
 *
 * <p>Posted to the event-processor injection endpoint {@code POST /v1/inject}
 * with the shared {@code X-Internal-Key} header.
 */
public record SyntheticAlertPayload(
    String userId,
    Instant runTs,
    int totalScore,
    List<ContributingMetric> contributingMetrics,
    String tenantId
) {
    /**
     * Describes one metric's contribution to the overall deviation score.
     */
    public record ContributingMetric(String metricName, double zScore, int points) {}
}
