import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent, ValueFormatterParams } from 'ag-grid-community';
import type { EChartsOption } from 'echarts';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  Bell, Check, ChevronLeft, ChevronRight, Clipboard, Clock3, Database, ExternalLink,
  FileClock, Fingerprint, Gauge, GitBranch, History, Link2, ListTree, Plus,
  Radio, RefreshCw, Search, ShieldAlert, Sparkles, Target, X,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { SeverityLabel } from '@/components/severity-label/SeverityLabel';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import { ApiError } from '@/lib/apiClient';
import { numericToSeverityLevel } from '@/lib/severity';
import {
  attachEntityToIncident, entityFixtureMode, fetchEntityAlerts, fetchEntityDetail, fetchEntityEvents,
} from '@/services/entities.service';
import { getIncidents } from '@/services/incidents.service';
import { useAuthStore } from '@/store/auth.store';
import type {
  EntityAlertDTO, EntityDetailDTO, EntityEventDTO, EntityIncidentOption, EntityRiskTrend,
} from '@/types/entity.types';

import './EntityDetailPage.css';

const LazyHaChart = lazy(() => import('@/components/ha-chart/HaChart').then((module) => ({ default: module.HaChart })));

type TabKey = 'overview' | 'activity' | 'alerts' | 'relationships';
type WindowMode = '24h' | '7d' | '30d' | '90d';

const VALID_TABS: TabKey[] = ['overview', 'activity', 'alerts', 'relationships'];
const WINDOW_OPTIONS: Array<{ value: WindowMode; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function entityHuntQuery(entity: EntityDetailDTO): string {
  const field = entity.entityType === 'host' ? 'host.name'
    : entity.entityType === 'user' ? 'user.name'
      : entity.entityType === 'ip' ? 'source.ip'
        : `${entity.entityType}.name`;
  return `${field}:"${entity.name.replace(/"/g, '\\"')}"`;
}

function formatDateTime(value?: string): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unavailable';
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeTime(value?: string): string {
  if (!value) return 'Unavailable';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes)) return 'Unavailable';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function riskLevel(score: number): string {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function Trend({ trend = 'stable', current, previous }: { trend?: EntityRiskTrend; current: number; previous?: number }): JSX.Element {
  const delta = current - (previous ?? current);
  const Icon = trend === 'rising' || trend === 'new' ? ArrowUpRight : trend === 'falling' ? ArrowDownRight : ArrowRight;
  return <span className="entity-dossier-trend" data-trend={trend}><Icon size={13} />{trend === 'new' ? 'New risk' : delta === 0 ? 'Stable' : `${delta > 0 ? '+' : ''}${delta} since prior`}</span>;
}

function buildRiskTimeline(data: EntityDetailDTO['riskTimeline']): EChartsOption {
  if (!data?.length) return { title: { text: 'Risk history unavailable', left: 'center', top: 'center' } };
  return {
    animation: false,
    grid: { left: 36, right: 14, top: 14, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false, data: data.map((point) => new Date(point.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })) },
    yAxis: { type: 'value', min: 0, max: 100, interval: 25 },
    tooltip: { trigger: 'axis', valueFormatter: (value) => `${String(value)}/100` },
    series: [{ name: 'Entity risk', type: 'line', data: data.map((point) => point.score), smooth: false, symbolSize: 5, areaStyle: { opacity: 0.08 }, markLine: { silent: true, symbol: 'none', label: { show: false }, data: [{ yAxis: 80 }, { yAxis: 60 }] } }],
  };
}

function DossierLoading(): JSX.Element {
  return <section className="entity-dossier"><div className="entity-dossier-loading" aria-label="Loading entity dossier" aria-busy="true"><span /><div><i /><i /><i /></div><div><i /><i /><i /></div></div></section>;
}

function InlineState({ title, message, retry }: { title: string; message: string; retry?: () => void }): JSX.Element {
  return <div className="entity-dossier-state"><ShieldAlert size={28} /><h2>{title}</h2><p>{message}</p>{retry && <button type="button" onClick={retry}>Try again</button>}</div>;
}

function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])')?.focus());
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);
  return ref;
}

export function EntityDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const hasAccess = useAuthStore((state) => state.hasAnyRole(['ROLE_ANALYST', 'ROLE_ADMIN']));
  const epsStream = useEpsStream();
  const [density] = useRowDensity();
  const requestedTab = searchParams.get('tab') as TabKey | null;
  const activeTab = requestedTab && VALID_TABS.includes(requestedTab) ? requestedTab : 'overview';
  const [windowMode, setWindowMode] = useState<WindowMode>('30d');
  const [eventPage, setEventPage] = useState(0);
  const [alertPage, setAlertPage] = useState(0);
  const [activeEvent, setActiveEvent] = useState<EntityEventDTO | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const closeEventDrawer = useCallback(() => setActiveEvent(null), []);
  const closeAttachDrawer = useCallback(() => setAttachOpen(false), []);
  const eventDrawerRef = useDialogFocus<HTMLElement>(activeEvent !== null, closeEventDrawer);
  const attachDrawerRef = useDialogFocus<HTMLElement>(attachOpen, closeAttachDrawer);

  const entityQuery = useQuery({
    queryKey: ['entity-dossier', id, windowMode],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityDetail(id, signal);
    },
    enabled: hasAccess && Boolean(id),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const eventsQuery = useQuery({
    queryKey: ['entity-dossier', id, 'activity', windowMode],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityEvents(id, signal);
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'activity',
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const alertsQuery = useQuery({
    queryKey: ['entity-dossier', id, 'alerts', windowMode],
    queryFn: ({ signal }) => {
      if (!id) throw new Error('Entity ID is required');
      return fetchEntityAlerts(id, signal);
    },
    enabled: hasAccess && Boolean(id) && activeTab === 'alerts',
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const incidentOptionsQuery = useQuery({
    queryKey: ['entity-dossier', 'incident-options'],
    queryFn: async (): Promise<EntityIncidentOption[]> => {
      if (entityFixtureMode) {
        const { getFoundationEntityIncidentOptions } = await import('@/pages/entities/entities.fixtures');
        return getFoundationEntityIncidentOptions();
      }
      const response = await getIncidents({ status: 'OPEN', page: 0, size: 30 });
      return response.items.map((incident) => ({ id: String(incident.id), title: incident.title, severity: incident.severity, status: incident.status, entityAlreadyLinked: false }));
    },
    enabled: hasAccess && attachOpen,
    staleTime: 30_000,
  });

  const attachMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIncidentId || !id) throw new Error('Select an incident first.');
      if (entityFixtureMode) return;
      await attachEntityToIncident(Number(selectedIncidentId), id);
    },
    onSuccess: () => {
      setActionNotice(entityFixtureMode ? 'Fixture preview complete; no incident was changed.' : 'Entity added to the incident.');
      setAttachOpen(false);
      setSelectedIncidentId(null);
      void queryClient.invalidateQueries({ queryKey: ['entity-dossier', id] });
    },
  });

  const setTab = useCallback((tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const entity = entityQuery.data;
  const allEvents = eventsQuery.data ?? [];
  const allAlerts = alertsQuery.data ?? [];
  const events = allEvents.slice(eventPage * 50, eventPage * 50 + 50);
  const alerts = allAlerts.slice(alertPage * 25, alertPage * 25 + 25);

  const eventColumns = useMemo<ColDef<EntityEventDTO>[]>(() => [
    { field: 'timestamp', headerName: 'Event time', width: 160, valueFormatter: ({ value }: ValueFormatterParams<EntityEventDTO>) => formatDateTime(String(value)), cellClass: 'entity-dossier-grid__mono', sort: 'desc' },
    { field: 'severity', headerName: 'Severity', width: 105, cellRenderer: ({ value }: { value?: string }) => <span className="entity-event-severity" data-level={value}>{value ?? 'unknown'}</span> },
    { field: 'source', headerName: 'Source', width: 112 },
    { field: 'action', headerName: 'Action', width: 165, cellClass: 'entity-dossier-grid__mono' },
    { field: 'host', headerName: 'Host', width: 145, cellClass: 'entity-dossier-grid__entity' },
    { field: 'user', headerName: 'User', width: 135, cellClass: 'entity-dossier-grid__entity' },
    { field: 'sourceIp', headerName: 'Source IP', width: 130, cellClass: 'entity-dossier-grid__mono' },
    { field: 'message', headerName: 'Event summary', minWidth: 320, flex: 1 },
  ], []);

  const alertColumns = useMemo<ColDef<EntityAlertDTO>[]>(() => [
    { field: 'title', headerName: 'Alert', minWidth: 340, flex: 1.4 },
    { field: 'severity', headerName: 'Severity', width: 105, cellRenderer: ({ value }: { value?: number }) => value === undefined ? '—' : <SeverityLabel severity={numericToSeverityLevel(value)} size="sm" /> },
    { field: 'category', headerName: 'Category', width: 120 },
    { field: 'status', headerName: 'Status', width: 115, valueFormatter: ({ value }: ValueFormatterParams<EntityAlertDTO>) => String(value ?? 'unknown').replace(/_/g, ' ') },
    { field: 'timestamp', headerName: 'Observed', width: 160, valueFormatter: ({ value }: ValueFormatterParams<EntityAlertDTO>) => formatDateTime(String(value)), cellClass: 'entity-dossier-grid__mono' },
    { field: 'incidentId', headerName: 'Incident', width: 100, valueFormatter: ({ value }: ValueFormatterParams<EntityAlertDTO>) => value ? String(value) : '—' },
  ], []);

  if (!hasAccess) return <section className="entity-dossier"><InlineState title="Entity dossier restricted" message="Your role cannot view entity investigation data." /></section>;
  if (entityQuery.isLoading) return <DossierLoading />;
  if (entityQuery.isError || !entity) {
    const forbidden = entityQuery.error instanceof ApiError && entityQuery.error.status === 403;
    const missing = entityQuery.error instanceof ApiError && entityQuery.error.status === 404;
    return <section className="entity-dossier"><InlineState title={forbidden ? 'Entity dossier restricted' : missing ? 'Entity not found' : 'Entity dossier unavailable'} message={forbidden ? 'Your current scope cannot read this entity.' : missing ? 'This entity no longer exists in the authorized inventory.' : entityQuery.error instanceof Error ? entityQuery.error.message : 'The entity service did not respond.'} retry={!forbidden && !missing ? () => void entityQuery.refetch() : undefined} /><button className="entity-dossier-back-state" type="button" onClick={() => navigate('/entities')}>Return to entity inventory</button></section>;
  }

  const riskTimeline = buildRiskTimeline(entity.riskTimeline);
  const detailPartial = entity.dataCompleteness !== 'full';

  return (
    <section className="entity-dossier">
      <header className="entity-dossier__identity">
        <button className="entity-dossier__back" type="button" onClick={() => navigate('/entities')} aria-label="Back to entity inventory"><ArrowLeft size={17} /></button>
        <span className="entity-dossier__type-icon"><EntityTypeIcon type={entity.entityType} size={21} /></span>
        <div className="entity-dossier__title"><small>{entityTypeLabel(entity.entityType).toUpperCase()} DOSSIER</small><h1>{entity.name}</h1><code>{entity.id}</code></div>
        <div className="entity-dossier__header-actions">
          <HaCompactSelect ariaLabel="Entity activity window" value={windowMode} onChange={(value) => { setWindowMode(value); setEventPage(0); setAlertPage(0); }} options={WINDOW_OPTIONS} />
          <button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(entityHuntQuery(entity))}`)} disabled={entity.permissions?.hunt === false}><Search size={14} /> Hunt entity</button>
          <button className="entity-dossier__primary" type="button" onClick={() => setAttachOpen(true)} disabled={entity.permissions?.attachToIncident === false}><Plus size={14} /> Add to incident</button>
          <button className="entity-dossier__icon-button" type="button" onClick={() => void entityQuery.refetch()} disabled={entityQuery.isFetching} aria-label="Refresh entity dossier"><RefreshCw size={14} className={entityQuery.isFetching ? 'entity-dossier-spin' : ''} /></button>
        </div>
      </header>

      {entityFixtureMode && <div className="entity-dossier__fixture"><span><strong>Design fixture:</strong> fictional risk, relationship, alert, and activity records are enabled.</span><span>Production never receives these records.</span></div>}
      {detailPartial && <div className="entity-dossier__partial" role="status"><AlertTriangle size={14} /><span><strong>Core projection only.</strong> Risk reasons, baseline, provenance, incidents, permissions, and signed pivots require the registered dossier contract.</span></div>}
      {actionNotice && <div className="entity-dossier__notice" role="status"><Check size={14} />{actionNotice}<button type="button" onClick={() => setActionNotice(null)} aria-label="Dismiss action status"><X size={13} /></button></div>}

      <section className="entity-dossier-summary" aria-label="Entity risk summary">
        <article className="entity-dossier-summary__risk" data-level={riskLevel(entity.riskScore)}><span>Entity risk</span><strong>{entity.riskScore}</strong><small>/100</small><Trend trend={entity.riskTrend} current={entity.riskScore} previous={entity.previousRiskScore} /></article>
        <article><span><Target size={13} /> Criticality</span><strong>{entity.criticality ? entity.criticality.replace(/_/g, ' ') : 'Unavailable'}</strong><small>separate from calculated risk</small></article>
        <article><span><Bell size={13} /> Active alerts</span><strong>{entity.alertCount}</strong><small>{entity.incidentCount ?? '—'} linked incidents</small></article>
        <article><span><Gauge size={13} /> Baseline deviation</span><strong>{entity.baselineDeviation ? `${entity.baselineDeviation}×` : '—'}</strong><small>{entity.anomalyCount ?? '—'} anomalies observed</small></article>
        <article><span><Clock3 size={13} /> Last activity</span><strong>{relativeTime(entity.lastSeen)}</strong><small>{formatDateTime(entity.lastSeen)}</small></article>
        <article><span><Radio size={13} /> Data freshness</span><strong>{entity.dataSources?.some((source) => source.status === 'degraded') ? 'Degraded' : entity.dataSources ? 'Current' : 'Unknown'}</strong><small>{entity.dataSources?.length ?? '—'} contributing sources</small></article>
      </section>

      <nav className="entity-dossier-tabs" role="tablist" aria-label="Entity dossier views">
        {([
          ['overview', 'Overview', Sparkles], ['activity', 'Activity', Activity], ['alerts', 'Alerts', Bell], ['relationships', 'Relationships', GitBranch],
        ] as const).map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1} onClick={() => setTab(key)}><Icon size={14} />{label}{key === 'alerts' && <span>{entity.alertCount}</span>}{key === 'relationships' && <span>{entity.relatedEntities?.length ?? '—'}</span>}</button>)}
      </nav>

      <main className="entity-dossier-workspace">
        {activeTab === 'overview' && <div className="entity-dossier-overview">
          <aside className="entity-dossier-rail">
            <section className="entity-dossier-panel"><header><Fingerprint size={14} /><h2>Identity and scope</h2></header><dl><div><dt>Type</dt><dd><EntityTypeIcon type={entity.entityType} size={13} />{entityTypeLabel(entity.entityType)}</dd></div><div><dt>Tenant</dt><dd>{entity.tenantName ?? 'Authorized scope'}</dd></div><div><dt>Department</dt><dd>{entity.department ?? 'Unavailable'}</dd></div><div><dt>Role</dt><dd>{entity.role ?? 'Unavailable'}</dd></div><div><dt>First observed</dt><dd>{formatDateTime(entity.firstSeen)}</dd></div><div><dt>Last observed</dt><dd>{formatDateTime(entity.lastSeen)}</dd></div><div><dt>Status</dt><dd>{entity.status ?? 'Unknown'}</dd></div><div><dt>Watchlisted</dt><dd>{entity.watchlisted === undefined ? 'Unknown' : entity.watchlisted ? 'Yes' : 'No'}</dd></div></dl>{entity.tags?.length ? <div className="entity-dossier-tags">{entity.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</section>
            <section className="entity-dossier-panel"><header><Database size={14} /><h2>Coverage and provenance</h2></header>{entity.dataSources?.length ? <ul className="entity-source-list">{entity.dataSources.map((source) => <li key={source.id}><i data-status={source.status} /><span><strong>{source.label}</strong><small>Last ingest {relativeTime(source.lastIngestedAt)}</small></span><em>{source.status}</em></li>)}</ul> : <p className="entity-dossier-unavailable">Source coverage requires ENT-006.</p>}<footer>Risk calculated {formatDateTime(entity.riskCalculatedAt)}</footer></section>
          </aside>

          <div className="entity-dossier-primary-column">
            <section className="entity-dossier-panel entity-dossier-risk-drivers"><header><ShieldAlert size={14} /><h2>Why this entity is risky</h2><span>{entity.riskDrivers?.length ?? 0} contributing signals</span></header>{entity.riskDrivers?.length ? <ol>{entity.riskDrivers.map((driver) => <li key={driver.id}><div><strong>{driver.label}</strong><span>+{driver.contribution}</span></div><p>{driver.description}</p><small>{driver.source} · {driver.evidenceCount} evidence records</small><div className="entity-risk-contribution"><i style={{ width: `${Math.min(100, driver.contribution * 2.5)}%` }} /></div></li>)}</ol> : <p className="entity-dossier-unavailable">The current backend returns a score without explainable risk drivers. ENT-006 is registered.</p>}</section>
            <section className="entity-dossier-panel entity-dossier-chart"><header><History size={14} /><h2>Risk history</h2><span>{windowMode} window · 0–100 normalized score</span></header><div><Suspense fallback={<div className="entity-chart-loading" />}><LazyHaChart option={riskTimeline} height={220} ariaLabel={`Risk history for ${entity.name}`} ariaDescription="Calculated entity risk score over the selected activity window." /></Suspense></div></section>
            <section className="entity-dossier-panel"><header><Gauge size={14} /><h2>Behavior against baseline</h2><span>peer and historical comparison</span></header>{entity.baselineMetrics?.length ? <div className="entity-baseline-grid">{entity.baselineMetrics.map((metric) => { const ratio = metric.baseline ? metric.current / metric.baseline : 0; return <article key={metric.id} data-direction={metric.direction}><span>{metric.label}</span><strong>{metric.current.toLocaleString()} <small>{metric.unit}</small></strong><div><i style={{ width: `${Math.min(100, ratio * 20)}%` }} /></div><p>Baseline {metric.baseline.toLocaleString()} · {ratio.toFixed(1)}× normal</p></article>; })}</div> : <p className="entity-dossier-unavailable">Baseline metrics are unavailable from the current core DTO.</p>}</section>
          </div>

          <aside className="entity-dossier-rail">
            <section className="entity-dossier-panel"><header><ListTree size={14} /><h2>ATT&amp;CK observations</h2></header>{entity.topAttackTechniques?.length ? <ul className="entity-technique-list">{entity.topAttackTechniques.map((technique) => <li key={technique.id}><code>{technique.id}</code><span><strong>{technique.name}</strong><small>{technique.count} observations</small></span></li>)}</ul> : <p className="entity-dossier-unavailable">No ATT&amp;CK techniques observed.</p>}</section>
            <section className="entity-dossier-panel"><header><Link2 size={14} /><h2>Related entity preview</h2><button type="button" onClick={() => setTab('relationships')}>View all</button></header>{entity.relatedEntities?.length ? <ul className="entity-related-preview">{entity.relatedEntities.slice(0, 5).map((related) => <li key={related.id}><EntityTypeIcon type={related.type} size={14} /><span><strong>{related.label}</strong><small>{related.relationship} · {related.eventCount} events</small></span><em>{related.riskScore ?? '—'}</em></li>)}</ul> : <p className="entity-dossier-unavailable">Relationship context is unavailable.</p>}</section>
            <section className="entity-dossier-panel entity-dossier-hunt-card"><header><Search size={14} /><h2>Continue investigation</h2></header><code>{entityHuntQuery(entity)}</code><button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(entityHuntQuery(entity))}`)}>Open in Search &amp; Hunt <ExternalLink size={13} /></button></section>
          </aside>
        </div>}

        {activeTab === 'activity' && <section className="entity-dossier-data-view"><header><div><Activity size={15} /><span><strong>Unified entity activity</strong><small>{allEvents.length} bounded events · newest first</small></span></div><span>Heavy raw detail loads only after row activation.</span></header><div className="entity-dossier-grid-shell">{eventsQuery.isLoading ? <div className="entity-dossier-grid-loading">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div> : eventsQuery.isError ? <InlineState title="Activity unavailable" message="The activity projection could not be loaded. Existing dossier data remains available." retry={() => void eventsQuery.refetch()} /> : events.length ? <SiemDataGrid className="entity-dossier-grid" columnDefs={eventColumns} rowData={events} rowHeight={ROW_HEIGHTS[density]} onRowClicked={(event: RowClickedEvent) => setActiveEvent(event.data as EntityEventDTO)} getRowId={({ data }) => (data as EntityEventDTO).id ?? `${(data as EntityEventDTO).timestamp}-${(data as EntityEventDTO).source}`} ariaLabel="Entity activity events" /> : <InlineState title="No entity activity" message="No authorized events were observed in this window." />}</div><footer><span>{allEvents.length} loaded · page {eventPage + 1}</span><div><button type="button" disabled={eventPage === 0} onClick={() => setEventPage((page) => page - 1)}><ChevronLeft size={14} /> Previous</button><button type="button" disabled={(eventPage + 1) * 50 >= allEvents.length} onClick={() => setEventPage((page) => page + 1)}>Next <ChevronRight size={14} /></button></div></footer></section>}

        {activeTab === 'alerts' && <section className="entity-dossier-data-view"><header><div><Bell size={15} /><span><strong>Related alerts</strong><small>{allAlerts.length || entity.alertCount} authorized alerts</small></span></div><span>Select an alert to open its investigation workspace.</span></header><div className="entity-dossier-grid-shell">{alertsQuery.isLoading ? <div className="entity-dossier-grid-loading">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div> : alertsQuery.isError ? <InlineState title="Related alerts unavailable" message="The alert projection failed independently; the entity dossier remains usable." retry={() => void alertsQuery.refetch()} /> : alerts.length ? <SiemDataGrid className="entity-dossier-grid" columnDefs={alertColumns} rowData={alerts} rowHeight={ROW_HEIGHTS[density]} onRowClicked={(event: RowClickedEvent) => navigate(`/alerts/${encodeURIComponent((event.data as EntityAlertDTO).id)}`)} getRowId={({ data }) => (data as EntityAlertDTO).id} ariaLabel="Alerts related to this entity" /> : <InlineState title="No related alerts" message="No alerts match this entity and activity window." />}</div><footer><span>{allAlerts.length} loaded · page {alertPage + 1}</span><div><button type="button" disabled={alertPage === 0} onClick={() => setAlertPage((page) => page - 1)}><ChevronLeft size={14} /> Previous</button><button type="button" disabled={(alertPage + 1) * 25 >= allAlerts.length} onClick={() => setAlertPage((page) => page + 1)}>Next <ChevronRight size={14} /></button></div></footer></section>}

        {activeTab === 'relationships' && <section className="entity-relationships"><header><div><GitBranch size={15} /><span><strong>Entity relationships</strong><small>Accessible evidence-backed relationship projection</small></span></div><button type="button" onClick={() => navigate(`/constellation?entity=${encodeURIComponent(entity.id)}`)}>Open threat constellation <ExternalLink size={13} /></button></header>{entity.relatedEntities?.length ? <div className="entity-relationship-list" role="list">{entity.relatedEntities.map((related) => <article key={related.id} role="listitem"><span className="entity-relationship-list__icon"><EntityTypeIcon type={related.type} size={18} /></span><div><strong>{related.label}</strong><small>{entityTypeLabel(related.type)} · {related.id}</small></div><span>{related.relationship}</span><dl><div><dt>First seen</dt><dd>{formatDateTime(related.firstSeen)}</dd></div><div><dt>Last seen</dt><dd>{relativeTime(related.lastSeen)}</dd></div><div><dt>Events</dt><dd>{related.eventCount}</dd></div><div><dt>Risk</dt><dd>{related.riskScore ?? '—'}</dd></div></dl><button type="button" onClick={() => navigate(`/entities/${encodeURIComponent(related.id)}`)}>Open dossier <ChevronRight size={13} /></button></article>)}</div> : <InlineState title="Relationships unavailable" message="No authorized relationship projection is available for this entity." />}</section>}
      </main>

      <div className="entity-dossier-status"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="historical" lastUpdated={entity.riskCalculatedAt ? new Date(entity.riskCalculatedAt) : undefined} /><span><FileClock size={12} /> Risk snapshot {entity.riskCalculatedAt ? new Date(entity.riskCalculatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'unavailable'}</span></div>

      {activeEvent && <div className="entity-event-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEventDrawer(); }}><aside ref={eventDrawerRef} className="entity-event-drawer" role="dialog" aria-modal="true" aria-labelledby="entity-event-title"><header><div><small>ENTITY ACTIVITY</small><h2 id="entity-event-title">{activeEvent.action ?? 'Observed event'}</h2><code>{activeEvent.id ?? activeEvent.timestamp}</code></div><button type="button" onClick={closeEventDrawer} aria-label="Close event detail"><X size={17} /></button></header><section><h3>Event context</h3><dl><div><dt>Observed</dt><dd>{formatDateTime(activeEvent.timestamp)}</dd></div><div><dt>Severity</dt><dd>{activeEvent.severity ?? 'unknown'}</dd></div><div><dt>Source</dt><dd>{activeEvent.source}</dd></div><div><dt>Host</dt><dd>{activeEvent.host ?? '—'}</dd></div><div><dt>User</dt><dd>{activeEvent.user ?? '—'}</dd></div><div><dt>Source IP</dt><dd>{activeEvent.sourceIp ?? '—'}</dd></div></dl></section><section><h3>Summary</h3><p>{activeEvent.message}</p></section><section><h3>Normalized projection</h3><pre><code>{JSON.stringify(activeEvent, null, 2)}</code></pre></section><footer><button type="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(activeEvent, null, 2))}><Clipboard size={14} /> Copy event</button><button type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(`event.id:"${activeEvent.id ?? ''}"`)}`)}><Search size={14} /> Hunt event</button></footer></aside></div>}

      {attachOpen && <div className="entity-attach-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAttachDrawer(); }}><aside ref={attachDrawerRef} className="entity-attach-drawer" role="dialog" aria-modal="true" aria-labelledby="entity-attach-title"><header><div><small>INCIDENT EVIDENCE</small><h2 id="entity-attach-title">Add entity to incident</h2><p>Review the target case before linking <strong>{entity.name}</strong>.</p></div><button type="button" onClick={closeAttachDrawer} aria-label="Close incident selection"><X size={17} /></button></header><div className="entity-incident-options">{incidentOptionsQuery.isLoading ? <div className="entity-dossier-grid-loading"><i /><i /><i /></div> : incidentOptionsQuery.isError ? <InlineState title="Incidents unavailable" message="Open incident candidates could not be loaded." /> : incidentOptionsQuery.data?.map((incident) => <label key={incident.id} data-selected={selectedIncidentId === incident.id} data-disabled={incident.entityAlreadyLinked}><input type="radio" name="incident" value={incident.id} checked={selectedIncidentId === incident.id} disabled={incident.entityAlreadyLinked} onChange={() => setSelectedIncidentId(incident.id)} /><span><strong>{incident.title}</strong><small>{incident.id} · {incident.severity} · {incident.status}</small></span>{incident.entityAlreadyLinked && <em>Already linked</em>}</label>)}</div><section><AlertTriangle size={14} /><p>Linking preserves this entity reference in the incident. The backend must revalidate tenant scope, duplicate state, and permissions.</p></section><footer><button type="button" onClick={closeAttachDrawer}>Cancel</button><button className="entity-dossier__primary" type="button" disabled={!selectedIncidentId || attachMutation.isPending} onClick={() => attachMutation.mutate()}>{attachMutation.isPending ? 'Adding…' : entityFixtureMode ? 'Simulate add' : 'Add to incident'}</button></footer></aside></div>}
    </section>
  );
}
