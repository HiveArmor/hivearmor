package com.hivearmor.web.rest.hunt.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request for {@code POST /api/ha-hunts/ai/pivot-suggest} (P3 PR 3, Ask Hive Intelligence).
 *
 * <p>A natural-language question the analyst wants answered as a pivot. The service turns it into a
 * candidate {@code CrosstabDefinition} the analyst can inspect and edit — never auto-run.
 */
public record PivotSuggestRequestDTO(
    @NotBlank @Size(max = 500) String question
) {}
