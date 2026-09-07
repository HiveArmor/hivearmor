/**
 * DeviationFindingsTable — tenant-scoped z-score deviations from GET /api/ha-ueba/deviations.
 * Points are rubric awards (|z|>4→50, |z|>3→25, |z|>2→10), not trained-model scores.
 */

import { useMemo } from 'react';

import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { Link } from 'react-router-dom';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import {
  uebaEntityDossierPath,
  uebaHuntPath,
  uebaTimelinePath,
} from '@/services/ueba.capabilities';
import type { HaUebaDeviationDTO, MetricName } from '@/types/ueba.types';

import './DeviationFindingsTable.css';

const METRIC_LABELS: Record<MetricName, string> = {
  logon_count_per_day: 'Logons / day',
  unique_src_ips: 'Unique source IPs',
  data_volume_bytes: 'Data volume',
  after_hours_logons: 'After-hours logons',
  failed_logon_ratio: 'Failed logon ratio',
};

export interface DeviationFindingsTableProps {
  data: HaUebaDeviationDTO[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  onViewTimeline?: (userId: string) => void;
}

function metricLabel(value: MetricName | null | undefined): string {
  if (!value) return '—';
  return METRIC_LABELS[value] ?? value;
}

function DeviationRowActions({
  userId,
  onViewTimeline,
}: {
  userId: string;
  onViewTimeline?: (userId: string) => void;
}): JSX.Element {
  return (
    <div className="ueba-deviation-actions">
      <Link to={uebaHuntPath(userId)}>Hunt</Link>
      <Link to={uebaEntityDossierPath(userId)}>Entity</Link>
      {onViewTimeline ? (
        <button type="button" onClick={() => onViewTimeline(userId)}>
          Timeline
        </button>
      ) : (
        <Link to={uebaTimelinePath(userId)}>Timeline</Link>
      )}
    </div>
  );
}

export function DeviationFindingsTable({
  data,
  isLoading,
  isError = false,
  onViewTimeline,
}: DeviationFindingsTableProps): JSX.Element {
  const [density] = useRowDensity();

  const columnDefs = useMemo<ColDef<HaUebaDeviationDTO>[]>(
    () => [
      {
        field: 'userId',
        headerName: 'User',
        flex: 1.6,
        sortable: true,
        filter: true,
      },
      {
        field: 'metricName',
        headerName: 'Metric',
        flex: 1.6,
        sortable: true,
        valueFormatter: (params) => metricLabel(params.value as MetricName | undefined),
      },
      {
        field: 'zScore',
        headerName: 'Z-score',
        flex: 0.8,
        sortable: true,
        valueFormatter: (params) =>
          typeof params.value === 'number' ? params.value.toFixed(2) : '—',
      },
      {
        field: 'points',
        headerName: 'Rubric points',
        flex: 0.9,
        sortable: true,
      },
      {
        field: 'runTs',
        headerName: 'Observed',
        flex: 1.4,
        sortable: true,
        valueFormatter: (params) =>
          params.value ? new Date(params.value as string).toLocaleString() : '—',
      },
      {
        headerName: 'Pivots',
        flex: 1.8,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<HaUebaDeviationDTO>) => {
          if (!params.data) return null;
          return (
            <DeviationRowActions userId={params.data.userId} onViewTimeline={onViewTimeline} />
          );
        },
      },
    ],
    [onViewTimeline],
  );

  const rowCount = data?.length ?? 0;
  const showEmpty = !isLoading && !isError && rowCount === 0;

  return (
    <div className="ueba-deviation-table" data-testid="ueba-deviation-table">
      <div className="ueba-deviation-table__header">
        <h2>Deviation findings</h2>
        {!isLoading && (
          <span className="ueba-deviation-table__count" data-testid="ueba-deviation-row-count">
            {rowCount} row{rowCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isError && (
        <div
          className="ueba-deviation-table__inline-state"
          role="alert"
          data-testid="ueba-deviation-table-error"
        >
          <strong>Deviations unavailable.</strong>
          <span>Deviation findings could not be loaded from `/api/ha-ueba/deviations`.</span>
        </div>
      )}

      {showEmpty && (
        <div
          className="ueba-deviation-table__inline-state"
          role="status"
          data-testid="ueba-deviation-table-empty"
        >
          <strong>No scored deviations returned.</strong>
          <span>
            Peer-group baselines may not have produced z-score rows on this tenant yet. Pivot to{' '}
            <Link to="/search">Search &amp; Hunt</Link> while hourly scoring runs.
          </span>
        </div>
      )}

      <div className="ueba-deviation-table__grid">
        <SiemDataGrid
          columnDefs={columnDefs}
          rowData={data ?? []}
          height="100%"
          loading={isLoading}
          rowHeight={ROW_HEIGHTS[density]}
          defaultColDef={{ resizable: true }}
          getRowId={(params) => {
            const row = params.data as HaUebaDeviationDTO;
            return `${row.userId}:${row.metricName}:${row.runTs}`;
          }}
        />
      </div>
    </div>
  );
}
