/** Analyst-friendly evidence index and detail reader. */

import { useEffect, useState } from 'react';

import { Bell, Copy, ExternalLink, FileText, Link, Plus, StickyNote } from 'lucide-react';

import type { EvidenceItem } from '../incidentDetail.types';

import { EmptyState } from '@/components/empty-state/EmptyState';
import { ErrorState } from '@/components/error-state/ErrorState';
import { LoadingState } from '@/components/loading-state/LoadingState';

import './IncidentEvidencePanel.css';

export interface IncidentEvidencePanelProps {
  items: EvidenceItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAddEvidence: () => void;
  canEdit: boolean;
}

const evidenceIcons: Record<EvidenceItem['itemType'], React.ElementType> = {
  ALERT: Bell,
  NOTE: StickyNote,
  EXTERNAL_URL: Link,
  ARTIFACT: FileText,
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function IncidentEvidencePanel({
  items,
  isLoading,
  isError,
  onRetry,
  onAddEvidence,
  canEdit,
}: IncidentEvidencePanelProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!items?.length) {
      setSelectedId(null);
      return;
    }
    if (!items.some((item) => item.id === selectedId)) setSelectedId(items[0].id);
  }, [items, selectedId]);

  if (isLoading) {
    return <LoadingState message="Loading evidence items..." />;
  }

  if (isError) {
    return <ErrorState message="Failed to load evidence items" onRetry={onRetry} />;
  }

  if (!items || items.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <EmptyState
          icon={<FileText size={48} />}
          title="No evidence preserved yet"
          description="Add an alert, artifact, analyst note, or external reference to build the case record."
          action={
            canEdit ? (
              <button className="incident-evidence__add" type="button" onClick={onAddEvidence}>
                <Plus size={13} aria-hidden="true" /> Add evidence
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const SelectedIcon = evidenceIcons[selected.itemType];
  const isExternalUrl = selected.sourceRef?.startsWith('http://') || selected.sourceRef?.startsWith('https://');
  const createdAt = new Date(selected.createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const copySource = async () => {
    if (!selected.sourceRef) return;
    await navigator.clipboard?.writeText(selected.sourceRef);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="incident-evidence" aria-label="Incident evidence">
      <aside className="incident-evidence__index" aria-label="Evidence index">
        <div className="incident-evidence__toolbar">
          <div>
            <strong>Evidence index</strong>
            <span> · {items.length} items</span>
          </div>
          <button
            className="incident-evidence__add"
            type="button"
            onClick={onAddEvidence}
            disabled={!canEdit}
          >
            <Plus size={13} aria-hidden="true" /> Add
          </button>
        </div>
        <div className="incident-evidence__list" role="listbox" aria-label="Evidence items">
          {items.map((item) => {
            const Icon = evidenceIcons[item.itemType];
            return (
              <button
                className="incident-evidence__item"
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === selected.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="incident-evidence__item-icon" data-type={item.itemType}>
                  <Icon size={14} aria-hidden="true" />
                </span>
                <span className="incident-evidence__item-copy">
                  <strong>{item.title}</strong>
                  <span>{item.itemType.replace('_', ' ')} · {formatRelative(item.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <article className="incident-evidence__detail" aria-live="polite">
        <div className="incident-evidence__detail-header">
          <div>
            <span className="incident-evidence__type">
              <SelectedIcon size={13} aria-hidden="true" /> {selected.itemType.replace('_', ' ')}
            </span>
            <h2>{selected.title}</h2>
          </div>
          {selected.severityHint && (
            <span className="incident-evidence__severity" data-level={selected.severityHint}>
              {selected.severityHint}
            </span>
          )}
        </div>

        <div className="incident-evidence__content">
          <section className="incident-evidence__block">
            <h3>Analyst context</h3>
            <p>{selected.content || 'No supporting context was recorded for this item.'}</p>
          </section>

          {selected.sourceRef && (
            <section className="incident-evidence__block">
              <h3>Source reference</h3>
              <div className="incident-evidence__source">
                {isExternalUrl ? (
                  <a href={selected.sourceRef} target="_blank" rel="noopener noreferrer">
                    {selected.sourceRef} <ExternalLink size={11} aria-label="Opens in a new tab" />
                  </a>
                ) : (
                  <code>{selected.sourceRef}</code>
                )}
                <button type="button" onClick={() => void copySource()}>
                  <Copy size={11} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </section>
          )}

          <div className="incident-evidence__metadata">
            <div>
              <span>Preserved by</span>
              <strong>{selected.createdBy}</strong>
            </div>
            <div>
              <span>Preserved at</span>
              <time dateTime={selected.createdAt}>{createdAt}</time>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
