/**
 * API Key Management — shared TypeScript type definitions.
 *
 * These shapes mirror the backend DTOs under
 * com.hivearmor.service.dto.admin.api_key exactly.
 *
 * Invariants:
 *   - HaApiKeyScope is a closed union — no `string` fallback, no `any`.
 *   - HaApiKeyStatus is derived from revokedAt / expiresAt server-side.
 *   - token is returned exactly once (POST) and is never stored in Zustand.
 *   - No `any` types (Req 13.8).
 *
 * Requirements: 7.1, 13.8
 */

// ── Scopes ─────────────────────────────────────────────────────────────────

/**
 * Closed union of all valid API key permission scopes.
 * Must match com.hivearmor.domain.enumeration.HaApiKeyScope exactly.
 */
export type HaApiKeyScope =
  | 'read_alerts'
  | 'write_alerts'
  | 'read_incidents'
  | 'read_logs'
  | 'manage_rules'
  | 'admin';

// ── Status ─────────────────────────────────────────────────────────────────

/**
 * Computed status value derived from revokedAt and expiresAt on the backend.
 * - active  : revokedAt is null AND (expiresAt is null OR expiresAt is in the future)
 * - expired : revokedAt is null AND expiresAt is not null AND expiresAt is in the past
 * - revoked : revokedAt is not null
 */
export type HaApiKeyStatus = 'active' | 'expired' | 'revoked';

// ── Record (list / get-by-id) ──────────────────────────────────────────────

/**
 * API key record returned by:
 *   GET /api/ha-admin/api-keys
 *   GET /api/ha-admin/api-keys/{id}
 *
 * Never includes the plaintext token or the bcrypt hash (Req 5.5, 5.6).
 */
export interface HaApiKeyRecord {
  /** UUID of the key record. */
  id: string;
  /** Human-readable label for the key. */
  name: string;
  /** First 8 characters of the plaintext token — used for identification. */
  keyPrefix: string;
  /** Permission scopes assigned to this key. */
  scopes: HaApiKeyScope[];
  /** Computed status — never stored, always derived from revokedAt / expiresAt. */
  status: HaApiKeyStatus;
  /** ISO-8601 timestamp of when the key was created. */
  createdAt: string;
  /** ISO-8601 expiry timestamp, or null if the key never expires. */
  expiresAt: string | null;
  /** ISO-8601 timestamp of when the key was revoked, or null if still active. */
  revokedAt: string | null;
  /** ISO-8601 timestamp of the most recent authenticated request, or null. */
  lastUsedAt: string | null;
}

// ── Created response (POST only) ──────────────────────────────────────────

/**
 * Response body from POST /api/ha-admin/api-keys (HTTP 201).
 *
 * Extends HaApiKeyRecord with the plaintext token shown exactly once.
 * The caller MUST display the token to the user immediately and MUST NOT
 * persist it in Zustand or localStorage (Req 7.3, 7.4).
 */
export interface HaApiKeyCreatedResponse extends HaApiKeyRecord {
  /**
   * Plaintext API key token — returned exactly once at creation time.
   * Form: "ha_" followed by 40 URL-safe base64 characters.
   * Never stored in Zustand or localStorage.
   */
  token: string;
}

// ── Create payload ─────────────────────────────────────────────────────────

/**
 * Request body for POST /api/ha-admin/api-keys.
 */
export interface HaApiKeyCreatePayload {
  /** Human-readable label — 1..128 characters. */
  name: string;
  /** Non-empty list of scopes from HaApiKeyScope. */
  scopes: HaApiKeyScope[];
  /** Optional ISO-8601 expiry date. When absent the key never expires. */
  expiresAt?: string;
}
