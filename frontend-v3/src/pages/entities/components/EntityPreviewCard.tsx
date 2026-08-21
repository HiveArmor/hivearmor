/**
 * EntityPreviewCard — compact card showing risk badge, trend, activity sparkline,
 * alert count, and pivot buttons. Used inside EntityPreviewPopover.
 */

import { Activity, ShieldAlert } from 'lucide-react';


import { EntityPivotButtons } from './EntityPivotButtons';
import { EntityRiskBadge } from './EntityRiskBadge';
import type { EntityPreview } from '../types/entity.types';

import './EntityPreviewCard.css';

interface EntityPreviewCardProps {
  entity: EntityPreview;
}

export function EntityPreviewCard({ entity }: EntityPreviewCardProps): JSX.Element {
  return (
    <div className="ent-preview-card" role="region" aria-label={`Preview of ${entity.displayName}`}>
      <header className="ent-preview-card__header">
        <div className="ent-preview-card__identity">
          <span className="ent-preview-card__type">{entity.type}</span>
          <strong className="ent-preview-card__name">{entity.displayName}</strong>
          <code className="ent-preview-card__value">{entity.value}</code>
        </div>
        <EntityRiskBadge score={entity.riskScore} level={entity.riskLevel} trend={entity.riskTrend} />
      </header>

      <div className="ent-preview-card__metrics">
        <div className="ent-preview-card__metric">
          <Activity size={13} aria-hidden="true" />
          <span>Activity</span>
          <strong>{entity.activitySummary.last24h.toLocaleString()}</strong>
          <small>24h</small>
        </div>
        <div className="ent-preview-card__metric">
          <Activity size={13} aria-hidden="true" />
          <span>Weekly</span>
          <strong>{entity.activitySummary.last7d.toLocaleString()}</strong>
          <small>7d</small>
        </div>
        <div className="ent-preview-card__metric" data-tone="alert">
          <ShieldAlert size={13} aria-hidden="true" />
          <span>Alerts</span>
          <strong>{entity.alertSummary.active}</strong>
          <small>active</small>
        </div>
      </div>

      <div className="ent-preview-card__details">
        <dl>
          <div>
            <dt>Criticality</dt>
            <dd>{entity.criticality}</dd>
          </div>
          <div>
            <dt>Baseline deviation</dt>
            <dd>{entity.baselineDeviation.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Highest severity</dt>
            <dd>{entity.alertSummary.highestSeverity || '—'}</dd>
          </div>
        </dl>
      </div>

      <footer className="ent-preview-card__footer">
        <EntityPivotButtons pivots={entity.pivots} />
      </footer>
    </div>
  );
}
