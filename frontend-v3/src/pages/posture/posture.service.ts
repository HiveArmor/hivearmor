/**
 * Posture Service — Assets & Identities
 * Security-critical: production assets come only from the canonical credential-free /ha-assets projection.
 */

import type { AssetDTO, AssetDetailResponse, AssetFilters, AssetListResponse } from './posture.types';

import { apiClient } from '@/lib/apiClient';

// ===== ASSETS =====

interface RawAssetResponse {
  id: number;
  clientName: string;
  clientDomain: string;
  clientPrefix: string;
  clientMail?: string | null;
  clientLicenceExpire?: string | null;
  clientLicenceVerified?: boolean;
  connectionStatus?: 'ACTIVE' | 'INACTIVE' | 'UNREACHABLE' | 'UNKNOWN';
  lastSeen?: string | null;
  agentVersion?: string | null;
  platform?: 'windows' | 'linux' | 'macos' | 'other' | null;
  osVersion?: string | null;
  ipAddress?: string | null;
  canonicalEntityId?: string | null;
  category?: AssetDTO['category'];
  deviceRole?: string | null;
  criticality?: AssetDTO['criticality'];
  riskLevel?: AssetDTO['riskLevel'];
  riskScore?: number | null;
  exposureLevel?: AssetDTO['exposureLevel'];
  exposureScore?: number | null;
  sensorHealth?: AssetDTO['sensorHealth'];
  onboardingStatus?: AssetDTO['onboardingStatus'];
  activeAlertCount?: number;
  vulnerabilityCount?: number;
  criticalVulnerabilityCount?: number;
  attackPathCount?: number;
  firstSeen?: string | null;
  macAddress?: string | null;
  owner?: string | null;
  ownerTeam?: string | null;
  discoverySources?: string[];
  tags?: string[];
  riskDrivers?: AssetDTO['riskDrivers'];
  recommendations?: AssetDTO['recommendations'];
  coverage?: AssetDTO['coverage'];
  cloudProvider?: AssetDTO['cloudProvider'];
  cloudAccount?: string | null;
  snapshotVersion?: string | null;
}

/** Normalize the canonical safe asset projection for the view model. */
function toAssetDTO(raw: RawAssetResponse): AssetDTO {
  return {
    id: raw.id,
    clientName: raw.clientName,
    clientDomain: raw.clientDomain,
    clientPrefix: raw.clientPrefix,
    clientMail: raw.clientMail ?? null,
    clientLicenceExpire: raw.clientLicenceExpire ?? null,
    clientLicenceVerified: raw.clientLicenceVerified ?? false,
    connectionStatus: raw.connectionStatus,
    lastSeen: raw.lastSeen,
    agentVersion: raw.agentVersion,
    platform: raw.platform,
    osVersion: raw.osVersion,
    ipAddress: raw.ipAddress,
    canonicalEntityId: raw.canonicalEntityId,
    category: raw.category,
    deviceRole: raw.deviceRole,
    criticality: raw.criticality,
    riskLevel: raw.riskLevel,
    riskScore: raw.riskScore,
    exposureLevel: raw.exposureLevel,
    exposureScore: raw.exposureScore,
    sensorHealth: raw.sensorHealth,
    onboardingStatus: raw.onboardingStatus,
    activeAlertCount: raw.activeAlertCount ?? 0,
    vulnerabilityCount: raw.vulnerabilityCount ?? 0,
    criticalVulnerabilityCount: raw.criticalVulnerabilityCount ?? 0,
    attackPathCount: raw.attackPathCount ?? 0,
    firstSeen: raw.firstSeen,
    macAddress: raw.macAddress,
    owner: raw.owner,
    ownerTeam: raw.ownerTeam,
    discoverySources: raw.discoverySources ?? [],
    tags: raw.tags ?? [],
    riskDrivers: raw.riskDrivers ?? [],
    recommendations: raw.recommendations ?? [],
    coverage: raw.coverage ?? [],
    cloudProvider: raw.cloudProvider,
    cloudAccount: raw.cloudAccount,
    snapshotVersion: raw.snapshotVersion,
  };
}

export const assetFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

export async function fetchAssets(
  filters: AssetFilters,
  page: number,
  size: number,
  sort?: string,
  cursor?: string | null
): Promise<AssetListResponse> {
  if (assetFixtureMode) {
    const { getFoundationAssetPage } = await import('@/pages/posture/assets/assets.fixtures');
    return getFoundationAssetPage(filters, page, size, sort);
  }
  const params: Record<string, string | number | string[] | undefined> = {
    page,
    limit: size,
    cursor: cursor ?? undefined,
    sort,
    search: filters.q,
    category: filters.category && filters.category !== 'all' ? filters.category : undefined,
    riskLevel: filters.riskLevel && filters.riskLevel !== 'all' ? filters.riskLevel : undefined,
    exposureLevel: filters.exposureLevel && filters.exposureLevel !== 'all' ? filters.exposureLevel : undefined,
    sensorHealth: filters.sensorHealth && filters.sensorHealth !== 'all' ? filters.sensorHealth : undefined,
    onboarding: filters.onboardingStatus && filters.onboardingStatus !== 'all' ? filters.onboardingStatus : undefined,
    tenantScope: 'authorized',
  };

  const response = await apiClient.get<RawAssetResponse[] | {
    content: RawAssetResponse[];
    nextCursor?: string | null;
    hasMore?: boolean;
    totalElements?: number;
    totalPages?: number;
    number?: number;
    summary?: AssetListResponse['summary'];
    snapshotAt?: string;
    stale?: boolean;
    partialFailures?: AssetListResponse['partialFailures'];
  }>('/ha-assets', { params });
  const records = Array.isArray(response) ? response : response.content;

  return {
    content: records.map(toAssetDTO),
    nextCursor: Array.isArray(response) ? null : response.nextCursor ?? null,
    hasMore: Array.isArray(response) ? false : response.hasMore ?? false,
    totalElements: Array.isArray(response) ? records.length : response.totalElements ?? records.length,
    totalPages: Array.isArray(response) ? Math.ceil(records.length / size) : response.totalPages ?? Math.ceil(records.length / size),
    number: Array.isArray(response) ? page : response.number ?? page,
    summary: Array.isArray(response) ? undefined : response.summary,
    snapshotAt: Array.isArray(response) ? undefined : response.snapshotAt,
    stale: Array.isArray(response) ? false : response.stale,
    partialFailures: Array.isArray(response) ? [] : response.partialFailures,
  };
}

export async function fetchAssetDetail(id: number): Promise<AssetDTO> {
  const response = await apiClient.get<{
    asset: RawAssetResponse;
    aliases?: string[];
    riskDrivers?: AssetDetailResponse['riskDrivers'];
    recommendations?: AssetDetailResponse['recommendations'];
    coverage?: AssetDetailResponse['coverage'];
  }>(`/ha-assets/${id}`);
  return {
    ...toAssetDTO(response.asset),
    riskDrivers: response.riskDrivers ?? [],
    recommendations: response.recommendations ?? [],
    coverage: response.coverage ?? [],
  };
}

// Identity posture uses `@/pages/posture/identities/identity.service.ts`.
// Dead helpers that called non-canonical /ha-entities/{id}/risk were removed (B2-ID-02).
