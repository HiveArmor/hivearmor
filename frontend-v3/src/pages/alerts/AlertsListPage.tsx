import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  AlertOctagon,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Columns3,
  Filter,
  Hexagon,
  Keyboard,
  Layers3,
  ListFilter,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  UserRound,
  X,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  ALERT_COLUMNS_OPTIONAL,
  createAlertTriageColumns,
} from './alertColumns';
import { AlertDetailDrawer } from './AlertDetailDrawer';
import { createAlertsListDatasource } from './alertsListDatasource';
import {
  alertTriageFixtureMode,
  fetchAlertQueueSummary,
  updateAlertTriageStatus,
} from './alertTriage.service';
import type {
  AlertQueueFilters,
  AlertQueueLoadState,
  AlertQueueRecord,
  AlertQueueSummary,
  AlertQueueView,
  AlertRowQuickAction,
  AlertStatusCommand,
  AlertTriageAction,
  AlertTriageDetail,
} from './alertTriage.types';
import { IncidentLinkDialog } from './components/IncidentLinkDialog';
import { NoteDialog } from './components/NoteDialog';
import { TagDialog } from './components/TagDialog';

import { AddFilterPopover, type StructuredAlertFilter } from '@/components/add-filter-popover/AddFilterPopover';
import { FieldSelectorPopover } from '@/components/field-selector-popover/FieldSelectorPopover';
import { HaCompactSelect, type HaCompactSelectOption } from '@/components/ha-compact-select/HaCompactSelect';
import { LiveModeToggle } from '@/components/live-mode-toggle/LiveModeToggle';
import { SiemDataGrid } from '@/components/siem-data-grid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { TimeRangeSelector, resolveTimeRange } from '@/components/time-range-selector';
import type { TimeRange } from '@/components/time-range-selector';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { useAlertStream } from '@/hooks/useAlertStream';
import { useEpsStream } from '@/hooks/useEpsStream';
import { ROW_HEIGHTS, useRowDensity } from '@/hooks/useRowDensity';
import { getAlertQuerySuggestions, parseAlertQueryExpression } from '@/lib/alertFilterFields';
import { SEVERITY_LEVELS, type SeverityLevel } from '@/lib/severity';
import { useAlertStreamStore } from '@/store/alertStream.store';
import { useAuthStore } from '@/store/auth.store';

import './AlertsListPage.css';

const STORAGE_KEY_COLUMNS = 'ha_alerts_columns';
const STORAGE_KEY_MODE = 'ha_alerts_mode';
const STORAGE_KEY_DRAWER_WIDTH = 'ha_alerts_drawer_width';

const builtInViews: AlertQueueView[] = [
  { id: 'needs-triage', label: 'Needs triage', description: 'Open and in-review alerts ordered by urgency.', filters: { status: 'active' } },
  { id: 'my-priority', label: 'My priority', description: 'Active alerts owned by the current analyst.', filters: { status: 'active', assignee: 'me' } },
  { id: 'critical', label: 'Critical', description: 'Active critical alerts.', countKey: 'criticalOpen', filters: { status: 'active', severity: 'critical' } },
  { id: 'sla-risk', label: 'SLA risk', description: 'Alerts approaching or past their response target.', countKey: 'slaAtRisk', filters: { status: 'active', sla: 'at_risk' } },
  { id: 'unassigned', label: 'Unassigned', description: 'Active work without an owner.', countKey: 'unassigned', filters: { status: 'active', assignee: 'unassigned' } },
  { id: 'intel-match', label: 'Intel matches', description: 'Active alerts with threat-intelligence matches.', countKey: 'threatIntelMatched', filters: { status: 'active', threatIntel: 'matched' } },
  { id: 'all', label: 'All alerts', description: 'Every alert in the selected time scope.', filters: {} },
];

const filterLabels: Record<keyof AlertQueueFilters, string> = {
  severity: 'Severity',
  status: 'Status',
  q: 'Search',
  from: 'From',
  to: 'To',
  assignee: 'Owner',
  tenantId: 'Tenant',
  category: 'Category',
  riskMin: 'Risk ≥',
  sla: 'SLA',
  threatIntel: 'Threat intel',
  adversaryIp: 'Source',
  targetIp: 'Destination',
  tags: 'Tag',
  queryExpression: 'Query',
};

const actionMeta: Record<AlertTriageAction, { title: string; description: string; confirm: string; tone: 'primary' | 'danger' }> = {
  acknowledge: { title: 'Acknowledge selected alerts', description: 'Move the selected work into active investigation without closing it.', confirm: 'Acknowledge alerts', tone: 'primary' },
  change_status: { title: 'Change alert status', description: 'Move the alert to the correct workflow state while retaining a complete audit trail.', confirm: 'Change status', tone: 'primary' },
  true_positive: { title: 'Classify as true positive', description: 'Record that the selected alerts represent verified malicious or policy-violating activity.', confirm: 'Confirm true positive', tone: 'danger' },
  false_positive: { title: 'Classify as false positive', description: 'Close the selected alerts and feed the outcome back into detection tuning.', confirm: 'Confirm false positive', tone: 'primary' },
  assign: { title: 'Assign selected alerts', description: 'Preview owner eligibility and workload before changing ownership.', confirm: 'Assign to Maya Chen', tone: 'primary' },
  note: { title: 'Add analyst note', description: 'Capture an observation or handoff detail in the alert activity history.', confirm: 'Add note', tone: 'primary' },
  tag: { title: 'Add triage tags', description: 'Apply consistent, filterable labels to the selected alerts.', confirm: 'Apply tags', tone: 'primary' },
  promote: { title: 'Promote to incident', description: 'Create an incident candidate while retaining links to every selected alert.', confirm: 'Create incident candidate', tone: 'danger' },
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function statusForAction(action: AlertTriageAction, auxiliaryValue = ''): AlertStatusCommand['status'] | null {
  if (action === 'acknowledge') return 3;
  if (action === 'true_positive') return 6;
  if (action === 'false_positive') return 7;
  if (action === 'change_status') {
    const statuses: Record<string, AlertStatusCommand['status']> = {
      open: 2,
      in_review: 3,
      completed: 5,
      true_positive: 6,
      false_positive: 7,
    };
    return statuses[auxiliaryValue] ?? null;
  }
  return null;
}

function statusLabelForCode(status: AlertStatusCommand['status']): string {
  return ({ 2: 'Open', 3: 'In review', 5: 'Completed', 6: 'True positive', 7: 'False positive' } as const)[status];
}

function detailStatusForCode(status: AlertStatusCommand['status']): AlertTriageDetail['status'] {
  if (status === 2) return 'open';
  if (status === 3) return 'in_progress';
  if (status === 7) return 'false_positive';
  return 'resolved';
}

function countLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString();
}

interface BulkActionDialogProps {
  action: AlertTriageAction;
  selectedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, auxiliaryValue: string) => void;
}

function BulkActionDialog({ action, selectedCount, isPending, onCancel, onConfirm }: BulkActionDialogProps): JSX.Element {
  const [reason, setReason] = useState('');
  const [auxiliaryValue, setAuxiliaryValue] = useState(
    action === 'false_positive'
      ? 'expected_activity'
      : action === 'tag'
        ? 'triaged'
        : action === 'change_status'
          ? 'in_review'
          : action === 'promote'
            ? 'new_incident'
            : action === 'note'
              ? 'note'
              : 'maya.chen'
  );
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const meta = actionMeta[action];
  const auxiliaryLabel = action === 'false_positive' ? 'Classification reason' : action === 'assign' ? 'Owner' : action === 'tag' ? 'Tags' : action === 'change_status' ? 'New status' : 'Incident destination';
  const auxiliaryOptions: Array<HaCompactSelectOption> | null = action === 'false_positive'
    ? [
        { value: 'expected_activity', label: 'Expected activity' },
        { value: 'duplicate', label: 'Duplicate signal' },
        { value: 'authorized_test', label: 'Authorized security test' },
        { value: 'noisy_rule', label: 'Detection requires tuning' },
        { value: 'other', label: 'Other' },
      ]
    : action === 'assign'
      ? [
          { value: 'maya.chen', label: 'Maya Chen · 6 active · 1 SLA risk' },
          { value: 'omar.haddad', label: 'Omar Haddad · 8 active · 2 SLA risk' },
          { value: 'elena.rossi', label: 'Elena Rossi · 4 active · 0 SLA risk' },
        ]
      : action === 'change_status'
        ? [
            { value: 'open', label: 'Open' },
            { value: 'in_review', label: 'In review' },
            { value: 'completed', label: 'Completed' },
            { value: 'true_positive', label: 'True positive' },
            { value: 'false_positive', label: 'False positive' },
          ]
        : action === 'promote'
          ? [
              { value: 'new_incident', label: 'Create a new incident candidate' },
              { value: 'INC-2026-00418', label: 'INC-2026-00418 · Finance endpoint intrusion' },
              { value: 'INC-2026-00411', label: 'INC-2026-00411 · Privileged identity abuse' },
            ]
          : null;

  useEffect(() => {
    reasonRef.current?.focus();
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !isPending) onCancel(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [isPending, onCancel]);

  return (
    <div className="alert-action-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) onCancel(); }}>
      <section className="alert-action-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-action-title">
        <header>
          <span className="alert-action-dialog__hex" data-tone={meta.tone} aria-hidden="true"><Hexagon size={22} /></span>
          <div><span>{selectedCount} selected</span><h2 id="alert-action-title">{meta.title}</h2><p>{meta.description}</p></div>
          <button type="button" onClick={onCancel} disabled={isPending} aria-label="Close action dialog"><X size={17} /></button>
        </header>

        <div className="alert-action-dialog__body">
          {(action === 'false_positive' || action === 'assign' || action === 'tag' || action === 'change_status' || action === 'promote') && (
            <div className="alert-action-dialog__field">
              <span>{auxiliaryLabel}</span>
              {action === 'tag'
                ? <input aria-label={auxiliaryLabel} value={auxiliaryValue} onChange={(event) => setAuxiliaryValue(event.target.value)} placeholder="triaged, identity" />
                : auxiliaryOptions && <HaCompactSelect ariaLabel={auxiliaryLabel} value={auxiliaryValue} options={auxiliaryOptions} onChange={setAuxiliaryValue} />}
            </div>
          )}

          <label>
            <span>{action === 'note' ? 'Analyst note' : 'Analyst reason'} <em>Required</em></span>
            <textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder={action === 'note' ? 'Record an observation, hypothesis, or handoff detail…' : 'Record the evidence or judgment supporting this change…'} />
          </label>

          <div className="alert-action-dialog__impact">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{alertTriageFixtureMode ? 'Design fixture: this action is simulated and no endpoint or asset is changed.' : 'The action is audited. The backend revalidates role, tenant, record version, and policy.'}</span>
          </div>
        </div>

        <footer>
          <button type="button" className="alert-button alert-button--secondary" onClick={onCancel} disabled={isPending}>Cancel</button>
          <button type="button" className={`alert-button alert-button--${meta.tone}`} onClick={() => onConfirm(reason.trim(), auxiliaryValue.trim())} disabled={reason.trim().length < 6 || !auxiliaryValue || isPending}>
            {isPending ? 'Applying…' : alertTriageFixtureMode ? `Simulate · ${meta.confirm}` : meta.confirm}
          </button>
        </footer>
      </section>
    </div>
  );
}

function MetricButton({ icon: Icon, label, value, detail, tone, onClick }: { icon: typeof AlertTriangle; label: string; value: number | null | undefined; detail: string; tone: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="alert-queue-metric" data-tone={tone} onClick={onClick} aria-label={`${label}: ${countLabel(value)}. ${detail}`}>
      <span className="alert-queue-metric__icon"><Icon size={16} aria-hidden="true" /></span>
      <span><small>{label}</small><strong>{countLabel(value)}</strong><em>{detail}</em></span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

export function AlertsListPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.addToast);
  const gridRef = useRef<AgGridReact>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((state) => state.user);
  const canTriage = useAuthStore((state) => state.hasAnyRole(['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN']));
  const activeTenantId = useAuthStore((state) => state.selectedTenantId);

  const linkedSeverityValue = searchParams.get('severity');
  const linkedSeverity = SEVERITY_LEVELS.includes(linkedSeverityValue as SeverityLevel) ? linkedSeverityValue as SeverityLevel : null;
  const linkedStatusValue = searchParams.get('status');
  const linkedStatus = linkedStatusValue === 'active' ? linkedStatusValue : undefined;
  const linkedAssigneeValue = searchParams.get('assignee');
  const linkedAssignee = linkedAssigneeValue === 'me' || linkedAssigneeValue === 'unassigned' ? linkedAssigneeValue : undefined;
  const linkedFromValue = searchParams.get('from');
  const linkedToValue = searchParams.get('to');
  const linkedHistoricalWindow = linkedFromValue && linkedToValue
    && Number.isFinite(Date.parse(linkedFromValue))
    && Number.isFinite(Date.parse(linkedToValue))
    && Date.parse(linkedFromValue) < Date.parse(linkedToValue)
    ? { from: linkedFromValue, to: linkedToValue }
    : null;
  const linkedBoardFilters: AlertQueueFilters = {
    ...(linkedSeverity ? { severity: linkedSeverity } : {}),
    ...(linkedStatus ? { status: linkedStatus } : {}),
    ...(linkedAssignee ? { assignee: linkedAssignee } : {}),
    ...(linkedHistoricalWindow ?? {}),
  };
  const hasLinkedBoardScope = Boolean(linkedSeverity || linkedAssignee || linkedHistoricalWindow);
  const [mode, setMode] = useState<'live' | 'historical'>(() => (
    searchParams.get('mode') === 'historical' && linkedHistoricalWindow
      ? 'historical'
      : localStorage.getItem(STORAGE_KEY_MODE) === 'historical' ? 'historical' : 'live'
  ));
  const [timeRange, setTimeRange] = useState<TimeRange>(() => linkedHistoricalWindow
    ? { type: 'custom', ...linkedHistoricalWindow }
    : { type: 'preset', preset: '24h' });
  const [activeViewId, setActiveViewId] = useState<AlertQueueView['id']>(hasLinkedBoardScope ? 'all' : 'needs-triage');
  const [filters, setFilters] = useState<AlertQueueFilters>(() => hasLinkedBoardScope ? linkedBoardFilters : builtInViews[0].filters);
  const [queryInput, setQueryInput] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryFocused, setQueryFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<AlertQueueLoadState>({ state: 'idle' });
  const [selectedRows, setSelectedRows] = useState<AlertQueueRecord[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [activeAction, setActiveAction] = useState<AlertTriageAction | null>(null);
  const [noteDialogAlert, setNoteDialogAlert] = useState<string | null>(null);
  const [tagDialogAlert, setTagDialogAlert] = useState<string | null>(null);
  const [incidentLinkDialogAlert, setIncidentLinkDialogAlert] = useState<string | null>(null);

  const [drawerAlertId, setDrawerAlertId] = useState<string | null>(null);
  const [drawerWidth, setDrawerWidthState] = useState(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY_DRAWER_WIDTH));
    return Number.isFinite(stored) && stored >= 400 && stored <= 680 ? stored : 480;
  });
  const [density, setDensity] = useRowDensity();
  const [selectedColIds, setSelectedColIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COLUMNS);
      return stored ? (JSON.parse(stored) as string[]) : ['mitreTechniqueId', 'tenantName'];
    } catch {
      return ['mitreTechniqueId', 'tenantName'];
    }
  });

  useAlertStream();
  const epsStream = useEpsStream();
  const { connected: streamConnected, newAlertCount, clearNewAlertCount } = useAlertStreamStore();
  const effectiveStreamConnected = alertTriageFixtureMode || streamConnected;
  const effectiveEpsConnected = alertTriageFixtureMode || epsStream.connected;
  const effectiveEps = alertTriageFixtureMode ? 12840 : epsStream.eps;

  const handleTotalCount = useCallback((count: number) => setTotalCount(count), []);
  const handleLoadState = useCallback((state: AlertQueueLoadState) => setLoadState(state), []);
  const datasource = useMemo(() => createAlertsListDatasource(filters, handleTotalCount, handleLoadState), [filters, handleLoadState, handleTotalCount]);

  const summaryQuery = useQuery<AlertQueueSummary>({
    queryKey: ['alerts', 'summary', filters, activeTenantId],
    queryFn: ({ signal }) => fetchAlertQueueSummary(filters, signal),
    staleTime: 15_000,
    retry: alertTriageFixtureMode ? false : 1,
  });
  const summary = summaryQuery.data;

  const openActionForIds = useCallback((action: AlertTriageAction, ids: string[]): void => {
    if (!canTriage || !ids.length) return;

    // Dispatch note, tag, promote to their dedicated dialogs
    if (action === 'note') {
      setNoteDialogAlert(ids[0]);
      return;
    }
    if (action === 'tag') {
      setTagDialogAlert(ids[0]);
      return;
    }
    if (action === 'promote') {
      setIncidentLinkDialogAlert(ids[0]);
      return;
    }

    setSelectedRows(ids.map((id) => ({ id } as AlertQueueRecord)));
    setActiveAction(action);
  }, [canTriage]);

  const activeColumns = useMemo<ColDef<AlertQueueRecord>[]>(() => createAlertTriageColumns(
    (action: AlertRowQuickAction, alertId: string) => openActionForIds(action, [alertId]),
    ALERT_COLUMNS_OPTIONAL.filter((column) => selectedColIds.includes(column.colId ?? column.field ?? ''))
  ), [openActionForIds, selectedColIds]);

  const querySuggestions = useMemo(() => getAlertQuerySuggestions(queryInput), [queryInput]);
  const showQuerySuggestions = queryFocused && querySuggestions.length > 0;

  useEffect(() => {
    if (!gridRef.current?.api) return;
    gridRef.current.api.setGridOption('datasource', datasource);
  }, [datasource]);

  useEffect(() => {
    if (!gridRef.current?.api) return;
    gridRef.current.api.setGridOption('columnDefs', activeColumns);
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(selectedColIds));
  }, [activeColumns, selectedColIds]);

  const setDrawerWidth = useCallback((width: number): void => {
    const next = Math.min(680, Math.max(400, Math.round(width)));
    setDrawerWidthState(next);
    localStorage.setItem(STORAGE_KEY_DRAWER_WIDTH, String(next));
  }, []);

  const applyView = (view: AlertQueueView): void => {
    const timeFilters = mode === 'historical' ? resolveTimeRange(timeRange) : {};
    setActiveViewId(view.id);
    setFilters({ ...view.filters, ...timeFilters });
    setSearchParams({});
    setQueryInput('');
    setQueryError(null);
    setSelectedRows([]);
    gridRef.current?.api?.deselectAll();
  };

  const handleModeChange = (nextMode: 'live' | 'historical'): void => {
    setMode(nextMode);
    localStorage.setItem(STORAGE_KEY_MODE, nextMode);
    if (nextMode === 'live') {
      clearNewAlertCount();
      setFilters((current) => {
        const next = { ...current };
        delete next.from;
        delete next.to;
        return next;
      });
    } else {
      setFilters((current) => ({ ...current, ...resolveTimeRange(timeRange) }));
    }
  };

  const handleTimeRangeChange = (nextRange: TimeRange): void => {
    setTimeRange(nextRange);
    if (mode === 'historical') setFilters((current) => ({ ...current, ...resolveTimeRange(nextRange) }));
  };

  const applyQueryExpression = (expression: string): void => {
    const normalized = expression.trim();
    const parsed = parseAlertQueryExpression(normalized);
    if (parsed === null) {
      setQueryError('Use supported field:value conditions joined by AND or OR. NOT, quoted values, and *contains* are supported.');
      return;
    }
    setQueryError(null);
    setActiveViewId('all');
    setSearchParams(normalized ? { q: normalized } : {});
    const timeFilters = mode === 'historical' ? resolveTimeRange(timeRange) : {};
    setFilters(normalized ? { ...timeFilters, queryExpression: normalized } : timeFilters);
    setQueryInput(normalized);
    setActiveSuggestionIndex(-1);
  };

  const submitQuery = (): void => {
    applyQueryExpression(queryInput);
  };

  const applyQuerySuggestion = (index: number): void => {
    const suggestion = querySuggestions[index];
    if (!suggestion) return;
    setQueryInput(suggestion.nextValue);
    setQueryError(null);
    setActiveSuggestionIndex(-1);
    window.requestAnimationFrame(() => queryInputRef.current?.focus());
  };

  const addStructuredFilter = (filter: StructuredAlertFilter): void => {
    const strippedValue = filter.value.replace(/["']/g, '').trim();
    const formattedValue = /\s/.test(strippedValue) || filter.operator === 'contains'
      ? `"${filter.operator === 'contains' ? `*${strippedValue}*` : strippedValue}"`
      : strippedValue;
    const clause = `${filter.operator === 'is_not' ? 'NOT ' : ''}${filter.field}:${formattedValue}`;
    const currentExpression = queryInput.trim() || filters.queryExpression?.trim() || '';
    const nextExpression = currentExpression ? `${currentExpression} ${filter.conjunction} ${clause}` : clause;
    applyQueryExpression(nextExpression);
  };

  const removeFilter = (key: keyof AlertQueueFilters): void => {
    setActiveViewId('all');
    setFilters((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (key === 'queryExpression') setQueryInput('');
    if (key === 'severity' || key === 'status' || key === 'assignee' || key === 'from' || key === 'to' || key === 'queryExpression') setSearchParams({});
  };

  const refreshQueue = (): void => {
    gridRef.current?.api?.purgeInfiniteCache();
    void summaryQuery.refetch();
  };

  const loadNewAlerts = (): void => {
    clearNewAlertCount();
    gridRef.current?.api?.purgeInfiniteCache();
    addToast({ variant: 'info', title: 'New alerts loaded', description: 'The queue was refreshed without changing your filters.' });
  };

  const navigateVisibleRow = useCallback((delta: number): void => {
    const api = gridRef.current?.api;
    if (!api) return;
    const nextIndex = Math.max(0, Math.min(api.getDisplayedRowCount() - 1, focusedRowIndex + delta));
    const node = api.getDisplayedRowAtIndex(nextIndex);
    if (!node?.data) return;
    api.ensureIndexVisible(nextIndex, 'middle');
    api.setFocusedCell(nextIndex, 'name');
    setFocusedRowIndex(nextIndex);
    setDrawerAlertId((node.data as AlertQueueRecord).id);
  }, [focusedRowIndex]);

  const requestAction = (action: AlertTriageAction, alertIds?: string[]): void => {
    openActionForIds(action, alertIds ?? selectedRows.map((row) => row.id));
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, ids, reason, auxiliary }: { action: AlertTriageAction; ids: string[]; reason: string; auxiliary: string }) => {
      const status = statusForAction(action, auxiliary);
      if (status !== null) {
        await updateAlertTriageStatus({
          alertIds: ids,
          status,
          statusObservation: reason,
          addFalsePositiveTag: action === 'false_positive',
        });
      }
    },
    onSuccess: (_data, variables) => {
      const status = statusForAction(variables.action, variables.auxiliary);
      if (alertTriageFixtureMode) {
        const ownerById: Record<string, { id: number; name: string }> = {
          'maya.chen': { id: 41, name: 'Maya Chen' },
          'omar.haddad': { id: 42, name: 'Omar Haddad' },
          'elena.rossi': { id: 43, name: 'Elena Rossi' },
        };
        const owner = ownerById[variables.auxiliary] ?? ownerById['maya.chen'];
        const tags = variables.auxiliary.split(',').map((tag) => tag.trim()).filter(Boolean);
        gridRef.current?.api?.forEachNode((node) => {
          const record = node.data as AlertQueueRecord | undefined;
          if (!record || !variables.ids.includes(record.id)) return;
          if (status !== null) node.setData({ ...record, status, statusLabel: statusLabelForCode(status) });
          if (variables.action === 'assign') node.setData({ ...record, assigneeId: owner.id, assigneeName: owner.name });
          if (variables.action === 'tag') node.setData({ ...record, tags: Array.from(new Set([...(record.tags ?? []), ...tags])) });
          if (variables.action === 'promote') node.setData({ ...record, isIncident: true });
        });

        variables.ids.forEach((id) => {
          queryClient.setQueryData<AlertTriageDetail>(['alert', 'triage', id], (current) => {
            if (!current) return current;
            if (status !== null) {
              return { ...current, statusCode: status, status: detailStatusForCode(status) };
            }
            if (variables.action === 'assign') return { ...current, assigneeName: owner.name };
            if (variables.action === 'tag') return { ...current, tags: Array.from(new Set([...current.tags, ...tags])) };
            if (variables.action === 'note') {
              return {
                ...current,
                activity: [{
                  id: `${id}-note-${Date.now()}`,
                  at: new Date().toISOString(),
                  actor: user ? `${user.firstName} ${user.lastName}` : 'Current analyst',
                  action: 'Analyst note added',
                  detail: variables.reason,
                }, ...current.activity],
              };
            }
            return current;
          });
        });
      } else {
        refreshQueue();
        variables.ids.forEach((id) => void queryClient.invalidateQueries({ queryKey: ['alert', 'triage', id] }));
      }
      addToast({ variant: 'success', title: alertTriageFixtureMode ? 'Triage action simulated' : 'Triage action completed', description: `${variables.ids.length} alert${variables.ids.length === 1 ? '' : 's'} updated.` });
      gridRef.current?.api?.deselectAll();
      setSelectedRows([]);
      setActiveAction(null);
    },
    onError: (error: Error) => {
      addToast({ variant: 'danger', title: 'Triage action failed', description: error.message });
    },
  });

  const handlePageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isTypingTarget(event.target) || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      queryInputRef.current?.focus();
      return;
    }
    if (event.key.toLowerCase() === 'j') { event.preventDefault(); navigateVisibleRow(1); return; }
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); navigateVisibleRow(-1); return; }
    if (event.key === 'Enter') {
      const node = gridRef.current?.api?.getDisplayedRowAtIndex(focusedRowIndex);
      if (node?.data) { event.preventDefault(); setDrawerAlertId((node.data as AlertQueueRecord).id); }
      return;
    }
    if (event.key === ' ') {
      const node = gridRef.current?.api?.getDisplayedRowAtIndex(focusedRowIndex);
      if (node?.data) { event.preventDefault(); node.setSelected(!node.isSelected()); }
      return;
    }
    if (event.key.toLowerCase() === 'a' && selectedRows.length) { event.preventDefault(); requestAction('assign'); }
    if (event.key.toLowerCase() === 'c' && selectedRows.length) { event.preventDefault(); requestAction('true_positive'); }
  };

  const visibleFilterEntries = Object.entries(filters).filter(([key, value]) => value && key !== 'from' && key !== 'to') as [keyof AlertQueueFilters, string][];
  const selectedIds = selectedRows.map((row) => row.id);

  return (
    <div className="alert-triage" onKeyDown={handlePageKeyDown}>
      {alertTriageFixtureMode && (
        <div className="alert-triage__fixture" role="status"><span><strong>Design fixture:</strong> fictional alert telemetry is enabled for visual review.</span><span>Production never receives these records.</span></div>
      )}

      <header className="alert-triage-header">
        <div className="alert-triage-header__identity">
          <span className="alert-triage-header__hex" aria-hidden="true"><BellRing size={20} /></span>
          <div><span>Detection operations</span><h1>Alerts</h1><p>Prioritize, understand, and route security signals without losing queue context.</p></div>
        </div>
        <div className="alert-triage-header__actions">
          <div className="alert-stream-state" data-state={effectiveStreamConnected ? 'live' : 'delayed'}><span aria-hidden="true" /><div><strong>{effectiveStreamConnected ? 'Live intake' : 'Intake delayed'}</strong><small>{loadState.state === 'ready' ? `Rows updated ${new Date(loadState.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Automatic retry active'}</small></div></div>
          <Link className="alert-route-switch" to="/alerts/board"><Layers3 size={15} aria-hidden="true" />Severity board</Link>
          <LiveModeToggle mode={mode} onChange={handleModeChange} sseConnected={effectiveStreamConnected} />
        </div>
      </header>

      <div className="alert-queue-sticky" data-drawer-open={Boolean(drawerAlertId)} aria-label="Alert queue controls and priority summary">
        <section className="alert-queue-metrics" aria-label="Alert priority snapshot">
          <MetricButton icon={ListFilter} label="Current scope" value={summary?.totalApproximate ?? totalCount} detail="matching alerts" tone="violet" onClick={() => applyView(builtInViews[0])} />
          <MetricButton icon={AlertOctagon} label="Critical open" value={summary?.criticalOpen} detail="needs immediate review" tone="critical" onClick={() => applyView(builtInViews[2])} />
          <MetricButton icon={Clock3} label="SLA pressure" value={summary?.slaAtRisk} detail="at risk or breached" tone="warning" onClick={() => applyView(builtInViews[3])} />
          <MetricButton icon={UserRound} label="Unassigned" value={summary?.unassigned} detail="without an owner" tone="info" onClick={() => applyView(builtInViews[4])} />
          <MetricButton icon={Sparkles} label="Intel matches" value={summary?.threatIntelMatched} detail="enriched indicators" tone="intel" onClick={() => applyView(builtInViews[5])} />
        </section>

        {!effectiveStreamConnected && (
          <div className="alert-queue-banner" data-tone="warning" role="status"><AlertTriangle size={15} /><span><strong>Live updates delayed.</strong> Existing rows remain available while the stream reconnects.</span><button type="button" onClick={refreshQueue}>Refresh rows</button></div>
        )}
        {newAlertCount > 0 && (
          <div className="alert-queue-banner" data-tone="live" role="status" aria-live="polite"><CircleDot size={15} /><span><strong>{newAlertCount} new alert{newAlertCount === 1 ? '' : 's'} buffered.</strong> Your current row position has not moved.</span><button type="button" onClick={loadNewAlerts}>{mode === 'historical' ? 'Switch to live and load' : 'Load new alerts'}</button></div>
        )}

        <nav className="alert-view-strip" aria-label="Alert queue views">
              <div className="alert-view-strip__label"><ListFilter size={14} aria-hidden="true" /><strong>Views</strong></div>
              <div className="alert-view-strip__items">
                {builtInViews.map((view) => (
                  <button key={view.id} type="button" data-active={activeViewId === view.id} onClick={() => applyView(view)} title={view.description}>
                    <span aria-hidden="true" /><strong>{view.label}</strong>{view.countKey && <em>{countLabel(summary?.[view.countKey])}</em>}
                  </button>
                ))}
              </div>
              <div className="alert-view-strip__shortcuts" title="J/K navigate · Space select · A assign · C classify" aria-label="Keyboard triage shortcuts: J and K navigate, Space selects, A assigns, C classifies">
                <Keyboard size={13} aria-hidden="true" /><span>J/K</span>
              </div>
        </nav>

        <div className="alert-query-toolbar">
              <div className="alert-query-toolbar__search" data-error={Boolean(queryError)}>
                <Search size={15} aria-hidden="true" />
                <input
                  ref={queryInputRef}
                  value={queryInput}
                  onChange={(event) => {
                    setQueryInput(event.target.value);
                    setQueryError(null);
                    setActiveSuggestionIndex(-1);
                  }}
                  onFocus={() => setQueryFocused(true)}
                  onBlur={() => window.setTimeout(() => setQueryFocused(false), 100)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' && querySuggestions.length) {
                      event.preventDefault();
                      setActiveSuggestionIndex((current) => Math.min(querySuggestions.length - 1, current + 1));
                      return;
                    }
                    if (event.key === 'ArrowUp' && querySuggestions.length) {
                      event.preventDefault();
                      setActiveSuggestionIndex((current) => Math.max(-1, current - 1));
                      return;
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (showQuerySuggestions && activeSuggestionIndex >= 0) applyQuerySuggestion(activeSuggestionIndex);
                      else submitQuery();
                    }
                    if (event.key === 'Escape') {
                      setQueryFocused(false);
                      setActiveSuggestionIndex(-1);
                      setQueryError(null);
                    }
                  }}
                  placeholder='Filter alerts · severity:critical AND status:open'
                  aria-label="Alert query"
                  aria-describedby={queryError ? 'alert-query-error' : 'alert-query-help'}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showQuerySuggestions}
                  aria-controls="alert-query-suggestions"
                  aria-activedescendant={activeSuggestionIndex >= 0 ? querySuggestions[activeSuggestionIndex]?.id : undefined}
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd>⇧ F</kbd>
                <button type="button" onClick={submitQuery}>Run</button>
                {showQuerySuggestions && (
                  <div id="alert-query-suggestions" className="alert-query-suggestions" role="listbox" aria-label="Alert query suggestions">
                    {querySuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion.id}
                        id={suggestion.id}
                        type="button"
                        role="option"
                        aria-selected={activeSuggestionIndex === index}
                        data-active={activeSuggestionIndex === index}
                        data-kind={suggestion.kind}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onClick={() => applyQuerySuggestion(index)}
                      >
                        <span>{suggestion.kind === 'operator' ? 'Logic' : suggestion.kind === 'field' ? 'Field' : 'Value'}</span>
                        <strong>{suggestion.label}</strong>
                        <small>{suggestion.detail}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div id="alert-query-help" className="alert-sr-only">Use field colon value conditions joined by AND or OR. Arrow keys select autocomplete suggestions. Press Enter to run.</div>
              <div className="alert-query-toolbar__actions">
                <AddFilterPopover hasExistingExpression={Boolean(queryInput.trim() || filters.queryExpression)} onAddFilter={addStructuredFilter} />
                <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} disabled={mode === 'live'} />
                <FieldSelectorPopover optionalColumns={ALERT_COLUMNS_OPTIONAL} selectedColIds={selectedColIds} onToggleColumn={(id) => setSelectedColIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])} />
                <div className="alert-density-control" aria-label="Row density">
                  {(['compact', 'standard', 'comfortable'] as const).map((option) => <button key={option} type="button" data-active={density === option} onClick={() => setDensity(option)} aria-label={`${option} row density`} title={`${option} density`}><Columns3 size={option === 'compact' ? 12 : option === 'standard' ? 14 : 16} /></button>)}
                </div>
                <button type="button" className="alert-toolbar-icon" onClick={refreshQueue} aria-label="Refresh alert queue" title="Refresh rows"><RefreshCw size={15} /></button>
              </div>
        </div>

        {queryError && <div id="alert-query-error" className="alert-query-error" role="alert"><AlertTriangle size={13} />{queryError}</div>}
        {visibleFilterEntries.length > 0 && (
          <div className="alert-filter-row" aria-label="Active alert filters">
            <Filter size={13} aria-hidden="true" />
            {visibleFilterEntries.map(([key, value]) => <span key={key}><strong>{filterLabels[key]}</strong>{value.replace(/_/g, ' ')}<button type="button" onClick={() => removeFilter(key)} aria-label={`Remove ${filterLabels[key]} filter`}><X size={11} /></button></span>)}
            <button type="button" onClick={() => { setFilters(mode === 'historical' ? resolveTimeRange(timeRange) : {}); setQueryInput(''); setQueryError(null); setSearchParams({}); setActiveViewId('all'); }}>Clear filters</button>
          </div>
        )}

        <div className="alert-grid-meta">
          <div><strong>{countLabel(totalCount)}</strong><span>matching alerts</span>{summary?.snapshotAt && <><i aria-hidden="true" /><span>snapshot <time dateTime={summary.snapshotAt}>{new Date(summary.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></span></>}</div>
          <div><span>Virtual queue · 100-row blocks</span><span>Double-click opens investigation</span></div>
        </div>
      </div>

      <section className="alert-queue-workspace" style={{ '--alert-drawer-width': `${drawerWidth}px` } as React.CSSProperties} data-drawer-open={Boolean(drawerAlertId)}>
        <div className="alert-queue-main">
          <div className="alert-grid-workspace">

            {loadState.state === 'error' && (
              <div className="alert-grid-error" role="alert"><AlertTriangle size={20} /><div><strong>Alert queue unavailable</strong><span>{loadState.message}. The checked-in backend does not currently expose the list contract described by ALT-014.</span></div><button type="button" onClick={refreshQueue}>Retry</button></div>
            )}

            <div className="alert-grid-region" aria-busy={loadState.state === 'loading'}>
              <SiemDataGrid
                ref={gridRef}
                className="alert-triage-grid"
                columnDefs={activeColumns}
                rowModelType="infinite"
                datasource={datasource}
                rowHeight={ROW_HEIGHTS[density] + 8}
                infiniteInitialRowCount={100}
                cacheBlockSize={100}
                maxBlocksInCache={10}
                ariaLabel="Alert triage queue"
                suppressRowClickSelection
                rowSelection={{ mode: 'multiRow', headerCheckbox: false, checkboxes: false, enableClickSelection: false }}
                onSelectionChanged={(rows) => setSelectedRows(rows as AlertQueueRecord[])}
                onCellClicked={(event) => {
                  if (event.column.getColId() === 'actions' || event.column.getColId() === 'selection') return;
                  const alert = event.data as AlertQueueRecord | undefined;
                  if (!alert) return;
                  setFocusedRowIndex(event.rowIndex ?? 0);
                  setDrawerAlertId(alert.id);
                }}
                onCellDoubleClicked={(event) => {
                  if (event.column.getColId() === 'actions' || event.column.getColId() === 'selection') return;
                  const alert = event.data as AlertQueueRecord | undefined;
                  if (alert) navigate(`/alerts/${encodeURIComponent(alert.id)}`);
                }}
                defaultColDef={{ sortable: true, resizable: true, filter: false, suppressMovable: false }}
                getRowId={(params) => {
                  const alert = params.data as AlertQueueRecord;
                  return `${alert.id}::${alert.timestamp}`;
                }}
              />
            </div>

            {selectedRows.length > 0 && (
              <div className="alert-selection-bar" role="region" aria-label="Selected alert actions">
                <div><span className="alert-selection-bar__hex" aria-hidden="true"><Hexagon size={18} /></span><strong>{selectedRows.length} selected</strong><button type="button" onClick={() => { gridRef.current?.api?.deselectAll(); setSelectedRows([]); }}>Clear</button></div>
                <div>
                  <button type="button" onClick={() => requestAction('acknowledge')} disabled={!canTriage}><CircleDot size={14} />Acknowledge</button>
                  <button type="button" onClick={() => requestAction('true_positive')} disabled={!canTriage}><ShieldAlert size={14} />True positive</button>
                  <button type="button" onClick={() => requestAction('false_positive')} disabled={!canTriage}><CheckCircle2 size={14} />False positive</button>
                  <button type="button" onClick={() => requestAction('assign')} disabled={!canTriage}><UserRound size={14} />Assign</button>
                  <button type="button" onClick={() => requestAction('tag')} disabled={!canTriage}><Tag size={14} />Tag</button>
                  <button type="button" onClick={() => requestAction('promote')} disabled={!canTriage}><Radar size={14} />Promote</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {drawerAlertId && (
          <>
            <button type="button" className="alert-drawer-scrim" onClick={() => setDrawerAlertId(null)} aria-label="Close alert context" />
            <AlertDetailDrawer
              alertId={drawerAlertId}
              onClose={() => setDrawerAlertId(null)}
              width={drawerWidth}
              onWidthChange={setDrawerWidth}
              onPrevious={() => navigateVisibleRow(-1)}
              onNext={() => navigateVisibleRow(1)}
              hasPrevious={focusedRowIndex > 0}
              hasNext={focusedRowIndex < Math.max(0, (totalCount ?? 1) - 1)}
              onRequestAction={requestAction}
            />
          </>
        )}
      </section>

      <StatusDock sseConnected={effectiveStreamConnected || effectiveEpsConnected} eps={effectiveEps} mode={mode} />

      {activeAction && (
        <BulkActionDialog
          action={activeAction}
          selectedCount={selectedIds.length}
          isPending={actionMutation.isPending}
          onCancel={() => setActiveAction(null)}
          onConfirm={(reason, auxiliary) => actionMutation.mutate({ action: activeAction, ids: selectedIds, auxiliary, reason: `${reason}${user ? ` — ${user.firstName} ${user.lastName}` : ''}` })}
        />
      )}

      {noteDialogAlert && (
        <NoteDialog
          alertId={noteDialogAlert}
          alertVersion={null}
          onSuccess={() => {
            setNoteDialogAlert(null);
            queryClient.invalidateQueries({ queryKey: ['alert'] });
          }}
          onCancel={() => setNoteDialogAlert(null)}
        />
      )}

      {tagDialogAlert && (
        <TagDialog
          alertId={tagDialogAlert}
          currentTags={[]}
          onSuccess={() => {
            setTagDialogAlert(null);
            queryClient.invalidateQueries({ queryKey: ['alert'] });
          }}
          onCancel={() => setTagDialogAlert(null)}
        />
      )}

      {incidentLinkDialogAlert && (
        <IncidentLinkDialog
          alertId={incidentLinkDialogAlert}
          onSuccess={(_incidentId: string) => {
            setIncidentLinkDialogAlert(null);
            queryClient.invalidateQueries({ queryKey: ['alert'] });
          }}
          onCancel={() => setIncidentLinkDialogAlert(null)}
        />
      )}
    </div>
  );
}
