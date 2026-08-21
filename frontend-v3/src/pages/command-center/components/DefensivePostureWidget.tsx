/**
 * Defensive Posture Widget
 * Shows overall security posture score (0-100) with trend and risk breakdown.
 * Data: GET /api/ha-posture/score  (5-minute refetch)
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getPostureScore } from '../commandCenter.service';

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--ha-positive)';
  if (score >= 60) return 'var(--ha-medium)';
  if (score >= 40) return 'var(--ha-high)';
  return 'var(--ha-critical)';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Poor';
  return 'Critical';
}

function TrendArrow({ trend }: { trend: 'improving' | 'declining' | 'stable' }): JSX.Element {
  if (trend === 'improving') {
    return <span aria-label="improving" style={{ color: 'var(--ha-positive)', fontSize: '1.1em' }}>↑</span>;
  }
  if (trend === 'declining') {
    return <span aria-label="declining" style={{ color: 'var(--ha-critical)', fontSize: '1.1em' }}>↓</span>;
  }
  return <span aria-label="stable" style={{ color: 'var(--ha-text-secondary)', fontSize: '1.1em' }}>→</span>;
}

export function DefensivePostureWidget(): JSX.Element {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['posture', 'score'],
    queryFn: getPostureScore,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const score = data?.overallScore ?? 0;
  const color = scoreColor(score);

  return (
    <div
      aria-label="Defensive Posture"
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
          Defensive Posture
        </span>
        <Link
          to="/posture"
          style={{
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-primary)',
            textDecoration: 'none',
          }}
        >
          View Details →
        </Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : !data ? (
          <EmptyState />
        ) : (
          <>
            {/* Score row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span
                style={{
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-2xl)',
                  fontWeight: 'var(--ha-weight-bold)',
                  color,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {score}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>/ 100</span>
                <span style={{ fontSize: 'var(--ha-text-sm)', color, fontWeight: 600 }}>
                  {scoreLabel(score)}
                </span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendArrow trend={data.trend} />
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)', textTransform: 'capitalize' }}>
                  {data.trend}
                </span>
              </div>
            </div>

            {/* Risk breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <MetricRow
                label="Controls Passed"
                value={data.controlsPassed}
                color="var(--ha-positive)"
              />
              <MetricRow
                label="Controls Failed"
                value={data.controlsFailed}
                color="var(--ha-critical)"
              />
              <MetricRow
                label="Frameworks"
                value={data.totalFrameworks}
                color="var(--ha-text-secondary)"
              />
              <MetricRow
                label="Total Controls"
                value={data.controlsTotal}
                color="var(--ha-text-secondary)"
              />
            </div>

            {/* Last assessed */}
            {data.lastAssessed && (
              <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                Last assessed: {new Date(data.lastAssessed).toLocaleString()}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): JSX.Element {
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

function LoadingSkeleton(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[72, 48, '100%'].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? '32px' : '16px',
            width: typeof w === 'number' ? `${w}px` : w,
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

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)' }}>
        Could not load posture score.
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
        No posture data available yet.
      </span>
    </div>
  );
}
