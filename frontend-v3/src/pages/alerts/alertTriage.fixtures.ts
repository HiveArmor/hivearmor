/**
 * Stable fictional SOC records used only when VITE_USE_FOUNDATION_FIXTURES=true.
 * These records are never a fallback for a production API failure.
 */

import type {
  AlertQueueFilters,
  AlertQueueRecord,
  AlertQueueSummary,
  AlertTriageDetail,
} from './alertTriage.types';

import { ALERT_STATUS } from '@/constants/status.constants';
import { parseAlertQueryExpression, type AlertQueryClause } from '@/lib/alertFilterFields';
import { numericToSeverityLevel } from '@/lib/severity';

interface AlertSeed {
  id: string;
  title: string;
  summary: string;
  reason: string;
  detectedAt: string;
  severity: number;
  risk: number;
  confidence: number;
  status: number;
  category: string;
  ruleId: string;
  ruleName: string;
  sourceProduct: string;
  source: string;
  destination: string;
  entityType: AlertQueueRecord['primaryEntity'] extends { type: infer T } | undefined ? T : never;
  entity: string;
  tenantId: string;
  tenant: string;
  assigneeId?: number;
  assignee?: string;
  sla: AlertQueueRecord['slaStatus'];
  slaDeadline?: string;
  technique?: string;
  tactic?: string;
  intel?: boolean;
  tags: string[];
  related: number;
  events: number;
  occurrences: number;
}

const seeds: AlertSeed[] = [
  {
    id: 'ALT-7F3A91',
    title: 'Signed utility spawned an encoded PowerShell download chain',
    summary: 'Encoded execution, persistence, and an outbound callback were correlated on a finance workstation.',
    reason: 'A user-opened attachment spawned rundll32, encoded PowerShell, a new Run key, and traffic to low-prevalence infrastructure.',
    detectedAt: '2026-08-02T03:42:11.182Z',
    severity: 10,
    risk: 94,
    confidence: 91,
    status: 3,
    category: 'Endpoint',
    ruleId: 'RULE-ENDPOINT-184',
    ruleName: 'Encoded script with persistence and outbound callback',
    sourceProduct: 'HiveArmor Endpoint Analytics',
    source: '10.24.18.44',
    destination: '198.51.100.42',
    entityType: 'host',
    entity: 'FIN-WKS-044',
    tenantId: 'northstar',
    tenant: 'Northstar Finance',
    assigneeId: 41,
    assignee: 'Maya Chen',
    sla: 'at_risk',
    slaDeadline: '2026-08-02T04:12:11.182Z',
    technique: 'T1059.001',
    tactic: 'Execution',
    intel: true,
    tags: ['encoded-script', 'new-domain'],
    related: 2,
    events: 18,
    occurrences: 1,
  },
  {
    id: 'ALT-D0C441',
    title: 'OAuth application granted high-risk mailbox permissions',
    summary: 'A newly registered application received offline access and full mailbox read privileges.',
    reason: 'Consent originated from a new ASN and the publisher is unverified across the tenant.',
    detectedAt: '2026-08-02T03:39:46.412Z',
    severity: 10,
    risk: 91,
    confidence: 88,
    status: 2,
    category: 'Identity',
    ruleId: 'RULE-ID-092',
    ruleName: 'Risky OAuth consent with privileged scopes',
    sourceProduct: 'Identity Protection',
    source: '203.0.113.84',
    destination: 'login.microsoftonline.com',
    entityType: 'user',
    entity: 'svc-finance@northstar.example',
    tenantId: 'northstar',
    tenant: 'Northstar Finance',
    sla: 'breached',
    slaDeadline: '2026-08-02T04:09:46.412Z',
    technique: 'T1098.003',
    tactic: 'Persistence',
    intel: false,
    tags: ['oauth', 'privileged-scope'],
    related: 5,
    events: 12,
    occurrences: 1,
  },
  {
    id: 'ALT-3B8C20',
    title: 'Kerberos service ticket burst indicates possible Kerberoasting',
    summary: 'One workstation requested 47 RC4 service tickets in less than three minutes.',
    reason: 'The request rate is 18× the host baseline and includes four privileged service accounts.',
    detectedAt: '2026-08-02T03:36:22.790Z',
    severity: 9,
    risk: 89,
    confidence: 93,
    status: 2,
    category: 'Identity',
    ruleId: 'RULE-AD-044',
    ruleName: 'Anomalous Kerberos service ticket collection',
    sourceProduct: 'Active Directory Analytics',
    source: '10.18.4.73',
    destination: 'DC-02.corp.local',
    entityType: 'host',
    entity: 'ENG-WKS-073',
    tenantId: 'meridian',
    tenant: 'Meridian Health',
    assigneeId: 54,
    assignee: 'Omar Haddad',
    sla: 'at_risk',
    slaDeadline: '2026-08-02T04:21:22.790Z',
    technique: 'T1558.003',
    tactic: 'Credential Access',
    intel: false,
    tags: ['kerberos', 'service-account'],
    related: 8,
    events: 52,
    occurrences: 2,
  },
  {
    id: 'ALT-8A1E73',
    title: 'Credential-dumping pattern observed against LSASS',
    summary: 'An unsigned process opened LSASS with memory-read access after privilege escalation.',
    reason: 'The process access mask, unsigned image, and parent chain match a credential-dumping sequence.',
    detectedAt: '2026-08-02T03:32:08.021Z',
    severity: 10,
    risk: 97,
    confidence: 96,
    status: 3,
    category: 'Endpoint',
    ruleId: 'RULE-ENDPOINT-011',
    ruleName: 'Suspicious LSASS memory access',
    sourceProduct: 'HiveArmor EDR',
    source: '10.33.7.19',
    destination: 'LOCAL',
    entityType: 'host',
    entity: 'HR-LT-019',
    tenantId: 'meridian',
    tenant: 'Meridian Health',
    assigneeId: 41,
    assignee: 'Maya Chen',
    sla: 'breached',
    slaDeadline: '2026-08-02T04:02:08.021Z',
    technique: 'T1003.001',
    tactic: 'Credential Access',
    intel: true,
    tags: ['lsass', 'credential-access'],
    related: 3,
    events: 9,
    occurrences: 1,
  },
  {
    id: 'ALT-2CF908',
    title: 'Privileged sign-in impossible travel with token replay indicators',
    summary: 'The same administrator session appeared in Bengaluru and Frankfurt within seven minutes.',
    reason: 'Device identity changed while refresh-token identifiers and client fingerprint remained consistent.',
    detectedAt: '2026-08-02T03:27:31.618Z',
    severity: 9,
    risk: 87,
    confidence: 86,
    status: 2,
    category: 'Identity',
    ruleId: 'RULE-ID-071',
    ruleName: 'Impossible travel with replay evidence',
    sourceProduct: 'Identity Protection',
    source: '192.0.2.61',
    destination: 'admin.hive.example',
    entityType: 'user',
    entity: 'a.kapoor@aegis.example',
    tenantId: 'aegis',
    tenant: 'Aegis Public Sector',
    sla: 'at_risk',
    slaDeadline: '2026-08-02T04:27:31.618Z',
    technique: 'T1550.001',
    tactic: 'Defense Evasion',
    intel: true,
    tags: ['token-replay', 'privileged-user'],
    related: 6,
    events: 15,
    occurrences: 1,
  },
  {
    id: 'ALT-6E4F12',
    title: 'Long-lived DNS queries suggest encrypted data tunneling',
    summary: 'High-entropy subdomains were queried at a regular cadence from an application server.',
    reason: 'Query length, entropy, cadence, and NXDOMAIN ratio exceed the server baseline.',
    detectedAt: '2026-08-02T03:22:19.406Z',
    severity: 8,
    risk: 82,
    confidence: 84,
    status: 2,
    category: 'Network',
    ruleId: 'RULE-NET-128',
    ruleName: 'Probable DNS data channel',
    sourceProduct: 'Network Detection',
    source: '10.40.12.8',
    destination: 'ns1.sync-cdn.example',
    entityType: 'host',
    entity: 'APP-PROD-08',
    tenantId: 'northstar',
    tenant: 'Northstar Finance',
    assigneeId: 67,
    assignee: 'Elena Rossi',
    sla: 'on_track',
    slaDeadline: '2026-08-02T05:22:19.406Z',
    technique: 'T1071.004',
    tactic: 'Command and Control',
    intel: true,
    tags: ['dns', 'data-channel'],
    related: 12,
    events: 107,
    occurrences: 4,
  },
  {
    id: 'ALT-0A927D',
    title: 'Rare service installed from a user-writable directory',
    summary: 'A new automatic service points to an unsigned executable under ProgramData.',
    reason: 'The service name is unseen, the binary is unsigned, and the parent was a remote administration tool.',
    detectedAt: '2026-08-02T03:17:04.144Z',
    severity: 8,
    risk: 80,
    confidence: 89,
    status: 3,
    category: 'Endpoint',
    ruleId: 'RULE-ENDPOINT-067',
    ruleName: 'Rare service persistence',
    sourceProduct: 'HiveArmor EDR',
    source: '10.27.6.31',
    destination: 'LOCAL',
    entityType: 'host',
    entity: 'OPS-SRV-031',
    tenantId: 'aegis',
    tenant: 'Aegis Public Sector',
    assigneeId: 54,
    assignee: 'Omar Haddad',
    sla: 'on_track',
    slaDeadline: '2026-08-02T05:17:04.144Z',
    technique: 'T1543.003',
    tactic: 'Persistence',
    intel: false,
    tags: ['service', 'unsigned'],
    related: 1,
    events: 7,
    occurrences: 1,
  },
  {
    id: 'ALT-4DA003',
    title: 'Cloud access key used from a first-seen autonomous system',
    summary: 'A production deployment key accessed IAM and secrets APIs from an unseen network.',
    reason: 'The key is non-interactive, the ASN is new, and the call sequence includes credential discovery.',
    detectedAt: '2026-08-02T03:10:48.991Z',
    severity: 8,
    risk: 85,
    confidence: 81,
    status: 2,
    category: 'Cloud',
    ruleId: 'RULE-CLOUD-103',
    ruleName: 'Cloud credential used from anomalous infrastructure',
    sourceProduct: 'Cloud Security Analytics',
    source: '203.0.113.129',
    destination: 'iam.amazonaws.com',
    entityType: 'user',
    entity: 'AKIA…P7Q2',
    tenantId: 'northstar',
    tenant: 'Northstar Finance',
    sla: 'at_risk',
    slaDeadline: '2026-08-02T04:40:48.991Z',
    technique: 'T1078.004',
    tactic: 'Initial Access',
    intel: true,
    tags: ['aws', 'access-key'],
    related: 7,
    events: 24,
    occurrences: 1,
  },
  {
    id: 'ALT-11CB89',
    title: 'Rapid file rewrite pattern consistent with ransomware staging',
    summary: 'A workstation renamed and rewrote 624 documents across two shares in four minutes.',
    reason: 'The extension churn, write rate, entropy change, and shadow-copy command crossed the impact threshold.',
    detectedAt: '2026-08-02T03:04:17.502Z',
    severity: 10,
    risk: 98,
    confidence: 97,
    status: 6,
    category: 'Endpoint',
    ruleId: 'RULE-ENDPOINT-222',
    ruleName: 'Ransomware impact sequence',
    sourceProduct: 'HiveArmor EDR',
    source: '10.19.22.15',
    destination: 'FS-CLINICAL-02',
    entityType: 'host',
    entity: 'RAD-WKS-015',
    tenantId: 'meridian',
    tenant: 'Meridian Health',
    assigneeId: 67,
    assignee: 'Elena Rossi',
    sla: 'on_track',
    slaDeadline: '2026-08-02T03:34:17.502Z',
    technique: 'T1486',
    tactic: 'Impact',
    intel: true,
    tags: ['ransomware', 'contained'],
    related: 14,
    events: 681,
    occurrences: 1,
  },
  {
    id: 'ALT-291CC0',
    title: 'PowerShell attempted to disable AMSI before script execution',
    summary: 'A reflective-loading sequence patched the AMSI scan buffer in memory.',
    reason: 'The memory write target and follow-on encoded script match a known defense-evasion pattern.',
    detectedAt: '2026-08-02T02:58:53.240Z',
    severity: 8,
    risk: 84,
    confidence: 90,
    status: 7,
    category: 'Endpoint',
    ruleId: 'RULE-ENDPOINT-139',
    ruleName: 'AMSI tampering followed by script execution',
    sourceProduct: 'HiveArmor EDR',
    source: '10.24.18.12',
    destination: 'LOCAL',
    entityType: 'host',
    entity: 'FIN-WKS-012',
    tenantId: 'northstar',
    tenant: 'Northstar Finance',
    assigneeId: 41,
    assignee: 'Maya Chen',
    sla: 'none',
    technique: 'T1562.001',
    tactic: 'Defense Evasion',
    intel: false,
    tags: ['approved-test', 'amsi'],
    related: 0,
    events: 6,
    occurrences: 3,
  },
  {
    id: 'ALT-681B02',
    title: 'Password spray crossed the tenant-wide failure baseline',
    summary: 'One source attempted low-rate authentication against 83 accounts.',
    reason: 'The source is first-seen and its distributed failure pattern avoids per-account lockout thresholds.',
    detectedAt: '2026-08-02T02:51:29.184Z',
    severity: 7,
    risk: 76,
    confidence: 85,
    status: 2,
    category: 'Identity',
    ruleId: 'RULE-ID-018',
    ruleName: 'Distributed password spray',
    sourceProduct: 'Identity Protection',
    source: '198.51.100.77',
    destination: 'sso.aegis.example',
    entityType: 'ip',
    entity: '198.51.100.77',
    tenantId: 'aegis',
    tenant: 'Aegis Public Sector',
    sla: 'on_track',
    slaDeadline: '2026-08-02T04:51:29.184Z',
    technique: 'T1110.003',
    tactic: 'Credential Access',
    intel: true,
    tags: ['password-spray', 'external'],
    related: 9,
    events: 122,
    occurrences: 2,
  },
  {
    id: 'ALT-5321AE',
    title: 'Proxy tunnel established from a restricted server segment',
    summary: 'A database server opened a persistent encrypted connection to a new relay provider.',
    reason: 'The process, destination category, session duration, and subnet policy indicate an unauthorized tunnel.',
    detectedAt: '2026-08-02T02:43:11.907Z',
    severity: 7,
    risk: 74,
    confidence: 79,
    status: 3,
    category: 'Network',
    ruleId: 'RULE-NET-093',
    ruleName: 'Unauthorized encrypted proxy tunnel',
    sourceProduct: 'Network Detection',
    source: '10.55.2.14',
    destination: '192.0.2.201',
    entityType: 'host',
    entity: 'DB-PROD-14',
    tenantId: 'meridian',
    tenant: 'Meridian Health',
    assigneeId: 54,
    assignee: 'Omar Haddad',
    sla: 'on_track',
    slaDeadline: '2026-08-02T04:43:11.907Z',
    technique: 'T1090.001',
    tactic: 'Command and Control',
    intel: false,
    tags: ['proxy', 'restricted-segment'],
    related: 4,
    events: 31,
    occurrences: 1,
  },
];

function severityLabel(severity: number): string {
  const level = numericToSeverityLevel(severity);
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function seedToRecord(seed: AlertSeed, cycle = 0): AlertQueueRecord {
  const detected = new Date(seed.detectedAt);
  detected.setMinutes(detected.getMinutes() - cycle * 89);
  const risk = Math.max(34, seed.risk - cycle * 7);
  const status = cycle === 0 ? seed.status : cycle === 1 ? 2 : cycle === 2 ? 5 : 7;
  const id = cycle === 0 ? seed.id : `${seed.id}-R${cycle}`;

  return {
    id,
    name: cycle === 0 ? seed.title : `${seed.title}${cycle === 2 ? ' — recurring pattern' : ''}`,
    description: seed.summary,
    summary: seed.summary,
    reason: seed.reason,
    '@timestamp': detected.toISOString(),
    timestamp: detected.toISOString(),
    updatedAt: new Date(detected.getTime() + 4 * 60_000).toISOString(),
    severity: Math.max(3, seed.severity - cycle),
    severityLabel: severityLabel(Math.max(3, seed.severity - cycle)),
    status,
    statusLabel: status === 2 ? 'Open' : status === 3 ? 'In review' : status === 6 ? 'True positive' : status === 7 ? 'False positive' : 'Completed',
    category: seed.category,
    dataType: seed.sourceProduct,
    sourceProduct: seed.sourceProduct,
    tags: seed.tags,
    adversary: { name: seed.source, ip: seed.source, host: seed.source },
    target: { name: seed.destination, ip: seed.destination, host: seed.destination },
    riskScore: risk,
    confidence: Math.max(61, seed.confidence - cycle * 4),
    tenantId: seed.tenantId,
    tenantName: seed.tenant,
    slaDeadline: seed.slaDeadline,
    slaBreached: seed.sla === 'breached',
    slaStatus: status >= 5 ? 'none' : seed.sla,
    assetId: seed.entityType === 'host' ? seed.entity : undefined,
    assetCriticality: risk >= 90 ? 5 : risk >= 75 ? 4 : 3,
    assetOwner: seed.tenant,
    assigneeId: cycle === 1 ? undefined : seed.assigneeId,
    assigneeName: cycle === 1 ? undefined : seed.assignee,
    primaryEntity: {
      id: `${seed.entityType}-${seed.entity.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      type: seed.entityType,
      label: seed.entity,
      riskScore: risk,
    },
    ruleId: seed.ruleId,
    ruleName: seed.ruleName,
    mitreTechniqueId: seed.technique,
    mitreTechniqueName: seed.technique,
    mitreTacticName: seed.tactic,
    threatIntelMatched: seed.intel,
    threatIntelIndicatorType: seed.intel ? 'ip' : undefined,
    threatIntelSource: seed.intel ? 'HiveArmor curated intelligence' : undefined,
    threatIntelConfidence: seed.intel ? Math.max(75, seed.confidence - 2) : undefined,
    relatedAlertCount: seed.related + cycle,
    eventCount: seed.events + cycle * 3,
    occurrenceCount: seed.occurrences + cycle,
    version: 7 + cycle,
  };
}

export const foundationAlertQueue: AlertQueueRecord[] = seeds
  .flatMap((seed) => [seedToRecord(seed), seedToRecord(seed, 1), seedToRecord(seed, 2)])
  .sort((a, b) => new Date(b['@timestamp']).getTime() - new Date(a['@timestamp']).getTime());

export const foundationAlertQueueSummary: AlertQueueSummary = {
  totalApproximate: foundationAlertQueue.length,
  criticalOpen: foundationAlertQueue.filter((alert) => alert.severity >= 9 && alert.status < 5).length,
  slaAtRisk: foundationAlertQueue.filter((alert) => alert.slaStatus === 'at_risk' || alert.slaStatus === 'breached').length,
  unassigned: foundationAlertQueue.filter((alert) => !alert.assigneeName && alert.status < 5).length,
  threatIntelMatched: foundationAlertQueue.filter((alert) => alert.threatIntelMatched && alert.status < 5).length,
  snapshotAt: '2026-08-02T03:48:00.000Z',
  dataCompleteness: 'complete',
};

const statusNames: Record<number, AlertTriageDetail['status']> = {
  1: ALERT_STATUS.OPEN,
  2: ALERT_STATUS.OPEN,
  3: ALERT_STATUS.IN_PROGRESS,
  5: ALERT_STATUS.RESOLVED,
  6: ALERT_STATUS.RESOLVED,
  7: ALERT_STATUS.FALSE_POSITIVE,
};

export function getFoundationAlertDetail(alertId: string): AlertTriageDetail {
  const alert = foundationAlertQueue.find((item) => item.id === alertId) ?? foundationAlertQueue[0];
  const source = alert.adversary?.ip ?? alert.adversary?.host ?? alert.adversary?.name ?? 'Unavailable';
  const target = alert.target?.ip ?? alert.target?.host ?? alert.target?.name ?? 'Unavailable';

  return {
    id: alert.id,
    severity: alert.severity,
    timestamp: alert.timestamp,
    title: alert.name,
    category: alert.category ?? 'Uncategorized',
    status: statusNames[alert.status] ?? ALERT_STATUS.OPEN,
    statusCode: alert.status,
    adversary: {
      ip: alert.adversary?.ip ?? null,
      hostname: alert.adversary?.host ?? null,
      processName: alert.category === 'Endpoint' ? 'powershell.exe' : null,
      username: alert.primaryEntity?.type === 'user' ? alert.primaryEntity.label : null,
      networkIds: alert.adversary?.ip ? [alert.adversary.ip] : [],
    },
    target: {
      ip: alert.target?.ip ?? null,
      hostname: alert.target?.host ?? null,
      processName: null,
      username: null,
      networkIds: alert.target?.ip ? [alert.target.ip] : [],
    },
    tags: alert.tags ?? [],
    ruleId: alert.ruleId ?? null,
    ruleName: alert.ruleName ?? null,
    rawFields: {
      'event.id': `evt-${alert.id.toLowerCase()}`,
      'event.category': alert.category ?? 'unknown',
      'source.address': source,
      'destination.address': target,
      'host.name': alert.primaryEntity?.type === 'host' ? alert.primaryEntity.label : '—',
      'user.name': alert.primaryEntity?.type === 'user' ? alert.primaryEntity.label : '—',
      'rule.id': alert.ruleId ?? '—',
      'tenant.name': alert.tenantName ?? '—',
    },
    mitreTacticId: alert.mitreTacticId,
    mitreTacticName: alert.mitreTacticName,
    mitreTechniqueId: alert.mitreTechniqueId,
    mitreTechniqueName: alert.mitreTechniqueName,
    mitreTechniqueUrl: alert.mitreTechniqueUrl,
    killChainPhase: alert.killChainPhase,
    riskScore: alert.riskScore,
    confidence: alert.confidence,
    threatIntelMatched: alert.threatIntelMatched,
    threatIntelIndicatorType: alert.threatIntelIndicatorType,
    threatIntelSource: alert.threatIntelSource,
    threatIntelTlp: 'AMBER+STRICT',
    threatIntelConfidence: alert.threatIntelConfidence,
    tenantId: alert.tenantId,
    tenantName: alert.tenantName,
    slaDeadline: alert.slaDeadline,
    slaBreached: alert.slaBreached,
    assetId: alert.assetId,
    assetCriticality: alert.assetCriticality,
    assetOwner: alert.assetOwner,
    summary: alert.summary ?? null,
    reason: alert.reason ?? null,
    sourceProduct: alert.sourceProduct ?? null,
    assigneeName: alert.assigneeName ?? null,
    primaryEntity: alert.primaryEntity ?? null,
    relatedAlertCount: alert.relatedAlertCount ?? null,
    eventCount: alert.eventCount ?? null,
    occurrenceCount: alert.occurrenceCount ?? null,
    evidenceFields: [
      { field: 'source.address', value: source, source: alert.sourceProduct ?? 'Detection source', emphasis: alert.threatIntelMatched ? 'intel' : 'neutral' },
      { field: 'destination.address', value: target, source: alert.sourceProduct ?? 'Detection source', emphasis: alert.threatIntelMatched ? 'critical' : 'neutral' },
      { field: 'primary_entity', value: alert.primaryEntity?.label ?? 'Unavailable', source: 'Entity enrichment', emphasis: 'warning' },
      { field: 'rule.id', value: alert.ruleId ?? 'Unavailable', source: 'Detection engine', emphasis: 'neutral' },
    ],
    activity: [
      {
        id: `${alert.id}-created`,
        at: alert.timestamp,
        actor: alert.sourceProduct ?? 'Detection engine',
        action: 'Alert created',
        detail: `${alert.eventCount ?? 1} supporting events met the detection threshold.`,
      },
      {
        id: `${alert.id}-enriched`,
        at: alert.updatedAt ?? alert.timestamp,
        actor: 'HiveArmor enrichment',
        action: 'Context attached',
        detail: alert.threatIntelMatched ? 'Threat-intelligence and entity context were added.' : 'Entity and asset context were added.',
      },
      ...(alert.assigneeName ? [{
        id: `${alert.id}-assigned`,
        at: alert.updatedAt ?? alert.timestamp,
        actor: 'Queue automation',
        action: 'Ownership updated',
        detail: `Assigned to ${alert.assigneeName}.`,
      }] : []),
    ],
    version: alert.version ?? null,
    dataCompleteness: 'triage',
  };
}

function matchesSymbolicStatus(alert: AlertQueueRecord, status: string): boolean {
  const values = status.split(',').map((value) => value.trim().toLowerCase());
  const aliases: Record<string, number[]> = {
    open: [2],
    in_review: [3],
    in_progress: [3],
    completed: [5],
    true_positive: [6],
    false_positive: [7],
    active: [2, 3],
  };
  return values.some((value) => Number(value) === alert.status || aliases[value]?.includes(alert.status));
}

function searchableAlertText(alert: AlertQueueRecord): string {
  return [
    alert.id,
    alert.name,
    alert.summary,
    alert.reason,
    alert.primaryEntity?.label,
    alert.ruleName,
    alert.tenantName,
    ...(alert.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchesQueryClause(alert: AlertQueueRecord, clause: AlertQueryClause): boolean {
  const needle = clause.value.toLowerCase();
  let matched: boolean;

  switch (clause.paramKey) {
    case 'severity':
      matched = [numericToSeverityLevel(alert.severity), String(alert.severity)].includes(needle);
      break;
    case 'status':
      matched = matchesSymbolicStatus(alert, needle);
      break;
    case 'q':
      matched = searchableAlertText(alert).includes(needle);
      break;
    case 'assignee':
      matched = needle === 'me'
        ? alert.assigneeId === 41
        : needle === 'unassigned'
          ? !alert.assigneeName
          : (alert.assigneeName ?? '').toLowerCase().includes(needle);
      break;
    case 'tenantId':
      matched = [alert.tenantId, alert.tenantName].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
      break;
    case 'category':
      matched = clause.contains
        ? (alert.category ?? '').toLowerCase().includes(needle)
        : (alert.category ?? '').toLowerCase() === needle;
      break;
    case 'riskMin':
      matched = Number.isFinite(Number(needle)) && (alert.riskScore ?? 0) >= Number(needle);
      break;
    case 'sla':
      matched = alert.slaStatus === needle;
      break;
    case 'threatIntel':
      matched = needle === 'matched' && Boolean(alert.threatIntelMatched);
      break;
    case 'adversaryIp':
      matched = Object.values(alert.adversary ?? {}).some((value) => String(value).toLowerCase().includes(needle));
      break;
    case 'targetIp':
      matched = Object.values(alert.target ?? {}).some((value) => String(value).toLowerCase().includes(needle));
      break;
    case 'tags':
      matched = (alert.tags ?? []).some((tag) => clause.contains ? tag.toLowerCase().includes(needle) : tag.toLowerCase() === needle);
      break;
    default:
      matched = false;
  }

  return clause.negated ? !matched : matched;
}

function matchesQueryExpression(alert: AlertQueueRecord, expression: string): boolean {
  const parsed = parseAlertQueryExpression(expression);
  if (!parsed || parsed.clauses.length === 0) return Boolean(parsed);

  // AND binds more tightly than OR, matching the backend contract documented in ALT-014.
  let matchedOrGroup = false;
  let matchedAndGroup = matchesQueryClause(alert, parsed.clauses[0]);
  for (let index = 0; index < parsed.joins.length; index += 1) {
    const nextMatch = matchesQueryClause(alert, parsed.clauses[index + 1]);
    if (parsed.joins[index] === 'AND') {
      matchedAndGroup = matchedAndGroup && nextMatch;
    } else {
      matchedOrGroup = matchedOrGroup || matchedAndGroup;
      matchedAndGroup = nextMatch;
    }
  }
  return matchedOrGroup || matchedAndGroup;
}

export function filterFoundationAlertQueue(filters: AlertQueueFilters): AlertQueueRecord[] {
  const severityValues = filters.severity?.split(',').map((value) => value.trim().toLowerCase()) ?? [];
  const query = filters.q?.trim().toLowerCase();
  const from = filters.from ? new Date(filters.from).getTime() : null;
  const to = filters.to ? new Date(filters.to).getTime() : null;

  return foundationAlertQueue.filter((alert) => {
    const level = numericToSeverityLevel(alert.severity);
    if (severityValues.length && !severityValues.includes(level) && !severityValues.includes(String(alert.severity))) return false;
    if (filters.status && !matchesSymbolicStatus(alert, filters.status)) return false;
    if (filters.assignee === 'unassigned' && alert.assigneeName) return false;
    if (filters.assignee === 'me' && alert.assigneeId !== 41) return false;
    if (filters.tenantId && alert.tenantId !== filters.tenantId) return false;
    if (filters.category && alert.category?.toLowerCase() !== filters.category.toLowerCase()) return false;
    if (filters.riskMin && (alert.riskScore ?? 0) < Number(filters.riskMin)) return false;
    if (filters.sla && alert.slaStatus !== filters.sla) return false;
    if (filters.threatIntel === 'matched' && !alert.threatIntelMatched) return false;
    if (filters.adversaryIp && !Object.values(alert.adversary ?? {}).some((value) => String(value).includes(filters.adversaryIp ?? ''))) return false;
    if (filters.targetIp && !Object.values(alert.target ?? {}).some((value) => String(value).includes(filters.targetIp ?? ''))) return false;
    if (filters.tags && !(alert.tags ?? []).some((tag) => tag.toLowerCase().includes(filters.tags?.toLowerCase() ?? ''))) return false;
    if (query && !searchableAlertText(alert).includes(query)) return false;
    if (filters.queryExpression && !matchesQueryExpression(alert, filters.queryExpression)) return false;
    const timestamp = new Date(alert['@timestamp']).getTime();
    if (from !== null && timestamp < from) return false;
    if (to !== null && timestamp > to) return false;
    return true;
  });
}
