import type { ExposureFilters, ExposurePageDTO } from '@/types/exposure.types';

/**
 * Production build alias target. Fictional attack paths must never ship in prod bundles.
 */
export async function getFoundationExposure(_filters: ExposureFilters, _signal?: AbortSignal): Promise<ExposurePageDTO> {
  throw new Error('Exposure foundation fixtures are excluded from production builds.');
}
