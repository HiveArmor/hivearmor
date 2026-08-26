/**
 * EndpointsListPage — /edr/endpoints
 *
 * EDR host workbench: searchable inventory → open host timelines.
 * Sensors (/posture/sensors) remains fleet admin / enroll / containment.
 *
 * Data: GET /api/agent-manager/agents via fetchSensors (adaptAgentWireToSensor).
 */

import { useEffect, useMemo, useState } from 'react';

import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community';
import { Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { DensitySelector } from '@/components/density-selector';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { HaInlineBanner } from '@/components/ha-inline-banner';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import {
  REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED,
  REMOTE_SENSOR_KILL_LIVE_VERIFIED,
} from '@/services/sensorRemoteActions.capabilities';
import type { SensorDTO } from '@/services/sensorsService';
import { fetchSensors } from '@/services/sensorsService';

import './EndpointsListPage.css';

function statusClass(status: SensorDTO['connectionStatus']): string {
  if (status === 'ONLINE') return 'endpoints-hub-page__status endpoints-hub-page__status--online';
  if (status === 'OFFLINE') return 'endpoints-hub-page__status endpoints-hub-page__status--offline';
  return 'endpoints-hub-page__status endpoints-hub-page__status--unknown';
}

function statusLabel(status: SensorDTO['connectionStatus']): string {
  if (status === 'ONLINE') return 'Online';
  if (status === 'OFFLINE') return 'Offline';
  return 'Unknown';
}

function StatusCellRenderer(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const status = params.data?.connectionStatus ?? 'UNKNOWN';
  return (
    <span className={statusClass(status)}>
      <span className="endpoints-hub-page__status-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

function HostnameCellRenderer(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const sensor = params.data;
  const agentId = sensor?.agentId;
  const hostname = (params.value as string | undefined)?.trim() || agentId || '—';

  if (!agentId) {
    return (
      <span className="endpoints-hub-page__hostname endpoints-hub-page__hostname--plain">
        {hostname}
      </span>
    );
  }

  return (
    <Link
      to={`/edr/timeline/${encodeURIComponent(agentId)}`}
      className="endpoints-hub-page__hostname"
      aria-label={`Open EDR timeline for ${hostname}`}
      title="Open EDR event timeline"
      onClick={(event) => event.stopPropagation()}
    >
      {hostname}
    </Link>
  );
}

/**
 * Primary: Open timeline (same path as Sensors).
 * Secondary: Sensors fleet for enroll / version drift.
 */
function ActionsCellRenderer(params: ICellRendererParams<SensorDTO>): JSX.Element {
  const sensor = params.data;
  const agentId = sensor?.agentId ?? null;
  const hostname = sensor?.hostname ?? '';

  const timelineHref = agentId
    ? `/edr/timeline/${encodeURIComponent(agentId)}`
    : null;

  return (
    <div className="endpoints-hub-page__actions">
      {timelineHref ? (
        <Link
          to={timelineHref}
          className="endpoints-hub-page__action-link"
          aria-label={`Open EDR timeline for ${hostname || agentId}`}
          title="Open EDR event timeline"
          onClick={(event) => event.stopPropagation()}
        >
          Open timeline
        </Link>
      ) : (
        <span className="endpoints-hub-page__action-link" aria-disabled="true" title="Host is missing an agent id">
          Open timeline
        </span>
      )}
      <Link
        to="/posture/sensors"
        className="endpoints-hub-page__action-link endpoints-hub-page__action-link--secondary"
        aria-label="Open Sensors fleet for install and version drift"
        title="Fleet admin, enroll, and package versions"
        onClick={(event) => event.stopPropagation()}
      >
        Sensors
      </Link>
    </div>
  );
}

function matchesSearch(sensor: SensorDTO, query: string): boolean {
  if (!query) return true;
  const haystack = [
    sensor.hostname,
    sensor.agentId,
    sensor.platform,
    sensor.osVersion ?? '',
    sensor.agentVersion ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function honestyDescription(): string {
  const containment = REMOTE_SENSOR_KILL_LIVE_VERIFIED
    ? REMOTE_SENSOR_ISOLATE_LIVE_VERIFIED
      ? 'Remote containment is available on Sensors for Platform Administrator and SOC Manager.'
      : 'Kill process is available on Sensors for Platform Administrator and SOC Manager; host isolation stays disabled until verified end-to-end.'
    : 'Remote containment on Sensors stays gated until verified end-to-end.';
  return (
    `Open host timelines and endpoint defense views here. Fleet enrollment, installer packages, and version drift live on Sensors. ` +
    `CPU, memory, and collector mode are not projected by the agent registry yet. ${containment}`
  );
}

export function EndpointsListPage(): JSX.Element {
  const navigate = useNavigate();
  const [density] = useRowDensity();
  const [sensors, setSensors] = useState<SensorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSensors({ size: 1000 })
      .then(({ sensors: next }) => {
        if (!cancelled) setSensors(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const normalizedQuery = searchText.trim().toLowerCase();
  const filteredSensors = useMemo(
    () => sensors.filter((row) => matchesSearch(row, normalizedQuery)),
    [sensors, normalizedQuery],
  );

  const onlineCount = useMemo(
    () => sensors.filter((row) => row.connectionStatus === 'ONLINE').length,
    [sensors],
  );

  const columnDefs = useMemo<ColDef<SensorDTO>[]>(
    () => [
      {
        field: 'hostname',
        headerName: 'Hostname',
        flex: 1.4,
        minWidth: 160,
        sortable: true,
        cellRenderer: HostnameCellRenderer,
      },
      { field: 'platform', headerName: 'Platform', width: 110, sortable: true },
      {
        field: 'osVersion',
        headerName: 'OS',
        width: 120,
        valueFormatter: (p) => (p.value as string | null) || '—',
      },
      {
        field: 'agentVersion',
        headerName: 'Agent',
        width: 110,
        valueFormatter: (p) => (p.value as string | null) || '—',
      },
      {
        field: 'connectionStatus',
        headerName: 'Status',
        width: 110,
        sortable: true,
        cellRenderer: StatusCellRenderer,
      },
      {
        field: 'lastSeen',
        headerName: 'Last Seen',
        width: 170,
        sortable: true,
        valueFormatter: (p) =>
          p.value ? new Date(p.value as string).toLocaleString() : '—',
      },
      {
        colId: 'actions',
        headerName: 'Actions',
        width: 200,
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: ActionsCellRenderer,
      },
    ],
    [],
  );

  const handleRowClicked = (event: RowClickedEvent<SensorDTO>): void => {
    const agentId = event.data?.agentId;
    if (agentId) {
      navigate(`/edr/timeline/${encodeURIComponent(agentId)}`);
    }
  };

  return (
    <div className="endpoints-hub-page">
      <div className="endpoints-hub-page__banner">
        <HaInlineBanner
          variant="info"
          title="Endpoints is the host timeline workbench"
          description={honestyDescription()}
          isDismissible={false}
        />
      </div>

      <header className="endpoints-hub-page__header">
        <div className="endpoints-hub-page__title-block">
          <div className="endpoints-hub-page__title-row">
            <h1 className="endpoints-hub-page__title">Endpoints</h1>
            {!loading && !error && (
              <span className="endpoints-hub-page__count">
                {onlineCount} / {sensors.length} online
              </span>
            )}
          </div>
          <p className="endpoints-hub-page__job">
            Open host timelines and endpoint defense views. Use Sensors for fleet
            enrollment and installer packages.
          </p>
        </div>

        <div className="endpoints-hub-page__toolbar">
          <label className="endpoints-hub-page__search">
            <Search size={14} className="endpoints-hub-page__search-icon" aria-hidden="true" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search hosts…"
              aria-label="Search endpoints by hostname, platform, or agent id"
            />
          </label>
          <DensitySelector />
          <Link to="/posture/sensors" className="endpoints-hub-page__link">
            Sensors — fleet / enroll
          </Link>
        </div>
      </header>

      <div className="endpoints-hub-page__inventory" aria-label="Endpoint host inventory">
        {loading && <LoadingState message="Loading endpoints..." />}

        {!loading && error && (
          <ErrorState
            title="Endpoint inventory is unavailable"
            message={error}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        )}

        {!loading && !error && sensors.length === 0 && (
          <EmptyState
            title="No endpoints registered"
            description="Install the HiveArmor agent from Sensors to enroll hosts, then return here to open timelines."
            action={
              <Link to="/posture/sensors" className="endpoints-hub-page__link">
                Open Sensors — fleet / enroll
              </Link>
            }
          />
        )}

        {!loading && !error && sensors.length > 0 && filteredSensors.length === 0 && (
          <EmptyState
            title="No hosts match this search"
            description="Clear the search box to see the full endpoint inventory."
            action={
              <button
                type="button"
                className="endpoints-hub-page__link"
                onClick={() => setSearchText('')}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'var(--ha-font-ui)',
                }}
              >
                Clear search
              </button>
            }
          />
        )}

        {!loading && !error && filteredSensors.length > 0 && (
          <SiemDataGrid
            columnDefs={columnDefs as ColDef[]}
            rowData={filteredSensors}
            rowModelType="clientSide"
            rowHeight={ROW_HEIGHTS[density]}
            height="100%"
            getRowId={(params) => {
              const row = params.data as SensorDTO | undefined;
              return row?.agentId ?? '';
            }}
            onRowClicked={(event) => handleRowClicked(event as RowClickedEvent<SensorDTO>)}
            defaultColDef={{ sortable: true, filter: false, resizable: true }}
            ariaLabel="Registered endpoints"
          />
        )}
      </div>
    </div>
  );
}
