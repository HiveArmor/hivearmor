import { forwardRef } from 'react';

import type { CellClickedEvent, CellDoubleClickedEvent, CellKeyDownEvent, ColDef, GridOptions, IDatasource, IServerSideDatasource, RowClickedEvent, RowDoubleClickedEvent } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

// ServerSideRowModel is enterprise-only in AG Grid 36.
// We bridge IServerSideDatasource → IDatasource (InfiniteRowModel) automatically
// so pages that pass rowModelType="serverSide" work without an enterprise licence.
function bridgeServerSideDatasource(ss: IServerSideDatasource): IDatasource {
  return {
    getRows(params) {
      const shimParams = {
        request: {
          startRow: params.startRow,
          endRow: params.endRow,
          rowGroupCols: [],
          valueCols: [],
          pivotCols: [],
          pivotMode: false,
          groupKeys: [],
          filterModel: {},
          sortModel: [],
        },
        success({ rowData, rowCount }: { rowData: unknown[]; rowCount?: number }) {
          const lastRow =
            rowCount !== undefined && rowCount <= (params.endRow ?? 0) ? rowCount : -1;
          params.successCallback(rowData as object[], lastRow);
        },
        fail() {
          params.failCallback();
        },
      };
      ss.getRows(shimParams as unknown as Parameters<IServerSideDatasource['getRows']>[0]);
    },
  };
}

export interface SiemDataGridProps {
  columnDefs: ColDef[];
  rowData?: unknown[];
  datasource?: IServerSideDatasource | IDatasource;
  rowModelType?: 'clientSide' | 'serverSide' | 'infinite';
  onRowClicked?: (event: RowClickedEvent) => void;
  onRowDoubleClicked?: (event: RowDoubleClickedEvent) => void;
  onCellClicked?: (event: CellClickedEvent) => void;
  onCellDoubleClicked?: (event: CellDoubleClickedEvent) => void;
  onCellKeyDown?: (event: CellKeyDownEvent) => void;
  onSelectionChanged?: (selectedRows: unknown[]) => void;
  height?: string | number;
  rowHeight?: number;
  rowSelection?: GridOptions['rowSelection'];
  suppressRowClickSelection?: boolean;
  components?: Record<string, React.ComponentType<unknown>>;
  loading?: boolean;
  noRowsOverlayComponent?: React.ComponentType;
  loadingOverlayComponent?: React.ComponentType;
  className?: string;
  getRowId?: (params: { data: unknown }) => string;
  defaultColDef?: Partial<ColDef>;
  paginationPageSize?: number;
  infiniteInitialRowCount?: number;
  cacheBlockSize?: number;
  maxBlocksInCache?: number;
  ariaLabel?: string;
}

export const SiemDataGrid = forwardRef<AgGridReact, SiemDataGridProps>(
  (
    {
      columnDefs,
      rowData,
      datasource,
      rowModelType = 'clientSide',
      onRowClicked,
      onRowDoubleClicked,
      onCellClicked,
      onCellDoubleClicked,
      onCellKeyDown,
      onSelectionChanged,
      height = '100%',
      rowHeight,
      rowSelection,
      suppressRowClickSelection,
      components,
      loading,
      noRowsOverlayComponent,
      loadingOverlayComponent,
      className,
      getRowId,
      defaultColDef,
      paginationPageSize,
      infiniteInitialRowCount,
      cacheBlockSize,
      maxBlocksInCache,
      ariaLabel,
    },
    ref
  ) => {
    const gridOptions: GridOptions = {
      columnDefs,
      rowData,
      // Map serverSide → infinite (ServerSideRowModel is enterprise-only in AG Grid 36 Community)
      rowModelType: rowModelType === 'serverSide' ? 'infinite' : rowModelType,
      serverSideDatasource: undefined,
      datasource: rowModelType === 'serverSide' && datasource
        ? bridgeServerSideDatasource(datasource as IServerSideDatasource)
        : rowModelType === 'infinite'
          ? (datasource as IDatasource)
          : undefined,
      infiniteInitialRowCount,
      cacheBlockSize,
      maxBlocksInCache,
      rowSelection,
      suppressRowClickSelection,
      getRowId,
      rowHeight,
      defaultColDef: {
        sortable: true,
        filter: true,
        resizable: true,
        ...defaultColDef,
      },
      onRowClicked,
      onRowDoubleClicked,
      onCellClicked,
      onCellDoubleClicked,
      onCellKeyDown,
      onSelectionChanged: onSelectionChanged
        ? (event) => {
            const selectedRows = event.api.getSelectedRows();
            onSelectionChanged(selectedRows);
          }
        : undefined,
      noRowsOverlayComponent,
      loadingOverlayComponent,
      pagination: paginationPageSize !== undefined,
      paginationPageSize,
    };

    const containerStyle = {
      width: '100%',
      height: typeof height === 'number' ? `${height}px` : height,
    };

    return (
      <div
        className={`ag-theme-quartz-dark ha-grid ${className || ''}`}
        style={containerStyle}
        aria-label={ariaLabel}
      >
        <AgGridReact
          ref={ref}
          {...gridOptions}
          theme="legacy"
          components={components}
          loading={loading}
        />
      </div>
    );
  }
);

SiemDataGrid.displayName = 'SiemDataGrid';
