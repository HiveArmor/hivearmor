package com.hivearmor.web.rest.hunt.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request for {@code POST /api/ha-hunts/ai/pivot-detection-draft} (P5 step 5b — AI-assisted drafting).
 *
 * <p>The reproduction context of a selected pivot combination. The service asks the LLM to draft a CEL
 * detection expression for it; the result is persisted only as a {@code status=draft} rule the analyst edits
 * and a SOC manager must approve. No field here can cause a deploy — this is draft-only input.
 */
public record PivotDetectionDraftRequestDTO(
    @NotBlank @Size(max = 100) String rowField,
    @NotBlank @Size(max = 100) String colField,
    @NotBlank @Size(max = 300) String rowValue,
    @NotBlank @Size(max = 300) String colValue,
    long value,
    @Size(max = 2000) String query,
    @Size(max = 200) String searchId,
    @Size(max = 200) String significance   // e.g. "over-represented ~5x expected 8"; optional context
) {}
