/**
 * SSO / OIDC Service
 * API calls for HiveArmor OIDC provider management and the PKCE authorize flow.
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 *
 * Endpoints:
 *   GET    /api/ha-oidc/providers/enabled    → OidcProviderPublicDTO[]  (unauthenticated)
 *   GET    /api/ha-oidc/providers             → OidcProviderAdminDTO[]   (ROLE_ADMIN)
 *   POST   /api/ha-oidc/providers             → OidcProviderAdminDTO     (ROLE_ADMIN)
 *   PUT    /api/ha-oidc/providers/{id}        → OidcProviderAdminDTO     (ROLE_ADMIN)
 *   DELETE /api/ha-oidc/providers/{id}        → void (204)               (ROLE_ADMIN)
 *
 * Security notes:
 *   - fetchEnabledProviders is intentionally unauthenticated (login page use case).
 *   - buildAuthorizeUrl uses URLSearchParams — never raw string concatenation.
 *   - No `any` type annotations per HiveArmor platform constraint.
 */

import type {
  OidcProviderPublicDTO,
  OidcProviderAdminDTO,
  OidcProviderFormValues,
} from '../types/sso';

import { apiClient } from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Public — unauthenticated (used on the login page)
// ---------------------------------------------------------------------------

/**
 * Fetches the list of enabled OIDC providers for the login page.
 *
 * Issues an unauthenticated GET to /api/ha-oidc/providers/enabled.
 * Returns only the public fields (id, providerName, discoveryUrl) — never
 * clientId, clientSecret, or any other admin-only field.
 */
export async function fetchEnabledProviders(): Promise<OidcProviderPublicDTO[]> {
  return apiClient.get<OidcProviderPublicDTO[]>('/ha-oidc/providers/enabled', { auth: 'none' });
}

// ---------------------------------------------------------------------------
// Admin CRUD (require ROLE_ADMIN)
// ---------------------------------------------------------------------------

/**
 * Fetches all OIDC providers (enabled and disabled) for the admin page.
 *
 * Issues an authenticated GET to /api/ha-oidc/providers.
 * The returned DTOs always have clientSecret set to null — the plaintext
 * secret is never returned after creation (HiveArmor platform invariant).
 */
export async function fetchAllProviders(): Promise<OidcProviderAdminDTO[]> {
  return apiClient.get<OidcProviderAdminDTO[]>('/ha-oidc/providers');
}

/**
 * Creates a new OIDC provider.
 *
 * Issues an authenticated POST to /api/ha-oidc/providers. The backend
 * AES-256-GCM encrypts the clientSecret before persisting it. The returned
 * DTO has clientSecret set to null.
 */
export async function createProvider(
  data: OidcProviderFormValues
): Promise<OidcProviderAdminDTO> {
  return apiClient.post<OidcProviderAdminDTO>('/ha-oidc/providers', data);
}

/**
 * Updates an existing OIDC provider.
 *
 * Issues an authenticated PUT to /api/ha-oidc/providers/{id}. When
 * data.clientSecret is an empty string the backend keeps the existing
 * encrypted secret unchanged. The returned DTO has clientSecret set to null.
 */
export async function updateProvider(
  id: number,
  data: OidcProviderFormValues
): Promise<OidcProviderAdminDTO> {
  return apiClient.put<OidcProviderAdminDTO>(`/ha-oidc/providers/${id}`, data);
}

/**
 * Deletes an OIDC provider.
 *
 * Issues an authenticated DELETE to /api/ha-oidc/providers/{id}.
 * Cascading FK constraints on the backend remove all associated state-cache
 * and provider-user rows. Returns void (the backend responds with HTTP 204).
 */
export async function deleteProvider(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-oidc/providers/${id}`);
}

// ---------------------------------------------------------------------------
// Pure utility — authorize redirect URL
// ---------------------------------------------------------------------------

/**
 * Builds the relative URL that initiates an OIDC PKCE authorization flow.
 *
 * Uses URLSearchParams for query construction — never string concatenation
 * with unescaped values (HiveArmor platform constraint).
 *
 * Example:
 *   buildAuthorizeUrl(1, 'https://app.example.com/oidc-callback')
 *   → '/api/ha-oidc/authorize?providerId=1&redirectUri=https%3A%2F%2F...'
 *
 * The browser performs a full-page navigation to this URL so that the backend
 * 302 redirect to the IdP is followed correctly.
 */
export function buildAuthorizeUrl(providerId: number, redirectUri: string): string {
  const params = new URLSearchParams({
    providerId: String(providerId),
    redirectUri,
  });
  return `/api/ha-oidc/authorize?${params.toString()}`;
}
