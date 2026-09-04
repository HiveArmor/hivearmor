/**
 * PromotionModal — Promotion action workflow (preview + execute / approval request).
 *
 * Honesty rules:
 * - When preview.approvalRequired, Confirm requests SOC Manager approval — it does not claim promotion success.
 * - Execute only runs when approval is not required (or when an approved approvalId is supplied later).
 * - Fixture mode is handled upstream; this modal always talks to live promote/approval APIs.
 */

import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Scale,
  Search,
  Shield,
} from 'lucide-react';

import {
  executePromotion,
  isHuntApprovalRequiredError,
  previewPromotion,
  requestHuntPromotionApproval,
} from '../searchHunt.service';
import type { HuntPromotionApproval, PromotionPreview, PromotionResult } from '../searchHunt.types';

import { HaModal } from '@/components/ha-modal/HaModal';
import { ROLE_LABELS, ROLES } from '@/lib/roles';

const PROMOTE_DENIED = `Required permission: ${ROLE_LABELS[ROLES.ANALYST]}, ${ROLE_LABELS[ROLES.SOC_MANAGER]}, or ${ROLE_LABELS[ROLES.ADMIN]}`;
const MANAGER_APPROVAL_LABEL = ROLE_LABELS[ROLES.SOC_MANAGER];

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
  canPromote = true,
}: {
  selectedCount: number;
  onAction: (action: PromotionAction) => void;
  canPromote?: boolean;
}): JSX.Element | null {
  if (selectedCount === 0) return null;

  return (
    <div className="hunt-promotion-bar" role="toolbar" aria-label="Promotion actions">
      <span className="hunt-promotion-bar__count">
        <strong>{selectedCount}</strong> event{selectedCount !== 1 ? 's' : ''} selected
      </span>
      {!canPromote && (
        <span className="hunt-promotion-bar__deny" title={PROMOTE_DENIED}>
          {PROMOTE_DENIED}
        </span>
      )}
      <div className="hunt-promotion-bar__actions">
        <button
          type="button"
          className="hunt-button"
          disabled={!canPromote}
          onClick={() => onAction('create_evidence')}
        >
          <FileText size={13} />
          Create Evidence
        </button>
        <button
          type="button"
          className="hunt-button"
          disabled={!canPromote}
          onClick={() => onAction('create_investigation')}
        >
          <Search size={13} />
          Create Investigation
        </button>
        <button
          type="button"
          className="hunt-button hunt-button--primary"
          disabled={!canPromote}
          onClick={() => onAction('escalate_incident')}
        >
          <Shield size={13} />
          Escalate to Incident
        </button>
      </div>
    </div>
  );
}

type TerminalState =
  | { kind: 'created'; result: PromotionResult }
  | { kind: 'approval_pending'; approval: HuntPromotionApproval };

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
  const [terminal, setTerminal] = useState<TerminalState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      parameters?: Record<string, string>;
    }) => executePromotion(params),
    onSuccess: (data) => {
      setTerminal({ kind: 'created', result: data });
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      if (isHuntApprovalRequiredError(error)) {
        setErrorMessage(
          `${MANAGER_APPROVAL_LABEL} approval is required. Request approval first — this action was not executed.`,
        );
      } else if (error instanceof Error && /403|forbidden/i.test(error.message)) {
        setErrorMessage(PROMOTE_DENIED);
      } else {
        setErrorMessage('Promotion failed. Check the event selection and try again.');
      }
    },
  });

  const approvalMutation = useMutation({
    mutationFn: (params: {
      action: string;
      eventIds: string[];
      searchId: string;
      previewToken: string;
      rationale: string;
    }) => requestHuntPromotionApproval(params),
    onSuccess: (data) => {
      setTerminal({ kind: 'approval_pending', approval: data });
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      if (error instanceof Error && /403|forbidden/i.test(error.message)) {
        setErrorMessage(PROMOTE_DENIED);
      } else {
        setErrorMessage('Approval request failed. No promotion was executed.');
      }
    },
  });

  const handleStartAction = useCallback(
    (selectedAction: PromotionAction): void => {
      setAction(selectedAction);
      setPreview(null);
      setTerminal(null);
      setErrorMessage(null);
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

  const approvalRequired = preview?.approvalRequired === true;

  const handleConfirm = useCallback((): void => {
    if (!action || !preview) return;
    const rationale = description.trim() || title.trim();
    if (approvalRequired) {
      approvalMutation.mutate({
        action,
        eventIds: selectedEventIds,
        searchId,
        previewToken: preview.previewToken,
        rationale,
      });
      return;
    }
    executeMutation.mutate({
      action,
      eventIds: selectedEventIds,
      searchId,
      title: title.trim(),
      description: description.trim(),
      previewToken: preview.previewToken,
    });
  }, [
    action,
    preview,
    approvalRequired,
    selectedEventIds,
    searchId,
    title,
    description,
    executeMutation,
    approvalMutation,
  ]);

  const handleRetry = useCallback((): void => {
    setErrorMessage(null);
    handleConfirm();
  }, [handleConfirm]);

  const handleClose = useCallback((): void => {
    setAction(null);
    setPreview(null);
    setTerminal(null);
    setErrorMessage(null);
    onClose();
  }, [onClose]);

  // Close after a created promotion; approval-pending waits for explicit dismiss.
  useEffect(() => {
    if (terminal?.kind === 'created') {
      const timer = setTimeout(() => {
        onSuccess();
        handleClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [terminal, onSuccess, handleClose]);

  if (!action) return null;

  const actionMeta = ACTION_LABELS[action];
  const ActionIcon = actionMeta.icon;
  const isLoading = previewMutation.isPending;
  const isBusy = executeMutation.isPending || approvalMutation.isPending;

  return (
    <HaModal isOpen onClose={handleClose} title={actionMeta.title} width={640} className="hunt-promotion-modal">
        <div className="hunt-promotion-modal__intro">
          <span className="hunt-promotion-modal__label">PROMOTION</span>
          <span className="hunt-promotion-modal__intro-icon"><ActionIcon size={16} /></span>
        </div>

        <div className="hunt-promotion-modal__body">
          {isLoading && (
            <div className="hunt-promotion-modal__loading">
              <span>Analyzing {selectedEventIds.length} events…</span>
            </div>
          )}

          {previewMutation.isError && (
            <div className="hunt-promotion-modal__error" role="alert">
              <AlertTriangle size={16} />
              <span>
                {/403|forbidden/i.test(String(previewMutation.error))
                  ? PROMOTE_DENIED
                  : 'Failed to generate preview. Please try again.'}
              </span>
              <button type="button" className="hunt-button" onClick={() => handleStartAction(action)}>
                Retry
              </button>
            </div>
          )}

          {preview && !terminal && (
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

              {approvalRequired && (
                <div className="hunt-promotion-modal__approval" role="status">
                  <Clock3 size={14} />
                  <div>
                    <strong>{MANAGER_APPROVAL_LABEL} approval required</strong>
                    <p>
                      Escalate and investigation promotions (and large evidence batches) cannot execute until a{' '}
                      {MANAGER_APPROVAL_LABEL} approves. Confirming will request approval — it will not create the
                      resource yet.
                    </p>
                  </div>
                </div>
              )}

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

              {errorMessage && (
                <div className="hunt-promotion-modal__error" role="alert">
                  <AlertTriangle size={16} />
                  <span>{errorMessage}</span>
                  <button type="button" className="hunt-button" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              )}
            </>
          )}

          {terminal?.kind === 'created' && (
            <div className="hunt-promotion-modal__success" role="status">
              <CheckCircle2 size={24} />
              <h3>Promotion Successful</h3>
              <p>
                {actionMeta.title} completed. Resource created successfully.
              </p>
              <a
                href={terminal.result.url}
                className="hunt-button hunt-button--primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={13} />
                View {terminal.result.resultType}
              </a>
            </div>
          )}

          {terminal?.kind === 'approval_pending' && (
            <div className="hunt-promotion-modal__pending" role="status">
              <Clock3 size={24} />
              <h3>Approval requested</h3>
              <p>
                No incident, investigation, or evidence was created. A SOC Manager must approve before execute.
              </p>
              <small className="hunt-promotion-modal__pending-id">
                Approval ID · {terminal.approval.approvalId}
              </small>
              <p className="hunt-promotion-modal__pending-status">
                Status: {terminal.approval.status}
              </p>
            </div>
          )}
        </div>

        {preview && !terminal && (
          <footer className="hunt-promotion-modal__footer">
            <button
              type="button"
              className="hunt-button"
              onClick={handleClose}
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hunt-button hunt-button--primary"
              onClick={handleConfirm}
              disabled={isBusy || !title.trim()}
            >
              <Scale size={13} />
              {isBusy
                ? approvalRequired
                  ? 'Requesting…'
                  : 'Promoting…'
                : approvalRequired
                  ? 'Request approval'
                  : 'Confirm'}
            </button>
          </footer>
        )}

        {terminal?.kind === 'approval_pending' && (
          <footer className="hunt-promotion-modal__footer">
            <button type="button" className="hunt-button hunt-button--primary" onClick={() => { onSuccess(); handleClose(); }}>
              Done
            </button>
          </footer>
        )}
    </HaModal>
  );
}
