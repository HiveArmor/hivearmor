/**
 * Alert / QueueItem types — per spec 03-ANALYST-QUEUE.md §7.3
 * These types describe the unified work-queue item returned by the backend.
 */

import type { SeverityLevel } from '@/constants/severity.constants';
import type { AlertStatus } from '@/constants/status.constants';

// ── Work item types ──────────────────────────────────────────────────────────

export const WORK_ITEM_TYPES = [
  'alert',
  'correlated_group',
  'incident',
  'task',
  'approval',
  'failed_automation',
  'sla_risk',
  'data_quality',
] as const;

export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

// ── SLA ──────────────────────────────────────────────────────────────────────

export interface SlaStatusDTO {
  status: 'on_track' | 'at_risk' | 'breached';
  dueAt: string; // ISO 8601
}

// ── Entity references ────────────────────────────────────────────────────────

export interface EntityRef {
  type: 'host' | 'user' | 'ip' | 'domain' | 'process';
  id: string;
  label: string;
}

// ── Note references ──────────────────────────────────────────────────────────

export interface NoteRef {
  id: string;
  content: string;
  author: string;
  createdAt: string; // ISO 8601
}

// ── Assignee ─────────────────────────────────────────────────────────────────

export interface AssigneeDTO {
  id: number;
  login: string;
  firstName: string;
  lastName: string;
}

// ── Tenant ───────────────────────────────────────────────────────────────────

export interface TenantRef {
  id: number;
  name: string;
}

// ── Queue item (unified work-queue row) ──────────────────────────────────────

export interface QueueItem {
  id: string;
  severity: SeverityLevel;
  type: WorkItemType;
  title: string;
  tenant: TenantRef;
  status: AlertStatus;
  assignee: AssigneeDTO | null;
  alertCount: number;
  createdAt: string;     // ISO 8601
  lastActivity: string;  // ISO 8601
  slaStatus: SlaStatusDTO | null;
  mitreTactic?: string;
  mitreTechnique?: string;
  // Extended fields populated when the drawer fetches full detail
  description?: string;
  entities?: EntityRef[];
  tags?: string[];
  notes?: NoteRef[];
}
