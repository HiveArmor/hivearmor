/**
 * ResponsePlaybooksPage — Phase 7 redesign
 * RESP-001: Playbook library — compact header, workload metrics strip, virtual AG Grid,
 *            cursor pagination, filter/sort controls, inline activation toggle,
 *            and a preview drawer with step summary / last execution / blast-radius context.
 *
 * Routes all API calls through /api/ha-playbooks (secured @PreAuthorize).
 * Fixture mode: VITE_USE_FOUNDATION_FIXTURES=true (DEV only)
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { AgGridReact } from 'ag-grid-react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleSlash2,
  Clock3,
  Filter,
  Gavel,
  Layers,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldX,
  Timer,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { RESPONSE_GRID_ROW_HEIGHTS } from './response-grid-standard';
import { useRowDensity } from '@/hooks/useRowDensity';
import type { PlaybookListItem, PlaybookListParams, PlaybookCategory } from './response.types';
import {
  fetchPlaybookList,
  fetchPlaybookMetrics,
  setPlaybookActive,
  seedStarterPlaybooks,
  fixtureMode,
} from './responsePlaybooks.service';

import { AccessDeniedState } from '@/components/access-denied-state/AccessDeniedState';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaButton } from '@/components/ha-button/HaButton';
import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { HaDrawer } from '@/components/ha-drawer/HaDrawer';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useDebounce } from '@/hooks/useDebounce';
import { useEpsStream } from '@/hooks/useEpsStream';
import { useAuthStore } from '@/store/auth.store';
import './ResponsePlaybooksPage.css';
import './response-grid-standard.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'DRAFT';
type TriggerFilter = 'ALL' | 'MANUAL' | 'AUTOMATIC' | 'SCHEDULED';
type CategoryFilter = 'ALL' | PlaybookCategory;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'DRAFT', label: 'Draft' },
];

const TRIGGER_OPTIONS: Array<{ value: TriggerFilter; label: string }> = [
  { value: 'ALL', label: 'All triggers' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'AUTOMATIC', label: 'Automatic' },
  { value: 'SCHEDULED', label: 'Scheduled' },
];

const CATEGORY_OPTIONS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'ALL', label: 'All categories' },
  { value: 'EDR', label: 'EDR' },
  { value: 'Identity', label: 'Identity' },
  { value: 'Network', label: 'Network' },
  { value: 'Cloud', label: 'Cloud' },
  { value: 'Ticketing', label: 'Ticketing' },
  { value: 'Notification', label: 'Notification' },
  { value: 'Enrichment', label: 'Enrichment' },
  { value: 'Multi-step', label: 'Multi-step' },
];

// ─── Cell renderers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PlaybookListItem['status'] }): JSX.Element {
  const colorMap: Record<string, string> = {
    ACTIVE: 'var(--ha-severity-low)',
    INACTIVE: 'var(--ha-text-secondary)',
    DRAFT: 'var(--ha-severity-medium)',
  };
  return (
    <span className="resp-badge" style={{ '--badge-color': colorMap[status] ?? 'var(--ha-text-secondary)' } as React.CSSProperties}>
      {status === 'ACTIVE' && <span className="resp-badge__dot" />}
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function TriggerBadge({ trigger }: { trigger: PlaybookListItem['triggerType'] }): JSX.Element {
  const iconMap: Record<string, React.ReactNode> = {
    AUTOMATIC: <Zap size={11} />,
    MANUAL: <ListChecks size={11} />,
    SCHEDULED: <Timer size={11} />,
  };
  const labelMap: Record<string, string> = {
    AUTOMATIC: 'Auto',
    MANUAL: 'Manual',
    SCHEDULED: 'Scheduled',
  };
  return (
    <span className="resp-trigger-badge">
      {iconMap[trigger]}
      {labelMap[trigger] ?? trigger}
    </span>
  );
}

function RunStatusDot({ status }: { status: PlaybookListItem['lastRunStatus'] }): JSX.Element {
  if (!status) return <span className="resp-no-run">—</span>;
  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    success: { color: 'var(--ha-severity-low)', icon: <CheckCircle2 size={12} />, label: 'Success' },
    failure: { color: 'var(--ha-severity-critical)', icon: <ShieldX size={12} />, label: 'Failed' },
    running: { color: 'var(--ha-action-primary)', icon: <Activity size={12} className="resp-spin" />, label: 'Running' },
    cancelled: { color: 'var(--ha-text-secondary)', icon: <CircleSlash2 size={12} />, label: 'Cancelled' },
    awaiting_approval: { color: 'var(--ha-severity-high)', icon: <Clock3 size={12} />, label: 'Needs approval' },
  };
  const c = config[status] ?? { color: 'var(--ha-text-secondary)', icon: null, label: status };
  return (
    <span className="resp-run-status" style={{ '--run-color': c.color } as React.CSSProperties}>
      {c.icon}
      {c.label}
    </span>
  );
}

function ApprovalDot({ required }: { required: boolean }): JSX.Element {
  return required ? (
    <span className="resp-approval-chip">
      <ShieldCheck size={10} />
      Approval
    </span>
  ) : (
    <span className="resp-no-run">—</span>
  );
}

function ActiveToggle({
  playbookId,
  active,
  status,
  onToggle,
  disabled,
}: {
  playbookId: string;
  active: boolean;
  status: PlaybookListItem['status'];
  onToggle: (id: string, newActive: boolean) => void;
  disabled: boolean;
}): JSX.Element {
  if (status === 'DRAFT') {
    return <span className="resp-no-run" title="Publish the draft before enabling">Draft</span>;
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${active ? 'Disable' : 'Enable'} playbook`}
      className={`resp-toggle${active ? ' resp-toggle--on' : ''}`}
      onClick={() => { if (!disabled) onToggle(playbookId, !active); }}
      disabled={disabled}
    >
      <span className="resp-toggle__knob" />
    </button>
  );
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatUpdatedDate(iso: string): string {
  if (!iso) return 'Not provided by backend';
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return 'Not provided by backend';
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Preview drawer ───────────────────────────────────────────────────────────

function PlaybookPreviewDrawer({
  playbook,
  onClose,
  onEdit,
  onRunNow,
  canMutate,
}: {
  playbook: PlaybookListItem;
  onClose: () => void;
  onEdit: (id: string) => void;
  onRunNow: (id: string) => void;
  canMutate: boolean;
}): JSX.Element {
  return (
    <HaDrawer
      isOpen
      onClose={onClose}
      title={playbook.name}
      subtitle={`${playbook.category} · ${playbook.triggerType.charAt(0) + playbook.triggerType.slice(1).toLowerCase()}`}
      width={520}
      footer={
        <div className="resp-drawer-footer">
          {canMutate && (
            <HaButton
              variant="primary"
              onClick={() => onRunNow(playbook.id)}
              isDisabled={playbook.status !== 'ACTIVE'}
              aria-label={playbook.status !== 'ACTIVE' ? 'Run now (playbook must be active to run)' : 'Run now'}
            >
              Run now
            </HaButton>
          )}
          <HaButton variant="secondary" onClick={() => onEdit(playbook.id)}>
            Open workbench
          </HaButton>
          <HaButton variant="plain" onClick={onClose}>
            Close
          </HaButton>
        </div>
      }
    >
      <div className="resp-drawer-body">
        {/* Status row */}
        <div className="resp-drawer-meta-row">
          <StatusBadge status={playbook.status} />
          <TriggerBadge trigger={playbook.triggerType} />
          {playbook.approvalRequired && <ApprovalDot required={true} />}
        </div>

        {/* Description */}
        <p className="resp-drawer-description">{playbook.description}</p>

        {/* Stats grid */}
        <div className="resp-drawer-stats">
          <div className="resp-drawer-stat">
            <span className="resp-drawer-stat__label">Total runs</span>
            <span className="resp-drawer-stat__value">{playbook.runCount.toLocaleString()}</span>
          </div>
          <div className="resp-drawer-stat">
            <span className="resp-drawer-stat__label">Last executed</span>
            <span className="resp-drawer-stat__value" title={playbook.lastRunAt ?? ''}>
              {formatRelativeTime(playbook.lastRunAt)}
            </span>
          </div>
          <div className="resp-drawer-stat">
            <span className="resp-drawer-stat__label">Last result</span>
            <span className="resp-drawer-stat__value">
              <RunStatusDot status={playbook.lastRunStatus} />
            </span>
          </div>
          <div className="resp-drawer-stat">
            <span className="resp-drawer-stat__label">Author</span>
            <span className="resp-drawer-stat__value">{playbook.createdBy}</span>
          </div>
        </div>

        {/* Approval / blast-radius notice */}
        {playbook.approvalRequired && (
          <div className="resp-drawer-notice resp-drawer-notice--warning">
            <AlertTriangle size={14} />
            <div>
              <strong>Approval required</strong>
              <p>This playbook performs disruptive actions. An authorized SOC Manager must approve the run before it proceeds.</p>
            </div>
          </div>
        )}

        {/* Updated at */}
        <div className="resp-drawer-updated">
          Updated {formatUpdatedDate(playbook.updatedAt)}
        </div>

        {/* Navigate to detail */}
        <button
          type="button"
          className="resp-drawer-detail-link"
          onClick={() => onEdit(playbook.id)}
        >
          View full workbench
          <ChevronRight size={14} />
        </button>
      </div>
    </HaDrawer>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ResponsePlaybooksPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const user = useAuthStore((s) => s.user);
  const epsStream = useEpsStream();

  // Filter state
  const [density] = useRowDensity();

  const [searchText, setSearchText] = useState('');
  const search = useDebounce(searchText.trim(), 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // UI state
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookListItem | null>(null);
  const [pendingToggle, setPendingToggle] = useState<{ id: string; name: string; active: boolean } | null>(null);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, boolean>>({});

  const hasAdminRole = user?.roles?.includes('ROLE_ADMIN') ?? false;
  const hasSocManagerRole = user?.roles?.includes('ROLE_SOC_MANAGER') ?? false;
  /** List/detail: SOC Manager or Admin. Mutate/execute: Admin only (PlaybookResource). */
  const canView = hasAdminRole || hasSocManagerRole;
  const canMutate = hasAdminRole;

  // ─── Queries ──────────────────────────────────────────────────────────────

  const queryParams: PlaybookListParams & { search?: string; cursor?: string; category?: string } = useMemo(
    () => ({
      size: PAGE_SIZE,
      cursor,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      triggerType: triggerFilter === 'ALL' ? undefined : triggerFilter,
      search: search || undefined,
      category: categoryFilter === 'ALL' ? undefined : categoryFilter,
    }),
    [cursor, statusFilter, triggerFilter, search, categoryFilter]
  );

  const {
    data: listResult,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['resp-playbooks', queryParams],
    queryFn: () => fetchPlaybookList(queryParams),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    enabled: canView,
  });

  const {
    data: metrics,
  } = useQuery({
    queryKey: ['resp-playbook-metrics'],
    queryFn: fetchPlaybookMetrics,
    staleTime: 60_000,
    enabled: canView,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPlaybookActive(id, active),
    onMutate: ({ id, active }) => {
      setOptimisticOverrides((prev) => ({ ...prev, [id]: active }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['resp-playbooks'] });
      void queryClient.invalidateQueries({ queryKey: ['resp-playbook-metrics'] });
    },
    onError: (_err, { id }) => {
      setOptimisticOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    onSettled: () => {
      setOptimisticOverrides({});
      setPendingToggle(null);
    },
  });

  const seedMutation = useMutation({
    mutationFn: seedStarterPlaybooks,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['resp-playbooks'] });
      void queryClient.invalidateQueries({ queryKey: ['resp-playbook-metrics'] });
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleRowClick = useCallback((e: RowClickedEvent<PlaybookListItem>) => {
    if (e.data) setSelectedPlaybook(e.data);
  }, []);

  const handleEdit = useCallback(
    (id: string) => {
      navigate(`/response/playbooks/${id}`);
    },
    [navigate]
  );

  const handleRunNow = useCallback(
    (id: string) => {
      navigate(`/response/playbooks/${id}?run=1`);
    },
    [navigate]
  );

  const handleToggleRequest = useCallback((id: string, newActive: boolean) => {
    const pb = listResult?.items.find((p) => p.id === id);
    if (!pb) return;
    setPendingToggle({ id, name: pb.name, active: newActive });
  }, [listResult]);

  const confirmToggle = useCallback(() => {
    if (!pendingToggle) return;
    toggleMutation.mutate({ id: pendingToggle.id, active: pendingToggle.active });
  }, [pendingToggle, toggleMutation]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setCursor(undefined);
  }, []);

  const handleFilterChange = useCallback(
    <T extends string>(setter: React.Dispatch<React.SetStateAction<T>>) =>
      (v: T) => {
        setter(v);
        setCursor(undefined);
      },
    []
  );

  // ─── Column definitions ───────────────────────────────────────────────────

  const columnDefs: ColDef<PlaybookListItem>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Playbook',
        flex: 1,
        minWidth: 220,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <button
            type="button"
            className="resp-name-link"
            onClick={() => handleEdit(data.id)}
          >
            {data.name}
            {data.approvalRequired && (
              <span className="resp-approval-badge-inline" title="Approval required">
                <ShieldCheck size={10} />
              </span>
            )}
          </button>
        ),
      },
      {
        field: 'category',
        headerName: 'Category',
        width: 120,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <span className="resp-category-chip">{data.category}</span>
        ),
      },
      {
        field: 'triggerType',
        headerName: 'Trigger',
        width: 120,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <TriggerBadge trigger={data.triggerType} />
        ),
      },
      {
        field: 'status',
        headerName: 'State',
        width: 110,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <StatusBadge status={data.status} />
        ),
      },
      {
        field: 'lastRunStatus',
        headerName: 'Last result',
        width: 140,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <RunStatusDot status={data.lastRunStatus} />
        ),
      },
      {
        field: 'lastRunAt',
        headerName: 'Last run',
        width: 110,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <span className="resp-mono" title={data.lastRunAt ?? ''}>
            {formatRelativeTime(data.lastRunAt)}
          </span>
        ),
      },
      {
        field: 'runCount',
        headerName: 'Runs',
        width: 80,
        type: 'numericColumn',
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <span className="resp-mono">{data.runCount.toLocaleString()}</span>
        ),
      },
      {
        field: 'status',
        colId: 'active-toggle',
        headerName: 'Enabled',
        width: 90,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <ActiveToggle
            playbookId={data.id}
            active={optimisticOverrides[data.id] ?? data.status === 'ACTIVE'}
            status={data.status}
            onToggle={handleToggleRequest}
            disabled={!canMutate || toggleMutation.isPending}
          />
        ),
      },
      {
        headerName: '',
        colId: 'actions',
        width: 44,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: { data: PlaybookListItem }) => (
          <button
            type="button"
            className="resp-row-action"
            onClick={(e) => { e.stopPropagation(); handleEdit(data.id); }}
            aria-label="Open playbook workbench"
          >
            <ChevronRight size={14} />
          </button>
        ),
      },
    ],
    [canMutate, handleEdit, handleToggleRequest, optimisticOverrides, toggleMutation.isPending]
  );

  // ─── Access denied ─────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="resp-access-denied">
        <AccessDeniedState
          message="Response playbooks require the SOC Manager role or higher."
        />
      </div>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────────────

  if (isError && !listResult) {
    return (
      <div className="resp-error">
        <ErrorState
          title="Could not load playbooks"
          message={error instanceof Error ? error.message : 'Unexpected error'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const items = listResult?.items ?? [];
  const total = listResult?.total ?? 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="resp-page" data-fixture={fixtureMode || undefined}>

      {/* ── Page identity ── */}
      <header className="resp-page-header">
        <div className="resp-page-header__left">
          <div className="resp-page-header__eyebrow">
            <Layers size={13} />
            Response
          </div>
          <h1 className="resp-page-header__title">Playbook Library</h1>
        </div>
        <div className="resp-page-header__right">
          {fixtureMode && (
            <span className="resp-fixture-chip" aria-label="Demonstration data — not connected to a real environment">
              Demonstration data
            </span>
          )}
          <HaButton
            variant="plain"
            icon={<RefreshCw size={14} />}
            aria-label="Refresh"
            onClick={() => refetch()}
            isDisabled={isFetching}
            style={{ minWidth: 'unset', padding: '6px 8px' }}
          />
          {canMutate && (
            <HaButton
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => navigate('/response/playbooks/new')}
            >
              New playbook
            </HaButton>
          )}
        </div>
      </header>

      {/* ── Workload metrics strip ── */}
      {metrics && (
        <div className="resp-metrics-strip" role="region" aria-label="Playbook workload summary">
          <div className="resp-metric">
            <span className="resp-metric__value">{metrics.total}</span>
            <span className="resp-metric__label">Total</span>
          </div>
          <div className="resp-metric">
            <span className="resp-metric__value resp-metric__value--action">{metrics.active}</span>
            <span className="resp-metric__label">Active</span>
          </div>
          <div className="resp-metric resp-metric--divider">
            <span className="resp-metric__value resp-metric__value--bright">{metrics.executionsLast24h}</span>
            <span className="resp-metric__label">Runs · 24h</span>
          </div>
          <div className="resp-metric">
            <span className="resp-metric__value resp-metric__value--positive">{metrics.successRate24h.toFixed(1)}%</span>
            <span className="resp-metric__label">Success rate</span>
          </div>
          {metrics.pendingApprovals > 0 && (
            <div className="resp-metric resp-metric--divider">
              <span className="resp-metric__value resp-metric__value--warning">{metrics.pendingApprovals}</span>
              <span className="resp-metric__label">Pending approvals</span>
            </div>
          )}
          {metrics.activeQuarantines > 0 && (
            <div className="resp-metric">
              <span className="resp-metric__value resp-metric__value--critical">{metrics.activeQuarantines}</span>
              <span className="resp-metric__label">Active quarantines</span>
            </div>
          )}
        </div>
      )}

      {/* ── Filter toolbar ── */}
      <div className="resp-toolbar" role="toolbar" aria-label="Playbook filters">
        <div className="resp-search-wrap">
          <Search size={13} className="resp-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="resp-search"
            placeholder="Search playbooks…"
            value={searchText}
            onChange={handleSearchChange}
            aria-label="Search playbooks"
          />
        </div>

        <div className="resp-toolbar__filters">
          <Filter size={12} className="resp-toolbar__filter-icon" aria-hidden="true" />
          <HaCompactSelect<StatusFilter>
            ariaLabel="State filter"
            label="State"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={handleFilterChange(setStatusFilter)}
          />
          <HaCompactSelect<TriggerFilter>
            ariaLabel="Trigger filter"
            label="Trigger"
            options={TRIGGER_OPTIONS}
            value={triggerFilter}
            onChange={handleFilterChange(setTriggerFilter)}
          />
          <HaCompactSelect<CategoryFilter>
            ariaLabel="Category filter"
            label="Category"
            options={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={handleFilterChange(setCategoryFilter)}
          />
        </div>

        <div className="resp-toolbar__right">
          {isFetching && !isLoading && (
            <span className="resp-loading-indicator" role="status" aria-live="polite">
              <RefreshCw size={11} className="resp-spin" />
              Updating
            </span>
          )}
          <span className="resp-total-count">
            {isLoading ? '—' : total.toLocaleString()} playbook{total !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            className="resp-toolbar-btn"
            onClick={() => navigate('/response/activity')}
            aria-label="View execution history"
          >
            <Settings2 size={13} />
            Activity log
          </button>
          <button
            type="button"
            className="resp-toolbar-btn"
            onClick={() => navigate('/response/authority')}
            aria-label="Review response approvals"
          >
            <Gavel size={13} />
            Approvals
          </button>
        </div>
      </div>

      {/* ── Data grid ── */}
      <div className="resp-grid-wrap">
        {isLoading ? (
          <div className="resp-grid-skeleton" role="status" aria-live="polite">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="resp-skeleton-row" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={search || statusFilter !== 'ALL' || triggerFilter !== 'ALL' ? 'No playbooks match your filters' : 'No playbooks configured'}
            description={
              search || statusFilter !== 'ALL' || triggerFilter !== 'ALL'
                ? 'Try clearing one or more filters to see more results.'
                : 'Start from a blank canvas or seed three SOC starter playbooks (isolation, malware containment, manual triage).'
            }
            action={
              canMutate && !search && statusFilter === 'ALL' ? (
                <div className="resp-empty-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <HaButton variant="primary" icon={<Plus size={14} />} onClick={() => navigate('/response/playbooks/new')}>
                    New playbook
                  </HaButton>
                  <HaButton
                    variant="secondary"
                    icon={<Layers size={14} />}
                    onClick={() => seedMutation.mutate()}
                    isDisabled={seedMutation.isPending}
                  >
                    {seedMutation.isPending ? 'Seeding…' : 'Seed starter playbooks'}
                  </HaButton>
                </div>
              ) : undefined
            }
          />
        ) : (
          <SiemDataGrid
            ref={gridRef}
            className="response-grid resp-grid"
            columnDefs={columnDefs}
            rowData={items}
            loading={isLoading}
            rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]}
            onRowClicked={handleRowClick}
            rowSelection="single"
            suppressRowClickSelection={false}
            getRowId={(params) => (params.data as PlaybookListItem).id}
          />
        )}
      </div>

      {/* ── Load-more ── */}
      {listResult?.hasMore && (
        <div className="resp-load-more">
          <HaButton
            variant="secondary"
            onClick={() => setCursor(listResult.nextCursor ?? undefined)}
            isDisabled={isFetching}
          >
            Load more
          </HaButton>
        </div>
      )}

      <div className="resp-status-dock">
        <StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} />
        <span>{total.toLocaleString()} playbooks · cursor pagination · bounded 100-row projection</span>
      </div>

      {/* ── Preview drawer ── */}
      {selectedPlaybook && (
        <PlaybookPreviewDrawer
          playbook={selectedPlaybook}
          onClose={() => setSelectedPlaybook(null)}
          onEdit={handleEdit}
          onRunNow={handleRunNow}
          canMutate={canMutate}
        />
      )}

      {/* ── Toggle confirmation modal ── */}
      {pendingToggle && (
        <HaConfirmationModal
          isOpen
          title={pendingToggle.active ? 'Enable playbook' : 'Disable playbook'}
          message={
            pendingToggle.active
              ? `Enable "${pendingToggle.name}"? Automatic and scheduled triggers will immediately begin routing matching events to this playbook.`
              : `Disable "${pendingToggle.name}"? Automatic and scheduled triggers will stop firing. Running executions complete normally.`
          }
          confirmLabel={pendingToggle.active ? 'Enable' : 'Disable'}
          cancelLabel="Cancel"
          variant={pendingToggle.active ? 'primary' : 'danger'}
          onConfirm={confirmToggle}
          onCancel={() => setPendingToggle(null)}
        />
      )}
    </div>
  );
}
