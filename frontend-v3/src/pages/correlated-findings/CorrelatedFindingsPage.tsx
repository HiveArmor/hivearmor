import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  GitBranch,
  Layers3,
  ListFilter,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  CORRELATED_FINDINGS_LIST_CONTRACT,
  correlatedFindingsFixtureMode,
  fetchCorrelatedFindings,
} from './correlatedFindings.service';
import type {
  CorrelatedFindingDTO,
  FindingSort,
  FindingView,
} from './correlatedFindings.types';
import { FindingPromotionDialog } from './FindingPromotionDialog';
import { FindingWorkbench } from './FindingWorkbench';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { LiveModeToggle } from '@/components/live-mode-toggle/LiveModeToggle';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { TimeRangeSelector, resolveTimeRange, type TimeRange } from '@/components/time-range-selector';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { getSeverityLabel, type SeverityLevel } from '@/lib/severity';
import { canMutateFindingStatus, findingStatusBlockedTitle } from '@/services/findingStatus.capabilities';
import { useAlertStreamStore } from '@/store/alertStream.store';
import { useAuthStore } from '@/store/auth.store';

import './CorrelatedFindingsPage.css';

/** Distinct from Alerts inventory and Incidents case ownership. */
export const CORRELATED_FINDINGS_JOB_SENTENCE =
  'Review related alerts rolled into one correlated finding — offense-class grouping, not raw alert inventory. Promote to an incident when case ownership is required.';

const livePreset: TimeRange = { type: 'preset', preset: '24h' };

const views: Array<{ id: FindingView; label: string; icon: LucideIcon }> = [
  { id: 'all', label: 'All findings', icon: Layers3 },
  { id: 'open', label: 'Open', icon: ListFilter },
  { id: 'critical', label: 'Critical', icon: ShieldAlert },
];

const statusLabels: Record<CorrelatedFindingDTO['status'], string> = {
  open: 'Open', investigating: 'Investigating', incident_created: 'Incident created', resolved: 'Resolved', false_positive: 'False positive',
};

const kindLabels: Record<CorrelatedFindingDTO['correlationKind'], string> = {
  attack_chain: 'Attack chain', shared_entity: 'Shared entity', behavior_sequence: 'Behavior sequence', campaign: 'Campaign', duplicate_cluster: 'Duplicate cluster',
};

const SEVERITY_OPTIONS: Array<{ value: '' | SeverityLevel; label: string }> = [
  { value: '', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

const STATUS_OPTIONS: Array<{ value: '' | CorrelatedFindingDTO['status']; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'incident_created', label: 'Incident created' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_positive', label: 'False positive' },
];

function relativeTime(value: string): string {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function FindingQueueCard({ finding, selected, onSelect }: { finding: CorrelatedFindingDTO; selected: boolean; onSelect: () => void }): JSX.Element {
  return (
    <article className="correlation-card" data-selected={selected} data-severity={finding.severity}>
      <button type="button" className="correlation-card__select" onClick={onSelect} onDoubleClick={onSelect} aria-pressed={selected} aria-label={`Preview ${finding.title}`}>
        <header><span className="correlation-card__severity"><ShieldAlert size={13} />{getSeverityLabel(finding.severity)}</span><span className="correlation-card__kind"><GitBranch size={12} />{kindLabels[finding.correlationKind]}</span><time title={new Date(finding.lastSeen).toLocaleString()}>{relativeTime(finding.lastSeen)}</time></header>
        <h3>{finding.title}</h3>
        <p>{finding.summary}</p>
        <div className="correlation-card__entities">{finding.entities.slice(0, 2).map((entity) => <span key={entity.id}>{entity.label}</span>)}{finding.entities.length > 2 && <em>+{finding.entities.length - 2}</em>}</div>
        <div className="correlation-card__signals"><span>Risk <strong>{finding.riskScore ?? '—'}</strong></span><span>Confidence <strong>{finding.confidence}%</strong></span><span><strong>{finding.alertCount}</strong> alerts</span><span><strong>{finding.mitreTactics.length}</strong> tactics</span>{finding.intelMatchCount > 0 && <span data-intel="true"><Sparkles size={10} />{finding.intelMatchCount} intel</span>}</div>
        <footer><span data-status={finding.status}>{statusLabels[finding.status]}</span><span data-empty={!finding.owner}><UserRound size={11} />{finding.owner?.name ?? 'Unassigned'}</span><span data-sla={finding.slaStatus}>{finding.slaStatus === 'breached' ? 'SLA breached' : finding.slaStatus === 'at_risk' ? 'SLA at risk' : finding.tenantName}</span></footer>
      </button>
      <Link className="correlation-card__mobile-open" to={`/correlated-findings/${encodeURIComponent(finding.id)}`} aria-label={`Open ${finding.title}`}><ChevronRight size={15} /></Link>
    </article>
  );
}

export function CorrelatedFindingsPage(): JSX.Element {
  const roles = useAuthStore((state) => state.user?.roles);
  const canMutateStatus = canMutateFindingStatus(roles);
  const statusDenyTitle = findingStatusBlockedTitle(roles);

  const [mode, setMode] = useState<'live' | 'historical'>('live');
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [liveRange, setLiveRange] = useState(() => resolveTimeRange(livePreset));
  const [activeView, setActiveView] = useState<FindingView>('all');
  const [statusFilter, setStatusFilter] = useState<'' | CorrelatedFindingDTO['status']>('');
  const [severityFilter, setSeverityFilter] = useState<'' | SeverityLevel>('');
  const [sort, setSort] = useState<FindingSort>('newest');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [promotionFinding, setPromotionFinding] = useState<CorrelatedFindingDTO | null>(null);

  useAlertStream();
  const epsStream = useEpsStream();
  const { connected, newAlertCount, clearNewAlertCount } = useAlertStreamStore();
  const effectiveConnected = correlatedFindingsFixtureMode || connected;
  const historicalRange = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const selectedRange = mode === 'live' ? liveRange : historicalRange;
  const filters = useMemo(() => ({
    ...selectedRange,
    view: activeView,
    ownership: 'all' as const,
    sort,
    search: deferredSearch || undefined,
    status: statusFilter || undefined,
    severity: severityFilter || undefined,
  }), [activeView, deferredSearch, selectedRange, severityFilter, sort, statusFilter]);

  const findingsQuery = useQuery({
    queryKey: ['correlated-findings', filters],
    queryFn: ({ signal }) => fetchCorrelatedFindings(filters, signal),
    staleTime: 20_000,
    retry: correlatedFindingsFixtureMode ? false : 1,
  });
  const result = findingsQuery.data;
  const findings = useMemo(() => result?.items ?? [], [result?.items]);

  useEffect(() => {
    if (!findings.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !findings.some((finding) => finding.id === selectedId)) setSelectedId(findings[0].id);
  }, [findings, selectedId]);

  const selectedFinding = findings.find((finding) => finding.id === selectedId) ?? null;
  const refresh = (): void => {
    clearNewAlertCount();
    if (mode === 'live') setLiveRange(resolveTimeRange(livePreset));
    else void findingsQuery.refetch();
  };

  return (
    <div className="correlated-findings-page">
      {correlatedFindingsFixtureMode && <div className="correlated-findings-page__fixture" role="status"><span><strong>Design fixture:</strong> fictional correlated attack stories are enabled for visual review.</span><span>Production never receives these records.</span></div>}

      <header className="correlated-findings-header">
        <div className="correlated-findings-header__identity">
          <span aria-hidden="true"><GitBranch size={21} /></span>
          <div>
            <small>Correlation operations</small>
            <h1>Correlated Findings</h1>
            <p>{CORRELATED_FINDINGS_JOB_SENTENCE}</p>
          </div>
        </div>
        <div className="correlated-findings-header__actions">
          <span className="correlated-findings-live" data-state={effectiveConnected ? 'live' : 'delayed'}><i />{effectiveConnected ? 'Correlation stream live' : 'Updates delayed'}</span>
          <LiveModeToggle mode={mode} onChange={(nextMode) => { setMode(nextMode); if (nextMode === 'live') setLiveRange(resolveTimeRange(livePreset)); }} sseConnected={effectiveConnected} />
        </div>
      </header>

      <p className="correlated-findings-meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/queue">Analyst Queue</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts inventory</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        {!canMutateStatus && (
          <>
            <span aria-hidden="true">·</span>
            <span className="correlated-findings-meta__warn" title={statusDenyTitle}>Read-only status — {statusDenyTitle}</span>
          </>
        )}
      </p>

      <div className="correlated-findings-sticky" aria-label="Correlation filters">
        <nav className="correlated-findings-views" aria-label="Correlated finding scopes">
          <strong>Scope</strong>
          {views.map((view) => {
            const Icon = view.icon;
            const count = view.id === 'all'
              ? result?.summary.total
              : view.id === 'open'
                ? result?.summary.open
                : view.id === 'critical'
                  ? result?.summary.critical
                  : undefined;
            return (
              <button key={view.id} type="button" data-active={activeView === view.id} onClick={() => setActiveView(view.id)} aria-pressed={activeView === view.id}>
                <Icon size={12} aria-hidden="true" />{view.label}{count !== undefined && <em>{count}</em>}
              </button>
            );
          })}
        </nav>

        <div className="correlated-findings-toolbar">
          <HaCompactSelect
            ariaLabel="Finding status filter"
            label="Status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={(value) => setStatusFilter(value as '' | CorrelatedFindingDTO['status'])}
          />
          <HaCompactSelect
            ariaLabel="Finding severity filter"
            label="Severity"
            value={severityFilter}
            options={SEVERITY_OPTIONS}
            onChange={(value) => setSeverityFilter(value as '' | SeverityLevel)}
          />
          <label className="correlated-findings-search">
            <Search size={14} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search findings, entities…" aria-label="Search correlated findings" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear finding search">×</button>}
          </label>
          <HaCompactSelect
            ariaLabel="Finding order"
            label="Order"
            value={sort}
            options={[
              { value: 'newest', label: 'Newest activity' },
              { value: 'risk_desc', label: 'Highest risk' },
              { value: 'confidence_desc', label: 'Highest confidence' },
              { value: 'alerts_desc', label: 'Most alerts' },
            ]}
            onChange={setSort}
          />
          <div className="correlated-findings-toolbar__spacer" />
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} presets={['1h', '4h', '24h', '7d']} disabled={mode === 'live'} />
          <span className="correlated-findings-snapshot" title={CORRELATED_FINDINGS_LIST_CONTRACT}>
            Snapshot <strong>{result?.snapshotAt ? new Date(result.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong>
          </span>
          <button type="button" className="correlated-findings-refresh" onClick={refresh} aria-label="Refresh correlated findings" title="Refresh findings"><RefreshCw size={15} /></button>
        </div>

        {newAlertCount > 0 && (
          <div className="correlated-findings-updates" role="status" aria-live="polite">
            <GitBranch size={13} />
            <span><strong>{newAlertCount} signal update{newAlertCount === 1 ? '' : 's'} buffered.</strong> Current finding ordering is preserved.</span>
            <button type="button" onClick={refresh}>Load updates</button>
          </div>
        )}
      </div>

      <main className="correlated-findings-workspace">
        <aside className="correlation-feed" aria-label="Correlated findings list">
          <header>
            <div><span>Correlated findings</span><strong>{findingsQuery.isLoading ? '—' : result?.total ?? 0}</strong></div>
            <p>{CORRELATED_FINDINGS_LIST_CONTRACT} · {result?.totalApproximate ? 'approximate' : 'exact'} count</p>
          </header>
          <div className="correlation-feed__list">
            {findingsQuery.isLoading && Array.from({ length: 6 }, (_, index) => <div className="correlation-card-skeleton" key={index}><span /><span /><span /><span /></div>)}
            {findingsQuery.isError && (
              <section className="correlation-feed__state" role="alert">
                <AlertTriangle size={22} />
                <strong>Correlated findings unavailable</strong>
                <p>{findingsQuery.error instanceof Error ? findingsQuery.error.message : 'The offense list could not be loaded.'} Primary contract: {CORRELATED_FINDINGS_LIST_CONTRACT}.</p>
                <button type="button" onClick={() => void findingsQuery.refetch()}>Retry</button>
              </section>
            )}
            {!findingsQuery.isLoading && !findingsQuery.isError && findings.length === 0 && (
              <section className="correlation-feed__state">
                <GitBranch size={22} />
                <strong>No findings match this scope</strong>
                <p>Adjust status, severity, search, or time range. Empty lists are honest when the offense index has no matching documents.</p>
                <button type="button" onClick={() => { setActiveView('all'); setStatusFilter(''); setSeverityFilter(''); setSearch(''); }}>Clear filters</button>
              </section>
            )}
            {findings.map((finding) => (
              <FindingQueueCard key={finding.id} finding={finding} selected={finding.id === selectedId} onSelect={() => setSelectedId(finding.id)} />
            ))}
          </div>
          {result?.nextCursor && (
            <footer>
              <span>Showing the highest-priority {findings.length} findings.</span>
              <button type="button" disabled title="Cursor pagination activates when the list contract returns a next cursor">Load more</button>
            </footer>
          )}
        </aside>

        <section className="correlation-preview" aria-label="Selected finding preview">
          {selectedFinding ? (
            <FindingWorkbench finding={selectedFinding} compact onPromote={() => setPromotionFinding(selectedFinding)} />
          ) : (
            <div className="correlation-preview__empty">
              <GitBranch size={26} />
              <strong>Select a correlated finding</strong>
              <p>Related alerts, status controls, and promotion honesty open here without leaving the list.</p>
            </div>
          )}
        </section>
      </main>

      <StatusDock sseConnected={effectiveConnected && (correlatedFindingsFixtureMode || epsStream.connected)} eps={correlatedFindingsFixtureMode ? 12840 : epsStream.eps} mode={mode} />
      <FindingPromotionDialog finding={promotionFinding} onClose={() => setPromotionFinding(null)} />
    </div>
  );
}
