package com.hivearmor.web.rest.ueba;

import com.hivearmor.domain.ueba.HaUebaDeviation;

import java.time.Instant;

/**
 * REST response DTO for a single deviation row.
 *
 * <p>Used by {@code GET /api/ha-ueba/deviations} to expose tenant-scoped deviations.
 */
public record DeviationDTO(
    String userId,
    String metricName,
    Instant runTs,
    double zScore,
    int points
) {

    /**
     * Maps a JPA entity to its REST representation.
     */
    public static DeviationDTO from(HaUebaDeviation d) {
        return new DeviationDTO(
            d.getUserId(),
            d.getMetricName(),
            d.getRunTs(),
            d.getZScore(),
            d.getPoints()
        );
    }
}
