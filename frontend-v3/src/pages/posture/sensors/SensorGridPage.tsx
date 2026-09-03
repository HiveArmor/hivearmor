import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Activity, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

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

import './SensorGridPage.css';

type StatusFilter = 'ALL' | 'ONLINE' | 'OFFLINE';

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
      className={
        danger
          ? 'sensor-fleet-page__action-btn sensor-fleet-page__action-btn--danger'
          : 'sensor-fleet-page__action-btn'
      }
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : onClick}
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
 * Row actions — open timeline + containment only.
 * Restart has no agent handler; omit dead affordances from the grid (SIEM pattern).
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

  const timelineHref = agentId
    ? `/edr/timeline/${encodeURIComponent(agentId)}`
    : null;

  return (
    <div className="sensor-fleet-page__actions">
      {timelineHref ? (
        <Link
          to={timelineHref}
          className="sensor-fleet-page__action-link"
          aria-label={`Open EDR timeline for ${hostname || agentId}`}
          title="Open EDR event timeline"
        >
          Timeline
        </Link>
      ) : (
        <ActionButton
          label="Timeline"
          ariaLabel="Open EDR timeline (unavailable)"
          disabled
          title={idBlocked}
        />
      )}
      <ActionButton
        label="Isolate"
        ariaLabel={canIsolate ? 'Isolate host' : 'Isolate host (blocked)'}
        disabled={!canIsolate}
        title={canIsolate ? 'Isolate host' : isolateBlockedTitle}
        danger
        onClick={() => {
          if (agentId) void dispatchIsolate(agentId, hostname);
        }}
      />
      <ActionButton
        label="Kill"
        ariaLabel={canKill ? 'Kill process' : 'Kill process (blocked)'}
        disabled={!canKill}
        title={canKill ? 'Kill process on this sensor' : killBlockedTitle}
        danger
        onClick={() => {
          if (agentId) void dispatchKill(agentId, hostname);
        }}
      />
    </div>
  );
}

function HostnameCellRenderer(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const sensor = params.data;
  const agentId = sensor?.agentId;
  const hostname = (params.value as string | undefined)?.trim() || agentId || '—';

  if (!agentId) {
    return (
      <span className="sensor-fleet-page__hostname sensor-fleet-page__hostname--plain">
        {hostname}
      </span>
    );
  }

  return (
    <Link
      to={`/edr/timeline/${encodeURIComponent(agentId)}`}
      className="sensor-fleet-page__hostname"
      aria-label={`Open EDR timeline for ${hostname}`}
      title="Open EDR event timeline"
    >
      {hostname}
    </Link>
  );
}

function statusClass(status: string): string {
  if (status === 'ONLINE') return 'sensor-fleet-page__status sensor-fleet-page__status--online';
  if (status === 'OFFLINE') return 'sensor-fleet-page__status sensor-fleet-page__status--offline';
  return 'sensor-fleet-page__status sensor-fleet-page__status--unknown';
}

function statusLabel(status: string): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'OFFLINE') return 'Offline';
  return 'Unknown';
}

/**
 * SensorGridPage — agent fleet inventory (POS-05).
 *
 * Layout follows SIEM fleet UIs (Elastic Fleet / Defender inventory): inventory
 * first, enrollment secondary, containment gated and sparse on the row.
 */
export function SensorGridPage(): JSX.Element {
  const [density] = useRowDensity();
  const { eps, connected: epsConnected } = useEpsStream();
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isolateBannerDismissed, setIsolateBannerDismissed] = useState(false);
  const canProvisionAgent = hasAuthority('ROLE_ADMIN');
  const canViewEnrollmentAudit = useAuthStore((state) =>
    state.hasAnyRole(['ROLE_ADMIN', 'ROLE_SOC_MANAGER'])
  );
  const killReady = canEnableKillProcess();
  const isolateReady = canEnableIsolateHost();
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
  const publishedCount = packageSummaryQuery.data?.publishedCount ?? 0;
  const totalPackages = packageSummaryQuery.data?.totalCount ?? 0;

  const onlineCount = useMemo(
    () => sensors.filter((s) => s.connectionStatus === 'ONLINE').length,
    [sensors]
  );
  const offlineCount = useMemo(
    () => sensors.filter((s) => s.connectionStatus === 'OFFLINE').length,
    [sensors]
  );
  const behindCount = useMemo(() => {
    if (!latestPublished) return 0;
    return sensors.filter((s) => isAgentVersionBehind(s.agentVersion, latestPublished)).length;
  }, [sensors, latestPublished]);

  const filteredSensors = useMemo(() => {
    const rows =
      statusFilter === 'ALL'
        ? sensors
        : sensors.filter((s) => s.connectionStatus === statusFilter);
    // Online first (Elastic Fleet-style), then lastSeen descending.
    return [...rows].sort((a, b) => {
      const rank = (s: SensorDTO): number =>
        s.connectionStatus === 'ONLINE' ? 0 : s.connectionStatus === 'OFFLINE' ? 1 : 2;
      const byStatus = rank(a) - rank(b);
      if (byStatus !== 0) return byStatus;
      const aTs = a.lastSeen ? Date.parse(a.lastSeen) : 0;
      const bTs = b.lastSeen ? Date.parse(b.lastSeen) : 0;
      return bTs - aTs;
    });
  }, [sensors, statusFilter]);

  const columnDefs: ColDef<SensorDTO>[] = useMemo(
    (): ColDef<SensorDTO>[] => [
      {
        field: 'hostname',
        headerName: 'Hostname',
        flex: 1.4,
        minWidth: 180,
        cellRenderer: HostnameCellRenderer,
      },
      {
        field: 'connectionStatus',
        headerName: 'Status',
        width: 110,
        cellRenderer: (params: { value: string }) => (
          <span className={statusClass(params.value)}>{statusLabel(params.value)}</span>
        ),
      },
      {
        field: 'platform',
        headerName: 'Platform',
        width: 100,
        valueFormatter: (params) => {
          const platform = String(params.value ?? '');
          if (!platform) return '—';
          return platform.charAt(0).toUpperCase() + platform.slice(1);
        },
      },
      {
        field: 'agentVersion',
        headerName: 'Agent',
        width: 160,
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
        field: 'lastSeen',
        headerName: 'Last Seen',
        width: 168,
        cellStyle: {
          fontFamily: 'var(--ha-font-mono)',
          fontVariantNumeric: 'tabular-nums',
        },
        valueFormatter: (params) => {
          if (!params.value) return '—';
          return new Date(params.value as string).toLocaleString();
        },
      },
      {
        headerName: 'Actions',
        width: 210,
        pinned: 'right',
        cellRenderer: ActionsCellRenderer,
        sortable: false,
        filter: false,
        resizable: false,
      },
    ],
    [latestPublished]
  );

  const installOpen = !isLoading && !isError && sensors.length === 0;

  return (
    <div className="sensor-fleet-page">
      {showFullRemoteBlockBanner && (
        <div className="sensor-fleet-page__banner">
          <HaInlineBanner
            variant="warning"
            title={REMOTE_SENSOR_ACTIONS_BLOCKED_TITLE}
            description={REMOTE_SENSOR_ACTIONS_BLOCKED_DESCRIPTION}
            isDismissible={false}
          />
        </div>
      )}

      {showIsolateOnlyBanner && (
        <div className="sensor-fleet-page__banner">
          <HaInlineBanner
            variant="info"
            title={REMOTE_SENSOR_ISOLATE_BLOCKED_TITLE}
            description={REMOTE_SENSOR_ISOLATE_ONLY_DESCRIPTION}
            isDismissible
            onDismiss={dismissIsolateBanner}
          />
        </div>
      )}

      <header className="sensor-fleet-page__header">
        <div className="sensor-fleet-page__title-block">
          <div className="sensor-fleet-page__title-row">
            <h1 className="sensor-fleet-page__title">Sensors</h1>
            <span className="sensor-fleet-page__count">
              {onlineCount} / {sensors.length} online
            </span>
          </div>
          <p className="sensor-fleet-page__job">
            Agent fleet inventory — health, timelines, and enrollment.
          </p>
        </div>

        <div className="sensor-fleet-page__toolbar">
          <DensitySelector />
          <Link to="/edr/endpoints" className="sensor-fleet-page__link">
            Endpoint telemetry
          </Link>
          <Link to="/posture/sensors/fim-policies" className="sensor-fleet-page__link">
            Agent FIM policies
          </Link>
          {canViewEnrollmentAudit && (
            <Link to="/admin/enrollment-audit" className="sensor-fleet-page__link">
              Enrollment audit
            </Link>
          )}
          {canProvisionAgent ? (
            <HaButton
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => setAddAgentOpen(true)}
            >
              Add Agent
            </HaButton>
          ) : (
            <span className="sensor-fleet-page__role-note" role="status">
              Required permission: Platform Administrator to enroll agents
            </span>
          )}
        </div>
      </header>

      {!isLoading && !isError && (
        <div className="sensor-fleet-page__strip" aria-label="Fleet filters and summary">
          <div className="sensor-fleet-page__filters" role="group" aria-label="Filter by status">
            <button
              type="button"
              className={
                statusFilter === 'ALL'
                  ? 'sensor-fleet-page__filter sensor-fleet-page__filter--active'
                  : 'sensor-fleet-page__filter'
              }
              aria-pressed={statusFilter === 'ALL'}
              onClick={() => setStatusFilter('ALL')}
            >
              All ({sensors.length})
            </button>
            <button
              type="button"
              className={
                statusFilter === 'ONLINE'
                  ? 'sensor-fleet-page__filter sensor-fleet-page__filter--active'
                  : 'sensor-fleet-page__filter'
              }
              aria-pressed={statusFilter === 'ONLINE'}
              onClick={() => setStatusFilter('ONLINE')}
            >
              Online ({onlineCount})
            </button>
            <button
              type="button"
              className={
                statusFilter === 'OFFLINE'
                  ? 'sensor-fleet-page__filter sensor-fleet-page__filter--active'
                  : 'sensor-fleet-page__filter'
              }
              aria-pressed={statusFilter === 'OFFLINE'}
              onClick={() => setStatusFilter('OFFLINE')}
            >
              Offline ({offlineCount})
            </button>
          </div>

          <div className="sensor-fleet-page__meta">
            <span>
              Published{' '}
              <strong>
                {packageSummaryQuery.isLoading
                  ? '…'
                  : latestPublished ?? 'none'}
              </strong>
            </span>
            <span>
              Packages{' '}
              <strong>
                {packageSummaryQuery.isLoading
                  ? '…'
                  : `${publishedCount}/${totalPackages}`}
              </strong>
            </span>
            {behindCount > 0 && (
              <span className="sensor-fleet-page__meta-warn">
                Behind latest <strong>{behindCount}</strong>
              </span>
            )}
            {!packageSummaryQuery.isLoading && publishedCount === 0 && (
              <span className="sensor-fleet-page__meta-warn" role="status">
                No installer binaries published yet
              </span>
            )}
          </div>
        </div>
      )}

      <div className="sensor-fleet-page__inventory" aria-label="Agent inventory">
        {isLoading && <LoadingState message="Loading sensors..." />}

        {isError && (
          <ErrorState message="Could not load sensors." onRetry={refetch} />
        )}

        {!isLoading && !isError && sensors.length === 0 && (
          <EmptyState
            icon={<Activity size={48} />}
            title="No agents registered yet"
            description="Use Add Agent to generate a keyed install script. The script downloads the agent package and registers this host."
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

        {!isLoading && !isError && sensors.length > 0 && filteredSensors.length === 0 && (
          <EmptyState
            title={`No ${statusFilter.toLowerCase()} agents`}
            description="Clear the status filter to see the full fleet inventory."
            action={
              <HaButton variant="secondary" onClick={() => setStatusFilter('ALL')}>
                Show all agents
              </HaButton>
            }
          />
        )}

        {!isLoading && !isError && filteredSensors.length > 0 && (
          <SiemDataGrid
            columnDefs={columnDefs}
            rowData={filteredSensors}
            rowModelType="clientSide"
            height="100%"
            rowHeight={ROW_HEIGHTS[density]}
            getRowId={(params) => String((params.data as SensorDTO).agentId)}
            ariaLabel="Registered agents"
          />
        )}
      </div>

      <details className="sensor-fleet-page__install" open={installOpen}>
        <summary>
          Install agents &amp; package downloads
          {!canProvisionAgent
            ? ' (Platform Administrator required to generate scripts)'
            : ''}
        </summary>

        {canProvisionAgent && (
          <ol className="sensor-fleet-page__install-steps" aria-label="How to enroll an agent">
            <li>
              Click{' '}
              <strong style={{ color: 'var(--ha-text-primary)' }}>Add Agent</strong> to
              generate a one-click install script.
            </li>
            <li>
              Run the script on the endpoint as administrator — it downloads the matching
              package and registers the host.
            </li>
            <li>
              Refresh until Online. Check{' '}
              <Link to="/admin/enrollment-audit" className="sensor-fleet-page__link">
                Enrollment audit
              </Link>{' '}
              after selecting a masthead tenant.
            </li>
          </ol>
        )}

        {!canProvisionAgent && (
          <p className="sensor-fleet-page__install-note" role="status">
            Agent install scripts require Platform Administrator. Analysts can monitor
            registered sensors in the grid above.
          </p>
        )}

        <AgentPackageCatalog />
      </details>

      <StatusDock sseConnected={epsConnected} eps={eps} />

      <AddAgentDrawer isOpen={addAgentOpen} onClose={() => setAddAgentOpen(false)} />
    </div>
  );
}
