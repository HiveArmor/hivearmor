import type { AdPostureFilters, AdPosturePage } from '@/types/active-directory.types';

export const activeDirectoryFixtureMode = import.meta.env.DEV
  && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Active Directory posture is a new contract. Production deliberately returns
 * an explicit unavailable projection until the backend endpoints in ADP-001+
 * ship; fictional directory objects are dynamically imported only in the
 * foundation fixture build.
 */
export async function fetchAdPosture(
  filters: AdPostureFilters,
  signal?: AbortSignal,
): Promise<AdPosturePage> {
  if (activeDirectoryFixtureMode) {
    const { getFoundationAdPosture } = await import('@/pages/posture/active-directory/active-directory.fixtures');
    return getFoundationAdPosture(filters, signal);
  }

  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  return {
    items: [],
    cursor: null,
    total: 0,
    domains: [],
    summary: {
      postureScore: null,
      criticalAssessments: null,
      tierZeroPaths: null,
      riskyChanges24h: null,
      unhealthySensors: null,
      replicationIssues: null,
    },
    snapshotAt: null,
    contractState: 'missing',
    partialFailures: [{
      source: 'active-directory-posture',
      message: 'The authoritative Active Directory posture, change, trust, infrastructure, and remediation contracts are not implemented yet.',
    }],
  };
}
