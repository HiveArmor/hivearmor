import { useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Check, Clipboard, ExternalLink, FileJson, ListTree, Plus, X } from 'lucide-react';

import { fetchHuntEventDetail } from '../searchHunt.service';
import type { HuntActionRequest, HuntEvent } from '../searchHunt.types';

interface EventContextDrawerProps {
  event: HuntEvent | null;
  searchId: string;
  onClose: () => void;
  onPivot: (query: string) => void;
  onAction: (type: HuntActionRequest['type'], eventIds: string[]) => void;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function EventContextDrawer({ event, searchId, onClose, onPivot, onAction }: EventContextDrawerProps): JSX.Element | null {
  const [view, setView] = useState<'normalized' | 'raw'>('normalized');
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const detailQuery = useQuery({
    queryKey: ['hunt-event-detail', searchId, event?.id],
    queryFn: ({ signal }) => fetchHuntEventDetail(event?.id ?? '', searchId, signal),
    enabled: Boolean(event?.id && searchId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!event) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [event, onClose]);

  if (!event) return null;
  const detail = detailQuery.data;
  const values = detail?.normalized ?? event.normalized;

  const copyCurrent = async (): Promise<void> => {
    const payload = view === 'raw' ? detail?.rawRecord : values;
    await navigator.clipboard.writeText(JSON.stringify(payload ?? {}, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  /** Renders JSON with basic syntax highlighting */
  const renderJson = (obj: Record<string, unknown>): JSX.Element => {
    const json = JSON.stringify(obj, null, 2);
    const highlighted = json
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]*)"(,?)/g, ': <span class="json-string">"$1"</span>$2')
      .replace(/: (\d+)(,?)/g, ': <span class="json-number">$1</span>$2')
      .replace(/: (true|false)(,?)/g, ': <span class="json-boolean">$1</span>$2')
      .replace(/: (null)(,?)/g, ': <span class="json-null">$1</span>$2');
    return <pre className="hunt-raw-event" tabIndex={0} dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  return (
    <aside className="hunt-event-drawer" role="dialog" aria-modal="false" aria-labelledby="hunt-event-title">
      <header className="hunt-event-drawer__header">
        <div><span>EVENT CONTEXT</span><h2 id="hunt-event-title">{event.action ?? event.category ?? 'Event'}<small className="hunt-event-drawer__id">{event.id}</small></h2></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close event context"><X size={17} /></button>
      </header>
      <div className="hunt-event-drawer__summary">
        <span className="hunt-severity" data-severity={event.severity}><i aria-hidden="true" />{event.severity}</span>
        <strong>{event.action}</strong>
        <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time>
        <p>{event.message}</p>
      </div>
      <nav className="hunt-event-drawer__tabs" aria-label="Event data views">
        <button type="button" aria-current={view === 'normalized' ? 'page' : undefined} onClick={() => setView('normalized')}><ListTree size={13} />Normalized</button>
        <button type="button" aria-current={view === 'raw' ? 'page' : undefined} onClick={() => setView('raw')} disabled={detail ? !detail.permissions.viewRaw : false}><FileJson size={13} />Raw event</button>
        <button type="button" onClick={() => void copyCurrent()}>{copied ? <Check size={13} /> : <Clipboard size={13} />}{copied ? 'Copied' : 'Copy view'}</button>
      </nav>
      <div className="hunt-event-drawer__body">
        {detailQuery.isLoading && <div className="hunt-drawer-state">Loading event details progressively…</div>}
        {detailQuery.isError && <div className="hunt-drawer-state" role="alert">Core event context is preserved, but raw detail could not be loaded.</div>}
        {view === 'normalized' && (
          <dl className="hunt-event-fields">{Object.entries(values).map(([key, value]) => (
            <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd><button type="button" onClick={() => onPivot(`${key}:"${displayValue(value)}"`)} aria-label={`Pivot on ${key}`}><ExternalLink size={12} /></button></div>
          ))}</dl>
        )}
        {view === 'raw' && detail && renderJson(detail.rawRecord)}
        {detail && (
          <section className="hunt-event-provenance">
            <h3>Provenance</h3>
            <dl><div><dt>Source index</dt><dd>{detail.sourceIndex}</dd></div><div><dt>Ingested</dt><dd>{new Date(detail.ingestedAt).toLocaleString()}</dd></div><div><dt>Schema</dt><dd>{detail.schemaVersion}</dd></div><div><dt>Integrity</dt><dd>{detail.integrityStatus}</dd></div></dl>
          </section>
        )}
        {detail?.availablePivots.length ? <section className="hunt-event-pivots"><h3>Investigation pivots</h3>{detail.availablePivots.map((pivot) => <button type="button" key={pivot.id} onClick={() => onPivot(pivot.query)}><ExternalLink size={12} />{pivot.label}</button>)}</section> : null}
      </div>
      <footer className="hunt-event-drawer__footer">
        <button type="button" onClick={() => onAction('add_evidence', [event.id])} disabled={detail ? !detail.permissions.addEvidence : true}><Plus size={14} />Add evidence</button>
        <button type="button" onClick={() => onAction('create_investigation', [event.id])} disabled={detail ? !detail.permissions.createInvestigation : true}>Create investigation</button>
      </footer>
    </aside>
  );
}
