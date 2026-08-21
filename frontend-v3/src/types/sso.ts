/**
 * HiveArmor SSO / OIDC type definitions.
 * No `any` type annotations — all symbols carry explicit types.
 */

export interface OidcProviderPublicDTO {
  id: number;
  providerName: string;
  discoveryUrl: string;
}

export interface OidcProviderAdminDTO {
  id: number;
  providerName: string;
  clientId: string;
  clientSecret: string | null;
  discoveryUrl: string;
  scopes: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OidcProviderFormValues {
  providerName: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  scopes: string;
  enabled: boolean;
}
