/**
 * Incidents — Type Definitions
 * Incident list specific types per CMD-03 spec
 */

import type { IncidentStatus } from '@/constants/status.constants';
import type { SeverityLevel } from '@/lib/severity';

export interface IncidentListItem {
  id: number;
  incidentName: string;
  incidentDescription?: string | null;
  incidentPriority: 'P1' | 'P2' | 'P3' | 'P4';
  incidentSeverity: number; // 1-10
  incidentStatus: IncidentStatus;
  incidentAssignedTo: string | null;
  incidentCreatedDate: string; // ISO8601
  slaDeadline: string | null; // ISO8601
  slaBreached: boolean;
  incidentSolution?: string | null;
}

export interface IncidentFilters {
  status?: IncidentStatus[];
  severity?: SeverityLevel[];
  priority?: string[];
  assignedTo?: string;
  unassignedOnly?: boolean;
  createdFrom?: string;
  createdTo?: string;
  slaBreached?: boolean;
  q?: string; // text search
}

export interface IncidentQueueSummary {
  active: number;
  critical: number | null;
  breached: number | null;
  unassigned: number | null;
  assignedToMe: number | null;
  snapshotAt: string;
  partial: boolean;
}

export interface CreateIncidentFormData {
  incidentName: string;
  description?: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  severity: number;
  assignedTo?: number;
  slaDeadline?: string;
}
