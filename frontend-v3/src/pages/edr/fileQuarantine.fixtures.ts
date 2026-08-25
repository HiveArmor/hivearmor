import type {
  IsolationListQuery,
  IsolationPage,
  IsolatedHostDTO,
  QuarantineListQuery,
  QuarantinePage,
  QuarantinedFileDTO,
} from '@/types/edr';

const hosts = ['FIN-WKS-044', 'OPS-JMP-03', 'IDM-DC-02', 'PAY-APP-07', 'ENG-LT-118', 'MKT-LPT-009'];
const files = ['invoice-viewer.exe', 'update-loader.ps1', 'credential-dump.dll', 'remote-admin.zip', 'browser-helper.exe', 'finance-report.scr'];
const threats = ['Trojan:PowerShell/EncodedCommand', 'Behavior:CredentialAccess', 'Backdoor:RemoteAccess', 'Ransomware:Precursor', 'PUA:UnsignedLoader', 'Suspicious:ArchivePayload'];
const users = ['HiveArmor prevention', 'Maya Chen', 'Omar Haddad', 'Endpoint policy'];
const statuses = ['quarantined', 'quarantined', 'quarantined', 'restored', 'quarantined', 'deleted'] as const;
const verdicts = ['malicious', 'suspicious', 'malicious', 'false_positive', 'unknown', 'malicious'] as const;
const isolationStatuses = ['ACTIVE', 'ACTIVE', 'LIFTED', 'FAILED', 'ACTIVE', 'LIFTED'] as const;

export const foundationQuarantinedFiles: QuarantinedFileDTO[] = Array.from({ length: 64 }, (_, index) => {
  const host = hosts[index % hosts.length];
  const filename = files[index % files.length];
  const quarantineTime = new Date(Date.UTC(2026, 7, 9, 14, 52) - index * 17 * 60_000).toISOString();
  const hashSeed = `${(index + 17).toString(16).padStart(2, '0')}a9f0c4d8e2b76135`;
  return {
    id: 7000 + index,
    agentId: `agent-${host.toLowerCase()}`,
    agentName: host,
    filename,
    filePath: index % 2 === 0 ? `C:\\Users\\${index % 3 === 0 ? 'maya.chen' : 'svc-finance'}\\Downloads\\${filename}` : `/opt/finance/cache/${filename}`,
    sha256Hash: (hashSeed.repeat(4)).slice(0, 64),
    fileSize: 48_320 + index * 7_391,
    quarantineTime,
    status: statuses[index % statuses.length],
    quarantinedBy: users[index % users.length],
    notes: index % 4 === 0 ? 'Preserved for incident review before destructive disposition.' : undefined,
    verdict: verdicts[index % verdicts.length],
    threatName: threats[index % threats.length],
    detectionName: index % 2 === 0 ? 'Suspicious process with network retrieval' : 'High-confidence malicious file behavior',
    signer: index % 3 === 0 ? 'Unsigned' : index % 3 === 1 ? 'Unknown publisher' : 'Signature invalid',
    tenantName: index % 4 === 0 ? 'Finance Production' : 'All authorized tenants',
    source: index % 2 === 0 ? 'HiveArmor EDR' : 'Microsoft Defender for Endpoint',
    connectorState: index % 11 === 0 ? 'degraded' : index % 17 === 0 ? 'offline' : 'healthy',
    firstSeen: new Date(new Date(quarantineTime).getTime() - 38 * 60_000).toISOString(),
    lastSeen: quarantineTime,
    linkedAlertId: index % 5 === 0 ? `ALT-${4100 + index}` : undefined,
    linkedIncidentId: index % 9 === 0 ? `INC-${4200 + index}` : undefined,
    actionState: index % 17 === 0 ? 'pending' : index % 23 === 0 ? 'failed' : 'complete',
  };
});

export const foundationIsolatedHosts: IsolatedHostDTO[] = Array.from({ length: 18 }, (_, index) => {
  const host = hosts[index % hosts.length];
  const isolatedAt = new Date(Date.UTC(2026, 7, 9, 16, 10) - index * 41 * 60_000).toISOString();
  const status = isolationStatuses[index % isolationStatuses.length];
  return {
    id: 8100 + index,
    agentId: `agent-${host.toLowerCase()}`,
    hostname: host,
    isolationType: index % 3 === 0 ? 'SELECTIVE' : 'FULL',
    status,
    reason: index % 2 === 0
      ? 'Isolated as part of ransomware containment effort INC-2026-0084.'
      : 'Manual containment after suspicious lateral movement.',
    allowedIps: index % 2 === 0 ? '10.0.0.5' : undefined,
    isolatedAt,
    liftedAt: status === 'LIFTED' ? new Date(new Date(isolatedAt).getTime() + 3 * 60 * 60_000).toISOString() : null,
    actionedBy: users[index % users.length],
    edrEventId: index % 4 === 0 ? 9000 + index : null,
  };
});

export function getFoundationQuarantinePage(query: QuarantineListQuery): QuarantinePage {
  const status = query.status?.toLowerCase();
  const filtered = foundationQuarantinedFiles.filter((record) => {
    if (query.agentId && record.agentId !== query.agentId) return false;
    if (status && status !== 'all' && record.status !== status) return false;
    return true;
  });
  const start = Math.max(0, query.page) * query.size;
  return {
    content: filtered.slice(start, start + query.size),
    totalElements: filtered.length,
    totalPages: Math.ceil(filtered.length / query.size),
    number: query.page,
    snapshotAt: '2026-08-09T15:22:00+05:30',
    partialFailures: [],
  };
}

export function getFoundationIsolationPage(query: IsolationListQuery): IsolationPage {
  const status = query.status?.toUpperCase();
  const filtered = foundationIsolatedHosts.filter((record) => {
    if (status && status !== 'ALL' && record.status !== status) return false;
    return true;
  });
  const start = Math.max(0, query.page) * query.size;
  return {
    content: filtered.slice(start, start + query.size),
    totalElements: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / query.size)),
    number: query.page,
  };
}
