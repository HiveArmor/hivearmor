/** Shared alert column definitions for triage and linked-alert tables. */

import type { ColDef } from 'ag-grid-community';
import { CircleDot, Clock3, Crosshair, FolderPlus, StickyNote, Tag, ShieldCheck, UserRound } from 'lucide-react';

import type { AlertQueueRecord, AlertRowQuickAction } from './alertTriage.types';

import { getSeverityLabel, numericToSeverityLevel } from '@/lib/severity';

function formatRelativeTime(value: string | undefined): string {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const deltaSeconds = Math.round((Date.now() - timestamp) / 1000);
  if (deltaSeconds < -60) {
    const futureMinutes = Math.round(Math.abs(deltaSeconds) / 60);
    if (futureMinutes < 60) return `in ${futureMinutes}m`;
    const futureHours = Math.round(futureMinutes / 60);
    if (futureHours < 24) return `in ${futureHours}h`;
    return `in ${Math.round(futureHours / 24)}d`;
  }
  const seconds = Math.max(0, deltaSeconds);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(status: number): string {
  switch (status) {
    case 1: return 'Auto review';
    case 2: return 'Open';
    case 3: return 'In review';
    case 5: return 'Completed';
    case 6: return 'True positive';
    case 7: return 'False positive';
    default: return 'Unknown';
  }
}

// eslint-disable-next-line react-refresh/only-export-components
function SeverityCell({ value }: { value: number }): JSX.Element {
  const level = numericToSeverityLevel(value);
  return (
    <span className="alert-grid-severity" data-severity={level} aria-label={`Severity: ${getSeverityLabel(level)}`}>
      <span className="alert-grid-severity__hex" aria-hidden="true" />
      <strong>{getSeverityLabel(level)}</strong>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function DetectedCell({ value }: { value?: string }): JSX.Element {
  return (
    <span className="alert-grid-detected" title={value ? new Date(value).toLocaleString() : undefined}>
      <strong>{formatRelativeTime(value)}</strong>
      <small>{value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</small>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function RiskCell({ value }: { value?: number }): JSX.Element {
  if (value === undefined) return <span className="alert-grid-empty">—</span>;
  const tone = value >= 90 ? 'critical' : value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low';
  return (
    <span className="alert-grid-risk" data-tone={tone} aria-label={`Risk score: ${value} out of 100`}>
      <span className="alert-grid-risk__track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
      <strong>{value}</strong>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function AlertTitleCell({ data }: { data?: AlertQueueRecord }): JSX.Element {
  if (!data) return <span />;
  return (
    <span className="alert-grid-title" title={data.name}>
      <strong>{data.name}</strong>
      <small><span>{data.id}</span><span aria-hidden="true">·</span><span>{data.category ?? 'Uncategorized'}</span>{data.relatedAlertCount ? <><span aria-hidden="true">·</span><span>{data.relatedAlertCount} related</span></> : null}</small>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function EntityCell({ data }: { data?: AlertQueueRecord }): JSX.Element {
  const entity = data?.primaryEntity;
  if (!entity) return <span className="alert-grid-empty">Unavailable</span>;
  return (
    <span className="alert-grid-entity" title={`${entity.type}: ${entity.label}`}>
      <Crosshair size={13} aria-hidden="true" />
      <span><strong>{entity.label}</strong><small>{entity.type}</small></span>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function StatusCell({ value }: { value: number }): JSX.Element {
  const tone = value === 2 ? 'open' : value === 3 || value === 1 ? 'review' : value === 6 ? 'positive' : value === 7 ? 'false-positive' : 'closed';
  return <span className="alert-grid-status" data-status={tone}>{statusLabel(value)}</span>;
}

// eslint-disable-next-line react-refresh/only-export-components
function AssigneeCell({ data }: { data?: AlertQueueRecord }): JSX.Element {
  return data?.assigneeName ? (
    <span className="alert-grid-assignee"><UserRound size={13} aria-hidden="true" />{data.assigneeName}</span>
  ) : (
    <span className="alert-grid-assignee alert-grid-assignee--empty">Unassigned</span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function SlaCell({ data }: { data?: AlertQueueRecord }): JSX.Element {
  if (!data || data.status >= 5 || !data.slaStatus || data.slaStatus === 'none') return <span className="alert-grid-empty">—</span>;
  const state = data.slaStatus;
  const label = state === 'breached' ? 'Breached' : state === 'at_risk' ? 'At risk' : 'On track';
  return (
    <span className="alert-grid-sla" data-state={state} title={data.slaDeadline ? `Due ${new Date(data.slaDeadline).toLocaleString()}` : undefined}>
      <Clock3 size={13} aria-hidden="true" />{label}
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function TechniqueCell({ data }: { data?: AlertQueueRecord }): JSX.Element {
  return data?.mitreTechniqueId ? (
    <span className="alert-grid-technique"><ShieldCheck size={13} aria-hidden="true" /><span><strong>{data.mitreTechniqueId}</strong><small>{data.mitreTacticName ?? 'ATT&CK'}</small></span></span>
  ) : <span className="alert-grid-empty">—</span>;
}

// eslint-disable-next-line react-refresh/only-export-components
function TagsCell({ value }: { value?: string[] }): JSX.Element {
  if (!value?.length) return <span className="alert-grid-empty">—</span>;
  return <span className="alert-grid-tags"><span>{value[0]}</span>{value.length > 1 && <em>+{value.length - 1}</em>}</span>;
}

const quickActions: Array<{
  id: AlertRowQuickAction;
  label: string;
  icon: typeof CircleDot;
}> = [
  { id: 'change_status', label: 'Change status', icon: CircleDot },
  { id: 'note', label: 'Add analyst note', icon: StickyNote },
  { id: 'tag', label: 'Apply tags', icon: Tag },
  { id: 'promote', label: 'Add to or create incident', icon: FolderPlus },
];

// eslint-disable-next-line react-refresh/only-export-components
function AlertActionsCell({
  data,
  onAction,
}: {
  data?: AlertQueueRecord;
  onAction: (action: AlertRowQuickAction, alertId: string) => void;
}): JSX.Element {
  if (!data) return <span />;

  const isDisabled = (actionId: string): boolean => {
    const action = data.availableActions?.find((a) => a.id === actionId);
    if (!action) return false; // Legacy data — keep enabled
    return !action.allowed;
  };

  const getDisabledReason = (actionId: string): string | undefined => {
    const action = data.availableActions?.find((a) => a.id === actionId);
    return action?.reason ?? undefined;
  };

  return (
    <span className="alert-grid-actions" role="group" aria-label={`Quick actions for ${data.name}`}>
      {quickActions.map(({ id, label, icon: Icon }) => {
        const disabled = isDisabled(id);
        const disabledReason = getDisabledReason(id);
        return (
          <button
            key={id}
            type="button"
            data-action={id}
            aria-label={`${label} for ${data.name}`}
            title={disabled && disabledReason ? disabledReason : label}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onAction(id, data.id);
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        );
      })}
    </span>
  );
}

const selectionColumn: ColDef<AlertQueueRecord> = {
  headerName: '',
  colId: 'selection',
  width: 44,
  minWidth: 44,
  maxWidth: 44,
  checkboxSelection: true,
  sortable: false,
  resizable: false,
  pinned: 'left',
  lockPosition: true,
  suppressMovable: true,
};

export const ALERT_COLUMNS_DEFAULT: ColDef<AlertQueueRecord>[] = [
  {
    headerName: 'Severity',
    field: 'severity',
    width: 112,
    minWidth: 106,
    cellRenderer: SeverityCell,
    pinned: 'left',
  },
  {
    headerName: 'Detected',
    field: '@timestamp',
    width: 124,
    minWidth: 118,
    cellRenderer: DetectedCell,
    sort: 'desc',
  },
  {
    headerName: 'Risk',
    field: 'riskScore',
    width: 82,
    minWidth: 78,
    cellRenderer: RiskCell,
  },
  {
    headerName: 'Alert reason',
    field: 'name',
    flex: 2,
    minWidth: 340,
    tooltipField: 'name',
    cellRenderer: AlertTitleCell,
  },
  {
    headerName: 'Primary entity',
    colId: 'primaryEntity',
    width: 178,
    minWidth: 150,
    cellRenderer: EntityCell,
    sortable: false,
  },
  {
    headerName: 'Status',
    field: 'status',
    width: 116,
    minWidth: 110,
    cellRenderer: StatusCell,
  },
  {
    headerName: 'Owner',
    field: 'assigneeName',
    width: 132,
    minWidth: 118,
    cellRenderer: AssigneeCell,
  },
  {
    headerName: 'SLA',
    field: 'slaDeadline',
    width: 102,
    minWidth: 96,
    cellRenderer: SlaCell,
    sortable: true,
  },
];

export const ALERT_COLUMNS_OPTIONAL: ColDef<AlertQueueRecord>[] = [
  {
    headerName: 'ATT&CK',
    field: 'mitreTechniqueId',
    colId: 'mitreTechniqueId',
    width: 142,
    cellRenderer: TechniqueCell,
  },
  {
    headerName: 'Tenant',
    field: 'tenantName',
    colId: 'tenantName',
    width: 154,
  },
  {
    headerName: 'Confidence',
    field: 'confidence',
    colId: 'confidence',
    width: 106,
    valueFormatter: (params) => params.value === undefined ? '—' : `${params.value}%`,
  },
  {
    headerName: 'Source',
    colId: 'adversary.ip',
    width: 152,
    valueGetter: (params) => params.data?.adversary?.ip ?? params.data?.adversary?.host ?? params.data?.adversary?.name ?? '—',
    cellClass: 'ha-mono',
  },
  {
    headerName: 'Destination',
    colId: 'target.ip',
    width: 164,
    valueGetter: (params) => params.data?.target?.ip ?? params.data?.target?.host ?? params.data?.target?.name ?? '—',
    cellClass: 'ha-mono',
  },
  {
    headerName: 'Category',
    field: 'category',
    colId: 'category',
    width: 124,
  },
  {
    headerName: 'Tags',
    field: 'tags',
    colId: 'tags',
    width: 148,
    cellRenderer: TagsCell,
    sortable: false,
  },
];

export function createAlertTriageColumns(
  onAction: (action: AlertRowQuickAction, alertId: string) => void,
  optionalColumns: ColDef<AlertQueueRecord>[] = []
): ColDef<AlertQueueRecord>[] {
  return [
    selectionColumn,
    ...ALERT_COLUMNS_DEFAULT,
    ...optionalColumns,
    {
      headerName: 'Actions',
      colId: 'actions',
      width: 136,
      minWidth: 136,
      maxWidth: 136,
      pinned: 'right',
      lockPinned: true,
      lockPosition: true,
      suppressMovable: true,
      sortable: false,
      resizable: false,
      cellClass: 'alert-actions-cell',
      cellRenderer: (params: { data?: AlertQueueRecord }) => <AlertActionsCell data={params.data} onAction={onAction} />,
    },
  ];
}

export { formatRelativeTime, statusLabel };
