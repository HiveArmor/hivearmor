"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Radar, Server, RefreshCw,
  Plus, Eye, Network, Shield, Globe, Activity,
  ChevronDown, ChevronUp, Download, Loader2,
  Layers, Trash2, X, Check,
} from "lucide-react";
import {
  scannerService,
  type NetworkScanAsset,
  type AssetGroupDTO,
} from "@/services/scanner.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityToRisk(v?: number | null): "critical" | "high" | "medium" | "low" | "unknown" {
  if (v == null || v < 0) return "unknown";
  if (v >= 9) return "critical";
  if (v >= 7) return "high";
  if (v >= 4) return "medium";
  if (v >= 0.1) return "low";
  return "unknown";
}

function RiskBadge({ score }: { score?: number | null }) {
  const risk = severityToRisk(score);
  const cfg = {
    critical: { label: "Critical", color: "var(--color-critical)" },
    high:     { label: "High",     color: "var(--color-high)"     },
    medium:   { label: "Medium",   color: "var(--color-medium)"   },
    low:      { label: "Low",      color: "var(--color-success)"  },
    unknown:  { label: "Unknown",  color: "var(--text-muted)"     },
  }[risk];
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-tiny font-medium"
      style={{ background: `${cfg.color}18`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function OsIcon({ os }: { os?: string }) {
  const lower = (os ?? "").toLowerCase();
  if (lower.includes("windows")) return <Shield  className="w-3.5 h-3.5 text-muted" />;
  if (lower.includes("ubuntu") || lower.includes("debian") || lower.includes("centos") || lower.includes("freebsd") || lower.includes("linux"))
    return <Server  className="w-3.5 h-3.5 text-muted" />;
  if (lower.includes("pan") || lower.includes("ivanti") || lower.includes("cisco") || lower.includes("juniper"))
    return <Network className="w-3.5 h-3.5 text-muted" />;
  return <Globe className="w-3.5 h-3.5 text-muted" />;
}

function exportCsv(assets: NetworkScanAsset[]) {
  const header = ["ID", "Name", "IP", "OS", "OS Platform", "OS Version", "Alive", "Status", "Severity", "Group", "Discovered At"];
  const rows = assets.map(a => [
    a.id,
    a.assetName ?? "",
    a.assetIp ?? "",
    a.assetOs ?? "",
    a.assetOsPlatform ?? "",
    a.assetOsVersion ?? "",
    a.assetAlive ? "Yes" : "No",
    a.assetStatus ?? "",
    a.assetSeverityMetric ?? "",
    a.group?.groupName ?? "",
    a.discoveredAt ?? "",
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "asset-inventory.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]   = useState("");
  const [desc, setDesc]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await scannerService.createGroup(name.trim(), desc.trim() || undefined);
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-surface-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 text-primary font-semibold">New Asset Group</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4 text-muted" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-tiny text-muted mb-1 block">Group Name *</label>
            <input
              className="w-full bg-surface-primary border border-surface-border rounded-lg px-3 py-2 text-small text-primary focus:outline-none focus:border-brand"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Production Servers"
              onKeyDown={e => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <label className="text-tiny text-muted mb-1 block">Description</label>
            <input
              className="w-full bg-surface-primary border border-surface-border rounded-lg px-3 py-2 text-small text-primary focus:outline-none focus:border-brand"
              value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          {err && <p className="text-tiny text-severity-critical">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose}  className="btn-ghost flex-1 text-small py-2">Cancel</button>
            <button onClick={submit}   className="btn-primary flex-1 text-small py-2 flex items-center justify-center gap-1.5"
              disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignGroupModal({
  assets,
  groups,
  onClose,
  onAssigned,
}: {
  assets: NetworkScanAsset[];
  groups: AssetGroupDTO[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [busy, setBusy]       = useState(false);
  const [err,  setErr]        = useState<string | null>(null);

  async function submit() {
    if (groupId === null) return;
    setBusy(true); setErr(null);
    try {
      await scannerService.assignAssetsToGroup(assets.map(a => a.id), groupId);
      onAssigned();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface-secondary border border-surface-border rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2 text-primary font-semibold">Assign to Group</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4 text-muted" /></button>
        </div>
        <p className="text-tiny text-muted mb-3">{assets.length} asset{assets.length !== 1 ? "s" : ""} selected</p>
        <select
          className="w-full bg-surface-primary border border-surface-border rounded-lg px-3 py-2 text-small text-primary focus:outline-none focus:border-brand mb-4"
          value={groupId ?? ""}
          onChange={e => setGroupId(e.target.value === "" ? null : Number(e.target.value))}
        >
          <option value="">Select a group…</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.groupName}</option>
          ))}
        </select>
        {err && <p className="text-tiny text-severity-critical mb-2">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose}  className="btn-ghost flex-1 text-small py-2">Cancel</button>
          <button onClick={submit}   className="btn-primary flex-1 text-small py-2 flex items-center justify-center gap-1.5"
            disabled={busy || groupId === null}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Tab = "groups" | "inventory";

export default function ScannerPage() {
  const [activeTab, setActiveTab] = useState<Tab>("inventory");

  // ── Inventory state ──────────────────────────────────────────────────────
  const [assets,      setAssets]      = useState<NetworkScanAsset[]>([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetPage,   setAssetPage]   = useState(0);
  const PAGE_SIZE = 50;

  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [riskFilter,  setRiskFilter]  = useState<ReturnType<typeof severityToRisk> | "all">("all");
  const [osFilter,    setOsFilter]    = useState<string>("all");
  const [aliveFilter, setAliveFilter] = useState<"all" | "alive" | "dead">("all");
  const [search,      setSearch]      = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAssign,  setShowAssign]  = useState(false);

  // ── Groups state ─────────────────────────────────────────────────────────
  const [groups,        setGroups]        = useState<AssetGroupDTO[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<number | null>(null);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing]    = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAssets = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoadingAssets(true);
    const aliveParam = aliveFilter === "alive" ? true : aliveFilter === "dead" ? false : undefined;
    const { assets: data, total } = await scannerService.listAssets({
      page: assetPage,
      size: PAGE_SIZE,
      assetIpMacName: search || undefined,
      alive: aliveParam,
    });
    setAssets(data);
    setTotalAssets(total);
    if (showSpinner) setLoadingAssets(false);
  }, [assetPage, search, aliveFilter]);

  const loadGroups = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoadingGroups(true);
    const data = await scannerService.listGroups();
    setGroups(data);
    if (showSpinner) setLoadingGroups(false);
  }, []);

  // Initial load
  useEffect(() => { loadAssets(true); }, [loadAssets]);
  useEffect(() => { loadGroups(true); }, [loadGroups]);

  // 30s auto-refresh
  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadAssets(false);
      loadGroups(false);
    }, 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAssets, loadGroups]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadAssets(false), loadGroups(false)]);
    setRefreshing(false);
  }

  // ── Derived risk counts ───────────────────────────────────────────────────
  const riskCounts = assets.reduce((acc, a) => {
    const r = severityToRisk(a.assetSeverityMetric);
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Filtered assets (client-side risk + OS on current page) ──────────────
  const filteredAssets = assets.filter(a => {
    if (riskFilter !== "all" && severityToRisk(a.assetSeverityMetric) !== riskFilter) return false;
    if (osFilter !== "all") {
      const lower = (a.assetOsPlatform ?? a.assetOs ?? "").toLowerCase();
      if (!lower.includes(osFilter.toLowerCase())) return false;
    }
    return true;
  });

  const osPlatforms = Array.from(new Set(assets.map(a => a.assetOsPlatform ?? a.assetOs).filter(Boolean))) as string[];

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      void (next.has(id) ? next.delete(id) : next.add(id));
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map(a => a.id)));
    }
  }

  const selectedAssets = assets.filter(a => selectedIds.has(a.id));

  // ── Delete group ──────────────────────────────────────────────────────────
  async function handleDeleteGroup(id: number) {
    setDeletingGroupId(id);
    try {
      await scannerService.deleteGroup(id);
      await loadGroups(false);
    } finally {
      setDeletingGroupId(null);
    }
  }

  const tabs = [
    { id: "inventory" as Tab, label: "Asset Inventory", icon: <Server        className="w-3.5 h-3.5" /> },
    { id: "groups"    as Tab, label: "Asset Groups",    icon: <Layers        className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">

      {/* Modals */}
      {showCreateGroup && (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={() => { setShowCreateGroup(false); loadGroups(false); }}
        />
      )}
      {showAssign && (
        <AssignGroupModal
          assets={selectedAssets}
          groups={groups}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); setSelectedIds(new Set()); loadAssets(false); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "var(--color-low)18" }}>
            <Radar className="w-5 h-5" style={{ color: "var(--color-low)" }} />
          </div>
          <div>
            <h1 className="text-h1 text-primary">Asset Discovery</h1>
            <p className="text-small text-muted">
              {totalAssets > 0 ? `${totalAssets} assets discovered` : "Network asset inventory"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost p-2" title="Refresh" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("w-4 h-4 text-muted", refreshing && "animate-spin")} />
          </button>
          {activeTab === "inventory" && selectedIds.size > 0 && (
            <button className="btn-ghost text-small flex items-center gap-1.5" onClick={() => setShowAssign(true)}>
              <Layers className="w-3.5 h-3.5" /> Assign to Group ({selectedIds.size})
            </button>
          )}
          {activeTab === "inventory" && (
            <button className="btn-ghost text-small flex items-center gap-1.5"
              onClick={() => exportCsv(filteredAssets)}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          {activeTab === "groups" && (
            <button className="btn-primary text-small flex items-center gap-1.5"
              onClick={() => setShowCreateGroup(true)}>
              <Plus className="w-3.5 h-3.5" /> New Group
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-surface-border shrink-0 mt-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-small border-b-2 transition-colors",
              activeTab === t.id
                ? "border-brand text-brand font-medium"
                : "border-transparent text-muted hover:text-secondary"
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── INVENTORY ──────────────────────────────────────────────────── */}
        {activeTab === "inventory" && (
          <div className="space-y-4">

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Assets",    value: totalAssets,                                            icon: <Server   className="w-4 h-4" />, color: "var(--brand-primary)"  },
                { label: "Alive",           value: assets.filter(a => a.assetAlive).length,                icon: <Activity className="w-4 h-4" />, color: "var(--color-success)"  },
                { label: "New / Unreviewed",value: assets.filter(a => a.assetStatus === "NEW").length,     icon: <Eye      className="w-4 h-4" />, color: "var(--color-medium)"   },
                { label: "Critical Risk",   value: riskCounts.critical ?? 0,                               icon: <Shield   className="w-4 h-4" />, color: "var(--color-critical)" },
              ].map(s => (
                <div key={s.label} className="border border-surface-border rounded-lg p-4 bg-surface-secondary flex items-center gap-3">
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <div>
                    <div className="text-h3 font-bold text-primary">{s.value}</div>
                    <div className="text-tiny text-muted">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search by name, IP, or MAC…"
                value={search}
                onChange={e => { setSearch(e.target.value); setAssetPage(0); }}
                className="bg-surface-secondary border border-surface-border rounded-lg px-3 py-1.5 text-small text-primary focus:outline-none focus:border-brand w-56"
              />

              <div className="flex items-center gap-1">
                {(["all", "critical", "high", "medium", "low", "unknown"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRiskFilter(r)}
                    className={cn(
                      "px-2.5 py-1 rounded text-tiny capitalize transition-colors",
                      riskFilter === r ? "bg-brand/10 text-brand font-medium" : "text-muted hover:text-secondary hover:bg-surface-tertiary/50"
                    )}
                  >
                    {r === "all" ? `All (${assets.length})` : `${r} (${riskCounts[r] ?? 0})`}
                  </button>
                ))}
              </div>

              {osPlatforms.length > 0 && (
                <select
                  className="bg-surface-secondary border border-surface-border rounded-lg px-2 py-1.5 text-tiny text-primary focus:outline-none focus:border-brand"
                  value={osFilter}
                  onChange={e => setOsFilter(e.target.value)}
                >
                  <option value="all">All OS</option>
                  {osPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              )}

              <select
                className="bg-surface-secondary border border-surface-border rounded-lg px-2 py-1.5 text-tiny text-primary focus:outline-none focus:border-brand"
                value={aliveFilter}
                onChange={e => { setAliveFilter(e.target.value as typeof aliveFilter); setAssetPage(0); }}
              >
                <option value="all">Any status</option>
                <option value="alive">Alive only</option>
                <option value="dead">Offline only</option>
              </select>
            </div>

            {/* Table */}
            {loadingAssets ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-20 text-muted text-small">No assets found</div>
            ) : (
              <>
                {/* Select-all row */}
                <div className="flex items-center gap-2 text-tiny text-muted">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredAssets.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredAssets.length; }}
                    onChange={toggleSelectAll}
                    className="accent-brand"
                  />
                  <span>{filteredAssets.length} assets shown</span>
                  {selectedIds.size > 0 && <span className="text-brand font-medium ml-1">· {selectedIds.size} selected</span>}
                </div>

                <div className="space-y-1.5">
                  {filteredAssets.map(asset => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      expanded={expandedId === asset.id}
                      selected={selectedIds.has(asset.id)}
                      onToggle={() => setExpandedId(expandedId === asset.id ? null : asset.id)}
                      onSelect={() => toggleSelect(asset.id)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalAssets > PAGE_SIZE && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      className="btn-ghost text-tiny px-3 py-1.5"
                      disabled={assetPage === 0}
                      onClick={() => setAssetPage(p => Math.max(0, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="text-tiny text-muted">
                      Page {assetPage + 1} of {Math.ceil(totalAssets / PAGE_SIZE)}
                    </span>
                    <button
                      className="btn-ghost text-tiny px-3 py-1.5"
                      disabled={(assetPage + 1) * PAGE_SIZE >= totalAssets}
                      onClick={() => setAssetPage(p => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── GROUPS ─────────────────────────────────────────────────────── */}
        {activeTab === "groups" && (
          <div className="space-y-4 max-w-3xl">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Groups",  value: groups.length,                                              color: "var(--brand-primary)"  },
                { label: "Total Assets",  value: groups.reduce((s, g) => s + (g.assetsCount ?? 0), 0),       color: "var(--color-success)"  },
                { label: "Ungrouped",     value: assets.filter(a => !a.group).length,                        color: "var(--text-muted)"     },
              ].map(s => (
                <div key={s.label} className="border border-surface-border rounded-lg p-4 bg-surface-secondary">
                  <div className="text-h3 font-bold text-primary" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-tiny text-muted mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {loadingGroups ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-muted" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-16 text-muted text-small">
                No groups yet. Create one to organise your assets.
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <div key={g.id} className="border border-surface-border rounded-lg px-4 py-3 bg-surface-secondary flex items-center gap-4">
                    <Layers className="w-4 h-4 text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-primary text-small">{g.groupName}</div>
                      {g.groupDescription && (
                        <div className="text-tiny text-muted truncate">{g.groupDescription}</div>
                      )}
                    </div>
                    <span className="text-tiny text-brand font-medium shrink-0">
                      {g.assetsCount} asset{g.assetsCount !== 1 ? "s" : ""}
                    </span>
                    {g.createdDate && (
                      <span className="text-tiny text-muted hidden md:block shrink-0">
                        {new Date(g.createdDate).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      className="btn-ghost p-1.5 shrink-0"
                      title="Delete group"
                      disabled={deletingGroupId === g.id}
                      onClick={() => handleDeleteGroup(g.id)}
                    >
                      {deletingGroupId === g.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
                        : <Trash2  className="w-3.5 h-3.5 text-muted hover:text-severity-critical" />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── AssetRow (separated to avoid re-render storms) ──────────────────────────

function AssetRow({
  asset,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  asset: NetworkScanAsset;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const displayName = asset.assetName ?? asset.assetAlias ?? asset.assetIp ?? "—";
  const ports = asset.ports ?? [];

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden transition-colors",
      selected ? "border-brand/40 bg-brand/5" : "border-surface-border"
    )}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-tertiary/20 transition-colors">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
          className="accent-brand shrink-0"
        />
        <button
          className="flex flex-1 items-center gap-3 text-left min-w-0"
          onClick={onToggle}
        >
          <OsIcon os={asset.assetOsPlatform ?? asset.assetOs} />
          <span className="font-medium text-primary text-small w-36 truncate">{displayName}</span>
          <span className="font-mono text-tiny text-muted w-28 shrink-0">{asset.assetIp ?? "—"}</span>
          <span className="text-tiny text-muted flex-1 truncate">
            {[asset.assetOs, asset.assetOsVersion].filter(Boolean).join(" ") || "—"}
          </span>
          <span className={cn(
            "text-tiny px-1.5 py-0.5 rounded shrink-0",
            asset.assetAlive ? "bg-success/10 text-success" : "bg-surface-tertiary text-muted"
          )}>
            {asset.assetAlive ? "alive" : "offline"}
          </span>
          {asset.group && (
            <span className="text-tiny px-1.5 py-0.5 rounded bg-surface-tertiary text-muted shrink-0 hidden md:block">
              {asset.group.groupName}
            </span>
          )}
          <span className="text-tiny text-muted hidden md:block shrink-0">{ports.length} ports</span>
          <RiskBadge score={asset.assetSeverityMetric} />
          {expanded
            ? <ChevronUp   className="w-4 h-4 text-muted shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted shrink-0" />
          }
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-surface-border bg-surface-secondary space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-tiny">
            <div>
              <span className="text-muted">IP Address</span>
              <div className="font-mono text-primary mt-0.5">{asset.assetIp ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted">MAC Address</span>
              <div className="font-mono text-primary mt-0.5">{asset.assetMac ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted">OS Arch</span>
              <div className="text-primary mt-0.5">{asset.assetOsArch ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted">Registered Mode</span>
              <div className="text-primary mt-0.5">{asset.registeredMode ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted">Discovered</span>
              <div className="text-primary mt-0.5">
                {asset.discoveredAt ? new Date(asset.discoveredAt).toLocaleString() : "—"}
              </div>
            </div>
            <div>
              <span className="text-muted">Last Modified</span>
              <div className="text-primary mt-0.5">
                {asset.modifiedAt ? new Date(asset.modifiedAt).toLocaleString() : "—"}
              </div>
            </div>
            <div>
              <span className="text-muted">Status</span>
              <div className="text-primary mt-0.5">{asset.assetStatus ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted">Agent</span>
              <div className="text-primary mt-0.5">{asset.isAgent ? "Yes" : "No"}</div>
            </div>
          </div>

          {ports.length > 0 && (
            <div>
              <span className="text-tiny text-muted">Open Ports</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ports.map(p => (
                  <span key={p.port}
                    className="font-mono text-tiny px-1.5 py-0.5 rounded bg-surface-primary border border-surface-border text-secondary">
                    {p.port}{p.tcp ? `/${p.tcp}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {asset.assetNotes && (
            <div>
              <span className="text-tiny text-muted">Notes</span>
              <p className="text-tiny text-secondary mt-0.5">{asset.assetNotes}</p>
            </div>
          )}

          {asset.metrics && Object.keys(asset.metrics).length > 0 && (
            <div>
              <span className="text-tiny text-muted">Metrics</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(asset.metrics).map(([k, v]) => (
                  <span key={k} className="text-tiny text-muted">
                    <span className="text-secondary font-medium">{k}</span>: {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
