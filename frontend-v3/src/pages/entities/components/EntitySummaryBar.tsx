/**
 * EntitySummaryBadges — compact clickable badge strip (Correlated Findings pattern).
 * Replaces the old bulky card layout with dense summary pills.
 */

import type { EntityQueueSummary } from '../types/entity.types';

import './EntitySummaryBar.css';

type BadgeKey = 'total' | 'highRisk' | 'rising' | 'activeAlerts' | 'new24h';

interface EntitySummaryBadgesProps {
  summary: EntityQueueSummary;
  onBadgeClick: (badge: BadgeKey) => void;
  activeFilters: {
    riskFilter: string;
    trendRising: boolean;
    alertsActive: boolean;
  };
}

function SummaryBadge({ label, count, tone, active, onClick }: {
  label: string;
  count: number;
  tone?: string;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="entities-summary-badge"
      data-tone={tone}
      data-active={active || undefined}
      onClick={onClick}
    >
      <span className="entities-summary-badge__label">{label}</span>
      <strong className="entities-summary-badge__count">{count}</strong>
    </button>
  );
}

export function EntitySummaryBadges({
  summary,
  onBadgeClick,
  activeFilters,
}: EntitySummaryBadgesProps): JSX.Element {
  return (
    <>
      <SummaryBadge
        label="Total"
        count={summary.total}
        onClick={() => onBadgeClick('total')}
      />
      <SummaryBadge
        label="High Risk"
        count={summary.highRisk}
        tone="critical"
        active={activeFilters.riskFilter === 'critical'}
        onClick={() => onBadgeClick('highRisk')}
      />
      <SummaryBadge
        label="Rising"
        count={summary.rising}
        tone="rising"
        active={activeFilters.trendRising}
        onClick={() => onBadgeClick('rising')}
      />
      <SummaryBadge
        label="Active Alerts"
        count={summary.activeAlerts}
        tone="alerts"
        active={activeFilters.alertsActive}
        onClick={() => onBadgeClick('activeAlerts')}
      />
      <SummaryBadge
        label="New 24h"
        count={summary.newEntities24h}
        onClick={() => onBadgeClick('total')}
      />
    </>
  );
}
