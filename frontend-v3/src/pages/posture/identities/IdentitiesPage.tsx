import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  Fingerprint,
  History,
  KeyRound,
  Link2,
  List,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  UserRoundCog,
  UsersRound,
  Workflow,
} from 'lucide-react';

import {
  fetchIdentityPosture,
  fetchIdentityPreview,
  identityAuthLabel,
  identityFilterAvailability,
  identityFixtureMode,
  identityKindLabel,
} from './identity.service';
import type {
  IdentityAuthStrength,
  IdentityKind,
  IdentityPostureFilters,
  IdentityPostureItem,
  IdentityPosturePreview,
  IdentityRiskLevel,
  IdentitySort,
  IdentityView,
} from './identity.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { RESPONSE_GRID_ROW_HEIGHTS } from '@/pages/response/response-grid-standard';

import './IdentitiesPage.css';
import '../../response/response-grid-standard.css';

const PAGE_SIZE = 50;
type Density = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;

const VIEW_OPTIONS: Array<{ value: IdentityView; label: string; icon: typeof UsersRound }> = [
  { value: 'all', label: 'All identities', icon: UsersRound },
  { value: 'high_risk', label: 'High risk', icon: ShieldAlert },
  { value: 'privileged', label: 'Privileged', icon: KeyRound },
  { value: 'non_human', label: 'Non-human', icon: Bot },
  { value: 'control_gaps', label: 'Control gaps', icon: ShieldQuestion },
  { value: 'stale', label: 'Stale access', icon: Clock3 },
];

const RISK_OPTIONS: Array<{ value: IdentityRiskLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All risk' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const KIND_OPTIONS: Array<{ value: IdentityKind | 'all'; label: string }> = [
  { value: 'all', label: 'All identity kinds' },
  { value: 'human', label: 'Human' },
  { value: 'service', label: 'Service account' },
  { value: 'workload', label: 'Workload identity' },
  { value: 'guest', label: 'Guest' },
  { value: 'unknown', label: 'Unknown' },
];

const AUTH_OPTIONS: Array<{ value: IdentityAuthStrength | 'all'; label: string }> = [
  { value: 'all', label: 'All authentication' },
  { value: 'phishing_resistant', label: 'Phishing-resistant' },
  { value: 'mfa', label: 'MFA' },
  { value: 'single_factor', label: 'Single factor' },
  { value: 'unknown', label: 'Unknown' },
];

const SORT_OPTIONS: Array<{ value: IdentitySort; label: string }> = [
  { value: 'risk_desc', label: 'Highest risk' },
  { value: 'activity_desc', label: 'Recent activity' },
  { value: 'alerts_desc', label: 'Most alerts' },
  { value: 'name_asc', label: 'Identity name' },
];

function formatRelativeTime(value?: string | null): string {
  if (!value) return 'Never';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function identityIcon(kind: IdentityKind, size = 15): JSX.Element {
  if (kind === 'service') return <UserRoundCog size={size} />;
  if (kind === 'workload') return <Bot size={size} />;
  if (kind === 'guest') return <CircleUserRound size={size} />;
  if (kind === 'human') return <Fingerprint size={size} />;
  return <ShieldQuestion size={size} />;
}

function RiskCell({ item }: { item: IdentityPostureItem }): JSX.Element {
  return <span className="idp-risk" data-level={item.riskLevel}><span /><strong>{item.riskScore}</strong><small>{item.riskTrend}</small></span>;
}

function AuthCell({ item }: { item: IdentityPostureItem }): JSX.Element {
  return <span className="idp-auth" data-state={item.authStrength}><ShieldCheck size={12} /><span>{identityAuthLabel(item.authStrength)}</span><small>{item.controlState}</small></span>;
}

function IdentityDrawer({ item, onClose }: { item: IdentityPostureItem; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<'overview' | 'signals' | 'access' | 'activity'>('overview');
  const query = useQuery({
    queryKey: ['identity-posture-preview', item.id],
    queryFn: ({ signal }) => fetchIdentityPreview(item, signal),
    staleTime: 30_000,
    retry: 1,
  });
  const preview: IdentityPosturePreview | undefined = query.data;
  const dossier = item.pivots.find((pivot) => pivot.type === 'dossier')?.route ?? `/entities/${encodeURIComponent(item.id)}`;
  const hunt = item.pivots.find((pivot) => pivot.type === 'hunt')?.route ?? `/search?query=${encodeURIComponent(`user.name:"${item.value}"`)}`;
  const unavailable = preview?.dataCompleteness === 'partial';

  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={item.displayName}
      subtitle={`${identityKindLabel(item.kind)} identity · ${item.tenantName ?? 'authorized scope'}`}
      width={560}
      footer={<><a className="idp-drawer-action" href={dossier}><ExternalLink size={13} />Open dossier</a><a className="idp-drawer-action idp-drawer-action--primary" href={hunt}><Search size={13} />Hunt activity</a></>}
    >
      <div className="idp-drawer">
        <section className="idp-drawer__hero">
          <span className="idp-drawer__identity-icon">{identityIcon(item.kind, 22)}</span>
          <div><RiskCell item={item} /><span className="idp-privilege" data-level={item.privilege}><KeyRound size={11} />{item.privilege.replace('_', ' ')}</span></div>
          <dl><div><dt>Alerts</dt><dd>{item.alertCount}</dd></div><div><dt>Last seen</dt><dd>{formatRelativeTime(item.lastSeen)}</dd></div></dl>
        </section>

        <nav className="idp-drawer-tabs" aria-label="Identity context views">
          {(['overview', 'signals', 'access', 'activity'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}
        </nav>

        {query.isLoading && <div className="idp-drawer-state" role="status"><span className="idp-loader" /><strong>Loading identity context</strong><small>Fetching a bounded risk and control projection.</small></div>}
        {query.isError && <div className="idp-drawer-state" role="alert"><AlertTriangle size={22} /><strong>Identity context unavailable</strong><small>The queue remains usable. Retry the progressive detail request when the source recovers.</small><button type="button" onClick={() => query.refetch()}>Retry context</button></div>}

        {preview && tab === 'overview' && <>
          {unavailable && <div className="idp-drawer-notice"><AlertTriangle size={14} /><span>Authentication, privilege and credential posture are not exposed by the current production contract. Unknown is preserved as unknown.</span></div>}
          <section className="idp-intelligence"><header><Sparkles size={14} /><strong>Hive Intelligence</strong><span>Analyst review required</span></header><p>{preview.intelligenceSummary ?? 'An AI risk narrative is unavailable until governed identity signals and provenance are exposed by the backend.'}</p><a href={`/intelligence?entity=${encodeURIComponent(item.id)}`}><BrainCircuit size={12} />Investigate with Hive Intelligence</a></section>
          <section className="idp-drawer-card"><header><Fingerprint size={14} /><div><strong>Identity and ownership</strong><span>Directory and business context</span></div></header><dl className="idp-detail-grid">
            <div><dt>Principal</dt><dd>{preview.value}</dd></div><div><dt>Account state</dt><dd>{preview.accountState}</dd></div>
            <div><dt>Department</dt><dd>{preview.department ?? 'Unknown'}</dd></div><div><dt>Role / title</dt><dd>{preview.jobTitle ?? 'Unknown'}</dd></div>
            <div><dt>Manager / owner</dt><dd>{preview.manager ?? 'Unknown'}</dd></div><div><dt>First observed</dt><dd>{formatDateTime(preview.firstSeen)}</dd></div>
          </dl><div className="idp-copy-row"><span>Identity value</span><code>{preview.value}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(preview.value)} aria-label="Copy identity value"><Copy size={12} /></button></div></section>
          <section className="idp-control-grid" aria-label="Authentication controls">
            <div data-state={preview.mfaRegistered == null ? 'unknown' : preview.mfaRegistered ? 'healthy' : 'danger'}><ShieldCheck size={14} /><span>MFA registered</span><strong>{preview.mfaRegistered == null ? 'Unknown' : preview.mfaRegistered ? 'Yes' : 'No'}</strong></div>
            <div data-state={preview.passwordlessCapable == null ? 'unknown' : preview.passwordlessCapable ? 'healthy' : 'warning'}><KeyRound size={14} /><span>Passwordless</span><strong>{preview.passwordlessCapable == null ? 'Unknown' : preview.passwordlessCapable ? 'Capable' : 'No'}</strong></div>
            <div data-state={preview.conditionalAccess === 'enforced' ? 'healthy' : preview.conditionalAccess === 'missing' ? 'danger' : 'warning'}><LockKeyhole size={14} /><span>Access policy</span><strong>{preview.conditionalAccess}</strong></div>
            <div data-state={preview.credentialExposure === 'none' ? 'healthy' : preview.credentialExposure === 'unknown' ? 'unknown' : 'danger'}><ShieldAlert size={14} /><span>Credentials</span><strong>{preview.credentialExposure}</strong></div>
          </section>
          <section className="idp-drawer-card"><header><Workflow size={14} /><div><strong>Recommended analyst path</strong><span>Review evidence before disruptive response</span></div></header>{preview.recommendedActions.length ? <ol className="idp-actions-list">{preview.recommendedActions.map((action) => <li key={action}>{action}</li>)}</ol> : <p className="idp-empty-copy">Recommendations require an authoritative identity posture projection.</p>}{preview.permissions.requestRemediation && <a className="idp-remediation" href={`/response/playbooks/new?identity=${encodeURIComponent(item.id)}&template=identity-containment`}><Workflow size={12} />Preview governed remediation</a>}</section>
        </>}

        {preview && tab === 'signals' && <section className="idp-drawer-card"><header><ShieldAlert size={14} /><div><strong>Risk signals</strong><span>Why this identity is prioritized</span></div></header>{preview.riskSignals.length ? <ul className="idp-signal-list">{preview.riskSignals.map((signal) => <li key={signal.id} data-level={signal.severity}><span /><div><strong>{signal.label}</strong><p>{signal.description}</p><small>{signal.source} · {signal.evidenceCount} evidence · +{signal.contribution} risk</small></div></li>)}</ul> : <p className="idp-empty-copy">Risk score drivers and provenance are unavailable from the current identity contract.</p>}<div className="idp-calculated"><History size={12} />Calculated {formatDateTime(preview.riskCalculatedAt)}</div></section>}

        {preview && tab === 'access' && <><section className="idp-access-summary"><div><span>Privilege tier</span><strong>{preview.privilege.replace('_', ' ')}</strong></div><div><span>Active sessions</span><strong>{preview.activeSessions ?? '—'}</strong></div><div><span>Risky sign-ins · 30d</span><strong>{preview.riskySignIns30d ?? '—'}</strong></div></section><section className="idp-drawer-card"><header><Link2 size={14} /><div><strong>Effective access and blast radius</strong><span>Direct and inherited reachability</span></div></header>{preview.accessPaths.length ? <ul className="idp-access-list">{preview.accessPaths.map((path) => <li key={path.id} data-level={path.criticality}><span>{path.type}</span><strong>{path.label}</strong><small>{path.inherited ? 'Inherited' : 'Direct'}</small></li>)}</ul> : <p className="idp-empty-copy">Effective roles, nested groups and lateral movement paths are unavailable.</p>}</section></>}

        {preview && tab === 'activity' && <section className="idp-drawer-card"><header><Activity size={14} /><div><strong>Identity activity</strong><span>Recent risk and control events</span></div></header>{preview.activity.length ? <ol className="idp-activity-list">{preview.activity.map((event) => <li key={event.id} data-state={event.state}><span /><div><strong>{event.title}</strong><p>{event.detail}</p><small>{formatDateTime(event.occurredAt)} · {event.source}</small></div></li>)}</ol> : <p className="idp-empty-copy">A bounded identity-specific risk timeline is not available.</p>}</section>}
      </div>
    </HaDrawer>
  );
}

export function IdentitiesPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<IdentityView>('all');
  const [risk, setRisk] = useState<IdentityRiskLevel | 'all'>('all');
  const [kind, setKind] = useState<IdentityKind | 'all'>('all');
  const [auth, setAuth] = useState<IdentityAuthStrength | 'all'>('all');
  const [sort, setSort] = useState<IdentitySort>('risk_desc');
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebounce(searchDraft.trim(), 300);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [density, setDensity] = useState<Density>('standard');
  const [selected, setSelected] = useState<IdentityPostureItem | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const eps = useEpsStream();

  const filters = useMemo<IdentityPostureFilters>(() => ({ view, risk, kind, auth, sort, query: search || undefined, cursor: cursors[page], limit: PAGE_SIZE }), [auth, cursors, kind, page, risk, search, sort, view]);
  const query = useQuery({
    queryKey: ['identity-posture', filters],
    queryFn: ({ signal }) => fetchIdentityPosture(filters, signal),
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });
  const rows = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  useEffect(() => {
    setPage(0);
    setCursors([null]);
    setActiveIndex(0);
    setSelected(null);
  }, [auth, kind, risk, search, sort, view]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus(); return; }
      if (!rows.length) return;
      if (event.key.toLowerCase() === 'j') { event.preventDefault(); setActiveIndex((current) => Math.min(rows.length - 1, current + 1)); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
      if (event.key === 'Enter') { event.preventDefault(); setSelected(rows[activeIndex] ?? rows[0]); }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [activeIndex, rows]);

  useEffect(() => {
    if (!rows.length) return;
    gridRef.current?.api?.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api?.setFocusedCell(activeIndex, 'displayName');
  }, [activeIndex, rows.length]);

  const selectView = useCallback((value: IdentityView) => {
    if (!identityFixtureMode && ['privileged', 'non_human', 'control_gaps', 'stale'].includes(value)) return;
    setView(value);
  }, []);

  const columns = useMemo<ColDef[]>(() => [
    { field: 'displayName', colId: 'displayName', headerName: 'Identity', pinned: 'left', minWidth: 220, flex: 1, cellRenderer: ({ data: item }: ICellRendererParams<IdentityPostureItem>) => item ? <span className="idp-primary-cell"><span className="idp-identity-icon">{identityIcon(item.kind)}</span><span><strong>{item.displayName}</strong><small>{item.value} · {identityKindLabel(item.kind)}</small></span></span> : null },
    { field: 'riskScore', headerName: 'Risk', width: 116, sort: 'desc', cellRenderer: ({ data: item }: ICellRendererParams<IdentityPostureItem>) => item ? <RiskCell item={item} /> : null },
    { field: 'privilege', headerName: 'Privilege', width: 132, cellRenderer: ({ data: item }: ICellRendererParams<IdentityPostureItem>) => item ? <span className="idp-privilege" data-level={item.privilege}><KeyRound size={11} />{item.privilege.replace('_', ' ')}</span> : null },
    { field: 'authStrength', headerName: 'Authentication', width: 154, cellRenderer: ({ data: item }: ICellRendererParams<IdentityPostureItem>) => item ? <AuthCell item={item} /> : null },
    { field: 'department', headerName: 'Department / owner', width: 154, valueFormatter: ({ value }: { value?: string }) => value ?? 'Unknown' },
    { field: 'alertCount', headerName: 'Alerts', width: 76, type: 'numericColumn' },
    { field: 'tenantName', headerName: 'Tenant', width: 148, valueFormatter: ({ value }: { value?: string }) => value ?? 'Authorized scope' },
    { field: 'lastSeen', headerName: 'Last observed', width: 112, cellRenderer: ({ data: item }: ICellRendererParams<IdentityPostureItem>) => item ? <span className="idp-last-seen" title={formatDateTime(item.lastSeen)}>{formatRelativeTime(item.lastSeen)}<small>{item.observationSources[0] ?? 'Unknown source'}</small></span> : null },
    { headerName: '', width: 34, sortable: false, resizable: false, suppressHeaderMenuButton: true, cellRenderer: () => <ChevronRight size={14} className="idp-chevron" /> },
  ], []);

  const summary = query.data?.summary;
  const hasFilters = view !== 'all' || risk !== 'all' || kind !== 'all' || auth !== 'all' || Boolean(search);
  const resetFilters = useCallback(() => { setView('all'); setRisk('all'); setKind('all'); setAuth('all'); setSort('risk_desc'); setSearchDraft(''); }, []);
  const errorMessage = query.error instanceof Error ? query.error.message : 'The authorized identity projection could not be loaded.';
  const forbidden = /403|forbidden|permission/i.test(errorMessage);

  return (
    <section className="idp-page" data-fixture={identityFixtureMode || undefined} aria-label="Identity security posture">
      <header className="idp-header"><div className="idp-header__identity"><span className="idp-header__mark"><Fingerprint size={19} /></span><div><span>Posture &amp; exposure</span><h1>Identity Security</h1></div></div><div className="idp-header__actions"><span className="idp-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span><a href="/posture/assets"><Eye size={13} />Assets</a><a href="/posture/exposure"><ShieldAlert size={13} />Exposure</a><a href="/entities"><UsersRound size={13} />Entities</a><button type="button" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh identity posture"><RefreshCw size={14} className={query.isFetching ? 'idp-spin' : undefined} /></button></div></header>
      {identityFixtureMode && <div className="idp-fixture"><strong>Design fixture:</strong> fictional identity-risk and access records are enabled for visual review.<span>Production never receives these records.</span></div>}

      <section className="idp-summary" aria-label="Identity posture summary">
        <button type="button" onClick={() => selectView('all')} data-active={view === 'all'}><span><UsersRound size={13} />Known identities</span><strong>{summary?.total.toLocaleString() ?? '—'}</strong><small>authorized identity fabric</small></button>
        <button type="button" onClick={() => selectView('high_risk')} data-tone="critical" data-active={view === 'high_risk'}><span><ShieldAlert size={13} />High risk</span><strong>{summary?.highRisk.toLocaleString() ?? '—'}</strong><small>critical or high confidence</small></button>
        <button type="button" disabled={!identityFilterAvailability.posture} onClick={() => selectView('privileged')} data-tone="warning" data-active={view === 'privileged'}><span><KeyRound size={13} />Privileged</span><strong>{summary?.privileged ?? '—'}</strong><small>{summary?.privileged == null ? 'projection unavailable' : 'tier 0 or elevated access'}</small></button>
        <button type="button" disabled={!identityFilterAvailability.kind} onClick={() => selectView('non_human')} data-tone="info" data-active={view === 'non_human'}><span><Bot size={13} />Non-human</span><strong>{summary?.nonHuman ?? '—'}</strong><small>{summary?.nonHuman == null ? 'projection unavailable' : 'service and workload identities'}</small></button>
        <button type="button" disabled={!identityFilterAvailability.auth} onClick={() => selectView('control_gaps')} data-tone="danger" data-active={view === 'control_gaps'}><span><ShieldQuestion size={13} />Control gaps</span><strong>{summary?.controlGaps ?? '—'}</strong><small>{summary?.controlGaps == null ? 'projection unavailable' : 'authentication or policy exposure'}</small></button>
        <button type="button" disabled={!identityFilterAvailability.posture} onClick={() => selectView('stale')} data-tone="warning" data-active={view === 'stale'}><span><Clock3 size={13} />Stale access</span><strong>{summary?.stale ?? '—'}</strong><small>{summary?.stale == null ? 'projection unavailable' : 'not observed in 30 days'}</small></button>
      </section>

      <section className="idp-operations">
        <nav className="idp-tabs" aria-label="Identity posture views">{VIEW_OPTIONS.map(({ value, label, icon: Icon }) => { const disabled = !identityFixtureMode && ['privileged', 'non_human', 'control_gaps', 'stale'].includes(value); return <button key={value} type="button" disabled={disabled} title={disabled ? 'Requires the identity posture backend contract' : undefined} data-active={view === value} onClick={() => selectView(value)}><Icon size={13} />{label}</button>; })}</nav>
        <div className="idp-toolbar" role="toolbar" aria-label="Identity posture filters">
          <label className="idp-search"><Search size={14} /><input ref={searchRef} type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchDraft(''); }} placeholder="Search identity, owner, tenant, tag…" aria-label="Search identities" /><kbd>/</kbd></label>
          <HaCompactSelect ariaLabel="Filter by risk" label="Risk" value={risk} options={RISK_OPTIONS} onChange={setRisk} />
          <HaCompactSelect ariaLabel="Filter by identity kind" label="Kind" value={kind} options={KIND_OPTIONS} disabled={!identityFilterAvailability.kind} onChange={setKind} />
          <HaCompactSelect ariaLabel="Filter by authentication strength" label="Auth" value={auth} options={AUTH_OPTIONS} disabled={!identityFilterAvailability.auth} onChange={setAuth} />
          <HaCompactSelect ariaLabel="Sort identity posture" label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
          <span className="idp-scope"><LockKeyhole size={12} />All authorized tenants</span>
          <span className="idp-snapshot">Snapshot {query.data?.snapshotAt ? formatDateTime(query.data.snapshotAt) : query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        </div>
      </section>

      {Boolean(query.data?.partialFailures.length) && <div className="idp-warning" role="status"><AlertTriangle size={14} /><span>{query.data?.partialFailures[0]?.message}</span><a href="#identity-contract-state">Review unavailable controls</a></div>}

      <div className="idp-results-toolbar"><div><strong>{VIEW_OPTIONS.find((option) => option.value === view)?.label}</strong><span>{query.data ? `${rows.length} loaded · ${query.data.total.toLocaleString()} matching` : 'bounded authorized projection'}</span>{hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}</div><div className="idp-density" role="group" aria-label="Row density"><span>Rows</span><button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button><button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button><button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={18} /></button></div></div>

      {query.isError && !query.data ? <div className="idp-inline-state" role="alert"><AlertTriangle size={26} /><strong>{forbidden ? 'Identity posture access denied' : 'Identity posture unavailable'}</strong><span>{forbidden ? 'Your current role or tenant scope does not permit this identity inventory.' : errorMessage}</span>{!forbidden && <button type="button" onClick={() => query.refetch()}>Retry identity posture</button>}</div> : !query.isLoading && rows.length === 0 ? <div className="idp-inline-state" role="status"><ShieldCheck size={26} /><strong>{hasFilters ? 'No identities match these filters' : 'No identities observed'}</strong><span>{hasFilters ? 'Clear filters or broaden the authorized scope.' : 'Connect an identity provider or ingest authentication telemetry to build the identity inventory.'}</span>{hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}</div> : <main className="idp-grid-wrap"><SiemDataGrid ref={gridRef} className="response-grid idp-grid" columnDefs={columns} rowData={rows} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} loading={query.isLoading} rowSelection="single" suppressRowClickSelection={false} onRowClicked={(event: RowClickedEvent) => setSelected(event.data as IdentityPostureItem)} getRowId={(params) => String((params.data as IdentityPostureItem).id)} defaultColDef={{ filter: false }} ariaLabel="Identity security posture inventory" /></main>}

      <footer className="idp-pagination" aria-label="Identity posture pagination"><span>{query.data?.total.toLocaleString() ?? 0} matching identities</span><span>Page {page + 1} · up to {PAGE_SIZE} rows</span><div><button type="button" disabled={page === 0 || query.isFetching} onClick={() => { setPage((current) => Math.max(0, current - 1)); setActiveIndex(0); }}><ChevronLeft size={13} />Previous</button><button type="button" disabled={!query.data?.cursor || query.isFetching} onClick={() => { const cursor = query.data?.cursor; if (!cursor) return; setCursors((current) => { const next = current.slice(0, page + 1); next[page + 1] = cursor; return next; }); setPage((current) => current + 1); setActiveIndex(0); }}>Next<ChevronRight size={13} /></button></div></footer>
      <StatusDock className="idp-status" sseConnected={identityFixtureMode || eps.connected} eps={identityFixtureMode ? 12840 : eps.eps} mode={identityFixtureMode ? 'historical' : 'live'} lastUpdated={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : undefined} />
      {selected && <IdentityDrawer item={selected} onClose={() => setSelected(null)} />}
      <span id="identity-contract-state" className="idp-sr-only">Identity posture contract state: {query.data?.contractState ?? 'unavailable'}</span>
    </section>
  );
}
