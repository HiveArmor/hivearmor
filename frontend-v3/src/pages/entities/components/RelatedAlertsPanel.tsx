/**
 * RelatedAlertsPanel — Sprint 46
 * Paginated alert table showing alerts related to the entity,
 * with severity, entity role badges, and pagination controls.
 */

import { useCallback, useState } from 'react';

import { Spinner } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';

import { getRelatedAlerts } from '../services/dossier.service';
import type { RelatedAlert } from '../types/dossier.types';

import './RelatedAlertsPanel.css';

export interface RelatedAlertsPanelProps {
  entityId: string;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function RelatedAlertsPanel({ entityId }: RelatedAlertsPanelProps): JSX.Element {
  const [cursor, setCursor] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);

  const alertsQuery = useQuery({
    queryKey: ['entity-alerts', entityId, cursor],
    queryFn: ({ signal }) =>
      getRelatedAlerts(entityId, { cursor: cursor ?? undefined, limit: 25 }, signal),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
  });

  const handleNextPage = useCallback(() => {
    const nextCursor = alertsQuery.data?.cursor;
    if (nextCursor) {
      setPageHistory(prev => [...prev, cursor ?? '']);
      setCursor(nextCursor);
    }
  }, [alertsQuery.data?.cursor, cursor]);

  const handlePrevPage = useCallback(() => {
    const prev = pageHistory[pageHistory.length - 1];
    setPageHistory(h => h.slice(0, -1));
    setCursor(prev === '' ? null : prev ?? null);
  }, [pageHistory]);

  const alerts = alertsQuery.data?.items ?? [];
  const total = alertsQuery.data?.total ?? 0;

  return (
    <section className="ha-alerts-panel">
      <header className="ha-alerts-panel__header">
        <Bell size={14} />
        <h2>Related Alerts</h2>
        <span className="ha-alerts-panel__total">{total} total</span>
      </header>

      {alertsQuery.isLoading ? (
        <div className="ha-alerts-panel__loading">
          <Spinner size="md" aria-label="Loading alerts" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="ha-alerts-panel__empty">
          <p>No related alerts found for this entity.</p>
        </div>
      ) : (
        <>
          <div className="ha-alerts-panel__table" role="table" aria-label="Related alerts">
            <div className="ha-alerts-panel__row ha-alerts-panel__row--header" role="row">
              <span role="columnheader">Severity</span>
              <span role="columnheader">Title</span>
              <span role="columnheader">Rule</span>
              <span role="columnheader">Role</span>
              <span role="columnheader">Technique</span>
              <span role="columnheader">Time</span>
            </div>
            {alerts.map((alert: RelatedAlert) => (
              <div key={alert.id} className="ha-alerts-panel__row" role="row" data-severity={alert.severity}>
                <span className="ha-alerts-panel__severity" data-level={alert.severity}>
                  {alert.severity}
                </span>
                <span className="ha-alerts-panel__title">{alert.title}</span>
                <span className="ha-alerts-panel__rule">{alert.ruleName}</span>
                <span className="ha-alerts-panel__role" data-role={alert.entityRole}>
                  {alert.entityRole}
                </span>
                <code className="ha-alerts-panel__technique">{alert.mitreTechnique || '—'}</code>
                <span className="ha-alerts-panel__time">{formatTimestamp(alert.timestamp)}</span>
              </div>
            ))}
          </div>

          <footer className="ha-alerts-panel__footer">
            <span>Page {pageHistory.length + 1}</span>
            <div className="ha-alerts-panel__pagination">
              <button
                type="button"
                disabled={pageHistory.length === 0}
                onClick={handlePrevPage}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={!alertsQuery.data?.cursor}
                onClick={handleNextPage}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
