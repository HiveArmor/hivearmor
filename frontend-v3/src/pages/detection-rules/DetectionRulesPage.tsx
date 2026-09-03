import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, ChevronRight,
  CircleSlash2, Clock3, Columns3, Filter, GitBranch, Import, Library,
  Plus, RefreshCw, Search, ShieldAlert, TestTube2, X, Zap,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

import { createColumnDefs } from './columnDefs';
import { DetectionMonitoringView } from './DetectionMonitoringView';
import { deleteRule, detectionRulesFixtureMode, fetchRules, syncSigmaRules, toggleRuleActive } from './detectionRules.service';
import type { DetectionRule, DetectionRuleSummary, RuleListParams } from './detectionRules.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaIconButton } from '@/components/ha-icon-button';
import { HaMenu } from '@/components/ha-menu';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { ROUTES } from '@/constants/routes.constants';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS, type RowDensity } from '@/hooks/useRowDensity';
import { RULE_TACTIC_OPTIONS } from '@/pages/detection-rules/detectionRules.constants';
import { foundationDetectionRuleSummary } from '@/pages/detection-rules/detectionRules.fixtures';
import { useAuthStore } from '@/store/auth.store';

import './DetectionRulesPage.css';

/** Bundle-visible job sentence — detection content manager, not alert triage. */
export const DETECTION_RULES_JOB_SENTENCE =
  'Manage detection content inventory — review rule status, MITRE mapping, and coverage honesty, then test or activate only when authorized. Alert triage lives on Analyst Queue.';

export const DETECTION_MANAGE_DENIED_TITLE = 'Required permission: SOC Manager or Platform Administrator';

type RuleView = 'rules' | 'monitoring' | 'coverage' | 'test';
const DetectionCoverageView = lazy(() => import('./DetectionCoverageView'));
const DetectionImportPanel = lazy(() => import('./DetectionImportPanel'));
const DetectionTestConsole = lazy(() => import('./DetectionTestConsole'));
const PAGE_SIZE = 100;
const DEFAULT_COLUMNS = ['ruleName', 'ruleActive', 'health', 'origin', 'techniqueId', 'alerts24h', 'schedule', 'lastRunAt', 'lastModified', 'actions'];
const COLUMN_OPTIONS = [
  ['ruleName', 'Detection'], ['ruleActive', 'Status'], ['health', 'Last response'], ['origin', 'Source'],
  ['techniqueId', 'MITRE ATT&CK'], ['alerts24h', 'Alerts · 24h'], ['schedule', 'Schedule'],
  ['lastRunAt', 'Last run'], ['lastModified', 'Modified'], ['actions', 'Actions'],
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All states' },
  { value: 'true', label: 'Enabled' },
  { value: 'false', label: 'Disabled' },
];
const MITRE_OPTIONS = [
  { value: 'all', label: 'All tactics' },
  ...RULE_TACTIC_OPTIONS.map((tactic) => ({ value: tactic, label: tactic })),
];
const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

function DensityGlyph({ density }: { density: RowDensity }): JSX.Element {
  return <span className="detection-density-glyph" data-density={density} aria-hidden="true"><i /><i /><i /></span>;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}

export function DetectionRulesPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();

  const [view, setView] = useState<RuleView>('rules');
  const [testRuleId, setTestRuleId] = useState<DetectionRule['id'] | undefined>();
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [activeFilter, setActiveFilter] = useState<'all' | 'true' | 'false'>('all');
  const [mitreFilter, setMitreFilter] = useState<'all' | typeof RULE_TACTIC_OPTIONS[number]>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | NonNullable<DetectionRule['severity']>>('all');
  const [pageIndex, setPageIndex] = useState(0);
  const [density, setDensity] = useRowDensity();
  const [importOpen, setImportOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [selectedRules, setSelectedRules] = useState<DetectionRule[]>([]);
  const [activeRule, setActiveRule] = useState<DetectionRule | null>(null);
  const [toggleLoadingIds, setToggleLoadingIds] = useState<Set<DetectionRule['id']>>(new Set());
  const [fixtureActiveOverrides, setFixtureActiveOverrides] = useState<Map<DetectionRule['id'], boolean>>(() => new Map());
  const [hiddenFixtureIds, setHiddenFixtureIds] = useState<Set<DetectionRule['id']>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DetectionRule | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const roles = user?.roles ?? [];
  const hasAccess = roles.some((role) => ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'].includes(role));
  const userRole: 'ROLE_ANALYST' | 'ROLE_SOC_MANAGER' | 'ROLE_ADMIN' = roles.includes('ROLE_ADMIN') ? 'ROLE_ADMIN' : roles.includes('ROLE_SOC_MANAGER') ? 'ROLE_SOC_MANAGER' : 'ROLE_ANALYST';
  const canManage = userRole === 'ROLE_ADMIN' || userRole === 'ROLE_SOC_MANAGER';
  const canSync = userRole === 'ROLE_ADMIN';

  const filters = useMemo<RuleListParams>(() => ({
    page: pageIndex,
    size: PAGE_SIZE,
    sort: 'lastModified,desc',
    search: search || undefined,
    active: activeFilter === 'all' ? 'all' : activeFilter === 'true',
    technique: mitreFilter === 'all' ? undefined : mitreFilter,
    severity: severityFilter,
  }), [activeFilter, mitreFilter, pageIndex, search, severityFilter]);

  const rulesQuery = useQuery({
    queryKey: ['detection-rules', filters],
    queryFn: ({ signal }) => fetchRules(filters, signal),
    enabled: hasAccess,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const rules = useMemo(() => (rulesQuery.data?.items ?? [])
    .filter((rule) => !hiddenFixtureIds.has(rule.id))
    .map((rule) => fixtureActiveOverrides.has(rule.id) ? { ...rule, ruleActive: fixtureActiveOverrides.get(rule.id) ?? rule.ruleActive } : rule),
  [fixtureActiveOverrides, hiddenFixtureIds, rulesQuery.data?.items]);

  const total = Math.max(0, (rulesQuery.data?.total ?? 0) - hiddenFixtureIds.size);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search || activeFilter !== 'all' || mitreFilter !== 'all' || severityFilter !== 'all');
  const limitedContract = !detectionRulesFixtureMode && rules.some((rule) => rule.health === 'unknown' && rule.lastRunAt == null);
  const inventoryEmpty = !rulesQuery.isLoading && !rulesQuery.isError && total === 0 && !hasFilters;

  const summary = useMemo<DetectionRuleSummary>(() => {
    if (detectionRulesFixtureMode) return foundationDetectionRuleSummary;
    return {
      total,
      enabled: rules.filter((rule) => rule.ruleActive).length,
      healthy: 0,
      degraded: 0,
      alerts24h: rules.reduce((count, rule) => count + (rule.alerts24h ?? 0), 0),
      coverageTechniques: new Set(rules.map((rule) => rule.techniqueId).filter(Boolean)).size,
      coverageTechniquesTotal: 0,
      snapshotAt: new Date().toISOString(),
    };
  }, [rules, total]);

  useEffect(() => {
    setPageIndex(0);
    setSelectedRules([]);
    setActiveRule(null);
  }, [activeFilter, mitreFilter, search, severityFilter, view]);

  useEffect(() => {
    if (!activeRule) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('button')?.focus());
    return () => { cancelAnimationFrame(frame); previousFocusRef.current?.focus(); };
  }, [activeRule]);

  const resetFilters = useCallback(() => {
    setSearchText('');
    setActiveFilter('all');
    setMitreFilter('all');
    setSeverityFilter('all');
  }, []);

  const handleToggleActive = useCallback(async (rule: DetectionRule) => {
    setToggleLoadingIds((current) => new Set(current).add(rule.id));
    setActionMessage(null);
    try {
      const nextActive = !rule.ruleActive;
      await toggleRuleActive(rule.id, nextActive);
      if (detectionRulesFixtureMode) setFixtureActiveOverrides((current) => new Map(current).set(rule.id, nextActive));
      else await queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
      setActionMessage(`${rule.ruleName} ${nextActive ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Rule status could not be changed.');
    } finally {
      setToggleLoadingIds((current) => { const next = new Set(current); next.delete(rule.id); return next; });
    }
  }, [queryClient]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      if (detectionRulesFixtureMode) setHiddenFixtureIds((current) => new Set(current).add(deleteTarget.id));
      else await deleteRule(deleteTarget.id);
      setActionMessage(`${deleteTarget.ruleName} deleted.`);
      setActiveRule(null);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Rule could not be deleted.');
    }
  }, [deleteTarget, queryClient]);

  const handleSigmaSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncSigmaRules();
      setActionMessage(`${result.synced} Sigma rules staged · ${result.skipped ?? 0} unchanged.`);
      setSyncOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Sigma synchronization failed.');
    } finally {
      setSyncing(false);
    }
  }, [queryClient]);

  const columns = useMemo<ColDef<DetectionRule>[]>(() => createColumnDefs(userRole, canManage, handleToggleActive, setDeleteTarget, toggleLoadingIds, navigate)
    .filter((column) => visibleColumns.includes(column.colId ?? '')),
  [canManage, handleToggleActive, navigate, toggleLoadingIds, userRole, visibleColumns]);

  const handleKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.isContentEditable) return;
    if (event.key === 'Escape') { setActiveRule(null); return; }
    if (event.key === 'Enter' && activeRule) { navigate(`/detection-rules/${activeRule.id}/edit`); return; }
    if (!['j', 'k'].includes(event.key) || rules.length === 0) return;
    const currentIndex = activeRule ? rules.findIndex((rule) => rule.id === activeRule.id) : -1;
    const nextIndex = event.key === 'j' ? Math.min(rules.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
    if (rules[nextIndex]) { event.preventDefault(); setActiveRule(rules[nextIndex]); gridRef.current?.api.ensureIndexVisible(nextIndex, 'middle'); }
  }, [activeRule, navigate, rules]);

  const handleDrawerKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setActiveRule(null); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, []);

  if (!hasAccess) return <section className="detection-page"><div className="detection-state"><ShieldAlert size={34} /><h1>Detection content restricted</h1><p>Your role cannot view detection rules. Request Detection Read access from an administrator.</p></div></section>;

  return (
    <section className="detection-page" tabIndex={-1} onKeyDown={handleKeyboard}>
      <header className="detection-page__identity">
        <span className="detection-page__icon"><Zap size={20} aria-hidden="true" /></span>
        <div className="detection-page__title">
          <div className="detection-page__eyebrow">
            <small>DEFEND</small>
            <span className="detection-page__badge">STAGING CANDIDATE</span>
          </div>
          <h1>Detection Engineering</h1>
          <p className="detection-page__job">{DETECTION_RULES_JOB_SENTENCE}</p>
        </div>
        <div className="detection-page__identity-actions">
          <button type="button" disabled={!canManage} title={canManage ? 'Import and stage detection content' : DETECTION_MANAGE_DENIED_TITLE} onClick={() => setImportOpen(true)}><Import size={14} /> Import</button>
          <button type="button" disabled={!canSync} title={canSync ? 'Synchronize Sigma content' : 'Required permission: Platform Administrator'} onClick={() => setSyncOpen(true)}><GitBranch size={14} /> Sigma sync</button>
          <button type="button" className="detection-primary-button" disabled={!canManage} title={canManage ? 'Create rule' : DETECTION_MANAGE_DENIED_TITLE} onClick={() => navigate('/detection-rules/new')}><Plus size={15} /> Create rule</button>
        </div>
      </header>

      <p className="detection-page__meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.ALERTS}>Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.CORRELATED_FINDINGS}>Correlated Findings</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.RESPONSE_PLAYBOOKS}>Playbooks</Link>
        <span aria-hidden="true">·</span>
        <span className="detection-page__access" title="Requires Analyst, SOC Manager, or Platform Administrator">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {detectionRulesFixtureMode && <div className="detection-page__fixture"><span><strong>Design fixture:</strong> fictional detection content and execution telemetry are enabled.</span><span>Production never receives these records.</span></div>}

      {inventoryEmpty && <div className="detection-page__honesty" role="status" data-testid="detection-empty-honesty"><strong>No detection rules installed yet.</strong><span>The tenant inventory may be empty — import managed content or create a custom rule. Coverage and health metrics are not implied when the inventory is blank.</span></div>}

      <nav className="detection-views" aria-label="Detection engineering views">
        <button type="button" aria-current={view === 'rules' ? 'page' : undefined} onClick={() => { resetFilters(); setView('rules'); }}><Library size={14} /> Rules <span>{summary.total}</span></button>
        <button type="button" aria-current={view === 'monitoring' ? 'page' : undefined} onClick={() => { resetFilters(); setView('monitoring'); }}><Activity size={14} /> Rule monitoring <span>{summary.enabled}</span></button>
        <button type="button" aria-current={view === 'coverage' ? 'page' : undefined} onClick={() => { resetFilters(); setView('coverage'); }}><BarChart3 size={14} /> ATT&amp;CK coverage <span>{summary.coverageTechniques}</span></button>
        <button type="button" aria-current={view === 'test' ? 'page' : undefined} disabled={!canManage} title={canManage ? 'Open secure test console' : DETECTION_MANAGE_DENIED_TITLE} onClick={() => { if (!canManage) return; resetFilters(); setTestRuleId(undefined); setView('test'); }}><TestTube2 size={14} /> Test console</button>
      </nav>

      {actionMessage && <div className="detection-action-message" role="status"><CheckCircle2 size={14} /><span>{actionMessage}</span><button type="button" onClick={() => setActionMessage(null)} aria-label="Dismiss message"><X size={13} /></button></div>}

      {view === 'rules' && <>
      <div className="detection-command-bar" role="search" aria-label="Detection rule filters">
        <label className="detection-search"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search rule, Sigma ID, tactic, or technique…" aria-label="Search detection rules" />{searchText && <button type="button" onClick={() => setSearchText('')} aria-label="Clear search"><X size={13} /></button>}</label>
        <HaCompactSelect ariaLabel="Rule state" value={activeFilter} onChange={(value) => setActiveFilter(value as typeof activeFilter)} options={STATUS_OPTIONS} />
        <HaCompactSelect ariaLabel="Rule severity" value={severityFilter} onChange={(value) => setSeverityFilter(value as typeof severityFilter)} options={SEVERITY_OPTIONS} />
        <HaCompactSelect ariaLabel="MITRE tactic" value={mitreFilter} onChange={(value) => setMitreFilter(value as typeof mitreFilter)} options={MITRE_OPTIONS} />
        <HaIconButton className="detection-icon-button" onClick={() => void rulesQuery.refetch()} disabled={rulesQuery.isFetching} aria-label="Refresh detection rules" title="Refresh" icon={<RefreshCw size={15} className={rulesQuery.isFetching ? 'detection-spin' : ''} />} />
      </div>

      {limitedContract && <div className="detection-contract-warning" role="status"><AlertTriangle size={14} /><span><strong>Limited execution projection.</strong> Last-run health, alert volume, and schedule telemetry require backend execution history — unknown values stay uncolored.</span></div>}

      <main className="detection-inventory">
        <div className="detection-results__toolbar">
          <div><strong>Installed rules</strong><span>{rulesQuery.data ? `${total.toLocaleString()} matching` : 'Loading inventory'}</span>{rulesQuery.isFetching && rules.length > 0 && <em><RefreshCw size={11} /> Refreshing cached rows</em>}</div>
          <div className="detection-results__actions">
            {selectedRules.length > 0 && <span className="detection-selection-count">{selectedRules.length} selected</span>}
            {hasFilters && <button type="button" onClick={resetFilters}><Filter size={13} /> Clear filters</button>}
            <div className="detection-density" role="group" aria-label="Row density"><span>Rows</span><div>{(['compact', 'standard', 'comfortable'] as RowDensity[]).map((item) => <button key={item} type="button" aria-label={`${item} rows`} aria-pressed={density === item} onClick={() => setDensity(item)}><DensityGlyph density={item} /></button>)}</div></div>
            <div className="detection-column-picker">
              <HaMenu
                ariaLabel="Visible detection rule columns"
                width={212}
                trigger={
                  <button type="button">
                    <Columns3 size={14} /> Columns
                  </button>
                }
              >
                <HaMenu.Label>Visible columns</HaMenu.Label>
                {COLUMN_OPTIONS.map(([id, label]) => (
                  <HaMenu.CheckboxItem
                    key={id}
                    checked={visibleColumns.includes(id)}
                    disabled={id === 'ruleName' || id === 'actions'}
                    onToggle={() => setVisibleColumns((current) => current.includes(id)
                      ? current.filter((value) => value !== id)
                      : [...current, id])}
                  >
                    {label}
                  </HaMenu.CheckboxItem>
                ))}
              </HaMenu>
            </div>
          </div>
        </div>

        <div className="detection-grid-shell">
          {rulesQuery.isLoading ? <div className="detection-grid-loading" aria-label="Loading detection rules">{Array.from({ length: 10 }, (_, index) => <span key={index} />)}</div>
            : rulesQuery.isError ? <div className="detection-state"><AlertTriangle size={30} /><h2>Detection rules could not be loaded</h2><p>{rulesQuery.error instanceof Error ? rulesQuery.error.message : 'The inventory service is unavailable.'}</p><button type="button" onClick={() => void rulesQuery.refetch()}>Try again</button></div>
              : rules.length === 0 ? <div className="detection-state"><CircleSlash2 size={30} /><h2>{hasFilters ? 'No rules match these filters' : 'No detection rules installed'}</h2><p>{hasFilters ? 'Clear one or more filters to broaden the inventory.' : 'Import managed content or create a custom rule to begin monitoring.'}</p>{hasFilters && <button type="button" onClick={resetFilters}>Clear filters</button>}</div>
                : <SiemDataGrid ref={gridRef} className="detection-grid" ariaLabel="Detection rules inventory" columnDefs={columns} rowData={rules} rowModelType="clientSide" rowHeight={ROW_HEIGHTS[density]} rowSelection="multiple" suppressRowClickSelection getRowId={({ data }) => String((data as DetectionRule).id)} onSelectionChanged={(rows) => setSelectedRules(rows as DetectionRule[])} onRowClicked={(event: RowClickedEvent) => setActiveRule(event.data as DetectionRule)} defaultColDef={{ sortable: true, resizable: true, filter: false }} />}
        </div>

        <footer className="detection-pagination">
          <strong>{total.toLocaleString()} matching rules <small>· up to {PAGE_SIZE} rows loaded per page</small></strong>
          <span>Page {pageIndex + 1} <small>{rules.length ? `${pageIndex * PAGE_SIZE + 1}–${Math.min(total, pageIndex * PAGE_SIZE + rules.length)}` : '0'}</small></span>
          <div><button type="button" disabled={pageIndex === 0 || rulesQuery.isFetching} onClick={() => setPageIndex((page) => Math.max(0, page - 1))}><ChevronLeft size={14} /> Previous</button><button type="button" disabled={pageIndex + 1 >= totalPages || rulesQuery.isFetching} onClick={() => setPageIndex((page) => page + 1)}>Next <ChevronRight size={14} /></button></div>
        </footer>
      </main>
      </>}

      {view === 'monitoring' && <DetectionMonitoringView rules={rules} onOpenRule={setActiveRule} />}
      {view === 'coverage' && <Suspense fallback={<div className="detection-section-loading"><RefreshCw size={20} className="detection-spin" /><span>Loading ATT&amp;CK coverage…</span></div>}><DetectionCoverageView rules={rules} onOpenRule={setActiveRule} /></Suspense>}
      {view === 'test' && <Suspense fallback={<div className="detection-section-loading"><RefreshCw size={20} className="detection-spin" /><span>Loading secure test console…</span></div>}><DetectionTestConsole rules={rules} initialRuleId={testRuleId} /></Suspense>}

      <div className="detection-status"><StatusDock sseConnected={detectionRulesFixtureMode || epsStream.connected} eps={detectionRulesFixtureMode ? 12840 : epsStream.eps} mode={detectionRulesFixtureMode ? 'historical' : 'live'} lastUpdated={new Date(summary.snapshotAt)} /><span><Clock3 size={12} /> Rule snapshot {new Date(summary.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>

      {activeRule && <div className="detection-drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveRule(null); }}><aside className="detection-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="detection-drawer-title" onKeyDown={handleDrawerKeyboard}>
        <header><div><span data-severity={activeRule.severity ?? 'unknown'}>{activeRule.severity ?? 'Unrated'}</span><h2 id="detection-drawer-title">{activeRule.ruleName}</h2><code>{activeRule.sigmaRuleId ?? `HA-${activeRule.id}`} · version {activeRule.version ?? 'unavailable'}</code></div><button type="button" onClick={() => setActiveRule(null)} aria-label="Close rule details"><X size={16} /></button></header>
        <section className="detection-drawer__status"><div><small>STATUS</small><strong>{activeRule.ruleActive ? 'Enabled' : 'Disabled'}</strong></div><div><small>LAST RESPONSE</small><strong data-health={activeRule.health ?? 'unknown'}>{activeRule.health ?? 'Unknown'}</strong></div><div><small>ALERTS · 24H</small><strong>{activeRule.alerts24h ?? '—'}</strong></div></section>
        <section><h3>Detection intent</h3><p>{activeRule.description ?? 'No analyst-facing description is available.'}</p><dl><div><dt>Source</dt><dd>{activeRule.origin ?? 'Unknown'}</dd></div><div><dt>Schedule</dt><dd>{activeRule.schedule ?? 'Unavailable'}</dd></div><div><dt>Lookback</dt><dd>{activeRule.lookback ?? 'Unavailable'}</dd></div><div><dt>Last run</dt><dd>{formatDateTime(activeRule.lastRunAt)}</dd></div><div><dt>Duration</dt><dd>{activeRule.lastRunDurationMs == null ? 'Unavailable' : `${activeRule.lastRunDurationMs.toLocaleString()} ms`}</dd></div></dl></section>
        <section><h3>ATT&amp;CK and telemetry</h3>{activeRule.techniqueId ? <button className="detection-drawer__pivot" type="button" onClick={() => { setActiveRule(null); setView('coverage'); }}><BarChart3 size={16} /><span><strong>{activeRule.techniqueId} · {activeRule.techniqueName ?? 'Technique'}</strong><small>{activeRule.tactic ?? 'Tactic unavailable'}</small></span><ChevronRight size={14} /></button> : <p>Rule has no ATT&amp;CK mapping.</p>}{activeRule.dataTypes.length ? <div className="detection-drawer__chips">{activeRule.dataTypes.map((type) => <span key={type}>{type}</span>)}</div> : <p>Telemetry requirements are not reported by this rule projection.</p>}{activeRule.tags?.length ? <div className="detection-drawer__chips" aria-label="Rule tags">{activeRule.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</section>
        <section><h3>Change provenance</h3><dl><div><dt>Modified</dt><dd>{formatDateTime(activeRule.lastModified)}</dd></div><div><dt>Updated by</dt><dd>{activeRule.updatedBy ?? activeRule.createdBy ?? 'Unavailable'}</dd></div></dl><p>Version comparison and rollback are available after opening the editor.</p></section>
        <footer><button type="button" disabled={!canManage} title={canManage ? 'Test rule in sandbox' : DETECTION_MANAGE_DENIED_TITLE} onClick={() => { setTestRuleId(activeRule.id); setActiveRule(null); setView('test'); }}><TestTube2 size={14} /> Test rule</button><button type="button" className="detection-primary-button" disabled={!canManage} title={canManage ? 'Open rule editor' : DETECTION_MANAGE_DENIED_TITLE} onClick={() => navigate(`/detection-rules/${activeRule.id}/edit`)}>Open editor <ChevronRight size={14} /></button></footer>
      </aside></div>}

      {importOpen && <Suspense fallback={<div className="detection-drawer-scrim"><div className="detection-section-loading"><RefreshCw size={20} className="detection-spin" /><span>Loading import validation…</span></div></div>}><DetectionImportPanel existingRules={rules} onClose={() => setImportOpen(false)} onStaged={setActionMessage} /></Suspense>}

      <HaConfirmationModal isOpen={Boolean(deleteTarget)} title="Delete detection rule" message={`Delete “${deleteTarget?.ruleName ?? ''}”? Existing alerts remain available, but the rule and its schedule will be removed.`} confirmLabel="Delete rule" cancelLabel="Cancel" variant="danger" onConfirm={() => void handleDelete()} onCancel={() => setDeleteTarget(null)} />
      <HaConfirmationModal isOpen={syncOpen} title="Synchronize Sigma content" message="Fetch upstream Sigma content and stage changed rules for review. Existing managed rules are not activated or overwritten until approved." confirmLabel={syncing ? 'Synchronizing…' : 'Start synchronization'} cancelLabel="Cancel" variant="primary" onConfirm={() => void handleSigmaSync()} onCancel={() => setSyncOpen(false)} />
    </section>
  );
}
