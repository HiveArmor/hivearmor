/**
 * PromotionModal — Promotion action workflow (preview + execute).
 *
 * Handles the full promotion lifecycle:
 * 1. Action bar appears when events are selected (Create Evidence, Create Investigation, Escalate to Incident)
 * 2. Button click calls previewPromotion() to get entity extraction and suggestions
 * 3. Modal shows preview: action type, event count, entities (chips), editable title/description, warnings
 * 4. Confirm calls executePromotion() with previewToken
 * 5. Success → toast with link to created resource; deselect events
 * 6. Failure → error toast with retry option
 */

import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Scale,
  Search,
  Shield,
  X,
} from 'lucide-react';

import {
  executePromotion,
  previewPromotion,
} from '../searchHunt.service';
import type { PromotionPreview, PromotionResult } from '../searchHunt.types';

export type PromotionAction = 'create_evidence' | 'create_investigation' | 'escalate_incident';

export interface PromotionModalProps {
  selectedEventIds: string[];
  searchId: string;
  initialAction: PromotionAction;
  onSuccess: () => void;
  onClose: () => void;
}

const ACTION_LABELS: Record<PromotionAction, { title: string; icon: typeof FileText; description: string }> = {
  create_evidence: {
    title: 'Create Evidence',
    icon: FileText,
    description: 'Package selected events into an evidence record for an existing or new case.',
  },
  create_investigation: {
    title: 'Create Investigation',
    icon: Search,
    description: 'Start a new investigation using the selected events as initial scope.',
  },
  escalate_incident: {
    title: 'Escalate to Incident',
    icon: Shield,
    description: 'Promote the selected events into a tracked security incident.',
  },
};

export function PromotionActionBar({
  selectedCount,
  onAction,
}: {
  selectedCount: number;
  onAction: (action: PromotionAction) => void;
}): JSX.Element | null {
  if (selectedCount === 0) return null;

  return (
    <div className="hunt-promotion-bar" role="toolbar" aria-label="Promotion actions">
      <span className="hunt-promotion-bar__count">
        <strong>{selectedCount}</strong> event{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="hunt-promotion-bar__actions">
        <button
          type="button"
          className="hunt-button"
          onClick={() => onAction('create_evidence')}
        >
          <FileText size={13} />
          Create Evidence
        </button>
        <button
          type="button"
          className="hunt-button"
          onClick={() => onAction('create_investigation')}
        >
          <Search size={13} />
          Create Investigation
        </button>
        <button
          type="button"
          className="hunt-button hunt-button--primary"
          onClick={() => onAction('escalate_incident')}
        >
          <Shield size={13} />
          Escalate to Incident
        </button>
      </div>
    </div>
  );
}

export function PromotionModal({
  selectedEventIds,
  searchId,
  initialAction,
  onSuccess,
  onClose,
}: PromotionModalProps): JSX.Element | null {
  const [action, setAction] = useState<PromotionAction | null>(initialAction);
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [showError, setShowError] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (params: { action: string; eventIds: string[]; searchId: string }) =>
      previewPromotion(params),
    onSuccess: (data) => {
      setPreview(data);
      setTitle(data.preview.title);
      setDescription(data.preview.description);
    },
  });

  const executeMutation = useMutation({
    mutationFn: (params: {
      action: string;
      eventIds: string[];
      searchId: string;
      title: string;
      description: string;
      previewToken: string;
    }) => executePromotion(params),
    onSuccess: (data) => {
      setResult(data);
      setShowError(false);
    },
    onError: () => {
      setShowError(true);
    },
  });

  const handleStartAction = useCallback(
    (selectedAction: PromotionAction): void => {
      setAction(selectedAction);
      setPreview(null);
      setResult(null);
      setShowError(false);
      previewMutation.mutate({
        action: selectedAction,
        eventIds: selectedEventIds,
        searchId,
      });
    },
    [selectedEventIds, searchId, previewMutation],
  );

  // Trigger preview on mount with initialAction
  useEffect(() => {
    if (initialAction && !preview && !previewMutation.isPending && !previewMutation.isError) {
      previewMutation.mutate({
        action: initialAction,
        eventIds: selectedEventIds,
        searchId,
      });
    }
  // Only trigger on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = useCallback((): void => {
    if (!action || !preview) return;
    executeMutation.mutate({
      action,
      eventIds: selectedEventIds,
      searchId,
      title: title.trim(),
      description: description.trim(),
      previewToken: preview.previewToken,
    });
  }, [action, preview, selectedEventIds, searchId, title, description, executeMutation]);

  const handleRetry = useCallback((): void => {
    setShowError(false);
    handleConfirm();
  }, [handleConfirm]);

  const handleClose = useCallback((): void => {
    setAction(null);
    setPreview(null);
    setResult(null);
    setShowError(false);
    onClose();
  }, [onClose]);

  // On success, notify parent to deselect and close
  useEffect(() => {
    if (result) {
      // Allow the success state to display briefly
      const timer = setTimeout(() => {
        onSuccess();
        handleClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [result, onSuccess, handleClose]);

  if (!action) return null;

  const actionMeta = ACTION_LABELS[action];
  const ActionIcon = actionMeta.icon;
  const isLoading = previewMutation.isPending;
  const isExecuting = executeMutation.isPending;

  return (
    <div className="hunt-promotion-overlay" role="dialog" aria-modal="true" aria-labelledby="promotion-modal-title">
      <div className="hunt-promotion-backdrop" onClick={handleClose} />
      <div className="hunt-promotion-modal">
        <header className="hunt-promotion-modal__header">
          <div>
            <span className="hunt-promotion-modal__label">PROMOTION</span>
            <h2 id="promotion-modal-title">
              <ActionIcon size={16} />
              {actionMeta.title}
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close promotion modal">
            <X size={17} />
          </button>
        </header>

        <div className="hunt-promotion-modal__body">
          {isLoading && (
            <div className="hunt-promotion-modal__loading">
              <span>Analyzing {selectedEventIds.length} events…</span>
            </div>
          )}

          {previewMutation.isError && (
            <div className="hunt-promotion-modal__error" role="alert">
              <AlertTriangle size={16} />
              <span>Failed to generate preview. Please try again.</span>
              <button type="button" className="hunt-button" onClick={() => handleStartAction(action)}>
                Retry
              </button>
            </div>
          )}

          {preview && !result && (
            <>
              <div className="hunt-promotion-modal__summary">
                <span className="hunt-promotion-modal__action-type">
                  <ActionIcon size={13} />
                  {actionMeta.title}
                </span>
                <span className="hunt-promotion-modal__event-count">
                  {preview.eventCount} event{preview.eventCount !== 1 ? 's' : ''}
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div className="hunt-promotion-modal__warnings" role="alert">
                  <AlertTriangle size={14} />
                  <div>
                    {preview.warnings.map((warning, index) => (
                      <p key={index}>{warning}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="hunt-promotion-modal__entities">
                <label>Extracted Entities</label>
                <div className="hunt-promotion-modal__chips">
                  {preview.preview.entities.length > 0 ? (
                    preview.preview.entities.map((entity) => (
                      <span key={entity} className="hunt-promotion-chip">
                        {entity}
                      </span>
                    ))
                  ) : (
                    <span className="hunt-promotion-modal__no-entities">No entities extracted</span>
                  )}
                </div>
              </div>

              <div className="hunt-promotion-modal__field">
                <label htmlFor="promotion-title">Title</label>
                <input
                  id="promotion-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title…"
                />
              </div>

              <div className="hunt-promotion-modal__field">
                <label htmlFor="promotion-description">Description</label>
                <textarea
                  id="promotion-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the promotion…"
                  rows={4}
                />
              </div>

              {showError && (
                <div className="hunt-promotion-modal__error" role="alert">
                  <AlertTriangle size={16} />
                  <span>Promotion failed. Check the event selection and try again.</span>
                  <button type="button" className="hunt-button" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="hunt-promotion-modal__success" role="status">
              <CheckCircle2 size={24} />
              <h3>Promotion Successful</h3>
              <p>
                {actionMeta.title} completed. Resource created successfully.
              </p>
              <a
                href={result.url}
                className="hunt-button hunt-button--primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={13} />
                View {result.resultType}
              </a>
            </div>
          )}
        </div>

        {preview && !result && (
          <footer className="hunt-promotion-modal__footer">
            <button
              type="button"
              className="hunt-button"
              onClick={handleClose}
              disabled={isExecuting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hunt-button hunt-button--primary"
              onClick={handleConfirm}
              disabled={isExecuting || !title.trim()}
            >
              <Scale size={13} />
              {isExecuting ? 'Promoting…' : 'Confirm'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
