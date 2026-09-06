/**
 * SavedRecentDropdown — compact quick-access panel for the command strip (Option A).
 *
 * Two short sections in one popover: RECENT (last few executed queries, click to re-run) and
 * SAVED (starred hunts, click to load). A "Manage all…" footer opens the full SearchManagerPanel
 * drawer for CRUD (rename / tag / delete / share). This is the 90% path — instant access to a
 * query without a context switch — matching Elastic/Chronicle's query-bar saved/recent pattern.
 *
 * Reuses the exact live data layer the drawer uses (fetchSavedHunts / fetchHuntHistory). Keyboard:
 * ↑/↓ move, Enter activate, Esc close. Dismisses on outside click.
 *
 * CSS: only foundation.css tokens via var(--ha-*).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { Clock3, FolderClock, History, Play, Settings2, Star } from 'lucide-react';

import { fetchHuntHistory, fetchSavedHunts } from '../searchHunt.service';
import type { HistoryEntry, SavedHunt } from '../searchHunt.types';

const RECENT_LIMIT = 6;
const SAVED_LIMIT = 6;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface SavedRecentDropdownProps {
  /** Whether the dropdown is open. */
  open: boolean;
  /** Close the dropdown. */
  onClose: () => void;
  /** Load a saved hunt's query into the editor (does not auto-run). */
  onLoadQuery: (query: string) => void;
  /** Re-run a recent query immediately. */
  onExecuteQuery: (query: string) => void;
  /** Open the full management drawer (Manage all…). */
  onManageAll: () => void;
}

// A flat, ordered list of activatable rows for keyboard navigation.
type Row =
  | { kind: 'saved'; id: string; query: string; label: string; sub: string }
  | { kind: 'recent'; id: string; query: string; label: string; sub: string };

export function SavedRecentDropdown({
  open,
  onClose,
  onLoadQuery,
  onExecuteQuery,
  onManageAll,
}: SavedRecentDropdownProps): JSX.Element | null {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const savedQuery = useQuery({
    queryKey: ['saved-hunts', { search: undefined, tags: undefined }],
    queryFn: () => fetchSavedHunts({}),
    enabled: open,
    staleTime: 30_000,
  });
  const historyQuery = useQuery({
    queryKey: ['hunt-history'],
    queryFn: () => fetchHuntHistory(),
    enabled: open,
    staleTime: 15_000,
  });

  const saved = useMemo<SavedHunt[]>(
    () => (savedQuery.data?.items ?? []).slice(0, SAVED_LIMIT),
    [savedQuery.data?.items],
  );
  const recent = useMemo<HistoryEntry[]>(
    () => (historyQuery.data?.items ?? []).slice(0, RECENT_LIMIT),
    [historyQuery.data?.items],
  );

  // Flat row list — Recent first (most-used quick path), then Saved.
  const rows = useMemo<Row[]>(() => [
    ...recent.map((entry) => ({
      kind: 'recent' as const,
      id: `r-${entry.id}`,
      query: entry.query,
      label: entry.query,
      sub: `${relativeTime(entry.executedAt)} · ${entry.resultCount.toLocaleString()} results`,
    })),
    ...saved.map((hunt) => ({
      kind: 'saved' as const,
      id: `s-${hunt.id}`,
      query: hunt.query,
      label: hunt.name,
      sub: hunt.query,
    })),
  ], [recent, saved]);

  useEffect(() => { if (open) setActiveIndex(0); }, [open]);

  const activate = useCallback((row: Row) => {
    if (row.kind === 'recent') onExecuteQuery(row.query);
    else onLoadQuery(row.query);
    onClose();
  }, [onClose, onExecuteQuery, onLoadQuery]);

  // Outside-click + Escape dismissal, and ↑/↓/Enter navigation while open.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Treat the anchor (which holds the trigger button) as inside, so clicking the open trigger
      // toggles it closed via the button's own handler instead of close-then-reopen.
      const anchor = rootRef.current?.closest('.hunt-saved-recent-anchor') ?? null;
      if (rootRef.current && !rootRef.current.contains(target) && !(anchor && anchor.contains(target))) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (rows.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(rows.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter') { e.preventDefault(); const row = rows[activeIndex]; if (row) activate(row); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, rows, activeIndex, activate]);

  if (!open) return null;

  const loading = savedQuery.isLoading || historyQuery.isLoading;
  let flatIndex = -1;

  return (
    <div className="hunt-saved-recent" role="listbox" aria-label="Saved and recent hunts" ref={rootRef}>
      {loading && rows.length === 0 && (
        <p className="hunt-saved-recent__state">Loading…</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="hunt-saved-recent__state">No saved hunts or recent searches yet.</p>
      )}

      {recent.length > 0 && (
        <section className="hunt-saved-recent__section" aria-label="Recent searches">
          <h4><History size={11} aria-hidden="true" />Recent</h4>
          {recent.map((entry) => {
            flatIndex += 1;
            const idx = flatIndex;
            return (
              <button
                key={`r-${entry.id}`}
                type="button"
                role="option"
                aria-selected={activeIndex === idx}
                data-active={activeIndex === idx}
                className="hunt-saved-recent__row"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => { onExecuteQuery(entry.query); onClose(); }}
                title="Run this recent search"
              >
                <Play size={12} className="hunt-saved-recent__glyph" aria-hidden="true" />
                <span className="hunt-saved-recent__label hunt-saved-recent__label--mono">{entry.query}</span>
                <span className="hunt-saved-recent__sub">{relativeTime(entry.executedAt)} · {entry.resultCount.toLocaleString()} results</span>
              </button>
            );
          })}
        </section>
      )}

      {saved.length > 0 && (
        <section className="hunt-saved-recent__section" aria-label="Saved hunts">
          <h4><Star size={11} aria-hidden="true" />Saved</h4>
          {saved.map((hunt) => {
            flatIndex += 1;
            const idx = flatIndex;
            return (
              <button
                key={`s-${hunt.id}`}
                type="button"
                role="option"
                aria-selected={activeIndex === idx}
                data-active={activeIndex === idx}
                className="hunt-saved-recent__row"
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => { onLoadQuery(hunt.query); onClose(); }}
                title="Load this saved hunt into the editor"
              >
                <FolderClock size={12} className="hunt-saved-recent__glyph" aria-hidden="true" />
                <span className="hunt-saved-recent__label">{hunt.name}</span>
                <span className="hunt-saved-recent__sub hunt-saved-recent__sub--mono">{hunt.query}</span>
                {hunt.lastRunAt && (
                  <span className="hunt-saved-recent__meta"><Clock3 size={10} aria-hidden="true" />{relativeTime(hunt.lastRunAt)}</span>
                )}
              </button>
            );
          })}
        </section>
      )}

      <footer className="hunt-saved-recent__footer">
        <button type="button" onClick={() => { onManageAll(); onClose(); }}>
          <Settings2 size={12} aria-hidden="true" />Manage all saved hunts &amp; history
        </button>
      </footer>
    </div>
  );
}
