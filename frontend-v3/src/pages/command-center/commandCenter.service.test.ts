import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlertTimeline, getDetectionHealthSummary } from './commandCenter.service';

vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
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

describe('getDetectionHealthSummary (A1-DET-01)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const active = String(url).includes('active=true');
        return {
          ok: true,
          headers: {
            get: (name: string) => (name === 'X-Total-Count' ? (active ? '12' : '40') : null),
          },
          json: async () => [{}],
        };
      })
    );
    localStorage.setItem('hivearmor_auth_token', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('hivearmor_auth_token');
  });

  it('reads X-Total-Count instead of page array length', async () => {
    const summary = await getDetectionHealthSummary();
    expect(summary).toEqual({ activeRules: 12, totalRules: 40 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
