import { useState, useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Maximize2, AlertCircle } from 'lucide-react';

import {
  GAP_SEC_06_RESOLVED,
  canRunVisualization,
  runVisualization,
} from '../dashboards.service';
import type { VisualizationDTO, FilterDTO } from '../dashboards.types';

import { useAuthStore } from '@/store/auth.store';

export interface VisualizationWidgetProps {
  visualization: VisualizationDTO;
  filters?: FilterDTO | null;
  refreshTime: number | null;
  onExpand?: () => void;
}

export function VisualizationWidget({
  visualization,
  filters,
  refreshTime,
  onExpand,
}: VisualizationWidgetProps): JSX.Element {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const userRoles = useAuthStore((state) => state.user?.roles);
  const canRun = GAP_SEC_06_RESOLVED && canRunVisualization(userRoles);

  // SEC-06: backend @PreAuthorize gates run; UI skips the call when unauthorized.
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['visualization-run', visualization.id, filters],
    queryFn: () => {
      if (!canRun) {
        return Promise.reject(new Error('VISUALIZATION_RUN_UNAUTHORIZED'));
      }
      return runVisualization({ visualizationId: visualization.id, filters: filters ?? null });
    },
    enabled: canRun,
    staleTime: (refreshTime ?? 300) * 1000,
    refetchInterval: refreshTime ? refreshTime * 1000 : false,
  });

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefreshedAt(dataUpdatedAt);
    }
  }, [dataUpdatedAt]);

  const getRelativeTime = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Updated ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `Updated ${hours}h ago`;
  };

  const renderWidgetBody = (): JSX.Element => {
    if (!GAP_SEC_06_RESOLVED) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 16,
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--ha-high) 10%, transparent)',
              border: '1px solid var(--ha-high)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-high)',
              textAlign: 'center',
            }}
          >
            Visualization data unavailable — security fix GAP-SEC-06 pending deployment
          </div>
        </div>
      );
    }

    if (!canRun) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 16,
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--ha-high) 10%, transparent)',
              border: '1px solid var(--ha-high)',
              borderRadius: 'var(--ha-radius-base)',
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-high)',
              textAlign: 'center',
            }}
          >
            Required permission: Analyst, SOC Manager, or Platform Administrator
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--ha-text-secondary)',
          }}
        >
          Loading...
        </div>
      );
    }

    if (isError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '12px',
          }}
        >
          <AlertCircle size={32} color="var(--ha-critical)" />
          <div style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-sm)' }}>
            Failed to load widget data
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              background: 'transparent',
              border: '1px solid var(--ha-border)',
              color: 'var(--ha-text-primary)',
              padding: '4px 12px',
              borderRadius: 'var(--ha-radius-base)',
              cursor: 'pointer',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    if (visualization.type === 'MAP') {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '12px',
            color: 'var(--ha-text-secondary)',
          }}
        >
          <div style={{ fontSize: 'var(--ha-text-md)' }}>Map visualizations are not available</div>
          <div style={{ fontSize: 'var(--ha-text-sm)' }}>This feature is coming soon</div>
        </div>
      );
    }

    // Placeholder for actual chart/table/metric rendering
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--ha-text-secondary)',
          fontSize: 'var(--ha-text-sm)',
        }}
      >
        {visualization.type} widget - {JSON.stringify(data).substring(0, 100)}
      </div>
    );
  };

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Widget Header */}
      <div
        style={{
          height: '32px',
          background: 'var(--ha-surface-raised)',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
        }}
      >
        <div
          style={{
            fontSize: 'var(--ha-text-sm)',
            fontWeight: 600,
            color: 'var(--ha-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={visualization.name}
        >
          {visualization.name}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {getRelativeTime(lastRefreshedAt)}
          </div>

          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand widget"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ha-text-secondary)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>{renderWidgetBody()}</div>

      {/* Widget Footer (error indicator) */}
      {isError && (
        <div
          style={{
            height: '24px',
            background: 'var(--ha-surface-raised)',
            borderTop: '1px solid var(--ha-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: '6px',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--ha-critical)',
            }}
          />
          <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
            Widget data unavailable
          </div>
        </div>
      )}
    </div>
  );
}
