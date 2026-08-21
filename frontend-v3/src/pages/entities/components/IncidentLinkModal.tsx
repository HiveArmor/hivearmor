/**
 * IncidentLinkModal — Sprint 46
 * Two-phase modal for linking an entity to an incident:
 * 1. Preview: shows what will be linked without side effects
 * 2. Execute: creates or updates the incident
 *
 * Supports "Create New Incident" and "Link to Existing" flows.
 */

import { useCallback, useState } from 'react';

import { Spinner } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check, Link2, Plus, X } from 'lucide-react';

import { executeIncidentLink, previewIncidentLink } from '../services/dossier.service';
import type { IncidentLinkPreview, IncidentLinkResult } from '../types/dossier.types';

import './IncidentLinkModal.css';

export interface IncidentLinkModalProps {
  entityId: string;
  onClose: () => void;
}

type ModalPhase = 'choose' | 'preview' | 'success';

export function IncidentLinkModal({ entityId, onClose }: IncidentLinkModalProps): JSX.Element {
  const [phase, setPhase] = useState<ModalPhase>('choose');
  const [createNew, setCreateNew] = useState(true);
  const [existingIncidentId, setExistingIncidentId] = useState('');
  const [previewData, setPreviewData] = useState<IncidentLinkPreview | null>(null);
  const [result, setResult] = useState<IncidentLinkResult | null>(null);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('high');

  const previewMutation = useMutation({
    mutationFn: () =>
      previewIncidentLink(entityId, {
        createNew,
        incidentId: createNew ? undefined : existingIncidentId || undefined,
      }),
    onSuccess: (data) => {
      setPreviewData(data);
      setPhase('preview');
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!previewData) throw new Error('No preview token');
      return executeIncidentLink(entityId, {
        createNew,
        incidentId: createNew ? undefined : existingIncidentId || undefined,
        title: createNew ? title || undefined : undefined,
        severity: createNew ? severity : undefined,
        previewToken: previewData.previewToken,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setPhase('success');
    },
  });

  const handlePreview = useCallback(() => {
    previewMutation.mutate();
  }, [previewMutation]);

  const handleExecute = useCallback(() => {
    executeMutation.mutate();
  }, [executeMutation]);

  return (
    <div className="ha-link-modal__overlay" onClick={onClose}>
      <div
        className="ha-link-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
      >
        <header className="ha-link-modal__header">
          <Link2 size={16} />
          <h2 id="link-modal-title">Link to Incident</h2>
          <button type="button" className="ha-link-modal__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {phase === 'choose' && (
          <div className="ha-link-modal__body">
            <div className="ha-link-modal__options">
              <button
                type="button"
                className="ha-link-modal__option"
                data-selected={createNew}
                onClick={() => setCreateNew(true)}
              >
                <Plus size={16} />
                <span>Create New Incident</span>
                <small>Generate a new incident from this entity&apos;s context</small>
              </button>
              <button
                type="button"
                className="ha-link-modal__option"
                data-selected={!createNew}
                onClick={() => setCreateNew(false)}
              >
                <Link2 size={16} />
                <span>Link to Existing</span>
                <small>Add this entity to an existing incident</small>
              </button>
            </div>

            {createNew && (
              <div className="ha-link-modal__fields">
                <label>
                  <span>Title (optional)</span>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Auto-generated from entity context"
                  />
                </label>
                <label>
                  <span>Severity</span>
                  <select value={severity} onChange={e => setSeverity(e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
            )}

            {!createNew && (
              <div className="ha-link-modal__fields">
                <label>
                  <span>Incident ID</span>
                  <input
                    type="text"
                    value={existingIncidentId}
                    onChange={e => setExistingIncidentId(e.target.value)}
                    placeholder="Enter incident ID"
                  />
                </label>
              </div>
            )}

            <footer className="ha-link-modal__footer">
              <button type="button" className="ha-link-modal__cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ha-link-modal__primary"
                onClick={handlePreview}
                disabled={previewMutation.isPending || (!createNew && !existingIncidentId)}
              >
                {previewMutation.isPending ? <Spinner size="sm" aria-label="Loading" /> : 'Preview'}
              </button>
            </footer>

            {previewMutation.isError && (
              <div className="ha-link-modal__error">
                <AlertTriangle size={14} />
                <span>Failed to generate preview. Please try again.</span>
              </div>
            )}
          </div>
        )}

        {phase === 'preview' && previewData && (
          <div className="ha-link-modal__body">
            <div className="ha-link-modal__preview">
              <h3>Preview</h3>
              <p className="ha-link-modal__preview-text">
                {createNew
                  ? 'A new incident will be created with this entity as the primary subject. Unlinked alerts and relevant evidence will be attached.'
                  : `Entity will be linked to incident ${existingIncidentId}. Unlinked alerts will be associated.`}
              </p>
              <pre className="ha-link-modal__preview-data">
                {JSON.stringify(previewData.preview, null, 2)}
              </pre>
            </div>

            <footer className="ha-link-modal__footer">
              <button type="button" className="ha-link-modal__cancel" onClick={() => setPhase('choose')}>
                Back
              </button>
              <button
                type="button"
                className="ha-link-modal__primary"
                onClick={handleExecute}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? <Spinner size="sm" aria-label="Executing" /> : 'Confirm & Link'}
              </button>
            </footer>

            {executeMutation.isError && (
              <div className="ha-link-modal__error">
                <AlertTriangle size={14} />
                <span>Failed to execute linking. The preview token may have expired.</span>
              </div>
            )}
          </div>
        )}

        {phase === 'success' && result && (
          <div className="ha-link-modal__body">
            <div className="ha-link-modal__success">
              <Check size={24} />
              <h3>Entity Linked Successfully</h3>
              <dl>
                <div><dt>Incident ID</dt><dd>{result.incidentId}</dd></div>
                <div><dt>Status</dt><dd>{result.status}</dd></div>
                <div><dt>Linked Alerts</dt><dd>{result.linkedAlerts}</dd></div>
                <div><dt>Linked Evidence</dt><dd>{result.linkedEvidence}</dd></div>
              </dl>
            </div>
            <footer className="ha-link-modal__footer">
              <button type="button" className="ha-link-modal__primary" onClick={onClose}>
                Done
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
