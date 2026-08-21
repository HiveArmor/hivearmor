package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * Response DTO for the detection exception preview impact analysis.
 *
 * <p>Returned by {@code POST /api/ha-detection-rules/{ruleId}/exceptions/preview}.
 * Contains a read-only projection of what would happen if the proposed exception
 * condition were applied to a specific detection rule: matching historical alerts,
 * volume reduction, affected MITRE techniques, overlap with existing exceptions,
 * and risk assessment.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.2).
 */
@Schema(description = "Read-only detection exception impact analysis projecting coverage reduction, technique exposure, and overlap with existing exceptions")
public record ExceptionPreviewResponse(
    @Schema(description = "The proposed exception condition tuples being evaluated", requiredMode = Schema.RequiredMode.REQUIRED)
    List<ConditionTuple> proposedCondition,

    @Schema(description = "Detection rule ID this exception would apply to", example = "rule-sigma-t1110", requiredMode = Schema.RequiredMode.REQUIRED)
    String ruleId,

    @Schema(description = "Detection rule display name", example = "Brute Force - Multiple Failed Logins")
    String ruleName,

    @Schema(description = "Number of historical alerts that would have been excepted by this condition", example = "128")
    long matchingHistoricalAlerts,

    @Schema(description = "Projected alert volume reduction as a percentage (0.0–100.0)", example = "8.3")
    double projectedVolumeReduction,

    @Schema(description = "MITRE ATT&CK techniques whose detection coverage would be reduced")
    List<AffectedTechnique> affectedTechniques,

    @Schema(description = "Existing exceptions that partially overlap with this proposed condition")
    List<ExceptionOverlap> exceptionOverlapWithExisting,

    @Schema(description = "Risk prompts warning about potential blind spots if this exception is applied")
    List<String> falseNegativeRiskPrompts,

    @Schema(description = "Whether this exception exceeds safety thresholds and requires elevated approval", example = "false")
    boolean highImpactWarning,

    @Schema(description = "Whether this exception requires formal approval workflow before activation", example = "true")
    boolean approvalRequired
) {}
