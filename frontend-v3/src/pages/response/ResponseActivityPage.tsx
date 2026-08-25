/**
 * ResponseActivityPage — Phase 7 execution control and audit ledger.
 * Bounded cursor pagination, compact operational summaries, keyboard navigation,
 * progressive execution trace, stale/partial states, and tenant-safe pivots.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlignJustify,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Filter,
  List,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TimerReset,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { RESPONSE_GRID_ROW_HEIGHTS } from './response-grid-standard';
import {
  RESP_018_DISABLED_TITLE,
  RESP_018_EXECUTION_INVENTORY,
} from './response.capabilities';
import type {
  ActivityStepDTO,
  ResponseActivityDTO,
  ResponseActivityListParams,
  ResponseActivityPageResult,
  ResponseActivityStatus,
  TriggerType,
} from './response.types';
import { cancelExecution, fetchResponseActivity, fetchResponseExecutionTrace, fixtureMode } from './responsePlaybooks.service';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';
import './ResponseActivityPage.css';
import './response-grid-standard.css';

type StatusFilter = ResponseActivityStatus | 'ALL';
type TriggerFilter = TriggerType | 'ALL';
type RowDensity = keyof typeof RESPONSE_GRID_ROW_HEIGHTS;
type DrawerView = 'overview' | 'trace' | 'audit';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All states' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
  { value: 'PARTIAL', label: 'Partial' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'SUCCESS', label: 'Succeeded' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'BLOCKED', label: 'Blocked' },
];

const TRIGGER_OPTIONS: Array<{ value: TriggerFilter; label: string }> = [
  { value: 'ALL', label: 'All triggers' },
  { value: 'AUTOMATIC', label: 'Alert event' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SCHEDULED', label: 'Scheduled' },
];

const TIME_OPTIONS = [
  { value: '1h', label: 'Last hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All retained' },
];

function timeRangeToParams(range: string): { timeFrom?: string; timeTo?: string } {
  if (range === 'all') return {};
  const now = Date.now();
  const offsetMs: Record<string, number> = {
    '1h': 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '24h': 24 * 60 * 60_000,
    '7d': 7 * 24 * 60 * 60_000,
    '30d': 30 * 24 * 60 * 60_000,
  };
  return {
    timeFrom: new Date(now - (offsetMs[range] ?? offsetMs['24h'])).toISOString(),
    timeTo: new Date(now).toISOString(),
  };
}

function formatDurationMs(ms: number | undefined | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusLabel(status: ResponseActivityStatus): string {
  if (status === 'AWAITING_APPROVAL') return 'Awaiting approval';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function ActivityStatusBadge({ status }: { status: ResponseActivityStatus }): JSX.Element {
  const icons: Record<ResponseActivityStatus, React.ReactNode> = {
    QUEUED: <Clock3 size={12} />,
    RUNNING: <LoaderCircle size={12} className="act-spin" />,
    AWAITING_APPROVAL: <PauseCircle size={12} />,
    SUCCESS: <CheckCircle2 size={12} />,
    PARTIAL: <AlertTriangle size={12} />,
    FAILED: <ShieldX size={12} />,
    CANCELLED: <CircleSlash2 size={12} />,
    BLOCKED: <ShieldAlert size={12} />,
  };
  return (
    <span className="act-status-badge" data-status={status.toLowerCase()} aria-label={`Status: ${statusLabel(status)}`}>
      {icons[status]}
      {statusLabel(status)}
    </span>
  );
}

function TriggerChip({ trigger }: { trigger: string }): JSX.Element {
  return (
    <span className="act-trigger-chip">
      {trigger === 'AUTOMATIC' && <Zap size={11} />}
      {trigger === 'SCHEDULED' && <Clock3 size={11} />}
      {trigger === 'MANUAL' && <PlayCircle size={11} />}
      {trigger === 'AUTOMATIC' ? 'Alert event' : trigger.charAt(0) + trigger.slice(1).toLowerCase()}
    </span>
  );
}

function StepStatusIcon({ status }: { status: ActivityStepDTO['status'] }): JSX.Element {
  if (status === 'success') return <CheckCircle2 size={14} data-status="success" />;
  if (status === 'error') return <ShieldX size={14} data-status="error" />;
  if (status === 'running') return <LoaderCircle size={14} data-status="running" className="act-spin" />;
  if (status === 'waiting' || status === 'queued') return <Clock3 size={14} data-status="waiting" />;
  return <CircleSlash2 size={14} data-status="muted" />;
}

function CopyButton({ value, label }: { value: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <button type="button" className="act-copy-button" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function ActivityDetailDrawer({
  entry,
  onClose,
  onCancelExecution,
}: {
  entry: ResponseActivityDTO;
  onClose: () => void;
  onCancelExecution: (entry: ResponseActivityDTO) => void;
}): JSX.Element {
  const [view, setView] = useState<DrawerView>('overview');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const traceQuery = useQuery({
    queryKey: ['resp-activity-trace', entry.id],
    queryFn: ({ signal }) => fetchResponseExecutionTrace(entry.id, undefined, signal),
    enabled: view === 'trace',
    staleTime: 30_000,
  });
  const traceItems = traceQuery.data?.items ?? [];
  const traceCount = entry.stepCount ?? entry.steps.length;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: DrawerView) => {
    const tabs: DrawerView[] = ['overview', 'trace', 'audit'];
    const currentIndex = tabs.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    setView(tabs[nextIndex]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[nextIndex]?.focus();
  };

  const linkedRoute = entry.linkedEntityType === 'ALERT'
    ? `/alerts/${entry.linkedEntityId}`
    : entry.linkedEntityType === 'INCIDENT'
      ? `/incidents/${entry.linkedEntityId}`
      : null;

  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={entry.playbookName}
      subtitle={`${entry.id} · ${formatTimestamp(entry.timestamp)}`}
      width={560}
      footer={
        <>
          {entry.capabilities?.canCancel && (
            <button type="button" className="act-drawer-button act-drawer-button--danger" onClick={() => onCancelExecution(entry)}>
              <XCircle size={14} /> Cancel run
            </button>
          )}
          <Link className="act-drawer-button" to={`/response/playbooks/${entry.playbookId}`} onClick={onClose}>
            <Workflow size={14} /> Open playbook
          </Link>
          {linkedRoute && (
            <Link className="act-drawer-button act-drawer-button--primary" to={linkedRoute} onClick={onClose}>
              Open {entry.linkedEntityType?.toLowerCase()} <ExternalLink size={13} />
            </Link>
          )}
        </>
      }
    >
      <div className="act-drawer-body">
        <div className="act-drawer-command">
          <ActivityStatusBadge status={entry.status} />
          <TriggerChip trigger={entry.trigger} />
          <span className="act-drawer-duration"><TimerReset size={12} />{formatDurationMs(entry.durationMs)}</span>
          {entry.connectorState && (
            <span className="act-connector-state" data-state={entry.connectorState.toLowerCase()}>
              {entry.connectorState === 'HEALTHY' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
              {entry.connectorState.toLowerCase()}
            </span>
          )}
        </div>

        <div className="act-drawer-tabs" role="tablist" aria-label="Execution detail views">
          {(['overview', 'trace', 'audit'] as DrawerView[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`execution-${entry.id}-${tab}-tab`}
              aria-controls={`execution-${entry.id}-${tab}-panel`}
              aria-selected={view === tab}
              tabIndex={view === tab ? 0 : -1}
              data-active={view === tab || undefined}
              onClick={() => setView(tab)}
              onKeyDown={(event) => handleTabKeyDown(event, tab)}
            >
              {tab === 'trace' ? `Trace ${traceCount}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {view === 'overview' && (
          <div className="act-drawer-view" role="tabpanel" id={`execution-${entry.id}-overview-panel`} aria-labelledby={`execution-${entry.id}-overview-tab`}>
            {entry.status === 'RUNNING' && (
              <section className="act-progress-card" aria-label="Execution progress">
                <div><span>Current block</span><strong>{entry.currentStep ?? 'Resolving next block'}</strong></div>
                <div className="act-progress-track"><span style={{ '--progress': `${entry.progressPercent ?? 0}%` } as React.CSSProperties} /></div>
                <small>{entry.progressPercent ?? 0}% complete · live updates</small>
              </section>
            )}
            {entry.status === 'AWAITING_APPROVAL' && (
              <section className="act-state-notice" data-tone="warning">
                <PauseCircle size={16} />
                <div><strong>Human approval required</strong><span>Execution is paused before a governed high-impact action.</span></div>
              </section>
            )}
            {entry.status === 'BLOCKED' && (
              <section className="act-state-notice" data-tone="danger">
                <ShieldAlert size={16} />
                <div><strong>Policy blocked this execution</strong><span>No response action was started. Review the audit decision and required authority.</span></div>
              </section>
            )}
            <dl className="act-detail-grid">
              <div><dt>Execution ID</dt><dd><code>{entry.id}</code><CopyButton value={entry.id} label="execution ID" /></dd></div>
              <div><dt>Playbook version</dt><dd>v{entry.playbookVersion ?? '—'}</dd></div>
              <div><dt>Initiated by</dt><dd>{entry.executedBy}</dd></div>
              <div><dt>Tenant scope</dt><dd>{entry.tenantLabel ?? 'Authorized scope'}</dd></div>
              <div><dt>Started</dt><dd>{entry.startedAt ? formatTimestamp(entry.startedAt) : 'Not started'}</dd></div>
              <div><dt>Completed</dt><dd>{entry.completedAt ? formatTimestamp(entry.completedAt) : '—'}</dd></div>
              <div><dt>Retries</dt><dd>{entry.retryCount ?? 0}</dd></div>
              <div><dt>Warnings</dt><dd>{entry.warningCount ?? 0}</dd></div>
            </dl>
            {entry.linkedEntityId && (
              <section className="act-context-card">
                <span>Execution context</span>
                <strong>{entry.linkedEntityType} · {entry.linkedEntityId}</strong>
                <small>Only the authorized projected entity is shown here.</small>
              </section>
            )}
          </div>
        )}

        {view === 'trace' && (
          <div className="act-drawer-view" role="tabpanel" id={`execution-${entry.id}-trace-panel`} aria-labelledby={`execution-${entry.id}-trace-tab`}>
            {traceQuery.isLoading && (
              <div className="act-trace-loading" role="status"><LoaderCircle size={15} className="act-spin" /> Loading bounded execution trace…</div>
            )}
            {traceQuery.isError && (
              <div className="act-trace-error" role="alert"><AlertTriangle size={15} /><span>Execution trace is unavailable.</span><button type="button" onClick={() => traceQuery.refetch()}>Retry</button></div>
            )}
            {!traceQuery.isLoading && !traceQuery.isError && !traceItems.length && (
              <div className="act-trace-empty"><Workflow size={18} /><strong>No node trace recorded</strong><span>The execution may not have started, or trace access is restricted.</span></div>
            )}
            {!!traceQuery.data?.partialFailures.length && (
              <div className="act-trace-error" role="status"><AlertTriangle size={15} /><span>Some trace sources are unavailable.</span></div>
            )}
            {!!traceItems.length && <ol className="act-step-list" aria-label="Execution trace">
              {traceItems.map((step, index) => {
                const open = expandedStep === step.id;
                return (
                  <li key={step.id} className="act-step" data-step-status={step.status}>
                    <button type="button" className="act-step__summary-row" onClick={() => setExpandedStep(open ? null : step.id)} aria-expanded={open}>
                      <span className="act-step__num">{index + 1}</span>
                      <StepStatusIcon status={step.status} />
                      <span className="act-step__body">
                        <strong>{step.actionName}</strong>
                        <small>{step.resultSummary ?? step.errorMessage ?? statusLabel(entry.status)}</small>
                      </span>
                      <span className="act-step__duration">{formatDurationMs(step.durationMs)}</span>
                      <ChevronRight size={13} className={open ? 'act-chevron-open' : undefined} />
                    </button>
                    {open && (
                      <div className="act-step__detail">
                        <dl>
                          <div><dt>Input</dt><dd>{step.inputSummary ?? 'Bounded input projection unavailable'}</dd></div>
                          <div><dt>Output</dt><dd>{step.outputSummary ?? step.errorMessage ?? 'No output recorded'}</dd></div>
                          <div><dt>Retries</dt><dd>{step.retryCount ?? 0}</dd></div>
                        </dl>
                        {!!step.redactedFields?.length && (
                          <p><ShieldCheck size={12} /> Redacted: {step.redactedFields.join(', ')}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>}
          </div>
        )}

        {view === 'audit' && (
          <div className="act-drawer-view" role="tabpanel" id={`execution-${entry.id}-audit-panel`} aria-labelledby={`execution-${entry.id}-audit-tab`}>
            <dl className="act-detail-grid act-detail-grid--single">
              <div><dt>Audit record</dt><dd><code>{entry.auditId ?? 'Not provided'}</code>{entry.auditId && <CopyButton value={entry.auditId} label="audit ID" />}</dd></div>
              <div><dt>Correlation ID</dt><dd><code>{entry.correlationId ?? 'Not provided'}</code>{entry.correlationId && <CopyButton value={entry.correlationId} label="correlation ID" />}</dd></div>
              <div><dt>Approval reference</dt><dd>{entry.approvalReference ? <Link to="/response/authority" onClick={onClose}>{entry.approvalReference}</Link> : 'Not required'}</dd></div>
            </dl>
            <section className="act-audit-note">
              <ShieldCheck size={16} />
              <div><strong>Immutable execution record</strong><span>Secrets, raw credentials, and restricted event fields are excluded from the browser projection.</span></div>
            </section>
            {entry.rawLog && <pre className="act-rawlog-body">{entry.rawLog}</pre>}
          </div>
        )}
      </div>
    </HaDrawer>
  );
}

export function ResponseActivityPage(): JSX.Element {
  const gridRef = useRef<AgGridReact>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const user = useAuthStore((state) => state.user);
  const epsStream = useEpsStream();

  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('ALL');
  const [timeRange, setTimeRange] = useState('24h');
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ResponseActivityDTO | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ResponseActivityDTO | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [density, setDensity] = useState<RowDensity>('standard');

  const canView = user?.roles?.some((role) => ['ROLE_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_ADMIN'].includes(role)) ?? false;

  const resetPaging = useCallback(() => {
    setCursor(undefined);
    setCursorHistory([]);
    setActiveIndex(0);
  }, []);

  const queryParams = useMemo<ResponseActivityListParams & { search?: string }>(() => ({
    size: 100,
    cursor,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    trigger: triggerFilter === 'ALL' ? undefined : triggerFilter,
    search: search || undefined,
    tenantScope: 'authorized',
    ...timeRangeToParams(timeRange),
  }), [cursor, search, statusFilter, timeRange, triggerFilter]);

  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['resp-activity', queryParams],
    queryFn: ({ signal }): Promise<ResponseActivityPageResult> => fetchResponseActivity(queryParams, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
    enabled: canView,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const summary = data?.summary;

  const cancelMutation = useMutation({
    mutationFn: (executionId: string) => cancelExecution(executionId),
    onSuccess: async () => {
      const cancelledId = cancelTarget?.id;
      setCancelTarget(null);
      setSelectedEntry(null);
      await queryClient.invalidateQueries({ queryKey: ['resp-activity'] });
      addToast({
        variant: 'success',
        title: 'Cancellation requested',
        description: cancelledId ? `Execution ${cancelledId} will stop at the next governed boundary.` : undefined,
      });
    },
    onError: (mutationError) => addToast({
      variant: 'danger',
      title: 'Could not cancel execution',
      description: mutationError instanceof Error ? mutationError.message : 'The execution state may have changed. Refresh and try again.',
    }),
  });

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === 'Escape' && selectedEntry) {
        event.preventDefault();
        setSelectedEntry(null);
        return;
      }
      if (!items.length) return;
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setSelectedEntry(items[activeIndex]);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [activeIndex, items, selectedEntry]);

  useEffect(() => {
    if (!selectedEntry) return;
    const refreshed = items.find((item) => item.id === selectedEntry.id);
    if (refreshed && refreshed !== selectedEntry) setSelectedEntry(refreshed);
  }, [items, selectedEntry]);

  useEffect(() => {
    gridRef.current?.api.ensureIndexVisible(activeIndex, 'middle');
    gridRef.current?.api.getDisplayedRowAtIndex(activeIndex)?.setSelected(true, true);
  }, [activeIndex]);

  const handleRowClick = useCallback((event: RowClickedEvent<ResponseActivityDTO>) => {
    if (!event.data) return;
    setActiveIndex(event.rowIndex ?? 0);
    setSelectedEntry(event.data);
  }, []);

  const columnDefs = useMemo<ColDef<ResponseActivityDTO>[]>(() => [
    {
      field: 'timestamp',
      headerName: 'Started',
      width: 136,
      sort: 'desc',
      cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => <span className="act-mono" title={row.timestamp}>{formatTimestamp(row.timestamp)}</span>,
    },
    {
      field: 'playbookName',
      headerName: 'Playbook / run',
      flex: 1,
      minWidth: 190,
      cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => (
        <span className="act-primary-cell"><strong>{row.playbookName}</strong><small>{row.id} · v{row.playbookVersion ?? '—'}</small></span>
      ),
    },
    { field: 'status', headerName: 'State', width: 132, cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => <ActivityStatusBadge status={row.status} /> },
    { field: 'trigger', headerName: 'Trigger', width: 102, cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => <TriggerChip trigger={row.trigger} /> },
    {
      field: 'linkedEntityId',
      headerName: 'Context',
      width: 154,
      cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => row.linkedEntityId
        ? <span className="act-context-cell"><strong>{row.linkedEntityId}</strong><small>{row.linkedEntityType?.toLowerCase()}</small></span>
        : <span className="act-muted">No linked context</span>,
    },
    { field: 'executedBy', headerName: 'Initiator', width: 120, cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => <span className="act-muted">{row.executedBy}</span> },
    {
      field: 'connectorState',
      headerName: 'Connectors',
      width: 100,
      cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => (
        <span className="act-connector-cell" data-state={(row.connectorState ?? 'HEALTHY').toLowerCase()}>
          <span />{(row.connectorState ?? 'HEALTHY').toLowerCase()}
        </span>
      ),
    },
    { field: 'durationMs', headerName: 'Duration', width: 82, cellRenderer: ({ data: row }: { data: ResponseActivityDTO }) => <span className="act-mono">{formatDurationMs(row.durationMs)}</span> },
    { headerName: '', colId: 'open', width: 34, sortable: false, filter: false, cellRenderer: () => <ChevronRight size={14} className="act-row-chevron" /> },
  ], []);

  const exportFixture = () => {
    if (!fixtureMode || !items.length) return;
    const header = ['execution_id', 'playbook', 'status', 'trigger', 'context', 'initiator', 'started_at', 'duration_ms'];
    const rows = items.map((item) => [item.id, item.playbookName, item.status, item.trigger, item.linkedEntityId ?? '', item.executedBy, item.timestamp, item.durationMs ?? '']);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `hivearmor-response-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) return <div className="act-page act-page--center"><AccessDeniedState message="Response activity requires the Analyst role or higher." /></div>;
  if (isError && !data) return <div className="act-page act-page--center"><ErrorState title="Could not load response activity" message={error instanceof Error ? error.message : 'Unexpected error'} onRetry={() => refetch()} /></div>;

  const nextPage = () => {
    if (!data?.nextCursor) return;
    setCursorHistory((history) => [...history, cursor ?? '']);
    setCursor(data.nextCursor);
    setActiveIndex(0);
  };
  const previousPage = () => {
    if (!cursorHistory.length) return;
    const history = [...cursorHistory];
    const previous = history.pop() ?? '';
    setCursorHistory(history);
    setCursor(previous || undefined);
    setActiveIndex(0);
  };

  return (
    <section className="act-page" data-fixture={fixtureMode || undefined} aria-label="Response activity">
      <header className="act-header">
        <div className="act-header__identity">
          <span className="act-header__mark"><Activity size={19} /></span>
          <div><span className="act-header__eyebrow">Response automation</span><h1>Response Activity</h1></div>
        </div>
        <div className="act-header__actions">
          <span className="act-shortcuts"><kbd>J</kbd>/<kbd>K</kbd> navigate <kbd>Enter</kbd> inspect</span>
          <HaButton variant="secondary" onClick={() => navigate('/response/playbooks')} icon={<Workflow size={14} />}>Playbooks</HaButton>
          <HaButton variant="plain" onClick={() => refetch()} isDisabled={isFetching} icon={<RefreshCw size={14} className={isFetching ? 'act-spin' : undefined} />} aria-label="Refresh activity" />
          <HaButton variant="secondary" onClick={exportFixture} isDisabled={!fixtureMode || !items.length} icon={<Download size={14} />} title={fixtureMode ? 'Export the loaded fictional page' : 'Authoritative export endpoint required'}>Export</HaButton>
        </div>
      </header>

      {fixtureMode && <div className="act-fixture-banner"><strong>Design fixture:</strong> fictional response executions are enabled for visual review.<span>Production never receives these records.</span></div>}
      {!fixtureMode && !RESP_018_EXECUTION_INVENTORY && (
        <div className="act-fixture-banner" role="status">
          <strong>Execution inventory unavailable:</strong> {RESP_018_DISABLED_TITLE}
          <span>Runs appear here when the secured executions contract is connected.</span>
        </div>
      )}

      <section className="act-summary" aria-label="Execution health summary">
        <div><span><Activity size={13} />Executions</span><strong>{summary?.total.toLocaleString() ?? '—'}</strong><small>{summary?.totalIsExact ? 'exact in window' : 'estimated'}</small></div>
        <div data-tone="live"><span><PlayCircle size={13} />In progress</span><strong>{summary?.running ?? '—'}</strong><small>queued or running</small></div>
        <div data-tone="warning"><span><PauseCircle size={13} />Awaiting approval</span><strong>{summary?.awaitingApproval ?? '—'}</strong><small>human decision</small></div>
        <div data-tone="danger"><span><ShieldX size={13} />Failed</span><strong>{summary?.failed ?? '—'}</strong><small>{summary?.partial ?? 0} partial</small></div>
        <div data-tone="positive"><span><CheckCircle2 size={13} />Success rate</span><strong>{summary ? `${summary.successRate}%` : '—'}</strong><small>completed runs</small></div>
        <div><span><TimerReset size={13} />Median duration</span><strong>{formatDurationMs(summary?.medianDurationMs)}</strong><small>{summary?.degradedConnectors ?? 0} degraded connectors</small></div>
      </section>

      <div className="act-toolbar" role="toolbar" aria-label="Response activity filters">
        <label className="act-search-wrap"><Search size={14} /><input ref={searchInputRef} type="search" value={searchText} onChange={(event) => { setSearchText(event.target.value); resetPaging(); }} placeholder="Search playbook, execution or context…" aria-label="Search response activity" /><kbd>/</kbd></label>
        <Filter size={13} className="act-filter-icon" aria-hidden="true" />
        <HaCompactSelect<StatusFilter> ariaLabel="Execution status" label="State" options={STATUS_OPTIONS} value={statusFilter} onChange={(value) => { setStatusFilter(value); resetPaging(); }} />
        <HaCompactSelect<TriggerFilter> ariaLabel="Execution trigger" label="Trigger" options={TRIGGER_OPTIONS} value={triggerFilter} onChange={(value) => { setTriggerFilter(value); resetPaging(); }} />
        <HaCompactSelect<string> ariaLabel="Activity time range" label="Window" options={TIME_OPTIONS} value={timeRange} onChange={(value) => { setTimeRange(value); resetPaging(); }} />
        <div className="act-toolbar__spacer" />
        {isFetching && <span className="act-updating" role="status"><RefreshCw size={12} className="act-spin" /> Updating</span>}
        <span className="act-snapshot">Snapshot {data?.snapshotAt ? new Date(data.snapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span>
      </div>

      {(data?.stale || (isError && !!data) || !!summary?.partialFailures.length) && (
        <div className="act-data-warning" role="status"><AlertTriangle size={14} /><span>{isError ? 'Refresh failed. Showing the last usable snapshot.' : 'Some execution sources are delayed or unavailable.'}</span><button type="button" onClick={() => refetch()}>Retry</button></div>
      )}

      <div className="act-results-toolbar">
        <div><strong>Executions</strong><span>{data?.total.toLocaleString() ?? 0} matching · page {cursorHistory.length + 1}</span></div>
        <div className="act-density" role="group" aria-label="Row density">
          <span>Rows</span>
          <button type="button" aria-label="Compact rows" aria-pressed={density === 'compact'} onClick={() => setDensity('compact')}><List size={15} /></button>
          <button type="button" aria-label="Standard rows" aria-pressed={density === 'standard'} onClick={() => setDensity('standard')}><AlignJustify size={15} /></button>
          <button type="button" aria-label="Comfortable rows" aria-pressed={density === 'comfortable'} onClick={() => setDensity('comfortable')}><AlignJustify size={17} /></button>
        </div>
      </div>

      <main className="act-grid-wrap">
        {isLoading ? (
          <div className="act-skeleton" role="status" aria-live="polite">{Array.from({ length: 12 }, (_, index) => <div key={index} className="act-skeleton-row" />)}</div>
        ) : !items.length ? (
          <EmptyState title={!fixtureMode && !RESP_018_EXECUTION_INVENTORY ? 'Execution inventory unavailable' : 'No executions in this window'} description={!fixtureMode && !RESP_018_EXECUTION_INVENTORY ? RESP_018_DISABLED_TITLE : statusFilter !== 'ALL' || triggerFilter !== 'ALL' || search ? 'Clear filters or widen the time window.' : 'Playbook executions appear here as they are queued.'} />
        ) : (
          <SiemDataGrid ref={gridRef} className="response-grid act-grid" columnDefs={columnDefs} rowData={items} rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]} onRowClicked={handleRowClick} rowSelection="single" suppressRowClickSelection={false} getRowId={(params) => (params.data as ResponseActivityDTO).id} ariaLabel="Response execution ledger" defaultColDef={{ filter: false }} />
        )}
      </main>

      <footer className="act-pagination" aria-label="Response activity pagination">
        <span>{data?.total.toLocaleString() ?? 0} matching executions</span>
        <span>Page {cursorHistory.length + 1} · {items.length} loaded</span>
        <div><button type="button" onClick={previousPage} disabled={!cursorHistory.length}><ChevronLeft size={14} /> Previous</button><button type="button" onClick={nextPage} disabled={!data?.nextCursor}>Next <ChevronRight size={14} /></button></div>
      </footer>

      <div className="act-status-dock"><StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : undefined} /></div>
      {selectedEntry && <ActivityDetailDrawer key={selectedEntry.id} entry={selectedEntry} onClose={() => setSelectedEntry(null)} onCancelExecution={setCancelTarget} />}
      <HaConfirmationModal
        isOpen={!!cancelTarget}
        title="Cancel this execution?"
        message={`Cancel ${cancelTarget?.playbookName ?? 'this playbook run'} at the next governed boundary? Completed actions are not rolled back automatically, and the request is recorded in the audit trail.`}
        confirmLabel={cancelMutation.isPending ? 'Cancelling…' : 'Cancel execution'}
        cancelLabel="Keep running"
        variant="danger"
        onConfirm={() => { if (cancelTarget && !cancelMutation.isPending) cancelMutation.mutate(cancelTarget.id); }}
        onCancel={() => { if (!cancelMutation.isPending) setCancelTarget(null); }}
      />
    </section>
  );
}
