"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { offenseService, Offense, Alert } from "@/services/offense.service";
import { MitreBadge } from "@/components/ui/mitre-badge";
import { cn } from "@/lib/utils";
import {
  Shield, ArrowLeft, Clock, AlertTriangle, Globe,
  CheckCircle2, XCircle, ChevronDown,
} from "lucide-react";

// ─── Magnitude bar ─────────────────────────────────────────────────────────
function MagnitudeBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, (value / 10) * 100));
  const color =
    value >= 8 ? "bg-red-500"
    : value >= 5 ? "bg-orange-400"
    : "bg-yellow-400";
  const textColor =
    value >= 8 ? "text-red-400"
    : value >= 5 ? "text-orange-400"
    : "text-yellow-400";
  return (
    <div className="flex items-center gap-3">
      <span className={cn("text-h1 font-bold tabular-nums", textColor)}>{value}</span>
      <div className="flex-1 h-2 bg-surface-tertiary rounded-full overflow-hidden max-w-[120px]">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-small text-muted">/10</span>
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: Offense["status"] }) {
  const cfg = {
    open:            { label: "Open",           cls: "bg-red-500/15 text-red-400" },
    closed:          { label: "Closed",         cls: "bg-green-500/15 text-green-400" },
    "false-positive":{ label: "False Positive", cls: "bg-surface-tertiary text-muted" },
  }[status] ?? { label: status, cls: "bg-surface-tertiary text-muted" };

  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-small font-medium", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ─── KPI tile ──────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <p className="text-small text-muted">{label}</p>
      <p className="text-h2 font-semibold text-primary tabular-nums">{value}</p>
      {sub && <p className="text-tiny text-muted">{sub}</p>}
    </div>
  );
}

// ─── Alert row in timeline ─────────────────────────────────────────────────
function AlertRow({ alert }: { alert: Alert }) {
  const ts = alert["@timestamp"] ?? alert.timestamp ?? "";
  const severityColor = [
    "bg-surface-tertiary",  // 0 unused
    "bg-red-500",           // 1 critical
    "bg-orange-400",        // 2 high
    "bg-yellow-400",        // 3 medium
    "bg-green-400",         // 4 low
  ];
  const sev = Number(alert.severity ?? 0);
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-surface-border/50 last:border-0">
      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", severityColor[sev] ?? "bg-surface-tertiary")} />
      <div className="flex-1 min-w-0">
        <p className="text-small font-medium text-primary truncate">{String(alert.name ?? "Unknown alert")}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {alert.dataSource && (
            <span className="text-micro text-muted bg-surface-tertiary px-1.5 rounded">{String(alert.dataSource)}</span>
          )}
          {(alert.technique || alert.category) && (
            <MitreBadge techniqueId={alert.technique} tactic={String(alert.category ?? "")} size="sm" />
          )}
        </div>
      </div>
      <span className="text-micro text-muted shrink-0 tabular-nums">{formatTime(ts)}</span>
    </div>
  );
}

function formatTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatDuration(from: string, to: string) {
  if (!from || !to) return "—";
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ─── Status dropdown ───────────────────────────────────────────────────────
const STATUS_OPTIONS: Offense["status"][] = ["open", "closed", "false-positive"];

function StatusDropdown({
  current,
  onChange,
  loading,
}: {
  current: Offense["status"];
  onChange: (s: Offense["status"]) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-surface-border text-small text-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-60"
      >
        <StatusBadge status={current} />
        <ChevronDown className="w-3.5 h-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-surface-primary border border-surface-border rounded-lg shadow-lg z-50 overflow-hidden">
          {STATUS_OPTIONS.filter((s) => s !== current).map((s) => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-small text-secondary hover:bg-surface-tertiary transition-colors"
            >
              <StatusBadge status={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function OffenseDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [offense, setOffense]     = useState<Offense | null>(null);
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [loading, setLoading]     = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [notFound, setNotFound]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [o, a] = await Promise.all([
        offenseService.getOffense(id),
        offenseService.getOffenseAlerts(id),
      ]);
      if (cancelled) return;
      if (!o) { setNotFound(true); setLoading(false); return; }
      setOffense(o);
      setAlerts(a.sort((x, y) =>
        new Date(x["@timestamp"] ?? x.timestamp ?? 0).getTime() -
        new Date(y["@timestamp"] ?? y.timestamp ?? 0).getTime()
      ));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleStatusChange = async (newStatus: Offense["status"]) => {
    if (!offense) return;
    setStatusBusy(true);
    try {
      await offenseService.updateOffenseStatus(id, newStatus);
      setOffense((o) => o ? { ...o, status: newStatus } : o);
    } finally {
      setStatusBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-48 bg-surface-tertiary rounded animate-shimmer" />
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-surface-tertiary animate-shimmer" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-surface-tertiary animate-shimmer" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !offense) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
        <XCircle className="w-12 h-12 opacity-30" />
        <p className="text-body font-medium">Offense not found</p>
        <button onClick={() => router.push("/offenses")} className="text-small text-brand hover:underline">
          Back to offenses
        </button>
      </div>
    );
  }

  const duration = formatDuration(offense.timestamp, offense.lastUpdate);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-border shrink-0">
        <button
          onClick={() => router.push("/offenses")}
          className="flex items-center gap-1.5 text-small text-muted hover:text-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Offenses
        </button>
        <span className="text-muted/40">/</span>
        <span className="text-small text-secondary truncate max-w-[400px]">{offense.name}</span>
      </div>

      <div className="flex-1 grid grid-cols-[1fr_320px] gap-6 p-6 min-h-0">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 min-w-0">

          {/* Header card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-brand/10 shrink-0">
                  <Shield className="w-5 h-5 text-brand" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-h3 font-semibold text-primary leading-tight">{offense.name}</h1>
                  <p className="text-small text-muted mt-0.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Last updated {formatTime(offense.lastUpdate)}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <StatusDropdown
                  current={offense.status}
                  onChange={handleStatusChange}
                  loading={statusBusy}
                />
              </div>
            </div>
            <MagnitudeBar value={offense.magnitude} />
          </div>

          {/* Adversary card */}
          <div className="card p-5 space-y-3">
            <h2 className="text-body font-semibold text-primary flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted" />
              Adversary
            </h2>
            <div className="grid grid-cols-2 gap-4 text-small">
              <div>
                <p className="text-muted mb-0.5">IP Address</p>
                <p className="font-mono text-primary">{offense.adversary?.ip ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted mb-0.5">User</p>
                <p className="font-mono text-primary">{offense.adversary?.user ?? "—"}</p>
              </div>
              {offense.target?.ip && (
                <div>
                  <p className="text-muted mb-0.5">Target IP</p>
                  <p className="font-mono text-primary">{offense.target.ip}</p>
                </div>
              )}
            </div>
            {(offense.technique || offense.category) && (
              <div className="pt-2 border-t border-surface-border flex items-center gap-2 flex-wrap">
                <span className="text-small text-muted">MITRE</span>
                <MitreBadge
                  techniqueId={offense.technique}
                  tactic={offense.category}
                />
              </div>
            )}
          </div>

          {/* Alert timeline */}
          <div className="card p-5 flex-1">
            <h2 className="text-body font-semibold text-primary flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-muted" />
              Contributing Alerts
              <span className="ml-auto text-small text-muted font-normal">{alerts.length} events</span>
            </h2>
            {alerts.length === 0 ? (
              <p className="text-small text-muted py-4 text-center">No alert details available</p>
            ) : (
              <div className="space-y-0">
                {alerts.map((a, i) => <AlertRow key={a.id || i} alert={a} />)}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* KPI row */}
          <KpiTile label="Alert Count"     value={offense.alertCount} />
          <KpiTile label="Magnitude"       value={`${offense.magnitude}/10`} />
          <KpiTile label="Active Duration" value={duration} sub={`${formatTime(offense.timestamp)} → ${formatTime(offense.lastUpdate)}`} />

          {/* Data types */}
          {offense.dataTypes.length > 0 && (
            <div className="card p-4 space-y-2">
              <p className="text-small text-muted font-medium">Data Types</p>
              <div className="flex flex-wrap gap-1.5">
                {offense.dataTypes.map((dt) => (
                  <span key={dt} className="px-2 py-0.5 rounded text-small bg-surface-tertiary text-secondary font-medium">
                    {dt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="card p-4 space-y-2">
            <p className="text-small text-muted font-medium mb-3">Actions</p>
            <button
              onClick={() => handleStatusChange("closed")}
              disabled={statusBusy || offense.status === "closed"}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-small font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark Closed
            </button>
            <button
              onClick={() => handleStatusChange("false-positive")}
              disabled={statusBusy || offense.status === "false-positive"}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-small font-medium bg-surface-tertiary text-muted hover:bg-surface-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Mark False Positive
            </button>
            <button
              onClick={() => router.push(`/offenses?status=open`)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-small font-medium border border-surface-border text-secondary hover:bg-surface-tertiary transition-colors"
            >
              View All Alerts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
