import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
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
import { hasAuthority } from '@/lib/auth/hasAuthority';
import { showErrorToast, showSuccessToast } from '@/lib/toast';
import {
  canEnableIsolateHost,
  canEnableKillProcess,
  REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION,
  REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE,
  REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE,
} from '@/services/sensorRemoteActions.capabilities';
import {
  isolateSensor,
  killSensorProcess,
} from '@/services/sensorRemoteActions.service';
import { fetchSensors } from '@/services/sensorsService';
import type { SensorDTO } from '@/services/sensorsService';

function ActionButton(props: {
  label: string;
  ariaLabel: string;
  disabled: boolean;
  title: string;
  onClick?: () => void;
  danger?: boolean;
}): JSX.Element {
  const { label, ariaLabel, disabled, title, onClick, danger } = props;
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : onClick}
      style={{
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-sm)',
        color: danger ? 'var(--ha-critical)' : 'var(--ha-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        padding: '4px 8px',
        fontSize: 'var(--ha-text-xs)',
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {label}
    </button>
  );
}

async function dispatchIsolate(agentId: string, hostname: string): Promise<void> {
  if (!window.confirm(`Isolate host ${hostname || agentId}?`)) return;
  try {
    await isolateSensor({ agentId, hostname, reason: 'SensorGrid isolate' });
    showSuccessToast('Isolate command dispatched');
  } catch (err) {
    showErrorToast(err instanceof Error ? err.message : 'Isolate failed');
  }
}

async function dispatchKill(agentId: string, hostname: string): Promise<void> {
  const raw = window.prompt('Process PID to terminate on this sensor:');
  if (raw === null) return;
  const pid = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    showErrorToast('Enter a valid positive PID');
    return;
  }
  if (!window.confirm(`Kill PID ${pid} on ${hostname || agentId}?`)) return;
  try {
    await killSensorProcess({ agentId, pid });
    showSuccessToast('Kill process command dispatched');
  } catch (err) {
    showErrorToast(err instanceof Error ? err.message : 'Kill process failed');
  }
}

/**
 * ActionsCellRenderer — role-aware remote actions.
 * Enable only when REMOTE_SENSOR_ACTIONS_LIVE_VERIFIED flips true AND caller
 * has Platform Administrator or SOC Manager. Calls JWT → /api/edr/* → ProcessCommand.
 * No React hooks here — AG Grid may remount cell renderers freely.
 */
function ActionsCellRenderer(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const sensor = params.data;
  const agentId = sensor?.agentId ?? null;
  const hostname = sensor?.hostname ?? '';
  const roleOk = hasAuthority('ROLE_ADMIN') || hasAuthority('ROLE_SOC_MANAGER');
  const killReady = canEnableKillProcess();
  const isolateReady = canEnableIsolateHost();
  const canKill = killReady && roleOk && Boolean(agentId);
  const canIsolate = isolateReady && roleOk && Boolean(agentId);

  const roleBlocked = 'Required permission: Platform Administrator or SOC Manager';
  const idBlocked = 'Sensor is missing an agent id';
  const killBlockedTitle = !killReady
    ? REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE
    : !roleOk
      ? roleBlocked
      : !agentId
        ? idBlocked
        : '';
  const isolateBlockedTitle = !isolateReady
    ? REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE
    : !roleOk
      ? roleBlocked
      : !agentId
        ? idBlocked
        : '';

  const noHandlerTitle = 'No agent ProcessCommand handler for this action';

  return (
    <div
      style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}
    >
      <ActionButton
        label="Isolate"
        ariaLabel={canIsolate ? 'Isolate host' : 'Isolate host (blocked)'}
        disabled={!canIsolate}
        title={canIsolate ? 'Isolate host via ProcessCommand (EDR_ISOLATE)' : isolateBlockedTitle}
        danger
        onClick={() => {
          if (agentId) void dispatchIsolate(agentId, hostname);
        }}
      />
      <ActionButton
        label="Kill"
        ariaLabel={canKill ? 'Kill process' : 'Kill process (blocked)'}
        disabled={!canKill}
        title={canKill ? 'Kill process via ProcessCommand (EDR_KILL)' : killBlockedTitle}
        danger
        onClick={() => {
          if (agentId) void dispatchKill(agentId, hostname);
        }}
      />
      <ActionButton
        label="Restart"
        ariaLabel="Restart agent (unavailable)"
        disabled
        title={noHandlerTitle}
      />
    </div>
  );
}

/**
 * SensorGridPage — Sensor health monitoring (POS-05)
 *
 * Kill: JWT → @PreAuthorize EDR REST → ProcessCommand (STAGING CANDIDATE when verified).
 * Isolate: same path but fail-closed until isolate live-verify flips (B1-SENS-02).
 * Restart has no agent handler — remains unavailable.
 */
export function SensorGridPage(): JSX.Element {
  const [density] = useRowDensity();
  const { eps, connected: epsConnected } = useEpsStream();
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const canProvisionAgent = hasAuthority('ROLE_ADMIN');
  const killReady = canEnableKillProcess();
  const isolateReady = canEnableIsolateHost();
  const showRemoteHonesty = !killReady || !isolateReady;

  const {
    data: sensors = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['sensors'],
    queryFn: async () => {
      const { sensors: rows } = await fetchSensors({ size: 1000 });
      return rows;
    },
  });

  const activeSensors = useMemo(
    () => sensors.filter((s) => s.connectionStatus === 'ONLINE').length,
    [sensors]
  );
  const totalSensors = sensors.length;

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
          ONLINE: {
            label: 'Online',
            bg: 'var(--ha-fill-low-muted)',
            color: 'var(--ha-positive)',
          },
          OFFLINE: {
            label: 'Offline',
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
      width: 220,
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
      {showRemoteHonesty && (
        <HaInlineBanner
          variant="warning"
          title={
            !killReady
              ? REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE
              : REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE
          }
          description={REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION}
          isDismissible={false}
        />
      )}

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

      <AddAgentDrawer
        isOpen={addAgentOpen}
        onClose={() => setAddAgentOpen(false)}
      />
    </div>
  );
}
