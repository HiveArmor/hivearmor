import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  ALL_TENANTS_OPTION,
  fetchMastheadTenantInventory,
  type MastheadTenantInventory,
  type MastheadTenantOption,
} from '@/services/mastheadTenants.service';
import { useAuthStore } from '@/store/auth.store';

export function useMastheadTenants(): {
  tenants: MastheadTenantOption[];
  inventory: MastheadTenantInventory | undefined;
  isLoading: boolean;
  isError: boolean;
  notice: string | null;
} {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isPlatformAdmin = useAuthStore((s) => s.hasRole('ROLE_ADMIN'));
  const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
  const setSelectedTenant = useAuthStore((s) => s.setSelectedTenant);

  const query = useQuery({
    queryKey: ['masthead-tenants', isPlatformAdmin],
    queryFn: ({ signal }) => fetchMastheadTenantInventory(isPlatformAdmin, signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  const tenants = query.data?.tenants ?? [ALL_TENANTS_OPTION];
  const notice = query.isError
    ? 'Tenant inventory could not be loaded. Scope stays on all authorized tenants until the request succeeds.'
    : (query.data?.notice ?? null);

  // Drop stale session preference if it is not in the authorized inventory.
  useEffect(() => {
    if (!query.data || selectedTenantId === null) return;
    const allowed = query.data.tenants.some((t) => t.id === selectedTenantId);
    if (!allowed) {
      setSelectedTenant(null);
    }
  }, [query.data, selectedTenantId, setSelectedTenant]);

  return {
    tenants,
    inventory: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    notice,
  };
}
