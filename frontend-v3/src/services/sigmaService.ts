/**
 * Sigma Detection Service
 * API calls for HiveArmor Sigma rule management and testing.
 * All requests route via the Vite /api/* proxy — no absolute backend URLs.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  RuleTestRequestDTO,
  RuleTestResultDTO,
  SigmaRuleDTO,
  SigmaSyncResultDTO,
} from '@/types/sigma';

export interface SigmaRuleFilters {
  logsourceProduct?: string;
  minSeverity?: number;
  page?: number;
  size?: number;
}

/**
 * Fetch a paged list of Sigma rules from the backend.
 * Issues GET /api/ha-sigma/rules with optional filter query params.
 */
export async function getSigmaRules(params?: SigmaRuleFilters): Promise<SigmaRuleDTO[]> {
  return apiClient.get<SigmaRuleDTO[]>('/ha-sigma/rules', {
    params: {
      logsourceProduct: params?.logsourceProduct,
      minSeverity: params?.minSeverity,
      page: params?.page,
      size: params?.size,
    },
  });
}

/**
 * Trigger a manual Sigma rule sync from SigmaHQ.
 * Issues POST /api/ha-sigma/sync.
 * Requires ADMIN role. Returns 409 when air-gap mode is enabled.
 */
export async function triggerSigmaSync(): Promise<SigmaSyncResultDTO> {
  return apiClient.post<SigmaSyncResultDTO>('/ha-sigma/sync');
}

/**
 * Test a Sigma rule against a sample JSON event in the sandbox.
 * Issues POST /api/ha-rules/test.
 * Requires ANALYST or ADMIN role.
 */
export async function testRule(request: RuleTestRequestDTO): Promise<RuleTestResultDTO> {
  return apiClient.post<RuleTestResultDTO>('/ha-rules/test', request);
}
