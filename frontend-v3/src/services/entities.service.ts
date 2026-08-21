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
 * Fetch entity detail by ID
 */
export async function fetchEntityDetail(id: string, signal?: AbortSignal): Promise<EntityDetailDTO> {
  if (entityFixtureMode) {
    const { getFoundationEntityDetail } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityDetail(id);
  }
  return apiClient.get<EntityDetailDTO>(`/ha-entities/${id}`, { signal });
}

/**
 * Fetch alerts associated with an entity
 */
export async function fetchEntityAlerts(id: string, signal?: AbortSignal): Promise<EntityAlertDTO[]> {
  if (entityFixtureMode) {
    const { getFoundationEntityAlerts } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityAlerts(id);
  }
  return apiClient.get<EntityAlertDTO[]>(`/ha-entities/${id}/alerts`, { signal, params: { size: 50 } });
}

/**
 * Fetch raw events for an entity
 */
export async function fetchEntityEvents(id: string, signal?: AbortSignal): Promise<EntityEventDTO[]> {
  if (entityFixtureMode) {
    const { getFoundationEntityEvents } = await import('@/pages/entities/entities.fixtures');
    return getFoundationEntityEvents(id);
  }
  return apiClient.get<EntityEventDTO[]>(`/ha-entities/${id}/events`, { signal, params: { size: 100 } });
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
