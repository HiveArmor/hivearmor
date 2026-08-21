/** Threat Constellation contracts — bounded, evidence-backed relationship exploration. */

export type EntityType = 'user' | 'host' | 'ip' | 'process' | 'file' | 'domain' | 'service' | 'cloud';

export type EdgeType =
  | 'CONNECTED_TO'
  | 'SPAWNED'
  | 'LOGGED_IN_FROM'
  | 'RESOLVED_TO'
  | 'CONTAINS'
  | 'ACCESSED'
  | 'AUTHENTICATED_TO'
  | 'COMMUNICATED_WITH'
  | 'EXECUTED_ON';

export type EntityScope = 'internal' | 'external' | 'unknown';
export type GraphFreshness = 'fresh' | 'stale' | 'degraded';
export type ConstellationSeedType = 'entity' | 'query' | 'incident' | 'alert';

export interface GraphNodeDTO {
  id: string;
  entityId?: string;
  entityType: EntityType;
  entityValue: string;
  scope?: EntityScope;
  riskScore: number;
  riskTrend?: 'rising' | 'stable' | 'falling' | 'new';
  criticality?: string;
  alertCount: number;
  incidentCount?: number;
  anomalyCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  sources?: string[];
  tags?: string[];
  expandable?: boolean;
  x?: number;
  y?: number;
}

export interface GraphEdgeDTO {
  id: string;
  source: string;
  target: string;
  edgeType: EdgeType;
  label?: string;
  weight: number;
  eventCount?: number;
  evidenceCount?: number;
  confidence?: number;
  sourceCount?: number;
  firstSeen: string;
  lastSeen: string;
  directed?: boolean;
}

export interface ConstellationPartialFailure {
  projection: 'nodes' | 'edges' | 'risk' | 'evidence';
  message: string;
  retryable: boolean;
}

export interface ConstellationResponse {
  nodes: GraphNodeDTO[];
  edges: GraphEdgeDTO[];
  snapshotId?: string | null;
  snapshotAt?: string;
  snapshotExpiresAt?: string;
  queryDurationMs?: number;
  freshness?: GraphFreshness;
  totalNodes?: number;
  totalEdges?: number;
  truncated?: boolean;
  nextCursor?: string | null;
  partialFailures?: ConstellationPartialFailure[];
}

export interface ConstellationFilters {
  entityTypes: EntityType[];
  edgeTypes: EdgeType[];
  depth: number;
  timeRange: string;
  minRisk?: number;
  searchQuery?: string;
  seedEntity?: string;
  limit?: number;
  includeNonAlerting?: boolean;
}

export interface ConstellationExpansionResponse {
  addedNodes: GraphNodeDTO[];
  addedEdges: GraphEdgeDTO[];
  removedNodes: string[];
  snapshotId: string;
  snapshotExpiresAt?: string;
}

export interface RelationshipEvidenceEvent {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  source: string;
}

export interface RelationshipEvidenceAlert {
  id: string;
  title: string;
  severity: string;
  timestamp: string;
}

export interface RelationshipEvidenceTimelineEntry {
  timestamp: string;
  eventType: string;
  description: string;
}

export interface RelationshipEvidenceDTO {
  id: string;
  relationshipType: string;
  direction: string;
  strength: number;
  confidence: number;
  sourceEntity: { id: string; type: string; value: string; riskScore: number };
  targetEntity: { id: string; type: string; value: string; riskScore: number };
  events: RelationshipEvidenceEvent[];
  alerts: RelationshipEvidenceAlert[];
  timeline: RelationshipEvidenceTimelineEntry[];
  summary: {
    firstSeen: string;
    lastSeen: string;
    totalEvents: number;
    peakActivity: string;
    pattern: string;
  };
}
