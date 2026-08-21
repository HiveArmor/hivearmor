/**
 * scim.ts — HiveArmor SCIM 2.0 administration types
 *
 * Used by the SCIM Configuration page (`ScimConfigPage`) and the
 * SCIM admin service / hooks.  All symbols carry explicit types —
 * no `any` annotations permitted (HiveArmor platform invariant 7.8).
 */

/**
 * Response body from GET /api/ha-admin/scim/token/status.
 * The plaintext token is NEVER included in this response.
 */
export interface ScimTokenStatus {
  /** True when a non-blank SCIM_BEARER_TOKEN_HASH exists. */
  configured: boolean;
  /** ISO-8601 timestamp of the last successful SCIM request, or null if never used. */
  lastUsed: string | null;
}

/**
 * Response body from POST /api/ha-admin/scim/token.
 * The plaintext token is returned exactly once via this response;
 * it is never returned by any other endpoint.
 */
export interface ScimTokenGenerateResponse {
  /** Plaintext Base64URL-encoded 48-byte SCIM bearer token. */
  token: string;
}

/**
 * A single entry from the SCIM provisioning audit log.
 * Returned by the admin audit endpoint filtered to SCIM_ action prefixes.
 */
export interface ScimProvisioningLogEntry {
  /** Opaque unique identifier for this log entry. */
  id: string;
  /** SCIM operation, e.g. "SCIM_CREATE_USER", "SCIM_DELETE_USER", "SCIM_PATCH_USER". */
  action: string;
  /** Resource type operated on, e.g. "User" or "Group". */
  entityType: string;
  /** Human-readable name of the entity (login or group name). */
  entityName: string;
  /** ISO-8601 timestamp when the operation was recorded. */
  timestamp: string;
  /** Outcome of the operation. */
  result: 'success' | 'failure';
  /** Additional context or error message for the operation. */
  details: string;
}

/**
 * SCIM 2.0 base endpoint information displayed on the admin page.
 * Computed client-side as `window.location.origin + '/api/ha-scim/v2/'`.
 */
export interface ScimEndpointInfo {
  /** Full SCIM base URL, e.g. "https://hivearmor.example.com/api/ha-scim/v2/". */
  baseUrl: string;
}
