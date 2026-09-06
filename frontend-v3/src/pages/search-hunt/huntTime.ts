/**
 * Relative time for hunt event rows. Unlike threatIntelFreshness (which caps at
 * >30d and renders "Never" for feed freshness), an event always has a real
 * timestamp, so this formats a plain "Ns/Nm/Nh/Nd/…" ago and keeps going to
 * weeks/months/years. The absolute UTC value is shown alongside (tooltip / second
 * line) for forensic precision.
 */
export function formatRelativeTime(isoString: string, nowMs: number = Date.now()): string {
  const parsed = new Date(isoString).getTime();
  if (Number.isNaN(parsed)) return '—';

  const delta = nowMs - parsed;
  if (delta < -60_000) return 'in the future';
  if (delta < 45_000) return 'just now';

  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/** Absolute UTC display, e.g. "2026-09-06 10:44:30 UTC". */
export function formatAbsoluteUtc(isoString: string): string {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace('Z', ' UTC');
}
