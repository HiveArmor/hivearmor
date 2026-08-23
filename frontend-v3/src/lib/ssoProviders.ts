/**
 * Production SSO provider helpers for the login gate.
 * Filters out non-production / lab IdP names that should never appear to end users.
 */

import type { OidcProviderPublicDTO } from '@/types/sso';

const NON_PRODUCTION_NAME =
  /\b(test|testing|fixture|demo|sandbox|local|dev|staging|qa|chk\d*|check\d*|t\d{2,}[-_])/i;

/**
 * Returns true when a provider name looks production-ready for the login page.
 */
export function isProductionSsoProviderName(providerName: string): boolean {
  const name = providerName.trim();
  if (!name) return false;
  return !NON_PRODUCTION_NAME.test(name);
}

/**
 * Filters enabled OIDC providers down to production-facing identity options.
 */
export function filterProductionSsoProviders(
  providers: OidcProviderPublicDTO[] | undefined,
): OidcProviderPublicDTO[] {
  if (!providers?.length) return [];
  return providers.filter((provider) => isProductionSsoProviderName(provider.providerName));
}
