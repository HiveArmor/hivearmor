import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Database,
  Filter, Gauge, History, RefreshCw, Search, TimerReset, X,
} from 'lucide-react';

import { fetchRuleExecutions } from './detectionRules.service';
import type { DetectionExecution, DetectionExecutionStatus, DetectionRule } from './detectionRules.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';

interface DetectionMonitoringViewProps {
  rules: DetectionRule[];
  onOpenRule: (rule: DetectionRule) => void;
}

const RANGE_OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All responses' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'warning', label: 'Warning' },
  { value: 'failed', label: 'Failed' },
];

function formatTime(value: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(value: number | null): string {
  if (value == null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function statusLabel(status: DetectionExecutionStatus): string {
  return status === 'succeeded' ? 'Succeeded' : status === 'warning' ? 'Warning' : status === 'failed' ? 'Failed' : 'Running';
}

export function DetectionMonitoringView({ rules, onOpenRule }: DetectionMonitoringViewProps): JSX.Element {
  const [range, setRange] = useState('24h');
  const [status, setStatus] = useState<'all' | DetectionExecutionStatus>('all');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DetectionExecution | null>(null);

  const executionsQuery = useQuery({
    queryKey: ['detection-rule-executions', range],
    queryFn: ({ signal }) => fetchRuleExecutions(signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const executions = useMemo(() => (executionsQuery.data?.items ?? []).filter((execution) => {
    if (status !== 'all' && execution.status !== status) return false;
    if (onlyGaps && execution.gapDurationMinutes == null) return false;
    if (query && !execution.ruleName.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [executionsQuery.data?.items, onlyGaps, query, status]);

  const allExecutions = executionsQuery.data?.items ?? [];
  const succeeded = allExecutions.filter((run) => run.status === 'succeeded').length;
  const degraded = allExecutions.filter((run) => run.status === 'warning' || run.status === 'failed').length;
  const gaps = allExecutions.filter((run) => run.gapDurationMinutes != null).length;
  const durations = allExecutions.map((run) => run.durationMs).filter((value): value is number => value != null).sort((a, b) => a - b);
  const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * .95))] : null;
  const selectedRule = selected ? rules.find((rule) => rule.id === selected.ruleId) : undefined;

  return (
    <section className="detection-monitoring" aria-label="Rule execution monitoring">
      <div className="detection-monitoring__controls">
        <label className="detection-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an execution by rule…" aria-label="Search rule executions" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear execution search"><X size={13} /></button>}</label>
        <HaCompactSelect ariaLabel="Execution time range" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        <HaCompactSelect ariaLabel="Execution status" value={status} onChange={(value) => setStatus(value as typeof status)} options={STATUS_OPTIONS} />
        <button type="button" className="detection-monitoring__gap-filter" aria-pressed={onlyGaps} onClick={() => setOnlyGaps((value) => !value)}><TimerReset size={14} /> Only rules with gaps</button>
        <button type="button" className="detection-icon-button" aria-label="Refresh execution monitoring" onClick={() => void executionsQuery.refetch()}><RefreshCw size={15} className={executionsQuery.isFetching ? 'detection-spin' : ''} /></button>
      </div>

      {!executionsQuery.data?.available && !executionsQuery.isLoading && (
        <div className="detection-contract-warning" role="status"><AlertTriangle size={14} /><span><strong>Execution history unavailable.</strong> DET-009 is required for exact runs, phase timings, gaps, manual runs and safe gap repair. Inventory values are not presented as execution records.</span></div>
      )}

      <div className="detection-monitoring__kpis">
        <article data-tone="healthy"><span><CheckCircle2 size={14} /> Successful responses</span><strong>{succeeded || '—'}</strong><small>{allExecutions.length ? `${Math.round(succeeded / allExecutions.length * 100)}% of latest runs` : 'Awaiting execution projection'}</small></article>
        <article data-tone="warning"><span><AlertTriangle size={14} /> Delayed or failed</span><strong>{degraded || '—'}</strong><small>requires analyst review</small></article>
        <article data-tone="warning"><span><TimerReset size={14} /> Coverage gaps</span><strong>{gaps || '—'}</strong><small>unfilled or partially filled</small></article>
        <article><span><Gauge size={14} /> p95 duration</span><strong>{formatDuration(p95)}</strong><small>end-to-end execution</small></article>
      </div>

      <div className="detection-monitoring__trend" aria-label="Execution response trend">
        <header><div><strong>Response trend</strong><span>Latest bounded execution per enabled rule</span></div><div className="detection-monitoring__legend"><span data-status="succeeded">Succeeded</span><span data-status="warning">Warning</span><span data-status="failed">Failed</span></div></header>
        <div>{allExecutions.slice(0, 32).map((run) => <button key={run.id} type="button" data-status={run.status} style={{ '--run-height': `${Math.max(18, Math.min(100, ((run.durationMs ?? 0) / Math.max(1, p95 ?? 1)) * 72))}%` } as React.CSSProperties} title={`${run.ruleName}: ${statusLabel(run.status)}, ${formatDuration(run.durationMs)}`} onClick={() => setSelected(run)}><span /></button>)}</div>
      </div>

      <div className="detection-monitoring__workspace" data-detail-open={Boolean(selected)}>
        <div className="detection-monitoring__table-wrap">
          <div className="detection-monitoring__table-title"><div><strong>Execution log</strong><span>{executions.length} latest responses</span></div><span><Filter size={12} /> {range} · snapshot-bound</span></div>
          {executionsQuery.isLoading ? <div className="detection-grid-loading" aria-label="Loading execution history">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div> : executions.length ? (
            <table className="detection-monitoring__table">
              <thead><tr><th>Last run</th><th>Rule</th><th>Response</th><th>Run type</th><th>Duration</th><th>Events</th><th>Matches</th><th>Alerts</th><th>Gap</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>{executions.map((run) => <tr key={run.id} data-selected={selected?.id === run.id} onClick={() => setSelected(run)}><td><time>{formatTime(run.startedAt)}</time></td><td><strong>{run.ruleName}</strong><small>{run.id}</small></td><td><span className="detection-execution-status" data-status={run.status}>{statusLabel(run.status)}</span></td><td>{run.runType}</td><td>{formatDuration(run.durationMs)}</td><td>{run.eventsScanned?.toLocaleString() ?? '—'}</td><td>{run.matches ?? '—'}</td><td>{run.alertsCreated ?? '—'}</td><td>{run.gapDurationMinutes == null ? '—' : `${run.gapDurationMinutes}m`}</td><td><button type="button" aria-label={`Open execution details for ${run.ruleName}`} onClick={(event) => { event.stopPropagation(); setSelected(run); }}><ChevronRight size={14} /></button></td></tr>)}</tbody>
            </table>
          ) : <div className="detection-state"><History size={30} /><h2>{executionsQuery.data?.available ? 'No executions match these filters' : 'Execution history is not connected'}</h2><p>{executionsQuery.data?.available ? 'Broaden the response or gap filters.' : 'The rule inventory remains usable while the execution-history contract is implemented.'}</p></div>}
        </div>

        {selected && <aside className="detection-execution-detail" aria-label="Execution details">
          <header><div><small>EXECUTION DETAIL</small><h2>{selected.ruleName}</h2><code>{selected.id}</code></div><button type="button" onClick={() => setSelected(null)} aria-label="Close execution details"><X size={15} /></button></header>
          <div className="detection-execution-detail__status"><span className="detection-execution-status" data-status={selected.status}>{statusLabel(selected.status)}</span><span>{selected.runType}</span><time>{formatTime(selected.startedAt)}</time></div>
          <section><h3>Outcome</h3><p>{selected.message}</p><dl><div><dt>Events searched</dt><dd>{selected.eventsScanned?.toLocaleString() ?? 'Unavailable'}</dd></div><div><dt>Matches</dt><dd>{selected.matches ?? 'Unavailable'}</dd></div><div><dt>Alerts created</dt><dd>{selected.alertsCreated ?? 'Unavailable'}</dd></div><div><dt>Source completeness</dt><dd>{selected.sourceCoverage == null ? 'Unavailable' : `${selected.sourceCoverage}%`}</dd></div></dl></section>
          <section><h3>Execution phases</h3><div className="detection-execution-phases"><div><span>Search</span><i style={{ '--phase-width': `${selected.durationMs ? Math.round((selected.searchDurationMs ?? 0) / selected.durationMs * 100) : 0}%` } as React.CSSProperties} /><strong>{formatDuration(selected.searchDurationMs)}</strong></div><div><span>Alert indexing</span><i style={{ '--phase-width': `${selected.durationMs ? Math.round((selected.alertDurationMs ?? 0) / selected.durationMs * 100) : 0}%` } as React.CSSProperties} /><strong>{formatDuration(selected.alertDurationMs)}</strong></div><div><span>Total</span><i style={{ '--phase-width': '100%' } as React.CSSProperties} /><strong>{formatDuration(selected.durationMs)}</strong></div></div></section>
          {selected.gapDurationMinutes != null && <section className="detection-execution-detail__gap"><h3><TimerReset size={13} /> Coverage gap</h3><p>{selected.gapDurationMinutes} minutes remain uncovered. Preview scope, expected executions and alert side effects before starting a fill.</p><button type="button" disabled title="Requires DET-009 preview and gap-fill contracts">Preview gap fill</button></section>}
          <footer><button type="button" disabled title="Requires an execution-scoped alert pivot"><Database size={14} /> View generated alerts</button><button type="button" onClick={() => selectedRule && onOpenRule(selectedRule)} disabled={!selectedRule}>Open rule <ChevronRight size={14} /></button></footer>
        </aside>}
      </div>
    </section>
  );
}
