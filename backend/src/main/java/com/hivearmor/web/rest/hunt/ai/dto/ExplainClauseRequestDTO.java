package com.hivearmor.web.rest.hunt.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/ha-hunts/ai/explain.
 * {@code clause} is the KQL/DSL fragment to gloss; {@code language} defaults to "kql".
 */
public record ExplainClauseRequestDTO(
    @NotBlank @Size(max = 2000) String clause,
    String language
) {
    public String languageOrDefault() {
        return (language == null || language.isBlank()) ? "kql" : language;
    }
}
