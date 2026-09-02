package com.hivearmor.service.dto.admin;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code POST /api/ha-admin/settings/email/test}.
 *
 * <p>Carries the recipient address the test email is delivered to. The address is
 * validated by {@code @Valid} on the controller method: it must be present and a
 * syntactically valid email address (B0-2 §4, §5).
 *
 * <p>No SMTP credentials travel in this body — the test-send uses the SMTP settings
 * already persisted (and encrypted) in the configuration store, mirroring how the AI
 * probe reuses the persisted LLM configuration.
 */
public class SmtpTestRequestDTO {

    /** Recipient address for the test email. Required and format-checked. */
    @NotBlank
    @Email
    private String recipient;

    public SmtpTestRequestDTO() {
        // Jackson
    }

    public SmtpTestRequestDTO(String recipient) {
        this.recipient = recipient;
    }

    public String getRecipient() {
        return recipient;
    }

    public void setRecipient(String recipient) {
        this.recipient = recipient;
    }
}
