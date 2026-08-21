/**
 * Offenses Service (Correlated Findings)
 * UI label: "Correlated Findings"
 * Backend path: /api/offenses
 *
 * Note: The word "Offense" must not appear in any UI label per PD-10.
 */

import type { SeverityLevel } from '@/constants/severity.constants';
import type { AlertStatus } from '@/constants/status.constants';
import { apiClient, type PaginatedResponse } from '@/lib/apiClient';
import type { MitreTechniqueRef, TenantRef } from '@/types/api.types';

export interface OffenseDTO {
  id: string;
  name: string;
  description?: string;
  severity: SeverityLevel;
  status: AlertStatus;
  alertCount: number;
  firstEventTimestamp: string;
  lastEventTimestamp: string;
  tenant?: TenantRef;
  mitreTechniques?: MitreTechniqueRef[];
  sourceIps?: string[];
  targetIps?: string[];
  users?: string[];
}

export interface OffenseDetailDTO extends OffenseDTO {
  alerts: OffenseAlertRef[];
}

export interface OffenseAlertRef {
  id: string;
  title: string;
  severity: SeverityLevel;
  timestamp: string;
  sourceIp?: string;
  destinationIp?: string;
}

export interface OffenseListParams {
  page?: number;
  size?: number;
  status?: string;
  severity?: string;
}

export interface UpdateOffenseStatusRequest {
  status: AlertStatus;
}

export async function getOffenses(params: OffenseListParams): Promise<PaginatedResponse<OffenseDTO>> {
  // Use fetch directly to access X-Total-Count header
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();
  if (params.page !== undefined) queryParams.set('page', String(params.page));
  if (params.size !== undefined) queryParams.set('size', String(params.size));
  if (params.status) queryParams.set('status', params.status);
  if (params.severity) queryParams.set('severity', params.severity);

  const url = `/api/offenses?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = await response.json();
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

export async function getOffense(id: string): Promise<OffenseDetailDTO> {
  return apiClient.get<OffenseDetailDTO>(`/offenses/${id}`);
}

export async function updateOffenseStatus(id: string, req: UpdateOffenseStatusRequest): Promise<void> {
  return apiClient.put<void>(`/offenses/${id}/status`, req);
}

export async function getOffenseAlerts(id: string): Promise<OffenseAlertRef[]> {
  return apiClient.get<OffenseAlertRef[]>(`/offenses/${id}/alerts`);
}
