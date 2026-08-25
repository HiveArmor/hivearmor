/**
 * EDR Service
 * API calls for HiveArmor Endpoint Detection and Response features.
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 *
 * This module is the base service layer for Sprint 16 EDR investigation UX.
 * It will be extended in T02–T05 with timeline, quarantine, FIM, and policy calls.
 */

import type {
  ProcessNodeDTO,
  ProcessTreeQueryParams,
  EdrTimelineQuery,
  EdrTimelinePage,
  QuarantinedFileDTO,
  QuarantineListQuery,
  QuarantinePage,
  IsolationListQuery,
  IsolationPage,
  FimSummaryDTO,
  FimSummaryQuery,
} from '../types/edr';

import { apiClient } from '@/lib/apiClient';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

// ---------------------------------------------------------------------------
// Process tree
// ---------------------------------------------------------------------------

/**
 * Fetches a flat list of process nodes from the backend for the given agent
 * and time window.
 *
 * Issues an authenticated GET to /api/ha-edr/process-tree with `agentId`,
 * `timestamp`, and `windowMinutes` as query parameters.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function fetchProcessTree(
  params: ProcessTreeQueryParams,
): Promise<ProcessNodeDTO[]> {
  const search = new URLSearchParams({
    agentId: params.agentId,
    timestamp: params.timestamp,
    windowMinutes: String(params.windowMinutes ?? 30),
  });
  return apiClient.get<ProcessNodeDTO[]>(`/ha-edr/process-tree?${search.toString()}`);
}

/**
 * Assembles a nested forest from a flat list of ProcessNodeDTOs.
 *
 * A node n is treated as a root when any of the following holds:
 *   - n.ppid === 0
 *   - n.ppid === n.pid          (self-referential)
 *   - no node m in the list has m.pid === n.ppid (unresolved parent)
 *
 * Every input node appears exactly once in the returned forest.
 * The function does not mutate the input list.
 */
export function buildProcessTree(nodes: ProcessNodeDTO[]): ProcessNodeDTO[] {
  const byPid = new Map<number, ProcessNodeDTO>();
  for (const n of nodes) byPid.set(n.pid, { ...n, children: [] });
  const roots: ProcessNodeDTO[] = [];
  for (const n of nodes) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const own = byPid.get(n.pid)!;
    const isRoot = n.ppid === 0 || n.ppid === n.pid || !byPid.has(n.ppid);
    if (isRoot) {
      roots.push(own);
    } else {
      const parent = byPid.get(n.ppid);
      if (parent?.children) {
        parent.children.push(own);
      }
    }
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Timeline (T02)
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of EDR events for the given agent and time window.
 *
 * Issues an authenticated GET to /api/ha-edr/timeline with agentId, from, to,
 * page, size, and an optional comma-separated types filter.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function fetchEdrTimeline(q: EdrTimelineQuery): Promise<EdrTimelinePage> {
  const search = new URLSearchParams({
    agentId: q.agentId,
    from: q.from,
    to: q.to,
    page: String(q.page),
    size: String(q.size),
  });
  if (q.types && q.types.length > 0) {
    search.set('types', q.types.join(','));
  }
  return apiClient.get<EdrTimelinePage>(`/ha-edr/timeline?${search.toString()}`);
}

// ---------------------------------------------------------------------------
// Quarantine (T03)
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of quarantined files from the backend.
 *
 * Issues an authenticated GET to /api/ha-edr/quarantine with optional
 * `agentId`, `status`, and required `page`/`size` query parameters.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function fetchQuarantinedFiles(
  query: QuarantineListQuery,
  signal?: AbortSignal,
): Promise<QuarantinePage> {
  if (fixtureMode) {
    const { getFoundationQuarantinePage } = await import('@/pages/edr/fileQuarantine.fixtures');
    return getFoundationQuarantinePage(query);
  }
  const params: Record<string, string | number | boolean | undefined> = {
    page: query.page,
    size: query.size,
  };
  if (query.agentId !== undefined) params.agentId = query.agentId;
  if (query.status !== undefined) params.status = query.status;
  return apiClient.get<QuarantinePage>('/ha-edr/quarantine', { params, signal });
}

/**
 * Applies a restore or delete action to a single quarantined file.
 *
 * Issues an authenticated PATCH to /api/ha-edr/quarantine/{id} with the
 * action payload and returns the updated `QuarantinedFileDTO`.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function updateQuarantineStatus(
  id: number,
  action: 'restore' | 'delete',
): Promise<QuarantinedFileDTO> {
  if (fixtureMode) {
    const { foundationQuarantinedFiles } = await import('@/pages/edr/fileQuarantine.fixtures');
    const record = foundationQuarantinedFiles.find((item) => item.id === id);
    if (!record) throw new Error('Quarantine record not found');
    return { ...record, status: action === 'restore' ? 'restored' : 'deleted', actionState: 'complete' };
  }
  return apiClient.patch<QuarantinedFileDTO>(`/ha-edr/quarantine/${id}`, { action });
}

/**
 * Applies a restore or delete action to multiple quarantined files in one call.
 *
 * Issues an authenticated POST to /api/ha-edr/quarantine/bulk with the ids
 * and action payload and returns the list of updated `QuarantinedFileDTO`s.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function bulkUpdateQuarantine(
  ids: number[],
  action: 'restore' | 'delete',
): Promise<QuarantinedFileDTO[]> {
  if (fixtureMode) {
    const { foundationQuarantinedFiles } = await import('@/pages/edr/fileQuarantine.fixtures');
    return foundationQuarantinedFiles
      .filter((item) => ids.includes(item.id))
      .map((item) => ({ ...item, status: action === 'restore' ? 'restored' : 'deleted', actionState: 'complete' }));
  }
  return apiClient.post<QuarantinedFileDTO[]>('/ha-edr/quarantine/bulk', { ids, action });
}

// ---------------------------------------------------------------------------
// Host isolation inventory (RESP-021 STAGING CANDIDATE)
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated host-isolation inventory from the secured canonical
 * endpoint. Issues GET /api/ha-edr/isolation — never legacy /api/edr/isolation.
 */
export async function fetchIsolatedHosts(
  query: IsolationListQuery,
  signal?: AbortSignal,
): Promise<IsolationPage> {
  if (fixtureMode) {
    const { getFoundationIsolationPage } = await import('@/pages/edr/fileQuarantine.fixtures');
    return getFoundationIsolationPage(query);
  }
  const params: Record<string, string | number | boolean | undefined> = {
    page: query.page,
    size: query.size,
  };
  if (query.status !== undefined) params.status = query.status;
  return apiClient.get<IsolationPage>('/ha-edr/isolation', { params, signal });
}

// ---------------------------------------------------------------------------
// File Integrity Monitoring — FIM (T04)
// ---------------------------------------------------------------------------

/**
 * Fetches the FIM summary for the given time window from the backend.
 *
 * Issues an authenticated GET to /api/ha-edr/fim/summary with `from`, `to`,
 * and optional comma-joined `agentIds` and `changeTypes` as query parameters.
 * Never uses an absolute backend URL — routes through the shared apiClient
 * and the Vite /api/* proxy.
 */
export async function fetchFimSummary(query: FimSummaryQuery): Promise<FimSummaryDTO> {
  const search = new URLSearchParams({
    from: query.from,
    to: query.to,
  });
  if (query.agentIds && query.agentIds.length > 0) {
    search.set('agentIds', query.agentIds.join(','));
  }
  if (query.changeTypes && query.changeTypes.length > 0) {
    search.set('changeTypes', query.changeTypes.join(','));
  }
  return apiClient.get<FimSummaryDTO>(`/ha-edr/fim/summary?${search.toString()}`);
}
