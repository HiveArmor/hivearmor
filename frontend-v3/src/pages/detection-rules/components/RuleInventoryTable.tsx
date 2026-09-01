/**
 * RuleInventoryTable — AG Grid inventory with health/execution columns (Sprint 47 DET-008)
 */

import { useCallback, useMemo, useRef } from 'react';

import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';

import { RuleHealthBadge } from './RuleHealthBadge';

import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import type { RulePreview } from '@/pages/detection-rules/types/detection.types';

interface RuleInventoryTableProps {
  rules: RulePreview[];
  isLoading: boolean;
  onRuleClick: (rule: RulePreview) => void;
  onSelectionChanged: (selectedRules: RulePreview[]) => void;
}

function ScopeBadge({ scope }: { scope: string }): JSX.Element {
  return (
    <span
      className="detection-scope-badge"
      data-scope={scope}
    >
      {scope === 'managed' ? 'Managed' : 'Custom'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  return (
    <span
      className="detection-status-badge"
      data-status={status}
    >
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  return (
    <span
      className="detection-severity-badge"
      data-severity={severity}
    >
      {severity}
    </span>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function RuleInventoryTable({
  rules,
  isLoading,
  onRuleClick,
  onSelectionChanged,
}: RuleInventoryTableProps): JSX.Element {
  const [density] = useRowDensity();
  const gridRef = useRef<AgGridReact>(null);

  const columnDefs = useMemo<ColDef<RulePreview>[]>(() => [
    {
      colId: 'name',
      headerName: 'Detection',
      field: 'name',
      flex: 2,
      minWidth: 200,
      cellRenderer: ({ data }: { data: RulePreview }) => (
        <div className="detection-rule-name-cell">
          <strong>{data.name}</strong>
          <small>{data.mitreTechniques.join(', ') || 'No MITRE mapping'}</small>
        </div>
      ),
    },
    {
      colId: 'scope',
      headerName: 'Source',
      field: 'scope',
      width: 100,
      cellRenderer: ({ value }: { value: string }) => <ScopeBadge scope={value} />,
    },
    {
      colId: 'status',
      headerName: 'Status',
      field: 'status',
      width: 100,
      cellRenderer: ({ value }: { value: string }) => <StatusBadge status={value} />,
    },
    {
      colId: 'severity',
      headerName: 'Severity',
      field: 'severity',
      width: 100,
      cellRenderer: ({ value }: { value: string }) => <SeverityBadge severity={value} />,
    },
    {
      colId: 'health',
      headerName: 'Health',
      width: 140,
      cellRenderer: ({ data }: { data: RulePreview }) => (
        <RuleHealthBadge
          status={data.health.status}
          errorRate={data.health.errorRate}
        />
      ),
    },
    {
      colId: 'lastRun',
      headerName: 'Last run',
      width: 150,
      valueGetter: ({ data }) => data?.lastExecution?.timestamp ?? null,
      valueFormatter: ({ value }) => formatDateTime(value as string | null),
    },
    {
      colId: 'schedule',
      headerName: 'Schedule',
      field: 'schedule',
      width: 110,
    },
    {
      colId: 'alerts7d',
      headerName: 'Alerts 7d',
      width: 90,
      valueGetter: ({ data }) => data?.health.alertsGenerated7d ?? 0,
      type: 'numericColumn',
    },
  ], []);

  const handleRowClicked = useCallback((event: RowClickedEvent<RulePreview>) => {
    if (event.data) onRuleClick(event.data);
  }, [onRuleClick]);

  const handleSelectionChanged = useCallback(() => {
    const selected = gridRef.current?.api?.getSelectedRows() ?? [];
    onSelectionChanged(selected as RulePreview[]);
  }, [onSelectionChanged]);

  if (isLoading) {
    return (
      <div className="detection-grid-loading" aria-label="Loading detection rules">
        {Array.from({ length: 10 }, (_, i) => <span key={i} />)}
      </div>
    );
  }

  return (
    <SiemDataGrid
      ref={gridRef}
      className="detection-grid"
      ariaLabel="Detection rules inventory"
      columnDefs={columnDefs}
      rowData={rules}
      rowModelType="clientSide"
      rowHeight={ROW_HEIGHTS[density]}
      rowSelection="multiple"
      suppressRowClickSelection
      getRowId={({ data }) => (data as RulePreview).id}
      onRowClicked={handleRowClicked}
      onSelectionChanged={handleSelectionChanged}
      defaultColDef={{ sortable: true, resizable: true, filter: false }}
    />
  );
}
