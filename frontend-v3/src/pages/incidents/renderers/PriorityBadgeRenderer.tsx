/**
 * PriorityBadgeRenderer — Priority badge for AG Grid
 * Per CMD-03 spec §7.2
 */

import type { ICellRendererParams } from 'ag-grid-community';

export function PriorityBadgeRenderer(params: ICellRendererParams): JSX.Element {
  const priority = params.value as 'P1' | 'P2' | 'P3' | 'P4' | undefined;

  if (!priority) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const styles = {
    P1: {
      background: 'color-mix(in srgb, var(--ha-critical) 15%, transparent)',
      color: 'var(--ha-critical)',
      label: 'P1 — Critical',
    },
    P2: {
      background: 'color-mix(in srgb, var(--ha-high) 15%, transparent)',
      color: 'var(--ha-high)',
      label: 'P2 — High',
    },
    P3: {
      background: 'color-mix(in srgb, var(--ha-medium) 15%, transparent)',
      color: 'var(--ha-medium)',
      label: 'P3 — Medium',
    },
    P4: {
      background: 'transparent',
      color: 'var(--ha-text-secondary)',
      label: 'P4 — Low',
    },
  };

  const style = styles[priority];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        background: style.background,
        color: style.color,
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
      }}
      title={style.label}
    >
      {priority}
    </span>
  );
}
