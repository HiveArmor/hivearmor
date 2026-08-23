/**
 * Audit log API — list + ADMIN-only NDJSON export (safe fields, no payload).
 */

const TOKEN_KEY = 'hivearmor_auth_token';

export interface AuditLogExportParams {
  from?: string;
  to?: string;
  action?: string;
  user?: string;
}

function buildExportUrl(params: AuditLogExportParams): string {
  const url = new URL('/api/ha-audit-log/export', window.location.origin);
  if (params.from) url.searchParams.set('from', params.from);
  if (params.to) url.searchParams.set('to', params.to);
  if (params.action) url.searchParams.set('action', params.action);
  if (params.user) url.searchParams.set('user', params.user);
  return url.pathname + url.search;
}

function parseFilename(contentDisposition: string): string | null {
  const match = /filename="([^"]+)"/.exec(contentDisposition);
  return match !== null ? match[1] : null;
}

/**
 * Downloads GET /api/ha-audit-log/export as an NDJSON attachment.
 * JWT stays in Authorization header only.
 */
export async function downloadAuditLogExport(params: AuditLogExportParams = {}): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const response = await fetch(buildExportUrl(params), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/x-ndjson',
    },
  });

  if (!response.ok) {
    throw new Error(`Audit export failed (HTTP ${String(response.status)})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = parseFilename(disposition) ?? 'ha-audit-log.ndjson';
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
