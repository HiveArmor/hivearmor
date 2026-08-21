import { useCallback, useEffect, useRef, useState } from 'react';

import { Search, X } from 'lucide-react';

import { useToastStore } from '@/components/toast-stack/toastStore';
import { ApiError, apiClient } from '@/lib/apiClient';

type LinkMode = 'create_new' | 'attach_existing';

interface IncidentCandidate {
  id: string;
  name: string;
  status: string;
  severity: number;
  alertCount: number;
}

interface PreviewResult {
  previewToken: string;
  entities: string[];
  warnings: string[];
}

interface LinkResult {
  incidentId: string;
}

interface IncidentLinkDialogProps {
  alertId: string;
  onSuccess: (incidentId: string) => void;
  onCancel: () => void;
}

export function IncidentLinkDialog({ alertId, onSuccess, onCancel }: IncidentLinkDialogProps): JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<LinkMode>('create_new');
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState<IncidentCandidate[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const addToast = useToastStore((state) => state.addToast);

  const handleCancel = useCallback(() => {
    if (!submitting && !loadingPreview) onCancel();
  }, [submitting, loadingPreview, onCancel]);

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

  const searchIncidents = async (query: string): Promise<void> => {
    if (!query.trim()) {
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const results = await apiClient.get<IncidentCandidate[]>(
        '/ha-incidents/candidates',
        { params: { q: query.trim(), alertId, limit: 10 } }
      );
      setCandidates(results);
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (mode !== 'attach_existing' || !searchQuery.trim()) return;
    const timeout = setTimeout(() => void searchIncidents(searchQuery), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, mode]);

  const proceedToStep2 = async (): Promise<void> => {
    if (mode === 'attach_existing' && !selectedIncidentId) return;
    setLoadingPreview(true);
    setError(null);

    try {
      const result = await apiClient.post<PreviewResult>(
        `/ha-alerts/${encodeURIComponent(alertId)}/incident-link/preview`,
        { mode, incidentId: selectedIncidentId }
      );
      setPreview(result);
      setStep(2);
      window.requestAnimationFrame(() => reasonRef.current?.focus());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.detail ?? err.body.message ?? 'Preview failed');
      } else {
        setError('Failed to load preview');
      }
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!reason.trim() || !preview || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await apiClient.post<LinkResult>(
        `/ha-alerts/${encodeURIComponent(alertId)}/incident-link`,
        { mode, incidentId: selectedIncidentId, reason: reason.trim(), previewToken: preview.previewToken },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } }
      );

      addToast({ variant: 'success', title: `Linked to incident ${result.incidentId}` });
      onSuccess(result.incidentId);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError('Alert not found — it may have been deleted');
        } else if (err.status === 409) {
          setError('Version conflict — close and retry');
        } else if (err.status === 400) {
          setError(err.body.detail ?? err.body.message ?? 'Validation error');
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

  const canProceed = mode === 'create_new' || selectedIncidentId !== null;
  const canConfirm = reason.trim().length > 0 && preview !== null;

  return (
    <div className="ha-dialog-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <section
        className="ha-dialog-panel incident-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incident-link-title"
      >
        <header className="ha-dialog-header">
          <h2 id="incident-link-title">
            {step === 1 ? 'Link alert to incident' : 'Confirm incident link'}
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
          {step === 1 && (
            <>
              <fieldset className="ha-dialog-fieldset">
                <legend className="ha-dialog-label">Mode</legend>
                <div className="incident-link-modes">
                  <label className="incident-link-mode" data-active={mode === 'create_new'}>
                    <input
                      type="radio"
                      name="mode"
                      value="create_new"
                      checked={mode === 'create_new'}
                      onChange={() => { setMode('create_new'); setSelectedIncidentId(null); }}
                    />
                    <div>
                      <strong>Create new incident</strong>
                      <span>Start a new incident from this alert</span>
                    </div>
                  </label>
                  <label className="incident-link-mode" data-active={mode === 'attach_existing'}>
                    <input
                      type="radio"
                      name="mode"
                      value="attach_existing"
                      checked={mode === 'attach_existing'}
                      onChange={() => setMode('attach_existing')}
                    />
                    <div>
                      <strong>Attach to existing</strong>
                      <span>Link this alert to an open incident</span>
                    </div>
                  </label>
                </div>
              </fieldset>

              {mode === 'attach_existing' && (
                <div className="incident-link-search">
                  <div className="incident-link-search__input">
                    <Search size={14} aria-hidden="true" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search incidents by name or ID…"
                      aria-label="Search incidents"
                    />
                    {searching && <span className="incident-link-search__spinner" aria-label="Searching" />}
                  </div>

                  {candidates.length > 0 && (
                    <div className="incident-link-candidates" role="listbox" aria-label="Incident candidates">
                      {candidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          role="option"
                          className="incident-link-candidate"
                          aria-selected={selectedIncidentId === candidate.id}
                          data-selected={selectedIncidentId === candidate.id}
                          onClick={() => setSelectedIncidentId(candidate.id)}
                        >
                          <strong>{candidate.name}</strong>
                          <span>{candidate.id} · {candidate.status} · Sev {candidate.severity} · {candidate.alertCount} alerts</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && preview && (
            <>
              {preview.entities.length > 0 && (
                <div className="incident-link-preview-section">
                  <span className="ha-dialog-label">Entities involved</span>
                  <div className="incident-link-entities">
                    {preview.entities.map((entity) => (
                      <span key={entity} className="incident-link-entity">{entity}</span>
                    ))}
                  </div>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="incident-link-warnings">
                  {preview.warnings.map((warning, i) => (
                    <div key={i} className="incident-link-warning">{warning}</div>
                  ))}
                </div>
              )}

              <label className="ha-dialog-field">
                <span className="ha-dialog-label">Reason <em>(required)</em></span>
                <textarea
                  ref={reasonRef}
                  className="ha-dialog-textarea"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why this alert belongs in this incident…"
                  disabled={submitting}
                />
              </label>
            </>
          )}

          {error && (
            <div className="ha-dialog-error" role="alert">{error}</div>
          )}
        </div>

        <footer className="ha-dialog-footer">
          {step === 2 && (
            <button
              type="button"
              className="ha-dialog-btn ha-dialog-btn--secondary"
              onClick={() => { setStep(1); setPreview(null); setError(null); }}
              disabled={submitting}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="ha-dialog-btn ha-dialog-btn--secondary"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          {step === 1 && (
            <button
              type="button"
              className="ha-dialog-btn ha-dialog-btn--primary"
              onClick={() => void proceedToStep2()}
              disabled={!canProceed || loadingPreview}
            >
              {loadingPreview ? 'Loading preview…' : 'Next'}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="ha-dialog-btn ha-dialog-btn--primary"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm || submitting}
            >
              {submitting ? 'Linking…' : 'Confirm link'}
            </button>
          )}
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
        .incident-link-dialog { width: 520px; }
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
        .ha-dialog-fieldset {
          border: none;
          padding: 0;
          margin: 0;
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
        .incident-link-modes {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .incident-link-mode {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--ha-border-default);
          border-radius: 6px;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .incident-link-mode[data-active="true"] {
          border-color: var(--ha-action-primary);
          background: color-mix(in srgb, var(--ha-action-primary) 5%, transparent);
        }
        .incident-link-mode input[type="radio"] {
          margin-top: 2px;
          accent-color: var(--ha-action-primary);
        }
        .incident-link-mode div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .incident-link-mode strong {
          font-size: 13px;
          color: var(--ha-foreground-primary);
        }
        .incident-link-mode span {
          font-size: 12px;
          color: var(--ha-foreground-tertiary);
        }
        .incident-link-search {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .incident-link-search__input {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--ha-surface-input);
          border: 1px solid var(--ha-border-default);
          border-radius: 6px;
          color: var(--ha-foreground-tertiary);
        }
        .incident-link-search__input:focus-within {
          border-color: var(--ha-border-focus);
        }
        .incident-link-search__input input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--ha-foreground-primary);
          font-size: 13px;
          font-family: inherit;
          outline: none;
        }
        .incident-link-search__input input::placeholder { color: var(--ha-foreground-tertiary); }
        .incident-link-search__spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--ha-border-default);
          border-top-color: var(--ha-action-primary);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .incident-link-candidates {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 200px;
          overflow-y: auto;
        }
        .incident-link-candidate {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px;
          background: var(--ha-surface-elevated);
          border: 1px solid var(--ha-border-default);
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          width: 100%;
        }
        .incident-link-candidate[data-selected="true"] {
          border-color: var(--ha-action-primary);
          background: color-mix(in srgb, var(--ha-action-primary) 8%, transparent);
        }
        .incident-link-candidate strong {
          font-size: 13px;
          color: var(--ha-foreground-primary);
        }
        .incident-link-candidate span {
          font-size: 11px;
          color: var(--ha-foreground-tertiary);
        }
        .incident-link-preview-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .incident-link-entities {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .incident-link-entity {
          padding: 3px 8px;
          background: var(--ha-surface-elevated);
          border: 1px solid var(--ha-border-default);
          border-radius: 4px;
          font-size: 12px;
          color: var(--ha-foreground-primary);
          font-family: 'JetBrains Mono', monospace;
        }
        .incident-link-warnings {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .incident-link-warning {
          padding: 8px 12px;
          background: color-mix(in srgb, var(--ha-severity-medium) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--ha-severity-medium) 30%, transparent);
          border-radius: 6px;
          font-size: 12px;
          color: var(--ha-severity-medium);
        }
      `}</style>
    </div>
  );
}
