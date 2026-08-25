import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '@/lib/apiClient';
import { fetchIsolatedHosts, fetchQuarantinedFiles } from '@/services/edrService';

describe('edrService list freshness (RESP-021 STAGING CANDIDATE)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('preserves server snapshotAt and asOf on quarantine list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      snapshotAt: '2026-08-25T06:00:00Z',
      asOf: null,
    });

    const page = await fetchQuarantinedFiles({ page: 0, size: 25 });

    expect(apiClient.get).toHaveBeenCalledWith('/ha-edr/quarantine', expect.objectContaining({
      params: expect.objectContaining({ page: 0, size: 25 }),
    }));
    expect(page.snapshotAt).toBe('2026-08-25T06:00:00Z');
    expect(page.asOf).toBeNull();
  });

  it('preserves server snapshotAt and asOf on isolation list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      content: [{
        id: 1,
        agentId: 'agent-a',
        isolationType: 'FULL',
        status: 'ACTIVE',
        isolatedAt: '2026-08-25T05:30:00Z',
        actionedBy: 'soc.manager',
      }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      snapshotAt: '2026-08-25T06:05:00Z',
      asOf: '2026-08-25T05:30:00Z',
    });

    const page = await fetchIsolatedHosts({ page: 0, size: 50, status: 'ACTIVE' });

    expect(apiClient.get).toHaveBeenCalledWith('/ha-edr/isolation', expect.objectContaining({
      params: expect.objectContaining({ page: 0, size: 50, status: 'ACTIVE' }),
    }));
    expect(page.snapshotAt).toBe('2026-08-25T06:05:00Z');
    expect(page.asOf).toBe('2026-08-25T05:30:00Z');
  });
});
