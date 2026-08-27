/**
 * Entities Service — API client for entity endpoints.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  EntityAlertDTO,
  EntityDetailDTO,
  EntityDTO,
  EntityEventDTO,
  EntityListFilters,
  EntityListResponse,
  EntityRiskLevel,
  EntityRiskTrend,
} from '@/types/entity.types';

export const entityFixtureMode = import.meta.env.DEV
  && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/**
 * Fetch paginated entity list with filters
 */
export async function fetchEntities(
  filters: EntityListFilters = {},
  signal?: AbortSignal,
): Promise<EntityListResponse> {
  if (entityFixtureMode) {
    const { getFoundationEntities } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntities(filters, signal);
  }

  const {
    type, types, riskMin, riskMax, riskLevels, search, activityWindow = '30d',
    tenantScope = 'authorized', sort = 'risk_desc', cursor, limit = 100,
    fields, page = 0,
  } = filters;

  const response = await apiClient.get<EntityListResponse | EntityDTO[]>('/ha-entities', {
    signal,
    params: {
      type,
      types,
      riskMin,
      riskMax,
      riskLevels,
      search,
      activityWindow,
      tenantScope,
      sort,
      cursor: cursor ?? undefined,
      limit,
      fields,
      page,
      size: limit,
    },
  });

  if (Array.isArray(response)) {
    return {
      items: response,
      nextCursor: null,
      hasMore: response.length === limit,
      snapshotAt: null,
      totalApproximate: response.length,
      totalIsExact: false,
      summary: null,
      partialFailures: [{ source: 'entity-inventory', message: 'Legacy list projection: server facets, cursor and freshness are unavailable.' }],
      contractState: 'legacy',
    };
  }

  return response;
}

/**
 * Fetch entity detail by ID — uses /dossier (bare /{id} is unmapped → 500).
 */
export async function fetchEntityDetail(id: string, signal?: AbortSignal): Promise<EntityDetailDTO> {
  if (entityFixtureMode) {
    const { getFoundationEntityDetail } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityDetail(id);
  }
  const response = await apiClient.get<{
    dossier?: {
      identity?: {
        id?: string;
        type?: string;
        value?: string;
        displayName?: string;
        firstSeen?: string;
        lastSeen?: string;
        criticality?: string;
        tags?: string[];
      };
      riskProfile?: {
        score?: number;
        level?: EntityRiskLevel;
        trend?: EntityRiskTrend;
        drivers?: Array<{ id?: string; description?: string; contribution?: number; category?: string }>;
      };
    };
  }>(`/ha-entities/${encodeURIComponent(id)}/dossier`, { signal, params: { window: 30 } });

  const identity = response.dossier?.identity;
  const risk = response.dossier?.riskProfile;
  const name = identity?.displayName || identity?.value || id;
  const rawTrend = risk?.trend as string | undefined;
  const riskTrend: EntityRiskTrend | undefined =
    rawTrend === 'declining' || rawTrend === 'falling'
      ? 'falling'
      : rawTrend === 'rising' || rawTrend === 'stable' || rawTrend === 'new'
        ? rawTrend
        : undefined;
  return {
    id: identity?.id || id,
    name,
    entityType: (identity?.type as EntityDetailDTO['entityType']) || 'host',
    riskScore: risk?.score ?? 0,
    riskLevel: risk?.level,
    riskTrend,
    criticality: identity?.criticality as EntityDetailDTO['criticality'],
    firstSeen: identity?.firstSeen,
    lastSeen: identity?.lastSeen || new Date().toISOString(),
    alertCount: 0,
    tags: identity?.tags,
    riskDrivers: risk?.drivers?.map((driver, index) => ({
      id: driver.id || `driver-${index}`,
      label: driver.category || driver.description || 'Risk driver',
      description: driver.description || '',
      contribution: driver.contribution ?? 0,
      source: 'dossier',
      evidenceCount: 0,
    })),
    dataCompleteness: 'core',
  };
}

/**
 * Fetch alerts associated with an entity
 */
export async function fetchEntityAlerts(id: string, signal?: AbortSignal): Promise<EntityAlertDTO[]> {
  if (entityFixtureMode) {
    const { getFoundationEntityAlerts } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityAlerts(id);
  }
  const response = await apiClient.get<EntityAlertDTO[] | { items?: EntityAlertDTO[] }>(
    `/ha-entities/${encodeURIComponent(id)}/alerts`,
    { signal, params: { limit: 50 } },
  );
  if (Array.isArray(response)) return response;
  return response.items ?? [];
}

/**
 * Fetch activity events for an entity — uses /activity (bare /events is unmapped → 500).
 */
export async function fetchEntityEvents(id: string, signal?: AbortSignal): Promise<EntityEventDTO[]> {
  if (entityFixtureMode) {
    const { getFoundationEntityEvents } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityEvents(id);
  }
  const response = await apiClient.get<{
    items?: Array<{
      id?: string;
      timestamp?: string;
      source?: string;
      description?: string;
      severity?: string;
      type?: string;
    }>;
  }>(`/ha-entities/${encodeURIComponent(id)}/activity`, { signal, params: { limit: 100 } });

  return (response.items ?? []).map((item, index) => ({
    id: item.id ?? `event-${index}`,
    timestamp: item.timestamp ?? new Date().toISOString(),
    source: item.source ?? item.type ?? 'activity',
    message: item.description ?? item.type ?? 'Observed activity',
    severity: item.severity as EntityEventDTO['severity'],
    action: item.type,
  }));
}

/** Risk projection from dossier core (bare /risk is unmapped → 500). */
export interface EntityRiskDTO {
  id?: string;
  riskScore?: number;
  riskLevel?: EntityRiskLevel;
  riskTrend?: EntityRiskTrend;
  riskDrivers?: Array<{ id?: string; label?: string; contribution?: number; description?: string }>;
  topAlertCategories?: string[];
  lastCalculated?: string | null;
}

/**
 * Fetch risk detail for an entity via dossier projection.
 */
export async function fetchEntityRisk(id: string, signal?: AbortSignal): Promise<EntityRiskDTO> {
  const detail = await fetchEntityDetail(id, signal);
  return {
    id: detail.id,
    riskScore: detail.riskScore,
    riskLevel: detail.riskLevel,
    riskTrend: detail.riskTrend,
    riskDrivers: detail.riskDrivers?.map((driver) => ({
      id: driver.id,
      label: driver.label,
      contribution: driver.contribution,
      description: driver.description,
    })),
    lastCalculated: detail.riskCalculatedAt ?? null,
  };
}

/**
 * Attach entity to an incident
 */
export async function attachEntityToIncident(
  incidentId: number,
  entityId: string
): Promise<void> {
  return apiClient.post(`/ha-incidents/${incidentId}/entities`, { entityId });
}
