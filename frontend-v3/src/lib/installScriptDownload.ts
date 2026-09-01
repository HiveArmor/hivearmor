/**
 * Client-side script download helpers for Add Agent install scripts.
 * Secrets stay in memory only — never localStorage.
 */

/** Sanitize alias for use in a download filename. */
export function sanitizeInstallScriptFilename(alias: string): string {
  const sanitized = alias
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'agent';
}

export function installScriptDownloadFilename(alias: string, platform: 'linux' | 'windows'): string {
  const base = sanitizeInstallScriptFilename(alias);
  return platform === 'linux' ? `hivearmor-install-${base}.sh` : `hivearmor-install-${base}.ps1`;
}

/** Trigger a one-time download of script text as a file attachment. */
export function downloadInstallScript(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
