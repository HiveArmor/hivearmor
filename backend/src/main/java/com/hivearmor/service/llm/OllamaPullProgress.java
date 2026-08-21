package com.hivearmor.service.llm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Represents a single progress record emitted by the Ollama {@code POST /api/pull}
 * NDJSON stream.
 *
 * <p>Ollama streams a series of JSON objects while downloading a model layer.
 * Each object may carry a {@code status} string (e.g. {@code "pulling manifest"},
 * {@code "downloading"}, {@code "verifying sha256 digest"}, {@code "success"}),
 * optional {@code total} and {@code completed} byte counts for download progress,
 * and the layer {@code digest} when applicable.
 *
 * <p>Unknown fields are ignored so that this record stays forward-compatible with
 * future Ollama API additions.
 *
 * <p>Used by:
 * <ul>
 *   <li>{@link OllamaLlmProvider#pullModel(String)} — maps each NDJSON line to
 *       this record via Jackson</li>
 *   <li>{@code HaLlmAdminResource.pull} (task 6.1) — wraps each record in an SSE
 *       frame for the admin REST layer</li>
 * </ul>
 *
 * <p>Requirements: 3.3, 7.2
 *
 * @param status    human-readable status string from Ollama (e.g. {@code "downloading"});
 *                  may be {@code null} for intermediate frames
 * @param total     total bytes to download for the current layer; {@code null} when not
 *                  yet known or not applicable
 * @param completed bytes downloaded so far for the current layer; {@code null} when not
 *                  yet applicable
 * @param digest    layer digest identifier (e.g. {@code "sha256:abc..."}); {@code null}
 *                  for non-layer frames such as the final {@code "success"} frame
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record OllamaPullProgress(
        String status,
        Long   total,
        Long   completed,
        String digest
) {}
