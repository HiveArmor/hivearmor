/**
 * Data Health Widget
 * Shows live EPS, data source health (derived from sensor data), and index health.
 *
 * NEEDS_BACKEND: Parser error rate and OpenSearch index lag have no dedicated
 * endpoints. Data sources count is derived from GET /api/agent-manager/agents.
 * Full data health endpoint would be:  GET /api/ha-data-health  (does not exist yet)
 */

import { useQuery } from '@tanstack/react-query';

import { fetchSensors } from '@/services/sensorsService';

export interface DataHealthWidgetProps {
  eps: number;
  epsConnected: boolean;
}

export function DataHealthWidget({ eps, epsConnected }: DataHealthWidgetProps): JSX.Element {
  const { data: sensors, isLoading } = useQuery({
    queryKey: ['sensors', 'all'],
    queryFn: async () => {
      const { sensors: rows } = await fetchSensors({ size: 1000 });
      return rows;
    },
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  const activeSources = sensors?.filter((s) => s.connectionStatus === 'ONLINE').length ?? 0;
  const degradedSources = sensors?.filter((s) => s.connectionStatus === 'OFFLINE' || s.connectionStatus === 'UNKNOWN').length ?? 0;
  const totalSources = sensors?.length ?? 0;

  // Find the most recently seen sensor as a proxy for "last event received"
  const latestSeen = sensors
    ?.filter((s) => s.lastSeen)
    .sort((a, b) => new Date(b.lastSeen ?? '').getTime() - new Date(a.lastSeen ?? '').getTime())[0]?.lastSeen ?? null;

  return (
    <div
      aria-label="Data Health"
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
          Data Health
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--ha-text-xs)',
            color: epsConnected ? 'var(--ha-positive)' : 'var(--ha-high)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: epsConnected ? 'var(--ha-positive)' : 'var(--ha-high)',
            }}
          />
          {epsConnected ? 'Live' : 'Disconnected'}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* EPS */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-2xl)',
              fontWeight: 'var(--ha-weight-bold)',
              color: 'var(--ha-primary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {eps}
          </span>
          <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
            events / second
          </span>
        </div>

        {/* Source health */}
        {isLoading ? (
          <SkeletonRows count={2} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <StatChip label="Active" value={activeSources} color="var(--ha-positive)" />
            <StatChip label="Degraded" value={degradedSources} color={degradedSources > 0 ? 'var(--ha-high)' : 'var(--ha-text-secondary)'} />
          </div>
        )}

        {/* Last event */}
        {latestSeen && (
          <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            Last heartbeat: {formatRelativeTime(latestSeen)}
          </span>
        )}

        {/* NEEDS_BACKEND notice */}
        {!isLoading && totalSources === 0 && (
          <div
            style={{
              padding: '6px 10px',
              background: 'color-mix(in srgb, var(--ha-high) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--ha-high) 30%, transparent)',
              borderRadius: 'var(--ha-radius-sm)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
            }}
          >
            <span style={{ color: 'var(--ha-high)', fontWeight: 600 }}>NEEDS_BACKEND: </span>
            Parser error rate and index lag require a dedicated endpoint.
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-sm)',
        padding: '6px 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--ha-font-mono)', fontSize: 'var(--ha-text-sm)', color, fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '28px',
            background: 'linear-gradient(90deg, var(--ha-surface-raised) 25%, var(--ha-border) 50%, var(--ha-surface-raised) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
            borderRadius: 'var(--ha-radius-sm)',
          }}
        />
      ))}
    </div>
  );
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
