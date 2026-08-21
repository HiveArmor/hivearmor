import type {
  AssetCategory,
  AssetDTO,
  AssetFilters,
  AssetListResponse,
  AssetRiskLevel,
} from '../posture.types';

const names = [
  'FIN-WKS-044', 'PAY-APP-07', 'IDM-DC-02', 'OPS-JMP-03', 'ENG-LT-118', 'MKT-LPT-009',
  'prod-finance-subscription', 'corp-edge-fw-02', 'warehouse-camera-14', 'research-k8s-node-03',
  'hr-file-server-02', 'branch-router-17',
];
const categories: AssetCategory[] = ['endpoint', 'server', 'server', 'endpoint', 'endpoint', 'endpoint', 'cloud', 'network', 'iot_ot', 'cloud', 'server', 'network'];
const riskLevels: AssetRiskLevel[] = ['critical', 'high', 'high', 'medium', 'low', 'critical', 'high', 'medium', 'high', 'medium', 'low', 'none'];
const exposureLevels: AssetDTO['exposureLevel'][] = ['high', 'critical', 'medium', 'high', 'low', 'high', 'critical', 'medium', 'critical', 'high', 'low', 'none'];
const platforms: Array<AssetDTO['platform']> = ['windows', 'linux', 'windows', 'linux', 'windows', 'macos', 'other', 'other', 'other', 'linux', 'windows', 'other'];

export const foundationAssets: AssetDTO[] = Array.from({ length: 84 }, (_, index) => {
  const name = index < names.length ? names[index] : `${names[index % names.length]}-${String(Math.floor(index / names.length) + 1).padStart(2, '0')}`;
  const category = categories[index % categories.length];
  const riskLevel = riskLevels[index % riskLevels.length];
  const exposureLevel = exposureLevels[index % exposureLevels.length] ?? 'unknown';
  const platform = platforms[index % platforms.length] ?? 'other';
  const lastSeen = new Date(Date.UTC(2026, 7, 10, 4, 55) - index * 11 * 60_000).toISOString();
  const isManaged = category === 'endpoint' || category === 'server';
  const sensorHealth: AssetDTO['sensorHealth'] = !isManaged ? 'unmanaged' : index % 13 === 0 ? 'inactive' : index % 9 === 0 ? 'degraded' : 'healthy';
  const onboardingStatus: AssetDTO['onboardingStatus'] = isManaged ? 'onboarded' : index % 4 === 0 ? 'eligible' : 'discovered';
  const criticality: AssetDTO['criticality'] = index % 9 === 0 ? 'mission_critical' : index % 4 === 0 ? 'high' : index % 3 === 0 ? 'medium' : 'unassigned';
  const riskScore = riskLevel === 'critical' ? 91 - (index % 5) : riskLevel === 'high' ? 78 - (index % 8) : riskLevel === 'medium' ? 55 - (index % 8) : riskLevel === 'low' ? 28 - (index % 8) : 4;
  const exposureScore = exposureLevel === 'critical' ? 94 - (index % 6) : exposureLevel === 'high' ? 77 - (index % 7) : exposureLevel === 'medium' ? 54 - (index % 7) : exposureLevel === 'low' ? 24 : 0;
  const activeAlertCount = riskLevel === 'critical' ? 7 - (index % 3) : riskLevel === 'high' ? 4 - (index % 2) : riskLevel === 'medium' ? 2 : 0;
  const vulnerabilityCount = Math.max(0, exposureScore - 28 + (index % 6));
  const criticalVulnerabilityCount = exposureLevel === 'critical' ? 5 - (index % 3) : exposureLevel === 'high' ? 2 : 0;
  const address = category === 'cloud' ? null : `10.${44 + (index % 8)}.${2 + (index % 11)}.${15 + index}`;
  const firstSeenAgeDays = index % 14 === 0 ? 2 + (index % 4) : 18 + index;

  return {
    id: 1000 + index,
    canonicalEntityId: `entity-${category}-${String(index + 1).padStart(5, '0')}`,
    clientName: name,
    clientDomain: category === 'cloud' ? 'cloud.hivearmor.example' : 'northstar.example',
    clientPrefix: `ast-${index + 1}`,
    clientMail: null,
    clientLicenceExpire: isManaged ? '2027-08-10T00:00:00.000Z' : null,
    clientLicenceVerified: isManaged,
    connectionStatus: sensorHealth === 'healthy' ? 'ACTIVE' : sensorHealth === 'inactive' ? 'INACTIVE' : sensorHealth === 'degraded' ? 'UNREACHABLE' : 'UNKNOWN',
    lastSeen,
    firstSeen: new Date(new Date(lastSeen).getTime() - firstSeenAgeDays * 86_400_000).toISOString(),
    agentVersion: isManaged ? `11.${index % 4}.${index % 9}` : null,
    platform,
    osVersion: platform === 'windows' ? 'Windows 11 24H2' : platform === 'linux' ? 'Ubuntu 24.04 LTS' : platform === 'macos' ? 'macOS 15.5' : null,
    ipAddress: address,
    macAddress: address ? `02:42:ac:11:${(index + 12).toString(16).padStart(2, '0')}:${(index + 31).toString(16).padStart(2, '0')}` : null,
    category,
    deviceRole: category === 'server' ? 'Application server' : category === 'cloud' ? 'Cloud resource' : category === 'network' ? 'Network infrastructure' : category === 'iot_ot' ? 'Operational technology' : 'Corporate workstation',
    criticality,
    riskLevel,
    riskScore,
    exposureLevel,
    exposureScore,
    sensorHealth,
    onboardingStatus,
    activeAlertCount,
    vulnerabilityCount,
    criticalVulnerabilityCount,
    attackPathCount: riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 1 : 0,
    owner: index % 4 === 0 ? 'Maya Chen' : index % 4 === 1 ? 'Omar Haddad' : null,
    ownerTeam: category === 'cloud' ? 'Cloud Security' : category === 'iot_ot' ? 'OT Operations' : category === 'network' ? 'Network Security' : 'Endpoint Operations',
    discoverySources: isManaged ? ['HiveArmor Agent', 'Identity provider'] : category === 'cloud' ? ['Cloud connector', 'CSPM'] : ['Passive discovery', 'Network scan'],
    tags: criticality === 'mission_critical' ? ['crown-jewel', 'production'] : index % 4 === 0 ? ['production'] : ['corporate'],
    cloudProvider: category === 'cloud' ? (index % 2 === 0 ? 'AWS' : 'AZURE') : null,
    cloudAccount: category === 'cloud' ? `finance-prod-${100 + index}` : null,
    snapshotVersion: `asset-v${3 + (index % 4)}`,
    riskDrivers: [
      { id: `drv-${index}-1`, label: activeAlertCount ? 'Active security signals' : 'Configuration exposure', kind: activeAlertCount ? 'alert' : 'configuration', severity: riskLevel === 'none' || riskLevel === 'unknown' ? 'low' : riskLevel, evidenceCount: Math.max(1, activeAlertCount), summary: activeAlertCount ? 'Correlated alerts include identity, endpoint, or network evidence.' : 'Security configuration differs from the approved baseline.' },
      { id: `drv-${index}-2`, label: 'Known exploitable weaknesses', kind: 'vulnerability', severity: criticalVulnerabilityCount ? 'critical' : 'medium', evidenceCount: Math.max(1, criticalVulnerabilityCount), summary: 'Prioritized weaknesses are weighted by reachability, exploit intelligence, and asset value.' },
    ],
    recommendations: [
      { id: `rec-${index}-1`, title: sensorHealth === 'unmanaged' ? 'Onboard the asset to endpoint protection' : 'Remediate internet-reachable critical weaknesses', priority: exposureLevel === 'critical' ? 'critical' : 'high', exposureReduction: Math.min(31, Math.max(8, Math.round(exposureScore / 3))), ownerTeam: category === 'cloud' ? 'Cloud Security' : 'Endpoint Operations', state: index % 5 === 0 ? 'in_progress' : 'open' },
      { id: `rec-${index}-2`, title: 'Review asset value and business ownership', priority: 'medium', exposureReduction: 4, ownerTeam: null, state: 'open' },
    ],
    coverage: [
      { id: `cov-${index}-agent`, name: 'Endpoint telemetry', state: sensorHealth === 'healthy' ? 'healthy' : sensorHealth === 'unmanaged' ? 'missing' : 'degraded', lastObserved: sensorHealth === 'unmanaged' ? null : lastSeen },
      { id: `cov-${index}-vuln`, name: 'Vulnerability assessment', state: index % 10 === 0 ? 'stale' : 'healthy', lastObserved: lastSeen },
      { id: `cov-${index}-identity`, name: 'Identity context', state: category === 'iot_ot' ? 'missing' : 'healthy', lastObserved: category === 'iot_ot' ? null : lastSeen },
    ],
  };
});

export function getFoundationAssetPage(filters: AssetFilters, page: number, size: number, sort?: string): AssetListResponse {
  const needle = filters.q?.trim().toLowerCase();
  const filtered = foundationAssets.filter((asset) => {
    if (needle && ![asset.clientName, asset.clientDomain, asset.ipAddress, asset.owner, ...(asset.tags ?? [])].some((value) => value?.toLowerCase().includes(needle))) return false;
    if (filters.category && filters.category !== 'all' && asset.category !== filters.category) return false;
    if (filters.riskLevel && filters.riskLevel !== 'all' && asset.riskLevel !== filters.riskLevel) return false;
    if (filters.exposureLevel && filters.exposureLevel !== 'all' && asset.exposureLevel !== filters.exposureLevel) return false;
    if (filters.sensorHealth && filters.sensorHealth !== 'all' && asset.sensorHealth !== filters.sensorHealth) return false;
    if (filters.onboardingStatus && filters.onboardingStatus !== 'all' && asset.onboardingStatus !== filters.onboardingStatus) return false;
    if (filters.connectionStatus?.length && !filters.connectionStatus.includes(asset.connectionStatus ?? 'UNKNOWN')) return false;
    if (filters.os?.length && !filters.os.map((item) => item.toLowerCase()).includes(asset.platform ?? 'other')) return false;
    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (sort?.startsWith('clientName')) return left.clientName.localeCompare(right.clientName);
    return (right.riskScore ?? -1) - (left.riskScore ?? -1) || (right.exposureScore ?? -1) - (left.exposureScore ?? -1) || left.clientName.localeCompare(right.clientName);
  });
  const start = Math.max(0, page) * size;
  const high = (value: AssetDTO['riskLevel'] | AssetDTO['exposureLevel']) => value === 'critical' || value === 'high';
  const now = Date.UTC(2026, 7, 10, 5, 0);

  return {
    content: sorted.slice(start, start + size),
    totalElements: sorted.length,
    totalPages: Math.ceil(sorted.length / size),
    number: page,
    summary: {
      total: foundationAssets.length,
      criticalAssets: foundationAssets.filter((item) => item.criticality === 'mission_critical').length,
      highRisk: foundationAssets.filter((item) => high(item.riskLevel)).length,
      highExposure: foundationAssets.filter((item) => high(item.exposureLevel)).length,
      notOnboarded: foundationAssets.filter((item) => item.onboardingStatus !== 'onboarded').length,
      sensorAttention: foundationAssets.filter((item) => item.sensorHealth !== 'healthy' && item.sensorHealth !== 'unmanaged').length,
      newlyDiscovered: foundationAssets.filter((item) => item.firstSeen && now - new Date(item.firstSeen).getTime() < 7 * 86_400_000).length,
    },
    snapshotAt: '2026-08-10T10:30:00+05:30',
    partialFailures: [],
  };
}
