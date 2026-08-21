/**
 * SimilarIncidentsPanel — Cards showing title, severity, similarity percentage bar, reason badges.
 */

import { useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';

import { findSimilar } from '../services/incident-workbench.service';
import type { SimilarIncident, SimilarityReason } from '../types/incident-workbench.types';

export interface SimilarIncidentsPanelProps {
  incidentId: string;
}

const REASON_LABELS: Record<string, string> = {
  shared_entity: 'Shared Entity',
  same_rule: 'Same Rule',
  shared_indicator: 'Shared IOC',
  semantic_summary: 'Similar Narrative',
};

function SimilarityBar({ value }: { value: number }): JSX.Element {
  const percent = Math.round(value * 100);
  return (
    <div className="similarity-bar" aria-label={`${percent}% similar`}>
      <div
        className="similarity-bar__fill"
        style={{ width: `${String(percent)}%` }}
        aria-hidden="true"
      />
      <span className="similarity-bar__label">{percent}%</span>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: SimilarityReason }): JSX.Element {
  return (
    <span className="similarity-reason-badge" data-type={reason.type} title={reason.description}>
      {REASON_LABELS[reason.type] ?? reason.type}
    </span>
  );
}

export function SimilarIncidentsPanel({ incidentId }: SimilarIncidentsPanelProps): JSX.Element {
  const similarQuery = useQuery({
    queryKey: ['similar-incidents', incidentId],
    queryFn: () => findSimilar(incidentId, { window: '30d', limit: 20 }),
    staleTime: 60_000,
  });

  if (similarQuery.isLoading) {
    return (
      <section className="similar-panel" aria-label="Similar incidents" aria-busy="true">
        <h2 className="similar-panel__title"><GitBranch size={15} aria-hidden="true" /> Similar Incidents</h2>
        <div className="similar-panel__loading">Searching for related incidents…</div>
      </section>
    );
  }

  if (similarQuery.isError) {
    return (
      <section className="similar-panel" aria-label="Similar incidents">
        <h2 className="similar-panel__title"><GitBranch size={15} aria-hidden="true" /> Similar Incidents</h2>
        <div className="similar-panel__error" role="alert">
          Could not find similar incidents.{' '}
          <button type="button" onClick={() => void similarQuery.refetch()}>Retry</button>
        </div>
      </section>
    );
  }

  const items: SimilarIncident[] = similarQuery.data?.items ?? [];

  return (
    <section className="similar-panel" aria-label="Similar incidents">
      <h2 className="similar-panel__title">
        <GitBranch size={15} aria-hidden="true" /> Similar Incidents
        {items.length > 0 && <span className="similar-panel__count">{items.length}</span>}
      </h2>

      {items.length === 0 && (
        <div className="similar-panel__empty">No similar incidents found in the last 30 days.</div>
      )}

      <div className="similar-panel__list">
        {items.map((incident) => (
          <article className="similar-card" key={incident.incidentId}>
            <div className="similar-card__header">
              <span className="similar-card__severity" data-severity={incident.severity}>
                {incident.severity}
              </span>
              <span className="similar-card__status">{incident.status}</span>
            </div>
            <h3 className="similar-card__title">{incident.title}</h3>
            <SimilarityBar value={incident.similarity} />
            <div className="similar-card__reasons">
              {incident.reasons.map((reason, idx) => (
                <ReasonBadge reason={reason} key={idx} />
              ))}
            </div>
            <time className="similar-card__date" dateTime={incident.createdAt}>
              {new Date(incident.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </time>
          </article>
        ))}
      </div>
    </section>
  );
}
