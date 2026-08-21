package com.hivearmor.service.dto.admin.api_key;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Request body for {@code POST /api/ha-admin/api-keys}.
 *
 * <p>Carries the administrator-supplied metadata for a new API key. The plaintext
 * token is generated server-side and is never accepted from the caller.
 *
 * <p>Requirements: 5.1, 6.1, 6.2
 */
public class HaApiKeyCreateDTO {

    /**
     * Human-readable label for the API key. Required; max 128 characters.
     */
    @NotBlank
    @Size(max = 128)
    private String name;

    /**
     * Ordered list of scope strings to assign to this key. Each entry must be
     * a valid {@link com.hivearmor.domain.enumeration.HaApiKeyScope} name.
     * Requirement 6.1 restricts the allowed values to the fixed scope set.
     */
    @NotNull
    private List<String> scopes;

    /**
     * Optional expiry timestamp. When {@code null} the key never expires passively
     * (it can still be revoked). When set, the key transitions to {@code expired}
     * status after this instant.
     */
    private Instant expiresAt;

    // -------------------------------------------------------------------------
    // Accessors
    // -------------------------------------------------------------------------

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public List<String> getScopes() {
        return scopes;
    }

    public void setScopes(List<String> scopes) {
        this.scopes = scopes;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }
}
