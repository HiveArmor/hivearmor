package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A MITRE ATT&CK technique affected by a proposed detection exception.
 *
 * <p>Extracted from historical alerts that match the proposed exception condition,
 * indicating which detection coverage would be reduced.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2.2).
 */
@Schema(description = "A MITRE ATT&CK technique whose detection coverage would be reduced by a proposed exception")
public record AffectedTechnique(
    @Schema(description = "MITRE ATT&CK technique ID", example = "T1110.003", requiredMode = Schema.RequiredMode.REQUIRED)
    String id,

    @Schema(description = "Technique display name", example = "Password Spraying")
    String name,

    @Schema(description = "Parent MITRE ATT&CK tactic", example = "Credential Access")
    String tactic
) {}
