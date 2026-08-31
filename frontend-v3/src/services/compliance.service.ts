/**
 * compliance.service.ts — CMP read contracts (CMP-002 / CMP-003 / CMP-004).
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ComplianceControlEvaluationHistoryDTO,
  ComplianceControlLatestEvaluationDTO,
  ComplianceEvidenceItemDTO,
  ComplianceStandardSectionDTO,
  FrameworkControlResolution,
} from '@/types/compliance.types';

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
