import type { AdPostureFilters, AdPosturePage } from '@/types/active-directory.types';

/**
 * Production build alias target. Fictional AD posture must never ship in prod bundles.
 */
export function getFoundationAdPosture(_filters: AdPostureFilters, _signal?: AbortSignal): AdPosturePage {
  throw new Error('Active Directory foundation fixtures are excluded from production builds.');
}
