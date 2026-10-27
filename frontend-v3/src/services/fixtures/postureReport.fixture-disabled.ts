import type {
  FleetCisPostureDTO,
  FleetPostureOverviewDTO,
  PostureTrendDTO,
} from '@/types/postureReport.types';

/**
 * Production build alias target. Fictional fleet-posture data must never ship in prod
 * bundles — aliased in via vite.config when VITE_USE_FOUNDATION_FIXTURES !== 'true'.
 */
export function foundationFleetCis(): FleetCisPostureDTO {
  throw new Error('Posture-report foundation fixtures are excluded from production builds.');
}

export function foundationPostureOverview(): FleetPostureOverviewDTO {
  throw new Error('Posture-report foundation fixtures are excluded from production builds.');
}

export function foundationPostureTrend(): PostureTrendDTO {
  throw new Error('Posture-report foundation fixtures are excluded from production builds.');
}
