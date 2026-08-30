/**
 * compliance.service.ts — CMP read contracts (CMP-002 / CMP-003).
 */

import { apiClient } from '@/lib/apiClient';
import type {
  ComplianceControlEvaluationHistoryDTO,
  ComplianceControlLatestEvaluationDTO,
  ComplianceEvidenceItemDTO,
} from '@/types/compliance.types';

export const CMP_DRAWER_SEED_CONTROL_ID = 1;

export const complianceService = {
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
