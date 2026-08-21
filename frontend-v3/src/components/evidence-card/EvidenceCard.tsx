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

import type { EvidenceItem } from '@/types/api.types';

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
    <div
      className="evidence-card"
      style={{
        background: 'var(--ha-surface-raised)',
        border: '1px solid var(--ha-border)',
        borderRadius: 'var(--ha-radius-lg)',
        boxShadow: 'var(--ha-shadow-low)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <Icon size={16} style={{ color: 'var(--ha-primary)' }} />
          <span
            style={{
              fontSize: 'var(--ha-text-sm)',
              fontWeight: 'var(--ha-weight-semibold)',
              color: 'var(--ha-text-primary)',
            }}
          >
            {evidence.title}
          </span>
          <span
            style={{
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-secondary)',
              marginLeft: 'auto',
            }}
          >
            {new Date(evidence.timestamp).toLocaleString()}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '16px',
          maxHeight: '200px',
          overflowY: 'auto',
        }}
      >
        {evidence.type === 'log_excerpt' && (
          <pre
            style={{
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {evidence.content}
          </pre>
        )}
        {evidence.type === 'note' && (
          <p
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-primary)',
              margin: 0,
            }}
          >
            {evidence.content}
          </p>
        )}
        {evidence.type === 'file_hash' && (
          <div
            style={{
              fontFamily: 'var(--ha-font-mono)',
              fontSize: 'var(--ha-text-xs)',
              color: 'var(--ha-text-primary)',
            }}
          >
            {evidence.content}
          </div>
        )}
        {(evidence.type === 'screenshot' ||
          evidence.type === 'file' ||
          evidence.type === 'network_capture') && (
          <div
            style={{
              fontSize: 'var(--ha-text-sm)',
              color: 'var(--ha-text-secondary)',
            }}
          >
            {evidence.content}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--ha-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 'var(--ha-text-xs)',
            color: 'var(--ha-text-secondary)',
          }}
        >
          Added by {evidence.addedBy}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onEdit && (
            <button
              onClick={() => onEdit(evidence.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--ha-text-secondary)',
              }}
              aria-label="Edit evidence"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(evidence.id)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--ha-text-secondary)',
              }}
              aria-label="Delete evidence"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
