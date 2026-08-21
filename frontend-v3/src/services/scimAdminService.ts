/**
 * SCIM Admin Service
 * API calls for HiveArmor SCIM 2.0 token lifecycle management.
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 *
 * Endpoints:
 *   GET    /api/ha-admin/scim/token/status  → ScimTokenStatus
 *   POST   /api/ha-admin/scim/token         → ScimTokenGenerateResponse
 *   DELETE /api/ha-admin/scim/token         → void (204)
 *
 * Security notes:
 *   - All three endpoints require ROLE_ADMIN (enforced by the backend).
 *   - The plaintext SCIM token returned by POST /token is NEVER logged.
 *     The caller is responsible for showing it once and discarding it.
 */

import type { ScimTokenGenerateResponse, ScimTokenStatus } from '../types/scim';

import { apiClient } from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Fetches the current SCIM bearer-token status.
 *
 * Issues an authenticated GET to /api/ha-admin/scim/token/status.
 * Returns whether a token hash is configured and the ISO-8601 timestamp of
 * the last successful SCIM request (or null if the token has never been used).
 *
 * The plaintext token is NEVER included in this response per HiveArmor
 * platform invariant 5.4.
 */
export async function fetchScimTokenStatus(): Promise<ScimTokenStatus> {
  return apiClient.get<ScimTokenStatus>('/ha-admin/scim/token/status');
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/**
 * Generates a new SCIM bearer token.
 *
 * Issues an authenticated POST to /api/ha-admin/scim/token. The backend
 * generates a 48-byte cryptographically random token, bcrypt-hashes it into
 * ha_configuration_parameter, and returns the plaintext token exactly once in
 * the response body.
 *
 * ⚠ NEVER pass the returned token value to console.log, console.warn,
 *   console.error, console.debug, or any logger. Display it once via a modal
 *   and let the user copy it — then discard it (HiveArmor platform invariant
 *   5.10 / requirement 7.10).
 */
export async function generateScimToken(): Promise<ScimTokenGenerateResponse> {
  return apiClient.post<ScimTokenGenerateResponse>('/ha-admin/scim/token');
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

/**
 * Revokes the current SCIM bearer token.
 *
 * Issues an authenticated DELETE to /api/ha-admin/scim/token. The backend
 * clears the SCIM_BEARER_TOKEN_HASH configuration parameter so that all
 * subsequent SCIM requests return HTTP 401 until a new token is generated.
 * Returns void (the backend responds with HTTP 204 No Content).
 */
export async function revokeScimToken(): Promise<void> {
  return apiClient.delete<void>('/ha-admin/scim/token');
}
