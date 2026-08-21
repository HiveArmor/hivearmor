package com.hivearmor.service.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Transport object returned by {@code POST /api/ha-admin/settings/ai/test}.
 *
 * <p>On success: {@code {"ok":true,"latencyMs":N}}<br>
 * On failure: {@code {"ok":false,"latencyMs":N,"error":"sanitized message"}}
 *
 * <p>The {@code error} field is omitted from JSON serialization when {@code null}
 * (i.e. on a successful probe) to keep the success response clean (Req 2.5).
 * The {@code latencyMs} field is always present, even on failure — it captures the
 * elapsed wall-clock time up to the point the exception was thrown (Req 2.5, 2.6).
 *
 * <p><strong>Secret hygiene:</strong> the {@code error} field must never contain the
 * persisted {@code apiKey} value. Callers (i.e. {@code HaLlmService.probe()}) are
 * responsible for sanitizing the exception message before constructing this DTO
 * (Req 2.6, 3.5).
 *
 * @param ok        {@code true} when the LLM endpoint responded with HTTP < 400
 * @param latencyMs round-trip latency in milliseconds; 0 when a connection error
 *                  occurs before a response could be received
 * @param error     sanitized error description; {@code null} on success
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LlmProbeResultDTO(boolean ok, long latencyMs, String error) {

    /**
     * Convenience factory for a successful probe result.
     *
     * @param latencyMs measured round-trip latency
     * @return a DTO with {@code ok=true} and no error message
     */
    public static LlmProbeResultDTO success(long latencyMs) {
        return new LlmProbeResultDTO(true, latencyMs, null);
    }

    /**
     * Convenience factory for a failed probe result.
     *
     * @param latencyMs elapsed time before failure (may be 0 for immediate errors)
     * @param error     sanitized error message; must not contain the raw {@code apiKey}
     * @return a DTO with {@code ok=false} and the supplied error
     */
    public static LlmProbeResultDTO failure(long latencyMs, String error) {
        return new LlmProbeResultDTO(false, latencyMs, error);
    }
}
