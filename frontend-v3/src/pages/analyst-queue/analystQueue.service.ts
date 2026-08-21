/**
 * Analyst Queue Service
 * API calls for alert queue data (GET /api/ha-alerts)
 */

import type { QueueAlert, QueueFilters, QueuePagination } from './analystQueue.types';

import { apiClient } from '@/lib/apiClient';

export interface FetchAlertsParams extends QueueFilters, QueuePagination {}

export interface FetchAlertsResponse {
  items: QueueAlert[];
  total: number;
}

/**
 * Fetch paginated alerts for the analyst queue.
 * Returns items array and total count (from X-Total-Count header or response body).
 */
export async function fetchQueueAlerts(params: FetchAlertsParams): Promise<FetchAlertsResponse> {
  const queryParams: Record<string, string | number | string[] | undefined> = {
    page: params.page,
    size: params.size,
    q: params.q,
    assignedTo: params.assignedTo,
    timeFrom: params.timeFrom,
    timeTo: params.timeTo,
  };

  // Multi-value filters
  if (params.severity && params.severity.length > 0) {
    queryParams.severity = params.severity;
  }
  if (params.status && params.status.length > 0) {
    queryParams.status = params.status;
  }
  if (params.category && params.category.length > 0) {
    queryParams.category = params.category;
  }

  // Backend returns PaginatedResponse<QueueAlert>
  const response = await apiClient.get<FetchAlertsResponse>('/ha-alerts', { params: queryParams });

  return response;
}

/**
 * Fetch open alert count for the page header badge.
 * Backend returns a bare Long (e.g. 125), not { count: number }.
 */
export async function fetchOpenAlertCount(): Promise<number> {
  const response = await apiClient.get<number | { count: number }>('/ha-alerts/count-open-alerts');
  if (typeof response === 'number') return response;
  if (typeof response === 'object' && response !== null && 'count' in response) return response.count;
  return 0;
}
