import type {
  AttackPathDTO,
  ChokePointDTO,
  CriticalAssetExposureDTO,
  ExposureFilters,
  ExposurePageDTO,
  ExposureRemediationDTO,
  ExposureRisk,
  ExposureRow,
} from '@/types/exposure.types';

const observed = '2026-08-12T07:58:00.000Z';

const paths: AttackPathDTO[] = [
  {
    id: 'path-001', title: 'Internet-facing VPN reaches Tier-0 directory services', summary: 'An externally reachable VPN gateway with a verified authentication weakness can pivot through a privileged support identity to the primary domain controller.', riskLevel: 'critical', riskScore: 96, state: 'active', scope: 'hybrid',
    entryPoint: { id: 'ip-203-0-113-18', name: '203.0.113.18', type: 'ip', criticality: 'standard' }, target: { id: 'host-idm-dc-02', name: 'IDM-DC-02', type: 'host', criticality: 'critical' },
    pathNodes: [{ id: 'ip-203-0-113-18', name: '203.0.113.18', type: 'ip', criticality: 'standard', relationship: 'Internet reachable' }, { id: 'svc-vpn', name: 'vpn.northstar.example', type: 'service', criticality: 'important', relationship: 'Exposes vulnerable service' }, { id: 'user-helpdesk', name: 'svc-helpdesk', type: 'identity', criticality: 'important', relationship: 'Credential can administer' }, { id: 'host-idm-dc-02', name: 'IDM-DC-02', type: 'host', criticality: 'critical', relationship: 'Controls domain' }],
    hopCount: 3, weakPointCount: 3, criticalAssetCount: 2, exploitability: 'verified', techniques: ['T1190', 'T1078', 'T1021.001'], owner: null, firstSeenAt: '2026-08-11T06:12:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-001', label: 'External reachability validated', value: 'TLS service responded from two independent probes.', source: 'External attack surface', observedAt: observed, confidence: 98 }, { id: 'ev-002', label: 'Privileged path confirmed', value: 'svc-helpdesk retains delegated rights over the domain controller OU.', source: 'Directory graph', observedAt: '2026-08-12T07:55:00.000Z', confidence: 94 }], recommendedAction: 'Restrict VPN exposure, patch the affected gateway, and remove standing directory privileges from svc-helpdesk.',
  },
  {
    id: 'path-002', title: 'Public workload identity reaches production secrets', summary: 'A public application role can assume a cross-account deployment role and read production secret material.', riskLevel: 'critical', riskScore: 93, state: 'active', scope: 'external',
    entryPoint: { id: 'app-payments', name: 'payments-api-21', type: 'application', criticality: 'important' }, target: { id: 'data-prod-secrets', name: 'prod-secrets-vault', type: 'data', criticality: 'critical' },
    pathNodes: [{ id: 'app-payments', name: 'payments-api-21', type: 'application', criticality: 'important', relationship: 'Public endpoint' }, { id: 'id-deploy', name: 'payments-deploy-role', type: 'identity', criticality: 'important', relationship: 'Assumes role' }, { id: 'cloud-prod', name: 'prod-finance-subscription', type: 'cloud', criticality: 'critical', relationship: 'Cross-account trust' }, { id: 'data-prod-secrets', name: 'prod-secrets-vault', type: 'data', criticality: 'critical', relationship: 'Reads secrets' }],
    hopCount: 3, weakPointCount: 2, criticalAssetCount: 2, exploitability: 'verified', techniques: ['T1190', 'T1552.005', 'T1098'], owner: 'Cloud Security', firstSeenAt: '2026-08-10T11:40:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-003', label: 'Public route observed', value: 'Application listener is reachable without a private gateway.', source: 'Cloud posture', observedAt: observed, confidence: 97 }, { id: 'ev-004', label: 'Effective permission', value: 'Role graph resolves secrets:GetValue on the production vault.', source: 'IAM graph', observedAt: observed, confidence: 96 }], recommendedAction: 'Remove the cross-account trust and replace the standing deployment role with workload-bound, least-privilege access.',
  },
  {
    id: 'path-003', title: 'Phishable administrator can control finance workloads', summary: 'A legacy authentication route and persistent admin role create a direct identity-to-cloud control path.', riskLevel: 'high', riskScore: 87, state: 'active', scope: 'hybrid',
    entryPoint: { id: 'user-a-patel', name: 'a.patel', type: 'identity', criticality: 'important' }, target: { id: 'cloud-finance', name: 'prod-finance-subscription', type: 'cloud', criticality: 'critical' },
    pathNodes: [{ id: 'user-a-patel', name: 'a.patel', type: 'identity', criticality: 'important', relationship: 'Legacy authentication allowed' }, { id: 'group-cloud-admin', name: 'Cloud Administrators', type: 'identity', criticality: 'critical', relationship: 'Standing membership' }, { id: 'cloud-finance', name: 'prod-finance-subscription', type: 'cloud', criticality: 'critical', relationship: 'Owner permission' }],
    hopCount: 2, weakPointCount: 2, criticalAssetCount: 1, exploitability: 'probable', techniques: ['T1078.004', 'T1098'], owner: 'Identity Security', firstSeenAt: '2026-08-09T09:30:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-005', label: 'Legacy sign-in permitted', value: 'Policy coverage excludes one registered client.', source: 'Identity provider', observedAt: observed, confidence: 86 }], recommendedAction: 'Block legacy authentication and convert the standing owner assignment to time-bound privileged access.',
  },
  {
    id: 'path-004', title: 'Exposed jump host reaches payment database', summary: 'A management port and reused service credential provide a short path to the payment datastore.', riskLevel: 'high', riskScore: 84, state: 'active', scope: 'external',
    entryPoint: { id: 'host-jump', name: 'OPS-JMP-03', type: 'host', criticality: 'important' }, target: { id: 'data-payment-db', name: 'payment-ledger-db', type: 'data', criticality: 'critical' },
    pathNodes: [{ id: 'host-jump', name: 'OPS-JMP-03', type: 'host', criticality: 'important', relationship: 'Internet-exposed SSH' }, { id: 'id-db-maint', name: 'svc-db-maint', type: 'identity', criticality: 'important', relationship: 'Credential present' }, { id: 'data-payment-db', name: 'payment-ledger-db', type: 'data', criticality: 'critical', relationship: 'Database admin' }],
    hopCount: 2, weakPointCount: 2, criticalAssetCount: 1, exploitability: 'verified', techniques: ['T1021.004', 'T1555', 'T1078'], owner: 'Platform Operations', firstSeenAt: '2026-08-08T15:10:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-006', label: 'Port reachable', value: 'TCP/22 confirmed from the internet.', source: 'External attack surface', observedAt: observed, confidence: 99 }], recommendedAction: 'Move SSH behind the authorized access proxy and rotate the shared database maintenance credential.',
  },
  {
    id: 'path-005', title: 'Endpoint local admin reaches backup service', summary: 'A shared local administrator credential enables lateral movement to the backup control plane.', riskLevel: 'high', riskScore: 79, state: 'accepted', scope: 'internal',
    entryPoint: { id: 'host-fin-044', name: 'FIN-WKS-044', type: 'host', criticality: 'important' }, target: { id: 'svc-backup', name: 'backup-control', type: 'service', criticality: 'critical' },
    pathNodes: [{ id: 'host-fin-044', name: 'FIN-WKS-044', type: 'host', criticality: 'important', relationship: 'Local admin token' }, { id: 'user-svc-backup', name: 'svc-backup', type: 'identity', criticality: 'important', relationship: 'Credential reuse' }, { id: 'svc-backup', name: 'backup-control', type: 'service', criticality: 'critical', relationship: 'Service administrator' }],
    hopCount: 2, weakPointCount: 1, criticalAssetCount: 1, exploitability: 'probable', techniques: ['T1078', 'T1021.002'], owner: 'Endpoint Engineering', firstSeenAt: '2026-08-06T12:00:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-007', label: 'Credential reuse suspected', value: 'Matching authentication pattern observed on 14 endpoints.', source: 'Endpoint telemetry', observedAt: observed, confidence: 78 }], recommendedAction: 'Rotate local administrator credentials per host and remove interactive sign-in from the backup service identity.',
  },
  {
    id: 'path-006', title: 'Partner trust reaches customer analytics', summary: 'An externally controlled identity can traverse a broad partner trust to a sensitive analytics workspace.', riskLevel: 'medium', riskScore: 65, state: 'active', scope: 'hybrid',
    entryPoint: { id: 'id-partner', name: 'partner-ops@example.net', type: 'identity', criticality: 'standard' }, target: { id: 'data-analytics', name: 'customer-analytics', type: 'data', criticality: 'critical' },
    pathNodes: [{ id: 'id-partner', name: 'partner-ops@example.net', type: 'identity', criticality: 'standard', relationship: 'Federated identity' }, { id: 'app-bi', name: 'bi-workspace', type: 'application', criticality: 'important', relationship: 'Contributor access' }, { id: 'data-analytics', name: 'customer-analytics', type: 'data', criticality: 'critical', relationship: 'Reads dataset' }],
    hopCount: 2, weakPointCount: 1, criticalAssetCount: 1, exploitability: 'unverified', techniques: ['T1199', 'T1078'], owner: null, firstSeenAt: '2026-08-07T07:45:00.000Z', lastCalculatedAt: observed,
    evidence: [{ id: 'ev-008', label: 'Federated access grant', value: 'Partner principal has contributor permission on the workspace.', source: 'SaaS posture', observedAt: observed, confidence: 72 }], recommendedAction: 'Review the partner trust, scope the principal to a dedicated workspace, and require phishing-resistant authentication.',
  },
];

const chokePoints: ChokePointDTO[] = [
  { id: 'choke-001', name: 'svc-helpdesk', entityType: 'identity', riskLevel: 'critical', riskScore: 95, pathCount: 11, criticalAssetCount: 4, reachableFromInternet: true, exposureDrivers: ['Standing directory privilege', 'VPN authentication path', 'Interactive sign-in'], affectedPathIds: ['path-001'], recommendedAction: 'Remove standing privilege and block interactive sign-in.', lastCalculatedAt: observed },
  { id: 'choke-002', name: 'payments-deploy-role', entityType: 'identity', riskLevel: 'critical', riskScore: 92, pathCount: 8, criticalAssetCount: 3, reachableFromInternet: true, exposureDrivers: ['Cross-account trust', 'Broad secrets access'], affectedPathIds: ['path-002'], recommendedAction: 'Constrain trust and apply workload identity conditions.', lastCalculatedAt: observed },
  { id: 'choke-003', name: 'Cloud Administrators', entityType: 'identity', riskLevel: 'high', riskScore: 86, pathCount: 7, criticalAssetCount: 3, reachableFromInternet: false, exposureDrivers: ['Standing membership', 'No activation boundary'], affectedPathIds: ['path-003'], recommendedAction: 'Convert standing membership to governed just-in-time access.', lastCalculatedAt: observed },
  { id: 'choke-004', name: 'OPS-JMP-03', entityType: 'host', riskLevel: 'high', riskScore: 83, pathCount: 6, criticalAssetCount: 2, reachableFromInternet: true, exposureDrivers: ['Public management port', 'Credential material'], affectedPathIds: ['path-004'], recommendedAction: 'Restrict management access and rotate exposed credentials.', lastCalculatedAt: observed },
  { id: 'choke-005', name: 'svc-backup', entityType: 'identity', riskLevel: 'high', riskScore: 77, pathCount: 5, criticalAssetCount: 2, reachableFromInternet: false, exposureDrivers: ['Credential reuse', 'Interactive sign-in'], affectedPathIds: ['path-005'], recommendedAction: 'Rotate per-system credentials and enforce service-only logon.', lastCalculatedAt: observed },
];

const criticalAssets: CriticalAssetExposureDTO[] = [
  { id: 'asset-001', name: 'IDM-DC-02', entityType: 'host', classification: 'Tier-0 domain controller', riskLevel: 'critical', riskScore: 96, pathCount: 12, shortestPathHops: 3, internetReachable: true, topEntryPoint: '203.0.113.18', owner: 'Identity Security', lastCalculatedAt: observed },
  { id: 'asset-002', name: 'prod-secrets-vault', entityType: 'data', classification: 'Production credential store', riskLevel: 'critical', riskScore: 93, pathCount: 8, shortestPathHops: 3, internetReachable: true, topEntryPoint: 'payments-api-21', owner: 'Cloud Security', lastCalculatedAt: observed },
  { id: 'asset-003', name: 'prod-finance-subscription', entityType: 'cloud', classification: 'Mission-critical cloud estate', riskLevel: 'high', riskScore: 87, pathCount: 7, shortestPathHops: 2, internetReachable: false, topEntryPoint: 'a.patel', owner: 'Finance Platform', lastCalculatedAt: observed },
  { id: 'asset-004', name: 'payment-ledger-db', entityType: 'data', classification: 'Regulated payment datastore', riskLevel: 'high', riskScore: 84, pathCount: 6, shortestPathHops: 2, internetReachable: true, topEntryPoint: 'OPS-JMP-03', owner: 'Payments Engineering', lastCalculatedAt: observed },
  { id: 'asset-005', name: 'backup-control', entityType: 'service', classification: 'Recovery control plane', riskLevel: 'high', riskScore: 79, pathCount: 5, shortestPathHops: 2, internetReachable: false, topEntryPoint: 'FIN-WKS-044', owner: 'Platform Operations', lastCalculatedAt: observed },
  { id: 'asset-006', name: 'customer-analytics', entityType: 'data', classification: 'Sensitive customer insights', riskLevel: 'medium', riskScore: 65, pathCount: 3, shortestPathHops: 2, internetReachable: false, topEntryPoint: 'partner-ops@example.net', owner: null, lastCalculatedAt: observed },
];

const remediation: ExposureRemediationDTO[] = [
  { id: 'rem-001', title: 'Remove standing Tier-0 privileges from support identities', category: 'identity', riskLevel: 'critical', exposureReduction: 34, pathCount: 11, criticalAssetCount: 4, effort: 'medium', disruption: 'medium', state: 'proposed', owner: 'Identity Security', dueAt: '2026-08-14T17:00:00.000Z', recommendation: 'Replace delegated standing rights with time-bound, approved group membership.', lastCalculatedAt: observed },
  { id: 'rem-002', title: 'Constrain cross-account deployment role trust', category: 'identity', riskLevel: 'critical', exposureReduction: 27, pathCount: 8, criticalAssetCount: 3, effort: 'medium', disruption: 'medium', state: 'planned', owner: 'Cloud Security', dueAt: '2026-08-15T17:00:00.000Z', recommendation: 'Bind trust to the authorized workload and remove wildcard resource permissions.', lastCalculatedAt: observed },
  { id: 'rem-003', title: 'Move public management services behind access proxy', category: 'network', riskLevel: 'high', exposureReduction: 19, pathCount: 6, criticalAssetCount: 2, effort: 'low', disruption: 'medium', state: 'in_progress', owner: 'Platform Operations', dueAt: '2026-08-13T17:00:00.000Z', recommendation: 'Remove direct public routes and require device-aware, audited access.', lastCalculatedAt: observed },
  { id: 'rem-004', title: 'Block legacy authentication for privileged identities', category: 'control', riskLevel: 'high', exposureReduction: 17, pathCount: 7, criticalAssetCount: 3, effort: 'low', disruption: 'low', state: 'proposed', owner: 'Identity Security', dueAt: null, recommendation: 'Apply a verified policy after checking the remaining client dependency.', lastCalculatedAt: observed },
  { id: 'rem-005', title: 'Rotate shared endpoint and backup credentials', category: 'identity', riskLevel: 'high', exposureReduction: 13, pathCount: 5, criticalAssetCount: 2, effort: 'high', disruption: 'medium', state: 'proposed', owner: 'Endpoint Engineering', dueAt: null, recommendation: 'Issue unique managed credentials and prohibit interactive service logon.', lastCalculatedAt: observed },
  { id: 'rem-006', title: 'Restrict partner access to customer analytics', category: 'configuration', riskLevel: 'medium', exposureReduction: 8, pathCount: 3, criticalAssetCount: 1, effort: 'low', disruption: 'low', state: 'proposed', owner: null, dueAt: null, recommendation: 'Scope the partner principal to an isolated workspace and require access review.', lastCalculatedAt: observed },
];

function rowRisk(row: ExposureRow): ExposureRisk { return row.riskLevel; }
function rowText(row: ExposureRow): string { return JSON.stringify(row).toLowerCase(); }

export async function getFoundationExposure(filters: ExposureFilters, signal?: AbortSignal): Promise<ExposurePageDTO> {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const source: ExposureRow[] = filters.view === 'attack_paths' ? paths : filters.view === 'choke_points' ? chokePoints : filters.view === 'critical_assets' ? criticalAssets : remediation;
  const filtered = source.filter((row) => {
    if (filters.risk !== 'all' && rowRisk(row) !== filters.risk) return false;
    if (filters.query && !rowText(row).includes(filters.query.toLowerCase())) return false;
    if (filters.assetId && !rowText(row).includes(filters.assetId.toLowerCase())) return false;
    if (filters.view === 'attack_paths') {
      const path = row as AttackPathDTO;
      if (filters.scope !== 'all' && path.scope !== filters.scope) return false;
      if (filters.state !== 'all' && path.state !== filters.state) return false;
    }
    return true;
  });
  const start = Math.max(0, Number(filters.cursor ?? 0) || 0);
  const items = filtered.slice(start, start + filters.limit);
  return {
    items,
    nextCursor: start + filters.limit < filtered.length ? String(start + filters.limit) : null,
    total: filtered.length,
    summary: { exposureScore: 78, activeAttackPaths: 37, criticalAssetsAtRisk: 14, internetEntryPoints: 9, chokePoints: 12, reduciblePaths: 26 },
    snapshotAt: observed,
    freshness: 'fresh',
    contractState: 'complete',
    partialFailures: [],
  };
}
