import type {
  ActionCatalogEntry,
  ActionCatalogSummary,
  ApprovalRecord,
  CursorPageResult,
  PlaybookDTO,
  PlaybookListItem,
  PlaybookListParams,
  PlaybookMetricsSummary,
  PlaybookPreviewResponse,
  QuarantineRecord,
  ResponseActivityDTO,
  ResponseActivityListParams,
  ResponseActivityPageResult,
  ResponseExecutionTraceResult,
  ResponseApprovalDecisionRequest,
  ResponseApprovalListParams,
  ResponseApprovalRequest,
  ResponseAuthorityDelegate,
  ResponseAuthorityDelegateSaveRequest,
  ResponseAuthorityPolicy,
  ResponseAuthorityPolicySaveRequest,
  ResponseGovernanceResult,
} from './response.types';

/** Production-safe replacement. Foundation response records are never bundled. */
export const foundationPlaybookListItems: PlaybookListItem[] = [];
export const foundationPlaybooks: PlaybookDTO[] = [];
export const foundationResponseActivity: ResponseActivityDTO[] = [];
export const foundationApprovalQueue: ApprovalRecord[] = [];
export const foundationQuarantineRecords: QuarantineRecord[] = [];
export const foundationActionCatalog: ActionCatalogEntry[] = [];
export const foundationActionCatalogSummary: ActionCatalogSummary = { categories: [], totalActions: 0, lastUpdatedAt: '' };
export const foundationPlaybookMetrics: PlaybookMetricsSummary = { total: 0, active: 0, executionsLast24h: 0, successRate24h: 0, pendingApprovals: 0, activeQuarantines: 0, snapshotAt: '' };
export const foundationResponsePolicies: ResponseAuthorityPolicy[] = [];
export const foundationResponseDelegates: ResponseAuthorityDelegate[] = [];
export function foundationPreviewPlaybookExecution(playbookId: string): PlaybookPreviewResponse {
  return { previewToken: '', playbookId, estimatedDurationSeconds: 0, stepCount: 0, blastRadius: { affectedTargets: [], riskLevel: 'LOW', reversible: false, rollbackGuidance: null, requiredPermission: '', mitreReference: null }, approvalRequired: false, validationResult: { valid: false, errors: [], warnings: [] }, stepSummaries: [] };
}

export function filterFoundationPlaybooks(_params: PlaybookListParams & { search?: string; category?: string; cursor?: string }): CursorPageResult<PlaybookListItem> {
  return { items: [], nextCursor: null, total: 0, hasMore: false };
}

export function filterFoundationResponseActivity(_params: ResponseActivityListParams & { search?: string }): ResponseActivityPageResult {
  const snapshotAt = new Date(0).toISOString();
  return { items: [], nextCursor: null, previousCursor: null, total: 0, hasMore: false, snapshotAt, stale: false, summary: { total: 0, running: 0, awaitingApproval: 0, failed: 0, partial: 0, successRate: 0, medianDurationMs: 0, degradedConnectors: 0, snapshotAt, totalIsExact: true, partialFailures: [] } };
}

export function getFoundationResponseExecutionTrace(_executionId: string): ResponseExecutionTraceResult {
  return { items: [], nextCursor: null, total: 0, hasMore: false, snapshotAt: new Date(0).toISOString(), stale: false, partialFailures: [] };
}

export function getFoundationResponseGovernance(_params: ResponseApprovalListParams): ResponseGovernanceResult {
  const snapshotAt = new Date(0).toISOString();
  return { approvals: [], policies: [], delegates: [], snapshotAt, stale: false, partialFailures: [], summary: { pending: 0, dueSoon: 0, critical: 0, restrictedWindow: 0, approved24h: 0, rejected24h: 0, medianDecisionMs: 0, connectorWarnings: 0, snapshotAt } };
}

export function decideFoundationResponseApproval(_request: ResponseApprovalDecisionRequest): ResponseApprovalRequest {
  throw new Error('Foundation response approvals are disabled in production.');
}

export function saveFoundationResponseAuthorityPolicy(_request: ResponseAuthorityPolicySaveRequest): ResponseAuthorityPolicy {
  throw new Error('Foundation response governance is disabled in production.');
}

export function saveFoundationResponseAuthorityDelegate(_request: ResponseAuthorityDelegateSaveRequest): ResponseAuthorityDelegate {
  throw new Error('Foundation response governance is disabled in production.');
}
