package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Describes an overlap between a proposed exception condition and an existing exception.
 *
 * <p>When an analyst proposes a new detection exception, the system checks for partial
 * overlap with already-configured exceptions. This record captures each overlap found.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.2).
 */
@Schema(description = "Overlap between a proposed exception condition and an already-configured exception")
public record ExceptionOverlap(
    @Schema(description = "Unique identifier of the existing exception that overlaps", example = "exc-rule100-001", requiredMode = Schema.RequiredMode.REQUIRED)
    String exceptionId,

    @Schema(description = "Human-readable description of the overlapping condition", example = "user.name is svc_account")
    String condition,

    @Schema(description = "Percentage of alert matches shared between proposed and existing exception (0.0–100.0)", example = "45.2")
    double overlapPercentage
) {}
