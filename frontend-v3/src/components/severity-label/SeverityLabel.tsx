import { ShieldAlert, Shield } from 'lucide-react';

import type { SeverityLevel } from '@/lib/severity';
import { SEVERITY_LABELS, SEVERITY_COLORS } from '@/lib/severity';

export interface SeverityLabelProps {
  severity: SeverityLevel;
  size?: 'sm' | 'md';
  className?: string;
}

export function SeverityLabel({ severity, size = 'md', className = '' }: SeverityLabelProps): JSX.Element {
  const iconSize = size === 'sm' ? 12 : 14;
  const fontSize = size === 'sm' ? 'var(--ha-text-xs)' : 'var(--ha-text-sm)';
  const color = SEVERITY_COLORS[severity];
  const label = SEVERITY_LABELS[severity];

  const Icon = severity === 'critical' || severity === 'high' ? ShieldAlert : Shield;

  return (
    <span
      className={`ha-severity-label ${className}`}
      style={{
        display: 'inline-flex',
        height: size === 'sm' ? '20px' : '24px',
        alignItems: 'center',
        gap: '6px',
        fontSize,
        fontWeight: 'var(--ha-weight-medium)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
      aria-label={`${severity} severity`}
    >
      <Icon size={iconSize} style={{ color }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}
