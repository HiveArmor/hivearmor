/**
 * StatusCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.5
 */

import type { ForwardRefExoticComponent, RefAttributes } from 'react';

import type { LucideProps } from 'lucide-react';
import { CheckCircle, Circle, Clock, MinusCircle, XCircle } from 'lucide-react';

import type { AlertStatus } from '@/constants/status.constants';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/status';

export interface StatusCellProps {
  value: AlertStatus;
}

type LucideComponent = ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>
>;

const STATUS_ICONS: Record<AlertStatus, LucideComponent> = {
  open:           Circle,
  in_progress:    Clock,
  resolved:       CheckCircle,
  false_positive: XCircle,
  suppressed:     MinusCircle,
};

// STATUS_COLORS / STATUS_LABELS from @/lib/status don't include 'suppressed' yet —
// fall back gracefully so no implicit-any error when indexing with the full union.
type LibStatus = keyof typeof STATUS_COLORS;

export function StatusCell({ value }: StatusCellProps): JSX.Element {
  const color = STATUS_COLORS[value as LibStatus] ?? 'var(--ha-text-secondary)';
  const label = STATUS_LABELS[value as LibStatus] ?? value;
  const Icon: LucideComponent = STATUS_ICONS[value] ?? Circle;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--ha-text-sm)',
      }}
      aria-label={`Status: ${label}`}
    >
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}
