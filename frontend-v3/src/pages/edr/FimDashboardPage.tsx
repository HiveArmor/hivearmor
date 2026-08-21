/**
 * FimDashboardPage — T04
 *
 * File Integrity Monitoring Dashboard at /edr/fim.
 *
 * Layout:
 *   Row 1 (full width): Changes Over Time — ECharts line chart
 *   Row 2 left half:    Top Changed Paths — ECharts horizontal bar chart
 *   Row 2 right half:   Suspicious Hashes — HTML table
 *
 * Key constraints:
 *   - No `any` type annotations
 *   - No raw hex colour literals
 *   - No `var(--ha-*)` strings passed into ECharts — always resolve via
 *     useHaThemeTokens / resolveHaToken at render time
 *   - ECharts instances disposed on unmount
 *   - No absolute backend URLs
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { Shield } from 'lucide-react';

import { useFimSummary } from '@/hooks/useFimSummary';
import { resolveHaToken, useHaThemeTokens } from '@/hooks/useHaThemeTokens';
import type { FimSummaryQuery, PathCountDTO, SuspiciousHashDTO, TimeSeriesPoint } from '@/types/edr';

// Register only the ECharts modules we use to keep bundle size down
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function PanelSkeleton({ height }: { height: number }): JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading chart"
      style={{
        height,
        background: 'var(--ha-surface-raised)',
        borderRadius: 4,
        animation: 'ha-fim-pulse 1.4s ease-in-out infinite',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Changes Over Time chart (Row 1, full width)
// ---------------------------------------------------------------------------

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

  // Resolve tokens. The array reference is stable (const literal) — useMemo
  // with [tokens] dep below won't thrash.
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
  }, []); // init once — option updates handled by the second effect below

  // Update option without reinitialising
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ---------------------------------------------------------------------------
// Top Changed Paths chart (Row 2 left half)
// ---------------------------------------------------------------------------

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

  // Sort descending, take top 10
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
  }, []); // init once

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option);
    }
  }, [option]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ---------------------------------------------------------------------------
// Threat Intel badge
// ---------------------------------------------------------------------------

interface ThreatIntelBadgeProps {
  hit: boolean;
}

function ThreatIntelBadge({ hit }: ThreatIntelBadgeProps): JSX.Element {
  // Resolve at render time — never pass var(--ha-*) into inline styles that
  // would forward to an ECharts option. Here it's a plain HTML element so
  // resolveHaToken is used for correctness per the ECharts_Colour_Resolution
  // invariant (applying consistently across all EDR components).
  const bg = hit ? resolveHaToken('--ha-critical') : resolveHaToken('--ha-positive');
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        background: bg,
        color: 'var(--ha-background)',
        lineHeight: '20px',
      }}
    >
      {hit ? 'HIT' : 'CLEAN'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Suspicious Hashes table (Row 2 right half)
// ---------------------------------------------------------------------------

interface SuspiciousHashesTableProps {
  data: SuspiciousHashDTO[];
}

function SuspiciousHashesTable({ data }: SuspiciousHashesTableProps): JSX.Element {
  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          color: 'var(--ha-text-primary)',
          fontFamily: 'Inter, sans-serif',
        }}
        aria-label="Suspicious file hashes"
      >
        <thead>
          <tr
            style={{
              position: 'sticky',
              top: 0,
              background: 'var(--ha-surface-raised)',
              zIndex: 1,
            }}
          >
            {['SHA-256 Hash', 'Filename', 'First Seen', 'Last Seen', 'Endpoints', 'Threat Intel'].map((col) => (
              <th
                key={col}
                style={{
                  padding: '6px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ha-text-secondary)',
                  borderBottom: '1px solid var(--ha-border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: '24px 12px',
                  textAlign: 'center',
                  color: 'var(--ha-text-secondary)',
                  fontStyle: 'italic',
                }}
              >
                No suspicious hashes detected
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={row.sha256Hash}
                style={{
                  borderBottom: '1px solid var(--ha-border)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'var(--ha-surface-raised)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'transparent';
                }}
              >
                <td
                  style={{
                    padding: '5px 12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    color: 'var(--ha-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.sha256Hash}
                >
                  {truncateHash(row.sha256Hash)}
                </td>
                <td style={{ padding: '5px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  {row.filename}
                </td>
                <td
                  style={{
                    padding: '5px 12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--ha-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTimestamp(row.firstSeen)}
                </td>
                <td
                  style={{
                    padding: '5px 12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--ha-text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTimestamp(row.lastSeen)}
                </td>
                <td
                  style={{
                    padding: '5px 12px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 12,
                    color: 'var(--ha-text-primary)',
                  }}
                >
                  {row.endpointCount}
                </td>
                <td style={{ padding: '5px 12px' }}>
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

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  from: string;
  to: string;
  selectedAgents: string[];
  selectedChangeTypes: ChangeType[];
  agentList: Array<{ agentId: string; hostname: string }>;
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
    <div
      style={{
        padding: '8px 24px',
        background: 'var(--ha-surface-primary)',
        borderBottom: '1px solid var(--ha-border)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* Date range */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--ha-text-secondary)' }}>From</label>
        <input
          type="datetime-local"
          value={from.slice(0, 16)}
          onChange={(e) => onFromChange(new Date(e.target.value).toISOString())}
          aria-label="From date"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 12,
            padding: '3px 8px',
            outline: 'none',
          }}
        />
        <label style={{ fontSize: 11, color: 'var(--ha-text-secondary)' }}>To</label>
        <input
          type="datetime-local"
          value={to.slice(0, 16)}
          onChange={(e) => onToChange(new Date(e.target.value).toISOString())}
          aria-label="To date"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 12,
            padding: '3px 8px',
            outline: 'none',
          }}
        />
      </div>

      {/* Agent selector — populated from /api/agent-manager/agents */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label htmlFor="fim-agent-select" style={{ fontSize: 11, color: 'var(--ha-text-secondary)', whiteSpace: 'nowrap' }}>
          Agents
        </label>
        <select
          id="fim-agent-select"
          value={selectedAgents[0] ?? ''}
          onChange={e => {
            const v = e.target.value;
            onAgentsChange(v ? [v] : []);
          }}
          aria-label="Agent filter"
          style={{
            background: 'var(--ha-surface-raised)',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-text-primary)',
            fontSize: 12,
            padding: '3px 8px',
            outline: 'none',
            cursor: 'pointer',
            minWidth: 140,
          }}
        >
          <option value="">All agents</option>
          {agentList.map(a => (
            <option key={a.agentId} value={a.agentId}>
              {a.hostname}
            </option>
          ))}
        </select>
      </div>

      {/* Change type checkboxes */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--ha-text-secondary)', marginRight: 4 }}>
          Types:
        </span>
        {CHANGE_TYPES.map((type) => {
          const active = selectedChangeTypes.length === 0 || selectedChangeTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => handleTypeToggle(type)}
              aria-pressed={active}
              style={{
                background: active ? 'var(--ha-primary)' : 'var(--ha-surface-raised)',
                color: active ? 'var(--ha-background)' : 'var(--ha-text-secondary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-sm)',
                padding: '2px 10px',
                fontSize: 11,
                fontFamily: 'var(--ha-font-mono)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 120ms',
              }}
            >
              {CHANGE_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function FimDashboardPage(): JSX.Element {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [from, setFrom] = useState<string>(minus24hIso);
  const [to, setTo] = useState<string>(nowIso);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedChangeTypes, setSelectedChangeTypes] = useState<ChangeType[]>([]);

  // ── Agent list for dropdown ───────────────────────────────────────────────
  const [agentList, setAgentList] = useState<Array<{ agentId: string; hostname: string }>>([]);
  useEffect(() => {
    fetch('/api/agent-manager/agents?pageSize=1000', {
      headers: { Authorization: `Bearer ${localStorage.getItem('hivearmor_auth_token') ?? ''}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((agents: Array<Record<string, unknown>>) =>
        setAgentList(agents.map(a => ({
          agentId: String(a['agentId'] ?? a['id'] ?? ''),
          hostname: String(a['hostname'] ?? a['agentId'] ?? ''),
        })))
      )
      .catch(() => setAgentList([]));
  }, []);

  // ── Build query ───────────────────────────────────────────────────────────
  const query = useMemo<FimSummaryQuery>(() => ({
    from,
    to,
    agentIds: selectedAgents.length > 0 ? selectedAgents : undefined,
    changeTypes: selectedChangeTypes.length > 0 ? selectedChangeTypes : undefined,
  }), [from, to, selectedAgents, selectedChangeTypes]);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useFimSummary(query);

  const changesOverTime = data?.changesOverTime ?? [];
  const topPaths = data?.topPaths ?? [];
  const suspiciousHashes = data?.suspiciousHashes ?? [];

  // ── Empty state condition ─────────────────────────────────────────────────
  const isEmpty =
    !isLoading &&
    !isError &&
    changesOverTime.length === 0 &&
    topPaths.length === 0 &&
    suspiciousHashes.length === 0;

  // ── Error message ─────────────────────────────────────────────────────────
  const errorMessage =
    error instanceof Error
      ? error.message
      : 'An error occurred while loading FIM summary data.';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: 'var(--ha-background)',
        overflow: 'hidden',
      }}
    >
      {/* Page header */}
      <div
        style={{
          height: 48,
          borderBottom: '1px solid var(--ha-border)',
          background: 'var(--ha-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <Shield size={20} color="var(--ha-primary)" />
        <h1
          style={{
            fontSize: 'var(--ha-text-xl)',
            color: 'var(--ha-text-primary)',
            margin: 0,
            fontWeight: 600,
          }}
        >
          File Integrity Monitoring
        </h1>
        {isLoading && (
          <span style={{ marginLeft: 8 }}>
            <Spinner size="sm" aria-label="Loading FIM data" />
          </span>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        from={from}
        to={to}
        selectedAgents={selectedAgents}
        selectedChangeTypes={selectedChangeTypes}
        agentList={agentList}
        onFromChange={setFrom}
        onToChange={setTo}
        onChangeTypesChange={setSelectedChangeTypes}
        onAgentsChange={setSelectedAgents}
      />

      {/* Error state */}
      {isError && (
        <div style={{ padding: '12px 24px', flexShrink: 0 }}>
          <Alert variant="danger" isInline title="Failed to load FIM data">
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EmptyState>
            <Shield size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <EmptyStateBody>
              No file integrity events found for the selected time range and filters.
              Try adjusting the date range or removing filters.
            </EmptyStateBody>
          </EmptyState>
        </div>
      )}

      {/* Dashboard panels — visible when not in empty state */}
      {!isEmpty && (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: 0,
          }}
        >
          {/* Row 1 — Changes Over Time (full width) */}
          <div
            style={{
              background: 'var(--ha-surface-primary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 4,
              padding: '12px 8px 8px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ha-text-secondary)',
                marginBottom: 8,
                paddingLeft: 8,
              }}
            >
              Changes Over Time
            </div>
            <div style={{ height: 240 }}>
              {isLoading ? (
                <PanelSkeleton height={240} />
              ) : (
                <ChangesOverTimeChart data={changesOverTime} />
              )}
            </div>
          </div>

          {/* Row 2 — two columns */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              flex: 1,
              minHeight: 280,
            }}
          >
            {/* Left: Top Changed Paths */}
            <div
              style={{
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 4,
                padding: '12px 8px 8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ha-text-secondary)',
                  marginBottom: 8,
                  paddingLeft: 8,
                }}
              >
                Top Changed Paths
              </div>
              <div style={{ height: 'calc(100% - 28px)' }}>
                {isLoading ? (
                  <PanelSkeleton height={240} />
                ) : (
                  <TopChangedPathsChart data={topPaths} />
                )}
              </div>
            </div>

            {/* Right: Suspicious Hashes */}
            <div
              style={{
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 4,
                padding: '12px 8px 8px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ha-text-secondary)',
                  marginBottom: 8,
                  paddingLeft: 4,
                  flexShrink: 0,
                }}
              >
                Suspicious Hashes
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {isLoading ? (
                  <PanelSkeleton height={240} />
                ) : (
                  <SuspiciousHashesTable data={suspiciousHashes} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS keyframes */}
      <style>{`
        @keyframes ha-fim-pulse {
          0%, 100% { opacity: 0.6; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
