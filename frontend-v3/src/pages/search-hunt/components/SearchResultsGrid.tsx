import { useCallback, useMemo, useRef } from 'react';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';

import { formatHuntRelativeTime, formatHuntTimestampUtc } from '../huntTime';
import type { HuntEvent, HuntRowDensity } from '../searchHunt.types';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { ROW_HEIGHTS } from '@/hooks/useRowDensity';

export interface SearchResultsGridProps {
  events: HuntEvent[];
  loading?: boolean;
  visibleColumns: string[];
  density: HuntRowDensity;
  onSelectionChanged: (selectedIds: string[]) => void;
  onActivateEvent: (event: HuntEvent) => void;
  onSortChanged?: (field: string, direction: 'asc' | 'desc') => void;
  /** Column ids the AI derived (model/enrichment) — the "show AI's hand" lens (move 2). */
  aiDerivedColumns?: string[];
  /** When true, mark aiDerivedColumns with the intelligence-violet provenance thread. */
  showAiHand?: boolean;
}

const severityOrder: Record<HuntEvent['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function SearchResultsGrid({
  events,
  loading = false,
  visibleColumns,
  density,
  onSelectionChanged,
  onActivateEvent,
  onSortChanged,
  aiDerivedColumns,
  showAiHand = false,
}: SearchResultsGridProps): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const aiSet = useMemo(() => new Set(aiDerivedColumns ?? []), [aiDerivedColumns]);

  const allColumns = useMemo<Record<string, ColDef<HuntEvent>>>(() => ({
    timestamp: {
      headerName: 'Event time', field: 'timestamp', width: 188, pinned: 'left', lockPinned: true,
      cellClass: 'hunt-grid__mono',
      valueFormatter: ({ value }) => formatHuntTimestampUtc(value ? String(value) : null),
      tooltipValueGetter: ({ value }) => (value ? formatHuntTimestampUtc(String(value)) : ''),
    },
    relativeTime: {
      // Opt-in relative-time column (NOT default). Displays "6m ago / 2h ago", tooltips the full
      // UTC, and — because it reads the same `timestamp` field — sorts on the real timestamp.
      headerName: 'Relative time', colId: 'relativeTime', field: 'timestamp', width: 132,
      cellClass: 'hunt-grid__relative',
      valueFormatter: ({ value }) => formatHuntRelativeTime(value ? String(value) : null),
      tooltipValueGetter: ({ value }) => (value ? formatHuntTimestampUtc(String(value)) : ''),
    },
    severity: {
      headerName: 'Severity', field: 'severity', width: 104,
      comparator: (a, b) => severityOrder[a as HuntEvent['severity']] - severityOrder[b as HuntEvent['severity']],
      cellRenderer: ({ value }: { value?: HuntEvent['severity'] }) => value ? <span className="hunt-severity" data-severity={value}><i aria-hidden="true" />{value}</span> : '—',
    },
    dataSource: { headerName: 'Source', field: 'dataSource', width: 108 },
    dataset: { headerName: 'Dataset', field: 'dataset', width: 158, cellClass: 'hunt-grid__mono' },
    category: { headerName: 'Category', field: 'category', width: 112 },
    action: { headerName: 'Action', field: 'action', width: 138, cellClass: 'hunt-grid__mono' },
    host: { headerName: 'Host', field: 'host', width: 132, cellClass: 'hunt-grid__entity' },
    user: { headerName: 'User', field: 'user', width: 126, cellClass: 'hunt-grid__entity' },
    sourceIp: { headerName: 'Source IP', field: 'sourceIp', width: 132, cellClass: 'hunt-grid__mono' },
    destinationIp: { headerName: 'Destination IP', field: 'destinationIp', width: 142, cellClass: 'hunt-grid__mono' },
    tenantName: { headerName: 'Tenant', field: 'tenantName', width: 146 },
    message: { headerName: 'Event summary', field: 'message', minWidth: 320, flex: 1, tooltipField: 'message' },
    alertCount: {
      headerName: 'Alerts', field: 'alertCount', width: 76, cellClass: 'hunt-grid__number',
      valueFormatter: ({ value }) => Number(value) > 0 ? String(value) : '—',
    },
  }), []);

  const columnDefs = useMemo<ColDef<HuntEvent>[]>(() => [
    {
      headerName: '', colId: 'selection', width: 38, pinned: 'left', lockPinned: true,
      checkboxSelection: true, headerCheckboxSelection: true, sortable: false, resizable: false, suppressMovable: true,
    },
    ...visibleColumns.map((id) => {
      const base = allColumns[id] ?? {
        headerName: id,
        colId: id,
        width: 150,
        valueGetter: ({ data }: { data?: HuntEvent }) => data?.normalized[id],
        cellClass: 'hunt-grid__mono',
      };
      if (!(showAiHand && aiSet.has(id))) return base;
      const existing = typeof base.cellClass === 'string' ? base.cellClass : '';
      return {
        ...base,
        cellClass: `${existing} hunt-grid__ai-derived`.trim(),
        headerClass: 'hunt-grid__ai-derived-header',
      };
    }),
  ], [allColumns, visibleColumns, showAiHand, aiSet]);

  const handleSelection = useCallback((rows: unknown[]) => {
    onSelectionChanged((rows as HuntEvent[]).map((row) => row.id));
  }, [onSelectionChanged]);

  const handleRowClicked = useCallback((event: RowClickedEvent<HuntEvent>) => {
    if (event.data) onActivateEvent(event.data);
  }, [onActivateEvent]);

  return (
    <SiemDataGrid
      ref={gridRef}
      className="hunt-results-grid"
      ariaLabel="Hunt event results. Use arrow keys to navigate and Enter to open event context."
      columnDefs={columnDefs}
      rowData={events}
      loading={loading}
      rowHeight={ROW_HEIGHTS[density]}
      headerHeight={24}
      rowSelection="multiple"
      suppressRowClickSelection
      onSelectionChanged={handleSelection}
      onRowClicked={handleRowClicked}
      getRowId={({ data }) => (data as HuntEvent).id}
      defaultColDef={{ sortable: Boolean(onSortChanged), filter: false, resizable: true }}
      onSortChanged={(event) => {
        if (!onSortChanged) return;
        const sorted = event.api.getColumnState().find((col) => col.sort);
        if (!sorted?.colId || sorted.colId === 'selection') return;
        onSortChanged(sorted.colId, sorted.sort === 'asc' ? 'asc' : 'desc');
      }}
    />
  );
}
