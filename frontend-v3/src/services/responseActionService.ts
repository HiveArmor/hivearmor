/**
 * HiveArmor SOAR Response Action service.
 * Sprint 18 — T03 · frontend-v3/src/services/responseActionService.ts
 *
 * All calls go through the shared apiClient which prepends `/api` and injects
 * the JWT `Authorization` header automatically.  Never use absolute backend
 * URLs here.
 */

import type { ResponseAction } from '../types/responseAction';

import { apiClient } from '@/lib/apiClient';
const fixtureMode =
  import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

interface ResponseActionCatalogDTO {
  id: string;
  name: string;
  category: string;
  description: string;
  targetType?: string | null;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string | null;
    defaultValue?: string | number | boolean | null;
  }>;
  integrationStatus?: string | null;
  riskLevel?: string | null;
  requiredRole?: string | null;
}

function normalizeStatus(value?: string | null): ResponseAction['integrationStatus'] {
  const normalized = value?.toLowerCase();
  return normalized === 'healthy' || normalized === 'degraded' || normalized === 'unavailable'
    ? normalized
    : 'unknown';
}

function normalizeRisk(value?: string | null): ResponseAction['riskLevel'] {
  const normalized = value?.toLowerCase();
  return normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low'
    ? normalized
    : 'unknown';
}

function normalizeParamType(value: string): ResponseAction['params'][number]['type'] {
  if (value === 'integer') return 'integer';
  if (value === 'boolean') return 'boolean';
  if (value === 'enum' || value === 'multi_enum') return 'select';
  return 'string';
}

function normalizeAction(dto: ResponseActionCatalogDTO): ResponseAction {
  return {
    id: dto.id,
    name: dto.name,
    category: dto.category,
    description: dto.description,
    targetType: dto.targetType ?? null,
    params: (dto.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      type: normalizeParamType(parameter.type),
      required: parameter.required,
      description: parameter.description ?? null,
      defaultValue: parameter.defaultValue ?? null,
      options: null,
    })),
    usageCount: 0,
    integrationStatus: normalizeStatus(dto.integrationStatus),
    riskLevel: normalizeRisk(dto.riskLevel),
    requiredRole: dto.requiredRole ?? null,
    integrationName: null,
    requiresApproval: null,
    rollbackSupported: null,
  };
}

/**
 * Fetch the built-in response action library.
 * GET /api/response/actions (HaResponseActionResource) — confirmed ALT-010 path.
 * A1-AI-01: fail closed to development fixtures / empty unavailable list — never invent alternate URLs.
 *
 * The older /ha-response-actions/library endpoint is intentionally not used as the primary
 * catalogue: it does not expose target, risk, permission, or integration-readiness data.
 */
export async function fetchResponseActionLibrary(
  input?: AbortSignal | { signal?: AbortSignal }
): Promise<ResponseAction[]> {
  const signal = input instanceof AbortSignal ? input : input?.signal;
  if (fixtureMode) {
    const { fixtureResponseActions } = await import('@/services/responseActionService.fixtures');
    return fixtureResponseActions;
  }
  try {
    const actions = await apiClient.get<ResponseActionCatalogDTO[]>('/response/actions', { signal });
    return actions.map(normalizeAction);
  } catch {
    // Fail closed: no invented catalogue URL; return empty so UI shows unavailable honesty.
    return [];
  }
}
