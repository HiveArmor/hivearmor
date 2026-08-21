package com.hivearmor.service.llm;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Represents a single model entry returned by the Ollama {@code GET /api/tags} endpoint.
 *
 * <p>This DTO is used by {@link OllamaLlmProvider#listModels()} and is also exposed
 * through the admin REST layer ({@code GET /api/ha-admin/llm/models}).
 *
 * <p>Jackson deserializes the {@code modified_at} field from the ISO-8601 timestamp
 * string that Ollama returns, relying on the {@code jackson-datatype-jsr310} module
 * registered in the application context.
 *
 * @param name       the model identifier, e.g. {@code llama3.2:3b}
 * @param size       the model size in bytes, returned by Ollama as a numeric string
 * @param digest     the model content-addressable digest, e.g. {@code sha256:...}
 * @param modifiedAt the UTC timestamp at which this model was last modified
 *
 * <p>Requirements: 3.2, 5.1
 */
public record OllamaModel(
        String name,

        @JsonProperty("size")
        String size,

        String digest,

        @JsonProperty("modified_at")
        Instant modifiedAt
) {}
