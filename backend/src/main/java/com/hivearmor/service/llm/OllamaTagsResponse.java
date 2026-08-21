package com.hivearmor.service.llm;

import java.util.List;

/**
 * Internal DTO that maps the JSON payload returned by the Ollama
 * {@code GET /api/tags} endpoint.
 *
 * <p>Ollama returns a JSON object with a single {@code "models"} array, e.g.:
 * <pre>{@code
 * {
 *   "models": [
 *     { "name": "llama3.2:3b", "size": "...", "digest": "sha256:...", "modified_at": "..." },
 *     ...
 *   ]
 * }
 * }</pre>
 *
 * <p>This record is used exclusively inside {@link OllamaLlmProvider#listModels()} and
 * is not part of the public API surface.
 *
 * @param models the list of models available on the Ollama server; never {@code null}
 *               (Jackson deserializes an absent array as {@code null} — callers should
 *               guard accordingly)
 *
 * <p>Requirements: 3.2
 */
public record OllamaTagsResponse(List<OllamaModel> models) {}
