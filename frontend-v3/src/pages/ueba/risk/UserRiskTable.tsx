/**
 * UserRiskTable — AG Grid table for per-user risk scores.
 *
 * Columns: user identifier, current risk score, top contributing metric, last updated.
 * Actions column: "View Timeline" and "Create Incident" buttons.
 *
 * The TanStack Query data is shared with the bar chart (passed as prop).
 *
 * Requirements: 6.5, 6.6
 */

import { useCallback, useMemo } from 'react';

import type { ColDef, ICellRendererParams } from 'ag-grid-community';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import type { UserRiskDTO } from '@/types/ueba.types';

export interface UserRiskTableProps {
  data: UserRiskDTO[] | undefined;
  isLoading: boolean;
  /** Called when the "View Timeline" action is activated for a user row. */
  onViewTimeline?: (userId: string) => void;
  /** Called when the "Create Incident" action is activated for a user row. */
  onCreateIncident?: (userId: string) => void;
}

export function UserRiskTable({
  data,
  isLoading,
  onViewTimeline,
  onCreateIncident,
}: UserRiskTableProps): JSX.Element {
  const handleViewTimeline = useCallback(
    (userId: string) => {
      onViewTimeline?.(userId);
    },
    [onViewTimeline],
  );

  const handleCreateIncident = useCallback(
    (userId: string) => {
      onCreateIncident?.(userId);
    },
    [onCreateIncident],
  );

  const columnDefs = useMemo<ColDef<UserRiskDTO>[]>(
    () => [
      {
        field: 'userId',
        headerName: 'User',
        flex: 2,
        sortable: true,
        filter: true,
      },
      {
        field: 'totalScore',
        headerName: 'Risk Score',
        flex: 1,
        sortable: true,
        filter: true,
      },
      {
        field: 'topMetric',
        headerName: 'Top Contributing Metric',
        flex: 2,
        sortable: true,
        valueFormatter: (params) => params.value ?? '—',
      },
      {
        field: 'lastUpdated',
        headerName: 'Last Updated',
        flex: 1.5,
        sortable: true,
        valueFormatter: (params) =>
          params.value ? new Date(params.value as string).toLocaleString() : '—',
      },
      {
        headerName: 'Actions',
        flex: 2,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<UserRiskDTO>) => {
          if (!params.data) return null;
          return (
            <RowActions
              userId={params.data.userId}
              onViewTimeline={handleViewTimeline}
              onCreateIncident={handleCreateIncident}
            />
          );
        },
      },
    ],
    [handleViewTimeline, handleCreateIncident],
  );

  return (
    <div className="ha-panel" style={{ minHeight: 300 }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 500 }}>
        User Risk Scores
      </h2>
      <SiemDataGrid
        columnDefs={columnDefs}
        rowData={data ?? []}
        height={400}
        loading={isLoading}
        rowHeight={40}
        defaultColDef={{ resizable: true }}
        getRowId={(params) => (params.data as UserRiskDTO).userId}
      />
    </div>
  );
}

// ── Row Actions Cell ────────────────────────────────────────────────────────

interface RowActionsProps {
  userId: string;
  onViewTimeline: (userId: string) => void;
  onCreateIncident: (userId: string) => void;
}

function RowActions({ userId, onViewTimeline, onCreateIncident }: RowActionsProps): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', height: '100%' }}>
      <button
        type="button"
        className="ha-btn ha-btn--tertiary ha-btn--sm"
        onClick={() => onViewTimeline(userId)}
      >
        View Timeline
      </button>
      <button
        type="button"
        className="ha-btn ha-btn--tertiary ha-btn--sm"
        onClick={() => onCreateIncident(userId)}
      >
        Create Incident
      </button>
    </div>
  );
}
