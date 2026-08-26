/** Incident Command — bounded, keyboard-first SOC incident queue. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { RowClickedEvent, RowDoubleClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  AlignJustify,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Filter,
  List,
  PanelTop,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { INCIDENT_COLUMN_DEFS } from './columnDefs';
import {
  fetchIncidentQueueSummary,
  fetchIncidents,
  filtersToParams,
  IncidentApiError,
} from './incidents.service';
import type { IncidentFilters, IncidentListItem } from './incidents.types';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { SlaIndicator } from '@/components/sla-indicator/SlaIndicator';
import { StatusDock } from '@/components/status-dock/StatusDock';
import type { IncidentStatus } from '@/constants/status.constants';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS, type RowDensity } from '@/hooks/useRowDensity';
import { getSeverityLabel } from '@/lib/severity';
import type { SeverityLevel } from '@/lib/severity';
import {
  formatSlaStatsDetail,
  getIncidentSlaStats,
} from '@/services/incidents.service';
import { useAuthStore } from '@/store/auth.store';
import './IncidentListPage.css';

type QueueView = 'active' | 'mine' | 'critical' | 'breached' | 'unassigned' | 'all' | 'custom';
const PAGE_SIZE = 50;
const ACTIVE_STATUSES: IncidentStatus[] = ['open', 'in_progress'];
const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active states' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In review' },
  { value: 'resolved', label: 'Completed' },
  { value: 'closed', label: 'Merged' },
  { value: 'all', label: 'All states' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'All priorities' },
  { value: 'P1', label: 'P1 · Critical' },
  { value: 'P2', label: 'P2 · High' },
  { value: 'P3', label: 'P3 · Medium' },
  { value: 'P4', label: 'P4 · Low' },
];

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical · 9–10' },
  { value: 'high', label: 'High · 7–8' },
  { value: 'medium', label: 'Medium · 4–6' },
  { value: 'low', label: 'Low · 1–3' },
];

const TIME_OPTIONS = [
  { value: '24h', label: 'Created in 24 hours' },
  { value: '7d', label: 'Created in 7 days' },
  { value: '30d', label: 'Created in 30 days' },
  { value: 'all', label: 'All retained' },
];

function createdFrom(range: string): string | undefined {
  const offsets: Record<string, number> = {
    '24h': 24 * 60 * 60_000,
    '7d': 7 * 24 * 60 * 60_000,
    '30d': 30 * 24 * 60 * 60_000,
  };
  return range === 'all' ? undefined : new Date(Date.now() - offsets[range]).toISOString();
}

function formatSnapshot(timestamp: string | undefined): string {
  if (!timestamp) return 'Pending';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAbsolute(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Not set';
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function IncidentPreview({ incident, onOpen }: { incident: IncidentListItem; onOpen: () => void }): JSX.Element {
  return (
    <div className="incident-preview">
      <div className="incident-preview__command">
        <span className="incident-priority" data-priority={incident.incidentPriority.toLowerCase()}>{incident.incidentPriority}</span>
        <span className="incident-status" data-status={incident.incidentStatus}>{incident.incidentStatus.replace('_', ' ')}</span>
        {incident.slaBreached && <span className="incident-breached"><Clock3 size={12} /> SLA breached</span>}
        {!incident.slaBreached && incident.slaDeadline && (
          <span className="incident-preview__sla" aria-label="Incident SLA">
            <SlaIndicator dueAt={incident.slaDeadline} size="sm" showLabel />
          </span>
        )}
      </div>

      <p className="incident-preview__description">
        {incident.incidentDescription || 'No incident summary has been recorded. Open the workbench to review linked alerts and preserve analyst findings.'}
      </p>

      <dl className="incident-preview__facts">
        <div><dt>Severity</dt><dd>{getSeverityLabel(incident.incidentSeverity)} · {incident.incidentSeverity}/10</dd></div>
        <div><dt>Owner</dt><dd>{incident.incidentAssignedTo || 'Unassigned'}</dd></div>
        <div><dt>Created</dt><dd>{formatAbsolute(incident.incidentCreatedDate)}</dd></div>
        <div>
          <dt>SLA</dt>
          <dd>
            {incident.slaDeadline ? (
              <span className="incident-preview__sla-fact">
                <SlaIndicator dueAt={incident.slaDeadline} size="sm" showLabel />
                <small>{formatAbsolute(incident.slaDeadline)}</small>
              </span>
            ) : (
              'Not set'
            )}
          </dd>
        </div>
      </dl>

      <section className="incident-preview__next">
        <strong><ShieldAlert size={14} /> Investigation control</strong>
        <p>Review linked alerts and evidence before containment. Disruptive response remains subject to target preview and authority policy.</p>
      </section>

      <button type="button" className="incident-preview__open" onClick={onOpen}>
        Open investigation workbench <ExternalLink size={13} />
      </button>
    </div>
  );
}

export function IncidentListPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();

  const [view, setView] = useState<QueueView>('active');
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [status, setStatus] = useState('active');
  const [priority, setPriority] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [timeRange, setTimeRange] = useState('30d');
  const [page, setPage] = useState(0);
  const [density, setDensity] = useRowDensity();
  const [selectedIncident, setSelectedIncident] = useState<IncidentListItem | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const canCreate = user?.roles?.some((role) => ['ROLE_SOC_MANAGER', 'ROLE_ADMIN'].includes(role)) ?? false;

  const filters = useMemo<IncidentFilters>(() => {
    const next: IncidentFilters = {
      q: search || undefined,
      status: status === 'active' ? ACTIVE_STATUSES : status === 'all' ? undefined : [status as IncidentStatus],
      priority: priority === 'all' ? undefined : [priority],
      severity: severity === 'all' ? undefined : [severity as SeverityLevel],
      createdFrom: createdFrom(timeRange),
    };
    if (view === 'mine') next.assignedTo = user?.login;
    if (view === 'critical') next.priority = ['P1'];
    if (view === 'breached') next.slaBreached = true;
    if (view === 'unassigned') next.unassignedOnly = true;
    if (view === 'all') next.status = undefined;
    return next;
  }, [priority, search, severity, status, timeRange, user?.login, view]);

  const listParams = useMemo(() => ({
    ...filtersToParams(filters),
    page,
    size: PAGE_SIZE,
    sort: 'incidentCreatedDate,desc',
  }), [filters, page]);

  const listQuery = useQuery({
    queryKey: ['incident-command', listParams],
    queryFn: ({ signal }) => fetchIncidents(listParams, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['incident-command-summary', user?.login],
    queryFn: ({ signal }) => fetchIncidentQueueSummary(user?.login, signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const slaStatsQuery = useQuery({
    queryKey: ['incident-sla-stats'],
    queryFn: ({ signal }) => getIncidentSlaStats(signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data?.items]);
  const total = listQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstRecord = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRecord = Math.min(total, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
    setActiveIndex(0);
    setSelectedIncident(null);
  }, [filters]);

  const openIncident = useCallback((incident: IncidentListItem) => {
    navigate(`/incidents/${incident.id}`);
  }, [navigate]);

  const selectIncident = useCallback((incident: IncidentListItem) => {
    setSelectedIncident(incident);
    setActiveIndex(Math.max(0, items.findIndex((item) => item.id === incident.id)));
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      if (target.matches('input, select, textarea, button, [contenteditable="true"]')) return;
      if ((event.key === 'j' || event.key === 'k') && items.length) {
        event.preventDefault();
        const nextIndex = event.key === 'j'
          ? Math.min(items.length - 1, activeIndex + 1)
          : Math.max(0, activeIndex - 1);
        const incident = items[nextIndex];
        setActiveIndex(nextIndex);
        setSelectedIncident(incident);
        gridRef.current?.api.getRowNode(String(incident.id))?.setSelected(true, true);
      }
      if (event.key === 'Enter' && selectedIncident) {
        event.preventDefault();
        openIncident(selectedIncident);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, items, openIncident, selectedIncident]);

  const applyView = (nextView: QueueView): void => {
    setView(nextView);
    setPage(0);
  };

  const setCustomFilter = (setter: (value: string) => void, value: string): void => {
    setter(value);
    setView('custom');
    setPage(0);
  };

  if (listQuery.error instanceof IncidentApiError && listQuery.error.status === 403) {
    return <div className="incident-page incident-page--center"><AccessDeniedState message="Incident command requires an authorized SOC role in the selected tenant scope." /></div>;
  }

  const summary = summaryQuery.data;
  const slaStats = slaStatsQuery.data;
  const breachedCount = slaStats?.breached ?? summary?.breached;
  const slaDetail = slaStats
    ? formatSlaStatsDetail(slaStats)
    : slaStatsQuery.isError
      ? 'sla-stats unavailable · queue filter remains'
      : 'outside response target';
  const metric = (value: number | null | undefined): string => value === null || value === undefined ? '—' : value.toLocaleString();

  return (
    <section className="incident-page" aria-label="Incident command queue">
      <header className="incident-header">
        <div className="incident-header__identity">
          <span className="incident-header__mark"><BellRing size={18} /></span>
          <div><span>COMMAND</span><h1>Incident Command</h1></div>
        </div>
        <div className="incident-header__actions">
          <span className="incident-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> open</span>
          <button type="button" className="incident-icon-button" onClick={() => { void listQuery.refetch(); void summaryQuery.refetch(); void slaStatsQuery.refetch(); }} aria-label="Refresh incident queue" title="Refresh incident queue"><RefreshCw size={15} className={listQuery.isFetching ? 'incident-spin' : undefined} /></button>
          <button type="button" className="incident-primary-button" disabled={!canCreate} onClick={() => navigate('/alerts')} title={canCreate ? 'Select alerts to create an incident' : 'Requires SOC Manager or Administrator'}>Create from alerts</button>
        </div>
      </header>

      {fixtureMode && <div className="incident-fixture"><strong>Design fixture:</strong> fictional incident records are enabled for visual review.<span>Production never receives these records.</span></div>}

      <div className="incident-summary" aria-label="Authorized incident summary">
        <div><span><List size={13} /> Active incidents</span><strong>{metric(summary?.active)}</strong><small>open and in review</small></div>
        <div data-tone="danger"><span><ShieldAlert size={13} /> P1 critical</span><strong>{metric(summary?.critical)}</strong><small>immediate command attention</small></div>
        <div data-tone="warning" aria-label="Incident SLA summary"><span><Clock3 size={13} /> SLA breached</span><strong>{metric(breachedCount)}</strong><small title={slaDetail}>{slaDetail}</small></div>
        <div><span><CircleAlert size={13} /> Unassigned</span><strong>{metric(summary?.unassigned)}</strong><small>ownership required</small></div>
        <div data-tone="positive"><span><UserRound size={13} /> Assigned to me</span><strong>{metric(summary?.assignedToMe)}</strong><small>{user?.login ?? 'current analyst'}</small></div>
        <div data-tone={slaStats && slaStats.breached === 0 ? 'positive' : undefined}><span><CheckCircle2 size={13} /> SLA compliant</span><strong>{metric(slaStats?.compliant)}</strong><small>{slaStats ? `${metric(slaStats.total)} tracked` : formatSnapshot(summary?.snapshotAt)}</small></div>
      </div>

      <nav className="incident-views" aria-label="Incident queue views">
        {([
          ['active', 'Needs attention', summary?.active],
          ['mine', 'My incidents', summary?.assignedToMe],
          ['critical', 'P1 critical', summary?.critical],
          ['breached', 'SLA breached', breachedCount],
          ['unassigned', 'Unassigned', summary?.unassigned],
          ['all', 'All incidents', undefined],
        ] as Array<[QueueView, string, number | null | undefined]>).map(([id, label, count]) => (
          <button key={id} type="button" data-active={view === id || undefined} onClick={() => applyView(id)}>{label}{count !== undefined && count !== null && <span>{count}</span>}</button>
        ))}
      </nav>

      <div className="incident-toolbar" aria-label="Incident filters">
        <label className="incident-search"><Search size={14} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search incident name…" aria-label="Search incident name" /><kbd>/</kbd></label>
        <Filter size={14} className="incident-filter-icon" />
        <HaCompactSelect ariaLabel="Incident status" value={status} options={STATUS_OPTIONS} onChange={(value) => setCustomFilter(setStatus, value)} />
        <HaCompactSelect ariaLabel="Incident priority" value={priority} options={PRIORITY_OPTIONS} onChange={(value) => setCustomFilter(setPriority, value)} />
        <HaCompactSelect ariaLabel="Incident severity" value={severity} options={SEVERITY_OPTIONS} onChange={(value) => setCustomFilter(setSeverity, value)} />
        <HaCompactSelect ariaLabel="Incident creation window" value={timeRange} options={TIME_OPTIONS} onChange={(value) => { setTimeRange(value); setPage(0); }} />
        <span className="incident-toolbar__spacer" />
        <span className="incident-snapshot">Snapshot {formatSnapshot(summary?.snapshotAt)}</span>
      </div>

      {summary?.partial && <div className="incident-partial" role="status"><CircleAlert size={13} /> Some summary counters require the updated incident criteria backend. The queue data and supported filters remain available.</div>}

      <div className="incident-results-header">
        <div><strong>Incidents</strong><span>{firstRecord.toLocaleString()}–{lastRecord.toLocaleString()} of {total.toLocaleString()} matching</span></div>
        <div className="incident-density" aria-label="Row density"><span>Rows</span>{(['compact', 'standard', 'comfortable'] as RowDensity[]).map((value) => <button key={value} type="button" aria-label={`${value} rows`} title={`${value} rows`} aria-pressed={density === value} onClick={() => setDensity(value)}>{value === 'compact' ? <PanelTop size={14} /> : value === 'standard' ? <AlignJustify size={14} /> : <List size={14} />}</button>)}</div>
      </div>

      <main className="incident-grid-wrap">
        {listQuery.isError && !listQuery.data ? (
          <ErrorState title="Incident queue unavailable" message="The authorized incident projection could not be loaded." error={listQuery.error as Error} onRetry={() => { void listQuery.refetch(); }} />
        ) : items.length === 0 && !listQuery.isLoading ? (
          <EmptyState icon={<List size={42} />} title="No incidents match this view" description="Adjust the saved view, filters, or creation window. No production records are synthesized." />
        ) : (
          <SiemDataGrid
            ref={gridRef}
            className="incident-grid"
            columnDefs={INCIDENT_COLUMN_DEFS}
            rowData={items}
            rowHeight={ROW_HEIGHTS[density]}
            loading={listQuery.isLoading}
            onRowClicked={(event: RowClickedEvent) => selectIncident(event.data as IncidentListItem)}
            onRowDoubleClicked={(event: RowDoubleClickedEvent) => openIncident(event.data as IncidentListItem)}
            rowSelection="single"
            suppressRowClickSelection={false}
            getRowId={(params) => String((params.data as IncidentListItem).id)}
            ariaLabel="Incident command results"
            defaultColDef={{ filter: false }}
          />
        )}
      </main>

      <footer className="incident-pagination">
        <span>{total.toLocaleString()} matching incidents</span>
        <span>Page {page + 1} / {pageCount} · {firstRecord}–{lastRecord}</span>
        <div><button type="button" disabled={page === 0 || listQuery.isFetching} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={13} /> Previous</button><button type="button" disabled={page + 1 >= pageCount || listQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={13} /></button></div>
      </footer>

      <div className="incident-status-dock"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={summary?.snapshotAt ? new Date(summary.snapshotAt) : undefined} /></div>

      {selectedIncident && (
        <HaDrawer isOpen onClose={() => setSelectedIncident(null)} title={selectedIncident.incidentName} subtitle={`Incident ${selectedIncident.id} · authorized scope`} width={480}>
          <IncidentPreview incident={selectedIncident} onOpen={() => openIncident(selectedIncident)} />
        </HaDrawer>
      )}
    </section>
  );
}
