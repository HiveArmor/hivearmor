/** Stable fictional detection content used only by the authenticated foundation fixture build. */

import type { DetectionExecution, DetectionRule, DetectionRuleSummary, DetectionRuleVersion, DetectionSampleEvent, RuleListParams } from './detectionRules.types';

const ENTERPRISE_PACK = 'enterprise-pack';

const enterprisePackRules: DetectionRule[] = [
  {
    id: 9101,
    ruleName: 'SEQ-BRUTE-FORCE-THEN-SUCCESS',
    description: 'Failed authentication followed by a successful logon from the same origin within 30 minutes.',
    dataTypes: ['windows', 'linux'],
    tags: [ENTERPRISE_PACK, 'sequence'],
    ruleActive: true,
    lastModified: '2026-09-07T16:40:00Z',
    sigmaRuleId: null,
    category: 'Credential Access',
    severity: 'high',
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    origin: 'managed',
    engine: 'sequence',
    contentPack: ENTERPRISE_PACK,
    health: 'healthy',
    healthMessage: 'Sequence engine loaded this staging pack rule.',
    lastRunAt: '2026-09-07T16:12:00Z',
    lastRunDurationMs: 240,
    schedule: 'Streaming',
    lookback: '30m',
    alerts24h: 2,
    matchCount: 2,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: false,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['origin.ip', 'origin.user'],
    deduplicateBy: ['origin.ip'],
    references: ['https://attack.mitre.org/techniques/T1110/'],
    responseMode: 'alert-only',
    ruleDefinition: `id: 9101
name: SEQ-BRUTE-FORCE-THEN-SUCCESS
dataTypes: [windows, linux]
sequence:
  - where: 'action == "failed_auth"'
    within: 15m
  - where: 'action == "authentication_success"'
    within: 30m`,
  },
  {
    id: 9102,
    ruleName: 'SEQ-RECON-THEN-LATERAL',
    description: 'Network scan followed by a remote service logon from the same origin IP within 30 minutes.',
    dataTypes: ['windows', 'linux', 'network'],
    tags: [ENTERPRISE_PACK, 'sequence'],
    ruleActive: true,
    lastModified: '2026-09-07T16:41:00Z',
    sigmaRuleId: null,
    category: 'Lateral Movement',
    severity: 'high',
    techniqueId: 'T1021',
    techniqueName: 'Remote Services',
    tactic: 'Lateral Movement',
    origin: 'managed',
    engine: 'sequence',
    contentPack: ENTERPRISE_PACK,
    health: 'healthy',
    healthMessage: 'Sequence engine loaded this staging pack rule.',
    lastRunAt: '2026-09-07T16:14:00Z',
    lastRunDurationMs: 310,
    schedule: 'Streaming',
    lookback: '30m',
    alerts24h: 1,
    matchCount: 1,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: false,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['origin.ip'],
    deduplicateBy: ['origin.ip'],
    references: ['https://attack.mitre.org/techniques/T1021/'],
    responseMode: 'alert-only',
    ruleDefinition: `id: 9102
name: SEQ-RECON-THEN-LATERAL
dataTypes: [windows, linux, network]
sequence:
  - where: 'action == "port_scan"'
    within: 10m
  - where: 'action == "remote_logon"'
    within: 30m`,
  },
  {
    id: 9103,
    ruleName: 'RISK-FAILED-AUTH-ACCUMULATION',
    description: 'Accumulates risk for repeated failed authentication instead of a one-shot CEL alert.',
    dataTypes: ['windows', 'linux'],
    tags: [ENTERPRISE_PACK, 'risk'],
    ruleActive: true,
    lastModified: '2026-09-07T16:42:00Z',
    sigmaRuleId: null,
    category: 'Credential Access',
    severity: 'medium',
    techniqueId: 'T1110',
    techniqueName: 'Brute Force',
    tactic: 'Credential Access',
    origin: 'managed',
    engine: 'risk',
    contentPack: ENTERPRISE_PACK,
    health: 'healthy',
    healthMessage: 'Risk engine loaded this staging pack rule.',
    lastRunAt: '2026-09-07T16:15:00Z',
    lastRunDurationMs: 90,
    schedule: 'Streaming',
    lookback: '1h',
    alerts24h: 0,
    matchCount: 14,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: false,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['origin.ip'],
    deduplicateBy: ['origin.ip'],
    references: ['https://attack.mitre.org/techniques/T1110/'],
    responseMode: 'alert-only',
    ruleDefinition: `id: 9103
name: RISK-FAILED-AUTH-ACCUMULATION
riskScore: 25
where: 'safe("log.action", "") == "failed_auth" && safe("origin.ip", "") != ""'`,
  },
  {
    id: 9104,
    ruleName: 'RISK-ENCODED-POWERSHELL',
    description: 'Accumulates risk when encoded PowerShell is observed, feeding the risk engine.',
    dataTypes: ['windows', 'powershell', 'process'],
    tags: [ENTERPRISE_PACK, 'risk'],
    ruleActive: true,
    lastModified: '2026-09-07T16:43:00Z',
    sigmaRuleId: null,
    category: 'Execution',
    severity: 'high',
    techniqueId: 'T1059.001',
    techniqueName: 'PowerShell',
    tactic: 'Execution',
    origin: 'managed',
    engine: 'risk',
    contentPack: ENTERPRISE_PACK,
    health: 'healthy',
    healthMessage: 'Risk engine loaded this staging pack rule.',
    lastRunAt: '2026-09-07T16:16:00Z',
    lastRunDurationMs: 110,
    schedule: 'Streaming',
    lookback: '1h',
    alerts24h: 0,
    matchCount: 6,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: false,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['origin.host'],
    deduplicateBy: ['origin.host', 'origin.command'],
    references: ['https://attack.mitre.org/techniques/T1059/001/'],
    responseMode: 'alert-only',
    ruleDefinition: `id: 9104
name: RISK-ENCODED-POWERSHELL
riskScore: 40
where: 'safe("origin.process", "") == "powershell.exe"'`,
  },
  {
    id: 9105,
    ruleName: 'GRAPH-PRIVILEGED-PIVOT-THEN-C2',
    description: 'Privileged user on two hosts plus an external IP within 4h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux'],
    tags: [ENTERPRISE_PACK, 'graph'],
    ruleActive: true,
    lastModified: '2026-09-07T16:44:00Z',
    sigmaRuleId: null,
    category: 'Lateral Movement',
    severity: 'critical',
    techniqueId: 'T1078',
    techniqueName: 'Valid Accounts',
    tactic: 'Lateral Movement',
    origin: 'managed',
    engine: 'graph',
    contentPack: ENTERPRISE_PACK,
    health: 'warning',
    healthMessage: 'Graph-offense rules require Neo4j (NEO4J_ENABLED). Staging may be idle if Neo4j is off.',
    lastRunAt: null,
    lastRunDurationMs: null,
    schedule: 'Every 2m',
    lookback: '4h',
    alerts24h: 0,
    matchCount: 0,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: true,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['user'],
    deduplicateBy: ['user', 'pivotHost'],
    references: ['https://attack.mitre.org/techniques/T1078/'],
    responseMode: 'create-incident',
    ruleDefinition: `id: 9105
name: GRAPH-PRIVILEGED-PIVOT-THEN-C2
type: graph_offense
cypherQuery: |
  MATCH (u:User)-[:LOGGED_INTO]->(h1:Host), (u)-[:LOGGED_INTO]->(h2:Host)
  WHERE h1.hostname <> h2.hostname
  RETURN u.username AS user`,
  },
];

const ruleSeeds = [
  ['Encoded PowerShell with network retrieval', 'Endpoint', 'critical', 'T1059.001', 'PowerShell', 'Execution'],
  ['Rare privileged authentication followed by execution', 'Identity', 'critical', 'T1078', 'Valid Accounts', 'Defense Evasion'],
  ['Suspicious LSASS memory access', 'Endpoint', 'critical', 'T1003.001', 'LSASS Memory', 'Credential Access'],
  ['First-seen external destination from managed host', 'Network', 'high', 'T1071.001', 'Web Protocols', 'Command and Control'],
  ['Kerberoasting service ticket activity', 'Identity', 'high', 'T1558.003', 'Kerberoasting', 'Credential Access'],
  ['Remote service creation from administrative share', 'Windows', 'high', 'T1021.002', 'SMB/Windows Admin Shares', 'Lateral Movement'],
  ['Cloud role assignment outside change window', 'Cloud', 'high', 'T1098', 'Account Manipulation', 'Persistence'],
  ['DNS tunneling with high-entropy subdomains', 'DNS', 'high', 'T1071.004', 'DNS', 'Command and Control'],
  ['Executable written to user startup directory', 'Endpoint', 'medium', 'T1547.001', 'Registry Run Keys / Startup Folder', 'Persistence'],
  ['Multiple failed logons followed by success', 'Identity', 'medium', 'T1110', 'Brute Force', 'Credential Access'],
  ['Unsigned binary launched from temporary path', 'Endpoint', 'medium', 'T1204.002', 'Malicious File', 'Execution'],
  ['Mailbox forwarding rule created', 'Email', 'medium', 'T1114.003', 'Email Forwarding Rule', 'Collection'],
] as const;

const healthCycle: DetectionRule['health'][] = ['healthy', 'healthy', 'healthy', 'warning', 'healthy', 'failed'];
const users = ['Maya Chen', 'Omar Haddad', 'Elena Rossi', 'SOC Content Pipeline'];

const generatedDetectionRules: DetectionRule[] = Array.from({ length: 48 }, (_, index) => {
  const seed = ruleSeeds[index % ruleSeeds.length];
  const copy = Math.floor(index / ruleSeeds.length);
  const health = healthCycle[index % healthCycle.length];
  const origin = index % 4 === 0 || index % 7 === 0 ? 'custom' : 'managed';
  const active = index % 9 !== 0;
  const modifiedHour = 13 - (index % 11);
  return {
    id: 4100 + index,
    ruleName: `${seed[0]}${copy ? ` · Variant ${copy + 1}` : ''}`,
    description: `Detects ${seed[4].toLowerCase()} behavior using normalized ${seed[1].toLowerCase()} telemetry and bounded correlation windows.`,
    dataTypes: [seed[1], index % 3 === 0 ? 'Normalized events' : 'Security telemetry'],
    ruleActive: active,
    lastModified: `2026-08-0${1 + (index % 3)}T${String(Math.max(1, modifiedHour)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00Z`,
    sigmaRuleId: origin === 'managed' ? `ha-sigma-${String(8000 + index)}` : null,
    category: seed[5],
    severity: seed[2],
    techniqueId: seed[3],
    techniqueName: seed[4],
    tactic: seed[5],
    origin,
    engine: 'cel',
    health: active ? health : 'unknown',
    healthMessage: !active ? 'Rule is disabled' : health === 'healthy' ? 'Last execution completed' : health === 'warning' ? 'Execution exceeded the normal duration' : 'Required data field was unavailable',
    lastRunAt: active ? `2026-08-03T${String(13 - (index % 6)).padStart(2, '0')}:${String(58 - (index % 12) * 4).padStart(2, '0')}:00Z` : null,
    lastRunDurationMs: active ? 180 + index * 37 : null,
    schedule: index % 3 === 0 ? 'Every 5m' : index % 3 === 1 ? 'Every 10m' : 'Every 15m',
    lookback: index % 3 === 0 ? '10m' : index % 3 === 1 ? '20m' : '30m',
    alerts24h: active ? (index * 17) % 43 : 0,
    matchCount: active ? (index * 17) % 43 : 0,
    version: 2 + (index % 8),
    createdBy: origin === 'managed' ? 'HiveArmor content' : users[index % users.length],
    updatedBy: users[index % users.length],
    hasGap: active && index % 13 === 0,
    threshold: 1 + (index % 4),
    suppressionDuration: index % 3 === 0 ? '15m' : 'Off',
    groupBy: index % 2 === 0 ? ['host.name', 'user.name'] : ['source.ip'],
    deduplicateBy: ['event.id'],
    references: ['https://attack.mitre.org/'],
    responseMode: index % 4 === 0 ? 'create-incident' : 'alert-only',
    ruleDefinition: `celExists(event.action) &&\nequals(event.action, "${seed[4].toLowerCase().replace(/ /g, '_')}") &&\n!equals(user.name, "approved-automation")`,
  };
});

export const foundationDetectionRules: DetectionRule[] = [...enterprisePackRules, ...generatedDetectionRules];

export const foundationDetectionExecutions: DetectionExecution[] = foundationDetectionRules
  .filter((rule) => rule.ruleActive)
  .map((rule, index) => ({
    id: `run-${rule.id}-20260803`,
    ruleId: rule.id,
    ruleName: rule.ruleName,
    status: rule.health === 'failed' ? 'failed' : rule.health === 'warning' ? 'warning' : 'succeeded',
    runType: rule.hasGap ? 'gap-fill' : index % 11 === 0 ? 'manual' : 'scheduled',
    startedAt: rule.lastRunAt ?? null,
    durationMs: rule.lastRunDurationMs ?? null,
    searchDurationMs: rule.lastRunDurationMs == null ? null : Math.round(rule.lastRunDurationMs * .68),
    alertDurationMs: rule.lastRunDurationMs == null ? null : Math.round(rule.lastRunDurationMs * .22),
    eventsScanned: 148_000 + index * 37_421,
    matches: rule.alerts24h ?? 0,
    alertsCreated: Math.min(rule.alerts24h ?? 0, 18),
    sourceCoverage: rule.health === 'failed' ? 67 : rule.health === 'warning' ? 86 : 100,
    gapDurationMinutes: rule.hasGap ? 35 + index * 3 : null,
    message: rule.healthMessage ?? 'Execution completed.',
  }));

export const foundationDetectionSampleEvents: DetectionSampleEvent[] = [
  {
    id: 'sample-powershell-001',
    label: 'Encoded PowerShell process start',
    dataType: 'Endpoint',
    json: JSON.stringify({ '@timestamp': '2026-08-03T13:15:42Z', event: { action: 'powershell' }, process: { name: 'powershell.exe', command_line: 'powershell.exe -enc RmljdGlvbmFsRGF0YQ==' }, host: { name: 'FIN-WKS-044' }, user: { name: 'a.patel' } }, null, 2),
  },
  {
    id: 'sample-identity-001',
    label: 'Privileged authentication sequence',
    dataType: 'Identity',
    json: JSON.stringify({ '@timestamp': '2026-08-03T12:51:11Z', event: { action: 'authentication_success' }, source: { ip: '198.51.100.42' }, user: { name: 'svc-finance', privileges: ['admin'] }, host: { name: 'IDM-DC-02' } }, null, 2),
  },
  {
    id: 'sample-dns-001',
    label: 'High-entropy DNS query',
    dataType: 'DNS',
    json: JSON.stringify({ '@timestamp': '2026-08-03T11:38:26Z', event: { action: 'dns_query' }, dns: { question: { name: 'a9d3c7f2.telemetry.example', type: 'A' } }, source: { ip: '10.44.8.19' } }, null, 2),
  },
  {
    id: 'sample-excepted-scanner-001',
    label: 'Approved scanner host (active exception)',
    dataType: 'Endpoint',
    json: JSON.stringify({
      '@timestamp': '2026-09-07T10:15:00Z',
      event: { action: 'powershell' },
      process: { name: 'powershell.exe', command_line: 'powershell.exe -enc RmljdGlvbmFsU2Nhbg==' },
      host: { name: 'approved-scanner' },
      user: { name: 'svc-scan' },
      origin: { host: 'approved-scanner', user: 'svc-scan' },
    }, null, 2),
  },
  {
    id: 'sample-baseline-excepted-001',
    label: 'Baseline anomaly on approved scanner (active exception)',
    dataType: 'Endpoint',
    json: JSON.stringify({
      '@timestamp': '2026-09-07T10:22:00Z',
      event: { action: 'anomaly' },
      dataSource: 'windows-security',
      host: { name: 'lab-baseline-host' },
      user: { name: 'svc-scan' },
      origin: { host: 'lab-baseline-host', user: 'svc-scan' },
    }, null, 2),
  },
  {
    id: 'sample-sequence-auth-001',
    label: 'Failed then successful authentication (sequence step 2)',
    dataType: 'Identity',
    json: JSON.stringify({
      '@timestamp': '2026-09-07T16:18:00Z',
      action: 'authentication_success',
      log: { action: 'authentication_success' },
      origin: { ip: '203.0.113.40', user: 'j.ortiz', host: 'FIN-WKS-018' },
    }, null, 2),
  },
];

const versionedRule = foundationDetectionRules.find((rule) => rule.id === 4103);

export const foundationDetectionRuleVersions: DetectionRuleVersion[] = [
  { id: 1, ruleId: 4103, versionNum: 5, changedBy: 'Maya Chen', changedAt: '2026-08-03T12:56:00Z', changeNote: 'Tuned the network destination filter after preview review.', ruleSnapshot: versionedRule?.ruleDefinition ?? '' },
  { id: 2, ruleId: 4103, versionNum: 4, changedBy: 'Omar Haddad', changedAt: '2026-08-02T16:18:00Z', changeNote: 'Added Web Protocols ATT&CK mapping and source coverage.', ruleSnapshot: (versionedRule?.ruleDefinition ?? '').replace('status: experimental', 'status: test') },
  { id: 3, ruleId: 4103, versionNum: 3, changedBy: 'SOC Content Pipeline', changedAt: '2026-07-29T09:42:00Z', changeNote: 'Imported upstream managed-content revision.', ruleSnapshot: (versionedRule?.ruleDefinition ?? '').replace('level: high', 'level: medium') },
  { id: 4, ruleId: 4103, versionNum: 2, changedBy: 'Elena Rossi', changedAt: '2026-07-24T11:05:00Z', changeNote: 'Initial production validation.', ruleSnapshot: versionedRule?.ruleDefinition ?? '' },
];

export function filterFoundationDetectionRules(params: RuleListParams): { items: DetectionRule[]; total: number } {
  const query = params.search?.trim().toLowerCase();
  const filtered = foundationDetectionRules.filter((rule) => {
    if (query && ![rule.ruleName, rule.description, rule.techniqueId, rule.techniqueName, rule.tactic, rule.sigmaRuleId, rule.engine, rule.contentPack]
      .some((value) => value?.toLowerCase().includes(query))) return false;
    if (params.active !== undefined && params.active !== 'all' && rule.ruleActive !== params.active) return false;
    if (params.origin && params.origin !== 'all' && rule.origin !== params.origin) return false;
    if (params.source === 'sigma' && !rule.sigmaRuleId) return false;
    if (params.source === 'native' && rule.sigmaRuleId) return false;
    if (params.health && params.health !== 'all' && rule.health !== params.health) return false;
    if (params.severity && params.severity !== 'all' && rule.severity !== params.severity) return false;
    if (params.dataType?.length && !params.dataType.some((type) => rule.dataTypes.includes(type))) return false;
    if (params.technique && rule.techniqueId !== params.technique) return false;
    if (params.engine && params.engine !== 'all' && (rule.engine ?? 'cel') !== params.engine) return false;
    return true;
  });
  const start = (params.page ?? 0) * (params.size ?? 100);
  return { items: filtered.slice(start, start + (params.size ?? 100)), total: filtered.length };
}

export const foundationDetectionRuleSummary: DetectionRuleSummary = {
  total: foundationDetectionRules.length,
  enabled: foundationDetectionRules.filter((rule) => rule.ruleActive).length,
  healthy: foundationDetectionRules.filter((rule) => rule.health === 'healthy').length,
  degraded: foundationDetectionRules.filter((rule) => rule.health === 'warning' || rule.health === 'failed').length,
  alerts24h: foundationDetectionRules.reduce((total, rule) => total + (rule.alerts24h ?? 0), 0),
  coverageTechniques: new Set(foundationDetectionRules.map((rule) => rule.techniqueId)).size,
  coverageTechniquesTotal: 204,
  snapshotAt: '2026-08-03T13:16:00Z',
};
