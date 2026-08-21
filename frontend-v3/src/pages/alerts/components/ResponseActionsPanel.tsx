/**
 * ResponseActionsPanel — Action catalog, preview, execute UI (ALT-010)
 * Renders available response actions as cards with risk badges and integration
 * health indicators. Supports preview modal, execution with job tracking, and
 * critical-action confirmation dialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  executeAction,
  fetchJobStatus,
  fetchResponseActions,
  previewAction,
} from '../alertInvestigation.service';
import type {
  ActionPreview,
  ResponseAction,
  ResponseJob,
} from '../alertInvestigation.types';

import { showErrorToast, showSuccessToast } from '@/lib/toast';

/* ─── Props ─── */

interface ResponseActionsPanelProps {
  /** Selected entity ID to use as action target */
  targetId: string;
  /** Alert ID (for context) */
  alertId: string;
}

/* ─── Category icon mapping ─── */

function categoryIcon(category: string): LucideIcon {
  switch (category) {
    case 'containment': return Shield;
    case 'eradication': return Trash2;
    case 'investigation': return Search;
    default: return Shield;
  }
}

/* ─── Risk level color mapping ─── */

function riskLevelColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'critical': return 'var(--ha-severity-critical)';
    case 'high': return 'var(--ha-severity-high)';
    case 'medium': return 'var(--ha-severity-medium)';
    case 'low': return 'var(--ha-severity-low)';
    default: return 'var(--ha-foreground-tertiary)';
  }
}

/* ─── Integration health dot color ─── */

function integrationDotColor(status: string): string {
  switch (status) {
    case 'healthy': return 'var(--ha-severity-low)';
    case 'degraded': return 'var(--ha-severity-medium)';
    case 'unavailable': return 'var(--ha-severity-critical)';
    default: return 'var(--ha-foreground-tertiary)';
  }
}

/* ─── Component ─── */

export function ResponseActionsPanel({ targetId, alertId: _alertId }: ResponseActionsPanelProps): JSX.Element {
  const [selectedAction, setSelectedAction] = useState<ResponseAction | null>(null);
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmCriticalOpen, setConfirmCriticalOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  /* ─── Queries ─── */

  const actionsQuery = useQuery({
    queryKey: ['response-actions'],
    queryFn: fetchResponseActions,
    staleTime: 5 * 60_000,
  });

  // Job polling: refetch every 3s while queued/running, stop when completed/failed
  const jobQuery = useQuery({
    queryKey: ['response-job', activeJobId],
    queryFn: () => {
      if (!activeJobId) throw new Error('A response job must be selected before polling.');
      return fetchJobStatus(activeJobId);
    },
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') return 3000;
      return false;
    },
  });

  /* ─── Handle job completion/failure via effect ─── */

  useEffect(() => {
    if (!jobQuery.data || !activeJobId) return;
    const job: ResponseJob = jobQuery.data;

    if (job.status === 'completed') {
      showSuccessToast('Action completed', job.result ?? 'Response action executed successfully.');
      setActiveJobId(null);
    } else if (job.status === 'failed') {
      showErrorToast('Action failed', job.error?.message ?? 'Response action failed.');
    }
  }, [jobQuery.data, activeJobId]);

  /* ─── Mutations ─── */

  const previewMutation = useMutation({
    mutationFn: (action: ResponseAction) =>
      previewAction(action.id, { targetId, parameters: {} }),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewOpen(true);
    },
    onError: () => {
      showErrorToast('Preview failed', 'Could not generate action preview.');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedAction || !preview) throw new Error('No action selected');
      return executeAction(selectedAction.id, {
        targetId,
        parameters: {},
        previewToken: preview.previewToken,
      });
    },
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      setPreviewOpen(false);
      setConfirmCriticalOpen(false);
      setPreview(null);
      setSelectedAction(null);
    },
    onError: () => {
      showErrorToast('Execution failed', 'Could not execute the response action.');
    },
  });

  /* ─── Handlers ─── */

  const handleCardClick = useCallback((action: ResponseAction) => {
    if (action.integrationStatus === 'unavailable') return;
    setSelectedAction(action);
    previewMutation.mutate(action);
  }, [previewMutation]);

  const handleExecute = useCallback(() => {
    if (!selectedAction) return;
    if (selectedAction.riskLevel === 'critical') {
      setConfirmCriticalOpen(true);
      return;
    }
    executeMutation.mutate();
  }, [selectedAction, executeMutation]);

  const handleCriticalConfirm = useCallback(() => {
    setConfirmCriticalOpen(false);
    executeMutation.mutate();
  }, [executeMutation]);

  const handleRetry = useCallback(() => {
    if (!activeJobId) return;
    setActiveJobId(null);
  }, [activeJobId]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreview(null);
    setSelectedAction(null);
  }, []);

  /* ─── Render ─── */

  if (actionsQuery.isLoading) {
    return (
      <div className="response-actions-panel" aria-busy="true">
        <div className="response-actions-panel__loading">
          <Loader2 size={18} className="spin-animation" aria-hidden="true" />
          <span>Loading response actions…</span>
        </div>
      </div>
    );
  }

  if (actionsQuery.isError) {
    return (
      <div className="response-actions-panel">
        <div className="response-actions-panel__error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Failed to load response actions</span>
        </div>
      </div>
    );
  }

  const actions = actionsQuery.data ?? [];

  return (
    <div className="response-actions-panel">
      {/* ─── Action catalog cards ─── */}
      <div className="response-actions-panel__catalog">
        {actions.map((action) => {
          const isUnavailable = action.integrationStatus === 'unavailable';
          const Icon = categoryIcon(action.category);
          return (
            <button
              key={action.id}
              type="button"
              className="response-action-card"
              data-disabled={isUnavailable}
              data-status={action.integrationStatus}
              disabled={isUnavailable}
              title={isUnavailable ? 'Integration unavailable' : action.description}
              onClick={() => handleCardClick(action)}
              style={{ borderLeftColor: riskLevelColor(action.riskLevel) }}
            >
              <div className="response-action-card__header">
                <Icon size={14} className="response-action-card__icon" aria-hidden="true" />
                <span className={`response-action-card__name${isUnavailable ? ' response-action-card__name--unavailable' : ''}`}>
                  {action.name}
                </span>
                <span
                  className={`response-action-card__health-dot${action.integrationStatus === 'degraded' ? ' response-action-card__health-dot--pulse' : ''}`}
                  title={`Integration: ${action.integrationStatus}`}
                  style={{ background: integrationDotColor(action.integrationStatus) }}
                />
              </div>
              <p className="response-action-card__description">{action.description}</p>
              <div className="response-action-card__badges">
                <span className="response-action-card__badge response-action-card__badge--category">
                  {action.category}
                </span>
                <span
                  className="response-action-card__badge response-action-card__badge--risk"
                  style={{ color: riskLevelColor(action.riskLevel) }}
                >
                  {action.riskLevel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Active jobs section ─── */}
      {activeJobId && jobQuery.data && (
        <div className="response-actions-panel__jobs">
          <ActiveJobIndicator job={jobQuery.data} onRetry={handleRetry} />
        </div>
      )}

      {/* ─── Preview modal ─── */}
      {previewOpen && preview && selectedAction && (
        <PreviewModal
          action={selectedAction}
          preview={preview}
          isExecuting={executeMutation.isPending}
          onExecute={handleExecute}
          onCancel={closePreview}
        />
      )}

      {/* ─── Critical action confirmation dialog ─── */}
      {confirmCriticalOpen && (
        <CriticalConfirmDialog
          onConfirm={handleCriticalConfirm}
          onCancel={() => setConfirmCriticalOpen(false)}
          isExecuting={executeMutation.isPending}
        />
      )}

      <style>{responseActionsPanelStyles}</style>
    </div>
  );
}

/* ─── Preview Modal sub-component ─── */

function PreviewModal({
  action,
  preview,
  isExecuting,
  onExecute,
  onCancel,
}: {
  action: ResponseAction;
  preview: ActionPreview;
  isExecuting: boolean;
  onExecute: () => void;
  onCancel: () => void;
}): JSX.Element {
  const Icon = categoryIcon(action.category);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="ha-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <section
        className="ha-dialog-panel response-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-preview-title"
      >
        <header className="ha-dialog-header">
          <div className="response-preview__header-left">
            <span className="response-preview__header-icon">
              <Icon size={16} aria-hidden="true" />
            </span>
            <h2 id="response-preview-title">{action.name}</h2>
          </div>
          <div className="response-preview__header-badges">
            <span className="response-preview__time-badge">
              <Clock size={12} aria-hidden="true" />
              {preview.estimatedDuration}
            </span>
            {preview.requiresApproval && (
              <span className="response-preview__approval-badge">
                <Lock size={12} aria-hidden="true" />
                Requires Approval
              </span>
            )}
          </div>
          <button type="button" className="ha-dialog-close" onClick={onCancel} aria-label="Close preview">
            <X size={16} />
          </button>
        </header>

        <div className="ha-dialog-body">
          {/* Target summary */}
          <div className="response-preview__target">
            <span className="ha-dialog-label">Target</span>
            <strong>{preview.targetSummary}</strong>
          </div>

          {/* Impact list */}
          <div className="response-preview__impacts">
            <span className="ha-dialog-label">Impact assessment</span>
            <ul>
              {preview.impact.map((item, i) => (
                <li key={i} style={{ borderLeftColor: scopeColor(item.scope) }}>
                  <span>{item.description}</span>
                  {item.affectedEntities.length > 0 && (
                    <small>Affected: {item.affectedEntities.join(', ')}</small>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Warnings banner */}
          {preview.warnings.length > 0 && (
            <div className="response-preview__warnings">
              <AlertTriangle size={14} aria-hidden="true" />
              <div>
                {preview.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </div>
            </div>
          )}

          {/* Reversibility */}
          <div className="response-preview__meta">
            <div>
              <span className="ha-dialog-label">Reversible</span>
              <strong>{preview.reversible ? 'Yes' : 'No'}</strong>
            </div>
            <div>
              <span className="ha-dialog-label">Risk level</span>
              <strong style={{ color: riskLevelColor(action.riskLevel) }}>{action.riskLevel}</strong>
            </div>
          </div>
        </div>

        <footer className="ha-dialog-footer">
          <button
            type="button"
            className="ha-dialog-btn ha-dialog-btn--ghost"
            onClick={onCancel}
            disabled={isExecuting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ha-dialog-btn ha-dialog-btn--execute"
            onClick={onExecute}
            disabled={isExecuting}
          >
            {isExecuting ? 'Executing…' : 'Execute'}
          </button>
        </footer>
      </section>
    </div>
  );
}

/* ─── Scope to severity color for impact items ─── */

function scopeColor(scope: string): string {
  switch (scope) {
    case 'critical': return 'var(--ha-severity-critical)';
    case 'high': return 'var(--ha-severity-high)';
    case 'medium': return 'var(--ha-severity-medium)';
    case 'low': return 'var(--ha-severity-low)';
    case 'host': return 'var(--ha-severity-high)';
    case 'network': return 'var(--ha-severity-medium)';
    case 'user': return 'var(--ha-severity-critical)';
    default: return 'var(--ha-border-default)';
  }
}

/* ─── Critical Confirmation Dialog sub-component ─── */

function CriticalConfirmDialog({
  onConfirm,
  onCancel,
  isExecuting,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting: boolean;
}): JSX.Element {
  return (
    <div className="ha-dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <section className="ha-dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="critical-confirm-title">
        <header className="ha-dialog-header">
          <h2 id="critical-confirm-title">
            <ShieldAlert size={16} style={{ color: 'var(--ha-severity-critical)' }} aria-hidden="true" />{' '}
            Critical Action Confirmation
          </h2>
        </header>
        <div className="ha-dialog-body">
          <p style={{ color: 'var(--ha-foreground-primary)', margin: 0 }}>
            This action is irreversible for the specified duration. Confirm?
          </p>
        </div>
        <footer className="ha-dialog-footer">
          <button type="button" className="ha-dialog-btn ha-dialog-btn--ghost" onClick={onCancel} disabled={isExecuting}>
            Cancel
          </button>
          <button type="button" className="ha-dialog-btn ha-dialog-btn--danger" onClick={onConfirm} disabled={isExecuting}>
            {isExecuting ? 'Executing…' : 'Confirm'}
          </button>
        </footer>
      </section>
    </div>
  );
}

/* ─── Active Job Indicator with progress timeline ─── */

function ActiveJobIndicator({
  job,
  onRetry,
}: {
  job: ResponseJob;
  onRetry: () => void;
}): JSX.Element {
  const isActive = job.status === 'queued' || job.status === 'running';
  const isFailed = job.status === 'failed';
  const isCompleted = job.status === 'completed';

  // Elapsed time counter
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isActive && job.startedAt) {
      const start = new Date(job.startedAt).getTime();
      const tick = (): void => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    } else if (isActive) {
      const start = Date.now();
      const tick = (): void => setElapsed(Math.floor((Date.now() - start) / 1000));
      intervalRef.current = setInterval(tick, 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
    return undefined;
  }, [isActive, job.startedAt]);

  const formatElapsed = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  // Determine step states
  const queuedDone = job.status !== 'queued';
  const runningActive = job.status === 'running';
  const runningDone = isCompleted || isFailed;

  return (
    <div className="response-job-indicator" data-status={job.status}>
      {/* Progress timeline */}
      <div className="response-job__timeline">
        <div className={`response-job__step${!queuedDone ? ' response-job__step--active' : ' response-job__step--done'}`}>
          <span className="response-job__step-dot">
            {queuedDone ? <Check size={10} aria-hidden="true" /> : <span className="response-job__pulse-dot" />}
          </span>
          <span className="response-job__step-label">Queued</span>
        </div>
        <div className="response-job__step-line" data-done={queuedDone} />
        <div className={`response-job__step${runningActive ? ' response-job__step--active' : runningDone ? ' response-job__step--done' : ''}`}>
          <span className="response-job__step-dot">
            {runningDone
              ? (isFailed ? <X size={10} aria-hidden="true" /> : <Check size={10} aria-hidden="true" />)
              : runningActive ? <span className="response-job__pulse-dot" /> : null}
          </span>
          <span className="response-job__step-label">Running</span>
        </div>
        <div className="response-job__step-line" data-done={runningDone} />
        <div className={`response-job__step${isCompleted ? ' response-job__step--done' : isFailed ? ' response-job__step--failed' : ''}`}>
          <span className="response-job__step-dot">
            {isCompleted && <Check size={10} aria-hidden="true" />}
            {isFailed && <X size={10} aria-hidden="true" />}
          </span>
          <span className="response-job__step-label">{isFailed ? 'Failed' : 'Completed'}</span>
        </div>
      </div>

      {/* Elapsed timer */}
      {isActive && (
        <div className="response-job__elapsed">
          <Clock size={12} aria-hidden="true" />
          <span>{formatElapsed(elapsed)}</span>
        </div>
      )}

      {/* Completion banner */}
      {isCompleted && (
        <div className="response-job__banner response-job__banner--success">
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>{job.result ?? 'Action completed successfully'}</span>
        </div>
      )}

      {/* Failure banner */}
      {isFailed && (
        <div className="response-job__banner response-job__banner--error">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{job.error?.message ?? 'Action failed'}</span>
          {job.error?.retryable && (
            <button type="button" onClick={onRetry} className="response-job__retry-btn">
              <RefreshCw size={12} aria-hidden="true" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Styles ─── */

const responseActionsPanelStyles = `
  .response-actions-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .response-actions-panel__loading,
  .response-actions-panel__error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    color: var(--ha-foreground-secondary);
    font-size: 13px;
  }
  .response-actions-panel__error {
    color: var(--ha-severity-critical);
  }
  .response-actions-panel__catalog {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }

  /* ─── Action cards ─── */
  .response-action-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--ha-surface-panel);
    border: 1px solid var(--ha-border-default);
    border-left: 3px solid var(--ha-border-default);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: all 0.15s ease;
  }
  .response-action-card:hover:not(:disabled) {
    border-color: var(--ha-border-strong);
    transform: scale(1.02);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--ha-surface-app) 60%, transparent);
  }
  .response-action-card:disabled,
  .response-action-card[data-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .response-action-card__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .response-action-card__icon {
    color: var(--ha-foreground-tertiary);
    flex-shrink: 0;
  }
  .response-action-card__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--ha-foreground-primary);
    flex: 1;
  }
  .response-action-card__name--unavailable {
    text-decoration: line-through;
  }
  .response-action-card__health-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .response-action-card__health-dot--pulse {
    animation: healthPulse 2s ease-in-out infinite;
  }
  @keyframes healthPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }
  .response-action-card__description {
    font-size: 11px;
    color: var(--ha-foreground-tertiary);
    margin: 0;
    line-height: 1.4;
  }
  .response-action-card__badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .response-action-card__badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: capitalize;
  }
  .response-action-card__badge--category {
    background: var(--ha-surface-elevated);
    color: var(--ha-foreground-secondary);
  }
  .response-action-card__badge--risk {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  /* ─── Preview modal styles ─── */
  .response-preview-modal {
    width: 520px;
    border-radius: 8px;
  }
  .response-preview__header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }
  .response-preview__header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--ha-action-primary) 12%, transparent);
    color: var(--ha-action-primary);
  }
  .response-preview__header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
  }
  .response-preview__time-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: var(--ha-surface-elevated);
    color: var(--ha-foreground-secondary);
  }
  .response-preview__approval-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: color-mix(in srgb, var(--ha-severity-medium) 15%, transparent);
    color: var(--ha-severity-medium);
  }
  .response-preview__target {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .response-preview__target strong {
    font-size: 13px;
    color: var(--ha-foreground-primary);
    font-family: 'JetBrains Mono', monospace;
  }
  .response-preview__impacts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .response-preview__impacts ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .response-preview__impacts li {
    padding: 8px 10px;
    background: var(--ha-surface-elevated);
    border: 1px solid var(--ha-border-subtle);
    border-left: 3px solid var(--ha-border-default);
    border-radius: 4px;
    font-size: 12px;
    color: var(--ha-foreground-primary);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .response-preview__impacts li small {
    color: var(--ha-foreground-tertiary);
    font-size: 11px;
  }
  .response-preview__warnings {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--ha-severity-medium) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--ha-severity-medium) 30%, transparent);
    border-radius: 6px;
    color: var(--ha-severity-medium);
    font-size: 12px;
    align-items: flex-start;
    animation: warningPulse 3s ease-in-out infinite;
  }
  @keyframes warningPulse {
    0%, 100% { background: color-mix(in srgb, var(--ha-severity-medium) 10%, transparent); }
    50% { background: color-mix(in srgb, var(--ha-severity-medium) 16%, transparent); }
  }
  .response-preview__warnings div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .response-preview__warnings p {
    margin: 0;
  }
  .response-preview__meta {
    display: flex;
    gap: 24px;
  }
  .response-preview__meta > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .response-preview__meta strong {
    font-size: 13px;
    color: var(--ha-foreground-primary);
    text-transform: capitalize;
  }

  /* ─── Footer button styles ─── */
  .ha-dialog-btn--execute {
    background: var(--ha-action-primary);
    color: var(--ha-foreground-on-action, #0B0919);
    border: none;
    font-weight: 600;
    border-radius: 6px;
    padding: 6px 16px;
    transition: all 0.15s ease;
  }
  .ha-dialog-btn--execute:hover:not(:disabled) {
    background: var(--ha-action-primary-hover);
  }
  .ha-dialog-btn--execute:disabled {
    opacity: 0.6;
  }
  .ha-dialog-btn--ghost {
    background: transparent;
    color: var(--ha-foreground-secondary);
    border: 1px solid var(--ha-border-default);
    border-radius: 6px;
    padding: 6px 16px;
    transition: all 0.15s ease;
  }
  .ha-dialog-btn--ghost:hover:not(:disabled) {
    border-color: var(--ha-border-strong);
    color: var(--ha-foreground-primary);
  }
  .ha-dialog-btn--danger {
    background: var(--ha-severity-critical);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 6px 16px;
    font-weight: 600;
    transition: all 0.15s ease;
  }
  .ha-dialog-btn--danger:hover:not(:disabled) {
    opacity: 0.9;
  }

  /* ─── Job indicator / timeline styles ─── */
  .response-actions-panel__jobs {
    border-top: 1px solid var(--ha-border-subtle);
    padding-top: 10px;
  }
  .response-job-indicator {
    padding: 14px 16px;
    border-radius: 6px;
    border: 1px solid var(--ha-border-default);
    background: var(--ha-surface-elevated);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: all 0.15s ease;
  }
  .response-job-indicator[data-status="completed"] {
    border-color: color-mix(in srgb, var(--ha-severity-low) 40%, transparent);
  }
  .response-job-indicator[data-status="failed"] {
    border-color: color-mix(in srgb, var(--ha-severity-critical) 40%, transparent);
  }

  /* Progress timeline */
  .response-job__timeline {
    display: flex;
    align-items: center;
    gap: 0;
  }
  .response-job__step {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .response-job__step-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--ha-border-default);
    background: var(--ha-surface-panel);
    color: var(--ha-foreground-tertiary);
    font-size: 10px;
    transition: all 0.15s ease;
  }
  .response-job__step--active .response-job__step-dot {
    border-color: var(--ha-action-primary);
    background: color-mix(in srgb, var(--ha-action-primary) 15%, transparent);
    color: var(--ha-action-primary);
  }
  .response-job__step--done .response-job__step-dot {
    border-color: var(--ha-severity-low);
    background: color-mix(in srgb, var(--ha-severity-low) 15%, transparent);
    color: var(--ha-severity-low);
  }
  .response-job__step--failed .response-job__step-dot {
    border-color: var(--ha-severity-critical);
    background: color-mix(in srgb, var(--ha-severity-critical) 15%, transparent);
    color: var(--ha-severity-critical);
  }
  .response-job__step-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--ha-foreground-tertiary);
  }
  .response-job__step--active .response-job__step-label {
    color: var(--ha-action-primary);
  }
  .response-job__step--done .response-job__step-label {
    color: var(--ha-severity-low);
  }
  .response-job__step--failed .response-job__step-label {
    color: var(--ha-severity-critical);
  }
  .response-job__step-line {
    flex: 1;
    height: 2px;
    min-width: 20px;
    background: var(--ha-border-default);
    margin: 0 4px;
    transition: all 0.15s ease;
  }
  .response-job__step-line[data-done="true"] {
    background: var(--ha-severity-low);
  }
  .response-job__pulse-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ha-action-primary);
    animation: stepPulse 1.5s ease-in-out infinite;
  }
  @keyframes stepPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }
  .response-job__elapsed {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--ha-foreground-tertiary);
    font-family: 'JetBrains Mono', monospace;
  }

  /* ─── Result banners ─── */
  .response-job__banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }
  .response-job__banner--success {
    background: color-mix(in srgb, var(--ha-severity-low) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--ha-severity-low) 30%, transparent);
    color: var(--ha-severity-low);
  }
  .response-job__banner--error {
    background: color-mix(in srgb, var(--ha-severity-critical) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--ha-severity-critical) 30%, transparent);
    color: var(--ha-severity-critical);
  }
  .response-job__retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--ha-severity-critical) 40%, transparent);
    border-radius: 4px;
    color: var(--ha-severity-critical);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .response-job__retry-btn:hover {
    background: color-mix(in srgb, var(--ha-severity-critical) 10%, transparent);
  }

  /* ─── Spin animation ─── */
  .spin-animation {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
