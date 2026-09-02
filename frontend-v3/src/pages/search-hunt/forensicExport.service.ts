/**
 * B0-4 — Forensic / Result Export service.
 *
 * apiClient only does JSON, so streamed file downloads use a `fetch` helper that ROUTES THROUGH THE
 * SAME `/api` PROXY and injects the JWT + X-Tenant-ID exactly the way apiClient does. Token/tenant
 * are read here in the service layer (never in a component) — see .plan/specs/B0-4-forensic-export.md §7.
 *
 * Flow per export (spec §5, delivery option A):
 *   1. POST the committed query/filters → streamed Blob → browser download.
 *   2. Read X-Export-Id from the response headers (case-insensitive; graceful fallback).
 *   3. GET the manifest → return { exportId, sha256, recordCount, filename }.
 */

import type {
  AlertExportRequest,
  ExportFormat,
  ExportManifest,
  ExportResult,
  ExportSurface,
  HuntExportRequest,
} from './forensicExport.types';

import { useAuthStore } from '@/store/auth.store';

const TOKEN_KEY = 'hivearmor_auth_token';
const BASE_PATH = '/api';

/** Endpoints per surface — POST streams the file, GET(id) resolves the manifest. */
const EXPORT_ENDPOINTS: Record<ExportSurface, { stream: string; manifest: (id: string) => string }> = {
  'hunt-search': {
    stream: '/ha-hunts/search/export',
    manifest: (id) => `/ha-hunts/search/export/${encodeURIComponent(id)}/manifest`,
  },
  'alert-list': {
    stream: '/ha-alerts/export',
    manifest: (id) => `/ha-alerts/export/${encodeURIComponent(id)}/manifest`,
  },
};

const CONTENT_TYPE_BY_FORMAT: Record<ExportFormat, string> = {
  csv: 'text/csv',
  ndjson: 'application/x-ndjson',
};

/** Mirror apiClient auth: bearer token + X-Tenant-ID when a tenant is selected. */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const { selectedTenantId } = useAuthStore.getState();
  if (selectedTenantId !== null) headers['X-Tenant-ID'] = String(selectedTenantId);
  return headers;
}

/** Read a header case-insensitively (defensive: backend header casing may vary). */
function readHeader(headers: Headers, name: string): string | null {
  const direct = headers.get(name);
  if (direct !== null) return direct;
  const lower = name.toLowerCase();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

/** Parse a filename from Content-Disposition, else fall back to a sensible timestamped default. */
function resolveFilename(
  headers: Headers,
  surface: ExportSurface,
  format: ExportFormat,
): string {
  const disposition = readHeader(headers, 'Content-Disposition');
  if (disposition) {
    // RFC 6266: filename*=UTF-8''... takes precedence over plain filename=...
    const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
    if (extended?.[1]) {
      try {
        return decodeURIComponent(extended[1].replace(/^["']|["']$/g, ''));
      } catch {
        // fall through to plain form
      }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition);
    if (plain?.[1]) return plain[1];
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `hivearmor-${surface}-${stamp}.${format}`;
}

/** Trigger a browser download of a Blob under the given filename. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the click has consumed the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Fetch the finalized chain-of-custody manifest for a completed export. */
export async function fetchExportManifest(
  surface: ExportSurface,
  exportId: string,
  signal?: AbortSignal,
): Promise<ExportManifest> {
  const response = await fetch(`${BASE_PATH}${EXPORT_ENDPOINTS[surface].manifest(exportId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...authHeaders() },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Export manifest request failed with HTTP ${response.status}`);
  }
  return (await response.json()) as ExportManifest;
}

/** Shared streamed-export core used by both surfaces. */
async function runExport(
  surface: ExportSurface,
  body: HuntExportRequest | AlertExportRequest,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const response = await fetch(`${BASE_PATH}${EXPORT_ENDPOINTS[surface].stream}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: CONTENT_TYPE_BY_FORMAT[format],
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Export request failed with HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const filename = resolveFilename(response.headers, surface, format);
  triggerDownload(blob, filename);

  const exportId = readHeader(response.headers, 'X-Export-Id');
  if (!exportId) {
    // File downloaded, but no manifest handle — surface honestly rather than fabricate a hash.
    return { exportId: '', sha256: '', recordCount: null, filename, format, surface };
  }

  let sha256 = '';
  let recordCount: number | null = null;
  try {
    const manifest = await fetchExportManifest(surface, exportId, signal);
    sha256 = manifest.sha256 ?? '';
    recordCount = typeof manifest.record_count === 'number' ? manifest.record_count : null;
  } catch {
    // Manifest fetch failed — keep the export id so the analyst can still retrieve it later.
  }

  return { exportId, sha256, recordCount, filename, format, surface };
}

/** Export the FULL committed hunt-search result set as CSV or NDJSON. */
export async function exportHuntResults(
  params: Omit<HuntExportRequest, 'format'>,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<ExportResult> {
  return runExport('hunt-search', { ...params, format }, format, signal);
}

/** Export the FULL committed alert inventory as CSV or NDJSON. */
export async function exportAlertResults(
  params: Omit<AlertExportRequest, 'format'>,
  format: ExportFormat,
  signal?: AbortSignal,
): Promise<ExportResult> {
  return runExport('alert-list', { ...params, format }, format, signal);
}
