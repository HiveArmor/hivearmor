/**
 * ExecutionHistoryPanel — Timeline/table of executions with duration bars,
 * alert count, and status badges (Sprint 47 DET-009)
 */

import { useCallback, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RefreshCw, X } from 'lucide-react';

import { fetchExecutions } from '@/pages/detection-rules/services/detection.service';
import type { ExecutionStatus, RuleExecution } from '@/pages/detection-rules/types/detection.types';

interface ExecutionHistoryPanelProps {
  ruleId?: string;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  completed: 'Completed',
  failed: 'Failed',
  timeout: 'Timeout',
  cancelled: 'Cancelled',
  queued: 'Queued',
  running: 'Running',
};

export function ExecutionHistoryPanel({ ruleId }: ExecutionHistoryPanelProps): JSX.Element {
  const [selected, setSelected] = useState<RuleExecution | null>(null);

  const executionsQuery = useQuery({
    queryKey: ['detection-executions', ruleId],
    queryFn: ({ signal }) => fetchExecutions({ ruleId, limit: 50 }, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const executions = executionsQuery.data?.items ?? [];
  const maxDuration = Math.max(...executions.map((e) => e.duration ?? 0), 1);

  const handleRefresh = useCallback(() => {
    void executionsQuery.refetch();
  }, [executionsQuery]);

  return (
    <section className="execution-history-panel" aria-label="Execution history">
      <header className="execution-history-panel__header">
        <div>
          <strong>Execution history</strong>
          <span>{executions.length} executions</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={executionsQuery.isFetching}
          aria-label="Refresh execution history"
        >
          <RefreshCw size={14} className={executionsQuery.isFetching ? 'detection-spin' : ''} />
        </button>
      </header>

      {executionsQuery.isLoading ? (
        <div className="detection-grid-loading" aria-label="Loading executions">
          {Array.from({ length: 6 }, (_, i) => <span key={i} />)}
        </div>
      ) : executions.length === 0 ? (
        <div className="detection-state">
          <p>No execution history available.</p>
        </div>
      ) : (
        <div className="execution-history-panel__content">
          <table className="execution-history-panel__table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Alerts</th>
                <th>Events</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {executions.map((execution) => (
                <tr
                  key={execution.id}
                  data-selected={selected?.id === execution.id}
                  onClick={() => setSelected(execution)}
                >
                  <td><time>{formatTime(execution.startedAt)}</time></td>
                  <td>
                    <span className="execution-status-badge" data-status={execution.status}>
                      {STATUS_LABELS[execution.status]}
                    </span>
                  </td>
                  <td>
                    <div className="execution-duration-bar">
                      <i
                        style={{ width: `${Math.round(((execution.duration ?? 0) / maxDuration) * 100)}%` }}
                        data-status={execution.status}
                      />
                      <span>{formatDuration(execution.duration)}</span>
                    </div>
                  </td>
                  <td>{execution.alertsGenerated}</td>
                  <td>{execution.eventsScanned.toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Execution details`}
                      onClick={(e) => { e.stopPropagation(); setSelected(execution); }}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected && (
            <aside className="execution-history-panel__detail" aria-label="Execution detail">
              <header>
                <div>
                  <small>EXECUTION</small>
                  <h3>{selected.ruleName}</h3>
                  <code>{selected.id}</code>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close">
                  <X size={14} />
                </button>
              </header>
              <dl>
                <div><dt>Status</dt><dd><span className="execution-status-badge" data-status={selected.status}>{STATUS_LABELS[selected.status]}</span></dd></div>
                <div><dt>Triggered by</dt><dd>{selected.triggeredBy}</dd></div>
                <div><dt>Started</dt><dd>{formatTime(selected.startedAt)}</dd></div>
                <div><dt>Completed</dt><dd>{formatTime(selected.completedAt)}</dd></div>
                <div><dt>Duration</dt><dd>{formatDuration(selected.duration)}</dd></div>
                <div><dt>Events scanned</dt><dd>{selected.eventsScanned.toLocaleString()}</dd></div>
                <div><dt>Alerts generated</dt><dd>{selected.alertsGenerated}</dd></div>
              </dl>
              {selected.errors.length > 0 && (
                <section>
                  <h4>Errors</h4>
                  <ul>{selected.errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                </section>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
