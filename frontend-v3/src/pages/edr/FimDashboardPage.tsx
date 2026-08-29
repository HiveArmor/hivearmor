/**
 * FimDashboardPage — T04 / Prompt 22 UX honesty
 *
 * File Integrity Monitoring analytics at /edr/fim.
 *
 * Layout:
 *   Identity chrome + filter bar + dashboard (≥50vh)
 *   Row 1: Changes Over Time — ECharts line chart
 *   Row 2 left: Top Changed Paths — ECharts horizontal bar chart
 *   Row 2 right: Suspicious Hashes — HTML table
 *
 * Summary-only API: GET /api/ha-edr/fim/summary — no row-level FIM event list.
 * Per-host investigation → /edr/endpoints; fleet enroll → /posture/sensors.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, Spinner } from '@patternfly/react-core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { ROUTES } from '@/constants/routes.constants';
import { useFimSummary } from '@/hooks/useFimSummary';
import { useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import { fetchSensors } from '@/services/sensorsService';
import { useAuthStore } from '@/store/auth.store';
import type { FimSummaryQuery, PathCountDTO, SuspiciousHashDTO, TimeSeriesPoint } from '@/types/edr';

import './FimDashboardPage.css';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

/** Matches nav + HaEdrFimResource PreAuthorize. */
const FIM_ACCESS_ROLES = ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'] as const;

/** Bundle-visible job sentence — analytics dashboard, not per-host inventory. */
export const FIM_DASHBOARD_JOB_SENTENCE =
  'File integrity analytics — review change trends, top modified paths, and suspicious hashes from endpoint FIM telemetry. Per-host investigation lives on Endpoints; fleet enrollment lives on Sensors.';

const CHANGE_TYPES = ['create', 'modify', 'delete', 'rename'] as const;
type ChangeType = (typeof CHANGE_TYPES)[number];

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  create: 'Create',
  modify: 'Modify',
  delete: 'Delete',
  rename: 'Rename',
};

const MAX_LABEL_LENGTH = 40;
const MAX_TOP_PATHS = 10;

function nowIso(): string {
  return new Date().toISOString();
}

function minus24hIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncatePath(path: string): string {
  if (path.length <= MAX_LABEL_LENGTH) return path;
  return `${path.slice(0, MAX_LABEL_LENGTH)}…`;
}

function truncateHash(hash: string, maxLen = 16): string {
  if (hash.length <= maxLen) return hash;
  return `${hash.slice(0, maxLen)}…`;
}

function countTotalChanges(points: TimeSeriesPoint[]): number {
  return points.reduce(
    (sum, point) => sum + point.create + point.modify + point.delete + point.rename,
    0,
  );
}

function isDefaultFilters(
  selectedAgents: string[],
  selectedChangeTypes: ChangeType[],
): boolean {
  return selectedAgents.length === 0 && selectedChangeTypes.length === 0;
}

function PanelSkeleton({ height }: { height: number }): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      className="fim-skeleton"
      style={{ height }}
    />
  );
}

interface ChangesOverTimeChartProps {
  data: TimeSeriesPoint[];
}

const TOKEN_KEYS_LINE = [
  '--ha-positive',
  '--ha-medium',
  '--ha-critical',
  '--ha-high',
  '--ha-surface-primary',
  '--ha-border',
  '--ha-text-primary',
  '--ha-text-secondary',
] as const;

function ChangesOverTimeChart({ data }: ChangesOverTimeChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const tokens = useHaThemeTokens(TOKEN_KEYS_LINE);

  const option = useMemo(() => {
    const timestamps = data.map((p) => p.timestamp);
    return {
      backgroundColor: tokens['--ha-surface-primary'],
      textStyle: { color: tokens['--ha-text-primary'], fontFamily: 'Inter, sans-serif' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tokens['--ha-surface-primary'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'] },
      },
      legend: {
        data: ['Create', 'Modify', 'Delete', 'Rename'],
        textStyle: { color: tokens['--ha-text-secondary'] },
        top: 4,
      },
      grid: { left: 48, right: 16, top: 40, bottom: 36, containLabel: true },
      xAxis: {
        type: 'category',
        data: timestamps,
        axisLabel: {
          color: tokens['--ha-text-secondary'],
          fontSize: 11,
          formatter: (val: string) => formatTimestamp(val),
        },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
        splitLine: { lineStyle: { color: tokens['--ha-border'], opacity: 0.4 } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11 },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
        splitLine: { lineStyle: { color: tokens['--ha-border'], opacity: 0.4 } },
      },
      series: [
        {
          name: 'Create',
          type: 'line',
          smooth: true,
          data: data.map((p) => p.create),
          lineStyle: { color: tokens['--ha-positive'] },
          itemStyle: { color: tokens['--ha-positive'] },
          symbol: 'circle',
          symbolSize: 4,
        },
        {
          name: 'Modify',
          type: 'line',
          smooth: true,
          data: data.map((p) => p.modify),
          lineStyle: { color: tokens['--ha-medium'] },
          itemStyle: { color: tokens['--ha-medium'] },
          symbol: 'circle',
          symbolSize: 4,
        },
        {
          name: 'Delete',
          type: 'line',
          smooth: true,
          data: data.map((p) => p.delete),
          lineStyle: { color: tokens['--ha-critical'] },
          itemStyle: { color: tokens['--ha-critical'] },
          symbol: 'circle',
          symbolSize: 4,
        },
        {
          name: 'Rename',
          type: 'line',
          smooth: true,
          data: data.map((p) => p.rename),
          lineStyle: { color: tokens['--ha-high'] },
          itemStyle: { color: tokens['--ha-high'] },
          symbol: 'circle',
          symbolSize: 4,
        },
      ],
    };
  }, [data, tokens]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    chart.setOption(option);

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} className="fim-chart-host" />;
}

interface TopChangedPathsChartProps {
  data: PathCountDTO[];
}

const TOKEN_KEYS_BAR = [
  '--ha-primary',
  '--ha-surface-primary',
  '--ha-border',
  '--ha-text-primary',
  '--ha-text-secondary',
] as const;

function TopChangedPathsChart({ data }: TopChangedPathsChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const tokens = useHaThemeTokens(TOKEN_KEYS_BAR);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.count - a.count).slice(0, MAX_TOP_PATHS),
    [data],
  );

  const option = useMemo(() => {
    const labels = sorted.map((p) => truncatePath(p.path));
    const fullPaths = sorted.map((p) => p.path);
    const counts = sorted.map((p) => p.count);

    return {
      backgroundColor: tokens['--ha-surface-primary'],
      textStyle: { color: tokens['--ha-text-primary'], fontFamily: 'Inter, sans-serif' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tokens['--ha-surface-primary'],
        borderColor: tokens['--ha-border'],
        textStyle: { color: tokens['--ha-text-primary'], fontSize: 12 },
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const arr = params as Array<{ dataIndex: number; value: number }>;
          const p = arr[0];
          const idx = p.dataIndex;
          return `<span style="font-family:JetBrains Mono,monospace;word-break:break-all">${fullPaths[idx]}</span><br/><b>${p.value} changes</b>`;
        },
      },
      grid: { left: 16, right: 48, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: tokens['--ha-text-secondary'], fontSize: 11 },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
        splitLine: { lineStyle: { color: tokens['--ha-border'], opacity: 0.4 } },
      },
      yAxis: {
        type: 'category',
        data: labels,
        inverse: true,
        axisLabel: {
          color: tokens['--ha-text-secondary'],
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          overflow: 'truncate',
          width: 160,
        },
        axisLine: { lineStyle: { color: tokens['--ha-border'] } },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: counts,
          itemStyle: { color: tokens['--ha-primary'], borderRadius: [0, 2, 2, 0] },
          label: {
            show: true,
            position: 'right',
            color: tokens['--ha-text-secondary'],
            fontSize: 11,
          },
        },
      ],
    };
  }, [sorted, tokens]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;
    chart.setOption(option);

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} className="fim-chart-host" />;
}

interface ThreatIntelBadgeProps {
  hit: boolean;
}

function ThreatIntelBadge({ hit }: ThreatIntelBadgeProps): JSX.Element {
  return (
    <span
      className={hit ? 'fim-threat-badge fim-threat-badge--hit' : 'fim-threat-badge fim-threat-badge--clean'}
    >
      {hit ? 'HIT' : 'CLEAN'}
    </span>
  );
}

interface SuspiciousHashesTableProps {
  data: SuspiciousHashDTO[];
}

function SuspiciousHashesTable({ data }: SuspiciousHashesTableProps): JSX.Element {
  return (
    <div className="fim-hashes-wrap">
      <table className="fim-hashes-table" aria-label="Suspicious file hashes">
        <thead>
          <tr>
            {['SHA-256 Hash', 'Filename', 'First Seen', 'Last Seen', 'Endpoints', 'Threat Intel'].map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={6} className="fim-hashes-table__empty">
                No suspicious hashes detected
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={row.sha256Hash}>
                <td
                  className="fim-hashes-table__mono fim-hashes-table__mono--muted"
                  title={row.sha256Hash}
                >
                  {truncateHash(row.sha256Hash)}
                </td>
                <td className="fim-hashes-table__mono">{row.filename}</td>
                <td className="fim-hashes-table__mono fim-hashes-table__mono--muted">
                  {formatTimestamp(row.firstSeen)}
                </td>
                <td className="fim-hashes-table__mono fim-hashes-table__mono--muted">
                  {formatTimestamp(row.lastSeen)}
                </td>
                <td className="fim-hashes-table__count">{row.endpointCount}</td>
                <td>
                  <ThreatIntelBadge hit={row.threatIntelHit} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface FilterBarProps {
  from: string;
  to: string;
  selectedAgents: string[];
  selectedChangeTypes: ChangeType[];
  agentList: Array<{ agentId: string; hostname: string }>;
  inlineStats: { totalChanges: number; pathCount: number; hashCount: number } | null;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onChangeTypesChange: (v: ChangeType[]) => void;
  onAgentsChange: (agents: string[]) => void;
}

function FilterBar({
  from,
  to,
  selectedAgents,
  selectedChangeTypes,
  agentList,
  inlineStats,
  onFromChange,
  onToChange,
  onChangeTypesChange,
  onAgentsChange,
}: FilterBarProps): JSX.Element {
  const handleTypeToggle = useCallback(
    (type: ChangeType) => {
      if (selectedChangeTypes.includes(type)) {
        onChangeTypesChange(selectedChangeTypes.filter((t) => t !== type));
      } else {
        onChangeTypesChange([...selectedChangeTypes, type]);
      }
    },
    [selectedChangeTypes, onChangeTypesChange],
  );

  return (
    <div className="fim-filter-bar" role="toolbar" aria-label="FIM summary filters">
      <div className="fim-filter-bar__group">
        <label className="fim-filter-bar__label" htmlFor="fim-from">From</label>
        <input
          id="fim-from"
          type="datetime-local"
          className="fim-filter-bar__input"
          value={from.slice(0, 16)}
          onChange={(e) => onFromChange(new Date(e.target.value).toISOString())}
          aria-label="From date"
        />
        <label className="fim-filter-bar__label" htmlFor="fim-to">To</label>
        <input
          id="fim-to"
          type="datetime-local"
          className="fim-filter-bar__input"
          value={to.slice(0, 16)}
          onChange={(e) => onToChange(new Date(e.target.value).toISOString())}
          aria-label="To date"
        />
      </div>

      <div className="fim-filter-bar__group">
        <label htmlFor="fim-agent-select" className="fim-filter-bar__label">
          Agents
        </label>
        <select
          id="fim-agent-select"
          className="fim-filter-bar__select"
          value={selectedAgents[0] ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onAgentsChange(v ? [v] : []);
          }}
          aria-label="Agent filter"
        >
          <option value="">All agents</option>
          {agentList.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.hostname}
            </option>
          ))}
        </select>
      </div>

      <div className="fim-filter-bar__types">
        <span className="fim-filter-bar__label">Types:</span>
        {CHANGE_TYPES.map((type) => {
          const active = selectedChangeTypes.length === 0 || selectedChangeTypes.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeToggle(type)}
              aria-pressed={active}
              className={
                active
                  ? 'fim-filter-bar__type-btn fim-filter-bar__type-btn--active'
                  : 'fim-filter-bar__type-btn'
              }
            >
              {CHANGE_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {inlineStats && (
        <div className="fim-filter-bar__stats" aria-label="FIM summary counts">
          <span>{inlineStats.totalChanges.toLocaleString()} changes</span>
          <span aria-hidden="true">·</span>
          <span>{inlineStats.pathCount.toLocaleString()} paths</span>
          <span aria-hidden="true">·</span>
          <span>{inlineStats.hashCount.toLocaleString()} hashes</span>
        </div>
      )}
    </div>
  );
}

export function FimDashboardPage(): JSX.Element {
  const hasAccess = useAuthStore((state) => state.hasAnyRole([...FIM_ACCESS_ROLES]));

  if (!hasAccess) {
    return (
      <div className="fim-page fim-page--denied" aria-label="FIM access denied">
        <AccessDeniedState
          title="Access Restricted"
          message="Required permission: Analyst, SOC Manager, or Platform Administrator"
        />
      </div>
    );
  }

  return <FimDashboardContent />;
}

function FimDashboardContent(): JSX.Element {
  const [from, setFrom] = useState<string>(minus24hIso);
  const [to, setTo] = useState<string>(nowIso);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedChangeTypes, setSelectedChangeTypes] = useState<ChangeType[]>([]);

  const [agentList, setAgentList] = useState<Array<{ agentId: string; hostname: string }>>([]);
  const [agentListError, setAgentListError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchSensors({ size: 1000 })
      .then(({ sensors }) => {
        if (cancelled) return;
        setAgentListError(null);
        setAgentList(sensors.map((a) => ({
          agentId: a.agentId,
          hostname: a.hostname,
        })));
      })
      .catch(() => {
        if (cancelled) return;
        setAgentList([]);
        setAgentListError('Agent filter list is unavailable. FIM summary still loads for all agents.');
      });
    return () => { cancelled = true; };
  }, []);

  const query = useMemo<FimSummaryQuery>(() => ({
    from,
    to,
    agentIds: selectedAgents.length > 0 ? selectedAgents : undefined,
    changeTypes: selectedChangeTypes.length > 0 ? selectedChangeTypes : undefined,
  }), [from, to, selectedAgents, selectedChangeTypes]);

  const { data, isLoading, isError, error } = useFimSummary(query);

  const changesOverTime = useMemo(() => data?.changesOverTime ?? [], [data?.changesOverTime]);
  const topPaths = useMemo(() => data?.topPaths ?? [], [data?.topPaths]);
  const suspiciousHashes = useMemo(() => data?.suspiciousHashes ?? [], [data?.suspiciousHashes]);

  const isEmpty =
    !isLoading &&
    !isError &&
    changesOverTime.length === 0 &&
    topPaths.length === 0 &&
    suspiciousHashes.length === 0;

  const showEmptyHonesty =
    isEmpty && isDefaultFilters(selectedAgents, selectedChangeTypes);

  const inlineStats = useMemo(() => {
    if (isLoading || isError || isEmpty) return null;
    return {
      totalChanges: countTotalChanges(changesOverTime),
      pathCount: topPaths.length,
      hashCount: suspiciousHashes.length,
    };
  }, [isLoading, isError, isEmpty, changesOverTime, topPaths, suspiciousHashes]);

  const errorMessage =
    error instanceof Error
      ? error.message
      : 'An error occurred while loading FIM summary data.';

  return (
    <section className="fim-page" aria-label="File integrity monitoring">
      <header className="fim-page__identity">
        <span className="fim-page__icon">
          <Shield size={20} aria-hidden="true" />
        </span>
        <div className="fim-page__title">
          <div className="fim-page__eyebrow">
            <small>DEFEND</small>
            <span className="fim-page__badge">STAGING CANDIDATE</span>
          </div>
          <h1>File Integrity Monitoring</h1>
          <p className="fim-page__job">{FIM_DASHBOARD_JOB_SENTENCE}</p>
          {agentListError && (
            <p className="fim-page__projection-note" role="note">
              {agentListError} Summary API: GET /api/ha-edr/fim/summary — no row-level FIM event inventory on this page.
            </p>
          )}
        </div>
        <div className="fim-page__identity-actions">
          {isLoading && <Spinner size="sm" aria-label="Loading FIM data" />}
        </div>
      </header>

      <p className="fim-page__meta">
        <Link to={ROUTES.SENSORS}>Sensors</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.EDR_ENDPOINTS}>Endpoints</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.EDR_POLICIES}>Agent Policies</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.RESPONSE_QUARANTINE}>Quarantine</Link>
        <span aria-hidden="true">·</span>
        <Link to={ROUTES.SEARCH}>Search</Link>
        <span aria-hidden="true">·</span>
        <span className="fim-page__access">Analyst · SOC Manager · Platform Administrator</span>
      </p>

      {showEmptyHonesty && (
        <div className="fim-page__honesty" role="status" data-testid="fim-empty-honesty">
          <strong>No FIM summary data for the selected window.</strong>
          <span>
            Empty change trends do not imply platform health — agents may lack FIM policy paths or telemetry has not arrived yet. Adjust filters or verify policy assignment on Agent Policies.
          </span>
        </div>
      )}

      <FilterBar
        from={from}
        to={to}
        selectedAgents={selectedAgents}
        selectedChangeTypes={selectedChangeTypes}
        agentList={agentList}
        inlineStats={inlineStats}
        onFromChange={setFrom}
        onToChange={setTo}
        onChangeTypesChange={setSelectedChangeTypes}
        onAgentsChange={setSelectedAgents}
      />

      {isError && (
        <div className="fim-page__error">
          <Alert variant="danger" isInline title="Failed to load FIM data">
            {errorMessage}
          </Alert>
        </div>
      )}

      <div className="fim-dashboard" aria-label="FIM analytics dashboard">
        <div className="fim-panel">
          <div className="fim-panel__title">Changes Over Time</div>
          <div className="fim-panel__chart">
            {isLoading ? (
              <PanelSkeleton height={240} />
            ) : (
              <ChangesOverTimeChart data={changesOverTime} />
            )}
          </div>
        </div>

        <div className="fim-panel-row">
          <div className="fim-panel fim-panel--scroll">
            <div className="fim-panel__title">Top Changed Paths</div>
            <div className="fim-panel__body fim-panel__body--chart">
              {isLoading ? (
                <PanelSkeleton height={240} />
              ) : (
                <TopChangedPathsChart data={topPaths} />
              )}
            </div>
          </div>

          <div className="fim-panel fim-panel--scroll">
            <div className="fim-panel__title">Suspicious Hashes</div>
            <div className="fim-panel__body">
              {isLoading ? (
                <PanelSkeleton height={240} />
              ) : (
                <SuspiciousHashesTable data={suspiciousHashes} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
