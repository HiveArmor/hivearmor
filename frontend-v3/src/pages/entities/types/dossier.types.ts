/**
 * Entity Dossier Types — Sprint 46 (ENT-006 through ENT-010)
 * TypeScript interfaces for the entity dossier, activity timeline,
 * related alerts, relationships, and incident linking.
 */

import type { EntCriticality, EntEntityType, EntRiskLevel, EntRiskTrend } from './entity.types';

// ── ENT-006: Dossier Core ─────────────────────────────────────────────────────

export interface EntityDossier {
  identity: EntityIdentity;
  riskProfile: RiskProfile;
  baseline: BaselineData;
  sourceCoverage: SourceCoverage;
  attackTechniques: AttackTechniques;
  summary: DossierSummary;
}

export interface EntityIdentity {
  id: string;
  type: EntEntityType;
  value: string;
  displayName: string;
  firstSeen: string;
  lastSeen: string;
  tags: string[];
  criticality: EntCriticality;
  department?: string;
  os?: string;
  location?: string;
}

export interface RiskProfile {
  score: number;
  level: EntRiskLevel;
  trend: EntRiskTrend;
  drivers: RiskDriver[];
  history: RiskHistoryEntry[];
}

export interface RiskDriver {
  id: string;
  category: string;
  description: string;
  contribution: number;
  evidence: string;
  lastSeen: string;
}

export interface RiskHistoryEntry {
  date: string;
  score: number;
}

export interface BaselineData {
  metrics: MetricEntry[];
  deviations: Deviation[];
  learningPeriod: string;
  lastUpdated: string;
}

export type MetricStatus = 'normal' | 'deviation' | 'critical_deviation';

export interface MetricEntry {
  name: string;
  current: number;
  baseline: number;
  unit: string;
  status: MetricStatus;
}

export type DeviationSignificance = 'low' | 'medium' | 'high' | 'critical';
export type DeviationDirection = 'above' | 'below';

export interface Deviation {
  metric: string;
  deviation: number;
  direction: DeviationDirection;
  since: string;
  significance: DeviationSignificance;
}

export interface SourceCoverage {
  sources: SourceEntry[];
  gaps: SourceGap[];
}

export type SourceStatus = 'active' | 'stale' | 'inactive';

export interface SourceEntry {
  name: string;
  type: string;
  lastEvent: string;
  eventCount: number;
  status: SourceStatus;
}

export type GapSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SourceGap {
  source: string;
  lastSeen: string | null;
  expectedInterval: string;
  severity: GapSeverity;
}

export interface AttackTechniques {
  techniques: TechniqueEntry[];
  tacticsHeatmap: Record<string, number>;
}

export interface TechniqueEntry {
  id: string;
  name: string;
  tactic: string;
  alertCount: number;
  lastSeen: string;
  confidence: number;
}

export interface DossierSummary {
  riskStatement: string;
  recommendedActions: string[];
  investigationHints: string[];
}

export interface DossierResponse {
  dossier: EntityDossier;
}

// ── ENT-007: Activity Timeline ────────────────────────────────────────────────

export type ActivityEventType =
  | 'process_execution'
  | 'network_connection'
  | 'authentication'
  | 'file_operation'
  | 'registry_change'
  | 'service_change'
  | 'dns_query'
  | 'alert_triggered';

export type ActivityCategory =
  | 'execution'
  | 'network'
  | 'identity'
  | 'file'
  | 'system'
  | 'security';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: ActivityEventType;
  category: ActivityCategory;
  description: string;
  source: string;
  severity: string;
  details: Record<string, unknown>;
  relatedEntityIds: string[];
}

export interface ActivityTimelineWindow {
  from: string;
  to: string;
}

export interface ActivityResponse {
  items: ActivityEvent[];
  cursor: string | null;
  total: number;
  window: ActivityTimelineWindow;
}

export interface ActivityFilters {
  cursor?: string | null;
  limit?: number;
  types?: ActivityEventType[];
  from?: string;
  to?: string;
}

// ── ENT-008: Related Alerts ───────────────────────────────────────────────────

export type EntityRole = 'source' | 'target' | 'actor' | 'asset';
export type AlertStatus = 'new' | 'triaging' | 'escalated' | 'closed';

export interface RelatedAlert {
  id: string;
  title: string;
  severity: string;
  status: AlertStatus;
  ruleName: string;
  timestamp: string;
  mitreTechnique: string;
  incidentId?: string;
  entityRole: EntityRole;
}

export interface RelatedAlertsResponse {
  items: RelatedAlert[];
  cursor: string | null;
  total: number;
}

export interface RelatedAlertsFilters {
  cursor?: string | null;
  limit?: number;
  severity?: string[];
  status?: AlertStatus[];
  from?: string;
  to?: string;
}

// ── ENT-009: Entity Relationships ─────────────────────────────────────────────

export type RelationshipType =
  | 'authenticated_to'
  | 'communicated_with'
  | 'executed_on'
  | 'accessed_from'
  | 'transferred_data'
  | 'part_of_group'
  | 'same_subnet';

export type RelationshipDirection = 'outbound' | 'inbound' | 'bidirectional';

export interface RelatedEntitySummary {
  id: string;
  type: EntEntityType;
  value: string;
  riskScore: number;
  riskLevel: EntRiskLevel;
}

export interface EvidenceEntry {
  type: string;
  description: string;
  timestamp: string;
  eventId?: string;
}

export interface EntityRelationship {
  id: string;
  relatedEntity: RelatedEntitySummary;
  relationshipType: RelationshipType;
  direction: RelationshipDirection;
  strength: number;
  evidence: EvidenceEntry[];
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
}

export interface RelationshipsResponse {
  items: EntityRelationship[];
  cursor: string | null;
  total: number;
}

export interface RelationshipsFilters {
  cursor?: string | null;
  limit?: number;
  types?: RelationshipType[];
}

// ── ENT-010: Incident Linking ─────────────────────────────────────────────────

export interface IncidentLinkPreviewRequest {
  incidentId?: string;
  createNew: boolean;
}

export interface IncidentLinkPreview {
  preview: Record<string, unknown>;
  previewToken: string;
}

export interface IncidentLinkExecuteRequest {
  incidentId?: string;
  createNew: boolean;
  title?: string;
  severity?: string;
  previewToken: string;
}

export interface IncidentLinkResult {
  incidentId: string;
  status: string;
  linkedAlerts: number;
  linkedEvidence: number;
}
