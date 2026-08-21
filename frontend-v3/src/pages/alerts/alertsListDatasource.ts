/**
 * Abortable infinite-row datasource for the Alert Triage Queue.
 *
 * Supports two backend response shapes:
 * 1. Cursor-based envelope (ALT-014): { items, nextCursor, hasMore, snapshotAt, totalApproximate }
 * 2. Legacy page/size fallback: raw array or { alerts, total } (backward-compatible during transition)
 *
 * When the backend returns `nextCursor`, subsequent page fetches use the cursor
 * parameter instead of page/size. If no cursor is returned, falls back to page/size.
 * Handles CURSOR_EXPIRED (400) by resetting pagination to the beginning.
 */

import type { IDatasource, IGetRowsParams, SortModelItem } from 'ag-grid-community';

import type {
  AlertQueueFilters,
  AlertQueueLoadState,
  AlertQueueRecord,
} from './alertTriage.types';

import { useAuthStore } from '@/store/auth.store';

export type AlertsListFilters = AlertQueueFilters;

/** Cursor-based envelope returned by upgraded ALT-014 backend. */
interface CursorEnvelope {
  items: AlertQueueRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  snapshotAt: string;
  totalApproximate: number;
}

/** Legacy envelope shape (pre-cursor backend). */
interface LegacyEnvelope {
  items?: AlertQueueRecord[];
  alerts?: AlertQueueRecord[];
  total?: number;
  totalApproximate?: number;
}

/** Unified result after normalizing either backend shape. */
interface NormalizedPayload {
  rows: AlertQueueRecord[];
  total: number | null;
  nextCursor: string | null;
  hasMore: boolean | null;
}

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const SORT_FIELD_ALLOWLIST: Record<string, string> = {
  '@timestamp': '@timestamp',
  timestamp: '@timestamp',
  detectedAt: '@timestamp',
  severity: 'severity',
  riskScore: 'riskScore',
  status: 'status',
  slaDeadline: 'slaDeadline',
  name: 'name',
  assigneeName: 'assigneeName',
};

/** Error code returned by the backend when a cursor token has expired or is invalid. */
const CURSOR_EXPIRED_CODE = 'CURSOR_EXPIRED';

function isCursorEnvelope(payload: unknown): payload is CursorEnvelope {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  return 'hasMore' in obj && Array.isArray(obj.items);
}

function normalizePayload(payload: unknown): NormalizedPayload {
  if (Array.isArray(payload)) {
    return { rows: payload as AlertQueueRecord[], total: null, nextCursor: null, hasMore: null };
  }
  if (!payload || typeof payload !== 'object') {
    return { rows: [], total: null, nextCursor: null, hasMore: null };
  }

  // Cursor-based envelope (ALT-014)
  if (isCursorEnvelope(payload)) {
    return {
      rows: payload.items,
      total: payload.totalApproximate,
      nextCursor: payload.nextCursor,
      hasMore: payload.hasMore,
    };
  }

  // Legacy envelope fallback
  const envelope = payload as LegacyEnvelope;
  const rows = envelope.items ?? envelope.alerts ?? [];
  const total = envelope.total ?? envelope.totalApproximate ?? null;
  return { rows, total, nextCursor: null, hasMore: null };
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function readSortValue(record: AlertQueueRecord, field: string): unknown {
  if (field === '@timestamp') return new Date(record['@timestamp']).getTime();
  return record[field as keyof AlertQueueRecord];
}

export function sortAlertRows(rows: AlertQueueRecord[], sortModel: SortModelItem[]): AlertQueueRecord[] {
  const sort = sortModel[0];
  const field = (sort && SORT_FIELD_ALLOWLIST[sort.colId]) || '@timestamp';
  const direction = sort?.sort === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = compareValues(readSortValue(left, field), readSortValue(right, field)) * direction;
    return primary || left.id.localeCompare(right.id);
  });
}

/**
 * Build search params for a cursor-based request.
 * When a cursor is available, sends `cursor` + `limit` instead of `page` + `size`.
 * Falls back to page/size when no cursor is provided (first page or legacy backend).
 */
function buildSearchParams(
  filters: AlertsListFilters,
  startRow: number,
  endRow: number,
  sortModel: SortModelItem[],
  cursor?: string | null
): URLSearchParams {
  const blockSize = Math.max(1, endRow - startRow);
  const requestedSort = sortModel[0];
  const sortField = (requestedSort && SORT_FIELD_ALLOWLIST[requestedSort.colId]) || '@timestamp';
  const sortDirection = requestedSort?.sort === 'asc' ? '+' : '-';

  const searchParams = new URLSearchParams();

  if (cursor) {
    // Cursor-based pagination: use cursor + limit
    searchParams.set('cursor', cursor);
    searchParams.set('limit', String(Math.min(blockSize, 200)));
  } else {
    // First page or fallback: send page/size for backward compatibility
    const page = Math.floor(startRow / blockSize);
    searchParams.set('page', String(page));
    searchParams.set('size', String(Math.min(blockSize, 100)));
  }

  // Sort: use canonical `-field` / `+field` format for cursor API,
  // also include `order` for legacy compatibility
  searchParams.set('sort', `${sortDirection}${sortField},id`);
  searchParams.set('order', requestedSort?.sort === 'asc' ? 'asc' : 'desc');

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    searchParams.set(key === 'queryExpression' ? 'q' : key, value);
  });
  return searchParams;
}

/**
 * Detect if a fetch response represents the CURSOR_EXPIRED error.
 */
async function isCursorExpiredError(response: Response): Promise<boolean> {
  if (response.status !== 400) return false;
  try {
    const body = await response.clone().json() as Record<string, unknown>;
    return body.errorCode === CURSOR_EXPIRED_CODE || body.code === CURSOR_EXPIRED_CODE;
  } catch {
    return false;
  }
}

export function createAlertsListDatasource(
  filters: AlertsListFilters,
  onTotalCount: (count: number) => void,
  onLoadState?: (state: AlertQueueLoadState) => void
): IDatasource {
  const activeControllers = new Set<AbortController>();

  // Track the cursor for subsequent page fetches.
  // Reset when filters change (new datasource instance is created).
  let currentCursor: string | null = null;
  let cursorResetInProgress = false;

  return {
    getRows(params: IGetRowsParams): void {
      const controller = new AbortController();
      activeControllers.add(controller);
      onLoadState?.({ state: 'loading' });

      void (async () => {
        try {
          let rows: AlertQueueRecord[];
          let total: number;

          if (fixtureMode) {
            const { filterFoundationAlertQueue } = await import('@/pages/alerts/alertTriage.fixtures');
            const filtered = sortAlertRows(filterFoundationAlertQueue(filters), params.sortModel ?? []);
            total = filtered.length;
            rows = filtered.slice(params.startRow, params.endRow);
          } else {
            const token = localStorage.getItem('hivearmor_auth_token');
            const selectedTenantId = useAuthStore.getState().selectedTenantId;
            const headers: Record<string, string> = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            if (selectedTenantId !== null) headers['X-Tenant-ID'] = String(selectedTenantId);

            // For the first page (startRow === 0), always start fresh without cursor
            const cursorForRequest = params.startRow === 0 ? null : currentCursor;

            const searchParams = buildSearchParams(
              filters,
              params.startRow,
              params.endRow,
              params.sortModel ?? [],
              cursorForRequest
            );

            const response = await fetch(`/api/ha-alerts?${searchParams.toString()}`, {
              headers,
              signal: controller.signal,
            });

            // Handle CURSOR_EXPIRED: reset cursor and refetch from beginning
            if (!response.ok && await isCursorExpiredError(response)) {
              if (!cursorResetInProgress) {
                cursorResetInProgress = true;
                currentCursor = null;

                // Refetch from the beginning with no cursor
                const resetParams = buildSearchParams(
                  filters,
                  0,
                  params.endRow - params.startRow,
                  params.sortModel ?? [],
                  null
                );
                const resetResponse = await fetch(`/api/ha-alerts?${resetParams.toString()}`, {
                  headers,
                  signal: controller.signal,
                });

                cursorResetInProgress = false;

                if (!resetResponse.ok) {
                  throw new Error(`Alert queue request failed with HTTP ${resetResponse.status}`);
                }

                const resetPayload = normalizePayload(await resetResponse.json());
                rows = resetPayload.rows;
                currentCursor = resetPayload.nextCursor;

                const resetRawHeaderTotal = resetResponse.headers.get('X-Total-Count');
                const resetHeaderTotal = resetRawHeaderTotal !== null ? Number(resetRawHeaderTotal) : NaN;
                total = Number.isFinite(resetHeaderTotal) && resetHeaderTotal >= 0
                  ? resetHeaderTotal
                  : resetPayload.total ?? rows.length;
              } else {
                throw new Error('Alert queue cursor expired during reset.');
              }
            } else if (!response.ok) {
              throw new Error(`Alert queue request failed with HTTP ${response.status}`);
            } else {
              const payload = normalizePayload(await response.json());
              rows = payload.rows;

              // Store cursor for subsequent page fetches
              if (payload.nextCursor !== null) {
                currentCursor = payload.nextCursor;
              }

              const rawHeaderTotal = response.headers.get('X-Total-Count');
              const headerTotal = rawHeaderTotal !== null ? Number(rawHeaderTotal) : NaN;
              total = Number.isFinite(headerTotal) && headerTotal >= 0
                ? headerTotal
                : payload.total ?? params.startRow + rows.length;

              // If the cursor envelope explicitly tells us there are no more pages,
              // use that signal for determining the end of data
              if (payload.hasMore === false && total <= params.startRow + rows.length) {
                total = params.startRow + rows.length;
              }
            }
          }

          if (controller.signal.aborted) return;
          onTotalCount(total);
          const reachedEnd = total <= params.endRow;
          params.successCallback(rows, reachedEnd ? total : -1);
          onLoadState?.({ state: 'ready', loadedAt: new Date().toISOString() });
        } catch (error) {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : 'Unable to load the alert queue.';
          onLoadState?.({ state: 'error', message });
          params.failCallback();
        } finally {
          activeControllers.delete(controller);
        }
      })();
    },
    destroy(): void {
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
    },
  };
}

export { buildSearchParams, normalizePayload };
