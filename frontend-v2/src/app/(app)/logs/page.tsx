"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

import { LogQueryBar } from "@/components/logs/log-query-bar";
import { LogTimePicker } from "@/components/logs/log-time-picker";
import { FieldBrowser, type FieldDef } from "@/components/logs/field-browser";
import { LogResultsTable, type LogEntry } from "@/components/logs/log-results-table";
import { LogDetailDrawer, type PivotAction } from "@/components/logs/log-detail-drawer";
import { LogSavedQueries, saveQueryToHistory } from "@/components/logs/log-saved-queries";
import { LogTimelineHistogram } from "@/components/logs/log-timeline-histogram";
import { LogFieldStatsPopover } from "@/components/logs/log-field-stats-popover";
import { LogTabBar } from "@/components/logs/log-tab-bar";
import { useLogTabs } from "@/hooks/use-log-tabs";
import { elasticService, type ElasticFilter, type IndexPattern } from "@/services/elastic.service";
import { toast } from "@/components/ui/toast";

// ── Field defs ────────────────────────────────────────────────────────────────

const DEFAULT_FIELD_DEFS: FieldDef[] = [
  { name: "@timestamp",       type: "date",    hitPct: 100 },
  { name: "message",          type: "text",    hitPct: 98  },
  { name: "severity",         type: "keyword", hitPct: 95  },
  { name: "source.ip",        type: "ip",      hitPct: 87  },
  { name: "destination.ip",   type: "ip",      hitPct: 82  },
  { name: "event.action",     type: "keyword", hitPct: 90  },
  { name: "event.category",   type: "keyword", hitPct: 91  },
  { name: "host.name",        type: "keyword", hitPct: 88  },
  { name: "agent.name",       type: "keyword", hitPct: 85  },
  { name: "user.name",        type: "keyword", hitPct: 72  },
  { name: "process.name",     type: "keyword", hitPct: 65  },
  { name: "network.protocol", type: "keyword", hitPct: 58  },
  { name: "destination.port", type: "number",  hitPct: 61  },
  { name: "rule.name",        type: "keyword", hitPct: 43  },
  { name: "logx.utm.source",  type: "keyword", hitPct: 55  },
];

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({ filter, onRemove }: { filter: ElasticFilter; onRemove: () => void }) {
  const isExclude = filter.operator === "IS_NOT";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-tiny",
      isExclude
        ? "bg-critical/10 text-critical border border-critical/20"
        : "bg-brand-subtle text-brand border border-brand/20"
    )}>
      <span className="font-mono">{filter.field}</span>
      <span className="opacity-60">{isExclude ? "≠" : "="}</span>
      <span className="font-mono truncate max-w-[100px]">{String(filter.value)}</span>
      <button onClick={onRemove} className="ml-0.5 hover:opacity-100 opacity-60">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab state
  const {
    tabs, activeId, activeTab,
    canAddTab, addTab, removeTab, selectTab, renameTab, updateActiveTab,
  } = useLogTabs();

  // Apply pivot params from URL on first mount only
  const pivotInitialized = useRef(false);
  useEffect(() => {
    if (pivotInitialized.current) return;
    const q     = searchParams.get("q");
    const from  = searchParams.get("from");
    const to    = searchParams.get("to");
    const index = searchParams.get("index");
    if (q || from || to || index) {
      pivotInitialized.current = true;
      const patch: Parameters<typeof updateActiveTab>[0] = {};
      if (q) patch.query = q;
      if (from && to) {
        patch.timeRange = {
          type: "absolute",
          from,
          to,
          label: `${from.slice(0, 16)} → ${to.slice(0, 16)}`,
        };
      }
      if (index) patch.indexPattern = index;
      updateActiveTab(patch);
    }
  // Run once on mount — searchParams identity is stable for initial URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-tab fields pulled from active tab
  const query         = activeTab.query;
  const syntaxMode    = activeTab.syntaxMode;
  const timeRange     = activeTab.timeRange;
  const indexPattern  = activeTab.indexPattern;
  const activeFilters = activeTab.activeFilters;
  const selectedFields = activeTab.selectedFields;

  // Global index patterns from API (shared, not per-tab)
  const [indexPatterns, setIndexPatterns] = useState<IndexPattern[]>([]);

  // Results (NOT persisted — per-tab but only in memory)
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LogEntry[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [queryTime, setQueryTime] = useState(0);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [resolvedRange, setResolvedRange] = useState<{ from: string; to: string } | null>(null);

  // UI state (shared across tabs)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<LogEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Field stats popover
  const [statsField, setStatsField] = useState<string | null>(null);
  const statsAnchorRef = useRef<HTMLElement | null>(null);

  // Track previous tab to clear results on switch
  const prevTabIdRef = useRef(activeId);

  const searchStartRef = useRef(0);

  useEffect(() => {
    elasticService.getIndexPatterns().then(setIndexPatterns);
  }, []);

  // Auto-run when switching tabs
  useEffect(() => {
    if (prevTabIdRef.current !== activeId) {
      prevTabIdRef.current = activeId;
      setResults([]);
      setTotalHits(0);
      setQueryTime(0);
      setQueryError(null);
      setResolvedRange(null);
      setSelectedEntry(null);
      setDetailOpen(false);
      handleSearch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // ── Tab update helpers ────────────────────────────────────────────────────

  const setQuery         = useCallback((v: string)               => updateActiveTab({ query: v }), [updateActiveTab]);
  const setSyntaxMode    = useCallback((v: typeof syntaxMode)    => updateActiveTab({ syntaxMode: v }), [updateActiveTab]);
  const setTimeRange     = useCallback((v: typeof timeRange)     => updateActiveTab({ timeRange: v }), [updateActiveTab]);
  const setIndexPattern  = useCallback((v: string)               => updateActiveTab({ indexPattern: v }), [updateActiveTab]);

  const addFilter = useCallback((field: string, value: string, exclude = false) => {
    const exists = activeFilters.some((f) => f.field === field && String(f.value) === value);
    if (exists) return;
    updateActiveTab({ activeFilters: [...activeFilters, { field, operator: exclude ? "IS_NOT" : "IS", value }] });
  }, [activeFilters, updateActiveTab]);

  const removeFilter = useCallback((idx: number) => {
    updateActiveTab({ activeFilters: activeFilters.filter((_, i) => i !== idx) });
  }, [activeFilters, updateActiveTab]);

  const handleColumnToggle = useCallback((field: string) => {
    updateActiveTab({
      selectedFields: selectedFields.includes(field)
        ? selectedFields.filter((f) => f !== field)
        : [...selectedFields, field],
    });
  }, [selectedFields, updateActiveTab]);

  const addFieldColumn = useCallback((field: string) => {
    if (selectedFields.includes(field)) return;
    updateActiveTab({ selectedFields: [...selectedFields, field] });
  }, [selectedFields, updateActiveTab]);

  const removeFieldColumn = useCallback((field: string) => {
    updateActiveTab({ selectedFields: selectedFields.filter((f) => f !== field) });
  }, [selectedFields, updateActiveTab]);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (
    overrideQuery?: string,
    overrideIndex?: string,
    overrideFilters?: ElasticFilter[],
  ) => {
    setLoading(true);
    setQueryError(null);
    searchStartRef.current = Date.now();

    const q  = overrideQuery   ?? query;
    const ip = overrideIndex   ?? indexPattern;
    const af = overrideFilters ?? activeFilters;

    try {
      const filters: ElasticFilter[] = [...af];
      if (q.trim()) {
        filters.push({ field: "_query", operator: "IS", value: q });
      }

      const range = elasticService.resolveRange(timeRange);
      setResolvedRange(range);

      const result = await elasticService.search({
        page: 0,
        size: 500,
        indexPattern: ip,
        filters,
        sort: "@timestamp,desc",
        timeRange: range ?? undefined,
      });

      setResults(result.body as LogEntry[]);
      setTotalHits(result.total);
      setQueryTime(result.took);

      if (q.trim()) {
        saveQueryToHistory({
          query: q,
          indexPattern: ip,
          ranAt: new Date().toISOString(),
          hits: result.total,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      setQueryError(msg);
      toast("error", "Search error", msg);
    } finally {
      setLoading(false);
    }
  }, [query, activeFilters, indexPattern, timeRange]);

  // Auto-run when time range or filters change (same-tab changes only)
  const prevTabForAutoRun = useRef(activeId);
  useEffect(() => {
    // Don't auto-run on tab switch — only when the active tab's own filters/time change
    if (prevTabForAutoRun.current !== activeId) {
      prevTabForAutoRun.current = activeId;
      return;
    }
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, activeFilters]);

  const handleLoadQuery = useCallback((q: string, ip: string) => {
    updateActiveTab({ query: q, indexPattern: ip });
    handleSearch(q, ip);
  }, [handleSearch, updateActiveTab]);

  const handleSelectEntry = useCallback((entry: LogEntry) => {
    setSelectedEntry(entry);
    setDetailOpen(true);
  }, []);

  const handleShowFieldStats = useCallback((field: string, anchorEl: HTMLElement) => {
    statsAnchorRef.current = anchorEl;
    setStatsField(field);
  }, []);

  const handlePivot = useCallback((action: PivotAction) => {
    switch (action.type) {
      case "create-alert": {
        const msg = action.entry["message"] ?? action.entry["event.action"] ?? "this event";
        toast("info", "Create Alert", `Alert creation from "${String(msg).slice(0, 60)}" — navigate to Alerts to configure.`);
        break;
      }
      case "search-related": {
        const hostOrIp = action.entry["host.name"] ?? action.entry["source.ip"];
        if (hostOrIp) addFilter("host.name", String(hostOrIp));
        toast("info", "Searching related", `Filtered by host: ${String(hostOrIp ?? "(none)")}`);
        break;
      }
      case "threat-intel": {
        const ip = action.entry["source.ip"] ?? action.entry["destination.ip"];
        if (ip) {
          window.open(`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(String(ip))}`, "_blank", "noopener");
        } else {
          toast("info", "Threat Intel", "No IP address found in this event.");
        }
        break;
      }
    }
  }, [addFilter]);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - 80px)", margin: "-24px", width: "calc(100% + 48px)" }}
    >
      {/* ── Alert pivot breadcrumb ──────────────────────────────────────────── */}
      {searchParams.get("pivotFrom")?.startsWith("alert:") && (
        <div className="flex items-center gap-2 px-4 py-2 bg-brand/10 border-b border-brand/20 text-small shrink-0">
          <ExternalLink className="w-3.5 h-3.5 text-brand shrink-0" />
          <span className="text-secondary">
            Showing logs related to{" "}
            <button
              onClick={() => router.push(`/incidents/${searchParams.get("pivotFrom")!.replace("alert:", "")}`)}
              className="text-brand underline hover:opacity-80 transition-opacity"
            >
              Alert #{searchParams.get("pivotFrom")!.replace("alert:", "")}
            </button>
          </span>
          <button
            className="ml-auto text-muted hover:text-primary transition-colors"
            onClick={() => router.push("/logs")}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <LogTabBar
        tabs={tabs}
        activeId={activeId}
        canAddTab={canAddTab}
        onSelect={selectTab}
        onAdd={addTab}
        onRemove={removeTab}
        onRename={renameTab}
      />

      {/* ── Compact Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-surface-primary border-b border-surface-border">
        {/* Single toolbar row */}
        <div className="flex items-center gap-1.5 px-3 h-11">
          {/* Left panel toggle */}
          <button
            onClick={() => setLeftOpen(!leftOpen)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
            title={leftOpen ? "Hide field browser" : "Show field browser"}
          >
            {leftOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
          </button>

          <div className="w-px h-4 bg-surface-border shrink-0" />

          <LogTimePicker value={timeRange} onChange={setTimeRange} />

          <div className="w-px h-4 bg-surface-border shrink-0" />

          <LogQueryBar
            value={query}
            onChange={setQuery}
            onRun={() => handleSearch()}
            running={loading}
            error={queryError}
            indexPattern={indexPattern}
            indexPatterns={indexPatterns}
            onIndexChange={setIndexPattern}
            syntaxMode={syntaxMode}
            onSyntaxChange={setSyntaxMode}
            className="flex-1 min-w-0"
          />

          <div className="w-px h-4 bg-surface-border shrink-0" />

          <button
            onClick={() => setRightOpen(!rightOpen)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary hover:bg-surface-tertiary transition-colors"
            title={rightOpen ? "Hide saved queries" : "Show saved queries"}
          >
            {rightOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap px-3 py-1.5 border-t border-surface-border/50 bg-surface-secondary/30">
            <span className="text-tiny text-muted shrink-0">Filters:</span>
            {activeFilters.map((f, i) => (
              <FilterChip key={i} filter={f} onRemove={() => removeFilter(i)} />
            ))}
            <button
              onClick={() => updateActiveTab({ activeFilters: [] })}
              className="text-tiny text-muted hover:text-critical transition-colors ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Timeline Histogram ────────────────────────────────────────────────── */}
      <div className="h-[56px] shrink-0 border-b border-surface-border bg-surface-primary px-4 py-1">
        <LogTimelineHistogram
          indexPattern={indexPattern}
          filters={activeFilters}
          timeRange={resolvedRange}
        />
      </div>

      {/* ── Main three-panel area ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: Field browser */}
        {leftOpen && (
          <div className="w-[240px] shrink-0 overflow-hidden border-r border-surface-border">
            <FieldBrowser
              fields={DEFAULT_FIELD_DEFS}
              selectedFields={selectedFields}
              onAdd={addFieldColumn}
              onRemove={removeFieldColumn}
              onFilter={(f, v, ex) => addFilter(f, v, ex)}
              onShowStats={handleShowFieldStats}
              className="h-full"
            />
          </div>
        )}

        {/* Center: Results table + optional detail drawer */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className={cn("overflow-hidden", detailOpen ? "flex-[55]" : "flex-1")}>
            <LogResultsTable
              entries={results}
              selectedFields={selectedFields}
              totalHits={totalHits}
              queryTime={queryTime}
              loading={loading}
              onFilter={addFilter}
              onSelectEntry={handleSelectEntry}
              onColumnToggle={handleColumnToggle}
              className="h-full"
            />
          </div>

          {detailOpen && selectedEntry && (
            <>
              <div className="h-px bg-surface-border shrink-0" />
              <div className="flex-[45] overflow-hidden">
                <LogDetailDrawer
                  entry={selectedEntry}
                  onClose={() => setDetailOpen(false)}
                  onFilter={addFilter}
                  onPivot={handlePivot}
                />
              </div>
            </>
          )}
        </div>

        {/* Right: Saved queries */}
        {rightOpen && (
          <>
            <div className="w-px bg-surface-border shrink-0" />
            <div className="w-[260px] shrink-0 overflow-hidden">
              <LogSavedQueries
                onLoad={handleLoadQuery}
                currentQuery={query}
                currentIndexPattern={indexPattern}
                className="h-full"
              />
            </div>
          </>
        )}
      </div>

      {/* Field stats popover */}
      {statsField && (
        <LogFieldStatsPopover
          field={statsField}
          indexPattern={indexPattern}
          filters={activeFilters}
          anchorRef={statsAnchorRef as React.RefObject<HTMLElement>}
          onFilter={addFilter}
          onClose={() => setStatsField(null)}
        />
      )}
    </div>
  );
}
