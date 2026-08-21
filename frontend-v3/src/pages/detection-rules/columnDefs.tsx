/* eslint-disable react-refresh/only-export-components */

import type { ColDef } from 'ag-grid-community';
import { CircleAlert, CircleCheck, CircleHelp, Ellipsis, Pencil, TestTube, Trash2 } from 'lucide-react';

import type { DetectionRule } from './detectionRules.types';

function relativeTime(value?: string | null): string {
  if (!value) return 'Not available';
  const delta = Date.now() - Date.parse(value);
  if (!Number.isFinite(delta)) return 'Not available';
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function RuleNameCell({ data }: { data?: DetectionRule }): JSX.Element {
  if (!data) return <span>—</span>;
  return <span className="detection-rule-name"><strong>{data.ruleName}</strong><small>{data.sigmaRuleId ?? `HA-${data.id}`} · v{data.version ?? '—'}</small></span>;
}

function StatusCell({ data, disabled, loading, onToggle }: { data?: DetectionRule; disabled: boolean; loading: boolean; onToggle: (rule: DetectionRule) => void }): JSX.Element {
  if (!data) return <span>—</span>;
  return (
    <button
      className="detection-rule-toggle"
      type="button"
      role="switch"
      aria-checked={data.ruleActive}
      aria-label={`${data.ruleActive ? 'Disable' : 'Enable'} ${data.ruleName}`}
      disabled={disabled || loading}
      data-active={data.ruleActive}
      data-loading={loading}
      onClick={(event) => { event.stopPropagation(); onToggle(data); }}
    >
      <i aria-hidden="true" />
      <span>{loading ? 'Updating' : data.ruleActive ? 'Enabled' : 'Disabled'}</span>
    </button>
  );
}

function HealthCell({ data }: { data?: DetectionRule }): JSX.Element {
  const health = data?.health ?? 'unknown';
  const Icon = health === 'healthy' ? CircleCheck : health === 'warning' || health === 'failed' ? CircleAlert : CircleHelp;
  const label = health === 'healthy' ? 'Healthy' : health === 'warning' ? 'Delayed' : health === 'failed' ? 'Failed' : 'Unknown';
  return <span className="detection-rule-health" data-health={health} title={data?.healthMessage}><Icon size={13} aria-hidden="true" />{label}{data?.hasGap && <em>Gap</em>}</span>;
}

function OriginCell({ data }: { data?: DetectionRule }): JSX.Element {
  return <span className="detection-rule-origin" data-origin={data?.origin ?? 'unknown'}>{data?.origin === 'managed' ? 'Managed' : data?.origin === 'custom' ? 'Custom' : 'Unknown'}</span>;
}

function MitreCell({ data }: { data?: DetectionRule }): JSX.Element {
  if (!data?.techniqueId) return <span className="detection-rule-unavailable">Not mapped</span>;
  return <span className="detection-rule-mitre"><code>{data.techniqueId}</code><small>{data.techniqueName ?? data.tactic ?? 'ATT&CK technique'}</small></span>;
}

function AlertsCell({ data }: { data?: DetectionRule }): JSX.Element {
  if (data?.alerts24h === undefined) return <span className="detection-rule-unavailable">—</span>;
  return <span className="detection-rule-alerts" data-volume={(data.alerts24h ?? 0) > 20 ? 'high' : 'normal'}>{data.alerts24h.toLocaleString()}</span>;
}

function LastRunCell({ data }: { data?: DetectionRule }): JSX.Element {
  return <span className="detection-rule-last-run"><strong>{relativeTime(data?.lastRunAt)}</strong><small>{data?.lastRunDurationMs == null ? 'Duration unavailable' : `${data.lastRunDurationMs.toLocaleString()} ms`}</small></span>;
}

interface ActionsCellProps {
  data?: DetectionRule;
  userRole: 'ROLE_ANALYST' | 'ROLE_SOC_MANAGER' | 'ROLE_ADMIN';
  onDelete: (rule: DetectionRule) => void;
  onNavigate: (path: string) => void;
}

function ActionsCell({ data, userRole, onDelete, onNavigate }: ActionsCellProps): JSX.Element | null {
  if (!data) return null;
  const canEdit = userRole === 'ROLE_SOC_MANAGER' || userRole === 'ROLE_ADMIN';
  return (
    <div className="detection-rule-actions">
      <button type="button" disabled={!canEdit} aria-label={`Edit ${data.ruleName}`} title={canEdit ? 'Edit rule' : 'Requires SOC Manager'} onClick={(event) => { event.stopPropagation(); onNavigate(`/detection-rules/${data.id}/edit`); }}><Pencil size={14} /></button>
      <button type="button" aria-label={`Test ${data.ruleName}`} title="Test rule" onClick={(event) => { event.stopPropagation(); onNavigate(`/detection-rules/${data.id}/test`); }}><TestTube size={14} /></button>
      {userRole === 'ROLE_ADMIN'
        ? <button type="button" className="detection-rule-actions__danger" aria-label={`Delete ${data.ruleName}`} title="Delete rule" onClick={(event) => { event.stopPropagation(); onDelete(data); }}><Trash2 size={14} /></button>
        : <button type="button" aria-label={`More actions for ${data.ruleName}`} title="More actions" onClick={(event) => event.stopPropagation()}><Ellipsis size={14} /></button>}
    </div>
  );
}

export function createColumnDefs(
  userRole: 'ROLE_ANALYST' | 'ROLE_SOC_MANAGER' | 'ROLE_ADMIN',
  onToggleActive: (rule: DetectionRule) => void,
  onDelete: (rule: DetectionRule) => void,
  toggleLoadingIds: ReadonlySet<DetectionRule['id']>,
  onNavigate: (path: string) => void
): ColDef<DetectionRule>[] {
  const canToggle = userRole === 'ROLE_SOC_MANAGER' || userRole === 'ROLE_ADMIN';
  return [
    { colId: 'ruleName', field: 'ruleName', headerName: 'Detection', minWidth: 270, flex: 1.4, pinned: 'left', checkboxSelection: true, headerCheckboxSelection: true, cellRenderer: RuleNameCell },
    { colId: 'ruleActive', field: 'ruleActive', headerName: 'Status', width: 126, cellRenderer: ({ data }: { data?: DetectionRule }) => <StatusCell data={data} disabled={!canToggle} loading={Boolean(data && toggleLoadingIds.has(data.id))} onToggle={onToggleActive} /> },
    { colId: 'health', field: 'health', headerName: 'Last response', width: 130, cellRenderer: HealthCell },
    { colId: 'origin', field: 'origin', headerName: 'Source', width: 102, cellRenderer: OriginCell },
    { colId: 'techniqueId', field: 'techniqueId', headerName: 'MITRE ATT&CK', width: 180, cellRenderer: MitreCell },
    { colId: 'alerts24h', field: 'alerts24h', headerName: 'Alerts 24h', width: 104, cellRenderer: AlertsCell, cellClass: 'detection-grid__numeric' },
    { colId: 'schedule', field: 'schedule', headerName: 'Schedule', width: 110, valueFormatter: ({ value }) => value ? String(value) : 'Unavailable' },
    { colId: 'lastRunAt', field: 'lastRunAt', headerName: 'Last run', width: 132, cellRenderer: LastRunCell },
    { colId: 'lastModified', field: 'lastModified', headerName: 'Modified', width: 112, valueFormatter: ({ value }) => relativeTime(value ? String(value) : null), cellClass: 'detection-grid__mono' },
    { colId: 'actions', headerName: 'Actions', width: 112, sortable: false, filter: false, pinned: 'right', cellRenderer: ({ data }: { data?: DetectionRule }) => <ActionsCell data={data} userRole={userRole} onDelete={onDelete} onNavigate={onNavigate} /> },
  ];
}
