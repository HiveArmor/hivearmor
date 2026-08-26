/**
 * Queue Column Definitions
 * Queue-specific layout; severity/status helpers stay in @/lib/* (shared helpers, not a page fork).
 */

import type { ColDef, ICellRendererParams } from 'ag-grid-community';

import { AssigneeCell } from './cells/AssigneeCell';
import { RowActionsCell } from './cells/RowActionsCell';
import type { QueueRowAction } from './cells/RowActionsCell';
import { SeverityCell } from './cells/SeverityCell';
import { SlaCell } from './cells/SlaCell';
import { StatusCell } from './cells/StatusCell';
import { TenantCell } from './cells/TenantCell';
import { TimestampCell } from './cells/TimestampCell';
import { TitleCell } from './cells/TitleCell';
import { WorkItemTypeCell } from './cells/WorkItemTypeCell';

import { SEVERITY_ORDER } from '@/lib/severity';
import type { SeverityLevel } from '@/lib/severity';
import type { QueueItem } from '@/types/alert.types';

export interface QueueColumnOptions {
  canTriage: boolean;
  canAssign: boolean;
  onRowAction: (action: QueueRowAction, item: QueueItem) => void;
}

export function createQueueColumnDefs(options: QueueColumnOptions): ColDef<QueueItem>[] {
  const { canTriage, canAssign, onRowAction } = options;

  return [
    {
      colId: 'selection',
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      suppressSizeToFit: true,
      resizable: false,
      sortable: false,
      pinned: 'left',
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 88,
      minWidth: 70,
      sortable: true,
      filter: false,
      pinned: 'left',
      cellStyle: {
        fontFamily: 'var(--ha-font-mono)',
        fontSize: '12px',
        color: 'var(--ha-text-secondary)',
      },
    },
    {
      field: 'severity',
      headerName: 'Severity',
      width: 108,
      minWidth: 96,
      sortable: true,
      filter: false,
      cellRenderer: SeverityCell,
      comparator: (a: SeverityLevel, b: SeverityLevel) =>
        (SEVERITY_ORDER[a] ?? 0) - (SEVERITY_ORDER[b] ?? 0),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 130,
      minWidth: 110,
      sortable: true,
      filter: false,
      cellRenderer: WorkItemTypeCell,
    },
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 240,
      sortable: true,
      filter: false,
      cellRenderer: TitleCell,
      tooltipField: 'title',
    },
    {
      field: 'tenant',
      headerName: 'Tenant',
      width: 130,
      minWidth: 100,
      sortable: true,
      filter: false,
      cellRenderer: TenantCell,
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      minWidth: 100,
      sortable: true,
      filter: false,
      cellRenderer: StatusCell,
    },
    {
      field: 'assignee',
      headerName: 'Assignee',
      width: 140,
      minWidth: 110,
      sortable: true,
      filter: false,
      cellRenderer: AssigneeCell,
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      width: 140,
      minWidth: 110,
      sortable: true,
      filter: false,
      cellRenderer: TimestampCell,
    },
    {
      field: 'slaStatus',
      headerName: 'SLA',
      width: 120,
      minWidth: 100,
      sortable: false,
      filter: false,
      cellRenderer: SlaCell,
    },
    {
      colId: 'actions',
      headerName: '',
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      sortable: false,
      resizable: false,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams<QueueItem>) => (
        <RowActionsCell
          data={params.data}
          canTriage={canTriage}
          canAssign={canAssign}
          onAction={onRowAction}
        />
      ),
    },
  ];
}

/** Static defs for tests / Storybook — actions no-op until createQueueColumnDefs is used. */
export const QUEUE_COLUMN_DEFS = createQueueColumnDefs({
  canTriage: false,
  canAssign: false,
  onRowAction: () => undefined,
});
