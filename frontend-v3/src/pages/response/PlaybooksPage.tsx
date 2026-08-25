/**
 * PlaybooksPage — Sprint 18 SOAR T01-1.5
 * Lists all playbooks in a SiemDataGrid with inline Active toggle,
 * Run Now, Edit actions.
 *
 * frontend-v3/src/pages/response/PlaybooksPage.tsx
 */

import { useCallback, useState } from 'react';

import { Alert, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { Lock, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { RESPONSE_GRID_ROW_HEIGHTS } from './response-grid-standard';
import { useRowDensity } from '@/hooks/useRowDensity';

import { EmptyState as HaEmptyState } from '@/components/empty-state/EmptyState';
import { HaButton } from '@/components/ha-button/HaButton';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { HaSwitch } from '@/components/ha-switch/HaSwitch';
import { PlaybookExecutionViewer } from '@/components/playbook/PlaybookExecutionViewer';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { fetchPlaybooks, setPlaybookActive, executePlaybook } from '@/services/playbookService';
import { useAuthStore } from '@/store/auth.store';
import type { Playbook, PlaybookStep, PlaybookTriggerType, PlaybookStatus } from '@/types/playbook';
import './response-grid-standard.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleString();
}

function triggerTypeBadge(triggerType: PlaybookTriggerType): JSX.Element {
  const colorMap: Record<PlaybookTriggerType, string> = {
    manual: 'var(--ha-text-secondary)',
    'alert-triggered': 'var(--ha-medium)',
    scheduled: 'var(--ha-intelligence)',
  };
  const labelMap: Record<PlaybookTriggerType, string> = {
    manual: 'Manual',
    'alert-triggered': 'Alert Triggered',
    scheduled: 'Scheduled',
  };
  const color = colorMap[triggerType] ?? 'var(--ha-text-secondary)';
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 'var(--ha-text-xs)',
        border: `1px solid ${color}`,
        color: color,
        display: 'inline-block',
        lineHeight: '18px',
      }}
    >
      {labelMap[triggerType] ?? triggerType}
    </span>
  );
}

function statusBadge(lastRunStatus: PlaybookStatus | null): JSX.Element {
  if (lastRunStatus === null) {
    return (
      <span style={{ color: 'var(--ha-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        —
      </span>
    );
  }
  if (lastRunStatus === 'running') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Spinner
          size="sm"
          style={{ '--pf-v5-c-spinner--Color': 'var(--ha-primary)' } as React.CSSProperties}
        />
        <span style={{ color: 'var(--ha-primary)', fontSize: 'var(--ha-text-xs)' }}>Running</span>
      </span>
    );
  }
  const colorMap: Record<Exclude<PlaybookStatus, 'running' | 'cancelled'>, string> = {
    success: 'var(--ha-positive)',
    failure: 'var(--ha-critical)',
  };
  const labelMap: Record<PlaybookStatus, string> = {
    success: 'Success',
    failure: 'Failure',
    running: 'Running',
    cancelled: 'Cancelled',
  };
  const color =
    lastRunStatus === 'cancelled'
      ? 'var(--ha-text-secondary)'
      : (colorMap[lastRunStatus as Exclude<PlaybookStatus, 'running' | 'cancelled'>] ??
        'var(--ha-text-secondary)');
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 'var(--ha-text-xs)',
        border: `1px solid ${color}`,
        color: color,
        display: 'inline-block',
        lineHeight: '18px',
      }}
    >
      {labelMap[lastRunStatus]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Active Toggle cell — handles optimistic update and revert
// ---------------------------------------------------------------------------

interface ActiveToggleCellProps {
  playbook: Playbook;
  onToggle: (id: number, next: boolean) => Promise<void>;
}

function ActiveToggleCell({ playbook, onToggle }: ActiveToggleCellProps): JSX.Element {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const current = optimistic !== null ? optimistic : playbook.active;

  const handleChange = async (checked: boolean): Promise<void> => {
    if (pending) return;
    setOptimistic(checked);
    setPending(true);
    try {
      await onToggle(playbook.id, checked);
    } catch {
      // revert on failure
      setOptimistic(playbook.active);
    } finally {
      setPending(false);
      setOptimistic(null);
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {pending && (
        <Spinner
          size="sm"
          style={{ '--pf-v5-c-spinner--Color': 'var(--ha-primary)' } as React.CSSProperties}
        />
      )}
      <HaSwitch
        id={`active-toggle-${playbook.id}`}
        isChecked={current}
        onChange={handleChange}
        isDisabled={pending}
        aria-label={`Toggle active for ${playbook.name}`}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Run Now cell — disabled when playbook.active === false
// ---------------------------------------------------------------------------

interface RunNowCellProps {
  playbook: Playbook;
  onRunNow: (id: number) => void;
}

function RunNowCell({ playbook, onRunNow }: RunNowCellProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={!playbook.active}
      onClick={() => onRunNow(playbook.id)}
      style={{
        padding: '2px 10px',
        background: playbook.active ? 'var(--ha-primary)' : 'var(--ha-surface-raised)',
        color: playbook.active ? 'var(--ha-background)' : 'var(--ha-text-secondary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 4,
        cursor: playbook.active ? 'pointer' : 'not-allowed',
        fontSize: 'var(--ha-text-xs)',
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        opacity: playbook.active ? 1 : 0.5,
      }}
      aria-disabled={!playbook.active}
    >
      <PlayCircle size={12} />
      Run Now
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function PlaybooksPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const { hasAnyRole } = useAuthStore();
  const [density] = useRowDensity();

  // Access check — read requires ROLE_SOC_MANAGER or ROLE_ADMIN
  const hasAccess = hasAnyRole(['ROLE_SOC_MANAGER', 'ROLE_ADMIN']);

  // Execution viewer state
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedPlaybookSteps, setSelectedPlaybookSteps] = useState<PlaybookStep[]>([]);

  const {
    data: playbooks,
    isLoading,
    isError,
    error,
  } = useQuery<Playbook[], Error>({
    queryKey: ['playbooks'],
    queryFn: fetchPlaybooks,
    staleTime: 30_000,
    enabled: hasAccess,
  });

  // Optimistic active toggle
  const handleToggle = useCallback(
    async (id: number, next: boolean): Promise<void> => {
      // Optimistically update the cache
      queryClient.setQueryData<Playbook[]>(['playbooks'], (prev) =>
        prev ? prev.map((p) => (p.id === id ? { ...p, active: next } : p)) : prev
      );
      try {
        await setPlaybookActive(id, next);
      } catch (err) {
        // Revert cache on failure
        queryClient.setQueryData<Playbook[]>(['playbooks'], (prev) =>
          prev ? prev.map((p) => (p.id === id ? { ...p, active: !next } : p)) : prev
        );
        addToast({
          variant: 'danger',
          title: 'Failed to update playbook status',
          description:
            err instanceof Error ? err.message : 'An unknown error occurred. Please try again.',
        });
        // re-throw so the toggle cell can revert its local state
        throw err;
      }
    },
    [queryClient, addToast]
  );

  // Run Now
  const handleRunNow = useCallback(
    async (id: number): Promise<void> => {
      try {
        const { executionId } = await executePlaybook(id);
        const steps = playbooks?.find((p) => p.id === id)?.steps ?? [];
        setActiveExecutionId(executionId);
        setSelectedPlaybookSteps(steps);
        setViewerOpen(true);
      } catch (err) {
        addToast({
          variant: 'danger',
          title: 'Failed to start playbook',
          description: err instanceof Error ? err.message : 'An unknown error occurred.',
        });
      }
    },
    [addToast, playbooks]
  );

  const handleCreatePlaybook = useCallback(() => {
    navigate('/response/playbooks/new');
  }, [navigate]);

  // ── Column Definitions ─────────────────────────────────────────────────────

  const columnDefs: ColDef<Playbook>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 180,
      sortable: true,
      cellRenderer: (params: { data: Playbook }) => (
        <button
          type="button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ha-primary)',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            textAlign: 'left',
          }}
          onClick={() => navigate(`/response/playbooks/${params.data.id}`)}
        >
          {params.data.name}
        </button>
      ),
    },
    {
      field: 'triggerType',
      headerName: 'Trigger Type',
      width: 160,
      sortable: false,
      cellRenderer: (params: { data: Playbook }) => triggerTypeBadge(params.data.triggerType),
    },
    {
      field: 'lastRunAt',
      headerName: 'Last Run',
      width: 170,
      sortable: false,
      cellRenderer: (params: { data: Playbook }) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatTimestamp(params.data.lastRunAt)}
        </span>
      ),
    },
    {
      field: 'lastRunStatus',
      headerName: 'Status',
      width: 130,
      sortable: false,
      cellRenderer: (params: { data: Playbook }) => statusBadge(params.data.lastRunStatus),
    },
    {
      field: 'runCount',
      headerName: 'Run Count',
      width: 110,
      sortable: true,
      cellRenderer: (params: { data: Playbook }) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{params.data.runCount}</span>
      ),
    },
    {
      field: 'active',
      headerName: 'Active',
      width: 110,
      sortable: false,
      cellRenderer: (params: { data: Playbook }) => (
        <ActiveToggleCell playbook={params.data} onToggle={handleToggle} />
      ),
    },
    {
      headerName: 'Actions',
      width: 170,
      sortable: false,
      filter: false,
      cellRenderer: (params: { data: Playbook }) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RunNowCell
            playbook={params.data}
            onRunNow={(id) => {
              void handleRunNow(id);
            }}
          />
          <button
            type="button"
            onClick={() => navigate(`/response/playbooks/${params.data.id}/edit`)}
            style={{
              padding: '2px 10px',
              background: 'transparent',
              color: 'var(--ha-text-secondary)',
              border: '1px solid var(--ha-border)',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 'var(--ha-text-xs)',
              fontWeight: 500,
            }}
          >
            Edit
          </button>
        </span>
      ),
    },
  ];

  // ── Access-denied state ────────────────────────────────────────────────────

  if (!hasAccess) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 56px)',
          flexDirection: 'column',
          gap: 16,
          padding: 24,
          background: 'var(--ha-background)',
        }}
        role="alert"
        aria-label="Access denied"
      >
        <EmptyState>
          <Lock size={40} style={{ opacity: 0.3, color: 'var(--ha-text-secondary)', marginBottom: 12 }} />
          <EmptyStateBody>
            You do not have permission to view playbooks. Contact your administrator.
          </EmptyStateBody>
        </EmptyState>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader
          title="Playbooks"
          actions={
            <HaButton variant="primary" onClick={handleCreatePlaybook}>
              Create Playbook
            </HaButton>
          }
        />
        <div style={{ padding: 24 }}>
          <Alert
            variant="danger"
            isInline
            title="Failed to load playbooks"
          >
            {error instanceof Error ? error.message : 'An unknown error occurred.'}
          </Alert>
        </div>
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader
          title="Playbooks"
          actions={
            <HaButton variant="primary" onClick={handleCreatePlaybook}>
              Create Playbook
            </HaButton>
          }
        />
        <div style={{ flex: 1, padding: 24 }}>
          <SiemDataGrid
            className="response-grid"
            columnDefs={columnDefs}
            rowData={[]}
            rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]}
            loading={true}
            height="calc(100vh - 200px)"
          />
        </div>
      </div>
    );
  }

  const rows = playbooks ?? [];

  // ── Empty state ────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <SiemPageHeader
          title="Playbooks"
          actions={
            <HaButton variant="primary" onClick={handleCreatePlaybook}>
              Create Playbook
            </HaButton>
          }
        />
        <HaEmptyState
          icon={<PlayCircle size={48} />}
          title="No playbooks defined"
          description="No playbooks defined. Create one to begin automating responses."
          action={
            <HaButton variant="primary" onClick={handleCreatePlaybook}>
              Create Playbook
            </HaButton>
          }
        />
      </div>
    );
  }

  // ── Normal state (data rows) ───────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <SiemPageHeader
        title="Playbooks"
        actions={
          <HaButton variant="primary" onClick={handleCreatePlaybook}>
            Create Playbook
          </HaButton>
        }
      />
      <div style={{ flex: 1, padding: '16px 24px', overflow: 'hidden' }}>
        <SiemDataGrid
          className="response-grid"
          columnDefs={columnDefs}
          rowData={rows}
          rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]}
          height="calc(100vh - 160px)"
          defaultColDef={{ sortable: false, filter: false, resizable: true }}
        />
      </div>

      <PlaybookExecutionViewer
        executionId={activeExecutionId}
        playbookSteps={selectedPlaybookSteps}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
