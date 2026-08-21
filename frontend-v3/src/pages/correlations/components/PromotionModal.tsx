/**
 * Sprint 44 — Promotion Modal.
 * Preview display with editable title/severity, confirm/cancel.
 */

import { useEffect, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';

import { executePromotion, previewPromotion } from '../services/correlation.service';

import type { SeverityLevel } from '@/lib/severity';

export interface PromotionModalProps {
  findingId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PromotionModal({ findingId, onClose, onSuccess }: PromotionModalProps): JSX.Element {
  const [editTitle, setEditTitle] = useState('');
  const [editSeverity, setEditSeverity] = useState<SeverityLevel>('critical');

  const previewQuery = useQuery({
    queryKey: ['finding-promotion-preview', findingId],
    queryFn: () => previewPromotion(findingId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (previewQuery.data) {
      setEditTitle(previewQuery.data.preview.title);
      setEditSeverity(previewQuery.data.preview.severity);
    }
  }, [previewQuery.data]);

  const executeMutation = useMutation({
    mutationFn: () =>
      executePromotion(findingId, {
        title: editTitle,
        severity: editSeverity,
        previewToken: previewQuery.data?.previewToken ?? '',
      }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !executeMutation.isPending) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, executeMutation.isPending]);

  return (
    <div
      className="promotion-modal__backdrop"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !executeMutation.isPending) onClose(); }}
    >
      <section className="promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-modal-title">
        <header className="promotion-modal__header">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <h2 id="promotion-modal-title">Promote to Incident</h2>
            <p>Review the incident preview and confirm promotion.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={executeMutation.isPending}
            aria-label="Close"
            className="promotion-modal__close"
          >
            <X size={16} />
          </button>
        </header>

        {previewQuery.isLoading && (
          <div className="promotion-modal__loading" role="status">
            Loading promotion preview…
          </div>
        )}

        {previewQuery.isError && (
          <div className="promotion-modal__error" role="alert">
            <AlertTriangle size={16} />
            <span>Failed to load preview.</span>
            <button type="button" onClick={() => void previewQuery.refetch()}>Retry</button>
          </div>
        )}

        {previewQuery.data && (
          <>
            <div className="promotion-modal__body">
              <div className="promotion-modal__field">
                <label htmlFor="promotion-title">Incident Title</label>
                <input
                  id="promotion-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              <div className="promotion-modal__field">
                <label htmlFor="promotion-severity">Severity</label>
                <select
                  id="promotion-severity"
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(e.target.value as SeverityLevel)}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div className="promotion-modal__summary">
                <dl>
                  <div>
                    <dt>Entities</dt>
                    <dd>{previewQuery.data.preview.entities.length}</dd>
                  </div>
                  <div>
                    <dt>Alerts</dt>
                    <dd>{previewQuery.data.preview.alertCount}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{previewQuery.data.preview.evidenceCount}</dd>
                  </div>
                  <div>
                    <dt>Tactics</dt>
                    <dd>{previewQuery.data.preview.mitreTactics.length}</dd>
                  </div>
                </dl>
              </div>

              {previewQuery.data.preview.timeline.length > 0 && (
                <div className="promotion-modal__timeline">
                  <h4>Timeline Preview</h4>
                  <ol>
                    {previewQuery.data.preview.timeline.map((entry, i) => (
                      <li key={i}>
                        <time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                        <span>{entry.stage}</span>
                        <small>{entry.description}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {previewQuery.data.warnings.length > 0 && (
                <div className="promotion-modal__warnings">
                  {previewQuery.data.warnings.map((warning, i) => (
                    <p key={i} className="promotion-modal__warning">
                      <AlertTriangle size={13} />
                      {warning}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {executeMutation.isError && (
              <p className="promotion-modal__mutation-error" role="alert">
                Promotion failed. No records were changed.
              </p>
            )}

            <footer className="promotion-modal__footer">
              <button
                type="button"
                onClick={onClose}
                disabled={executeMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="promotion-modal__confirm"
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending || !editTitle.trim()}
              >
                <CheckCircle2 size={14} />
                {executeMutation.isPending ? 'Creating…' : 'Create Incident'}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
