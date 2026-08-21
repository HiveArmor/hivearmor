/**
 * Response Playbooks Service
 * API calls for SOAR playbook management and response authority/activity.
 */

import type {
  ActionDefinitionDTO,
  AuthorityDTO,
  PlaybookDTO,
  PlaybookListParams,
  ResponseActivityDTO,
  ResponseActivityListParams,
} from './response.types';

import type { PaginatedResponse } from '@/lib/apiClient';
import { apiClient } from '@/lib/apiClient';

/**
 * Get paginated list of playbooks
 * DEF-04 §3
 * GAP-SEC-08: SoarResource endpoints lack @PreAuthorize. Calling via Vite proxy
 * ensures a valid JWT is attached. Playbook execution blocked until backend fix.
 */
export async function getPlaybooks(params: PlaybookListParams): Promise<PaginatedResponse<PlaybookDTO>> {
  // Use fetch directly to access X-Total-Count header
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();

  if (params.page !== undefined) queryParams.set('page', String(params.page));
  if (params.size !== undefined) queryParams.set('size', String(params.size));
  if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
  if (params.triggerType && params.triggerType !== 'ALL') queryParams.set('triggerType', params.triggerType);

  const url = `/api/soar/playbooks?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = (await response.json()) as PlaybookDTO[];
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

/**
 * Get single playbook by ID
 * DEF-05 §3
 * GAP-SEC-08: SoarResource endpoints lack @PreAuthorize.
 * Calling via Vite proxy ensures JWT is attached. Execution blocked until backend fix.
 */
export async function getPlaybook(id: string): Promise<PlaybookDTO> {
  return apiClient.get<PlaybookDTO>(`/soar/playbooks/${id}`);
}

/**
 * Create new playbook
 * DEF-04 §3, DEF-05 §3
 * GAP-SEC-08: SoarResource endpoints lack @PreAuthorize.
 * Calling via Vite proxy ensures JWT is attached. Execution blocked until backend fix.
 */
export async function createPlaybook(playbook: PlaybookDTO): Promise<PlaybookDTO> {
  return apiClient.post<PlaybookDTO>('/soar/playbooks', playbook);
}

/**
 * Update existing playbook
 * DEF-05 §3
 * GAP-SEC-08: SoarResource endpoints lack @PreAuthorize.
 * Calling via Vite proxy ensures JWT is attached. Execution blocked until backend fix.
 */
export async function updatePlaybook(id: string, playbook: PlaybookDTO): Promise<PlaybookDTO> {
  return apiClient.put<PlaybookDTO>(`/soar/playbooks/${id}`, playbook);
}

/**
 * Delete playbook
 * DEF-04 §3
 * GAP-SEC-08: SoarResource endpoints lack @PreAuthorize.
 * Calling via Vite proxy ensures JWT is attached. Execution blocked until backend fix.
 */
export async function deletePlaybook(id: string): Promise<void> {
  return apiClient.delete<void>(`/soar/playbooks/${id}`);
}

/**
 * Get available action definitions (catalogue)
 * FIX-08: /api/soar/actions does not exist in the backend.
 * Action palette uses the static SOAR_ACTION_CATALOGUE constant instead.
 * This function is intentionally a no-op — use the static catalogue from ActionPalette.tsx.
 * TODO: WIRING-GAP — no action catalogue API endpoint exists; catalogue is static in-memory only.
 */
export async function getActionDefinitions(): Promise<ActionDefinitionDTO[]> {
  console.warn('[WIRING-GAP] getActionDefinitions: no backend catalogue endpoint — returning empty array. Use static SOAR_ACTION_CATALOGUE.');
  return [];
}

// ===== Response Authority (DEF-06) =====

/**
 * Get all application authorities (roles)
 * DEF-06 §3
 * GAP-SEC-01 CRITICAL: AuthorityResource has no @PreAuthorize.
 * This endpoint is completely unprotected at the backend level.
 * This screen MUST NOT be deployed to production until the backend is fixed.
 * Frontend route guard (ROLE_ADMIN) is a UX convenience only, not a security gate.
 */
export async function getAuthorities(): Promise<AuthorityDTO[]> {
  return apiClient.get<AuthorityDTO[]>('/authority');
}

/**
 * Create new authority
 * DEF-06 §3
 * GAP-SEC-01 CRITICAL: AuthorityResource has no @PreAuthorize.
 * This endpoint is completely unprotected at the backend level.
 * This screen MUST NOT be deployed to production until the backend is fixed.
 * Frontend route guard (ROLE_ADMIN) is a UX convenience only, not a security gate.
 */
export async function createAuthority(authority: AuthorityDTO): Promise<AuthorityDTO> {
  return apiClient.post<AuthorityDTO>('/authority', authority);
}

/**
 * Update existing authority
 * DEF-06 §3
 * GAP-SEC-01 CRITICAL: AuthorityResource has no @PreAuthorize.
 * This endpoint is completely unprotected at the backend level.
 * This screen MUST NOT be deployed to production until the backend is fixed.
 * Frontend route guard (ROLE_ADMIN) is a UX convenience only, not a security gate.
 */
export async function updateAuthority(id: string, authority: AuthorityDTO): Promise<AuthorityDTO> {
  return apiClient.put<AuthorityDTO>(`/authority/${id}`, authority);
}

/**
 * Delete authority
 * DEF-06 §3
 * GAP-SEC-01 CRITICAL: AuthorityResource has no @PreAuthorize.
 * This endpoint is completely unprotected at the backend level.
 * This screen MUST NOT be deployed to production until the backend is fixed.
 * Frontend route guard (ROLE_ADMIN) is a UX convenience only, not a security gate.
 */
export async function deleteAuthority(id: string): Promise<void> {
  return apiClient.delete<void>(`/authority/${id}`);
}

// ===== Response Activity (DEF-07) =====

/**
 * Get paginated response activity log
 * DEF-07 §3
 */
export async function getResponseActivity(
  params: ResponseActivityListParams
): Promise<PaginatedResponse<ResponseActivityDTO>> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();

  if (params.page !== undefined) queryParams.set('page', String(params.page));
  if (params.size !== undefined) queryParams.set('size', String(params.size));
  if (params.timeFrom) queryParams.set('timeFrom', params.timeFrom);
  if (params.timeTo) queryParams.set('timeTo', params.timeTo);
  if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
  if (params.triggeredBy) queryParams.set('triggeredBy', params.triggeredBy);
  if (params.actionType) queryParams.set('actionType', params.actionType);

  // FIX-09: /api/ha-response-activity → /api/soar/audit
  const url = `/api/soar/audit?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = (await response.json()) as ResponseActivityDTO[];
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

/**
 * Export response activity log
 * FIX-09: /api/ha-response-activity/export does not exist in the backend.
 * TODO: WIRING-GAP — no export endpoint for SOAR audit. Export button is disabled in the UI.
 */
export async function exportResponseActivity(
  _params: ResponseActivityListParams
): Promise<Blob> {
  // No export endpoint exists for the SOAR audit log.
  // Return an empty blob so callers don't throw; button is disabled for admins until this gap is fixed.
  console.warn('[WIRING-GAP] exportResponseActivity: /api/ha-response-activity/export does not exist.');
  return new Blob(['export not available'], { type: 'text/csv' });
}
