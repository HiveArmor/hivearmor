/**
 * Queue Column Definitions
 * Per spec 03-ANALYST-QUEUE.md §5
 * Uses QueueItem shape and new cell renderers in ./cells/
 */

import type { ColDef } from 'ag-grid-community';

import { AssigneeCell } from './cells/AssigneeCell';
import { RowActionsCell } from './cells/RowActionsCell';
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

export const QUEUE_COLUMN_DEFS: ColDef<QueueItem>[] = [
  // ── Checkbox ──────────────────────────────────────────────────────────────
  {
    colId: 'selection',
    headerCheckboxSelection: true,
    checkboxSelection: true,
    width: 48,
    minWidth: 48,
    maxWidth: 48,
    suppressSizeToFit: true,
    resizable: false,
    sortable: false,
    pinned: 'left',
  },

  // ── ID ────────────────────────────────────────────────────────────────────
  {
    field: 'id',
    headerName: 'ID',
    width: 90,
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

  // ── Severity ──────────────────────────────────────────────────────────────
  {
    field: 'severity',
    headerName: 'Severity',
    width: 110,
    minWidth: 100,
    sortable: true,
    filter: false,
    cellRenderer: SeverityCell,
    comparator: (a: SeverityLevel, b: SeverityLevel) =>
      (SEVERITY_ORDER[a] ?? 0) - (SEVERITY_ORDER[b] ?? 0),
  },

  // ── Type ──────────────────────────────────────────────────────────────────
  {
    field: 'type',
    headerName: 'Type',
    width: 150,
    minWidth: 120,
    sortable: true,
    filter: false,
    cellRenderer: WorkItemTypeCell,
  },

  // ── Title ─────────────────────────────────────────────────────────────────
  {
    field: 'title',
    headerName: 'Title',
    flex: 1,
    minWidth: 260,
    sortable: true,
    filter: false,
    cellRenderer: TitleCell,
    tooltipField: 'title',
  },

  // ── Tenant ────────────────────────────────────────────────────────────────
  {
    field: 'tenant',
    headerName: 'Tenant',
    width: 150,
    minWidth: 120,
    sortable: true,
    filter: false,
    cellRenderer: TenantCell,
  },

  // ── Status ────────────────────────────────────────────────────────────────
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    minWidth: 110,
    sortable: true,
    filter: false,
    cellRenderer: StatusCell,
  },

  // ── Assignee ──────────────────────────────────────────────────────────────
  {
    field: 'assignee',
    headerName: 'Assignee',
    width: 150,
    minWidth: 120,
    sortable: true,
    filter: false,
    cellRenderer: AssigneeCell,
  },

  // ── Alert count ───────────────────────────────────────────────────────────
  {
    field: 'alertCount',
    headerName: 'Alerts',
    width: 80,
    minWidth: 70,
    sortable: true,
    filter: false,
    cellStyle: {
      textAlign: 'right',
      fontFamily: 'var(--ha-font-mono)',
      fontSize: '13px',
    },
  },

  // ── Created ───────────────────────────────────────────────────────────────
  {
    field: 'createdAt',
    headerName: 'Created',
    width: 150,
    minWidth: 120,
    sortable: true,
    filter: false,
    cellRenderer: TimestampCell,
  },

  // ── Last activity ─────────────────────────────────────────────────────────
  {
    field: 'lastActivity',
    headerName: 'Last Activity',
    width: 150,
    minWidth: 120,
    sortable: true,
    filter: false,
    cellRenderer: TimestampCell,
  },

  // ── SLA ───────────────────────────────────────────────────────────────────
  {
    field: 'slaStatus',
    headerName: 'SLA',
    width: 140,
    minWidth: 110,
    sortable: false,
    filter: false,
    cellRenderer: SlaCell,
  },

  // ── Row actions ───────────────────────────────────────────────────────────
  {
    colId: 'actions',
    headerName: '',
    width: 48,
    minWidth: 48,
    maxWidth: 48,
    sortable: false,
    resizable: false,
    pinned: 'right',
    cellRenderer: RowActionsCell,
  },
];
