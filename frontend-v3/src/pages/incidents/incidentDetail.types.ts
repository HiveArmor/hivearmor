/**
 * Incident Detail — Type Definitions
 * Full incident investigation workbench types per CMD-04 spec
 */

import type { IncidentStatus } from '@/constants/status.constants';

export interface IncidentDetail {
  id: number;
  incidentName: string;
  incidentDescription: string | null;
  incidentPriority: 'P1' | 'P2' | 'P3' | 'P4';
  incidentSeverity: number; // 1-10
  incidentStatus: IncidentStatus;
  incidentAssignedTo: string | null;
  incidentAssignedToId: number | null;
  incidentSolution: string | null;
  incidentCreatedDate: string; // ISO8601
  incidentLastUpdated: string; // ISO8601
  slaDeadline: string | null; // ISO8601
}

export interface TimelineEvent {
  id: number | string;
  timestamp: string; // ISO8601
  eventType?: 'alert_added' | 'note_added' | 'status_changed' | 'task_created' | 'evidence_added' | 'priority_changed' | 'assignee_changed' | string;
  type?: string; // Backend returns this instead of eventType
  actor: string; // username or "System"
  description?: string;
  title?: string; // Backend returns this instead of description
  details?: string;
}

export interface EvidenceItem {
  id: number;
  incidentId: number;
  itemType: 'ALERT' | 'NOTE' | 'EXTERNAL_URL' | 'ARTIFACT';
  title: string;
  content: string | null;
  sourceRef: string | null;
  severityHint: 'critical' | 'high' | 'medium' | 'low' | null;
  createdBy: string;
  createdAt: string; // ISO8601
}

export interface EvidencePlacement {
  id: number;
  evidenceItemId: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  schemaVersion: number;
}

export interface EvidenceRelationship {
  id: number;
  fromItemId: number;
  toItemId: number;
  relationshipType: string;
  label: string | null;
}

export interface InvestigationSession {
  id: number;
  incidentId: number;
  createdDate: string; // ISO8601
  createdBy: string;
  status: 'OPEN' | 'CLOSED';
  summary: string | null;
}

export type InvestigationTab =
  | 'overview'
  | 'timeline'
  | 'evidence'
  | 'alerts'
  | 'events'
  | 'tasks'
  | 'response'
  | 'activity'
  | 'notes';
