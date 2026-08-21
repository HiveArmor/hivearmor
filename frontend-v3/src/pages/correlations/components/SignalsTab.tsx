/**
 * Sprint 44 — Signals Tab.
 * Paginated list of linked alerts with severity, rule name, timestamp, stage badge.
 */

import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

import { listSignals } from '../services/correlation.service';
import type { Signal } from '../types/correlation.types';

import { getSeverityLabel } from '@/lib/severity';

function SignalRow({ signal }: { signal: Signal }): JSX.Element {
  return (
    <div className="signals-tab__row" role="row">
      <span role="cell" className="signals-tab__col--severity" data-severity={signal.severity}>
        <ShieldAlert size={13} aria-hidden="true" />
        {getSeverityLabel(signal.severity)}
      </span>
      <span role="cell" className="signals-tab__col--rule">
        <strong>{signal.ruleName}</strong>
        <small>{signal.description}</small>
      </span>
      <span role="cell" className="signals-tab__col--time">
        <time title={new Date(signal.timestamp).toLocaleString()}>
          {new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </span>
      <span role="cell" className="signals-tab__col--stage">
        <span className="signals-tab__stage-badge">{signal.stage}</span>
      </span>
      <span role="cell" className="signals-tab__col--technique">
        <code>{signal.mitreTechnique}</code>
      </span>
    </div>
  );
}

export interface SignalsTabProps {
  findingId: string;
}

export function SignalsTab({ findingId }: SignalsTabProps): JSX.Element {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const signalsQuery = useQuery({
    queryKey: ['finding-signals', findingId, cursor],
    queryFn: ({ signal }) => listSignals(findingId, cursor, 25, signal),
    staleTime: 30_000,
  });

  return (
    <div className="signals-tab">
      <header className="signals-tab__header">
        <h3>Linked Signals</h3>
        {signalsQuery.data && (
          <span>{signalsQuery.data.total} total signals</span>
        )}
      </header>

      {signalsQuery.isLoading && (
        <div className="signals-tab__loading" role="status">
          Loading signals…
        </div>
      )}

      {signalsQuery.isError && (
        <section className="signals-tab__error" role="alert">
          <AlertTriangle size={16} />
          <span>Failed to load signals.</span>
          <button type="button" onClick={() => void signalsQuery.refetch()}>
            Retry
          </button>
        </section>
      )}

      {signalsQuery.data && (
        <>
          <div className="signals-tab__table" role="table" aria-label="Finding signals">
            <div className="signals-tab__table-header" role="row">
              <span role="columnheader">Severity</span>
              <span role="columnheader">Rule</span>
              <span role="columnheader">Time</span>
              <span role="columnheader">Stage</span>
              <span role="columnheader">Technique</span>
            </div>
            {signalsQuery.data.items.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>

          {signalsQuery.data.items.length === 0 && (
            <p className="signals-tab__empty">No signals found for this finding.</p>
          )}

          <div className="signals-tab__pagination">
            {cursor && (
              <button type="button" onClick={() => setCursor(undefined)}>
                First page
              </button>
            )}
            {signalsQuery.data.cursor && (
              <button type="button" onClick={() => setCursor(signalsQuery.data.cursor ?? undefined)}>
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
