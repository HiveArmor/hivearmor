/**
 * Recent Incidents Table Component
 * Shows the 5 most recent open incidents using SiemDataGrid (AG Grid).
 * Columns: Severity, Incident Name, Status, Assigned To, Alert Count, SLA, SLA Status
 */

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import type { IncidentDTO } from '@/types/api.types';

export interface RecentIncidentsTableProps {
  incidents: IncidentDTO[];
  loading?: boolean;
}

const INCIDENT_COLUMNS: ColDef<IncidentDTO>[] = [
  {
    headerName: 'Severity',
    field: 'severity',
    width: 88,
    cellRenderer: (params: { value: string }) => {
      const severityConfig: Record<string, { label: string; color: string }> = {
        critical: { label: 'Critical', color: 'var(--ha-critical)' },
        high: { label: 'High', color: 'var(--ha-high)' },
        medium: { label: 'Medium', color: 'var(--ha-medium)' },
        low: { label: 'Low', color: 'var(--ha-positive)' },
        info: { label: 'Info', color: 'var(--ha-text-secondary)' },
      };
      const cfg = severityConfig[params.value?.toLowerCase()] ?? {
        label: params.value ?? '—',
        color: 'var(--ha-text-secondary)',
      };
      return (
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            fontWeight: 500,
            color: cfg.color,
          }}
        >
          {cfg.label}
        </span>
      );
    },
  },
  {
    headerName: 'Incident',
    field: 'title',
    flex: 1,
    minWidth: 200,
    cellStyle: {
      fontWeight: 500,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    tooltipField: 'title',
  },
  {
    headerName: 'Status',
    field: 'status',
    width: 110,
    cellRenderer: (params: { value: string }) => {
      const statusConfig: Record<string, { label: string; color: string }> = {
        open: { label: 'Open', color: 'var(--ha-critical)' },
        in_progress: { label: 'In Progress', color: 'var(--ha-high)' },
        resolved: { label: 'Resolved', color: 'var(--ha-positive)' },
        closed: { label: 'Closed', color: 'var(--ha-text-secondary)' },
      };
      const cfg = statusConfig[params.value?.toLowerCase()] ?? {
        label: params.value ?? '—',
        color: 'var(--ha-text-secondary)',
      };
      return (
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: cfg.color,
            fontWeight: 500,
          }}
        >
          {cfg.label}
        </span>
      );
    },
  },
  {
    headerName: 'Assigned To',
    field: 'assignee',
    width: 140,
    valueFormatter: (params) => {
      const assignee = params.value as IncidentDTO['assignee'];
      if (!assignee) return 'Unassigned';
      return `${assignee.firstName} ${assignee.lastName}`;
    },
    cellStyle: {
      fontSize: 'var(--ha-text-sm)',
      color: 'var(--ha-text-secondary)',
    },
  },
  {
    headerName: 'Alerts',
    field: 'alertCount',
    width: 80,
    cellStyle: {
      fontFamily: 'var(--ha-font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: 'var(--ha-text-xs)',
    },
  },
  {
    headerName: 'SLA',
    field: 'slaDueAt',
    width: 100,
    cellStyle: {
      fontFamily: 'var(--ha-font-mono)',
      fontSize: 'var(--ha-text-xs)',
      fontVariantNumeric: 'tabular-nums',
    },
    cellRenderer: (params: { value: string | null }) => {
      if (!params.value) {
        return <span style={{ color: 'var(--ha-text-secondary)' }}>—</span>;
      }
      const deadline = new Date(params.value);
      const msLeft = deadline.getTime() - Date.now();
      if (msLeft < 0) {
        return (
          <span style={{ color: 'var(--ha-critical)', fontWeight: 700 }}>
            BREACHED
          </span>
        );
      }
      const hoursLeft = Math.floor(msLeft / 3600000);
      const minutesLeft = Math.floor((msLeft % 3600000) / 60000);
      const color = hoursLeft < 2 ? 'var(--ha-high)' : 'var(--ha-text-secondary)';
      return (
        <span style={{ color }}>
          {hoursLeft}h {minutesLeft}m
        </span>
      );
    },
  },
  {
    headerName: 'SLA Status',
    field: 'slaDueAt',
    colId: 'slaStatus',
    width: 88,
    cellRenderer: (params: { value: string | null }) => {
      if (!params.value) return null;
      const deadline = new Date(params.value);
      const isBreached = deadline.getTime() - Date.now() < 0;
      if (!isBreached) return null;
      return (
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-critical)',
            fontWeight: 700,
          }}
        >
          BREACHED
        </span>
      );
    },
  },
];

export function RecentIncidentsTable({
  incidents,
  loading,
}: RecentIncidentsTableProps): JSX.Element {
  const navigate = useNavigate();

  const handleRowClicked = (event: RowClickedEvent): void => {
    const data = event.data as IncidentDTO | undefined;
    if (data?.id) {
      navigate(`/incidents/${data.id}`);
    }
  };

  return (
    <div
      style={{
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-base)',
        overflow: 'hidden',
      }}
    >
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
            fontWeight: 600,
            color: 'var(--ha-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Recent Open Incidents
        </span>
        <button
          onClick={() => navigate('/incidents')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ha-primary)',
            fontSize: 'var(--ha-text-sm)',
            cursor: 'pointer',
            padding: 0,
          }}
          type="button"
        >
          View all →
        </button>
      </div>

      <div style={{ height: 200 }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-secondary)',
              }}
            >
              Loading…
            </span>
          </div>
        ) : incidents.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <span
              style={{
                fontSize: 'var(--ha-text-sm)',
                color: 'var(--ha-text-secondary)',
              }}
            >
              No open incidents
            </span>
          </div>
        ) : (
          <SiemDataGrid
            columnDefs={INCIDENT_COLUMNS}
            rowData={incidents}
            rowHeight={40}
            rowModelType="clientSide"
            height="200px"
            onRowClicked={handleRowClicked}
          />
        )}
      </div>
    </div>
  );
}
