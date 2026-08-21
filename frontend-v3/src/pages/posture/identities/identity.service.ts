import type {
  IdentityAuthStrength,
  IdentityKind,
  IdentityPostureFilters,
  IdentityPostureItem,
  IdentityPosturePage,
  IdentityPosturePreview,
  IdentityPrivilege,
  IdentityRiskLevel,
  IdentityRiskTrend,
} from './identity.types';

import { apiClient } from '@/lib/apiClient';

export const identityFixtureMode = import.meta.env.DEV
  && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

interface EntityItem {
  id: string;
  type: string;
  value: string;
  displayName?: string | null;
  riskScore?: number;
  riskLevel?: string;
  riskTrend?: string;
  alertCount?: number;
  lastSeen?: string;
  firstSeen?: string;
  observationSources?: string[];
  tags?: string[];
  pivots?: Array<{ type: string; label: string; route: string }>;
}

interface EntityListEnvelope {
  items: EntityItem[];
  cursor: string | null;
  total: number;
}

interface EntitySummaryEnvelope {
  summary: {
    total: number;
    highRisk: number;
    rising: number;
    activeAlerts: number;
    newEntities24h: number;
  };
}

interface EntityPreviewEnvelope {
  entity: EntityItem & {
    activitySummary?: { last24h: number; last7d: number; avgDaily: number };
    alertSummary?: { active: number; total30d: number; highestSeverity: string };
  };
}

function riskLevel(score = 0, value?: string): IdentityRiskLevel {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') return value;
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function riskTrend(value?: string): IdentityRiskTrend {
  if (value === 'rising' || value === 'declining' || value === 'new') return value;
  return 'stable';
}

function inferSafeKind(tags: string[]): IdentityKind {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.includes('service-account')) return 'service';
  if (normalized.includes('workload-identity')) return 'workload';
  if (normalized.includes('guest')) return 'guest';
  return 'human';
}

function inferSafePrivilege(tags: string[]): IdentityPrivilege {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.includes('tier-0')) return 'tier_0';
  if (normalized.includes('privileged')) return 'privileged';
  return 'unknown';
}

function mapEntity(item: EntityItem): IdentityPostureItem {
  const tags = item.tags ?? [];
  const score = item.riskScore ?? 0;
  return {
    id: item.id,
    value: item.value,
    displayName: item.displayName || item.value,
    kind: inferSafeKind(tags),
    riskScore: score,
    riskLevel: riskLevel(score, item.riskLevel),
    riskTrend: riskTrend(item.riskTrend),
    privilege: inferSafePrivilege(tags),
    authStrength: 'unknown',
    accountState: 'unknown',
    controlState: 'unknown',
    alertCount: item.alertCount ?? 0,
    lastSeen: item.lastSeen ?? '',
    firstSeen: item.firstSeen ?? item.lastSeen ?? '',
    tenantName: null,
    department: null,
    observationSources: item.observationSources ?? [],
    tags,
    pivots: (item.pivots ?? []).flatMap((pivot) => {
      if (pivot.type !== 'dossier' && pivot.type !== 'hunt' && pivot.type !== 'alerts' && pivot.type !== 'incidents') return [];
      return [{ type: pivot.type, label: pivot.label, route: pivot.route }];
    }),
  };
}

function toEntityParams(filters: IdentityPostureFilters): Record<string, string | number | boolean | undefined> {
  const riskLevels = filters.risk !== 'all'
    ? filters.risk
    : filters.view === 'high_risk' ? 'critical,high' : undefined;
  return {
    types: 'user',
    riskLevels,
    sort: filters.sort === 'activity_desc' ? 'last_seen_desc' : filters.sort === 'alerts_desc' ? 'alert_count_desc' : filters.sort,
    cursor: filters.cursor ?? undefined,
    limit: filters.limit,
    q: filters.query,
  };
}

export async function fetchIdentityPosture(
  filters: IdentityPostureFilters,
  signal?: AbortSignal,
): Promise<IdentityPosturePage> {
  if (identityFixtureMode) {
    const { getFoundationIdentityPage } = await import('./identities.fixtures');
    return getFoundationIdentityPage(filters, signal);
  }

  const params = toEntityParams(filters);
  const [list, summary] = await Promise.all([
    apiClient.get<EntityListEnvelope>('/ha-entities', { params, signal }),
    apiClient.get<EntitySummaryEnvelope>('/ha-entities/summary', {
      params: { types: 'user', riskLevels: params.riskLevels, q: params.q },
      signal,
    }),
  ]);

  return {
    items: list.items.map(mapEntity),
    cursor: list.cursor,
    total: list.total,
    summary: {
      total: summary.summary.total,
      highRisk: summary.summary.highRisk,
      privileged: null,
      nonHuman: null,
      controlGaps: null,
      stale: null,
    },
    snapshotAt: null,
    contractState: 'partial',
    partialFailures: [{
      source: 'identity-posture',
      message: 'Authentication, privilege, credential, workload identity, and remediation projections are not yet available from the canonical entity API.',
    }],
  };
}

export async function fetchIdentityPreview(
  item: IdentityPostureItem,
  signal?: AbortSignal,
): Promise<IdentityPosturePreview> {
  if (identityFixtureMode) {
    const { getFoundationIdentityPreview } = await import('./identities.fixtures');
    return getFoundationIdentityPreview(item.id, signal);
  }

  const response = await apiClient.get<EntityPreviewEnvelope>(
    `/ha-entities/${encodeURIComponent(item.id)}/preview`,
    { signal },
  );
  const normalized = mapEntity(response.entity);
  return {
    ...item,
    ...normalized,
    email: null,
    manager: null,
    jobTitle: null,
    riskCalculatedAt: null,
    activeSessions: null,
    riskySignIns30d: null,
    credentialExposure: 'unknown',
    mfaRegistered: null,
    passwordlessCapable: null,
    conditionalAccess: 'unknown',
    riskSignals: [],
    accessPaths: [],
    activity: [],
    intelligenceSummary: null,
    recommendedActions: [],
    permissions: { hunt: true, openDossier: true, requestRemediation: false },
    dataCompleteness: 'partial',
  };
}

export const identityFilterAvailability: Record<'kind' | 'auth' | 'posture', boolean> = {
  kind: identityFixtureMode,
  auth: identityFixtureMode,
  posture: identityFixtureMode,
};

export function identityKindLabel(value: IdentityKind): string {
  return value === 'unknown' ? 'Unknown' : value.charAt(0).toUpperCase() + value.slice(1);
}

export function identityAuthLabel(value: IdentityAuthStrength): string {
  if (value === 'phishing_resistant') return 'Phishing-resistant';
  if (value === 'single_factor') return 'Single factor';
  return value === 'mfa' ? 'MFA' : 'Unknown';
}
