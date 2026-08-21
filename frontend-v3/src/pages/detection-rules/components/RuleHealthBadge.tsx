/**
 * RuleHealthBadge — Colored dot (green/yellow/red) + status text + error rate (Sprint 47)
 */

import type { RuleHealthStatus } from '@/pages/detection-rules/types/detection.types';

interface RuleHealthBadgeProps {
  status: RuleHealthStatus;
  errorRate?: number;
}

const STATUS_LABELS: Record<RuleHealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
  disabled: 'Disabled',
};

export function RuleHealthBadge({ status, errorRate }: RuleHealthBadgeProps): JSX.Element {
  const label = STATUS_LABELS[status];
  const formattedRate = errorRate != null ? `${(errorRate * 100).toFixed(1)}%` : undefined;

  return (
    <span className="rule-health-badge" data-health={status} aria-label={`Health: ${label}`}>
      <i className="rule-health-badge__dot" aria-hidden="true" />
      <span className="rule-health-badge__text">{label}</span>
      {formattedRate && status !== 'healthy' && (
        <small className="rule-health-badge__rate">{formattedRate}</small>
      )}
    </span>
  );
}
