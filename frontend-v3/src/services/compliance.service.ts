/**
 * compliance.service.ts — CMP read contracts (CMP-002 / CMP-003 / CMP-004 / CMP-005).
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ComplianceControlEvaluationHistoryDTO,
  ComplianceControlLatestEvaluationDTO,
  ComplianceEvidenceItemDTO,
  ComplianceStandardSectionDTO,
  FrameworkControlResolution,
  SectionControlsPage,
  SectionControlsQuery,
} from '@/types/compliance.types';

const TOKEN_KEY = 'hivearmor_auth_token';

/** Page size for drawer control picker — honest pagination boundary. */
export const CMP_SECTION_CONTROLS_PAGE_SIZE = 25;

/** Parses posture framework id (numeric standard id) for CMP catalog mapping. */
export function parseFrameworkStandardId(frameworkId: string): number | null {
  const trimmed = frameworkId.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const standardId = Number.parseInt(trimmed, 10);
  return Number.isFinite(standardId) && standardId > 0 ? standardId : null;
}

export const complianceService = {
  getStandardSections: (standardId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceStandardSectionDTO[]>('/compliance/standard-section', {
      params: {
        'standardId.equals': standardId,
        size: 50,
        sort: 'id,asc',
      },
      signal,
    }),

  getSectionControls: (sectionId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlLatestEvaluationDTO[]>('/compliance/control-config/get-by-section', {
      params: {
        sectionId,
        size: 1,
        sort: 'id,asc',
      },
      signal,
    }),

  getSectionControlsPage: async (
    query: SectionControlsQuery,
    signal?: AbortSignal,
  ): Promise<SectionControlsPage> => {
    const token = localStorage.getItem(TOKEN_KEY);
    const params = new URLSearchParams();
    params.set('sectionId', String(query.sectionId));
    params.set('page', String(query.page ?? 0));
    params.set('size', String(query.size ?? CMP_SECTION_CONTROLS_PAGE_SIZE));
    params.set('sort', query.sort ?? 'id,asc');
    if (query.search?.trim()) params.set('search', query.search.trim());

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`/api/compliance/control-config/get-by-section?${params.toString()}`, {
      headers,
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const items = (await response.json()) as ComplianceControlLatestEvaluationDTO[];
    const total = Number.parseInt(response.headers.get('X-Total-Count') ?? String(items.length), 10);
    return { items, total: Number.isFinite(total) ? total : items.length };
  },

  resolveFrameworkRepresentativeControl: async (
    frameworkId: string,
    signal?: AbortSignal,
  ): Promise<FrameworkControlResolution | null> => {
    const standardId = parseFrameworkStandardId(frameworkId);
    if (standardId === null) return null;

    const sections = await complianceService.getStandardSections(standardId, signal);
    for (const section of sections) {
      const controls = await complianceService.getSectionControls(section.id, signal);
      const control = controls[0];
      if (control?.id != null) {
        return {
          standardId,
          sectionId: section.id,
          sectionName: section.standardSectionName ?? null,
          controlId: control.id,
          controlName: control.controlName ?? null,
        };
      }
    }
    return null;
  },

  getControlLatestEvaluation: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlLatestEvaluationDTO>(
      `/compliance/control-config/get-by-id/${controlId}`,
      { signal },
    ),

  getControlEvaluations: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceControlEvaluationHistoryDTO>(
      `/compliance/control-config/${controlId}/evaluations`,
      { signal },
    ),

  getControlEvidence: (controlId: number, signal?: AbortSignal) =>
    apiClient.get<ComplianceEvidenceItemDTO[]>(`/compliance/controls/${controlId}/evidence`, {
      params: { page: 0, size: 20, days: 30 },
      signal,
    }),
};
