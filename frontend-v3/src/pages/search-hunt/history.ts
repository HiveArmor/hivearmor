/**
 * Hunt history helpers — local-storage-backed MRU list.
 *
 * Key:   ha_hunt_history
 * Shape: HuntHistoryEntry[]  (most-recent-first, max 20 entries)
 *
 * Task 5.8 — Sprint 15 ECS-Hunt
 */

import type { HuntHistoryEntry } from '@/types/search';

/** Storage key used for the hunt history list. */
export const HUNT_HISTORY_KEY = 'ha_hunt_history';

/** Maximum number of entries kept in the MRU list. */
export const HUNT_HISTORY_MAX = 20;

/**
 * Prepend `entry` to the hunt history stored in localStorage.
 * The list is truncated to at most {@link HUNT_HISTORY_MAX} entries.
 *
 * Malformed JSON in localStorage is treated as an empty history.
 */
export function addToHuntHistory(entry: HuntHistoryEntry): void {
  let existing: HuntHistoryEntry[] = [];
  try {
    const raw = localStorage.getItem(HUNT_HISTORY_KEY);
    if (raw !== null) {
      existing = JSON.parse(raw) as HuntHistoryEntry[];
      if (!Array.isArray(existing)) {
        existing = [];
      }
    }
  } catch {
    existing = [];
  }

  const updated = [entry, ...existing].slice(0, HUNT_HISTORY_MAX);
  localStorage.setItem(HUNT_HISTORY_KEY, JSON.stringify(updated));
}

/**
 * Read the current hunt history from localStorage.
 * Returns an empty array when the key is absent or the value is malformed.
 */
export function getHuntHistory(): HuntHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HUNT_HISTORY_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as HuntHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
