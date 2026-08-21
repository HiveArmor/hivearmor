import { useEffect, useState } from 'react';

import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export interface SlaIndicatorProps {
  dueAt: string | null;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export type SlaStatus = 'on_track' | 'at_risk' | 'breached';

function getSlaStatus(dueAt: string): SlaStatus {
  const msLeft = new Date(dueAt).getTime() - Date.now();
  if (msLeft < 0) return 'breached';
  if (msLeft < 60 * 60 * 1000) return 'at_risk';
  return 'on_track';
}

function formatDuration(ms: number): string {
  const absMs = Math.abs(ms);
  const hours = Math.floor(absMs / (60 * 60 * 1000));
  const minutes = Math.floor((absMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function SlaIndicator({
  dueAt,
  size = 'md',
  showLabel = true,
}: SlaIndicatorProps): JSX.Element | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!dueAt) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);

    return () => clearInterval(interval);
  }, [dueAt]);

  if (!dueAt) {
    return null;
  }

  const slaStatus = getSlaStatus(dueAt);
  const msLeft = new Date(dueAt).getTime() - Date.now();

  const color =
    slaStatus === 'on_track'
      ? 'var(--ha-positive)'
      : slaStatus === 'at_risk'
      ? 'var(--ha-high)'
      : 'var(--ha-critical)';

  const Icon =
    slaStatus === 'on_track' ? CheckCircle : slaStatus === 'at_risk' ? Clock : AlertTriangle;

  const iconSize = size === 'sm' ? 12 : 14;
  const fontSize = 'var(--ha-text-xs)';

  const text =
    msLeft >= 0
      ? `${formatDuration(msLeft)} left`
      : `Breached ${formatDuration(msLeft)} ago`;

  return (
    <span
      className="sla-indicator"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--ha-font-mono)',
        fontSize,
        color,
      }}
      aria-live="polite"
    >
      <Icon size={iconSize} style={{ color }} />
      {showLabel && <span>{text}</span>}
    </span>
  );
}
