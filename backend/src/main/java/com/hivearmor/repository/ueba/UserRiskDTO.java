package com.hivearmor.repository.ueba;

/**
 * Projection DTO for the per-user aggregate risk score query.
 *
 * <p>Used by {@code GET /api/ha-ueba/risk-scores} to return each user's
 * total deviation score and anomaly count.
 */
public record UserRiskDTO(String userId, int totalScore, int anomalyCount) {
}
