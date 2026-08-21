/**
 * EntityRiskBadge — colored pill showing risk score + trend arrow.
 * ↑ rising (red), → stable (gray), ↓ declining (green)
 * Uses design tokens only — no hardcoded colors.
 */

import type { EntRiskLevel, EntRiskTrend } from '../types/entity.types';

import './EntityRiskBadge.css';

interface EntityRiskBadgeProps {
  score: number;
  level: EntRiskLevel;
  trend: EntRiskTrend;
}

function trendArrow(trend: EntRiskTrend): string {
  switch (trend) {
    case 'rising':
      return '↑';
    case 'declining':
      return '↓';
    case 'stable':
    default:
      return '→';
  }
}

export function EntityRiskBadge({ score, level, trend }: EntityRiskBadgeProps): JSX.Element {
  return (
    <span
      className="ent-risk-badge"
      data-level={level}
      data-trend={trend}
      aria-label={`Risk score ${score}, level ${level}, trend ${trend}`}
    >
      <strong className="ent-risk-badge__score">{score}</strong>
      <span className="ent-risk-badge__trend" aria-hidden="true">
        {trendArrow(trend)}
      </span>
    </span>
  );
}
