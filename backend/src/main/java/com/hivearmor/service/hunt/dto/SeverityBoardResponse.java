package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

/**
 * Response DTO for the severity board workload projection.
 *
 * <p>Returned by {@code GET /api/ha-alerts/severity-board}. Contains an overview
 * of alert metrics, severity-grouped lanes with bounded alert previews, a 12-bucket
 * trend histogram, and metadata about the snapshot.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1).
 */
@Schema(description = "Severity board workload projection containing alert overview metrics, severity lanes, and trend histogram")
public record SeverityBoardResponse(
    @Schema(description = "Aggregate alert counters across all severity lanes", requiredMode = Schema.RequiredMode.REQUIRED)
    SeverityBoardOverview overview,

    @Schema(description = "Severity-grouped lanes with alert counts and bounded alert previews", requiredMode = Schema.RequiredMode.REQUIRED)
    List<SeverityLane> lanes,

    @Schema(description = "12-bucket trend histogram covering the requested time range", requiredMode = Schema.RequiredMode.REQUIRED)
    List<TrendBucket> trend,

    @Schema(description = "Timestamp when this board snapshot was computed", example = "2026-08-20T14:30:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
    Instant snapshotAt,

    @Schema(description = "Approximate total number of alerts matching the query scope", example = "1542")
    long totalApproximate,

    @Schema(description = "Data completeness indicator: 'complete', 'partial', or 'unavailable'", example = "complete")
    String dataCompleteness
) {}
