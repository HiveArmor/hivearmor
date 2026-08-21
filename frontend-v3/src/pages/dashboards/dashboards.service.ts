/**
 * Dashboard API service for HiveArmor frontend-v3
 *
 * SECURITY GAPS:
 * - GAP-SEC-06: POST /api/ha-visualizations/run has no @PreAuthorize
 * - GAP-SEC-12: GET /api/ha-dashboards/{id} has no @PreAuthorize
 * - GAP-MT-05: No tenant_id on UtmDashboard — all users see all dashboards
 */

import type { ChartDataResponse, DashboardDTO, VisualizationRunRequest } from './dashboards.types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8088';

async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('hivearmor_auth_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('hivearmor_auth_token');
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
    throw new Error('Session expired');
  }

  return response;
}

/**
 * Fetch a single dashboard by ID
 * GAP-SEC-12: No @PreAuthorize on this endpoint
 */
export async function getDashboard(id: number): Promise<DashboardDTO> {
  const response = await fetchWithAuth(`${BACKEND_URL}/api/ha-dashboards/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Dashboard not found');
    }
    throw new Error(`Failed to load dashboard: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Run a visualization query and return chart data
 * GAP-SEC-06: No @PreAuthorize on this endpoint — any valid JWT can execute queries
 */
export async function runVisualization(
  request: VisualizationRunRequest
): Promise<ChartDataResponse> {
  const response = await fetchWithAuth(`${BACKEND_URL}/api/ha-visualizations/run`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to run visualization: ${response.statusText}`);
  }

  return response.json();
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
 * GAP-SEC-12: No @PreAuthorize on this endpoint
 * GAP-MT-05: No tenant_id on UtmDashboard — all users see all dashboards
 */
export async function getDashboards(params?: {
  isSystem?: boolean;
  q?: string;
}): Promise<DashboardDTO[]> {
  const searchParams = new URLSearchParams();
  if (params?.isSystem !== undefined) {
    searchParams.set('isSystem', String(params.isSystem));
  }
  if (params?.q) {
    searchParams.set('q', params.q);
  }

  const url = `${BACKEND_URL}/api/ha-dashboards${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetchWithAuth(url);

  if (!response.ok) {
    throw new Error(`Failed to load dashboards: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a dashboard by ID
 * GAP-SEC-12: No @PreAuthorize — should require ROLE_ADMIN or ROLE_SOC_MANAGER
 */
export async function deleteDashboard(id: number): Promise<void> {
  const response = await fetchWithAuth(`${BACKEND_URL}/api/ha-dashboards/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete dashboard: ${response.statusText}`);
  }
}
