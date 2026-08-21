/**
 * SeverityBadgeRenderer — AG Grid cell renderer for severity badge
 * Maps numeric severity to color badge per CMD-02 spec §6.2
 */

import type { SeverityLevel } from '@/lib/severity';

interface SeverityBadgeProps {
  value: number; // numeric severity from backend
}

function getSeverityLevel(value: number): SeverityLevel {
  if (value >= 90) return 'critical';
  if (value >= 70) return 'high';
  if (value >= 40) return 'medium';
  if (value >= 10) return 'low';
  return 'info';
}

function getSeverityBackground(level: SeverityLevel): string {
  switch (level) {
    case 'critical':
      return 'var(--ha-fill-critical-muted)';
    case 'high':
      return 'var(--ha-fill-high-muted)';
    case 'medium':
      return 'var(--ha-fill-medium-muted)';
    case 'low':
    case 'info':
      return 'transparent';
  }
}

function getSeverityColor(level: SeverityLevel): string {
  switch (level) {
    case 'critical':
      return 'var(--ha-critical)';
    case 'high':
      return 'var(--ha-high)';
    case 'medium':
      return 'var(--ha-medium)';
    case 'low':
    case 'info':
      return 'var(--ha-text-secondary)';
  }
}

function getSeverityLabel(level: SeverityLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function SeverityBadgeRenderer({ value }: SeverityBadgeProps): JSX.Element {
  const level = getSeverityLevel(value);
  const background = getSeverityBackground(level);
  const color = getSeverityColor(level);
  const label = getSeverityLabel(level);

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
        fontVariantNumeric: 'tabular-nums',
      }}
      aria-label={`${label} severity`}
    >
      {label}
    </span>
  );
}
