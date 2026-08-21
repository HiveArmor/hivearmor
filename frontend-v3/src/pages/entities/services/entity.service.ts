/**
 * Entity Intelligence Service — Sprint 45 (ENT-001 through ENT-003)
 * API client functions for the entity inventory, summary/facets, and preview endpoints.
 */

import { getFoundationPreview, getFoundationSummary, listFoundationEntities } from '../entityFoundationAdapter';
import type {
  EntityListFilters,
  EntityListResponse,
  EntityPreviewResponse,
  EntitySummaryResponse,
} from '../types/entity.types';

import { apiClient } from '@/lib/apiClient';

const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';


/**
 * ENT-001: Fetch paginated entity inventory with multi-dimensional filtering.
 */
export async function listEntities(
  filters: EntityListFilters = {},
  signal?: AbortSignal,
): Promise<EntityListResponse> {
  if (visualFixtureMode) return listFoundationEntities(filters, signal);
  const params: Record<string, string | number | boolean | undefined> = {};

  if (filters.types?.length) {
    params.types = filters.types.join(',');
  }
  if (filters.riskLevels?.length) {
    params.riskLevels = filters.riskLevels.join(',');
  }
  if (filters.criticality?.length) {
    params.criticality = filters.criticality.join(',');
  }
  if (filters.sort) {
    params.sort = filters.sort;
  }
  if (filters.cursor) {
    params.cursor = filters.cursor;
  }
  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }
  if (filters.q) {
    params.q = filters.q;
  }
  if (filters.alertsActive !== undefined) {
    params.alertsActive = filters.alertsActive;
  }
  if (filters.trendRising !== undefined) {
    params.trendRising = filters.trendRising;
  }

  return apiClient.get<EntityListResponse>('/ha-entities', { signal, params });
}

/**
 * ENT-002: Fetch summary statistics and facet counts for the entity inventory.
 * Accepts the same filters as the listing for narrowing facets.
 */
export async function getEntitySummary(
  filters: EntityListFilters = {},
  signal?: AbortSignal,
): Promise<EntitySummaryResponse> {
  if (visualFixtureMode) return getFoundationSummary(filters, signal);
  const params: Record<string, string | number | boolean | undefined> = {};

  if (filters.types?.length) {
    params.types = filters.types.join(',');
  }
  if (filters.riskLevels?.length) {
    params.riskLevels = filters.riskLevels.join(',');
  }
  if (filters.criticality?.length) {
    params.criticality = filters.criticality.join(',');
  }
  if (filters.q) {
    params.q = filters.q;
  }
  if (filters.alertsActive !== undefined) {
    params.alertsActive = filters.alertsActive;
  }
  if (filters.trendRising !== undefined) {
    params.trendRising = filters.trendRising;
  }

  return apiClient.get<EntitySummaryResponse>('/ha-entities/summary', { signal, params });
}

/**
 * ENT-003: Fetch lightweight entity preview for hover cards and contextual panels.
 */
export async function getEntityPreview(
  entityId: string,
  signal?: AbortSignal,
): Promise<EntityPreviewResponse> {
  if (visualFixtureMode) return getFoundationPreview(entityId, signal);
  return apiClient.get<EntityPreviewResponse>(
    `/ha-entities/${encodeURIComponent(entityId)}/preview`,
    { signal },
  );
}
