import type {
  EntityAlertDTO, EntityDetailDTO, EntityDTO, EntityEventDTO, EntityIncidentOption,
  EntityInventorySummary,
  EntityListFilters,
  EntityListResponse,
  EntityRiskLevel,
  EntityType,
} from '@/types/entity.types';

const namesByType: Record<EntityType, string[]> = {
  host: ['FIN-WKS-044', 'IDM-DC-02', 'PAY-APP-07', 'ENG-LT-118', 'OPS-JMP-03', 'HR-VDI-021'],
  user: ['sarah.chen', 'svc-backup', 'app-payments', 'a.patel', 'maya.chen', 'cloud-audit-reader'],
  ip: ['10.44.8.19', '172.22.4.7', '198.51.100.42', '10.44.10.32', '203.0.113.84', '192.0.2.77'],
  service: ['payments-api', 'identity-sync', 'backup-orchestrator', 'cloud-audit', 'dns-resolver', 'remote-support'],
  process: ['powershell.exe', 'lsass.exe', 'rundll32.exe', 'java', 'ssh', 'cloud-api'],
  cloud: ['prod-finance-subscription', 'payments-cluster', 'audit-project', 'identity-tenant', 'backup-vault', 'shared-vpc'],
  domain: ['cdn-update.example', 'login-cdn.example', 'api-partner.example', 'resolver.internal', 'remote-admin.example', 'telemetry.example'],
};

const tenants = [
  ['northstar', 'Northstar Finance'],
  ['meridian', 'Meridian Health'],
  ['aegis', 'Aegis Public Sector'],
] as const;

const sources = ['Endpoint', 'Identity', 'Firewall', 'Cloud audit', 'DNS', 'EDR'];
const typeCycle: EntityType[] = ['host', 'user', 'ip', 'service', 'host', 'user', 'cloud', 'process', 'domain'];

function riskLevel(score: number): EntityRiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

export const foundationEntities: EntityDTO[] = Array.from({ length: 238 }, (_, index) => {
  const entityType = typeCycle[index % typeCycle.length];
  const names = namesByType[entityType];
  const baseName = names[index % names.length];
  const suffix = index < names.length ? '' : `-${String(Math.floor(index / names.length) + 1).padStart(2, '0')}`;
  const name = `${baseName}${suffix}`;
  const riskScore = Math.max(4, 97 - ((index * 11) % 94));
  const previousRiskScore = Math.max(0, Math.min(100, riskScore + ((index % 5) - 2) * 6));
  const tenant = tenants[index % tenants.length];
  const lastSeen = new Date(Date.UTC(2026, 7, 3, 7, 46) - index * 13 * 60_000);
  const sourceCount = 1 + (index % 4);
  return {
    id: `entity-${entityType}-${String(index + 1).padStart(5, '0')}`,
    name,
    hostname: entityType === 'host' || entityType === 'user' ? name : undefined,
    ipAddress: entityType === 'ip' ? baseName : undefined,
    entityType,
    riskScore,
    riskLevel: riskLevel(riskScore),
    previousRiskScore,
    riskTrend: index % 9 === 0 ? 'new' : riskScore > previousRiskScore + 2 ? 'rising' : riskScore < previousRiskScore - 2 ? 'falling' : 'stable',
    baselineDeviation: Number((1.1 + (index % 17) * 0.37).toFixed(1)),
    criticality: index % 13 === 0 ? 'mission_critical' : index % 5 === 0 ? 'high' : 'standard',
    firstSeen: new Date(lastSeen.getTime() - (18 + index % 160) * 86_400_000).toISOString(),
    lastSeen: lastSeen.toISOString(),
    alertCount: index % 8 === 0 ? 7 : index % 5,
    incidentCount: index % 11 === 0 ? 2 : index % 7 === 0 ? 1 : 0,
    sourceCount,
    dataSources: sources.slice(index % 3, index % 3 + sourceCount),
    tenantId: tenant[0],
    tenantName: tenant[1],
    tags: index % 6 === 0 ? ['privileged', 'production'] : index % 4 === 0 ? ['internet-facing'] : [],
  };
});

function buildSummary(items: EntityDTO[]): EntityInventorySummary {
  return {
    totalApproximate: items.length,
    highRiskCount: items.filter((item) => item.riskScore >= 60).length,
    risingRiskCount: items.filter((item) => item.riskTrend === 'rising' || item.riskTrend === 'new').length,
    activeAlertCount: items.reduce((total, item) => total + item.alertCount, 0),
    recentlyObservedCount: items.filter((item) => Date.parse(item.lastSeen) >= Date.UTC(2026, 7, 2, 7, 46)).length,
  };
}

function withinWindow(item: EntityDTO, window: EntityListFilters['activityWindow']): boolean {
  const days = window === '24h' ? 1 : window === '7d' ? 7 : window === '90d' ? 90 : 30;
  return Date.parse(item.lastSeen) >= Date.UTC(2026, 7, 3, 7, 46) - days * 86_400_000;
}

export async function getFoundationEntities(
  filters: EntityListFilters,
  signal?: AbortSignal,
): Promise<EntityListResponse> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 220);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Entity request cancelled', 'AbortError'));
    }, { once: true });
  });

  const needle = filters.search?.trim().toLocaleLowerCase();
  let filtered = foundationEntities.filter((item) => {
    const types = filters.types?.length ? filters.types : filters.type ? [filters.type] : [];
    if (types.length && !types.includes(item.entityType)) return false;
    if (filters.riskLevels?.length && !filters.riskLevels.includes(item.riskLevel ?? riskLevel(item.riskScore))) return false;
    if (filters.riskMin !== undefined && item.riskScore < filters.riskMin) return false;
    if (filters.riskMax !== undefined && item.riskScore > filters.riskMax) return false;
    if (filters.tenantScope && filters.tenantScope !== 'authorized' && item.tenantId !== filters.tenantScope) return false;
    if (!withinWindow(item, filters.activityWindow)) return false;
    return !needle || [item.name, item.hostname, item.ipAddress, item.entityType, item.tenantName, ...(item.tags ?? [])]
      .some((value) => value?.toLocaleLowerCase().includes(needle));
  });

  filtered = filtered.sort((left, right) => {
    if (filters.sort === 'activity_desc') return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
    if (filters.sort === 'alerts_desc') return right.alertCount - left.alertCount || right.riskScore - left.riskScore;
    if (filters.sort === 'name_asc') return (left.name ?? left.id).localeCompare(right.name ?? right.id);
    return right.riskScore - left.riskScore || Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
  });

  const offset = filters.cursor ? Number(filters.cursor.replace('entity-fixture-', '')) : 0;
  const limit = filters.limit ?? 100;
  const items = filtered.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    nextCursor: nextOffset < filtered.length ? `entity-fixture-${nextOffset}` : null,
    hasMore: nextOffset < filtered.length,
    snapshotAt: '2026-08-03T07:46:18.000Z',
    totalApproximate: filtered.length,
    totalIsExact: true,
    summary: buildSummary(filtered),
    partialFailures: [],
    contractState: 'complete',
  };
}

function resolveFixtureEntity(id: string): EntityDTO {
  return foundationEntities.find((entity) => entity.id === id) ?? foundationEntities[0];
}

export function getFoundationEntityDetail(id: string): EntityDetailDTO {
  const entity = resolveFixtureEntity(id);
  const name = entity.name ?? entity.hostname ?? entity.ipAddress ?? entity.id;
  const related = foundationEntities
    .filter((candidate) => candidate.id !== entity.id && (candidate.tenantId === entity.tenantId || candidate.entityType !== entity.entityType))
    .slice(0, 9);
  const timeline = Array.from({ length: 30 }, (_, index) => {
    const wave = Math.round(Math.sin(index / 3) * 9);
    const score = Math.max(5, Math.min(100, (entity.previousRiskScore ?? entity.riskScore) - 12 + index + wave));
    return {
      timestamp: new Date(Date.UTC(2026, 6, 5 + index, 7, 46)).toISOString(),
      score,
      reason: index === 20 ? 'First-seen privileged authentication pattern' : index === 26 ? 'Related high-confidence endpoint alert' : undefined,
    };
  });

  return {
    id: entity.id,
    name,
    entityType: entity.entityType,
    riskScore: entity.riskScore,
    previousRiskScore: entity.previousRiskScore,
    riskLevel: entity.riskLevel,
    riskTrend: entity.riskTrend,
    criticality: entity.criticality,
    baselineDeviation: entity.baselineDeviation,
    firstSeen: entity.firstSeen,
    lastSeen: entity.lastSeen,
    alertCount: entity.alertCount,
    incidentCount: entity.incidentCount,
    anomalyCount: 8 + (Number(entity.id.slice(-2)) % 17),
    tenantId: entity.tenantId,
    tenantName: entity.tenantName,
    department: entity.entityType === 'user' ? 'Finance Operations' : entity.entityType === 'host' ? 'Corporate endpoints' : 'Platform services',
    role: entity.entityType === 'user' ? 'Privileged analyst' : entity.entityType === 'host' ? 'Managed workstation' : 'Observed entity',
    status: 'active',
    watchlisted: entity.riskScore >= 85,
    riskCalculatedAt: '2026-08-03T07:46:18.000Z',
    riskValidUntil: '2026-08-03T08:01:18.000Z',
    tags: entity.tags,
    riskDrivers: [
      { id: 'unusual-access', label: 'Unusual privileged access', description: 'Authentication activity was rare for this entity and peer group.', contribution: 31, source: 'Identity analytics', evidenceCount: 12 },
      { id: 'linked-endpoint', label: 'Linked endpoint execution', description: 'High-confidence process activity shares this identity and activity window.', contribution: 24, source: 'Endpoint analytics', evidenceCount: 7 },
      { id: 'new-infrastructure', label: 'New external infrastructure', description: 'The entity communicated with a destination not seen in the prior baseline.', contribution: 18, source: 'Network analytics', evidenceCount: 4 },
    ],
    baselineMetrics: [
      { id: 'auth', label: 'Authentication attempts', current: 42, baseline: 9, unit: 'per hour', direction: 'above' },
      { id: 'hosts', label: 'Distinct peer entities', current: 8, baseline: 3, unit: 'per day', direction: 'above' },
      { id: 'egress', label: 'Outbound destinations', current: 17, baseline: 6, unit: 'per day', direction: 'above' },
      { id: 'active-hours', label: 'Activity outside baseline', current: 3.4, baseline: 0.6, unit: 'hours', direction: 'above' },
    ],
    dataSources: [
      { id: 'endpoint', label: 'Endpoint telemetry', status: 'healthy', lastIngestedAt: '2026-08-03T07:45:58.000Z' },
      { id: 'identity', label: 'Identity provider', status: 'healthy', lastIngestedAt: '2026-08-03T07:45:41.000Z' },
      { id: 'network', label: 'Network security', status: 'degraded', lastIngestedAt: '2026-08-03T07:41:11.000Z' },
    ],
    topAttackTechniques: [
      { id: 'T1078', name: 'Valid Accounts', count: 12 },
      { id: 'T1059.001', name: 'PowerShell', count: 7 },
      { id: 'T1021.001', name: 'Remote Desktop Protocol', count: 4 },
    ],
    associatedUsers: related.filter((item) => item.entityType === 'user').map((item) => item.name ?? item.id),
    associatedHosts: related.filter((item) => item.entityType === 'host').map((item) => item.name ?? item.id),
    relatedEntities: related.map((item, index) => ({
      id: item.id,
      type: item.entityType,
      label: item.name ?? item.id,
      relationship: index % 3 === 0 ? 'Authenticated to' : index % 3 === 1 ? 'Observed with' : 'Communicated with',
      firstSeen: item.firstSeen ?? item.lastSeen,
      lastSeen: item.lastSeen,
      eventCount: 4 + index * 3,
      riskScore: item.riskScore,
    })),
    riskTimeline: timeline,
    dataCompleteness: 'full',
    missingDataNotice: null,
    permissions: { hunt: true, attachToIncident: true, viewEvents: true, viewRelationships: true },
  };
}

export function getFoundationEntityAlerts(id: string): EntityAlertDTO[] {
  const entity = resolveFixtureEntity(id);
  const name = entity.name ?? entity.id;
  const titles = [
    'Rare privileged authentication followed by endpoint execution',
    'First-seen external destination contacted by managed asset',
    'Encoded PowerShell associated with elevated identity',
    'Lateral authentication outside normal peer group',
    'Unusual volume of failed authentication attempts',
  ];
  return Array.from({ length: 34 }, (_, index) => ({
    id: `ALT-ENT-${String(8210 - index).padStart(5, '0')}`,
    title: `${titles[index % titles.length]} · ${name}`,
    severity: index % 7 === 0 ? 9 : index % 3 === 0 ? 7 : 5,
    timestamp: new Date(Date.UTC(2026, 7, 3, 7, 35) - index * 71 * 60_000).toISOString(),
    status: index % 4 === 0 ? 'in_review' : index % 5 === 0 ? 'resolved' : 'open',
    category: index % 2 === 0 ? 'Identity' : 'Endpoint',
    ruleName: index % 2 === 0 ? 'Rare authentication sequence' : 'Suspicious execution chain',
    incidentId: index % 9 === 0 ? `INC-${4200 + index}` : null,
  }));
}

export function getFoundationEntityEvents(id: string): EntityEventDTO[] {
  const entity = resolveFixtureEntity(id);
  const name = entity.name ?? entity.id;
  const seeds = [
    ['critical', 'identity', 'authentication_success', 'Privileged authentication succeeded after a sequence of failures.'],
    ['high', 'endpoint', 'process_start', 'Encoded PowerShell was launched by a signed Windows utility.'],
    ['medium', 'network', 'connection_allowed', 'A first-seen outbound TLS destination was contacted.'],
    ['low', 'identity', 'session_refresh', 'Existing managed session refreshed within normal policy.'],
  ] as const;
  return Array.from({ length: 160 }, (_, index) => {
    const seed = seeds[index % seeds.length];
    return {
      id: `EVT-ENTITY-${String(9000 - index).padStart(6, '0')}`,
      timestamp: new Date(Date.UTC(2026, 7, 3, 7, 42) - index * 17 * 60_000).toISOString(),
      source: seed[1],
      severity: seed[0],
      category: seed[1],
      action: seed[2],
      message: seed[3],
      host: entity.entityType === 'host' ? name : `FIN-WKS-${String(44 + index % 5).padStart(3, '0')}`,
      user: entity.entityType === 'user' ? name : ['sarah.chen', 'svc-backup', 'maya.chen'][index % 3],
      sourceIp: `10.44.${8 + index % 12}.${19 + index % 180}`,
      alertCount: index % 11 === 0 ? 2 : index % 7 === 0 ? 1 : 0,
    };
  });
}

export function getFoundationEntityIncidentOptions(): EntityIncidentOption[] {
  return [
    { id: '4821', title: 'Privileged identity activity on finance workstation', severity: 'Critical', status: 'Investigating', entityAlreadyLinked: false },
    { id: '4817', title: 'First-seen infrastructure contacted by managed endpoint', severity: 'High', status: 'Open', entityAlreadyLinked: false },
    { id: '4802', title: 'Lateral authentication outside approved peer group', severity: 'High', status: 'Investigating', entityAlreadyLinked: true },
  ];
}
