import { useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Cloud,
  Crosshair,
  Database,
  Fingerprint,
  GitBranch,
  Globe2,
  KeyRound,
  List,
  Network,
  RefreshCw,
  Route,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
  Wrench,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { exposureFixtureMode, fetchExposure } from '@/services/exposure.service';
import type {
  AttackPathDTO,
  ChokePointDTO,
  CriticalAssetExposureDTO,
  ExposureEntityType,
  ExposureFilters,
  ExposureRemediationDTO,
  ExposureRisk,
  ExposureRow,
  ExposureScope,
  ExposureState,
  ExposureTimeRange,
  ExposureView,
} from '@/types/exposure.types';

import './ExposurePage.css';
import '../../response/response-grid-standard.css';

const PAGE_SIZE = 50;
type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;

const VIEWS: Array<{ value: ExposureView; label: string; icon: typeof Route }> = [
  { value: 'attack_paths', label: 'Attack paths', icon: Route },
  { value: 'choke_points', label: 'Choke points', icon: Crosshair },
  { value: 'critical_assets', label: 'Critical assets', icon: Target },
  { value: 'remediation', label: 'Remediation impact', icon: Wrench },
];
const RISKS: Array<{ value: ExposureRisk | 'all'; label: string }> = [{ value: 'all', label: 'All risk' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }];
const SCOPES: Array<{ value: ExposureScope; label: string }> = [{ value: 'all', label: 'All paths' }, { value: 'external', label: 'External' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'internal', label: 'Internal' }];
const STATES: Array<{ value: ExposureState | 'all'; label: string }> = [{ value: 'all', label: 'All states' }, { value: 'active', label: 'Active' }, { value: 'accepted', label: 'Accepted' }, { value: 'resolved', label: 'Resolved' }];
const WINDOWS: Array<{ value: ExposureTimeRange; label: string }> = [{ value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }];

function isPath(row: ExposureRow): row is AttackPathDTO { return 'pathNodes' in row; }
function isChokePoint(row: ExposureRow): row is ChokePointDTO { return 'affectedPathIds' in row; }
function isCriticalAsset(row: ExposureRow): row is CriticalAssetExposureDTO { return 'shortestPathHops' in row; }
function isRemediation(row: ExposureRow): row is ExposureRemediationDTO { return 'exposureReduction' in row; }
function matchesView(row: ExposureRow, view: ExposureView): boolean {
  if (view === 'attack_paths') return isPath(row);
  if (view === 'choke_points') return isChokePoint(row);
  if (view === 'critical_assets') return isCriticalAsset(row);
  return isRemediation(row);
}

function relativeTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}
function formatTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
function riskTone(score: number | null | undefined): string { return score == null ? 'unknown' : score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low'; }
function rowName(row: ExposureRow): string { return isPath(row) || isRemediation(row) ? row.title : row.name; }
function entityIcon(type: ExposureEntityType, size = 14): JSX.Element {
  if (type === 'identity') return <Fingerprint size={size} />;
  if (type === 'host') return <Server size={size} />;
  if (type === 'ip' || type === 'internet') return <Globe2 size={size} />;
  if (type === 'cloud') return <Cloud size={size} />;
  if (type === 'data') return <Database size={size} />;
  if (type === 'service' || type === 'application') return <Boxes size={size} />;
  return <CircleDot size={size} />;
}

function RiskBadge({ risk, score }: { risk: ExposureRisk; score?: number }): JSX.Element {
  return <span className="exp-risk" data-level={risk}><span />{risk}{score != null && <small>{score}</small>}</span>;
}

function ExposureDrawer({ row, onClose }: { row: ExposureRow; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState('overview');
  const tabs = isPath(row) ? ['overview', 'path', 'evidence', 'remediation'] : ['overview', 'related paths', 'remediation'];
  return (
    <HaDrawer isOpen onClose={onClose} title={rowName(row)} subtitle={isPath(row) ? `${row.scope} path · ${row.hopCount} hops` : isChokePoint(row) ? `${row.pathCount} converging paths` : isCriticalAsset(row) ? row.classification : `${row.exposureReduction}% projected reduction`} width={600} footer={<><a className="exp-drawer-action" href={`/search?query=${encodeURIComponent(`exposure.id:"${row.id}"`)}`}><Search size={13} />Hunt evidence</a><a className="exp-drawer-action" href={`/constellation?focus=${encodeURIComponent(row.id)}`}><GitBranch size={13} />Open graph</a><a className="exp-drawer-action exp-drawer-action--primary" href={`/response/playbooks/new?template=exposure-remediation&target=${encodeURIComponent(row.id)}`}><Workflow size={13} />Create plan</a></>}>
      <div className="exp-drawer">
        <nav className="exp-drawer-tabs" aria-label="Exposure detail views">{tabs.map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}</nav>
        {isPath(row) && <>
          {tab === 'overview' && <><section className="exp-drawer-hero"><RiskBadge risk={row.riskLevel} score={row.riskScore} /><div><span>Exploitability</span><strong>{row.exploitability}</strong></div><div><span>Critical assets</span><strong>{row.criticalAssetCount}</strong></div></section><section className="exp-intelligence"><header><Sparkles size={14} /><strong>Hive Intelligence</strong><span>Review required</span></header><p>{row.summary} Prioritize the shared weak points that remove the greatest number of verified paths; confidence remains bounded by the cited observations.</p></section><section className="exp-card"><header><ShieldAlert size={14} /><div><strong>Exposure context</strong><span>Correlated, not a single finding</span></div></header><p>{row.summary}</p><dl className="exp-detail-grid"><div><dt>State</dt><dd>{row.state}</dd></div><div><dt>Owner</dt><dd>{row.owner ?? 'Unassigned'}</dd></div><div><dt>First seen</dt><dd>{formatTime(row.firstSeenAt)}</dd></div><div><dt>Calculated</dt><dd>{formatTime(row.lastCalculatedAt)}</dd></div></dl><div className="exp-tags">{row.techniques.map((technique) => <span key={technique}>{technique}</span>)}</div></section></>}
          {tab === 'path' && <section className="exp-card"><header><Route size={14} /><div><strong>Observed attack sequence</strong><span>Entry point to critical impact</span></div></header><ol className="exp-path-detail">{row.pathNodes.map((node, index) => <li key={node.id}><span className="exp-node-icon">{entityIcon(node.type, 16)}</span><div><small>{index === 0 ? 'Entry point' : index === row.pathNodes.length - 1 ? 'Critical target' : `Hop ${index}`}</small><strong>{node.name}</strong><p>{node.relationship}</p></div>{index < row.pathNodes.length - 1 && <ArrowRight size={14} />}</li>)}</ol></section>}
          {tab === 'evidence' && <section className="exp-card"><header><BadgeCheck size={14} /><div><strong>Evidence and provenance</strong><span>Observations supporting this path</span></div></header><ul className="exp-evidence">{row.evidence.map((item) => <li key={item.id}><span>{item.confidence}%</span><div><strong>{item.label}</strong><p>{item.value}</p><small>{item.source} · {formatTime(item.observedAt)}</small></div></li>)}</ul></section>}
          {tab === 'remediation' && <section className="exp-card"><header><Wrench size={14} /><div><strong>Recommended control change</strong><span>Preview impact before execution</span></div></header><p>{row.recommendedAction}</p><div className="exp-callout"><ShieldCheck size={14} /><span>Creating a plan does not change production. Target, authorization, dependencies, blast radius, approval, rollback, and freshness must be revalidated by the backend.</span></div></section>}
        </>}
        {!isPath(row) && <>
          {tab === 'overview' && <><section className="exp-drawer-hero"><RiskBadge risk={row.riskLevel} score={'riskScore' in row ? row.riskScore : undefined} /><div><span>Paths affected</span><strong>{row.pathCount}</strong></div><div><span>Critical assets</span><strong>{isCriticalAsset(row) ? 1 : row.criticalAssetCount}</strong></div></section>{isChokePoint(row) && <section className="exp-card"><header>{entityIcon(row.entityType)}<div><strong>Shared weak point</strong><span>{row.reachableFromInternet ? 'Internet reachable' : 'Internal reachability'}</span></div></header><ul className="exp-driver-list">{row.exposureDrivers.map((driver) => <li key={driver}>{driver}</li>)}</ul></section>}{isCriticalAsset(row) && <section className="exp-card"><header>{entityIcon(row.entityType)}<div><strong>{row.classification}</strong><span>Business-critical asset</span></div></header><dl className="exp-detail-grid"><div><dt>Shortest path</dt><dd>{row.shortestPathHops} hops</dd></div><div><dt>Entry point</dt><dd>{row.topEntryPoint}</dd></div><div><dt>Internet path</dt><dd>{row.internetReachable ? 'Observed' : 'Not observed'}</dd></div><div><dt>Owner</dt><dd>{row.owner ?? 'Unassigned'}</dd></div></dl></section>}{isRemediation(row) && <section className="exp-card"><header><Wrench size={14} /><div><strong>Projected exposure reduction</strong><span>Requires authoritative preview</span></div></header><p>{row.recommendation}</p><dl className="exp-detail-grid"><div><dt>Reduction</dt><dd>{row.exposureReduction}%</dd></div><div><dt>Effort</dt><dd>{row.effort}</dd></div><div><dt>Disruption</dt><dd>{row.disruption}</dd></div><div><dt>State</dt><dd>{row.state}</dd></div></dl></section>}</>}
          {tab === 'related paths' && <section className="exp-card"><header><Route size={14} /><div><strong>Related attack paths</strong><span>Progressively loaded by the authoritative graph service</span></div></header><p>Open the exposure graph to review the bounded set of paths, exact relationships, and evidence that traverse this object.</p></section>}
          {tab === 'remediation' && <section className="exp-card"><header><Wrench size={14} /><div><strong>Recommended action</strong><span>Governed change required</span></div></header><p>{isChokePoint(row) ? row.recommendedAction : isRemediation(row) ? row.recommendation : `Reduce the shortest reachable paths to ${row.name}, starting with ${row.topEntryPoint}.`}</p></section>}
        </>}
      </div>
    </HaDrawer>
  );
}

export function ExposurePage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialAsset = new URLSearchParams(window.location.search).get('asset') ?? undefined;
  const [view, setView] = useState<ExposureView>('attack_paths');
  const [risk, setRisk] = useState<ExposureRisk | 'all'>('all');
  const [scope, setScope] = useState<ExposureScope>('all');
  const [state, setState] = useState<ExposureState | 'all'>('active');
  const [timeRange, setTimeRange] = useState<ExposureTimeRange>('24h');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounce(searchDraft.trim(), 300);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [density, setDensity] = useState<Density>('standard');
  const [selected, setSelected] = useState<ExposureRow | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const eps = useEpsStream();

  const filters = useMemo<ExposureFilters>(() => ({ view, query: search || undefined, risk, scope, state, timeRange, assetId: initialAsset, cursor: cursors[page], limit: PAGE_SIZE }), [cursors, initialAsset, page, risk, scope, search, state, timeRange, view]);
  const query = useQuery({ queryKey: ['exposure-management', filters], queryFn: ({ signal }) => fetchExposure(filters, signal), staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
  const rows = useMemo(() => (query.data?.items ?? []).filter((row) => matchesView(row, view)), [query.data?.items, view]);

  useEffect(() => { setPage(0); setCursors([null]); setActiveIndex(0); setSelected(null); }, [risk, scope, search, state, timeRange, view]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (!rows.length) return;
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setActiveIndex((value) => Math.min(rows.length - 1, value + 1)); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelected(rows[activeIndex] ?? rows[0]); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [activeIndex, rows]);
  useEffect(() => {
    if (!rows.length) return;
    gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api?.setFocusedCell(activeIndex, view === 'attack_paths' || view === 'remediation' ? 'title' : 'name');
  }, [activeIndex, rows.length, view]);

  const columns = useMemo<ColDef[]>(() => {
    if (view === 'choke_points') return [
      { field: 'name', colId: 'name', headerName: 'Shared weak point', pinned: 'left', minWidth: 250, flex: 1, cellRenderer: ({ data }: ICellRendererParams<ChokePointDTO>) => data ? <span className="exp-primary"><span className="exp-row-icon">{entityIcon(data.entityType)}</span><span><strong>{data.name}</strong><small>{data.exposureDrivers.slice(0, 2).join(' · ')}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 120, cellRenderer: ({ data }: ICellRendererParams<ChokePointDTO>) => data ? <RiskBadge risk={data.riskLevel} score={data.riskScore} /> : null }, { field: 'pathCount', headerName: 'Paths', width: 82 }, { field: 'criticalAssetCount', headerName: 'Critical assets', width: 112 }, { field: 'reachableFromInternet', headerName: 'Internet path', width: 112, valueFormatter: ({ value }: { value: boolean }) => value ? 'Observed' : 'Not observed' }, { field: 'lastCalculatedAt', headerName: 'Calculated', width: 112, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
    if (view === 'critical_assets') return [
      { field: 'name', colId: 'name', headerName: 'Critical asset', pinned: 'left', minWidth: 250, flex: 1, cellRenderer: ({ data }: ICellRendererParams<CriticalAssetExposureDTO>) => data ? <span className="exp-primary"><span className="exp-row-icon">{entityIcon(data.entityType)}</span><span><strong>{data.name}</strong><small>{data.classification}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 120, cellRenderer: ({ data }: ICellRendererParams<CriticalAssetExposureDTO>) => data ? <RiskBadge risk={data.riskLevel} score={data.riskScore} /> : null }, { field: 'pathCount', headerName: 'Paths', width: 82 }, { field: 'shortestPathHops', headerName: 'Shortest path', width: 112, valueFormatter: ({ value }: { value: number }) => `${value} hops` }, { field: 'internetReachable', headerName: 'Internet path', width: 112, valueFormatter: ({ value }: { value: boolean }) => value ? 'Observed' : 'Not observed' }, { field: 'topEntryPoint', headerName: 'Top entry point', width: 160 }, { field: 'owner', headerName: 'Owner', width: 142, valueFormatter: ({ value }: { value?: string | null }) => value ?? 'Unassigned' },
    ];
    if (view === 'remediation') return [
      { field: 'title', colId: 'title', headerName: 'Remediation opportunity', pinned: 'left', minWidth: 320, flex: 1, cellRenderer: ({ data }: ICellRendererParams<ExposureRemediationDTO>) => data ? <span className="exp-primary"><span className="exp-row-icon"><Wrench size={14} /></span><span><strong>{data.title}</strong><small>{data.category} · {data.recommendation}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 106, cellRenderer: ({ data }: ICellRendererParams<ExposureRemediationDTO>) => data ? <RiskBadge risk={data.riskLevel} /> : null }, { field: 'exposureReduction', headerName: 'Reduction', width: 100, valueFormatter: ({ value }: { value: number }) => `−${value}%` }, { field: 'pathCount', headerName: 'Paths', width: 80 }, { field: 'criticalAssetCount', headerName: 'Critical assets', width: 110 }, { field: 'effort', headerName: 'Effort', width: 88 }, { field: 'disruption', headerName: 'Disruption', width: 96 }, { field: 'state', headerName: 'State', width: 104 }, { field: 'owner', headerName: 'Owner', width: 140, valueFormatter: ({ value }: { value?: string | null }) => value ?? 'Unassigned' },
    ];
    return [
      { field: 'title', colId: 'title', headerName: 'Attack path', pinned: 'left', minWidth: 330, flex: 1, cellRenderer: ({ data }: ICellRendererParams<AttackPathDTO>) => data ? <span className="exp-primary"><span className="exp-row-icon"><Route size={14} /></span><span><strong>{data.title}</strong><small>{data.entryPoint.name} → {data.target.name}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 120, cellRenderer: ({ data }: ICellRendererParams<AttackPathDTO>) => data ? <RiskBadge risk={data.riskLevel} score={data.riskScore} /> : null }, { field: 'exploitability', headerName: 'Exploitability', width: 116 }, { field: 'scope', headerName: 'Scope', width: 92 }, { field: 'hopCount', headerName: 'Hops', width: 70 }, { field: 'weakPointCount', headerName: 'Weak points', width: 102 }, { field: 'criticalAssetCount', headerName: 'Critical assets', width: 110 }, { field: 'owner', headerName: 'Owner', width: 140, valueFormatter: ({ value }: { value?: string | null }) => value ?? 'Unassigned' }, { field: 'lastCalculatedAt', headerName: 'Calculated', width: 110, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
  }, [view]);

  const summary = query.data?.summary;
  const missingContract = query.data?.contractState === 'missing';
  const hasFilters = risk !== 'all' || scope !== 'all' || state !== 'active' || timeRange !== '24h' || Boolean(search) || Boolean(initialAsset);
  const reset = (): void => { setRisk('all'); setScope('all'); setState('active'); setTimeRange('24h'); setSearchDraft(''); };

  return (
    <section className="exp-page" data-fixture={exposureFixtureMode || undefined} aria-label="Exposure management">
      <header className="exp-header"><div className="exp-header__identity"><span className="exp-header__mark"><Network size={19} /></span><div><span>Posture &amp; exposure</span><h1>Exposure Management</h1></div></div><div className="exp-header__actions"><span className="exp-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/assets"><Boxes size={13} />Assets</a><a href="/posture/vulnerabilities"><ShieldAlert size={13} />Vulnerabilities</a><a href="/constellation"><GitBranch size={13} />Constellation</a><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh exposure snapshot"><RefreshCw size={14} className={query.isFetching ? 'exp-spin' : undefined} /></button></div></header>
      {exposureFixtureMode && <div className="exp-fixture"><strong>Design fixture:</strong> fictional exposure paths are enabled for visual review.<span>Production never receives these records.</span></div>}
      <section className="exp-summary" aria-label="Exposure summary">
        <button type="button" data-tone={riskTone(summary?.exposureScore)} disabled={missingContract} onClick={() => { if (!missingContract) setView('attack_paths'); }}><span><Activity size={12} />Exposure score</span><strong>{summary?.exposureScore ?? '—'}<small>/100</small></strong><em>{missingContract ? 'contract unavailable' : 'cross-domain effective risk'}</em></button>
        <button type="button" data-tone="critical" disabled={missingContract} onClick={() => { if (!missingContract) { setView('attack_paths'); setRisk('critical'); } }}><span><Route size={12} />Active attack paths</span><strong>{summary?.activeAttackPaths ?? '—'}</strong><em>{missingContract ? 'contract unavailable' : 'entry point to impact'}</em></button>
        <button type="button" data-tone="critical" disabled={missingContract} onClick={() => { if (!missingContract) setView('critical_assets'); }}><span><Target size={12} />Critical assets at risk</span><strong>{summary?.criticalAssetsAtRisk ?? '—'}</strong><em>{missingContract ? 'contract unavailable' : 'reachable crown jewels'}</em></button>
        <button type="button" data-tone="high" disabled={missingContract} onClick={() => { if (!missingContract) { setView('attack_paths'); setScope('external'); } }}><span><Globe2 size={12} />Internet entry points</span><strong>{summary?.internetEntryPoints ?? '—'}</strong><em>{missingContract ? 'contract unavailable' : 'validated external exposure'}</em></button>
        <button type="button" data-tone="warning" disabled={missingContract} onClick={() => { if (!missingContract) setView('choke_points'); }}><span><Crosshair size={12} />Choke points</span><strong>{summary?.chokePoints ?? '—'}</strong><em>{missingContract ? 'contract unavailable' : 'shared weak points'}</em></button>
        <button type="button" data-tone="info" disabled={missingContract} onClick={() => { if (!missingContract) setView('remediation'); }}><span><Wrench size={12} />Reducible paths</span><strong>{summary?.reduciblePaths ?? '—'}</strong><em>{missingContract ? 'contract unavailable' : 'priority control changes'}</em></button>
      </section>
      <section className="exp-operations"><nav className="exp-tabs" aria-label="Exposure views">{VIEWS.map(({ value, label, icon: Icon }) => <button key={value} type="button" data-active={view === value} aria-pressed={view === value} disabled={missingContract} onClick={() => { if (!missingContract) setView(value); }}><Icon size={13} />{label}</button>)}</nav><div className="exp-toolbar"><label className="exp-search"><Search size={14} /><input ref={searchRef} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Find path, asset, identity, IP, or control…" aria-label="Search exposure records" disabled={missingContract} /><kbd>/</kbd></label><HaCompactSelect ariaLabel="Filter by risk" label="Risk" value={risk} options={RISKS} onChange={setRisk} disabled={missingContract} />{view === 'attack_paths' && <><HaCompactSelect ariaLabel="Filter by exposure scope" label="Scope" value={scope} options={SCOPES} onChange={setScope} disabled={missingContract} /><HaCompactSelect ariaLabel="Filter by path state" label="State" value={state} options={STATES} onChange={setState} disabled={missingContract} /></>}<HaCompactSelect ariaLabel="Filter by calculation window" label="Window" value={timeRange} options={WINDOWS} onChange={setTimeRange} disabled={missingContract} /><span className="exp-auth"><KeyRound size={12} />Authorized topology</span><span className="exp-snapshot">Snapshot {formatTime(query.data?.snapshotAt)}</span></div></section>
      {query.data?.freshness === 'stale' && <div className="exp-warning" role="status"><AlertTriangle size={14} /><span>This exposure projection is stale. Path state may have changed since it was calculated.</span><button type="button" onClick={() => query.refetch()}>Refresh</button></div>}
      {Boolean(query.data?.partialFailures.length) && <div className="exp-warning" role="status"><AlertTriangle size={14} /><span>{query.data?.partialFailures[0]?.message}</span><a href="#exposure-contract-state">Review backend contract</a></div>}
      <div className="exp-results"><div><strong>{VIEWS.find((item) => item.value === view)?.label}</strong><span>{missingContract ? 'Backend contract unavailable — not an empty risk assessment' : query.data ? `${rows.length} loaded · ${query.data.total.toLocaleString()} matching` : 'bounded authorized projection'}</span>{hasFilters && !missingContract && <button type="button" onClick={reset}>Clear filters</button>}</div><div className="exp-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button></div></div>
      {query.isError && !query.data ? <div className="exp-state" role="alert"><AlertTriangle size={28} /><strong>Exposure projection unavailable</strong><span>{query.error instanceof Error ? query.error.message : 'The authorized exposure graph could not be loaded.'}</span><button type="button" onClick={() => query.refetch()}>Retry</button></div> : missingContract ? <div className="exp-state" role="status"><Network size={30} /><strong>Exposure graph integration required</strong><span>Attack-path and choke-point APIs are not available in this deployment. HiveArmor will not invent paths or a safe posture from generic asset records — empty KPIs here mean the contract is missing, not that exposure is zero.</span><a href="#exposure-contract-state">View contract state</a></div> : !query.isLoading && rows.length === 0 ? <div className="exp-state" role="status"><ShieldCheck size={28} /><strong>{hasFilters ? 'No exposure records match these filters' : 'No active attack paths were generated'}</strong><span>{hasFilters ? 'Clear filters or broaden the authorized topology and time range.' : 'This is not proof of zero risk; confirm graph coverage and critical-asset classification.'}</span>{hasFilters && <button type="button" onClick={reset}>Clear filters</button>}</div> : <main className="exp-grid-wrap"><SiemDataGrid key={view} ref={gridRef} className="response-grid exp-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={query.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => setSelected(event.data as ExposureRow)} getRowId={(params) => String((params.data as ExposureRow).id)} defaultColDef={{ filter: false }} ariaLabel={`${VIEWS.find((item) => item.value === view)?.label} exposure inventory`} /></main>}
      <footer className="exp-pagination" aria-label="Exposure results pagination"><span>{missingContract ? 'Contract not implemented' : `${query.data?.total.toLocaleString() ?? 0} matching records`}</span><span>Page {page + 1} · up to {PAGE_SIZE} rows</span><div><button type="button" disabled={page === 0 || query.isFetching || missingContract} onClick={() => { setPage((current) => Math.max(0, current - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={missingContract || !query.data?.nextCursor || query.isFetching} onClick={() => { const cursor = query.data?.nextCursor; if (!cursor) return; setCursors((current) => { const next = current.slice(0, page + 1); next[page + 1] = cursor; return next; }); setPage((current) => current + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="exp-status" sseConnected={exposureFixtureMode || eps.connected} eps={exposureFixtureMode ? 12840 : eps.eps} mode="live" lastUpdated={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined} />
      {selected && <ExposureDrawer row={selected} onClose={() => setSelected(null)} />}
      <span id="exposure-contract-state" className="exp-sr-only">Exposure management contract state: {query.data?.contractState ?? 'unavailable'}</span>
    </section>
  );
}
