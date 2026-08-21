/**
 * Entity types and DTOs for Entity List and Entity Profile pages.
 */

export const ENTITY_TYPES = ['host', 'user', 'ip', 'service', 'process', 'cloud', 'domain'] as const;
export type EntityType = typeof ENTITY_TYPES[number];

export type EntityRiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';
export type EntityRiskTrend = 'rising' | 'stable' | 'falling' | 'new';
export type EntityCriticality = 'mission_critical' | 'high' | 'standard' | 'unknown';

export interface EntityDTO {
  id: string;
  name?: string;
  hostname?: string;
  ipAddress?: string;
  entityType: EntityType;
  riskScore: number;
  riskLevel?: EntityRiskLevel;
  riskTrend?: EntityRiskTrend;
  previousRiskScore?: number;
  baselineDeviation?: number;
  criticality?: EntityCriticality;
  firstSeen?: string;
  lastSeen: string;
  alertCount: number;
  incidentCount?: number;
  sourceCount?: number;
  dataSources?: string[];
  tenantId?: string;
  tenantName?: string;
  tags?: string[];
}

export interface EntityInventorySummary {
  totalApproximate: number;
  highRiskCount: number;
  risingRiskCount: number;
  activeAlertCount: number;
  recentlyObservedCount: number;
}

export interface EntityListResponse {
  items: EntityDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotAt: string | null;
  totalApproximate: number;
  totalIsExact: boolean;
  summary: EntityInventorySummary | null;
  partialFailures: Array<{ source: string; message: string }>;
  contractState: 'complete' | 'legacy';
}

export interface EntityDetailDTO {
  id: string;
  name: string;
  entityType: EntityType;
  riskScore: number;
  previousRiskScore?: number;
  riskLevel?: EntityRiskLevel;
  riskTrend?: EntityRiskTrend;
  criticality?: EntityCriticality;
  baselineDeviation?: number;
  firstSeen?: string;
  lastSeen: string;
  alertCount: number;
  incidentCount?: number;
  anomalyCount?: number;
  tenantId?: string;
  tenantName?: string;
  department?: string;
  role?: string;
  status?: string;
  watchlisted?: boolean;
  riskCalculatedAt?: string;
  riskValidUntil?: string;
  riskDrivers?: Array<{
    id: string;
    label: string;
    description: string;
    contribution: number;
    source: string;
    evidenceCount: number;
  }>;
  baselineMetrics?: Array<{
    id: string;
    label: string;
    current: number;
    baseline: number;
    unit: string;
    direction: 'above' | 'below' | 'normal';
  }>;
  dataSources?: Array<{
    id: string;
    label: string;
    status: 'healthy' | 'degraded' | 'stale';
    lastIngestedAt: string;
  }>;
  topAttackTechniques?: Array<{
    id: string;
    name: string;
    count: number;
  }>;
  associatedUsers?: string[];
  associatedHosts?: string[];
  relatedEntities?: Array<{
    id: string;
    type: EntityType;
    label: string;
    relationship: string;
    firstSeen: string;
    lastSeen: string;
    eventCount: number;
    riskScore?: number;
  }>;
  riskTimeline?: Array<{
    timestamp: string;
    score: number;
    reason?: string;
  }>;
  tags?: string[];
  dataCompleteness?: 'full' | 'core' | 'partial';
  missingDataNotice?: string | null;
  permissions?: {
    hunt: boolean;
    attachToIncident: boolean;
    viewEvents: boolean;
    viewRelationships: boolean;
  };
}

export interface EntityAlertDTO {
  id: string;
  title: string;
  severity: number;
  timestamp: string;
  status: string;
  category?: string;
  ruleName?: string;
  incidentId?: string | null;
}

export interface EntityEventDTO {
  id?: string;
  timestamp: string;
  source: string;
  message: string;
  severity?: EntityRiskLevel;
  category?: string;
  action?: string;
  host?: string | null;
  user?: string | null;
  sourceIp?: string | null;
  alertCount?: number;
}

export interface EntityIncidentOption {
  id: string;
  title: string;
  severity: string;
  status: string;
  entityAlreadyLinked: boolean;
}

export interface EntityListFilters {
  type?: EntityType;
  types?: EntityType[];
  riskMin?: number;
  riskMax?: number;
  riskLevels?: EntityRiskLevel[];
  search?: string;
  activityWindow?: '24h' | '7d' | '30d' | '90d';
  tenantScope?: string;
  sort?: 'risk_desc' | 'activity_desc' | 'alerts_desc' | 'name_asc';
  cursor?: string | null;
  limit?: number;
  fields?: string[];
  page?: number;
  size?: number;
}
