/**
 * B0-4 — Forensic / Result Export (frontend contract types).
 *
 * Chain-of-custody export for hunt-search results and the alert inventory. Every export streams a
 * file (CSV or NDJSON) and, in a second call, resolves a manifest carrying the SHA-256 of the exact
 * bytes delivered plus who/when/query/tenant/count — the record an analyst attests to.
 *
 * No `any`, no hex — tokens/services enforce the rest. See .plan/specs/B0-4-forensic-export.md §5, §7.
 */

/** Export surfaces that own an endpoint pair. */
export type ExportSurface = 'hunt-search' | 'alert-list';

/** Streamed export payload formats (v1). */
export type ExportFormat = 'csv' | 'ndjson';

/**
 * Chain-of-custody manifest — the finalized record fetched after the stream completes.
 * Fields beyond the core set are optional so a slightly different backend shape does not break the
 * client (the parent reconciles); unknown extra keys are tolerated via the index signature.
 */
export interface ExportManifest {
  export_id: string;
  exported_by?: string;
  exported_at?: string;
  tenant?: string;
  surface?: string;
  format?: ExportFormat | string;
  index_pattern?: string;
  record_count?: number;
  /** Hex SHA-256 digest of the exported payload bytes. */
  sha256: string;
  product?: string;
  schema_version?: string;
  query?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Request body for a hunt-search export. Mirrors the committed hunt query/filters/timeRange so the
 * FULL result set is exported, not just the visible page.
 */
export interface HuntExportRequest {
  query: string;
  language: 'kql';
  timeRange: { from: string; to: string };
  tenantScope: string;
  indexPattern?: string;
  columns?: string[];
  format: ExportFormat;
}

/** Request body for an alert-list export — the committed alert-queue filter model. */
export interface AlertExportRequest {
  filters: Record<string, string>;
  columns?: string[];
  format: ExportFormat;
}

/**
 * Result surfaced back to the analyst after a successful export: the manifest id, the SHA-256 (for
 * attestation + copy), the record count, and the downloaded filename.
 */
export interface ExportResult {
  exportId: string;
  sha256: string;
  recordCount: number | null;
  filename: string;
  format: ExportFormat;
  surface: ExportSurface;
}
