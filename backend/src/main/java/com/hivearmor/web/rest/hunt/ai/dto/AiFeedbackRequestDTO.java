package com.hivearmor.web.rest.hunt.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request body for POST /api/ha-hunts/ai/feedback (frozen contract {@code HuntAiFeedback}).
 * {@code correctedVerdict} is the optional analyst correction — the strongest calibration signal.
 * {@code verdictScope} buckets the feedback for calibration (e.g. "credential-access verdicts").
 */
public record AiFeedbackRequestDTO(
    @NotBlank @Pattern(regexp = "verdict|lead") String targetType,
    @NotBlank @Size(max = 128) String targetId,
    @NotBlank @Pattern(regexp = "up|down") String vote,
    @Size(max = 128) String verdictScope,
    @Pattern(regexp = "malicious|suspicious|benign|inconclusive") String correctedVerdict,
    @Size(max = 4000) String note
) {
    public String scopeOrDefault() {
        return (verdictScope == null || verdictScope.isBlank()) ? "unscoped" : verdictScope;
    }
}
