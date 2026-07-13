"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  LayoutGrid, List, RefreshCw, Search,
  ChevronLeft, ChevronRight, AlertTriangle,
  TrendingUp, Eye, Siren, CheckCircle,
  ArrowUp, ArrowDown, ChevronsUpDown,
  MessageSquare, FolderPlus, Clock, ChevronDown,
} from "lucide-react";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";
import { SeverityPill } from "@/components/ui/severity-pill";
import { MitreBadge } from "@/components/ui/mitre-badge";
import { AlertBoardColumn } from "@/components/alerts/alert-board-column";
import { AlertBulkToolbar } from "@/components/alerts/alert-bulk-toolbar";
import { AlertSoarLauncher } from "@/components/alerts/alert-soar-launcher";
import { AlertDetailPanel } from "@/components/alerts/alert-detail-panel";
import { type TimeRange } from "@/components/alerts/alert-time-picker";
import { AlertColumnPicker, ALERT_COLUMNS, loadColPrefs, saveColPrefs } from "@/components/alerts/alert-column-picker";
import { AlertActiveFilters, type ActiveFilter } from "@/components/alerts/alert-active-filters";
import { AlertNewBanner } from "@/components/alerts/alert-new-banner";
import { useAlertStreamStore } from "@/store/alert-stream";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { alertService } from "@/services/alert.service";
import { UtmAlert, AlertStatus, statusToLabel } from "@/types/alert";
import { toast } from "@/components/ui/toast";

type ViewMode = "board" | "list";

const SEV_ORDER = ["critical", "high", "medium", "low"];

function severityLabel(n: number): string {
  if (n >= 4) return "critical";
  if (n >= 3) return "high";
  if (n >= 2) return "medium";
  return "low";
}

const STATUS_CODE: Record<string, number | undefined> = {
  all:    undefined,
  open:   AlertStatus.OPEN,
  review: AlertStatus.IN_REVIEW,
  closed: AlertStatus.COMPLETED,
};

// default time range: last 7 days
function default7d(): TimeRange {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: "asc" | "desc" }) {
  if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 text-muted opacity-50" />;
  return sortDir === "asc"
    ? <ArrowUp className="w-3 h-3 text-brand" />
    : <ArrowDown className="w-3 h-3 text-brand" />;
}

function InlineStatusDropdown({
  alert,
  onStatusChange,
}: {
  alert: UtmAlert;
  onStatusChange: (a: UtmAlert, s: AlertStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const nextStatuses = [AlertStatus.OPEN, AlertStatus.IN_REVIEW, AlertStatus.COMPLETED].filter(s => s !== alert.status);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "text-tiny px-1.5 py-0.5 rounded cursor-pointer transition-colors",
          alert.status === AlertStatus.OPEN       && "bg-critical/10 text-critical hover:bg-critical/20",
          alert.status === AlertStatus.IN_REVIEW  && "bg-brand-subtle text-brand hover:bg-brand-subtle",
          alert.status === AlertStatus.COMPLETED  && "bg-success/10 text-success hover:bg-success/20",
          alert.status === AlertStatus.AUTOMATIC_REVIEW && "bg-surface-tertiary text-muted",
        )}
      >
        {statusToLabel(alert.status)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-0.5 w-36 card shadow-dropdown py-1 z-50 animate-scale-in">
            {nextStatuses.map((s) => (
              <button
                key={s}
                onClick={() => { onStatusChange(alert, s); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-small text-secondary hover:bg-surface-tertiary transition-colors"
              >
                {statusToLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Generate a deterministic sparkline from a seed value (simulates 7-point trend)
function seedSpark(seed: number, len = 10): number[] {
  return Array.from({ length: len }, (_, i) => {
    const v = Math.abs(Math.sin(seed * 0.37 + i * 1.7) * 80 + 20);
    return Math.round(v);
  });
}

const TIME_PRESETS = [
  { key: "1h",  label: "1h",   ms: 60 * 60 * 1000 },
  { key: "6h",  label: "6h",   ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "24h",  ms: 24 * 60 * 60 * 1000 },
  { key: "7d",  label: "7d",   ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30d",  ms: 30 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All",  ms: 0 },
] as const;

function CompactTimePicker({
  value, onChange,
}: {
  value: string;
  onChange: (range: TimeRange | null, key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = TIME_PRESETS.find((p) => p.key === value) ?? TIME_PRESETS[3];

  const select = (p: typeof TIME_PRESETS[number]) => {
    setOpen(false);
    if (p.key === "all") { onChange(null, "all"); return; }
    const to = new Date();
    const from = new Date(to.getTime() - p.ms);
    onChange({ from: from.toISOString(), to: to.toISOString() }, p.key);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-small transition-colors",
          open
            ? "bg-brand-subtle border-brand/40 text-brand"
            : "bg-surface-secondary border-surface-border text-secondary hover:border-surface-border-strong hover:text-primary"
        )}
      >
        <Clock className="w-3.5 h-3.5" />
        <span className="font-medium">{current.label}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 card shadow-dropdown py-1 w-28 animate-scale-in">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => select(p)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-small transition-colors",
                  value === p.key
                    ? "text-brand bg-brand-subtle"
                    : "text-secondary hover:bg-surface-tertiary"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Resolve a nested field path on an alert (e.g. "target.ip")
function getField(alert: UtmAlert, key: string): string {
  const parts = key.split(".");
  let val: unknown = alert;
  for (const p of parts) {
    if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
    else { val = undefined; break; }
  }
  return val != null ? String(val) : "—";
}

export default function AlertsPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<UtmAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const [refreshing, setRefreshing] = useState(false);

  // ── Filters & sort ────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "review" | "closed">("open");
  const [timeRange, setTimeRange] = useState<TimeRange | null>(default7d());
  const [timeKey, setTimeKey] = useState("7d");
  const [sortField, setSortField] = useState("@timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => loadColPrefs());

  // ── UI state ──────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailAlert, setDetailAlert] = useState<UtmAlert | null>(null);
  const [soarOpen, setSoarOpen] = useState(false);
  const [soarTargetAlert, setSoarTargetAlert] = useState<UtmAlert | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [newBannerDismissed, setNewBannerDismissed] = useState(false);
  const newAlertCount = useAlertStreamStore((s) => s.newAlertCount);
  const resetAlertCount = useAlertStreamStore((s) => s.resetAlertCount);
  const alertStreamStatus = useAlertStreamStore((s) => s.alertStreamStatus);

  // Stream is started globally in AppShell; just read from the store here.

  const handleStatusFilter = useCallback((f: "all" | "open" | "review" | "closed") => {
    setStatusFilter(f);
    setPage(1);
  }, []);

  const handleSort = useCallback((field: string) => {
    setSortField(() => {
      // can't call setSortDir here — do it outside updater
      return field;
    });
    setSortDir((prev) => (sortField === field ? (prev === "asc" ? "desc" : "asc") : "asc"));
    setPage(1);
  }, [sortField]);

  const handleTimeChange = useCallback((range: TimeRange | null, key: string) => {
    setTimeRange(range);
    setTimeKey(key);
    setPage(1);
  }, []);

  const handleColChange = useCallback((v: Record<string, boolean>) => {
    setColumnVisibility(v);
    saveColPrefs(v);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadAlerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await alertService.search({
        page: page - 1,
        size: pageSize,
        sortField,
        sortDir,
        status: STATUS_CODE[statusFilter],
        timeRange: timeRange ?? undefined,
      });
      setAlerts(res.content);
      setTotalItems(res.totalElements);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, pageSize, sortField, sortDir, statusFilter, timeRange]);

  // Initial load
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    loadAlerts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run a full load whenever the filter/sort deps change (after first mount).
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    loadAlerts();
  }, [loadAlerts]);

  // SSE-driven silent reload: debounce rapid bursts from the global stream.
  const debouncedSilentLoad = useDebouncedCallback(
    useCallback(() => loadAlerts(true), [loadAlerts]),
    1_000,
  );
  const prevNewAlertCount = useRef(0);
  useEffect(() => {
    if (newAlertCount > prevNewAlertCount.current) {
      prevNewAlertCount.current = newAlertCount;
      debouncedSilentLoad();
    }
  }, [newAlertCount, debouncedSilentLoad]);

  // Fallback polling — only when SSE is in error/disconnected state.
  useEffect(() => {
    if (alertStreamStatus !== "error") return;
    const id = setInterval(() => loadAlerts(true), 30_000);
    return () => clearInterval(id);
  }, [alertStreamStatus, loadAlerts]);

  // ── Tab counts ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function loadTabCounts() {
      const [allRes, openRes, reviewRes, closedRes] = await Promise.allSettled([
        alertService.search({ page: 0, size: 1, timeRange: timeRange ?? undefined }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.OPEN,      timeRange: timeRange ?? undefined }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.IN_REVIEW, timeRange: timeRange ?? undefined }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.COMPLETED, timeRange: timeRange ?? undefined }),
      ]);
      if (!mounted) return;
      setTabCounts({
        all:    allRes.status    === "fulfilled" ? allRes.value.totalElements    : 0,
        open:   openRes.status   === "fulfilled" ? openRes.value.totalElements   : 0,
        review: reviewRes.status === "fulfilled" ? reviewRes.value.totalElements : 0,
        closed: closedRes.status === "fulfilled" ? closedRes.value.totalElements : 0,
      });
    }
    loadTabCounts();
    return () => { mounted = false; };
  }, [timeRange]);

  // New alert count is now driven by the SSE stream (useAlertStream above).
  // When a new alert arrives, show/un-dismiss the banner automatically.
  useEffect(() => {
    if (newAlertCount > 0) setNewBannerDismissed(false);
  }, [newAlertCount]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const [kpi, setKpi] = useState({ critical: 0, high: 0, review: 0, closed24h: 0 });

  useEffect(() => {
    let mounted = true;
    async function loadKpis() {
      const [critRes, highRes, reviewRes, closedRes] = await Promise.allSettled([
        alertService.search({ page: 0, size: 1, status: AlertStatus.OPEN,      severity: 4 }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.OPEN,      severity: 3 }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.IN_REVIEW             }),
        alertService.search({ page: 0, size: 1, status: AlertStatus.COMPLETED             }),
      ]);
      if (!mounted) return;
      setKpi({
        critical:  critRes.status   === "fulfilled" ? critRes.value.totalElements   : 0,
        high:      highRes.status   === "fulfilled" ? highRes.value.totalElements   : 0,
        review:    reviewRes.status === "fulfilled" ? reviewRes.value.totalElements : 0,
        closed24h: closedRes.status === "fulfilled" ? closedRes.value.totalElements : 0,
      });
    }
    loadKpis();
    const id = setInterval(loadKpis, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // ── Filtering — status server-side; search query client-side ──────────────
  const filtered = useMemo(() => {
    if (!searchQuery) return alerts;
    const q = searchQuery.toLowerCase();
    return alerts.filter((a) => a.name?.toLowerCase().includes(q));
  }, [alerts, searchQuery]);

  // ── Board columns ─────────────────────────────────────────────────────────
  const byseverity = useMemo(() => {
    const map: Record<string, UtmAlert[]> = { critical: [], high: [], medium: [], low: [] };
    filtered.forEach((a) => (map[severityLabel(a.severity)] ??= []).push(a));
    return map;
  }, [filtered]);

  // ── Visible columns for list view ─────────────────────────────────────────
  const visibleColumns = useMemo(
    () => ALERT_COLUMNS.filter((c) => columnVisibility[c.key] ?? c.default),
    [columnVisibility]
  );

  // ── Active filters helpers ────────────────────────────────────────────────
  const removeFilter = useCallback((field: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.field !== field));
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchQuery("");
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      void (next.has(id) ? next.delete(id) : next.add(id));
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(async (alertOrIds: UtmAlert | string[], status: AlertStatus) => {
    const ids = Array.isArray(alertOrIds) ? alertOrIds : [alertOrIds.id];
    try {
      await alertService.updateStatus(ids, status);
      toast("success", `${ids.length} ${ids.length === 1 ? "alert" : "alerts"} → ${statusToLabel(status)}`);
      loadAlerts(true);
      setSelectedIds(new Set());
    } catch {
      toast("error", "Status update failed");
    }
  }, [loadAlerts]);

  const handleBulkStatus = useCallback(async (status: AlertStatus) => {
    setBulkLoading(true);
    await handleStatusChange(Array.from(selectedIds), status);
    setBulkLoading(false);
  }, [selectedIds, handleStatusChange]);

  const handleBulkFalsePositive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setBulkLoading(true);
    try {
      await alertService.updateStatus(ids, AlertStatus.COMPLETED, "", true);
      toast("success", `${ids.length} ${ids.length === 1 ? "alert" : "alerts"} marked as false positive`);
      loadAlerts(true);
      setSelectedIds(new Set());
    } catch {
      toast("error", "Failed to mark false positive");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, loadAlerts]);

  const handleCreateIncident = useCallback(async (ids?: string[]) => {
    const targetIds = ids ?? Array.from(selectedIds);
    setBulkLoading(true);
    try {
      await alertService.convertToIncident(targetIds, `Incident — ${targetIds.length} alerts`);
      toast("success", "Incident created");
      setSelectedIds(new Set());
      loadAlerts(true);
    } catch {
      toast("error", "Failed to create incident");
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, loadAlerts]);

  const handleLaunchSoar = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 1800));
    const targetName = soarTargetAlert?.name ?? `${selectedIds.size} alerts`;
    toast("success", "SOAR playbook launched", `Running against ${targetName}`);
  }, [soarTargetAlert, selectedIds]);

  const openSoar = useCallback((alert?: UtmAlert) => {
    setSoarTargetAlert(alert ?? null);
    setSoarOpen(true);
  }, []);

  const handleNewBannerRefresh = useCallback(() => {
    resetAlertCount();
    setNewBannerDismissed(false);
    loadAlerts();
  }, [loadAlerts, resetAlertCount]);

  const totalPages = Math.ceil(totalItems / pageSize);
  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalItems);

  const TABS = [
    { key: "all",    label: "All"    },
    { key: "open",   label: "Open"   },
    { key: "review", label: "Review" },
    { key: "closed", label: "Closed" },
  ] as const;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* ── New alert banner ────────────────────────────────────────────── */}
      {!newBannerDismissed && newAlertCount > 0 && (
        <AlertNewBanner
          count={newAlertCount}
          onRefresh={handleNewBannerRefresh}
          onDismiss={() => setNewBannerDismissed(true)}
          className="shrink-0"
        />
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-h2 text-primary font-semibold">Threat Management</h1>
          <p className="text-tiny text-muted mt-0.5">
            Risk-centric alert operations
            {refreshing && <span className="ml-2 text-brand animate-pulse">· Refreshing</span>}
          </p>
        </div>
        <button
          onClick={() => loadAlerts(true)}
          disabled={refreshing}
          className="btn btn-sm btn-secondary gap-2"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          <span className="text-tiny">Refresh</span>
        </button>
      </div>

      {/* ── KPI row — with sparklines + context ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <KpiCard
          label="Open Critical"
          value={kpi.critical}
          accentColor="var(--color-critical)"
          icon={<AlertTriangle className="w-4 h-4" />}
          subtitle={kpi.critical === 0 ? "No critical threats" : `${kpi.critical} unresolved`}
          sparkData={seedSpark(kpi.critical + 41)}
          sparkColor="var(--color-critical)"
          invertDelta
          href="/alerts?severity=critical"
          loading={loading}
        />
        <KpiCard
          label="Open High"
          value={kpi.high}
          accentColor="var(--color-high)"
          icon={<TrendingUp className="w-4 h-4" />}
          subtitle={kpi.high > 0 ? `${kpi.high} need triage` : "All triaged"}
          sparkData={seedSpark(kpi.high + 17)}
          sparkColor="var(--color-high)"
          invertDelta
          href="/alerts?severity=high"
          loading={loading}
        />
        <KpiCard
          label="In Review"
          value={kpi.review}
          accentColor="var(--brand-primary)"
          icon={<Eye className="w-4 h-4" />}
          subtitle={kpi.review > 0 ? "Active investigations" : "Queue empty"}
          sparkData={seedSpark(kpi.review + 7)}
          sparkColor="var(--brand-primary)"
          href="/alerts?status=review"
          loading={loading}
        />
        <KpiCard
          label="Closed"
          value={kpi.closed24h}
          accentColor="var(--color-success)"
          icon={<CheckCircle className="w-4 h-4" />}
          subtitle="Total resolved alerts"
          sparkData={seedSpark(kpi.closed24h + 3)}
          sparkColor="var(--color-success)"
          href="/alerts?status=closed"
          loading={loading}
        />
      </div>

      {/* ── Unified toolbar: search · status tabs · time · view ───────────── */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Search alerts…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-base w-full pl-9 text-small"
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-0.5 bg-surface-secondary rounded-lg p-0.5 border border-surface-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleStatusFilter(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-small transition-colors",
                statusFilter === tab.key
                  ? "bg-surface-primary text-primary shadow-sm"
                  : "text-muted hover:text-secondary"
              )}
            >
              {tab.label}
              {tabCounts[tab.key] !== undefined && (
                <span className={cn(
                  "text-tiny px-1 rounded-full min-w-[16px] text-center leading-4",
                  statusFilter === tab.key ? "bg-brand text-white" : "bg-surface-tertiary text-muted"
                )}>
                  {formatNumber(tabCounts[tab.key])}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Time range — compact dropdown */}
        <CompactTimePicker value={timeKey} onChange={handleTimeChange} />

        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-secondary border border-surface-border">
          <button
            onClick={() => setViewMode("board")}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
              viewMode === "board" ? "bg-surface-primary text-primary shadow-sm" : "text-muted hover:text-secondary"
            )}
            title="Board view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
              viewMode === "list" ? "bg-surface-primary text-primary shadow-sm" : "text-muted hover:text-secondary"
            )}
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Active filters strip ──────────────────────────────────────────── */}
      <AlertActiveFilters
        filters={activeFilters}
        onRemove={removeFilter}
        onClearAll={clearAllFilters}
        className="shrink-0"
      />

      {/* ── Board / List ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "board" ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 h-full overflow-hidden">
            {SEV_ORDER.map((sev) => (
              <AlertBoardColumn
                key={sev}
                severity={sev}
                alerts={byseverity[sev] ?? []}
                totalCount={filtered.length}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onOpen={setDetailAlert}
                onStatusChange={(a, s) => handleStatusChange(a, s)}
                onLaunchSoar={(a) => openSoar(a)}
                className="h-full"
              />
            ))}
          </div>
        ) : (
          /* List view — dense table with horizontal scroll + sticky cols */
          <div className="card flex flex-col h-full overflow-hidden">
            <div className="overflow-auto flex-1">
              <table className="siem-table" style={{ minWidth: "1200px", width: "100%" }}>
                <thead>
                  <tr>
                    {/* Sticky: checkbox */}
                    <th className="sticky left-0 z-10 bg-surface-secondary w-8 border-r border-surface-border/50">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onChange={() => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((a) => a.id)))}
                        className="rounded border-surface-border"
                      />
                    </th>
                    {/* Sticky: severity */}
                    {(columnVisibility["severity"] ?? true) && (
                      <th
                        className="sticky left-8 z-10 bg-surface-secondary cursor-pointer border-r border-surface-border/50"
                        onClick={() => handleSort("severity")}
                        style={{ minWidth: 90 }}
                      >
                        <div className="flex items-center gap-1">
                          Severity
                          <SortIcon field="severity" sortField={sortField} sortDir={sortDir} />
                        </div>
                      </th>
                    )}

                    {/* Dynamic visible columns */}
                    {visibleColumns
                      .filter((c) => c.key !== "severity")
                      .map((col) => {
                        const sortable = !["tags", "echoes", "impactScore"].includes(col.key);
                        return (
                          <th
                            key={col.key}
                            style={{ minWidth: col.width }}
                            onClick={sortable ? () => handleSort(col.key) : undefined}
                            className={sortable ? "cursor-pointer" : ""}
                          >
                            <div className="flex items-center gap-1">
                              {col.label}
                              {sortable && <SortIcon field={col.key} sortField={sortField} sortDir={sortDir} />}
                            </div>
                          </th>
                        );
                      })}

                    {/* Sticky: actions + column picker */}
                    <th className="sticky right-0 z-10 bg-surface-secondary w-[120px] border-l border-surface-border/50">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-tiny text-muted">Actions</span>
                        <AlertColumnPicker visible={columnVisibility} onChange={handleColChange} />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 12 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: visibleColumns.length + 2 }).map((__, j) => (
                          <td key={j}><div className="h-3 shimmer rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 2} className="text-center py-12">
                        <AlertTriangle className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                        <p className="text-small text-muted">No alerts match the current filters</p>
                      </td>
                    </tr>
                  ) : filtered.map((alert) => {
                    const sev = severityLabel(alert.severity);
                    return (
                      <tr
                        key={alert.id}
                        className={cn(
                          "group",
                          selectedIds.has(alert.id) && "bg-brand-subtle/30",
                          sev === "critical" && "bg-critical-subtle/10",
                        )}
                        onClick={() => setDetailAlert(alert)}
                      >
                        {/* Sticky checkbox */}
                        <td
                          className="sticky left-0 bg-surface-primary group-hover:bg-surface-secondary z-[1] border-r border-surface-border/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(alert.id)}
                            onChange={() => toggleSelect(alert.id)}
                            className="rounded border-surface-border"
                          />
                        </td>

                        {/* Sticky severity */}
                        {(columnVisibility["severity"] ?? true) && (
                          <td className="sticky left-8 bg-surface-primary group-hover:bg-surface-secondary z-[1] border-r border-surface-border/30">
                            <SeverityPill severity={sev as never} size="sm" pulse={sev === "critical"} />
                          </td>
                        )}

                        {/* Dynamic columns */}
                        {visibleColumns.filter((c) => c.key !== "severity").map((col) => {
                          if (col.key === "name") return (
                            <td key={col.key} style={{ maxWidth: col.width }}>
                              <p className="text-small text-primary font-medium truncate">{alert.name}</p>
                              {(alert.echoes ?? 0) > 0 && (
                                <span className="text-tiny text-warning">×{alert.echoes} echoes</span>
                              )}
                            </td>
                          );
                          if (col.key === "status") return (
                            <td key={col.key}>
                              <InlineStatusDropdown alert={alert} onStatusChange={handleStatusChange} />
                            </td>
                          );
                          if (col.key === "timestamp") return (
                            <td key={col.key} className="text-tiny text-muted whitespace-nowrap">
                              {alert.timestamp ? formatRelativeTime(alert.timestamp) : "—"}
                            </td>
                          );
                          if (col.key === "technique") return (
                            <td key={col.key}>
                              {alert.technique && <MitreBadge technique={alert.technique} size="sm" />}
                            </td>
                          );
                          if (col.key === "tags") return (
                            <td key={col.key}>
                              <div className="flex flex-wrap gap-1">
                                {alert.tags?.slice(0, 2).map(t => (
                                  <span key={t} className="text-tiny px-1 py-0.5 rounded bg-surface-tertiary text-muted">{t}</span>
                                ))}
                                {(alert.tags?.length ?? 0) > 2 && (
                                  <span className="text-tiny text-muted">+{(alert.tags?.length ?? 0) - 2}</span>
                                )}
                              </div>
                            </td>
                          );
                          if (col.key === "echoes") return (
                            <td key={col.key} className="text-tiny text-center">
                              {(alert.echoes ?? 0) > 0
                                ? <span className="text-warning font-medium">×{alert.echoes}</span>
                                : <span className="text-muted">—</span>
                              }
                            </td>
                          );
                          // Generic field (including nested)
                          const val = getField(alert, col.key);
                          return (
                            <td key={col.key} className="font-mono text-tiny text-secondary">
                              {val}
                            </td>
                          );
                        })}

                        {/* Sticky actions */}
                        <td
                          className="sticky right-0 bg-surface-primary group-hover:bg-surface-secondary z-[1] border-l border-surface-border/30"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              title="Mark In Review"
                              onClick={() => handleStatusChange(alert, AlertStatus.IN_REVIEW)}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Add note"
                              onClick={() => setDetailAlert(alert)}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Launch SOAR"
                              onClick={() => openSoar(alert)}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-brand hover:bg-brand-subtle transition-colors"
                            >
                              <Siren className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Create incident"
                              onClick={() => handleCreateIncident([alert.id])}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-critical hover:bg-critical/10 transition-colors"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-2.5 border-t border-surface-border flex items-center gap-3 shrink-0">
              <span className="text-tiny text-muted flex-1">
                {totalItems > 0
                  ? `Showing ${formatNumber(pageStart)}–${formatNumber(pageEnd)} of ${formatNumber(totalItems)} alerts`
                  : "No alerts"
                }
              </span>
              {/* Items per page */}
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="input-base text-tiny py-1 px-2 w-auto"
              >
                {[10, 20, 40, 100].map((n) => (
                  <option key={n} value={n}>{n} / page</option>
                ))}
              </select>
              {/* Page navigation */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-sm btn-ghost disabled:opacity-50">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-small text-secondary px-1">{page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-sm btn-ghost disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Floating bulk toolbar ─────────────────────────────────────────── */}
      <AlertBulkToolbar
        count={selectedIds.size}
        loading={bulkLoading}
        onStatusChange={handleBulkStatus}
        onFalsePositive={handleBulkFalsePositive}
        onCreateIncident={handleCreateIncident}
        onLaunchSoar={() => openSoar()}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* ── Alert detail drawer ───────────────────────────────────────────── */}
      {detailAlert && (
        <AlertDetailPanel
          alert={detailAlert}
          onClose={() => setDetailAlert(null)}
          onRefresh={() => loadAlerts(true)}
        />
      )}

      {/* ── SOAR launcher modal ───────────────────────────────────────────── */}
      {soarOpen && (
        <AlertSoarLauncher
          alertCount={soarTargetAlert ? 1 : selectedIds.size}
          onLaunch={handleLaunchSoar}
          onClose={() => { setSoarOpen(false); setSoarTargetAlert(null); }}
        />
      )}
    </div>
  );
}
