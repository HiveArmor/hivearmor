/**
 * Incident List Column Definitions
 * AG Grid column configuration per CMD-03 spec §7.1
 */

import type { ColDef } from 'ag-grid-community';

import type { IncidentListItem } from './incidents.types';
import { PriorityBadgeRenderer } from './renderers/PriorityBadgeRenderer';
import { SeverityBadgeRenderer } from './renderers/SeverityBadgeRenderer';
import { SlaBreachedRenderer } from './renderers/SlaBreachedRenderer';
import { SlaDeadlineRenderer } from './renderers/SlaDeadlineRenderer';
import { StatusChipRenderer } from './renderers/StatusChipRenderer';
import { TimestampRenderer } from './renderers/TimestampRenderer';

export const INCIDENT_COLUMN_DEFS: ColDef<IncidentListItem>[] = [
  {
    field: 'incidentPriority',
    headerName: 'Priority',
    width: 88,
    cellRenderer: PriorityBadgeRenderer,
    sortable: true,
    filter: false,
    resizable: false,
  },
  {
    field: 'incidentSeverity',
    headerName: 'Severity',
    width: 96,
    cellRenderer: SeverityBadgeRenderer,
    sortable: true,
    filter: false,
    resizable: false,
  },
  {
    field: 'incidentName',
    headerName: 'Incident title',
    flex: 1,
    minWidth: 240,
    sortable: true,
    filter: false,
    resizable: true,
    cellStyle: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    tooltipField: 'incidentName',
  },
  {
    field: 'incidentStatus',
    headerName: 'Status',
    width: 120,
    cellRenderer: StatusChipRenderer,
    sortable: true,
    filter: false,
    resizable: false,
  },
  {
    field: 'incidentAssignedTo',
    headerName: 'Owner',
    width: 130,
    sortable: true,
    filter: false,
    resizable: true,
    valueFormatter: (params) => {
      return params.value ?? 'Unassigned';
    },
    cellStyle: (params) => ({
      color: params.value ? 'var(--ha-text-primary)' : 'var(--ha-text-secondary)',
    }),
  },
  {
    field: 'incidentCreatedDate',
    headerName: 'Created',
    width: 145,
    cellRenderer: TimestampRenderer,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'slaDeadline',
    headerName: 'SLA',
    width: 148,
    cellRenderer: SlaDeadlineRenderer,
    sortable: true,
    filter: false,
    resizable: true,
  },
  {
    field: 'slaBreached',
    headerName: 'Breach',
    width: 92,
    cellRenderer: SlaBreachedRenderer,
    sortable: true,
    filter: false,
    resizable: false,
  },
];
