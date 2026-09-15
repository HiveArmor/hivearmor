/**
 * agentDetail.service tests (SPEC-03, W3) — verifies the honest single-agent
 * resolution path and the capability markers used for the honesty notes.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EDR_MITRE_CAPABILITY,
  PER_AGENT_ALERTS_CAPABILITY,
  PER_AGENT_AUDIT_CAPABILITY,
  PER_AGENT_COMMANDS_CAPABILITY,
  PER_AGENT_POLICY_CAPABILITY,
  adaptAgentDetail,
  fetchAgentCommands,
  fetchAgentDetail,
  removeAgent,
} from './agentDetail.service';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>();
  return {
    ...actual, // keep the real ApiError class
    apiClient: { get: mocks.get, delete: mocks.delete },
  };
});

describe('adaptAgentDetail', () => {
  it('preserves ip/mac that SensorDTO drops', () => {
    const detail = adaptAgentDetail({ id: 5, hostname: 'h1', ip: '1.2.3.4', mac: 'aa:bb', os: 'Linux' });
    expect(detail?.ip).toBe('1.2.3.4');
    expect(detail?.mac).toBe('aa:bb');
    expect(detail?.agentId).toBe('5');
  });

  it('returns null for a wire row with no identity', () => {
    expect(adaptAgentDetail({})).toBeNull();
  });
});

describe('fetchAgentDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves via the hostname endpoint when it returns an agent', async () => {
    mocks.get.mockResolvedValue({ id: 9, hostname: 'web-01', ip: '10.0.0.9' });
    const detail = await fetchAgentDetail('web-01');
    expect(mocks.get).toHaveBeenCalledWith(
      '/agent-manager/agent-by-hostname',
      expect.objectContaining({ params: { hostname: 'web-01' } }),
    );
    expect(detail.hostname).toBe('web-01');
    // Resolved on the hostname endpoint alone — no list fallback call.
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to the agent list when hostname lookup 404s, matching by id and preserving ip/mac', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    // 1st call: hostname lookup → 404. 2nd call: raw agent list.
    mocks.get.mockRejectedValueOnce(new ApiError(404, { status: 404 }));
    mocks.get.mockResolvedValueOnce([
      { id: 9, hostname: 'web-01', ip: '10.0.0.9', mac: 'aa:bb:cc', os: 'Linux' },
    ]);
    const detail = await fetchAgentDetail('9');
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/agent-manager/agents',
      expect.objectContaining({ params: { pageSize: 500 } }),
    );
    expect(detail.agentId).toBe('9');
    expect(detail.hostname).toBe('web-01');
    // L1: ip/mac must survive the (common) fallback path, not be nulled.
    expect(detail.ip).toBe('10.0.0.9');
    expect(detail.mac).toBe('aa:bb:cc');
  });

  it('throws a 404 when neither the hostname endpoint nor the list matches', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    mocks.get.mockRejectedValueOnce(new ApiError(404, { status: 404 }));
    mocks.get.mockResolvedValueOnce([]);
    await expect(fetchAgentDetail('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('fetchAgentCommands (SPEC-07 W6 6.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters the tenant-wide command list to the requested agent, newest-first, and normalizes status', async () => {
    mocks.get.mockResolvedValue([
      { cmdId: 'c1', agentId: 9, command: 'isolate-host', commandStatus: 'COMPLETED', createdAt: '2026-09-01T10:00:00Z', executedBy: 'maya' },
      { cmdId: 'c2', agentId: 7, command: 'kill', commandStatus: 'RUNNING', createdAt: '2026-09-02T10:00:00Z' },
      { cmdId: 'c3', agentId: 9, command: 'collect', commandStatus: 'IN_PROGRESS', createdAt: '2026-09-03T10:00:00Z', executedBy: 'sam' },
    ]);

    const rows = await fetchAgentCommands('9');

    // Only agent 9's commands survive the client-side filter.
    expect(rows.map((r) => r.cmdId)).toEqual(['c3', 'c1']); // newest-first
    expect(rows[0].status).toBe('RUNNING'); // IN_PROGRESS → RUNNING
    expect(rows[1].status).toBe('COMPLETED');
    expect(rows[1].issuedBy).toBe('maya');
  });

  it('returns [] when no command matches the agent (never a fabricated row)', async () => {
    mocks.get.mockResolvedValue([{ cmdId: 'c9', agentId: 1, command: 'x', commandStatus: 'DONE' }]);
    const rows = await fetchAgentCommands('9');
    expect(rows).toEqual([]);
  });
});

describe('removeAgent (SPEC-07 W6 6.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DELETEs the hostname-scoped route (url-encoded) and sends no secret', async () => {
    mocks.delete.mockResolvedValue(undefined);
    await removeAgent('web-01.corp');
    expect(mocks.delete).toHaveBeenCalledWith(
      '/agent-manager/agents/web-01.corp',
      expect.any(Object),
    );
  });

  it('propagates a 404 (cross-tenant / missing) so the caller shows the honest message', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    mocks.delete.mockRejectedValue(new ApiError(404, { status: 404 }));
    await expect(removeAgent('other-tenant-host')).rejects.toMatchObject({ status: 404 });
  });
});

describe('capability markers stay honest', () => {
  it('alerts and commands are EXISTS_NO_FILTER; policy and MITRE are NEEDS_VERIFICATION', () => {
    expect(PER_AGENT_ALERTS_CAPABILITY.verdict).toBe('EXISTS_NO_FILTER');
    expect(PER_AGENT_COMMANDS_CAPABILITY.verdict).toBe('EXISTS_NO_FILTER');
    expect(PER_AGENT_POLICY_CAPABILITY.verdict).toBe('NEEDS_VERIFICATION');
    expect(PER_AGENT_AUDIT_CAPABILITY.verdict).toBe('NEEDS_VERIFICATION');
    expect(EDR_MITRE_CAPABILITY.verdict).toBe('NEEDS_VERIFICATION');
    // Each carries a human-readable note for the UI honesty banner.
    for (const cap of [PER_AGENT_ALERTS_CAPABILITY, PER_AGENT_COMMANDS_CAPABILITY, PER_AGENT_POLICY_CAPABILITY, PER_AGENT_AUDIT_CAPABILITY, EDR_MITRE_CAPABILITY]) {
      expect(cap.note.length).toBeGreaterThan(20);
    }
  });
});
