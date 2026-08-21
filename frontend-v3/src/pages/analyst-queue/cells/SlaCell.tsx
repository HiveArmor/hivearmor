/**
 * SlaCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.8
 * Shows icon + countdown for on_track / at_risk / breached, or "—" if null.
 */

import { AlertTriangle, Clock, XCircle } from 'lucide-react';

import type { SlaStatusDTO } from '@/types/alert.types';

export interface SlaCellProps {
  value: SlaStatusDTO | null;
}

function formatDuration(ms: number): string {
  const absMs = Math.abs(ms);
  const hours = Math.floor(absMs / 3_600_000);
  const minutes = Math.floor((absMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function SlaCell({ value }: SlaCellProps): JSX.Element {
  if (!value) {
    return (
      <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>—</span>
    );
  }

  const msLeft = new Date(value.dueAt).getTime() - Date.now();
  const isBreached = value.status === 'breached';
  const isAtRisk = value.status === 'at_risk';

  const color = isBreached
    ? 'var(--ha-critical)'
    : isAtRisk
    ? 'var(--ha-high)'
    : 'var(--ha-positive)';

  const Icon = isBreached ? XCircle : isAtRisk ? AlertTriangle : Clock;

  const label = isBreached
    ? `Breached ${formatDuration(msLeft)} ago`
    : `${formatDuration(msLeft)} left`;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
      title={`SLA due: ${value.dueAt}`}
    >
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <span
        style={{
          fontFamily: 'var(--ha-font-mono)',
          fontSize: 'var(--ha-text-xs)',
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
    </span>
  );
}
