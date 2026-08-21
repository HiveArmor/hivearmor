/** Stable fictional detection content used only by the authenticated foundation fixture build. */

import type { DetectionExecution, DetectionRule, DetectionRuleSummary, DetectionRuleVersion, DetectionSampleEvent, RuleListParams } from './detectionRules.types';

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

export const foundationDetectionRules: DetectionRule[] = Array.from({ length: 48 }, (_, index) => {
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
];

export const foundationDetectionRuleVersions: DetectionRuleVersion[] = [
  { id: 1, ruleId: 4103, versionNum: 5, changedBy: 'Maya Chen', changedAt: '2026-08-03T12:56:00Z', changeNote: 'Tuned the network destination filter after preview review.', ruleSnapshot: foundationDetectionRules[3]?.ruleDefinition ?? '' },
  { id: 2, ruleId: 4103, versionNum: 4, changedBy: 'Omar Haddad', changedAt: '2026-08-02T16:18:00Z', changeNote: 'Added Web Protocols ATT&CK mapping and source coverage.', ruleSnapshot: (foundationDetectionRules[3]?.ruleDefinition ?? '').replace('status: experimental', 'status: test') },
  { id: 3, ruleId: 4103, versionNum: 3, changedBy: 'SOC Content Pipeline', changedAt: '2026-07-29T09:42:00Z', changeNote: 'Imported upstream managed-content revision.', ruleSnapshot: (foundationDetectionRules[3]?.ruleDefinition ?? '').replace('level: high', 'level: medium') },
  { id: 4, ruleId: 4103, versionNum: 2, changedBy: 'Elena Rossi', changedAt: '2026-07-24T11:05:00Z', changeNote: 'Initial production validation.', ruleSnapshot: foundationDetectionRules[3]?.ruleDefinition ?? '' },
];

export function filterFoundationDetectionRules(params: RuleListParams): { items: DetectionRule[]; total: number } {
  const query = params.search?.trim().toLowerCase();
  const filtered = foundationDetectionRules.filter((rule) => {
    if (query && ![rule.ruleName, rule.description, rule.techniqueId, rule.techniqueName, rule.tactic, rule.sigmaRuleId]
      .some((value) => value?.toLowerCase().includes(query))) return false;
    if (params.active !== undefined && params.active !== 'all' && rule.ruleActive !== params.active) return false;
    if (params.origin && params.origin !== 'all' && rule.origin !== params.origin) return false;
    if (params.health && params.health !== 'all' && rule.health !== params.health) return false;
    if (params.severity && params.severity !== 'all' && rule.severity !== params.severity) return false;
    if (params.dataType?.length && !params.dataType.some((type) => rule.dataTypes.includes(type))) return false;
    if (params.technique && rule.techniqueId !== params.technique) return false;
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
