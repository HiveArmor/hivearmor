package com.hivearmor.repository.ueba;

import java.time.LocalDate;

/**
 * Projection DTO for the 30-day daily risk trend query.
 *
 * <p>Used by {@code GET /api/ha-ueba/risk-trend} to return one data point
 * per day with the aggregate risk score for that day.
 */
public record RiskTrendPointDTO(LocalDate day, int totalScore) {
}
