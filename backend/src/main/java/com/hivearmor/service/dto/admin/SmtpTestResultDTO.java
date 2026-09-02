package com.hivearmor.service.dto.admin;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Transport object returned by {@code POST /api/ha-admin/settings/email/test}.
 *
 * <p>On success: {@code {"ok":true}}<br>
 * On failure: {@code {"ok":false,"error":"sanitized message"}}
 *
 * <p>Mirrors the always-HTTP-200 success/error contract of
 * {@link LlmProbeResultDTO}: the endpoint never returns a non-200 status for a
 * send failure — the outcome is carried in {@code ok}. The {@code error} field is
 * omitted from JSON when {@code null} (i.e. on success).
 *
 * <p><strong>Secret hygiene:</strong> the {@code error} field must never contain the
 * persisted SMTP password or a full stack trace. The caller
 * ({@code HaSystemSettingsService.sendTestEmail(String)}) is responsible for
 * sanitizing the failure before constructing this DTO (B0-2 §4).
 *
 * @param ok    {@code true} when the test email was dispatched successfully
 * @param error sanitized error description; {@code null} on success
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SmtpTestResultDTO(boolean ok, String error) {

    /**
     * Convenience factory for a successful test-send result.
     *
     * @return a DTO with {@code ok=true} and no error message
     */
    public static SmtpTestResultDTO success() {
        return new SmtpTestResultDTO(true, null);
    }

    /**
     * Convenience factory for a failed test-send result.
     *
     * @param error sanitized error message; must not contain the SMTP password
     * @return a DTO with {@code ok=false} and the supplied error
     */
    public static SmtpTestResultDTO failure(String error) {
        return new SmtpTestResultDTO(false, error);
    }
}
