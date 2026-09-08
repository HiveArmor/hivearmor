/**
 * Saved Pivot storage shape (P1.1).
 *
 * <p>A Saved Pivot reuses the shipped SavedHunt infrastructure: its {@code query} is the committed
 * hunt query and its freeform {@code filters} JSON carries the pivot config plus a {@code kind:'pivot'}
 * discriminator. This module is the single source of truth for building that payload and reading it
 * back safely — a plain saved hunt (no discriminator) simply returns null on parse.
 */

import type { HuntPivotConfig } from '../searchHunt.types';

/** The pivot slice stored in SavedHunt.filters (the local tenantId stamp is intentionally dropped). */
export interface SavedPivotPayload {
  kind: 'pivot';
  pivot: {
    v: number;
    rowField: string | null;
    colField: string | null;
    valueFn: 'count' | 'distinct';
    distinctField: string | null;
    rowBucketInterval?: string | null;
    colBucketInterval?: string | null;
  };
}

/** Build the SavedHunt.filters payload for a pivot config. Tenancy is enforced server-side, so the
 *  local tenantId stamp is not persisted. */
export function buildSavedPivotFilters(config: HuntPivotConfig): SavedPivotPayload {
  return {
    kind: 'pivot',
    pivot: {
      v: config.v,
      rowField: config.rowField,
      colField: config.colField,
      valueFn: config.valueFn,
      distinctField: config.distinctField,
      rowBucketInterval: config.rowBucketInterval ?? null,
      colBucketInterval: config.colBucketInterval ?? null,
    },
  };
}

/** True when a SavedHunt.filters blob is a Saved Pivot. */
export function isSavedPivot(filters: Record<string, unknown> | null | undefined): boolean {
  return Boolean(filters) && (filters as Record<string, unknown>).kind === 'pivot';
}

/**
 * Parse a SavedHunt.filters blob back into a HuntPivotConfig (re-stamping the current tenant), or null
 * when the blob is not a Saved Pivot / is malformed. Never throws — a bad blob loads as "not a pivot".
 */
export function parseSavedPivot(
  filters: Record<string, unknown> | null | undefined,
  tenantId: number | null,
): HuntPivotConfig | null {
  if (!isSavedPivot(filters)) return null;
  const pivot = (filters as unknown as SavedPivotPayload).pivot;
  if (!pivot || typeof pivot !== 'object') return null;
  const valueFn = pivot.valueFn === 'distinct' ? 'distinct' : 'count';
  return {
    v: typeof pivot.v === 'number' ? pivot.v : 1,
    tenantId,
    rowField: typeof pivot.rowField === 'string' ? pivot.rowField : null,
    colField: typeof pivot.colField === 'string' ? pivot.colField : null,
    valueFn,
    distinctField: typeof pivot.distinctField === 'string' ? pivot.distinctField : null,
    rowBucketInterval: typeof pivot.rowBucketInterval === 'string' ? pivot.rowBucketInterval : null,
    colBucketInterval: typeof pivot.colBucketInterval === 'string' ? pivot.colBucketInterval : null,
  };
}
