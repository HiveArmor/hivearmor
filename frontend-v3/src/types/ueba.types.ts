/**
 * ueba.types.ts — UEBA Baseline & Deviation types
 * Mirrors backend DTOs from HaUebaResource and HaUebaDeviationEngine.
 */

/**
 * The five behavioral metrics tracked by the UEBA baseline engine.
 * Must match `Metric_Set` in `com.hivearmor.service.ueba.metrics.UebaMetrics`.
 */
export type MetricName =
  | 'logon_count_per_day'
  | 'unique_src_ips'
  | 'data_volume_bytes'
  | 'after_hours_logons'
  | 'failed_logon_ratio';

/** Mirrors backend `DeviationDTO` from `HaUebaResource.deviations()`. */
export interface HaUebaDeviationDTO {
  userId: string;
  metricName: MetricName;
  runTs: string; // ISO 8601 timestamp
  zScore: number;
  points: number;
}

/** A single datapoint in the entity timeline scatter chart. */
export interface EntityTimelinePoint {
  metricName: MetricName;
  runTs: string; // ISO 8601 timestamp
  zScore: number;
  points: number;
  observed: number;
}

/** Baseline band for a single metric within the entity timeline response. */
export interface BaselineBand {
  metricName: MetricName;
  mean: number;
  stddev: number;
}

/** Response shape returned by `GET /api/ha-ueba/entity-timeline`. */
export interface EntityTimelineResponse {
  points: EntityTimelinePoint[];
  baselines: BaselineBand[];
}

/** Per-user aggregate risk score from `GET /api/ha-ueba/risk-scores`. */
export interface UserRiskDTO {
  userId: string;
  totalScore: number;
  anomalyCount: number;
  topMetric: MetricName | null;
  lastUpdated: string | null; // ISO 8601 timestamp
}

/** Peer group assignment from `GET /api/ha-ueba/peer-groups`. */
export interface PeerGroupDTO {
  userId: string;
  groupKey: string;
  groupSource: string;
}

/** Single day entry in the 30-day risk trend from `GET /api/ha-ueba/risk-trend`. */
export interface RiskTrendPointDTO {
  day: string; // ISO 8601 date (YYYY-MM-DD)
  totalScore: number;
}

/** Per-tier anomaly counts from `GET /api/ha-ueba/anomaly-counts`. */
export interface AnomalyCountsDTO {
  tier10: number;
  tier25: number;
  tier50: number;
}

/** Error shape returned by UEBA API endpoints on failure. */
export interface UebaError {
  message: string;
  status: number;
}
