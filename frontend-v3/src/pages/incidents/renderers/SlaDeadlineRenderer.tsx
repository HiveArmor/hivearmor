/**
 * SlaDeadlineRenderer — SLA deadline countdown for AG Grid
 * Per CMD-03 spec §7.1
 */

import type { ICellRendererParams } from 'ag-grid-community';

export function SlaDeadlineRenderer(params: ICellRendererParams): JSX.Element {
  const deadline = params.value as string | null | undefined;

  if (!deadline) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const now = Date.now();
  const diff = deadlineDate.getTime() - now;
  const isPast = diff < 0;

  const absDiff = Math.abs(diff);
  const minutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(absDiff / 3600000);
  const days = Math.floor(absDiff / 86400000);

  let label = '';
  if (minutes < 60) {
    label = `${minutes}m`;
  } else if (hours < 24) {
    label = `${hours}h`;
  } else {
    label = `${days}d`;
  }

  if (isPast) {
    label += ' ago';
  }

  return (
    <span
      style={{
        color: isPast ? 'var(--ha-critical)' : 'var(--ha-text-primary)',
        fontFamily: 'var(--ha-font-mono)',
        fontSize: 'var(--ha-text-sm)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: isPast ? 600 : 400,
      }}
      title={deadlineDate.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    >
      {label}
    </span>
  );
}
