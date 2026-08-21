import type { ExposureFilters, ExposurePageDTO } from '@/types/exposure.types';

export const exposureFixtureMode = import.meta.env.DEV
  && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Exposure paths are a new graph-derived contract. Foundation fixtures are
 * dynamically imported only for the explicitly enabled development build.
 * Production never derives paths or "no exposure" from incomplete asset data.
 */
export async function fetchExposure(
  filters: ExposureFilters,
  signal?: AbortSignal,
): Promise<ExposurePageDTO> {
  if (exposureFixtureMode) {
    const { getFoundationExposure } = await import('@/pages/posture/exposure/exposure.fixtures');
    return getFoundationExposure(filters, signal);
  }

  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  return {
    items: [],
    nextCursor: null,
    total: 0,
    summary: {
      exposureScore: null,
      activeAttackPaths: null,
      criticalAssetsAtRisk: null,
      internetEntryPoints: null,
      chokePoints: null,
      reduciblePaths: null,
    },
    snapshotAt: null,
    freshness: 'unknown',
    contractState: 'missing',
    partialFailures: [{
      source: 'exposure-graph',
      message: 'Authoritative attack-path generation, path evidence, choke-point aggregation, and remediation impact contracts are not implemented.',
    }],
  };
}
