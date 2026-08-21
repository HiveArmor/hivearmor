import type {
  AdAssessmentCategory,
  AdAssessmentDTO,
  AdDomainSummaryDTO,
  AdInfrastructureDTO,
  AdPostureFilters,
  AdPosturePage,
  AdRiskLevel,
  AdTrackerEventDTO,
} from '@/types/active-directory.types';

const NOW = Date.parse('2026-08-03T13:16:18Z');
const DOMAIN_NAMES = ['northstar.corp', 'payments.northstar.corp', 'legacy-emea.corp'];
const riskLevels: AdRiskLevel[] = ['critical', 'high', 'medium', 'low'];
const categories: AdAssessmentCategory[] = ['identity_infrastructure', 'accounts', 'group_policy', 'certificates', 'hybrid_security', 'trusts'];

const assessmentTemplates = [
  ['Unsecure domain configurations enable credential downgrade', 'Legacy authentication and signing controls increase credential theft and relay exposure.'],
  ['Service accounts retain nested Tier-0 membership', 'Non-human identities inherit domain-level privilege through nested security groups.'],
  ['Dormant sensitive accounts remain enabled', 'Inactive privileged identities preserve a quiet route into sensitive resources.'],
  ['Certificate templates permit subject-controlled enrollment', 'An enrollment path can mint authentication certificates for another principal.'],
  ['Group Policy grants broad local administrator access', 'A linked policy expands administrative reach across production workstations.'],
  ['External trust lacks selective authentication', 'The trust permits a wider authentication surface than the documented business requirement.'],
  ['Domain controllers are missing identity sensor coverage', 'Directory activity is only partially observed and lowers investigation confidence.'],
  ['Privileged accounts permit legacy authentication', 'High-value identities can authenticate without modern phishing-resistant controls.'],
];

function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

const domains: AdDomainSummaryDTO[] = DOMAIN_NAMES.map((domainName, index) => ({
  id: `domain-${index + 1}`,
  domainName,
  forestName: index === 2 ? 'legacy-emea.corp' : 'northstar.corp',
  netbiosName: index === 0 ? 'NORTHSTAR' : index === 1 ? 'PAYMENTS' : 'LEGACYEMEA',
  functionalLevel: index === 2 ? 'Windows Server 2012 R2' : 'Windows Server 2019',
  health: index === 0 ? 'degraded' : index === 1 ? 'healthy' : 'critical',
  postureScore: [67, 83, 41][index],
  domainControllerCount: [4, 2, 3][index],
  monitoredControllerCount: [3, 2, 1][index],
  replicationLagSeconds: [92, 8, 840][index],
  trustCount: [3, 1, 2][index],
  tierZeroPathCount: [12, 3, 18][index],
  criticalAssessmentCount: [4, 1, 7][index],
  lastObservedAt: ago(index * 21 + 2),
  domainControllers: Array.from({ length: [4, 2, 3][index] }, (_, dc) => ({
    id: `dc-${index}-${dc}`,
    hostname: `${index === 2 ? 'EMEA' : index === 1 ? 'PAY' : 'NS'}-DC-${String(dc + 1).padStart(2, '0')}`,
    ipAddress: `10.${40 + index}.${dc + 1}.10`,
    site: dc % 2 ? 'DR-Site' : 'Primary-Site',
    operatingSystem: index === 2 ? 'Windows Server 2012 R2' : 'Windows Server 2022',
    roles: dc === 0 ? ['PDC Emulator', 'RID Master'] : ['Global Catalog'],
    health: dc === 2 || (index === 2 && dc === 0) ? 'critical' : dc === 1 && index === 0 ? 'degraded' : 'healthy',
    sensorState: index === 2 && dc > 0 ? 'critical' : dc === 2 ? 'unknown' : 'healthy',
    replicationLagSeconds: dc === 2 ? 840 : dc === 1 ? 92 : 8,
    lastObservedAt: ago(dc * 13 + 2),
  })),
  trusts: Array.from({ length: [3, 1, 2][index] }, (_, trust) => ({
    id: `trust-${index}-${trust}`,
    sourceDomain: domainName,
    targetDomain: trust === 0 ? 'partners.example.invalid' : DOMAIN_NAMES[(index + trust) % DOMAIN_NAMES.length],
    type: trust === 0 ? 'external' : 'parent_child',
    direction: trust === 0 ? 'bidirectional' : 'outbound',
    transitive: trust !== 0,
    selectiveAuthentication: trust !== 0,
    sidFiltering: trust !== 0,
    riskLevel: trust === 0 ? 'high' : 'low',
    riskReason: trust === 0 ? 'Selective authentication and SID filtering are not enforced.' : 'Expected managed forest relationship.',
  })),
}));

const assessments: AdAssessmentDTO[] = Array.from({ length: 78 }, (_, index) => {
  const template = assessmentTemplates[index % assessmentTemplates.length];
  const domain = domains[index % domains.length];
  const riskLevel = riskLevels[(index * 7) % riskLevels.length];
  return {
    id: `assessment-${String(index + 1).padStart(4, '0')}`,
    title: `${template[0]}${index >= assessmentTemplates.length ? ` · ${index + 1}` : ''}`,
    summary: template[1],
    category: categories[index % categories.length],
    riskLevel,
    state: index % 11 === 0 ? 'planned' : index % 17 === 0 ? 'accepted' : 'open',
    domainId: domain.id,
    domainName: domain.domainName,
    exposedEntityCount: 2 + ((index * 11) % 47),
    scoreImpact: 3 + ((index * 5) % 16),
    attackTechniques: index % 2 ? ['T1484.001', 'T1098'] : ['T1558.003', 'T1003.006'],
    evidence: [
      { id: `evidence-${index}-1`, label: 'Directory configuration', value: index % 2 ? 'Policy exception observed' : 'Control not enforced', source: 'Directory sensor', observedAt: ago(index * 9 + 4) },
      { id: `evidence-${index}-2`, label: 'Affected scope', value: `${2 + ((index * 11) % 47)} directory objects`, source: 'Exposure graph', observedAt: ago(index * 9 + 7) },
    ],
    affectedEntities: Array.from({ length: 3 }, (_, entity) => ({ id: `ad-entity-${index}-${entity}`, name: entity === 0 ? 'Domain Admins' : entity === 1 ? `svc-backup-${index % 9}` : `${domain.netbiosName}-DC-01`, type: entity === 0 ? 'group' : entity === 1 ? 'user' : 'computer', criticality: entity < 2 ? 'tier_0' : 'sensitive', path: entity === 1 ? 'Account → nested group → Domain Admins' : undefined })),
    recommendation: 'Validate the exposed objects, confirm the operational dependency, then apply the least-disruptive hardening change through governed response.',
    owner: index % 4 === 0 ? null : ['Identity Engineering', 'Platform Security', 'PKI Operations'][index % 3],
    dueAt: index % 5 === 0 ? ago(-14_400) : null,
    firstDetectedAt: ago(43_200 + index * 31),
    lastEvaluatedAt: ago(index * 9 + 4),
  };
});

const changes: AdTrackerEventDTO[] = Array.from({ length: 126 }, (_, index) => {
  const domain = domains[index % domains.length];
  const actions = ['Member added to privileged group', 'User account control changed', 'Group Policy link modified', 'Certificate template modified', 'Trust configuration changed', 'Computer account created'];
  const riskLevel = riskLevels[(index * 5) % riskLevels.length];
  return {
    id: `change-${String(index + 1).padStart(4, '0')}`,
    occurredAt: ago(index * 19 + 3),
    ingestedAt: ago(index * 19 + 1),
    domainId: domain.id,
    domainName: domain.domainName,
    actor: index % 7 === 0 ? 'svc-directory-sync' : ['maya.chen', 'omar.haddad', 'james.okafor'][index % 3],
    actorType: index % 7 === 0 ? 'service' : 'user',
    action: actions[index % actions.length],
    target: index % 3 === 0 ? 'Domain Admins' : index % 3 === 1 ? `svc-payments-${index % 8}` : 'Workstation Baseline GPO',
    targetType: index % 3 === 0 ? 'group' : index % 3 === 1 ? 'user' : 'policy',
    riskLevel,
    authorized: index % 9 === 0 ? null : index % 5 !== 0,
    source: 'Directory sensor',
    evidenceCount: 1 + (index % 6),
    description: 'A normalized directory change was correlated with actor, target, authorization context, and the current identity exposure graph.',
  };
});

const infrastructure: AdInfrastructureDTO[] = domains.flatMap((domain, index) => [
  ...domain.domainControllers.map((dc) => ({ id: dc.id, name: dc.hostname, domainId: domain.id, domainName: domain.domainName, role: 'domain_controller' as const, health: dc.health, monitoringState: dc.sensorState === 'healthy' ? 'monitored' as const : dc.sensorState === 'unknown' ? 'unmonitored' as const : 'partial' as const, version: dc.operatingSystem, issueCount: dc.health === 'healthy' ? 0 : dc.health === 'degraded' ? 2 : 5, lastObservedAt: dc.lastObservedAt })),
  { id: `adcs-${index}`, name: `${domain.netbiosName}-CA-01`, domainId: domain.id, domainName: domain.domainName, role: 'ad_cs' as const, health: index === 1 ? 'healthy' as const : 'degraded' as const, monitoringState: index === 2 ? 'unmonitored' as const : 'monitored' as const, version: 'AD CS 2022', issueCount: index === 1 ? 0 : 3, lastObservedAt: ago(index * 22 + 5) },
  { id: `sync-${index}`, name: `${domain.netbiosName}-SYNC-01`, domainId: domain.id, domainName: domain.domainName, role: 'entra_connect' as const, health: index === 0 ? 'degraded' as const : 'healthy' as const, monitoringState: index === 2 ? 'partial' as const : 'monitored' as const, version: 'Entra Connect 2.4', issueCount: index === 0 ? 2 : 0, lastObservedAt: ago(index * 18 + 4) },
]);

function cursorOffset(cursor?: string | null): number {
  if (!cursor) return 0;
  const value = Number(cursor.replace('ad-fixture-', ''));
  return Number.isFinite(value) ? value : 0;
}

export function getFoundationAdPosture(filters: AdPostureFilters, signal?: AbortSignal): AdPosturePage {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const source = filters.view === 'assessments'
    ? [...assessments].sort((left, right) => riskLevels.indexOf(left.riskLevel) - riskLevels.indexOf(right.riskLevel) || right.scoreImpact - left.scoreImpact)
    : filters.view === 'domains' ? domains : filters.view === 'changes' ? changes : infrastructure;
  const query = filters.query?.toLowerCase();
  const filtered = source.filter((item) => {
    const record = item as unknown as Record<string, unknown>;
    if (filters.domain && record.domainId !== filters.domain && record.id !== filters.domain) return false;
    if (filters.risk !== 'all' && record.riskLevel !== filters.risk) return false;
    if (filters.category !== 'all' && record.category !== filters.category) return false;
    return !query || JSON.stringify(item).toLowerCase().includes(query);
  });
  const offset = cursorOffset(filters.cursor);
  const items = filtered.slice(offset, offset + filters.limit);
  return {
    items,
    cursor: offset + filters.limit < filtered.length ? `ad-fixture-${offset + filters.limit}` : null,
    total: filtered.length,
    domains: domains.map((domain) => ({ value: domain.id, label: domain.domainName })),
    summary: { postureScore: 64, criticalAssessments: 12, tierZeroPaths: 33, riskyChanges24h: 18, unhealthySensors: 4, replicationIssues: 3 },
    snapshotAt: new Date(NOW).toISOString(),
    contractState: 'complete',
    partialFailures: [],
  };
}
