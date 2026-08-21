import { useCallback, useEffect, useRef, useState } from 'react';

import { X } from 'lucide-react';

import { useToastStore } from '@/components/toast-stack/toastStore';
import { ApiError, apiClient } from '@/lib/apiClient';

type NoteVisibility = 'soc' | 'tenant' | 'public';

interface NoteDialogProps {
  alertId: string;
  alertVersion: number | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function NoteDialog({ alertId, alertVersion, onSuccess, onCancel }: NoteDialogProps): JSX.Element {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('soc');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const addToast = useToastStore((state) => state.addToast);

  const handleCancel = useCallback(() => {
    if (!submitting) onCancel();
  }, [submitting, onCancel]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) handleCancel();
  };

  const handleSubmit = async (): Promise<void> => {
    if (!body.trim() || body.length > 2000 || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (alertVersion !== null) {
        headers['If-Match'] = String(alertVersion);
      }

      await apiClient.post(
        `/ha-alerts/${encodeURIComponent(alertId)}/notes`,
        { body: body.trim(), visibility, clientRequestId: crypto.randomUUID() },
        { headers }
      );

      addToast({ variant: 'success', title: 'Note added' });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setError('Alert was modified — close and retry');
        } else if (err.status === 400) {
          setError(err.body.detail ?? err.body.message ?? 'Validation failed');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = body.trim().length > 0 && body.length <= 2000;

  return (
    <div className="ha-dialog-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <section
        ref={panelRef}
        className="ha-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-dialog-title"
      >
        <header className="ha-dialog-header">
          <h2 id="note-dialog-title">Add analyst note</h2>
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
            <span className="ha-dialog-label">Note body <em>(required, max 2000 characters)</em></span>
            <textarea
              ref={textareaRef}
              className="ha-dialog-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Record an observation, hypothesis, or handoff detail…"
              disabled={submitting}
            />
            <span className="ha-dialog-char-count">{body.length}/2000</span>
          </label>

          <fieldset className="ha-dialog-fieldset">
            <legend className="ha-dialog-label">Visibility</legend>
            <div className="ha-dialog-radio-group">
              {(['soc', 'tenant', 'public'] as const).map((option) => (
                <label key={option} className="ha-dialog-radio">
                  <input
                    type="radio"
                    name="visibility"
                    value={option}
                    checked={visibility === option}
                    onChange={() => setVisibility(option)}
                    disabled={submitting}
                  />
                  <span>{option === 'soc' ? 'SOC only' : option === 'tenant' ? 'Tenant' : 'Public'}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
            disabled={!isValid || submitting}
          >
            {submitting ? 'Submitting…' : 'Add note'}
          </button>
        </footer>
      </section>

      <style>{`
        .ha-dialog-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
        }
        .ha-dialog-panel {
          width: 480px;
          max-width: 90vw;
          max-height: 85vh;
          overflow-y: auto;
          background: var(--ha-surface-panel);
          border: 1px solid var(--ha-border-default);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
        }
        .ha-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--ha-border-subtle);
        }
        .ha-dialog-header h2 {
          font-size: 15px;
          font-weight: 600;
          color: var(--ha-foreground-primary);
          margin: 0;
        }
        .ha-dialog-close {
          background: transparent;
          border: none;
          color: var(--ha-foreground-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
        }
        .ha-dialog-close:hover { color: var(--ha-foreground-primary); }
        .ha-dialog-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ha-dialog-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ha-dialog-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--ha-foreground-secondary);
        }
        .ha-dialog-label em {
          font-weight: 400;
          font-style: normal;
          opacity: 0.7;
        }
        .ha-dialog-textarea {
          width: 100%;
          padding: 10px 12px;
          background: var(--ha-surface-input);
          border: 1px solid var(--ha-border-default);
          border-radius: 6px;
          color: var(--ha-foreground-primary);
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
          font-family: inherit;
        }
        .ha-dialog-textarea:focus {
          outline: none;
          border-color: var(--ha-border-focus);
        }
        .ha-dialog-textarea::placeholder { color: var(--ha-foreground-tertiary); }
        .ha-dialog-char-count {
          font-size: 11px;
          color: var(--ha-foreground-tertiary);
          text-align: right;
        }
        .ha-dialog-fieldset {
          border: none;
          padding: 0;
          margin: 0;
        }
        .ha-dialog-radio-group {
          display: flex;
          gap: 16px;
          margin-top: 6px;
        }
        .ha-dialog-radio {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--ha-foreground-primary);
          cursor: pointer;
        }
        .ha-dialog-radio input[type="radio"] {
          accent-color: var(--ha-action-primary);
        }
        .ha-dialog-error {
          padding: 8px 12px;
          background: color-mix(in srgb, var(--ha-severity-critical) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--ha-severity-critical) 30%, transparent);
          border-radius: 6px;
          font-size: 12px;
          color: var(--ha-severity-critical);
        }
        .ha-dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 20px 16px;
          border-top: 1px solid var(--ha-border-subtle);
        }
        .ha-dialog-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .ha-dialog-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ha-dialog-btn--primary {
          background: var(--ha-action-primary);
          color: var(--ha-foreground-on-action);
          border: none;
        }
        .ha-dialog-btn--primary:hover:not(:disabled) { opacity: 0.9; }
        .ha-dialog-btn--secondary {
          background: transparent;
          border: 1px solid var(--ha-border-default);
          color: var(--ha-foreground-secondary);
        }
        .ha-dialog-btn--secondary:hover:not(:disabled) {
          border-color: var(--ha-border-strong);
          color: var(--ha-foreground-primary);
        }
      `}</style>
    </div>
  );
}
