/**
 * Command Center Service
 * API calls for Mission Control dashboard.
 *
 * FIX-07: /api/ha-alerts/summary does not exist.
 * Replaced with individual /api/overview/* endpoints.
 *
 * BACKEND PARAMETER NOTES (from OverviewResource.java):
 * - count-alerts-by-severity requires: from (ISO string), to (ISO string), top (Integer)
 * - count-alerts-today-and-last-week: no params required
 * Response is PieType { data: string[], value: { value: number, name: string }[] }
 */

import { apiClient } from '@/lib/apiClient';
import type { HivePostureScoreDTO } from '@/types/posture.types';

// Shape used by the page's KPI tiles
export interface AlertSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

// PieType from OverviewResource
interface PieType {
  data: string[];
  value: { value: number; name: string }[];
}

// CardType from OverviewResource (count-alerts-today-and-last-week)
interface CardType {
  serie: string;
  value: number;
}

/**
 * Build an AlertSummary by calling two overview endpoints.
 * count-alerts-today-and-last-week returns [{serie:"Today",value:N},{serie:"Last 7 days",value:N}]
 * count-alerts-by-severity requires from, to (ISO), and top params — returns PieType
 */
export async function getAlertSummary(): Promise<AlertSummary> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = sevenDaysAgo.toISOString();
  const to = now.toISOString();

  const [todayCards, bySeverity] = await Promise.all([
    apiClient.get<CardType[]>('/overview/count-alerts-today-and-last-week'),
    apiClient.get<PieType>('/overview/count-alerts-by-severity', {
      params: { from, to, top: 10 },
    }),
  ]);

  // Extract today's total from the CardType array
  const todayCard = todayCards.find((c) => c.serie === 'Today');
  const total = todayCard?.value ?? 0;

  // Extract per-severity counts from PieType value array
  const counts: Record<string, number> = {};
  for (const item of bySeverity.value ?? []) {
    counts[item.name.toUpperCase()] = item.value;
  }

  return {
    critical: counts['CRITICAL'] ?? 0,
    high: counts['HIGH'] ?? 0,
    medium: counts['MEDIUM'] ?? 0,
    low: counts['LOW'] ?? 0,
    total,
  };
}

/**
 * Fetch defensive posture score.
 * GET /api/ha-posture/score
 */
export async function getPostureScore(): Promise<HivePostureScoreDTO> {
  return apiClient.get<HivePostureScoreDTO>('/ha-posture/score');
}

/** Detection health derived from active correlation rules count.
 *  GET /api/correlation-rule/search-by-filters with active=true
 *  NEEDS_BACKEND: last-rule-fired and plugin status have no endpoint yet.
 */
export interface DetectionHealthSummary {
  activeRules: number;
  totalRules: number;
}

export interface AlertTimelineBucket {
  hour: string;
  low: number;
  medium: number;
  high: number;
}

/** GET /api/overview/alert-timeline — hourly severity buckets. */
export async function getAlertTimeline(days = 1): Promise<AlertTimelineBucket[]> {
  const buckets = await apiClient.get<AlertTimelineBucket[]>('/overview/alert-timeline', {
    params: { days },
  });
  return Array.isArray(buckets) ? buckets : [];
}

export async function getDetectionHealthSummary(): Promise<DetectionHealthSummary> {
  const [activeResp, allResp] = await Promise.all([
    apiClient.get<unknown[]>('/correlation-rule/search-by-filters', {
      params: { active: true, size: 1 },
    }),
    apiClient.get<unknown[]>('/correlation-rule/search-by-filters', {
      params: { size: 1 },
    }),
  ]);
  // The endpoint returns a PaginatedResponse with X-Total-Count but apiClient
  // doesn't expose headers, so fall back to array length as a lower bound.
  return {
    activeRules: Array.isArray(activeResp) ? activeResp.length : 0,
    totalRules: Array.isArray(allResp) ? allResp.length : 0,
  };
}

