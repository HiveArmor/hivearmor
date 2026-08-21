/**
 * EdgeEvidencePanel — slide-out panel showing relationship evidence.
 * Events list, alerts list, timeline visualization, pattern badge, summary stats.
 * CON-003 consumer.
 */

import type { DetailedRelationship } from '../types/constellation.types';

interface EdgeEvidencePanelProps {
  evidence: DetailedRelationship | null;
  isLoading: boolean;
  onClose: () => void;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
}

function patternLabel(pattern: string): string {
  switch (pattern) {
    case 'regular_interval': return 'Beaconing';
    case 'burst': return 'Burst';
    case 'one_time': return 'One-time';
    case 'intermittent': return 'Intermittent';
    default: return pattern;
  }
}

export function EdgeEvidencePanel({ evidence, isLoading, onClose }: EdgeEvidencePanelProps): JSX.Element {
  return (
    <aside className="ha-edge-evidence" aria-label="Relationship evidence panel">
      <header className="ha-edge-evidence__header">
        <h3>Relationship Evidence</h3>
        <button
          type="button"
          className="ha-edge-evidence__close"
          onClick={onClose}
          aria-label="Close evidence panel"
        >
          ✕
        </button>
      </header>

      {isLoading && (
        <div className="ha-edge-evidence__loading" aria-busy="true">
          Loading evidence…
        </div>
      )}

      {!isLoading && !evidence && (
        <div className="ha-edge-evidence__empty">
          No evidence available for this relationship.
        </div>
      )}

      {evidence && (
        <div className="ha-edge-evidence__content">
          {/* Summary stats */}
          <section className="ha-edge-evidence__summary">
            <h4>Summary</h4>
            <dl>
              <div>
                <dt>Type</dt>
                <dd>{evidence.relationshipType}</dd>
              </div>
              <div>
                <dt>Strength</dt>
                <dd>{(evidence.strength * 100).toFixed(0)}%</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{(evidence.confidence * 100).toFixed(0)}%</dd>
              </div>
              <div>
                <dt>Total events</dt>
                <dd>{evidence.summary.totalEvents}</dd>
              </div>
              <div>
                <dt>First seen</dt>
                <dd>{formatTimestamp(evidence.summary.firstSeen)}</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{formatTimestamp(evidence.summary.lastSeen)}</dd>
              </div>
            </dl>
            <span className="ha-edge-evidence__pattern-badge">
              {patternLabel(evidence.summary.pattern)}
            </span>
          </section>

          {/* Entities */}
          <section className="ha-edge-evidence__entities">
            <h4>Connected entities</h4>
            <div className="ha-edge-evidence__entity-pair">
              <span>
                <strong>{evidence.sourceEntity.value}</strong>
                <small>{evidence.sourceEntity.type} — Risk {evidence.sourceEntity.riskScore}</small>
              </span>
              <span className="ha-edge-evidence__arrow">→</span>
              <span>
                <strong>{evidence.targetEntity.value}</strong>
                <small>{evidence.targetEntity.type} — Risk {evidence.targetEntity.riskScore}</small>
              </span>
            </div>
          </section>

          {/* Events list */}
          {evidence.events.length > 0 && (
            <section className="ha-edge-evidence__events">
              <h4>Supporting events ({evidence.events.length})</h4>
              <ul>
                {evidence.events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                    <span className="ha-edge-evidence__event-type">{event.type}</span>
                    <span>{event.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Alerts list */}
          {evidence.alerts.length > 0 && (
            <section className="ha-edge-evidence__alerts">
              <h4>Related alerts ({evidence.alerts.length})</h4>
              <ul>
                {evidence.alerts.map((alert) => (
                  <li key={alert.id}>
                    <span className={`ha-edge-evidence__severity ha-edge-evidence__severity--${alert.severity}`}>
                      {alert.severity}
                    </span>
                    <span>{alert.title}</span>
                    <time dateTime={alert.timestamp}>{formatTimestamp(alert.timestamp)}</time>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Timeline */}
          {evidence.timeline.length > 0 && (
            <section className="ha-edge-evidence__timeline">
              <h4>Timeline</h4>
              <ol>
                {evidence.timeline.map((entry, index) => (
                  <li key={index}>
                    <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                    <span className="ha-edge-evidence__timeline-type">{entry.eventType}</span>
                    <span>{entry.description}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
