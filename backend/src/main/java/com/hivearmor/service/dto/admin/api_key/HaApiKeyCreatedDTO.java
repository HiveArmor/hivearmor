package com.hivearmor.service.dto.admin.api_key;

import com.hivearmor.domain.HaApiKey;
import com.hivearmor.domain.enumeration.ApiKeyStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Response body returned <em>exactly once</em> from
 * {@code POST /api/ha-admin/api-keys} (Requirement 5.4).
 *
 * <p>This DTO extends the information in {@link HaApiKeyResponseDTO} by including the
 * plaintext API key {@code token}. It is returned only at creation time; subsequent
 * {@code GET} calls return {@link HaApiKeyResponseDTO} which omits the token entirely.
 *
 * <p><strong>Security contract:</strong>
 * <ul>
 *   <li>The {@code token} field must never be persisted in any store other than this
 *       in-flight HTTP response.</li>
 *   <li>The bcrypt {@code keyHash} is intentionally absent from this DTO —
 *       only the plaintext token is returned (Requirement 5.5, 5.6).</li>
 *   <li>The caller is responsible for displaying the token to the user and then
 *       discarding it; HiveArmor cannot recover it later.</li>
 * </ul>
 *
 * <p>Requirements: 5.3, 5.4
 */
public class HaApiKeyCreatedDTO {

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
     * The plaintext API key token, returned exactly once.
     * Always of the form {@code ha_<40 chars from [A-Za-z0-9_-]>}.
     */
    private final String token;

    /**
     * Private constructor — use {@link #from(HaApiKey, String)} instead.
     */
    private HaApiKeyCreatedDTO(
            UUID id,
            String name,
            String keyPrefix,
            List<String> scopes,
            ApiKeyStatus status,
            Instant createdAt,
            Instant expiresAt,
            Instant revokedAt,
            Instant lastUsedAt,
            String token
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
        this.token = token;
    }

    /**
     * Factory method that builds the one-time response DTO from the persisted entity
     * and the plaintext token generated just before persistence.
     *
     * <p>The {@code status} is always {@code active} on creation because the key has
     * just been created and cannot have been revoked or expired yet.
     *
     * @param entity    the freshly-persisted {@link HaApiKey}; must not be {@code null}
     * @param plaintext the plaintext token returned once to the caller; must not be
     *                  {@code null}
     * @return a fully-populated {@link HaApiKeyCreatedDTO}
     */
    public static HaApiKeyCreatedDTO from(HaApiKey entity, String plaintext) {
        return new HaApiKeyCreatedDTO(
            entity.getId(),
            entity.getName(),
            entity.getKeyPrefix(),
            List.of(entity.getScopes().split(",")),
            ApiKeyStatus.active,   // newly created — always active
            entity.getCreatedAt(),
            entity.getExpiresAt(),
            entity.getRevokedAt(),
            entity.getLastUsedAt(),
            plaintext
        );
    }

    // -------------------------------------------------------------------------
    // Accessors
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

    /**
     * Returns the plaintext API key token.
     *
     * <p>This value is returned to the HTTP caller exactly once. The caller must
     * display and copy it before closing the dialog; HiveArmor cannot retrieve it
     * again.
     *
     * @return the plaintext token matching {@code ^ha_[A-Za-z0-9_-]{40}$}
     */
    public String getToken() {
        return token;
    }
}
