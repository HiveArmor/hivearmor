/**
 * mitre.service.ts — MITRE ATT&CK Coverage API
 */

import { apiClient } from '@/lib/apiClient';
import type { RuleRefDTO, TechniqueCoverageDTO } from '@/types/mitre.types';

const TOKEN_KEY = 'hivearmor_auth_token';

export const mitreService = {
  getCoverage: () => apiClient.get<TechniqueCoverageDTO[]>('/mitre/coverage'),

  getRulesByTechnique: (techniqueId: string) =>
    apiClient.get<RuleRefDTO[]>('/mitre/rules', { params: { techniqueId } }),

  exportCoverage: async (): Promise<Blob> => {
    const token = localStorage.getItem(TOKEN_KEY) ?? '';
    const response = await fetch('/api/mitre/coverage/export', {
      headers: {
        Accept: 'text/csv',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`MITRE coverage export unavailable (HTTP ${response.status})`);
    }
    return response.blob();
  },
};
