/**
 * Detection Rules — Type Definitions (S22)
 * Per DEF-01 spec
 */

import type { SeverityLevel } from '@/constants/severity.constants';

export interface DetectionRule {
  /** Canonical backend IDs are UUID strings; fixture IDs remain numeric. */
  id: string | number;
  ruleName: string;
  /** Normalized telemetry requirements. Never substitute content tags here. */
  dataTypes: string[];
  /** Search and classification labels returned independently by the backend. */
  tags?: string[];
  ruleActive: boolean;
  lastModified: string;
  sigmaRuleId: string | null;
  description?: string;
  category?: string;
  severity?: SeverityLevel;
  ruleDefinition?: string;
  matchCount?: number;
  createdBy?: string;
  tenantId?: number;
  techniqueId?: string;
  techniqueName?: string;
  tactic?: string;
  origin?: 'managed' | 'custom';
  health?: 'healthy' | 'warning' | 'failed' | 'unknown';
  healthMessage?: string;
  lastRunAt?: string | null;
  lastRunDurationMs?: number | null;
  schedule?: string;
  lookback?: string;
  alerts24h?: number;
  version?: number;
  updatedBy?: string;
  hasGap?: boolean;
  threshold?: number;
  suppressionDuration?: string;
  groupBy?: string[];
  deduplicateBy?: string[];
  references?: string[];
  responseMode?: 'alert-only' | 'create-incident';
}

export interface RuleListParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  dataType?: string[];
  active?: boolean | 'all';
  origin?: 'managed' | 'custom' | 'all';
  health?: DetectionRule['health'] | 'all';
  severity?: SeverityLevel | 'all';
  technique?: string;
}

export interface SigmaSyncResponse {
  synced: number;
  errors: number;
  message: string;
  staged?: number;
  skipped?: number;
  errorDetails?: { index: number; message: string }[];
}

export interface DetectionRuleSummary {
  total: number;
  enabled: number;
  healthy: number;
  degraded: number;
  alerts24h: number;
  coverageTechniques: number;
  coverageTechniquesTotal: number;
  snapshotAt: string;
}

export type DetectionExecutionStatus = 'succeeded' | 'warning' | 'failed' | 'running';

export interface DetectionExecution {
  id: string;
  ruleId: string | number;
  ruleName: string;
  status: DetectionExecutionStatus;
  runType: 'scheduled' | 'manual' | 'gap-fill';
  startedAt: string | null;
  durationMs: number | null;
  searchDurationMs: number | null;
  alertDurationMs: number | null;
  eventsScanned: number | null;
  matches: number | null;
  alertsCreated: number | null;
  sourceCoverage: number | null;
  gapDurationMinutes: number | null;
  message: string;
}

export interface DetectionSandboxResult {
  matched: boolean;
  matchedFields: string[];
  explanation: string;
  durationMs: number;
  evaluatedFields: number;
  warnings: string[];
}

export interface DetectionSampleEvent {
  id: string;
  label: string;
  dataType: string;
  json: string;
}

export type RuleDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface RuleAuthoringDiagnostic {
  id: string;
  code: string;
  severity: RuleDiagnosticSeverity;
  message: string;
  path: string;
  line?: number;
  column?: number;
  source: 'client' | 'server';
}

export interface RuleValidationResult {
  available: boolean;
  authoritative: boolean;
  valid: boolean;
  diagnostics: RuleAuthoringDiagnostic[];
  fieldCoverage: number | null;
  requiredDataSources: string[];
  engineVersion: string | null;
  checkedAt: string;
}

export interface RulePreviewBucket {
  label: string;
  count: number;
}

export interface RulePreviewResult {
  available: boolean;
  executionId: string | null;
  approximate: boolean;
  matchCount: number | null;
  eventsScanned: number | null;
  durationMs: number | null;
  sourceCompleteness: number | null;
  truncated: boolean;
  histogram: RulePreviewBucket[];
  samples: Array<{ id: string; timestamp: string; summary: string; entity: string }>;
  warning: string | null;
}

export interface DetectionRuleVersion {
  id: string | number;
  ruleId: string | number;
  versionNum: number;
  ruleSnapshot: string;
  changedBy: string;
  changedAt: string;
  changeNote: string;
}
