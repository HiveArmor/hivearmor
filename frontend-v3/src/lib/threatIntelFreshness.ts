/**
 * Bounded relative timestamps for threat-intel feed freshness (TI-004).
 *
 * Caps display at ">30d" so Admin Last Sync never invents unbounded day counts.
 * Invalid / null ISO values render as "Never". Future skew within 60s → "just now".
 */

const MAX_BOUNDED_DAYS = 30;

export function formatBoundedRelativeTime(
  isoString: string | null,
  nowMs: number = Date.now(),
): string {
  if (!isoString) return 'Never';
  const parsed = new Date(isoString).getTime();
  if (Number.isNaN(parsed)) return 'Never';

  const delta = nowMs - parsed;
  if (delta < -60_000) return 'Never';
  if (delta < 60_000) return 'just now';

  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= MAX_BOUNDED_DAYS) return `${days}d ago`;
  return `>${MAX_BOUNDED_DAYS}d`;
}
