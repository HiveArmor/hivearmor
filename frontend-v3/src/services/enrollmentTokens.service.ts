/**
 * enrollmentTokens.service — admin management of agent enrollment tokens
 * (SPEC-07 W6 6.3). Wraps the verified backend surface:
 *
 *   GET  /api/ha-agent-enrollments               → list tokens (tenant-scoped)   [EXISTS]
 *   POST /api/ha-agent-enrollments/{id}/revoke    → revoke a token                [EXISTS]
 *
 * (ADMIN / SOC_MANAGER; tenant forced server-side — a missing tenant returns 400.)
 * Secrets are NEVER returned by the list endpoint; nothing here echoes a token
 * value. All requests route through the shared apiClient (JWT + X-Tenant-ID).
 */

import { apiClient } from '@/lib/apiClient';

const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export type EnrollmentTokenStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'UNKNOWN';

/** One enrollment token row (mirrors EnrollmentTokenDTO; NO secret value). */
export interface EnrollmentTokenRow {
  id: string;
  tenantId: number;
  policyId: string | null;
  platform: string | null;
  expiresAt: string | null;
  maxUses: number;
  useCount: number;
  createdAt: string | null;
  createdBy: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  status: EnrollmentTokenStatus;
  /** Optimistic-concurrency version — echoed back as expectedVersion on revoke. */
  version: number;
}

interface EnrollmentTokenWire {
  id?: string;
  tenantId?: number;
  policyId?: string | null;
  platform?: string | null;
  expiresAt?: string | null;
  maxUses?: number;
  useCount?: number;
  createdAt?: string | null;
  createdBy?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  status?: string | null;
  version?: number;
}

function normalizeTokenStatus(raw: string | null | undefined): EnrollmentTokenStatus {
  const value = (raw ?? '').toUpperCase();
  if (value === 'ACTIVE') return 'ACTIVE';
  if (value === 'EXPIRED') return 'EXPIRED';
  if (value === 'REVOKED') return 'REVOKED';
  if (value === 'EXHAUSTED') return 'EXHAUSTED';
  return 'UNKNOWN';
}

function adaptToken(wire: EnrollmentTokenWire): EnrollmentTokenRow {
  return {
    id: (wire.id ?? '').toString(),
    tenantId: wire.tenantId ?? 0,
    policyId: wire.policyId ?? null,
    platform: wire.platform ?? null,
    expiresAt: wire.expiresAt ?? null,
    maxUses: wire.maxUses ?? 0,
    useCount: wire.useCount ?? 0,
    createdAt: wire.createdAt ?? null,
    createdBy: wire.createdBy ?? null,
    lastUsedAt: wire.lastUsedAt ?? null,
    revokedAt: wire.revokedAt ?? null,
    revokedBy: wire.revokedBy ?? null,
    revocationReason: wire.revocationReason ?? null,
    status: normalizeTokenStatus(wire.status),
    version: wire.version ?? 0,
  };
}

/** Lists enrollment tokens for the current tenant, newest-first. */
export async function listEnrollmentTokens(signal?: AbortSignal): Promise<EnrollmentTokenRow[]> {
  if (fixtureMode) {
    const { getFixtureEnrollmentTokens } = await import('./enrollmentTokens.fixtures');
    return getFixtureEnrollmentTokens();
  }
  const rows = await apiClient.get<EnrollmentTokenWire[]>('/ha-agent-enrollments', {
    params: { page: 0, size: 100 },
    signal,
  });
  const adapted = (Array.isArray(rows) ? rows : []).map(adaptToken);
  adapted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return adapted;
}

/**
 * Revokes an enrollment token, with a required reason (audited server-side) and
 * the token's optimistic-concurrency version. The reason is metadata, never a
 * secret. Returns the updated token.
 */
export async function revokeEnrollmentToken(
  token: EnrollmentTokenRow,
  reason: string,
  signal?: AbortSignal,
): Promise<EnrollmentTokenRow> {
  if (fixtureMode) {
    return { ...token, status: 'REVOKED', revocationReason: reason, revokedAt: new Date().toISOString() };
  }
  const wire = await apiClient.post<EnrollmentTokenWire>(
    `/ha-agent-enrollments/${encodeURIComponent(token.id)}/revoke`,
    { reason, expectedVersion: token.version },
    { signal },
  );
  return adaptToken(wire);
}
