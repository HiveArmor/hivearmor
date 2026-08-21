/**
 * SeverityBadgeRenderer — Severity badge for AG Grid
 * Per CMD-03 spec §7.3
 */

import type { ICellRendererParams } from 'ag-grid-community';

import { getSeverityLabel, getSeverityColor } from '@/lib/severity';

export function SeverityBadgeRenderer(params: ICellRendererParams): JSX.Element {
  const severity = params.value as number | undefined;

  if (severity === undefined || severity === null) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const label = getSeverityLabel(severity);
  const color = getSeverityColor(severity);

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
