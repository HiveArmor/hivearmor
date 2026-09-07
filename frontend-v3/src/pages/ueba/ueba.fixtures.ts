/**
 * Fictional UEBA rows for visual review only.
 * Loaded exclusively when VITE_USE_FOUNDATION_FIXTURES=true in DEV.
 * Production never receives these records. Scores are z-score rubric points,
 * not trained-model confidence.
 */

import type {
  AnomalyCountsDTO,
  EntityTimelineResponse,
  HaUebaDeviationDTO,
  PeerGroupDTO,
  RiskTrendPointDTO,
  UserRiskDTO,
} from '@/types/ueba.types';

export const UEBA_FIXTURE_DEVIATIONS: HaUebaDeviationDTO[] = [
  {
    userId: 'fixture-user-alpha',
    metricName: 'failed_logon_ratio',
    runTs: '2026-09-07T14:00:00Z',
    zScore: 4.6,
    points: 50,
  },
  {
    userId: 'fixture-user-alpha',
    metricName: 'after_hours_logons',
    runTs: '2026-09-07T14:00:00Z',
    zScore: 3.2,
    points: 25,
  },
  {
    userId: 'fixture-user-beta',
    metricName: 'unique_src_ips',
    runTs: '2026-09-07T13:00:00Z',
    zScore: 2.4,
    points: 10,
  },
  {
    userId: 'fixture-user-gamma',
    metricName: 'data_volume_bytes',
    runTs: '2026-09-07T12:00:00Z',
    zScore: 1.1,
    points: 0,
  },
];

export const UEBA_FIXTURE_RISK_SCORES: UserRiskDTO[] = [
  {
    userId: 'fixture-user-alpha',
    totalScore: 75,
    anomalyCount: 2,
    topMetric: 'failed_logon_ratio',
    lastUpdated: '2026-09-07T14:00:00Z',
  },
  {
    userId: 'fixture-user-beta',
    totalScore: 10,
    anomalyCount: 1,
    topMetric: 'unique_src_ips',
    lastUpdated: '2026-09-07T13:00:00Z',
  },
  {
    userId: 'fixture-user-gamma',
    totalScore: 0,
    anomalyCount: 0,
    topMetric: 'data_volume_bytes',
    lastUpdated: '2026-09-07T12:00:00Z',
  },
];

export const UEBA_FIXTURE_RISK_TREND: RiskTrendPointDTO[] = [
  { day: '2026-08-09', totalScore: 20 },
  { day: '2026-08-16', totalScore: 35 },
  { day: '2026-08-23', totalScore: 42 },
  { day: '2026-08-30', totalScore: 58 },
  { day: '2026-09-06', totalScore: 85 },
];

export const UEBA_FIXTURE_ANOMALY_COUNTS: AnomalyCountsDTO = {
  tier10: 1,
  tier25: 1,
  tier50: 1,
};

export const UEBA_FIXTURE_PEER_GROUPS: PeerGroupDTO[] = [
  { userId: 'fixture-user-alpha', groupKey: 'finance-analysts', groupSource: 'directory' },
  { userId: 'fixture-user-beta', groupKey: 'finance-analysts', groupSource: 'directory' },
  { userId: 'fixture-user-gamma', groupKey: 'ops-oncall', groupSource: 'cluster' },
];

export const UEBA_FIXTURE_ENTITY_TIMELINE: EntityTimelineResponse = {
  points: [
    {
      metricName: 'failed_logon_ratio',
      runTs: '2026-09-07T14:00:00Z',
      zScore: 4.6,
      points: 50,
      observed: 0.42,
    },
    {
      metricName: 'after_hours_logons',
      runTs: '2026-09-07T14:00:00Z',
      zScore: 3.2,
      points: 25,
      observed: 11,
    },
  ],
  baselines: [
    { metricName: 'failed_logon_ratio', mean: 0.04, stddev: 0.08 },
    { metricName: 'after_hours_logons', mean: 2.1, stddev: 2.8 },
  ],
};
