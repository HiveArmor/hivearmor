/**
 * SlaBreachedRenderer — SLA breached badge for AG Grid
 * Per CMD-03 spec §7.1
 */

import type { ICellRendererParams } from 'ag-grid-community';

export function SlaBreachedRenderer(params: ICellRendererParams): JSX.Element {
  const breached = params.value as boolean | undefined;

  if (!breached) {
    return <span />;
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: 'var(--ha-radius-sm)',
        background: 'color-mix(in srgb, var(--ha-critical) 15%, transparent)',
        color: 'var(--ha-critical)',
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      BREACHED
    </span>
  );
}
