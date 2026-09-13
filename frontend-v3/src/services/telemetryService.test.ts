import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '@/lib/apiClient';
import { adaptVitalsRow, fetchAgentVitals } from '@/services/telemetryService';

describe('telemetryService.adaptVitalsRow', () => {
  it('maps snake_case wire columns to camelCase, preserving nulls', () => {
    const sample = adaptVitalsRow({
      cpu_pct: 42.5,
      ram_mb: 1024,
      queue_depth: 30,
      events_per_sec: 120.2,
      dropped_total: 3,
      last_error: null,
      applied_policy_id: 7,
      applied_policy_version: 2,
      sampled_at: '2026-09-13T08:00:00Z',
    });
    expect(sample).toEqual({
      cpuPct: 42.5,
      ramMb: 1024,
      queueDepth: 30,
      eventsPerSec: 120.2,
      droppedTotal: 3,
      lastError: null,
      appliedPolicyId: 7,
      appliedPolicyVersion: 2,
      sampledAt: '2026-09-13T08:00:00Z',
    });
  });

  it('coerces missing/non-finite numerics and blank strings to null', () => {
    const sample = adaptVitalsRow({
      cpu_pct: undefined,
      last_error: '   ',
      applied_policy_id: 0,
    });
    expect(sample.cpuPct).toBeNull();
    expect(sample.lastError).toBeNull();
    // 0 is a finite value and must be preserved (not treated as null).
    expect(sample.appliedPolicyId).toBe(0);
  });
});

describe('telemetryService.fetchAgentVitals', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('calls the tenant-scoped vitals endpoint and maps rows', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([
      { cpu_pct: 10, sampled_at: '2026-09-13T08:00:00Z' },
    ]);
    const out = await fetchAgentVitals('agent-42');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/ha-telemetry/vitals/agent-42',
      expect.objectContaining({ signal: undefined }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].cpuPct).toBe(10);
  });

  it('url-encodes the agent id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    await fetchAgentVitals('host/with space');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/ha-telemetry/vitals/host%2Fwith%20space',
      expect.anything(),
    );
  });

  it('returns [] when the endpoint returns a non-array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(null as unknown as []);
    await expect(fetchAgentVitals('a')).resolves.toEqual([]);
  });
});
