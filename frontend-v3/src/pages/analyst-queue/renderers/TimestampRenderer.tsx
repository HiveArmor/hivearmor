/**
 * TimestampRenderer — AG Grid cell renderer for relative timestamp with absolute hover
 * Mono font, tabular-nums per CMD-02 spec §6.1
 */

interface TimestampRendererProps {
  value: string; // ISO8601 timestamp
}

function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function formatAbsoluteTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function TimestampRenderer({ value }: TimestampRendererProps): JSX.Element {
  const relative = formatRelativeTime(value);
  const absolute = formatAbsoluteTime(value);

  return (
    <span
      style={{
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-sm)',
        color: 'var(--ha-text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}
      title={absolute}
    >
      {relative}
    </span>
  );
}
