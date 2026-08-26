import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Activity, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AddAgentDrawer } from './AddAgentDrawer';
import { AgentPackageCatalog } from './AgentPackageCatalog';
import { SensorFleetSummary } from './SensorFleetSummary';

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
  fetchAgentPackageSummary,
  isAgentVersionBehind,
} from '@/services/agentPackage.service';
import {
  canEnableIsolateHost,
  canEnableKillProcess,
  REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION,
  REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE,
  REMOTE_SENSOR_ISOLATE_BANNER_DISMISS_KEY,
  REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE,
  REMOTE_SENSOR_ISOLATE_ONLY_DESCRIPTION,
} from '@/services/sensorRemoteActions.capabilities';
import {
  isolateSensor,
  killSensorProcess,
} from '@/services/sensorRemoteActions.service';
import { fetchSensors } from '@/services/sensorsService';
import type { SensorDTO } from '@/services/sensorsService';
import { useAuthStore } from '@/store/auth.store';

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
  const [isolateBannerDismissed, setIsolateBannerDismissed] = useState(false);
  const canProvisionAgent = hasAuthority('ROLE_ADMIN');
  const canViewEnrollmentAudit = useAuthStore((state) =>
    state.hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER'])
  );
  const killReady = canEnableKillProcess();
  const isolateReady = canEnableIsolateHost();
  // Full-block banner only when kill is also unavailable. Isolate-only uses a
  // compact dismissible note so Add Agent / enrollment stays the primary focus.
  const showFullRemoteBlockBanner = !killReady;
  const showIsolateOnlyBanner =
    killReady && !isolateReady && !isolateBannerDismissed;

  useEffect(() => {
    try {
      setIsolateBannerDismissed(
        localStorage.getItem(REMOTE_SENSOR_ISOLATE_BANNER_DISMISS_KEY) === '1'
      );
    } catch {
      setIsolateBannerDismissed(false);
    }
  }, []);

  const dismissIsolateBanner = (): void => {
    setIsolateBannerDismissed(true);
    try {
      localStorage.setItem(REMOTE_SENSOR_ISOLATE_BANNER_DISMISS_KEY, '1');
    } catch {
      // ignore quota / private mode
    }
  };

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

  const packageSummaryQuery = useQuery({
    queryKey: ['ha-agent-packages-summary'],
    queryFn: fetchAgentPackageSummary,
    retry: false,
    staleTime: 30_000,
  });
  const latestPublished = packageSummaryQuery.data?.latestVersion ?? null;

  const activeSensors = useMemo(
    () => sensors.filter((s) => s.connectionStatus === 'ONLINE').length,
    [sensors]
  );
  const totalSensors = sensors.length;

  const columnDefs: ColDef<SensorDTO>[] = useMemo((): ColDef<SensorDTO>[] => [
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
      width: 180,
      cellRenderer: (params: ICellRendererParams<SensorDTO>) => {
        const current = params.value as string | null | undefined;
        const behind = isAgentVersionBehind(current, latestPublished);
        return (
          <span
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 2,
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-sm)',
            }}
          >
            <span>{current?.trim() ? current : '—'}</span>
            {behind && (
              <span
                style={{
                  fontFamily: 'var(--ha-font-ui)',
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-high)',
                }}
              >
                Behind {latestPublished}
              </span>
            )}
            {!behind && latestPublished && current?.trim() === latestPublished && (
              <span
                style={{
                  fontFamily: 'var(--ha-font-ui)',
                  fontSize: 'var(--ha-text-xs)',
                  color: 'var(--ha-positive)',
                }}
              >
                Current
              </span>
            )}
          </span>
        );
      },
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
    ],
    [latestPublished]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--ha-background)',
      }}
    >
      {showFullRemoteBlockBanner && (
        <HaInlineBanner
          variant="warning"
          title={REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE}
          description={REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION}
          isDismissible={false}
        />
      )}

      {showIsolateOnlyBanner && (
        <div style={{ margin: '12px 16px 0' }}>
          <HaInlineBanner
            variant="info"
            title={REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE}
            description={REMOTE_SENSOR_ISOLATE_ONLY_DESCRIPTION}
            isDismissible
            onDismiss={dismissIsolateBanner}
          />
        </div>
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
          {canViewEnrollmentAudit && (
            <Link
              to="/admin/enrollment-audit"
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-primary)',
                textDecoration: 'none',
              }}
            >
              Enrollment audit
            </Link>
          )}
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

      {!isLoading && !isError && <SensorFleetSummary sensors={sensors} />}

      {canProvisionAgent && (
        <ol
          className="sensor-enroll-steps"
          aria-label="How to enroll an agent"
          style={{
            display: 'grid',
            gap: 4,
            margin: '12px 16px 0',
            padding: '10px 14px',
            listStyle: 'decimal inside',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-md)',
            background: 'var(--ha-surface-primary)',
            color: 'var(--ha-text-secondary)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          <li>
            Click <strong style={{ color: 'var(--ha-text-primary)' }}>Add Agent</strong> to generate
            a one-click install script.
          </li>
          <li>
            Run the script on the endpoint as administrator — it downloads the matching package and
            registers the host.
          </li>
          <li>
            Refresh until Online. Check{' '}
            <Link to="/admin/enrollment-audit" style={{ color: 'var(--ha-primary)' }}>
              Enrollment audit
            </Link>{' '}
            after selecting a masthead tenant.
          </li>
        </ol>
      )}

      {!canProvisionAgent && (
        <div
          role="status"
          style={{
            margin: '0 16px 12px',
            padding: '10px 12px',
            border: '1px solid var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            background: 'var(--ha-surface-primary)',
            color: 'var(--ha-text-secondary)',
            fontSize: 'var(--ha-text-sm)',
          }}
        >
          Agent install scripts require Platform Administrator. Analysts can monitor registered sensors
          here; ask an administrator to run Add Agent.
        </div>
      )}

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
            description="Use Add Agent to generate a keyed install script. The script downloads the agent package and registers this host. Optional package cards above are for air-gapped installs only."
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
