/**
 * StatusChipRenderer — Status chip for AG Grid
 * Per CMD-03 spec §7.1
 */

import type { ICellRendererParams } from 'ag-grid-community';

import type { IncidentStatus } from '@/constants/status.constants';
import { INCIDENT_STATUS } from '@/constants/status.constants';

export function StatusChipRenderer(params: ICellRendererParams): JSX.Element {
  const status = params.value as IncidentStatus | undefined;

  if (!status) {
    return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
  }

  const statusStyles = {
    [INCIDENT_STATUS.OPEN]: {
      label: 'Open',
      background: 'color-mix(in srgb, var(--ha-critical) 15%, transparent)',
      color: 'var(--ha-critical)',
    },
    [INCIDENT_STATUS.IN_PROGRESS]: {
      label: 'In Progress',
      background: 'color-mix(in srgb, var(--ha-high) 15%, transparent)',
      color: 'var(--ha-high)',
    },
    [INCIDENT_STATUS.RESOLVED]: {
      label: 'Resolved',
      background: 'color-mix(in srgb, var(--ha-positive) 15%, transparent)',
      color: 'var(--ha-positive)',
    },
    [INCIDENT_STATUS.CLOSED]: {
      label: 'Closed',
      background: 'transparent',
      color: 'var(--ha-text-secondary)',
    },
  };

  const style = statusStyles[status] ?? statusStyles[INCIDENT_STATUS.OPEN];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 'var(--ha-radius-sm)',
        background: style.background,
        color: style.color,
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {style.label}
    </span>
  );
}
