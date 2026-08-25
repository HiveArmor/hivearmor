import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

vi.mock('@/features/mssp/api/msspTenantApi', () => ({
  fetchTenants: vi.fn(),
}));

vi.mock('@/lib/auth/hasAuthority', () => ({
  hasAuthority: vi.fn(),
}));

import { apiClient } from '@/lib/apiClient';
import { fetchTenants } from '@/features/mssp/api/msspTenantApi';
import { hasAuthority } from '@/lib/auth/hasAuthority';
import {
  ALL_TENANTS_OPTION,
  fetchMastheadTenantInventory,
} from './mastheadTenants.service';

describe('fetchMastheadTenantInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_USE_FOUNDATION_FIXTURES', 'false');
  });

  it('loads platform ha-tenants for Platform Administrator', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      { id: 1, name: 'Acme', prefix: 'acme', status: 'ACTIVE' },
    ]);

    const inventory = await fetchMastheadTenantInventory(true);

    expect(apiClient.get).toHaveBeenCalledWith('/ha-tenants', expect.objectContaining({
      params: { page: 0, size: 100, sort: 'name,asc' },
    }));
    expect(inventory.source).toBe('ha-tenants');
    expect(inventory.tenants[0]).toEqual(ALL_TENANTS_OPTION);
    expect(inventory.tenants[1]).toMatchObject({ id: 1, label: 'Acme', prefix: 'acme' });
    expect(inventory.notice).toBeNull();
    expect(fetchTenants).not.toHaveBeenCalled();
  });

  it('loads MSSP tenants when not platform admin but MSSP_ADMIN', async () => {
    vi.mocked(hasAuthority).mockReturnValue(true);
    vi.mocked(fetchTenants).mockResolvedValue({
      items: [{ id: 9, name: 'North', clientPrefix: 'north', userCount: 1, eps: 0, healthStatus: 'OFFLINE', lastEventAt: null }],
      totalCount: 1,
    });

    const inventory = await fetchMastheadTenantInventory(false);

    expect(inventory.source).toBe('ha-mssp');
    expect(inventory.tenants).toHaveLength(2);
    expect(inventory.tenants[1].prefix).toBe('north');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fail-closes to all-tenants with honesty when inventory is unauthorized', async () => {
    vi.mocked(hasAuthority).mockReturnValue(false);

    const inventory = await fetchMastheadTenantInventory(false);

    expect(inventory.source).toBe('unavailable');
    expect(inventory.tenants).toEqual([ALL_TENANTS_OPTION]);
    expect(inventory.notice).toContain('Platform Administrator');
    expect(inventory.notice).toContain('MSSP Administrator');
  });
});
