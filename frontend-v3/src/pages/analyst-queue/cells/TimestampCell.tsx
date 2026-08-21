/**
 * TimestampCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.7
 * Relative time within 7 days; absolute date beyond that.
 * Tooltip shows full ISO timestamp on hover.
 */

export interface TimestampCellProps {
  value: string; // ISO 8601
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) return 'just now';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffDay >= 1) return rtf.format(-diffDay, 'day');
  if (diffHr >= 1) return rtf.format(-diffHr, 'hour');
  return rtf.format(-diffMin, 'minute');
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimestampCell({ value }: TimestampCellProps): JSX.Element {
  if (!value) {
    return <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-xs)' }}>—</span>;
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const display = diffMs < SEVEN_DAYS_MS ? formatRelative(value) : formatAbsolute(value);

  return (
    <span
      title={value}
      style={{
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-xs)',
        color: 'var(--ha-text-secondary)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {display}
    </span>
  );
}
