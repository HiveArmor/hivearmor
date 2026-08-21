/**
 * StatusChipRenderer — AG Grid cell renderer for alert status chip
 */

import type { AlertStatus } from '@/constants/status.constants';

interface StatusChipProps {
  value: AlertStatus;
}

function getStatusLabel(status: AlertStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In Progress';
    case 'resolved':
      return 'Resolved';
    case 'false_positive':
      return 'False Positive';
    case 'suppressed':
      return 'Suppressed';
    default:
      return status;
  }
}

function getStatusColor(status: AlertStatus): string {
  switch (status) {
    case 'open':
      return 'var(--ha-critical)';
    case 'in_progress':
      return 'var(--ha-primary)';
    case 'resolved':
      return 'var(--ha-positive)';
    case 'false_positive':
      return 'var(--ha-text-secondary)';
    case 'suppressed':
      return 'var(--ha-text-secondary)';
    default:
      return 'var(--ha-text-secondary)';
  }
}

function getStatusBackground(status: AlertStatus): string {
  switch (status) {
    case 'open':
      return 'var(--ha-fill-critical-muted)';
    case 'in_progress':
      return 'var(--ha-fill-primary-muted)';
    case 'resolved':
      return 'var(--ha-fill-low-muted)';
    case 'false_positive':
    case 'suppressed':
      return 'var(--ha-fill-neutral-muted)';
    default:
      return 'transparent';
  }
}

export function StatusChipRenderer({ value }: StatusChipProps): JSX.Element {
  const label = getStatusLabel(value);
  const color = getStatusColor(value);
  const background = getStatusBackground(value);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--ha-radius-sm)',
        background,
        color,
        fontSize: 'var(--ha-text-sm)',
        fontWeight: 500,
      }}
      aria-label={`${label} status`}
    >
      {label}
    </span>
  );
}
