/**
 * dataSources.service.ts — Data Source Status API service.
 *
 * Wraps all /api/ha-inputs/sources endpoints via the shared apiClient.
 * apiClient injects the JWT from localStorage['hivearmor_auth_token'] and
 * routes all requests through the Vite proxy — never use absolute URLs here.
 *
 * Endpoints covered:
 *   GET  /api/ha-inputs/sources     → list all aggregated data source records
 *   POST /api/ha-inputs/sources     → create a new data source
 *
 * Security invariants:
 *   - apiClient handles JWT injection from localStorage['hivearmor_auth_token'].
 *   - No direct localStorage access in this service (Req 13.6).
 *   - No `any` types (Req 13.8).
 *   - All requests are routed through the Vite proxy — no absolute backend URLs.
 *
 * Requirements: 10.1, 10.4, 10.5, 13.6, 13.7, 13.8
 */

import { apiClient } from '@/lib/apiClient';
import type { HaDataSourceCreatePayload, HaDataSourceRecord } from '@/types/dataSource.types';

export const dataSourcesService = {
  /**
   * Fetch the aggregated list of all data source records.
   * Each record combines gRPC agent-manager health with OpenSearch ingest stats.
   * Always returns HTTP 200 — unreachable sources are included with their
   * status fields set to 'unreachable' (Req 9.3).
   * Maps to: GET /api/ha-inputs/sources
   */
  list: (): Promise<HaDataSourceRecord[]> =>
    apiClient.get<HaDataSourceRecord[]>('/ha-inputs/sources'),

  /**
   * Register a new data source.
   * On HTTP 201 the caller should invalidate the 'dataSources' TanStack Query
   * cache key to trigger a re-fetch of the sources list (Req 11.5).
   * Maps to: POST /api/ha-inputs/sources
   */
  create: (payload: HaDataSourceCreatePayload): Promise<HaDataSourceRecord> =>
    apiClient.post<HaDataSourceRecord>('/ha-inputs/sources', payload),
};
