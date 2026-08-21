/**
 * Analyst Capacity Widget
 * Shows open incidents assigned to the current user and unassigned queue depth.
 * Derived from GET /api/ha-incidents — no dedicated backend capacity endpoint.
 *
 * NEEDS_BACKEND: Analyst presence/online status requires a new backend endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getIncidents } from '@/services/incidents.service';
import { useAuthStore } from '@/store/auth.store';

export function AnalystCapacityWidget(): JSX.Element {
  const account = useAuthStore((s) => s.user);
  const currentUserId = account?.id;

  // My open incidents
  const { data: myIncidents, isLoading: myLoading } = useQuery({
    queryKey: ['incidents', 'my-open', currentUserId],
    queryFn: () =>
      getIncidents({
        status: 'open',
        assigneeId: currentUserId,
        size: 100,
        sort: 'slaDueAt,asc',
      }),
    enabled: currentUserId !== undefined,
    refetchInterval: 30_000,
  });

  // Unassigned queue
  const { data: unassignedIncidents, isLoading: unassignedLoading } = useQuery({
    queryKey: ['incidents', 'unassigned'],
    queryFn: () =>
      getIncidents({
        status: 'open',
        size: 1,
        sort: 'createdAt,asc',
      }),
    refetchInterval: 30_000,
  });

  const myCount = myIncidents?.items.length ?? 0;
  const unassignedCount = unassignedIncidents?.total ?? 0;
  const isLoading = myLoading || unassignedLoading;

  // Determine workload status
  let workloadColor = 'var(--ha-positive)';
  let workloadLabel = 'Low';
  if (myCount > 10) { workloadColor = 'var(--ha-critical)'; workloadLabel = 'High'; }
  else if (myCount > 5) { workloadColor = 'var(--ha-high)'; workloadLabel = 'Medium'; }

  return (
    <div
      aria-label="Analyst Capacity"
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
          Analyst Capacity
        </span>
        <Link
          to="/incidents"
          style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-primary)', textDecoration: 'none' }}
        >
          View Queue →
        </Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {isLoading ? (
          <SkeletonRows />
        ) : !currentUserId ? (
          <div style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-text-secondary)' }}>
            Sign in to see your workload.
          </div>
        ) : (
          <>
            {/* My workload */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-2xl)',
                  fontWeight: 'var(--ha-weight-bold)',
                  color: workloadColor,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {myCount}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                  open incidents (mine)
                </span>
                <span style={{ fontSize: 'var(--ha-text-xs)', color: workloadColor, fontWeight: 600 }}>
                  Workload: {workloadLabel}
                </span>
              </div>
            </div>

            {/* Unassigned queue */}
            <div
              style={{
                background: 'var(--ha-surface-raised)',
                border: `1px solid ${unassignedCount > 0 ? 'color-mix(in srgb, var(--ha-high) 40%, transparent)' : 'var(--ha-border)'}`,
                borderRadius: 'var(--ha-radius-sm)',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
                Unassigned queue
              </span>
              <span
                style={{
                  fontFamily: 'var(--ha-font-mono)',
                  fontSize: 'var(--ha-text-sm)',
                  color: unassignedCount > 0 ? 'var(--ha-high)' : 'var(--ha-positive)',
                  fontWeight: 600,
                }}
              >
                {unassignedCount}
              </span>
            </div>

            {/* NEEDS_BACKEND notice */}
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
              Analyst online status requires a new backend presence endpoint.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonRows(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[80, 50, '100%'].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? '32px' : '24px',
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
