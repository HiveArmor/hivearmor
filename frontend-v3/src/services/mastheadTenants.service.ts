/**
 * Authorized tenant inventory for the masthead scope switcher.
 * Prefer platform `/api/ha-tenants` (ROLE_ADMIN); fall back to MSSP portal list (MSSP_ADMIN).
 * Never invent tenants when neither contract is authorized.
 */

import { fetchTenants } from '@/features/mssp/api/msspTenantApi';
import { hasAuthority } from '@/lib/auth/hasAuthority';
import { apiClient } from '@/lib/apiClient';

export interface MastheadTenantOption {
  id: number | null;
  prefix: string;
  label: string;
  description: string;
}

export type MastheadTenantSource = 'ha-tenants' | 'ha-mssp' | 'unavailable' | 'fixture';

export interface MastheadTenantInventory {
  source: MastheadTenantSource;
  tenants: MastheadTenantOption[];
  /** Operator-facing honesty when inventory is empty or gated. */
  notice: string | null;
}

export const ALL_TENANTS_OPTION: MastheadTenantOption = {
  id: null,
  prefix: '',
  label: 'All authorized tenants',
  description: 'View events across all tenants you have access to',
};

interface HiveTenantWire {
  id: number;
  name: string;
  prefix?: string | null;
  domain?: string | null;
  status?: string | null;
}

function mapHaTenant(row: HiveTenantWire): MastheadTenantOption {
  const prefix = row.prefix?.trim() ?? '';
  const label = row.name?.trim() || (prefix ? prefix : `Tenant ${row.id}`);
  return {
    id: row.id,
    prefix,
    label,
    description: prefix
      ? `Authorized tenant · prefix ${prefix}`
      : 'Authorized tenant · prefix not assigned',
  };
}

function mapMsspTenant(row: { id: number; name: string; clientPrefix: string }): MastheadTenantOption {
  return {
    id: row.id,
    prefix: row.clientPrefix,
    label: row.name,
    description: `MSSP-managed · prefix ${row.clientPrefix}`,
  };
}

/**
 * Loads the authorized masthead tenant list for the current principal.
 * Callers must pass whether the session has ROLE_ADMIN (from auth store).
 */
export async function fetchMastheadTenantInventory(
  isPlatformAdmin: boolean,
  signal?: AbortSignal,
): Promise<MastheadTenantInventory> {
  const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
  if (fixtureMode) {
    return {
      source: 'fixture',
      tenants: [ALL_TENANTS_OPTION],
      notice: 'Design fixture: masthead tenant inventory is not live.',
    };
  }

  if (isPlatformAdmin) {
    const rows = await apiClient.get<HiveTenantWire[]>('/ha-tenants', {
      params: { page: 0, size: 100, sort: 'name,asc' },
      signal,
    });
    const mapped = rows.map(mapHaTenant);
    return {
      source: 'ha-tenants',
      tenants: [ALL_TENANTS_OPTION, ...mapped],
      notice: mapped.length === 0
        ? 'No tenants were returned by GET /api/ha-tenants.'
        : null,
    };
  }

  if (hasAuthority('MSSP_ADMIN')) {
    const { items } = await fetchTenants({ page: 0, size: 100 });
    const mapped = items.map(mapMsspTenant);
    return {
      source: 'ha-mssp',
      tenants: [ALL_TENANTS_OPTION, ...mapped],
      notice: mapped.length === 0
        ? 'No MSSP-managed tenants were returned by GET /api/ha-mssp/tenants.'
        : null,
    };
  }

  return {
    source: 'unavailable',
    tenants: [ALL_TENANTS_OPTION],
    notice:
      'Tenant inventory requires Platform Administrator or MSSP Administrator. Scope stays on all authorized tenants.',
  };
}
