/** Stable fictional relationship records used only by the foundation fixture build. */

import type {
  ConstellationExpansionResponse, ConstellationFilters, ConstellationResponse, GraphEdgeDTO,
  GraphNodeDTO, RelationshipEvidenceDTO,
} from '@/types/constellation.types';

const nodes: GraphNodeDTO[] = [
  { id: 'node-host-fin-wks-044', entityId: 'entity-host-00001', entityType: 'host', entityValue: 'FIN-WKS-044', scope: 'internal', riskScore: 97, riskTrend: 'new', criticality: 'Mission critical', alertCount: 7, incidentCount: 2, anomalyCount: 9, firstSeen: '2026-07-16T07:46:00Z', lastSeen: '2026-08-03T07:46:00Z', sources: ['Endpoint telemetry', 'Identity provider', 'Network security'], tags: ['privileged', 'production'], expandable: true },
  { id: 'node-user-sarah', entityId: 'entity-user-00002', entityType: 'user', entityValue: 'sarah.chen', scope: 'internal', riskScore: 91, riskTrend: 'rising', criticality: 'High value', alertCount: 5, incidentCount: 1, anomalyCount: 6, firstSeen: '2026-06-02T05:20:00Z', lastSeen: '2026-08-03T07:42:00Z', sources: ['Identity provider', 'Endpoint telemetry'], expandable: true },
  { id: 'node-ip-external', entityId: 'entity-ip-00003', entityType: 'ip', entityValue: '198.51.100.42', scope: 'external', riskScore: 88, riskTrend: 'new', alertCount: 4, incidentCount: 2, anomalyCount: 3, firstSeen: '2026-08-03T05:16:00Z', lastSeen: '2026-08-03T07:39:00Z', sources: ['Network security', 'Threat intelligence'], tags: ['first-seen'], expandable: true },
  { id: 'node-process-powershell', entityId: 'entity-process-00004', entityType: 'process', entityValue: 'powershell.exe', scope: 'internal', riskScore: 84, riskTrend: 'rising', alertCount: 6, anomalyCount: 4, firstSeen: '2026-07-29T08:10:00Z', lastSeen: '2026-08-03T07:35:00Z', sources: ['Endpoint telemetry'], expandable: true },
  { id: 'node-domain-cdn', entityId: 'entity-domain-00005', entityType: 'domain', entityValue: 'cdn-sync.example', scope: 'external', riskScore: 82, riskTrend: 'new', alertCount: 3, anomalyCount: 2, firstSeen: '2026-08-03T06:58:00Z', lastSeen: '2026-08-03T07:34:00Z', sources: ['DNS analytics', 'Threat intelligence'], tags: ['newly-registered'], expandable: true },
  { id: 'node-file-loader', entityId: 'entity-file-00006', entityType: 'file', entityValue: 'update-loader.ps1', scope: 'internal', riskScore: 79, riskTrend: 'new', alertCount: 4, anomalyCount: 2, firstSeen: '2026-08-03T07:02:00Z', lastSeen: '2026-08-03T07:31:00Z', sources: ['Endpoint telemetry'], expandable: false },
  { id: 'node-host-idm', entityId: 'entity-host-00007', entityType: 'host', entityValue: 'IDM-DC-02', scope: 'internal', riskScore: 76, riskTrend: 'rising', criticality: 'Mission critical', alertCount: 4, incidentCount: 1, anomalyCount: 2, firstSeen: '2026-04-12T09:00:00Z', lastSeen: '2026-08-03T07:28:00Z', sources: ['Identity provider', 'Windows security'], expandable: true },
  { id: 'node-user-service', entityId: 'entity-user-00008', entityType: 'user', entityValue: 'svc-backup', scope: 'internal', riskScore: 72, riskTrend: 'rising', alertCount: 3, anomalyCount: 5, firstSeen: '2026-03-21T09:00:00Z', lastSeen: '2026-08-03T07:21:00Z', sources: ['Identity provider'], expandable: true },
  { id: 'node-ip-internal', entityId: 'entity-ip-00009', entityType: 'ip', entityValue: '10.44.18.118', scope: 'internal', riskScore: 68, riskTrend: 'stable', alertCount: 2, anomalyCount: 1, firstSeen: '2026-06-18T04:00:00Z', lastSeen: '2026-08-03T07:18:00Z', sources: ['Network security', 'Endpoint telemetry'], expandable: false },
  { id: 'node-service-rdp', entityId: 'entity-service-00010', entityType: 'service', entityValue: 'Remote Desktop', scope: 'internal', riskScore: 64, riskTrend: 'stable', alertCount: 2, anomalyCount: 2, firstSeen: '2026-05-10T04:00:00Z', lastSeen: '2026-08-03T07:15:00Z', sources: ['Windows security'], expandable: false },
  { id: 'node-host-pay', entityId: 'entity-host-00011', entityType: 'host', entityValue: 'PAY-APP-07', scope: 'internal', riskScore: 61, riskTrend: 'stable', criticality: 'High value', alertCount: 2, anomalyCount: 1, firstSeen: '2026-03-11T09:00:00Z', lastSeen: '2026-08-03T06:58:00Z', sources: ['Endpoint telemetry', 'Application audit'], expandable: true },
  { id: 'node-user-app', entityId: 'entity-user-00012', entityType: 'user', entityValue: 'app-payments', scope: 'internal', riskScore: 58, riskTrend: 'stable', alertCount: 1, anomalyCount: 1, firstSeen: '2026-02-20T09:00:00Z', lastSeen: '2026-08-03T06:55:00Z', sources: ['Identity provider', 'Application audit'], expandable: false },
  { id: 'node-domain-idp', entityId: 'entity-domain-00013', entityType: 'domain', entityValue: 'login.northstar.example', scope: 'internal', riskScore: 45, riskTrend: 'stable', alertCount: 1, anomalyCount: 0, firstSeen: '2026-01-12T09:00:00Z', lastSeen: '2026-08-03T06:48:00Z', sources: ['DNS analytics'], expandable: false },
  { id: 'node-cloud-audit', entityId: 'entity-cloud-00014', entityType: 'cloud', entityValue: 'cloud-audit-reader', scope: 'internal', riskScore: 42, riskTrend: 'stable', alertCount: 1, anomalyCount: 1, firstSeen: '2026-05-01T09:00:00Z', lastSeen: '2026-08-03T06:40:00Z', sources: ['Cloud audit'], expandable: true },
  { id: 'node-process-cmd', entityId: 'entity-process-00015', entityType: 'process', entityValue: 'cmd.exe', scope: 'internal', riskScore: 39, riskTrend: 'stable', alertCount: 1, anomalyCount: 0, firstSeen: '2026-06-08T09:00:00Z', lastSeen: '2026-08-03T06:31:00Z', sources: ['Endpoint telemetry'], expandable: false },
  { id: 'node-file-archive', entityId: 'entity-file-00016', entityType: 'file', entityValue: 'finance-archive.zip', scope: 'internal', riskScore: 35, riskTrend: 'new', alertCount: 1, anomalyCount: 1, firstSeen: '2026-08-03T06:06:00Z', lastSeen: '2026-08-03T06:20:00Z', sources: ['File integrity'], expandable: false },
  { id: 'node-ip-dns', entityId: 'entity-ip-00017', entityType: 'ip', entityValue: '10.44.0.12', scope: 'internal', riskScore: 24, riskTrend: 'stable', alertCount: 0, anomalyCount: 0, firstSeen: '2026-01-08T09:00:00Z', lastSeen: '2026-08-03T06:11:00Z', sources: ['DNS analytics'], expandable: false },
  { id: 'node-domain-update', entityId: 'entity-domain-00018', entityType: 'domain', entityValue: 'updates.vendor.example', scope: 'external', riskScore: 12, riskTrend: 'stable', alertCount: 0, anomalyCount: 0, firstSeen: '2026-01-05T09:00:00Z', lastSeen: '2026-08-03T05:58:00Z', sources: ['DNS analytics'], expandable: false },
];

const edge = (id: string, source: string, target: string, edgeType: GraphEdgeDTO['edgeType'], weight: number, confidence: number, firstSeen: string, lastSeen: string, label?: string): GraphEdgeDTO => ({
  id, source, target, edgeType, label, weight, eventCount: weight, evidenceCount: Math.max(1, Math.ceil(weight / 2)), confidence, sourceCount: weight > 8 ? 3 : weight > 3 ? 2 : 1, firstSeen, lastSeen, directed: true,
});

const edges: GraphEdgeDTO[] = [
  edge('rel-001', 'node-user-sarah', 'node-host-fin-wks-044', 'AUTHENTICATED_TO', 12, 96, '2026-07-29T09:10:00Z', '2026-08-03T07:42:00Z', 'Authenticated to'),
  edge('rel-002', 'node-ip-external', 'node-host-fin-wks-044', 'CONNECTED_TO', 7, 94, '2026-08-03T05:16:00Z', '2026-08-03T07:39:00Z', 'Connected to'),
  edge('rel-003', 'node-process-powershell', 'node-host-fin-wks-044', 'EXECUTED_ON', 9, 98, '2026-08-03T06:41:00Z', '2026-08-03T07:35:00Z', 'Executed on'),
  edge('rel-004', 'node-process-powershell', 'node-file-loader', 'ACCESSED', 6, 91, '2026-08-03T07:02:00Z', '2026-08-03T07:31:00Z', 'Accessed'),
  edge('rel-005', 'node-file-loader', 'node-domain-cdn', 'CONNECTED_TO', 4, 89, '2026-08-03T07:03:00Z', '2026-08-03T07:30:00Z', 'Downloaded from'),
  edge('rel-006', 'node-domain-cdn', 'node-ip-external', 'RESOLVED_TO', 8, 99, '2026-08-03T06:58:00Z', '2026-08-03T07:34:00Z', 'Resolved to'),
  edge('rel-007', 'node-host-fin-wks-044', 'node-ip-internal', 'CONTAINS', 18, 99, '2026-06-18T04:00:00Z', '2026-08-03T07:18:00Z', 'Uses address'),
  edge('rel-008', 'node-user-sarah', 'node-host-idm', 'AUTHENTICATED_TO', 5, 87, '2026-07-18T09:00:00Z', '2026-08-03T07:28:00Z', 'Authenticated to'),
  edge('rel-009', 'node-user-service', 'node-host-idm', 'AUTHENTICATED_TO', 21, 98, '2026-06-11T09:00:00Z', '2026-08-03T07:21:00Z', 'Authenticated to'),
  edge('rel-010', 'node-host-fin-wks-044', 'node-service-rdp', 'ACCESSED', 6, 92, '2026-08-01T09:00:00Z', '2026-08-03T07:15:00Z', 'Accessed service'),
  edge('rel-011', 'node-service-rdp', 'node-host-idm', 'CONNECTED_TO', 3, 81, '2026-08-03T06:12:00Z', '2026-08-03T07:12:00Z', 'Connected to'),
  edge('rel-012', 'node-user-service', 'node-host-pay', 'AUTHENTICATED_TO', 14, 95, '2026-07-20T09:00:00Z', '2026-08-03T06:58:00Z', 'Authenticated to'),
  edge('rel-013', 'node-user-app', 'node-host-pay', 'AUTHENTICATED_TO', 32, 99, '2026-05-11T09:00:00Z', '2026-08-03T06:55:00Z', 'Authenticated to'),
  edge('rel-014', 'node-host-pay', 'node-domain-idp', 'CONNECTED_TO', 11, 97, '2026-06-03T09:00:00Z', '2026-08-03T06:48:00Z', 'Connected to'),
  edge('rel-015', 'node-cloud-audit', 'node-user-sarah', 'ACCESSED', 4, 78, '2026-08-02T09:00:00Z', '2026-08-03T06:40:00Z', 'Observed access by'),
  edge('rel-016', 'node-process-cmd', 'node-process-powershell', 'SPAWNED', 3, 91, '2026-08-03T06:12:00Z', '2026-08-03T06:31:00Z', 'Spawned'),
  edge('rel-017', 'node-process-powershell', 'node-file-archive', 'ACCESSED', 2, 86, '2026-08-03T06:06:00Z', '2026-08-03T06:20:00Z', 'Created'),
  edge('rel-018', 'node-host-fin-wks-044', 'node-ip-dns', 'CONNECTED_TO', 24, 99, '2026-07-12T09:00:00Z', '2026-08-03T06:11:00Z', 'Queried DNS'),
  edge('rel-019', 'node-domain-update', 'node-ip-dns', 'RESOLVED_TO', 16, 96, '2026-07-01T09:00:00Z', '2026-08-03T05:58:00Z', 'Resolved by'),
];

function connectedSelection(seedIds: Set<string>, sourceEdges: GraphEdgeDTO[], depth: number): Set<string> {
  const selected = new Set(seedIds);
  let frontier = new Set(seedIds);
  for (let hop = 0; hop < depth; hop += 1) {
    const next = new Set<string>();
    for (const relation of sourceEdges) {
      if (frontier.has(relation.source)) next.add(relation.target);
      if (frontier.has(relation.target)) next.add(relation.source);
    }
    next.forEach((id) => selected.add(id));
    frontier = next;
  }
  return selected;
}

export async function getFoundationConstellation(filters: ConstellationFilters, signal?: AbortSignal): Promise<ConstellationResponse> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 130);
    signal?.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

  const allowedTypes = new Set(filters.entityTypes);
  const allowedEdges = new Set(filters.edgeTypes);
  let filteredNodes = nodes.filter((node) => allowedTypes.has(node.entityType) && node.riskScore >= (filters.minRisk ?? 0));
  let filteredEdges = edges.filter((relation) => allowedEdges.has(relation.edgeType));

  const query = filters.searchQuery?.trim().toLocaleLowerCase();
  const seed = filters.seedEntity;
  if (query || seed) {
    const matches = new Set(filteredNodes.filter((node) => node.entityValue.toLocaleLowerCase().includes(query ?? '') || node.id === seed || node.entityId === seed).map((node) => node.id));
    const connected = connectedSelection(matches, filteredEdges, Math.min(filters.depth, 3));
    filteredNodes = filteredNodes.filter((node) => connected.has(node.id));
  }

  filteredNodes = [...filteredNodes].sort((a, b) => b.riskScore - a.riskScore).slice(0, filters.limit ?? 150);
  const ids = new Set(filteredNodes.map((node) => node.id));
  filteredEdges = filteredEdges.filter((relation) => ids.has(relation.source) && ids.has(relation.target));

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    snapshotId: 'fixture-constellation-snapshot',
    snapshotAt: new Date().toISOString(),
    snapshotExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    queryDurationMs: 184,
    freshness: 'fresh',
    totalNodes: filteredNodes.length,
    totalEdges: filteredEdges.length,
    truncated: false,
    nextCursor: null,
    partialFailures: [],
  };
}

export async function getFoundationExpansion(
  snapshotId: string,
  _nodeId: string,
  signal?: AbortSignal
): Promise<ConstellationExpansionResponse> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 90);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  return {
    addedNodes: [],
    addedEdges: [],
    removedNodes: [],
    snapshotId,
    snapshotExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

export async function getFoundationRelationshipEvidence(
  relationshipId: string,
  signal?: AbortSignal
): Promise<RelationshipEvidenceDTO> {
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 110);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const relationship = edges.find((candidate) => candidate.id === relationshipId);
  if (!relationship) throw new Error('Relationship evidence was not found.');
  const source = nodes.find((candidate) => candidate.id === relationship.source);
  const target = nodes.find((candidate) => candidate.id === relationship.target);
  if (!source || !target) throw new Error('Connected entity context was not found.');
  const observedAt = relationship.lastSeen;
  return {
    id: relationship.id,
    relationshipType: relationship.edgeType,
    direction: 'outbound',
    strength: Math.min(1, relationship.weight / 24),
    confidence: (relationship.confidence ?? 0) / 100,
    sourceEntity: { id: source.entityId ?? source.id, type: source.entityType, value: source.entityValue, riskScore: source.riskScore },
    targetEntity: { id: target.entityId ?? target.id, type: target.entityType, value: target.entityValue, riskScore: target.riskScore },
    events: [
      { id: `${relationship.id}-event-1`, timestamp: observedAt, type: relationship.edgeType, description: `${source.entityValue} ${relationship.label?.toLocaleLowerCase() ?? 'connected to'} ${target.entityValue}.`, source: 'Normalized security telemetry' },
      { id: `${relationship.id}-event-2`, timestamp: relationship.firstSeen, type: 'FIRST_OBSERVED', description: 'The relationship was first observed in the active evidence window.', source: 'Relationship analytics' },
    ],
    alerts: relationship.weight >= 6 ? [{ id: `${relationship.id}-alert-1`, title: `Suspicious ${relationship.label?.toLocaleLowerCase() ?? 'entity relationship'}`, severity: source.riskScore >= 90 ? 'critical' : 'high', timestamp: observedAt }] : [],
    timeline: [
      { timestamp: relationship.firstSeen, eventType: 'first_seen', description: 'First supporting observation' },
      { timestamp: observedAt, eventType: 'last_seen', description: 'Most recent supporting observation' },
    ],
    summary: {
      firstSeen: relationship.firstSeen,
      lastSeen: relationship.lastSeen,
      totalEvents: relationship.eventCount ?? relationship.weight,
      peakActivity: observedAt,
      pattern: relationship.weight >= 12 ? 'regular_interval' : relationship.weight >= 6 ? 'burst' : 'intermittent',
    },
  };
}
