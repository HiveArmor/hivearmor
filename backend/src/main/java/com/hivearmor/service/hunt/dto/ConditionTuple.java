package com.hivearmor.service.hunt.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * A single field/operator/value condition used in suppression and exception previews.
 *
 * <p>Represents one clause of a proposed suppression or exception rule, e.g.
 * {@code category is "Credential Access"} or {@code source.ip starts_with "10.0."}.
 *
 * <p>Sprint 37 — ALT-021 (Requirement 2).
 */
@Schema(description = "A single field/operator/value condition clause for suppression or exception rules")
public record ConditionTuple(
    @Schema(description = "Field path to match against (dot-notation for nested fields)", example = "source.ip", requiredMode = Schema.RequiredMode.REQUIRED)
    String field,

    @Schema(description = "Comparison operator: is, is_not, contains, starts_with, ends_with, gte, lte, in", example = "starts_with", requiredMode = Schema.RequiredMode.REQUIRED)
    String operator,

    @Schema(description = "Value to compare against", example = "10.0.", requiredMode = Schema.RequiredMode.REQUIRED)
    String value
) {}
