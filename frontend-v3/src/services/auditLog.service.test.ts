/**
 * auditLog.service tests — export download wiring
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadAuditLogExport } from './auditLog.service';

describe('downloadAuditLogExport', () => {
  const fetchMock = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendedAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fetchMock.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    localStorage.setItem('hivearmor_auth_token', 'test-jwt');
    clickSpy = vi.fn();
    appendedAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockReturnValue(appendedAnchor as unknown as HTMLAnchorElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.removeItem('hivearmor_auth_token');
  });

  it('GETs /api/ha-audit-log/export with bearer token and triggers download', async () => {
    const blob = new Blob(['{"id":"1"}\n'], { type: 'application/x-ndjson' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
      headers: {
        get: (name: string) =>
          name === 'Content-Disposition'
            ? 'attachment; filename="ha-audit-log-123.ndjson"'
            : null,
      },
    });

    await downloadAuditLogExport({ from: '2026-08-01', to: '2026-08-23', action: 'login' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ha-audit-log/export?from=2026-08-01&to=2026-08-23&action=login',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt',
          Accept: 'application/x-ndjson',
        }),
      }),
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(appendedAnchor.download).toBe('ha-audit-log-123.ndjson');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('throws a clear error when export returns non-OK', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      blob: vi.fn(),
      headers: { get: () => null },
    });

    await expect(downloadAuditLogExport()).rejects.toThrow(/HTTP 403/);
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
