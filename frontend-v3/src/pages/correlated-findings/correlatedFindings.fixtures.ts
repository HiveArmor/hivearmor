/** Stable fictional attack stories used only when VITE_USE_FOUNDATION_FIXTURES=true. */

import type {
  CorrelatedFindingDTO,
  CorrelatedFindingStatus,
  CorrelationKind,
  FindingEntity,
  FindingOwner,
} from './correlatedFindings.types';

import type { SeverityLevel } from '@/lib/severity';
import type { AlertSlaState } from '@/pages/alerts/alertTriage.types';

interface FindingSeed {
  id: string;
  title: string;
  summary: string;
  severity: SeverityLevel;
  risk: number;
  confidence: number;
  status: CorrelatedFindingStatus;
  kind: CorrelationKind;
  firstSeen: string;
  lastSeen: string;
  alertCount: number;
  eventCount: number;
  sources: number;
  intel: number;
  related: number;
  tenant: string;
  owner: FindingOwner | null;
  sla: AlertSlaState;
  tactics: string[];
  techniques: string[];
  entities: Array<Omit<FindingEntity, 'id' | 'alertCount'> & { alertCount?: number }>;
  ruleIds: string[];
  judgment: string;
}

const analysts = {
  maya: { id: 'usr-41', name: 'Maya Chen' },
  omar: { id: 'usr-52', name: 'Omar Haddad' },
  elena: { id: 'usr-63', name: 'Elena Rossi' },
};

const seeds: FindingSeed[] = [
  {
    id: 'FND-26-0841', title: 'Credential theft progressed to remote service execution',
    summary: 'LSASS access, privileged token use, and remote service creation converge on the same finance workstation and administrator identity.',
    severity: 'critical', risk: 97, confidence: 94, status: 'investigating', kind: 'attack_chain',
    firstSeen: '2026-08-02T06:31:08.000Z', lastSeen: '2026-08-02T09:14:42.000Z', alertCount: 7, eventCount: 126, sources: 3, intel: 2, related: 1,
    tenant: 'Northstar Finance', owner: analysts.maya, sla: 'breached',
    tactics: ['Credential Access', 'Discovery', 'Lateral Movement', 'Command and Control'], techniques: ['T1003.001', 'T1087.002', 'T1021.002', 'T1071.001'],
    entities: [
      { type: 'host', label: 'FIN-WKS-044', role: 'pivot', riskScore: 96, criticality: 'high' },
      { type: 'user', label: 'adm.schen', role: 'target', riskScore: 91, criticality: 'critical' },
      { type: 'ip', label: '198.51.100.42', role: 'infrastructure', riskScore: 88, criticality: null },
    ], ruleIds: ['RULE-ENDPOINT-184', 'RULE-IDENTITY-072', 'RULE-NETWORK-119'],
    judgment: 'The ordered activity and shared administrator token indicate one progressing intrusion rather than independent endpoint noise.',
  },
  {
    id: 'FND-26-0838', title: 'OAuth consent abuse established mailbox persistence',
    summary: 'A first-seen OAuth application received high-risk permissions before creating hidden forwarding and inbox rules.',
    severity: 'critical', risk: 94, confidence: 92, status: 'open', kind: 'behavior_sequence',
    firstSeen: '2026-08-02T07:02:16.000Z', lastSeen: '2026-08-02T09:09:46.000Z', alertCount: 5, eventCount: 74, sources: 2, intel: 1, related: 2,
    tenant: 'Northstar Finance', owner: null, sla: 'at_risk',
    tactics: ['Initial Access', 'Persistence', 'Collection'], techniques: ['T1528', 'T1098.002', 'T1114.003'],
    entities: [
      { type: 'user', label: 'svc-finance@northstar.example', role: 'target', riskScore: 93, criticality: 'critical' },
      { type: 'cloud', label: 'Azure AD · Finance tenant', role: 'pivot', riskScore: 86, criticality: 'critical' },
      { type: 'ip', label: '203.0.113.84', role: 'source', riskScore: 78, criticality: null },
    ], ruleIds: ['RULE-CLOUD-044', 'RULE-IDENTITY-221'],
    judgment: 'Permission grant and mailbox manipulation share the same application, account, client fingerprint, and two-hour time window.',
  },
  {
    id: 'FND-26-0833', title: 'Ransomware staging spread across engineering endpoints',
    summary: 'Archive creation, shadow-copy deletion, and rapid file rewrites appeared on three hosts through a common remote administration channel.',
    severity: 'critical', risk: 96, confidence: 90, status: 'investigating', kind: 'campaign',
    firstSeen: '2026-08-02T05:48:17.000Z', lastSeen: '2026-08-02T08:34:17.000Z', alertCount: 9, eventCount: 308, sources: 3, intel: 3, related: 2,
    tenant: 'Aegis Manufacturing', owner: analysts.elena, sla: 'breached',
    tactics: ['Execution', 'Defense Evasion', 'Impact'], techniques: ['T1059.001', 'T1490', 'T1486'],
    entities: [
      { type: 'host', label: 'RAD-WKS-015', role: 'pivot', riskScore: 98, criticality: 'high' },
      { type: 'host', label: 'ENG-FS-02', role: 'target', riskScore: 95, criticality: 'critical' },
      { type: 'file', label: 'update-kb501.exe', role: 'source', riskScore: 97, criticality: null },
    ], ruleIds: ['RULE-ENDPOINT-291', 'RULE-ENDPOINT-304', 'RULE-IMPACT-011'],
    judgment: 'Common binary hash, remote-control channel, and ordered impact behavior show coordinated staging across multiple assets.',
  },
  {
    id: 'FND-26-0829', title: 'Kerberoasting activity targeted privileged service accounts',
    summary: 'Unusual service-ticket volume, encryption downgrade, and offline cracking indicators converge on one engineering host.',
    severity: 'high', risk: 88, confidence: 89, status: 'open', kind: 'behavior_sequence',
    firstSeen: '2026-08-02T06:11:22.000Z', lastSeen: '2026-08-02T09:06:22.000Z', alertCount: 6, eventCount: 184, sources: 2, intel: 0, related: 1,
    tenant: 'Aegis Manufacturing', owner: analysts.omar, sla: 'at_risk',
    tactics: ['Discovery', 'Credential Access'], techniques: ['T1087.002', 'T1558.003'],
    entities: [
      { type: 'host', label: 'ENG-WKS-073', role: 'source', riskScore: 84, criticality: 'medium' },
      { type: 'user', label: 'svc-build-prod', role: 'target', riskScore: 92, criticality: 'critical' },
      { type: 'user', label: 'svc-sql-backup', role: 'target', riskScore: 87, criticality: 'high' },
    ], ruleIds: ['RULE-IDENTITY-088', 'RULE-IDENTITY-104'],
    judgment: 'Ticket requests share an originating host and focus on accounts with privileged SPNs, exceeding the tenant baseline by 18×.',
  },
  {
    id: 'FND-26-0826', title: 'Cloud access key used for reconnaissance and policy change',
    summary: 'A dormant production key became active from a first-seen network, enumerated IAM, then modified a logging policy.',
    severity: 'high', risk: 86, confidence: 87, status: 'open', kind: 'attack_chain',
    firstSeen: '2026-08-02T06:42:48.000Z', lastSeen: '2026-08-02T08:40:48.000Z', alertCount: 4, eventCount: 58, sources: 2, intel: 1, related: 0,
    tenant: 'Meridian Health', owner: null, sla: 'at_risk',
    tactics: ['Discovery', 'Defense Evasion'], techniques: ['T1087.004', 'T1562.008'],
    entities: [
      { type: 'user', label: 'AKIA…P7Q2', role: 'source', riskScore: 89, criticality: 'high' },
      { type: 'cloud', label: 'AWS · prod-audit', role: 'target', riskScore: 90, criticality: 'critical' },
      { type: 'ip', label: '192.0.2.61', role: 'infrastructure', riskScore: 76, criticality: null },
    ], ruleIds: ['RULE-CLOUD-119', 'RULE-CLOUD-144'],
    judgment: 'The same key, source ASN, and session chain connect discovery to logging impairment within a single assumed-role session.',
  },
  {
    id: 'FND-26-0821', title: 'DNS tunneling followed sensitive archive creation',
    summary: 'High-entropy DNS traffic began minutes after a service account created a compressed archive on an application server.',
    severity: 'high', risk: 84, confidence: 86, status: 'investigating', kind: 'attack_chain',
    firstSeen: '2026-08-02T05:54:19.000Z', lastSeen: '2026-08-02T08:52:19.000Z', alertCount: 5, eventCount: 241, sources: 2, intel: 2, related: 1,
    tenant: 'Meridian Health', owner: analysts.elena, sla: 'on_track',
    tactics: ['Collection', 'Command and Control', 'Exfiltration'], techniques: ['T1560.001', 'T1071.004', 'T1048.003'],
    entities: [
      { type: 'host', label: 'APP-PROD-08', role: 'pivot', riskScore: 88, criticality: 'critical' },
      { type: 'user', label: 'svc-appsync', role: 'source', riskScore: 79, criticality: 'high' },
      { type: 'domain', label: 'ns1.sync-cdn.example', role: 'infrastructure', riskScore: 91, criticality: null },
    ], ruleIds: ['RULE-ENDPOINT-167', 'RULE-NETWORK-208'],
    judgment: 'Archive and DNS activity share a host and account; timing and byte volume are consistent with staged exfiltration.',
  },
  {
    id: 'FND-26-0818', title: 'Password spray preceded successful privileged sign-in',
    summary: 'Low-and-slow authentication failures across users ended with a new-device login to a privileged account.',
    severity: 'medium', risk: 74, confidence: 82, status: 'open', kind: 'behavior_sequence',
    firstSeen: '2026-08-02T04:22:29.000Z', lastSeen: '2026-08-02T08:21:29.000Z', alertCount: 4, eventCount: 92, sources: 2, intel: 1, related: 0,
    tenant: 'Northstar Finance', owner: null, sla: 'on_track',
    tactics: ['Credential Access', 'Initial Access'], techniques: ['T1110.003', 'T1078.004'],
    entities: [
      { type: 'ip', label: '198.51.100.77', role: 'source', riskScore: 74, criticality: null },
      { type: 'user', label: 'a.kapoor@northstar.example', role: 'target', riskScore: 82, criticality: 'critical' },
    ], ruleIds: ['RULE-IDENTITY-015', 'RULE-IDENTITY-202'],
    judgment: 'Failure cadence, source infrastructure, and the subsequent successful session connect the spray to credential use.',
  },
  {
    id: 'FND-26-0814', title: 'Restricted server established an external proxy tunnel',
    summary: 'A database server launched a new proxy process and sustained encrypted traffic to rare external infrastructure.',
    severity: 'medium', risk: 71, confidence: 84, status: 'open', kind: 'shared_entity',
    firstSeen: '2026-08-02T05:17:11.000Z', lastSeen: '2026-08-02T08:13:11.000Z', alertCount: 3, eventCount: 66, sources: 2, intel: 1, related: 0,
    tenant: 'Meridian Health', owner: analysts.omar, sla: 'on_track',
    tactics: ['Command and Control'], techniques: ['T1090.001'],
    entities: [
      { type: 'host', label: 'DB-PROD-14', role: 'source', riskScore: 83, criticality: 'critical' },
      { type: 'process', label: 'chisel.exe', role: 'pivot', riskScore: 86, criticality: null },
      { type: 'ip', label: '203.0.113.57', role: 'infrastructure', riskScore: 81, criticality: null },
    ], ruleIds: ['RULE-ENDPOINT-212', 'RULE-NETWORK-137'],
    judgment: 'Process ancestry and destination match across endpoint and network sources on a server that normally has no outbound access.',
  },
  {
    id: 'FND-26-0809', title: 'Signed utility executions share a malicious infrastructure cluster',
    summary: 'Three encoded-script alerts on separate hosts contacted domains sharing certificate and hosting fingerprints.',
    severity: 'high', risk: 81, confidence: 80, status: 'incident_created', kind: 'campaign',
    firstSeen: '2026-08-01T22:41:11.000Z', lastSeen: '2026-08-02T07:43:11.000Z', alertCount: 6, eventCount: 112, sources: 3, intel: 4, related: 3,
    tenant: 'Aegis Manufacturing', owner: analysts.maya, sla: 'on_track',
    tactics: ['Execution', 'Persistence', 'Command and Control'], techniques: ['T1218.011', 'T1060', 'T1071.001'],
    entities: [
      { type: 'domain', label: 'cdn-update-check.example', role: 'infrastructure', riskScore: 89, criticality: null },
      { type: 'file', label: 'signed-helper.exe', role: 'source', riskScore: 84, criticality: null },
      { type: 'host', label: 'OPS-WKS-031', role: 'target', riskScore: 77, criticality: 'medium' },
    ], ruleIds: ['RULE-ENDPOINT-184', 'RULE-INTEL-029'],
    judgment: 'Certificate reuse, hosting overlap, and identical encoded payload structure indicate a common infrastructure campaign.',
  },
  {
    id: 'FND-26-0804', title: 'Impossible travel sessions reused the same token family',
    summary: 'Geographically impossible sessions share token identifiers, device fingerprint, and application access pattern.',
    severity: 'high', risk: 79, confidence: 88, status: 'resolved', kind: 'shared_entity',
    firstSeen: '2026-08-01T21:32:31.000Z', lastSeen: '2026-08-02T06:57:31.000Z', alertCount: 4, eventCount: 48, sources: 1, intel: 0, related: 1,
    tenant: 'Northstar Finance', owner: analysts.maya, sla: 'none',
    tactics: ['Defense Evasion', 'Initial Access'], techniques: ['T1550.001', 'T1078.004'],
    entities: [
      { type: 'user', label: 'a.kapoor@aegis.example', role: 'target', riskScore: 81, criticality: 'high' },
      { type: 'cloud', label: 'Microsoft 365', role: 'pivot', riskScore: 61, criticality: 'high' },
    ], ruleIds: ['RULE-IDENTITY-170'],
    judgment: 'Token-family reuse and matching client metadata confirm session replay rather than independent travel anomalies.',
  },
  {
    id: 'FND-26-0798', title: 'Repeated service installation alerts form one deployment cluster',
    summary: 'Near-identical service creation activity repeats across operations hosts through the same administration account.',
    severity: 'medium', risk: 66, confidence: 77, status: 'false_positive', kind: 'duplicate_cluster',
    firstSeen: '2026-08-01T20:18:04.000Z', lastSeen: '2026-08-02T05:47:04.000Z', alertCount: 8, eventCount: 83, sources: 1, intel: 0, related: 0,
    tenant: 'Aegis Manufacturing', owner: analysts.omar, sla: 'none',
    tactics: ['Persistence'], techniques: ['T1543.003'],
    entities: [
      { type: 'user', label: 'svc-sccm-deploy', role: 'source', riskScore: 28, criticality: 'high' },
      { type: 'host', label: 'OPS-SRV-031', role: 'target', riskScore: 35, criticality: 'medium' },
    ], ruleIds: ['RULE-ENDPOINT-074'],
    judgment: 'Shared signed installer, approved deployment account, and change window show one authorized deployment pattern.',
  },
  {
    id: 'FND-26-0792', title: 'Threat-intelligence indicators overlap across two open attack stories',
    summary: 'A domain and IP cluster appears in both cloud-key and endpoint execution activity within the same tenant.',
    severity: 'medium', risk: 68, confidence: 72, status: 'open', kind: 'campaign',
    firstSeen: '2026-08-01T23:05:48.000Z', lastSeen: '2026-08-02T04:40:48.000Z', alertCount: 3, eventCount: 39, sources: 3, intel: 3, related: 2,
    tenant: 'Meridian Health', owner: null, sla: 'at_risk',
    tactics: ['Initial Access', 'Command and Control'], techniques: ['T1078.004', 'T1071.001'],
    entities: [
      { type: 'domain', label: 'auth-sync-cdn.example', role: 'infrastructure', riskScore: 85, criticality: null },
      { type: 'ip', label: '203.0.113.84', role: 'infrastructure', riskScore: 82, criticality: null },
      { type: 'cloud', label: 'AWS · prod-app', role: 'target', riskScore: 77, criticality: 'critical' },
    ], ruleIds: ['RULE-INTEL-029', 'RULE-CLOUD-119'],
    judgment: 'Indicator overlap is meaningful but campaign attribution remains provisional because only three supporting alerts exist.',
  },
];

const kindLabels: Record<CorrelationKind, string> = {
  attack_chain: 'Ordered attack sequence', shared_entity: 'Shared entity pivot', behavior_sequence: 'Behavior sequence', campaign: 'Campaign overlap', duplicate_cluster: 'Duplicate signal cluster',
};

function toFinding(seed: FindingSeed): CorrelatedFindingDTO {
  const entities: FindingEntity[] = seed.entities.map((entity, index) => ({
    ...entity,
    id: `${seed.id}-entity-${index + 1}`,
    alertCount: entity.alertCount ?? Math.max(1, seed.alertCount - index * 2),
  }));
  const stages = seed.tactics.map((tactic, index) => ({
    id: `${seed.id}-stage-${index + 1}`,
    order: index + 1,
    detectedAt: new Date(new Date(seed.firstSeen).getTime() + ((new Date(seed.lastSeen).getTime() - new Date(seed.firstSeen).getTime()) / Math.max(1, seed.tactics.length - 1)) * index).toISOString(),
    tactic,
    technique: seed.techniques[index] ?? null,
    title: index === 0 ? `Initial ${tactic.toLowerCase()} signal` : `${tactic} activity confirmed`,
    alertIds: [`ALT-${seed.id.slice(-4)}-${index + 1}`],
  }));
  const signals = Array.from({ length: Math.min(seed.alertCount, 7) }, (_, index) => ({
    id: `${seed.id}-signal-${index + 1}`,
    alertId: `ALT-${seed.id.slice(-4)}-${String(index + 1).padStart(2, '0')}`,
    detectedAt: new Date(new Date(seed.firstSeen).getTime() + ((new Date(seed.lastSeen).getTime() - new Date(seed.firstSeen).getTime()) / Math.max(1, Math.min(seed.alertCount, 7) - 1)) * index).toISOString(),
    title: index === 0 ? stages[0]?.title ?? seed.title : `${seed.tactics[index % seed.tactics.length]} signal on ${entities[index % entities.length]?.label}`,
    severity: index < 2 ? seed.severity : seed.severity === 'critical' ? 'high' as const : seed.severity,
    category: entities[index % entities.length]?.type === 'cloud' ? 'Cloud' : entities[index % entities.length]?.type === 'user' ? 'Identity' : entities[index % entities.length]?.type === 'ip' || entities[index % entities.length]?.type === 'domain' ? 'Network' : 'Endpoint',
    ruleName: seed.ruleIds[index % seed.ruleIds.length],
    entityLabel: entities[index % entities.length]?.label ?? 'Entity unavailable',
    tactic: seed.tactics[index % seed.tactics.length] ?? null,
    technique: seed.techniques[index % seed.techniques.length] ?? null,
  }));
  const relationshipNodes = [
    { id: `${seed.id}-root`, label: seed.id, type: 'finding' as const, severity: seed.severity, x: 50, y: 48 },
    ...entities.map((entity, index) => ({ id: entity.id, label: entity.label, type: entity.type, severity: null, x: [18, 82, 50, 25][index] ?? 75, y: [22, 22, 82, 76][index] ?? 78 })),
    ...signals.slice(0, 2).map((signal, index) => ({ id: signal.id, label: signal.alertId, type: 'alert' as const, severity: signal.severity, x: index ? 78 : 22, y: 78 })),
  ];
  const relationshipEdges = relationshipNodes.slice(1).map((node, index) => ({
    id: `${seed.id}-edge-${index + 1}`, source: `${seed.id}-root`, target: node.id,
    label: node.type === 'alert' ? 'supported by' : 'involves', confidence: Math.max(60, seed.confidence - index * 3),
  }));
  const correlationReasons = [
    { id: `${seed.id}-reason-entity`, kind: 'shared_entity' as const, label: `${entities.length} shared entities`, detail: `${entities.map((entity) => entity.label).join(', ')} connect signals across ${seed.sources} data sources.`, strength: Math.min(99, seed.confidence + 2), evidenceCount: seed.alertCount },
    { id: `${seed.id}-reason-sequence`, kind: 'temporal_sequence' as const, label: kindLabels[seed.kind], detail: `${seed.tactics.join(' → ')} occurred inside the same bounded activity window.`, strength: seed.confidence, evidenceCount: seed.eventCount },
    ...(seed.intel ? [{ id: `${seed.id}-reason-intel`, kind: 'threat_intel' as const, label: `${seed.intel} intelligence matches`, detail: 'Observed infrastructure overlaps curated threat-intelligence indicators with active validity.', strength: Math.max(70, seed.confidence - 5), evidenceCount: seed.intel }] : []),
  ];

  return {
    id: seed.id, title: seed.title, summary: seed.summary, severity: seed.severity, riskScore: seed.risk, confidence: seed.confidence,
    status: seed.status, correlationKind: seed.kind, firstSeen: seed.firstSeen, lastSeen: seed.lastSeen, alertCount: seed.alertCount,
    eventCount: seed.eventCount, dataSourceCount: seed.sources, intelMatchCount: seed.intel, relatedFindingCount: seed.related,
    tenantName: seed.tenant, owner: seed.owner, slaStatus: seed.sla, mitreTactics: seed.tactics, mitreTechniques: seed.techniques,
    entities, correlationReasons, stages, signals, relationshipNodes, relationshipEdges,
    narrative: { summary: seed.summary, keyJudgments: [seed.judgment, `${seed.alertCount} alerts across ${seed.sources} sources map to ${seed.tactics.length} ATT&CK tactics.`, seed.intel ? `${seed.intel} current intelligence matches raise investigation priority.` : 'No current threat-intelligence match is required for this correlation.'], source: 'correlation_engine', generatedAt: seed.lastSeen, confidence: seed.confidence },
    availableActions: [
      { id: 'assign', allowed: seed.status === 'open' || seed.status === 'investigating' },
      { id: 'change_status', allowed: true },
      { id: 'promote_incident', allowed: seed.status !== 'incident_created' && seed.status !== 'false_positive' },
      { id: 'add_note', allowed: true },
    ],
    correlationEngine: { version: 'hive-correlator 3.8.2', ruleIds: seed.ruleIds, evaluatedAt: seed.lastSeen },
    incident: seed.status === 'incident_created' ? { id: 'INC-2026-00418', title: seed.title } : null,
    version: 7, dataCompleteness: 'complete',
  };
}

export const foundationCorrelatedFindings: CorrelatedFindingDTO[] = seeds.map(toFinding);

export function getFoundationCorrelatedFinding(id: string): CorrelatedFindingDTO | null {
  return foundationCorrelatedFindings.find((finding) => finding.id === id) ?? null;
}
