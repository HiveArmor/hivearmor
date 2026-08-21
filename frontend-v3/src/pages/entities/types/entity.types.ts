/**
 * Entity Intelligence Types — Sprint 45 (ENT-001 through ENT-005)
 * TypeScript interfaces for the entity inventory, preview, pivots, and SSE stream.
 */

// ── Entity Core Types ─────────────────────────────────────────────────────────

export type EntEntityType = 'host' | 'user' | 'ip' | 'domain';
export type EntRiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type EntRiskTrend = 'rising' | 'stable' | 'declining';
export type EntCriticality = 'critical' | 'high' | 'medium' | 'low' | 'unclassified';
export type EntObservationSource = 'endpoint' | 'network' | 'cloud' | 'identity';

// ── ENT-001: Entity Inventory Listing ─────────────────────────────────────────

export interface EntitySummaryItem {
  id: string;
  type: EntEntityType;
  value: string;
  displayName: string;
  riskScore: number;
  riskLevel: EntRiskLevel;
  riskTrend: EntRiskTrend;
  criticality: EntCriticality;
  alertCount: number;
  lastSeen: string;
  firstSeen: string;
  baselineDeviation: number;
  tags: string[];
  observationSources: EntObservationSource[];
  pivots: EntityPivot[];
}

export interface EntityListResponse {
  items: EntitySummaryItem[];
  cursor: string | null;
  total: number;
}

export type EntSortOption =
  | 'risk_desc'
  | 'risk_asc'
  | 'last_seen_desc'
  | 'alert_count_desc'
  | 'name_asc';

export interface EntityListFilters {
  types?: EntEntityType[];
  riskLevels?: EntRiskLevel[];
  criticality?: EntCriticality[];
  sort?: EntSortOption;
  cursor?: string | null;
  limit?: number;
  q?: string;
  alertsActive?: boolean;
  trendRising?: boolean;
}

// ── ENT-002: Summary and Facets ───────────────────────────────────────────────

export interface EntityQueueSummary {
  total: number;
  highRisk: number;
  rising: number;
  activeAlerts: number;
  newEntities24h: number;
}

export interface EntityFacets {
  byType: Record<string, number>;
  byRiskLevel: Record<string, number>;
  byCriticality: Record<string, number>;
  byObservationSource: Record<string, number>;
}

export interface EntitySummaryResponse {
  summary: EntityQueueSummary;
  facets: EntityFacets;
}

// ── ENT-003: Entity Preview ───────────────────────────────────────────────────

export interface ActivitySummary {
  last24h: number;
  last7d: number;
  avgDaily: number;
}

export interface AlertSummary {
  active: number;
  total30d: number;
  highestSeverity: string;
}

export interface EntityPreview {
  id: string;
  type: EntEntityType;
  value: string;
  displayName: string;
  riskScore: number;
  riskLevel: EntRiskLevel;
  riskTrend: EntRiskTrend;
  criticality: EntCriticality;
  baselineDeviation: number;
  activitySummary: ActivitySummary;
  alertSummary: AlertSummary;
  lastSeen: string;
  tags: string[];
  pivots: EntityPivot[];
}

export interface EntityPreviewResponse {
  entity: EntityPreview;
}

// ── ENT-004: Entity Pivots ────────────────────────────────────────────────────

export type PivotType = 'dossier' | 'hunt' | 'alerts' | 'incidents';

export interface EntityPivot {
  id: string;
  type: PivotType;
  label: string;
  route: string;
  parameters: Record<string, string>;
  signature: string;
}

// ── ENT-005: Entity SSE Events ────────────────────────────────────────────────

export type EntitySseEventType =
  | 'entity.risk_changed'
  | 'entity.discovered'
  | 'entity.trend_changed'
  | 'entity.alert_linked'
  | 'entity.baseline_deviation';

export interface EntitySseEvent {
  id: string;
  type: EntitySseEventType;
  timestamp: string;
  data: EntitySseEventData;
}

export interface EntitySseRiskChanged {
  entityId: string;
  entityType: EntEntityType;
  entityValue: string;
  oldScore: number;
  newScore: number;
  oldLevel: EntRiskLevel;
  newLevel: EntRiskLevel;
}

export interface EntitySseDiscovered {
  entityId: string;
  entityType: EntEntityType;
  entityValue: string;
  firstSeen: string;
  observationSource: EntObservationSource;
}

export interface EntitySseTrendChanged {
  entityId: string;
  entityType: EntEntityType;
  entityValue: string;
  oldTrend: EntRiskTrend;
  newTrend: EntRiskTrend;
}

export interface EntitySseAlertLinked {
  entityId: string;
  entityType: EntEntityType;
  entityValue: string;
  alertId: string;
  severity: string;
}

export interface EntitySseBaselineDeviation {
  entityId: string;
  entityType: EntEntityType;
  entityValue: string;
  deviation: number;
  threshold: number;
}

export type EntitySseEventData =
  | EntitySseRiskChanged
  | EntitySseDiscovered
  | EntitySseTrendChanged
  | EntitySseAlertLinked
  | EntitySseBaselineDeviation;
