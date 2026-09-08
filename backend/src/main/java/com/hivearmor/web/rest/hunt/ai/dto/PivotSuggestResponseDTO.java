package com.hivearmor.web.rest.hunt.ai.dto;

import java.util.List;

/**
 * Response for {@code POST /api/ha-hunts/ai/pivot-suggest} (P3 PR 3).
 *
 * <p>Always HTTP 200. {@code state}:
 * <ul>
 *   <li>{@code ready} — a validated candidate pivot ({@code rowField}/{@code colField}/{@code valueFn}/
 *       {@code distinctField}) the analyst can apply and edit. Any field the model proposed that is not
 *       schema-eligible was dropped (never applied broken); {@code warnings} says what was dropped.</li>
 *   <li>{@code unavailable} — no AI provider configured / provider failed. The UI shows its
 *       "requires an AI provider" card. Never a fabricated definition, never a 5xx.</li>
 * </ul>
 * The proposed definition is a suggestion only — the deterministic engine still validates + runs it.
 */
public record PivotSuggestResponseDTO(
    String state,               // "ready" | "unavailable"
    String rowField,
    String colField,
    String valueFn,             // "count" | "distinct"
    String distinctField,       // null unless valueFn == distinct
    String explanation,         // one-line plain rationale from the model (or null)
    List<String> warnings,      // dropped-field notes (fields the model named that aren't eligible)
    AiProvenance provenance     // provider / generatedAt / agentVersion / caveat (null when unavailable)
) {
    public record AiProvenance(String provider, String generatedAt, String agentVersion, String caveat) {}

    public static PivotSuggestResponseDTO unavailable() {
        return new PivotSuggestResponseDTO("unavailable", null, null, null, null, null, List.of(), null);
    }

    public static PivotSuggestResponseDTO ready(String rowField, String colField, String valueFn,
                                                String distinctField, String explanation,
                                                List<String> warnings, AiProvenance provenance) {
        return new PivotSuggestResponseDTO("ready", rowField, colField, valueFn, distinctField,
            explanation, warnings, provenance);
    }
}
