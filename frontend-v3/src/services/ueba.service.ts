/**
 * UEBA Service — API client for UEBA baseline and deviation endpoints.
 *
 * Every live request routes through the Vite proxy under `/api/ha-ueba/*`.
 * Auth is handled by the shared apiClient which injects
 * `Authorization: Bearer <hivearmor_auth_token>` from localStorage.
 *
 * Fixture fallback is DEV-only (`VITE_USE_FOUNDATION_FIXTURES=true`) and never
 * ships trained-model scores — fixtures reuse the same z-score rubric DTOs.
 */

import { apiClient } from '@/lib/apiClient';
import {
  UEBA_FIXTURE_ANOMALY_COUNTS,
  UEBA_FIXTURE_DEVIATIONS,
  UEBA_FIXTURE_ENTITY_TIMELINE,
  UEBA_FIXTURE_PEER_GROUPS,
  UEBA_FIXTURE_RISK_SCORES,
  UEBA_FIXTURE_RISK_TREND,
} from '@/pages/ueba/ueba.fixtures';
import type {
  AnomalyCountsDTO,
  EntityTimelineResponse,
  HaUebaDeviationDTO,
  PeerGroupDTO,
  RiskTrendPointDTO,
  UserRiskDTO,
} from '@/types/ueba.types';

export const uebaFixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Fetch tenant-scoped deviation rows. */
export async function getDeviations(): Promise<HaUebaDeviationDTO[]> {
  if (uebaFixtureMode) return clone(UEBA_FIXTURE_DEVIATIONS);
  return apiClient.get<HaUebaDeviationDTO[]>('/ha-ueba/deviations');
}

/** Fetch per-user aggregate risk scores. */
export async function getRiskScores(): Promise<UserRiskDTO[]> {
  if (uebaFixtureMode) return clone(UEBA_FIXTURE_RISK_SCORES);
  return apiClient.get<UserRiskDTO[]>('/ha-ueba/risk-scores');
}

/** Fetch entity timeline for a specific user. */
export async function getEntityTimeline(userId: string): Promise<EntityTimelineResponse> {
  if (uebaFixtureMode) {
    return userId === 'fixture-user-alpha'
      ? clone(UEBA_FIXTURE_ENTITY_TIMELINE)
      : { points: [], baselines: [] };
  }
  return apiClient.get<EntityTimelineResponse>('/ha-ueba/entity-timeline', {
    params: { userId },
  });
}

/** Fetch tenant-scoped peer groups. */
export async function getPeerGroups(): Promise<PeerGroupDTO[]> {
  if (uebaFixtureMode) return clone(UEBA_FIXTURE_PEER_GROUPS);
  return apiClient.get<PeerGroupDTO[]>('/ha-ueba/peer-groups');
}

/** Fetch 30-day risk trend. */
export async function getRiskTrend(): Promise<RiskTrendPointDTO[]> {
  if (uebaFixtureMode) return clone(UEBA_FIXTURE_RISK_TREND);
  return apiClient.get<RiskTrendPointDTO[]>('/ha-ueba/risk-trend');
}

/** Fetch per-tier anomaly counts. */
export async function getAnomalyCounts(): Promise<AnomalyCountsDTO> {
  if (uebaFixtureMode) return clone(UEBA_FIXTURE_ANOMALY_COUNTS);
  return apiClient.get<AnomalyCountsDTO>('/ha-ueba/anomaly-counts');
}
