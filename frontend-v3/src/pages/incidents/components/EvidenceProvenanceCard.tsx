/**
 * EvidenceProvenanceCard — Evidence card with provenance fields,
 * custody timeline visualization, classification badge.
 */

import { useCallback, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Lock, Shield, Upload } from 'lucide-react';

import { addCustodyEvent, updateEvidenceClassification } from '../services/incident-workbench.service';
import type {
  AddCustodyEventBody,
  CustodyAction,
  CustodyEvent,
  EvidenceClassification,
  EvidenceProvenance,
} from '../types/incident-workbench.types';

export interface EvidenceProvenanceCardProps {
  incidentId: string;
  evidence: EvidenceProvenance;
}

const CLASSIFICATION_LABELS: Record<EvidenceClassification, string> = {
  unclassified: 'Unclassified',
  internal: 'Internal',
  confidential: 'Confidential',
  restricted: 'Restricted',
};

const CUSTODY_ACTION_LABELS: Record<CustodyAction, string> = {
  collected: 'Collected',
  analyzed: 'Analyzed',
  transferred: 'Transferred',
  archived: 'Archived',
  exported: 'Exported',
};

const SOURCE_ICONS: Record<string, JSX.Element> = {
  endpoint_agent: <Shield size={14} aria-hidden="true" />,
  opensearch: <FileCheck2 size={14} aria-hidden="true" />,
  manual_upload: <Upload size={14} aria-hidden="true" />,
  network_tap: <Lock size={14} aria-hidden="true" />,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EvidenceProvenanceCard({ incidentId, evidence }: EvidenceProvenanceCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const [showCustodyForm, setShowCustodyForm] = useState(false);
  const [custodyAction, setCustodyAction] = useState<CustodyAction>('analyzed');
  const [custodyNotes, setCustodyNotes] = useState('');
  const [showClassificationMenu, setShowClassificationMenu] = useState(false);

  const custodyMutation = useMutation({
    mutationFn: (body: AddCustodyEventBody) => addCustodyEvent(incidentId, evidence.id, body),
    onSuccess: () => {
      setShowCustodyForm(false);
      setCustodyNotes('');
      void queryClient.invalidateQueries({ queryKey: ['incident-evidence', incidentId] });
    },
  });

  const classificationMutation = useMutation({
    mutationFn: (classification: EvidenceClassification) =>
      updateEvidenceClassification(incidentId, evidence.id, { classification }),
    onSuccess: () => {
      setShowClassificationMenu(false);
      void queryClient.invalidateQueries({ queryKey: ['incident-evidence', incidentId] });
    },
  });

  const handleAddCustody = useCallback(() => {
    if (custodyMutation.isPending) return;
    custodyMutation.mutate({
      action: custodyAction,
      notes: custodyNotes.trim() || undefined,
    });
  }, [custodyAction, custodyNotes, custodyMutation]);

  return (
    <article className="evidence-provenance-card" aria-label={`Evidence: ${evidence.title}`}>
      <div className="evidence-provenance-card__header">
        <div className="evidence-provenance-card__icon">
          {SOURCE_ICONS[evidence.sourceSystem] ?? <FileCheck2 size={14} aria-hidden="true" />}
        </div>
        <div className="evidence-provenance-card__title-row">
          <h3 className="evidence-provenance-card__title">{evidence.title}</h3>
          <span className="evidence-provenance-card__type">{evidence.type}</span>
        </div>
        <div className="evidence-provenance-card__classification-wrapper">
          <button
            className="evidence-provenance-card__classification"
            type="button"
            data-classification={evidence.classification}
            onClick={() => setShowClassificationMenu(!showClassificationMenu)}
            aria-expanded={showClassificationMenu}
            aria-label={`Classification: ${CLASSIFICATION_LABELS[evidence.classification]}`}
          >
            {CLASSIFICATION_LABELS[evidence.classification]}
          </button>
          {showClassificationMenu && (
            <ul className="evidence-provenance-card__class-menu" role="listbox" aria-label="Change classification">
              {(Object.keys(CLASSIFICATION_LABELS) as EvidenceClassification[]).map((cls) => (
                <li key={cls}>
                  <button
                    className="evidence-provenance-card__class-option"
                    type="button"
                    role="option"
                    aria-selected={cls === evidence.classification}
                    disabled={classificationMutation.isPending}
                    onClick={() => classificationMutation.mutate(cls)}
                  >
                    {CLASSIFICATION_LABELS[cls]}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="evidence-provenance-card__meta">
        <span>Source: {evidence.sourceSystem}</span>
        <span>Size: {formatFileSize(evidence.size)}</span>
        <span className="evidence-provenance-card__hash" title={evidence.sha256}>
          SHA-256: {evidence.sha256.slice(0, 12)}…
        </span>
        <time dateTime={evidence.collectedAt}>Collected: {formatTimestamp(evidence.collectedAt)}</time>
      </div>

      {/* Custody Timeline */}
      <div className="evidence-provenance-card__custody" aria-label="Chain of custody">
        <h4 className="evidence-provenance-card__custody-title">Chain of Custody</h4>
        <ol className="evidence-provenance-card__custody-timeline">
          {evidence.custodyEvents.map((event: CustodyEvent, idx) => (
            <li className="evidence-provenance-card__custody-event" key={idx} data-action={event.action}>
              <span className="evidence-provenance-card__custody-dot" aria-hidden="true" />
              <div className="evidence-provenance-card__custody-content">
                <strong>{CUSTODY_ACTION_LABELS[event.action]}</strong>
                <span>{event.actor}</span>
                <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
                {event.notes && <p className="evidence-provenance-card__custody-notes">{event.notes}</p>}
              </div>
            </li>
          ))}
        </ol>

        <button
          className="evidence-provenance-card__add-custody-btn"
          type="button"
          onClick={() => setShowCustodyForm(!showCustodyForm)}
          aria-expanded={showCustodyForm}
        >
          + Add custody event
        </button>

        {showCustodyForm && (
          <div className="evidence-provenance-card__custody-form">
            <select
              className="evidence-provenance-card__custody-select"
              value={custodyAction}
              onChange={(e) => setCustodyAction(e.target.value as CustodyAction)}
              aria-label="Custody action"
            >
              {(Object.keys(CUSTODY_ACTION_LABELS) as CustodyAction[]).map((action) => (
                <option key={action} value={action}>{CUSTODY_ACTION_LABELS[action]}</option>
              ))}
            </select>
            <input
              className="evidence-provenance-card__custody-notes-input"
              type="text"
              placeholder="Notes (optional)"
              value={custodyNotes}
              onChange={(e) => setCustodyNotes(e.target.value)}
              aria-label="Custody event notes"
            />
            <button
              className="evidence-provenance-card__custody-submit"
              type="button"
              onClick={handleAddCustody}
              disabled={custodyMutation.isPending}
            >
              {custodyMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
