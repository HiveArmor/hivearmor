import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  CircleDot,
  Clock3,
  Layers3,
  ListFilter,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { fetchSeverityBoard, severityBoardFixtureMode } from './severityBoard.service';
import type { SeverityBoardFilters, SeverityBoardOwnership, SeverityBoardScope, SeverityTrendBucket } from './severityBoard.types';
import { SeverityLane } from './SeverityTile';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { LiveModeToggle } from '@/components/live-mode-toggle/LiveModeToggle';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { TimeRangeSelector, resolveTimeRange, type TimeRange } from '@/components/time-range-selector';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { getSeverityLabel, type SeverityLevel } from '@/lib/severity';
import { useAlertStreamStore } from '@/store/alertStream.store';

import './AlertSeverityBoardPage.css';

const severityOrder: SeverityLevel[] = ['critical', 'high', 'medium', 'low', 'info'];
const livePreset: TimeRange = { type: 'preset', preset: '24h' };

function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString();
}

function PressureMetric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number | null | undefined; detail: string; tone: string }): JSX.Element {
  return (
    <div className="severity-pressure-metric" data-tone={tone}>
      <span aria-hidden="true"><Icon size={14} /></span>
      <div><small>{label}</small><strong>{formatCount(value)}</strong><em>{detail}</em></div>
    </div>
  );
}

function ArrivalPulse({ trend }: { trend: SeverityTrendBucket[] }): JSX.Element {
  const maximum = Math.max(1, ...trend.map((bucket) => bucket.total));
  return (
    <section className="severity-arrival-pulse" aria-labelledby="severity-arrival-title">
      <header><div><span>Volume</span><h2 id="severity-arrival-title">Arrival pulse</h2></div><Activity size={16} aria-hidden="true" /></header>
      <div className="severity-arrival-pulse__chart" aria-label="Alert arrival trend">
        {trend.map((bucket, index) => (
          <div key={bucket.start} className="severity-arrival-pulse__bucket" title={`${bucket.label}: ${bucket.total} alerts`}>
            <span className="severity-arrival-pulse__bar" style={{ height: `${Math.max(5, (bucket.total / maximum) * 100)}%` }}>
              {severityOrder.map((severity) => bucket[severity] > 0 && (
                <i key={severity} data-severity={severity} style={{ flexGrow: bucket[severity] }} />
              ))}
            </span>
            {(index === 0 || index === trend.length - 1) && <small>{bucket.label}</small>}
          </div>
        ))}
      </div>
      <footer><span>Older</span><span>Rolling activity</span><span>Now</span></footer>
    </section>
  );
}

export function AlertSeverityBoardPage(): JSX.Element {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'live' | 'historical'>('live');
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [liveRange, setLiveRange] = useState(() => resolveTimeRange(livePreset));
  const [scope, setScope] = useState<SeverityBoardScope>('active');
  const [ownership, setOwnership] = useState<SeverityBoardOwnership>('all');

  useAlertStream();
  const epsStream = useEpsStream();
  const { connected: streamConnected, newAlertCount, clearNewAlertCount } = useAlertStreamStore();
  const effectiveStreamConnected = severityBoardFixtureMode || streamConnected;
  const effectiveEpsConnected = severityBoardFixtureMode || epsStream.connected;
  const effectiveEps = severityBoardFixtureMode ? 12840 : epsStream.eps;
  const historicalRange = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const selectedRange = mode === 'live' ? liveRange : historicalRange;
  const filters = useMemo<SeverityBoardFilters>(() => ({
    ...selectedRange,
    scope,
    ownership,
  }), [ownership, scope, selectedRange]);

  const boardQuery = useQuery({
    queryKey: ['alerts', 'severity-board', filters],
    queryFn: ({ signal }) => fetchSeverityBoard(filters, signal),
    staleTime: 20_000,
    retry: severityBoardFixtureMode ? false : 1,
  });
  const board = boardQuery.data;

  const refreshBoard = (): void => {
    clearNewAlertCount();
    if (mode === 'live') setLiveRange(resolveTimeRange(livePreset));
    else void boardQuery.refetch();
  };

  const openSeverityQueue = (severity: SeverityLevel): void => {
    const params = new URLSearchParams({ severity, status: scope });
    if (ownership !== 'all') params.set('assignee', ownership === 'mine' ? 'me' : 'unassigned');
    if (mode === 'historical') {
      params.set('mode', 'historical');
      params.set('from', selectedRange.from);
      params.set('to', selectedRange.to);
    }
    navigate(`/alerts?${params.toString()}`);
  };

  const total = board?.overview.total ?? 0;
  const snapshotLabel = board?.snapshotAt
    ? new Date(board.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Awaiting data';

  return (
    <div className="severity-board-page">
      {severityBoardFixtureMode && (
        <div className="severity-board-page__fixture" role="status"><span><strong>Design fixture:</strong> fictional severity workload is enabled for visual review.</span><span>Production never receives these records.</span></div>
      )}

      <header className="severity-board-header">
        <div className="severity-board-header__identity">
          <span aria-hidden="true"><Layers3 size={20} /></span>
          <div><small>Detection operations</small><h1>Severity Board</h1><p>Balance analyst attention across impact, urgency, ownership, and response pressure.</p></div>
        </div>
        <div className="severity-board-header__actions">
          <div className="severity-board-stream" data-state={effectiveStreamConnected ? 'live' : 'delayed'}><span aria-hidden="true" /><div><strong>{effectiveStreamConnected ? 'Live board' : 'Updates delayed'}</strong><small>{mode === 'live' ? 'Rolling 24-hour workload' : 'Historical snapshot'}</small></div></div>
          <Link to="/alerts" className="severity-board-route"><ListFilter size={15} aria-hidden="true" />Alert queue</Link>
          <LiveModeToggle mode={mode} onChange={(nextMode) => {
            setMode(nextMode);
            if (nextMode === 'live') setLiveRange(resolveTimeRange(livePreset));
          }} sseConnected={effectiveStreamConnected} />
        </div>
      </header>

      <div className="severity-board-sticky" aria-label="Severity Board controls and workload summary">
        <div className="severity-board-toolbar">
          <div className="severity-board-toolbar__group" aria-label="Board scope">
            <span>Scope</span>
            {(['active', 'all'] as const).map((option) => (
              <button key={option} type="button" data-active={scope === option} onClick={() => setScope(option)} aria-pressed={scope === option}>{option === 'active' ? 'Active work' : 'All alerts'}</button>
            ))}
          </div>
          <HaCompactSelect
            ariaLabel="Severity Board ownership"
            className="severity-board-ownership"
            label="Ownership"
            value={ownership}
            options={[
              { value: 'all', label: 'All ownership' },
              { value: 'mine', label: 'Assigned to me' },
              { value: 'unassigned', label: 'Unassigned' },
            ]}
            onChange={setOwnership}
          />
          <div className="severity-board-toolbar__spacer" />
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} presets={['1h', '4h', '24h', '7d']} disabled={mode === 'live'} />
          <span className="severity-board-snapshot">Snapshot <strong>{snapshotLabel}</strong></span>
          <button type="button" className="severity-board-refresh" onClick={refreshBoard} aria-label="Refresh Severity Board" title="Refresh board"><RefreshCw size={15} aria-hidden="true" /></button>
        </div>

        {newAlertCount > 0 && (
          <div className="severity-board-new-alerts" role="status" aria-live="polite"><CircleDot size={14} aria-hidden="true" /><span><strong>{newAlertCount} new alert{newAlertCount === 1 ? '' : 's'} buffered.</strong> Board ordering remains stable until you refresh.</span><button type="button" onClick={refreshBoard}>Load updates</button></div>
        )}

        {!boardQuery.isError && (
          <section className="severity-board-overview" aria-label="Severity workload overview">
            <div className="severity-distribution">
              <header><div><span>Workload</span><h2>{scope === 'active' ? 'Active severity distribution' : 'Severity distribution'}</h2></div><strong>{boardQuery.isLoading ? '—' : formatCount(total)}</strong></header>
              <div className="severity-distribution__bar" aria-hidden="true">
                {severityOrder.map((severity) => {
                  const laneCount = board?.lanes.find((lane) => lane.severity === severity)?.count ?? 0;
                  return laneCount > 0 && <span key={severity} data-severity={severity} style={{ width: `${(laneCount / Math.max(1, total)) * 100}%` }} />;
                })}
              </div>
              <div className="severity-distribution__legend">
                {severityOrder.map((severity) => {
                  const laneCount = board?.lanes.find((lane) => lane.severity === severity)?.count;
                  return <button key={severity} type="button" onClick={() => openSeverityQueue(severity)} disabled={!laneCount}><span data-severity={severity} aria-hidden="true" /><strong>{getSeverityLabel(severity)}</strong><em>{boardQuery.isLoading ? '—' : formatCount(laneCount)}</em></button>;
                })}
              </div>
            </div>

            <section className="severity-response-pressure" aria-labelledby="severity-pressure-title">
              <header><div><span>Operations</span><h2 id="severity-pressure-title">Response pressure</h2></div><ShieldAlert size={16} aria-hidden="true" /></header>
              <div>
                <PressureMetric icon={ShieldAlert} label="Critical open" value={board?.overview.criticalOpen} detail="highest impact" tone="critical" />
                <PressureMetric icon={Clock3} label="SLA pressure" value={board?.overview.slaPressure} detail="risk or breach" tone="warning" />
                <PressureMetric icon={UserRound} label="Unassigned" value={board?.overview.unassigned} detail="without owner" tone="owner" />
                <PressureMetric icon={Sparkles} label="Intel matched" value={board?.overview.threatIntelMatched} detail="enriched scope" tone="intel" />
              </div>
            </section>

            <ArrivalPulse trend={board?.trend ?? []} />
          </section>
        )}
      </div>

      <main className="severity-board-main">
        {boardQuery.isError ? (
          <section className="severity-board-error" role="alert"><AlertTriangle size={22} aria-hidden="true" /><div><strong>Severity workload unavailable</strong><span>{boardQuery.error instanceof Error ? boardQuery.error.message : 'The board projection could not be loaded.'} Production requires the bounded `ALT-023` contract.</span></div><button type="button" onClick={() => void boardQuery.refetch()}>Retry</button></section>
        ) : (
          <>
            <section className="severity-board-workload" aria-labelledby="severity-workload-title">
              <header>
                <div><span>Prioritized work</span><h2 id="severity-workload-title">Severity lanes</h2><p>Each lane is ordered by risk score, then newest detection. Open an alert for full investigation.</p></div>
                <div><span><i data-severity="critical" />Critical first</span><span><ChevronRight size={12} aria-hidden="true" />Lane to queue</span></div>
              </header>
              <div className="severity-board-lanes" aria-busy={boardQuery.isLoading}>
                {boardQuery.isLoading ? severityOrder.map((severity) => <div key={severity} className="severity-lane-skeleton" data-severity={severity}><span /><span /><span /><span /><span /></div>) : board?.lanes.map((lane) => <SeverityLane key={lane.severity} lane={lane} onViewAll={() => openSeverityQueue(lane.severity)} />)}
              </div>
            </section>
          </>
        )}
      </main>

      <StatusDock sseConnected={effectiveStreamConnected || effectiveEpsConnected} eps={effectiveEps} mode={mode} />
    </div>
  );
}
