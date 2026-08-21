/**
 * Dashboards Service
 * Dashboard gallery, view, and studio API calls.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  DashboardDTO,
  DashboardListItemDTO,
  ImportDashboardRequest,
  SidebarOrderRequest,
} from '@/types/api.types';

export async function getDashboards(): Promise<DashboardListItemDTO[]> {
  return apiClient.get<DashboardListItemDTO[]>('/ha-dashboards');
}

export async function getDashboard(id: number | string): Promise<DashboardDTO> {
  return apiClient.get<DashboardDTO>(`/ha-dashboards/${id}`);
}

export async function createDashboard(
  spec: Omit<DashboardDTO, 'id' | 'createdAt' | 'updatedAt'>
): Promise<DashboardDTO> {
  return apiClient.post<DashboardDTO>('/ha-dashboards', spec);
}

export async function updateDashboard(spec: DashboardDTO): Promise<DashboardDTO> {
  return apiClient.put<DashboardDTO>('/ha-dashboards', spec);
}

export async function deleteDashboard(id: number): Promise<void> {
  return apiClient.delete<void>(`/ha-dashboards/${id}`);
}

export async function updateSidebarOrder(req: SidebarOrderRequest): Promise<void> {
  return apiClient.put<void>('/ha-dashboards/sidebar-order', req);
}

export async function importDashboard(req: ImportDashboardRequest): Promise<DashboardDTO> {
  return apiClient.post<DashboardDTO>('/ha-dashboards/import', req);
}
