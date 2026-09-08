import { describe, expect, it } from 'vitest';

import { buildSavedPivotFilters, isSavedPivot, parseSavedPivot } from './savedPivot';
import type { HuntPivotConfig } from '../searchHunt.types';

const config: HuntPivotConfig = {
  v: 1,
  tenantId: 5,
  rowField: 'host.name',
  colField: 'event.action',
  valueFn: 'count',
  distinctField: null,
};

describe('buildSavedPivotFilters', () => {
  it('produces a kind:pivot payload without the local tenant stamp', () => {
    const filters = buildSavedPivotFilters(config);
    expect(filters.kind).toBe('pivot');
    expect(filters.pivot.rowField).toBe('host.name');
    expect(filters.pivot.colField).toBe('event.action');
    expect(filters.pivot).not.toHaveProperty('tenantId');
  });
});

describe('isSavedPivot', () => {
  it('detects a pivot blob and rejects a plain one', () => {
    expect(isSavedPivot({ kind: 'pivot', pivot: {} })).toBe(true);
    expect(isSavedPivot({})).toBe(false);
    expect(isSavedPivot(null)).toBe(false);
    expect(isSavedPivot(undefined)).toBe(false);
  });
});

describe('parseSavedPivot', () => {
  it('round-trips a built payload and re-stamps the current tenant', () => {
    const filters = buildSavedPivotFilters(config) as unknown as Record<string, unknown>;
    const parsed = parseSavedPivot(filters, 9);
    expect(parsed).not.toBeNull();
    expect(parsed?.tenantId).toBe(9); // re-stamped, not the original 5
    expect(parsed?.rowField).toBe('host.name');
    expect(parsed?.colField).toBe('event.action');
    expect(parsed?.valueFn).toBe('count');
  });

  it('returns null for a non-pivot blob (loads as a plain saved hunt)', () => {
    expect(parseSavedPivot({}, 1)).toBeNull();
    expect(parseSavedPivot(null, 1)).toBeNull();
  });

  it('never throws on a malformed pivot blob', () => {
    expect(parseSavedPivot({ kind: 'pivot' }, 1)).toBeNull();
    const weird = parseSavedPivot({ kind: 'pivot', pivot: { valueFn: 'nonsense' } } as unknown as Record<string, unknown>, 1);
    // Malformed value fn coerces to 'count'; missing fields become null — no throw.
    expect(weird?.valueFn).toBe('count');
    expect(weird?.rowField).toBeNull();
  });
});
