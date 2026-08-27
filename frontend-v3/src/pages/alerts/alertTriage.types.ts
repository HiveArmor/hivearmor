import type { AlertDetailDTO } from '@/components/alert-context-drawer/alertContextDrawer.types';
import type { UtmAlert } from '@/types/api.types';

/**
 * Raw backend response shape from GET /ha-alerts/{id} (ALT-020 full projection).
 * This is the actual payload returned by the Java detail endpoint — NOT the frontend DTO.
 */
export interface BackendAlertDetail {
  id: string;
  title: string;
  summary: string | null;
  severity: number;
  riskScore: number;
  confidence: number;
  status: number;
  statusLabel: string;
  category: string;
  detectedAt: string;
  updatedAt: string;
  mitreAttack: {
    tacticId: string | null;
    tacticName: string | null;
    techniqueId: string | null;
    techniqueName: string | null;
    subTechnique: string | null;
  } | null;
  riskBreakdown: Array<{
    name: string;
    weight: number;
    contribution: number;
    description: string;
  }>;
  threatIntelMatches: Array<{
    source: string;
    type: string;
    confidence: number;
    lastSeen?: string;
  }>;
  timeline: Array<{
    timestamp?: string;
    at?: string;
    actor?: string;
    action?: string;
    note?: string;
    detail?: string;
    from?: number;
    to?: number;
  }>;
  relatedAlerts: Array<{ id: string; title: string; severity: number }>;
  availableActions: Array<{
    id: string;
    allowed: boolean;
    reason: string | null;
    reasonCode: string | null;
    requiresReason: boolean;
    requiresPreview: boolean;
  }>;
  primaryEntity: { id: string; type: string; label: string; riskScore: number } | null;
  assignee: { id: string; displayName: string } | null;
  tenant: { id: string; name: string } | null;
  sla: { status: string; dueAt: string } | null;
  tags: string[];
  version: number;
  dataCompleteness: string;
  renderedReason: string | null;
  occurrenceCount: number;
  rawFields?: Record<string, string>;
  // Preserved legacy fields (adversary/target/rule)
  adversary?: { ip: string | null; hostname: string | null; processName: string | null; username: string | null } | null;
  target?: { ip: string | null; hostname: string | null; processName: string | null; username: string | null } | null;
  ruleId?: string | null;
  ruleName?: string | null;
}

export type AlertQueueMode = 'live' | 'historical';

export type AlertSlaState = 'on_track' | 'at_risk' | 'breached' | 'none';

export interface AlertQueueRecord extends UtmAlert {
  summary?: string;
  reason?: string;
  ruleId?: string;
  ruleName?: string;
  sourceProduct?: string;
  updatedAt?: string;
  assigneeId?: number;
  assigneeName?: string;
  primaryEntity?: {
    id: string;
    type: 'host' | 'user' | 'ip' | 'domain' | 'process' | 'file';
    label: string;
    riskScore?: number;
  };
  slaStatus?: AlertSlaState;
  relatedAlertCount?: number;
  eventCount?: number;
  occurrenceCount?: number;
  version?: number;
  availableActions?: Array<{
    id: string;
    allowed: boolean;
    reason: string | null;
    reasonCode: string | null;
    requiresReason: boolean;
    requiresPreview: boolean;
  }>;
}

export interface AlertQueueSummary {
  totalApproximate: number | null;
  criticalOpen: number | null;
  slaAtRisk: number | null;
  unassigned: number | null;
  threatIntelMatched: number | null;
  snapshotAt: string | null;
  dataCompleteness: 'complete' | 'unavailable';
}

/** Inventory scopes for `/alerts` — distinct from Analyst Queue triage defaults. */
export interface AlertQueueView {
  id: 'all' | 'open' | 'in_review' | 'closed' | 'critical';
  label: string;
  description: string;
  countKey?: keyof Pick<AlertQueueSummary, 'criticalOpen'>;
  filters: AlertQueueFilters;
}

export interface AlertQueueFilters {
  severity?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  assignee?: string;
  tenantId?: string;
  category?: string;
  riskMin?: string;
  sla?: string;
  threatIntel?: string;
  adversaryIp?: string;
  targetIp?: string;
  tags?: string;
  queryExpression?: string;
}

export type AlertQueueLoadState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; loadedAt: string }
  | { state: 'error'; message: string };

export interface AlertEvidenceField {
  field: string;
  value: string;
  source: string;
  emphasis?: 'critical' | 'warning' | 'intel' | 'neutral';
}

export interface AlertActivityItem {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface AlertTriageDetail extends AlertDetailDTO {
  statusCode: number;
  summary: string | null;
  reason: string | null;
  sourceProduct: string | null;
  assigneeName: string | null;
  primaryEntity: AlertQueueRecord['primaryEntity'] | null;
  relatedAlertCount: number | null;
  eventCount: number | null;
  occurrenceCount: number | null;
  evidenceFields: AlertEvidenceField[];
  activity: AlertActivityItem[];
  version: number | null;
  dataCompleteness: 'triage' | 'core';
}

export type AlertTriageAction =
  | 'acknowledge'
  | 'change_status'
  | 'true_positive'
  | 'false_positive'
  | 'assign'
  | 'note'
  | 'tag'
  | 'promote';

export type AlertRowQuickAction = 'change_status' | 'note' | 'tag' | 'promote';

export interface AlertStatusCommand {
  alertIds: string[];
  status: 2 | 3 | 5 | 6 | 7;
  statusObservation: string;
  addFalsePositiveTag: boolean;
}
