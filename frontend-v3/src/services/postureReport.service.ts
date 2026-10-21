/**
 * postureReportService — cross-fleet posture reporting reads (SPEC-PT-6).
 *
 * Backed by /api/ha-posture-report, which aggregates the PT-5 per-host CIS
 * (v3-hive-cis-*) and vuln (ha_vuln_finding) stores into fleet-wide posture, trend
 * and report packs. All requests route via the Vite /api/* proxy and carry the tenant
 * header like the other telemetry reads. This surface is read-only and distinct from
 * the per-host /api/ha-cis-scan + /api/ha-vuln reads and from /api/ha-posture
 * (compliance-framework assurance).
 */

import { useAuthStore } from '@/store/auth.store';
import type {
  FleetCisPostureDTO,
  FleetPostureOverviewDTO,
  PostureTrendDTO,
} from '@/types/postureReport.types';

export class PostureReportApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PostureReportApiError';
  }
}

function authHeaders(): Record<string, string> {
  const selectedTenantId = useAuthStore.getState().selectedTenantId;
  const token = localStorage.getItem('hivearmor_auth_token');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(selectedTenantId !== null ? { 'X-Tenant-ID': String(selectedTenantId) } : {}),
  };
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    signal,
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const problem = (await res.json()) as { detail?: string; message?: string };
      detail = problem.detail ?? problem.message ?? detail;
    } catch {
      // Non-JSON error — keep the status text.
    }
    throw new PostureReportApiError(res.status, detail || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Composite cross-fleet overview: CIS posture + vuln-by-severity + coverage honesty. */
export async function fetchPostureOverview(signal?: AbortSignal): Promise<FleetPostureOverviewDTO> {
  return getJson<FleetPostureOverviewDTO>('/ha-posture-report/overview', signal);
}

/** Cross-fleet CIS benchmark posture: fleet rollup + per-host grid + not-covered count. */
export async function fetchFleetCis(signal?: AbortSignal): Promise<FleetCisPostureDTO> {
  return getJson<FleetCisPostureDTO>('/ha-posture-report/cis', signal);
}

/** Posture-over-time: day-bucketed CIS pass-rate series + latest-vs-previous drift. */
export async function fetchPostureTrend(days = 90, signal?: AbortSignal): Promise<PostureTrendDTO> {
  return getJson<PostureTrendDTO>(`/ha-posture-report/trend?days=${encodeURIComponent(days)}`, signal);
}

/**
 * Downloads a posture report-pack export (PDF or CSV). Uses an authenticated fetch +
 * blob (not a bare anchor) so the tenant header is sent and errors surface honestly.
 */
export async function downloadPostureExport(
  kind: 'pdf' | 'cis-csv' | 'vuln-csv',
): Promise<{ blob: Blob; filename: string }> {
  const path =
    kind === 'pdf'
      ? '/ha-posture-report/export/pdf'
      : kind === 'cis-csv'
        ? '/ha-posture-report/export/cis.csv'
        : '/ha-posture-report/export/vuln.csv';
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) {
    throw new PostureReportApiError(res.status, `Export failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const fallback = kind === 'pdf' ? 'fleet-posture-report.pdf' : `${kind}.csv`;
  return { blob, filename: match ? match[1] : fallback };
}
