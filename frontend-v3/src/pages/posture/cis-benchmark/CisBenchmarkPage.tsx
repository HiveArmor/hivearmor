/**
 * Posture CIS Benchmark — inventory-first SCA hub (Prompt 28 / Wave B2).
 *
 * Production: GET /api/ha-cis/results + summary + catalog. Empty HTTP 200 is not a missing contract.
 * Mutations stay fail-closed (CIS_MUTATION_AVAILABLE). Official CIS text is not licensed here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  AlertTriangle,
  AlignJustify,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileCheck2,
  Filter,
  History,
  List,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  TerminalSquare,
  TriangleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { ROUTES } from '@/constants/routes.constants';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity } from '@/hooks/useRowDensity';
import { CIS_MUTATION_AVAILABLE, CIS_MUTATION_DISABLED_TITLE } from '@/pages/posture/posture.capabilities';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { fetchCisCatalog, fetchScaResult, fetchScaResults, fetchScaSummary } from '@/services/vulnService';
import type { CisLevel, CisPackCatalogDTO, ScaResultDTO, ScaStatus, ScaSummaryDTO } from '@/types/vuln.types';

import './CisBenchmarkPage.css';
import '../../response/response-grid-standard.css';

/** Bundle-visible job sentence — CIS SCA inventory, not CVE findings or framework assurance. */
export const POSTURE_CIS_BENCHMARK_JOB_SENTENCE =
  'CIS benchmark posture — review SCA assessment checks, pass/fail/error outcomes, and observed packs across authorized agents. Official CIS Benchmark text is not licensed here; CVE findings live on Vulnerabilities; framework mapping lives on Compliance.';

const PAGE_SIZE = 50;

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
  const assetTo = `${ROUTES.ASSETS}?search=${encodeURIComponent(detail.agentHostname ?? detail.agentId)}`;
  const huntTo = `${ROUTES.SEARCH}?q=${encodeURIComponent(`host.name:${detail.agentHostname ?? detail.agentId}`)}`;

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

        {(detail.mitre.length > 0 || detail.complianceTags.length > 0) && (
          <section className="cis-drawer__card">
            <header><Tags size={15} /><div><strong>Mappings</strong><span>Informational control relationships</span></div></header>
            {detail.mitre.length > 0 && (
              <div className="cis-tags">
                <span>ATT&amp;CK</span>
                <div>{detail.mitre.map((item) => <a key={item} href={`https://attack.mitre.org/techniques/${item.replace(/\./g, '/')}`} target="_blank" rel="noreferrer">{item}<ExternalLink size={10} /></a>)}</div>
              </div>
            )}
            {detail.complianceTags.length > 0 && <div className="cis-tags"><span>Control tags</span><div>{detail.complianceTags.map((item) => <em key={item}>{item}</em>)}</div></div>}
          </section>
        )}

        <nav className="cis-pivots" aria-label="Assessment pivots">
          <Link to={assetTo}>Inspect endpoint<ExternalLink size={11} /></Link>
          <Link to={huntTo}>Hunt endpoint events<ExternalLink size={11} /></Link>
        </nav>
        <p className="cis-governance"><ShieldCheck size={13} />{CIS_MUTATION_DISABLED_TITLE}. Rescan, exception and remediation actions remain unavailable until target-bound preview, authorization, execution, verification and audit contracts exist.</p>
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
  const [density, setDensity] = useRowDensity();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<ScaResultDTO | null>(null);
  const eps = useEpsStream();

  const filters = useMemo(() => ({ checkId: checkId || undefined, status: status === 'all' ? undefined : status, level: level === 'all' ? undefined : level, agentId: agent === 'all' ? undefined : agent, page, size: PAGE_SIZE }), [agent, checkId, level, page, status]);
  const resultsQuery = useQuery({ queryKey: ['cis-results', filters], queryFn: ({ signal }) => fetchScaResults(filters, signal), placeholderData: (previous) => previous, staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
  const summaryQuery = useQuery({ queryKey: ['cis-assessment-summary'], queryFn: ({ signal }) => fetchScaSummary(undefined, signal), staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
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
  const denominator = pass + fail + errors;
  const fleetScore = denominator > 0 ? (pass / denominator) * 100 : null;
  const catalogRows = Array.isArray(catalogQuery.data) ? catalogQuery.data : [];
  const officialNotShipped = catalogRows.some((pack) => pack.licenseState === 'LICENSE_REQUIRED_NOT_SHIPPED');
  const isDefaultPriorityView = !checkId && status === 'FAIL' && level === 'all' && agent === 'all';
  const isAllOutcomesUnfiltered = !checkId && status === 'all' && level === 'all' && agent === 'all';
  const hasExtraFilters = !isDefaultPriorityView;
  const showPriorityEmptyHonesty = !resultsQuery.isLoading && !resultsQuery.isError && rows.length === 0 && isDefaultPriorityView;
  const showTrueEmpty = !resultsQuery.isLoading && !resultsQuery.isError && rows.length === 0 && isAllOutcomesUnfiltered;
  const showFilterEmpty = !resultsQuery.isLoading && !resultsQuery.isError && rows.length === 0 && hasExtraFilters && !isAllOutcomesUnfiltered;
  const hasInlineStats = summaries.length > 0 && !summaryQuery.isError;

  const projectionNote = [
    errors > 0 ? `${errors} collection errors are unknown outcomes — included in the rate denominator when a rate is shown, never treated as pass or fail.` : null,
    officialNotShipped ? 'Official CIS Benchmark content is not licensed in this deployment. Observed packs are HiveArmor host-file checks, not an official applicability catalog.' : null,
    summaryQuery.isError ? 'Coverage summary unavailable. Loaded check results remain visible, but fleet pass rate cannot be trusted.' : null,
    CIS_MUTATION_AVAILABLE ? null : 'CIS mutations are fail-closed — HiveArmor will not invent a configuration change.',
  ].filter((part): part is string => Boolean(part)).join(' ');

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

  return (
    <section className="cis-page" aria-label="CIS Benchmark" data-cis-mutation={CIS_MUTATION_AVAILABLE ? 'open' : 'fail-closed'}>
      <header className="cis-header">
        <div className="cis-header__identity">
          <span className="cis-header__mark"><ClipboardCheck size={19} aria-hidden="true" /></span>
          <div>
            <div className="cis-header__eyebrow">
              <span>POSTURE</span>
              <span className="cis-header__badge">STAGING CANDIDATE</span>
            </div>
            <h1>CIS Benchmark</h1>
            <p className="cis-header__job">{POSTURE_CIS_BENCHMARK_JOB_SENTENCE}</p>
            {projectionNote && <p className="cis-page__projection-note" role="note">{projectionNote}</p>}
          </div>
        </div>
        <div className="cis-header__actions">
          <span className="cis-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span>
          <button type="button" onClick={() => void Promise.all([resultsQuery.refetch(), summaryQuery.refetch(), catalogQuery.refetch()])} disabled={resultsQuery.isFetching || summaryQuery.isFetching} aria-label="Refresh benchmark posture"><RefreshCw size={14} className={resultsQuery.isFetching || summaryQuery.isFetching ? 'cis-spin' : undefined} /></button>
        </div>
      </header>

      <p className="cis-page__meta">
        <Link to={ROUTES.DASHBOARD}>Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ASSETS}>Assets</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.VULNERABILITIES}>Vulnerabilities</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.COMPLIANCE}>Compliance</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.READINESS}>Detection Coverage</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.EXPOSURE}>Exposure</Link>
        <span aria-hidden="true">·</span>
        <span className="cis-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {showPriorityEmptyHonesty && (
        <div className="cis-empty-honesty" role="status" data-testid="cis-empty-honesty" data-empty-kind="priority">
          <strong>No failed checks in the default priority view.</strong>
          <span>
            An empty failed-check queue is not proof of secure configuration. Switch to All outcomes to see whether any assessments exist, or confirm SCA-capable agent coverage and ingestion health. HiveArmor will not invent pass rates.
          </span>
          <button type="button" onClick={() => setStatus('all')}>View all outcomes</button>
        </div>
      )}

      {showTrueEmpty && (
        <div className="cis-empty-honesty" role="status" data-testid="cis-empty-honesty" data-empty-kind="all-outcomes">
          <strong>No assessment results were returned.</strong>
          <span>
            This is not proof of secure configuration. Confirm SCA-capable agent coverage, benchmark assignment and ingestion health. Empty HTTP 200 is not a missing contract and not an API error.
          </span>
        </div>
      )}

      <section className="cis-operations" aria-label="Assessment filters">
        <form className="cis-toolbar" onSubmit={(event) => { event.preventDefault(); commitSearch(); }}>
          <label className="cis-search"><Search size={14} /><input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Find exact check ID…" aria-label="Find assessment check ID" /><kbd>/</kbd></label>
          <Filter className="cis-filter-icon" size={13} aria-hidden="true" />
          <HaCompactSelect ariaLabel="Filter by outcome" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <HaCompactSelect ariaLabel="Filter by CIS profile" value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
          <HaCompactSelect ariaLabel="Filter by reporting endpoint" value={agent} onChange={setAgent} options={agentOptions} disabled={agentOptions.length === 1} />
          {hasExtraFilters && <button className="cis-clear" type="button" onClick={reset}>Reset priority view</button>}
          <span className="cis-scope"><ShieldCheck size={12} />Authorized API scope</span>
        </form>
      </section>

      {catalogRows.length > 0 && (
        <ul className="cis-catalog" aria-label="Benchmark pack catalog">
          {catalogRows.map((pack: CisPackCatalogDTO) => (
            <li key={`${pack.packId}:${pack.packVersion ?? '1'}`}>
              <strong>{pack.title ?? pack.packId}</strong>
              <span>{pack.authority ?? 'Unknown authority'} · {pack.licenseState ?? pack.source}{pack.officialBenchmark ? ' · official CIS (not shipped)' : ' · not official CIS'}</span>
            </li>
          ))}
        </ul>
      )}

      {resultsQuery.isFetching && resultsQuery.data && <div className="cis-refreshing" role="status"><RefreshCw size={12} className="cis-spin" />Refreshing the assessment projection without clearing loaded rows…</div>}

      <header className="cis-results-toolbar">
        <div>
          <strong>{status === 'FAIL' ? 'Checks needing remediation' : 'Assessment checks'}</strong>
          <span>{rows.length ? `${pageStart}–${pageEnd} of ${total.toLocaleString()} loaded` : 'No rows loaded'} · newest observations first</span>
          {hasInlineStats && (
            <span className="cis-inline-stats" aria-label="CIS assessment summary">
              <span data-tone="critical"><TriangleAlert size={11} />{fail.toLocaleString()} failed</span>
              <span data-tone="warning"><AlertTriangle size={11} />{errors.toLocaleString()} errors</span>
              {fleetScore != null && <span>{fleetScore.toFixed(1)}% pass rate</span>}
            </span>
          )}
        </div>
        <div className="cis-density" role="group" aria-label="Row density">
          <span>Rows</span>
          <button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button>
          <button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button>
          <button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button>
        </div>
      </header>

      {resultsQuery.isError && !resultsQuery.data ? (
        <div className="cis-state" role="alert"><AlertTriangle size={28} /><strong>{forbidden ? 'Benchmark posture access denied' : 'Assessment projection unavailable'}</strong><span>{forbidden ? 'Your role or current tenant scope is not permitted to view these assessment results.' : errorText}</span>{!forbidden && <button type="button" onClick={() => resultsQuery.refetch()}>Retry assessments</button>}</div>
      ) : showPriorityEmptyHonesty || showTrueEmpty ? null : showFilterEmpty ? (
        <div className="cis-state" role="status"><CircleHelp size={28} /><strong>No checks match this view</strong><span>Reset the priority view or broaden the filters. An empty filtered result is not proof of secure configuration.</span><button type="button" onClick={reset}>Reset priority view</button></div>
      ) : (
        <main className="cis-inventory"><div className="cis-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid cis-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={resultsQuery.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => { const checkRow = event.data as ScaResultDTO; setActiveIndex(rows.findIndex((row) => row.id === checkRow.id)); setSelected(checkRow); }} getRowId={(params) => String((params.data as ScaResultDTO).id)} defaultColDef={{ filter: false, sortable: false }} ariaLabel="CIS benchmark assessment results" /></div></main>
      )}

      <footer className="cis-pagination" aria-label="Assessment pagination"><span>{total.toLocaleString()} matching checks</span><strong>Page {totalPages ? page + 1 : 0}<small>{pageStart}–{pageEnd}</small></strong><div><button type="button" disabled={page === 0 || resultsQuery.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={pageEnd >= total || resultsQuery.isFetching} onClick={() => { setPage((value) => value + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="cis-status-dock" sseConnected={eps.connected} eps={eps.eps} mode="historical" lastUpdated={resultsQuery.dataUpdatedAt ? new Date(resultsQuery.dataUpdatedAt) : undefined} />
      {selected && <CheckDrawer check={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
