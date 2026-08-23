/** Compliance assurance — evidence-honest framework inventory over /api/ha-posture. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Columns3, ExternalLink, FileClock, FileText, Filter, History, LayoutList, List, RefreshCw, Search, ShieldCheck, TriangleAlert } from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { postureService } from '@/services/posture.service';
import type { HiveFrameworkScoreDTO } from '@/types/posture.types';

import './CompliancePage.css';

type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;
type AssessmentFilter = 'all' | 'assessed' | 'not_assessed';
type SortOrder = 'attention' | 'score_desc' | 'name';

const ASSESSMENT_OPTIONS: Array<{ value: AssessmentFilter; label: string }> = [
  { value: 'all', label: 'All framework records' },
  { value: 'assessed', label: 'Assessed frameworks' },
  { value: 'not_assessed', label: 'Not yet assessed' },
];
const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: 'attention', label: 'Needs attention first' },
  { value: 'score_desc', label: 'Highest reported score' },
  { value: 'name', label: 'Framework name' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'Not assessed';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function AssessmentState({ framework }: { framework: HiveFrameworkScoreDTO }): JSX.Element {
  const assessed = Boolean(framework.lastAssessed);
  return <span className="cmp-state" data-state={assessed ? 'assessed' : 'unknown'}><span />{assessed ? 'Assessed' : 'Not assessed'}</span>;
}

function ScoreCell({ score, assessed }: { score: number; assessed: boolean }): JSX.Element {
  if (!assessed) return <span className="cmp-score cmp-score--unknown">—<small>no evaluation</small></span>;
  return <span className="cmp-score"><strong>{score.toFixed(1)}%</strong><small>reported technical score</small></span>;
}

function FrameworkDrawer({ framework, onClose }: { framework: HiveFrameworkScoreDTO; onClose: () => void }): JSX.Element {
  const assessed = Boolean(framework.lastAssessed);
  return <HaDrawer isOpen onClose={onClose} title={framework.name} subtitle={framework.version ?? 'Version not reported'} width={540}>
    <div className="cmp-drawer">
      <section className="cmp-drawer__hero"><div><AssessmentState framework={framework} /><span><History size={12} />{formatRelative(framework.lastAssessed)}</span></div><ScoreCell score={framework.overallScore} assessed={assessed} /></section>
      <section className="cmp-drawer__notice"><CircleHelp size={16} /><div><strong>Technical assurance, not attestation</strong><p>The current API reports a framework score and catalog size. It does not return assessment scope, applicability, control outcomes, evidence provenance, owners, exceptions, or testing status.</p></div></section>
      <section className="cmp-drawer__card"><header><ClipboardCheck size={15} /><div><strong>Framework record</strong><span>Current authorized aggregate projection</span></div></header><dl><div><dt>Framework ID</dt><dd>{framework.id}</dd></div><div><dt>Version</dt><dd>{framework.version ?? 'Not reported'}</dd></div><div><dt>Catalog controls</dt><dd>{framework.controlCount.toLocaleString()}</dd></div><div><dt>Last evaluated</dt><dd>{formatTimestamp(framework.lastAssessed)}</dd></div></dl><p>{framework.description ?? 'No framework description was supplied by the current API.'}</p></section>
      <section className="cmp-drawer__card cmp-drawer__card--blocked"><header><FileClock size={15} /><div><strong>Control and evidence workspace</strong><span>Requires CMP-002 and CMP-003</span></div></header><div className="cmp-capability-list"><span><CheckCircle2 size={13} />Control status and applicability</span><span><FileText size={13} />Evidence lineage and observation windows</span><span><ShieldCheck size={13} />Owners, testing state and exceptions</span></div><p>HiveArmor will not fabricate these records. The drawer will progressively load them once the canonical tenant-scoped contracts are available.</p></section>
      <nav className="cmp-pivots" aria-label="Framework pivots"><a href="/posture/cis-benchmark">Review technical checks<ExternalLink size={11} /></a><a href="/reports/scheduled">Scheduled reports<ExternalLink size={11} /></a></nav>
    </div>
  </HaDrawer>;
}

export function CompliancePage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState<AssessmentFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('attention');
  const [density, setDensity] = useState<Density>('standard');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<HiveFrameworkScoreDTO | null>(null);
  const eps = useEpsStream();

  const scoreQuery = useQuery({ queryKey: ['postureScore'], queryFn: ({ signal }) => postureService.getScore(signal), staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 });
  const frameworksQuery = useQuery({ queryKey: ['postureFrameworks'], queryFn: ({ signal }) => postureService.getFrameworks(signal), placeholderData: (previous) => previous, staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 });

  const frameworks = useMemo(() => frameworksQuery.data ?? [], [frameworksQuery.data]);
  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filtered = frameworks.filter((framework) => {
      if (assessmentFilter === 'assessed' && !framework.lastAssessed) return false;
      if (assessmentFilter === 'not_assessed' && framework.lastAssessed) return false;
      if (!normalizedSearch) return true;
      return [framework.name, framework.id, framework.version, framework.description].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedSearch));
    });
    return [...filtered].sort((left, right) => {
      if (sortOrder === 'name') return left.name.localeCompare(right.name);
      if (sortOrder === 'score_desc') return right.overallScore - left.overallScore;
      if (!left.lastAssessed && right.lastAssessed) return -1;
      if (left.lastAssessed && !right.lastAssessed) return 1;
      return left.overallScore - right.overallScore;
    });
  }, [assessmentFilter, frameworks, search, sortOrder]);

  const assessedCount = frameworks.filter((framework) => framework.lastAssessed).length;
  const catalogControlCount = frameworks.reduce((total, framework) => total + framework.controlCount, 0);
  const latestFrameworkAssessment = frameworks.reduce<string | null>((latest, framework) => !framework.lastAssessed ? latest : !latest || new Date(framework.lastAssessed) > new Date(latest) ? framework.lastAssessed : latest, null);
  const latestAssessment = scoreQuery.data?.lastAssessed ?? latestFrameworkAssessment;
  const resetFilters = useCallback(() => { setSearch(''); setAssessmentFilter('all'); setSortOrder('attention'); setActiveIndex(0); }, []);

  useEffect(() => setActiveIndex(0), [assessmentFilter, search, sortOrder]);
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, button, a, [contenteditable=true]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (!rows.length) return;
      if (event.key.toLocaleLowerCase() === 'j') { event.preventDefault(); setActiveIndex((index) => Math.min(rows.length - 1, index + 1)); }
      if (event.key.toLocaleLowerCase() === 'k') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelected(rows[activeIndex] ?? rows[0]); }
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [activeIndex, rows]);
  useEffect(() => { if (rows.length) { gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle'); gridRef.current?.api?.setFocusedCell(activeIndex, 'name'); } }, [activeIndex, rows.length]);

  const columns = useMemo<ColDef[]>(() => [
    { field: 'name', colId: 'name', headerName: 'Framework', minWidth: 280, flex: 1.5, pinned: 'left', cellRenderer: ({ data }: ICellRendererParams<HiveFrameworkScoreDTO>) => data ? <span className="cmp-primary"><ClipboardCheck size={14} /><span><strong>{data.name}</strong><small>{data.id}{data.version ? ` · ${data.version}` : ''}</small></span></span> : null },
    { headerName: 'Assessment state', width: 150, cellRenderer: ({ data }: ICellRendererParams<HiveFrameworkScoreDTO>) => data ? <AssessmentState framework={data} /> : null },
    { field: 'overallScore', headerName: 'Reported score', width: 150, cellRenderer: ({ data }: ICellRendererParams<HiveFrameworkScoreDTO>) => data ? <ScoreCell score={data.overallScore} assessed={Boolean(data.lastAssessed)} /> : null },
    { field: 'controlCount', headerName: 'Catalog controls', width: 128, valueFormatter: ({ value }: { value?: number }) => value?.toLocaleString() ?? '—' },
    { field: 'description', headerName: 'Framework scope', minWidth: 250, flex: 1.3, valueFormatter: ({ value }: { value?: string }) => value || 'No description supplied' },
    { field: 'lastAssessed', headerName: 'Last evaluated', width: 140, cellRenderer: ({ data }: ICellRendererParams<HiveFrameworkScoreDTO>) => data ? <span className="cmp-observed"><strong>{formatRelative(data.lastAssessed)}</strong><small>{formatTimestamp(data.lastAssessed)}</small></span> : null },
    { headerName: '', width: 34, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: () => <ChevronRight className="cmp-row-chevron" size={14} /> },
  ], []);

  const frameworkError = frameworksQuery.error instanceof Error ? frameworksQuery.error.message : 'The framework projection could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(frameworkError);
  const hasFilters = Boolean(search.trim()) || assessmentFilter !== 'all' || sortOrder !== 'attention';
  const refreshing = frameworksQuery.isFetching || scoreQuery.isFetching;

  return <section className="cmp-page" aria-label="Compliance assurance">
    <header className="cmp-header"><div className="cmp-header__identity"><span className="cmp-header__mark"><ClipboardCheck size={19} /></span><div><span>Governance &amp; assurance</span><h1>Compliance Assurance</h1></div></div><div className="cmp-header__actions"><span className="cmp-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/cis-benchmark"><ShieldCheck size={13} />Technical checks</a><a href="/reports/scheduled"><FileText size={13} />Reports</a><button type="button" onClick={() => void Promise.all([scoreQuery.refetch(), frameworksQuery.refetch()])} disabled={refreshing} aria-label="Refresh compliance assurance"><RefreshCw size={14} className={refreshing ? 'cmp-spin' : undefined} /></button></div></header>
    <div className="cmp-trust-strip"><CircleHelp size={13} /><span><strong>Assurance boundary:</strong> scores are technical assessment signals, not certification or legal attestation. Confirm scope, applicability, evidence provenance and freshness before decisions.</span></div>
    <section className="cmp-summary" aria-label="Compliance assessment summary"><div data-tone="info"><span><BarChart3 size={13} />Reported aggregate</span><strong>{scoreQuery.data ? `${scoreQuery.data.overallScore.toFixed(1)}%` : '—'}</strong><small>{scoreQuery.data?.trend ? `${scoreQuery.data.trend} trend reported` : 'score unavailable'}</small></div><div><span><ClipboardCheck size={13} />Framework records</span><strong>{frameworks.length.toLocaleString()}</strong><small>{assessedCount} assessed · {frameworks.length - assessedCount} unknown</small></div><div data-tone="healthy"><span><CheckCircle2 size={13} />Passed checks</span><strong>{scoreQuery.data?.controlsPassed.toLocaleString() ?? '—'}</strong><small>backend aggregate, scope unreported</small></div><div data-tone="critical"><span><TriangleAlert size={13} />Failed checks</span><strong>{scoreQuery.data?.controlsFailed.toLocaleString() ?? '—'}</strong><small>prioritize evidence review</small></div><div><span><FileText size={13} />Catalog controls</span><strong>{catalogControlCount.toLocaleString()}</strong><small>{scoreQuery.data ? `${scoreQuery.data.controlsTotal.toLocaleString()} evaluated aggregate` : 'evaluation count unavailable'}</small></div><div data-tone={!latestAssessment ? 'warning' : undefined}><span><History size={13} />Latest evaluation</span><strong>{formatRelative(latestAssessment)}</strong><small>{formatTimestamp(latestAssessment)}</small></div></section>
    <section className="cmp-operations" aria-label="Framework filters"><div className="cmp-toolbar"><label className="cmp-search"><Search size={14} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find framework, version or scope…" aria-label="Find compliance framework" /><kbd>/</kbd></label><Filter className="cmp-filter-icon" size={13} aria-hidden="true" /><HaCompactSelect ariaLabel="Filter by assessment state" value={assessmentFilter} onChange={setAssessmentFilter} options={ASSESSMENT_OPTIONS} /><HaCompactSelect ariaLabel="Sort framework inventory" value={sortOrder} onChange={setSortOrder} options={SORT_OPTIONS} />{hasFilters && <button className="cmp-clear" type="button" onClick={resetFilters}>Reset view</button>}<span className="cmp-scope"><ShieldCheck size={12} />Authorized API scope</span></div></section>
    {scoreQuery.isError && <div className="cmp-warning"><AlertTriangle size={14} /><span><strong>Aggregate score unavailable.</strong> Framework records remain visible, but passed, failed and evaluated counts cannot be trusted.</span></div>}
    {frameworksQuery.isFetching && frameworksQuery.data && <div className="cmp-refreshing" role="status"><RefreshCw size={12} className="cmp-spin" />Refreshing without clearing the loaded framework projection…</div>}
    <header className="cmp-results-toolbar"><div><strong>Assessment inventory</strong><span>{rows.length.toLocaleString()} of {frameworks.length.toLocaleString()} records · aggregate API, not a control ledger</span></div><div className="cmp-density" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={14} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><LayoutList size={14} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><Columns3 size={14} /></button></div></header>
    {frameworksQuery.isError && !frameworksQuery.data ? <div className="cmp-state-panel" role="alert"><AlertTriangle size={28} /><strong>{forbidden ? 'Compliance assurance access denied' : 'Framework projection unavailable'}</strong><span>{forbidden ? 'Your role or current tenant scope does not permit this framework inventory.' : frameworkError}</span>{!forbidden && <button type="button" onClick={() => frameworksQuery.refetch()}>Retry framework inventory</button>}</div> : !frameworksQuery.isLoading && rows.length === 0 ? <div className="cmp-state-panel" role="status"><ClipboardCheck size={28} /><strong>{hasFilters ? 'No framework records match this view' : 'No framework assessments were returned'}</strong><span>{hasFilters ? 'Reset the view or broaden the framework search.' : 'This is not proof of compliance. Configure a framework and verify assessment ingestion, tenant scope and evidence collection.'}</span>{hasFilters && <button type="button" onClick={resetFilters}>Reset view</button>}</div> : <main className="cmp-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid cmp-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={frameworksQuery.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => { const framework = event.data as HiveFrameworkScoreDTO; setActiveIndex(rows.findIndex((row) => row.id === framework.id)); setSelected(framework); }} getRowId={(params) => String((params.data as HiveFrameworkScoreDTO).id)} defaultColDef={{ filter: false, sortable: false }} ariaLabel="Compliance framework assessment inventory" /></main>}
    <footer className="cmp-footer"><span>{frameworks.length.toLocaleString()} framework records in the loaded projection</span><strong>Control evidence requires canonical CMP contracts</strong><a href="/reports/scheduled">Open reporting workspace<ExternalLink size={11} /></a></footer>
    <StatusDock className="cmp-status-dock" sseConnected={eps.connected} eps={eps.eps} mode="live" lastUpdated={frameworksQuery.dataUpdatedAt ? new Date(frameworksQuery.dataUpdatedAt) : undefined} />
    {selected && <FrameworkDrawer framework={selected} onClose={() => setSelected(null)} />}
  </section>;
}
