/** CIS Benchmark posture — evidence-led SCA operations over /api/ha-cis. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Columns3,
  Copy,
  ExternalLink,
  FileCheck2,
  Filter,
  History,
  LayoutList,
  List,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Tags,
  TerminalSquare,
  TriangleAlert,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { fetchCisCatalog, fetchScaResult, fetchScaResults, fetchScaSummary } from '@/services/vulnService';
import type { CisLevel, CisPackCatalogDTO, ScaResultDTO, ScaStatus, ScaSummaryDTO } from '@/types/vuln.types';

import './CisBenchmarkPage.css';

const PAGE_SIZE = 50;

type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;
type StatusFilter = 'all' | ScaStatus;
type LevelFilter = 'all' | CisLevel;
type AgentFilter = 'all' | string;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All outcomes' },
  { value: 'FAIL', label: 'Failed checks' },
  { value: 'ERROR', label: 'Collection errors' },
  { value: 'PASS', label: 'Passed checks' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable' },
];

const LEVEL_OPTIONS: Array<{ value: LevelFilter; label: string }> = [
  { value: 'all', label: 'All profile levels' },
  { value: 'L1', label: 'CIS Level 1' },
  { value: 'L2', label: 'CIS Level 2' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed)) return 'Unknown';
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusBadge({ status }: { status: ScaStatus }): JSX.Element {
  const label = status === 'NOT_APPLICABLE' ? 'Not applicable' : status.toLowerCase();
  return <span className="cis-status" data-status={status.toLowerCase()}><span />{label}</span>;
}

function LevelBadge({ level }: { level: CisLevel | null }): JSX.Element {
  return <span className="cis-level">{level ?? 'Unclassified'}</span>;
}

function distinctAgents(summaries: ScaSummaryDTO[]): Array<{ value: AgentFilter; label: string }> {
  const seen = new Set<string>();
  const agents = summaries.filter((summary) => {
    if (seen.has(summary.agentId)) return false;
    seen.add(summary.agentId);
    return true;
  });
  return [{ value: 'all', label: 'All reporting endpoints' }, ...agents.map((summary) => ({ value: summary.agentId, label: summary.agentHostname ?? summary.agentId }))];
}

function CheckDrawer({ check, onClose }: { check: ScaResultDTO; onClose: () => void }): JSX.Element {
  const detailQuery = useQuery({
    queryKey: ['cis-result', check.id],
    queryFn: ({ signal }) => fetchScaResult(check.id, signal),
    initialData: check,
    staleTime: 20_000,
  });
  const detail = detailQuery.data ?? check;
  const copy = useCallback((value: string | null | undefined) => {
    if (value) void navigator.clipboard?.writeText(value);
  }, []);

  return (
    <HaDrawer isOpen onClose={onClose} title={detail.checkId} subtitle={detail.checkTitle} width={540}>
      <div className="cis-drawer">
        <section className="cis-drawer__headline"><div><StatusBadge status={detail.status} /><LevelBadge level={detail.level} /></div><span><History size={12} />{formatRelative(detail.scannedAt)}</span></section>

        {detail.status === 'ERROR' && <section className="cis-drawer__notice" data-tone="warning"><TriangleAlert size={16} /><div><strong>Assessment collection error</strong><p>This result is unknown, not failed or passed. Resolve collection coverage before using the score for a decision.</p></div></section>}
        {detail.status === 'PASS' && <section className="cis-drawer__notice" data-tone="healthy"><CheckCircle2 size={16} /><div><strong>Check passed at observation time</strong><p>A passing technical check is evidence, not a compliance attestation. Confirm benchmark applicability, freshness and source coverage.</p></div></section>}

        <section className="cis-drawer__card">
          <header><ClipboardCheck size={15} /><div><strong>Assessment context</strong><span>Current backend result projection</span></div></header>
          <dl><div><dt>Benchmark pack</dt><dd>{detail.packId ?? 'Not reported'}</dd></div><div><dt>Profile</dt><dd>{detail.level ?? 'Not reported'}</dd></div><div><dt>Endpoint</dt><dd>{detail.agentHostname ?? 'Not reported'}</dd></div><div><dt>Scanned</dt><dd>{formatTimestamp(detail.scannedAt)}</dd></div></dl>
          <div className="cis-copy-row"><span>Agent ID</span><code>{detail.agentId}</code><button type="button" onClick={() => copy(detail.agentId)} aria-label="Copy agent ID"><Copy size={12} /></button></div>
          <div className="cis-copy-row"><span>Check ID</span><code>{detail.checkId}</code><button type="button" onClick={() => copy(detail.checkId)} aria-label="Copy check ID"><Copy size={12} /></button></div>
        </section>

        <section className="cis-drawer__card">
          <header><TerminalSquare size={15} /><div><strong>Observed versus expected</strong><span>Technical evidence returned by the agent</span></div></header>
          <div className="cis-evidence"><div><span>Observed</span><pre>{detail.observedValue ?? 'No observed value supplied'}</pre></div><div><span>Expected</span><pre>{detail.expectedValue ?? 'No expected value supplied'}</pre></div></div>
          <p className="cis-drawer__hint"><CircleHelp size={13} />The current contract has no command, file, registry, policy or source-record provenance for these values.</p>
        </section>

        <section className="cis-drawer__card">
          <header><Settings2 size={15} /><div><strong>Remediation guidance</strong><span>Review before applying to production</span></div></header>
          <p className="cis-remediation">{detail.remediation ?? 'No remediation guidance was supplied by the benchmark pack.'}</p>
        </section>

        {(detail.mitre.length > 0 || detail.complianceTags.length > 0) && <section className="cis-drawer__card"><header><Tags size={15} /><div><strong>Mappings</strong><span>Informational control relationships</span></div></header>{detail.mitre.length > 0 && <div className="cis-tags"><span>ATT&amp;CK</span><div>{detail.mitre.map((item) => <a key={item} href={`https://attack.mitre.org/techniques/${item.replace(/\./g, '/')}`} target="_blank" rel="noreferrer">{item}<ExternalLink size={10} /></a>)}</div></div>}{detail.complianceTags.length > 0 && <div className="cis-tags"><span>Control tags</span><div>{detail.complianceTags.map((item) => <em key={item}>{item}</em>)}</div></div>}</section>}

        <nav className="cis-pivots" aria-label="Assessment pivots"><a href={`/posture/assets?search=${encodeURIComponent(detail.agentHostname ?? detail.agentId)}`}>Inspect endpoint<ExternalLink size={11} /></a><a href={`/search?query=${encodeURIComponent(`host.name:${detail.agentHostname ?? detail.agentId}`)}`}>Hunt endpoint events<ExternalLink size={11} /></a></nav>
        <p className="cis-governance"><ShieldCheck size={13} />Rescan, exception and remediation actions remain unavailable until target-bound preview, authorization, execution, verification and audit contracts exist.</p>
      </div>
    </HaDrawer>
  );
}

export function CisBenchmarkPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [checkId, setCheckId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('FAIL');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [agent, setAgent] = useState<AgentFilter>('all');
  const [density, setDensity] = useState<Density>('standard');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<ScaResultDTO | null>(null);
  const eps = useEpsStream();

  const filters = useMemo(() => ({ checkId: checkId || undefined, status: status === 'all' ? undefined : status, level: level === 'all' ? undefined : level, agentId: agent === 'all' ? undefined : agent, page, size: PAGE_SIZE }), [agent, checkId, level, page, status]);
  const resultsQuery = useQuery({ queryKey: ['cis-results', filters], queryFn: ({ signal }) => fetchScaResults(filters, signal), placeholderData: (previous) => previous, staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
  const summaryQuery = useQuery({ queryKey: ['cis-summary'], queryFn: ({ signal }) => fetchScaSummary(undefined, signal), staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
  const catalogQuery = useQuery({ queryKey: ['cis-catalog'], queryFn: ({ signal }) => fetchCisCatalog(signal), staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });

  const rows = useMemo(() => resultsQuery.data?.results ?? [], [resultsQuery.data?.results]);
  const summaries = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data]);
  const agentOptions = useMemo(() => distinctAgents(summaries), [summaries]);
  const total = resultsQuery.data?.total ?? 0;
  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;
  const pageStart = rows.length ? page * PAGE_SIZE + 1 : 0;
  const pageEnd = page * PAGE_SIZE + rows.length;
  const pass = summaries.reduce((sum, item) => sum + item.passCount, 0);
  const fail = summaries.reduce((sum, item) => sum + item.failCount, 0);
  const errors = summaries.reduce((sum, item) => sum + item.errorCount, 0);
  const notApplicable = summaries.reduce((sum, item) => sum + item.naCount, 0);
  const denominator = pass + fail + errors;
  const fleetScore = denominator ? (pass / denominator) * 100 : null;
  const latestScan = summaries.reduce<string | null>((latest, item) => !latest || new Date(item.scannedAt) > new Date(latest) ? item.scannedAt : latest, null);
  const endpointCount = new Set(summaries.map((item) => item.agentId)).size;
  const packCount = new Set(summaries.map((item) => item.packId)).size;
  const catalogRows = Array.isArray(catalogQuery.data) ? catalogQuery.data : [];
  const catalogPacks = catalogRows.length ? catalogRows.length : packCount;
  const officialNotShipped = catalogRows.some((pack) => pack.licenseState === 'LICENSE_REQUIRED_NOT_SHIPPED');
  const hasFilters = Boolean(checkId) || status !== 'all' || level !== 'all' || agent !== 'all';

  const reset = useCallback(() => { setSearchDraft(''); setCheckId(''); setStatus('FAIL'); setLevel('all'); setAgent('all'); setPage(0); setActiveIndex(0); }, []);
  const commitSearch = useCallback(() => { setCheckId(searchDraft.trim()); setPage(0); setActiveIndex(0); }, [searchDraft]);

  useEffect(() => { setPage(0); setActiveIndex(0); }, [agent, level, status]);
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, button, a, [contenteditable=true]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (!rows.length) return;
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setActiveIndex((index) => Math.min(rows.length - 1, index + 1)); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelected(rows[activeIndex] ?? rows[0]); }
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [activeIndex, rows]);
  useEffect(() => { if (rows.length) { gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle'); gridRef.current?.api?.setFocusedCell(activeIndex, 'checkId'); } }, [activeIndex, rows.length]);

  const columns = useMemo<ColDef[]>(() => [
    { field: 'checkId', colId: 'checkId', headerName: 'Assessment check', minWidth: 255, flex: 1.4, pinned: 'left', cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <span className="cis-primary"><FileCheck2 size={14} /><span><strong>{data.checkId}</strong><small>{data.checkTitle}</small></span></span> : null },
    { field: 'status', headerName: 'Outcome', width: 128, cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <StatusBadge status={data.status} /> : null },
    { field: 'level', headerName: 'Profile', width: 94, cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <LevelBadge level={data.level} /> : null },
    { field: 'agentHostname', headerName: 'Endpoint', minWidth: 150, flex: 1, cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <span className="cis-two-line"><strong>{data.agentHostname ?? 'Hostname unavailable'}</strong><small>{data.agentId}</small></span> : null },
    { field: 'packId', headerName: 'Benchmark pack', width: 150, valueFormatter: ({ value }: { value?: string }) => value ?? 'Not reported' },
    { headerName: 'Evidence', minWidth: 210, flex: 1.2, cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <span className="cis-two-line"><strong>{data.observedValue ?? 'No observed value'}</strong><small>Expected: {data.expectedValue ?? 'not supplied'}</small></span> : null },
    { field: 'scannedAt', headerName: 'Observed', width: 120, cellRenderer: ({ data }: ICellRendererParams<ScaResultDTO>) => data ? <span className="cis-two-line"><strong>{formatRelative(data.scannedAt)}</strong><small>{formatTimestamp(data.scannedAt)}</small></span> : null },
    { headerName: '', width: 34, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: () => <ChevronRight className="cis-row-chevron" size={14} /> },
  ], []);

  const errorText = resultsQuery.error instanceof Error ? resultsQuery.error.message : 'The benchmark assessment source could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorText);

  return <section className="cis-page" aria-label="CIS benchmark posture">
    <header className="cis-header"><div className="cis-header__identity"><span className="cis-header__mark"><ClipboardCheck size={19} /></span><div><span>Posture &amp; exposure</span><h1>CIS Benchmark Posture</h1></div></div><div className="cis-header__actions"><span className="cis-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/assets"><Server size={13} />Assets</a><a href="/posture/vulnerabilities"><ShieldAlert size={13} />Vulnerabilities</a><a href="/compliance"><ClipboardCheck size={13} />Compliance</a><button type="button" onClick={() => void Promise.all([resultsQuery.refetch(), summaryQuery.refetch(), catalogQuery.refetch()])} disabled={resultsQuery.isFetching || summaryQuery.isFetching} aria-label="Refresh benchmark posture"><RefreshCw size={14} className={resultsQuery.isFetching || summaryQuery.isFetching ? 'cis-spin' : undefined} /></button></div></header>

    <section className="cis-summary" aria-label="Assessment coverage summary"><div data-tone={fleetScore != null && fleetScore < 80 ? 'warning' : undefined}><span><ClipboardCheck size={13} />Technical pass rate</span><strong>{fleetScore == null ? '—' : `${fleetScore.toFixed(1)}%`}</strong><small>pass ÷ pass + fail + error</small></div><div data-tone="critical"><span><TriangleAlert size={13} />Failed</span><strong>{fail.toLocaleString()}</strong><small>requires analyst review</small></div><div data-tone="warning"><span><TriangleAlert size={13} />Errors</span><strong>{errors.toLocaleString()}</strong><small>unknown assessment outcome</small></div><div><span><CircleHelp size={13} />Not applicable</span><strong>{notApplicable.toLocaleString()}</strong><small>excluded from rate</small></div><div data-tone="info"><span><Server size={13} />Reporting endpoints</span><strong>{endpointCount.toLocaleString()}</strong><small>{catalogPacks} observed packs, not official CIS applicability</small></div><div><span><History size={13} />Latest report</span><strong>{latestScan ? formatRelative(latestScan) : '—'}</strong><small>{latestScan ? formatTimestamp(latestScan) : 'freshness unavailable'}</small></div></section>

    <section className="cis-operations" aria-label="Assessment filters"><form className="cis-toolbar" onSubmit={(event) => { event.preventDefault(); commitSearch(); }}><label className="cis-search"><Search size={14} /><input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Find exact check ID…" aria-label="Find assessment check ID" /><kbd>/</kbd></label><Filter className="cis-filter-icon" size={13} aria-hidden="true" /><HaCompactSelect ariaLabel="Filter by outcome" value={status} onChange={setStatus} options={STATUS_OPTIONS} /><HaCompactSelect ariaLabel="Filter by CIS profile" value={level} onChange={setLevel} options={LEVEL_OPTIONS} /><HaCompactSelect ariaLabel="Filter by reporting endpoint" value={agent} onChange={setAgent} options={agentOptions} disabled={agentOptions.length === 1} />{hasFilters && <button className="cis-clear" type="button" onClick={reset}>Reset priority view</button>}<span className="cis-scope"><ShieldCheck size={12} />Authorized API scope</span></form></section>

    {errors > 0 && <div className="cis-warning"><TriangleAlert size={14} /><span><strong>{errors} collection errors</strong> are excluded from pass outcomes but included in the current backend rate denominator. Treat affected controls as unknown.</span><button type="button" onClick={() => setStatus('ERROR')}>Review errors</button></div>}
    {officialNotShipped && <div className="cis-warning"><TriangleAlert size={14} /><span><strong>Official CIS Benchmark content is not licensed in this deployment.</strong> HiveArmor will not copy CIS recommendation text. Observed packs are HiveArmor host-file checks, not an official applicability catalog.</span></div>}
    <ul className="cis-catalog" aria-label="Benchmark pack catalog">
      {(catalogRows).map((pack: CisPackCatalogDTO) => (
        <li key={`${pack.packId}:${pack.packVersion ?? '1'}`}>
          <strong>{pack.title ?? pack.packId}</strong>
          <span>{pack.authority ?? 'Unknown authority'} · {pack.licenseState ?? pack.source}{pack.officialBenchmark ? ' · official CIS (not shipped)' : ' · not official CIS'}</span>
        </li>
      ))}
    </ul>
    {summaryQuery.isError && <div className="cis-warning"><AlertTriangle size={14} /><span><strong>Coverage summary unavailable.</strong> Loaded check results remain visible, but fleet pass rate and endpoint coverage cannot be trusted.</span></div>}
    {resultsQuery.isFetching && resultsQuery.data && <div className="cis-refreshing" role="status"><RefreshCw size={12} className="cis-spin" />Refreshing the assessment projection without clearing loaded rows…</div>}

    <header className="cis-results-toolbar"><div><strong>{status === 'FAIL' ? 'Checks needing remediation' : 'Assessment checks'}</strong><span>{rows.length ? `${pageStart}–${pageEnd} of ${total.toLocaleString()} loaded` : 'No rows loaded'} · newest observations first</span></div><div className="cis-density" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={14} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><LayoutList size={14} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><Columns3 size={14} /></button></div></header>

    {resultsQuery.isError && !resultsQuery.data ? <div className="cis-state" role="alert"><AlertTriangle size={28} /><strong>{forbidden ? 'Benchmark posture access denied' : 'Assessment projection unavailable'}</strong><span>{forbidden ? 'Your role or current tenant scope is not permitted to view these assessment results.' : errorText}</span>{!forbidden && <button type="button" onClick={() => resultsQuery.refetch()}>Retry assessments</button>}</div> : !resultsQuery.isLoading && rows.length === 0 ? <div className="cis-state" role="status"><CheckCircle2 size={28} /><strong>{hasFilters ? 'No checks match this view' : 'No assessment results were returned'}</strong><span>{hasFilters ? 'Reset the priority view or broaden the filters.' : 'This is not proof of secure configuration. Confirm SCA-capable agent coverage, benchmark assignment and ingestion health.'}</span>{hasFilters && <button type="button" onClick={reset}>Reset priority view</button>}</div> : <main className="cis-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid cis-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={resultsQuery.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => { const check = event.data as ScaResultDTO; setActiveIndex(rows.findIndex((row) => row.id === check.id)); setSelected(check); }} getRowId={(params) => String((params.data as ScaResultDTO).id)} defaultColDef={{ filter: false, sortable: false }} ariaLabel="CIS benchmark assessment results" /></main>}

    <footer className="cis-pagination" aria-label="Assessment pagination"><span>{total.toLocaleString()} matching checks</span><strong>Page {totalPages ? page + 1 : 0}<small>{pageStart}–{pageEnd}</small></strong><div><button type="button" disabled={page === 0 || resultsQuery.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={pageEnd >= total || resultsQuery.isFetching} onClick={() => { setPage((value) => value + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
    <StatusDock className="cis-status-dock" sseConnected={eps.connected} eps={eps.eps} mode="live" lastUpdated={resultsQuery.dataUpdatedAt ? new Date(resultsQuery.dataUpdatedAt) : undefined} />
    {selected && <CheckDrawer check={selected} onClose={() => setSelected(null)} />}
  </section>;
}
