package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;

/**
 * A single time bucket in the severity board trend histogram.
 *
 * <p>The trend array contains exactly 12 buckets covering the requested
 * time range, with per-severity alert counts in each bucket.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1.6).
 */
@Schema(description = "A single time bucket in the 12-bucket trend histogram with per-severity alert counts")
public record TrendBucket(
    @Schema(description = "Start timestamp of this bucket (inclusive)", example = "2026-08-20T12:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
    Instant start,

    @Schema(description = "End timestamp of this bucket (exclusive)", example = "2026-08-20T14:00:00Z", requiredMode = Schema.RequiredMode.REQUIRED)
    Instant end,

    @Schema(description = "Human-readable label for the bucket time range", example = "12:00–14:00")
    String label,

    @Schema(description = "Total alerts across all severities in this bucket", example = "87")
    long total,

    @Schema(description = "Critical-severity alerts in this bucket", example = "3")
    long critical,

    @Schema(description = "High-severity alerts in this bucket", example = "12")
    long high,

    @Schema(description = "Medium-severity alerts in this bucket", example = "28")
    long medium,

    @Schema(description = "Low-severity alerts in this bucket", example = "35")
    long low,

    @Schema(description = "Informational-severity alerts in this bucket", example = "9")
    long info
) {}
