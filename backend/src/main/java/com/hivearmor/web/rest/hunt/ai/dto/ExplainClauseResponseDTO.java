package com.hivearmor.web.rest.hunt.ai.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response for POST /api/ha-hunts/ai/explain.
 *
 * <p>Matches the frozen frontend contract {@code HuntClauseExplanation}
 * (.plan/HUNT-AI-CONTRACT-v1.md §6): {@code schemaVersion, state, clause, explanation, provenance}.
 * The endpoint NEVER returns 5xx — when the LLM is unconfigured it returns HTTP 200 with
 * {@code state = "unavailable"} and an empty explanation, mirroring the NL-to-DSL contract.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExplainClauseResponseDTO(
    String schemaVersion,
    String state,
    String clause,
    String explanation,
    AiProvenanceDTO provenance
) {
    public static ExplainClauseResponseDTO ready(String clause, String explanation, AiProvenanceDTO provenance) {
        return new ExplainClauseResponseDTO("1", "ready", clause, explanation, provenance);
    }

    /** LLM not configured / provider down — honest 200, no fabricated explanation. */
    public static ExplainClauseResponseDTO unavailable(String clause) {
        return new ExplainClauseResponseDTO("1", "unavailable", clause, null, null);
    }

    /**
     * AI provenance block (frozen contract {@code AiProvenance}): marks the response as
     * model-derived and carries the verify-before-acting caveat.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AiProvenanceDTO(String model, String generatedAt, String agentVersion, String caveat) {}
}
