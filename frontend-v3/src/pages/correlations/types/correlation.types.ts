/**
 * Sprint 44 — Correlated Findings types.
 * Interfaces for COR-001 through COR-006 contracts.
 */

import type { SeverityLevel } from '@/lib/severity';

// ── Shared primitives ────────────────────────────────────────────────────────

export type FindingStatus = 'new' | 'reviewing' | 'confirmed' | 'dismissed' | 'promoted';
export type EntityType = 'ip' | 'host' | 'user' | 'process' | 'file' | 'domain';
export type EntityRole = 'attacker' | 'victim' | 'compromised' | 'infrastructure';
export type CorrelationReasonType = 'rule_chain' | 'shared_entity' | 'temporal_proximity' | 'behavior_sequence';
export type RelationshipType = 'authenticated_as' | 'executed_on' | 'lateral_movement' | 'communicated_with' | 'dropped_file' | 'exfiltrated_to';
export type FindingSortOption = 'severity_desc' | 'created_desc' | 'updated_desc' | 'stage_count_desc';

// ── COR-001: Queue listing ───────────────────────────────────────────────────

export interface LeadEntity {
  type: EntityType;
  value: string;
}

export interface FindingPreview {
  id: string;
  title: string;
  severity: SeverityLevel;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
  attackStageCount: number;
  signalCount: number;
  entityCount: number;
  leadEntity: LeadEntity;
  mitreTactics: string[];
  correlationReasons: CorrelationReasonType[];
  assignee: string | null;
}

export interface QueueSummary {
  total: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byStatus: { new: number; reviewing: number; confirmed: number; dismissed: number };
  avgSignalsPerFinding: number;
}

export interface FindingQueueResponse {
  items: FindingPreview[];
  cursor: string | null;
  total: number;
  summary: QueueSummary;
}

// ── COR-002: Complete finding detail ─────────────────────────────────────────

export interface FindingStage {
  order: number;
  name: string;
  mitreTactic: string;
  mitreTechnique: string;
  description: string;
  signalIds: string[];
  timestamp: string;
  status: string;
}

export interface FindingEntity {
  id: string;
  type: EntityType;
  value: string;
  role: EntityRole;
  riskScore: number;
  firstSeen: string;
  lastSeen: string;
  signalCount: number;
}

export interface EntityNode {
  id: string;
  type: EntityType;
  value: string;
  riskScore: number;
}

export interface RelationshipEdge {
  source: string;
  target: string;
  type: RelationshipType;
  evidence: string[];
}

export interface RelationshipGraph {
  nodes: EntityNode[];
  edges: RelationshipEdge[];
}

export interface CorrelationReason {
  type: CorrelationReasonType;
  description: string;
  confidence: number;
  evidence: string;
}

export interface AvailableAction {
  id: string;
  label: string;
  type: 'status_change' | 'assignment';
  enabled: boolean;
  requiredRole: string;
}

export interface CorrelatedFinding {
  id: string;
  title: string;
  narrative: string;
  severity: SeverityLevel;
  status: FindingStatus;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  signalCount: number;
  eventCount: number;
  stages: FindingStage[];
  entities: FindingEntity[];
  relationshipGraph: RelationshipGraph;
  correlationReasons: CorrelationReason[];
  availableActions: AvailableAction[];
  mitreTactics: string[];
  mitreTechniques: string[];
}

export interface FindingDetailResponse {
  finding: CorrelatedFinding;
}

// ── COR-003: Supporting evidence ─────────────────────────────────────────────

export interface Signal {
  id: string;
  alertId: string;
  ruleName: string;
  severity: SeverityLevel;
  timestamp: string;
  description: string;
  entities: string[];
  mitreTechnique: string;
  stage: string;
}

export interface FindingEvent {
  id: string;
  timestamp: string;
  source: string;
  message: string;
  severity: SeverityLevel;
}

export interface FindingRelationship {
  id: string;
  sourceEntity: string;
  targetEntity: string;
  type: RelationshipType;
  evidence: string[];
  confidence: number;
  firstSeen: string;
  lastSeen: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  total: number;
}

// ── COR-004: Lifecycle mutations ─────────────────────────────────────────────

export interface StatusTransition {
  from: FindingStatus;
  to: FindingStatus;
  actor: string;
  timestamp: string;
}

export interface StatusChangeResponse {
  finding: { id: string; status: FindingStatus; updatedAt: string };
  transition: StatusTransition;
}

export interface AssignmentResponse {
  finding: { id: string; assignee: string | null; updatedAt: string };
  previousAssignee: string | null;
}

export interface FindingNote {
  id: string;
  content: string;
  author: string;
  createdAt: string;
  mentions: string[];
}

export interface NoteResponse {
  note: FindingNote;
}

// ── COR-005: Incident promotion ──────────────────────────────────────────────

export interface PromotionTimelineEntry {
  timestamp: string;
  description: string;
  stage: string;
}

export interface PromotionPreview {
  title: string;
  description: string;
  severity: SeverityLevel;
  entities: string[];
  alertCount: number;
  evidenceCount: number;
  timeline: PromotionTimelineEntry[];
  mitreTactics: string[];
}

export interface PromotionPreviewResponse {
  preview: PromotionPreview;
  warnings: string[];
  previewToken: string;
}

export interface PromotionExecuteResponse {
  incidentId: string;
  incidentUrl: string;
  status: string;
  migratedAlerts: number;
  migratedEntities: number;
}

// ── COR-006: SSE events ─────────────────────────────────────────────────────

export type SseEventType =
  | 'finding.created'
  | 'finding.updated'
  | 'finding.escalated'
  | 'finding.stage_added'
  | 'finding.signal_added';

export interface SseEvent {
  id: string;
  type: SseEventType;
  timestamp: string;
  data: FindingPreview;
  actor?: string;
}
