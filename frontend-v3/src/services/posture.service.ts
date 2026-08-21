/**
 * posture.service.ts — Security Posture API
 */

import { apiClient } from '@/lib/apiClient';
import type { HiveFrameworkScoreDTO, HivePostureScoreDTO } from '@/types/posture.types';

export const postureService = {
  getScore: () => apiClient.get<HivePostureScoreDTO>('/ha-posture/score'),

  getFrameworks: () => apiClient.get<HiveFrameworkScoreDTO[]>('/ha-posture/frameworks'),
};
