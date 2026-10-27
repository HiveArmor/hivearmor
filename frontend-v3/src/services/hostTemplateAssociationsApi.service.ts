/**
 * PT-3 — host→template association API (`/api/host-template-associations`).
 *
 * Confirmed backend paths (`HostTemplateAssociationResource`):
 *   GET/POST         /api/host-template-associations
 *   GET/PUT/DELETE   /api/host-template-associations/{id}
 *   GET              /api/host-template-associations/resolve/{host}   (preview — no push)
 *   POST             /api/host-template-associations/{id}/apply       → 202 (re-resolve + re-push)
 *
 * Draft edits do NOT ship — a push happens ONLY on apply.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ApplyResultDTO,
  EffectivePolicyDTO,
  HostTemplateAssociationDTO,
} from '@/types/hostTemplateAssociations';

const BASE = '/host-template-associations';

/**
 * Design-fixture lane (DEV + VITE_USE_FOUNDATION_FIXTURES): read/preview/apply paths
 * return clearly-labelled SYNTHETIC data so the offline UI is populated. Dynamically
 * imported so prod bundles tree-shake it (and the prod alias throws regardless).
 */
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export async function listAssociations(): Promise<HostTemplateAssociationDTO[]> {
  if (fixtureMode) {
    const { foundationAssociations } = await import('@/services/fixtures/hostTemplateAssociations.fixtures');
    return foundationAssociations;
  }
  return apiClient.get<HostTemplateAssociationDTO[]>(BASE);
}

export async function getAssociation(id: number): Promise<HostTemplateAssociationDTO> {
  return apiClient.get<HostTemplateAssociationDTO>(`${BASE}/${id}`);
}

export async function createAssociation(
  dto: HostTemplateAssociationDTO,
): Promise<HostTemplateAssociationDTO> {
  return apiClient.post<HostTemplateAssociationDTO>(BASE, dto);
}

export async function updateAssociation(
  id: number,
  dto: HostTemplateAssociationDTO,
): Promise<HostTemplateAssociationDTO> {
  return apiClient.put<HostTemplateAssociationDTO>(`${BASE}/${id}`, dto);
}

export async function deleteAssociation(id: number): Promise<void> {
  return apiClient.delete<void>(`${BASE}/${id}`);
}

/** Preview which row wins for a host + the resolved sections. Read-only, never pushes. */
export async function resolveHost(host: string): Promise<EffectivePolicyDTO> {
  if (fixtureMode) {
    const { foundationResolveHost } = await import('@/services/fixtures/hostTemplateAssociations.fixtures');
    return foundationResolveHost(host);
  }
  return apiClient.get<EffectivePolicyDTO>(`${BASE}/resolve/${encodeURIComponent(host)}`);
}

/** Explicit APPLY — re-resolve + re-push APPLY_POLICY to affected hosts. Backend returns 202. */
export async function applyAssociation(id: number): Promise<ApplyResultDTO> {
  if (fixtureMode) {
    const { foundationApply } = await import('@/services/fixtures/hostTemplateAssociations.fixtures');
    return foundationApply(id);
  }
  return apiClient.post<ApplyResultDTO>(`${BASE}/${id}/apply`);
}
