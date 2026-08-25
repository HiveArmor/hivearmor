/**
 * PlaybookDetailPage — Phase 7 redesign
 * RESP-001/003/006: Tabbed workbench — Overview · Steps · History · Trigger · Settings · Audit
 * Live SSE execution stream via /api/ha-playbooks/{executionId}/stream?token=
 * Preview → Confirm → Execute pattern with blast-radius disclosure.
 * Approval-required gate for disruptive playbooks.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { EmptyState, EmptyStateBody } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  Edit3,
  Gauge,
  ListChecks,
  Play,
  RefreshCw,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShieldX,
  Timer,
  Zap,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { RESPONSE_GRID_ROW_HEIGHTS } from './response-grid-standard';
import { useRowDensity } from '@/hooks/useRowDensity';
import type {
  PlaybookListItem,
  PlaybookStreamEvent,
  PlaybookRunStatus,
  PlaybookPreviewResponse,
} from './response.types';
import {
  approvePlaybookExecution,
  cancelExecution,
  executePlaybookConfirmed,
  fetchPlaybookList,
  fixtureMode,
  openExecutionStream,
  previewPlaybookExecution,
  rejectPlaybookExecution,
} from './responsePlaybooks.service';

import { HaButton } from '@/components/ha-button/HaButton';
import { HaConfirmationModal } from '@/components/ha-confirmation-modal/HaConfirmationModal';
import { SiemDataGrid } from '@/components/siem-data-grid/SiemDataGrid';
import { formatAuthorityLabel } from '@/lib/roles';
import { StatusDock } from '@/components/status-dock/StatusDock';
import { useToastStore } from '@/components/toast-stack/toastStore';
import { useEpsStream } from '@/hooks/useEpsStream';
import {
  fetchPlaybook,
  fetchPlaybookAudit,
  fetchPlaybookExecutions,
  updatePlaybook,
} from '@/services/playbookService';
import { useAuthStore } from '@/store/auth.store';
import type { Playbook, PlaybookExecution } from '@/types/playbook';

import './PlaybookDetailPage.css';
import './response-grid-standard.css';

// Lazy-load Monaco editor — heavy, only needed in Trigger tab
const MonacoEditorView = lazy(() => import('./MonacoEditorView'));

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'steps' | 'history' | 'trigger' | 'settings' | 'audit';

const DETAIL_TAB_KEYS: TabKey[] = ['overview', 'steps', 'history', 'trigger', 'settings', 'audit'];

interface DetailTabDefinition {
  key: TabKey;
  title: React.ReactNode;
  content: React.ReactNode;
}

function DetailTabTitle({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
}): JSX.Element {
  return (
    <span className="detail-tab-title">
      <span className="detail-tab-title__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {count !== undefined && <span className="detail-tab-title__count">{count}</span>}
    </span>
  );
}

function DetailTabs({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: DetailTabDefinition[];
  activeKey: TabKey;
  onSelect: (key: TabKey) => void;
}): JSX.Element {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const tabButtons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
    const currentIndex = tabButtons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabButtons.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    tabButtons[nextIndex]?.focus();
  };

  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  return (
    <div className="detail-tabs-layout" data-testid="ha-tabs">
      <div className="detail-tabs" data-testid="ha-tabs-nav">
        <div
          className="detail-tabs__list"
          role="tablist"
          aria-label="Playbook sections"
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
            const selected = tab.key === activeTab.key;
            return (
              <button
                key={tab.key}
                id={`playbook-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`playbook-panel-${tab.key}`}
                tabIndex={selected ? 0 : -1}
                className="detail-tabs__button"
                data-testid={`tab-btn-${tab.key}`}
                data-active={selected ? 'true' : 'false'}
                onClick={() => onSelect(tab.key)}
              >
                {tab.title}
              </button>
            );
          })}
        </div>
      </div>
      <div
        id={`playbook-panel-${activeTab.key}`}
        className="detail-tabs__panel"
        role="tabpanel"
        aria-labelledby={`playbook-tab-${activeTab.key}`}
        tabIndex={0}
        data-testid="ha-tabs-content"
      >
        {activeTab.content}
      </div>
    </div>
  );
}

interface StreamState {
  executionId: string | null;
  status: PlaybookRunStatus | null;
  events: PlaybookStreamEvent[];
  stepsCompleted: number;
  stepsFailed: number;
  errorMessage: string | null;
  summary?: {
    status: PlaybookRunStatus;
    totalDurationMs: number;
    stepsCompleted: number;
    stepsFailed: number;
    stepsSkipped: number;
  };
}

interface LegacyPlaybookStreamPayload {
  type?: string;
  stepIndex?: number | null;
  stepLabel?: string | null;
  output?: unknown;
  errorMessage?: string | null;
  timestamp?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function RunStatusBadge({ status }: { status: PlaybookRunStatus | string | null }): JSX.Element {
  if (!status) return <span className="detail-muted">—</span>;
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    success: { color: 'var(--ha-severity-low)', icon: <CheckCircle2 size={11} /> },
    failure: { color: 'var(--ha-severity-critical)', icon: <ShieldX size={11} /> },
    failed: { color: 'var(--ha-severity-critical)', icon: <ShieldX size={11} /> },
    running: { color: 'var(--ha-action-primary)', icon: <Activity size={11} className="detail-spin" /> },
    cancelled: { color: 'var(--ha-text-secondary)', icon: <CircleSlash2 size={11} /> },
    awaiting_approval: { color: 'var(--ha-severity-high)', icon: <Clock3 size={11} /> },
  };
  const c = config[status] ?? { color: 'var(--ha-text-secondary)', icon: null };
  const label = status.replace(/_/g, ' ');
  return (
    <span className="detail-run-badge" style={{ '--rc': c.color } as React.CSSProperties}>
      {c.icon}
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

function TriggerTypeChip({ trigger }: { trigger: string }): JSX.Element {
  const iconMap: Record<string, React.ReactNode> = {
    AUTOMATIC: <Zap size={11} />, MANUAL: <ListChecks size={11} />, SCHEDULED: <Timer size={11} />,
  };
  return (
    <span className="detail-trigger-chip">
      {trigger && iconMap[trigger]}
      {trigger ? trigger.charAt(0) + trigger.slice(1).toLowerCase() : null}
    </span>
  );
}

const SENSITIVE_CONFIG_KEY = /secret|token|password|credential|api[-_]?key|private[-_]?key/i;

function formatStepConfigValue(key: string, value: unknown): string {
  if (SENSITIVE_CONFIG_KEY.test(key)) return '••••••••';
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const visible = value.slice(0, 3).map((item) => String(item));
    return `${visible.join(', ')}${value.length > visible.length ? ` +${value.length - visible.length}` : ''}`;
  }
  return 'Configured object';
}

function getStepRisk(label: string): 'high' | 'medium' | 'low' {
  if (/isolate|disable|block|terminate|delete|revoke|quarantine/i.test(label)) return 'high';
  if (/notify|lookup|enrich|collect|create ticket/i.test(label)) return 'low';
  return 'medium';
}

function normalizeLegacyStreamEvent(
  payload: LegacyPlaybookStreamPayload,
  eventName: string,
  executionId: string
): PlaybookStreamEvent | null {
  const type = eventName || payload.type || '';
  const timestamp = payload.timestamp ?? new Date().toISOString();
  const stepOrder = (payload.stepIndex ?? 0) + 1;

  if (type === 'step_started' || type === 'step_completed' || type === 'step_failed') {
    const eventType = type === 'step_started'
      ? 'STEP_STARTED'
      : type === 'step_completed'
        ? 'STEP_COMPLETED'
        : 'STEP_FAILED';
    const status = type === 'step_started' ? 'running' : type === 'step_completed' ? 'success' : 'failed';
    return {
      eventType,
      executionId,
      timestamp,
      step: {
        stepOrder,
        actionName: payload.stepLabel || `Step ${stepOrder}`,
        status,
        resultSummary: type === 'step_completed' ? 'Completed' : undefined,
        errorMessage: payload.errorMessage ?? undefined,
      },
    };
  }

  if (type === 'playbook_completed' || type === 'playbook_failed') {
    const failed = type === 'playbook_failed';
    return {
      eventType: failed ? 'EXECUTION_FAILED' : 'EXECUTION_COMPLETED',
      executionId,
      timestamp,
      summary: {
        status: failed ? 'failure' : 'success',
        totalDurationMs: 0,
        stepsCompleted: 0,
        stepsFailed: failed ? 1 : 0,
        stepsSkipped: 0,
      },
    };
  }

  if (type === 'approval_required') {
    return {
      eventType: 'APPROVAL_REQUIRED',
      executionId,
      timestamp,
      step: {
        stepOrder,
        actionName: payload.stepLabel || 'Approval required',
        status: 'running',
        resultSummary: 'Awaiting Platform Administrator approval',
      },
    };
  }

  return null;
}

// ─── Step event row ───────────────────────────────────────────────────────────

function StreamEventRow({ event }: { event: PlaybookStreamEvent }): JSX.Element {
  const step = event.step;
  if (!step) return <></>;
  const statusColor: Record<string, string> = {
    running: 'var(--ha-action-primary)',
    success: 'var(--ha-severity-low)',
    failed: 'var(--ha-severity-critical)',
    skipped: 'var(--ha-text-secondary)',
  };
  const color = statusColor[step.status] ?? 'var(--ha-text-secondary)';
  return (
    <div className="detail-stream-event">
      <span className="detail-stream-event__num">{step.stepOrder}</span>
      <span className="detail-stream-event__icon" style={{ color }}>
        {step.status === 'running' && <Activity size={12} className="detail-spin" />}
        {step.status === 'success' && <CheckCircle2 size={12} />}
        {step.status === 'failed' && <ShieldX size={12} />}
        {step.status === 'skipped' && <CircleSlash2 size={12} />}
      </span>
      <span className="detail-stream-event__name">{step.actionName}</span>
      {step.resultSummary && (
        <span className="detail-stream-event__summary">{step.resultSummary}</span>
      )}
      {step.errorMessage && (
        <span className="detail-stream-event__error">{step.errorMessage}</span>
      )}
      {step.durationMs !== undefined && (
        <span className="detail-stream-event__duration">{formatDuration(step.durationMs)}</span>
      )}
    </div>
  );
}

// ─── Blast radius panel ───────────────────────────────────────────────────────

function BlastRadiusPanel({ playbook }: { playbook: PlaybookListItem }): JSX.Element | null {
  if (!playbook.approvalRequired) return null;
  return (
    <div className="detail-blast-radius" role="region" aria-label="Blast radius and approval information">
      <div className="detail-blast-radius__header">
        <AlertTriangle size={14} />
        Disruptive action — approval required
      </div>
      <p className="detail-blast-radius__desc">
        This playbook performs actions that affect production systems. An authorized SOC Manager
        must approve each execution before it proceeds. Review the step list to understand the
        scope before requesting a run.
      </p>
      <div className="detail-blast-radius__row">
        <span className="detail-blast-radius__label">Risk level</span>
        <span className="detail-blast-radius__value" style={{ color: 'var(--ha-severity-critical)' }}>High</span>
      </div>
      <div className="detail-blast-radius__row">
        <span className="detail-blast-radius__label">Required permission</span>
        <span className="detail-blast-radius__value">{formatAuthorityLabel('ROLE_SOC_MANAGER')}</span>
      </div>
      <div className="detail-blast-radius__row">
        <span className="detail-blast-radius__label">Rollback available</span>
        <span className="detail-blast-radius__value">
          <ShieldCheck size={12} style={{ color: 'var(--ha-severity-low)' }} />
          Yes — run the matching release/restore playbook
        </span>
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ playbook, listItem }: { playbook: Playbook; listItem: PlaybookListItem | undefined }): JSX.Element {
  const status = listItem?.status ?? (playbook.active ? 'ACTIVE' : 'INACTIVE');

  return (
    <div className="detail-tab-body">
      <div className="detail-meta-grid">
        <div className="detail-meta-item">
          <span className="detail-meta-label">Status</span>
          <span className="detail-meta-value">
            <span
              className={`detail-status-pill detail-status-pill--${status.toLowerCase()}`}
              data-testid="page-header-badge"
            >
              {status === 'ACTIVE' && <span className="detail-status-dot" />}
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </span>
          </span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Trigger</span>
          <span className="detail-meta-value">
            <TriggerTypeChip trigger={playbook.triggerType ?? 'MANUAL'} />
          </span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Total runs</span>
          <span className="detail-meta-value detail-mono">{(playbook.runCount ?? 0).toLocaleString()}</span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Last run</span>
          <span className="detail-meta-value detail-mono" title={playbook.lastRunAt ?? ''}>
            {formatRelativeTime(playbook.lastRunAt)}
          </span>
        </div>
        <div className="detail-meta-item">
          <span className="detail-meta-label">Last result</span>
          <span className="detail-meta-value">
            <RunStatusBadge status={playbook.lastRunStatus ?? null} />
          </span>
        </div>
        {listItem && (
          <div className="detail-meta-item">
            <span className="detail-meta-label">Author</span>
            <span className="detail-meta-value">{listItem.createdBy}</span>
          </div>
        )}
      </div>

      {playbook.description && (
        <div className="detail-description">
          <h3 className="detail-section-title">Description</h3>
          <p data-testid="page-header-description">{playbook.description}</p>
        </div>
      )}

      {listItem && <BlastRadiusPanel playbook={listItem} />}
    </div>
  );
}

// ─── Steps tab ────────────────────────────────────────────────────────────────

function StepsTab({ playbook }: { playbook: Playbook }): JSX.Element {
  const steps = playbook.steps ?? [];

  if (steps.length === 0) {
    return (
      <div className="detail-tab-body">
        <div className="detail-empty-inline">No steps defined. Open the builder to add actions.</div>
      </div>
    );
  }

  return (
    <div className="detail-tab-body">
      <ol className="detail-step-list">
        {steps.map((step, idx) => (
          <li key={step.stepIndex ?? idx} className="detail-step">
            <span className="detail-step__num">{idx + 1}</span>
            <div className="detail-step__body">
              <div className="detail-step__heading">
                <span className="detail-step__label">{step.label}</span>
                <span className={`detail-step__risk detail-step__risk--${getStepRisk(step.label)}`}>
                  {getStepRisk(step.label)} impact
                </span>
              </div>
              <span className="detail-step__type">{step.stepType} · step {idx + 1} of {steps.length}</span>
              {step.config && Object.keys(step.config).length > 0 && (
                <div className="detail-step__config">
                  {Object.entries(step.config).map(([k, v]) => (
                    <span key={k} className="detail-step__config-item">
                      <span className="detail-step__config-key">{k}:</span>
                      <span className="detail-step__config-val">{formatStepConfigValue(k, v)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function OperationalRail({
  playbook,
  listItem,
  onOpenHistory,
  onOpenApprovals,
}: {
  playbook: Playbook;
  listItem: PlaybookListItem | undefined;
  onOpenHistory: () => void;
  onOpenApprovals: () => void;
}): JSX.Element {
  const isActive = listItem?.status === 'ACTIVE';
  const stepCount = playbook.steps?.length ?? 0;
  const disruptiveSteps = (playbook.steps ?? []).filter((step) => getStepRisk(step.label) === 'high').length;

  return (
    <aside className="detail-operations" aria-label="Playbook execution readiness">
      <div className="detail-operations__header">
        <div>
          <span className="detail-operations__eyebrow">Execution readiness</span>
          <h2>{isActive && stepCount > 0 ? 'Ready for governed preview' : 'Action required'}</h2>
        </div>
        {isActive && stepCount > 0
          ? <CheckCircle2 size={18} className="detail-operations__ready" />
          : <AlertTriangle size={18} className="detail-operations__warning" />}
      </div>

      <div className="detail-readiness-list">
        <div className="detail-readiness-row">
          <span>Definition</span>
          <strong>{stepCount > 0 ? `${stepCount} ordered steps` : 'No steps'}</strong>
        </div>
        <div className="detail-readiness-row">
          <span>Trigger</span>
          <strong>{listItem?.triggerType ?? playbook.triggerType}</strong>
        </div>
        <div className="detail-readiness-row">
          <span>High-impact actions</span>
          <strong className={disruptiveSteps > 0 ? 'detail-readiness-row__warning' : undefined}>
            {disruptiveSteps}
          </strong>
        </div>
        <div className="detail-readiness-row">
          <span>Approval policy</span>
          <strong>{listItem?.approvalRequired ? 'Human approval required' : 'Standard policy'}</strong>
        </div>
        <div className="detail-readiness-row">
          <span>Connector health</span>
          <strong>Validated during preview</strong>
        </div>
      </div>

      <div className="detail-safety-note">
        <ShieldCheck size={14} />
        <p>
          Run now begins with a side-effect-free target, permission, connector, and rollback preview.
          No action executes from this screen without that validation.
        </p>
      </div>

      <section className="detail-last-run" aria-label="Last execution">
        <div className="detail-last-run__title">Last execution</div>
        <div className="detail-last-run__result">
          <RunStatusBadge status={playbook.lastRunStatus} />
          <span className="detail-mono">{formatRelativeTime(playbook.lastRunAt)}</span>
        </div>
        <div className="detail-last-run__meta">
          {playbook.runCount.toLocaleString()} lifetime runs · progressive trace on demand
        </div>
      </section>

      <div className="detail-operations__actions">
        <button type="button" onClick={onOpenHistory}>View execution history</button>
        <button type="button" onClick={onOpenApprovals}>Review approvals</button>
      </div>
    </aside>
  );
}

// ─── Execution history tab ────────────────────────────────────────────────────

function HistoryTab({ playbookId }: { playbookId: number }): JSX.Element {
  const [density] = useRowDensity();
  const { data: executions, isLoading, isError, refetch } = useQuery({
    queryKey: ['playbook-executions', playbookId],
    queryFn: () => fetchPlaybookExecutions(playbookId),
    staleTime: 30_000,
  });

  const colDefs: ColDef<PlaybookExecution>[] = [
    {
      field: 'startedAt',
      headerName: 'Started',
      width: 160,
      cellRenderer: ({ data }: { data: PlaybookExecution }) => (
        <span className="detail-mono" title={data.startedAt}>
          {new Date(data.startedAt).toLocaleString()}
        </span>
      ),
    },
    {
      field: 'status',
      headerName: 'Result',
      width: 130,
      cellRenderer: ({ data }: { data: PlaybookExecution }) => <RunStatusBadge status={data.status} />,
    },
    {
      field: 'durationSeconds',
      headerName: 'Duration',
      width: 100,
      cellRenderer: ({ data }: { data: PlaybookExecution }) => (
        <span className="detail-mono">{formatDuration((data.durationSeconds ?? null) !== null ? (data.durationSeconds ?? 0) * 1000 : null)}</span>
      ),
    },
    {
      field: 'triggeredBy',
      headerName: 'Triggered by',
      flex: 1,
      minWidth: 140,
    },
  ];

  if (isLoading) {
    return <div className="detail-tab-body"><div className="detail-loading">Loading history…</div></div>;
  }
  if (isError) {
    return (
      <div className="detail-tab-body">
        <div className="detail-inline-state" role="alert">
          <AlertTriangle size={18} />
          <div><strong>Execution history unavailable</strong><span>The bounded history projection could not be loaded.</span></div>
          <button type="button" onClick={() => void refetch()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!executions?.length) {
    return <div className="detail-tab-body"><div className="detail-empty-inline">No executions recorded yet.</div></div>;
  }

  return (
    <div className="detail-tab-body detail-tab-body--grid">
      <SiemDataGrid
        className="response-grid detail-grid"
        columnDefs={colDefs}
        rowData={executions}
        rowHeight={RESPONSE_GRID_ROW_HEIGHTS[density]}
        height="100%"
        getRowId={(p) => String((p.data as PlaybookExecution).executionId)}
      />
    </div>
  );
}

// ─── Trigger config tab ───────────────────────────────────────────────────────

function TriggerConfigTab({ playbook }: { playbook: Playbook }): JSX.Element {
  const yamlContent = [
    `# Playbook trigger configuration`,
    `# Playbook: ${playbook.name}`,
    `# Trigger type: ${playbook.triggerType ?? 'MANUAL'}`,
    ``,
    `trigger:`,
    `  type: ${(playbook.triggerType ?? 'MANUAL').toLowerCase()}`,
    (playbook.triggerType === 'alert-triggered') ? [
      `  filter:`,
      `    severity: ">= 3"`,
      `    dataType: "any"`,
    ].join('\n') : '',
    (playbook.triggerType === 'scheduled') ? [
      `  schedule:`,
      `    cron: "0 */4 * * *"`,
      `    timezone: "UTC"`,
    ].join('\n') : '',
  ].filter(Boolean).join('\n');

  return (
    <div className="detail-tab-body">
      <Suspense fallback={<div className="detail-loading">Loading editor…</div>}>
        <MonacoEditorView value={yamlContent} language="yaml" readOnly />
      </Suspense>
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  playbook,
  onSaved,
}: {
  playbook: Playbook;
  onSaved: () => void;
}): JSX.Element {
  const { addToast } = useToastStore();

  const [name, setName] = useState(playbook.name);
  const [description, setDescription] = useState(playbook.description ?? '');

  const saveMutation = useMutation({
    mutationFn: async (formData: { name: string; description: string }) => {
      return updatePlaybook(playbook.id, formData);
    },
    onSuccess: () => {
      addToast({ title: 'Settings saved', variant: 'success' });
      onSaved();
    },
    onError: () => {
      addToast({ title: 'Save failed', description: 'Could not update playbook settings', variant: 'danger' });
    },
  });

  const isDirty = name !== playbook.name || description !== (playbook.description ?? '');

  return (
    <div className="detail-tab-body">
      <div className="detail-settings-form">
        <label className="detail-field" htmlFor="settings-name">
          <span className="detail-field__label">Name</span>
          <input
            id="settings-name"
            className="detail-field__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="detail-field">
          <span className="detail-field__label">Description</span>
          <textarea
            className="detail-field__input detail-field__input--textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </label>
        <div className="detail-settings-actions">
          <HaButton
            variant="plain"
            onClick={() => { setName(playbook.name); setDescription(playbook.description ?? ''); }}
            isDisabled={!isDirty || saveMutation.isPending}
          >
            Reset
          </HaButton>
          <HaButton
            variant="primary"
            onClick={() => saveMutation.mutate({ name: name.trim(), description: description.trim() })}
            isDisabled={saveMutation.isPending || !name.trim() || !isDirty}
            isLoading={saveMutation.isPending}
          >
            Save changes
          </HaButton>
        </div>
      </div>
    </div>
  );
}

// ─── Audit tab ────────────────────────────────────────────────────────────────

function AuditTab({ playbookId }: { playbookId: number }): JSX.Element {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['playbook-audit', playbookId],
    queryFn: () => fetchPlaybookAudit(playbookId),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="detail-tab-body"><div className="detail-loading">Loading audit trail…</div></div>;
  if (isError) {
    return (
      <div className="detail-tab-body">
        <div className="detail-inline-state" role="alert">
          <AlertTriangle size={18} />
          <div><strong>Audit trail unavailable</strong><span>No local substitute was inferred. Retry the authorized playbook audit projection.</span></div>
          <button type="button" onClick={() => void refetch()}>Retry</button>
        </div>
      </div>
    );
  }
  if (!data?.items.length) return <div className="detail-tab-body"><div className="detail-empty-inline">No audit events recorded.</div></div>;

  return (
    <div className="detail-tab-body">
      <div className="detail-audit-summary">
        <span>Immutable audit trail</span>
        <span className="detail-mono">{data.total} event{data.total === 1 ? '' : 's'} · newest first</span>
      </div>
      <ol className="detail-audit-list">
        {data.items.map((entry) => (
          <li key={entry.id} className="detail-audit-entry">
            <span className="detail-audit-marker" aria-hidden="true"><ScrollText size={13} /></span>
            <span className="detail-audit-time detail-mono">{new Date(entry.occurredAt).toLocaleString()}</span>
            <span className="detail-audit-action">{entry.action.toLowerCase().replace('_', ' ')}</span>
            <span className="detail-audit-by">{entry.actor}<small>{entry.actorRole}</small></span>
            <span className="detail-audit-detail">{entry.summary}</span>
            <span className="detail-audit-version detail-mono">v{entry.version}</span>
          </li>
        ))}
      </ol>
      {data.hasMore && (
        <div className="detail-audit-more">More events are available through the bounded audit cursor.</div>
      )}
    </div>
  );
}

// ─── Execution stream viewer ──────────────────────────────────────────────────

/** Presentational approval actions — exported for focused Vitest coverage. */
export function PlaybookExecutionApprovalActions({
  canApprove,
  isPending,
  onApprove,
  onReject,
}: {
  canApprove: boolean;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  if (!canApprove) {
    return (
      <div className="detail-stream-approval" role="status" data-testid="playbook-approval-denied">
        <Clock3 size={13} aria-hidden="true" />
        <span>
          Execution paused for approval. Required permission: Platform Administrator.
        </span>
      </div>
    );
  }

  return (
    <div className="detail-stream-approval" role="group" aria-label="Playbook approval actions" data-testid="playbook-approval-actions">
      <Clock3 size={13} aria-hidden="true" />
      <span>Execution paused — approve to resume or reject to fail this run.</span>
      <div className="detail-stream-approval__actions">
        <HaButton
          variant="primary"
          isDisabled={isPending}
          isLoading={isPending}
          onClick={onApprove}
          data-testid="playbook-approve-btn"
          style={{ minWidth: 'unset', padding: '4px 12px', fontSize: 'var(--ha-text-xs)' }}
        >
          Approve
        </HaButton>
        <HaButton
          variant="danger"
          isDisabled={isPending}
          onClick={onReject}
          data-testid="playbook-reject-btn"
          style={{ minWidth: 'unset', padding: '4px 12px', fontSize: 'var(--ha-text-xs)' }}
        >
          Reject
        </HaButton>
      </div>
    </div>
  );
}

function ExecutionStreamViewer({
  stream,
  onCancel,
  canApprove,
  isDecisionPending,
  onApprove,
  onReject,
}: {
  stream: StreamState;
  onCancel: () => void;
  canApprove: boolean;
  isDecisionPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [stream.events.length]);

  const isActive = stream.status === 'running';
  const isAwaitingApproval = stream.status === 'awaiting_approval';
  const isComplete = stream.status === 'success' || stream.status === 'failure' || stream.status === 'cancelled';
  const statusLabel = stream.status
    ? stream.status === 'awaiting_approval'
      ? 'Awaiting approval'
      : stream.status.charAt(0).toUpperCase() + stream.status.slice(1).replace(/_/g, ' ')
    : 'Queued';

  return (
    <div className="detail-stream-viewer" role="region" aria-label="Live execution stream" aria-live="polite">
      <div className="detail-stream-header">
        <span className="detail-stream-title">
          {isActive && <Activity size={13} className="detail-spin" />}
          {stream.status === 'success' && <CheckCircle2 size={13} style={{ color: 'var(--ha-severity-low)' }} />}
          {stream.status === 'failure' && <ShieldX size={13} style={{ color: 'var(--ha-severity-critical)' }} />}
          {isAwaitingApproval && <Clock3 size={13} style={{ color: 'var(--ha-severity-high)' }} />}
          {isActive ? 'Executing…' : statusLabel}
        </span>
        {stream.executionId && (
          <span className="detail-stream-id detail-mono">{stream.executionId}</span>
        )}
        {isActive && (
          <HaButton
            variant="plain"
            onClick={onCancel}
            style={{ minWidth: 'unset', padding: '2px 8px', fontSize: 'var(--ha-text-xs)' }}
          >
            Cancel
          </HaButton>
        )}
      </div>

      {isAwaitingApproval && (
        <PlaybookExecutionApprovalActions
          canApprove={canApprove}
          isPending={isDecisionPending}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}

      <div className="detail-stream-body" ref={bodyRef}>
        {stream.events.filter((e) => e.step).map((event) => (
          <StreamEventRow key={`${event.executionId}-${event.step?.stepOrder}-${event.eventType}`} event={event} />
        ))}
        {stream.events.length === 0 && (
          <div className="detail-stream-waiting">
            <RefreshCw size={14} className="detail-spin" />
            Waiting for first step…
          </div>
        )}
      </div>

      {isComplete && stream.summary && (
        <div className="detail-stream-summary">
          <span>{stream.summary.stepsCompleted} completed</span>
          {stream.summary.stepsFailed > 0 && <span style={{ color: 'var(--ha-severity-critical)' }}>{stream.summary.stepsFailed} failed</span>}
          {stream.summary.stepsSkipped > 0 && <span className="detail-muted">{stream.summary.stepsSkipped} skipped</span>}
          <span className="detail-muted">{formatDuration(stream.summary.totalDurationMs)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PlaybookDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const epsStream = useEpsStream();
  const user = useAuthStore((s) => s.user);

  const numericId = id ? Number(id) : NaN;
  const hasAdminRole = user?.roles?.includes('ROLE_ADMIN') ?? false;
  /** Backend preview/execute/status are ROLE_ADMIN-only. */
  const canMutate = hasAdminRole;
  /** Backend approve/reject endpoints are ROLE_ADMIN-only. */
  const canApproveExecution = hasAdminRole;

  const requestedTab = searchParams.get('tab');
  const initialTab = DETAIL_TAB_KEYS.includes(requestedTab as TabKey) ? requestedTab as TabKey : 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [runConfirmOpen, setRunConfirmOpen] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [executionPreview, setExecutionPreview] = useState<PlaybookPreviewResponse | null>(null);
  const [stream, setStream] = useState<StreamState | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const autoPreviewRequested = useRef(false);

  useEffect(() => {
    const urlTab = DETAIL_TAB_KEYS.includes(requestedTab as TabKey) ? requestedTab as TabKey : 'overview';
    setActiveTab(urlTab);
  }, [requestedTab]);

  const handleTabSelect = useCallback((key: TabKey) => {
    setActiveTab(key);
    const nextParams = new URLSearchParams(searchParams);
    if (key === 'overview') nextParams.delete('tab');
    else nextParams.set('tab', key);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // ─── Playbook detail ───────────────────────────────────────────────────────

  const { data: playbook, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['playbook', numericId],
    queryFn: () => fetchPlaybook(numericId),
    enabled: Number.isFinite(numericId),
    staleTime: 30_000,
  });

  // ─── List item (for status/category/approvalRequired) ─────────────────────

  const { data: listResult } = useQuery({
    queryKey: ['resp-playbooks', { size: 1, cursor: undefined }],
    queryFn: () => fetchPlaybookList({ size: 100 }),
    staleTime: 60_000,
    select: (res) => res.items.find((pb) => pb.id === String(numericId)),
  });

  // ─── Execute mutation ──────────────────────────────────────────────────────

  const previewMutation = useMutation({
    mutationFn: () => previewPlaybookExecution({ playbookId: String(numericId), triggerContext: { entityType: 'MANUAL', entityId: null }, inputs: {} }),
    onSuccess: (preview) => {
      setExecutionPreview(preview);
      setRunConfirmOpen(true);
    },
    onError: () => addToast({ title: 'Preview unavailable', description: 'HiveArmor could not validate scope and blast radius. Nothing was executed.', variant: 'danger' }),
  });

  const executeMutation = useMutation({
    mutationFn: () =>
      executePlaybookConfirmed({
        previewToken: executionPreview?.previewToken ?? '',
        playbookId: String(numericId),
        triggerContext: { entityType: 'MANUAL', entityId: null },
        inputs: {},
      }),
    onSuccess: (res) => {
      setRunConfirmOpen(false);
      setExecutionPreview(null);
      startStream(res.executionId);
      void queryClient.invalidateQueries({ queryKey: ['resp-playbook-metrics'] });
    },
    onError: () => {
      addToast({ title: 'Execution failed', description: 'Could not start playbook', variant: 'danger' });
    },
  });

  useEffect(() => {
    if (searchParams.get('run') !== '1' || autoPreviewRequested.current || !playbook) return;
    autoPreviewRequested.current = true;
    previewMutation.mutate();
  }, [playbook, previewMutation, searchParams]);

  // ─── SSE streaming ─────────────────────────────────────────────────────────

  const startStream = useCallback((executionId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setStream({
      executionId,
      status: 'running',
      events: [],
      stepsCompleted: 0,
      stepsFailed: 0,
      errorMessage: null,
    });

    const es = openExecutionStream(executionId);
    eventSourceRef.current = es;

    const handleStreamMessage = (e: MessageEvent, eventName = '') => {
      try {
        const payload = JSON.parse(e.data) as PlaybookStreamEvent | LegacyPlaybookStreamPayload;
        const event = 'eventType' in payload && payload.eventType
          ? payload as PlaybookStreamEvent
          : normalizeLegacyStreamEvent(payload as LegacyPlaybookStreamPayload, eventName, executionId);
        if (!event) return;
        setStream((prev) => {
          if (!prev) return prev;
          const updatedEvents = [...prev.events, event];
          let newStatus: PlaybookRunStatus = prev.status ?? 'running';
          let stepsCompleted = prev.stepsCompleted;
          let stepsFailed = prev.stepsFailed;
          if (event.eventType === 'STEP_COMPLETED') stepsCompleted += 1;
          if (event.eventType === 'STEP_FAILED') stepsFailed += 1;
          let nextSummary = prev.summary;
          if (event.eventType === 'EXECUTION_COMPLETED') {
            newStatus = event.summary?.status ?? 'success';
            nextSummary = event.summary
              ? {
                  ...event.summary,
                  stepsCompleted: event.summary.stepsCompleted || stepsCompleted,
                  stepsFailed: event.summary.stepsFailed || stepsFailed,
                }
              : undefined;
          } else if (event.eventType === 'EXECUTION_FAILED') {
            newStatus = 'failure';
            nextSummary = event.summary ?? {
              status: 'failure', totalDurationMs: 0, stepsCompleted, stepsFailed, stepsSkipped: 0,
            };
          } else if (event.eventType === 'EXECUTION_CANCELLED') {
            newStatus = 'cancelled';
          } else if (event.eventType === 'APPROVAL_REQUIRED') {
            newStatus = 'awaiting_approval';
          }
          return {
            ...prev,
            events: updatedEvents,
            status: newStatus,
            stepsCompleted,
            stepsFailed,
            summary: nextSummary,
          };
        });
        if (['EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED'].includes(event.eventType)) {
          es.close();
          eventSourceRef.current = null;
          void queryClient.invalidateQueries({ queryKey: ['playbook', numericId] });
          void queryClient.invalidateQueries({ queryKey: ['playbook-executions', numericId] });
          void queryClient.invalidateQueries({ queryKey: ['resp-playbook-metrics'] });
        }
      } catch {
        // ignore malformed events
      }
    };

    es.addEventListener('message', handleStreamMessage);
    ['step_started', 'step_completed', 'step_failed', 'playbook_completed', 'playbook_failed', 'approval_required']
      .forEach((eventName) => {
        es.addEventListener(eventName, (event) => handleStreamMessage(event as MessageEvent, eventName));
      });

    es.onerror = () => {
      setStream((prev) => prev ? { ...prev, status: 'failure', errorMessage: 'Stream disconnected' } : prev);
      es.close();
      eventSourceRef.current = null;
    };
  }, [numericId, queryClient]);

  const handleCancelStream = useCallback(() => {
    if (stream?.executionId) {
      void cancelExecution(stream.executionId);
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStream(null);
  }, [stream]);

  const approvalMutation = useMutation({
    mutationFn: async (decision: 'APPROVED' | 'REJECTED') => {
      const executionId = stream?.executionId;
      if (!executionId) {
        throw new Error('No execution awaiting approval');
      }
      if (decision === 'APPROVED') {
        return approvePlaybookExecution(executionId);
      }
      return rejectPlaybookExecution(executionId);
    },
    onSuccess: (_result, decision) => {
      setRejectConfirmOpen(false);
      if (decision === 'APPROVED') {
        setStream((prev) => (prev ? { ...prev, status: 'running' } : prev));
        addToast({
          title: 'Playbook approved',
          description: 'Execution resumed after Platform Administrator approval.',
          variant: 'success',
        });
      } else {
        setStream((prev) =>
          prev
            ? {
                ...prev,
                status: 'failure',
                summary: {
                  status: 'failure',
                  totalDurationMs: 0,
                  stepsCompleted: prev.stepsCompleted,
                  stepsFailed: prev.stepsFailed + 1,
                  stepsSkipped: 0,
                },
              }
            : prev
        );
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        addToast({
          title: 'Playbook rejected',
          description: 'Execution failed after rejection.',
          variant: 'warning',
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['playbook', numericId] });
      void queryClient.invalidateQueries({ queryKey: ['playbook-executions', numericId] });
      void queryClient.invalidateQueries({ queryKey: ['resp-playbook-metrics'] });
    },
    onError: () => {
      addToast({
        title: 'Approval decision failed',
        description: 'Could not apply the approval decision. Try again or check your permission.',
        variant: 'danger',
      });
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (!Number.isFinite(numericId)) {
    return (
      <div className="detail-page detail-page--center">
        <p className="detail-error">Invalid playbook ID.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="detail-page" aria-busy="true">
        <div className="detail-skeleton-header" />
        <div className="detail-skeleton-tabs" />
        <div className="detail-skeleton-body" />
      </div>
    );
  }

  if (isError || !playbook) {
    return (
      <div className="detail-page detail-page--center">
        <EmptyState>
          <h2>Playbook not found</h2>
          <EmptyStateBody>
            {error instanceof Error ? error.message : 'The requested playbook could not be loaded.'}
          </EmptyStateBody>
          <Link to="/response/playbooks" className="detail-link">Back to Playbooks</Link>
        </EmptyState>
      </div>
    );
  }

  const isActive = listResult?.status === 'ACTIVE';

  // ─── Tabs ─────────────────────────────────────────────────────────────────

  const tabs: DetailTabDefinition[] = [
    {
      key: 'overview',
      title: <DetailTabTitle icon={<Gauge size={13} />} label="Overview" />,
      content: <OverviewTab playbook={playbook} listItem={listResult} />,
    },
    {
      key: 'steps',
      title: <DetailTabTitle icon={<ListChecks size={13} />} label="Steps" count={playbook.steps?.length ?? 0} />,
      content: <StepsTab playbook={playbook} />,
    },
    {
      key: 'history',
      title: <DetailTabTitle icon={<Clock3 size={13} />} label="History" />,
      content: <HistoryTab playbookId={numericId} />,
    },
    {
      key: 'trigger',
      title: <DetailTabTitle icon={<Zap size={13} />} label="Trigger" />,
      content: <TriggerConfigTab playbook={playbook} />,
    },
    {
      key: 'settings',
      title: <DetailTabTitle icon={<Settings2 size={13} />} label="Settings" />,
      content: <SettingsTab playbook={playbook} onSaved={() => refetch()} />,
    },
    {
      key: 'audit',
      title: <DetailTabTitle icon={<ScrollText size={13} />} label="Audit" />,
      content: <AuditTab playbookId={numericId} />,
    },
  ];

  return (
    <div className="detail-page">
      {/* ── Command bar ─────────────────────────────────────────────────────── */}
      <div className="detail-command-bar">
        <div className="detail-command-bar__left">
          <Link to="/response/playbooks" className="detail-back">
            <ArrowLeft size={14} />
          </Link>
          <div className="detail-identity">
            <span className="detail-eyebrow">
              Response · Playbook
              {listResult?.category && (
                <span className="detail-category-chip">{listResult.category}</span>
              )}
            </span>
            <h1 className="detail-title" data-testid="page-header-title">{playbook.name}</h1>
          </div>
        </div>
        <div className="detail-command-bar__right">
          {listResult?.triggerType && <TriggerTypeChip trigger={listResult.triggerType} />}
          {listResult?.status && (
            <span className={`detail-status-pill detail-status-pill--${listResult.status.toLowerCase()}`}>
              {listResult.status === 'ACTIVE' && <span className="detail-status-dot" />}
              {listResult.status.charAt(0) + listResult.status.slice(1).toLowerCase()}
            </span>
          )}
          {canMutate && (
            <HaButton
              variant="plain"
              icon={<Edit3 size={14} />}
              onClick={() => navigate(`/response/playbooks/${id}/edit`)}
              style={{ minWidth: 'unset', padding: '6px 10px' }}
            >
              Edit
            </HaButton>
          )}
          {canMutate && (
            <HaButton
              variant="primary"
              icon={<Play size={14} />}
              isDisabled={!isActive || executeMutation.isPending}
              isLoading={previewMutation.isPending || executeMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              Run now
            </HaButton>
          )}
        </div>
      </div>

      {/* ── Live stream viewer (shown when execution is running) ─────────────── */}
      {stream && (
        <ExecutionStreamViewer
          stream={stream}
          onCancel={handleCancelStream}
          canApprove={canApproveExecution}
          isDecisionPending={approvalMutation.isPending}
          onApprove={() => approvalMutation.mutate('APPROVED')}
          onReject={() => setRejectConfirmOpen(true)}
        />
      )}

      {/* ── Tab workbench ────────────────────────────────────────────────────── */}
      <div className="detail-workbench-grid">
        <div className="detail-workbench">
          <DetailTabs
            tabs={tabs}
            activeKey={activeTab}
            onSelect={handleTabSelect}
          />
        </div>
        <OperationalRail
          playbook={playbook}
          listItem={listResult}
          onOpenHistory={() => handleTabSelect('history')}
          onOpenApprovals={() => navigate('/response/authority')}
        />
      </div>

      <div className="detail-status-dock">
        <StatusDock sseConnected={fixtureMode || epsStream.connected} eps={fixtureMode ? 12840 : epsStream.eps} mode={fixtureMode ? 'historical' : 'live'} lastUpdated={playbook.lastRunAt ? new Date(playbook.lastRunAt) : undefined} />
        <span>{stream ? `Execution ${stream.executionId} · ${stream.status}` : 'Versioned response playbook · audit trail enabled'}</span>
      </div>

      {/* ── Run confirmation modal ───────────────────────────────────────────── */}
      <HaConfirmationModal
        isOpen={runConfirmOpen}
        title={listResult?.approvalRequired ? 'Request approval to run' : 'Run playbook now'}
        message={
          executionPreview?.approvalRequired
            ? `"${playbook.name}" affects ${executionPreview.blastRadius.affectedTargets.join(', ')} and requires ${formatAuthorityLabel(executionPreview.blastRadius.requiredPermission)} approval. Estimated duration: ${executionPreview.estimatedDurationSeconds}s across ${executionPreview.stepCount} steps. It executes only after approval.`
            : `Run "${playbook.name}" now? The validated preview contains ${executionPreview?.stepCount ?? playbook.steps.length} steps with an estimated duration of ${executionPreview?.estimatedDurationSeconds ?? 0}s.`
        }
        confirmLabel={listResult?.approvalRequired ? 'Request approval' : 'Run now'}
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => executeMutation.mutate()}
        onCancel={() => { setRunConfirmOpen(false); setExecutionPreview(null); }}
      />

      <HaConfirmationModal
        isOpen={rejectConfirmOpen}
        title="Reject playbook execution"
        message="Reject this paused execution? The run will fail and remaining steps will not execute. This decision is recorded in the audit trail."
        confirmLabel="Reject"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => approvalMutation.mutate('REJECTED')}
        onCancel={() => setRejectConfirmOpen(false)}
      />
    </div>
  );
}
