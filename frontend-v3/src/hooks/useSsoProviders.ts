/**
 * TanStack Query v5 hooks for the HiveArmor SSO / OIDC provider management UI.
 *
 * Query hooks:
 *   - useEnabledSsoProviders  — fetches enabled providers for the login page
 *   - useAllSsoProviders      — fetches all providers (enabled + disabled) for the admin page
 *
 * Mutation hooks (all invalidate both query keys on success):
 *   - useCreateSsoProvider    — creates a new OIDC provider
 *   - useUpdateSsoProvider    — updates an existing OIDC provider by ID
 *   - useDeleteSsoProvider    — deletes an OIDC provider by ID
 *
 * Security invariants:
 *   - fetchEnabledProviders is intentionally unauthenticated (login page use case).
 *   - useEnabledSsoProviders uses retry: false so a failed request is silent on the
 *     login page and never surfaces an error banner to the user.
 *   - All requests route through apiClient — do NOT read localStorage directly.
 *   - No `any` type annotations (HiveArmor platform constraint).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import {
  createProvider,
  deleteProvider,
  fetchAllProviders,
  fetchEnabledProviders,
  updateProvider,
} from '@/services/ssoService';
import type {
  OidcProviderAdminDTO,
  OidcProviderFormValues,
  OidcProviderPublicDTO,
} from '@/types/sso';

// ---------------------------------------------------------------------------
// Shared query keys
// ---------------------------------------------------------------------------

const SSO_PROVIDERS_ENABLED_KEY = ['sso-providers-enabled'] as const;
const SSO_PROVIDERS_ALL_KEY = ['sso-providers-all'] as const;

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the list of enabled OIDC providers for the login page.
 *
 * queryKey: ['sso-providers-enabled']
 * staleTime: 60 seconds
 * retry: false — a network failure on the login page must be silent
 *
 * Returns only public fields (id, providerName, discoveryUrl).
 *
 * @returns TanStack Query result with `data` typed as `OidcProviderPublicDTO[]`.
 */
export function useEnabledSsoProviders(): UseQueryResult<OidcProviderPublicDTO[]> {
  return useQuery<OidcProviderPublicDTO[]>({
    queryKey: SSO_PROVIDERS_ENABLED_KEY,
    queryFn: fetchEnabledProviders,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Fetches all OIDC providers (enabled and disabled) for the admin page.
 *
 * queryKey: ['sso-providers-all']
 * staleTime: 30 seconds
 *
 * Requires ROLE_ADMIN — apiClient injects the Authorization header automatically.
 *
 * @returns TanStack Query result with `data` typed as `OidcProviderAdminDTO[]`.
 */
export function useAllSsoProviders(): UseQueryResult<OidcProviderAdminDTO[]> {
  return useQuery<OidcProviderAdminDTO[]>({
    queryKey: SSO_PROVIDERS_ALL_KEY,
    queryFn: fetchAllProviders,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Mutation hook that creates a new OIDC provider.
 *
 * On success, invalidates both ['sso-providers-all'] and ['sso-providers-enabled']
 * so that the admin table and the login-page SSO buttons both refresh automatically.
 *
 * @example
 * const { mutate } = useCreateSsoProvider();
 * mutate(formValues);
 */
export function useCreateSsoProvider(): UseMutationResult<
  OidcProviderAdminDTO,
  Error,
  OidcProviderFormValues
> {
  const queryClient = useQueryClient();

  return useMutation<OidcProviderAdminDTO, Error, OidcProviderFormValues>({
    mutationFn: (data: OidcProviderFormValues) => createProvider(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ALL_KEY });
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ENABLED_KEY });
    },
  });
}

/**
 * Mutation hook that updates an existing OIDC provider.
 *
 * Variable shape: `{ id: number; data: OidcProviderFormValues }`
 *
 * On success, invalidates both ['sso-providers-all'] and ['sso-providers-enabled']
 * so that the admin table and the login-page SSO buttons both refresh automatically.
 *
 * @example
 * const { mutate } = useUpdateSsoProvider();
 * mutate({ id: 1, data: formValues });
 */
export function useUpdateSsoProvider(): UseMutationResult<
  OidcProviderAdminDTO,
  Error,
  { id: number; data: OidcProviderFormValues }
> {
  const queryClient = useQueryClient();

  return useMutation<OidcProviderAdminDTO, Error, { id: number; data: OidcProviderFormValues }>({
    mutationFn: ({ id, data }: { id: number; data: OidcProviderFormValues }) =>
      updateProvider(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ALL_KEY });
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ENABLED_KEY });
    },
  });
}

/**
 * Mutation hook that deletes an OIDC provider by ID.
 *
 * Variable type: `number` (the provider ID)
 *
 * On success, invalidates both ['sso-providers-all'] and ['sso-providers-enabled']
 * so that the admin table and the login-page SSO buttons both refresh automatically.
 * Cascading FK constraints on the backend remove all associated state-cache and
 * provider-user rows.
 *
 * @example
 * const { mutate } = useDeleteSsoProvider();
 * mutate(1);
 */
export function useDeleteSsoProvider(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteProvider(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ALL_KEY });
      void queryClient.invalidateQueries({ queryKey: SSO_PROVIDERS_ENABLED_KEY });
    },
  });
}
