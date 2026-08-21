/**
 * SeverityCell — AG Grid cell renderer
 * Per spec 03-ANALYST-QUEUE.md §6.1
 */

import { Shield, ShieldAlert } from 'lucide-react';

import { SEVERITY_LABELS, SEVERITY_COLORS } from '@/lib/severity';
import type { SeverityLevel } from '@/lib/severity';

export interface SeverityCellProps {
  value: SeverityLevel;
}

export function SeverityCell({ value }: SeverityCellProps): JSX.Element {
  const color = SEVERITY_COLORS[value] ?? 'var(--ha-text-secondary)';
  const label = SEVERITY_LABELS[value] ?? value;
  const Icon = value === 'critical' || value === 'high' ? ShieldAlert : Shield;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--ha-text-sm)',
        fontWeight: 'var(--ha-weight-medium)',
      }}
      aria-label={`${label} severity`}
    >
      <Icon size={14} style={{ color, flexShrink: 0 }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}
