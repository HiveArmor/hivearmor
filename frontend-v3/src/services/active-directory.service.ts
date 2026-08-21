import type {
  AdDomainSummaryDTO,
  AdPostureFilters,
  AdPosturePage,
  AdReportSummaryDTO,
  AdTrackerEventDTO,
  AdTrackerParams,
} from '@/types/active-directory.types';

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

// Compatibility exports for old callers. They remain empty in production and
// must not be interpreted as an authoritative statement that no risk exists.
export async function getAdDomainSummary(domain?: string): Promise<AdDomainSummaryDTO[]> {
  const page = await fetchAdPosture({ view: 'domains', domain, risk: 'all', category: 'all', timeRange: '24h', limit: 50 });
  return page.items as AdDomainSummaryDTO[];
}

export async function getAdTrackerEvents(params: AdTrackerParams): Promise<{ data: AdTrackerEventDTO[]; total: number }> {
  const page = await fetchAdPosture({ view: 'changes', domain: params.domain, risk: 'all', category: 'all', timeRange: '24h', limit: params.size ?? 50 });
  return { data: page.items as AdTrackerEventDTO[], total: page.total };
}

export async function getAdReportSummary(_domain: string): Promise<AdReportSummaryDTO[]> {
  return [];
}
