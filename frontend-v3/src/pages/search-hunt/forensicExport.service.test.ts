/**
 * B0-4 — forensic export service tests.
 *
 * Proves: export POSTs the committed filters + chosen format, downloads the streamed Blob, reads
 * X-Export-Id (case-insensitively), fetches the manifest, and surfaces the SHA-256 hash + count.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportAlertResults, exportHuntResults, fetchExportManifest } from './forensicExport.service';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

const clickSpy = vi.fn();
const createObjectURL = vi.fn(() => 'blob:mock');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
  clickSpy.mockReset();
  // jsdom lacks URL.createObjectURL / anchor download plumbing.
  (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function streamResponse(headers: Record<string, string>): Response {
  return {
    ok: true,
    headers: new Headers(headers),
    blob: async () => new Blob(['row-1\nrow-2\n'], { type: 'text/csv' }),
  } as unknown as Response;
}

function manifestResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

describe('exportHuntResults', () => {
  it('POSTs the committed hunt query + format, downloads the blob, reads X-Export-Id, and surfaces the hash', async () => {
    localStorage.setItem('hivearmor_auth_token', 'jwt-abc');
    mockFetch
      .mockResolvedValueOnce(
        streamResponse({
          'x-export-id': 'exp-123',
          'Content-Disposition': 'attachment; filename="hunt-2026.csv"',
        }),
      )
      .mockResolvedValueOnce(
        manifestResponse({ export_id: 'exp-123', sha256: 'a'.repeat(64), record_count: 12345 }),
      );

    const result = await exportHuntResults(
      {
        query: 'event.category:auth',
        language: 'kql',
        timeRange: { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' },
        tenantScope: 'authorized',
        indexPattern: 'v3-hive-alert-*',
        columns: ['@timestamp', 'host'],
      },
      'csv',
    );

    // First call: streamed export POST with committed body + format + JWT.
    const [streamUrl, streamInit] = mockFetch.mock.calls[0];
    expect(streamUrl).toBe('/api/ha-hunts/search/export');
    expect(streamInit.method).toBe('POST');
    expect((streamInit.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
    const sentBody = JSON.parse(streamInit.body as string);
    expect(sentBody.query).toBe('event.category:auth');
    expect(sentBody.format).toBe('csv');
    expect(sentBody.timeRange).toEqual({ from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' });

    // Second call: manifest GET keyed by the returned export id.
    expect(mockFetch.mock.calls[1][0]).toBe('/api/ha-hunts/search/export/exp-123/manifest');

    // Blob download fired, hash + count surfaced.
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(result.exportId).toBe('exp-123');
    expect(result.sha256).toBe('a'.repeat(64));
    expect(result.recordCount).toBe(12345);
    expect(result.filename).toBe('hunt-2026.csv');
  });

  it('falls back gracefully when no export id header is present (no fabricated hash)', async () => {
    mockFetch.mockResolvedValueOnce(streamResponse({}));

    const result = await exportHuntResults(
      {
        query: 'x',
        language: 'kql',
        timeRange: { from: 'a', to: 'b' },
        tenantScope: 'authorized',
      },
      'ndjson',
    );

    expect(mockFetch).toHaveBeenCalledTimes(1); // no manifest call
    expect(result.exportId).toBe('');
    expect(result.sha256).toBe('');
    expect(result.filename).toMatch(/\.ndjson$/);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

describe('exportAlertResults', () => {
  it('POSTs the committed alert filters and hits the alert export endpoints', async () => {
    mockFetch
      .mockResolvedValueOnce(streamResponse({ 'X-Export-Id': 'exp-alert-9' }))
      .mockResolvedValueOnce(
        manifestResponse({ export_id: 'exp-alert-9', sha256: 'b'.repeat(64), record_count: 42 }),
      );

    const result = await exportAlertResults(
      { filters: { status: 'open', severity: 'critical' }, columns: ['mitreTechniqueId'] },
      'ndjson',
    );

    const [streamUrl, streamInit] = mockFetch.mock.calls[0];
    expect(streamUrl).toBe('/api/ha-alerts/export');
    const body = JSON.parse(streamInit.body as string);
    expect(body.filters).toEqual({ status: 'open', severity: 'critical' });
    expect(body.format).toBe('ndjson');
    expect((streamInit.headers as Record<string, string>).Accept).toBe('application/x-ndjson');

    expect(mockFetch.mock.calls[1][0]).toBe('/api/ha-alerts/export/exp-alert-9/manifest');
    expect(result.sha256).toBe('b'.repeat(64));
    expect(result.recordCount).toBe(42);
  });
});

describe('fetchExportManifest', () => {
  it('GETs the manifest for a surface + id', async () => {
    mockFetch.mockResolvedValueOnce(manifestResponse({ export_id: 'exp-7', sha256: 'c'.repeat(64) }));
    const manifest = await fetchExportManifest('hunt-search', 'exp-7');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/ha-hunts/search/export/exp-7/manifest');
    expect(manifest.sha256).toBe('c'.repeat(64));
  });
});
