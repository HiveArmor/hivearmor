"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Zap } from "lucide-react";
import { overviewService, type OverviewStats } from "@/services/overview.service";
import { useEpsStream } from "@/hooks/useEpsStream";

function useStatusBarData() {
  const [stats, setStats] = useState<Pick<OverviewStats, "eps" | "criticalAlerts" | "highAlerts" | "mediumAlerts" | "collectorsOnline" | "collectorsTotal">>({
    eps: 0,
    criticalAlerts: 0,
    highAlerts: 0,
    mediumAlerts: 0,
    collectorsOnline: 0,
    collectorsTotal: 0,
  });

  useEffect(() => {
    let mounted = true;

    async function fetchStats() {
      const s = await overviewService.getStats();
      if (!mounted) return;
      setStats({
        eps:              s.eps,
        criticalAlerts:   s.criticalAlerts,
        highAlerts:       s.highAlerts,
        mediumAlerts:     s.mediumAlerts,
        collectorsOnline: s.collectorsOnline,
        collectorsTotal:  s.collectorsTotal,
      });
    }

    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return stats;
}

function UtcClock() {
  const [datetime, setDatetime] = useState<{ date: string; time: string }>({ date: "", time: "" });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const iso = now.toISOString();
      setDatetime({
        date: iso.slice(0, 10),
        time: iso.slice(11, 19) + " UTC",
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5 font-mono text-tiny tabular-nums">
      <span className="text-muted">{datetime.date}</span>
      <span className="w-px h-3 bg-surface-border" />
      <span className="text-secondary font-semibold">{datetime.time}</span>
    </div>
  );
}

function Sep() {
  return <div className="w-px h-3.5 bg-surface-border shrink-0" />;
}

export function StatusBar() {
  const stats = useStatusBarData();
  const { eps: liveEps, connected: epsLive } = useEpsStream(stats.eps);
  const displayEps = epsLive ? liveEps : stats.eps;

  const collectorsHealthy = stats.collectorsTotal > 0 && stats.collectorsOnline === stats.collectorsTotal;
  const epsStatus = displayEps > 500 ? "active" : displayEps > 0 ? "degraded" : "offline";

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 h-8 z-statusbar",
        "flex items-center px-3 gap-3 overflow-hidden select-none",
      )}
      style={{
        background: "linear-gradient(90deg, #070A1C 0%, #0A0E1F 60%, #070A1C 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Brand ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className="w-4 h-4 rounded flex items-center justify-center shrink-0"
          style={{ background: "var(--brand-primary)" }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M5 0.5L9 2.5V5.5C9 7.4 7.3 9.1 5 9.8C2.7 9.1 1 7.4 1 5.5V2.5L5 0.5Z" fill="white" fillOpacity="0.9"/>
          </svg>
        </div>
        <span
          className="text-micro font-bold tracking-[0.14em] uppercase"
          style={{ color: "var(--text-brand)" }}
        >
          HiveArmor
        </span>
      </div>

      <Sep />

      {/* ── LIVE badge ────────────────────────────────────── */}
      <div className="live-badge shrink-0">
        <span className="live-dot" />
        LIVE
      </div>

      <Sep />

      {/* ── EPS counter ───────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        title={epsLive ? "Live EPS (SSE)" : "Polled EPS"}
      >
        <Zap
          className={cn("w-3 h-3 shrink-0", epsLive ? "text-success" : "text-muted")}
          style={epsLive ? { filter: "drop-shadow(0 0 4px var(--color-ingesting-glow))" } : undefined}
        />
        <span className={cn(
          "text-small font-bold tabular-nums",
          epsStatus === "active"   && "eps-active",
          epsStatus === "degraded" && "eps-degraded",
          epsStatus === "offline"  && "eps-offline",
        )}>
          {displayEps.toLocaleString()}
        </span>
        <span className="text-micro font-medium" style={{ color: "var(--text-muted)" }}>EPS</span>
      </div>

      <Sep />

      {/* ── Severity alert chips ───────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {stats.criticalAlerts > 0 && (
          <Link
            href="/alerts?severity=critical"
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-bold transition-all",
              "bg-[var(--color-critical-subtle)] text-[var(--color-critical)]",
              "hover:bg-[var(--color-critical)]/20",
              "animate-data-pulse",
            )}
            style={{ border: "1px solid rgba(242,53,53,0.28)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-critical)" }} />
            {stats.criticalAlerts} CRIT
          </Link>
        )}
        {stats.highAlerts > 0 && (
          <Link
            href="/alerts?severity=high"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-bold transition-all bg-[var(--color-high-subtle)] text-[var(--color-high)] hover:bg-[var(--color-high)]/20"
            style={{ border: "1px solid rgba(245,158,11,0.28)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-high)" }} />
            {stats.highAlerts} HIGH
          </Link>
        )}
        {stats.mediumAlerts > 0 && (
          <Link
            href="/alerts?severity=medium"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-bold transition-all text-[var(--color-medium)] hover:opacity-80"
            style={{
              background: "var(--color-medium-subtle)",
              border: "1px solid rgba(251,191,36,0.22)",
            }}
          >
            {stats.mediumAlerts} MED
          </Link>
        )}
      </div>

      <Sep />

      {/* ── Collector health ───────────────────────────────── */}
      <Link
        href="/data-sources"
        className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
        title={`${stats.collectorsOnline}/${stats.collectorsTotal} collectors online`}
      >
        <div className="flex items-center gap-[2px]">
          {Array.from({ length: Math.min(Math.max(stats.collectorsTotal, 1), 10) }).map((_, i) => (
            <span
              key={i}
              className="w-1 h-3 rounded-sm transition-colors"
              style={{
                background: i < stats.collectorsOnline
                  ? "var(--color-ingesting)"
                  : "rgba(242, 53, 53, 0.4)",
                boxShadow: i < stats.collectorsOnline
                  ? "0 0 4px var(--color-ingesting-glow)"
                  : "none",
              }}
            />
          ))}
        </div>
        <span
          className="text-micro font-semibold"
          style={{ color: collectorsHealthy ? "var(--color-success)" : "var(--color-warning)" }}
        >
          {stats.collectorsOnline}/{stats.collectorsTotal}
        </span>
      </Link>

      {/* ── Spacer ────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── UTC Date + Time ───────────────────────────────── */}
      <UtcClock />
    </div>
  );
}
