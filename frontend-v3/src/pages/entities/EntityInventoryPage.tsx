/**
 * Entity inventory — find hosts/users/IPs by risk and pivot to dossier.
 * Distinct from /search (ad-hoc hunt), /investigations (evidence sessions), /incidents (owned cases).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { EntityInventoryTable } from './components/EntityInventoryTable';
import { listEntities } from './services/entity.service';
import type {
  EntEntityType,
  EntRiskLevel,
  EntSortOption,
  EntityListFilters,
  EntitySummaryItem,
} from './types/entity.types';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { StatusDock } from '@/components/status-dock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';

import './EntityInventoryPage.css';

/** Bundle-visible job sentence — inventory/risk pivots, not alert triage. */
export const ENTITIES_JOB_SENTENCE =
  'Entity inventory — find hosts, users, and IPs by risk, open a dossier to understand exposure, then pivot into hunt or response.';

const PAGE_LIMIT = 100;
const visualFixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

type TypeFilter = EntEntityType | '';
type RiskFilter = EntRiskLevel | '';

export function EntityInventoryPage(): JSX.Element {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('');
  const [sort, setSort] = useState<EntSortOption>('risk_desc');
  const [searchText, setSearchText] = useState('');
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const debouncedQ = useDebounce(searchText, 300);
  const epsStream = useEpsStream();

  const resetPagination = useCallback(() => {
    setCursorStack([null]);
    setPageIndex(0);
  }, []);

  const effectiveFilters = useMemo<EntityListFilters>(() => ({
    types: typeFilter ? [typeFilter] : undefined,
    riskLevels: riskFilter ? [riskFilter] : undefined,
    sort,
    q: debouncedQ || undefined,
    cursor: cursorStack[pageIndex] ?? undefined,
    limit: PAGE_LIMIT,
  }), [cursorStack, debouncedQ, pageIndex, riskFilter, sort, typeFilter]);

  const inventoryQuery = useQuery({
    queryKey: ['ent-inventory', effectiveFilters],
    queryFn: ({ signal }) => listEntities(effectiveFilters, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: 1,
  });

  const refresh = useCallback(() => {
    resetPagination();
    void inventoryQuery.refetch();
  }, [inventoryQuery, resetPagination]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const openDossier = useCallback((entity: EntitySummaryItem) => {
    navigate(`/entities/${encodeURIComponent(entity.id)}/dossier`);
  }, [navigate]);

  const handleNextPage = useCallback(() => {
    const nextCursor = inventoryQuery.data?.cursor;
    if (!nextCursor) return;
    setCursorStack((previous) => [...previous.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((previous) => previous + 1);
  }, [inventoryQuery.data?.cursor, pageIndex]);

  const handlePrevPage = useCallback(() => {
    if (pageIndex === 0) return;
    setPageIndex((previous) => previous - 1);
  }, [pageIndex]);

  const clearFilters = useCallback(() => {
    setTypeFilter('');
    setRiskFilter('');
    setSearchText('');
    resetPagination();
  }, [resetPagination]);

  const entities = inventoryQuery.data?.items ?? [];
  const total = inventoryQuery.data?.total ?? 0;
  const hasNext = Boolean(inventoryQuery.data?.cursor);
  const hasActiveFilters = Boolean(typeFilter || riskFilter || searchText);
  const firstResult = entities.length ? pageIndex * PAGE_LIMIT + 1 : 0;
  const lastResult = entities.length ? pageIndex * PAGE_LIMIT + entities.length : 0;

  const typeOptions = useMemo(() => [
    { value: '', label: 'All types' },
    { value: 'host', label: 'Host' },
    { value: 'user', label: 'User' },
    { value: 'ip', label: 'IP address' },
    { value: 'domain', label: 'Domain' },
  ], []);

  const riskOptions = useMemo(() => [
    { value: '', label: 'All risk' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ], []);

  return (
    <section className="entities-page" aria-label="Entity inventory">
      {visualFixtureMode && (
        <div className="entities-page__fixture" role="status">
          <strong>Design fixture:</strong> fictional entity-risk records are enabled for visual review.
          <span>Production never receives these records.</span>
        </div>
      )}

      <header className="entities-page__header">
        <div className="entities-page__title-icon"><Database size={20} aria-hidden="true" /></div>
        <div className="entities-page__title">
          <span>Investigation pivots</span>
          <h1>Entities</h1>
          <p className="entities-page__job">{ENTITIES_JOB_SENTENCE}</p>
        </div>
        <div className="entities-page__header-actions">
          <span className="entities-page__shortcuts"><kbd>/</kbd> search <kbd>Enter</kbd> open dossier</span>
          <button type="button" className="entities-page__refresh" onClick={refresh} aria-label="Refresh entity inventory">
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <p className="entities-page__meta">
        <Link to="/dashboard">Mission Control</Link>
        <span aria-hidden="true">·</span>
        <Link to="/search">Search &amp; Hunt</Link>
        <span aria-hidden="true">·</span>
        <Link to="/alerts">Alerts</Link>
        <span aria-hidden="true">·</span>
        <Link to="/investigations">Investigations</Link>
        <span aria-hidden="true">·</span>
        <Link to="/incidents">Incidents</Link>
        <span aria-hidden="true">·</span>
        <Link to="/posture/sensors">Sensors</Link>
        <span aria-hidden="true">·</span>
        <Link to="/ueba/risk">UEBA risk</Link>
      </p>

      <div className="entities-page__toolbar" aria-label="Entity inventory filters">
        <div className="entities-page__search">
          <Search size={14} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={searchText}
            onChange={(event) => { setSearchText(event.target.value); resetPagination(); }}
            placeholder="Search host, user, IP, domain…"
            aria-label="Search entity inventory"
          />
          {searchText && (
            <button type="button" onClick={() => { setSearchText(''); resetPagination(); }} aria-label="Clear search">
              <X size={12} />
            </button>
          )}
          <kbd>/</kbd>
        </div>
        <HaCompactSelect
          ariaLabel="Filter by entity type"
          label="Type"
          value={typeFilter}
          options={typeOptions}
          onChange={(value) => { setTypeFilter(value as TypeFilter); resetPagination(); }}
        />
        <HaCompactSelect
          ariaLabel="Filter by risk level"
          label="Risk"
          value={riskFilter}
          options={riskOptions}
          onChange={(value) => { setRiskFilter(value as RiskFilter); resetPagination(); }}
        />
        {hasActiveFilters && (
          <button type="button" className="entities-page__clear" onClick={clearFilters}>Clear</button>
        )}
        <div className="entities-page__spacer" />
        <HaCompactSelect
          ariaLabel="Sort entity inventory"
          label="Sort"
          value={sort}
          options={[
            { value: 'risk_desc', label: 'Highest risk' },
            { value: 'risk_asc', label: 'Lowest risk' },
            { value: 'last_seen_desc', label: 'Recently observed' },
            { value: 'alert_count_desc', label: 'Most alerts' },
            { value: 'name_asc', label: 'Name A–Z' },
          ]}
          onChange={(value) => { setSort(value as EntSortOption); resetPagination(); }}
        />
      </div>

      <div className="entities-page__workspace">
        <main className="entities-page__results">
          <header className="entities-page__results-header">
            <div>
              <strong>Inventory</strong>
              <span>
                {inventoryQuery.isFetching && inventoryQuery.data
                  ? 'Refreshing…'
                  : `${total.toLocaleString()} matching`}
              </span>
            </div>
            <span>Row opens dossier · confirmed GET /api/ha-entities</span>
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
                <p>
                  {inventoryQuery.error instanceof Error
                    ? inventoryQuery.error.message
                    : 'The authorized entity projection could not be loaded.'}
                </p>
                <button type="button" onClick={() => void inventoryQuery.refetch()}>Retry</button>
              </section>
            )}
            {inventoryQuery.data && entities.length === 0 && (
              <section className="entities-page__state">
                <Database size={22} />
                <strong>No entities match this view</strong>
                <p>Adjust type, risk, or search. Empty results never invent inventory rows.</p>
                {hasActiveFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}
              </section>
            )}
            {inventoryQuery.data && entities.length > 0 && (
              <EntityInventoryTable
                entities={entities}
                loading={inventoryQuery.isFetching}
                onEntityClick={openDossier}
                onEntityOpen={openDossier}
              />
            )}
          </div>

          <footer className="entities-page__pagination" aria-label="Entity inventory pagination">
            <span>{total.toLocaleString()} matching entities</span>
            <strong>Page {pageIndex + 1} · {firstResult.toLocaleString()}–{lastResult.toLocaleString()}</strong>
            <div>
              <button type="button" onClick={handlePrevPage} disabled={pageIndex === 0}>
                <ChevronLeft size={13} /> Previous
              </button>
              <button type="button" onClick={handleNextPage} disabled={!hasNext}>
                Next <ChevronRight size={13} />
              </button>
            </div>
          </footer>
        </main>
      </div>

      <div className="entities-page__status">
        <StatusDock
          sseConnected={epsStream.connected}
          eps={epsStream.eps}
          mode="historical"
          lastUpdated={inventoryQuery.dataUpdatedAt ? new Date(inventoryQuery.dataUpdatedAt) : undefined}
        />
      </div>
    </section>
  );
}
