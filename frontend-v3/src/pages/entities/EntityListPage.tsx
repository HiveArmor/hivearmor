import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent, ValueFormatterParams } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  ChevronLeft, ChevronRight, Columns3, Database, ExternalLink, Filter, Gauge,
  History, Radio, RefreshCw, Search, ShieldAlert,
  Sparkles, TrendingUp, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { EntityTypeIcon, entityTypeLabel } from '@/components/entity-type-icon';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS, type RowDensity } from '@/hooks/useRowDensity';
import { ApiError } from '@/lib/apiClient';
import { entityFixtureMode, fetchEntities } from '@/services/entities.service';
import { useAuthStore } from '@/store/auth.store';
import type {
  EntityCriticality, EntityDTO, EntityListFilters, EntityRiskLevel, EntityRiskTrend, EntityType,
} from '@/types/entity.types';
import { ENTITY_TYPES } from '@/types/entity.types';

import './EntityListPage.css';

type SortMode = NonNullable<EntityListFilters['sort']>;
type ActivityWindow = NonNullable<EntityListFilters['activityWindow']>;

const PAGE_LIMIT = 100;
const DEFAULT_COLUMNS = ['name', 'entityType', 'criticality', 'riskScore', 'riskTrend', 'baselineDeviation', 'alertCount', 'incidentCount', 'lastSeen', 'dataSources', 'tenantName'];
const COLUMN_OPTIONS = [
  ['name', 'Entity'], ['entityType', 'Type'], ['criticality', 'Criticality'], ['riskScore', 'Risk'],
  ['riskTrend', 'Trend'], ['baselineDeviation', 'Baseline'], ['alertCount', 'Alerts'],
  ['incidentCount', 'Incidents'], ['lastSeen', 'Last activity'], ['dataSources', 'Sources'], ['tenantName', 'Tenant'],
] as const;

const TYPE_OPTIONS = [
  { value: '', label: 'All entity types' },
  ...ENTITY_TYPES.map((type) => ({ value: type, label: type === 'ip' ? 'IP address' : `${type.charAt(0).toUpperCase()}${type.slice(1)}` })),
];

const RISK_OPTIONS: Array<{ value: EntityRiskLevel | ''; label: string }> = [
  { value: '', label: 'All risk levels' },
  { value: 'critical', label: 'Critical · 80–100' },
  { value: 'high', label: 'High · 60–79' },
  { value: 'medium', label: 'Medium · 40–59' },
  { value: 'low', label: 'Low · 1–39' },
  { value: 'none', label: 'No calculated risk' },
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'risk_desc', label: 'Highest risk' },
  { value: 'activity_desc', label: 'Most recent activity' },
  { value: 'alerts_desc', label: 'Most active alerts' },
  { value: 'name_asc', label: 'Entity name' },
];

const ACTIVITY_OPTIONS: Array<{ value: ActivityWindow; label: string }> = [
  { value: '24h', label: 'Active in 24 hours' },
  { value: '7d', label: 'Active in 7 days' },
  { value: '30d', label: 'Active in 30 days' },
  { value: '90d', label: 'Active in 90 days' },
];

function entityLabel(entity: EntityDTO): string {
  return entity.name ?? entity.hostname ?? entity.ipAddress ?? entity.id;
}

function entityQuery(entity: EntityDTO): string {
  const field = entity.entityType === 'host' ? 'host.name'
    : entity.entityType === 'user' ? 'user.name'
      : entity.entityType === 'ip' ? 'source.ip'
        : `${entity.entityType}.name`;
  return `${field}:"${entityLabel(entity).replace(/"/g, '\\"')}"`;
}

function relativeTime(value: string): string {
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return 'Unknown';
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RiskCell({ value }: { value?: number }): JSX.Element {
  const score = value ?? 0;
  const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : score > 0 ? 'low' : 'none';
  return <span className="entity-risk" data-level={level}><i aria-hidden="true" /><strong>{score}</strong><small>/100</small></span>;
}

function TrendCell({ data }: { data?: EntityDTO }): JSX.Element {
  const trend: EntityRiskTrend = data?.riskTrend ?? 'stable';
  const delta = (data?.riskScore ?? 0) - (data?.previousRiskScore ?? data?.riskScore ?? 0);
  const Icon = trend === 'rising' || trend === 'new' ? ArrowUpRight : trend === 'falling' ? ArrowDownRight : ArrowRight;
  return <span className="entity-trend" data-trend={trend}><Icon size={13} aria-hidden="true" />{trend === 'new' ? 'New' : delta === 0 ? 'Stable' : `${delta > 0 ? '+' : ''}${delta}`}</span>;
}

function CriticalityCell({ value }: { value?: EntityCriticality }): JSX.Element {
  const label = value === 'mission_critical' ? 'Mission critical' : value === 'high' ? 'High value' : value === 'unknown' ? 'Unknown' : 'Standard';
  return <span className="entity-criticality" data-level={value ?? 'unknown'}>{label}</span>;
}

function TypeCell({ value }: { value?: EntityType }): JSX.Element {
  return <span className="entity-type"><EntityTypeIcon type={value} size={13} />{entityTypeLabel(value)}</span>;
}

function NameCell({ data }: { data?: EntityDTO }): JSX.Element {
  if (!data) return <span>—</span>;
  return <span className="entity-name-cell"><strong>{entityLabel(data)}</strong><small>{data.id}</small></span>;
}

function DensityGlyph({ density }: { density: RowDensity }): JSX.Element {
  return <span className="entity-density-glyph" data-density={density} aria-hidden="true"><i /><i /><i /></span>;
}

export function EntityListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const hasAccess = useAuthStore((state) => state.hasAnyRole(['ROLE_ANALYST', 'ROLE_ADMIN']));
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const epsStream = useEpsStream();
  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [type, setType] = useState<EntityType | ''>('');
  const [risk, setRisk] = useState<EntityRiskLevel | ''>('');
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>('30d');
  const [sort, setSort] = useState<SortMode>('risk_desc');
  const [density, setDensity] = useRowDensity();
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeEntity, setActiveEntity] = useState<EntityDTO | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<EntityDTO[]>([]);

  const cursor = cursorStack[pageIndex] ?? null;
  const filters = useMemo<EntityListFilters>(() => ({
    search: search || undefined,
    type: type || undefined,
    riskLevels: risk ? [risk] : undefined,
    activityWindow,
    tenantScope: selectedTenantId === null ? 'authorized' : String(selectedTenantId),
    sort,
    cursor,
    limit: PAGE_LIMIT,
    page: pageIndex,
    fields: visibleColumns,
  }), [activityWindow, cursor, pageIndex, risk, search, selectedTenantId, sort, type, visibleColumns]);

  const entitiesQuery = useQuery({
    queryKey: ['entity-inventory', filters],
    queryFn: ({ signal }) => fetchEntities(filters, signal),
    enabled: hasAccess,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data?.items]);
  const permissionDenied = entitiesQuery.error instanceof ApiError && entitiesQuery.error.status === 403;
  const staleVisible = entitiesQuery.isFetching && entities.length > 0;
  const hasActiveFilters = Boolean(search || type || risk || activityWindow !== '30d');

  useEffect(() => {
    setCursorStack([null]);
    setPageIndex(0);
    setActiveEntity(null);
    setSelectedEntities([]);
  }, [activityWindow, risk, search, selectedTenantId, sort, type]);

  useEffect(() => {
    const retained = new Set([cursor, pageIndex > 0 ? cursorStack[pageIndex - 1] : null]);
    queryClient.removeQueries({
      queryKey: ['entity-inventory'],
      predicate: (candidate) => {
        const keyFilters = candidate.queryKey[1] as EntityListFilters | undefined;
        return keyFilters?.cursor !== undefined && !retained.has(keyFilters.cursor ?? null);
      },
    });
  }, [cursor, cursorStack, pageIndex, queryClient]);

  useEffect(() => {
    if (!activeEntity) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('button')?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, [activeEntity]);

  const resetFilters = useCallback(() => {
    setSearchText('');
    setType('');
    setRisk('');
    setActivityWindow('30d');
    setSort('risk_desc');
  }, []);

  const goNext = useCallback(() => {
    const nextCursor = entitiesQuery.data?.nextCursor;
    if (!nextCursor || entitiesQuery.isFetching) return;
    setCursorStack((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
    setActiveEntity(null);
    setSelectedEntities([]);
  }, [entitiesQuery.data?.nextCursor, entitiesQuery.isFetching, pageIndex]);

  const goPrevious = useCallback(() => {
    if (pageIndex === 0 || entitiesQuery.isFetching) return;
    setPageIndex((current) => Math.max(0, current - 1));
    setActiveEntity(null);
    setSelectedEntities([]);
  }, [entitiesQuery.isFetching, pageIndex]);

  const handleRowClick = useCallback((event: RowClickedEvent) => {
    setActiveEntity(event.data as EntityDTO);
  }, []);

  const handlePageKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.isContentEditable) return;
    if (!['j', 'k', 'Enter', 'Escape'].includes(event.key)) return;
    if (event.key === 'Escape') {
      setActiveEntity(null);
      return;
    }
    if (event.key === 'Enter' && activeEntity) {
      navigate(`/entities/${encodeURIComponent(activeEntity.id)}`);
      return;
    }
    const currentIndex = activeEntity ? entities.findIndex((item) => item.id === activeEntity.id) : -1;
    const nextIndex = event.key === 'j' ? Math.min(entities.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
    if (entities[nextIndex]) {
      event.preventDefault();
      setActiveEntity(entities[nextIndex]);
      gridRef.current?.api.ensureIndexVisible(nextIndex, 'middle');
    }
  }, [activeEntity, entities, navigate]);

  const handleDrawerKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveEntity(null);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const columnDefs = useMemo<ColDef<EntityDTO>[]>(() => {
    const allColumns: ColDef<EntityDTO>[] = [
    { colId: 'name', headerName: 'Entity', minWidth: 215, flex: 1.35, pinned: 'left', cellRenderer: NameCell, checkboxSelection: true, headerCheckboxSelection: true },
    { colId: 'entityType', field: 'entityType', headerName: 'Type', width: 112, cellRenderer: TypeCell },
    { colId: 'criticality', field: 'criticality', headerName: 'Criticality', width: 126, cellRenderer: CriticalityCell },
    { colId: 'riskScore', field: 'riskScore', headerName: 'Risk', width: 105, sort: sort === 'risk_desc' ? 'desc' : undefined, cellRenderer: RiskCell },
    { colId: 'riskTrend', field: 'riskTrend', headerName: 'Trend', width: 94, cellRenderer: TrendCell },
    { colId: 'baselineDeviation', field: 'baselineDeviation', headerName: 'Baseline', width: 105, valueFormatter: ({ value }: ValueFormatterParams<EntityDTO>) => value ? `${String(value)}× normal` : '—', cellClass: 'entity-grid__number' },
    { colId: 'alertCount', field: 'alertCount', headerName: 'Alerts', width: 82, cellClass: 'entity-grid__number' },
    { colId: 'incidentCount', field: 'incidentCount', headerName: 'Incidents', width: 92, cellClass: 'entity-grid__number' },
    { colId: 'lastSeen', field: 'lastSeen', headerName: 'Last activity', width: 142, valueFormatter: ({ value }: ValueFormatterParams<EntityDTO>) => relativeTime(String(value)), cellClass: 'entity-grid__mono' },
    { colId: 'dataSources', field: 'dataSources', headerName: 'Sources', width: 150, valueFormatter: ({ data }: ValueFormatterParams<EntityDTO>) => data?.dataSources?.length ? `${data.dataSources[0]}${data.dataSources.length > 1 ? ` +${data.dataSources.length - 1}` : ''}` : '—' },
    { colId: 'tenantName', field: 'tenantName', headerName: 'Tenant', width: 165 },
    ];
    return allColumns.filter((column) => visibleColumns.includes(column.colId ?? ''));
  }, [sort, visibleColumns]);

  if (!hasAccess) {
    return <section className="entity-page"><div className="entity-state"><ShieldAlert size={34} /><h1>Entity inventory restricted</h1><p>Your role cannot view entity analytics. Request Entity Read access from an administrator.</p></div></section>;
  }

  return (
    <section className="entity-page" onKeyDown={handlePageKeyboard} tabIndex={-1}>
      <header className="entity-page__identity">
        <div className="entity-page__title">
          <span className="entity-page__icon"><Database size={20} aria-hidden="true" /></span>
          <div><small>INVESTIGATION</small><h1>Entity Intelligence</h1></div>
        </div>
        <div className="entity-page__identity-meta">
          <span><Radio size={13} /> Risk and activity inventory</span>
          <kbd>J</kbd><span>/</span><kbd>K</kbd><span>navigate</span><kbd>Enter</kbd><span>open</span>
        </div>
      </header>

      {entityFixtureMode && <div className="entity-page__fixture"><span><strong>Design fixture:</strong> fictional entity-risk records are enabled for visual review.</span><span>Production never receives these records.</span></div>}

      <div className="entity-command-bar" role="search" aria-label="Entity inventory filters">
        <label className="entity-search"><Search size={15} aria-hidden="true" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search entity, IP, tenant, or tag…" aria-label="Search entities" />{searchText && <button type="button" onClick={() => setSearchText('')} aria-label="Clear entity search"><X size={13} /></button>}</label>
        <HaCompactSelect ariaLabel="Entity type" value={type} onChange={(value) => setType(value as EntityType | '')} options={TYPE_OPTIONS} />
        <HaCompactSelect ariaLabel="Risk level" value={risk} onChange={(value) => setRisk(value as EntityRiskLevel | '')} options={RISK_OPTIONS} />
        <HaCompactSelect ariaLabel="Activity window" value={activityWindow} onChange={setActivityWindow} options={ACTIVITY_OPTIONS} />
        <HaCompactSelect ariaLabel="Sort entities" label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        <button className="entity-icon-button" type="button" onClick={() => void entitiesQuery.refetch()} disabled={entitiesQuery.isFetching} aria-label="Refresh entity inventory" title="Refresh"><RefreshCw size={15} className={entitiesQuery.isFetching ? 'entity-spin' : ''} /></button>
      </div>

      {entitiesQuery.data?.contractState === 'legacy' && <div className="entity-contract-warning" role="status"><AlertTriangle size={14} /><span><strong>Limited backend projection.</strong> Search, risk facets, exact totals, freshness, and cursor paging require the registered entity inventory contract.</span></div>}
      {entitiesQuery.data?.partialFailures.map((failure) => failure.source !== 'entity-inventory' && <div className="entity-contract-warning" role="status" key={failure.source}><AlertTriangle size={14} /><span>{failure.source}: {failure.message}</span></div>)}

      <div className="entity-kpis" aria-label="Entity inventory summary">
        <article><span><Database size={14} /> Known entities</span><strong>{entitiesQuery.data?.summary?.totalApproximate ?? entitiesQuery.data?.totalApproximate ?? '—'}</strong><small>authorized scope</small></article>
        <article data-tone="risk"><span><Gauge size={14} /> High risk</span><strong>{entitiesQuery.data?.summary?.highRiskCount ?? '—'}</strong><small>score 60 or above</small></article>
        <article data-tone="trend"><span><TrendingUp size={14} /> Rising or new</span><strong>{entitiesQuery.data?.summary?.risingRiskCount ?? '—'}</strong><small>since prior calculation</small></article>
        <article><span><ShieldAlert size={14} /> Active alerts</span><strong>{entitiesQuery.data?.summary?.activeAlertCount ?? '—'}</strong><small>linked to entities</small></article>
        <article><span><Activity size={14} /> Recently observed</span><strong>{entitiesQuery.data?.summary?.recentlyObservedCount ?? '—'}</strong><small>within 24 hours</small></article>
      </div>

      <main className="entity-results">
        <div className="entity-results__toolbar">
          <div><strong>Entities</strong><span>{entitiesQuery.data ? `${entitiesQuery.data.totalApproximate.toLocaleString()}${entitiesQuery.data.totalIsExact ? '' : '+'} matching` : 'Loading inventory'}</span>{staleVisible && <em><RefreshCw size={11} /> Refreshing cached view</em>}</div>
          <div className="entity-results__actions">
            {selectedEntities.length > 0 && <span className="entity-selection-count">{selectedEntities.length} selected</span>}
            {hasActiveFilters && <button className="entity-text-button" type="button" onClick={resetFilters}><Filter size={13} /> Clear filters</button>}
            <div className="entity-density-control" role="group" aria-label="Row density"><span>Rows</span><div>{(['compact', 'standard', 'comfortable'] as RowDensity[]).map((item) => <button key={item} type="button" aria-label={`${item} rows`} aria-pressed={density === item} onClick={() => setDensity(item)}><DensityGlyph density={item} /></button>)}</div></div>
            <div className="entity-column-picker"><button className="entity-text-button" type="button" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}><Columns3 size={14} /> Columns</button>{columnsOpen && <div className="entity-column-picker__menu">{COLUMN_OPTIONS.map(([id, label]) => <label key={id}><input type="checkbox" checked={visibleColumns.includes(id)} disabled={id === 'name'} onChange={() => setVisibleColumns((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} /><span>{label}</span></label>)}</div>}</div>
          </div>
        </div>

        <div className="entity-grid-shell" aria-busy={entitiesQuery.isLoading || entitiesQuery.isFetching}>
          {entitiesQuery.isLoading && <div className="entity-grid-loading" aria-label="Loading entities">{Array.from({ length: 12 }, (_, index) => <span key={index} />)}</div>}
          {entitiesQuery.isError && <div className="entity-state"><ShieldAlert size={30} /><h2>{permissionDenied ? 'Entity inventory restricted' : 'Entity inventory unavailable'}</h2><p>{permissionDenied ? 'Your current scope cannot read entity analytics.' : entitiesQuery.error instanceof Error ? entitiesQuery.error.message : 'The entity service did not respond.'}</p>{!permissionDenied && <button className="entity-primary-button" type="button" onClick={() => void entitiesQuery.refetch()}>Try again</button>}</div>}
          {!entitiesQuery.isLoading && !entitiesQuery.isError && entities.length === 0 && <div className="entity-state"><Search size={30} /><h2>No matching entities</h2><p>No entity activity matches this scope and time window. Clear filters or widen the activity window.</p>{hasActiveFilters && <button className="entity-primary-button" type="button" onClick={resetFilters}>Clear filters</button>}</div>}
          {!entitiesQuery.isLoading && !entitiesQuery.isError && entities.length > 0 && <SiemDataGrid ref={gridRef} className="entity-grid" columnDefs={columnDefs} rowData={entities} rowHeight={ROW_HEIGHTS[density]} rowSelection="multiple" suppressRowClickSelection onRowClicked={handleRowClick} onSelectionChanged={(rows) => setSelectedEntities(rows as EntityDTO[])} getRowId={({ data }) => (data as EntityDTO).id} ariaLabel="Entity risk inventory" />}
        </div>

        <footer className="entity-pagination">
          <span>{entitiesQuery.data ? `${entitiesQuery.data.totalApproximate.toLocaleString()}${entitiesQuery.data.totalIsExact ? '' : '+'} matching entities` : 'Entity count unavailable'}</span>
          <strong>Page {pageIndex + 1}<small>{entities.length ? `${pageIndex * PAGE_LIMIT + 1}–${pageIndex * PAGE_LIMIT + entities.length}` : '0 rows'}</small></strong>
          <div><button type="button" onClick={goPrevious} disabled={pageIndex === 0 || entitiesQuery.isFetching}><ChevronLeft size={14} /> Previous</button><button type="button" onClick={goNext} disabled={!entitiesQuery.data?.hasMore || entitiesQuery.isFetching}>Next <ChevronRight size={14} /></button></div>
        </footer>
      </main>

      <div className="entity-status-dock"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="historical" lastUpdated={entitiesQuery.data?.snapshotAt ? new Date(entitiesQuery.data.snapshotAt) : undefined} /><span className="entity-status-dock__context"><History size={12} /> {entitiesQuery.data?.snapshotAt ? `Risk snapshot ${new Date(entitiesQuery.data.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Snapshot time unavailable'}</span></div>

      {activeEntity && <div className="entity-preview-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveEntity(null); }}><aside ref={drawerRef} className="entity-preview" role="dialog" aria-modal="true" aria-labelledby="entity-preview-title" onKeyDown={handleDrawerKeyboard}>
        <header><div><span className="entity-preview__type"><EntityTypeIcon type={activeEntity.entityType} size={13} /> {entityTypeLabel(activeEntity.entityType)}</span><h2 id="entity-preview-title">{entityLabel(activeEntity)}</h2><code>{activeEntity.id}</code></div><button type="button" onClick={() => setActiveEntity(null)} aria-label="Close entity preview"><X size={17} /></button></header>
        <div className="entity-preview__risk"><div><span>Entity risk</span><strong>{activeEntity.riskScore}</strong><small>/100</small></div><RiskCell value={activeEntity.riskScore} /><TrendCell data={activeEntity} /></div>
        <section><h3>Investigation context</h3><dl><div><dt>Asset criticality</dt><dd><CriticalityCell value={activeEntity.criticality} /></dd></div><div><dt>Baseline deviation</dt><dd>{activeEntity.baselineDeviation ? `${activeEntity.baselineDeviation}× normal` : 'Unavailable'}</dd></div><div><dt>Active alerts</dt><dd>{activeEntity.alertCount}</dd></div><div><dt>Linked incidents</dt><dd>{activeEntity.incidentCount ?? 'Unavailable'}</dd></div><div><dt>Last activity</dt><dd>{relativeTime(activeEntity.lastSeen)}</dd></div><div><dt>Tenant</dt><dd>{activeEntity.tenantName ?? 'Authorized scope'}</dd></div></dl></section>
        <section><h3>Coverage and provenance</h3><div className="entity-preview__sources">{activeEntity.dataSources?.map((source) => <span key={source}>{source}</span>) ?? <span>Source details unavailable</span>}</div><p>{activeEntity.sourceCount ?? activeEntity.dataSources?.length ?? 0} normalized sources contribute to this projection. Open the dossier to inspect risk reasons, timelines, and source evidence.</p></section>
        <section><h3>Quick pivots</h3><button className="entity-pivot" type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(entityQuery(activeEntity))}`)}><Search size={14} /><span><strong>Hunt this entity</strong><small>{entityQuery(activeEntity)}</small></span><ExternalLink size={13} /></button><button className="entity-pivot" type="button" onClick={() => navigate(`/entities/${encodeURIComponent(activeEntity.id)}`)}><Sparkles size={14} /><span><strong>Open full entity dossier</strong><small>Risk history, related alerts, activity and relationships</small></span><ChevronRight size={13} /></button></section>
        <footer><button type="button" onClick={() => setActiveEntity(null)}>Close</button><button className="entity-primary-button" type="button" onClick={() => navigate(`/entities/${encodeURIComponent(activeEntity.id)}`)}>Open dossier <ChevronRight size={14} /></button></footer>
      </aside></div>}
    </section>
  );
}
