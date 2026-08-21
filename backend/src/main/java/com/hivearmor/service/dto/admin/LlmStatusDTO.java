package com.hivearmor.service.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response DTO for {@code GET /api/ha-admin/llm/status}.
 *
 * <p>Carries the current LLM provider configuration state and an optional
 * round-trip latency value from the most recent health probe.
 *
 * <p>{@code latencyMs} is omitted from JSON when {@code null} (provider not reachable
 * or not yet probed) to avoid surfacing misleading zeros.
 *
 * @param configured {@code true} when the active provider has a valid base URL /
 *                   credentials and responded to the health probe
 * @param provider   stable provider identifier: {@code "disabled"}, {@code "openai"},
 *                   {@code "azure"}, or {@code "ollama"}
 * @param latencyMs  round-trip latency in milliseconds from the most recent health probe;
 *                   {@code null} when no successful probe has been performed
 *
 * <p>Requirements: 5.1, 6.1
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LlmStatusDTO(
        boolean configured,
        String  provider,
        Long    latencyMs
) {}
