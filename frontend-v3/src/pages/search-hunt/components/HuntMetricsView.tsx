import { lazy, Suspense, useMemo } from 'react';

import type { EChartsOption } from 'echarts';

import type { HuntEvent, HuntSeverity } from '../searchHunt.types';

import './HuntMetricsView.css';

const LazyHaChart = lazy(() => import('@/components/ha-chart/HaChart').then((m) => ({ default: m.HaChart })));

export interface HuntMetricsViewProps {
  /** The loaded result set to aggregate. Metrics summarise THESE rows, never invented data. */
  events: HuntEvent[];
  /** Total matched (may exceed loaded rows) — surfaced honestly so the summary scope is clear. */
  totalApproximate?: number;
  totalIsExact?: boolean;
  /** Narrow the search to a field:value (segmented breakdown click → drill down). */
  onDrill?: (field: string, value: string) => void;
}

/** Resolve a CSS token to its computed hex so ECharts (canvas) can use it. */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const SEVERITY_ORDER: HuntSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

function topN(events: HuntEvent[], pick: (e: HuntEvent) => string | null, n = 8): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = pick(e);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
}

/**
 * Metric / aggregation view over the CURRENT result set (Splunk Statistics/Visualization model).
 * A raw event list can't become an arbitrary chart, so this summarises the loaded rows: KPI tiles +
 * top-N breakdowns by severity / source / action / host / user. Every number is derived from the
 * rows in hand — nothing is fabricated, and the scope ("summarising N loaded rows") is stated.
 */
export function HuntMetricsView({ events, totalApproximate, totalIsExact, onDrill }: HuntMetricsViewProps): JSX.Element {
  const stats = useMemo(() => {
    const loaded = events.length;
    const bySeverity = new Map<HuntSeverity, number>();
    let alerting = 0;
    const hosts = new Set<string>();
    const users = new Set<string>();
    for (const e of events) {
      bySeverity.set(e.severity, (bySeverity.get(e.severity) ?? 0) + 1);
      if (e.alertCount > 0) alerting += 1;
      if (e.host) hosts.add(e.host);
      if (e.user) users.add(e.user);
    }
    return {
      loaded,
      alerting,
      distinctHosts: hosts.size,
      distinctUsers: users.size,
      severity: SEVERITY_ORDER.map((s) => ({ name: s, value: bySeverity.get(s) ?? 0 })).filter((r) => r.value > 0),
      bySource: topN(events, (e) => e.dataSource),
      byAction: topN(events, (e) => e.action),
      byHost: topN(events, (e) => e.host),
      byUser: topN(events, (e) => e.user),
    };
  }, [events]);

  const barColor = token('--ha-action-primary', '#61C4BE');
  const axisColor = token('--ha-foreground-tertiary', '#908C96');
  const gridLine = token('--ha-border-subtle', '#282931');
  const sevColors: Record<string, string> = {
    critical: token('--ha-severity-critical', '#FF6677'),
    high: token('--ha-severity-high', '#F2AD5B'),
    medium: token('--ha-severity-medium', '#E3C64C'),
    low: token('--ha-severity-low', '#63C79A'),
    info: token('--ha-severity-info', '#8B90FF'),
  };

  const horizontalBar = (rows: { name: string; value: number }[], color: string, colorByName = false): EChartsOption => ({
    grid: { left: 4, right: 28, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: axisColor, fontSize: 10 }, splitLine: { lineStyle: { color: gridLine } } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((r) => r.name),
      axisLabel: { color: axisColor, fontSize: 10, fontFamily: 'var(--ha-font-mono)' },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridLine } },
    },
    series: [{
      type: 'bar',
      data: rows.map((r) => ({ value: r.value, name: r.name, itemStyle: { color: colorByName ? (sevColors[r.name] ?? color) : color, borderRadius: [0, 3, 3, 0] } })),
      barMaxWidth: 16,
      label: { show: true, position: 'right', color: axisColor, fontSize: 10 },
    }],
    tooltip: { trigger: 'item' },
  });

  const onBarClick = (field: string) => (params: unknown) => {
    const name = (params as { name?: string })?.name;
    if (name && onDrill) onDrill(field, name);
  };

  if (events.length === 0) {
    return <div className="hunt-metrics hunt-metrics--empty" role="status">No rows loaded to summarise. Run a search to see metrics.</div>;
  }

  const scopeNote = totalApproximate && totalApproximate > stats.loaded
    ? `Summarising the ${stats.loaded.toLocaleString()} loaded rows of ${totalIsExact ? '' : '~'}${totalApproximate.toLocaleString()} matched — narrow the query for a full-set summary.`
    : `Summarising all ${stats.loaded.toLocaleString()} matched rows.`;

  return (
    <div className="hunt-metrics" aria-label="Result metrics">
      <p className="hunt-metrics__scope" role="note">{scopeNote}</p>

      <div className="hunt-metrics__kpis">
        <div className="hunt-metrics__kpi"><span className="hunt-metrics__kpi-value">{stats.loaded.toLocaleString()}</span><span className="hunt-metrics__kpi-label">Events</span></div>
        <div className="hunt-metrics__kpi"><span className="hunt-metrics__kpi-value" data-tone="alert">{stats.alerting.toLocaleString()}</span><span className="hunt-metrics__kpi-label">With alerts</span></div>
        <div className="hunt-metrics__kpi"><span className="hunt-metrics__kpi-value">{stats.distinctHosts.toLocaleString()}</span><span className="hunt-metrics__kpi-label">Distinct hosts</span></div>
        <div className="hunt-metrics__kpi"><span className="hunt-metrics__kpi-value">{stats.distinctUsers.toLocaleString()}</span><span className="hunt-metrics__kpi-label">Distinct users</span></div>
      </div>

      <div className="hunt-metrics__grid">
        <section className="hunt-metrics__panel">
          <h3>By severity</h3>
          <Suspense fallback={<div className="hunt-chart-skeleton" />}>
            <LazyHaChart option={horizontalBar(stats.severity, barColor, true)} height={Math.max(90, stats.severity.length * 26)} onChartClick={onBarClick('severity')} ariaLabel="Events by severity" />
          </Suspense>
        </section>
        <section className="hunt-metrics__panel">
          <h3>Top sources</h3>
          <Suspense fallback={<div className="hunt-chart-skeleton" />}>
            <LazyHaChart option={horizontalBar(stats.bySource, barColor)} height={Math.max(90, stats.bySource.length * 26)} onChartClick={onBarClick('dataSource')} ariaLabel="Events by source" />
          </Suspense>
        </section>
        <section className="hunt-metrics__panel">
          <h3>Top actions</h3>
          <Suspense fallback={<div className="hunt-chart-skeleton" />}>
            <LazyHaChart option={horizontalBar(stats.byAction, barColor)} height={Math.max(90, stats.byAction.length * 26)} onChartClick={onBarClick('action')} ariaLabel="Events by action" />
          </Suspense>
        </section>
        <section className="hunt-metrics__panel">
          <h3>Top hosts</h3>
          <Suspense fallback={<div className="hunt-chart-skeleton" />}>
            <LazyHaChart option={horizontalBar(stats.byHost, barColor)} height={Math.max(90, stats.byHost.length * 26)} onChartClick={onBarClick('host')} ariaLabel="Events by host" />
          </Suspense>
        </section>
        <section className="hunt-metrics__panel">
          <h3>Top users</h3>
          <Suspense fallback={<div className="hunt-chart-skeleton" />}>
            <LazyHaChart option={horizontalBar(stats.byUser, barColor)} height={Math.max(90, stats.byUser.length * 26)} onChartClick={onBarClick('user')} ariaLabel="Events by user" />
          </Suspense>
        </section>
      </div>
    </div>
  );
}
