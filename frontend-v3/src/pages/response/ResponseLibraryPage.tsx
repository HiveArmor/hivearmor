/** Governed response action and connector catalog. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Database,
  FileCode2,
  Filter,
  Gavel,
  History,
  Laptop,
  ListFilter,
  LockKeyhole,
  Network,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { fetchResponseActionLibrary } from '@/services/responseActionService';
import { useAuthStore } from '@/store/auth.store';
import type { ResponseAction, ResponseActionRisk, ResponseIntegrationStatus } from '@/types/responseAction';

import './ResponseLibraryPage.css';

const PAGE_SIZE = 25;
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';
type RiskFilter = ResponseActionRisk | 'all';
type StatusFilter = ResponseIntegrationStatus | 'all';
type DetailTab = 'overview' | 'inputs' | 'outputs' | 'governance';

const RISK_OPTIONS = [
  { value: 'all', label: 'All risk levels' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'unknown', label: 'Not reported' },
] satisfies Array<{ value: RiskFilter; label: string }>;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All readiness states' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'unknown', label: 'Not reported' },
] satisfies Array<{ value: StatusFilter; label: string }>;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  containment: ShieldCheck,
  eradication: ShieldAlert,
  investigation: Search,
  enrichment: Sparkles,
  edr: Laptop,
  network: Network,
  identity: UserRound,
  notification: Activity,
  integration: PlugZap,
  ticketing: Workflow,
  'case management': BookOpen,
};

function titleCase(value?: string | null): string {
  if (!value) return 'Not reported';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category.toLowerCase()] ?? Box;
}

function integrationLabel(action: ResponseAction): string {
  return action.integrationName || `${titleCase(action.targetType)} connector`;
}

function StatusBadge({ status = 'unknown' }: { status?: ResponseIntegrationStatus }): JSX.Element {
  const Icon = status === 'healthy' ? CheckCircle2 : status === 'degraded' ? AlertTriangle : status === 'unavailable' ? CircleSlash2 : Clock3;
  return <span className="ral-status" data-status={status}><Icon size={12} />{status === 'unknown' ? 'Not reported' : titleCase(status)}</span>;
}

function RiskBadge({ risk = 'unknown' }: { risk?: ResponseActionRisk }): JSX.Element {
  return <span className="ral-risk" data-risk={risk}><ShieldAlert size={12} />{risk === 'unknown' ? 'Not reported' : titleCase(risk)}</span>;
}

function MetaValue({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <div className="ral-meta"><span>{label}</span><strong>{children}</strong></div>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string | number; detail: string; tone?: string }): JSX.Element {
  return <div className="ral-metric" data-tone={tone}><span><Icon size={13} />{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function ActionDrawer({ action, onClose }: { action: ResponseAction | null; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<DetailTab>('overview');
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'inputs', label: `Inputs ${action?.params.length ?? 0}` },
    { id: 'outputs', label: `Outputs ${action?.outputs?.length ?? 0}` },
    { id: 'governance', label: 'Governance' },
  ];

  useEffect(() => setTab('overview'), [action?.id]);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((item) => item.id === tab);
    const next = event.key === 'ArrowRight' ? current + 1 : event.key === 'ArrowLeft' ? current - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : current;
    if (next !== current) {
      event.preventDefault();
      setTab(tabs[(next + tabs.length) % tabs.length].id);
    }
  };

  return (
    <HaDrawer
      isOpen={Boolean(action)}
      onClose={onClose}
      title={action?.name ?? 'Action details'}
      subtitle={action ? `${action.id} · ${titleCase(action.category)}` : undefined}
      width={520}
      footer={action ? <>
        <Link className="ral-drawer-primary" to={`/response/playbooks/new?action=${encodeURIComponent(action.id)}`}><Workflow size={14} />Add to playbook</Link>
        <button type="button" className="ral-drawer-secondary" onClick={onClose}>Close</button>
      </> : undefined}
    >
      {action && <>
        <div className="ral-drawer-tabs" role="tablist" aria-label="Action details" onKeyDown={onTabKeyDown}>
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>

        {tab === 'overview' && <div className="ral-drawer-section" role="tabpanel">
          <div className="ral-action-identity">
            <div className="ral-action-icon">{(() => { const Icon = categoryIcon(action.category); return <Icon size={22} />; })()}</div>
            <div><span>{integrationLabel(action)}</span><strong>{action.name}</strong><small>{action.description}</small></div>
          </div>
          <div className="ral-meta-grid">
            <MetaValue label="Target">{titleCase(action.targetType)}</MetaValue>
            <MetaValue label="Category">{titleCase(action.category)}</MetaValue>
            <MetaValue label="Readiness"><StatusBadge status={action.integrationStatus} /></MetaValue>
            <MetaValue label="Risk"><RiskBadge risk={action.riskLevel} /></MetaValue>
            <MetaValue label="Used by">{action.usageCount ? `${action.usageCount} playbooks` : 'Not reported'}</MetaValue>
            <MetaValue label="Action ID"><code>{action.id}</code></MetaValue>
          </div>
          <div className="ral-notice"><ShieldCheck size={15} /><div><strong>Preview before execution</strong><span>Catalog health is advisory. Target state, connector health, permissions, blast radius, and approval eligibility are revalidated during an authoritative preview.</span></div></div>
        </div>}

        {tab === 'inputs' && <div className="ral-drawer-section" role="tabpanel">
          <header><div><strong>Input schema</strong><span>Configure values or bind outputs in the playbook builder.</span></div><FileCode2 size={16} /></header>
          {action.params.length ? <div className="ral-schema-list">{action.params.map((parameter) => <div key={parameter.name} className="ral-schema-row">
            <div><code>{parameter.name}</code>{parameter.required && <span className="ral-required">Required</span>}</div>
            <strong>{titleCase(parameter.type)}</strong>
            <p>{parameter.description || 'Description not supplied by the current catalog.'}</p>
            <small>Default: <code>{parameter.defaultValue === null ? 'none' : String(parameter.defaultValue)}</code></small>
          </div>)}</div> : <EmptyState icon={<Database size={32} />} title="No input parameters" description="This action does not require configured inputs." />}
        </div>}

        {tab === 'outputs' && <div className="ral-drawer-section" role="tabpanel">
          <header><div><strong>Typed outputs</strong><span>Outputs become variables for downstream playbook blocks.</span></div><TerminalSquare size={16} /></header>
          {action.outputs?.length ? <div className="ral-schema-list">{action.outputs.map((output) => <div key={output.name} className="ral-schema-row"><div><code>{output.name}</code></div><strong>{titleCase(output.type)}</strong><p>{output.description || 'No output description.'}</p></div>)}</div> : <div className="ral-unreported"><Database size={24} /><strong>Output schema not reported</strong><span>The current backend catalog does not yet return typed outputs. The builder must treat unreported outputs as unavailable rather than infer them.</span></div>}
        </div>}

        {tab === 'governance' && <div className="ral-drawer-section" role="tabpanel">
          <header><div><strong>Execution governance</strong><span>Controls are evaluated again for every target and tenant.</span></div><Gavel size={16} /></header>
          <div className="ral-governance-list">
            <div><LockKeyhole size={15} /><span>Required role</span><strong>{action.requiredRole || 'Not reported'}</strong></div>
            <div><Gavel size={15} /><span>Approval</span><strong>{action.requiresApproval === null || action.requiresApproval === undefined ? 'Determined in preview' : action.requiresApproval ? 'Required' : 'Not required'}</strong></div>
            <div><RotateCcw size={15} /><span>Rollback</span><strong>{action.rollbackSupported === null || action.rollbackSupported === undefined ? 'Determined in preview' : action.rollbackSupported ? 'Supported' : 'Not supported'}</strong></div>
            <div><ShieldAlert size={15} /><span>Blast radius</span><strong>Target-specific preview</strong></div>
          </div>
          <div className="ral-notice ral-notice--warning"><AlertTriangle size={15} /><div><strong>Never execute from the catalog</strong><span>Add the primitive to a versioned playbook, validate the graph, preview the exact target, and satisfy any authority policy before execution.</span></div></div>
        </div>}
      </>}
    </HaDrawer>
  );
}

export function ResponseLibraryPage(): JSX.Element {
  const { hasAnyRole } = useAuthStore();
  const hasAccess = hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']);
  const navigate = useNavigate();
  const epsStream = useEpsStream();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState<ResponseAction | null>(null);

  const catalogQuery = useQuery<ResponseAction[], Error>({
    queryKey: ['response-action-library', 'response-actions-v2'],
    queryFn: ({ signal }) => fetchResponseActionLibrary(signal),
    enabled: hasAccess,
    staleTime: 300_000,
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
  });

  const actions = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    actions.forEach((action) => counts.set(action.category, (counts.get(action.category) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [actions]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return actions.filter((action) => {
      const haystack = [action.name, action.id, action.description, action.category, action.targetType, action.integrationName, ...action.params.map((parameter) => parameter.name)].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term))
        && (category === 'all' || action.category === category)
        && (risk === 'all' || (action.riskLevel ?? 'unknown') === risk)
        && (status === 'all' || (action.integrationStatus ?? 'unknown') === status);
    });
  }, [actions, category, risk, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [category, risk, search, status]);

  const resetFilters = useCallback(() => { setSearch(''); setCategory('all'); setRisk('all'); setStatus('all'); }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault(); searchRef.current?.focus();
      }
      if (event.key === 'Escape' && selectedAction) setSelectedAction(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedAction]);

  const metrics = useMemo(() => ({
    healthy: actions.filter((action) => action.integrationStatus === 'healthy').length,
    unavailable: actions.filter((action) => action.integrationStatus === 'unavailable' || action.integrationStatus === 'degraded').length,
    highImpact: actions.filter((action) => action.riskLevel === 'critical' || action.riskLevel === 'high').length,
    approval: actions.filter((action) => action.requiresApproval === true).length,
    rollback: actions.filter((action) => action.rollbackSupported === true).length,
  }), [actions]);

  if (!hasAccess) return <section className="response-library-page"><AccessDeniedState title="Response library restricted" message="Required permission: Analyst, SOC Manager, or Platform Administrator." /></section>;

  return <section className="response-library-page" aria-label="Response action and connector library">
    <header className="ral-header">
      <div className="ral-header__identity"><div className="ral-header__icon"><PlugZap size={21} /></div><div><span>Response automation</span><h1>Action &amp; Connector Library</h1></div></div>
      <div className="ral-header__actions"><span className="ral-shortcuts"><kbd>/</kbd> search <kbd>Enter</kbd> inspect</span><Link to="/response/playbooks"><Workflow size={14} />Playbooks</Link><Link to="/response/activity"><History size={14} />Activity</Link><button type="button" onClick={() => void catalogQuery.refetch()} disabled={catalogQuery.isFetching} aria-label="Refresh action catalog" title="Refresh action catalog"><RefreshCw size={15} className={catalogQuery.isFetching ? 'ral-spin' : ''} /></button></div>
    </header>

    {fixtureMode && <div className="ral-fixture"><strong>Design fixture:</strong> fictional connector readiness and action schemas are enabled for visual review.<span>Production never receives these records.</span></div>}

    <div className="ral-metrics" aria-label="Catalog summary">
      <Metric icon={Box} label="Actions" value={actions.length || '—'} detail="authorized catalog" />
      <Metric icon={CheckCircle2} label="Healthy" value={actions.length ? metrics.healthy : '—'} detail="catalog reported" tone="healthy" />
      <Metric icon={AlertTriangle} label="Attention" value={actions.length ? metrics.unavailable : '—'} detail="degraded or unavailable" tone={metrics.unavailable ? 'warning' : undefined} />
      <Metric icon={ShieldAlert} label="High impact" value={actions.length ? metrics.highImpact : '—'} detail="high or critical" tone={metrics.highImpact ? 'critical' : undefined} />
      <Metric icon={Gavel} label="Approval gated" value={actions.length ? (fixtureMode ? metrics.approval : 'Preview') : '—'} detail={fixtureMode ? 'catalog declared' : 'target dependent'} />
      <Metric icon={RotateCcw} label="Rollback" value={actions.length ? (fixtureMode ? metrics.rollback : 'Preview') : '—'} detail={fixtureMode ? 'catalog declared' : 'target dependent'} />
    </div>

    <div className="ral-toolbar" aria-label="Action catalog filters">
      <label className="ral-search"><Search size={15} /><input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, target, parameter, or connector…" aria-label="Search actions"/><kbd>/</kbd></label>
      <HaCompactSelect ariaLabel="Filter by risk" label="Risk" value={risk} options={RISK_OPTIONS} onChange={setRisk} />
      <HaCompactSelect ariaLabel="Filter by readiness" label="Readiness" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <button type="button" className="ral-reset" onClick={resetFilters} disabled={!search && category === 'all' && risk === 'all' && status === 'all'}><RotateCcw size={13} />Reset</button>
      <span className="ral-snapshot">{catalogQuery.isFetching ? 'Refreshing catalog…' : catalogQuery.dataUpdatedAt ? `Snapshot ${new Date(catalogQuery.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Snapshot unavailable'}</span>
    </div>

    <main className="ral-workspace">
      <aside className="ral-categories" aria-label="Action categories">
        <header><span><ListFilter size={14} />Categories</span><strong>{categories.length}</strong></header>
        <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}><Box size={15} /><span>All actions</span><strong>{actions.length}</strong></button>
        {categories.map(([name, count]) => { const Icon = categoryIcon(name); return <button key={name} type="button" aria-pressed={category === name} onClick={() => setCategory(name)}><Icon size={15} /><span>{titleCase(name)}</span><strong>{count}</strong></button>; })}
        <div className="ral-categories__note"><ShieldCheck size={15} /><div><strong>Governed primitives</strong><span>Actions are added to versioned playbooks. Execution always requires an exact target preview.</span></div></div>
      </aside>

      <section className="ral-inventory" aria-label="Available response actions">
        <header className="ral-inventory__header"><div><strong>Available actions</strong><span>{filtered.length} matching · bounded authorized projection</span></div><span><Filter size={13} />Select a row to inspect its schema</span></header>
        <div className="ral-table" role="grid" aria-label="Response action catalog" aria-rowcount={pageRows.length}>
          <div className="ral-table__head" role="row"><span role="columnheader">Action</span><span role="columnheader">Connector</span><span role="columnheader">Target</span><span role="columnheader">Readiness</span><span role="columnheader">Risk</span><span role="columnheader">Required role</span><span role="columnheader" aria-label="Open details" /></div>
          <div className="ral-table__body">
            {catalogQuery.isLoading && !actions.length ? <div className="ral-inline-state"><RefreshCw size={22} className="ral-spin"/><strong>Loading governed action catalog</strong><span>Connector and permission metadata are loading.</span></div>
              : catalogQuery.isError && !actions.length ? <ErrorState title="Could not load the action catalog" message={catalogQuery.error?.message || 'The response catalog is unavailable.'} onRetry={() => void catalogQuery.refetch()} />
              : pageRows.length === 0 ? <EmptyState icon={<Search size={32} />} title="No matching actions" description="Adjust the category, readiness, risk, or search filters." action={<button type="button" className="ral-empty-reset" onClick={resetFilters}>Clear filters</button>} />
              : pageRows.map((action) => { const Icon = categoryIcon(action.category); return <button key={action.id} type="button" className="ral-row" role="row" onClick={() => setSelectedAction(action)} onDoubleClick={() => navigate(`/response/playbooks/new?action=${encodeURIComponent(action.id)}`)}>
                <span className="ral-action-cell" role="gridcell"><span className="ral-row-icon"><Icon size={17} /></span><span><strong>{action.name}</strong><small>{action.id} · {titleCase(action.category)}</small></span></span>
                <span className="ral-cell-stack" role="gridcell"><strong>{integrationLabel(action)}</strong><small>{action.params.length} input{action.params.length === 1 ? '' : 's'}</small></span>
                <span className="ral-target" role="gridcell">{titleCase(action.targetType)}</span>
                <span role="gridcell"><StatusBadge status={action.integrationStatus} /></span>
                <span role="gridcell"><RiskBadge risk={action.riskLevel} /></span>
                <span className="ral-role" role="gridcell">{action.requiredRole?.replace('ROLE_', '').replace(/_/g, ' ') || 'Not reported'}</span>
                <span className="ral-open" role="gridcell"><ArrowRight size={15} /></span>
              </button>; })}
          </div>
        </div>
        <footer className="ral-pagination"><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 actions'}</span><span>Page {page} of {totalPages}</span><div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}><ChevronLeft size={14} />Previous</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>Next<ChevronRight size={14} /></button></div></footer>
      </section>
    </main>

    {catalogQuery.isError && actions.length > 0 && <div className="ral-stale" role="status"><AlertTriangle size={14} />Refresh failed. Showing the last successful catalog snapshot.</div>}
    <div className="ral-status-dock"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode="live" lastUpdated={catalogQuery.dataUpdatedAt ? new Date(catalogQuery.dataUpdatedAt) : undefined} /><span><ShieldCheck size={12} />Catalog browsing is side-effect free</span></div>
    <ActionDrawer action={selectedAction} onClose={() => setSelectedAction(null)} />
  </section>;
}
