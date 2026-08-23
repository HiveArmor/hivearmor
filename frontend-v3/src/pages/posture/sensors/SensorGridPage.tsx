import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Activity, Plus } from 'lucide-react';

import { AddAgentDrawer } from './AddAgentDrawer';
import { AgentPackageCatalog } from './AgentPackageCatalog';

import { DensitySelector } from '@/components/density-selector';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import { apiClient } from '@/lib/apiClient';
import { hasAuthority } from '@/lib/auth/hasAuthority';
import type { SensorDTO } from '@/types/sensor.types';

/**
 * ActionsCellRenderer — GAP-SEC-05 Compliance
 * Renders disabled remote action buttons with explanatory tooltip.
 * AgentManager gRPC remote command path has no role verification.
 */
function ActionsCellRenderer(): JSX.Element {
  const btnStyle: React.CSSProperties = {
    background: 'var(--ha-surface-raised)',
    border: '1px solid var(--ha-border)',
    borderRadius: 'var(--ha-radius-sm)',
    color: 'var(--ha-text-secondary)',
    cursor: 'not-allowed',
    opacity: 0.45,
    padding: '4px 8px',
    fontSize: 'var(--ha-text-xs)',
    pointerEvents: 'none',
  };

  const tooltip = 'Remote agent actions stay blocked — agent-manager command path is INTERNAL_KEY-only (GAP-SEC-05)';

  return (
    <div
      style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}
      title={tooltip}
    >
      <button disabled style={btnStyle} aria-label="Restart Agent (blocked)">
        Restart
      </button>
      <button disabled style={btnStyle} aria-label="Push Config (blocked)">
        Config
      </button>
      <button disabled style={btnStyle} aria-label="Collect Logs (blocked)">
        Logs
      </button>
    </div>
  );
}

/**
 * SensorGridPage — Sensor health monitoring (POS-05)
 *
 * GAP-SEC-05: Remote action buttons stay disabled.
 * Backend REST (/api/edr/*, /api/agent-manager mutate) is now @PreAuthorize-gated,
 * but agent-manager gRPC command dispatch remains INTERNAL_KEY-only with no ROLE_*.
 * Do not enable kill/isolate/restart until a real role-aware command path exists.
 *
 * Add Agent: the "+ Add Agent" button opens AddAgentDrawer, which generates a
 * one-click install script containing an auto-expiring connection key.
 */
export function SensorGridPage(): JSX.Element {
  const [density] = useRowDensity();
  const { eps, connected: epsConnected } = useEpsStream();
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const canProvisionAgent = hasAuthority('ROLE_ADMIN');

  // Fetch sensors from agent-manager
  const {
    data: sensors = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sensors'],
    queryFn: () => apiClient.get<SensorDTO[]>('/agent-manager/agents'),
  });

  // Compute active/total counts
  const activeSensors = useMemo(
    () => sensors.filter((s) => s.connectionStatus === 'ACTIVE').length,
    [sensors]
  );
  const totalSensors = sensors.length;

  // Column definitions per POS-05 spec §7.1
  const columnDefs: ColDef<SensorDTO>[] = [
    {
      field: 'hostname',
      headerName: 'Hostname',
      width: 220,
      cellStyle: {
        fontFamily: 'var(--ha-font-mono)',
        fontWeight: 600,
      },
    },
    {
      field: 'platform',
      headerName: 'Platform',
      width: 100,
      valueFormatter: (params) => {
        const platform = params.value as string;
        return platform.charAt(0).toUpperCase() + platform.slice(1);
      },
    },
    {
      field: 'osVersion',
      headerName: 'OS Version',
      width: 140,
      cellStyle: { color: 'var(--ha-text-secondary)' },
      valueFormatter: (params) => params.value ?? '—',
    },
    {
      field: 'agentVersion',
      headerName: 'Agent Version',
      width: 120,
      cellStyle: { fontFamily: 'var(--ha-font-mono)' },
      valueFormatter: (params) => params.value ?? '—',
    },
    {
      field: 'connectionStatus',
      headerName: 'Connection Status',
      width: 150,
      cellRenderer: (params: { value: string }) => {
        const status = params.value;
        const statusMap: Record<
          string,
          { label: string; bg: string; color: string }
        > = {
          ACTIVE: {
            label: 'Connected',
            bg: 'var(--ha-fill-low-muted)',
            color: 'var(--ha-positive)',
          },
          INACTIVE: {
            label: 'Disconnected',
            bg: 'var(--ha-fill-critical-muted)',
            color: 'var(--ha-critical)',
          },
          UNREACHABLE: {
            label: 'Unreachable',
            bg: 'var(--ha-fill-critical-muted)',
            color: 'var(--ha-critical)',
          },
          UNKNOWN: {
            label: 'Unknown',
            bg: 'transparent',
            color: 'var(--ha-text-secondary)',
          },
        };

        const style = statusMap[status] ?? statusMap.UNKNOWN;

        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '2px',
              fontSize: 'var(--ha-text-xs)',
              backgroundColor: style.bg,
              color: style.color,
            }}
          >
            {style.label}
          </span>
        );
      },
    },
    {
      field: 'cpuUsage',
      headerName: 'CPU %',
      width: 80,
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
      valueFormatter: (params) => (params.value != null ? `${params.value}%` : '—'),
    },
    {
      field: 'memUsage',
      headerName: 'Memory %',
      width: 80,
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
      valueFormatter: (params) => (params.value != null ? `${params.value}%` : '—'),
    },
    {
      field: 'lastSeen',
      headerName: 'Last Seen',
      width: 160,
      cellStyle: {
        fontFamily: 'var(--ha-font-mono)',
        fontVariantNumeric: 'tabular-nums',
      },
      valueFormatter: (params) => {
        if (!params.value) return '—';
        const date = new Date(params.value as string);
        return date.toLocaleString();
      },
    },
    {
      headerName: 'Actions',
      width: 200,
      cellRenderer: ActionsCellRenderer,
      sortable: false,
      filter: false,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--ha-background)',
      }}
    >
      {/* GAP-SEC-05 Warning Banner */}
      <HaInlineBanner
        variant="warning"
        title="EDR actions blocked (GAP-SEC-05)"
        description="Remote agent actions (Kill Process, Isolate Host, Restart, Push Config) stay disabled. REST mutate endpoints are role-gated, but agent-manager still accepts commands only via INTERNAL_KEY (no ROLE_* on the gRPC path). Enabling UI actions would still be dishonest."
        isDismissible={false}
      />

      {/* Page header — includes Add Agent button */}
      <div
        style={{
          height: '48px',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--ha-border)',
          backgroundColor: 'var(--ha-surface-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1
            style={{
              fontSize: 'var(--ha-text-xl)',
              fontWeight: 600,
              color: 'var(--ha-text-primary)',
              margin: 0,
            }}
          >
            Sensors
          </h1>
          <span
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {activeSensors} / {totalSensors} active
          </span>
        </div>

        {/* Right side: density selector + Add Agent */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DensitySelector />
          {canProvisionAgent && (
          <HaButton
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setAddAgentOpen(true)}
          >
            Add Agent
          </HaButton>
          )}
        </div>
      </div>

      <AgentPackageCatalog />

      {/* Content area - all four states */}
      <div style={{ flex: 1, padding: '16px' }}>
        {isLoading && <LoadingState message="Loading sensors..." />}

        {isError && (
          <ErrorState
            message="Could not load sensors."
            onRetry={refetch}
          />
        )}

        {!isLoading && !isError && sensors.length === 0 && (
          <EmptyState
            icon={<Activity size={48} />}
            title="No agents registered yet"
            description="Download an agent package above, or use Add Agent to generate a keyed one-click install script. Process-log tests do not register a sensor row."
            action={
              canProvisionAgent ? (
              <HaButton
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => setAddAgentOpen(true)}
              >
                Add Agent
              </HaButton>
              ) : undefined
            }
          />
        )}

        {!isLoading && !isError && sensors.length > 0 && (
          <SiemDataGrid
            columnDefs={columnDefs}
            rowData={sensors}
            rowModelType="clientSide"
            height="100%"
            rowHeight={ROW_HEIGHTS[density]}
          />
        )}
      </div>

      <StatusDock sseConnected={epsConnected} eps={eps} />

      {/* Add Agent provisioning drawer */}
      <AddAgentDrawer
        isOpen={addAgentOpen}
        onClose={() => setAddAgentOpen(false)}
      />
    </div>
  );
}
