/**
 * Asset Intelligence — Phase 8 posture and exposure inventory.
 *
 * Uses a bounded safe projection. The legacy /ha-clients entity response is
 * normalized and stripped in posture.service; production never imports the
 * visual fixture records.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  History,
  Laptop,
  Layers3,
  List,
  LockKeyhole,
  Network,
  Radar,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Tags,
  UserRound,
} from 'lucide-react';

import { assetFixtureMode, fetchAssetDetail, fetchAssets } from '../posture.service';
import type {
  AssetCategory,
  AssetCriticality,
  AssetDTO,
  AssetExposureLevel,
  AssetFilters,
  AssetRiskLevel,
  AssetSensorHealth,
} from '../posture.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { useRowDensity } from '@/hooks/useRowDensity';


import './AssetsPage.css';
import '../../response/response-grid-standard.css';

const PAGE_SIZE = 50;
type AssetView = 'all' | AssetCategory;
type RiskFilter = 'all' | AssetRiskLevel;
type ExposureFilter = 'all' | AssetExposureLevel;
type SensorFilter = 'all' | AssetSensorHealth;

const RISK_OPTIONS: Array<{ value: RiskFilter; label: string }> = [
  { value: 'all', label: 'All risk' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No known risk' },
  { value: 'unknown', label: 'No data' },
];

const EXPOSURE_OPTIONS: Array<{ value: ExposureFilter; label: string }> = [
  { value: 'all', label: 'All exposure' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No exposure' },
  { value: 'unknown', label: 'No data' },
];

const SENSOR_OPTIONS: Array<{ value: SensorFilter; label: string }> = [
  { value: 'all', label: 'All coverage' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'unmanaged', label: 'Unmanaged' },
  { value: 'unknown', label: 'Unknown' },
];

const VIEW_LABELS: Record<AssetView, string> = {
  all: 'All assets', endpoint: 'Endpoints', server: 'Servers', cloud: 'Cloud', network: 'Network', iot_ot: 'IoT / OT', unknown: 'Unclassified',
};

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return 'Never';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}

function categoryIcon(category?: AssetCategory, size = 14): JSX.Element {
  if (category === 'endpoint') return <Laptop size={size} />;
  if (category === 'server') return <Server size={size} />;
  if (category === 'cloud') return <Cloud size={size} />;
  if (category === 'network') return <Network size={size} />;
  if (category === 'iot_ot') return <Radar size={size} />;
  return <CircleHelp size={size} />;
}

function RiskBadge({ level = 'unknown', score }: { level?: AssetRiskLevel; score?: number | null }): JSX.Element {
  return <span className="ast-risk" data-level={level}><span />{level === 'none' ? 'No risk' : level}<strong>{score ?? '—'}</strong></span>;
}

function ExposureBadge({ level = 'unknown', score }: { level?: AssetExposureLevel; score?: number | null }): JSX.Element {
  return <span className="ast-exposure" data-level={level}><Eye size={12} />{level === 'none' ? 'None' : level}<strong>{score ?? '—'}</strong></span>;
}

function CriticalityBadge({ value = 'unassigned' }: { value?: AssetCriticality }): JSX.Element {
  const Icon = value === 'mission_critical' ? ShieldAlert : value === 'high' ? ShieldQuestion : ShieldCheck;
  return <span className="ast-criticality" data-level={value}><Icon size={12} />{value.replace('_', ' ')}</span>;
}

function SensorBadge({ asset }: { asset: AssetDTO }): JSX.Element {
  const value = asset.sensorHealth ?? 'unknown';
  return <span className="ast-sensor" data-state={value}>{value}<small>{asset.onboardingStatus ?? 'unknown'}</small></span>;
}

function copyValue(value?: string | null): void {
  if (value) void navigator.clipboard?.writeText(value);
}

function AssetDrawer({ asset: initialAsset, onClose }: { asset: AssetDTO; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<'overview' | 'risk' | 'coverage' | 'activity'>('overview');
  const detailQuery = useQuery({
    queryKey: ['asset-intelligence-detail', initialAsset.id],
    queryFn: () => fetchAssetDetail(initialAsset.id),
    enabled: !assetFixtureMode,
    initialData: assetFixtureMode ? initialAsset : undefined,
    staleTime: 20_000,
  });
  const asset = detailQuery.data?.clientName ? detailQuery.data : initialAsset;
  const entityId = asset.canonicalEntityId ?? String(asset.id);
  return (
    <HaDrawer isOpen onClose={onClose} title={asset.clientName} subtitle={`${VIEW_LABELS[asset.category ?? 'unknown']} · ${asset.clientDomain}`} width={540}
      footer={<><a className="ast-drawer-action" href={`/entities/${encodeURIComponent(entityId)}`}><Layers3 size={13} />Open entity dossier</a><a className="ast-drawer-action ast-drawer-action--primary" href={`/search?query=${encodeURIComponent(`host.name:"${asset.clientName}"`)}`}><Search size={13} />Hunt activity</a></>}>
      <div className="ast-drawer">
        <div className="ast-drawer__headline">
          <span className="ast-drawer__icon">{categoryIcon(asset.category, 20)}</span>
          <div><RiskBadge level={asset.riskLevel} score={asset.riskScore} /><ExposureBadge level={asset.exposureLevel} score={asset.exposureScore} /></div>
        </div>
        <nav className="ast-drawer-tabs" aria-label="Asset detail views">
          {(['overview', 'risk', 'coverage', 'activity'] as const).map((item) => <button key={item} type="button" data-active={tab === item} onClick={() => setTab(item)}>{item}</button>)}
        </nav>

        {tab === 'overview' && <>
          <section className="ast-drawer-card"><header><Server size={14} /><div><strong>Asset identity</strong><span>Canonical inventory context</span></div></header><dl className="ast-detail-grid">
            <div><dt>Category</dt><dd>{VIEW_LABELS[asset.category ?? 'unknown']}</dd></div><div><dt>Criticality</dt><dd>{(asset.criticality ?? 'unassigned').replace('_', ' ')}</dd></div>
            <div><dt>Platform</dt><dd>{asset.platform ?? 'Unknown'}</dd></div><div><dt>OS version</dt><dd>{asset.osVersion ?? 'Not reported'}</dd></div>
            <div><dt>Owner</dt><dd>{asset.owner ?? 'Unassigned'}</dd></div><div><dt>Owner team</dt><dd>{asset.ownerTeam ?? 'Unassigned'}</dd></div>
            <div><dt>First seen</dt><dd>{formatTimestamp(asset.firstSeen)}</dd></div><div><dt>Last seen</dt><dd>{formatTimestamp(asset.lastSeen)}</dd></div>
          </dl></section>
          <section className="ast-drawer-card"><header><Network size={14} /><div><strong>Network and cloud identity</strong><span>Copy exact values for pivots</span></div></header>
            <div className="ast-copy-row"><span>IP address</span><code>{asset.ipAddress ?? 'Not reported'}</code><button type="button" disabled={!asset.ipAddress} onClick={() => copyValue(asset.ipAddress)} aria-label="Copy IP address"><Copy size={12} /></button></div>
            <div className="ast-copy-row"><span>MAC address</span><code>{asset.macAddress ?? 'Not reported'}</code><button type="button" disabled={!asset.macAddress} onClick={() => copyValue(asset.macAddress)} aria-label="Copy MAC address"><Copy size={12} /></button></div>
            {asset.cloudProvider && <div className="ast-copy-row"><span>Cloud scope</span><code>{asset.cloudProvider} · {asset.cloudAccount}</code></div>}
          </section>
          <section className="ast-drawer-card"><header><Tags size={14} /><div><strong>Classification</strong><span>Business and operational context</span></div></header><div className="ast-tags">{(asset.tags?.length ? asset.tags : ['No tags']).map((tag) => <span key={tag}>{tag}</span>)}</div></section>
        </>}

        {tab === 'risk' && <>
          <section className="ast-risk-summary"><div><span>Active alerts</span><strong>{asset.activeAlertCount ?? 0}</strong></div><div><span>Critical CVEs</span><strong>{asset.criticalVulnerabilityCount ?? 0}</strong></div><div><span>Attack paths</span><strong>{asset.attackPathCount ?? 0}</strong></div></section>
          <section className="ast-drawer-card"><header><ShieldAlert size={14} /><div><strong>Risk drivers</strong><span>Evidence contributing to current priority</span></div></header><ul className="ast-driver-list">{(asset.riskDrivers ?? []).map((driver) => <li key={driver.id} data-level={driver.severity}><span /><div><strong>{driver.label}</strong><p>{driver.summary}</p><small>{driver.evidenceCount} evidence references · {driver.kind}</small></div></li>)}</ul></section>
          <section className="ast-drawer-card"><header><CheckCircle2 size={14} /><div><strong>Recommended work</strong><span>Prioritized by exposure reduction</span></div></header><ul className="ast-recommendations">{(asset.recommendations ?? []).map((item) => <li key={item.id}><div><strong>{item.title}</strong><span>{item.ownerTeam ?? 'Owner required'} · {item.state.replace('_', ' ')}</span></div><em>−{item.exposureReduction}</em></li>)}</ul></section>
          <div className="ast-pivots"><a href={`/posture/vulnerabilities?asset=${encodeURIComponent(entityId)}`}>View vulnerabilities<ExternalLink size={11} /></a><a href={`/posture/exposure?asset=${encodeURIComponent(entityId)}`}>Review exposure paths<ExternalLink size={11} /></a></div>
        </>}

        {tab === 'coverage' && <section className="ast-drawer-card"><header><Radar size={14} /><div><strong>Telemetry coverage</strong><span>Per-source health and freshness</span></div></header><ul className="ast-coverage-list">{(asset.coverage ?? []).map((source) => <li key={source.id} data-state={source.state}><span /><div><strong>{source.name}</strong><small>{source.state} · {source.lastObserved ? `observed ${formatRelativeTime(source.lastObserved)}` : 'never observed'}</small></div></li>)}</ul><p className="ast-drawer-note">Missing coverage lowers confidence; it does not mean the asset has no exposure or risk.</p></section>}

        {tab === 'activity' && <section className="ast-drawer-card"><header><History size={14} /><div><strong>Asset activity</strong><span>Bounded operational history</span></div></header><ol className="ast-activity-list"><li><span /><div><strong>Inventory refreshed</strong><small>{formatTimestamp(asset.lastSeen)} · {asset.discoverySources?.join(', ') || 'Unknown source'}</small></div></li><li><span /><div><strong>Risk projection calculated</strong><small>{asset.snapshotVersion ?? 'Version unavailable'} · {asset.riskScore ?? '—'}/100 risk</small></div></li><li><span /><div><strong>Ownership and classification</strong><small>{asset.ownerTeam ?? 'No owner team'} · {(asset.tags ?? []).join(', ') || 'no tags'}</small></div></li></ol></section>}
      </div>
    </HaDrawer>
  );
}

export function AssetsPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [view, setView] = useState<AssetView>('all');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [exposure, setExposure] = useState<ExposureFilter>('all');
  const [sensor, setSensor] = useState<SensorFilter>('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [density, setDensity] = useRowDensity();
  const [selectedAsset, setSelectedAsset] = useState<AssetDTO | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const epsStream = useEpsStream();

  const filters = useMemo<AssetFilters>(() => ({
    q: search || undefined,
    category: view,
    riskLevel: risk,
    exposureLevel: exposure,
    sensorHealth: sensor,
  }), [exposure, risk, search, sensor, view]);

  const query = useQuery({
    queryKey: ['asset-intelligence', filters, page, pageCursors[page], PAGE_SIZE],
    queryFn: () => fetchAssets(filters, page, PAGE_SIZE, 'riskScore,desc', pageCursors[page]),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
  });
  const rows = useMemo(() => query.data?.content ?? [], [query.data?.content]);
  const summary = query.data?.summary;

  const selectView = useCallback((next: AssetView) => { setView(next); setPage(0); setActiveIndex(0); }, []);
  const commitSearch = useCallback(() => { setSearch(searchDraft.trim()); setPage(0); setActiveIndex(0); }, [searchDraft]);

  useEffect(() => {
    setPage(0);
    setPageCursors([null]);
  }, [view, risk, exposure, sensor, search]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, button, a, [contenteditable=true]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (!rows.length) return;
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setActiveIndex((index) => Math.min(rows.length - 1, index + 1)); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelectedAsset(rows[activeIndex] ?? rows[0]); }
    };
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [activeIndex, rows]);

  useEffect(() => {
    if (!rows.length) return;
    gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api?.setFocusedCell(activeIndex, 'clientName');
  }, [activeIndex, rows.length]);

  const columns = useMemo<ColDef[]>(() => [
    { field: 'clientName', colId: 'clientName', headerName: 'Asset', minWidth: 220, flex: 1, pinned: 'left', cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <span className="ast-primary-cell"><span className="ast-asset-icon">{categoryIcon(asset.category)}</span><span><strong>{asset.clientName}</strong><small>{asset.ipAddress ?? asset.cloudAccount ?? asset.clientDomain}</small></span></span> : null },
    { field: 'criticality', headerName: 'Criticality', width: 142, cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <CriticalityBadge value={asset.criticality} /> : null },
    { field: 'riskScore', headerName: 'Risk', width: 112, sort: 'desc', cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <RiskBadge level={asset.riskLevel} score={asset.riskScore} /> : null },
    { field: 'exposureScore', headerName: 'Exposure', width: 124, cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <ExposureBadge level={asset.exposureLevel} score={asset.exposureScore} /> : null },
    { field: 'category', headerName: 'Category', width: 112, valueFormatter: ({ value }: { value: AssetCategory }) => VIEW_LABELS[value ?? 'unknown'] },
    { field: 'sensorHealth', headerName: 'Coverage', width: 126, cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <SensorBadge asset={asset} /> : null },
    { field: 'activeAlertCount', headerName: 'Alerts', width: 76, type: 'numericColumn', valueFormatter: ({ value }: { value?: number }) => value == null ? '—' : String(value) },
    { field: 'vulnerabilityCount', headerName: 'Vulns', width: 78, type: 'numericColumn', cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <span className="ast-vuln-count" data-critical={Boolean(asset.criticalVulnerabilityCount) || undefined}>{asset.vulnerabilityCount ?? '—'}<small>{asset.criticalVulnerabilityCount ? `${asset.criticalVulnerabilityCount} critical` : ''}</small></span> : null },
    { field: 'owner', headerName: 'Owner', width: 126, valueFormatter: ({ value }: { value?: string }) => value ?? 'Unassigned' },
    { field: 'lastSeen', headerName: 'Last seen', width: 104, cellRenderer: ({ data: asset }: ICellRendererParams<AssetDTO>) => asset ? <span className="ast-last-seen" title={asset.lastSeen ?? undefined}>{formatRelativeTime(asset.lastSeen)}<small>{asset.discoverySources?.[0] ?? 'Unknown source'}</small></span> : null },
    { headerName: '', width: 34, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: () => <ChevronRight size={14} className="ast-chevron" /> },
  ], []);

  const hasFilters = view !== 'all' || risk !== 'all' || exposure !== 'all' || sensor !== 'all' || Boolean(search);
  const errorMessage = query.error instanceof Error ? query.error.message : 'The authorized asset projection could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorMessage);

  return (
    <section className="ast-page" data-fixture={assetFixtureMode || undefined} aria-label="Asset intelligence inventory">
      <header className="ast-header"><div className="ast-header__identity"><span className="ast-header__mark"><Boxes size={19} /></span><div><span>Posture &amp; exposure</span><h1>Asset Intelligence</h1></div></div><div className="ast-header__actions"><span className="ast-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/exposure"><Eye size={13} />Exposure</a><a href="/posture/vulnerabilities"><ShieldAlert size={13} />Vulnerabilities</a><a href="/posture/identities"><UserRound size={13} />Identities</a><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh asset inventory"><RefreshCw size={14} className={query.isFetching ? 'ast-spin' : undefined} /></button></div></header>
      {assetFixtureMode && <div className="ast-fixture"><strong>Design fixture:</strong> fictional asset and exposure records are enabled for visual review.<span>Production never receives these records.</span></div>}

      <section className="ast-summary" aria-label="Asset posture summary">
        <div><span><Boxes size={13} />Known assets</span><strong>{summary?.total.toLocaleString() ?? query.data?.totalElements.toLocaleString() ?? '—'}</strong><small>authorized inventory</small></div>
        <div data-tone="critical"><span><ShieldAlert size={13} />Critical assets</span><strong>{summary?.criticalAssets ?? '—'}</strong><small>mission-critical value</small></div>
        <div data-tone="danger"><span><Activity size={13} />High risk</span><strong>{summary?.highRisk ?? '—'}</strong><small>active threat likelihood</small></div>
        <div data-tone="warning"><span><Eye size={13} />High exposure</span><strong>{summary?.highExposure ?? '—'}</strong><small>exploitable weaknesses</small></div>
        <div data-tone="warning"><span><Radar size={13} />Not onboarded</span><strong>{summary?.notOnboarded ?? '—'}</strong><small>discovered, not protected</small></div>
        <div data-tone="info"><span><Clock3 size={13} />Sensor attention</span><strong>{summary?.sensorAttention ?? '—'}</strong><small>{summary ? `${summary.newlyDiscovered} newly discovered` : 'summary unavailable'}</small></div>
      </section>

      <section className="ast-operations">
        <nav className="ast-tabs" aria-label="Asset categories">{(['all', 'endpoint', 'server', 'cloud', 'network', 'iot_ot', 'unknown'] as const).map((item) => <button key={item} type="button" data-active={view === item} onClick={() => selectView(item)}>{item === 'all' ? <Boxes size={13} /> : categoryIcon(item)}{VIEW_LABELS[item]}</button>)}</nav>
        <div className="ast-toolbar" role="toolbar" aria-label="Asset inventory filters">
          <label className="ast-search"><Search size={14} /><input ref={searchRef} type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commitSearch(); if (event.key === 'Escape') { setSearchDraft(''); setSearch(''); setPage(0); } }} placeholder="Search name, IP, owner, tag…" aria-label="Search assets" /><kbd>/</kbd></label>
          <Filter size={13} className="ast-filter-icon" />
          <HaCompactSelect<RiskFilter> ariaLabel="Asset risk level" label="Risk" value={risk} options={RISK_OPTIONS} onChange={(value) => { setRisk(value); setPage(0); }} />
          <HaCompactSelect<ExposureFilter> ariaLabel="Asset exposure level" label="Exposure" value={exposure} options={EXPOSURE_OPTIONS} onChange={(value) => { setExposure(value); setPage(0); }} />
          <HaCompactSelect<SensorFilter> ariaLabel="Asset sensor coverage" label="Coverage" value={sensor} options={SENSOR_OPTIONS} onChange={(value) => { setSensor(value); setPage(0); }} />
          <span className="ast-scope"><LockKeyhole size={12} />All authorized tenants</span>
          <span className="ast-snapshot">Snapshot {query.data?.snapshotAt ? formatTimestamp(query.data.snapshotAt) : query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>
      </section>

      {Boolean(query.data?.stale || query.data?.partialFailures?.length) && <div className="ast-warning" role="status"><AlertTriangle size={14} /><span>{query.data?.partialFailures?.length ? `${query.data.partialFailures.length} inventory source failed; usable records are preserved.` : 'This asset projection is stale while sources recover.'}</span><button type="button" onClick={() => query.refetch()}>Retry sources</button></div>}

      <div className="ast-results-toolbar"><div><strong>{VIEW_LABELS[view]}</strong><span>{query.data ? `${rows.length} loaded · ${query.data.totalElements.toLocaleString()} matching` : 'bounded authorized projection'}</span>{hasFilters && rows.length > 0 && <button type="button" onClick={() => { selectView('all'); setRisk('all'); setExposure('all'); setSensor('all'); setSearch(''); setSearchDraft(''); }}>Clear filters</button>}</div><div className="ast-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button></div></div>

      {query.isError && !query.data ? <div className="ast-inline-state" role="alert"><AlertTriangle size={26} /><strong>{forbidden ? 'Asset inventory access denied' : 'Asset inventory unavailable'}</strong><span>{forbidden ? 'Your current role or tenant scope does not permit this inventory.' : errorMessage}</span>{!forbidden && <button type="button" onClick={() => query.refetch()}>Retry inventory</button>}</div> : !query.isLoading && rows.length === 0 ? <div className="ast-inline-state" role="status"><ShieldCheck size={26} /><strong>{hasFilters ? 'No assets match these filters' : 'No assets discovered'}</strong><span>{hasFilters ? 'Clear filters or broaden the authorized scope.' : 'Deploy a sensor or connect an authorized discovery source to build the inventory.'}</span>{hasFilters && <button type="button" onClick={() => { selectView('all'); setRisk('all'); setExposure('all'); setSensor('all'); setSearch(''); setSearchDraft(''); }}>Clear filters</button>}</div> : <main className="ast-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid ast-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={query.isLoading} rowSelection="single" suppressRowClickSelection={false} onRowClicked={(event: RowClickedEvent) => setSelectedAsset(event.data as AssetDTO)} getRowId={(params) => String((params.data as AssetDTO).id)} defaultColDef={{ filter: false }} ariaLabel="Asset intelligence inventory" /></main>}

      <footer className="ast-pagination" aria-label="Asset inventory pagination"><span>{query.data?.totalElements.toLocaleString() ?? 0} matching assets</span><span>Page {page + 1} of {Math.max(1, query.data?.totalPages ?? 1)} · up to {PAGE_SIZE} rows</span><div><button type="button" disabled={page === 0 || query.isFetching} onClick={() => { setPage((value) => Math.max(0, value - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={!query.data?.hasMore || !query.data.nextCursor || query.isFetching} onClick={() => { const nextCursor = query.data?.nextCursor; if (!nextCursor) return; setPageCursors((current) => { const next = current.slice(0, page + 1); next[page + 1] = nextCursor; return next; }); setPage((value) => value + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="ast-status" sseConnected={assetFixtureMode || epsStream.connected} eps={assetFixtureMode ? 12840 : epsStream.eps} mode={assetFixtureMode ? 'historical' : 'live'} lastUpdated={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined} />
      {selectedAsset && <AssetDrawer asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </section>
  );
}
