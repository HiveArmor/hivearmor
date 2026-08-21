/**
 * Entity Dossier Service — Sprint 46 (ENT-006 through ENT-010)
 * API client functions for the entity dossier, activity timeline,
 * related alerts, relationships, and incident linking endpoints.
 */

import {
  executeFoundationIncidentLink,
  getFoundationActivity,
  getFoundationAlerts,
  getFoundationDossier,
  getFoundationRelationships,
  previewFoundationIncidentLink,
} from '../entityFoundationAdapter';
import type {
  ActivityFilters,
  ActivityResponse,
  DossierResponse,
  IncidentLinkExecuteRequest,
  IncidentLinkPreview,
  IncidentLinkPreviewRequest,
  IncidentLinkResult,
  RelatedAlertsFilters,
  RelatedAlertsResponse,
  RelationshipsFilters,
  RelationshipsResponse,
} from '../types/dossier.types';

import { apiClient } from '@/lib/apiClient';

const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';


/**
 * ENT-006: Fetch the full entity dossier (identity, risk, baseline, sources, techniques).
 * @param window - Time window string like "30d" or "90d" (days suffix stripped for API).
 */
export async function getDossier(
  entityId: string,
  window = '30d',
  signal?: AbortSignal,
): Promise<DossierResponse> {
  if (visualFixtureMode) return getFoundationDossier(entityId, signal);
  // Backend accepts window as integer (days) — strip the "d" suffix
  const windowDays = window === '24h' ? 1 : parseInt(window.replace(/\D/g, ''), 10) || 30;
  return apiClient.get<DossierResponse>(
    `/ha-entities/${encodeURIComponent(entityId)}/dossier`,
    { signal, params: { window: windowDays } },
  );
}

/**
 * ENT-007: Fetch paginated activity timeline for an entity.
 * Uses PIT-based cursor pagination for consistency.
 */
export async function getActivity(
  entityId: string,
  filters: ActivityFilters = {},
  signal?: AbortSignal,
): Promise<ActivityResponse> {
  if (visualFixtureMode) return getFoundationActivity(entityId, filters.cursor, signal);
  const params: Record<string, string | number | undefined> = {};

  if (filters.cursor) {
    params.cursor = filters.cursor;
  }
  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }
  if (filters.types?.length) {
    params.types = filters.types.join(',');
  }
  if (filters.from) {
    params.from = filters.from;
  }
  if (filters.to) {
    params.to = filters.to;
  }

  return apiClient.get<ActivityResponse>(
    `/ha-entities/${encodeURIComponent(entityId)}/activity`,
    { signal, params },
  );
}

/**
 * ENT-008: Fetch related alerts for an entity with filtering.
 */
export async function getRelatedAlerts(
  entityId: string,
  filters: RelatedAlertsFilters = {},
  signal?: AbortSignal,
): Promise<RelatedAlertsResponse> {
  if (visualFixtureMode) return getFoundationAlerts(entityId, filters.cursor, signal);
  const params: Record<string, string | number | undefined> = {};

  if (filters.cursor) {
    params.cursor = filters.cursor;
  }
  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }
  if (filters.severity?.length) {
    params.severity = filters.severity.join(',');
  }
  if (filters.status?.length) {
    params.status = filters.status.join(',');
  }
  if (filters.from) {
    params.from = filters.from;
  }
  if (filters.to) {
    params.to = filters.to;
  }

  return apiClient.get<RelatedAlertsResponse>(
    `/ha-entities/${encodeURIComponent(entityId)}/alerts`,
    { signal, params },
  );
}

/**
 * ENT-009: Fetch entity relationships with evidence.
 */
export async function getRelationships(
  entityId: string,
  filters: RelationshipsFilters = {},
  signal?: AbortSignal,
): Promise<RelationshipsResponse> {
  if (visualFixtureMode) return getFoundationRelationships(entityId, filters.cursor, signal);
  const params: Record<string, string | number | undefined> = {};

  if (filters.cursor) {
    params.cursor = filters.cursor;
  }
  if (filters.limit !== undefined) {
    params.limit = filters.limit;
  }
  if (filters.types?.length) {
    params.types = filters.types.join(',');
  }

  return apiClient.get<RelationshipsResponse>(
    `/ha-entities/${encodeURIComponent(entityId)}/relationships`,
    { signal, params },
  );
}

/**
 * ENT-010: Preview incident linking — shows what will be linked without side effects.
 */
export async function previewIncidentLink(
  entityId: string,
  body: IncidentLinkPreviewRequest,
  signal?: AbortSignal,
): Promise<IncidentLinkPreview> {
  if (visualFixtureMode) return previewFoundationIncidentLink(entityId, body);
  return apiClient.post<IncidentLinkPreview>(
    `/ha-entities/${encodeURIComponent(entityId)}/incident-link/preview`,
    body,
    { signal },
  );
}

/**
 * ENT-010: Execute incident linking — creates or updates an incident.
 */
export async function executeIncidentLink(
  entityId: string,
  body: IncidentLinkExecuteRequest,
): Promise<IncidentLinkResult> {
  if (visualFixtureMode) return executeFoundationIncidentLink(entityId, body);
  return apiClient.post<IncidentLinkResult>(
    `/ha-entities/${encodeURIComponent(entityId)}/incident-link/execute`,
    body,
  );
}
