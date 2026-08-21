package com.hivearmor.web.rest.dto;

/**
 * DTO for a natural-language-to-DSL translation response.
 *
 * @param dsl         Compact JSON string representing the generated OpenSearch query
 *                    DSL object. Always syntactically valid; equals the safe
 *                    {@code {"query":{"match_all":{}}}} fallback when translation fails.
 * @param explanation Human-readable explanation of what the DSL does, sourced from the
 *                    LLM response. Empty string when the LLM did not supply one.
 * @param confidence  Model confidence in the generated DSL, in the closed interval
 *                    {@code [0.0, 1.0]}. Value is {@code 0.1} when the safe fallback
 *                    is returned, and {@code 0.75} when the LLM response was valid but
 *                    did not include a confidence score.
 */
public record NlToDslResponseDTO(
    String dsl,
    String explanation,
    double confidence
) {}
