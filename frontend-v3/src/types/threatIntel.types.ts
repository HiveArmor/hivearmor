/**
 * threatIntel.types.ts — Threat Intelligence types
 */

/**
 * TLP (Traffic Light Protocol) level union type.
 * These are the only valid values per the CISA TLP standard.
 */
export type TlpLevel = 'WHITE' | 'GREEN' | 'AMBER' | 'RED';

export interface ThreatFeedDTO {
  id: string;
  name: string;
  description: string | null;
  sourceType: 'OSINT' | 'Commercial' | 'Internal';
  enabled: boolean;
  lastUpdated: string | null; // ISO 8601
  indicatorCount: number;
  url: string | null;
}

export interface IocBrowserEntryDTO {
  id: number;
  value: string;
  iocType: string;
  threatScore: number;
  classification: string | null;
  country: string | null;
  feedId: string | null;
  lastSeen: string | null; // ISO 8601
  alertCount: number;
  /** TLP level for this IOC */
  tlp: TlpLevel;
  /**
   * True when this IOC's value is restricted (TLP:RED + non-privileged user).
   * When true, iocValue should not be displayed — render "TLP:RED — Restricted".
   */
  restricted: boolean;
}

export interface ThreatIntelSummary {
  iocValue: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  sourceFeed: string | null;
  firstSeen: string | null; // ISO 8601
  lastSeen: string | null; // ISO 8601
  attackTechniques: string[];
}

export interface IocResultDTO {
  value: string;
  iocType: string;
  threatScore: number;
  classification: string | null;
  country: string | null;
  sourceFeeds: Array<Record<string, unknown>>;
  mitreTechniques: Array<Record<string, unknown>>;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface IocLookupResponse {
  detail: IocResultDTO | null;
  summary: ThreatIntelSummary;
}

// ─── T05 Admin UI Types ───────────────────────────────────────────────────────

/** A configured TAXII 2.1 feed source */
export interface TaxiiFeedDTO {
  id: number;
  name: string;
  taxiiUrl: string;
  collectionId: string;
  /** Encrypted key — never sent from client; omitted in GET responses */
  apiKeyEncrypted?: string;
  enabled: boolean;
  lastSyncAt: string | null; // ISO 8601
  lastSyncStatus: string | null;
  lastSyncCount: number;
  createdAt: string | null; // ISO 8601
}

/** Request body for creating/updating a TAXII feed */
export interface TaxiiFeedRequest {
  name: string;
  taxiiUrl: string;
  collectionId: string;
  apiKeyEncrypted?: string;
  enabled: boolean;
}

/** A configured MISP instance feed source */
export interface MispFeedDTO {
  id: number;
  name: string;
  mispUrl: string;
  /** Encrypted key — never sent from client; omitted in GET responses */
  apiKeyEncrypted?: string;
  enabled: boolean;
  filterTags: string | null;
  lastSyncAt: string | null; // ISO 8601
  lastSyncCount: number;
}

/** Request body for creating/updating a MISP feed */
export interface MispFeedRequest {
  name: string;
  mispUrl: string;
  apiKeyEncrypted?: string;
  enabled: boolean;
  filterTags?: string;
}

/** Aggregate IOC stats returned by GET /api/ha-threat-intel/stats */
export interface IocStatsDTO {
  totalActive: number;
  byType: {
    ip: number;
    domain: number;
    hash: number;
    url: number;
    email: number;
  };
  expiredToday: number;
}

/**
 * Thin STAGING CANDIDATE sync receipt from TAXII/MISP sync (TI-004).
 * Not a durable job ledger — receiptId is per-request only.
 */
export interface ThreatFeedSyncReceipt {
  receiptId: string;
  feedId: number;
  sourceType: 'TAXII' | 'MISP';
  lastSyncAt: string | null; // ISO 8601
  status: 'OK' | 'ERROR';
  iocCount: number;
  /** Sanitized failure text; null on OK. Never contains secrets/URLs. */
  failedReason: string | null;
}

