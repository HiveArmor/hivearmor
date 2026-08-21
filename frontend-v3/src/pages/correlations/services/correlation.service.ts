/**
 * Sprint 44 — Correlated Findings API service.
 * Covers COR-001 through COR-005 contracts.
 */

import type {
  AssignmentResponse,
  FindingDetailResponse,
  FindingEvent,
  FindingQueueResponse,
  FindingRelationship,
  FindingSortOption,
  FindingStatus,
  NoteResponse,
  PaginatedResponse,
  PromotionExecuteResponse,
  PromotionPreviewResponse,
  Signal,
  StatusChangeResponse,
} from '../types/correlation.types';

import { apiClient } from '@/lib/apiClient';

// ── COR-001: Queue listing ───────────────────────────────────────────────────

export interface ListFindingsParams {
  view?: 'queue' | 'full';
  sort?: FindingSortOption;
  cursor?: string;
  limit?: number;
  severity?: string;
  status?: string;
  tactics?: string;
  assignee?: string;
  from?: string;
  to?: string;
}

export async function listFindings(
  params: ListFindingsParams = {},
  signal?: AbortSignal
): Promise<FindingQueueResponse> {
  const queryParams: Record<string, string | number | boolean | string[] | undefined> = {
    view: params.view ?? 'queue',
    sort: params.sort,
    cursor: params.cursor,
    limit: params.limit ?? 25,
    severity: params.severity,
    status: params.status,
    tactics: params.tactics,
    assignee: params.assignee,
    from: params.from,
    to: params.to,
  };

  return apiClient.get<FindingQueueResponse>('/ha-correlated-findings', {
    params: queryParams,
    signal,
  });
}

// ── COR-002: Finding detail ──────────────────────────────────────────────────

export async function getFinding(
  id: string,
  signal?: AbortSignal
): Promise<FindingDetailResponse> {
  return apiClient.get<FindingDetailResponse>(
    `/ha-correlated-findings/${encodeURIComponent(id)}`,
    { signal }
  );
}

// ── COR-003: Supporting evidence ─────────────────────────────────────────────

export async function listSignals(
  findingId: string,
  cursor?: string,
  limit = 25,
  signal?: AbortSignal
): Promise<PaginatedResponse<Signal>> {
  return apiClient.get<PaginatedResponse<Signal>>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/signals`,
    { params: { cursor, limit }, signal }
  );
}

export async function listEvents(
  findingId: string,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal
): Promise<PaginatedResponse<FindingEvent>> {
  return apiClient.get<PaginatedResponse<FindingEvent>>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/events`,
    { params: { cursor, limit }, signal }
  );
}

export async function listRelationships(
  findingId: string,
  cursor?: string,
  limit = 50,
  signal?: AbortSignal
): Promise<PaginatedResponse<FindingRelationship>> {
  return apiClient.get<PaginatedResponse<FindingRelationship>>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/relationships`,
    { params: { cursor, limit }, signal }
  );
}

// ── COR-004: Lifecycle mutations ─────────────────────────────────────────────

export async function changeStatus(
  findingId: string,
  status: FindingStatus,
  reason?: string
): Promise<StatusChangeResponse> {
  return apiClient.post<StatusChangeResponse>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/status`,
    { status, reason, idempotencyKey: crypto.randomUUID() }
  );
}

export async function assignFinding(
  findingId: string,
  assignee: string | null
): Promise<AssignmentResponse> {
  return apiClient.post<AssignmentResponse>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/assignment`,
    { assignee, idempotencyKey: crypto.randomUUID() }
  );
}

export async function addNote(
  findingId: string,
  content: string,
  mentions?: string[]
): Promise<NoteResponse> {
  return apiClient.post<NoteResponse>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/notes`,
    { content, mentions, idempotencyKey: crypto.randomUUID() }
  );
}

// ── COR-005: Incident promotion ──────────────────────────────────────────────

export async function previewPromotion(
  findingId: string
): Promise<PromotionPreviewResponse> {
  return apiClient.post<PromotionPreviewResponse>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/incident-promotion/preview`
  );
}

export interface ExecutePromotionParams {
  title?: string;
  description?: string;
  severity?: string;
  assignee?: string;
  previewToken: string;
}

export async function executePromotion(
  findingId: string,
  params: ExecutePromotionParams
): Promise<PromotionExecuteResponse> {
  return apiClient.post<PromotionExecuteResponse>(
    `/ha-correlated-findings/${encodeURIComponent(findingId)}/incident-promotion/execute`,
    params
  );
}
