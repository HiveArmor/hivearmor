import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';


import { EntityContextDrawer } from './components/EntityContextDrawer';
import { EntityInventoryTable } from './components/EntityInventoryTable';
import { EntitySummaryBadges } from './components/EntitySummaryBar';
import { useEntityStream } from './hooks/useEntityStream';
import { getEntitySummary, listEntities } from './services/entity.service';
import type {
  EntCriticality,
  EntEntityType,
  EntRiskLevel,
  EntSortOption,
  EntityListFilters,
  EntityQueueSummary,
  EntitySummaryItem,
} from './types/entity.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { StatusDock } from '@/components/status-dock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';

import './EntityInventoryPage.css';

const PAGE_LIMIT = 100;
const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

type TypeFilter = EntEntityType | '';
type RiskFilter = EntRiskLevel | '';
type CriticalityFilter = EntCriticality | '';

export function EntityInventoryPage(): JSX.Element {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('');
  const [criticalityFilter, setCriticalityFilter] = useState<CriticalityFilter>('');
  const [sort, setSort] = useState<EntSortOption>('risk_desc');
  const [searchText, setSearchText] = useState('');
  const [alertsActive, setAlertsActive] = useState(false);
  const [trendRising, setTrendRising] = useState(false);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedEntity, setSelectedEntity] = useState<EntitySummaryItem | null>(null);
  const [appliedStreamEventId, setAppliedStreamEventId] = useState<string | null>(null);
  const debouncedQ = useDebounce(searchText, 300);
  const entityStream = useEntityStream();
  const epsStream = useEpsStream();

  const resetPagination = useCallback(() => {
    setCursorStack([null]);
    setPageIndex(0);
  }, []);

  const effectiveFilters = useMemo<EntityListFilters>(() => ({
    types: typeFilter ? [typeFilter] : undefined,
    riskLevels: riskFilter ? [riskFilter] : undefined,
    criticality: criticalityFilter ? [criticalityFilter] : undefined,
    sort,
    q: debouncedQ || undefined,
    alertsActive: alertsActive || undefined,
    trendRising: trendRising || undefined,
    cursor: cursorStack[pageIndex] ?? undefined,
    limit: PAGE_LIMIT,
  }), [alertsActive, criticalityFilter, cursorStack, debouncedQ, pageIndex, riskFilter, sort, trendRising, typeFilter]);

  const summaryFilters = useMemo<EntityListFilters>(() => ({
    types: typeFilter ? [typeFilter] : undefined,
    riskLevels: riskFilter ? [riskFilter] : undefined,
    criticality: criticalityFilter ? [criticalityFilter] : undefined,
    q: debouncedQ || undefined,
    alertsActive: alertsActive || undefined,
    trendRising: trendRising || undefined,
  }), [alertsActive, criticalityFilter, debouncedQ, riskFilter, trendRising, typeFilter]);

  const inventoryQuery = useQuery({
    queryKey: ['ent-inventory', effectiveFilters],
    queryFn: ({ signal }) => listEntities(effectiveFilters, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const summaryQuery = useQuery({
    queryKey: ['ent-summary', summaryFilters],
    queryFn: ({ signal }) => getEntitySummary(summaryFilters, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(() => {
    resetPagination();
    setAppliedStreamEventId(entityStream.lastEvent?.id ?? null);
    void inventoryQuery.refetch();
    void summaryQuery.refetch();
  }, [entityStream.lastEvent?.id, inventoryQuery, resetPagination, summaryQuery]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && selectedEntity) setSelectedEntity(null);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [selectedEntity]);

  const handleNextPage = useCallback(() => {
    const nextCursor = inventoryQuery.data?.cursor;
    if (!nextCursor) return;
    setCursorStack((previous) => [...previous.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((previous) => previous + 1);
    setSelectedEntity(null);
  }, [inventoryQuery.data?.cursor, pageIndex]);

  const handlePrevPage = useCallback(() => {
    if (pageIndex === 0) return;
    setPageIndex((previous) => previous - 1);
    setSelectedEntity(null);
  }, [pageIndex]);

  const clearFilters = useCallback(() => {
    setTypeFilter('');
    setRiskFilter('');
    setCriticalityFilter('');
    setSearchText('');
    setAlertsActive(false);
    setTrendRising(false);
    resetPagination();
  }, [resetPagination]);

  const entities = inventoryQuery.data?.items ?? [];
  const total = inventoryQuery.data?.total ?? 0;
  const summary: EntityQueueSummary | null = summaryQuery.data?.summary ?? null;
  const facets = summaryQuery.data?.facets ?? null;
  const hasNext = Boolean(inventoryQuery.data?.cursor);
  const hasActiveFilters = Boolean(typeFilter || riskFilter || criticalityFilter || searchText || alertsActive || trendRising);
  const hasNewerData = Boolean(entityStream.lastEvent && entityStream.lastEvent.id !== appliedStreamEventId);
  const firstResult = entities.length ? pageIndex * PAGE_LIMIT + 1 : 0;
  const lastResult = entities.length ? pageIndex * PAGE_LIMIT + entities.length : 0;

  const typeOptions = useMemo(() => [
    { value: '', label: 'All entity types' },
    { value: 'host', label: `Host${facets ? ` (${facets.byType.host ?? 0})` : ''}` },
    { value: 'user', label: `User${facets ? ` (${facets.byType.user ?? 0})` : ''}` },
    { value: 'ip', label: `IP address${facets ? ` (${facets.byType.ip ?? 0})` : ''}` },
    { value: 'domain', label: `Domain${facets ? ` (${facets.byType.domain ?? 0})` : ''}` },
  ], [facets]);

  const riskOptions = useMemo(() => [
    { value: '', label: 'All risk levels' },
    { value: 'critical', label: `Critical${facets ? ` (${facets.byRiskLevel.critical ?? 0})` : ''}` },
    { value: 'high', label: `High${facets ? ` (${facets.byRiskLevel.high ?? 0})` : ''}` },
    { value: 'medium', label: `Medium${facets ? ` (${facets.byRiskLevel.medium ?? 0})` : ''}` },
    { value: 'low', label: `Low${facets ? ` (${facets.byRiskLevel.low ?? 0})` : ''}` },
  ], [facets]);

  const criticalityOptions = useMemo(() => [
    { value: '', label: 'All criticality' },
    { value: 'critical', label: `Mission critical${facets ? ` (${facets.byCriticality.critical ?? 0})` : ''}` },
    { value: 'high', label: `High${facets ? ` (${facets.byCriticality.high ?? 0})` : ''}` },
    { value: 'medium', label: `Medium${facets ? ` (${facets.byCriticality.medium ?? 0})` : ''}` },
    { value: 'low', label: `Low${facets ? ` (${facets.byCriticality.low ?? 0})` : ''}` },
    { value: 'unclassified', label: `Unclassified${facets ? ` (${facets.byCriticality.unclassified ?? 0})` : ''}` },
  ], [facets]);

  return (
    <section className="entities-page">
      <header className="entities-page__header">
        <div className="entities-page__title-icon"><Database size={20} aria-hidden="true" /></div>
        <div className="entities-page__title">
          <span>Investigation</span>
          <h1>Entity Intelligence</h1>
        </div>
        <div className="entities-page__header-context">
          <span>Risk, identity, and activity inventory</span>
          <kbd>/</kbd><span>search</span><kbd>Enter</kbd><span>open</span>
        </div>
        <button type="button" className="entities-page__refresh" onClick={refresh} aria-label="Refresh entity inventory">
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </header>

      {visualFixtureMode && (
        <div className="entities-page__fixture">
          <strong>Design fixture:</strong> fictional entity-risk records are enabled for visual review.
          <span>Production never receives these records.</span>
        </div>
      )}

      <section className="entities-page__summary" aria-label="Entity inventory summary">
        {summary ? (
          <EntitySummaryBadges
            summary={summary}
            onBadgeClick={(badge) => {
              if (badge === 'total') clearFilters();
              if (badge === 'highRisk') setRiskFilter('critical');
              if (badge === 'rising') setTrendRising((current) => !current);
              if (badge === 'activeAlerts') setAlertsActive((current) => !current);
              resetPagination();
            }}
            activeFilters={{ riskFilter, trendRising, alertsActive }}
          />
        ) : (
          Array.from({ length: 5 }, (_, index) => <span className="entities-page__metric-skeleton" key={index} />)
        )}
        {summaryQuery.isError && <span className="entities-page__partial" role="status">Summary temporarily unavailable</span>}
      </section>

      <div className="entities-page__toolbar">
        <div className="entities-page__search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={searchText}
            onChange={(event) => { setSearchText(event.target.value); resetPagination(); }}
            placeholder="Search entity, IP, domain, user, or tag…"
            aria-label="Search entity inventory"
          />
          {searchText && <button type="button" onClick={() => { setSearchText(''); resetPagination(); }} aria-label="Clear search"><X size={12} /></button>}
          <kbd>/</kbd>
        </div>
        <HaCompactSelect ariaLabel="Filter by entity type" label="Type" value={typeFilter} options={typeOptions} onChange={(value) => { setTypeFilter(value as TypeFilter); resetPagination(); }} />
        <HaCompactSelect ariaLabel="Filter by risk level" label="Risk" value={riskFilter} options={riskOptions} onChange={(value) => { setRiskFilter(value as RiskFilter); resetPagination(); }} />
        <HaCompactSelect ariaLabel="Filter by criticality" label="Criticality" value={criticalityFilter} options={criticalityOptions} onChange={(value) => { setCriticalityFilter(value as CriticalityFilter); resetPagination(); }} />
        <button type="button" className="entities-page__toggle" aria-pressed={trendRising} onClick={() => { setTrendRising((current) => !current); resetPagination(); }}><TrendingUp size={12} /> Rising</button>
        <button type="button" className="entities-page__toggle" aria-pressed={alertsActive} onClick={() => { setAlertsActive((current) => !current); resetPagination(); }}><Activity size={12} /> Active alerts</button>
        {hasActiveFilters && <button type="button" className="entities-page__clear" onClick={clearFilters}>Clear</button>}
        <div className="entities-page__spacer" />
        <HaCompactSelect ariaLabel="Sort entity inventory" label="Sort" value={sort} options={[
          { value: 'risk_desc', label: 'Highest risk' },
          { value: 'risk_asc', label: 'Lowest risk' },
          { value: 'last_seen_desc', label: 'Recently observed' },
          { value: 'alert_count_desc', label: 'Most active alerts' },
          { value: 'name_asc', label: 'Name A–Z' },
        ]} onChange={(value) => { setSort(value as EntSortOption); resetPagination(); }} />
      </div>

      {hasNewerData && (
        <button type="button" className="entities-page__newer" onClick={refresh}>
          <span /> New entity intelligence is available. Refresh this stable view.
        </button>
      )}

      <div className="entities-page__workspace" data-drawer-open={Boolean(selectedEntity) || undefined}>
        <main className="entities-page__results">
          <header className="entities-page__results-header">
            <div><strong>Entities</strong><span>{inventoryQuery.isFetching && inventoryQuery.data ? 'Refreshing cached page…' : `${total.toLocaleString()} matching`}</span></div>
            <span>Cursor page · bounded 100-row projection</span>
          </header>

          <div className="entities-page__grid">
            {inventoryQuery.isLoading && (
              <div className="entities-page__grid-skeleton" role="status" aria-label="Loading entity inventory">
                {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
              </div>
            )}
            {inventoryQuery.isError && !inventoryQuery.data && (
              <section className="entities-page__state" role="alert">
                <AlertTriangle size={22} />
                <strong>Entity inventory unavailable</strong>
                <p>{inventoryQuery.error instanceof Error ? inventoryQuery.error.message : 'The authorized entity projection could not be loaded.'}</p>
                <button type="button" onClick={() => void inventoryQuery.refetch()}>Retry</button>
              </section>
            )}
            {inventoryQuery.data && entities.length === 0 && (
              <section className="entities-page__state">
                <Database size={22} />
                <strong>No entities match this view</strong>
                <p>Adjust the scoped filters. Empty results never expand tenant scope.</p>
                {hasActiveFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}
              </section>
            )}
            {inventoryQuery.data && entities.length > 0 && (
              <EntityInventoryTable
                entities={entities}
                loading={inventoryQuery.isFetching}
                onEntityClick={setSelectedEntity}
                onEntityOpen={(entity) => navigate(`/entities/${encodeURIComponent(entity.id)}/dossier`)}
              />
            )}
          </div>

          <footer className="entities-page__pagination" aria-label="Entity inventory pagination">
            <span>{total.toLocaleString()} matching entities</span>
            <strong>Page {pageIndex + 1} · {firstResult.toLocaleString()}–{lastResult.toLocaleString()}</strong>
            <div>
              <button type="button" onClick={handlePrevPage} disabled={pageIndex === 0}><ChevronLeft size={13} /> Previous</button>
              <button type="button" onClick={handleNextPage} disabled={!hasNext}>Next <ChevronRight size={13} /></button>
            </div>
          </footer>
        </main>

        {selectedEntity && <EntityContextDrawer entity={selectedEntity} onClose={() => setSelectedEntity(null)} />}
      </div>

      <div className="entities-page__status"><StatusDock sseConnected={epsStream.connected} eps={epsStream.eps} mode="live" lastUpdated={inventoryQuery.dataUpdatedAt ? new Date(inventoryQuery.dataUpdatedAt) : undefined} /></div>
    </section>
  );
}
