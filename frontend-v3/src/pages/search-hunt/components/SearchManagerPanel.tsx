/**
 * SearchManagerPanel — sidebar panel with "Saved" and "History" tabs.
 *
 * Displays saved hunts with name, tag pills, last run timestamp, and run count badge.
 * History tab shows recent queries with truncated query text, relative time, result count,
 * and duration. Supports search input filtering, tag pill filtering, inline edit,
 * context menus, and clear history functionality.
 *
 * Uses TanStack Query v5 for data fetching (no `any` types).
 * CSS: only foundation.css tokens via `var(--ha-*)`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  Copy,
  FolderClock,
  History,
  MoreVertical,
  Pencil,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import {
  clearHuntHistory,
  createSavedHunt,
  deleteSavedHunt,
  fetchHuntHistory,
  fetchSavedHunts,
  updateSavedHunt,
} from '../searchHunt.service';
import type { HistoryEntry, SavedHunt } from '../searchHunt.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchManagerPanelProps {
  /** Whether the panel is visible. */
  isOpen: boolean;
  /** Close the panel. */
  onClose: () => void;
  /** Called when a saved hunt or history entry is selected — loads the query. */
  onLoadQuery: (query: string) => void;
  /** Called when the loaded query should auto-execute. */
  onExecuteQuery: (query: string) => void;
  /** The current query value (for the "Save Current" modal). */
  currentQuery: string;
  /** Tab to show when the panel opens. */
  initialTab?: Tab;
}

type Tab = 'saved' | 'history';

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchManagerPanel({
  isOpen,
  onClose,
  onLoadQuery,
  onExecuteQuery,
  currentQuery,
  initialTab = 'saved',
}: SearchManagerPanelProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ huntId: string; x: number; y: number } | null>(null);
  const [editingHunt, setEditingHunt] = useState<SavedHunt | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [saveShared, setSaveShared] = useState(false);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [initialTab, isOpen]);

  // Dismiss on outside click (mousedown outside the drawer) and on Escape, so the Library behaves like
  // the other popovers. The trigger button lives outside the drawer, so re-clicking it still toggles
  // via the parent — the mousedown handler runs first and closes, then the click toggles open again is
  // avoided because the parent's open state is already false; a single outside click simply closes.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  // ------ Data fetching ------

  const savedHuntsQuery = useQuery({
    queryKey: ['saved-hunts', { search: searchFilter || undefined, tags: activeTag || undefined }],
    queryFn: () => fetchSavedHunts({
      search: searchFilter || undefined,
      tags: activeTag || undefined,
    }),
    enabled: isOpen && tab === 'saved',
    staleTime: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ['hunt-history'],
    queryFn: () => fetchHuntHistory(),
    enabled: isOpen && tab === 'history',
    staleTime: 15_000,
  });

  // ------ Mutations ------

  const createMutation = useMutation({
    mutationFn: createSavedHunt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-hunts'] });
      setSaveOpen(false);
      setSaveName('');
      setSaveDescription('');
      setSaveTags('');
      setSaveShared(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ huntId, body }: { huntId: string; body: Partial<SavedHunt> }) =>
      updateSavedHunt(huntId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-hunts'] });
      setEditingHunt(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedHunt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-hunts'] });
      setDeleteConfirm(null);
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => clearHuntHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hunt-history'] });
      setClearConfirm(false);
    },
  });

  // ------ Derived ------

  const savedHunts = useMemo<SavedHunt[]>(() => savedHuntsQuery.data?.items ?? [], [savedHuntsQuery.data?.items]);
  const historyEntries = useMemo<HistoryEntry[]>(() => historyQuery.data?.items ?? [], [historyQuery.data?.items]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    savedHunts.forEach((hunt) => hunt.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [savedHunts]);

  // ------ Context menu close on outside click ------

  useEffect(() => {
    if (!contextMenu) return undefined;
    const handler = (e: MouseEvent): void => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // ------ Handlers ------

  const handleSavedHuntClick = useCallback(
    (hunt: SavedHunt) => {
      onLoadQuery(hunt.query);
    },
    [onLoadQuery],
  );

  const handleHistoryClick = useCallback(
    (entry: HistoryEntry) => {
      onExecuteQuery(entry.query);
    },
    [onExecuteQuery],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, huntId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ huntId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleEdit = useCallback(() => {
    if (!contextMenu) return;
    const hunt = savedHunts.find((h) => h.id === contextMenu.huntId);
    if (hunt) {
      setEditingHunt(hunt);
      setEditName(hunt.name);
    }
    setContextMenu(null);
  }, [contextMenu, savedHunts]);

  const handleDuplicate = useCallback(() => {
    if (!contextMenu) return;
    const hunt = savedHunts.find((h) => h.id === contextMenu.huntId);
    if (hunt) {
      createMutation.mutate({
        name: `${hunt.name} (copy)`,
        description: hunt.description,
        query: hunt.query,
        tags: hunt.tags,
        shared: false,
      });
    }
    setContextMenu(null);
  }, [contextMenu, createMutation, savedHunts]);

  const handleDeleteRequest = useCallback(() => {
    if (!contextMenu) return;
    setDeleteConfirm(contextMenu.huntId);
    setContextMenu(null);
  }, [contextMenu]);

  const confirmDelete = useCallback(() => {
    if (deleteConfirm) deleteMutation.mutate(deleteConfirm);
  }, [deleteConfirm, deleteMutation]);

  const handleEditSave = useCallback(() => {
    if (!editingHunt || !editName.trim()) return;
    updateMutation.mutate({ huntId: editingHunt.id, body: { name: editName.trim() } });
  }, [editName, editingHunt, updateMutation]);

  const handleSaveSubmit = useCallback(() => {
    if (!saveName.trim() || !currentQuery.trim()) return;
    const tags = saveTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    createMutation.mutate({
      name: saveName.trim(),
      description: saveDescription.trim() || undefined,
      query: currentQuery.trim(),
      tags,
      shared: saveShared,
    });
  }, [createMutation, currentQuery, saveDescription, saveName, saveShared, saveTags]);

  // ------ Render ------

  if (!isOpen) return null;

  return (
    <aside className="search-manager-panel" role="complementary" aria-label="Search manager" ref={panelRef}>
      <header className="search-manager-panel__header">
        <nav className="search-manager-panel__tabs" aria-label="Manager tabs">
          <button
            type="button"
            aria-current={tab === 'saved' ? 'page' : undefined}
            onClick={() => setTab('saved')}
          >
            <FolderClock size={13} />
            Saved
          </button>
          <button
            type="button"
            aria-current={tab === 'history' ? 'page' : undefined}
            onClick={() => setTab('history')}
          >
            <History size={13} />
            History
          </button>
        </nav>
        <button
          type="button"
          className="search-manager-panel__close"
          onClick={onClose}
          aria-label="Close search manager"
        >
          <X size={14} />
        </button>
      </header>

      {/* ===== SAVED TAB ===== */}
      {tab === 'saved' && (
        <div className="search-manager-panel__body">
          <div className="search-manager-panel__search">
            <Search size={13} />
            <input
              type="text"
              placeholder="Filter by name…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Filter saved hunts"
            />
          </div>

          {allTags.length > 0 && (
            <div className="search-manager-panel__tags" aria-label="Tag filters">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="search-manager-panel__tag"
                  aria-pressed={activeTag === tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="search-manager-panel__save-btn"
            disabled={!currentQuery.trim()}
            onClick={() => setSaveOpen(true)}
          >
            Save Current
          </button>

          <div className="search-manager-panel__list" role="list">
            {savedHuntsQuery.isLoading && (
              <p className="search-manager-panel__state">Loading saved hunts…</p>
            )}
            {savedHuntsQuery.isError && (
              <p className="search-manager-panel__state" role="alert">
                Failed to load saved hunts.
              </p>
            )}
            {!savedHuntsQuery.isLoading && savedHunts.length === 0 && (
              <p className="search-manager-panel__state">No saved hunts found.</p>
            )}
            {savedHunts.map((hunt) =>
              editingHunt?.id === hunt.id ? (
                <div key={hunt.id} className="search-manager-panel__item search-manager-panel__item--editing" role="listitem">
                  <input
                    type="text"
                    className="search-manager-panel__edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditSave();
                      if (e.key === 'Escape') setEditingHunt(null);
                    }}
                    autoFocus
                    aria-label="Edit hunt name"
                  />
                  <div className="search-manager-panel__edit-actions">
                    <button type="button" onClick={handleEditSave} disabled={!editName.trim()}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingHunt(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  key={hunt.id}
                  className="search-manager-panel__item"
                  role="listitem"
                  onClick={() => handleSavedHuntClick(hunt)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavedHuntClick(hunt); }}
                  tabIndex={0}
                >
                  <div className="search-manager-panel__item-header">
                    <strong>{hunt.name}</strong>
                    <button
                      type="button"
                      className="search-manager-panel__context-trigger"
                      onClick={(e) => handleContextMenu(e, hunt.id)}
                      aria-label={`Options for ${hunt.name}`}
                    >
                      <MoreVertical size={13} />
                    </button>
                  </div>
                  {hunt.tags.length > 0 && (
                    <div className="search-manager-panel__item-tags">
                      {hunt.tags.map((tag) => (
                        <span key={tag} className="search-manager-panel__pill">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="search-manager-panel__item-meta">
                    {hunt.lastRunAt && (
                      <span><Clock3 size={10} />{relativeTime(hunt.lastRunAt)}</span>
                    )}
                    <span className="search-manager-panel__run-count">
                      <Play size={10} />{hunt.runCount}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {tab === 'history' && (
        <div className="search-manager-panel__body">
          <button
            type="button"
            className="search-manager-panel__clear-btn"
            onClick={() => setClearConfirm(true)}
            disabled={historyEntries.length === 0}
          >
            <Trash2 size={12} />
            Clear History
          </button>

          <div className="search-manager-panel__list" role="list">
            {historyQuery.isLoading && (
              <p className="search-manager-panel__state">Loading history…</p>
            )}
            {historyQuery.isError && (
              <p className="search-manager-panel__state" role="alert">
                Failed to load history.
              </p>
            )}
            {!historyQuery.isLoading && historyEntries.length === 0 && (
              <p className="search-manager-panel__state">No search history yet.</p>
            )}
            {historyEntries.map((entry) => (
              <div
                key={entry.id}
                className="search-manager-panel__history-item"
                role="listitem"
                onClick={() => handleHistoryClick(entry)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleHistoryClick(entry); }}
                tabIndex={0}
              >
                <code className="search-manager-panel__history-query">
                  {truncate(entry.query, 80)}
                </code>
                <div className="search-manager-panel__history-meta">
                  <span><Clock3 size={10} />{relativeTime(entry.executedAt)}</span>
                  <span>{entry.resultCount.toLocaleString()} results</span>
                  <span>{entry.duration}ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Context Menu ===== */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="search-manager-panel__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          aria-label="Saved hunt actions"
        >
          <button type="button" role="menuitem" onClick={handleEdit}>
            <Pencil size={12} />Edit
          </button>
          <button type="button" role="menuitem" onClick={handleDeleteRequest}>
            <Trash2 size={12} />Delete
          </button>
          <button type="button" role="menuitem" onClick={handleDuplicate}>
            <Copy size={12} />Duplicate
          </button>
        </div>
      )}

      {/* ===== Delete Confirmation ===== */}
      {deleteConfirm && (
        <div className="search-manager-panel__confirm" role="alertdialog" aria-label="Confirm deletion">
          <p>Delete this saved hunt?</p>
          <div>
            <button type="button" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              Delete
            </button>
            <button type="button" onClick={() => setDeleteConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ===== Clear History Confirmation ===== */}
      {clearConfirm && (
        <div className="search-manager-panel__confirm" role="alertdialog" aria-label="Confirm clear history">
          <p>Clear all search history?</p>
          <div>
            <button type="button" onClick={() => clearHistoryMutation.mutate()} disabled={clearHistoryMutation.isPending}>
              Clear
            </button>
            <button type="button" onClick={() => setClearConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ===== Save Current Modal ===== */}
      {saveOpen && (
        <div className="search-manager-panel__save-modal" role="dialog" aria-label="Save current hunt">
          <header>
            <strong>Save Current Hunt</strong>
            <button type="button" onClick={() => setSaveOpen(false)} aria-label="Close save dialog">
              <X size={14} />
            </button>
          </header>
          <div className="search-manager-panel__save-form">
            <label>
              Name *
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. C2 Beaconing Detection"
                autoFocus
              />
            </label>
            <label>
              Description
              <textarea
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Optional description…"
                rows={2}
              />
            </label>
            <label>
              Tags (comma-separated)
              <input
                type="text"
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder="e.g. c2, beaconing, network"
              />
            </label>
            <label className="search-manager-panel__shared-toggle">
              <input
                type="checkbox"
                checked={saveShared}
                onChange={(e) => setSaveShared(e.target.checked)}
              />
              Share with team
            </label>
            <code className="search-manager-panel__save-query-preview">
              {truncate(currentQuery, 200)}
            </code>
          </div>
          <footer>
            <button
              type="button"
              className="search-manager-panel__save-submit"
              onClick={handleSaveSubmit}
              disabled={!saveName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setSaveOpen(false)}>Cancel</button>
          </footer>
        </div>
      )}
    </aside>
  );
}
