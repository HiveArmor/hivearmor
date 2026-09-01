/**
 * UserRiskTable — AG Grid table for per-user risk scores.
 *
 * Primary work surface on the UEBA risk dashboard (≥50vh).
 * Columns: user identifier, risk score, top metric, last updated, actions.
 */

import { useCallback, useMemo } from 'react';

import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Link } from 'react-router-dom';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import type { UserRiskDTO } from '@/types/ueba.types';

export interface UserRiskTableProps {
  data: UserRiskDTO[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  onViewTimeline?: (userId: string) => void;
  onCreateIncident?: (userId: string) => void;
}

export function UserRiskTable({
  data,
  isLoading,
  isError = false,
  onViewTimeline,
  onCreateIncident,
}: UserRiskTableProps): JSX.Element {
  const [density] = useRowDensity();
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
        field: 'anomalyCount',
        headerName: 'Anomalies',
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
    [handleCreateIncident, handleViewTimeline],
  );

  const rowCount = data?.length ?? 0;
  const showEmpty = !isLoading && !isError && rowCount === 0;

  return (
    <div className="ueba-risk-table" data-testid="ueba-risk-table">
      <div className="ueba-risk-table__header">
        <h2>User Risk Scores</h2>
        {!isLoading && (
          <span className="ueba-risk-table__count" data-testid="ueba-risk-row-count">
            {rowCount} user{rowCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isError && (
        <div className="ueba-risk-table__inline-state" role="alert" data-testid="ueba-risk-table-error">
          <strong>Risk scores unavailable.</strong>
          <span>User risk scores could not be loaded from `/api/ha-ueba/risk-scores`.</span>
        </div>
      )}

      {showEmpty && (
        <div className="ueba-risk-table__inline-state" role="status" data-testid="ueba-risk-table-empty">
          <strong>No scored users returned.</strong>
          <span>
            The UEBA baseline engine may not have processed users on this tenant yet. Pivot to{' '}
            <Link to="/search">Search &amp; Hunt</Link> or <Link to="/entities">Entities</Link> while
            baselines build.
          </span>
        </div>
      )}

      <div className="ueba-risk-table__grid">
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={data ?? []}
          height="100%"
          loading={isLoading}
          rowHeight={ROW_HEIGHTS[density]}
          defaultColDef={{ resizable: true }}
          getRowId={(params) => (params.data as UserRiskDTO).userId}
        />
      </div>
    </div>
  );
}

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
