/**
 * Sprint 48 Threat Constellation Types — CON-001 through CON-005.
 * Bounded graph exploration, expansion, relationship evidence, pivots, and SSE.
 */

// ── Graph core types ──────────────────────────────────────────────────────────

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type SeedType = 'entity' | 'query' | 'incident' | 'alert';

export type LayoutMode = 'force' | 'circular' | 'hierarchical';

export type RelationshipPattern = 'regular_interval' | 'burst' | 'one_time' | 'intermittent';

export type PivotType = 'dossier' | 'hunt' | 'alerts' | 'incidents' | 'isolate' | 'block';

export type ExpandDirection = 'outbound' | 'inbound' | 'both';

export type SseEventType =
  | 'node.risk_changed'
  | 'node.alert_added'
  | 'edge.strength_changed'
  | 'edge.discovered'
  | 'node.discovered'
  | 'snapshot.expired';

// ── Graph node ────────────────────────────────────────────────────────────────

export interface GraphPivot {
  id: string;
  type: PivotType;
  label: string;
  route: string;
  parameters: Record<string, string>;
  signature: string;
  requiredRole: string;
}

export interface GraphNode {
  id: string;
  entityId: string;
  type: string;
  value: string;
  displayName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  alertCount: number;
  size: number;
  group: string | null;
  expandable: boolean;
  expanded: boolean;
  pivots: GraphPivot[];
}

// ── Graph edge ────────────────────────────────────────────────────────────────

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  strength: number;
  confidence: number;
  label: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
}

// ── Cluster ───────────────────────────────────────────────────────────────────

export interface Cluster {
  id: string;
  label: string;
  nodeCount: number;
  color: string;
}

// ── Constellation graph (combined response) ───────────────────────────────────

export interface ConstellationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
}

// ── Seed and explore options ──────────────────────────────────────────────────

export interface SeedDescriptor {
  type: SeedType;
  value: string;
  context?: Record<string, string>;
}

export interface ExploreOptions {
  hopDepth: number;
  nodeLimit: number;
  edgeLimit: number;
  entityTypes?: string[];
  confidenceThreshold?: number;
  timeWindow?: string;
}

// ── Snapshot metadata ─────────────────────────────────────────────────────────

export interface SnapshotMetadata {
  snapshotId: string;
  createdAt: string;
  expiresAt: string;
  seed: SeedDescriptor;
  totalNodes: number;
  totalEdges: number;
  truncated: boolean;
  hopsExplored: number;
}

// ── Exploration response (CON-001) ────────────────────────────────────────────

export interface ExploreResponse {
  snapshotId: string;
  graph: ConstellationGraph;
  metadata: SnapshotMetadata;
}

// ── Expansion result (CON-002) ────────────────────────────────────────────────

export interface ExpansionResult {
  addedNodes: GraphNode[];
  addedEdges: GraphEdge[];
  removedNodes?: string[];
  snapshot: SnapshotMetadata;
}

export interface ExpandOptions {
  nodeId: string;
  hopDepth?: number;
  nodeLimit?: number;
  edgeLimit?: number;
  direction?: ExpandDirection;
}

// ── Relationship evidence (CON-003) ───────────────────────────────────────────

export interface RelationshipEvent {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  source: string;
}

export interface RelationshipAlert {
  id: string;
  title: string;
  severity: string;
  timestamp: string;
}

export interface TimelineEntry {
  timestamp: string;
  eventType: string;
  description: string;
}

export interface RelationshipSummary {
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  peakActivity: string;
  pattern: RelationshipPattern;
}

export interface RelationshipEntity {
  id: string;
  type: string;
  value: string;
  riskScore: number;
}

export interface DetailedRelationship {
  id: string;
  sourceEntity: RelationshipEntity;
  targetEntity: RelationshipEntity;
  relationshipType: string;
  direction: string;
  strength: number;
  confidence: number;
  events: RelationshipEvent[];
  alerts: RelationshipAlert[];
  timeline: TimelineEntry[];
  summary: RelationshipSummary;
}

export interface RelationshipEvidenceResponse {
  relationship: DetailedRelationship;
}

// ── SSE events (CON-005) ──────────────────────────────────────────────────────

export interface SseEventData {
  snapshotId: string;
  nodeId?: string;
  edgeId?: string;
  [key: string]: unknown;
}

export interface SseEvent {
  id: string;
  type: SseEventType;
  timestamp: string;
  data: SseEventData;
}

// ── Node risk change event data ───────────────────────────────────────────────

export interface NodeRiskChangedData extends SseEventData {
  nodeId: string;
  oldScore: number;
  newScore: number;
  oldLevel: RiskLevel;
  newLevel: RiskLevel;
}

export interface EdgeStrengthChangedData extends SseEventData {
  edgeId: string;
  oldStrength: number;
  newStrength: number;
  newEventCount: number;
}

export interface NodeDiscoveredData extends SseEventData {
  connectedTo: string;
  discoveredEntity: {
    id: string;
    type: string;
    value: string;
    riskScore: number;
  };
  relationshipType: string;
}
