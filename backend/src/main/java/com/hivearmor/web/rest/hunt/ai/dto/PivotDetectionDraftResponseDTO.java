package com.hivearmor.web.rest.hunt.ai.dto;

import java.util.List;

/**
 * Response for {@code POST /api/ha-hunts/ai/pivot-detection-draft} (P5 step 5b).
 *
 * <p>Always HTTP 200. {@code state}:
 * <ul>
 *   <li>{@code ready} — a DRAFT detection rule was created (status=draft) with the AI-drafted CEL. Carries
 *       {@code ruleId} so the FE can link into the existing Detection review UI. Nothing is deployed or
 *       activated; a SOC manager must approve it there.</li>
 *   <li>{@code unavailable} — no AI provider, provider failed, or the model produced invalid CEL after
 *       retries. Nothing is persisted. The FE keeps the manual 5a draft path. Never a 5xx, never a
 *       fabricated/auto-fixed rule.</li>
 * </ul>
 */
public record PivotDetectionDraftResponseDTO(
    String state,               // "ready" | "unavailable"
    String ruleId,              // the created DRAFT rule's id (null when unavailable)
    String expression,          // the AI-drafted CEL (for display; also stored on the draft)
    String explanation,         // one-line rationale (or null)
    List<String> warnings,      // dropped/corrected-field notes
    AiProvenance provenance     // provider / generatedAt / agentVersion / caveat (null when unavailable)
) {
    public record AiProvenance(String provider, String generatedAt, String agentVersion, String caveat) {}

    public static PivotDetectionDraftResponseDTO unavailable(List<String> warnings) {
        return new PivotDetectionDraftResponseDTO("unavailable", null, null, null,
            warnings == null ? List.of() : warnings, null);
    }

    public static PivotDetectionDraftResponseDTO ready(String ruleId, String expression, String explanation,
                                                       List<String> warnings, AiProvenance provenance) {
        return new PivotDetectionDraftResponseDTO("ready", ruleId, expression, explanation,
            warnings == null ? List.of() : warnings, provenance);
    }
}
