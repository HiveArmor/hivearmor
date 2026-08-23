/**
 * posture.service.ts — Security Posture API
 */

import { apiClient } from '@/lib/apiClient';
import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export const postureService = {
  getScore: async (signal?: AbortSignal) => {
    if (fixtureMode) {
      const { compliancePostureFixture } = await import('@/pages/compliance/compliance.fixtures');
      return compliancePostureFixture;
    }

    return apiClient.get<HivePostureScoreDTO>('/ha-posture/score', { signal });
  },

  getFrameworks: async (signal?: AbortSignal) => {
    if (fixtureMode) {
      const { complianceFrameworkFixtures } = await import('@/pages/compliance/compliance.fixtures');
      return complianceFrameworkFixtures;
    }

    return apiClient.get<HiveFrameworkScoreDTO[]>('/ha-posture/frameworks', { signal });
  },
};
