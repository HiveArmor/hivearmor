/**
 * apiKeys.service.ts — API Key Management service.
 *
 * Wraps all /api/ha-admin/api-keys/* endpoints via the shared apiClient.
 * apiClient injects the JWT from localStorage['hivearmor_auth_token'] and
 * routes all requests through the Vite proxy — never use absolute URLs here.
 *
 * Endpoints covered:
 *   GET    /api/ha-admin/api-keys          → list all key records (no token/hash)
 *   POST   /api/ha-admin/api-keys          → create key, returns token exactly once
 *   DELETE /api/ha-admin/api-keys/{id}     → revoke key (HTTP 204)
 *
 * Security invariants:
 *   - apiClient handles JWT injection from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this service.
 *   - No `any` types (Req 13.8).
 *   - The plaintext token is returned to the caller and MUST NOT be stored
 *     in Zustand or localStorage by the caller (Req 7.4).
 *
 * Requirements: 7.1, 13.6, 13.7, 13.8
 */

import { apiClient } from '@/lib/apiClient';
import type {
  HaApiKeyCreatePayload,
  HaApiKeyCreatedResponse,
  HaApiKeyRecord,
} from '@/types/apiKey.types';

export const apiKeysService = {
  /**
   * Fetch the list of all API keys.
   * Records never include the plaintext token or bcrypt hash (Req 5.5).
   * Maps to: GET /api/ha-admin/api-keys
   */
  list: (): Promise<HaApiKeyRecord[]> =>
    apiClient.get<HaApiKeyRecord[]>('/ha-admin/api-keys'),

  /**
   * Create a new API key.
   * The returned HaApiKeyCreatedResponse includes the plaintext token exactly once.
   * The caller MUST display the token immediately and MUST NOT persist it
   * in Zustand or localStorage (Req 7.3, 7.4).
   * Maps to: POST /api/ha-admin/api-keys
   */
  create: (payload: HaApiKeyCreatePayload): Promise<HaApiKeyCreatedResponse> =>
    apiClient.post<HaApiKeyCreatedResponse>('/ha-admin/api-keys', payload),

  /**
   * Revoke an API key by id.
   * Backend sets revokedAt to the current server time and returns HTTP 204.
   * Maps to: DELETE /api/ha-admin/api-keys/{id}
   */
  revoke: (id: string): Promise<void> =>
    apiClient.delete<void>(`/ha-admin/api-keys/${id}`),
};
