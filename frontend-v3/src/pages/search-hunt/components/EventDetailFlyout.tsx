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
  CircleMinus,
  CirclePlus,
  Clock,
  Copy,
  ExternalLink,
  FileJson,
  Globe,
  Hash,
  Link2,
  ListTree,
  Monitor,
  Network,
  Search,
  Server,
  Terminal,
  User,
  X,
} from 'lucide-react';


import { fetchHuntEvent, fetchHuntEventDetail } from '../searchHunt.service';
import type { HuntActionRequest, HuntEventDetail, HuntEventDetailResponse, HuntEventField, Pivot } from '../searchHunt.types';

import { HaJsonViewer } from '@/components/ha-json-viewer';

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
  /** Per-field "filter for" — append field:value to the query (debounced auto-run upstream). */
  onFilterFor?: (fragment: string) => void;
  /** Per-field "filter out" — append NOT field:value to the query (debounced auto-run upstream). */
  onFilterOut?: (fragment: string) => void;
  /** Single-event workflow actions (evidence / investigation). */
  onAction?: (type: HuntActionRequest['type'], eventIds: string[]) => void;
}

type ViewTab = 'fields' | 'raw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE_ICONS: Record<string, typeof Globe> = {
  ip: Network,
  hostname: Server,
  process: Terminal,
  hash: Hash,
  username: User,
  port: Link2,
  timestamp: Clock,
  domain: Globe,
  url: Link2,
};

// Section render order for the grouped field grid (mirrors the showcase's Detection→Network→Assets).
const GROUP_ORDER = ['Detection', 'Network', 'Assets', 'Process', 'File', 'Other'];

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDetailFlyout({
  eventId,
  searchId,
  onClose,
  onPivot,
  onFilterFor,
  onFilterOut,
  onAction,
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

  const detailQuery = useQuery<HuntEventDetail>({
    queryKey: ['hunt-event-detail', searchId, eventId],
    queryFn: ({ signal }) => fetchHuntEventDetail(eventId ?? '', searchId, signal),
    enabled: Boolean(eventId && searchId),
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

        {/* Fields tab — grouped by investigation section, each row with a hover/focus action rail */}
        {viewTab === 'fields' && data?.fields && (() => {
          const redacted = new Set(detailQuery.data?.redactedFields ?? []);
          const sorted = data.fields.slice().sort((a, b) => a.order - b.order);
          const groups = new Map<string, HuntEventField[]>();
          for (const field of sorted) {
            const g = field.group ?? 'Other';
            const bucket = groups.get(g) ?? [];
            bucket.push(field);
            groups.set(g, bucket);
          }
          const orderedGroups = [...groups.entries()].sort(
            ([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
          );
          return (
            <div className="event-flyout__field-groups">
              {orderedGroups.map(([groupName, groupFields]) => (
                <section key={groupName} className="event-flyout__group" aria-label={`${groupName} fields`}>
                  <h3 className="event-flyout__group-title">{groupName}</h3>
                  <dl className="event-flyout__fields">
                    {groupFields.map((field) => {
                      const Icon = getFieldIcon(field.type);
                      const isRedacted = redacted.has(field.key);
                      const canFilter = !isRedacted && Boolean(field.includeQuery);
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
                          <dd>
                            <span className="event-flyout__value">{field.value}</span>
                            {canFilter && (
                              <span className="event-flyout__field-actions">
                                <button
                                  type="button"
                                  onClick={() => onFilterFor?.(field.includeQuery ?? '')}
                                  aria-label={`Filter for ${field.key} is ${field.value}`}
                                  title="Filter for"
                                >
                                  <CirclePlus size={13} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onFilterOut?.(field.excludeQuery ?? '')}
                                  aria-label={`Filter out ${field.key} is ${field.value}`}
                                  title="Filter out"
                                >
                                  <CircleMinus size={13} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { void navigator.clipboard?.writeText(field.value); }}
                                  aria-label={`Copy ${field.key} value`}
                                  title="Copy value"
                                >
                                  <Copy size={13} aria-hidden="true" />
                                </button>
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ))}
            </div>
          );
        })()}

        {/* Raw JSON tab — safe tokenized viewer, gated on view-raw permission */}
        {viewTab === 'raw' && data?.raw && (
          detailQuery.data && !detailQuery.data.permissions.viewRaw ? (
            <p className="event-flyout__raw-denied" role="note">
              You do not have permission to view the raw event source.
            </p>
          ) : (
            <HaJsonViewer data={data.raw} ariaLabel="Raw event JSON" />
          )
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

      {onAction && eventId && (
        <footer className="event-flyout__footer">
          <button
            type="button"
            onClick={() => onAction('add_evidence', [eventId])}
            disabled={detailQuery.isLoading || (detailQuery.data ? !detailQuery.data.permissions.addEvidence : true)}
          >
            Add evidence
          </button>
          <button
            type="button"
            onClick={() => onAction('create_investigation', [eventId])}
            disabled={detailQuery.isLoading || (detailQuery.data ? !detailQuery.data.permissions.createInvestigation : true)}
          >
            Create investigation
          </button>
        </footer>
      )}
    </aside>
  );
}
