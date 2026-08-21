/**
 * RuleGenerationPage.tsx — Rule Generation admin page (Sprint 28, Tasks 5.3–5.7).
 *
 * Route: /admin/rule-generation (admin-guarded via AuthGuard ROLE_ADMIN)
 *
 * Structure:
 *   - Signal summary section (KPI chips + HaChart bar chart)  — Task 5.4
 *   - Pending queue table (sessions with status pending_review) → Task 5.5
 *   - RuleReviewDrawer (Monaco editor + actions)               → Tasks 5.6 / 5.7
 *
 * Task 5.7 wiring:
 *   - Approve: calls ruleGenerationService.approveSession, invalidates pending
 *     queue + summary queries, closes drawer, shows success toast.
 *   - Reject: calls ruleGenerationService.rejectSession, invalidates pending
 *     queue query, closes drawer, shows success toast.
 *   - Regenerate: calls ruleGenerationService.regenerateSession, opens the
 *     returned new session in the same drawer, shows success toast.
 *   - All error paths surface an error toast with the HTTP status.
 *
 * Invariants:
 *   - No `any` types
 *   - No hard-coded hex color literals — all colors via var(--ha-*) tokens
 *   - No `getFirst` calls
 *
 * Requirements: 5.1, 5.2, 5.3, 5.8, 6.5
 */

import { useCallback, useState } from 'react';

import { Skeleton } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef, RowClickedEvent } from 'ag-grid-community';
import type { EChartsOption } from 'echarts';

import { RuleReviewDrawer } from './RuleReviewDrawer';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { HaChart } from '@/components/ha-chart/HaChart';
import { SiemPageHeader } from '@/components/ha-page-header/SiemPageHeader';
import { LoadingState } from '@/components/loading-state/LoadingState';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { ruleGenerationService } from '@/services/ruleGeneration.service';
import type { RuleGenSessionDTO, SignalSummaryDTO } from '@/types/ruleGeneration.types';
import { RuleGenerationError } from '@/types/ruleGeneration.types';


// ---------------------------------------------------------------------------
// Query keys — stable references for invalidation after mutations.
// ---------------------------------------------------------------------------

const SIGNAL_SUMMARY_KEY = ['rule-generation', 'signal-summary'] as const;
const PENDING_QUEUE_KEY = ['rule-generation', 'pending-queue'] as const;

// ---------------------------------------------------------------------------
// Color helpers — accent color resolved at runtime from CSS custom property.
// Never a hex literal (Requirement 5.3 / 6.5).
// ---------------------------------------------------------------------------

function resolveIntelligenceColor(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--ha-intelligence')
    .trim();
}

function resolvePositiveColor(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--ha-positive')
    .trim();
}

function resolveBorderColor(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--ha-border')
    .trim();
}

function resolveTextSecondaryColor(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--ha-text-secondary')
    .trim();
}

// ---------------------------------------------------------------------------
// Chart builder
// ---------------------------------------------------------------------------

function buildChartOptions(summary: SignalSummaryDTO): EChartsOption {
  // Aggregate groups by dataType — each group in the DTO is a (dataType, signalType) pair
  const groupMap = new Map<string, { tp: number; fp: number }>();
  for (const g of summary.groups) {
    const key = g.dataType || 'unknown';
    const existing = groupMap.get(key) ?? { tp: 0, fp: 0 };
    if (g.signalType === 'TRUE_POSITIVE') {
      existing.tp += g.count;
    } else {
      existing.fp += g.count;
    }
    groupMap.set(key, existing);
  }

  const categories = Array.from(groupMap.keys());
  const tpData = categories.map((k) => groupMap.get(k)?.tp ?? 0);
  const fpData = categories.map((k) => groupMap.get(k)?.fp ?? 0);

  const accentColor = resolveIntelligenceColor();
  const borderColor = resolveBorderColor();
  const textSecondary = resolveTextSecondaryColor();

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: ['True Positive', 'False Positive'],
      textStyle: { color: textSecondary },
      top: 0,
    },
    grid: { top: 40, right: 20, bottom: 40, left: 50 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: borderColor } },
      axisLabel: { color: textSecondary, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: borderColor } },
      axisLabel: { color: textSecondary },
      splitLine: { lineStyle: { color: borderColor, type: 'dashed' } },
    },
    series: [
      {
        name: 'True Positive',
        type: 'bar',
        data: tpData,
        itemStyle: { color: accentColor },
      },
      {
        name: 'False Positive',
        type: 'bar',
        data: fpData,
        itemStyle: { color: resolvePositiveColor() },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Error message extraction helper
// ---------------------------------------------------------------------------

function extractErrorMessage(error: unknown): string {
  if (error instanceof RuleGenerationError) {
    return `Request failed (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * RuleGenerationPage — Admin page for reviewing AI-generated correlation rules.
 *
 * Top section: signal summary (KPI chips and bar chart)
 * Bottom section: pending queue table listing sessions awaiting review
 * Drawer: RuleReviewDrawer with approve / reject / regenerate mutations
 */
export function RuleGenerationPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();

  // ── Drawer state ────────────────────────────────────────────────────────────
  const [drawerSession, setDrawerSession] = useState<RuleGenSessionDTO | null>(null);

  const closeDrawer = useCallback(() => {
    setDrawerSession(null);
  }, []);

  // ── Signal summary query ────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = useQuery<SignalSummaryDTO>({
    queryKey: [...SIGNAL_SUMMARY_KEY],
    queryFn: () => ruleGenerationService.getSignalSummary(),
  });

  // ── Approve mutation ────────────────────────────────────────────────────────
  const approveMutation = useMutation<RuleGenSessionDTO, unknown, number>({
    mutationFn: (id: number) => ruleGenerationService.approveSession(id),
    onSuccess: (_data) => {
      addToast({ variant: 'success', title: 'Rule approved', description: 'YAML written to output directory.' });
      void queryClient.invalidateQueries({ queryKey: [...PENDING_QUEUE_KEY] });
      void queryClient.invalidateQueries({ queryKey: [...SIGNAL_SUMMARY_KEY] });
      closeDrawer();
    },
    onError: (error) => {
      addToast({ variant: 'danger', title: 'Approve failed', description: extractErrorMessage(error) });
    },
  });

  // ── Reject mutation ─────────────────────────────────────────────────────────
  const rejectMutation = useMutation<RuleGenSessionDTO, unknown, number>({
    mutationFn: (id: number) => ruleGenerationService.rejectSession(id),
    onSuccess: () => {
      addToast({ variant: 'success', title: 'Rule rejected' });
      void queryClient.invalidateQueries({ queryKey: [...PENDING_QUEUE_KEY] });
      closeDrawer();
    },
    onError: (error) => {
      addToast({ variant: 'danger', title: 'Reject failed', description: extractErrorMessage(error) });
    },
  });

  // ── Regenerate mutation ─────────────────────────────────────────────────────
  const regenerateMutation = useMutation<RuleGenSessionDTO, unknown, number>({
    mutationFn: (id: number) => {
      // The regenerate endpoint needs the current signalKey from the session
      const currentSession = drawerSession;
      if (!currentSession) {
        return Promise.reject(new Error('No session open for regeneration'));
      }
      return ruleGenerationService.regenerateSession(id, {
        signalKey: currentSession.signalKey,
        minCount: 3,
      });
    },
    onSuccess: (newSession) => {
      addToast({ variant: 'success', title: 'Rule regenerated', description: 'New suggestion loaded.' });
      // Open the new session in the same drawer
      setDrawerSession(newSession);
      void queryClient.invalidateQueries({ queryKey: [...PENDING_QUEUE_KEY] });
    },
    onError: (error) => {
      addToast({ variant: 'danger', title: 'Regenerate failed', description: extractErrorMessage(error) });
    },
  });

  // ── Mutation handlers passed to the drawer ──────────────────────────────────
  const handleApprove = useCallback(
    (id: number) => approveMutation.mutate(id),
    [approveMutation],
  );

  const handleReject = useCallback(
    (id: number) => rejectMutation.mutate(id),
    [rejectMutation],
  );

  const handleRegenerate = useCallback(
    (id: number) => regenerateMutation.mutate(id),
    [regenerateMutation],
  );

  const isActionPending =
    approveMutation.isPending || rejectMutation.isPending || regenerateMutation.isPending;

  return (
    <div
      className="ha-page rule-generation-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ha-background)',
      }}
    >
      <SiemPageHeader
        title="Rule Generation"
        description="Review AI-generated correlation rules based on analyst signal feedback."
        breadcrumbs={[
          { label: 'Admin' },
          { label: 'Rule Generation' },
        ]}
      />

      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Signal summary section — Task 5.4: KPI chips + HaChart bar chart */}
        <section
          className="rule-gen-summary"
          aria-label="Signal summary"
          style={{
            background: 'var(--ha-surface-primary)',
            border: '1px solid var(--ha-border)',
            borderRadius: 8,
            padding: 24,
          }}
        >
          {summaryLoading ? (
            <Skeleton screenreaderText="Loading signal summary" />
          ) : summary ? (
            <>
              {/* KPI chips */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <KpiChip label="Total Signals" value={summary.truePositiveTotal + summary.falsePositiveTotal} />
                <KpiChip label="True Positives" value={summary.truePositiveTotal} />
                <KpiChip label="False Positives" value={summary.falsePositiveTotal} />
              </div>

              {/* Bar chart */}
              <HaChart
                option={buildChartOptions(summary)}
                height={240}
                ariaLabel="Signal distribution bar chart — true positives vs false positives by data type"
              />
            </>
          ) : null}
        </section>

        {/* Pending queue table — Task 5.5: table of pending_review sessions */}
        <PendingQueueSection onRowActivate={(session) => setDrawerSession(session)} />
      </div>

      {/* RuleReviewDrawer — Tasks 5.6 + 5.7 */}
      <RuleReviewDrawer
        session={drawerSession}
        onClose={closeDrawer}
        onApprove={handleApprove}
        onReject={handleReject}
        onRegenerate={handleRegenerate}
        isActionPending={isActionPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI chip — small numeric badge for the summary section
// ---------------------------------------------------------------------------

interface KpiChipProps {
  label: string;
  value: number;
}

function KpiChip({ label, value }: KpiChipProps): JSX.Element {
  return (
    <div
      style={{
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 6,
        padding: '12px 16px',
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 'var(--ha-text-xs)', color: 'var(--ha-text-secondary)' }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--ha-text-lg)', fontWeight: 600, color: 'var(--ha-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PendingQueueSection — AG Grid table listing sessions awaiting review (Task 5.5)
// ---------------------------------------------------------------------------

/**
 * Extracts the `severity` value from a rule YAML string by matching the
 * top-level `severity:` key. Returns a display string or '—' on failure.
 */
function parseSeverityFromYaml(yaml: string | undefined): string {
  if (!yaml) return '—';
  const match = /^severity:\s*(.+)$/m.exec(yaml);
  return match ? match[1].trim() : '—';
}

/** Column definitions for the pending queue data grid. */
const PENDING_COLUMNS: ColDef[] = [
  {
    headerName: 'ID',
    field: 'id',
    width: 80,
    sortable: true,
  },
  {
    headerName: 'Rule Name',
    field: 'ruleName',
    flex: 1,
    minWidth: 200,
    sortable: true,
  },
  {
    headerName: 'Severity',
    colId: 'severity',
    width: 120,
    sortable: true,
    valueGetter: (params) =>
      parseSeverityFromYaml((params.data as RuleGenSessionDTO | undefined)?.ruleYaml),
  },
  {
    headerName: 'Created At',
    field: 'createdAt',
    width: 180,
    sortable: true,
    valueFormatter: (params) =>
      params.value ? new Date(params.value as string).toLocaleString() : '—',
  },
  {
    headerName: 'Actions',
    colId: 'actions',
    width: 100,
    sortable: false,
    cellRenderer: () => (
      <span style={{ color: 'var(--ha-primary)', cursor: 'pointer', fontSize: 13 }}>
        Review
      </span>
    ),
  },
];

interface PendingQueueSectionProps {
  onRowActivate: (session: RuleGenSessionDTO) => void;
}

/**
 * PendingQueueSection — fetches pending-review sessions via TanStack Query
 * and renders them in a SiemDataGrid. Row activation triggers the drawer.
 */
function PendingQueueSection({ onRowActivate }: PendingQueueSectionProps): JSX.Element {
  const {
    data: pendingSessions,
    isLoading,
    isError,
    error,
  } = useQuery<RuleGenSessionDTO[]>({
    queryKey: [...PENDING_QUEUE_KEY],
    queryFn: ruleGenerationService.getPendingSessions,
  });

  const handleRowClicked = useCallback(
    (event: RowClickedEvent) => {
      const session = event.data as RuleGenSessionDTO;
      onRowActivate(session);
    },
    [onRowActivate],
  );

  return (
    <section
      className="rule-gen-queue"
      aria-label="Pending queue"
      style={{
        flex: 1,
        background: 'var(--ha-surface-primary)',
        border: '1px solid var(--ha-border)',
        borderRadius: 8,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--ha-text-primary)',
        }}
      >
        Pending Review Queue
      </h3>

      {isLoading && <LoadingState />}
      {isError && (
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : 'Failed to load pending sessions'
          }
        />
      )}
      {!isLoading && !isError && pendingSessions?.length === 0 && (
        <EmptyState
          title="No pending sessions"
          description="Generate a rule suggestion from accumulated signals to see pending sessions here."
        />
      )}
      {!isLoading && !isError && pendingSessions && pendingSessions.length > 0 && (
        <div style={{ flex: 1, minHeight: 300 }}>
          <SiemDataGrid
            columnDefs={PENDING_COLUMNS}
            rowData={pendingSessions}
            rowHeight={36}
            paginationPageSize={10}
            onRowClicked={handleRowClicked}
            height="100%"
            getRowId={(params) =>
              String((params.data as RuleGenSessionDTO).id)
            }
            defaultColDef={{
              sortable: true,
              resizable: true,
              filter: false,
            }}
          />
        </div>
      )}
    </section>
  );
}
