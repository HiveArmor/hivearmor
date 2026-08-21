package com.hivearmor.service.dto;

/**
 * DTO returned by GET /api/ha-admin/scim/token/status.
 *
 * <p>{@code configured} is {@code true} if and only if a non-blank SCIM bearer-token
 * hash is currently stored in {@code ha_configuration_parameter}.
 *
 * <p>{@code lastUsed} holds the ISO-8601 timestamp of the most recent successful SCIM
 * token validation, or {@code null} when the token has never been used.
 *
 * <p>This DTO intentionally does NOT carry the plaintext token or its hash — those
 * values must never appear in any response body.
 */
public class ScimTokenStatusDTO {

    private boolean configured;

    /** ISO-8601 timestamp of the last successful SCIM authentication, or {@code null}. */
    private String lastUsed;

    // -------------------------------------------------------------------------
    // Getters and setters — explicit, no Lombok
    // -------------------------------------------------------------------------

    public boolean isConfigured() {
        return configured;
    }

    public void setConfigured(boolean configured) {
        this.configured = configured;
    }

    public String getLastUsed() {
        return lastUsed;
    }

    public void setLastUsed(String lastUsed) {
        this.lastUsed = lastUsed;
    }
}
