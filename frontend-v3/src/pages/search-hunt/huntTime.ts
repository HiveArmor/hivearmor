/**
 * huntTime — shared relative-time formatting for hunt event timestamps.
 *
 * Hunt event timestamps are always real (never invented), so a relative rendering
 * ("6m ago", "2h ago") is safe and readable for scanning. The absolute UTC form is
 * always available for the tooltip/title so the exact instant is one hover away, and
 * sorting still runs on the real ISO timestamp — this only affects display.
 */

/** Absolute UTC form, e.g. "2026-09-06 11:40:47 Z". Used for tooltips and the Time column. */
export function formatHuntTimestampUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace('Z', ' Z');
}

/**
 * Relative form, e.g. "just now", "6m ago", "2h ago", "3d ago". Falls back to a short
 * date for anything older than ~30 days so the string stays meaningful. `now` is injectable
 * for deterministic tests.
 */
export function formatHuntRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const diffMs = now - then;
  // Future timestamps (clock skew) read as "just now" rather than a negative age.
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  // Older than a month — a short absolute date is more useful than "40d ago".
  return new Date(then).toISOString().slice(0, 10);
}
