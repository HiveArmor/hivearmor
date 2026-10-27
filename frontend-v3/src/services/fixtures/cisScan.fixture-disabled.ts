import type { CisScanResultDTO, CisScanSummaryDTO } from '@/types/cisScan.types';

/**
 * Production build alias target. Fictional CIS scan data must never ship in prod
 * bundles — aliased in via vite.config when VITE_USE_FOUNDATION_FIXTURES !== 'true'.
 */
export function foundationCisSummary(): CisScanSummaryDTO {
  throw new Error('CIS-scan foundation fixtures are excluded from production builds.');
}

export function foundationCisResults(): CisScanResultDTO[] {
  throw new Error('CIS-scan foundation fixtures are excluded from production builds.');
}
