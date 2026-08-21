import { useEffect, useMemo, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { getAlertSummary, getAlertTimeline } from './commandCenter.service';

import { HaChart } from '@/components/ha-chart';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import {
  foundationActivity,
  foundationHealth,
  foundationMetrics,
  foundationPriorityWork,
  foundationTrend,
  foundationWorkload,
  type FoundationMetric,
  type FoundationPriorityItem,
} from '@/pages/command-center/commandCenter.fixtures';
import type { IncidentListParams } from '@/services/incidents.service';
import { getIncidents } from '@/services/incidents.service';
import { useAuthStore } from '@/store/auth.store';

import './CommandCenterPage.css';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

function metricFromState(
  label: string,
  value: string,
  detail: string,
  state: FoundationMetric['state'],
  route: string
): FoundationMetric {
  return { label, value, detail, trend: 'Current operational state', state, route };
}

const TENANT_SCOPE_LABELS: Record<number, string> = {
  1: 'Acme',
  3812: 'Workmates1',
  3813: 'CWM',
  3814: 'Workmates2',
};

function formatTimelineHour(hour: string): string {
  const parsed = new Date(hour);
  if (Number.isNaN(parsed.getTime())) return hour;
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function CommandCenterPage(): JSX.Element {
  const queryClient = useQueryClient();
  useAlertStream();
  const { eps, connected: epsConnected } = useEpsStream();
  const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const incidentParams: IncidentListParams = { page: 0, size: 5, status: 'open', sort: 'createdAt,desc' };
  const scopeLabel = selectedTenantId === null ? 'All authorized tenants' : (TENANT_SCOPE_LABELS[selectedTenantId] ?? `Tenant ${String(selectedTenantId)}`);

  const summaryQuery = useQuery({
    queryKey: ['alerts', 'summary', selectedTenantId],
    queryFn: getAlertSummary,
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const incidentsQuery = useQuery({
    queryKey: ['incidents', incidentParams, selectedTenantId],
    queryFn: () => getIncidents(incidentParams),
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const timelineQuery = useQuery({
    queryKey: ['overview', 'alert-timeline', selectedTenantId],
    queryFn: () => getAlertTimeline(1),
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });

  useEffect(() => {
    document.title = 'Mission Control — HiveArmor';
  }, []);

  useEffect(() => {
    if (summaryQuery.data || incidentsQuery.data || timelineQuery.data) setLastUpdated(new Date());
  }, [incidentsQuery.data, summaryQuery.data, timelineQuery.data]);

  const productionMetrics = useMemo<FoundationMetric[]>(() => {
    const summary = summaryQuery.data;
    const incidents = incidentsQuery.data;
    const incidentItems = incidents?.items ?? [];
    const unassigned = incidentItems.filter((incident) => !incident.assignee).length;
    const criticalIncidents = incidentItems.filter((incident) => String(incident.severity).toLowerCase() === 'critical').length;
    const slaAtRisk = incidentItems.filter((incident) => {
      if (!incident.slaDueAt) return false;
      const remaining = new Date(incident.slaDueAt).getTime() - Date.now();
      return remaining > 0 && remaining < 30 * 60 * 1000;
    }).length;

    return [
      metricFromState('Critical open incidents', String(criticalIncidents), `${incidents?.total ?? 0} total open incidents`, criticalIncidents ? 'critical' : 'healthy', '/incidents'),
      metricFromState('Critical alert volume', String(summary?.critical ?? 0), 'Current severity summary', (summary?.critical ?? 0) ? 'high' : 'healthy', '/alerts'),
      metricFromState('SLA at risk', String(slaAtRisk), 'Due within 30 minutes', slaAtRisk ? 'high' : 'healthy', '/queue'),
      metricFromState('Unassigned cases', String(unassigned), 'Requires analyst ownership', unassigned ? 'info' : 'healthy', '/queue'),
      metricFromState('Detection visibility', summaryQuery.isError ? 'Unknown' : 'Available', 'Alert summary processing', summaryQuery.isError ? 'stale' : 'healthy', '/detection-rules'),
      metricFromState('Data ingestion', epsConnected ? 'Live' : 'Delayed', `${eps.toLocaleString()} events per second`, epsConnected ? 'healthy' : 'stale', '/posture/sensors'),
    ];
  }, [eps, epsConnected, incidentsQuery.data, summaryQuery.data, summaryQuery.isError]);

  const priorityWork = useMemo<FoundationPriorityItem[]>(() => {
    if (fixtureMode) return foundationPriorityWork;
    return (incidentsQuery.data?.items ?? []).map((incident) => ({
      id: `INC-${incident.id}`,
      title: incident.title,
      type: 'Incident',
      tenant: incident.tenant?.name ?? 'Current tenant',
      owner: incident.assignee ? `${incident.assignee.firstName} ${incident.assignee.lastName}`.trim() || incident.assignee.login : 'Unassigned',
      age: new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sla: incident.slaDueAt ? new Date(incident.slaDueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No SLA',
      severity: (['critical', 'high', 'medium'].includes(String(incident.severity).toLowerCase()) ? String(incident.severity).toLowerCase() : 'medium') as FoundationPriorityItem['severity'],
    }));
  }, [incidentsQuery.data]);

  const metrics = fixtureMode ? foundationMetrics : productionMetrics;
  const loading = !fixtureMode && (summaryQuery.isLoading || incidentsQuery.isLoading);
  const fullFailure = !fixtureMode && summaryQuery.isError && incidentsQuery.isError;
  const partialFailure = !fixtureMode && !fullFailure && (summaryQuery.isError || incidentsQuery.isError || timelineQuery.isError);

  const liveTrendOption = useMemo<EChartsOption>(() => {
    const buckets = timelineQuery.data ?? [];
    return {
      animation: typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, data: ['Low', 'Medium', 'High'] },
      grid: { top: 42, right: 16, bottom: 28, left: 44, containLabel: false },
      xAxis: { type: 'category', boundaryGap: false, data: buckets.map((point) => formatTimelineHour(point.hour)) },
      yAxis: { type: 'value', name: 'Alerts', min: 0 },
      series: [
        { name: 'Low', type: 'line', smooth: 0.22, showSymbol: false, stack: 'severity', areaStyle: { opacity: 0.12 }, data: buckets.map((point) => point.low) },
        { name: 'Medium', type: 'line', smooth: 0.22, showSymbol: false, stack: 'severity', areaStyle: { opacity: 0.12 }, data: buckets.map((point) => point.medium) },
        { name: 'High', type: 'line', smooth: 0.22, showSymbol: false, stack: 'severity', areaStyle: { opacity: 0.12 }, data: buckets.map((point) => point.high) },
      ],
    };
  }, [timelineQuery.data]);

  const fixtureTrendOption = useMemo<EChartsOption>(() => ({
    animation: typeof window.matchMedia !== 'function' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tooltip: { trigger: 'axis' },
    legend: { top: 0, right: 0, data: ['Alerts', 'Incidents'] },
    grid: { top: 42, right: 16, bottom: 28, left: 44, containLabel: false },
    xAxis: { type: 'category', boundaryGap: false, data: foundationTrend.map((point) => point.time) },
    yAxis: [
      { type: 'value', name: 'Alerts', min: 0 },
      { type: 'value', name: 'Incidents', min: 0, splitLine: { show: false } },
    ],
    series: [
      { name: 'Alerts', type: 'line', smooth: .22, showSymbol: false, areaStyle: { opacity: .08 }, data: foundationTrend.map((point) => point.alerts) },
      { name: 'Incidents', type: 'line', smooth: .22, yAxisIndex: 1, symbol: 'circle', symbolSize: 6, data: foundationTrend.map((point) => point.incidents) },
    ],
  }), []);

  const refresh = (): void => {
    setLastUpdated(new Date());
    void queryClient.invalidateQueries({ queryKey: ['alerts', 'summary'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    void queryClient.invalidateQueries({ queryKey: ['overview', 'alert-timeline'] });
  };

  return (
    <section className="mission-control" aria-labelledby="mission-control-title">
      <header className="mission-control__header">
        <div>
          <div className="mission-control__breadcrumb">Command / Mission Control</div>
          <h1 id="mission-control-title">Mission Control</h1>
          <p className="mission-control__subtitle">Prioritized risk, intervention work, telemetry health, and team capacity for the current shift.</p>
        </div>
        <div className="mission-control__toolbar" aria-label="Dashboard context and actions">
          <span className="mission-control__scope">{scopeLabel}</span>
          <span className="mission-control__time"><Clock3 size={13} aria-hidden="true" />Last 24 hours</span>
          <span className="mission-control__status" data-state={fixtureMode || epsConnected ? 'live' : 'delayed'}>{fixtureMode || epsConnected ? 'Live' : 'Delayed'} · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" className="mission-control__button" onClick={refresh}><RefreshCw size={13} aria-hidden="true" />Refresh</button>
        </div>
      </header>

      {fixtureMode && <div className="mission-control__demo"><span><strong>Demonstration data</strong> · Stable fictional records for visual validation only.</span><span>Northwind Financial · Meridian Health · Aegis Public Sector</span></div>}
      {!fixtureMode && !epsConnected && <div className="mission-control__demo" role="alert"><span><strong>Live feed delayed.</strong> Streaming telemetry is reconnecting; displayed data may be stale.</span><span>Automatic retry active</span></div>}
      {partialFailure && <div className="mission-control__demo" role="alert"><span><strong>Partial data unavailable.</strong> Available operational sources are still shown below.</span><button className="mission-control__button" type="button" onClick={refresh}>Retry</button></div>}

      <div className="mission-control__metrics" aria-label="Operational summary">
        {loading ? Array.from({ length: 6 }, (_, index) => <div className="mission-metric" key={index}><div className="mission-skeleton" /><div className="mission-skeleton" style={{ width: '58%', height: 30, marginTop: 18 }} /></div>) : metrics.map((metric) => (
          <article className="mission-metric" data-state={metric.state} key={metric.label}>
            <span className="mission-metric__label">{metric.label}</span>
            <strong className="mission-metric__value">{metric.value}</strong>
            <span className="mission-metric__detail">{metric.detail}</span>
            <span className="mission-metric__trend">{metric.trend}</span>
            <Link to={metric.route} aria-label={`Open ${metric.label}`} />
          </article>
        ))}
      </div>

      {fullFailure ? (
        <div className="mission-panel"><div className="mission-state"><ShieldCheck size={24} aria-hidden="true" /><p>Operational data could not be loaded. Verify connectivity and try again.</p><button className="mission-control__button mission-control__button--primary" type="button" onClick={refresh}>Retry dashboard</button></div></div>
      ) : (
        <div className="mission-control__grid">
          <article className="mission-panel">
            <header className="mission-panel__header"><div><h2>Alert volume by severity</h2><p>Hourly low, medium, and high alert counts from the live overview timeline. Incident promotion volume is not included in this contract.</p></div><span className="severity-badge" data-state="high">24-hour view</span></header>
            <div className="mission-panel__body">
              {fixtureMode ? <><HaChart option={fixtureTrendOption} height={300} ariaLabel="Alert and incident trend for the last 24 hours" ariaDescription="Alert volume peaks at 329 near 16:00. Incident volume peaks at 26 at the same time, indicating sustained investigation pressure." /><p className="mission-chart-summary">Peak pressure occurred at 16:00: 329 alerts produced 26 incidents. Escalation remains above the overnight baseline.</p></> : timelineQuery.isLoading ? <div className="mission-state">Loading alert timeline…</div> : timelineQuery.isError ? <div className="mission-state">Alert timeline could not be loaded. Live metrics remain active.</div> : (timelineQuery.data?.length ?? 0) === 0 ? <div className="mission-state">No alert volume was returned for the last 24 hours.</div> : <HaChart option={liveTrendOption} height={300} ariaLabel="Alert volume by severity for the last 24 hours" ariaDescription="Stacked low, medium, and high alert counts from the live overview timeline." />}
            </div>
          </article>

          <article className="mission-panel">
            <header className="mission-panel__header"><div><h2>Operational health</h2><p>Processing, coverage, readiness, and integration state.</p></div><Link to="/posture/sensors">View sensors</Link></header>
            <div className="mission-panel__body health-list">
              {(fixtureMode ? foundationHealth : [
                { label: 'Live data ingestion', value: epsConnected ? 'Connected' : 'Delayed', detail: `${eps.toLocaleString()} EPS`, state: epsConnected ? 'healthy' as const : 'stale' as const },
                { label: 'Alert summary service', value: summaryQuery.isError ? 'Unavailable' : 'Available', detail: 'Current alert counts', state: summaryQuery.isError ? 'high' as const : 'healthy' as const },
              ]).map((item) => {
                const numeric = Number.parseFloat(item.value);
                const width = Number.isFinite(numeric) ? Math.min(100, numeric) : item.state === 'healthy' ? 100 : 38;
                return <div className="health-row" data-state={item.state} key={item.label}><div><div className="health-row__top"><span>{item.label}</span><strong>{item.value}</strong></div><div className="health-row__track"><div className="health-row__fill" style={{ width: `${width}%` }} /></div></div><span className="health-row__detail">{item.detail}</span></div>;
              })}
            </div>
          </article>

          <article className="mission-panel mission-panel--span">
            <header className="mission-panel__header"><div><h2>Priority work stream</h2><p>Ranked by severity, SLA exposure, and current ownership.</p></div><Link to="/queue">Open analyst queue</Link></header>
            {incidentsQuery.isLoading && !fixtureMode ? <div className="mission-state">Loading priority work…</div> : priorityWork.length ? <ol className="priority-list">{priorityWork.map((item) => <li className="priority-item" key={item.id}><span className="severity-badge" data-state={item.severity}>{item.severity}</span><div className="priority-item__title"><strong>{item.title}</strong><span>{item.id} · {item.type}</span></div><div className="priority-item__meta"><strong>{item.tenant}</strong><span>{item.owner}</span></div><span className="priority-item__sla">SLA {item.sla}</span><Link to="/incidents">Open</Link></li>)}</ol> : <div className="mission-state">No open priority work is available for the current scope.</div>}
          </article>

          <article className="mission-panel">
            <header className="mission-panel__header"><div><h2>Analyst workload</h2><p>Assigned work, capacity, and SLA exposure.</p></div><Link to="/queue">Manage queue</Link></header>
            <div className="mission-panel__body workload-list">
              {fixtureMode ? foundationWorkload.map((analyst) => <div className="workload-row" key={analyst.name}><div className="workload-row__identity"><strong>{analyst.name}</strong><span>{analyst.assigned} assigned</span></div><div className="workload-row__track"><div className="workload-row__fill" style={{ width: `${analyst.utilization}%` }} /></div><span className="workload-row__risk">{analyst.risk} SLA risk</span></div>) : <div className="mission-state">Analyst-capacity data is not exposed by the current API contract.</div>}
            </div>
          </article>

          <article className="mission-panel">
            <header className="mission-panel__header"><div><h2>Recent activity</h2><p>Operational changes requiring shared shift awareness.</p></div><Link to="/incidents">View activity</Link></header>
            <div className="mission-panel__body activity-list">
              {fixtureMode ? foundationActivity.map((activity) => <div className="activity-row" data-state={activity.state} key={`${activity.action}-${activity.subject}`}><strong>{activity.action}</strong><p>{activity.subject}</p><span>{activity.actor} · {activity.time}</span></div>) : <div className="mission-state">Recent activity requires an audit-stream endpoint and is not represented by mock production data.</div>}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
