"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, generateSparkData } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";
import { AlertSeverityDonut } from "@/components/dashboard/alert-severity-donut";
import { AlertTimelineHeatmap } from "@/components/dashboard/alert-timeline-heatmap";
import { MitreTacticsBar } from "@/components/dashboard/mitre-tactics-bar";
import { GeoThreatMap } from "@/components/dashboard/geo-threat-map";
import { TopAlertSources } from "@/components/dashboard/top-alert-sources";
import { CriticalAlertsFeed } from "@/components/dashboard/critical-alerts-feed";
import { CollectorHealthMatrix } from "@/components/dashboard/collector-health-matrix";
import {
  overviewService,
  type OverviewStats,
  type AlertTimePoint,
  type TopSource,
  type CollectorRow,
  type CriticalAlert,
  type GeoThreatPoint,
  type MitreTacticCount,
} from "@/services/overview.service";
import { Activity, AlertTriangle, Siren, Clock, RefreshCw, Database } from "lucide-react";

interface DashboardData {
  stats:          OverviewStats | null;
  timeline:       AlertTimePoint[];
  sources:        TopSource[];
  collectors:     CollectorRow[];
  criticalAlerts: CriticalAlert[];
  geoThreats:     GeoThreatPoint[];
  mitreTactics:   MitreTacticCount[];
}

const EMPTY: DashboardData = {
  stats: null, timeline: [], sources: [],
  collectors: [], criticalAlerts: [], geoThreats: [], mitreTactics: [],
};

function useSparklines() {
  const [sparks] = useState(() => ({
    events:    generateSparkData(24, "up"),
    alerts:    generateSparkData(24, "flat"),
    incidents: generateSparkData(24, "flat"),
    mttr:      generateSparkData(24, "down"),
    sources:   generateSparkData(24, "flat"),
  }));
  return sparks;
}

/** Small dot-separated section header, like "● THREAT POSTURE — LAST 24H" */
function SectionHeader({
  label,
  rightSlot,
}: {
  label: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="section-label flex-1">{label}</div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const sparks = useSparklines();

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [stats, timeline, sources, collectors, criticalAlerts, geoThreats, mitreTactics] =
      await Promise.all([
        overviewService.getStats(),
        overviewService.getAlertTimeline(),
        overviewService.getTopSources(),
        overviewService.getCollectors(),
        overviewService.getCriticalAlerts(),
        overviewService.getGeoThreats(),
        overviewService.getMitreTactics(),
      ]);

    setData({ stats, timeline, sources, collectors, criticalAlerts, geoThreats, mitreTactics });
    setLastRefresh(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(() => loadAll(true), 30_000);
    return () => clearInterval(id);
  }, [loadAll]);

  const s = data.stats;
  const criticalCount = s?.criticalAlerts ?? 0;
  const unackCount = criticalCount + (s?.highAlerts ?? 0);

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-bold text-primary"
            style={{ fontSize: "1.4rem", letterSpacing: "-0.02em" }}
          >
            Security Operations
          </h1>
          <p className="text-tiny mt-0.5" style={{ color: "var(--text-muted)" }}>
            Mission Control — Real-time threat posture
          </p>
        </div>
        <button
          onClick={() => loadAll(true)}
          disabled={refreshing}
          className="btn btn-sm btn-secondary gap-2"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          <span className="text-tiny">
            {refreshing
              ? "Refreshing…"
              : `Updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            }
          </span>
        </button>
      </div>

      {/* ── Section: Threat Posture ───────────────────────────── */}
      <SectionHeader
        label="THREAT POSTURE — LAST 24H"
        rightSlot={
          criticalCount > 0 ? (
            <span className="count-badge-critical">
              <span
                className="w-1.5 h-1.5 rounded-full animate-data-pulse"
                style={{ background: "var(--color-critical)" }}
              />
              {criticalCount} CRITICAL
            </span>
          ) : undefined
        }
      />

      {/* ── KPI Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Events Ingested"
          value={s?.totalEvents24h ?? 0}
          delta={s?.totalEvents24hDelta}
          invertDelta={false}
          sparkData={sparks.events}
          sparkColor="var(--brand-primary)"
          accentColor="var(--brand-primary)"
          icon={<Activity className="w-4 h-4" />}
          href="/logs"
          loading={loading}
        />
        <KpiCard
          label="Active Alerts"
          value={s?.activeAlerts ?? 0}
          delta={s?.activeAlertsDelta}
          invertDelta={true}
          sparkData={sparks.alerts}
          sparkColor="var(--color-high)"
          accentColor="var(--color-high)"
          icon={<AlertTriangle className="w-4 h-4" />}
          href="/alerts"
          loading={loading}
        />
        <KpiCard
          label="Open Incidents"
          value={s?.openIncidents ?? 0}
          sparkData={sparks.incidents}
          sparkColor="var(--color-medium)"
          accentColor="var(--color-medium)"
          icon={<Siren className="w-4 h-4" />}
          href="/incidents"
          loading={loading}
        />
        <KpiCard
          label="Mean Time to Respond"
          value={s?.mttrMinutes ?? 0}
          suffix="min"
          delta={s?.mttrDelta}
          invertDelta={true}
          sparkData={sparks.mttr}
          sparkColor="var(--color-success)"
          accentColor="var(--color-success)"
          icon={<Clock className="w-4 h-4" />}
          loading={loading}
        />
        <KpiCard
          label="Sources Active"
          value={s?.collectorsOnline ?? 0}
          subtitle={s ? `${s.collectorsOnline} / ${s.collectorsTotal} online` : undefined}
          sparkData={sparks.sources}
          sparkColor="var(--color-low)"
          accentColor="var(--color-low)"
          icon={<Database className="w-4 h-4" />}
          href="/data-sources"
          loading={loading}
        />
      </div>

      {/* ── Section: Severity + Heatmap ───────────────────────── */}
      <SectionHeader label="SEVERITY DISTRIBUTION  ·  ALERT HEATMAP — 7 DAYS" />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3">
        <AlertSeverityDonut
          critical={s?.criticalAlerts ?? 0}
          high={s?.highAlerts ?? 0}
          medium={s?.mediumAlerts ?? 0}
          low={s?.lowAlerts ?? 0}
          loading={loading}
          className="h-full"
        />
        <AlertTimelineHeatmap
          data={data.timeline}
          loading={loading}
        />
      </div>

      {/* ── Section: MITRE + Geo ──────────────────────────────── */}
      <SectionHeader
        label="MITRE ATT&CK TACTICS  ·  GEO THREAT ORIGIN"
        rightSlot={
          data.mitreTactics.length > 0 ? (
            <span className="count-badge-muted">
              {data.mitreTactics.filter(t => t.count > 0).length} ACTIVE
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ minHeight: 300 }}>
        <MitreTacticsBar
          data={data.mitreTactics}
          loading={loading}
          className="h-full"
        />
        <GeoThreatMap
          data={data.geoThreats}
          loading={loading}
          className="h-full"
        />
      </div>

      {/* ── Section: Sources + Critical alerts ────────────────── */}
      <SectionHeader
        label="TOP ALERT SOURCES  ·  LIVE CRITICAL ALERTS"
        rightSlot={
          unackCount > 0 ? (
            <span className="count-badge-critical">
              {unackCount} UNACK
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" style={{ minHeight: 340 }}>
        <TopAlertSources
          data={data.sources}
          loading={loading}
          className="h-full"
        />
        <CriticalAlertsFeed
          data={data.criticalAlerts}
          loading={loading}
          className="h-full"
        />
      </div>

      {/* ── Section: Collector matrix ─────────────────────────── */}
      <SectionHeader label="DATA COLLECTOR HEALTH" />

      <CollectorHealthMatrix
        data={data.collectors}
        loading={loading}
      />
    </div>
  );
}
