package com.hivearmor.service.dto;

/**
 * DTO returned by POST /api/ha-admin/scim/token.
 *
 * <p>Carries the plaintext SCIM bearer token that is generated and returned to the
 * administrator exactly once at generation time. After this response is delivered the
 * plaintext token is irrecoverable — only its bcrypt hash is persisted.
 *
 * <p><strong>Security constraint:</strong> this value MUST NEVER appear in any log
 * statement, {@code console.log}, or secondary API response. Callers must treat the
 * field value as a secret from the moment it is received.
 */
public class ScimTokenGenerateResponseDTO {

    private String token;

    // -------------------------------------------------------------------------
    // Getters and setters — explicit, no Lombok
    // -------------------------------------------------------------------------

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }
}
