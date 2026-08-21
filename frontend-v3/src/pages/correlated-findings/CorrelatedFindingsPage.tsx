import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  GitBranch,
  Layers3,
  ListFilter,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  correlatedFindingsFixtureMode,
  fetchCorrelatedFindings,
} from './correlatedFindings.service';
import type {
  CorrelatedFindingDTO,
  FindingOwnership,
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
import { getSeverityLabel } from '@/lib/severity';
import { useAlertStreamStore } from '@/store/alertStream.store';

import './CorrelatedFindingsPage.css';

const livePreset: TimeRange = { type: 'preset', preset: '24h' };

const views: Array<{ id: FindingView; label: string; icon: LucideIcon; countKey?: 'open' | 'critical' | 'multiStage' | 'slaPressure' | 'unassigned' }> = [
  { id: 'needs_review', label: 'Needs review', icon: ListFilter, countKey: 'open' },
  { id: 'mine', label: 'My findings', icon: UserRound },
  { id: 'critical', label: 'Critical', icon: ShieldAlert, countKey: 'critical' },
  { id: 'multi_stage', label: 'Multi-stage', icon: GitBranch, countKey: 'multiStage' },
  { id: 'sla_risk', label: 'SLA risk', icon: Clock3, countKey: 'slaPressure' },
  { id: 'unassigned', label: 'Unassigned', icon: Target, countKey: 'unassigned' },
  { id: 'all', label: 'All findings', icon: Layers3 },
];

const statusLabels: Record<CorrelatedFindingDTO['status'], string> = {
  open: 'Open', investigating: 'Investigating', incident_created: 'Incident created', resolved: 'Resolved', false_positive: 'False positive',
};

const kindLabels: Record<CorrelatedFindingDTO['correlationKind'], string> = {
  attack_chain: 'Attack chain', shared_entity: 'Shared entity', behavior_sequence: 'Behavior sequence', campaign: 'Campaign', duplicate_cluster: 'Duplicate cluster',
};

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
  const [mode, setMode] = useState<'live' | 'historical'>('live');
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [liveRange, setLiveRange] = useState(() => resolveTimeRange(livePreset));
  const [activeView, setActiveView] = useState<FindingView>('needs_review');
  const [ownership, setOwnership] = useState<FindingOwnership>('all');
  const [sort, setSort] = useState<FindingSort>('risk_desc');
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
    ownership,
    sort,
    search: deferredSearch || undefined,
  }), [activeView, deferredSearch, ownership, selectedRange, sort]);

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
        <div className="correlated-findings-header__identity"><span aria-hidden="true"><GitBranch size={21} /></span><div><small>Correlation operations</small><h1>Correlated Findings</h1><p>Review related alerts as one explainable attack story, then decide whether to investigate, dismiss, or promote.</p></div></div>
        <div className="correlated-findings-header__actions"><span className="correlated-findings-live" data-state={effectiveConnected ? 'live' : 'delayed'}><i />{effectiveConnected ? 'Correlation stream live' : 'Updates delayed'}</span><Link to="/alerts"><ListFilter size={14} />Alert queue</Link><LiveModeToggle mode={mode} onChange={(nextMode) => { setMode(nextMode); if (nextMode === 'live') setLiveRange(resolveTimeRange(livePreset)); }} sseConnected={effectiveConnected} /></div>
      </header>

      <div className="correlated-findings-sticky" aria-label="Correlation controls and workload summary">
        <section className="correlated-findings-metrics" aria-label="Correlation workload summary">
          <button type="button" onClick={() => setActiveView('needs_review')}><span>Open stories</span><strong>{findingsQuery.isLoading ? '—' : result?.summary.open ?? 0}</strong><em>requiring disposition</em></button>
          <button type="button" data-tone="critical" onClick={() => setActiveView('critical')}><span>Critical exposure</span><strong>{findingsQuery.isLoading ? '—' : result?.summary.critical ?? 0}</strong><em>highest impact</em></button>
          <button type="button" data-tone="warning" onClick={() => setActiveView('sla_risk')}><span>SLA pressure</span><strong>{findingsQuery.isLoading ? '—' : result?.summary.slaPressure ?? 0}</strong><em>risk or breach</em></button>
          <button type="button" onClick={() => setActiveView('unassigned')}><span>Unassigned</span><strong>{findingsQuery.isLoading ? '—' : result?.summary.unassigned ?? 0}</strong><em>without owner</em></button>
          <button type="button" data-tone="intel" onClick={() => setActiveView('multi_stage')}><span>Multi-stage</span><strong>{findingsQuery.isLoading ? '—' : result?.summary.multiStage ?? 0}</strong><em>3+ ATT&amp;CK tactics</em></button>
        </section>

        <nav className="correlated-findings-views" aria-label="Correlated finding views">
          <strong>Views</strong>{views.map((view) => { const Icon = view.icon; const count = view.id === 'all' ? result?.summary.total : view.countKey ? result?.summary[view.countKey] : undefined; return <button key={view.id} type="button" data-active={activeView === view.id} onClick={() => setActiveView(view.id)} aria-pressed={activeView === view.id}><Icon size={12} aria-hidden="true" />{view.label}{count !== undefined && <em>{count}</em>}</button>; })}
        </nav>

        <div className="correlated-findings-toolbar">
          <label className="correlated-findings-search"><Search size={14} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stories, entities, techniques…" aria-label="Search correlated findings" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear finding search">×</button>}</label>
          <HaCompactSelect ariaLabel="Finding ownership" label="Ownership" value={ownership} options={[{ value: 'all', label: 'All ownership' }, { value: 'mine', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }]} onChange={setOwnership} />
          <HaCompactSelect ariaLabel="Finding order" label="Order" value={sort} options={[{ value: 'risk_desc', label: 'Highest risk' }, { value: 'newest', label: 'Newest activity' }, { value: 'confidence_desc', label: 'Highest confidence' }, { value: 'alerts_desc', label: 'Most alerts' }]} onChange={setSort} />
          <div className="correlated-findings-toolbar__spacer" />
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} presets={['1h', '4h', '24h', '7d']} disabled={mode === 'live'} />
          <span className="correlated-findings-snapshot">Snapshot <strong>{result?.snapshotAt ? new Date(result.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></span>
          <button type="button" className="correlated-findings-refresh" onClick={refresh} aria-label="Refresh correlated findings" title="Refresh findings"><RefreshCw size={15} /></button>
        </div>

        {newAlertCount > 0 && <div className="correlated-findings-updates" role="status" aria-live="polite"><GitBranch size={13} /><span><strong>{newAlertCount} signal update{newAlertCount === 1 ? '' : 's'} buffered.</strong> Current story ordering is preserved.</span><button type="button" onClick={refresh}>Load updates</button></div>}
      </div>

      <main className="correlated-findings-workspace">
        <aside className="correlation-feed" aria-label="Correlated findings list">
          <header><div><span>Attack stories</span><strong>{findingsQuery.isLoading ? '—' : result?.total ?? 0}</strong></div><p>Risk-ranked · 25-item batch · {result?.totalApproximate ? 'approximate' : 'exact'} count</p></header>
          <div className="correlation-feed__list">
            {findingsQuery.isLoading && Array.from({ length: 6 }, (_, index) => <div className="correlation-card-skeleton" key={index}><span /><span /><span /><span /></div>)}
            {findingsQuery.isError && <section className="correlation-feed__state" role="alert"><AlertTriangle size={22} /><strong>Correlation workload unavailable</strong><p>{findingsQuery.error instanceof Error ? findingsQuery.error.message : 'The attack-story projection could not be loaded.'} Production requires contract `COR-001`.</p><button type="button" onClick={() => void findingsQuery.refetch()}>Retry</button></section>}
            {!findingsQuery.isLoading && !findingsQuery.isError && findings.length === 0 && <section className="correlation-feed__state"><GitBranch size={22} /><strong>No stories match this view</strong><p>Adjust the view, ownership, search, or time range.</p><button type="button" onClick={() => { setActiveView('all'); setOwnership('all'); setSearch(''); }}>Clear filters</button></section>}
            {findings.map((finding) => <FindingQueueCard key={finding.id} finding={finding} selected={finding.id === selectedId} onSelect={() => setSelectedId(finding.id)} />)}
          </div>
          {result?.nextCursor && <footer><span>Showing the highest-priority {findings.length} stories.</span><button type="button" disabled title="Cursor pagination activates with the production COR-001 contract">Load more</button></footer>}
        </aside>

        <section className="correlation-preview" aria-label="Selected correlation preview">
          {selectedFinding ? <FindingWorkbench finding={selectedFinding} compact onPromote={() => setPromotionFinding(selectedFinding)} /> : <div className="correlation-preview__empty"><GitBranch size={26} /><strong>Select an attack story</strong><p>Its correlation explanation, chronology, entities, and evidence will open here without losing queue context.</p></div>}
        </section>
      </main>

      <StatusDock sseConnected={effectiveConnected && (correlatedFindingsFixtureMode || epsStream.connected)} eps={correlatedFindingsFixtureMode ? 12840 : epsStream.eps} mode={mode} />
      <FindingPromotionDialog finding={promotionFinding} onClose={() => setPromotionFinding(null)} />
    </div>
  );
}
