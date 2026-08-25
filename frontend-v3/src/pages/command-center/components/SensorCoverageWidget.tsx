/**
 * Sensor Coverage Widget
 * Shows agent/sensor active vs inactive counts and a donut coverage chart.
 * Data: GET /api/agent-manager/agents  (60-second refetch)
 */

import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { Link } from 'react-router-dom';

import { HaChart } from '@/components/ha-chart/HaChart';
import { fetchSensors } from '@/services/sensorsService';

export function SensorCoverageWidget(): JSX.Element {
  const { data: sensors, isLoading, error, refetch } = useQuery({
    queryKey: ['sensors'],
    queryFn: async () => {
      const { sensors: rows } = await fetchSensors({ size: 1000 });
      return rows;
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const active = sensors?.filter((s) => s.connectionStatus === 'ONLINE').length ?? 0;
  const inactive = sensors?.filter((s) => s.connectionStatus === 'OFFLINE').length ?? 0;
  const unreachable = sensors?.filter((s) => s.connectionStatus === 'UNKNOWN').length ?? 0;
  const total = (sensors?.length) ?? 0;
  const coveragePct = total > 0 ? Math.round((active / total) * 100) : 0;

  const lastHeartbeat = sensors
    ?.filter((s) => s.lastSeen)
    .sort((a, b) => new Date(b.lastSeen ?? '').getTime() - new Date(a.lastSeen ?? '').getTime())[0]?.lastSeen ?? null;

  const chartOption: EChartsOption = {
    animation: !prefersReducedMotion,
    backgroundColor: 'transparent',
    series: [
      {
        type: 'pie',
        radius: ['55%', '85%'],
        center: ['50%', '50%'],
        label: { show: false },
        data: [
          { value: active, name: 'Active', itemStyle: { color: 'var(--ha-positive)' } },
          { value: inactive, name: 'Inactive', itemStyle: { color: 'var(--ha-high)' } },
          { value: unreachable, name: 'Unreachable', itemStyle: { color: 'var(--ha-critical)' } },
        ],
        emphasis: { scale: false },
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: 'center',
        style: {
          text: total > 0 ? `${coveragePct}%` : '—',
          fontSize: 18,
          fontWeight: 700,
          fill: coveragePct >= 80 ? 'var(--ha-positive)' : coveragePct >= 50 ? 'var(--ha-high)' : 'var(--ha-critical)',
          fontFamily: 'var(--ha-font-mono)',
        },
      },
    ],
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--ha-surface-raised)',
      borderColor: 'var(--ha-border)',
      textStyle: { color: 'var(--ha-text-primary)', fontSize: 12 },
    },
  };

  return (
    <div
      aria-label="Sensor Coverage"
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        display: 'flex',
        flexDirection: 'column',
        height: '220px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-secondary)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Sensor Coverage
        </span>
        <Link
          to="/posture/sensors"
          style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-primary)', textDecoration: 'none' }}
        >
          View Sensors →
        </Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '8px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : total === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Donut */}
            <div style={{ width: '120px', height: '120px', flexShrink: 0 }}>
              <HaChart
                option={chartOption}
                style={{ width: '120px', height: '120px' }}
                ariaLabel="Sensor coverage distribution"
              />
            </div>

            {/* Legend + stats */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <LegendRow color="var(--ha-positive)" label="Active" value={active} />
              <LegendRow color="var(--ha-high)" label="Inactive" value={inactive} />
              <LegendRow color="var(--ha-critical)" label="Unreachable" value={unreachable} />
              {lastHeartbeat && (
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', marginTop: '4px' }}>
                  Last heartbeat: {formatRelativeTime(lastHeartbeat)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-xs)', color, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

function LoadingSkeleton(): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '12px', width: '100%', alignItems: 'center' }}>
      <div
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[70, 55, 65].map((w, i) => (
          <div
            key={i}
            style={{
              height: '14px',
              width: `${w}%`,
              background: 'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              borderRadius: 'var(--ha-radius-sm)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)' }}>
        Could not load sensor data.
      </span>
      <button
        onClick={onRetry}
        type="button"
        style={{
          background: 'transparent',
          border: '1px solid var(--ha-critical)',
          borderRadius: 'var(--ha-radius-sm)',
          color: 'var(--ha-critical)',
          fontSize: 'var(--ha-text-xs)',
          padding: '3px 8px',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
        No sensors registered yet.
      </span>
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${Math.floor(diffMinutes / 60)}h ago`;
}
