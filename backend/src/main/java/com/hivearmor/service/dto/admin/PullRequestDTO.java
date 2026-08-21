package com.hivearmor.service.dto.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for {@code POST /api/ha-admin/llm/models/pull}.
 *
 * <p>Carries the name of the Ollama model to pull. The name is forwarded verbatim to
 * {@code POST /api/pull} on the configured Ollama instance. Pull progress is streamed
 * back to the caller as a Server-Sent Events ({@code text/event-stream}) response,
 * with each frame carrying an
 * {@link com.hivearmor.service.llm.OllamaPullProgress} payload.
 *
 * <p>This endpoint is only reachable when the active provider is {@code "ollama"};
 * any other active provider causes an immediate HTTP 400.
 *
 * @param model Ollama model identifier to pull, e.g. {@code "llama3.2:3b"};
 *              must not be blank and must not exceed 128 characters
 *
 * <p>Requirements: 5.1, 6.2
 */
public record PullRequestDTO(

        @NotBlank
        @Size(max = 128)
        String model

) {}
