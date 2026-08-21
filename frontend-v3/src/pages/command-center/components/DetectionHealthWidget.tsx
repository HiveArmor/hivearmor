/**
 * Detection Health Widget
 * Shows active correlation rules count.
 *
 * NEEDS_BACKEND: Last-rule-fired timestamp and plugin health status have no
 * dedicated backend endpoint yet. These sections are displayed as informational
 * placeholders until the backend exposes:
 *   GET /api/correlation-rule/health  (or similar aggregation endpoint)
 *
 * What IS available:
 *   GET /api/correlation-rule/search-by-filters  (rule list, count active/total)
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getDetectionHealthSummary } from '../commandCenter.service';

function StatusPill({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: 'var(--ha-text-xs)',
        color: ok ? 'var(--ha-positive)' : 'var(--ha-high)',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: ok ? 'var(--ha-positive)' : 'var(--ha-high)',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

export function DetectionHealthWidget(): JSX.Element {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['detection-health'],
    queryFn: getDetectionHealthSummary,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  return (
    <div
      aria-label="Detection Health"
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
          Detection Health
        </span>
        <Link
          to="/detection"
          style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-primary)', textDecoration: 'none' }}
        >
          Manage Rules →
        </Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isLoading ? (
          <SkeletonRows count={3} />
        ) : error ? (
          <ErrorRow onRetry={() => void refetch()} />
        ) : (
          <>
            {/* Active rules count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-2xl)',
                  fontWeight: 'var(--ha-weight-bold)',
                  color: (data?.activeRules ?? 0) > 0 ? 'var(--ha-primary)' : 'var(--ha-high)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {data?.activeRules ?? 0}
              </span>
              <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
                active rules
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                {data?.totalRules ?? 0} total
              </span>
            </div>

            {/* Pipeline status — derived from rule count */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <StatusPill ok={(data?.activeRules ?? 0) > 0} label="Correlation engine" />
              <div
                style={{
                  padding: '8px 10px',
                  background: 'color-mix(in srgb, var(--ha-high) 6%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--ha-high) 30%, transparent)',
                  borderRadius: 'var(--ha-radius-sm)',
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-text-secondary)',
                }}
              >
                <span style={{ color: 'var(--ha-high)', fontWeight: 600 }}>NEEDS_BACKEND: </span>
                Plugin health and last-rule-fired require a dedicated backend aggregation endpoint.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonRows({ count }: { count: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? '32px' : '16px',
            width: i === 0 ? '80px' : '60%',
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

function ErrorRow({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)' }}>
        Could not load detection health.
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
