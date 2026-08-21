package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

/**
 * Response DTO for the suppression preview impact analysis.
 *
 * <p>Returned by {@code POST /api/ha-alerts/{alertId}/suppression-preview}. Contains
 * a read-only projection of what would happen if the proposed suppression condition
 * were applied: how many historical alerts match, the estimated volume reduction,
 * affected tenants and data sources, false-negative risk prompts, and governance metadata.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.1).
 */
@Schema(description = "Read-only suppression impact analysis projecting volume reduction, affected scope, and risk assessment")
public record SuppressionPreviewResponse(
    @Schema(description = "The proposed suppression condition tuples being evaluated", requiredMode = Schema.RequiredMode.REQUIRED)
    List<ConditionTuple> proposedCondition,

    @Schema(description = "Number of historical alerts that would have been suppressed", example = "234")
    long matchingHistoricalAlerts,

    @Schema(description = "Projected alert volume reduction as a percentage (0.0–100.0)", example = "15.7")
    double projectedVolumeReduction,

    @Schema(description = "List of tenant names affected by this suppression in MSSP deployments")
    List<String> affectedTenants,

    @Schema(description = "List of data source types that contribute matching alerts", example = "[\"windows-security\", \"firewall\"]")
    List<String> affectedDataSources,

    @Schema(description = "Risk prompts warning about potential false negatives if this suppression is applied")
    List<String> falseNegativeRiskPrompts,

    @Schema(description = "Whether this suppression exceeds safety thresholds and requires elevated approval", example = "true")
    boolean highImpactWarning,

    @Schema(description = "Proposed expiry duration for the suppression rule", example = "30d")
    String expiry,

    @Schema(description = "Owner responsible for this suppression rule", example = "analyst1")
    String owner,

    @Schema(description = "Approval policy that applies: 'auto', 'peer-review', or 'manager-approval'", example = "peer-review")
    String approvalPolicy,

    @Schema(description = "Instructions for rolling back this suppression if false negatives are detected")
    String rollbackInstructions
) {}
