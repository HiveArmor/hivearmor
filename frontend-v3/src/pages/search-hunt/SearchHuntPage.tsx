import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import {
  BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleStop, Clock3, Code2, Columns3, Database, FileClock,
  Keyboard, Library, ListFilter, MoreHorizontal, Play, Save, ShieldAlert, Sparkles,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { fetchHuntVerdict, fetchFieldProvenance } from './ai/huntAiService';
import { EventDetailFlyout } from './components/EventDetailFlyout';
import { FieldBrowser } from './components/FieldBrowser';
import { HuntActionDrawer } from './components/HuntActionDrawer';
import { HuntAiControls, type HuntAutonomy } from './components/HuntAiControls';
import { HuntVerdictLead } from './components/HuntVerdictLead';
import {
  huntIndexScopeLabel,
  IndexScopePicker,
  toHuntIndexPattern,
  type HuntIndexScope,
} from './components/IndexScopePicker';
import { PromotionActionBar, PromotionModal } from './components/PromotionModal';
import { QueryCapabilitiesPanel } from './components/QueryCapabilitiesPanel';
import { SaveSearchModal } from './components/SaveSearchModal';
import { SearchManagerPanel } from './components/SearchManagerPanel';
import { SearchProgressBar } from './components/SearchProgressBar';
import { SearchResultsGrid } from './components/SearchResultsGrid';
import { exportHuntResults } from './forensicExport.service';
import type { ExportFormat, ExportResult } from './forensicExport.types';
import { addToHuntHistory } from './history';
import { useSearchStream } from './hooks/useSearchStream';
import { DEFAULT_HUNT_QUERY, normalizeHuntQuery } from './huntQuerySuggestions';
import { HUNT_FIELD_COLUMN_MAP, huntColumnToSortField, huntColumnsToProjection } from './searchHunt.projection';
import {
  cancelHunt, executeHunt, fetchHuntSchema, fetchQueryCapabilities, searchHuntFixtureMode,
} from './searchHunt.service';
import type {
  HuntActionRequest, HuntSearchRequest, HuntSearchResponse,
} from './searchHunt.types';

import { HaExportMenu } from '@/components/export-menu';
import { HaPageHeader } from '@/components/ha-page-header';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { TimeRangeSelector } from '@/components/time-range-selector/TimeRangeSelector';
import { resolveTimeRange } from '@/components/time-range-selector/timeRangeUtils';
import type { TimeRange } from '@/components/time-range-selector/timeRangeUtils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity } from '@/hooks/useRowDensity';
import { ApiError } from '@/lib/apiClient';
import { ROLE_LABELS, ROLES } from '@/lib/roles';
import { runNlQuery, type HaNlQueryResult } from '@/services/search.service';
import { useAuthStore } from '@/store/auth.store';
import './SearchHuntPage.css';

/** Distinct from Queue (triage), Alerts (inventory), Findings, Incidents (cases). */
export const SEARCH_HUNT_JOB_SENTENCE =
  'Ad-hoc hunt and event search — write a query, inspect hits, then pivot into an investigation or incident when ownership is required.';

const PROMOTE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.ANALYST]}, ${ROLE_LABELS[ROLES.SOC_MANAGER]}, or ${ROLE_LABELS[ROLES.ADMIN]}`;
const SAVE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.USER]}, ${ROLE_LABELS[ROLES.ANALYST]}, ${ROLE_LABELS[ROLES.SOC_MANAGER]}, or ${ROLE_LABELS[ROLES.ADMIN]}`;

const QueryEditor = lazy(() => import('./components/QueryBar').then((module) => ({ default: module.QueryBar })));
const LazyHaChart = lazy(() => import('@/components/ha-chart/HaChart').then((module) => ({ default: module.HaChart })));

const DEFAULT_COLUMNS = ['timestamp', 'severity', 'dataSource', 'action', 'host', 'user', 'sourceIp', 'message', 'alertCount'];
const COLUMN_OPTIONS = [
  ['timestamp', 'Event time'], ['severity', 'Severity'], ['dataSource', 'Source'], ['dataset', 'Dataset'],
  ['category', 'Category'], ['action', 'Action'], ['host', 'Host'], ['user', 'User'],
  ['sourceIp', 'Source IP'], ['destinationIp', 'Destination IP'], ['tenantName', 'Tenant'],
  ['message', 'Event summary'], ['alertCount', 'Alerts'],
] as const;
const DENSITY_OPTIONS: Array<{ value: 'compact' | 'standard' | 'comfortable'; label: string }> = [
  { value: 'compact', label: 'Compact rows' },
  { value: 'standard', label: 'Standard rows' },
  { value: 'comfortable', label: 'Comfortable rows' },
];
const QUERY_LANGUAGES = [
  { id: 'kql', label: 'KQL', detail: 'Keyword, field, range, wildcard, and Boolean filters', available: true },
  { id: 'lucene', label: 'Lucene', detail: 'Backend parser capability required', available: false },
  { id: 'esql', label: 'ES|QL', detail: 'Tabular aggregation contract required', available: false },
  { id: 'opensearch_dsl', label: 'OpenSearch DSL', detail: 'Restricted server-side validation required', available: false },
] as const;
// Live languages gate the control shape: with a single available language the control row renders a
// static chip labelled with that language instead of a picker. Re-introduce a picker dropdown (see git
// history for the removed .hunt-language-picker markup) when a second parser advertises available:true.
const AVAILABLE_QUERY_LANGUAGES = QUERY_LANGUAGES.filter((language) => language.available);
const SINGLE_QUERY_LANGUAGE_LABEL = AVAILABLE_QUERY_LANGUAGES[0]?.label ?? 'KQL';
// Escapes a string for safe literal use inside a RegExp (used when stripping a toggled filter fragment).
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function makeRequest(
  query: string,
  timeRange: TimeRange,
  tenantScope: string,
  fields: string[],
  indexPattern?: string,
  sort: Array<{ field: string; direction: 'asc' | 'desc' }> = [{ field: '@timestamp', direction: 'desc' }, { field: '_id', direction: 'asc' }],
): HuntSearchRequest {
  const resolved = resolveTimeRange(timeRange);
  const projectionFields = huntColumnsToProjection(fields);
  return {
    query: query.trim(), language: 'kql', timeRange: { from: resolved.from, to: resolved.to },
    tenantScope, indexPattern, fields: projectionFields, cursor: null, limit: 100,
    sort,
    includeHistogram: true,
  };
}

function chartToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function SearchHuntPage(): JSX.Element {
  useDocumentTitle('Search & Hunt');
  const queryClient = useQueryClient();
  const [routeSearchParams] = useSearchParams();
  const routedQuery = (routeSearchParams.get('q') ?? routeSearchParams.get('query') ?? '').trim();
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const hasAnyRole = useAuthStore((state) => state.hasAnyRole);
  const canPromote = hasAnyRole([ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.ADMIN, 'ROLE_SOC_ANALYST']);
  const canSaveQuery = hasAnyRole([ROLES.USER, ROLES.ANALYST, ROLES.SOC_MANAGER, ROLES.ADMIN]);
  const [query, setQuery] = useState(() => routedQuery || DEFAULT_HUNT_QUERY);
  const [nlQuestion, setNlQuestion] = useState('');
  const [nlProvenance, setNlProvenance] = useState<HaNlQueryResult | null>(null);
  const [nlError, setNlError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>({ type: 'preset', preset: '24h' });
  const [committed, setCommitted] = useState<HuntSearchRequest>(() =>
    makeRequest(
      normalizeHuntQuery(routedQuery),
      { type: 'preset', preset: '24h' },
      'authorized',
      DEFAULT_COLUMNS,
    ));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [flyoutEventId, setFlyoutEventId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try { const saved = localStorage.getItem('ha_hunt_columns'); return saved ? JSON.parse(saved) : DEFAULT_COLUMNS; } catch { return DEFAULT_COLUMNS; }
  });
  const [density, setDensity] = useRowDensity();
  const [selectedIndex, setSelectedIndex] = useState<HuntIndexScope>('all');
  const [fieldRailOpen, setFieldRailOpen] = useState(false);
  // R3 one-row query/NL: focus is the toggle. Query pane is default-active; the other collapses to a chip.
  const [activePane, setActivePane] = useState<'query' | 'nl'>('query');
  const [queryExpandSignal, setQueryExpandSignal] = useState(0);
  const [managerPanelOpen, setManagerPanelOpen] = useState(false);
  const [managerInitialTab, setManagerInitialTab] = useState<'saved' | 'history'>('saved');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sortState, setSortState] = useState<Array<{ field: string; direction: 'asc' | 'desc' }>>([
    { field: '@timestamp', direction: 'desc' },
    { field: '_id', direction: 'asc' },
  ]);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [firstPageSummary, setFirstPageSummary] = useState<HuntSearchResponse | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [actionMode, setActionMode] = useState<HuntActionRequest['type'] | null>(null);
  const [actionEventIds, setActionEventIds] = useState<string[]>([]);
  const recordedSearchId = useRef<string | null>(null);
  const queryWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const nlInputRef = useRef<HTMLInputElement | null>(null);
  const [queryWorkspaceHeight, setQueryWorkspaceHeight] = useState(116);
  const epsStream = useEpsStream();
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionAction, setPromotionAction] = useState<'create_evidence' | 'create_investigation' | 'escalate_incident' | null>(null);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);

  // Query capabilities: fetch on mount, never refetch (staleTime: Infinity)
  const capabilitiesQuery = useQuery({
    queryKey: ['hunt-capabilities'],
    queryFn: () => fetchQueryCapabilities(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  // Persist columns and density to localStorage
  useEffect(() => { localStorage.setItem('ha_hunt_columns', JSON.stringify(visibleColumns)); }, [visibleColumns]);

  const columnsPickerRef = useRef<HTMLDivElement | null>(null);
  // Close columns picker on outside click
  useEffect(() => {
    if (!columnsOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (columnsPickerRef.current && !columnsPickerRef.current.contains(e.target as Node)) setColumnsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsOpen]);

  const schemaQuery = useQuery({
    queryKey: ['hunt-schema', selectedTenantId],
    queryFn: ({ signal }) => fetchHuntSchema(signal),
    staleTime: 15 * 60_000,
    retry: 1,
  });

  const pageCursor = pageCursors[pageIndex] ?? null;

  const searchQuery = useQuery({
    queryKey: ['hunt-search', committed, pageCursor],
    queryFn: ({ signal }) => {
      if (!committed) return Promise.reject(new Error('Search request is not ready'));
      return executeHunt({ ...committed, cursor: pageCursor, includeHistogram: pageIndex === 0 }, signal);
    },
    enabled: committed.query.length > 0,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  const events = useMemo(() => searchQuery.data?.items ?? [], [searchQuery.data?.items]);
  const summary = searchQuery.data ?? firstPageSummary;
  const histogram = useMemo(() => pageIndex === 0
    ? searchQuery.data?.histogram ?? firstPageSummary?.histogram ?? []
    : firstPageSummary?.histogram ?? [], [firstPageSummary?.histogram, pageIndex, searchQuery.data?.histogram]);
  const hasLiveHistogram = histogram.length > 0;
  const permissionDenied = searchQuery.error instanceof ApiError && searchQuery.error.status === 403;
  const schemaPermissionDenied = schemaQuery.error instanceof ApiError && schemaQuery.error.status === 403;
  const staleVisible = searchQuery.isFetching && events.length > 0;

  const nlMutation = useMutation({
    mutationFn: (question: string) =>
      runNlQuery({
        question,
        indexPattern: toHuntIndexPattern(selectedIndex),
      }),
    onSuccess: (result) => {
      setNlError(null);
      setNlProvenance(result);
      const filters = result.suggestedFilters ?? [];
      if (filters.length > 0) {
        const fragments = filters
          .filter((item) => item.field && item.value)
          .map((item) => {
            const value = String(item.value);
            const escaped = /[\s:()]/.test(value) ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value;
            return `${item.field}:${escaped}`;
          });
        if (fragments.length > 0) {
          setQuery((current) => `${current.trim()}${current.trim() ? ' AND ' : ''}${fragments.join(' AND ')}`);
        }
      }
    },
    onError: (error: unknown) => {
      setNlProvenance(null);
      if (error instanceof ApiError && error.status === 503) {
        setNlError('Natural-language search is unavailable (AI service not configured). KQL hunt still works.');
      } else if (error instanceof ApiError && error.status === 403) {
        setNlError(`NL translate denied — ${SAVE_DENIED}`);
      } else {
        setNlError('NL translate failed. Rephrase the question or continue with KQL.');
      }
    },
  });

  // SSE search progress stream — connects when search is running
  const searchStreamStatus: 'running' | 'completed' | 'cancelled' | 'idle' = searchQuery.isFetching ? 'running' : 'idle';
  const searchStream = useSearchStream(summary?.searchId ?? null, searchStreamStatus);

  useEffect(() => {
    if (pageIndex === 0 && searchQuery.data) setFirstPageSummary(searchQuery.data);
  }, [pageIndex, searchQuery.data]);

  useEffect(() => {
    if (!committed) return;
    const retainedCursors = new Set<string | null>([
      pageCursor,
      pageIndex > 0 ? pageCursors[pageIndex - 1] : null,
    ]);
    queryClient.removeQueries({
      queryKey: ['hunt-search', committed],
      predicate: (candidate) => !retainedCursors.has((candidate.queryKey[2] as string | null | undefined) ?? null),
    });
  }, [committed, pageCursor, pageCursors, pageIndex, queryClient]);

  useEffect(() => {
    if (!summary || recordedSearchId.current === summary.searchId || !committed) return;
    recordedSearchId.current = summary.searchId;
    addToHuntHistory({ query: committed.query, timestamp: new Date().toISOString(), resultCount: summary.totalApproximate });
  }, [committed, summary]);

  useEffect(() => {
    const workspace = queryWorkspaceRef.current;
    if (!workspace || typeof ResizeObserver === 'undefined') return undefined;
    const updateHeight = (): void => setQueryWorkspaceHeight(Math.ceil(workspace.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  const runSearch = useCallback((override?: { query?: string; timeRange?: TimeRange }): void => {
    const displayedQuery = override?.query ?? query;
    const nextQuery = normalizeHuntQuery(displayedQuery);
    const nextTime = override?.timeRange ?? timeRange;
    setQuery(displayedQuery.trim());
    if (override?.timeRange) setTimeRange(nextTime);
    setSelectedIds([]);
    setFlyoutEventId(null);
    setPageCursors([null]);
    setPageIndex(0);
    setFirstPageSummary(null);
    setCommitted(makeRequest(
      nextQuery,
      nextTime,
      selectedTenantId === null ? 'authorized' : String(selectedTenantId),
      visibleColumns,
      toHuntIndexPattern(selectedIndex),
      sortState,
    ));
  }, [query, selectedIndex, selectedTenantId, sortState, timeRange, visibleColumns]);

  const stopSearch = useCallback((): void => {
    void queryClient.cancelQueries({ queryKey: ['hunt-search', committed] });
    if (summary?.searchId) void cancelHunt(summary.searchId);
  }, [committed, queryClient, summary?.searchId]);

  const goToPreviousPage = useCallback((): void => {
    if (pageIndex === 0 || searchQuery.isFetching) return;
    setSelectedIds([]);
    setFlyoutEventId(null);
    setPageIndex((current) => Math.max(0, current - 1));
  }, [pageIndex, searchQuery.isFetching]);

  const goToNextPage = useCallback((): void => {
    const nextCursor = searchQuery.data?.nextCursor;
    if (!nextCursor || searchQuery.isFetching) return;
    setSelectedIds([]);
    setFlyoutEventId(null);
    setPageCursors((current) => [...current.slice(0, pageIndex + 1), nextCursor]);
    setPageIndex((current) => current + 1);
  }, [pageIndex, searchQuery.data?.nextCursor, searchQuery.isFetching]);

  const insertCondition = useCallback((field: string, operator = ':', value = '*'): void => {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const formattedValue = /[\s:()]/.test(value) ? `"${escaped}"` : escaped;
    setQuery((current) => `${current.trim()}${current.trim() ? ' AND ' : ''}${field}${operator}${formattedValue}`);
  }, []);

  // Locked decision: per-field / per-value filter clicks APPEND then AUTO-RUN, debounced, so an
  // analyst can stack several filters in quick succession and the search fires once they pause.
  const filterRunTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (filterRunTimer.current) clearTimeout(filterRunTimer.current); }, []);
  const applyFieldFilter = useCallback((fragment: string): void => {
    if (!fragment) return;
    let nextQuery = '';
    setQuery((current) => {
      nextQuery = `${current.trim()}${current.trim() ? ' AND ' : ''}${fragment}`;
      return nextQuery;
    });
    if (filterRunTimer.current) clearTimeout(filterRunTimer.current);
    filterRunTimer.current = setTimeout(() => {
      runSearch({ query: nextQuery });
    }, 450);
  }, [runSearch]);

  // R5 field-rail filter pills are TOGGLES: activating appends the fragment, deactivating strips that
  // exact fragment (and a bordering ' AND ') back out of the query. Debounced auto-run either way.
  const toggleFieldFilter = useCallback((fragment: string, active: boolean): void => {
    if (!fragment) return;
    let nextQuery = '';
    setQuery((current) => {
      if (active) {
        nextQuery = `${current.trim()}${current.trim() ? ' AND ' : ''}${fragment}`;
      } else {
        // Remove the exact fragment, collapsing a neighbouring ' AND ' so the query stays valid.
        nextQuery = current
          .replace(new RegExp(`\\s*AND\\s*${escapeRegExp(fragment)}`), '')
          .replace(new RegExp(`^\\s*${escapeRegExp(fragment)}\\s*AND\\s*`), '')
          .replace(new RegExp(`^\\s*${escapeRegExp(fragment)}\\s*$`), '')
          .trim();
      }
      return nextQuery;
    });
    if (filterRunTimer.current) clearTimeout(filterRunTimer.current);
    filterRunTimer.current = setTimeout(() => {
      runSearch({ query: nextQuery });
    }, 450);
  }, [runSearch]);

  const toggleColumn = (column: string): void => {
    setVisibleColumns((current) => current.includes(column)
      ? current.length === 1 ? current : current.filter((item) => item !== column)
      : [...current, column]);
  };

  const addFieldColumn = (field: string): void => {
    const column = HUNT_FIELD_COLUMN_MAP[field] ?? field;
    setVisibleColumns((current) => current.includes(column) ? current : [...current, column]);
  };

  const selectedSchemaFields = useMemo(() => Object.entries(HUNT_FIELD_COLUMN_MAP)
    .filter(([, column]) => visibleColumns.includes(column))
    .map(([field]) => field), [visibleColumns]);

  const openAction = useCallback((mode: HuntActionRequest['type'], ids: string[]): void => {
    setActionEventIds(ids);
    setActionMode(mode);
  }, []);

  const handlePivot = useCallback((pivotQuery: string): void => {
    setFlyoutEventId(null);
    runSearch({ query: pivotQuery });
  }, [runSearch]);

  const handleSortChanged = useCallback((columnId: string, direction: 'asc' | 'desc'): void => {
    const field = huntColumnToSortField(columnId);
    const nextSort = [{ field, direction }, { field: '_id', direction: 'asc' as const }];
    setSortState(nextSort);
    setPageCursors([null]);
    setPageIndex(0);
    setFirstPageSummary(null);
    setSelectedIds([]);
    setFlyoutEventId(null);
    setCommitted((current) => ({ ...current, sort: nextSort, cursor: null }));
  }, []);

  const openManager = useCallback((tab: 'saved' | 'history'): void => {
    setManagerInitialTab(tab);
    setManagerPanelOpen(true);
    setOverflowOpen(false);
  }, []);

  const handleManagerLoadQuery = useCallback((q: string): void => {
    setQuery(q);
    setManagerPanelOpen(false);
  }, []);

  const handleManagerExecuteQuery = useCallback((q: string): void => {
    setManagerPanelOpen(false);
    runSearch({ query: q });
  }, [runSearch]);

  const handleFlyoutClose = useCallback((): void => {
    setFlyoutEventId(null);
  }, []);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"], .monaco-editor')) return;
      if ((event.key === 'j' || event.key === 'k') && events.length > 0) {
        event.preventDefault();
        const currentIndex = flyoutEventId ? events.findIndex((item) => item.id === flyoutEventId) : -1;
        const nextIndex = event.key === 'j'
          ? Math.min(events.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
        setFlyoutEventId(events[nextIndex]?.id ?? null);
      }
      if (event.key === 'Escape') {
        setColumnsOpen(false); setOverflowOpen(false); setFlyoutEventId(null); setManagerPanelOpen(false);
      }
    };
    document.addEventListener('keydown', handleShortcuts);
    return () => document.removeEventListener('keydown', handleShortcuts);
  }, [events, flyoutEventId]);

  const histogramOption = useMemo<EChartsOption>(() => {
    const buckets = histogram;
    // Volume-intensity ramp (NOT severity): taller spikes get an escalated colour so bursts pop.
    // Uses action/state tokens — never severity/brand — since this encodes count, not threat level.
    const rampLow = chartToken('--ha-action-primary');    // teal — quiet buckets
    const rampMid = chartToken('--ha-state-info');        // blue — busier
    const rampHigh = chartToken('--ha-state-warning');    // amber — the spikes
    const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
    const barColor = (count: number): string => {
      const r = count / maxCount;              // 0..1 relative to the tallest bar
      if (r >= 0.66) return rampHigh;
      if (r >= 0.33) return rampMid;
      return rampLow;
    };
    return {
      animation: false,
      grid: { left: 42, right: 10, top: 10, bottom: 24 },
      xAxis: { type: 'category', data: buckets.map((bucket) => new Date(bucket.from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), axisLabel: { color: chartToken('--ha-foreground-tertiary'), fontSize: 10 }, axisLine: { lineStyle: { color: chartToken('--ha-border-subtle') } }, axisTick: { show: false } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: chartToken('--ha-foreground-tertiary'), fontSize: 10 }, splitLine: { lineStyle: { color: chartToken('--ha-border-subtle') } } },
      series: [{ type: 'bar', data: buckets.map((bucket) => ({ value: bucket.count, itemStyle: { color: barColor(bucket.count) } })), barMaxWidth: 20, emphasis: { itemStyle: { color: chartToken('--ha-action-primary-hover') } } }],
      tooltip: { trigger: 'axis', backgroundColor: chartToken('--ha-surface-elevated'), borderColor: chartToken('--ha-border-default'), textStyle: { color: chartToken('--ha-foreground-primary'), fontSize: 11 } },
    };
  }, [histogram]);

  const handleHistogramClick = (params: unknown): void => {
    const index = (params as { dataIndex?: number }).dataIndex;
    const bucket = index === undefined ? undefined : histogram[index];
    if (!bucket) return;
    runSearch({ timeRange: { type: 'custom', from: bucket.from, to: bucket.to } });
  };

  const pageSize = committed?.limit ?? 100;
  const firstVisibleRow = events.length > 0 ? pageIndex * pageSize + 1 : 0;
  const lastVisibleRow = pageIndex * pageSize + events.length;

  // B0-4: export the FULL committed hunt query/filters/timeRange (not the visible page).
  const hasResults = events.length > 0;

  // ---- Phase B1: AI-native surface (contract-first, mocked until the agent backend ships) ----
  const [showAiHand, setShowAiHand] = useState(false);
  const [autonomy, setAutonomy] = useState<HuntAutonomy>('suggest');
  const completedSearchId = !searchQuery.isFetching && hasResults ? (summary?.searchId ?? null) : null;

  const verdictQuery = useQuery({
    queryKey: ['hunt-verdict', completedSearchId],
    queryFn: () => fetchHuntVerdict({ searchId: completedSearchId as string }),
    enabled: Boolean(completedSearchId),
    staleTime: 60_000,
    retry: false,
  });
  const fieldProvenanceQuery = useQuery({
    queryKey: ['hunt-field-provenance', completedSearchId],
    queryFn: () => fetchFieldProvenance(completedSearchId as string),
    enabled: Boolean(completedSearchId),
    staleTime: 60_000,
    retry: false,
  });
  // Columns the AI derived (model/enrichment) → the "show AI's hand" lens (move 2).
  const aiDerivedColumns = useMemo(
    () => (fieldProvenanceQuery.data ?? [])
      .filter((p) => p.origin !== 'raw')
      .map((p) => HUNT_FIELD_COLUMN_MAP[p.field] ?? p.field),
    [fieldProvenanceQuery.data],
  );
  const verdict = verdictQuery.data && verdictQuery.data.state === 'ready' ? verdictQuery.data : null;

  // Reasoning-cites-rows (move 3): open the first cited event's detail flyout.
  const handleCiteRows = useCallback((rowRefs: string[]) => {
    if (rowRefs.length > 0) setFlyoutEventId(rowRefs[0]);
  }, []);

  // Promote-to-case from the verdict (move 8, PROPOSE-ONLY): preselect the verdict's
  // evidence rows and open the existing create_investigation propose flow.
  const handlePromoteFromVerdict = useCallback(() => {
    const evidenceRows = verdict?.evidence.map((e) => e.rowRef).filter((r): r is string => Boolean(r)) ?? [];
    if (evidenceRows.length > 0) setSelectedIds(Array.from(new Set(evidenceRows)));
    setPromotionAction('create_investigation');
    setPromotionOpen(true);
  }, [verdict]);

  const handleExport = useCallback(
    (format: ExportFormat, signal: AbortSignal): Promise<ExportResult> =>
      exportHuntResults(
        {
          query: committed.query,
          language: committed.language,
          timeRange: committed.timeRange,
          tenantScope: committed.tenantScope,
          indexPattern: committed.indexPattern,
          columns: visibleColumns,
        },
        format,
        signal,
      ),
    [committed, visibleColumns],
  );

  return (
    <section className="hunt-page" aria-labelledby="hunt-page-title" style={{ '--hunt-sticky-query-height': `${queryWorkspaceHeight}px` } as CSSProperties}>
      <HaPageHeader
        title="Search & Hunt"
        description={<span className="hunt-page__scope">Hunt console · ad-hoc event search</span>}
        actions={
          <span className="hunt-page__shortcut"><Keyboard size={13} />⌘/Ctrl + Enter · J/K navigate</span>
        }
      />

      {!canPromote && (
        <p className="hunt-page__promote-warn" role="note">
          <span className="hunt-page__meta-warn" title={PROMOTE_DENIED}>Promote denied — {PROMOTE_DENIED}</span>
        </p>
      )}

      {searchHuntFixtureMode && <div className="hunt-page__fixture" role="status"><span><strong>Design fixture:</strong> fictional normalized events are enabled for visual review.</span><span>Production never receives these records.</span></div>}

      <div className="hunt-query-workspace" ref={queryWorkspaceRef}>
        <div className="hunt-query-lane" data-active-pane={activePane}>
          <div
            className="hunt-query-lane__pane hunt-query-lane__pane--query"
            data-collapsed={activePane !== 'query' || undefined}
          >
            {/* Monaco stays MOUNTED across collapse (preserves cursor/undo, avoids re-paying the lazy
                load). When collapsed the editor is clipped and a chip button overlays it as the click
                target that re-expands + re-layouts. */}
            <div className="hunt-query-workspace__editor" aria-hidden={activePane !== 'query' || undefined}>
              <Suspense fallback={<div className="hunt-query-editor__loading">Loading query workspace…</div>}>
                <QueryEditor
                  value={query}
                  onChange={setQuery}
                  onExecute={() => runSearch()}
                  fields={schemaQuery.data ?? []}
                  disabled={searchQuery.isFetching && events.length === 0}
                  expandSignal={queryExpandSignal}
                  onFocusChange={(focused) => { if (focused) setActivePane('query'); }}
                />
              </Suspense>
            </div>
            {activePane !== 'query' && (
              <button
                type="button"
                className="hunt-query-lane__chip"
                aria-expanded={false}
                aria-label={query.trim() ? `KQL query editor, collapsed. Current query: ${query.trim()}. Activate to edit.` : 'KQL query editor, collapsed. Activate to edit.'}
                title="KQL query editor"
                onClick={() => { setActivePane('query'); setQueryExpandSignal((n) => n + 1); }}
              >
                <Code2 size={13} aria-hidden="true" />
                <span className="hunt-query-lane__chip-label">KQL</span>
                <span className="hunt-query-lane__chip-preview">{query.trim() || 'Edit query'}</span>
              </button>
            )}
          </div>
          <div
            className="hunt-query-lane__pane hunt-query-lane__pane--nl"
            data-collapsed={activePane !== 'nl' || undefined}
          >
            {/* The NL input is lightweight (no Monaco); conditional render is fine here. */}
            {activePane === 'nl' ? (
              <div className="hunt-nl-strip" aria-label="Natural language assist">
                <Sparkles size={13} aria-hidden="true" />
                <input
                  ref={nlInputRef}
                  type="text"
                  value={nlQuestion}
                  onChange={(event) => setNlQuestion(event.target.value)}
                  placeholder="Ask in plain language — e.g. failed logons from admin accounts in the last hour"
                  aria-label="Natural language hunt question"
                  disabled={nlMutation.isPending}
                  onFocus={() => setActivePane('nl')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && nlQuestion.trim()) {
                      event.preventDefault();
                      nlMutation.mutate(nlQuestion.trim());
                    }
                  }}
                />
                <button
                  type="button"
                  className="hunt-control-button"
                  disabled={!nlQuestion.trim() || nlMutation.isPending}
                  onClick={() => nlMutation.mutate(nlQuestion.trim())}
                >
                  {nlMutation.isPending ? 'Translating…' : 'Translate NL'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="hunt-query-lane__chip hunt-query-lane__chip--nl"
                aria-expanded={false}
                aria-label="Natural language assist, collapsed. Activate to ask in plain language."
                title="Ask in plain language"
                onClick={() => {
                  setActivePane('nl');
                  window.requestAnimationFrame(() => nlInputRef.current?.focus());
                }}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span className="hunt-query-lane__chip-label">Ask</span>
              </button>
            )}
          </div>
        </div>
        {(nlError || nlProvenance) && (
          <div className="hunt-nl-provenance" role="status">
            {nlError && <p className="hunt-nl-provenance__error">{nlError}</p>}
            {nlProvenance?.explanation && (
              <p><strong>NL explanation:</strong> {nlProvenance.explanation}</p>
            )}
            {nlProvenance?.query != null && (
              <details>
                <summary>Generated DSL provenance (not auto-executed — run KQL hunt separately)</summary>
                <pre>{typeof nlProvenance.query === 'string' ? nlProvenance.query : JSON.stringify(nlProvenance.query, null, 2)}</pre>
              </details>
            )}
            {nlProvenance && !nlProvenance.explanation && nlProvenance.query == null && !nlError && (
              <p>NL endpoint returned an empty translation. Continue with KQL.</p>
            )}
          </div>
        )}
        <div className="hunt-query-workspace__controls" aria-label="Search controls">
          <button type="button" className="hunt-control-button hunt-control-button--icon" onClick={() => setFieldRailOpen((open) => !open)} aria-pressed={fieldRailOpen} aria-label="Toggle filters and field values" title="Filters and field values"><ListFilter size={14} /></button>
          <span className="hunt-language-chip" title={`Query language — only ${SINGLE_QUERY_LANGUAGE_LABEL} is available in this deployment`}><Code2 size={13} aria-hidden="true" />{SINGLE_QUERY_LANGUAGE_LABEL}</span>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} disabled={searchQuery.isFetching && events.length === 0} />
          <IndexScopePicker
            value={selectedIndex}
            onChange={(next) => {
              setSelectedIndex(next);
            }}
            disabled={searchQuery.isFetching && events.length === 0}
          />
          <button type="button" className="hunt-control-button" onClick={() => openManager('saved')} aria-expanded={managerPanelOpen} aria-haspopup="dialog" title="Saved hunts and search history"><Library size={13} />Library<ChevronDown size={11} /></button>
          <button type="button" className="hunt-control-button" onClick={() => setSaveOpen(true)} disabled={!query.trim() || !canSaveQuery} title={!canSaveQuery ? SAVE_DENIED : !query.trim() ? 'Enter a reusable query before saving' : 'Save query'}><Save size={13} />Save</button>
          <div className="hunt-overflow">
            <button type="button" className="hunt-control-button hunt-control-button--icon" onClick={() => setOverflowOpen((open) => !open)} aria-expanded={overflowOpen} aria-haspopup="menu" aria-label="More search controls" title="More controls"><MoreHorizontal size={15} /></button>
            {overflowOpen && (
              <div className="hunt-overflow__menu" role="menu" aria-label="More search controls">
                <button type="button" role="menuitem" onClick={() => { setCapabilitiesOpen((open) => !open); setOverflowOpen(false); }}><BookOpen size={14} aria-hidden="true" />Query language reference</button>
                <div className="hunt-overflow__section" role="group" aria-label="AI assistance modes">
                  <HuntAiControls
                    showAiHand={showAiHand}
                    onToggleAiHand={setShowAiHand}
                    autonomy={autonomy}
                    onAutonomyChange={setAutonomy}
                  />
                </div>
              </div>
            )}
          </div>
          <span className="hunt-query-workspace__spacer" />
          {searchQuery.isFetching ? <button type="button" className="hunt-button hunt-button--stop" onClick={stopSearch}><CircleStop size={14} />Cancel</button> : <button type="button" className="hunt-button hunt-button--primary" onClick={() => runSearch()} title={!query.trim() ? 'Load the newest 100 events in the selected scope' : 'Run KQL hunt'}><Play size={14} />Run search</button>}
        </div>
        <div className="hunt-execution-strip" role="status" aria-live="polite">
          <span data-state={searchQuery.isFetching ? 'running' : summary ? 'complete' : 'idle'}><i aria-hidden="true" />{searchQuery.isFetching ? 'Query running' : summary ? 'Query complete' : 'Ready'}</span>
          <span title="Active index scope for the next Run search"><Database size={12} />Index · {huntIndexScopeLabel(selectedIndex)}</span>
          <span><Database size={12} />{summary ? `${summary.totalIsExact ? '' : 'About '}${summary.totalApproximate.toLocaleString()} events` : 'No result snapshot'}</span>
          <span><Clock3 size={12} />{summary ? `${summary.tookMs.toLocaleString()} ms` : 'Duration —'}</span>
          <span><FileClock size={12} />{summary ? `Snapshot ${new Date(summary.snapshotAt).toLocaleTimeString()}` : 'Freshness —'}</span>
          {staleVisible && <strong>Updating · previous results preserved</strong>}
          {summary?.partialFailures.length ? <strong data-tone="warning">Partial results · {summary.partialFailures.length} source unavailable</strong> : null}
        </div>
        {searchQuery.isFetching && summary?.searchId && (
          <SearchProgressBar searchId={summary.searchId} stream={searchStream} onCancelled={stopSearch} />
        )}
        {capabilitiesOpen && capabilitiesQuery.data && (
          <QueryCapabilitiesPanel capabilities={capabilitiesQuery.data} onClose={() => setCapabilitiesOpen(false)} onInsertExample={(exQuery) => { setQuery(exQuery); setCapabilitiesOpen(false); }} />
        )}
      </div>

      <div className="hunt-results-workspace" data-field-rail={fieldRailOpen || undefined}>
        {fieldRailOpen && <FieldBrowser fields={schemaQuery.data ?? []} selectedFields={selectedSchemaFields} searchId={summary?.searchId} onAddField={addFieldColumn} onInsertCondition={insertCondition} onFilterToggle={toggleFieldFilter} loading={schemaQuery.isLoading} unavailable={schemaQuery.isError && !schemaPermissionDenied} />}
        <main className="hunt-results" aria-label="Hunt results workspace">
          {permissionDenied || schemaPermissionDenied ? <div className="hunt-full-state" role="alert"><ShieldAlert size={30} /><h2>Search access is restricted</h2><p>Your account does not have permission to search this tenant scope or view its schema. Choose an authorized tenant or ask an administrator for hunt access.</p></div> : searchQuery.isError && events.length === 0 ? <div className="hunt-full-state" role="alert"><ShieldAlert size={30} /><h2>Search could not be completed</h2><p>The query service did not return a usable snapshot. Widen the time range, choose Index: Alerts if you expected detections, then retry. Log events appear after an endpoint agent is enrolled from Posture → Sensors.</p><button type="button" className="hunt-button" onClick={() => void searchQuery.refetch()}>Retry search</button></div> : null}

          {!permissionDenied && !(searchQuery.isError && events.length === 0) && <>
            {verdict && (
              <HuntVerdictLead
                verdict={verdict}
                onCiteRows={handleCiteRows}
                onPromote={handlePromoteFromVerdict}
              />
            )}
            <section className="hunt-histogram" aria-label="Event distribution over time">
              <header>
                <div>
                  <strong>Event distribution</strong>
                  <span>
                    {hasLiveHistogram
                      ? 'Click a bucket to narrow the active time range'
                      : 'Histogram unavailable until the search response includes time buckets — counts are not invented'}
                  </span>
                </div>
                <span>{hasLiveHistogram ? `${histogram.length} buckets` : 'No buckets'}</span>
              </header>
              <div className="hunt-histogram__chart">
                {hasLiveHistogram ? (
                  <Suspense fallback={<div className="hunt-chart-skeleton" />}>
                    <LazyHaChart option={histogramOption} height="100%" onChartClick={handleHistogramClick} ariaLabel="Event histogram" ariaDescription="Event counts over the current query time range. Activate a bucket to narrow the search." />
                  </Suspense>
                ) : (
                  <div className="hunt-histogram__empty" role="status">
                    No live histogram for this snapshot. Results below reflect the query response only.
                  </div>
                )}
              </div>
            </section>
            <div className="hunt-results-toolbar">
              <div><strong>Events</strong><span>{events.length > 0 ? `${firstVisibleRow.toLocaleString()}–${lastVisibleRow.toLocaleString()} loaded` : 'No rows loaded'}{searchQuery.data?.hasMore ? ' · more available' : ''}</span></div>
              <div className="hunt-results-toolbar__actions">
                <div className="hunt-density-control">
                  <span>Rows</span>
                  <div role="group" aria-label="Result row density">
                    {DENSITY_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => setDensity(option.value)} aria-pressed={density === option.value} title={option.label}><span className="hunt-density-glyph" data-density={option.value} aria-hidden="true"><i /><i /><i /></span><span className="hunt-sr-only">{option.label}</span></button>)}
                  </div>
                </div>
                <div className="hunt-column-picker" ref={columnsPickerRef}><button type="button" className="hunt-control-button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen}><Columns3 size={13} />Columns <ChevronDown size={12} /></button>{columnsOpen && <div className="hunt-column-picker__menu">{COLUMN_OPTIONS.map(([id, label]) => <label key={id}><input type="checkbox" checked={visibleColumns.includes(id)} onChange={() => toggleColumn(id)} /><span>{label}</span>{visibleColumns.includes(id) && <Check size={12} />}</label>)}<button type="button" className="hunt-column-picker__reset" onClick={() => { setVisibleColumns(DEFAULT_COLUMNS); setColumnsOpen(false); }}>Reset to default</button></div>}</div>
                <HaExportMenu surface="hunt-search" disabled={!hasResults} onExport={handleExport} />
              </div>
            </div>
            <div className="hunt-grid-shell">
              {events.length > 0 ? (
                <SearchResultsGrid
                  key={`${summary?.searchId ?? 'pending'}-${pageIndex}`}
                  events={events}
                  loading={searchQuery.isFetching && events.length === 0}
                  visibleColumns={visibleColumns}
                  density={density}
                  onSelectionChanged={setSelectedIds}
                  onActivateEvent={(event) => setFlyoutEventId(event.id)}
                  onSortChanged={handleSortChanged}
                  aiDerivedColumns={aiDerivedColumns}
                  showAiHand={showAiHand}
                />
              ) : searchQuery.isFetching ? <div className="hunt-grid-loading" aria-label="Loading search results"><span /><span /><span /><span /><span /></div> : <div className="hunt-grid-empty"><ListFilter size={26} /><strong>No matching events</strong><span>The query completed. Choose Index: Alerts for detections, widen the 24h window, or enroll an agent from Posture → Sensors so endpoint logs are indexed.</span></div>}
            </div>
            <nav className="hunt-pagination" aria-label="Hunt result pages">
              <div className="hunt-pagination__meta">
                <span>{summary ? `${summary.totalIsExact ? '' : '~'}${summary.totalApproximate.toLocaleString()} events` : 'Count —'}</span>
                <span aria-hidden="true">·</span>
                <strong>Page {pageIndex + 1}</strong>
                <span>{firstVisibleRow.toLocaleString()}–{lastVisibleRow.toLocaleString()}</span>
              </div>
              <div className="hunt-pagination__actions">
                <button type="button" className="hunt-button hunt-pagination__nav" onClick={goToPreviousPage} disabled={pageIndex === 0 || searchQuery.isFetching} aria-label="Previous page"><ChevronLeft size={13} /><span>Prev</span></button>
                <button type="button" className="hunt-button hunt-pagination__nav" onClick={goToNextPage} disabled={!searchQuery.data?.nextCursor || searchQuery.isFetching} aria-label="Next page"><span>Next</span><ChevronRight size={13} /></button>
              </div>
            </nav>
          </>}
        </main>
      </div>

      <StatusDock
        className="hunt-status-dock"
        sseConnected={epsStream.connected}
        eps={epsStream.eps}
        mode={epsStream.connected ? 'live' : 'historical'}
      />

      {selectedIds.length > 0 && (
        <PromotionActionBar
          selectedCount={selectedIds.length}
          canPromote={canPromote}
          onAction={(action) => { setPromotionOpen(true); setPromotionAction(action); }}
        />
      )}

      {promotionOpen && promotionAction && <PromotionModal selectedEventIds={selectedIds} searchId={summary?.searchId ?? ''} initialAction={promotionAction} onSuccess={() => { setSelectedIds([]); setPromotionOpen(false); setPromotionAction(null); }} onClose={() => { setPromotionOpen(false); setPromotionAction(null); }} />}

      <HuntActionDrawer mode={actionMode} eventIds={actionEventIds} searchId={summary?.searchId ?? ''} onClose={() => setActionMode(null)} />
      <SaveSearchModal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        currentQuery={query}
        indexPattern={toHuntIndexPattern(selectedIndex)}
        canSave={canSaveQuery}
        onSave={() => setSaveOpen(false)}
      />
      <SearchManagerPanel
        isOpen={managerPanelOpen}
        initialTab={managerInitialTab}
        onClose={() => setManagerPanelOpen(false)}
        onLoadQuery={handleManagerLoadQuery}
        onExecuteQuery={handleManagerExecuteQuery}
        currentQuery={query}
      />
      <EventDetailFlyout
        eventId={flyoutEventId}
        searchId={summary?.searchId ?? ''}
        onClose={handleFlyoutClose}
        onPivot={handlePivot}
        onFilterFor={applyFieldFilter}
        onFilterOut={applyFieldFilter}
        onAction={openAction}
      />
    </section>
  );
}
