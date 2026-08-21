package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * A single severity lane in the severity board.
 *
 * <p>Each lane groups alerts by severity level and provides aggregate
 * counters plus a bounded list of top-risk alert previews.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.3).
 */
@Schema(description = "A severity lane grouping alerts by severity level with aggregate counters and top-risk previews")
public record SeverityLane(
    @Schema(description = "Severity level for this lane", example = "critical", requiredMode = Schema.RequiredMode.REQUIRED)
    String severity,

    @Schema(description = "Total number of alerts in this severity lane", example = "42")
    long count,

    @Schema(description = "Number of active (unresolved) alerts in this lane", example = "28")
    long activeCount,

    @Schema(description = "Number of alerts approaching or breaching SLA in this lane", example = "5")
    long slaPressure,

    @Schema(description = "Number of unassigned alerts in this lane", example = "12")
    long unassigned,

    @Schema(description = "Bounded list of top-risk alert previews for this lane (max determined by laneLimit)")
    List<AlertPreview> alerts
) {}
