/**
 * agentDetail.fixtures — fixture-mode data for the consolidated agent-detail
 * page (SPEC-03, W3). DEV-only; never ships (gated by the `fixtureMode` flag in
 * agentDetail.service.ts, which lazy-imports this module only when DEV +
 * VITE_USE_FOUNDATION_FIXTURES).
 *
 * Keyed to the SAME agent ids as sensors.fixtures / telemetry.fixtures so the
 * detail page composes end-to-end offline: `fixture-healthy` renders an all-green
 * header + vitals, `fixture-degraded` renders the composite-degraded header the
 * spec's research demands (health must never hide a failing dimension).
 */

import type { AgentCommandRow, AgentDetail, AgentEnrollmentAuditRow } from './agentDetail.service';

function detail(
  agentId: string,
  hostname: string,
  overrides: Partial<AgentDetail> = {},
): AgentDetail {
  return {
    agentId,
    hostname,
    platform: 'linux',
    osVersion: 'Ubuntu 22.04.4 LTS',
    agentVersion: '3.1.0',
    connectionStatus: 'ONLINE',
    lastSeen: new Date(Date.now() - 20_000).toISOString(),
    cpuUsage: null,
    memUsage: null,
    diskUsage: null,
    collectorType: 'agent',
    mode: null,
    bundleVersion: '2026.09.1',
    ip: '10.20.30.41',
    mac: '02:42:0a:14:1e:29',
    ...overrides,
  };
}

const FIXTURE_AGENTS: Record<string, AgentDetail> = {
  'fixture-healthy': detail('fixture-healthy', 'web-prod-01'),
  'fixture-degraded': detail('fixture-degraded', 'db-prod-02', {
    ip: '10.20.30.42',
    mac: '02:42:0a:14:1e:2a',
  }),
  'fixture-errored': detail('fixture-errored', 'app-prod-03', {
    ip: '10.20.30.43',
  }),
  'fixture-stale': detail('fixture-stale', 'edge-04', {
    connectionStatus: 'ONLINE',
    lastSeen: new Date(Date.now() - 3 * 60_000).toISOString(),
    ip: '10.20.30.44',
  }),
  'fixture-offline': detail('fixture-offline', 'branch-vpn-05', {
    connectionStatus: 'OFFLINE',
    lastSeen: new Date(Date.now() - 20 * 60_000).toISOString(),
    ip: '10.20.30.45',
  }),
  'fixture-novitals': detail('fixture-novitals', 'newly-enrolled-06', {
    agentVersion: '3.1.0',
    ip: null,
    mac: null,
  }),
};

/** Returns a fixture agent by id/hostname, or a healthy fallback for real-looking ids. */
export function getFixtureAgentDetail(agentId: string): AgentDetail | null {
  const key = agentId.toLowerCase();
  // Exact fixture-key match.
  const direct = Object.entries(FIXTURE_AGENTS).find(
    ([id, a]) => id === key || a.hostname.toLowerCase() === key,
  );
  if (direct) return direct[1];
  // Substring match on the state keyword (so `fixture-degraded-xyz` still resolves).
  for (const [id, a] of Object.entries(FIXTURE_AGENTS)) {
    const state = id.replace('fixture-', '');
    if (key.includes(state)) return a;
  }
  // Unknown but non-empty id → a healthy synthetic so real ids show something honest.
  if (key.trim()) return detail(agentId, agentId);
  return null;
}

/** Fixture enrollment-audit rows for the Audit tab. */
export function getFixtureEnrollmentAudit(agentUuid: string): AgentEnrollmentAuditRow[] {
  const base = Date.now();
  return [
    {
      id: 1,
      eventType: 'ENROLLED',
      agentId: agentUuid,
      agentUuid,
      actor: 'maya.chen',
      at: new Date(base - 6 * 86_400_000).toISOString(),
      detail: 'Agent enrolled with keyed provisioning token',
    },
    {
      id: 2,
      eventType: 'POLICY_APPLIED',
      agentId: agentUuid,
      agentUuid,
      actor: 'system',
      at: new Date(base - 5 * 86_400_000).toISOString(),
      detail: 'Baseline endpoint policy v3 applied',
    },
    {
      id: 3,
      eventType: 'KEY_ROTATED',
      agentId: agentUuid,
      agentUuid,
      actor: 'system',
      at: new Date(base - 1 * 86_400_000).toISOString(),
      detail: 'Agent connection key rotated on schedule',
    },
  ];
}

/**
 * Fixture command-history rows for the Commands tab (SPEC-07 W6 6.1). Covers every
 * CommandStatus state so the tab renders Pending/Running/Completed/Failed offline.
 * Keyed to the agent's id so filtering by agentId returns them.
 */
export function getFixtureAgentCommands(agentId: string): AgentCommandRow[] {
  const base = Date.now();
  const id = agentId.trim() || 'fixture-healthy';
  return [
    {
      cmdId: 'cmd-1001',
      agentId: id,
      command: 'isolate-host',
      status: 'COMPLETED',
      result: 'Host isolated; network access restricted to HiveArmor console.',
      issuedBy: 'maya.chen',
      issuedAt: new Date(base - 90 * 60_000).toISOString(),
      updatedAt: new Date(base - 89 * 60_000).toISOString(),
      reason: 'Suspected lateral movement — INC-4821',
    },
    {
      cmdId: 'cmd-1002',
      agentId: id,
      command: 'collect-artifacts',
      status: 'RUNNING',
      result: null,
      issuedBy: 'maya.chen',
      issuedAt: new Date(base - 8 * 60_000).toISOString(),
      updatedAt: new Date(base - 6 * 60_000).toISOString(),
      reason: 'Evidence collection for INC-4821',
    },
    {
      cmdId: 'cmd-1003',
      agentId: id,
      command: 'kill-process',
      status: 'FAILED',
      result: 'Process not found (already exited).',
      issuedBy: 'sam.rivera',
      issuedAt: new Date(base - 4 * 60_000).toISOString(),
      updatedAt: new Date(base - 3 * 60_000).toISOString(),
      reason: 'Terminate suspicious binary',
    },
    {
      cmdId: 'cmd-1004',
      agentId: id,
      command: 'update-policy',
      status: 'PENDING',
      result: null,
      issuedBy: 'system',
      issuedAt: new Date(base - 1 * 60_000).toISOString(),
      updatedAt: null,
      reason: null,
    },
  ];
}
