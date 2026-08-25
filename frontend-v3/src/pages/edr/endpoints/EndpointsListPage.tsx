/**
 * EndpointsListPage — /edr/endpoints
 *
 * Agent selector grid — entry point for the EDR timeline.
 * Clicking any row navigates to /edr/timeline/:agentId.
 *
 * This page fills the missing entry-point gap: EndpointTimelinePage at
 * /edr/timeline/:agentId exists but required knowing the agentId upfront.
 */

import React, { useEffect, useState } from 'react';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';
import type { SensorDTO } from '@/services/sensorsService';
import { fetchSensors } from '@/services/sensorsService';

function statusCell(params: { value: 'ONLINE' | 'OFFLINE' | 'UNKNOWN' }): React.ReactElement {
  const color =
    params.value === 'ONLINE'  ? 'var(--ha-positive)' :
    params.value === 'OFFLINE' ? 'var(--ha-critical)'  : 'var(--ha-text-secondary)';
  return (
    <span style={{ color, fontWeight: 600, fontSize: 'var(--ha-text-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {params.value}
    </span>
  );
}

function modeCell(params: { value: string | null }): React.ReactElement {
  if (!params.value) {
    return <span style={{ color: 'var(--ha-text-secondary)', fontSize: 'var(--ha-text-xs)' }}>Not reported</span>;
  }
  const mode = params.value;
  const isEdr = mode === 'edr';
  return (
    <span style={{
      background: isEdr ? 'color-mix(in srgb, var(--ha-high) 12%, transparent)' : 'color-mix(in srgb, var(--ha-text-secondary) 10%, transparent)',
      color: isEdr ? 'var(--ha-high)' : 'var(--ha-text-secondary)',
      padding: '1px 6px',
      borderRadius: 'var(--ha-radius-sm)',
      fontSize: 'var(--ha-text-xs)',
      fontWeight: 700,
      textTransform: 'uppercase',
    }}>
      {isEdr ? 'LOG + EDR' : 'LOG ONLY'}
    </span>
  );
}

const COL_DEFS: ColDef<SensorDTO>[] = [
  { field: 'hostname',         headerName: 'Hostname',    flex: 1, sortable: true },
  { field: 'platform',         headerName: 'Platform',    width: 110 },
  { field: 'osVersion',        headerName: 'OS Version',  width: 160 },
  { field: 'agentVersion',     headerName: 'Agent',       width: 100 },
  { field: 'connectionStatus', headerName: 'Status',      width: 110, cellRenderer: statusCell, sortable: true },
  { field: 'mode',             headerName: 'Mode',        width: 110, cellRenderer: modeCell },
  { field: 'cpuUsage',         headerName: 'CPU%',        width: 80,
    valueFormatter: (p: { value: number | null }) => p.value != null ? `${p.value.toFixed(1)}%` : '—' },
  { field: 'memUsage',         headerName: 'RAM%',        width: 80,
    valueFormatter: (p: { value: number | null }) => p.value != null ? `${p.value.toFixed(1)}%` : '—' },
  { field: 'lastSeen',         headerName: 'Last Seen',   width: 160,
    valueFormatter: (p: { value: string | null }) => p.value ? new Date(p.value).toLocaleString() : '—' },
];

export function EndpointsListPage(): React.ReactElement {
  const navigate = useNavigate();
  const [density] = useRowDensity();

  const [sensors, setSensors]   = useState<SensorDTO[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchSensors({ size: 1000 })
      .then(({ sensors: s }) => setSensors(s))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleRowClicked = (event: RowClickedEvent<SensorDTO>): void => {
    const agentId = event.data?.agentId;
    if (agentId) {
      navigate(`/edr/timeline/${encodeURIComponent(agentId)}`);
    }
  };

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <ErrorState
        title="Endpoint telemetry is unavailable"
        message={error}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <SiemPageHeader
        title="Endpoint Telemetry"
        description="Select an agent to open the EDR event timeline"
      />

      <div style={{ flex: 1, padding: '0 16px 16px', minHeight: 0 }}>
        {sensors.length === 0 ? (
          <EmptyState
            title="No agents registered"
            description="Install the HiveArmor agent on endpoints to see them here."
          />
        ) : (
          <SiemDataGrid
            columnDefs={COL_DEFS as ColDef[]}
            rowData={sensors}
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
