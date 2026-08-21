package com.hivearmor.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the {@code ha_api_key} table.
 *
 * <p>Stores bcrypt-hashed API key material and associated metadata. The
 * plaintext token is <strong>never</strong> persisted — only the bcrypt output
 * (strength 10) is stored in {@code key_hash}, and the first 8 characters of
 * the plaintext token are stored in {@code key_prefix} to enable O(1) narrowing
 * during authentication.
 *
 * <p>Scopes are persisted as a comma-separated string of
 * {@link com.hivearmor.domain.enumeration.HaApiKeyScope} values.
 *
 * <p>Status is a computed value derived from {@code revokedAt} and
 * {@code expiresAt} — it is not stored in the database.
 *
 * @see com.hivearmor.repository.HaApiKeyRepository
 * @see com.hivearmor.domain.enumeration.HaApiKeyScope
 */
@Entity
@Table(name = "ha_api_key")
@Getter
@Setter
public class HaApiKey implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * Primary key — randomly assigned UUID, set by the service layer before
     * persisting (no database sequence required).
     */
    @Id
    private UUID id;

    /**
     * Human-readable label assigned by the administrator at key-creation time.
     * Required; max 128 characters.
     */
    @Column(name = "name", length = 128, nullable = false)
    private String name;

    /**
     * bcrypt output produced at strength 10.
     * Must be unique across all rows — the unique constraint is enforced by
     * {@code uq_ha_api_key_key_hash} (see Liquibase changelog 20260724040-02).
     */
    @Column(name = "key_hash", length = 255, nullable = false, unique = true)
    private String keyHash;

    /**
     * First 8 characters of the plaintext token ({@code ha_XXXXXXXX…}).
     * Used to narrow candidate rows before the more expensive bcrypt verification.
     */
    @Column(name = "key_prefix", length = 16, nullable = false)
    private String keyPrefix;

    /**
     * Comma-separated list of {@link com.hivearmor.domain.enumeration.HaApiKeyScope}
     * enum names, e.g. {@code "read_alerts,write_alerts"}.
     * Max 512 characters; required.
     */
    @Column(name = "scopes", length = 512, nullable = false)
    private String scopes;

    /**
     * Timestamp of key creation (server time, UTC). Required; never null.
     */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * Optional expiry timestamp. When not null and in the past, the computed
     * status of the key is {@code expired} and authentication is rejected.
     */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /**
     * Set to the server time when an administrator explicitly revokes the key.
     * When not null, the computed status is {@code revoked} regardless of
     * {@code expiresAt}.
     */
    @Column(name = "revoked_at")
    private Instant revokedAt;

    /**
     * Login of the administrator who created the key. Required; max 128 characters.
     */
    @Column(name = "created_by", length = 128, nullable = false)
    private String createdBy;

    /**
     * Updated by the authentication filter on each successful key usage.
     * Nullable — {@code null} means the key has never been used.
     */
    @Column(name = "last_used_at")
    private Instant lastUsedAt;
}
