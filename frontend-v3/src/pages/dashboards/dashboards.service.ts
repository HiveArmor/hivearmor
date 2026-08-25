/**
 * Dashboard API service for HiveArmor frontend-v3
 *
 * SECURITY:
 * - SEC-06 resolved: POST /api/ha-visualizations/run requires
 *   ROLE_ADMIN | ROLE_SOC_MANAGER | ROLE_ANALYST (@PreAuthorize on backend).
 *   UI must not call run when the caller lacks those roles (see canRunVisualization).
 * - GAP-SEC-12: GET /api/ha-dashboards/{id} has no method-level @PreAuthorize
 * - GAP-MT-05: CLOSED (STAGING CANDIDATE) — backend stamps/scopes hive_dashboard.tenant_id
 *   via TenantContext; null context = legacy global list/get. UI does not redesign tenant UX.
 * - GAP-MT-05 depth: dashboard-visualization and dashboard-authority CRUD scoped via parent
 *   dashboard tenant_id (IDOR blocked). Unique name is (tenant_id, name) partial indexes.
 *
 * All calls use relative `/api/*` via apiClient — never absolute backend URLs.
 */

import type { ChartDataResponse, DashboardDTO, VisualizationRunRequest } from './dashboards.types';

import { ApiError, apiClient } from '@/lib/apiClient';

/** Flip remains true while backend @PreAuthorize on /ha-visualizations/run is present. */
export const GAP_SEC_06_RESOLVED = true;

/** Roles allowed to execute visualization queries (matches backend @PreAuthorize). */
export const VISUALIZATION_RUN_ROLES = [
  'ROLE_ADMIN',
  'ROLE_SOC_MANAGER',
  'ROLE_ANALYST',
] as const;

export function canRunVisualization(roles: readonly string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) {
    return false;
  }
  return VISUALIZATION_RUN_ROLES.some((role) => roles.includes(role));
}

/**
 * Fetch a single dashboard by ID
 * GAP-SEC-12: No method-level @PreAuthorize on this endpoint
 */
export async function getDashboard(id: number): Promise<DashboardDTO> {
  try {
    return await apiClient.get<DashboardDTO>(`/ha-dashboards/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error('Dashboard not found');
    }
    throw error instanceof Error ? error : new Error('Failed to load dashboard');
  }
}

/**
 * Run a visualization query and return chart data.
 * Loads the stored definition by id, then POSTs it to `/ha-visualizations/run`
 * (backend expects a full visualization body, not `{ visualizationId }`).
 * Callers must gate with {@link canRunVisualization} / GAP_SEC_06_RESOLVED —
 * unauthorized JWTs receive HTTP 403 from the backend.
 */
export async function runVisualization(
  request: VisualizationRunRequest
): Promise<ChartDataResponse> {
  let definition: Record<string, unknown>;
  try {
    definition = await apiClient.get<Record<string, unknown>>(
      `/ha-visualizations/${request.visualizationId}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error('Visualization not found');
    }
    throw error instanceof Error ? error : new Error('Failed to load visualization');
  }

  const body: Record<string, unknown> = { ...definition };
  // Only forward filters when the caller supplies a FilterType[]-shaped array.
  if (Array.isArray(request.filters)) {
    body.filterType = request.filters;
  }

  try {
    return await apiClient.post<ChartDataResponse>('/ha-visualizations/run', body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new Error(
        'Required permission: Analyst, SOC Manager, or Platform Administrator',
      );
    }
    throw error instanceof Error ? error : new Error('Failed to run visualization');
  }
}

/**
 * Toggle dashboard favourite status (localStorage only)
 */
export function toggleFavourite(dashboardId: number): boolean {
  const key = 'ha_favourite_dashboards';
  const stored = localStorage.getItem(key);
  const favourites: number[] = stored ? JSON.parse(stored) : [];

  const index = favourites.indexOf(dashboardId);
  if (index === -1) {
    favourites.push(dashboardId);
    localStorage.setItem(key, JSON.stringify(favourites));
    return true;
  } else {
    favourites.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(favourites));
    return false;
  }
}

/**
 * Check if a dashboard is favourited (localStorage only)
 */
export function isFavourited(dashboardId: number): boolean {
  const key = 'ha_favourite_dashboards';
  const stored = localStorage.getItem(key);
  const favourites: number[] = stored ? JSON.parse(stored) : [];
  return favourites.includes(dashboardId);
}

/**
 * Fetch all dashboards with optional filters
 * GAP-SEC-12: No method-level @PreAuthorize on this endpoint
 * GAP-MT-05: CLOSED (STAGING) — list is tenant-scoped when TenantContext is set
 */
export async function getDashboards(params?: {
  isSystem?: boolean;
  q?: string;
}): Promise<DashboardDTO[]> {
  return apiClient.get<DashboardDTO[]>('/ha-dashboards', {
    params: {
      isSystem: params?.isSystem,
      q: params?.q,
    },
  });
}

/**
 * Delete a dashboard by ID
 * GAP-SEC-12: No method-level @PreAuthorize — should require ROLE_ADMIN or ROLE_SOC_MANAGER
 */
export async function deleteDashboard(id: number): Promise<void> {
  await apiClient.delete<void>(`/ha-dashboards/${id}`);
}
