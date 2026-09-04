package com.hivearmor.web.rest.hunt.ai.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * Request body for POST /api/ha-hunts/ai/verdict (frozen contract {@code HuntVerdictRequest}).
 * The completed {@code searchId} is analyzed; {@code clusterId}/{@code eventIds} optionally
 * narrow the analysis to one auto-surfaced cluster or an explicit selection.
 */
public record VerdictRequestDTO(
    @NotBlank String searchId,
    String clusterId,
    List<String> eventIds
) {}
