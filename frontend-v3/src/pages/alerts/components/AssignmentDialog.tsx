import { useCallback, useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';

import { useToastStore } from '@/components/toast-stack/toastStore';
import { ApiError, apiClient } from '@/lib/apiClient';

interface AssigneeCandidate {
  id: number;
  displayName: string;
  role?: string | null;
  queueLoad?: number;
  slaRiskLoad?: number;
  assignableReason?: string | null;
}

interface AssigneesResponse {
  items: AssigneeCandidate[];
  hasMore: boolean;
}

interface AssignmentPreview {
  selected: number;
  eligible: number;
  excluded: number;
  alreadyAssigned: number;
  previewToken: string;
}

interface AssignmentDialogProps {
  alertIds: string[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function AssignmentDialog({ alertIds, onSuccess, onCancel }: AssignmentDialogProps): JSX.Element {
  const [assignees, setAssignees] = useState<AssigneeCandidate[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(true);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const addToast = useToastStore((state) => state.addToast);

  const handleCancel = useCallback(() => {
    if (!submitting) onCancel();
  }, [submitting, onCancel]);

  useEffect(() => {
    reasonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAssignees(true);
      setError(null);
      try {
        const response = await apiClient.get<AssigneesResponse>('/ha-alert-assignees', {
          params: { limit: 50 },
        });
        if (cancelled) return;
        setAssignees(response.items ?? []);
        if (response.items?.length) {
          setAssigneeId(String(response.items[0].id));
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError('Required permission: SOC Manager');
        } else if (err instanceof ApiError) {
          setError(err.body.detail ?? err.body.message ?? 'Failed to load assignees');
        } else {
          setError('Failed to load assignees');
        }
      } finally {
        if (!cancelled) setLoadingAssignees(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) handleCancel();
  };

  const handleSubmit = async (): Promise<void> => {
    if (submitting || !assigneeId || reason.trim().length < 6 || alertIds.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      const preview = await apiClient.post<AssignmentPreview>(
        '/ha-alerts/bulk/assignment/preview',
        { alertIds, assigneeId: Number(assigneeId) },
      );

      await apiClient.post(
        '/ha-alerts/bulk/assignment',
        {
          alertIds,
          assigneeId: Number(assigneeId),
          previewToken: preview.previewToken,
          reason: reason.trim(),
        },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      );

      const owner = assignees.find((a) => String(a.id) === assigneeId);
      addToast({
        variant: 'success',
        title: 'Alerts assigned',
        description: `${alertIds.length} alert${alertIds.length === 1 ? '' : 's'} assigned${owner ? ` to ${owner.displayName}` : ''}.`,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError('Required permission: SOC Manager');
        } else {
          setError(err.body.detail ?? err.body.message ?? 'Assignment failed');
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(assigneeId) && reason.trim().length >= 6 && !loadingAssignees && !submitting;

  return (
    <div className="ha-dialog-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <section
        className="ha-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-dialog-title"
      >
        <header className="ha-dialog-header">
          <h2 id="assignment-dialog-title">
            Assign {alertIds.length} alert{alertIds.length === 1 ? '' : 's'}
          </h2>
          <button
            type="button"
            className="ha-dialog-close"
            onClick={handleCancel}
            disabled={submitting}
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </header>

        <div className="ha-dialog-body">
          <label className="ha-dialog-field">
            <span className="ha-dialog-label">Owner</span>
            <select
              className="ha-dialog-select"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={loadingAssignees || submitting || assignees.length === 0}
            >
              {loadingAssignees && <option value="">Loading assignees…</option>}
              {!loadingAssignees && assignees.length === 0 && <option value="">No assignees available</option>}
              {assignees.map((assignee) => (
                <option key={assignee.id} value={String(assignee.id)}>
                  {assignee.displayName}
                  {typeof assignee.queueLoad === 'number' ? ` · ${assignee.queueLoad} open` : ''}
                  {typeof assignee.slaRiskLoad === 'number' && assignee.slaRiskLoad > 0
                    ? ` · ${assignee.slaRiskLoad} SLA risk`
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="ha-dialog-field">
            <span className="ha-dialog-label">Reason <em>(min 6 characters)</em></span>
            <textarea
              ref={reasonRef}
              className="ha-dialog-textarea"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              rows={3}
              maxLength={500}
              disabled={submitting}
              placeholder="Why this owner should take the alerts"
            />
          </label>

          {error && (
            <div className="ha-dialog-error" role="alert">{error}</div>
          )}
        </div>

        <footer className="ha-dialog-footer">
          <button
            type="button"
            className="ha-dialog-btn ha-dialog-btn--secondary"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ha-dialog-btn ha-dialog-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </footer>
      </section>

      <style>{`
        .ha-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: var(--ha-z-modal);
          display: flex;
          align-items: center;
          justify-content: center;
          background: color-mix(in srgb, var(--ha-background) 72%, transparent);
        }
        .ha-dialog-panel {
          width: min(440px, calc(100vw - 32px));
          background: var(--ha-surface-raised);
          border: 1px solid var(--ha-border);
          border-radius: var(--ha-radius-md);
        }
        .ha-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--ha-border);
        }
        .ha-dialog-header h2 {
          margin: 0;
          font: var(--ha-type-drawer-title, 600 var(--ha-text-md)/1.3 var(--ha-font-ui));
          color: var(--ha-text-primary);
        }
        .ha-dialog-close {
          background: transparent;
          border: none;
          color: var(--ha-text-secondary);
          cursor: pointer;
          padding: 4px;
        }
        .ha-dialog-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .ha-dialog-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ha-dialog-label {
          font-size: var(--ha-text-sm);
          font-weight: 500;
          color: var(--ha-text-secondary);
        }
        .ha-dialog-label em {
          font-weight: 400;
          font-style: normal;
          opacity: 0.75;
        }
        .ha-dialog-select,
        .ha-dialog-textarea {
          width: 100%;
          padding: 8px 10px;
          background: var(--ha-surface-primary);
          border: 1px solid var(--ha-border);
          border-radius: var(--ha-radius-base);
          color: var(--ha-text-primary);
          font: var(--ha-type-compact, 400 var(--ha-text-base)/1.4 var(--ha-font-ui));
        }
        .ha-dialog-textarea {
          resize: vertical;
          min-height: 72px;
        }
        .ha-dialog-error {
          padding: 8px 10px;
          background: color-mix(in srgb, var(--ha-critical) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--ha-critical) 28%, transparent);
          border-radius: var(--ha-radius-base);
          font-size: var(--ha-text-sm);
          color: var(--ha-critical);
        }
        .ha-dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 16px 14px;
          border-top: 1px solid var(--ha-border);
        }
        .ha-dialog-btn {
          padding: 7px 14px;
          border-radius: var(--ha-radius-base);
          font-size: var(--ha-text-base);
          font-weight: 500;
          cursor: pointer;
        }
        .ha-dialog-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ha-dialog-btn--primary {
          background: var(--ha-primary);
          color: var(--ha-background);
          border: none;
        }
        .ha-dialog-btn--secondary {
          background: transparent;
          border: 1px solid var(--ha-border);
          color: var(--ha-text-secondary);
        }
      `}</style>
    </div>
  );
}
