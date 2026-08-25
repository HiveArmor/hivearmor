/**
 * Vulnerability Operations — Phase 8 posture and exposure workflow.
 *
 * The page intentionally renders only signals provided by /api/ha-vuln. Future
 * contextual priority and remediation features are tracked under VUL-001+.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns3,
  Copy,
  ExternalLink,
  Filter,
  History,
  LayoutList,
  List,
  PackageOpen,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Text,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { fetchVulnFinding, fetchVulnFindings, fetchVulnRemediation, fetchVulnRemediationConnectors, fetchVulnSummary } from '@/services/vulnService';
import type { VulnFindingDTO, VulnSeverity } from '@/types/vuln.types';

import './VulnerabilitiesPage.css';

const PAGE_SIZE = 50;

type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;
type SeverityFilter = 'all' | VulnSeverity;
type ExploitationFilter = 'all' | 'kev';
type WindowFilter = 'all' | '7d' | '30d' | '90d';

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: 'all', label: 'All severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
  { value: 'INFO', label: 'Informational' },
];

const EXPLOITATION_OPTIONS: Array<{ value: ExploitationFilter; label: string }> = [
  { value: 'all', label: 'All exploitation signals' },
  { value: 'kev', label: 'CISA KEV only' },
];

const WINDOW_OPTIONS: Array<{ value: WindowFilter; label: string }> = [
  { value: 'all', label: 'All first-seen time' },
  { value: '7d', label: 'First seen · 7 days' },
  { value: '30d', label: 'First seen · 30 days' },
  { value: '90d', label: 'First seen · 90 days' },
];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not reported';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reported';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function fromForWindow(window: WindowFilter): string | undefined {
  if (window === 'all') return undefined;
  const days = Number.parseInt(window, 10);
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function SeverityBadge({ severity }: { severity: VulnSeverity }): JSX.Element {
  return <span className="vuln-severity" data-severity={severity.toLowerCase()}><span />{severity.toLowerCase()}</span>;
}

function CvssCell({ finding }: { finding: VulnFindingDTO }): JSX.Element {
  return (
    <span className="vuln-cvss" data-severity={finding.severity.toLowerCase()}>
      <strong>{finding.cvssV3 == null ? '—' : finding.cvssV3.toFixed(1)}</strong>
      <small>CVSS v3</small>
    </span>
  );
}

function FindingDrawer({ finding, onClose }: { finding: VulnFindingDTO; onClose: () => void }): JSX.Element {
  const detailQuery = useQuery({
    queryKey: ['vulnerability-finding', finding.id],
    queryFn: ({ signal }) => fetchVulnFinding(finding.id, signal),
    initialData: finding,
    staleTime: 20_000,
  });
  const detail = detailQuery.data ?? finding;
  const remQuery = useQuery({
    queryKey: ['vulnerability-remediation', finding.id],
    queryFn: ({ signal }) => fetchVulnRemediation(finding.id, signal),
    staleTime: 20_000,
  });
  const copyValue = useCallback((value: string | null | undefined) => {
    if (value) void navigator.clipboard?.writeText(value);
  }, []);

  const huntQuery = `vulnerability.id:${detail.cveId}`;
  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={detail.cveId}
      subtitle={`${detail.packageName} on ${detail.agentHostname ?? detail.agentId}`}
      width={520}
    >
      <div className="vuln-drawer">
        <section className="vuln-drawer__headline">
          <div><SeverityBadge severity={detail.severity} />{detail.kev && <span className="vuln-kev">CISA KEV</span>}</div>
          <CvssCell finding={detail} />
        </section>

        {detail.kev && (
          <section className="vuln-drawer__notice" role="note">
            <ShieldAlert size={16} />
            <div><strong>Known exploitation evidence</strong><p>CISA KEV is a prioritization signal. It does not by itself prove exploitation on this asset.</p></div>
          </section>
        )}

        <section className="vuln-drawer__card">
          <header><PackageOpen size={15} /><div><strong>Affected software</strong><span>Observed package and available fix</span></div></header>
          <dl>
            <div><dt>Package</dt><dd>{detail.packageName}</dd></div>
            <div><dt>Installed</dt><dd>{detail.installedVersion ?? 'Not reported'}</dd></div>
            <div><dt>Fixed version</dt><dd data-positive={detail.fixedVersion ? true : undefined}>{detail.fixedVersion ?? 'No fix reported'}</dd></div>
            <div><dt>Package URL</dt><dd>{detail.purl ?? 'Not reported'}</dd></div>
          </dl>
        </section>

        <section className="vuln-drawer__card">
          <header><Server size={15} /><div><strong>Observed asset</strong><span>Exact scope returned by the finding</span></div></header>
          <div className="vuln-copy-row"><span>Host</span><code>{detail.agentHostname ?? 'Not reported'}</code><button type="button" disabled={!detail.agentHostname} onClick={() => copyValue(detail.agentHostname)} aria-label="Copy host name"><Copy size={12} /></button></div>
          <div className="vuln-copy-row"><span>Agent ID</span><code>{detail.agentId}</code><button type="button" onClick={() => copyValue(detail.agentId)} aria-label="Copy agent ID"><Copy size={12} /></button></div>
          <div className="vuln-copy-row"><span>CVE</span><code>{detail.cveId}</code><button type="button" onClick={() => copyValue(detail.cveId)} aria-label="Copy CVE ID"><Copy size={12} /></button></div>
        </section>

        <section className="vuln-drawer__card">
          <header><History size={15} /><div><strong>Observation window</strong><span>Backend observation timestamps</span></div></header>
          <dl>
            <div><dt>Published</dt><dd>{formatTimestamp(detail.publishedAt)}</dd></div>
            <div><dt>First seen</dt><dd>{formatTimestamp(detail.firstSeenAt)}</dd></div>
            <div><dt>Last seen</dt><dd>{formatTimestamp(detail.lastSeenAt)}</dd></div>
          </dl>
        </section>

        <section className="vuln-drawer__card">
          <header><ShieldAlert size={15} /><div><strong>Exploit prediction (EPSS)</strong><span>Stored score only; never synthesized</span></div></header>
          {detail.epssState === 'reported' && detail.epssScore != null ? (
            <dl>
              <div><dt>Score</dt><dd>{detail.epssScore}</dd></div>
              <div><dt>Percentile</dt><dd>{detail.epssPercentile ?? 'Not reported'}</dd></div>
              <div><dt>As of</dt><dd>{detail.epssAsOf ?? 'Not reported'}</dd></div>
            </dl>
          ) : (
            <p className="vuln-drawer__hint"><CircleHelp size={13} />Exploit prediction is unavailable. HiveArmor does not invent EPSS scores.</p>
          )}
        </section>

        <section className="vuln-drawer__card">
          <header><Text size={15} /><div><strong>Finding description</strong><span>Source-provided vulnerability context</span></div></header>
          <p className="vuln-description">{detail.description ?? 'No description was supplied by the current vulnerability source.'}</p>
          {detail.references?.length ? (
            <ul className="vuln-references">
              {detail.references.slice(0, 5).map((reference) => <li key={reference}><a href={reference} target="_blank" rel="noreferrer">{reference}<ExternalLink size={11} /></a></li>)}
            </ul>
          ) : <p className="vuln-drawer__hint"><CircleHelp size={13} />Reference provenance is not available in the current API projection.</p>}
        </section>

        <nav className="vuln-pivots" aria-label="Investigation pivots">
          <a href={`/search?query=${encodeURIComponent(huntQuery)}`}>Hunt this CVE<ExternalLink size={11} /></a>
          <a href={`/posture/assets?search=${encodeURIComponent(detail.agentHostname ?? detail.agentId)}`}>Inspect asset<ExternalLink size={11} /></a>
        </nav>

        <p className="vuln-drawer__governance"><ShieldCheck size={13} />{remQuery.data?.reason ?? 'Governed remediation execute is not configured; HiveArmor will not invent a patch job.'}</p>
      </div>
    </HaDrawer>
  );
}

export function VulnerabilitiesPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [cve, setCve] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [exploitation, setExploitation] = useState<ExploitationFilter>('all');
  const [window, setWindow] = useState<WindowFilter>('all');
  const [density, setDensity] = useState<Density>('standard');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<VulnFindingDTO | null>(null);
  const eps = useEpsStream();

  const filters = useMemo(() => ({
    cve: cve || undefined,
    severity: severity === 'all' ? undefined : severity,
    isKev: exploitation === 'kev' ? true : undefined,
    from: fromForWindow(window),
    page,
    size: PAGE_SIZE,
  }), [cve, exploitation, page, severity, window]);

  const findingsQuery = useQuery({
    queryKey: ['vulnerability-findings', filters],
    queryFn: ({ signal }) => fetchVulnFindings(filters, signal),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  const summaryQuery = useQuery({
    queryKey: ['vulnerability-summary', { cve: filters.cve, severity: filters.severity, isKev: filters.isKev, from: filters.from }],
    queryFn: ({ signal }) => fetchVulnSummary({ cve: filters.cve, severity: filters.severity, isKev: filters.isKev, from: filters.from }, signal),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  const connectorsQuery = useQuery({
    queryKey: ['vulnerability-connectors'],
    queryFn: ({ signal }) => fetchVulnRemediationConnectors(signal),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const rows = useMemo(() => findingsQuery.data?.findings ?? [], [findingsQuery.data?.findings]);
  const total = findingsQuery.data?.total ?? 0;
  const summary = summaryQuery.data;
  const totalFindings = summary ? summary.critical + summary.high + summary.medium + summary.low + summary.info : undefined;
  const hasFilters = Boolean(cve) || severity !== 'all' || exploitation !== 'all' || window !== 'all';
  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;
  const pageStart = rows.length ? page * PAGE_SIZE + 1 : 0;
  const pageEnd = page * PAGE_SIZE + rows.length;

  const resetFilters = useCallback(() => {
    setSearchDraft('');
    setCve('');
    setSeverity('all');
    setExploitation('all');
    setWindow('all');
    setPage(0);
    setActiveIndex(0);
  }, []);
  const commitSearch = useCallback(() => {
    setCve(searchDraft.trim());
    setPage(0);
    setActiveIndex(0);
  }, [searchDraft]);

  useEffect(() => {
    setPage(0);
    setActiveIndex(0);
  }, [severity, exploitation, window]);

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

  useEffect(() => {
    if (!rows.length) return;
    gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api?.setFocusedCell(activeIndex, 'cveId');
  }, [activeIndex, rows.length]);

  const columns = useMemo<ColDef[]>(() => [
    { field: 'cveId', colId: 'cveId', headerName: 'Vulnerability', width: 165, pinned: 'left', cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <span className="vuln-primary"><Bug size={14} /><span><strong>{data.cveId}</strong><small>{data.kev ? 'Known exploited · CISA KEV' : 'No KEV match reported'}</small></span></span> : null },
    { field: 'severity', headerName: 'Severity', width: 118, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <SeverityBadge severity={data.severity} /> : null },
    { field: 'cvssV3', headerName: 'Score', width: 88, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <CvssCell finding={data} /> : null },
    { field: 'agentHostname', headerName: 'Affected asset', minWidth: 150, flex: 1, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <span className="vuln-two-line"><strong>{data.agentHostname ?? 'Hostname unavailable'}</strong><small>{data.agentId}</small></span> : null },
    { field: 'packageName', headerName: 'Package', minWidth: 170, flex: 1, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <span className="vuln-two-line"><strong>{data.packageName}</strong><small>{data.purl ?? 'Package URL unavailable'}</small></span> : null },
    { headerName: 'Version path', minWidth: 170, flex: 1, valueGetter: ({ data }: { data?: VulnFindingDTO }) => `${data?.installedVersion ?? 'Unknown'} → ${data?.fixedVersion ?? 'No fix reported'}`, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <span className="vuln-version"><code>{data.installedVersion ?? 'Unknown'}</code><ChevronRight size={11} /><code data-fixed={data.fixedVersion ? true : undefined}>{data.fixedVersion ?? 'No fix reported'}</code></span> : null },
    { field: 'lastSeenAt', headerName: 'Last observed', width: 120, cellRenderer: ({ data }: ICellRendererParams<VulnFindingDTO>) => data ? <span className="vuln-two-line"><strong>{formatRelative(data.lastSeenAt)}</strong><small>{formatTimestamp(data.lastSeenAt)}</small></span> : null },
    { headerName: '', width: 34, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: () => <ChevronRight className="vuln-row-chevron" size={14} /> },
  ], []);

  const errorText = findingsQuery.error instanceof Error ? findingsQuery.error.message : 'The vulnerability source could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorText);

  return (
    <section className="vuln-page" aria-label="Vulnerability operations">
      <header className="vuln-header">
        <div className="vuln-header__identity"><span className="vuln-header__mark"><Bug size={19} /></span><div><span>Posture &amp; exposure</span><h1>Vulnerability Operations</h1></div></div>
        <div className="vuln-header__actions"><span className="vuln-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/assets"><Server size={13} />Assets</a><a href="/posture/exposure"><ShieldAlert size={13} />Exposure</a><button type="button" onClick={() => void Promise.all([findingsQuery.refetch(), summaryQuery.refetch()])} disabled={findingsQuery.isFetching || summaryQuery.isFetching} aria-label="Refresh vulnerability snapshot"><RefreshCw size={14} className={findingsQuery.isFetching || summaryQuery.isFetching ? 'vuln-spin' : undefined} /></button></div>
      </header>

      <section className="vuln-summary" aria-label="Fleet vulnerability summary">
        <div><span><Bug size={13} />Open findings</span><strong>{totalFindings?.toLocaleString() ?? '—'}</strong><small>{hasFilters ? 'matching current filters' : 'fleet summary'}</small></div>
        <div data-tone="critical"><span><ShieldAlert size={13} />Critical</span><strong>{summary?.critical.toLocaleString() ?? '—'}</strong><small>CVSS severity class</small></div>
        <div data-tone="danger"><span><AlertTriangle size={13} />High</span><strong>{summary?.high.toLocaleString() ?? '—'}</strong><small>CVSS severity class</small></div>
        <div data-tone="warning"><span><Bug size={13} />CISA KEV</span><strong>{summary?.kevCount.toLocaleString() ?? '—'}</strong><small>known exploitation evidence</small></div>
        <div data-tone="info"><span><Server size={13} />Affected assets</span><strong>{summary?.affectedAgents.toLocaleString() ?? '—'}</strong><small>distinct reporting agents</small></div>
        <div><span><History size={13} />Current page</span><strong>{rows.length ? `${pageStart}–${pageEnd}` : '—'}</strong><small>{total.toLocaleString()} matching findings</small></div>
      </section>

      <section className="vuln-operations" aria-label="Vulnerability filters">
        <form className="vuln-toolbar" onSubmit={(event) => { event.preventDefault(); commitSearch(); }}>
          <label className="vuln-search"><Search size={14} /><input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search CVE ID…" aria-label="Search CVE ID" /><kbd>/</kbd></label>
          <Filter className="vuln-filter-icon" size={13} aria-hidden="true" />
          <HaCompactSelect ariaLabel="Filter by severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
          <HaCompactSelect ariaLabel="Filter by exploitation evidence" value={exploitation} onChange={setExploitation} options={EXPLOITATION_OPTIONS} />
          <HaCompactSelect ariaLabel="Filter by first-seen window" value={window} onChange={setWindow} options={WINDOW_OPTIONS} />
          {hasFilters && <button className="vuln-clear" type="button" onClick={resetFilters}>Clear filters</button>}
          <span className="vuln-scope"><ShieldCheck size={12} />Authorized API scope</span>
        </form>
      </section>

      {summary?.kevCount ? <div className="vuln-kev-strip"><ShieldAlert size={14} /><span><strong>{summary.kevCount} CISA KEV matches</strong> are present in the current summary scope. Prioritize with asset context and current exposure evidence.</span><button type="button" onClick={() => { setExploitation('kev'); setPage(0); }}>Review KEV</button></div> : null}
      {Array.isArray(connectorsQuery.data) && connectorsQuery.data.length ? <div className="vuln-kev-strip"><ShieldCheck size={14} /><span><strong>{connectorsQuery.data.length} remediation connectors</strong> are listed as not configured. HiveArmor will not invent a patch job.</span></div> : null}
      {findingsQuery.isFetching && findingsQuery.data && <div className="vuln-refreshing" role="status"><RefreshCw size={12} className="vuln-spin" />Refreshing the current projection without clearing loaded rows…</div>}

      <header className="vuln-results-toolbar">
        <div><strong>Priority findings</strong><span>{rows.length ? `${pageStart}–${pageEnd} of ${total.toLocaleString()} loaded` : 'No rows loaded'} · backend order: CVSS then KEV</span></div>
        <div className="vuln-density" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={14} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><LayoutList size={14} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><Columns3 size={14} /></button></div>
      </header>

      {findingsQuery.isError && !findingsQuery.data ? (
        <div className="vuln-state" role="alert"><AlertTriangle size={28} /><strong>{forbidden ? 'Vulnerability access denied' : 'Vulnerability projection unavailable'}</strong><span>{forbidden ? 'Your role or current tenant scope is not permitted to view these findings.' : errorText}</span>{!forbidden && <button type="button" onClick={() => findingsQuery.refetch()}>Retry findings</button>}</div>
      ) : !findingsQuery.isLoading && rows.length === 0 ? (
        <div className="vuln-state" role="status"><CheckCircle2 size={28} /><strong>{hasFilters ? 'No findings match these filters' : 'No vulnerability findings were returned'}</strong><span>{hasFilters ? 'Clear filters or broaden the first-seen window.' : 'This is not proof of zero exposure. Confirm scanner coverage and source health because the current backend cannot report partial-source failures.'}</span>{hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}</div>
      ) : (
        <main className="vuln-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid vuln-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={findingsQuery.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => { const finding = event.data as VulnFindingDTO; setActiveIndex(rows.findIndex((row) => row.id === finding.id)); setSelected(finding); }} getRowId={(params) => String((params.data as VulnFindingDTO).id)} defaultColDef={{ filter: false, sortable: false }} ariaLabel="Vulnerability findings" /></main>
      )}

      <footer className="vuln-pagination" aria-label="Vulnerability pagination"><span>{total.toLocaleString()} matching findings</span><strong>Page {totalPages ? page + 1 : 0} <small>{pageStart}–{pageEnd}</small></strong><div><button type="button" disabled={page === 0 || findingsQuery.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={pageEnd >= total || findingsQuery.isFetching} onClick={() => { setPage((value) => value + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="vuln-status" sseConnected={eps.connected} eps={eps.eps} mode="historical" lastUpdated={findingsQuery.dataUpdatedAt ? new Date(findingsQuery.dataUpdatedAt) : undefined} />
      {selected && <FindingDrawer finding={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
