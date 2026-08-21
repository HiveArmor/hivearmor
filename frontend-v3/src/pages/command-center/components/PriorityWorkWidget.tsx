/**
 * Priority Work Widget
 * Shows top 5 open incidents sorted by SLA deadline (soonest first).
 * Data: GET /api/ha-incidents?sort=slaDueAt,asc&size=5&status=open
 */

import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { getIncidents } from '@/services/incidents.service';
import type { IncidentDTO } from '@/types/api.types';

export function PriorityWorkWidget(): JSX.Element {
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['incidents', 'priority-work'],
    queryFn: () =>
      getIncidents({
        status: 'open',
        size: 5,
        sort: 'slaDueAt,asc',
      }),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const incidents = data?.items ?? [];

  return (
    <div
      aria-label="Priority work queue"
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
          Priority Work
        </span>
        <Link
          to="/incidents"
          style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-primary)', textDecoration: 'none' }}
        >
          View All →
        </Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {isLoading ? (
          <SkeletonRows count={4} />
        ) : error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : incidents.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {incidents.map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                onClick={() => navigate(`/incidents/${incident.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IncidentRow({
  incident,
  onClick,
}: {
  incident: IncidentDTO;
  onClick: () => void;
}): JSX.Element {
  const slaInfo = computeSlaInfo(incident.slaDueAt);

  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        width: '100%',
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-sm)',
        padding: '8px 10px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}
      aria-label={`Incident: ${incident.title}`}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ha-primary) 50%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--ha-border)';
      }}
    >
      {/* Row 1: title + SLA countdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            flex: 1,
            fontSize: 'var(--ha-text-sm)',
            color: 'var(--ha-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {incident.title}
        </span>
        {slaInfo && (
          <span
            style={{
              flexShrink: 0,
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-xs)',
              fontVariantNumeric: 'tabular-nums',
              color: slaInfo.color,
              fontWeight: slaInfo.breached ? 700 : 500,
            }}
          >
            {slaInfo.label}
          </span>
        )}
      </div>

      {/* Row 2: assigned analyst */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
          {incident.assignee
            ? `${incident.assignee.firstName} ${incident.assignee.lastName}`
            : 'Unassigned'}
        </span>
      </div>
    </button>
  );
}

interface SlaInfo {
  label: string;
  color: string;
  breached: boolean;
}

function computeSlaInfo(slaDueAt: string | null): SlaInfo | null {
  if (!slaDueAt) return null;
  const msLeft = new Date(slaDueAt).getTime() - Date.now();
  if (msLeft < 0) {
    return { label: 'BREACHED', color: 'var(--ha-critical)', breached: true };
  }
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  const minutesLeft = Math.floor((msLeft % 3_600_000) / 60_000);
  const label = hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`;
  const color = hoursLeft < 2 ? 'var(--ha-high)' : 'var(--ha-text-secondary)';
  return { label, color, breached: false };
}

function SkeletonRows({ count }: { count: number }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '44px',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-critical)' }}>
        Could not load priority incidents.
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
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <span style={{ fontSize: 'var(--ha-text-sm)', color: 'var(--ha-positive)' }}>
        No open incidents — queue is clear.
      </span>
    </div>
  );
}
