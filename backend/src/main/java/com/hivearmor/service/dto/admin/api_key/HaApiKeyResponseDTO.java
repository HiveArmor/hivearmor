package com.hivearmor.service.dto.admin.api_key;

import com.hivearmor.domain.enumeration.ApiKeyStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Response body for {@code GET /api/ha-admin/api-keys} and
 * {@code GET /api/ha-admin/api-keys/{id}}.
 *
 * <p><strong>Security invariant (Requirements 5.5, 5.6):</strong> this DTO
 * intentionally omits both the plaintext {@code token} and the bcrypt
 * {@code keyHash} fields. Only safe, non-secret fields are serialized.
 *
 * <p>The {@code status} field is computed at read-time by
 * {@link com.hivearmor.service.admin.api_key.HaApiKeyService#computeStatus}.
 */
public class HaApiKeyResponseDTO {

    private final UUID id;
    private final String name;
    private final String keyPrefix;
    private final List<String> scopes;
    private final ApiKeyStatus status;
    private final Instant createdAt;
    private final Instant expiresAt;
    private final Instant revokedAt;
    private final Instant lastUsedAt;

    /**
     * Constructs a response DTO from fully-resolved field values.
     *
     * @param id          primary key of the API key record
     * @param name        human-readable label
     * @param keyPrefix   first 8 characters of the plaintext token (safe to expose)
     * @param scopes      list of scope names assigned to this key
     * @param status      computed status: {@code active}, {@code expired}, or {@code revoked}
     * @param createdAt   creation timestamp (UTC)
     * @param expiresAt   optional expiry timestamp; {@code null} means no passive expiry
     * @param revokedAt   timestamp of explicit revocation; {@code null} if not revoked
     * @param lastUsedAt  timestamp of last successful authentication; {@code null} if unused
     */
    public HaApiKeyResponseDTO(
            UUID id,
            String name,
            String keyPrefix,
            List<String> scopes,
            ApiKeyStatus status,
            Instant createdAt,
            Instant expiresAt,
            Instant revokedAt,
            Instant lastUsedAt
    ) {
        this.id = id;
        this.name = name;
        this.keyPrefix = keyPrefix;
        this.scopes = scopes;
        this.status = status;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.revokedAt = revokedAt;
        this.lastUsedAt = lastUsedAt;
    }

    // -------------------------------------------------------------------------
    // Accessors — all read-only (no setters; this is a value-object DTO)
    // -------------------------------------------------------------------------

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getKeyPrefix() {
        return keyPrefix;
    }

    public List<String> getScopes() {
        return scopes;
    }

    public ApiKeyStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public Instant getLastUsedAt() {
        return lastUsedAt;
    }
}
