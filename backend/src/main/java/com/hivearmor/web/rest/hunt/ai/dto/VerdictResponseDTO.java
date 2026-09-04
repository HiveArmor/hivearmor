package com.hivearmor.web.rest.hunt.ai.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.hivearmor.web.rest.hunt.ai.dto.ExplainClauseResponseDTO.AiProvenanceDTO;

/**
 * Response for POST /api/ha-hunts/ai/verdict — the AI verdict over a completed hunt's result set.
 *
 * <p>Matches the frozen frontend contract {@code HuntVerdictResponse} (.plan/HUNT-AI-CONTRACT-v1.md §3).
 * When {@code state != "ready"} the analytical fields may be null — the UI renders the honest state
 * (unavailable / insufficient_data) rather than a fabricated verdict. {@code confidence} is 0..1 and
 * is ALWAYS accompanied by {@code calibration} (contract §2/§6 — a naked confidence is non-compliant).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record VerdictResponseDTO(
    String schemaVersion,
    String state,
    String verdictId,
    String verdict,
    Double confidence,
    AiCalibrationDTO calibration,
    String title,
    String summary,
    String conclusion,
    Integer clusterSize,
    Integer totalConsidered,
    List<MitreRefDTO> mitre,
    List<ReasoningStepDTO> reasoning,
    List<EvidenceItemDTO> evidence,
    AiProvenanceDTO provenance
) {
    /** MITRE ATT&CK mapping fragment. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MitreRefDTO(String tactic, String technique, String subtechnique) {}

    /** Reasoning step with row citations (move 3): rowRefs are HuntEvent ids the UI flashes. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReasoningStepDTO(String id, String label, String detail, String state, List<String> rowRefs) {}

    /** Evidence Locker item; {@code provenanceLensed} marks a model-derived value (move 2). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record EvidenceItemDTO(String id, String label, String value, String rowRef, String kind, boolean provenanceLensed) {}

    /** state != ready: the honest non-verdict (unavailable | insufficient_data). */
    public static VerdictResponseDTO nonReady(String state) {
        return new VerdictResponseDTO("1", state, null, null, null, null, null, null, null,
            null, null, null, null, null, null);
    }
}
