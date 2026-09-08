/** Stable fictional detection content used only by the authenticated foundation fixture build. */

import type { DetectionExecution, DetectionRule, DetectionRuleSummary, DetectionRuleVersion, DetectionSampleEvent, RuleListParams } from './detectionRules.types';

import { isDetectionContentVisible } from '@/services/detectionPack.service';

const ENTERPRISE_PACK = 'enterprise-pack';
const SKILL_PACK = 'skill-content-pack';

/** DET-SEQ staging pack IDs (sequence 9101-9102/9106-9110, risk 9103-9104/9111-9114, graph 9105/9115-9118). */
export const ENTERPRISE_PACK_RULE_IDS = [9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 9110, 9111, 9112, 9113, 9114, 9115, 9116, 9117, 9118] as const;

/** Skill-driven content pack IDs (CEL 9401-9406, sequence 9407-9411, risk 9412-9414, graph 9415-9416). */
export const SKILL_PACK_RULE_IDS = [9401, 9402, 9403, 9404, 9405, 9406, 9407, 9408, 9409, 9410, 9411, 9412, 9413, 9414, 9415, 9416] as const;

interface PackSeed {
  id: number;
  ruleName: string;
  description: string;
  dataTypes: string[];
  engine: 'cel' | 'sequence' | 'risk' | 'graph';
  category: string;
  severity: DetectionRule['severity'];
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  lookback: string;
  groupBy: string[];
  ruleDefinition: string;
  alerts24h?: number;
  matchCount?: number;
  references?: string[];
  contentPack?: string;
}

function packHealthMessage(engine: PackSeed['engine']): string {
  if (engine === 'graph') {
    return 'Graph-offense evaluator starts with NEO4J_ENABLED=true on local-dev/staging event-processor. Neo4j was already in local-dev compose; the flag was never flipped. Staging Neo4j is new; graph stays empty without entity-graph ingest.';
  }
  if (engine === 'sequence') {
    return 'Sequence engine loaded this staging pack rule.';
  }
  if (engine === 'risk') {
    return 'Risk engine scores a where match only after afterEvents lookback succeeds (or if the rule has no afterEvents).';
  }
  return 'CEL engine evaluates the where clause against normalized events. afterEvents lookback uses v3-hive-log-*.';
}

function packRule(seed: PackSeed, index: number): DetectionRule {
  const isGraph = seed.engine === 'graph';
  const pack = seed.contentPack ?? ENTERPRISE_PACK;
  return {
    id: seed.id,
    ruleName: seed.ruleName,
    description: seed.description,
    dataTypes: seed.dataTypes,
    tags: [pack, seed.engine],
    ruleActive: true,
    lastModified: `2026-09-07T16:${String(40 + index).padStart(2, '0')}:00Z`,
    sigmaRuleId: null,
    category: seed.category,
    severity: seed.severity,
    techniqueId: seed.techniqueId,
    techniqueName: seed.techniqueName,
    tactic: seed.tactic,
    origin: 'managed',
    engine: seed.engine,
    contentPack: pack,
    health: isGraph ? 'warning' : 'healthy',
    healthMessage: packHealthMessage(seed.engine),
    lastRunAt: isGraph ? null : `2026-09-07T16:${String(12 + index).padStart(2, '0')}:00Z`,
    lastRunDurationMs: isGraph ? null : 90 + index * 20,
    schedule: isGraph ? 'Every 2m' : 'Streaming',
    lookback: seed.lookback,
    alerts24h: seed.alerts24h ?? 0,
    matchCount: seed.matchCount ?? 0,
    version: 1,
    createdBy: 'HiveArmor content',
    updatedBy: 'SOC Content Pipeline',
    hasGap: isGraph,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: seed.groupBy,
    deduplicateBy: seed.groupBy,
    references: seed.references ?? [`https://attack.mitre.org/techniques/${seed.techniqueId.replace('.', '/')}/`],
    responseMode: isGraph ? 'create-incident' : 'alert-only',
    ruleDefinition: seed.ruleDefinition,
  };
}

const enterprisePackSeeds: PackSeed[] = [
  {
    id: 9101, ruleName: 'SEQ-BRUTE-FORCE-THEN-SUCCESS', engine: 'sequence',
    description: 'Failed authentication followed by a successful logon from the same origin within 30 minutes.',
    dataTypes: ['windows', 'linux'], category: 'Credential Access', severity: 'high',
    techniqueId: 'T1110', techniqueName: 'Brute Force', tactic: 'Credential Access', lookback: '30m',
    groupBy: ['origin.ip', 'origin.user'], alerts24h: 2, matchCount: 2,
    ruleDefinition: `id: 9101\nname: SEQ-BRUTE-FORCE-THEN-SUCCESS\nmitre:\n  attacks: [T1110]\nsequence:\n  - where: 'action == "failed_auth"'\n    within: 15m\n  - where: 'action == "authentication_success"'\n    within: 30m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9102, ruleName: 'SEQ-RECON-THEN-LATERAL', engine: 'sequence',
    description: 'Network scan followed by a remote service logon from the same origin IP within 30 minutes.',
    dataTypes: ['windows', 'linux', 'network'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1021', techniqueName: 'Remote Services', tactic: 'Lateral Movement', lookback: '30m',
    groupBy: ['origin.ip'], alerts24h: 1, matchCount: 1,
    ruleDefinition: `id: 9102\nname: SEQ-RECON-THEN-LATERAL\nmitre:\n  attacks: [T1046, T1021]\nsequence:\n  - where: 'action == "port_scan"'\n    within: 10m\n  - where: 'action == "remote_logon"'\n    within: 30m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9103, ruleName: 'RISK-FAILED-AUTH-ACCUMULATION', engine: 'risk',
    description: 'Accumulates risk for repeated failed authentication instead of a one-shot CEL alert.',
    dataTypes: ['windows', 'linux'], category: 'Credential Access', severity: 'medium',
    techniqueId: 'T1110', techniqueName: 'Brute Force', tactic: 'Credential Access', lookback: '1h',
    groupBy: ['origin.ip'], matchCount: 14,
    ruleDefinition: `id: 9103\nname: RISK-FAILED-AUTH-ACCUMULATION\nriskScore: 25\nwhere: 'safe("log.action", "") == "failed_auth"'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9104, ruleName: 'RISK-ENCODED-POWERSHELL', engine: 'risk',
    description: 'Accumulates risk when encoded PowerShell is observed, feeding the risk engine.',
    dataTypes: ['windows', 'powershell', 'process'], category: 'Execution', severity: 'high',
    techniqueId: 'T1059.001', techniqueName: 'PowerShell', tactic: 'Execution', lookback: '1h',
    groupBy: ['origin.host'], matchCount: 6,
    ruleDefinition: `id: 9104\nname: RISK-ENCODED-POWERSHELL\nriskScore: 40\nwhere: 'safe("origin.process", "") == "powershell.exe"'`,
  },
  {
    id: 9105, ruleName: 'GRAPH-PRIVILEGED-PIVOT-THEN-C2', engine: 'graph',
    description: 'Privileged user on two hosts plus an external IP within 4h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux'], category: 'Lateral Movement', severity: 'critical',
    techniqueId: 'T1078', techniqueName: 'Valid Accounts', tactic: 'Lateral Movement', lookback: '4h',
    groupBy: ['user'],
    ruleDefinition: `id: 9105\nname: GRAPH-PRIVILEGED-PIVOT-THEN-C2\ntype: graph_offense\nmitre:\n  attacks: [T1078, T1021]\ncypherQuery: |\n  MATCH (u:User)-[:LOGGED_INTO]->(h1:Host), (u)-[:LOGGED_INTO]->(h2:Host)\n  WHERE h1.hostname <> h2.hostname\n  RETURN u.username AS user`,
  },
  {
    id: 9106, ruleName: 'SEQ-PHISH-THEN-MACRO-EXEC', engine: 'sequence',
    description: 'Phishing attachment delivery followed by Office/macro execution from the same user within 45 minutes.',
    dataTypes: ['windows', 'email', 'process'], category: 'Execution', severity: 'high',
    techniqueId: 'T1566.001', techniqueName: 'Spearphishing Attachment', tactic: 'Initial Access', lookback: '45m',
    groupBy: ['origin.user', 'origin.host'], alerts24h: 1, matchCount: 1,
    ruleDefinition: `id: 9106\nname: SEQ-PHISH-THEN-MACRO-EXEC\nmitre:\n  attacks: [T1566.001, T1204.002]\nsequence:\n  - where: 'action == "phishing_delivery"'\n    within: 20m\n  - where: 'action == "macro_execution"'\n    within: 45m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9107, ruleName: 'SEQ-CRED-DUMP-THEN-LATERAL', engine: 'sequence',
    description: 'LSASS/credential dump followed by a remote service logon from the same host within 30 minutes.',
    dataTypes: ['windows', 'process'], category: 'Lateral Movement', severity: 'critical',
    techniqueId: 'T1003.001', techniqueName: 'LSASS Memory', tactic: 'Credential Access', lookback: '30m',
    groupBy: ['origin.host'], alerts24h: 1, matchCount: 1,
    ruleDefinition: `id: 9107\nname: SEQ-CRED-DUMP-THEN-LATERAL\nmitre:\n  attacks: [T1003.001, T1021]\nsequence:\n  - where: 'action == "credential_dump"'\n    within: 10m\n  - where: 'action == "remote_logon"'\n    within: 30m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9108, ruleName: 'SEQ-PERSIST-THEN-C2', engine: 'sequence',
    description: 'Scheduled-task or cron persistence followed by outbound C2-style communication within 1 hour.',
    dataTypes: ['windows', 'linux', 'process', 'netconn'], category: 'Command and Control', severity: 'high',
    techniqueId: 'T1071', techniqueName: 'Application Layer Protocol', tactic: 'Command and Control', lookback: '1h',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9108\nname: SEQ-PERSIST-THEN-C2\nmitre:\n  attacks: [T1053.005, T1071]\nsequence:\n  - where: 'action == "persistence_create"'\n    within: 15m\n  - where: 'action == "c2_beacon"'\n    within: 1h\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9109, ruleName: 'SEQ-DEFENSE-EVASION-THEN-EXFIL', engine: 'sequence',
    description: 'Log-clearing or defense-evasion followed by outbound data transfer from the same host within 45 minutes.',
    dataTypes: ['windows', 'linux', 'process', 'netconn'], category: 'Exfiltration', severity: 'high',
    techniqueId: 'T1041', techniqueName: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration', lookback: '45m',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9109\nname: SEQ-DEFENSE-EVASION-THEN-EXFIL\nmitre:\n  attacks: [T1070, T1041]\nsequence:\n  - where: 'action == "defense_evasion"'\n    within: 15m\n  - where: 'action == "data_exfil"'\n    within: 45m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9110, ruleName: 'SEQ-RDP-THEN-ADMIN-SHARE', engine: 'sequence',
    description: 'Successful RDP logon followed by admin-share (C$/ADMIN$) access from the same origin IP within 20 minutes.',
    dataTypes: ['windows', 'network'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1021.002', techniqueName: 'SMB/Windows Admin Shares', tactic: 'Lateral Movement', lookback: '20m',
    groupBy: ['origin.ip'], matchCount: 1,
    ruleDefinition: `id: 9110\nname: SEQ-RDP-THEN-ADMIN-SHARE\nmitre:\n  attacks: [T1021.001, T1021.002]\nsequence:\n  - where: 'action == "rdp_logon"'\n    within: 10m\n  - where: 'action == "admin_share_access"'\n    within: 20m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9111, ruleName: 'RISK-LSASS-MEMORY-ACCESS', engine: 'risk',
    description: 'Accumulates risk when process access or dump tooling targets lsass.exe.',
    dataTypes: ['windows', 'process'], category: 'Credential Access', severity: 'critical',
    techniqueId: 'T1003.001', techniqueName: 'LSASS Memory', tactic: 'Credential Access', lookback: '1h',
    groupBy: ['origin.host'], matchCount: 4,
    ruleDefinition: `id: 9111\nname: RISK-LSASS-MEMORY-ACCESS\nriskScore: 45\nwhere: 'raw.matches("(?i).*lsass.*")'`,
  },
  {
    id: 9112, ruleName: 'RISK-SCHEDULED-TASK-CREATE', engine: 'risk',
    description: 'Accumulates risk when schtasks.exe creates a scheduled task.',
    dataTypes: ['windows', 'process'], category: 'Persistence', severity: 'medium',
    techniqueId: 'T1053.005', techniqueName: 'Scheduled Task', tactic: 'Persistence', lookback: '1h',
    groupBy: ['origin.host'], matchCount: 3,
    ruleDefinition: `id: 9112\nname: RISK-SCHEDULED-TASK-CREATE\nriskScore: 30\nwhere: 'raw.matches("(?i).*schtasks.*/create.*")'`,
  },
  {
    id: 9113, ruleName: 'RISK-CLOUD-IAM-PRIVILEGE', engine: 'risk',
    description: 'Accumulates risk for IAM/role assignments that grant AdministratorAccess or privileged directory roles.',
    dataTypes: ['aws', 'azure'], category: 'Persistence', severity: 'high',
    techniqueId: 'T1098', techniqueName: 'Account Manipulation', tactic: 'Persistence', lookback: '1h',
    groupBy: ['origin.user'], matchCount: 2,
    ruleDefinition: `id: 9113\nname: RISK-CLOUD-IAM-PRIVILEGE\nriskScore: 35\nwhere: 'raw.matches("(?i).*AdministratorAccess.*")'`,
  },
  {
    id: 9114, ruleName: 'RISK-DNS-TUNNEL-ENTROPY', engine: 'risk',
    description: 'Accumulates risk for suspiciously long DNS query labels consistent with tunneling.',
    dataTypes: ['dns', 'network'], category: 'Command and Control', severity: 'medium',
    techniqueId: 'T1071.004', techniqueName: 'DNS', tactic: 'Command and Control', lookback: '10m',
    groupBy: ['origin.ip'], matchCount: 11,
    ruleDefinition: `id: 9114\nname: RISK-DNS-TUNNEL-ENTROPY\nriskScore: 20\nwhere: 'raw.matches("(?i).*[A-Za-z0-9]{40,}\\\\..*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9115, ruleName: 'GRAPH-DORMANT-ACCOUNT-EXTERNAL', engine: 'graph',
    description: 'Dormant account (30d idle) then external IP from the login host. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux'], category: 'Initial Access', severity: 'high',
    techniqueId: 'T1078', techniqueName: 'Valid Accounts', tactic: 'Initial Access', lookback: '24h',
    groupBy: ['user'],
    ruleDefinition: `id: 9115\nname: GRAPH-DORMANT-ACCOUNT-EXTERNAL\ntype: graph_offense\nmitre:\n  attacks: [T1078]\ncypherQuery: |\n  MATCH (u:User)-[:LOGGED_INTO]->(h:Host)-[:COMMUNICATED_WITH]->(extIP:IpAddress)\n  RETURN u.username AS user`,
  },
  {
    id: 9116, ruleName: 'GRAPH-MULTI-HOST-C2-BEACON', engine: 'graph',
    description: 'Three or more hosts to the same external IP within 6h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux', 'network'], category: 'Command and Control', severity: 'critical',
    techniqueId: 'T1071', techniqueName: 'Application Layer Protocol', tactic: 'Command and Control', lookback: '6h',
    groupBy: ['c2IP'],
    ruleDefinition: `id: 9116\nname: GRAPH-MULTI-HOST-C2-BEACON\ntype: graph_offense\nmitre:\n  attacks: [T1071]\ncypherQuery: |\n  MATCH (h:Host)-[:COMMUNICATED_WITH]->(extIP:IpAddress)\n  RETURN extIP.address AS c2IP`,
  },
  {
    id: 9117, ruleName: 'GRAPH-PRIV-ESC-MULTI-HOST', engine: 'graph',
    description: 'High-risk user on three or more hosts within 2h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux'], category: 'Privilege Escalation', severity: 'critical',
    techniqueId: 'T1548', techniqueName: 'Abuse Elevation Control Mechanism', tactic: 'Privilege Escalation', lookback: '2h',
    groupBy: ['escalatingUser'],
    ruleDefinition: `id: 9117\nname: GRAPH-PRIV-ESC-MULTI-HOST\ntype: graph_offense\nmitre:\n  attacks: [T1548, T1078.003]\ncypherQuery: |\n  MATCH (u:User)-[:LOGGED_INTO]->(h:Host)\n  RETURN u.username AS escalatingUser`,
  },
  {
    id: 9118, ruleName: 'GRAPH-PASSWORD-SPRAY-MULTI-ACCOUNT', engine: 'graph',
    description: 'One host with login attempts for five or more accounts in 1h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux'], category: 'Credential Access', severity: 'high',
    techniqueId: 'T1110.003', techniqueName: 'Password Spraying', tactic: 'Credential Access', lookback: '1h',
    groupBy: ['targetHost'],
    ruleDefinition: `id: 9118\nname: GRAPH-PASSWORD-SPRAY-MULTI-ACCOUNT\ntype: graph_offense\nmitre:\n  attacks: [T1110.003]\ncypherQuery: |\n  MATCH (u:User)-[:LOGGED_INTO]->(h:Host)\n  RETURN h.hostname AS targetHost`,
  },
];

const enterprisePackRules: DetectionRule[] = enterprisePackSeeds.map((seed, index) => packRule(seed, index));

const skillPackSeeds: PackSeed[] = [
  {
    id: 9401, ruleName: 'CEL-WIN-SHADOW-CREDENTIALS', engine: 'cel', contentPack: SKILL_PACK,
    description: 'Shadow Credentials / Whisker-style writes to msDS-KeyCredentialLink. False positives: Entra hybrid join.',
    dataTypes: ['windows', 'wineventlog', 'process'], category: 'Credential Access', severity: 'critical',
    techniqueId: 'T1098.005', techniqueName: 'Device Registration', tactic: 'Credential Access', lookback: '15m',
    groupBy: ['origin.host', 'origin.user'], matchCount: 1,
    ruleDefinition: `id: 9401\nname: CEL-WIN-SHADOW-CREDENTIALS\nmitre:\n  attacks: [T1098.005, T1556.006]\nwhere: 'raw.matches("(?i).*msDS-KeyCredentialLink.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9402, ruleName: 'CEL-WIN-ACCESSIBILITY-HIJACK', engine: 'cel', contentPack: SKILL_PACK,
    description: 'Sticky-keys / IFEO Debugger hijack of sethc, utilman, osk, or magnify.',
    dataTypes: ['windows', 'wineventlog', 'process'], category: 'Persistence', severity: 'high',
    techniqueId: 'T1546.008', techniqueName: 'Accessibility Features', tactic: 'Persistence', lookback: '10m',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9402\nname: CEL-WIN-ACCESSIBILITY-HIJACK\nmitre:\n  attacks: [T1546.008, T1546.012]\nwhere: 'raw.matches("(?i).*(sethc|utilman).*Debugger.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9403, ruleName: 'CEL-WIN-ETW-TAMPER', engine: 'cel', contentPack: SKILL_PACK,
    description: 'ETW/event-log tampering via logman stop, wevtutil sl /e:false, or Autologger disable.',
    dataTypes: ['windows', 'powershell', 'process'], category: 'Defense Evasion', severity: 'high',
    techniqueId: 'T1562.006', techniqueName: 'Indicator Blocking', tactic: 'Defense Evasion', lookback: '15m',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9403\nname: CEL-WIN-ETW-TAMPER\nmitre:\n  attacks: [T1562.006, T1562.002]\nwhere: 'raw.matches("(?i).*logman.*stop.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9404, ruleName: 'CEL-WIN-DCOM-LATERAL', engine: 'cel', contentPack: SKILL_PACK,
    description: 'DCOM lateral movement via MMC20.Application, ShellWindows, or Impacket dcomexec.',
    dataTypes: ['windows', 'wineventlog', 'network'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1021.003', techniqueName: 'Distributed Component Object Model', tactic: 'Lateral Movement', lookback: '10m',
    groupBy: ['origin.host', 'origin.ip'],
    ruleDefinition: `id: 9404\nname: CEL-WIN-DCOM-LATERAL\nmitre:\n  attacks: [T1021.003]\nwhere: 'raw.matches("(?i).*(dcomexec|MMC20\\\\.Application).*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9405, ruleName: 'CEL-WIN-WINRM-REMOTE', engine: 'cel', contentPack: SKILL_PACK,
    description: 'Suspicious WinRM / PowerShell remoting: evil-winrm, winrs, or wsmprovhost.',
    dataTypes: ['windows', 'powershell'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1021.006', techniqueName: 'Windows Remote Management', tactic: 'Lateral Movement', lookback: '15m',
    groupBy: ['origin.host', 'origin.user'], matchCount: 2,
    ruleDefinition: `id: 9405\nname: CEL-WIN-WINRM-REMOTE\nmitre:\n  attacks: [T1021.006, T1059.001]\nwhere: 'raw.matches("(?i).*(evil-winrm|wsmprovhost).*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9406, ruleName: 'CEL-LIN-PAM-MODULE-TAMPER', engine: 'cel', contentPack: SKILL_PACK,
    description: 'Unauthorized writes to /etc/pam.d or pam_*.so replacement. False positives: package-manager upgrades.',
    dataTypes: ['linux', 'syslog', 'file'], category: 'Persistence', severity: 'critical',
    techniqueId: 'T1556.003', techniqueName: 'Pluggable Authentication Modules', tactic: 'Persistence', lookback: '20m',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9406\nname: CEL-LIN-PAM-MODULE-TAMPER\nmitre:\n  attacks: [T1556.003]\nwhere: 'raw.matches("(?i).*/etc/pam\\\\.d/.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9407, ruleName: 'SEQ-KERBEROAST-THEN-LATERAL', engine: 'sequence', contentPack: SKILL_PACK,
    description: 'Kerberoast-style TGS request followed by a remote service logon from the same origin within 45 minutes.',
    dataTypes: ['windows', 'wineventlog', 'network'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1558.003', techniqueName: 'Kerberoasting', tactic: 'Credential Access', lookback: '45m',
    groupBy: ['origin.user', 'origin.host'], alerts24h: 1, matchCount: 1,
    ruleDefinition: `id: 9407\nname: SEQ-KERBEROAST-THEN-LATERAL\nmitre:\n  attacks: [T1558.003, T1021]\nsequence:\n  - where: 'action == "kerberoast"'\n    within: 15m\n  - where: 'action == "remote_logon"'\n    within: 45m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9408, ruleName: 'SEQ-AMSI-BYPASS-THEN-ENCODED-PS', engine: 'sequence', contentPack: SKILL_PACK,
    description: 'AMSI bypass followed by encoded PowerShell from the same host within 20 minutes.',
    dataTypes: ['windows', 'powershell', 'process'], category: 'Defense Evasion', severity: 'high',
    techniqueId: 'T1562.001', techniqueName: 'Disable or Modify Tools', tactic: 'Defense Evasion', lookback: '20m',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9408\nname: SEQ-AMSI-BYPASS-THEN-ENCODED-PS\nmitre:\n  attacks: [T1562.001, T1059.001]\nsequence:\n  - where: 'action == "amsi_bypass"'\n    within: 10m\n  - where: 'action == "encoded_powershell"'\n    within: 20m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9409, ruleName: 'SEQ-SHADOW-CRED-THEN-AUTH', engine: 'sequence', contentPack: SKILL_PACK,
    description: 'Shadow Credentials write followed by successful authentication as the targeted principal within 30 minutes.',
    dataTypes: ['windows', 'identity'], category: 'Credential Access', severity: 'critical',
    techniqueId: 'T1098.005', techniqueName: 'Device Registration', tactic: 'Credential Access', lookback: '30m',
    groupBy: ['target.user'],
    ruleDefinition: `id: 9409\nname: SEQ-SHADOW-CRED-THEN-AUTH\nmitre:\n  attacks: [T1098.005, T1550.003]\nsequence:\n  - where: 'action == "shadow_credential"'\n    within: 10m\n  - where: 'action == "authentication_success"'\n    within: 30m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9410, ruleName: 'SEQ-WINRM-THEN-ADMIN-SHARE', engine: 'sequence', contentPack: SKILL_PACK,
    description: 'WinRM/PSRemoting session followed by admin-share access from the same origin IP within 20 minutes.',
    dataTypes: ['windows', 'network'], category: 'Lateral Movement', severity: 'high',
    techniqueId: 'T1021.006', techniqueName: 'Windows Remote Management', tactic: 'Lateral Movement', lookback: '20m',
    groupBy: ['origin.ip'], matchCount: 1,
    ruleDefinition: `id: 9410\nname: SEQ-WINRM-THEN-ADMIN-SHARE\nmitre:\n  attacks: [T1021.006, T1021.002]\nsequence:\n  - where: 'action == "winrm_session"'\n    within: 10m\n  - where: 'action == "admin_share_access"'\n    within: 20m\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9411, ruleName: 'SEQ-ACCESSIBILITY-THEN-C2', engine: 'sequence', contentPack: SKILL_PACK,
    description: 'Accessibility/IFEO persistence followed by outbound C2-style communication from the same host within 1 hour.',
    dataTypes: ['windows', 'process', 'netconn'], category: 'Command and Control', severity: 'high',
    techniqueId: 'T1546.008', techniqueName: 'Accessibility Features', tactic: 'Persistence', lookback: '1h',
    groupBy: ['origin.host'],
    ruleDefinition: `id: 9411\nname: SEQ-ACCESSIBILITY-THEN-C2\nmitre:\n  attacks: [T1546.008, T1071]\nsequence:\n  - where: 'action == "accessibility_hijack"'\n    within: 15m\n  - where: 'action == "c2_beacon"'\n    within: 1h\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9412, ruleName: 'RISK-ASREPROAST', engine: 'risk', contentPack: SKILL_PACK,
    description: 'Accumulates risk for AS-REP roasting after afterEvents lookback (≥3 hits / 1h per origin).',
    dataTypes: ['windows', 'identity'], category: 'Credential Access', severity: 'high',
    techniqueId: 'T1558.004', techniqueName: 'AS-REP Roasting', tactic: 'Credential Access', lookback: '1h',
    groupBy: ['origin.ip'], matchCount: 5,
    ruleDefinition: `id: 9412\nname: RISK-ASREPROAST\nriskScore: 35\nwhere: 'raw.matches("(?i).*GetNPUsers.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9413, ruleName: 'RISK-LOLBAS-PROXY-EXEC', engine: 'risk', contentPack: SKILL_PACK,
    description: 'Accumulates risk when signed Microsoft proxies launch script or HTTP content (≥2 hits / 30m per host).',
    dataTypes: ['windows', 'process'], category: 'Defense Evasion', severity: 'medium',
    techniqueId: 'T1218', techniqueName: 'System Binary Proxy Execution', tactic: 'Defense Evasion', lookback: '30m',
    groupBy: ['origin.host'], matchCount: 4,
    ruleDefinition: `id: 9413\nname: RISK-LOLBAS-PROXY-EXEC\nriskScore: 30\nwhere: 'raw.matches("(?i).*(mshta|rundll32|regsvr32).*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9414, ruleName: 'RISK-PASS-THE-HASH', engine: 'risk', contentPack: SKILL_PACK,
    description: 'Accumulates risk for pass-the-hash / Logon Type 9 after afterEvents lookback (≥2 hits / 1h).',
    dataTypes: ['windows', 'identity'], category: 'Credential Access', severity: 'critical',
    techniqueId: 'T1550.002', techniqueName: 'Pass the Hash', tactic: 'Credential Access', lookback: '1h',
    groupBy: ['origin.host', 'origin.user'], matchCount: 2,
    ruleDefinition: `id: 9414\nname: RISK-PASS-THE-HASH\nriskScore: 40\nwhere: 'raw.matches("(?i).*sekurlsa::pth.*")'\nafterEvents:\n  - indexPattern: v3-hive-log-*`,
  },
  {
    id: 9415, ruleName: 'GRAPH-JUMP-HOST-MULTI-ACCOUNT', engine: 'graph', contentPack: SKILL_PACK,
    description: 'One host, three or more accounts, three or more targets in 2h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux', 'identity'], category: 'Lateral Movement', severity: 'critical',
    techniqueId: 'T1021', techniqueName: 'Remote Services', tactic: 'Lateral Movement', lookback: '2h',
    groupBy: ['jumpHost'],
    ruleDefinition: `id: 9415\nname: GRAPH-JUMP-HOST-MULTI-ACCOUNT\ntype: graph_offense\nmitre:\n  attacks: [T1021, T1078]\ncypherQuery: |\n  MATCH (jump:Host)<-[:LOGGED_INTO]-(u:User)-[:LOGGED_INTO]->(target:Host)\n  WHERE jump.hostname <> target.hostname\n  RETURN jump.hostname AS jumpHost`,
  },
  {
    id: 9416, ruleName: 'GRAPH-STOLEN-CREDS-PIVOT-C2', engine: 'graph', contentPack: SKILL_PACK,
    description: 'Non-privileged user on two hosts plus an external IP within 1h. Requires Neo4j — STAGING CANDIDATE.',
    dataTypes: ['windows', 'linux', 'network'], category: 'Command and Control', severity: 'critical',
    techniqueId: 'T1550', techniqueName: 'Use Alternate Authentication Material', tactic: 'Lateral Movement', lookback: '1h',
    groupBy: ['user'],
    ruleDefinition: `id: 9416\nname: GRAPH-STOLEN-CREDS-PIVOT-C2\ntype: graph_offense\nmitre:\n  attacks: [T1550, T1071, T1021]\ncypherQuery: |\n  MATCH (u:User)-[:LOGGED_INTO]->(h1:Host)-[:COMMUNICATED_WITH]->(extIP:IpAddress)\n  RETURN u.username AS user`,
  },
];

const skillPackRules: DetectionRule[] = skillPackSeeds.map((seed, index) => packRule(seed, index));

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

function tenantCustomRule(seed: {
  id: number;
  tenantId: number;
  pack: string;
  ruleName: string;
  description: string;
  dataTypes: string[];
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  severity: DetectionRule['severity'];
}): DetectionRule {
  return {
    id: seed.id,
    tenantId: seed.tenantId,
    ruleName: seed.ruleName,
    description: seed.description,
    dataTypes: seed.dataTypes,
    tags: [seed.pack, 'tenant-custom'],
    ruleActive: true,
    lastModified: '2026-09-07T18:00:00Z',
    sigmaRuleId: null,
    category: seed.tactic,
    severity: seed.severity,
    techniqueId: seed.techniqueId,
    techniqueName: seed.techniqueName,
    tactic: seed.tactic,
    origin: 'custom',
    engine: 'cel',
    contentPack: seed.pack,
    health: 'healthy',
    healthMessage: `Tenant ${seed.pack} custom pack — REST-visible, not engine-enforced until $WORK_DIR/tenants/${seed.tenantId}/rules exists.`,
    lastRunAt: '2026-09-07T17:40:00Z',
    lastRunDurationMs: 120,
    schedule: 'Every 10m',
    lookback: '30m',
    alerts24h: 1,
    matchCount: 1,
    version: 1,
    createdBy: 'Tenant detection engineer',
    updatedBy: 'Tenant detection engineer',
    hasGap: false,
    threshold: 1,
    suppressionDuration: 'Off',
    groupBy: ['host.name'],
    deduplicateBy: ['event.id'],
    references: [`https://attack.mitre.org/techniques/${seed.techniqueId.replace('.', '/')}/`],
    responseMode: 'alert-only',
    ruleDefinition: `celExists(event.action) &&\nequals(event.action, "${seed.ruleName.toLowerCase().replace(/-/g, '_')}") &&\n!equals(user.name, "approved-automation")`,
  };
}

const acmeCustomRules: DetectionRule[] = [
  tenantCustomRule({
    id: 9201, tenantId: 1, pack: 'acme-custom',
    ruleName: 'ACME-CUSTOM-VPN-GEO-ANOMALY',
    description: 'Acme-only VPN authentication from an unexpected country for finance users.',
    dataTypes: ['vpn', 'identity'], techniqueId: 'T1133', techniqueName: 'External Remote Services',
    tactic: 'Initial Access', severity: 'high',
  }),
  tenantCustomRule({
    id: 9202, tenantId: 1, pack: 'acme-custom',
    ruleName: 'ACME-CUSTOM-PAYROLL-EXFIL',
    description: 'Acme-only large outbound transfer from the payroll file share after hours.',
    dataTypes: ['windows', 'file'], techniqueId: 'T1048', techniqueName: 'Exfiltration Over Alternative Protocol',
    tactic: 'Exfiltration', severity: 'critical',
  }),
];

const cwmCustomRules: DetectionRule[] = [
  tenantCustomRule({
    id: 9301, tenantId: 2, pack: 'cwm-custom',
    ruleName: 'CWM-CUSTOM-OT-PROTOCOL-ANOMALY',
    description: 'CWM-only unexpected Modbus write from an IT jump host into the OT VLAN.',
    dataTypes: ['network', 'ot'], techniqueId: 'T0861', techniqueName: 'Point & Tag Identification',
    tactic: 'Discovery', severity: 'high',
  }),
  tenantCustomRule({
    id: 9302, tenantId: 2, pack: 'cwm-custom',
    ruleName: 'CWM-CUSTOM-CONTRACTOR-RDP',
    description: 'CWM-only contractor account opening RDP to a domain controller.',
    dataTypes: ['windows', 'identity'], techniqueId: 'T1021.001', techniqueName: 'Remote Desktop Protocol',
    tactic: 'Lateral Movement', severity: 'high',
  }),
];

export const foundationDetectionRules: DetectionRule[] = [
  ...enterprisePackRules,
  ...skillPackRules,
  ...generatedDetectionRules,
  ...acmeCustomRules,
  ...cwmCustomRules,
];

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
  {
    id: 'sample-sequence-fail-001',
    label: 'Failed authentication (sequence step 0 only)',
    dataType: 'Identity',
    json: JSON.stringify({
      '@timestamp': '2026-09-07T16:17:40Z',
      action: 'failed_auth',
      log: { action: 'failed_auth' },
      origin: { ip: '203.0.113.40', user: 'j.ortiz', host: 'FIN-WKS-018' },
    }, null, 2),
  },
  {
    id: 'sample-skill-kerberoast-001',
    label: 'Kerberoast TGS then remote logon (skill pack sequence)',
    dataType: 'Identity',
    json: JSON.stringify({
      '@timestamp': '2026-09-08T10:12:00Z',
      action: 'kerberoast',
      log: { action: 'kerberoast', eventID: '4769' },
      origin: { ip: '10.44.8.19', user: 'a.patel', host: 'FIN-WKS-044' },
    }, null, 2),
  },
  {
    id: 'sample-skill-shadow-cred-001',
    label: 'Shadow Credentials KeyCredentialLink write',
    dataType: 'Identity',
    json: JSON.stringify({
      '@timestamp': '2026-09-08T10:18:00Z',
      action: 'shadow_credential',
      log: { action: 'shadow_credential', eventID: '5136' },
      origin: { host: 'DC-01', user: 'svc-helpdesk' },
      target: { user: 'admin.backup' },
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
    if (!isDetectionContentVisible(rule.tenantId, params.tenantId)) return false;
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
