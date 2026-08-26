/**
 * Mission Control — Command Center home (`/dashboard`)
 *
 * Job: Command center for detect → triage → investigate.
 * Honesty (STAGING CANDIDATE): KPI tiles and timeline use live overview / incident
 * contracts only. AI surfaces are assistive with explicit stub framing — never silent
 * autonomous action. Analyst-capacity and shift-activity feeds have no API yet.
 */

import { useEffect, useMemo, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  Brain,
  Clock3,
  ListOrdered,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  getAlertSummary,
  getAlertTimeline,
  getDetectionHealthSummary,
  getPostureScore,
} from './commandCenter.service';

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
import { getIncidents, getMissionControlIncidentKpis } from '@/services/incidents.service';
import { fetchSensors } from '@/services/sensorsService';
import { useAuthStore } from '@/store/auth.store';

import './CommandCenterPage.css';

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_USE_FOUNDATION_FIXTURES === 'true';

/** Priority work stream is a ranked sample — KPIs use population counts (A1-KPI-01). */
const PRIORITY_WORK_SAMPLE_SIZE = 5;

const JOB_SENTENCE =
  'Command center for detect → triage → investigate — situation, queues, and sensor posture for the current shift.';

const CTA_LINKS = [
  { to: '/queue', label: 'Queue', icon: ListOrdered, hint: 'Triage' },
  { to: '/alerts', label: 'Alerts', icon: Siren, hint: 'Detect' },
  { to: '/incidents', label: 'Incidents', icon: ShieldAlert, hint: 'Investigate' },
  { to: '/posture/sensors', label: 'Sensors', icon: Activity, hint: 'Fleet' },
] as const;

function metricFromState(
  label: string,
  value: string,
  detail: string,
  state: FoundationMetric['state'],
  route: string
): FoundationMetric {
  return { label, value, detail, trend: 'Live contract', state, route };
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
  const incidentParams: IncidentListParams = {
    page: 0,
    size: PRIORITY_WORK_SAMPLE_SIZE,
    status: 'open,in_progress',
    sort: 'createdAt,desc',
  };
  const scopeLabel =
    selectedTenantId === null
      ? 'All authorized tenants'
      : (TENANT_SCOPE_LABELS[selectedTenantId] ?? `Tenant ${String(selectedTenantId)}`);

  const summaryQuery = useQuery({
    queryKey: ['alerts', 'summary', selectedTenantId],
    queryFn: getAlertSummary,
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const incidentKpisQuery = useQuery({
    queryKey: ['incidents', 'mission-control-kpis', selectedTenantId],
    queryFn: ({ signal }) => getMissionControlIncidentKpis(signal),
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const incidentsQuery = useQuery({
    queryKey: ['incidents', 'priority-sample', incidentParams, selectedTenantId],
    queryFn: ({ signal }) => getIncidents(incidentParams, signal),
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const timelineQuery = useQuery({
    queryKey: ['overview', 'alert-timeline', selectedTenantId],
    queryFn: () => getAlertTimeline(1),
    refetchInterval: 30_000,
    enabled: !fixtureMode,
  });
  const sensorsQuery = useQuery({
    queryKey: ['sensors', 'mission-control-coverage', selectedTenantId],
    queryFn: async () => {
      const { sensors, total } = await fetchSensors({ size: 1000 });
      return { sensors, total };
    },
    refetchInterval: 60_000,
    enabled: !fixtureMode,
  });
  const detectionQuery = useQuery({
    queryKey: ['detection-health', 'mission-control', selectedTenantId],
    queryFn: getDetectionHealthSummary,
    refetchInterval: 5 * 60_000,
    enabled: !fixtureMode,
  });
  const postureQuery = useQuery({
    queryKey: ['posture', 'score', 'mission-control', selectedTenantId],
    queryFn: getPostureScore,
    refetchInterval: 5 * 60_000,
    enabled: !fixtureMode,
  });

  useEffect(() => {
    document.title = 'Mission Control — HiveArmor';
  }, []);

  useEffect(() => {
    if (
      summaryQuery.data ||
      incidentKpisQuery.data ||
      incidentsQuery.data ||
      timelineQuery.data ||
      sensorsQuery.data
    ) {
      setLastUpdated(new Date());
    }
  }, [
    incidentKpisQuery.data,
    incidentsQuery.data,
    sensorsQuery.data,
    summaryQuery.data,
    timelineQuery.data,
  ]);

  const productionMetrics = useMemo<FoundationMetric[]>(() => {
    const summary = summaryQuery.data;
    const kpis = incidentKpisQuery.data;
    const criticalIncidents = kpis?.criticalP1 ?? 0;
    const slaBreached = kpis?.slaBreached ?? 0;
    const unassigned = kpis?.unassigned ?? 0;
    const openTotal = kpis?.openTotal ?? 0;
    const kpiPartial = kpis?.partial === true || incidentKpisQuery.isError;
    const criticalAlerts = summary?.critical ?? 0;

    return [
      metricFromState(
        'Critical open incidents',
        incidentKpisQuery.isError ? '—' : String(criticalIncidents),
        kpiPartial
          ? `Partial · ${openTotal} active open/in-review`
          : `${openTotal} active open/in-review`,
        criticalIncidents ? 'critical' : 'healthy',
        '/incidents'
      ),
      metricFromState(
        'Critical alerts (7d)',
        summaryQuery.isError ? '—' : String(criticalAlerts),
        summaryQuery.isError
          ? 'Overview severity unavailable'
          : `${summary?.total ?? 0} alerts today (overview)`,
        criticalAlerts ? 'high' : 'healthy',
        '/alerts'
      ),
      metricFromState(
        'SLA breached',
        incidentKpisQuery.isError ? '—' : String(slaBreached),
        'Open/in-review with SLA breach',
        slaBreached ? 'high' : 'healthy',
        '/queue'
      ),
      metricFromState(
        'Unassigned cases',
        incidentKpisQuery.isError ? '—' : String(unassigned),
        'Requires analyst ownership',
        unassigned ? 'info' : 'healthy',
        '/queue'
      ),
    ];
  }, [incidentKpisQuery.data, incidentKpisQuery.isError, summaryQuery.data, summaryQuery.isError]);

  const priorityWork = useMemo<FoundationPriorityItem[]>(() => {
    if (fixtureMode) return foundationPriorityWork;
    return (incidentsQuery.data?.items ?? []).map((incident) => ({
      id: `INC-${incident.id}`,
      title: incident.title,
      type: 'Incident',
      tenant: incident.tenant?.name ?? 'Current tenant',
      owner: incident.assignee
        ? `${incident.assignee.firstName} ${incident.assignee.lastName}`.trim() ||
          incident.assignee.login
        : 'Unassigned',
      age: new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sla: incident.slaDueAt
        ? new Date(incident.slaDueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'No SLA',
      severity: (['critical', 'high', 'medium'].includes(String(incident.severity).toLowerCase())
        ? String(incident.severity).toLowerCase()
        : 'medium') as FoundationPriorityItem['severity'],
      route: `/incidents/${incident.id}`,
    }));
  }, [incidentsQuery.data]);

  const sensorSignal = useMemo(() => {
    if (fixtureMode) {
      return { online: 2942, offline: 70, unknown: 8, total: 3020, state: 'healthy' as const };
    }
    if (sensorsQuery.isError) {
      return { online: 0, offline: 0, unknown: 0, total: 0, state: 'stale' as const, error: true };
    }
    const rows = sensorsQuery.data?.sensors ?? [];
    const online = rows.filter((s) => s.connectionStatus === 'ONLINE').length;
    const offline = rows.filter((s) => s.connectionStatus === 'OFFLINE').length;
    const unknown = rows.filter((s) => s.connectionStatus === 'UNKNOWN').length;
    const total = sensorsQuery.data?.total ?? rows.length;
    const coverage = total > 0 ? online / total : 0;
    const state: FoundationMetric['state'] =
      total === 0 ? 'info' : coverage >= 0.8 ? 'healthy' : coverage >= 0.5 ? 'high' : 'critical';
    return { online, offline, unknown, total, state };
  }, [sensorsQuery.data, sensorsQuery.isError]);

  const metrics = fixtureMode ? foundationMetrics.slice(0, 4) : productionMetrics;
  const loading =
    !fixtureMode &&
    (summaryQuery.isLoading || incidentKpisQuery.isLoading || incidentsQuery.isLoading);
  const fullFailure =
    !fixtureMode && summaryQuery.isError && incidentKpisQuery.isError && incidentsQuery.isError;
  const partialFailure =
    !fixtureMode &&
    !fullFailure &&
    (summaryQuery.isError ||
      incidentKpisQuery.isError ||
      incidentKpisQuery.data?.partial === true ||
      incidentsQuery.isError ||
      timelineQuery.isError ||
      sensorsQuery.isError);

  const liveTrendOption = useMemo<EChartsOption>(() => {
    const buckets = timelineQuery.data ?? [];
    return {
      animation:
        typeof window.matchMedia !== 'function' ||
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, data: ['Low', 'Medium', 'High'] },
      grid: { top: 42, right: 16, bottom: 28, left: 44, containLabel: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: buckets.map((point) => formatTimelineHour(point.hour)),
      },
      yAxis: { type: 'value', name: 'Alerts', min: 0 },
      series: [
        {
          name: 'Low',
          type: 'line',
          smooth: 0.22,
          showSymbol: false,
          stack: 'severity',
          areaStyle: { opacity: 0.12 },
          data: buckets.map((point) => point.low),
        },
        {
          name: 'Medium',
          type: 'line',
          smooth: 0.22,
          showSymbol: false,
          stack: 'severity',
          areaStyle: { opacity: 0.12 },
          data: buckets.map((point) => point.medium),
        },
        {
          name: 'High',
          type: 'line',
          smooth: 0.22,
          showSymbol: false,
          stack: 'severity',
          areaStyle: { opacity: 0.12 },
          data: buckets.map((point) => point.high),
        },
      ],
    };
  }, [timelineQuery.data]);

  const fixtureTrendOption = useMemo<EChartsOption>(
    () => ({
      animation:
        typeof window.matchMedia !== 'function' ||
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      tooltip: { trigger: 'axis' },
      legend: { top: 0, right: 0, data: ['Alerts', 'Incidents'] },
      grid: { top: 42, right: 16, bottom: 28, left: 44, containLabel: false },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: foundationTrend.map((point) => point.time),
      },
      yAxis: [
        { type: 'value', name: 'Alerts', min: 0 },
        { type: 'value', name: 'Incidents', min: 0, splitLine: { show: false } },
      ],
      series: [
        {
          name: 'Alerts',
          type: 'line',
          smooth: 0.22,
          showSymbol: false,
          areaStyle: { opacity: 0.08 },
          data: foundationTrend.map((point) => point.alerts),
        },
        {
          name: 'Incidents',
          type: 'line',
          smooth: 0.22,
          yAxisIndex: 1,
          symbol: 'circle',
          symbolSize: 6,
          data: foundationTrend.map((point) => point.incidents),
        },
      ],
    }),
    []
  );

  const refresh = (): void => {
    setLastUpdated(new Date());
    void queryClient.invalidateQueries({ queryKey: ['alerts', 'summary'] });
    void queryClient.invalidateQueries({ queryKey: ['incidents'] });
    void queryClient.invalidateQueries({ queryKey: ['overview', 'alert-timeline'] });
    void queryClient.invalidateQueries({ queryKey: ['sensors', 'mission-control-coverage'] });
    void queryClient.invalidateQueries({ queryKey: ['detection-health'] });
    void queryClient.invalidateQueries({ queryKey: ['posture', 'score'] });
  };

  const prioritySampleLabel = fixtureMode
    ? 'Demonstration sample'
    : `Top ${PRIORITY_WORK_SAMPLE_SIZE} open sample · KPI tiles use population totals`;

  const ingestLabel = fixtureMode || epsConnected ? 'Live ingest' : 'Ingest delayed';
  const ingestDetail = fixtureMode
    ? '1.84M EPS (demo)'
    : `${eps.toLocaleString()} EPS · SSE ${epsConnected ? 'connected' : 'reconnecting'}`;

  return (
    <section className="mission-control" aria-labelledby="mission-control-title">
      <header className="mission-control__header">
        <div>
          <div className="mission-control__breadcrumb">Command / Mission Control</div>
          <h1 id="mission-control-title">Mission Control</h1>
          <p className="mission-control__subtitle">{JOB_SENTENCE}</p>
        </div>
        <div className="mission-control__toolbar" aria-label="Dashboard context and actions">
          <span className="mission-control__scope">{scopeLabel}</span>
          <span className="mission-control__time">
            <Clock3 size={13} aria-hidden="true" />
            Last 24 hours
          </span>
          <span
            className="mission-control__status"
            data-state={fixtureMode || epsConnected ? 'live' : 'delayed'}
          >
            {fixtureMode || epsConnected ? 'Live' : 'Delayed'} ·{' '}
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button type="button" className="mission-control__button" onClick={refresh}>
            <RefreshCw size={13} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <nav className="mission-control__cta" aria-label="Primary triage destinations">
        {CTA_LINKS.map(({ to, label, icon: Icon, hint }) => (
          <Link key={to} to={to} className="mission-control__cta-link">
            <Icon size={14} aria-hidden="true" />
            <span className="mission-control__cta-label">{label}</span>
            <span className="mission-control__cta-hint">{hint}</span>
          </Link>
        ))}
      </nav>

      {fixtureMode && (
        <div className="mission-control__demo">
          <span>
            <strong>Demonstration data</strong> · Stable fictional records for visual validation only.
          </span>
          <span>Northwind Financial · Meridian Health · Aegis Public Sector</span>
        </div>
      )}
      {!fixtureMode && !epsConnected && (
        <div className="mission-control__demo" role="alert">
          <span>
            <strong>Live feed delayed.</strong> Streaming telemetry is reconnecting; displayed data may
            be stale.
          </span>
          <span>Automatic retry active</span>
        </div>
      )}
      {partialFailure && (
        <div className="mission-control__demo" role="alert">
          <span>
            <strong>Partial data unavailable.</strong> Available operational sources are still shown
            below.
          </span>
          <button className="mission-control__button" type="button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      <div className="mission-control__metrics" aria-label="Operational summary">
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <div className="mission-metric" key={index}>
                <div className="mission-skeleton" />
                <div className="mission-skeleton" style={{ width: '58%', height: 30, marginTop: 18 }} />
              </div>
            ))
          : metrics.map((metric) => (
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
        <div className="mission-panel">
          <div className="mission-state">
            <ShieldCheck size={24} aria-hidden="true" />
            <p>Operational data could not be loaded. Verify connectivity and try again.</p>
            <button
              className="mission-control__button mission-control__button--primary"
              type="button"
              onClick={refresh}
            >
              Retry dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="mission-control__grid">
          <article className="mission-panel">
            <header className="mission-panel__header">
              <div>
                <h2>Alert volume by severity</h2>
                <p>
                  Hourly low / medium / high from <code>GET /api/overview/alert-timeline</code>. Incident
                  promotion volume is not in this contract.
                </p>
              </div>
              <span className="severity-badge" data-state="high">
                24-hour view
              </span>
            </header>
            <div className="mission-panel__body">
              {fixtureMode ? (
                <>
                  <HaChart
                    option={fixtureTrendOption}
                    height={300}
                    ariaLabel="Alert and incident trend for the last 24 hours"
                    ariaDescription="Alert volume peaks at 329 near 16:00. Incident volume peaks at 26 at the same time, indicating sustained investigation pressure."
                  />
                  <p className="mission-chart-summary">
                    Peak pressure occurred at 16:00: 329 alerts produced 26 incidents. Escalation remains
                    above the overnight baseline.
                  </p>
                </>
              ) : timelineQuery.isLoading ? (
                <div className="mission-state">Loading alert timeline…</div>
              ) : timelineQuery.isError ? (
                <div className="mission-state">
                  Alert timeline could not be loaded. Live metrics remain active.
                </div>
              ) : (timelineQuery.data?.length ?? 0) === 0 ? (
                <div className="mission-state">No alert volume was returned for the last 24 hours.</div>
              ) : (
                <HaChart
                  option={liveTrendOption}
                  height={300}
                  ariaLabel="Alert volume by severity for the last 24 hours"
                  ariaDescription="Stacked low, medium, and high alert counts from the live overview timeline."
                />
              )}
            </div>
          </article>

          <div className="mission-control__side">
            <article className="mission-panel">
              <header className="mission-panel__header">
                <div>
                  <h2>Sensor fleet</h2>
                  <p>Online / offline from agent inventory — not host containment status.</p>
                </div>
                <Link to="/posture/sensors">Open Sensors</Link>
              </header>
              <div className="mission-panel__body">
                {sensorsQuery.isLoading && !fixtureMode ? (
                  <div className="mission-state">Loading sensor coverage…</div>
                ) : 'error' in sensorSignal && sensorSignal.error ? (
                  <div className="mission-state">
                    Sensor inventory could not be loaded.{' '}
                    <Link to="/posture/sensors">Retry on Sensors</Link>
                  </div>
                ) : sensorSignal.total === 0 ? (
                  <div className="mission-state">
                    No sensors registered yet.{' '}
                    <Link to="/posture/sensors">Open Sensors fleet</Link>
                  </div>
                ) : (
                  <div className="sensor-signal" data-state={sensorSignal.state}>
                    <div className="sensor-signal__stat">
                      <strong>{sensorSignal.online}</strong>
                      <span>Online</span>
                    </div>
                    <div className="sensor-signal__stat">
                      <strong>{sensorSignal.offline}</strong>
                      <span>Offline</span>
                    </div>
                    <div className="sensor-signal__stat">
                      <strong>{sensorSignal.unknown}</strong>
                      <span>Unknown</span>
                    </div>
                    <p className="sensor-signal__meta">
                      {sensorSignal.total} registered · {ingestLabel}: {ingestDetail}
                    </p>
                  </div>
                )}
              </div>
            </article>

            <article className="mission-panel mission-panel--ai" aria-label="Hive Intelligence assistive">
              <header className="mission-panel__header">
                <div>
                  <h2>
                    <Brain size={14} aria-hidden="true" /> Hive Intelligence
                  </h2>
                  <p>Assistive evidence only — no silent autonomous action from this home.</p>
                </div>
                <span className="mission-stub-flag">STAGING CANDIDATE</span>
              </header>
              <div className="mission-panel__body ai-assist">
                <p>
                  SOC AI chat and IOC enrichment run on demand from Hive Intelligence. This surface does
                  not auto-execute models or mutate alerts/incidents.
                </p>
                <ul>
                  <li>Provenance: operator-initiated queries only</li>
                  <li>Confidence: review model output before acting</li>
                  <li>Authority: response playbooks stay gated by role</li>
                </ul>
                <div className="ai-assist__links">
                  <Link to="/intelligence">Open Hive Intelligence</Link>
                  <Link to="/investigations">Investigations</Link>
                </div>
              </div>
            </article>
          </div>

          <article className="mission-panel mission-panel--span">
            <header className="mission-panel__header">
              <div>
                <h2>Priority work stream</h2>
                <p>
                  Ranked open/in-review sample. {prioritySampleLabel}.
                </p>
              </div>
              <Link to="/queue">Open analyst queue</Link>
            </header>
            {incidentsQuery.isLoading && !fixtureMode ? (
              <div className="mission-state">Loading priority work…</div>
            ) : priorityWork.length ? (
              <ol className="priority-list">
                {priorityWork.map((item) => (
                  <li className="priority-item" key={item.id}>
                    <span className="severity-badge" data-state={item.severity}>
                      {item.severity}
                    </span>
                    <div className="priority-item__title">
                      <strong>{item.title}</strong>
                      <span>
                        {item.id} · {item.type}
                      </span>
                    </div>
                    <div className="priority-item__meta">
                      <strong>{item.tenant}</strong>
                      <span>{item.owner}</span>
                    </div>
                    <span className="priority-item__sla">SLA {item.sla}</span>
                    <Link to={item.route ?? '/incidents'}>Open</Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mission-state">
                No open priority work is available for the current scope.
              </div>
            )}
          </article>

          <article className="mission-panel mission-panel--span mission-panel--signals">
            <header className="mission-panel__header">
              <div>
                <h2>Posture &amp; detection signals</h2>
                <p>Live contracts only — stubs called out explicitly.</p>
              </div>
            </header>
            <div className="mission-signals">
              <div className="mission-signal">
                <span className="mission-signal__label">Data ingestion</span>
                <strong data-state={fixtureMode || epsConnected ? 'healthy' : 'stale'}>
                  {ingestLabel}
                </strong>
                <span>{ingestDetail}</span>
              </div>
              <div className="mission-signal">
                <span className="mission-signal__label">Active detection rules</span>
                {detectionQuery.isLoading && !fixtureMode ? (
                  <strong>—</strong>
                ) : detectionQuery.isError ? (
                  <>
                    <strong data-state="stale">Unavailable</strong>
                    <span>Correlation-rule count failed</span>
                  </>
                ) : (
                  <>
                    <strong data-state="healthy">
                      {fixtureMode
                        ? '—'
                        : `${detectionQuery.data?.activeRules ?? 0} / ${detectionQuery.data?.totalRules ?? 0}`}
                    </strong>
                    <span>
                      Active / total · <Link to="/detection-rules">Detection rules</Link>
                    </span>
                  </>
                )}
              </div>
              <div className="mission-signal">
                <span className="mission-signal__label">Defensive posture score</span>
                {postureQuery.isLoading && !fixtureMode ? (
                  <strong>—</strong>
                ) : postureQuery.isError ? (
                  <>
                    <strong data-state="stale">Unavailable</strong>
                    <span>Posture score endpoint failed</span>
                  </>
                ) : (
                  <>
                    <strong data-state="info">
                      {fixtureMode ? '—' : String(postureQuery.data?.overallScore ?? '—')}
                    </strong>
                    <span>
                      {fixtureMode
                        ? 'Demo mode'
                        : `${postureQuery.data?.trend ?? 'stable'} · `}
                      <Link to="/posture">Posture</Link>
                    </span>
                  </>
                )}
              </div>
              <div className="mission-signal mission-signal--stub">
                <span className="mission-signal__label">Analyst capacity</span>
                <strong data-state="stale">Stub</strong>
                <span>
                  No per-analyst capacity API ·{' '}
                  {fixtureMode ? `${foundationWorkload.length} demo rows` : 'queue depth via KPIs only'}
                </span>
              </div>
            </div>
            {fixtureMode && (
              <div className="mission-panel__body health-list">
                {foundationHealth.slice(0, 2).map((item) => {
                  const numeric = Number.parseFloat(item.value);
                  const width = Number.isFinite(numeric)
                    ? Math.min(100, numeric)
                    : item.state === 'healthy'
                      ? 100
                      : 38;
                  return (
                    <div className="health-row" data-state={item.state} key={item.label}>
                      <div>
                        <div className="health-row__top">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                        <div className="health-row__track">
                          <div className="health-row__fill" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                      <span className="health-row__detail">{item.detail}</span>
                    </div>
                  );
                })}
                <div className="activity-list">
                  {foundationActivity.slice(0, 2).map((activity) => (
                    <div
                      className="activity-row"
                      data-state={activity.state}
                      key={`${activity.action}-${activity.subject}`}
                    >
                      <strong>{activity.action}</strong>
                      <p>{activity.subject}</p>
                      <span>
                        {activity.actor} · {activity.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!fixtureMode && (
              <p className="mission-stub-note">
                Shift activity feed requires an audit-stream endpoint and is not mocked in production.
              </p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
