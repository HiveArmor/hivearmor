import type { ForwardRefExoticComponent, RefAttributes } from 'react';

import type { LucideProps } from 'lucide-react';
import { Circle, Clock, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

import { HaLabel } from '@/components/ha-label';
import type { AlertStatus } from '@/lib/status';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/status';

export interface StatusLabelProps {
  status: AlertStatus;
  size?: 'sm' | 'md';
  className?: string;
}

type LucideComponent = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;

const STATUS_ICONS: Record<AlertStatus, LucideComponent> = {
  open: Circle,
  in_progress: Clock,
  resolved: CheckCircle,
  closed: XCircle,
  false_positive: MinusCircle,
};

export function StatusLabel({ status, size = 'md', className = '' }: StatusLabelProps): JSX.Element {
  const iconSize = size === 'sm' ? 12 : 14;
  const color = STATUS_COLORS[status];
  const label = STATUS_LABELS[status];
  const Icon = STATUS_ICONS[status];

  return (
    <HaLabel
      className={`status-label ${className}`.trim()}
      size={size}
      color={color}
      icon={<Icon size={iconSize} color="currentColor" aria-hidden="true" />}
      aria-label={`Status: ${label}`}
    >
      {label}
    </HaLabel>
  );
}
