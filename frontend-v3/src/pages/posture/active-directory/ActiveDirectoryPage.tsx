import { useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eye,
  FileKey2,
  Fingerprint,
  GitBranch,
  History,
  Link2,
  List,
  LockKeyhole,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';
import { activeDirectoryFixtureMode, fetchAdPosture } from '@/services/active-directory.service';
import type {
  AdAssessmentCategory,
  AdAssessmentDTO,
  AdDomainSummaryDTO,
  AdInfrastructureDTO,
  AdPostureFilters,
  AdRiskLevel,
  AdRow,
  AdTimeRange,
  AdTrackerEventDTO,
  AdView,
} from '@/types/active-directory.types';

import './ActiveDirectoryPage.css';
import '../../response/response-grid-standard.css';

const PAGE_SIZE = 50;
type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;

const VIEWS: Array<{ value: AdView; label: string; icon: typeof ShieldAlert }> = [
  { value: 'assessments', label: 'Security assessments', icon: ShieldAlert },
  { value: 'domains', label: 'Domains & trusts', icon: Network },
  { value: 'changes', label: 'Privileged changes', icon: History },
  { value: 'infrastructure', label: 'Identity infrastructure', icon: Server },
];
const RISKS: Array<{ value: AdRiskLevel | 'all'; label: string }> = [{ value: 'all', label: 'All risk' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }];
const CATEGORIES: Array<{ value: AdAssessmentCategory | 'all'; label: string }> = [{ value: 'all', label: 'All categories' }, { value: 'identity_infrastructure', label: 'Infrastructure' }, { value: 'accounts', label: 'Accounts' }, { value: 'group_policy', label: 'Group Policy' }, { value: 'certificates', label: 'Certificates' }, { value: 'hybrid_security', label: 'Hybrid security' }, { value: 'trusts', label: 'Trusts' }];
const WINDOWS: Array<{ value: AdTimeRange; label: string }> = [{ value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }];

function isAssessment(row: AdRow): row is AdAssessmentDTO { return 'scoreImpact' in row; }
function isDomain(row: AdRow): row is AdDomainSummaryDTO { return 'postureScore' in row; }
function isChange(row: AdRow): row is AdTrackerEventDTO { return 'actor' in row; }
function isInfrastructure(row: AdRow): row is AdInfrastructureDTO { return 'monitoringState' in row; }
function matchesView(row: AdRow, view: AdView): boolean {
  if (view === 'assessments') return isAssessment(row);
  if (view === 'domains') return isDomain(row);
  if (view === 'changes') return isChange(row);
  return isInfrastructure(row);
}

function formatTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unavailable' : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeTime(value?: string | null): string {
  if (!value) return 'Never';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}

function categoryLabel(value?: AdAssessmentCategory): string { return value?.replace(/_/g, ' ') ?? 'unknown'; }
function roleLabel(value?: AdInfrastructureDTO['role']): string { return value?.replace(/_/g, ' ') ?? 'unknown'; }

function RiskBadge({ level }: { level: AdRiskLevel }): JSX.Element {
  return <span className="adp-risk" data-level={level}><span />{level}</span>;
}

function HealthBadge({ state }: { state: string }): JSX.Element {
  return <span className="adp-health" data-state={state}><CircleDot size={11} />{state}</span>;
}

function AdDetailDrawer({ row, onClose }: { row: AdRow; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState('overview');
  const title = isAssessment(row) ? row.title : isDomain(row) ? row.domainName : isInfrastructure(row) ? row.name : row.target;
  const subtitle = isAssessment(row) ? `${categoryLabel(row.category)} · ${row.domainName}` : isDomain(row) ? `${row.forestName} forest` : row.domainName;
  const tabs = isAssessment(row) ? ['overview', 'evidence', 'exposure'] : isDomain(row) ? ['overview', 'controllers', 'trusts'] : ['overview', 'context'];
  return (
    <HaDrawer isOpen onClose={onClose} title={title} subtitle={subtitle} width={570} footer={<><a className="adp-drawer-action" href={`/search?query=${encodeURIComponent(isAssessment(row) ? `ad.assessment.id:"${row.id}"` : `ad.domain:"${subtitle}"`)}`}><Search size={13} />Hunt events</a><a className="adp-drawer-action adp-drawer-action--primary" href={`/response/playbooks/new?template=directory-hardening&target=${encodeURIComponent(row.id)}`}><Workflow size={13} />Preview response</a></>}>
      <div className="adp-drawer">
        <nav className="adp-drawer-tabs" aria-label="Directory context views">{tabs.map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}</nav>
        {isAssessment(row) && <>
          {tab === 'overview' && <><section className="adp-drawer-hero"><RiskBadge level={row.riskLevel} /><div><span>Score impact</span><strong>−{row.scoreImpact}</strong></div><div><span>Exposed objects</span><strong>{row.exposedEntityCount}</strong></div></section><section className="adp-intelligence"><header><Sparkles size={14} /><strong>Hive Intelligence</strong><span>Analyst review required</span></header><p>{row.summary} This exposure overlaps {row.attackTechniques.join(', ')} and should be validated against the documented directory dependency before remediation.</p></section><section className="adp-drawer-card"><header><ShieldAlert size={14} /><div><strong>Why this matters</strong><span>Continuous posture assessment</span></div></header><p>{row.summary}</p><dl className="adp-detail-grid"><div><dt>State</dt><dd>{row.state}</dd></div><div><dt>Owner</dt><dd>{row.owner ?? 'Unassigned'}</dd></div><div><dt>First detected</dt><dd>{formatTime(row.firstDetectedAt)}</dd></div><div><dt>Last evaluated</dt><dd>{formatTime(row.lastEvaluatedAt)}</dd></div></dl></section><section className="adp-drawer-card"><header><BadgeCheck size={14} /><div><strong>Recommended action</strong><span>Governed change required</span></div></header><p>{row.recommendation}</p></section></>}
          {tab === 'evidence' && <section className="adp-drawer-card"><header><FileKey2 size={14} /><div><strong>Evidence and provenance</strong><span>Bounded supporting observations</span></div></header><ul className="adp-evidence-list">{row.evidence.map((item) => <li key={item.id}><span /><div><strong>{item.label}</strong><p>{item.value}</p><small>{item.source} · {formatTime(item.observedAt)}</small></div></li>)}</ul></section>}
          {tab === 'exposure' && <section className="adp-drawer-card"><header><GitBranch size={14} /><div><strong>Affected objects and paths</strong><span>Tier‑0 and sensitive reachability</span></div></header><ul className="adp-entity-list">{row.affectedEntities.map((entity) => <li key={entity.id} data-level={entity.criticality}><span>{entity.type}</span><strong>{entity.name}</strong><small>{entity.path ?? entity.criticality.replace('_', ' ')}</small></li>)}</ul></section>}
        </>}
        {isDomain(row) && <>
          {tab === 'overview' && <><section className="adp-drawer-hero"><HealthBadge state={row.health} /><div><span>Posture</span><strong>{row.postureScore}</strong></div><div><span>Tier‑0 paths</span><strong>{row.tierZeroPathCount}</strong></div></section><section className="adp-drawer-card"><header><Network size={14} /><div><strong>Directory domain</strong><span>Forest and monitoring context</span></div></header><dl className="adp-detail-grid"><div><dt>Forest</dt><dd>{row.forestName}</dd></div><div><dt>NetBIOS</dt><dd>{row.netbiosName}</dd></div><div><dt>Functional level</dt><dd>{row.functionalLevel}</dd></div><div><dt>Last observed</dt><dd>{formatTime(row.lastObservedAt)}</dd></div></dl></section></>}
          {tab === 'controllers' && <section className="adp-drawer-card"><header><Server size={14} /><div><strong>Domain controllers</strong><span>Sensor and replication health</span></div></header><ul className="adp-controller-list">{row.domainControllers.map((dc) => <li key={dc.id}><HealthBadge state={dc.health} /><div><strong>{dc.hostname}</strong><small>{dc.site} · {dc.ipAddress}</small></div><span>{dc.replicationLagSeconds ?? '—'}s lag</span></li>)}</ul></section>}
          {tab === 'trusts' && <section className="adp-drawer-card"><header><Link2 size={14} /><div><strong>Trust relationships</strong><span>Authentication boundaries</span></div></header><ul className="adp-trust-list">{row.trusts.map((trust) => <li key={trust.id}><RiskBadge level={trust.riskLevel} /><div><strong>{trust.targetDomain}</strong><p>{trust.riskReason}</p><small>{trust.direction} · {trust.type.replace('_', ' ')}</small></div></li>)}</ul></section>}
        </>}
        {isChange(row) && <><section className="adp-drawer-hero"><RiskBadge level={row.riskLevel} /><div><span>Evidence</span><strong>{row.evidenceCount}</strong></div><div><span>Authorized</span><strong>{row.authorized == null ? '?' : row.authorized ? 'Yes' : 'No'}</strong></div></section><section className="adp-drawer-card"><header><History size={14} /><div><strong>Directory change</strong><span>Actor, action and target</span></div></header><p>{row.description}</p><dl className="adp-detail-grid"><div><dt>Actor</dt><dd>{row.actor}</dd></div><div><dt>Action</dt><dd>{row.action}</dd></div><div><dt>Target</dt><dd>{row.target}</dd></div><div><dt>Observed</dt><dd>{formatTime(row.occurredAt)}</dd></div></dl></section></>}
        {isInfrastructure(row) && <><section className="adp-drawer-hero"><HealthBadge state={row.health} /><div><span>Issues</span><strong>{row.issueCount}</strong></div><div><span>Coverage</span><strong>{row.monitoringState}</strong></div></section><section className="adp-drawer-card"><header><Server size={14} /><div><strong>Identity infrastructure</strong><span>Role, version and telemetry</span></div></header><dl className="adp-detail-grid"><div><dt>Role</dt><dd>{roleLabel(row.role)}</dd></div><div><dt>Version</dt><dd>{row.version ?? 'Unknown'}</dd></div><div><dt>Monitoring</dt><dd>{row.monitoringState}</dd></div><div><dt>Last observed</dt><dd>{formatTime(row.lastObservedAt)}</dd></div></dl></section></>}
      </div>
    </HaDrawer>
  );
}

export function ActiveDirectoryPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<AdView>('assessments');
  const [risk, setRisk] = useState<AdRiskLevel | 'all'>('all');
  const [category, setCategory] = useState<AdAssessmentCategory | 'all'>('all');
  const [domain, setDomain] = useState('');
  const [timeRange, setTimeRange] = useState<AdTimeRange>('24h');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounce(searchDraft.trim(), 300);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [density, setDensity] = useState<Density>('standard');
  const [selected, setSelected] = useState<AdRow | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const eps = useEpsStream();

  const filters = useMemo<AdPostureFilters>(() => ({ view, query: search || undefined, domain: domain || undefined, risk, category, timeRange, cursor: cursors[page], limit: PAGE_SIZE }), [category, cursors, domain, page, risk, search, timeRange, view]);
  const query = useQuery({ queryKey: ['active-directory-posture', filters], queryFn: ({ signal }) => fetchAdPosture(filters, signal), staleTime: 20_000, gcTime: 5 * 60_000, retry: 1 });
  const rows = useMemo(() => (query.data?.items ?? []).filter((row) => matchesView(row, view)), [query.data?.items, view]);

  useEffect(() => { setPage(0); setCursors([null]); setActiveIndex(0); setSelected(null); }, [category, domain, risk, search, timeRange, view]);
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
  useEffect(() => { if (rows.length) { gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle'); gridRef.current?.api?.setFocusedCell(activeIndex, view === 'assessments' ? 'title' : view === 'domains' ? 'domainName' : view === 'changes' ? 'action' : 'name'); } }, [activeIndex, rows.length, view]);

  const columns = useMemo<ColDef[]>(() => {
    if (view === 'domains') return [
      { field: 'domainName', colId: 'domainName', headerName: 'Domain', pinned: 'left', minWidth: 220, flex: 1, cellRenderer: ({ data }: ICellRendererParams<AdDomainSummaryDTO>) => data ? <span className="adp-primary"><span className="adp-row-icon"><Network size={15} /></span><span><strong>{data.domainName}</strong><small>{data.forestName} · {data.functionalLevel}</small></span></span> : null },
      { field: 'health', headerName: 'Health', width: 112, cellRenderer: ({ data }: ICellRendererParams<AdDomainSummaryDTO>) => data ? <HealthBadge state={data.health} /> : null },
      { field: 'postureScore', headerName: 'Posture', width: 92 }, { field: 'domainControllerCount', headerName: 'DCs', width: 72 }, { field: 'monitoredControllerCount', headerName: 'Monitored', width: 94 }, { field: 'replicationLagSeconds', headerName: 'Replication lag', width: 126, valueFormatter: ({ value }: { value?: number }) => value == null ? 'Unknown' : `${value}s` }, { field: 'trustCount', headerName: 'Trusts', width: 78 }, { field: 'tierZeroPathCount', headerName: 'Tier-0 paths', width: 104 }, { field: 'lastObservedAt', headerName: 'Last observed', width: 118, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
    if (view === 'changes') return [
      { field: 'action', colId: 'action', headerName: 'Directory change', pinned: 'left', minWidth: 260, flex: 1, cellRenderer: ({ data }: ICellRendererParams<AdTrackerEventDTO>) => data ? <span className="adp-primary"><span className="adp-row-icon"><History size={15} /></span><span><strong>{data.action}</strong><small>{data.target} · {data.targetType}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 104, cellRenderer: ({ data }: ICellRendererParams<AdTrackerEventDTO>) => data ? <RiskBadge level={data.riskLevel} /> : null }, { field: 'actor', headerName: 'Actor', width: 146 }, { field: 'domainName', headerName: 'Domain', width: 172 }, { field: 'authorized', headerName: 'Authorized', width: 104, valueFormatter: ({ value }: { value?: boolean | null }) => value == null ? 'Unknown' : value ? 'Yes' : 'No' }, { field: 'evidenceCount', headerName: 'Evidence', width: 88 }, { field: 'occurredAt', headerName: 'Observed', width: 112, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
    if (view === 'infrastructure') return [
      { field: 'name', colId: 'name', headerName: 'Identity system', pinned: 'left', minWidth: 230, flex: 1, cellRenderer: ({ data }: ICellRendererParams<AdInfrastructureDTO>) => data ? <span className="adp-primary"><span className="adp-row-icon">{data.role === 'ad_cs' ? <FileKey2 size={15} /> : <Server size={15} />}</span><span><strong>{data.name}</strong><small>{roleLabel(data.role)} · {data.version ?? 'version unknown'}</small></span></span> : null },
      { field: 'health', headerName: 'Health', width: 112, cellRenderer: ({ data }: ICellRendererParams<AdInfrastructureDTO>) => data ? <HealthBadge state={data.health} /> : null }, { field: 'monitoringState', headerName: 'Monitoring', width: 116 }, { field: 'domainName', headerName: 'Domain', width: 180 }, { field: 'issueCount', headerName: 'Issues', width: 82 }, { field: 'lastObservedAt', headerName: 'Last observed', width: 118, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
    return [
      { field: 'title', colId: 'title', headerName: 'Security assessment', pinned: 'left', minWidth: 310, flex: 1, cellRenderer: ({ data }: ICellRendererParams<AdAssessmentDTO>) => data ? <span className="adp-primary"><span className="adp-row-icon"><ShieldAlert size={15} /></span><span><strong>{data.title}</strong><small>{categoryLabel(data.category)} · {data.attackTechniques.join(', ')}</small></span></span> : null },
      { field: 'riskLevel', headerName: 'Risk', width: 104, cellRenderer: ({ data }: ICellRendererParams<AdAssessmentDTO>) => data ? <RiskBadge level={data.riskLevel} /> : null }, { field: 'domainName', headerName: 'Domain', width: 176 }, { field: 'exposedEntityCount', headerName: 'Exposed', width: 86 }, { field: 'scoreImpact', headerName: 'Score impact', width: 104, valueFormatter: ({ value }: { value: number }) => `−${value}` }, { field: 'owner', headerName: 'Owner', width: 142, valueFormatter: ({ value }: { value?: string }) => value ?? 'Unassigned' }, { field: 'state', headerName: 'State', width: 94 }, { field: 'lastEvaluatedAt', headerName: 'Evaluated', width: 108, valueFormatter: ({ value }: { value?: string }) => relativeTime(value) },
    ];
  }, [view]);

  const reset = (): void => { setRisk('all'); setCategory('all'); setDomain(''); setTimeRange('24h'); setSearchDraft(''); };
  const hasFilters = risk !== 'all' || category !== 'all' || Boolean(domain) || Boolean(search) || timeRange !== '24h';
  const summary = query.data?.summary;
  const missingContract = query.data?.contractState === 'missing';
  const domainOptions = [{ value: '', label: 'All domains' }, ...(query.data?.domains ?? [])];

  return (
    <section className="adp-page" data-fixture={activeDirectoryFixtureMode || undefined} aria-label="Active Directory security posture">
      <header className="adp-header"><div className="adp-header__identity"><span className="adp-header__mark"><Network size={19} /></span><div><span>Identity threat exposure</span><h1>Active Directory Security</h1></div></div><div className="adp-header__actions"><span className="adp-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/identities"><Fingerprint size={13} />Identities</a><a href="/posture/exposure"><Eye size={13} />Exposure</a><a href="/posture/assets"><Building2 size={13} />Assets</a><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh directory posture"><RefreshCw size={14} className={query.isFetching ? 'adp-spin' : undefined} /></button></div></header>
      {activeDirectoryFixtureMode && <div className="adp-fixture"><strong>Design fixture:</strong> fictional domain, trust, posture and change records are enabled for visual review.<span>Production never receives these records.</span></div>}

      <section className="adp-summary" aria-label="Directory posture summary">
        <div><span><ShieldCheck size={13} />Posture score</span><strong>{summary?.postureScore ?? '—'}{summary?.postureScore != null && <small>/100</small>}</strong><em>continuous directory posture</em></div>
        <button type="button" data-tone="critical" onClick={() => { setView('assessments'); setRisk('critical'); }}><span><ShieldAlert size={13} />Critical assessments</span><strong>{summary?.criticalAssessments ?? '—'}</strong><em>exploitable configurations</em></button>
        <button type="button" data-tone="danger" onClick={() => setView('domains')}><span><GitBranch size={13} />Tier‑0 attack paths</span><strong>{summary?.tierZeroPaths ?? '—'}</strong><em>domain compromise routes</em></button>
        <button type="button" data-tone="warning" onClick={() => setView('changes')}><span><History size={13} />Risky changes · 24h</span><strong>{summary?.riskyChanges24h ?? '—'}</strong><em>privileged directory events</em></button>
        <button type="button" data-tone="warning" onClick={() => setView('infrastructure')}><span><Activity size={13} />Sensor gaps</span><strong>{summary?.unhealthySensors ?? '—'}</strong><em>partial or missing coverage</em></button>
        <button type="button" data-tone="info" onClick={() => setView('domains')}><span><GitBranch size={13} />Replication issues</span><strong>{summary?.replicationIssues ?? '—'}</strong><em>lagging or failed partners</em></button>
      </section>

      <section className="adp-operations"><nav className="adp-tabs" aria-label="Directory security views">{VIEWS.map(({ value, label, icon: Icon }) => <button key={value} type="button" data-active={view === value} onClick={() => setView(value)}><Icon size={13} />{label}</button>)}</nav><div className="adp-toolbar" role="toolbar" aria-label="Directory posture filters">
        <label className="adp-search"><Search size={14} /><input ref={searchRef} type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search assessment, domain, actor, target…" aria-label="Search directory posture" /><kbd>/</kbd></label>
        <HaCompactSelect ariaLabel="Filter by domain" label="Domain" value={domain} options={domainOptions} onChange={setDomain} />
        <HaCompactSelect ariaLabel="Filter by risk" label="Risk" value={risk} options={RISKS} onChange={setRisk} />
        {view === 'assessments' && <HaCompactSelect ariaLabel="Filter by assessment category" label="Category" value={category} options={CATEGORIES} onChange={setCategory} />}
        {view === 'changes' && <HaCompactSelect ariaLabel="Filter by time range" label="Window" value={timeRange} options={WINDOWS} onChange={setTimeRange} />}
        <span className="adp-scope"><LockKeyhole size={12} />All authorized domains</span><span className="adp-snapshot">Snapshot {query.data?.snapshotAt ? formatTime(query.data.snapshotAt) : '—'}</span>
      </div></section>

      {Boolean(query.data?.partialFailures.length) && <div className="adp-warning" role="status"><AlertTriangle size={14} /><span>{query.data?.partialFailures[0]?.message}</span><a href="#ad-contract-state">Review backend contract</a></div>}
      <div className="adp-results"><div><strong>{VIEWS.find((item) => item.value === view)?.label}</strong><span>{missingContract ? 'Backend contract unavailable — not an empty risk assessment' : query.data ? `${rows.length} loaded · ${query.data.total.toLocaleString()} matching` : 'bounded authorized projection'}</span>{hasFilters && !missingContract && <button type="button" onClick={reset}>Clear filters</button>}</div><div className="adp-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button></div></div>

      {query.isError && !query.data ? <div className="adp-state" role="alert"><AlertTriangle size={28} /><strong>Directory posture unavailable</strong><span>{query.error instanceof Error ? query.error.message : 'The authorized directory projection could not be loaded.'}</span><button type="button" onClick={() => query.refetch()}>Retry</button></div> : missingContract ? <div className="adp-state" role="status"><Network size={30} /><strong>Active Directory backend integration required</strong><span>Directory posture APIs are not available in this deployment. HiveArmor will not invent domain health, Tier‑0 paths, or privileged changes from incomplete data — empty KPIs here mean the contract is missing, not that the directory is safe.</span><a href="#ad-contract-state">View contract state</a></div> : !query.isLoading && rows.length === 0 ? <div className="adp-state" role="status"><ShieldCheck size={28} /><strong>{hasFilters ? 'No directory records match these filters' : 'No directory observations available'}</strong><span>{hasFilters ? 'Clear filters or broaden the authorized domain scope.' : 'Connect directory sensors to establish posture and change visibility.'}</span>{hasFilters && <button type="button" onClick={reset}>Clear filters</button>}</div> : <main className="adp-grid-wrap"><SiemDataGrid key={view} ref={gridRef} className="response-grid adp-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={query.isLoading} rowSelection="single" onRowClicked={(event: RowClickedEvent) => setSelected(event.data as AdRow)} getRowId={(params) => String((params.data as AdRow).id)} defaultColDef={{ filter: false }} ariaLabel="Active Directory posture inventory" /></main>}

      <footer className="adp-pagination" aria-label="Directory posture pagination"><span>{missingContract ? 'Contract not implemented' : `${query.data?.total.toLocaleString() ?? 0} matching records`}</span><span>Page {page + 1} · up to {PAGE_SIZE} rows</span><div><button type="button" disabled={page === 0 || query.isFetching || missingContract} onClick={() => { setPage((current) => Math.max(0, current - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={missingContract || !query.data?.cursor || query.isFetching} onClick={() => { const cursor = query.data?.cursor; if (!cursor) return; setCursors((current) => { const next = current.slice(0, page + 1); next[page + 1] = cursor; return next; }); setPage((current) => current + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="adp-status" sseConnected={activeDirectoryFixtureMode || eps.connected} eps={activeDirectoryFixtureMode ? 12840 : eps.eps} mode={activeDirectoryFixtureMode ? 'historical' : 'live'} lastUpdated={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined} />
      {selected && <AdDetailDrawer row={selected} onClose={() => setSelected(null)} />}
      <span id="ad-contract-state" className="adp-sr-only">Active Directory posture contract state: {query.data?.contractState ?? 'unavailable'}</span>
    </section>
  );
}
