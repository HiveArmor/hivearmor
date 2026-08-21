/**
 * Stable fictional investigation data for visual review only.
 * It is returned exclusively when VITE_USE_FOUNDATION_FIXTURES=true.
 */

import type { AlertInvestigation } from './alertInvestigation.types';

export const foundationAlertInvestigation: AlertInvestigation = {
  id: 'ALT-7F3A91',
  title: 'Signed utility spawned an encoded PowerShell download chain',
  summary:
    'A finance workstation opened a disguised attachment that launched an encoded PowerShell command, established persistence, and contacted newly observed infrastructure.',
  severity: 'critical',
  status: 'In progress',
  verdict: 'malicious',
  riskScore: 94,
  confidence: 91,
  occurredAt: '2026-08-02T03:42:11Z',
  updatedAt: '2026-08-02T03:47:28Z',
  detector: 'HiveArmor Endpoint Analytics',
  dataSource: 'Windows EDR + DNS + Firewall',
  tenant: 'Northstar Finance',
  asset: 'FIN-WKS-044',
  assetOwner: 'Sarah Chen · Finance',
  slaDeadline: '2026-08-02T04:12:11Z',
  rule: {
    id: 'RULE-ENDPOINT-184',
    name: 'Encoded script with persistence and outbound callback',
    reason:
      'A user-opened attachment spawned a signed Windows utility, which launched encoded PowerShell and contacted a low-prevalence domain before creating a Run key.',
    investigationGuide: [
      'Validate the attachment delivery path and whether the user expected the file.',
      'Review the PowerShell command, decoded payload, process ancestry, and sibling processes.',
      'Scope the hash, domain, destination IP, and persistence key across the tenant.',
      'Preserve endpoint telemetry before isolation or process termination.',
    ],
  },
  stages: [
    { id: 'execution', order: 1, tacticId: 'TA0002', label: 'Execution', technique: 'T1059.001 PowerShell', state: 'observed', eventCount: 3 },
    { id: 'evasion', order: 2, tacticId: 'TA0005', label: 'Defense evasion', technique: 'T1218 Signed binary proxy', state: 'observed', eventCount: 2 },
    { id: 'persistence', order: 3, tacticId: 'TA0003', label: 'Persistence', technique: 'T1060 Registry Run keys', state: 'observed', eventCount: 1 },
    { id: 'command', order: 4, tacticId: 'TA0011', label: 'Command & control', technique: 'T1071.001 Web protocols', state: 'observed', eventCount: 2 },
    { id: 'impact', order: 5, tacticId: 'TA0040', label: 'Impact', technique: 'No impact observed', state: 'not_observed', eventCount: 0 },
  ],
  story: [
    {
      id: 'evt-01', timestamp: '2026-08-02T03:42:11.182Z', title: 'Disguised attachment executed',
      summary: 'invoice_review.pdf.exe was opened from the user Downloads directory.', category: 'file', severity: 'critical',
      processId: 'proc-invoice', source: 'Endpoint sensor', stageId: 'execution', evidenceIds: ['ioc-file'],
    },
    {
      id: 'evt-02', timestamp: '2026-08-02T03:42:12.041Z', title: 'Encoded PowerShell launched',
      summary: 'rundll32.exe spawned PowerShell with an encoded command and a hidden window.', category: 'process', severity: 'critical',
      processId: 'proc-powershell', source: 'Endpoint sensor', stageId: 'execution', evidenceIds: ['ioc-file'],
    },
    {
      id: 'evt-03', timestamp: '2026-08-02T03:42:14.627Z', title: 'Payload retrieved over HTTPS',
      summary: 'PowerShell connected to cdn-update-check.net and wrote a DLL to ProgramData.', category: 'network', severity: 'critical',
      processId: 'proc-powershell', source: 'Firewall + DNS', stageId: 'command', evidenceIds: ['ioc-domain', 'ioc-ip'],
    },
    {
      id: 'evt-04', timestamp: '2026-08-02T03:42:18.903Z', title: 'Registry persistence created',
      summary: 'A per-user Run key was created to load telemetry-cache.dll at logon.', category: 'registry', severity: 'high',
      processId: 'proc-reg', source: 'Endpoint sensor', stageId: 'persistence', evidenceIds: ['ioc-registry'],
    },
    {
      id: 'evt-05', timestamp: '2026-08-02T03:42:22.409Z', title: 'Signed binary proxied payload',
      summary: 'rundll32.exe loaded the unsigned DLL from a user-writable directory.', category: 'process', severity: 'high',
      processId: 'proc-rundll32-child', source: 'Endpoint sensor', stageId: 'evasion', evidenceIds: ['ioc-file'],
    },
    {
      id: 'evt-06', timestamp: '2026-08-02T03:47:28.017Z', title: 'Correlation rule elevated the alert',
      summary: 'Process, persistence, and network evidence crossed the high-confidence threshold.', category: 'detection', severity: 'critical',
      processId: null, source: 'HiveArmor correlation engine', stageId: null, evidenceIds: ['ioc-domain', 'ioc-ip', 'ioc-file'],
    },
  ],
  processes: [
    { id: 'proc-explorer', parentId: null, name: 'explorer.exe', pid: 4812, user: 'NORTHSTAR\\sarah.chen', commandLine: 'C:\\Windows\\explorer.exe', startedAt: '2026-08-02T01:12:02Z', verdict: 'trusted', signed: true },
    { id: 'proc-invoice', parentId: 'proc-explorer', name: 'invoice_review.pdf.exe', pid: 9044, user: 'NORTHSTAR\\sarah.chen', commandLine: 'C:\\Users\\sarah.chen\\Downloads\\invoice_review.pdf.exe', startedAt: '2026-08-02T03:42:11.182Z', verdict: 'malicious', signed: false },
    { id: 'proc-rundll32', parentId: 'proc-invoice', name: 'rundll32.exe', pid: 9068, user: 'NORTHSTAR\\sarah.chen', commandLine: 'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication"', startedAt: '2026-08-02T03:42:11.766Z', verdict: 'suspicious', signed: true },
    { id: 'proc-powershell', parentId: 'proc-rundll32', name: 'powershell.exe', pid: 9120, user: 'NORTHSTAR\\sarah.chen', commandLine: 'powershell.exe -NoP -W Hidden -EncodedCommand SQBFAFgA...', startedAt: '2026-08-02T03:42:12.041Z', verdict: 'malicious', signed: true },
    { id: 'proc-reg', parentId: 'proc-powershell', name: 'reg.exe', pid: 9188, user: 'NORTHSTAR\\sarah.chen', commandLine: 'reg.exe add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v TelemetryCache', startedAt: '2026-08-02T03:42:18.903Z', verdict: 'suspicious', signed: true },
    { id: 'proc-rundll32-child', parentId: 'proc-powershell', name: 'rundll32.exe', pid: 9224, user: 'NORTHSTAR\\sarah.chen', commandLine: 'rundll32.exe C:\\ProgramData\\telemetry-cache.dll,Start', startedAt: '2026-08-02T03:42:22.409Z', verdict: 'malicious', signed: true },
  ],
  network: [
    { id: 'net-01', timestamp: '2026-08-02T03:42:14.214Z', processId: 'proc-powershell', processName: 'powershell.exe', protocol: 'DNS', destination: 'cdn-update-check.net', port: 53, direction: 'outbound', bytes: 164, reputation: 'malicious', state: 'Allowed' },
    { id: 'net-02', timestamp: '2026-08-02T03:42:14.627Z', processId: 'proc-powershell', processName: 'powershell.exe', protocol: 'TLS', destination: '198.51.100.42', port: 443, direction: 'outbound', bytes: 48312, reputation: 'malicious', state: 'Completed' },
    { id: 'net-03', timestamp: '2026-08-02T03:42:24.982Z', processId: 'proc-rundll32-child', processName: 'rundll32.exe', protocol: 'TLS', destination: '198.51.100.42', port: 443, direction: 'outbound', bytes: 2264, reputation: 'malicious', state: 'Reset' },
  ],
  indicators: [
    { id: 'ioc-domain', type: 'domain', value: 'cdn-update-check.net', verdict: 'malicious', confidence: 93, source: 'HiveArmor curated intel', firstSeen: '2026-07-29T08:12:00Z', lastSeen: '2026-08-02T03:42:24Z', evidenceIds: ['evt-03'] },
    { id: 'ioc-ip', type: 'ip', value: '198.51.100.42', verdict: 'malicious', confidence: 89, source: 'Partner TAXII feed', firstSeen: '2026-07-31T18:41:00Z', lastSeen: '2026-08-02T03:42:24Z', evidenceIds: ['evt-03'] },
    { id: 'ioc-file', type: 'sha256', value: 'f1831c9e764c0d5dbad71896d728f1413d3a1b6a2083b15f73a9e45c5dd35d0a', verdict: 'malicious', confidence: 96, source: 'Sandbox + endpoint', firstSeen: '2026-08-02T03:42:11Z', lastSeen: '2026-08-02T03:42:22Z', evidenceIds: ['evt-01', 'evt-02', 'evt-05'] },
    { id: 'ioc-registry', type: 'registry', value: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\TelemetryCache', verdict: 'suspicious', confidence: 86, source: 'Endpoint sensor', firstSeen: '2026-08-02T03:42:18Z', lastSeen: '2026-08-02T03:42:18Z', evidenceIds: ['evt-04'] },
  ],
  capabilities: [
    { id: 'cap-script', label: 'Script execution', description: 'Hidden encoded PowerShell launched from a document-like executable.', severity: 'critical', evidenceCount: 2 },
    { id: 'cap-persistence', label: 'Logon persistence', description: 'A Run key loads an unsigned DLL from ProgramData.', severity: 'high', evidenceCount: 1 },
    { id: 'cap-c2', label: 'Command channel', description: 'Two processes contacted new, malicious infrastructure over TLS.', severity: 'critical', evidenceCount: 3 },
  ],
  entities: [
    { id: 'ent-user', type: 'user', label: 'NORTHSTAR\\sarah.chen', role: 'actor', riskScore: 72, evidenceCount: 6 },
    { id: 'ent-host', type: 'host', label: 'FIN-WKS-044', role: 'target', riskScore: 94, evidenceCount: 9 },
    { id: 'ent-file', type: 'file', label: 'invoice_review.pdf.exe', role: 'artifact', riskScore: 96, evidenceCount: 5 },
    { id: 'ent-domain', type: 'domain', label: 'cdn-update-check.net', role: 'artifact', riskScore: 93, evidenceCount: 3 },
  ],
  relatedAlerts: [
    { id: 'ALT-7F3A88', title: 'Rare encoded PowerShell on finance endpoint', severity: 'high', timestamp: '2026-08-02T03:42:12Z', relation: 'Same process ancestry', sharedEntities: ['FIN-WKS-044', 'powershell.exe'] },
    { id: 'ALT-7F3A72', title: 'First-seen domain contacted by signed utility', severity: 'high', timestamp: '2026-08-02T03:42:14Z', relation: 'Same source event', sharedEntities: ['FIN-WKS-044', 'cdn-update-check.net'] },
  ],
  history: [
    { id: 'hist-01', timestamp: '2026-08-02T03:42:11Z', actor: 'HiveArmor detector', action: 'Alert created', detail: 'Initial severity set to High.' },
    { id: 'hist-02', timestamp: '2026-08-02T03:47:28Z', actor: 'Correlation engine', action: 'Severity elevated', detail: 'High → Critical after persistence and C2 evidence correlated.' },
    { id: 'hist-03', timestamp: '2026-08-02T03:50:04Z', actor: 'Maya Chen', action: 'Investigation started', detail: 'Status changed from Open to In progress.' },
  ],
  actions: [
    { id: 'isolate-host', label: 'Isolate host', description: 'Restrict network access while keeping the EDR control channel.', tone: 'danger', target: 'FIN-WKS-044', available: true, unavailableReason: null, requiresApproval: true },
    { id: 'kill-process', label: 'Terminate process tree', description: 'Stop the malicious process and all descendants.', tone: 'danger', target: 'PID 9044 and descendants', available: true, unavailableReason: null, requiresApproval: true },
    { id: 'block-indicators', label: 'Block observed indicators', description: 'Add the malicious domain, IP, and hash to enforcement lists.', tone: 'primary', target: '3 verified indicators', available: true, unavailableReason: null, requiresApproval: true },
    { id: 'promote-incident', label: 'Promote to incident', description: 'Create a case and preserve the current evidence set.', tone: 'neutral', target: 'ALT-7F3A91', available: true, unavailableReason: null, requiresApproval: false },
  ],
  highlightedFields: {
    'host.name': 'FIN-WKS-044',
    'user.name': 'sarah.chen',
    'process.name': 'powershell.exe',
    'process.parent.name': 'rundll32.exe',
    'process.command_line': 'powershell.exe -NoP -W Hidden -EncodedCommand SQBFAFgA...',
    'destination.domain': 'cdn-update-check.net',
    'destination.ip': '198.51.100.42',
    'file.name': 'invoice_review.pdf.exe',
  },
  rawEvent: {
    '@timestamp': '2026-08-02T03:42:12.041Z',
    event: { category: ['process'], action: 'start', outcome: 'unknown' },
    host: { name: 'FIN-WKS-044', os: { name: 'Windows 11 Enterprise' } },
    user: { domain: 'NORTHSTAR', name: 'sarah.chen' },
    process: { pid: 9120, name: 'powershell.exe', parent: { pid: 9068, name: 'rundll32.exe' } },
    rule: { id: 'RULE-ENDPOINT-184', name: 'Encoded script with persistence and outbound callback' },
  },
  dataCompleteness: 'full',
  missingDataNotice: null,
};
