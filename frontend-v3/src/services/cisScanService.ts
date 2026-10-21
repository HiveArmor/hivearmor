/**
 * cisScanService — per-host CIS benchmark scan reads (PT-5, Option A).
 *
 * Backed by the net-new OpenSearch index via /api/ha-cis-scan — DISTINCT from the
 * legacy Postgres observed-SSH SCA reads in vulnService (/ha-cis). All requests
 * route via the Vite /api/* proxy and carry the tenant header like the other reads.
 */

import { useAuthStore } from '@/store/auth.store';
import type { CisScanResultDTO, CisScanSummaryDTO } from '@/types/cisScan.types';


export class CisScanApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CisScanApiError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const selectedTenantId = useAuthStore.getState().selectedTenantId;
  const token = localStorage.getItem('hivearmor_auth_token');
  const res = await fetch(`/api${path}`, {
    signal,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(selectedTenantId !== null ? { 'X-Tenant-ID': String(selectedTenantId) } : {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const problem = (await res.json()) as { detail?: string; message?: string };
      detail = problem.detail ?? problem.message ?? detail;
    } catch {
      // Non-JSON error — keep the status text.
    }
    throw new CisScanApiError(res.status, detail || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Latest CIS scan control results for a host. Empty when not scanned yet. */
export async function fetchCisScanResultsByAgent(
  agentId: string,
  status?: string,
  signal?: AbortSignal,
): Promise<CisScanResultDTO[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return getJson<CisScanResultDTO[]>(
    `/ha-cis-scan/results/agent/${encodeURIComponent(agentId)}${q}`,
    signal,
  );
}

/** Latest CIS scan summary for a host (scanned=false when none ingested). */
export async function fetchCisScanSummaryByAgent(
  agentId: string,
  signal?: AbortSignal,
): Promise<CisScanSummaryDTO> {
  return getJson<CisScanSummaryDTO>(
    `/ha-cis-scan/results/agent/${encodeURIComponent(agentId)}/summary`,
    signal,
  );
}
