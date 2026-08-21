import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowUpRight, Clock3, ShieldAlert, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { EntityPivotButtons } from './EntityPivotButtons';
import { EntityRiskBadge } from './EntityRiskBadge';
import { getEntityPreview } from '../services/entity.service';
import type { EntitySummaryItem } from '../types/entity.types';

import { EntityTypeIcon } from '@/components/entity-type-icon';
import { ApiError } from '@/lib/apiClient';


import './EntityContextDrawer.css';

interface EntityContextDrawerProps {
  entity: EntitySummaryItem;
  onClose: () => void;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function EntityContextDrawer({ entity, onClose }: EntityContextDrawerProps): JSX.Element {
  const navigate = useNavigate();
  const previewQuery = useQuery({
    queryKey: ['entity-preview', entity.id],
    queryFn: ({ signal }) => getEntityPreview(entity.id, signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const preview = previewQuery.data?.entity;
  const dossierPivot = preview?.pivots.find((pivot) => pivot.type === 'dossier')
    ?? entity.pivots.find((pivot) => pivot.type === 'dossier');

  const openDossier = (): void => {
    if (dossierPivot?.route) {
      navigate(dossierPivot.route.startsWith('/') ? dossierPivot.route : `/${dossierPivot.route}`);
      return;
    }
    navigate(`/entities/${encodeURIComponent(entity.id)}/dossier`);
  };

  const isForbidden = previewQuery.error instanceof ApiError && previewQuery.error.status === 403;

  return (
    <aside className="entity-context" aria-label={`Entity context for ${entity.displayName}`}>
      <header className="entity-context__header">
        <div className="entity-context__identity-icon" aria-hidden="true">
          <EntityTypeIcon type={entity.type} size={20} />
        </div>
        <div className="entity-context__identity">
          <span>{entity.type} context</span>
          <strong>{entity.displayName || entity.value}</strong>
          <code>{entity.value}</code>
        </div>
        <button type="button" className="entity-context__close" onClick={onClose} aria-label="Close entity context">
          <X size={16} />
        </button>
      </header>

      <div className="entity-context__scroll">
        <section className="entity-context__risk" aria-label="Entity risk">
          <EntityRiskBadge score={entity.riskScore} level={entity.riskLevel} trend={entity.riskTrend} />
          <dl>
            <div><dt>Criticality</dt><dd>{entity.criticality}</dd></div>
            <div><dt>Baseline</dt><dd>{entity.baselineDeviation.toFixed(2)}×</dd></div>
          </dl>
        </section>

        {previewQuery.isLoading && (
          <div className="entity-context__skeleton" role="status" aria-label="Loading entity context">
            {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
          </div>
        )}

        {previewQuery.isError && (
          <section className="entity-context__state" role="alert">
            <AlertTriangle size={18} />
            <strong>{isForbidden ? 'Entity context restricted' : 'Context unavailable'}</strong>
            <p>{isForbidden ? 'Your role can see the inventory record but not its enriched context.' : 'The summary remains available. Retry the progressive detail request when the source recovers.'}</p>
            {!isForbidden && <button type="button" onClick={() => void previewQuery.refetch()}>Retry context</button>}
          </section>
        )}

        {preview && (
          <>
            <section className="entity-context__section">
              <header><Activity size={14} /><strong>Observed activity</strong></header>
              <div className="entity-context__metrics">
                <div><strong>{preview.activitySummary.last24h.toLocaleString()}</strong><span>events · 24h</span></div>
                <div><strong>{preview.activitySummary.last7d.toLocaleString()}</strong><span>events · 7d</span></div>
                <div><strong>{preview.activitySummary.avgDaily.toLocaleString()}</strong><span>daily average</span></div>
              </div>
            </section>

            <section className="entity-context__section">
              <header><ShieldAlert size={14} /><strong>Detection context</strong></header>
              <div className="entity-context__metrics">
                <div><strong>{preview.alertSummary.active}</strong><span>active alerts</span></div>
                <div><strong>{preview.alertSummary.total30d}</strong><span>alerts · 30d</span></div>
                <div><strong>{preview.alertSummary.highestSeverity || 'None'}</strong><span>highest severity</span></div>
              </div>
            </section>

            <section className="entity-context__section">
              <header><Clock3 size={14} /><strong>Observation window</strong></header>
              <dl className="entity-context__details">
                <div><dt>First seen</dt><dd>{formatDateTime(entity.firstSeen)}</dd></div>
                <div><dt>Last seen</dt><dd>{formatDateTime(preview.lastSeen)}</dd></div>
                <div><dt>Sources</dt><dd>{entity.observationSources.join(', ') || 'Unknown'}</dd></div>
              </dl>
            </section>

            {preview.tags.length > 0 && (
              <section className="entity-context__section">
                <header><strong>Tags</strong></header>
                <div className="entity-context__tags">{preview.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="entity-context__footer">
        {preview && <EntityPivotButtons pivots={preview.pivots} />}
        <button type="button" className="entity-context__open" onClick={openDossier}>
          Open dossier <ArrowUpRight size={14} />
        </button>
      </footer>
    </aside>
  );
}
