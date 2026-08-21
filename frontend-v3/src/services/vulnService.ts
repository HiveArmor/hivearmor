/**
 * vulnService — vulnerability and SCA API calls.
 * All requests route via Vite /api/* proxy.
 */

import type {
  VulnFindingDTO,
  VulnSummaryDTO,
  VulnFindingsQuery,
  VulnRemediationDTO,
  ScaResultDTO,
  ScaSummaryDTO,
  ScaResultsQuery,
  CisPackCatalogDTO,
  VulnRemediationConnectorDTO,
} from '../types/vuln.types';

import { useAuthStore } from '@/store/auth.store';

// ── helpers ──────────────────────────────────────────────────────────────────

function buildParams(obj: Record<string, unknown>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      p.set(k, String(v));
    }
  }
  return p;
}

async function get<T>(path: string, params?: URLSearchParams, signal?: AbortSignal): Promise<{ data: T; total: number }> {
  const url = `/api${path}${params && params.toString() ? '?' + params.toString() : ''}`;
  const selectedTenantId = useAuthStore.getState().selectedTenantId;
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      ...(localStorage.getItem('hivearmor_auth_token') ? { Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token')}` } : {}),
      ...(selectedTenantId !== null ? { 'X-Tenant-ID': String(selectedTenantId) } : {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const problem = await res.json() as { detail?: string; message?: string };
      detail = problem.detail ?? problem.message ?? detail;
    } catch {
      // Non-JSON error responses still retain their status and safe status text.
    }
    throw new VulnApiError(res.status, detail || `Request failed with status ${res.status}`);
  }
  const total = parseInt(res.headers.get('X-Total-Count') ?? '0', 10);
  const data = (await res.json()) as T;
  return { data, total };
}

export class VulnApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'VulnApiError';
  }
}

// ── Vulnerability API ─────────────────────────────────────────────────────────

/**
 * Fetch paginated CVE findings.
 */
export async function fetchVulnFindings(query: VulnFindingsQuery = {}, signal?: AbortSignal): Promise<{
  findings: VulnFindingDTO[];
  total: number;
}> {
  const params = buildParams({
    agentId: query.agentId,
    severity: query.severity,
    isKev: query.isKev,
    cve: query.cve,
    from: query.from,
    to: query.to,
    page: query.page ?? 0,
    size: query.size ?? 25,
    cursor: query.cursor,
  });
  const { data, total } = await get<VulnFindingDTO[]>('/ha-vuln/findings', params, signal);
  return { findings: data, total };
}

/**
 * Fetch fleet-level vulnerability summary.
 */
export async function fetchVulnSummary(query: VulnFindingsQuery = {}, signal?: AbortSignal): Promise<VulnSummaryDTO> {
  const params = buildParams({
    agentId: query.agentId,
    severity: query.severity,
    isKev: query.isKev,
    cve: query.cve,
    from: query.from,
    to: query.to,
  });
  const { data } = await get<VulnSummaryDTO>('/ha-vuln/findings/summary', params, signal);
  return data;
}

export async function fetchVulnFinding(findingId: number, signal?: AbortSignal): Promise<VulnFindingDTO> {
  const { data } = await get<VulnFindingDTO>(`/ha-vuln/findings/${findingId}`, undefined, signal);
  return data;
}

export async function fetchVulnRemediation(findingId: number, signal?: AbortSignal): Promise<VulnRemediationDTO> {
  const { data } = await get<VulnRemediationDTO>(`/ha-vuln/findings/${findingId}/remediation`, undefined, signal);
  return data;
}

/**
 * Fetch all CVE findings for a specific agent.
 */
export async function fetchVulnFindingsByAgent(
  agentId: string,
  page = 0,
  size = 50,
): Promise<{ findings: VulnFindingDTO[]; total: number }> {
  const params = buildParams({ page, size });
  const { data, total } = await get<VulnFindingDTO[]>(`/ha-vuln/findings/agent/${encodeURIComponent(agentId)}`, params);
  return { findings: data, total };
}

// ── SCA / CIS API ─────────────────────────────────────────────────────────────

/**
 * Fetch paginated SCA check results.
 */
export async function fetchScaResults(query: ScaResultsQuery = {}, signal?: AbortSignal): Promise<{
  results: ScaResultDTO[];
  total: number;
}> {
  const params = buildParams({
    agentId: query.agentId,
    checkId: query.checkId,
    status: query.status,
    level: query.level,
    page: query.page ?? 0,
    size: query.size ?? 50,
    cursor: query.cursor,
  });
  const { data, total } = await get<ScaResultDTO[]>('/ha-cis/results', params, signal);
  return { results: data, total };
}

/**
 * Fetch SCA summaries (per-agent scores).
 */
export async function fetchScaSummary(agentId?: string, signal?: AbortSignal): Promise<ScaSummaryDTO[]> {
  const params = buildParams({ agentId });
  const { data } = await get<ScaSummaryDTO[]>('/ha-cis/results/summary', params, signal);
  return data;
}

export async function fetchScaResult(resultId: number, signal?: AbortSignal): Promise<ScaResultDTO> {
  const { data } = await get<ScaResultDTO>(`/ha-cis/results/${resultId}`, undefined, signal);
  return data;
}

export async function fetchCisCatalog(signal?: AbortSignal): Promise<CisPackCatalogDTO[]> {
  const { data } = await get<CisPackCatalogDTO[]>('/ha-cis/catalog', undefined, signal);
  return data;
}

export async function fetchVulnRemediationConnectors(signal?: AbortSignal): Promise<VulnRemediationConnectorDTO[]> {
  const { data } = await get<VulnRemediationConnectorDTO[]>('/ha-vuln/remediation-connectors', undefined, signal);
  return data;
}

/**
 * Fetch all SCA results for a specific agent.
 */
export async function fetchScaResultsByAgent(
  agentId: string,
  page = 0,
  size = 100,
): Promise<{ results: ScaResultDTO[]; total: number }> {
  const params = buildParams({ page, size });
  const { data, total } = await get<ScaResultDTO[]>(`/ha-cis/results/agent/${encodeURIComponent(agentId)}`, params);
  return { results: data, total };
}
