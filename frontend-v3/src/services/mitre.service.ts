/**
 * mitre.service.ts — MITRE ATT&CK Coverage API
 */

import { apiClient } from '@/lib/apiClient';
import type { RuleRefDTO, TechniqueCoverageDTO } from '@/types/mitre.types';

export const mitreService = {
  getCoverage: () => apiClient.get<TechniqueCoverageDTO[]>('/mitre/coverage'),

  getRulesByTechnique: (techniqueId: string) =>
    apiClient.get<RuleRefDTO[]>('/mitre/rules', { params: { techniqueId } }),

  exportCoverage: async (): Promise<Blob> => {
    const response = await fetch('/api/mitre/coverage/export', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token')}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }
    return response.blob();
  },
};
