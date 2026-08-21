import type {
  IdentityAccessPath,
  IdentityActivityItem,
  IdentityAuthStrength,
  IdentityControlState,
  IdentityKind,
  IdentityPostureFilters,
  IdentityPostureItem,
  IdentityPosturePage,
  IdentityPosturePreview,
  IdentityPrivilege,
  IdentityRiskLevel,
  IdentityRiskSignal,
} from './identity.types';

const FIXTURE_NOW = Date.parse('2026-08-03T13:16:18.000Z');
const people = ['sarah.chen', 'maya.chen', 'a.patel', 'omar.haddad', 'elena.rossi', 'james.okafor', 'priya.nair', 'marcus.cole'];
const services = ['svc-finance-prod', 'svc-backup', 'svc-identity-sync', 'svc-payments-api', 'svc-cloud-audit'];
const workloads = ['payments-api-prod', 'terraform-deployer', 'cloud-audit-reader', 'backup-orchestrator'];
const guests = ['partner-auditor', 'vendor-support', 'external-counsel'];
const departments = ['Finance Operations', 'Identity Security', 'Platform Engineering', 'Security Operations', 'Revenue Systems'];
const tenants = ['Northstar Finance', 'Meridian Health', 'Aegis Public Sector'];

function riskLevel(score: number): IdentityRiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function kindAt(index: number): IdentityKind {
  if (index % 11 === 0) return 'service';
  if (index % 13 === 0) return 'workload';
  if (index % 17 === 0) return 'guest';
  return 'human';
}

function nameAt(index: number, kind: IdentityKind): string {
  const values = kind === 'service' ? services : kind === 'workload' ? workloads : kind === 'guest' ? guests : people;
  const base = values[index % values.length];
  return index < values.length ? base : `${base}-${String(Math.floor(index / values.length) + 1).padStart(2, '0')}`;
}

const foundationIdentities: IdentityPostureItem[] = Array.from({ length: 186 }, (_, index) => {
  const kind = kindAt(index);
  const value = nameAt(index, kind);
  const score = Math.max(8, 97 - ((index * 17) % 91));
  const privilege: IdentityPrivilege = index % 19 === 0 ? 'tier_0' : index % 5 === 0 ? 'privileged' : 'standard';
  const authStrength: IdentityAuthStrength = index % 9 === 0 ? 'single_factor' : index % 4 === 0 ? 'phishing_resistant' : 'mfa';
  const controlState: IdentityControlState = authStrength === 'single_factor' || (privilege !== 'standard' && index % 3 === 0) ? 'exposed' : index % 6 === 0 ? 'attention' : 'protected';
  const lastSeen = new Date(FIXTURE_NOW - (index % 23 === 0 ? 52 : index % 43) * 86_400_000 - index * 19 * 60_000).toISOString();
  const tags = [kind !== 'human' ? `${kind}-identity` : 'employee', privilege === 'tier_0' ? 'tier-0' : privilege === 'privileged' ? 'privileged' : 'standard-access'];
  return {
    id: `identity-${kind}-${String(index + 1).padStart(5, '0')}`,
    value,
    displayName: kind === 'human' ? value.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : value,
    kind,
    riskScore: score,
    riskLevel: riskLevel(score),
    riskTrend: index % 10 === 0 ? 'new' : index % 4 === 0 ? 'rising' : index % 7 === 0 ? 'declining' : 'stable',
    privilege,
    authStrength,
    accountState: index % 41 === 0 ? 'locked' : index % 37 === 0 ? 'disabled' : 'active',
    controlState,
    alertCount: index % 8 === 0 ? 7 : index % 5,
    lastSeen,
    firstSeen: new Date(Date.parse(lastSeen) - (35 + index % 220) * 86_400_000).toISOString(),
    tenantName: tenants[index % tenants.length],
    department: kind === 'human' ? departments[index % departments.length] : 'Platform services',
    observationSources: ['Identity provider', ...(index % 2 ? ['Endpoint telemetry'] : []), ...(index % 3 ? ['Cloud audit'] : [])],
    tags,
    pivots: [
      { type: 'dossier', label: 'Open dossier', route: `/entities/${encodeURIComponent(`identity-${kind}-${String(index + 1).padStart(5, '0')}`)}` },
      { type: 'hunt', label: 'Hunt activity', route: `/search?query=${encodeURIComponent(`user.name:"${value}"`)}` },
      { type: 'alerts', label: 'View alerts', route: `/alerts?entity=${encodeURIComponent(value)}` },
      { type: 'incidents', label: 'View incidents', route: `/incidents?entity=${encodeURIComponent(value)}` },
    ],
  };
});

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 180);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Identity posture request cancelled', 'AbortError'));
    }, { once: true });
  });
}

function isStale(item: IdentityPostureItem): boolean {
  return FIXTURE_NOW - Date.parse(item.lastSeen) > 30 * 86_400_000;
}

function filteredItems(filters: IdentityPostureFilters): IdentityPostureItem[] {
  const needle = filters.query?.trim().toLowerCase();
  return foundationIdentities.filter((item) => {
    if (filters.view === 'high_risk' && item.riskScore < 60) return false;
    if (filters.view === 'privileged' && item.privilege === 'standard') return false;
    if (filters.view === 'non_human' && item.kind === 'human') return false;
    if (filters.view === 'control_gaps' && item.controlState === 'protected') return false;
    if (filters.view === 'stale' && !isStale(item)) return false;
    if (filters.kind && filters.kind !== 'all' && item.kind !== filters.kind) return false;
    if (filters.risk && filters.risk !== 'all' && item.riskLevel !== filters.risk) return false;
    if (filters.auth && filters.auth !== 'all' && item.authStrength !== filters.auth) return false;
    return !needle || [item.value, item.displayName, item.department, item.tenantName, ...item.tags]
      .some((value) => value?.toLowerCase().includes(needle));
  }).sort((left, right) => {
    if (filters.sort === 'activity_desc') return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
    if (filters.sort === 'alerts_desc') return right.alertCount - left.alertCount || right.riskScore - left.riskScore;
    if (filters.sort === 'name_asc') return left.displayName.localeCompare(right.displayName);
    return right.riskScore - left.riskScore || left.id.localeCompare(right.id);
  });
}

export async function getFoundationIdentityPage(filters: IdentityPostureFilters, signal?: AbortSignal): Promise<IdentityPosturePage> {
  await delay(signal);
  const filtered = filteredItems(filters);
  const offset = filters.cursor ? Number(filters.cursor.replace('identity-fixture-', '')) : 0;
  const items = filtered.slice(offset, offset + filters.limit);
  const next = offset + items.length;
  return {
    items,
    cursor: next < filtered.length ? `identity-fixture-${next}` : null,
    total: filtered.length,
    summary: {
      total: filtered.length,
      highRisk: filtered.filter((item) => item.riskScore >= 60).length,
      privileged: filtered.filter((item) => item.privilege !== 'standard').length,
      nonHuman: filtered.filter((item) => item.kind !== 'human').length,
      controlGaps: filtered.filter((item) => item.controlState !== 'protected').length,
      stale: filtered.filter(isStale).length,
    },
    snapshotAt: '2026-08-03T13:16:18.000Z',
    contractState: 'complete',
    partialFailures: [],
  };
}

function signals(item: IdentityPostureItem): IdentityRiskSignal[] {
  const observedAt = item.lastSeen;
  return [
    { id: 'credential', label: 'Credential exposure signal', description: 'Credential intelligence correlated this identity with a recently observed exposure.', severity: item.riskScore >= 80 ? 'critical' : 'high', contribution: 34, evidenceCount: 3, source: 'Credential intelligence', observedAt },
    { id: 'travel', label: 'Unfamiliar authentication sequence', description: 'Authentication originated from a device and network outside the established peer baseline.', severity: 'high', contribution: 25, evidenceCount: 8, source: 'Identity analytics', observedAt },
    { id: 'privilege', label: 'Privileged access expansion', description: 'Effective access increased through a nested role or group assignment in the observation window.', severity: 'medium', contribution: 17, evidenceCount: 4, source: 'Directory posture', observedAt },
  ];
}

function accessPaths(item: IdentityPostureItem): IdentityAccessPath[] {
  return [
    { id: 'role-1', label: item.privilege === 'tier_0' ? 'Global Administrator' : 'Finance Application Administrator', type: 'role', criticality: item.privilege === 'tier_0' ? 'critical' : 'high', inherited: false },
    { id: 'group-1', label: 'Production Operations', type: 'group', criticality: 'high', inherited: true },
    { id: 'resource-1', label: 'PAY-APP-07', type: 'resource', criticality: 'critical', inherited: true },
    { id: 'path-1', label: 'Identity → privileged group → production tenant', type: 'path', criticality: 'critical', inherited: true },
  ];
}

function activity(item: IdentityPostureItem): IdentityActivityItem[] {
  return [
    { id: 'evt-1', occurredAt: item.lastSeen, title: 'Risky sign-in correlated', detail: 'First-seen device · London, GB · conditional access evaluated', state: 'risk', source: 'Identity provider' },
    { id: 'evt-2', occurredAt: new Date(Date.parse(item.lastSeen) - 18 * 60_000).toISOString(), title: 'Privileged token issued', detail: 'Interactive session · phishing-resistant requirement not satisfied', state: 'risk', source: 'Cloud audit' },
    { id: 'evt-3', occurredAt: new Date(Date.parse(item.lastSeen) - 71 * 60_000).toISOString(), title: 'Managed endpoint authentication', detail: 'FIN-WKS-044 · device compliance confirmed', state: 'success', source: 'Endpoint telemetry' },
    { id: 'evt-4', occurredAt: new Date(Date.parse(item.lastSeen) - 4 * 60 * 60_000).toISOString(), title: 'Peer baseline recalculated', detail: '30-day cohort · Finance Operations', state: 'info', source: 'Behavior analytics' },
  ];
}

export async function getFoundationIdentityPreview(id: string, signal?: AbortSignal): Promise<IdentityPosturePreview> {
  await delay(signal);
  const item = foundationIdentities.find((candidate) => candidate.id === id) ?? foundationIdentities[0];
  return {
    ...item,
    email: item.kind === 'human' ? `${item.value}@example.invalid` : null,
    manager: item.kind === 'human' ? 'Maya Chen' : 'Platform Identity Team',
    jobTitle: item.kind === 'human' ? 'Senior Finance Analyst' : 'Non-human identity',
    riskCalculatedAt: '2026-08-03T13:16:18.000Z',
    activeSessions: 4,
    riskySignIns30d: 7,
    credentialExposure: item.riskScore >= 75 ? 'suspected' : 'none',
    mfaRegistered: item.authStrength !== 'single_factor',
    passwordlessCapable: item.authStrength === 'phishing_resistant',
    conditionalAccess: item.controlState === 'protected' ? 'enforced' : item.controlState === 'attention' ? 'partial' : 'missing',
    riskSignals: signals(item),
    accessPaths: accessPaths(item),
    activity: activity(item),
    intelligenceSummary: `${item.displayName} is prioritized because credential and authentication anomalies overlap with ${item.privilege === 'standard' ? 'sensitive application access' : 'privileged effective access'}. The recent session originated outside the established device and network baseline. Review the sign-in, validate the owner, and preview session revocation before any disruptive action.`,
    recommendedActions: ['Validate the recent sign-in with the identity owner', 'Review active sessions and effective privilege paths', 'Preview token revocation and step-up authentication', 'Preserve related identity and endpoint evidence'],
    permissions: { hunt: true, openDossier: true, requestRemediation: true },
    dataCompleteness: 'full',
  };
}
