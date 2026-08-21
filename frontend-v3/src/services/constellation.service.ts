/** Threat Constellation data access with snapshot-bound exploration and progressive evidence. */

import { apiClient } from '@/lib/apiClient';
import type {
  ConstellationExpansionResponse,
  ConstellationFilters,
  ConstellationResponse,
  EdgeType,
  EntityScope,
  EntityType,
  GraphEdgeDTO,
  GraphNodeDTO,
  RelationshipEvidenceDTO,
} from '@/types/constellation.types';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
const BASE_PATH = '/ha-constellation';

interface ApiGraphNode {
  id: string;
  entityId?: string;
  type?: string;
  value?: string;
  displayName?: string;
  riskScore?: number;
  alertCount?: number;
  expandable?: boolean;
  expanded?: boolean;
}

interface ApiGraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType?: string;
  strength?: number;
  confidence?: number;
  label?: string;
  eventCount?: number;
  firstSeen?: string;
  lastSeen?: string;
}

interface ApiSnapshotMetadata {
  snapshotId?: string;
  createdAt?: string;
  expiresAt?: string;
  totalNodes?: number;
  totalEdges?: number;
  truncated?: boolean;
  hopsExplored?: number;
}

interface ApiExploreResponse {
  snapshotId: string | null;
  graph: { nodes?: ApiGraphNode[]; edges?: ApiGraphEdge[] };
  metadata: ApiSnapshotMetadata;
}

interface ApiExpansionResponse {
  addedNodes?: ApiGraphNode[];
  addedEdges?: ApiGraphEdge[];
  removedNodes?: string[];
  snapshot?: ApiSnapshotMetadata;
}

interface ApiRelationshipEvidenceResponse {
  relationship: RelationshipEvidenceDTO;
}

const ENTITY_TYPES = new Set<EntityType>(['user', 'host', 'ip', 'process', 'file', 'domain', 'service', 'cloud']);
const EDGE_TYPES = new Set<EdgeType>([
  'CONNECTED_TO', 'SPAWNED', 'LOGGED_IN_FROM', 'RESOLVED_TO', 'CONTAINS', 'ACCESSED',
  'AUTHENTICATED_TO', 'COMMUNICATED_WITH', 'EXECUTED_ON',
]);

function normalizeEntityType(value?: string): EntityType {
  const normalized = value?.trim().toLocaleLowerCase().replace(/[-_ ]+/g, '_');
  if (normalized && ENTITY_TYPES.has(normalized as EntityType)) return normalized as EntityType;
  if (normalized === 'ip_address' || normalized === 'ipv4' || normalized === 'ipv6') return 'ip';
  if (normalized === 'asset' || normalized === 'device' || normalized === 'endpoint') return 'host';
  if (normalized === 'account' || normalized === 'identity') return 'user';
  if (normalized === 'application') return 'service';
  return 'service';
}

function normalizeEdgeType(value?: string): EdgeType {
  const normalized = value?.trim().toLocaleUpperCase().replace(/[- ]+/g, '_');
  if (normalized && EDGE_TYPES.has(normalized as EdgeType)) return normalized as EdgeType;
  const aliases: Record<string, EdgeType> = {
    RELATED_TO: 'CONNECTED_TO',
    CONNECTED: 'CONNECTED_TO',
    AUTHENTICATED: 'AUTHENTICATED_TO',
    EXECUTED: 'EXECUTED_ON',
    COMMUNICATED: 'COMMUNICATED_WITH',
    RESOLVED: 'RESOLVED_TO',
  };
  return aliases[normalized ?? ''] ?? 'CONNECTED_TO';
}

function privateIp(value: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(value);
}

function inferScope(type: EntityType, value: string): EntityScope {
  if (type === 'ip') return privateIp(value) ? 'internal' : 'external';
  return 'unknown';
}

function percent(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.round((value <= 1 ? value * 100 : value) * 10) / 10;
}

function mapNode(node: ApiGraphNode): GraphNodeDTO {
  const entityType = normalizeEntityType(node.type);
  const entityValue = node.displayName || node.value || node.entityId || node.id;
  return {
    id: node.id,
    entityId: node.entityId ?? node.id,
    entityType,
    entityValue,
    scope: inferScope(entityType, entityValue),
    riskScore: Math.max(0, Math.min(100, node.riskScore ?? 0)),
    alertCount: Math.max(0, node.alertCount ?? 0),
    expandable: node.expandable !== false && node.expanded !== true,
  };
}

function mapEdge(edge: ApiGraphEdge): GraphEdgeDTO {
  const eventCount = Math.max(0, edge.eventCount ?? 0);
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    edgeType: normalizeEdgeType(edge.relationshipType),
    label: edge.label || edge.relationshipType?.replace(/_/g, ' ') || 'Connected to',
    weight: Math.max(1, eventCount || Math.round((edge.strength ?? 0.1) * 10)),
    eventCount,
    evidenceCount: eventCount,
    confidence: percent(edge.confidence),
    firstSeen: edge.firstSeen || '',
    lastSeen: edge.lastSeen || '',
    directed: true,
  };
}

function boundedProjection(
  nodes: GraphNodeDTO[],
  edges: GraphEdgeDTO[],
  filters: ConstellationFilters
): { nodes: GraphNodeDTO[]; edges: GraphEdgeDTO[] } {
  const allowedNodeTypes = new Set(filters.entityTypes);
  const allowedEdgeTypes = new Set(filters.edgeTypes);
  const visibleNodes = nodes.filter((node) =>
    allowedNodeTypes.has(node.entityType) && node.riskScore >= (filters.minRisk ?? 0)
  );
  const nodeIds = new Set(visibleNodes.map((node) => node.id));
  return {
    nodes: visibleNodes,
    edges: edges.filter((edge) =>
      nodeIds.has(edge.source) && nodeIds.has(edge.target) && allowedEdgeTypes.has(edge.edgeType)
    ),
  };
}

function exploreSeed(filters: ConstellationFilters): { type: 'entity' | 'query'; value: string } {
  if (filters.seedEntity) return { type: 'entity', value: filters.seedEntity };
  return { type: 'query', value: filters.searchQuery?.trim() || '*' };
}

export const constellationService = {
  async getConstellation(filters: ConstellationFilters, signal?: AbortSignal): Promise<ConstellationResponse> {
    if (fixtureMode) {
      const fixture = await import('@/pages/constellation/constellation.fixtures');
      return fixture.getFoundationConstellation(filters, signal);
    }

    const nodeLimit = Math.min(Math.max(filters.limit ?? 150, 25), 200);
    const startedAt = performance.now();
    const response = await apiClient.post<ApiExploreResponse>(
      `${BASE_PATH}/explore`,
      {
        seed: exploreSeed(filters),
        options: {
          hopDepth: Math.min(Math.max(filters.depth, 1), 3),
          nodeLimit,
          edgeLimit: Math.min(nodeLimit * 3, 500),
          entityTypes: filters.entityTypes,
          confidenceThreshold: 0,
          timeWindow: filters.timeRange,
        },
      },
      { signal }
    );

    const allNodes = (response.graph.nodes ?? []).map(mapNode);
    const allEdges = (response.graph.edges ?? []).map(mapEdge);
    const projection = boundedProjection(allNodes, allEdges, filters);
    return {
      ...projection,
      snapshotId: response.snapshotId,
      snapshotAt: response.metadata.createdAt,
      snapshotExpiresAt: response.metadata.expiresAt,
      queryDurationMs: Math.round(performance.now() - startedAt),
      freshness: 'fresh',
      totalNodes: response.metadata.totalNodes ?? allNodes.length,
      totalEdges: response.metadata.totalEdges ?? allEdges.length,
      truncated: response.metadata.truncated ?? false,
      nextCursor: null,
      partialFailures: [],
    };
  },

  async expandConstellation(
    snapshotId: string,
    nodeId: string,
    signal?: AbortSignal
  ): Promise<ConstellationExpansionResponse> {
    if (fixtureMode) {
      const fixture = await import('@/pages/constellation/constellation.fixtures');
      return fixture.getFoundationExpansion(snapshotId, nodeId, signal);
    }
    const response = await apiClient.post<ApiExpansionResponse>(
      `${BASE_PATH}/explore/${encodeURIComponent(snapshotId)}/expand`,
      { nodeId, hopDepth: 1, nodeLimit: 50, edgeLimit: 100, direction: 'both' },
      { signal }
    );
    return {
      addedNodes: (response.addedNodes ?? []).map(mapNode),
      addedEdges: (response.addedEdges ?? []).map(mapEdge),
      removedNodes: response.removedNodes ?? [],
      snapshotId,
      snapshotExpiresAt: response.snapshot?.expiresAt,
    };
  },

  async getRelationshipEvidence(
    relationshipId: string,
    signal?: AbortSignal
  ): Promise<RelationshipEvidenceDTO> {
    if (fixtureMode) {
      const fixture = await import('@/pages/constellation/constellation.fixtures');
      return fixture.getFoundationRelationshipEvidence(relationshipId, signal);
    }
    const response = await apiClient.get<ApiRelationshipEvidenceResponse>(
      `${BASE_PATH}/relationships/${encodeURIComponent(relationshipId)}`,
      { signal }
    );
    return response.relationship;
  },
};
