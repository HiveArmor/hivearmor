package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Overview counters for the severity board.
 *
 * <p>Summarizes the total alert landscape across all severity lanes,
 * providing quick-glance operational metrics for SOC managers.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.2).
 */
@Schema(description = "Aggregate overview counters summarizing the alert landscape across all severity lanes")
public record SeverityBoardOverview(
    @Schema(description = "Total number of alerts in the queried time range", example = "1542")
    long total,

    @Schema(description = "Number of alerts in an active (unresolved) state", example = "312")
    long active,

    @Schema(description = "Number of open critical-severity alerts", example = "18")
    long criticalOpen,

    @Schema(description = "Number of alerts awaiting initial analyst triage", example = "47")
    long needsTriage,

    @Schema(description = "Number of alerts approaching or breaching SLA deadlines", example = "12")
    long slaPressure,

    @Schema(description = "Number of alerts not yet assigned to an analyst", example = "85")
    long unassigned,

    @Schema(description = "Number of alerts enriched with matching threat intelligence indicators", example = "6")
    long threatIntelMatched,

    @Schema(description = "Highest computed risk score across all alerts in scope (0.0–100.0)", example = "94.5")
    double highestRisk
) {}
