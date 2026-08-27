/**
 * EntityInventoryTable — AG Grid with columns: type icon, value, displayName,
 * risk badge, trend arrow, criticality, alert count, last seen, observation sources.
 * Server-side pagination via cursor.
 */

import { useMemo } from 'react';

import type { ColDef, ValueFormatterParams } from 'ag-grid-community';

import { EntityRiskBadge } from './EntityRiskBadge';
import type { EntitySummaryItem, EntRiskTrend } from '../types/entity.types';

import { EntityTypeIcon } from '@/components/entity-type-icon';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useRowDensity, ROW_HEIGHTS } from '@/hooks/useRowDensity';



import './EntityInventoryTable.css';

interface EntityInventoryTableProps {
  entities: EntitySummaryItem[];
  loading?: boolean;
  onEntityClick?: (entity: EntitySummaryItem) => void;
  onEntityOpen?: (entity: EntitySummaryItem) => void;
}

function TypeIconCell({ data }: { data?: EntitySummaryItem }): JSX.Element {
  if (!data) return <span>—</span>;
  return (
    <span className="ent-table__type-cell">
      <EntityTypeIcon type={data.type} size={14} />
      <span>{data.type}</span>
    </span>
  );
}

function RiskBadgeCell({ data }: { data?: EntitySummaryItem }): JSX.Element {
  if (!data) return <span>—</span>;
  return <EntityRiskBadge score={data.riskScore} level={data.riskLevel} trend={data.riskTrend} />;
}

function TrendCell({ data }: { data?: EntitySummaryItem }): JSX.Element {
  if (!data) return <span>—</span>;
  const trend: EntRiskTrend = data.riskTrend;
  const arrow = trend === 'rising' ? '↑' : trend === 'declining' ? '↓' : '→';
  return (
    <span className="ent-table__trend-cell" data-trend={trend}>
      {arrow} {trend}
    </span>
  );
}

function relativeTime(isoStr: string): string {
  const delta = Date.now() - Date.parse(isoStr);
  if (!Number.isFinite(delta)) return 'Unknown';
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function EntityInventoryTable({ entities, loading, onEntityClick, onEntityOpen }: EntityInventoryTableProps): JSX.Element {
  const [density] = useRowDensity();
  const columnDefs = useMemo<ColDef<EntitySummaryItem>[]>(() => [
    {
      colId: 'type',
      headerName: 'Type',
      width: 100,
      cellRenderer: TypeIconCell,
      sortable: false,
      filter: false,
    },
    {
      colId: 'value',
      field: 'value',
      headerName: 'Value',
      minWidth: 150,
      flex: 0.8,
      cellClass: 'ent-table__mono',
    },
    {
      colId: 'displayName',
      field: 'displayName',
      headerName: 'Display Name',
      minWidth: 180,
      flex: 1,
    },
    {
      colId: 'risk',
      headerName: 'Risk',
      width: 110,
      cellRenderer: RiskBadgeCell,
      sortable: false,
      filter: false,
    },
    {
      colId: 'trend',
      headerName: 'Trend',
      width: 100,
      cellRenderer: TrendCell,
      sortable: false,
      filter: false,
    },
    {
      colId: 'criticality',
      field: 'criticality',
      headerName: 'Criticality',
      width: 110,
    },
    {
      colId: 'alertCount',
      field: 'alertCount',
      headerName: 'Alerts',
      width: 80,
      cellClass: 'ent-table__number',
    },
    {
      colId: 'lastSeen',
      field: 'lastSeen',
      headerName: 'Last Seen',
      width: 120,
      valueFormatter: ({ value }: ValueFormatterParams<EntitySummaryItem>) =>
        value ? relativeTime(String(value)) : '—',
      cellClass: 'ent-table__mono',
    },
    {
      colId: 'observationSources',
      field: 'observationSources',
      headerName: 'Sources',
      width: 140,
      valueFormatter: ({ data }: ValueFormatterParams<EntitySummaryItem>) =>
        data?.observationSources?.join(', ') ?? '—',
      sortable: false,
      filter: false,
    },
  ], []);

  return (
    <div className="ent-inventory-table">
      <SiemDataGrid
        columnDefs={columnDefs}
        rowData={entities}
        rowHeight={ROW_HEIGHTS[density]}
        height="100%"
        loading={loading}
        onRowClicked={(event) => {
          if (onEntityClick && event.data) {
            onEntityClick(event.data as EntitySummaryItem);
          }
        }}
        onRowDoubleClicked={(event) => {
          if (onEntityOpen && event.data) onEntityOpen(event.data as EntitySummaryItem);
        }}
        onCellKeyDown={(event) => {
          const keyboardEvent = event.event as KeyboardEvent | undefined;
          if (keyboardEvent?.key === 'Enter' && onEntityOpen && event.data) {
            keyboardEvent.preventDefault();
            onEntityOpen(event.data as EntitySummaryItem);
          }
        }}
        getRowId={({ data }) => (data as EntitySummaryItem).id}
        ariaLabel="Entity inventory"
        defaultColDef={{ sortable: false, filter: false, resizable: true }}
      />
    </div>
  );
}
