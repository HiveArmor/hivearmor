package com.hivearmor.repository.ueba;

/**
 * Projection DTO for the per-tier anomaly count query.
 *
 * <p>Used by {@code GET /api/ha-ueba/anomaly-counts} to return the count
 * of deviation rows falling into each scoring tier (10, 25, 50 points).
 */
public record AnomalyCountsDTO(int tier10, int tier25, int tier50) {
}
