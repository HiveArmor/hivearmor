package com.hivearmor.service.dto.admin;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * DTO for the Email/SMTP settings tab.
 *
 * <p>The {@code password} field contains the SMTP password.  On responses from
 * {@code GET /api/ha-admin/settings} the value is always {@code "***"} (Req 3.3).
 * On incoming {@code PUT /api/ha-admin/settings/email} requests the field is
 * only persisted if the caller submits a value other than {@code "***"} — the
 * preservation logic mirrors the {@code apiKeyTouched} mechanism used by the AI tab.
 *
 * <p>Use {@link #masked()} to build a response-safe copy of this DTO before returning
 * it to callers.
 */
public class SystemSettingsEmailDTO {

    private String host;

    @Min(1)
    @Max(65535)
    private int port;
    private String username;

    /**
     * SMTP password.
     *
     * <ul>
     *   <li>On GET: always {@code "***"} (masked)</li>
     *   <li>On PUT: if the value equals {@code "***"} the persisted password is
     *       preserved unchanged; otherwise the supplied value replaces it.</li>
     * </ul>
     */
    private String password;

    /** Sender address shown in the {@code From:} header. */
    @Email
    private String from;

    /** Whether to upgrade the connection via STARTTLS (port 587 convention). */
    private boolean useTls;

    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------

    /**
     * Returns a copy of this DTO with the {@code password} field replaced by
     * {@code "***"} so that the value is safe to serialize and return to callers
     * (Req 3.3).
     */
    public SystemSettingsEmailDTO masked() {
        SystemSettingsEmailDTO copy = new SystemSettingsEmailDTO();
        copy.host     = this.host;
        copy.port     = this.port;
        copy.username = this.username;
        copy.password = "***";
        copy.from     = this.from;
        copy.useTls   = this.useTls;
        return copy;
    }

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public int getPort() {
        return port;
    }

    public void setPort(int port) {
        this.port = port;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }

    public boolean isUseTls() {
        return useTls;
    }

    public void setUseTls(boolean useTls) {
        this.useTls = useTls;
    }
}
