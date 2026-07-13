"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, AlertTriangle, EyeOff, Activity, TrendingUp,
  TrendingDown, Minus, Shield, Clock, Globe, ChevronRight,
  RefreshCw, Filter, Server, UserCheck, Bookmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ubaService,
  type UbaSummary, type EntityRisk, type UbaAnomaly,
  ANOMALY_TYPE_LABELS,
} from "@/services/uba.service";
import ReactECharts from "echarts-for-react";
import { formatDistanceToNow } from "date-fns";

// ── Demo fallback data ──────────────────────────────────────────────────────

const DEMO_SUMMARY: UbaSummary = {
  critical: 2, high: 1, medium: 2, low: 8, watchlisted: 2,
  openAnomalies: 5, anomaliesLast24h: 5, avgRiskScore: 72,
};

const DEMO_ENTITIES: EntityRisk[] = [
  {
    id: 1, entityId: "jsmith", entityType: "user",
    displayName: "John Smith", department: "Engineering", role: "Senior Developer",
    riskScore: 94, prevRiskScore: 72, riskLevel: "critical",
    anomalyCount: 7, alertCount: 12,
    lastSeen: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    watchlisted: true, status: "active",
    factors: ["Off-hours logins (3am-5am x4)", "Impossible travel: NY→London 2h", "Mass download: 14GB in 30min", "Privilege escalation attempt"],
    riskTrend: [
      { date: "Jun 29", score: 40 }, { date: "Jun 30", score: 55 }, { date: "Jul 1", score: 58 },
      { date: "Jul 2", score: 72 }, { date: "Jul 3", score: 80 }, { date: "Jul 4", score: 89 }, { date: "Jul 5", score: 94 },
    ],
  },
  {
    id: 4, entityId: "web-prod-01", entityType: "host",
    displayName: "web-prod-01.corp.internal", department: "Infrastructure", role: "Web Server",
    riskScore: 85, prevRiskScore: 20, riskLevel: "critical",
    anomalyCount: 9, alertCount: 22,
    lastSeen: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    watchlisted: true, status: "active",
    factors: ["Unexpected outbound connection to C2", "Unusual process spawning (cmd.exe)", "High volume DNS queries", "Lateral movement detected"],
    riskTrend: [
      { date: "Jun 29", score: 18 }, { date: "Jun 30", score: 20 }, { date: "Jul 1", score: 22 },
      { date: "Jul 2", score: 35 }, { date: "Jul 3", score: 60 }, { date: "Jul 4", score: 78 }, { date: "Jul 5", score: 85 },
    ],
  },
  {
    id: 2, entityId: "ajohnson", entityType: "user",
    displayName: "Alice Johnson", department: "Finance", role: "Financial Analyst",
    riskScore: 78, prevRiskScore: 65, riskLevel: "high",
    anomalyCount: 4, alertCount: 6,
    lastSeen: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    watchlisted: false, status: "active",
    factors: ["Unusual access to financial records", "Multiple failed auth attempts", "Login from new country (Brazil)"],
    riskTrend: [
      { date: "Jun 29", score: 30 }, { date: "Jun 30", score: 45 }, { date: "Jul 1", score: 55 },
      { date: "Jul 2", score: 60 }, { date: "Jul 3", score: 65 }, { date: "Jul 4", score: 70 }, { date: "Jul 5", score: 78 },
    ],
  },
  {
    id: 3, entityId: "mwilliams", entityType: "user",
    displayName: "Mark Williams", department: "IT Operations", role: "System Administrator",
    riskScore: 61, prevRiskScore: 68, riskLevel: "medium",
    anomalyCount: 3, alertCount: 5,
    lastSeen: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    watchlisted: false, status: "active",
    factors: ["Bulk account modification", "After-hours firewall rule changes", "Accessed decommissioned server"],
    riskTrend: [
      { date: "Jun 29", score: 75 }, { date: "Jun 30", score: 70 }, { date: "Jul 1", score: 68 },
      { date: "Jul 2", score: 65 }, { date: "Jul 3", score: 64 }, { date: "Jul 4", score: 63 }, { date: "Jul 5", score: 61 },
    ],
  },
  {
    id: 5, entityId: "rbrown", entityType: "user",
    displayName: "Robert Brown", department: "HR", role: "HR Manager",
    riskScore: 42, prevRiskScore: 38, riskLevel: "medium",
    anomalyCount: 2, alertCount: 3,
    lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    watchlisted: false, status: "active",
    factors: ["Unusual access time (11pm)", "Downloaded full employee directory"],
    riskTrend: [
      { date: "Jun 29", score: 35 }, { date: "Jun 30", score: 37 }, { date: "Jul 1", score: 38 },
      { date: "Jul 2", score: 39 }, { date: "Jul 3", score: 40 }, { date: "Jul 4", score: 41 }, { date: "Jul 5", score: 42 },
    ],
  },
];

const DEMO_ANOMALIES: UbaAnomaly[] = [
  {
    id: 1, entityId: "web-prod-01", entityType: "host",
    anomalyType: "c2_beacon", severity: "critical",
    description: "Periodic outbound connections to known C2 infrastructure every 300s — classic beacon pattern",
    riskContribution: 40, detectedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    sourceIp: "185.220.101.45", sourceCountry: "Russia", status: "open",
    details: { remoteIp: "185.220.101.45", remotePort: 443, beaconIntervalSec: 300, connectionCount: 18 },
  },
  {
    id: 2, entityId: "jsmith", entityType: "user",
    anomalyType: "impossible_travel", severity: "critical",
    description: "Login from New York at 14:00 UTC, then London at 16:05 UTC — physically impossible in 2h 5min",
    riskContribution: 35, detectedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    sourceIp: "185.220.101.45", sourceCountry: "United Kingdom", status: "investigating",
    details: { from: "New York, US", to: "London, GB", distanceKm: 5559, travelTimeMin: 125 },
  },
  {
    id: 3, entityId: "jsmith", entityType: "user",
    anomalyType: "mass_download", severity: "high",
    description: "Downloaded 14.2 GB from file server FS-01 in 28 minutes — 47x above personal baseline",
    riskContribution: 28, detectedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    sourceIp: "10.0.1.50", sourceCountry: "United States", status: "open",
    details: { bytesGB: 14.2, durationMin: 28, targetHost: "FS-01", fileCount: 847 },
  },
  {
    id: 4, entityId: "ajohnson", entityType: "user",
    anomalyType: "new_country_login", severity: "high",
    description: "First-ever login from Brazil — all 180 prior logins from United States",
    riskContribution: 25, detectedAt: new Date(Date.now() - 1000 * 60 * 480).toISOString(),
    sourceIp: "177.54.200.1", sourceCountry: "Brazil", status: "open",
    details: { country: "Brazil", city: "São Paulo", loginCount: 180 },
  },
  {
    id: 5, entityId: "mwilliams", entityType: "user",
    anomalyType: "after_hours_admin", severity: "medium",
    description: "Modified 23 firewall rules at 02:47 AM — outside approved maintenance window",
    riskContribution: 18, detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    sourceIp: "10.0.5.22", sourceCountry: "United States", status: "open",
    details: { action: "firewall_rule_modify", count: 23, time: "02:47" },
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
  critical: { bg: "bg-red-500/15",    text: "text-red-400",    border: "border-red-500/30",    dot: "bg-red-500"    },
  high:     { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500" },
  medium:   { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  low:      { bg: "bg-green-500/15",  text: "text-green-400",  border: "border-green-500/30",  dot: "bg-green-500"  },
} as const;

function RiskBadge({ level }: { level: string }) {
  const cfg = LEVEL_CONFIG[level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.low;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-tiny font-medium", cfg.bg, cfg.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function RiskDelta({ current, prev }: { current: number; prev: number }) {
  const delta = current - prev;
  if (delta > 0)  return <span className="flex items-center gap-0.5 text-tiny text-red-400"><TrendingUp className="w-3 h-3" />+{delta}</span>;
  if (delta < 0)  return <span className="flex items-center gap-0.5 text-tiny text-green-400"><TrendingDown className="w-3 h-3" />{delta}</span>;
  return <span className="flex items-center gap-0.5 text-tiny text-muted"><Minus className="w-3 h-3" />0</span>;
}

function RiskGauge({ score, level }: { score: number; level: string }) {
  const color = level === "critical" ? "#ef4444" : level === "high" ? "#f97316" : level === "medium" ? "#eab308" : "#22c55e";
  const option = {
    animation: false,
    series: [{
      type: "gauge",
      startAngle: 200, endAngle: -20,
      min: 0, max: 100,
      radius: "90%",
      pointer: { show: false },
      progress: { show: true, width: 6, roundCap: true, itemStyle: { color } },
      axisLine: { lineStyle: { width: 6, color: [[1, "rgba(255,255,255,0.08)"]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        show: true,
        valueAnimation: false,
        formatter: "{value}",
        fontSize: 18,
        fontWeight: "bold",
        color,
        offsetCenter: [0, "5%"],
      },
      data: [{ value: score }],
    }],
  };
  return <ReactECharts option={option} style={{ width: 80, height: 80 }} opts={{ renderer: "canvas" }} />;
}

function SparkLine({ data }: { data: Array<{ date: string; score: number }> }) {
  if (!data.length) return <div className="w-20 h-8 bg-surface-tertiary rounded" />;
  const last = data[data.length - 1].score;
  const first = data[0].score;
  const rising = last > first;
  const option = {
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: data.map(d => d.date) },
    yAxis: { type: "value", show: false, min: 0, max: 100 },
    series: [{
      type: "line",
      data: data.map(d => d.score),
      smooth: true,
      symbol: "none",
      lineStyle: { color: rising ? "#ef4444" : "#22c55e", width: 1.5 },
      areaStyle: { color: rising ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)" },
    }],
  };
  return <ReactECharts option={option} style={{ width: 80, height: 32 }} opts={{ renderer: "canvas" }} />;
}

function EntityTypeIcon({ type }: { type: string }) {
  if (type === "host") return <Server className="w-3.5 h-3.5" />;
  if (type === "service") return <Activity className="w-3.5 h-3.5" />;
  return <UserCheck className="w-3.5 h-3.5" />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    open:           "bg-red-500/10 text-red-400",
    investigating:  "bg-yellow-500/10 text-yellow-400",
    resolved:       "bg-green-500/10 text-green-400",
    false_positive: "bg-surface-tertiary text-muted",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-tiny font-medium", cfg[status] ?? cfg.open)}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── KPI Row ──────────────────────────────────────────────────────────────────

function KpiRow({ summary, loading }: { summary: UbaSummary | null; loading: boolean }) {
  const s = summary ?? DEMO_SUMMARY;
  const kpis = [
    { label: "Critical Risk", value: s.critical,          color: "text-red-400",    icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "High Risk",     value: s.high,              color: "text-orange-400", icon: <AlertTriangle className="w-4 h-4" /> },
    { label: "Watchlisted",   value: s.watchlisted,       color: "text-yellow-400", icon: <Bookmark className="w-4 h-4" /> },
    { label: "Open Anomalies",value: s.openAnomalies,     color: "text-red-400",    icon: <Activity className="w-4 h-4" /> },
    { label: "Anomalies 24h", value: s.anomaliesLast24h,  color: "text-orange-400", icon: <Clock className="w-4 h-4" /> },
    { label: "Avg Risk Score",value: s.avgRiskScore,      color: "text-brand",      icon: <TrendingUp className="w-4 h-4" /> },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((k) => (
        <div key={k.label} className="card p-3 flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-surface-tertiary shrink-0", k.color)}>{k.icon}</div>
          <div className="min-w-0">
            <div className={cn("text-h3 font-bold tabular-nums", k.color)}>
              {loading ? "—" : k.value}
            </div>
            <div className="text-tiny text-muted truncate">{k.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Entity detail drawer ─────────────────────────────────────────────────────

function EntityDrawer({
  entity, anomalies, onClose, onWatchlistToggle,
}: {
  entity: EntityRisk;
  anomalies: UbaAnomaly[];
  onClose: () => void;
  onWatchlistToggle: (id: number, val: boolean) => void;
}) {
  const cfg = LEVEL_CONFIG[entity.riskLevel as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.low;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-surface-primary border-l border-surface-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-surface-border">
          <div className="flex items-start gap-3">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0", cfg.bg, cfg.text)}>
              {entity.displayName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-h3 text-primary">{entity.displayName}</h2>
                {entity.watchlisted && <Bookmark className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
              </div>
              <p className="text-small text-muted">{entity.role} · {entity.department}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <RiskBadge level={entity.riskLevel} />
                <span className="text-tiny text-muted flex items-center gap-1">
                  <EntityTypeIcon type={entity.entityType} /> {entity.entityType}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onWatchlistToggle(entity.id, !entity.watchlisted)}
              className={cn("p-1.5 rounded hover:bg-surface-tertiary transition-colors",
                entity.watchlisted ? "text-yellow-400" : "text-muted hover:text-secondary")}
              title={entity.watchlisted ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Bookmark className={cn("w-4 h-4", entity.watchlisted && "fill-yellow-400")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-muted hover:text-secondary hover:bg-surface-tertiary transition-colors">
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Score + trend */}
          <div className="flex items-center gap-6">
            <RiskGauge score={entity.riskScore} level={entity.riskLevel} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-small text-muted">Risk Score</span>
                <RiskDelta current={entity.riskScore} prev={entity.prevRiskScore} />
              </div>
              <div className="text-h2 font-bold tabular-nums" style={{ color: entity.riskLevel === "critical" ? "#ef4444" : entity.riskLevel === "high" ? "#f97316" : "#eab308" }}>
                {entity.riskScore}<span className="text-muted text-h4 font-normal">/100</span>
              </div>
              <div className="flex items-center gap-4 text-tiny text-muted">
                <span><AlertTriangle className="w-3 h-3 inline mr-1" />{entity.anomalyCount} anomalies</span>
                <span><Shield className="w-3 h-3 inline mr-1" />{entity.alertCount} alerts</span>
                {entity.lastSeen && <span><Clock className="w-3 h-3 inline mr-1" />
                  {formatDistanceToNow(new Date(entity.lastSeen), { addSuffix: true })}
                </span>}
              </div>
            </div>
          </div>

          {/* 7-day trend */}
          {entity.riskTrend.length > 0 && (
            <div className="card p-4">
              <p className="text-tiny text-muted mb-2 font-medium uppercase tracking-wide">7-Day Risk Trend</p>
              <ReactECharts
                option={{
                  animation: false,
                  grid: { left: 32, right: 8, top: 8, bottom: 24 },
                  xAxis: { type: "category", data: entity.riskTrend.map(d => d.date), axisLabel: { fontSize: 10, color: "#6b7280" }, axisLine: { show: false }, axisTick: { show: false } },
                  yAxis: { type: "value", min: 0, max: 100, axisLabel: { fontSize: 10, color: "#6b7280" }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.06)" } } },
                  series: [{
                    type: "line", data: entity.riskTrend.map(d => d.score), smooth: true, symbol: "circle", symbolSize: 5,
                    lineStyle: { color: "#ef4444", width: 2 },
                    itemStyle: { color: "#ef4444" },
                    areaStyle: { color: "rgba(239,68,68,0.12)" },
                  }],
                  tooltip: { trigger: "axis", backgroundColor: "#1e2330", borderColor: "#374151", textStyle: { color: "#e5e7eb", fontSize: 11 } },
                }}
                style={{ height: 120 }}
              />
            </div>
          )}

          {/* Contributing factors */}
          {entity.factors.length > 0 && (
            <div>
              <p className="text-tiny text-muted mb-2 font-medium uppercase tracking-wide">Contributing Factors</p>
              <ul className="space-y-2">
                {entity.factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-small text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Anomaly list */}
          {anomalies.length > 0 && (
            <div>
              <p className="text-tiny text-muted mb-2 font-medium uppercase tracking-wide">Recent Anomalies ({anomalies.length})</p>
              <div className="space-y-2">
                {anomalies.map(a => {
                  const acfg = LEVEL_CONFIG[a.severity as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.low;
                  return (
                    <div key={a.id} className={cn("p-3 rounded-lg border text-small", acfg.bg, acfg.border)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("font-medium text-tiny", acfg.text)}>
                          {ANOMALY_TYPE_LABELS[a.anomalyType] ?? a.anomalyType}
                        </span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="text-secondary">{a.description}</p>
                      {a.sourceCountry && (
                        <p className="text-tiny text-muted mt-1 flex items-center gap-1">
                          <Globe className="w-3 h-3" />{a.sourceCountry} · {a.sourceIp}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type Tab = "leaderboard" | "anomalies" | "watchlist";

export default function UbaPage() {
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [summary, setSummary] = useState<UbaSummary | null>(null);
  const [entities, setEntities] = useState<EntityRisk[]>(DEMO_ENTITIES);
  const [anomalies, setAnomalies] = useState<UbaAnomaly[]>(DEMO_ANOMALIES);
  const [loading, setLoading] = useState(false);
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [riskLevelFilter, setRiskLevelFilter] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<EntityRisk | null>(null);
  const [entityAnomalies, setEntityAnomalies] = useState<UbaAnomaly[]>([]);
  const [isDemo, setIsDemo] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, entRes, anomRes] = await Promise.allSettled([
        ubaService.getSummary(),
        ubaService.listEntities({ entityType: entityTypeFilter || undefined, riskLevel: riskLevelFilter || undefined }),
        ubaService.listAnomalies(0, 50),
      ]);
      if (sumRes.status  === "fulfilled") { setSummary(sumRes.value);   setIsDemo(false); }
      if (entRes.status  === "fulfilled") setEntities(entRes.value.content);
      if (anomRes.status === "fulfilled") setAnomalies(anomRes.value);
    } catch {
      // keep demo data
    } finally {
      setLoading(false);
    }
  }, [entityTypeFilter, riskLevelFilter]);

  useEffect(() => { load(); }, [load]);

  const openEntity = useCallback(async (entity: EntityRisk) => {
    setSelectedEntity(entity);
    // pull anomalies for this entity
    const ea = anomalies.filter(a => a.entityId === entity.entityId);
    setEntityAnomalies(ea);
    try {
      const real = await ubaService.getEntityAnomalies(entity.entityId, entity.entityType);
      if (real.length) setEntityAnomalies(real);
    } catch { /* keep filtered demo */ }
  }, [anomalies]);

  const handleWatchlistToggle = useCallback(async (id: number, val: boolean) => {
    try {
      await ubaService.setWatchlist(id, val);
      setEntities(prev => prev.map(e => e.id === id ? { ...e, watchlisted: val } : e));
      if (selectedEntity?.id === id) setSelectedEntity(prev => prev ? { ...prev, watchlisted: val } : null);
      toast("success", val ? "Added to watchlist" : "Removed from watchlist");
    } catch {
      toast("error", "Failed to update watchlist");
    }
  }, [selectedEntity]);

  const handleAnomalyStatus = useCallback(async (id: number, status: string) => {
    try {
      await ubaService.updateAnomalyStatus(id, status);
      setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: status as UbaAnomaly["status"] } : a));
      setEntityAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: status as UbaAnomaly["status"] } : a));
      toast("success", `Anomaly marked as ${status.replace("_", " ")}`);
    } catch {
      toast("error", "Failed to update anomaly status");
    }
  }, []);

  const watchlisted = entities.filter(e => e.watchlisted);
  const displayEntities = tab === "watchlist" ? watchlisted : entities;

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "leaderboard", label: "Risk Leaderboard", count: entities.length },
    { id: "anomalies",   label: "Anomaly Feed",     count: anomalies.filter(a => a.status === "open").length },
    { id: "watchlist",   label: "Watchlist",         count: watchlisted.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-h1">User Behavior Analytics</h1>
          <p className="text-secondary text-small mt-0.5">
            Entity risk scoring, behavioral anomalies, and insider threat detection
            {isDemo && <span className="ml-2 px-1.5 py-0.5 rounded text-tiny bg-surface-tertiary text-muted">demo data</span>}
          </p>
        </div>
        <button onClick={load} className="btn btn-secondary" disabled={loading}>
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <KpiRow summary={summary} loading={loading} />

      {/* Tabs + filters */}
      <div className="flex items-center justify-between border-b border-surface-border">
        <div className="flex items-center gap-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-small font-medium transition-colors border-b-2 -mb-px",
                tab === t.id ? "text-brand border-brand" : "text-muted border-transparent hover:text-secondary",
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn("px-1.5 py-0.5 rounded-full text-tiny tabular-nums",
                  tab === t.id ? "bg-brand/20 text-brand" : "bg-surface-tertiary text-muted"
                )}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {(tab === "leaderboard" || tab === "watchlist") && (
          <div className="flex items-center gap-2 pb-px">
            <Filter className="w-3.5 h-3.5 text-muted" />
            <select
              value={entityTypeFilter}
              onChange={e => setEntityTypeFilter(e.target.value)}
              className="text-small bg-surface-secondary border border-surface-border rounded px-2 py-1 text-secondary"
            >
              <option value="">All types</option>
              <option value="user">Users</option>
              <option value="host">Hosts</option>
              <option value="service">Services</option>
            </select>
            <select
              value={riskLevelFilter}
              onChange={e => setRiskLevelFilter(e.target.value)}
              className="text-small bg-surface-secondary border border-surface-border rounded px-2 py-1 text-secondary"
            >
              <option value="">All risk levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Leaderboard / Watchlist ── */}
      {(tab === "leaderboard" || tab === "watchlist") && (
        <div className="card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : displayEntities.length === 0 ? (
            <EmptyState
              icon={tab === "watchlist" ? <Bookmark className="w-6 h-6" /> : <Users className="w-6 h-6" />}
              title={tab === "watchlist" ? "No watchlisted entities" : "No entities found"}
              description={tab === "watchlist" ? "Watchlist entities from the Risk Leaderboard tab" : "No entities match the current filters"}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    {["Entity", "Type", "Risk Score", "Risk Level", "Trend (7d)", "Anomalies", "Last Seen", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-tiny text-muted uppercase tracking-wider font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayEntities.map(entity => {
                    const cfg = LEVEL_CONFIG[entity.riskLevel as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.low;
                    return (
                      <tr
                        key={entity.id}
                        className="border-b border-surface-border hover:bg-surface-tertiary/40 transition-colors cursor-pointer"
                        onClick={() => openEntity(entity)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-tiny font-bold shrink-0", cfg.bg, cfg.text)}>
                              {entity.displayName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-small text-primary font-medium">{entity.displayName}</span>
                                {entity.watchlisted && <Bookmark className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                              </div>
                              <p className="text-tiny text-muted">{entity.entityId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-tiny text-muted">
                            <EntityTypeIcon type={entity.entityType} />
                            {entity.entityType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-body font-bold tabular-nums", cfg.text)}>{entity.riskScore}</span>
                            <RiskDelta current={entity.riskScore} prev={entity.prevRiskScore} />
                          </div>
                        </td>
                        <td className="px-4 py-3"><RiskBadge level={entity.riskLevel} /></td>
                        <td className="px-4 py-3"><SparkLine data={entity.riskTrend} /></td>
                        <td className="px-4 py-3">
                          <span className="text-small text-secondary tabular-nums">{entity.anomalyCount}</span>
                        </td>
                        <td className="px-4 py-3 text-tiny text-muted">
                          {entity.lastSeen
                            ? formatDistanceToNow(new Date(entity.lastSeen), { addSuffix: true })
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-4 h-4 text-muted" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Anomaly Feed ── */}
      {tab === "anomalies" && (
        <div className="space-y-2">
          {loading ? (
            <div className="card"><TableSkeleton rows={5} cols={5} /></div>
          ) : anomalies.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Activity className="w-6 h-6" />} title="No anomalies" description="No behavioral anomalies detected" />
            </div>
          ) : (
            anomalies.map(a => {
              const cfg = LEVEL_CONFIG[a.severity as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.low;
              return (
                <div key={a.id} className={cn("card p-4 border", cfg.border, "hover:bg-surface-tertiary/30 transition-colors")}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", cfg.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-small font-semibold", cfg.text)}>
                            {ANOMALY_TYPE_LABELS[a.anomalyType] ?? a.anomalyType}
                          </span>
                          <RiskBadge level={a.severity} />
                          <span className="text-tiny text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
                            +{a.riskContribution} risk pts
                          </span>
                        </div>
                        <p className="text-small text-secondary mb-1.5">{a.description}</p>
                        <div className="flex items-center gap-3 text-tiny text-muted flex-wrap">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{a.entityId} ({a.entityType})</span>
                          {a.sourceCountry && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{a.sourceCountry}</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={a.status} />
                      {a.status === "open" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAnomalyStatus(a.id, "investigating")}
                            className="px-2 py-1 text-tiny rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                          >
                            Investigate
                          </button>
                          <button
                            onClick={() => handleAnomalyStatus(a.id, "false_positive")}
                            className="px-2 py-1 text-tiny rounded bg-surface-tertiary text-muted hover:text-secondary transition-colors"
                          >
                            FP
                          </button>
                        </div>
                      )}
                      {a.status === "investigating" && (
                        <button
                          onClick={() => handleAnomalyStatus(a.id, "resolved")}
                          className="px-2 py-1 text-tiny rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Entity detail drawer */}
      {selectedEntity && (
        <EntityDrawer
          entity={selectedEntity}
          anomalies={entityAnomalies}
          onClose={() => setSelectedEntity(null)}
          onWatchlistToggle={handleWatchlistToggle}
        />
      )}
    </div>
  );
}
