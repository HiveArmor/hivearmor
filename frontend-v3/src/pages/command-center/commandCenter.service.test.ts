import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAlertTimeline, getDetectionHealthSummary } from './commandCenter.service';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    getCount: vi.fn(),
  },
}));

import { apiClient } from '@/lib/apiClient';

describe('getAlertTimeline', () => {
  it('calls GET /overview/alert-timeline with days', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      { hour: '2026-08-18T16:00:00.000Z', low: 0, medium: 4, high: 0 },
    ]);
    const buckets = await getAlertTimeline(1);
    expect(apiClient.get).toHaveBeenCalledWith('/overview/alert-timeline', { params: { days: 1 } });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.medium).toBe(4);
  });

  it('returns an empty list when the payload is not an array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ hour: 'x' });
    await expect(getAlertTimeline(1)).resolves.toEqual([]);
  });
});

describe('getDetectionHealthSummary (A1-DET-01, UX-002)', () => {
  afterEach(() => {
    vi.mocked(apiClient.getCount).mockReset();
  });

  it('reads totals via apiClient.getCount (tenant-scoped, not raw fetch)', async () => {
    // active=true → 12, no-active → 40
    vi.mocked(apiClient.getCount).mockImplementation(async (_path, options) => {
      const active = options?.params?.active;
      return active === true ? 12 : 40;
    });

    const summary = await getDetectionHealthSummary();

    expect(summary).toEqual({ activeRules: 12, totalRules: 40 });
    // Routed through apiClient (inherits X-Tenant-ID) — never a bare fetch.
    expect(apiClient.getCount).toHaveBeenCalledTimes(2);
    expect(apiClient.getCount).toHaveBeenCalledWith(
      '/correlation-rule/search-by-filters',
      { params: { page: 0, size: 1, active: true } }
    );
    expect(apiClient.getCount).toHaveBeenCalledWith(
      '/correlation-rule/search-by-filters',
      { params: { page: 0, size: 1 } }
    );
  });
});
