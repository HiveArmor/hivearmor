package com.hivearmor.domain.enumeration;

/**
 * Computed status of a HiveArmor API key.
 *
 * <p>The value is derived at runtime from the persisted {@code revokedAt} and
 * {@code expiresAt} fields — it is never stored in the database.
 *
 * <p>Status resolution rule (Requirement 6.3):
 * <ol>
 *   <li>{@link #revoked}  — {@code revokedAt} is not {@code null}</li>
 *   <li>{@link #expired}  — {@code expiresAt} is not {@code null} and is before the
 *       current server time</li>
 *   <li>{@link #active}   — neither of the above conditions holds</li>
 * </ol>
 *
 * <p>The three-way priority is deterministic and is verified by
 * Property 9 (computeStatus determinism and three-branch rule).
 *
 * @see com.hivearmor.service.admin.api_key.HaApiKeyService#computeStatus(java.time.Instant, java.time.Instant, java.time.Instant)
 */
public enum ApiKeyStatus {

    /**
     * The key is valid and may be used for authentication.
     * Neither {@code revokedAt} nor an expired {@code expiresAt} applies.
     */
    active,

    /**
     * The key's {@code expiresAt} timestamp is in the past.
     * Authentication attempts will be rejected with HTTP 401 (Requirement 6.5).
     */
    expired,

    /**
     * The key was explicitly revoked by an administrator via
     * {@code DELETE /api/ha-admin/api-keys/{id}}.
     * Authentication attempts will be rejected with HTTP 401 (Requirement 6.5).
     * Takes precedence over {@code expired} when both conditions hold.
     */
    revoked
}
