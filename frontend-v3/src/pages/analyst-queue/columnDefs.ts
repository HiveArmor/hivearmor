/**
 * Analyst Queue Column Definitions
 * AG Grid column configuration per CMD-02 spec §6.1
 */

import type { ColDef } from 'ag-grid-community';

import type { QueueAlert } from './analystQueue.types';
import { NetworkIdRenderer } from './renderers/NetworkIdRenderer';
import { SeverityBadgeRenderer } from './renderers/SeverityBadgeRenderer';
import { StatusChipRenderer } from './renderers/StatusChipRenderer';
import { TagsRenderer } from './renderers/TagsRenderer';
import { TimestampRenderer } from './renderers/TimestampRenderer';

export const QUEUE_COLUMN_DEFS: ColDef<QueueAlert>[] = [
  {
    field: 'severity',
    headerName: 'Severity',
    width: 100,
    cellRenderer: SeverityBadgeRenderer,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'timestamp',
    headerName: 'Timestamp',
    width: 160,
    cellRenderer: TimestampRenderer,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'title',
    headerName: 'Alert Title',
    flex: 1,
    minWidth: 200,
    sortable: true,
    filter: false,
    resizable: true,
    cellStyle: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    tooltipField: 'title',
  },
  {
    field: 'adversary.networkId',
    headerName: 'Source',
    width: 140,
    cellRenderer: NetworkIdRenderer,
    sortable: false,
    filter: false,
    resizable: true,
    valueGetter: (params) => {
      return params.data?.adversary?.networkId;
    },
  },
  {
    field: 'target.networkId',
    headerName: 'Destination',
    width: 140,
    cellRenderer: NetworkIdRenderer,
    sortable: false,
    filter: false,
    resizable: true,
    valueGetter: (params) => {
      return params.data?.target?.networkId;
    },
  },
  {
    field: 'category',
    headerName: 'Category',
    width: 120,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 110,
    cellRenderer: StatusChipRenderer,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'assignedTo',
    headerName: 'Assigned To',
    width: 120,
    sortable: true,
    filter: false,
    resizable: true,
    hide: true, // optional column, hidden by default per spec
    cellStyle: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    valueGetter: (params) => {
      return params.data?.assignedTo ?? '—';
    },
  },
  {
    field: 'tags',
    headerName: 'Tags',
    width: 120,
    cellRenderer: TagsRenderer,
    sortable: false,
    filter: false,
    resizable: true,
    hide: true, // optional column, hidden by default per spec
  },
];
