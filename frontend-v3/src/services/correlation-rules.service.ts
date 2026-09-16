/**
 * Correlation Rules Service
 * Detection rule management API calls.
 */

import { apiClient, type PaginatedResponse } from '@/lib/apiClient';
import type {
  CorrelationRuleDTO,
  RuleImportRequest,
  RuleImportResult,
  RulePack,
  RuleTestRequest,
  RuleTestResult,
} from '@/types/api.types';

export interface RuleListParams {
  page?: number;
  size?: number;
  sort?: string;
  active?: boolean;
  category?: string;
}

export interface RuleSearchParams {
  name?: string;
  category?: string;
  severity?: string;
  active?: boolean;
  /**
   * Filter to rules that consume one or more detection dataTypes. Maps to the
   * backend UtmCorrelationRulesFilter.dataTypes (List<String>) which the
   * repository matches on `dt.dataType IN (:dataTypes)`. Used by the W8
   * log-collection observability view to count rules consuming a source type.
   */
  dataTypes?: string[];
}

export async function getRules(params?: RuleListParams): Promise<PaginatedResponse<CorrelationRuleDTO>> {
  const token = localStorage.getItem('hivearmor_auth_token');
  const queryParams = new URLSearchParams();
  if (params?.page !== undefined) queryParams.set('page', String(params.page));
  if (params?.size !== undefined) queryParams.set('size', String(params.size));
  if (params?.sort) queryParams.set('sort', params.sort);
  if (params?.active !== undefined) queryParams.set('active', String(params.active));
  if (params?.category) queryParams.set('category', params.category);

  const url = `/api/correlation-rule?${queryParams.toString()}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const items = await response.json();
  const total = parseInt(response.headers.get('X-Total-Count') ?? '0', 10);
  return { items, total };
}

export async function getRule(id: number | string): Promise<CorrelationRuleDTO> {
  return apiClient.get<CorrelationRuleDTO>(`/correlation-rule/${id}`);
}

export async function createRule(rule: Omit<CorrelationRuleDTO, 'id'>): Promise<CorrelationRuleDTO> {
  return apiClient.post<CorrelationRuleDTO>('/correlation-rule', rule);
}

export async function updateRule(rule: CorrelationRuleDTO): Promise<CorrelationRuleDTO> {
  return apiClient.put<CorrelationRuleDTO>('/correlation-rule', rule);
}

export async function deleteRule(id: number): Promise<void> {
  return apiClient.delete<void>(`/correlation-rule/${id}`);
}

export async function toggleRuleActive(id: number, active: boolean): Promise<void> {
  return apiClient.put<void>('/correlation-rule/activate-deactivate', { id, active });
}

export async function searchRulesByFilters(params: RuleSearchParams): Promise<CorrelationRuleDTO[]> {
  return apiClient.get<CorrelationRuleDTO[]>('/correlation-rule/search-by-filters', {
    params: params as Record<string, string | number | boolean | string[] | undefined>,
  });
}

/**
 * Returns the TRUE total number of rules matching the filter, read from the
 * `X-Total-Count` header — NOT the length of a page body. The backend
 * search-by-filters endpoint is paginated (JHipster default page size 20), so
 * counting `searchRulesByFilters(...).length` silently caps at 20 and
 * under-reports high-count dataTypes. `size=1` keeps the probe cheap while the
 * header still carries the full total. Tenant-scoped via apiClient.getCount.
 */
export async function countRulesByFilters(params: RuleSearchParams): Promise<number> {
  return apiClient.getCount('/correlation-rule/search-by-filters', {
    params: { ...params, size: 1 } as Record<string, string | number | boolean | string[] | undefined>,
  });
}

export async function testRule(req: RuleTestRequest): Promise<RuleTestResult> {
  return apiClient.post<RuleTestResult>('/correlation-rule/test', req);
}

export async function importRules(req: RuleImportRequest): Promise<RuleImportResult> {
  // Multipart form upload — not using apiClient for this
  const token = localStorage.getItem('hivearmor_auth_token');
  const formData = new FormData();
  formData.append('file', req.file);
  formData.append('format', req.format);

  const response = await fetch('/api/correlation-rule/import', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

export async function getRulePacks(): Promise<RulePack[]> {
  return apiClient.get<RulePack[]>('/correlation-rule/packs');
}

export async function installRulePack(packName: string): Promise<void> {
  return apiClient.post<void>(`/correlation-rule/packs/${packName}/install`);
}
