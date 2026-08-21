/**
 * threatIntel.service.ts — Threat Intelligence API
 */

import { apiClient } from '@/lib/apiClient';
import type {
  IocBrowserEntryDTO,
  IocLookupResponse,
  IocStatsDTO,
  MispFeedDTO,
  MispFeedRequest,
  TaxiiFeedDTO,
  TaxiiFeedRequest,
  ThreatFeedDTO,
} from '@/types/threatIntel.types';

export interface IocSearchParams extends Record<string, string | number | undefined> {
  search?: string;
  type?: string;
  feedId?: string;
  page?: number;
  size?: number;
}

export interface IocLookupRequest {
  value: string;
  type?: string;
}

export const threatIntelService = {
  // ─── Existing feed methods ────────────────────────────────────────────────

  listFeeds: () => apiClient.get<ThreatFeedDTO[]>('/ha-threat-intel/feeds'),

  getFeed: (id: string) => apiClient.get<ThreatFeedDTO>(`/ha-threat-intel/feeds/${id}`),

  toggleFeed: (id: string, enabled: boolean) =>
    apiClient.put<ThreatFeedDTO>(`/ha-threat-intel/feeds/${id}`, { enabled }),

  syncFeed: (id: string) => apiClient.post<ThreatFeedDTO>(`/ha-threat-intel/feeds/${id}/sync`),

  searchIocs: (params: IocSearchParams) =>
    apiClient.get<IocBrowserEntryDTO[]>('/ha-threat-intel/iocs', { params }),

  lookupIoc: (request: IocLookupRequest) =>
    apiClient.post<IocLookupResponse>('/ha-threat-intel/lookup', request),

  // ─── T05 TAXII Feed CRUD ──────────────────────────────────────────────────

  listTaxiiFeeds: () =>
    apiClient.get<TaxiiFeedDTO[]>('/ha-threat-intel/taxii-feeds'),

  getTaxiiFeed: (id: number) =>
    apiClient.get<TaxiiFeedDTO>(`/ha-threat-intel/taxii-feeds/${id}`),

  createTaxiiFeed: (body: TaxiiFeedRequest) =>
    apiClient.post<TaxiiFeedDTO>('/ha-threat-intel/taxii-feeds', body),

  updateTaxiiFeed: (id: number, body: TaxiiFeedRequest) =>
    apiClient.put<TaxiiFeedDTO>(`/ha-threat-intel/taxii-feeds/${id}`, body),

  deleteTaxiiFeed: (id: number) =>
    apiClient.delete<void>(`/ha-threat-intel/taxii-feeds/${id}`),

  syncTaxiiFeed: (id: number) =>
    apiClient.post<string>(`/ha-threat-intel/taxii/${id}/sync`),

  // ─── T05 MISP Feed CRUD ───────────────────────────────────────────────────

  listMispFeeds: () =>
    apiClient.get<MispFeedDTO[]>('/ha-threat-intel/misp-feeds'),

  getMispFeed: (id: number) =>
    apiClient.get<MispFeedDTO>(`/ha-threat-intel/misp-feeds/${id}`),

  createMispFeed: (body: MispFeedRequest) =>
    apiClient.post<MispFeedDTO>('/ha-threat-intel/misp-feeds', body),

  updateMispFeed: (id: number, body: MispFeedRequest) =>
    apiClient.put<MispFeedDTO>(`/ha-threat-intel/misp-feeds/${id}`, body),

  deleteMispFeed: (id: number) =>
    apiClient.delete<void>(`/ha-threat-intel/misp-feeds/${id}`),

  syncMispFeed: (id: number) =>
    apiClient.post<string>(`/ha-threat-intel/misp/${id}/sync`),

  // ─── T05 Stats ───────────────────────────────────────────────────────────

  getIocStats: () =>
    apiClient.get<IocStatsDTO>('/ha-threat-intel/stats'),
};

