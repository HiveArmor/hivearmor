/**
 * Status constants and helpers.
 * All status colors reference CSS custom properties defined in tokens.css.
 */

export const ALERT_STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'false_positive'] as const;
export type AlertStatus = typeof ALERT_STATUSES[number];

export const STATUS_COLORS: Record<AlertStatus, string> = {
  open:           'var(--ha-status-open)',
  in_progress:    'var(--ha-status-in-progress)',
  resolved:       'var(--ha-status-resolved)',
  closed:         'var(--ha-status-closed)',
  false_positive: 'var(--ha-status-false-positive)',
};

export const STATUS_LABELS: Record<AlertStatus, string> = {
  open:           'Open',
  in_progress:    'In Progress',
  resolved:       'Resolved',
  closed:         'Closed',
  false_positive: 'False Positive',
};

/**
 * Get status label for display
 */
export function getStatusLabel(status: AlertStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Get status color CSS variable
 */
export function getStatusColor(status: AlertStatus): string {
  return STATUS_COLORS[status];
}

/**
 * Check if status is terminal (closed or resolved)
 */
export function isTerminalStatus(status: AlertStatus): boolean {
  return status === 'resolved' || status === 'closed';
}

/**
 * Check if status is active (open or in_progress)
 */
export function isActiveStatus(status: AlertStatus): boolean {
  return status === 'open' || status === 'in_progress';
}
