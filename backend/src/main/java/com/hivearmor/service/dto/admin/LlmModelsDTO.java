package com.hivearmor.service.dto.admin;

import com.hivearmor.service.llm.OllamaModel;

import java.util.List;

/**
 * Response DTO for {@code GET /api/ha-admin/llm/models}.
 *
 * <p>Wraps the list of models available on the active Ollama instance together with
 * the provider name so the frontend knows which provider supplied the list.
 *
 * <p>This endpoint is only reachable when the active provider is {@code "ollama"};
 * calling it with any other active provider returns HTTP 400.
 *
 * @param provider the stable provider identifier — always {@code "ollama"} for this
 *                 endpoint
 * @param models   ordered list of models returned by {@code GET /api/tags} on the
 *                 configured Ollama instance; never {@code null}, may be empty when
 *                 no models have been pulled yet
 *
 * <p>Requirements: 5.1, 6.1
 */
public record LlmModelsDTO(
        String           provider,
        List<OllamaModel> models
) {}
