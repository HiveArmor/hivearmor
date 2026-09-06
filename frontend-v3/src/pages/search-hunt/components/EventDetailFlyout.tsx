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
  Columns3,
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
  ShieldCheck,
  Terminal,
  User,
  X,
} from 'lucide-react';


import { formatRelativeTime, formatAbsoluteUtc } from '../huntTime';
import { fetchHuntEvent, fetchHuntEventDetail, isHuntSessionExpiredError } from '../searchHunt.service';
import type { HuntActionRequest, HuntEvent, HuntEventDetail, HuntEventDetailResponse, HuntEventField, Pivot } from '../searchHunt.types';

import { HaJsonViewer } from '@/components/ha-json-viewer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewTab = 'fields' | 'raw';

export interface EventDetailFlyoutProps {
  /** The event ID to display detail for. Null closes the flyout. */
  eventId: string | null;
  /** Which tab to open on. Defaults to 'fields'; a per-row "raw" action opens 'raw'. */
  initialTab?: ViewTab;
  /** The row's already-loaded normalized event, used for the instant summary header,
   *  entity quick-pivots, and copy-as (no extra fetch needed). */
  event?: HuntEvent | null;
  /** Search snapshot that authorized this event. */
  searchId: string;
  /** Close the flyout. */
  onClose: () => void;
  /** Called when a pivot is clicked — sets the search bar and auto-executes. */
  onPivot: (query: string) => void;
  /** Add a field as a result-grid column (entity quick-pivot "add column"). */
  onAddColumn?: (field: string) => void;
  /** Re-run the current hunt (used by the snapshot-expired recovery CTA). */
  onRerun?: () => void;
  /** Notifies the page that the search snapshot has expired (so the status strip can reflect it). */
  onSessionExpired?: () => void;
  /** Per-field "filter for" — append field:value to the query (debounced auto-run upstream). */
  onFilterFor?: (fragment: string) => void;
  /** Per-field "filter out" — append NOT field:value to the query (debounced auto-run upstream). */
  onFilterOut?: (fragment: string) => void;
  /** Single-event workflow actions (evidence / investigation). */
  onAction?: (type: HuntActionRequest['type'], eventIds: string[]) => void;
}

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

/**
 * Semantic icon for a field's VALUE, derived from the field key (user→User, host→Server,
 * ip→Network, hash→Hash, process→Terminal, port→Link2, timestamp→Clock, domain/url→Globe).
 * Returns null when no meaningful icon applies, so plain fields stay uncluttered.
 */
function getValueIcon(fieldKey: string, type: string): typeof Globe | null {
  const k = fieldKey.toLowerCase();
  if (k.includes('user') || k.endsWith('.username') || k === 'user') return User;
  if (k.includes('host') || k.includes('computer') || k.includes('hostname')) return Server;
  if (k.endsWith('.ip') || k.includes('ipaddress') || type === 'ip') return Network;
  if (k.includes('hash') || k.includes('sha') || k.includes('md5')) return Hash;
  if (k.includes('process') || k.includes('command') || k.includes('executable')) return Terminal;
  if (k.includes('port')) return Link2;
  if (k.includes('domain') || k.includes('url') || k.includes('dns')) return Globe;
  if (type === 'timestamp' || k.includes('timestamp') || k.endsWith('at')) return Clock;
  return null;
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

/** KQL-quote a value for a field:"value" fragment (escape embedded quotes). */
function kqlFragment(field: string, value: string): string {
  return `${field}:"${value.replace(/"/g, '\\"')}"`;
}

/** The key entities on a normalized event, for the quick-pivot chips (item 2). */
function entityPivots(evt: HuntEvent): Array<{ label: string; field: string; value: string; Icon: typeof Server }> {
  const out: Array<{ label: string; field: string; value: string; Icon: typeof Server }> = [];
  if (evt.host) out.push({ label: evt.host, field: 'host', value: evt.host, Icon: Server });
  if (evt.user) out.push({ label: evt.user, field: 'user', value: evt.user, Icon: User });
  if (evt.sourceIp) out.push({ label: evt.sourceIp, field: 'source_ip', value: evt.sourceIp, Icon: Network });
  if (evt.destinationIp) out.push({ label: evt.destinationIp, field: 'destination_ip', value: evt.destinationIp, Icon: Network });
  return out;
}

/** Pull IOCs (IPs, and any hash/domain-looking values) from the normalized record for copy-as. */
function extractIocs(evt: HuntEvent): string[] {
  const iocs = new Set<string>();
  if (evt.sourceIp) iocs.add(evt.sourceIp);
  if (evt.destinationIp) iocs.add(evt.destinationIp);
  const ipRe = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
  const hashRe = /\b[a-f0-9]{32,64}\b/gi;
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      (v.match(ipRe) ?? []).forEach((m) => iocs.add(m));
      (v.match(hashRe) ?? []).forEach((m) => iocs.add(m));
    } else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(walk);
    }
  };
  walk(evt.normalized);
  return [...iocs];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventDetailFlyout({
  eventId,
  initialTab = 'fields',
  event,
  searchId,
  onClose,
  onPivot,
  onAddColumn,
  onRerun,
  onSessionExpired,
  onFilterFor,
  onFilterOut,
  onAction,
}: EventDetailFlyoutProps): JSX.Element | null {
  const [viewTab, setViewTab] = useState<ViewTab>(initialTab);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);

  // Close the Copy-as menu on outside click.
  useEffect(() => {
    if (!copyMenuOpen) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (copyMenuRef.current && !copyMenuRef.current.contains(e.target as Node)) setCopyMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [copyMenuOpen]);

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
    if (eventId) { setViewTab(initialTab); setCopyMenuOpen(false); }
  }, [eventId, initialTab]);

  // Surface snapshot expiry to the page so its status strip stops claiming "Query complete".
  useEffect(() => {
    if (activeQuery.isError && isHuntSessionExpiredError(activeQuery.error)) {
      onSessionExpired?.();
    }
  }, [activeQuery.isError, activeQuery.error, onSessionExpired]);

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

      {/* ------ Summary strip (item 1): instant gist from the row's normalized event ------ */}
      {event && (
        <div className="event-flyout__summary">
          <span className="hunt-severity" data-severity={event.severity}><i aria-hidden="true" />{event.severity}</span>
          <p className="event-flyout__summary-line" title={event.message}>{event.message}</p>
          <div className="event-flyout__summary-meta">
            <time title={formatAbsoluteUtc(event.timestamp)}><Clock size={11} aria-hidden="true" />{formatRelativeTime(event.timestamp)}</time>
            <span className={`event-flyout__integrity event-flyout__integrity--${detailQuery.data?.integrityStatus ?? 'unknown'}`}>
              <ShieldCheck size={11} aria-hidden="true" />
              {detailQuery.data?.integrityStatus === 'verified' ? 'Integrity verified' : detailQuery.data?.integrityStatus === 'unverified' ? 'Unverified' : 'Integrity —'}
            </span>
            <div className="event-flyout__copyas" ref={copyMenuRef}>
              <button type="button" className="event-flyout__copyas-trigger" onClick={() => setCopyMenuOpen((o) => !o)} aria-expanded={copyMenuOpen} aria-haspopup="menu" title="Copy this event as…">
                <Copy size={11} aria-hidden="true" />Copy as
              </button>
              {copyMenuOpen && (
                <div className="event-flyout__copyas-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(JSON.stringify(event.normalized, null, 2)); setCopyMenuOpen(false); }}>JSON</button>
                  <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText([event.host && kqlFragment('host', event.host), event.user && kqlFragment('user', event.user)].filter(Boolean).join(' AND ')); setCopyMenuOpen(false); }}>KQL filter (host + user)</button>
                  <button type="button" role="menuitem" onClick={() => { void navigator.clipboard?.writeText(extractIocs(event).join('\n')); setCopyMenuOpen(false); }}>IOC list</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------ Entity quick-pivots (item 2): host/user/IP — pivot search or add as column ------ */}
      {event && entityPivots(event).length > 0 && (
        <div className="event-flyout__entities" aria-label="Entity pivots">
          {entityPivots(event).map(({ label, field, value, Icon }) => (
            <span key={`${field}:${value}`} className="event-flyout__entity">
              <Icon size={12} aria-hidden="true" />
              <button type="button" className="event-flyout__entity-label" onClick={() => { onClose(); onPivot(kqlFragment(field, value)); }} title={`Pivot to events where ${field} is ${value}`}>{label}</button>
              {onAddColumn && (
                <button type="button" className="event-flyout__entity-add" onClick={() => onAddColumn(field)} aria-label={`Add ${field} as a column`} title="Add as column"><Columns3 size={11} aria-hidden="true" /></button>
              )}
            </span>
          ))}
        </div>
      )}

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

        {/* Error state — snapshot expiry gets a recovery CTA, everything else a generic retry. */}
        {activeQuery.isError && (
          isHuntSessionExpiredError(activeQuery.error) ? (
            <div className="event-flyout__error event-flyout__error--expired" role="alert">
              <p>This search snapshot has expired, so its events can no longer be opened.</p>
              {onRerun ? (
                <button type="button" onClick={() => { onClose(); onRerun(); }}>
                  Run search again
                </button>
              ) : (
                <button type="button" onClick={onClose}>Close</button>
              )}
            </div>
          ) : (
            <div className="event-flyout__error" role="alert">
              <p>Failed to load event details.</p>
              <button type="button" onClick={() => activeQuery.refetch()}>
                Retry
              </button>
            </div>
          )
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
                      const ValueIcon = getValueIcon(field.key, field.type);
                      const isRedacted = redacted.has(field.key);
                      const canFilter = !isRedacted && Boolean(field.includeQuery);
                      return (
                        <div
                          key={field.key}
                          className={`event-flyout__field ${emphasisClass(field.emphasis)}`}
                        >
                          <dt>
                            <span className="event-flyout__type-badge" data-type={field.type} title={field.type} aria-label={`Type: ${field.type}`}>
                              <Icon size={12} aria-hidden="true" />
                            </span>
                            <span className="event-flyout__field-key" title={field.key}>{field.key}</span>
                          </dt>
                          <dd>
                            <span className="event-flyout__value">
                              {ValueIcon && field.value ? <ValueIcon size={12} className="event-flyout__value-icon" aria-hidden="true" /> : null}
                              <span className="event-flyout__value-text">{field.value}</span>
                            </span>
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
