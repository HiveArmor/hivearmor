import { describe, expect, it, vi } from 'vitest';

import { getAlertTimeline } from './commandCenter.service';

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
