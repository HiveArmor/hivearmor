/**
 * HiveArmor SOAR Playbook types.
 * Sprint 18 — T01 · frontend-v3/src/types/playbook.ts
 */

export type PlaybookTriggerType = 'manual' | 'alert-triggered' | 'scheduled';

export type PlaybookStatus = 'success' | 'failure' | 'running' | 'cancelled';

export type PlaybookStepType = 'condition' | 'action' | 'delay' | 'loop' | 'approval';

export interface PlaybookStep {
  stepIndex: number;
  stepType: PlaybookStepType;
  label: string;
  config: Record<string, unknown>;
}

export interface Playbook {
  id: number;
  name: string;
  description: string;
  triggerType: PlaybookTriggerType;
  active: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: PlaybookStatus | null;
  steps: PlaybookStep[];
}

export interface PlaybookExecution {
  executionId: string;
  playbookId: number;
  playbookName: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  status: PlaybookStatus;
  triggeredBy: string;
}

/** Immutable, tenant-authorized audit projection for one playbook. */
export interface PlaybookAuditEntry {
  id: string;
  occurredAt: string;
  action: 'CREATED' | 'UPDATED' | 'VALIDATED' | 'PUBLISHED' | 'ACTIVATED' | 'DEACTIVATED' | 'EXECUTED';
  actor: string;
  actorRole: string;
  summary: string;
  version: number;
  correlationId?: string;
}

export interface PlaybookAuditPage {
  items: PlaybookAuditEntry[];
  nextCursor: string | null;
  total: number;
  hasMore: boolean;
}

// T04 — Execution event types
export type ExecutionEventType =
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'playbook_completed'
  | 'playbook_failed';

export type StepExecutionState = 'pending' | 'running' | 'completed' | 'failed';

export interface PlaybookExecutionEvent {
  type: ExecutionEventType;
  stepIndex: number | null;
  stepLabel: string | null;
  stepType: string | null;
  output: unknown;
  errorMessage: string | null;
  timestamp: string;
}

export interface StepExecutionStatus {
  state: StepExecutionState;
  output: unknown;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
