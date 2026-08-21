/**
 * EventDetailFlyout — slide-out panel for viewing event details.
 *
 * Two tabs: "Fields" (highlighted view with type badges and emphasis coloring)
 * and "Raw JSON" (formatted JSON with token-based syntax highlighting).
 * Pivot section at the bottom renders pivot buttons as clickable chips.
 * Loading state while fetching; close button in header.
 *
 * Uses TanStack Query v5 for data fetching.
 * CSS: only foundation.css tokens via `var(--ha-*)`.
 */

import { useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  ExternalLink,
  FileJson,
  Globe,
  Hash,
  ListTree,
  Monitor,
  Search,
  Server,
  Terminal,
  User,
  X,
} from 'lucide-react';

import { fetchHuntEvent } from '../searchHunt.service';
import type { HuntEventDetailResponse, HuntEventField, Pivot } from '../searchHunt.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventDetailFlyoutProps {
  /** The event ID to display detail for. Null closes the flyout. */
  eventId: string | null;
  /** Search snapshot that authorized this event. */
  searchId: string;
  /** Close the flyout. */
  onClose: () => void;
  /** Called when a pivot is clicked — sets the search bar and auto-executes. */
  onPivot: (query: string) => void;
}

type ViewTab = 'fields' | 'raw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_ICONS: Record<string, typeof Globe> = {
  ip: Globe,
  hostname: Server,
  process: Terminal,
  hash: Hash,
  username: User,
};

const PIVOT_ICONS: Record<string, typeof Search> = {
  search: Search,
  terminal: Terminal,
  user: User,
  server: Monitor,
  file: FileJson,
  shield: Globe,
  clock: Clock,
};

function getFieldIcon(type: string): typeof Globe {
  return TYPE_BADGE_ICONS[type] ?? Hash;
}

function getPivotIcon(icon: string): typeof Search {
  return PIVOT_ICONS[icon] ?? Search;
}

function emphasisClass(emphasis: HuntEventField['emphasis']): string {
  switch (emphasis) {
    case 'critical':
      return 'event-flyout__field--critical';
    case 'warning':
      return 'event-flyout__field--warning';
    default:
      return '';
  }
}

/** Renders JSON with token-based syntax highlighting using monospace font */
function highlightJson(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj, null, 2);
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"(,?)/g, ': <span class="json-string">"$1"</span>$2')
    .replace(/: (\d+\.?\d*)(,?)/g, ': <span class="json-number">$1</span>$2')
    .replace(/: (true|false)(,?)/g, ': <span class="json-boolean">$1</span>$2')
    .replace(/: (null)(,?)/g, ': <span class="json-null">$1</span>$2');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDetailFlyout({
  eventId,
  searchId,
  onClose,
  onPivot,
}: EventDetailFlyoutProps): JSX.Element | null {
  const [viewTab, setViewTab] = useState<ViewTab>('fields');
  const closeRef = useRef<HTMLButtonElement>(null);

  // Fetch highlighted view
  const highlightedQuery = useQuery<HuntEventDetailResponse>({
    queryKey: ['hunt-event', searchId, eventId, 'highlighted'],
    queryFn: () => eventId
      ? fetchHuntEvent(eventId, 'highlighted', searchId)
      : Promise.reject(new Error('Event identifier is required')),
    enabled: Boolean(eventId && searchId) && viewTab === 'fields',
    staleTime: 60_000,
  });

  // Fetch raw view
  const rawQuery = useQuery<HuntEventDetailResponse>({
    queryKey: ['hunt-event', searchId, eventId, 'raw'],
    queryFn: () => eventId
      ? fetchHuntEvent(eventId, 'raw', searchId)
      : Promise.reject(new Error('Event identifier is required')),
    enabled: Boolean(eventId && searchId) && viewTab === 'raw',
    staleTime: 60_000,
  });

  const activeQuery = viewTab === 'fields' ? highlightedQuery : rawQuery;
  const data = activeQuery.data;
  const pivots: Pivot[] = data?.pivots ?? highlightedQuery.data?.pivots ?? [];

  // Focus management: focus close on open, trap Escape
  useEffect(() => {
    if (!eventId) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [eventId, onClose]);

  // Reset tab when opening a new event
  useEffect(() => {
    if (eventId) setViewTab('fields');
  }, [eventId]);

  const handlePivotClick = (pivot: Pivot): void => {
    onClose();
    onPivot(pivot.query);
  };

  if (!eventId) return null;

  return (
    <aside
      className="event-flyout"
      role="dialog"
      aria-modal="false"
      aria-labelledby="event-flyout-title"
    >
      {/* ------ Header ------ */}
      <header className="event-flyout__header">
        <div>
          <span className="event-flyout__label">EVENT DETAIL</span>
          <h2 id="event-flyout-title">{eventId}</h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="event-flyout__close"
          onClick={onClose}
          aria-label="Close event detail"
        >
          <X size={17} />
        </button>
      </header>

      {/* ------ Tabs ------ */}
      <nav className="event-flyout__tabs" aria-label="Event detail views">
        <button
          type="button"
          aria-current={viewTab === 'fields' ? 'page' : undefined}
          onClick={() => setViewTab('fields')}
        >
          <ListTree size={13} />
          Fields
        </button>
        <button
          type="button"
          aria-current={viewTab === 'raw' ? 'page' : undefined}
          onClick={() => setViewTab('raw')}
        >
          <FileJson size={13} />
          Raw JSON
        </button>
      </nav>

      {/* ------ Body ------ */}
      <div className="event-flyout__body">
        {/* Loading state */}
        {activeQuery.isLoading && (
          <div className="event-flyout__loading" aria-label="Loading event details">
            <span className="event-flyout__spinner" />
            <p>Loading event details…</p>
          </div>
        )}

        {/* Error state */}
        {activeQuery.isError && (
          <div className="event-flyout__error" role="alert">
            <p>Failed to load event details.</p>
            <button type="button" onClick={() => activeQuery.refetch()}>
              Retry
            </button>
          </div>
        )}

        {/* Fields tab */}
        {viewTab === 'fields' && data?.fields && (
          <dl className="event-flyout__fields">
            {data.fields
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const Icon = getFieldIcon(field.type);
                return (
                  <div
                    key={field.key}
                    className={`event-flyout__field ${emphasisClass(field.emphasis)}`}
                  >
                    <dt>
                      <span className="event-flyout__type-badge" data-type={field.type}>
                        <Icon size={10} />
                        {field.type}
                      </span>
                      {field.key}
                    </dt>
                    <dd>{field.value}</dd>
                  </div>
                );
              })}
          </dl>
        )}

        {/* Raw JSON tab */}
        {viewTab === 'raw' && data?.raw && (
          <pre
            className="event-flyout__raw"
            tabIndex={0}
            dangerouslySetInnerHTML={{ __html: highlightJson(data.raw) }}
          />
        )}

        {/* Pivot section */}
        {pivots.length > 0 && (
          <section className="event-flyout__pivots" aria-label="Investigation pivots">
            <h3>Pivots</h3>
            <div className="event-flyout__pivot-chips">
              {pivots.map((pivot) => {
                const PIcon = getPivotIcon(pivot.icon);
                return (
                  <button
                    key={pivot.id}
                    type="button"
                    className="event-flyout__pivot-chip"
                    onClick={() => handlePivotClick(pivot)}
                    title={pivot.description}
                  >
                    <PIcon size={12} />
                    <span>{pivot.label}</span>
                    <ExternalLink size={10} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
