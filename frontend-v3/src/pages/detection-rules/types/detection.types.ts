/**
 * Detection Rules — Sprint 47 Type Definitions
 * DET-008 through DET-016 contract interfaces
 */

// ── Rule Health ──────────────────────────────────────────────────────────────

export type RuleHealthStatus = 'healthy' | 'degraded' | 'critical' | 'disabled';
export type RuleStatus = 'active' | 'disabled' | 'draft' | 'review' | 'error';
export type RuleScope = 'managed' | 'custom';
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ExecutionStatus = 'completed' | 'failed' | 'timeout' | 'cancelled' | 'queued' | 'running';
export type TriggeredBy = 'schedule' | 'manual' | 'gap_fill';
export type CoverageStatus = 'covered' | 'partial' | 'uncovered';
export type ApprovalStatus = 'approved' | 'rejected' | 'pending';
export type ComplexityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ImportRuleStatus = 'draft' | 'active';

// ── DET-008: Rule Inventory ──────────────────────────────────────────────────

export interface RuleHealth {
  status: RuleHealthStatus;
  lastRun: string | null;
  avgDuration: number;
  errorRate: number;
  alertsGenerated7d: number;
}

export interface RuleLastExecution {
  timestamp: string;
  duration: number;
  alertsGenerated: number;
}

export interface RulePreview {
  id: string;
  name: string;
  description: string;
  scope: RuleScope;
  status: RuleStatus;
  severity: RuleSeverity;
  mitreTactics: string[];
  mitreTechniques: string[];
  lastExecution: RuleLastExecution | null;
  health: RuleHealth;
  schedule: string;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RuleSummary {
  total: number;
  active: number;
  disabled: number;
  erroring: number;
  managed: number;
  custom: number;
  avgHealthScore: number;
}

export interface RuleFacets {
  byScope: Record<string, number>;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byTactic: Record<string, number>;
  byHealth: Record<string, number>;
}

export interface RuleInventoryResponse {
  items: RulePreview[];
  cursor: string | null;
  total: number;
  summary: RuleSummary;
  facets: RuleFacets;
}

export interface RuleInventoryParams {
  scope?: RuleScope;
  status?: RuleStatus;
  severity?: RuleSeverity;
  tactics?: string;
  q?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

// ── DET-009: Execution Monitoring ────────────────────────────────────────────

export interface RuleExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  status: ExecutionStatus;
  alertsGenerated: number;
  eventsScanned: number;
  errors: string[];
  triggeredBy: TriggeredBy;
}

export interface ExecutionListResponse {
  items: RuleExecution[];
  cursor: string | null;
  total: number;
}

export interface ExecutionListParams {
  ruleId?: string;
  status?: ExecutionStatus;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface ManualRunRequest {
  timeRange: { from: string; to: string };
  reason?: string;
}

export interface ManualRunResponse {
  executionId: string;
  status: 'queued';
  estimatedDuration: number;
}

export interface GapFillRequest {
  from: string;
  to: string;
}

export interface GapFillResponse {
  executionId: string;
  status: 'queued';
  gaps: Array<{ from: string; to: string }>;
}

// ── DET-010: Bulk Operations ─────────────────────────────────────────────────

export interface BulkStatusRequest {
  ruleIds: string[];
  targetStatus: RuleStatus;
  reason?: string;
}

export interface BulkStatusResult {
  ruleId: string;
  status: RuleStatus;
  previousStatus: RuleStatus;
  success: boolean;
  error?: string;
}

export interface BulkResult {
  results: BulkStatusResult[];
  summary: { succeeded: number; failed: number };
}

export interface BulkExportRequest {
  ruleIds: string[];
  format: 'yaml' | 'sigma' | 'json';
}

export interface BulkExportResponse {
  exportId: string;
  downloadUrl: string;
  ruleCount: number;
  format: string;
  expiresAt: string;
}

export interface BulkDuplicateRequest {
  ruleIds: string[];
  prefix?: string;
}

export interface BulkDuplicateResult {
  results: Array<{ sourceId: string; newId: string; name: string; success: boolean }>;
  summary: { created: number; failed: number };
}

export interface BulkDeleteRequest {
  ruleIds: string[];
  confirm: true;
}

export interface BulkDeleteResult {
  results: Array<{ ruleId: string; success: boolean; error?: string }>;
  summary: { deleted: number; failed: number; skipped: number };
}

// ── DET-011: Validation and Preview ──────────────────────────────────────────

export interface RuleDefinition {
  name: string;
  expression: string;
  filters?: string;
  schedule?: string;
  severity?: RuleSeverity;
  mitreTactics?: string[];
  mitreTechniques?: string[];
  description?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion: string;
}

export interface ComplexityFactor {
  factor: string;
  score: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  complexity: {
    score: number;
    level: ComplexityLevel;
    factors: ComplexityFactor[];
  };
}

export interface PreviewRequest {
  rule: RuleDefinition;
  timeRange: { from: string; to: string };
  limit?: number;
}

export interface PreviewMatch {
  id: string;
  timestamp: string;
  source: Record<string, unknown>;
}

export interface SampleAlert {
  id: string;
  timestamp: string;
  ruleName: string;
  severity: RuleSeverity;
  summary: string;
}

export interface PreviewResult {
  matches: PreviewMatch[];
  matchCount: number;
  scanDuration: number;
  estimatedAlertRate: number;
  sampleAlerts: SampleAlert[];
}

// ── DET-012: Sigma Import Pipeline ───────────────────────────────────────────

export interface ImportCandidate {
  sigmaId: string;
  title: string;
  severity: RuleSeverity;
  status: string;
  mitreTechniques: string[];
  compatible: boolean;
  issues: string[];
}

export interface ImportError {
  file: string;
  message: string;
}

export interface ImportValidateResponse {
  rules: ImportCandidate[];
  errors: ImportError[];
  warnings: string[];
}

export interface FieldMapping {
  sigmaField: string;
  ecsField: string;
}

export interface ConvertedRule {
  sigmaId: string;
  name: string;
  expression: string;
  severity: RuleSeverity;
  mitreTechniques: string[];
}

export interface ImportPreviewResponse {
  rules: ConvertedRule[];
  mappings: FieldMapping[];
  unmapped: string[];
}

export interface ImportExecuteRequest {
  rules: string[];
  importAsStatus: ImportRuleStatus;
}

export interface ImportExecuteResult {
  imported: Array<{ sigmaId: string; ruleId: string; name: string; status: string }>;
  failed: Array<{ sigmaId: string; error: string }>;
  summary: { total: number; imported: number; failed: number };
}

export interface ManagedUpdateCheck {
  ruleId: string;
  ruleName: string;
  currentVersion: number;
  availableVersion: number;
  changes: string;
}

export interface ManagedUpdatesCheckResponse {
  updates: ManagedUpdateCheck[];
  total: number;
}

export interface ManagedUpdatesApplyResponse {
  applied: Array<{ ruleId: string; newVersion: number }>;
  failed: Array<{ ruleId: string; error: string }>;
}

// ── DET-013: SSE Events ──────────────────────────────────────────────────────

export type DetectionSseEventType =
  | 'rule.execution_completed'
  | 'rule.error'
  | 'rule.health_changed'
  | 'rule.status_changed'
  | 'rule.imported';

export interface DetectionSseEvent {
  id: string;
  type: DetectionSseEventType;
  timestamp: string;
  data: {
    ruleId: string;
    ruleName: string;
    [key: string]: unknown;
  };
}

// ── DET-015: ATT&CK Coverage Matrix ─────────────────────────────────────────

export interface TechniqueCoverage {
  techniqueId: string;
  techniqueName: string;
  ruleCount: number;
  alertCount30d: number;
  status: CoverageStatus;
}

export interface TacticCoverage {
  tacticId: string;
  tacticName: string;
  techniques: TechniqueCoverage[];
  coveragePercent: number;
}

export interface CoverageGap {
  techniqueId: string;
  techniqueName: string;
  tacticId: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
}

export interface CoverageRecommendation {
  techniqueId: string;
  recommendation: string;
  sigmaRuleId: string | null;
  effort: 'low' | 'medium' | 'high';
}

export interface CoverageMatrix {
  matrix: TacticCoverage[];
  overallScore: number;
  gaps: CoverageGap[];
  recommendations: CoverageRecommendation[];
}

// ── DET-016: Rule Authoring Lifecycle ────────────────────────────────────────

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  expression: string;
  filters: string | null;
  schedule: string;
  scope: RuleScope;
  status: RuleStatus;
  severity: RuleSeverity;
  mitreTactics: string[];
  mitreTechniques: string[];
  tags: string[];
  author: string;
  tenantId: number;
  version: number;
  sigmaSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  expression: string;
  filters: string | null;
  changes: string;
  author: string;
  status: string;
  createdAt: string;
}

export interface RuleApproval {
  id: string;
  ruleId: string;
  version: number;
  reviewer: string;
  status: ApprovalStatus;
  comment: string | null;
  tenantId: number;
  createdAt: string;
}

export interface RuleDetailResponse {
  rule: DetectionRule;
  versions: RuleVersion[];
  approvals: RuleApproval[];
}

export interface CreateRuleRequest {
  name: string;
  description?: string;
  expression: string;
  filters?: string;
  schedule?: string;
  severity: RuleSeverity;
  mitreTactics?: string[];
  mitreTechniques?: string[];
  tags?: string[];
}

export interface UpdateRuleRequest {
  name?: string;
  description?: string;
  expression?: string;
  filters?: string;
  schedule?: string;
  severity?: RuleSeverity;
  mitreTactics?: string[];
  mitreTechniques?: string[];
  tags?: string[];
}

export interface SubmitReviewResponse {
  ruleId: string;
  status: 'review';
}

export interface ApproveRejectRequest {
  comment?: string;
}

export interface RevertRequest {
  targetVersion: number;
}
