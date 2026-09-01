import {
  Image,
  FileText,
  Hash,
  File,
  Network,
  StickyNote,
  Edit2,
  Trash2,
} from 'lucide-react';

import { HaCard } from '@/components/ha-card';
import type { EvidenceItem } from '@/types/api.types';

import './EvidenceCard.css';

export interface EvidenceCardProps {
  evidence: EvidenceItem;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const EVIDENCE_ICONS = {
  screenshot: Image,
  log_excerpt: FileText,
  file_hash: Hash,
  file: File,
  network_capture: Network,
  note: StickyNote,
};

export function EvidenceCard({ evidence, onEdit, onDelete }: EvidenceCardProps): JSX.Element {
  const Icon = EVIDENCE_ICONS[evidence.type];

  return (
    <HaCard className="evidence-card">
      <HaCard.Header>
        <div className="evidence-card__title">
          <Icon size={16} className="evidence-card__icon" aria-hidden="true" />
          <span className="evidence-card__name">{evidence.title}</span>
        </div>
        <span className="evidence-card__time">
          {new Date(evidence.timestamp).toLocaleString()}
        </span>
      </HaCard.Header>

      <HaCard.Body className="evidence-card__content">
        {evidence.type === 'log_excerpt' && (
          <pre className="evidence-card__log">{evidence.content}</pre>
        )}
        {evidence.type === 'note' && <p className="evidence-card__note">{evidence.content}</p>}
        {evidence.type === 'file_hash' && (
          <div className="evidence-card__hash">{evidence.content}</div>
        )}
        {(evidence.type === 'screenshot' ||
          evidence.type === 'file' ||
          evidence.type === 'network_capture') && (
          <div className="evidence-card__meta-text">{evidence.content}</div>
        )}
      </HaCard.Body>

      <HaCard.Footer>
        <span className="evidence-card__added">Added by {evidence.addedBy}</span>
        <div className="evidence-card__actions">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(evidence.id)}
              className="evidence-card__action"
              aria-label="Edit evidence"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(evidence.id)}
              className="evidence-card__action"
              aria-label="Delete evidence"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </HaCard.Footer>
    </HaCard>
  );
}
