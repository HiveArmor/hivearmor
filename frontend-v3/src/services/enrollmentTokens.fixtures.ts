/**
 * enrollmentTokens.fixtures — DEV-only fixture rows for the Enrollment Keys page
 * (SPEC-07 W6 6.3). Covers active / expired / revoked token states so the page
 * renders every status offline. Never ships (gated by fixtureMode).
 */

import type { EnrollmentTokenRow } from './enrollmentTokens.service';

import type { AgentKeyListItemDTO } from '@/types/agentProvisioning.types';

export function getFixtureEnrollmentTokens(): EnrollmentTokenRow[] {
  const now = Date.now();
  return [
    {
      id: 'enr-tok-01',
      tenantId: 1,
      policyId: 'baseline-edr',
      platform: 'linux',
      expiresAt: new Date(now + 20 * 3_600_000).toISOString(),
      maxUses: 10,
      useCount: 3,
      createdAt: new Date(now - 6 * 3_600_000).toISOString(),
      createdBy: 'maya.chen',
      lastUsedAt: new Date(now - 40 * 60_000).toISOString(),
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      status: 'ACTIVE',
      version: 4,
    },
    {
      id: 'enr-tok-02',
      tenantId: 1,
      policyId: 'workstation-edr',
      platform: 'windows',
      expiresAt: new Date(now - 2 * 3_600_000).toISOString(),
      maxUses: 5,
      useCount: 5,
      createdAt: new Date(now - 3 * 86_400_000).toISOString(),
      createdBy: 'sam.rivera',
      lastUsedAt: new Date(now - 26 * 3_600_000).toISOString(),
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      status: 'EXPIRED',
      version: 6,
    },
    {
      id: 'enr-tok-03',
      tenantId: 1,
      policyId: null,
      platform: 'macos',
      expiresAt: new Date(now + 48 * 3_600_000).toISOString(),
      maxUses: 1,
      useCount: 0,
      createdAt: new Date(now - 5 * 86_400_000).toISOString(),
      createdBy: 'maya.chen',
      lastUsedAt: null,
      revokedAt: new Date(now - 4 * 86_400_000).toISOString(),
      revokedBy: 'maya.chen',
      revocationReason: 'Issued to the wrong platform',
      status: 'REVOKED',
      version: 2,
    },
  ];
}

/** Fixture provisioning keys (GET /ha-agent-keys) for the Enrollment Keys page. */
export function getFixtureAgentKeys(): AgentKeyListItemDTO[] {
  const now = Date.now();
  return [
    {
      id: 'key-01',
      alias: 'web-prod-01',
      mode: 'edr',
      expiresAt: new Date(now + 18 * 3_600_000).toISOString(),
      createdAt: new Date(now - 6 * 3_600_000).toISOString(),
      status: 'active',
    },
    {
      id: 'key-02',
      alias: 'db-prod-02',
      mode: 'log',
      expiresAt: new Date(now - 2 * 3_600_000).toISOString(),
      createdAt: new Date(now - 3 * 86_400_000).toISOString(),
      status: 'expired',
    },
  ];
}
