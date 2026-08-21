/**
 * ResponseActionsPanel — Action cards by category, preview modal with impact assessment, execute confirmation.
 */

import { useCallback, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Shield, ShieldAlert, Trash2, Search as SearchIcon } from 'lucide-react';

import { executeAction, listResponseActions, previewAction } from '../services/incident-workbench.service';
import type {
  ActionCategory,
  ActionPreview,
  ExecuteActionBody,
  ResponseAction,
} from '../types/incident-workbench.types';

export interface ResponseActionsPanelProps {
  incidentId: string;
}

const CATEGORY_ICONS: Record<ActionCategory, JSX.Element> = {
  containment: <Shield size={14} aria-hidden="true" />,
  eradication: <Trash2 size={14} aria-hidden="true" />,
  recovery: <Play size={14} aria-hidden="true" />,
  investigation: <SearchIcon size={14} aria-hidden="true" />,
};

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  containment: 'Containment',
  eradication: 'Eradication',
  recovery: 'Recovery',
  investigation: 'Investigation',
};

export function ResponseActionsPanel({ incidentId }: ResponseActionsPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ActionPreview | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [executeNotes, setExecuteNotes] = useState('');

  const actionsQuery = useQuery({
    queryKey: ['response-actions', incidentId],
    queryFn: () => listResponseActions(incidentId),
    staleTime: 30_000,
  });

  const previewMutation = useMutation({
    mutationFn: (actionId: string) => previewAction(incidentId, actionId),
    onSuccess: (data) => {
      setPreview(data);
      setConfirmExecute(false);
    },
  });

  const executeMutation = useMutation({
    mutationFn: (body: ExecuteActionBody & { actionId: string }) =>
      executeAction(incidentId, body.actionId, { previewToken: body.previewToken, notes: body.notes }),
    onSuccess: () => {
      setPreview(null);
      setConfirmExecute(false);
      setExecuteNotes('');
      void queryClient.invalidateQueries({ queryKey: ['incident-activity', incidentId] });
    },
  });

  const handlePreview = useCallback(
    (actionId: string) => {
      previewMutation.mutate(actionId);
    },
    [previewMutation]
  );

  const handleExecute = useCallback(() => {
    if (!preview) return;
    executeMutation.mutate({
      actionId: preview.actionId,
      previewToken: preview.previewToken,
      notes: executeNotes.trim() || undefined,
    });
  }, [preview, executeNotes, executeMutation]);

  const actions: ResponseAction[] = actionsQuery.data ?? [];
  const grouped = actions.reduce<Record<ActionCategory, ResponseAction[]>>(
    (acc, action) => {
      (acc[action.category] ??= []).push(action);
      return acc;
    },
    { containment: [], eradication: [], recovery: [], investigation: [] }
  );

  if (actionsQuery.isLoading) {
    return (
      <section className="response-actions-panel" aria-label="Response actions" aria-busy="true">
        <h2 className="response-actions-panel__title">
          <ShieldAlert size={15} aria-hidden="true" /> Response Actions
        </h2>
        <div className="response-actions-panel__loading">Loading available actions…</div>
      </section>
    );
  }

  if (actionsQuery.isError) {
    return (
      <section className="response-actions-panel" aria-label="Response actions">
        <h2 className="response-actions-panel__title">
          <ShieldAlert size={15} aria-hidden="true" /> Response Actions
        </h2>
        <div className="response-actions-panel__error" role="alert">
          Could not load response actions.{' '}
          <button type="button" onClick={() => void actionsQuery.refetch()}>Retry</button>
        </div>
      </section>
    );
  }

  return (
    <section className="response-actions-panel" aria-label="Response actions">
      <h2 className="response-actions-panel__title">
        <ShieldAlert size={15} aria-hidden="true" /> Response Actions
      </h2>

      {actions.length === 0 && (
        <div className="response-actions-panel__empty">No response actions available for this incident.</div>
      )}

      {(Object.entries(grouped) as Array<[ActionCategory, ResponseAction[]]>)
        .filter(([, items]) => items.length > 0)
        .map(([category, items]) => (
          <div className="response-actions-panel__category" key={category}>
            <h3 className="response-actions-panel__category-title">
              {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
            </h3>
            <div className="response-actions-panel__cards">
              {items.map((action) => (
                <article className="response-action-card" key={action.id} data-enabled={String(action.enabled)}>
                  <strong className="response-action-card__name">{action.name}</strong>
                  <p className="response-action-card__desc">{action.description}</p>
                  {action.targets.length > 0 && (
                    <span className="response-action-card__targets">
                      {action.targets.length} target{action.targets.length === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    className="response-action-card__preview-btn"
                    type="button"
                    onClick={() => handlePreview(action.id)}
                    disabled={!action.enabled || previewMutation.isPending}
                  >
                    Preview
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))}

      {/* Preview Modal */}
      {preview && (
        <div className="response-actions-panel__overlay" role="dialog" aria-modal="true" aria-label="Action preview">
          <div className="response-actions-panel__modal">
            <h3>{preview.name}</h3>

            <div className="response-actions-panel__impact">
              <strong>Impact Assessment</strong>
              <p>{preview.impact.description}</p>
              <ul>
                {preview.impact.affectedSystems.map((sys, idx) => (
                  <li key={idx}>{sys}</li>
                ))}
              </ul>
              <span data-reversible={String(preview.impact.reversible)}>
                {preview.impact.reversible ? 'Reversible' : 'Irreversible'}
              </span>
            </div>

            <div className="response-actions-panel__targets-list">
              <strong>Targets:</strong>
              {preview.targets.map((t, idx) => (
                <span key={idx} className="response-actions-panel__target-chip">{t.type} · {t.value}</span>
              ))}
            </div>

            {!preview.executionReady && (
              <div className="response-actions-panel__readiness" role="status">
                Execution is unavailable until the backend confirms connector health, tenant policy, target support, and approval readiness.
              </div>
            )}

            {!confirmExecute ? (
              <div className="response-actions-panel__modal-actions">
                <button
                  className="response-actions-panel__exec-btn"
                  type="button"
                  data-variant="primary"
                  onClick={() => setConfirmExecute(true)}
                  disabled={!preview.executionReady}
                >
                  {preview.executionReady ? 'Continue to execution' : 'Execution unavailable'}
                </button>
                <button
                  className="response-actions-panel__cancel-btn"
                  type="button"
                  onClick={() => setPreview(null)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="response-actions-panel__confirm">
                <p className="response-actions-panel__confirm-text">
                  Are you sure you want to execute this action? This will affect {preview.targets.length} target{preview.targets.length === 1 ? '' : 's'}.
                </p>
                <textarea
                  className="response-actions-panel__notes-input"
                  placeholder="Execution notes (optional)"
                  value={executeNotes}
                  onChange={(e) => setExecuteNotes(e.target.value)}
                  aria-label="Execution notes"
                  rows={3}
                />
                <div className="response-actions-panel__modal-actions">
                  <button
                    className="response-actions-panel__exec-btn"
                    type="button"
                    data-variant="danger"
                    onClick={handleExecute}
                    disabled={executeMutation.isPending}
                  >
                    {executeMutation.isPending ? 'Executing…' : 'Confirm Execute'}
                  </button>
                  <button
                    className="response-actions-panel__cancel-btn"
                    type="button"
                    onClick={() => {
                      setConfirmExecute(false);
                      setPreview(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
