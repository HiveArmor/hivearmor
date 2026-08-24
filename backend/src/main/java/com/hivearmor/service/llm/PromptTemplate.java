package com.hivearmor.service.llm;

/**
 * Immutable prompt entry resolved from {@link PromptRegistry}.
 *
 * <p>Logs and telemetry MUST use {@link #id()} and {@link #sha256()} only —
 * never {@link #body()}.
 *
 * @param id     stable prompt identifier (e.g. {@code ha.ai.chat.base})
 * @param body   full prompt text
 * @param sha256 lowercase hex SHA-256 of {@code body} (UTF-8)
 */
public record PromptTemplate(String id, String body, String sha256) {

    public PromptTemplate {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("prompt id must be non-blank");
        }
        if (body == null) {
            throw new IllegalArgumentException("prompt body must not be null");
        }
        if (sha256 == null || sha256.isBlank()) {
            throw new IllegalArgumentException("prompt sha256 must be non-blank");
        }
    }
}
