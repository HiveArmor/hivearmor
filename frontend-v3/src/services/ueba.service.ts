/**
 * UEBA Service — API client for UEBA baseline and deviation endpoints.
 *
 * Every request routes through the Vite proxy under `/api/ha-ueba/*`.
 * Auth is handled by the shared apiClient which injects
 * `Authorization: Bearer <hivearmor_auth_token>` from localStorage.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  AnomalyCountsDTO,
  EntityTimelineResponse,
  HaUebaDeviationDTO,
  PeerGroupDTO,
  RiskTrendPointDTO,
  UserRiskDTO,
} from '@/types/ueba.types';

/** Fetch tenant-scoped deviation rows. */
export async function getDeviations(): Promise<HaUebaDeviationDTO[]> {
  return apiClient.get<HaUebaDeviationDTO[]>('/ha-ueba/deviations');
}

/** Fetch per-user aggregate risk scores. */
export async function getRiskScores(): Promise<UserRiskDTO[]> {
  return apiClient.get<UserRiskDTO[]>('/ha-ueba/risk-scores');
}

/** Fetch entity timeline for a specific user. */
export async function getEntityTimeline(userId: string): Promise<EntityTimelineResponse> {
  return apiClient.get<EntityTimelineResponse>('/ha-ueba/entity-timeline', {
    params: { userId },
  });
}

/** Fetch tenant-scoped peer groups. */
export async function getPeerGroups(): Promise<PeerGroupDTO[]> {
  return apiClient.get<PeerGroupDTO[]>('/ha-ueba/peer-groups');
}

/** Fetch 30-day risk trend. */
export async function getRiskTrend(): Promise<RiskTrendPointDTO[]> {
  return apiClient.get<RiskTrendPointDTO[]>('/ha-ueba/risk-trend');
}

/** Fetch per-tier anomaly counts. */
export async function getAnomalyCounts(): Promise<AnomalyCountsDTO> {
  return apiClient.get<AnomalyCountsDTO>('/ha-ueba/anomaly-counts');
}
