/**
 * TimestampRenderer — Timestamp with relative hover for AG Grid
 * Per CMD-03 spec §7.1
 */

import type { ICellRendererParams } from 'ag-grid-community';

export function TimestampRenderer(params: ICellRendererParams): JSX.Element {
  const timestamp = params.value as string | undefined;

  if (!timestamp) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const absolute = date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  let relative = '';
  if (minutes < 1) {
    relative = 'just now';
  } else if (minutes < 60) {
    relative = `${minutes}m ago`;
  } else if (hours < 24) {
    relative = `${hours}h ago`;
  } else {
    relative = `${days}d ago`;
  }

  return (
    <span
      style={{
        color: 'var(--ha-text-primary)',
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-sm)',
        fontVariantNumeric: 'tabular-nums',
      }}
      title={`${absolute} (${relative})`}
    >
      {absolute}
    </span>
  );
}
