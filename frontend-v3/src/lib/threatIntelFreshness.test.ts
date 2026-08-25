import { describe, it, expect } from 'vitest';

import { formatBoundedRelativeTime } from './threatIntelFreshness';

describe('formatBoundedRelativeTime', () => {
  const now = Date.parse('2026-08-25T12:00:00.000Z');

  it('returns Never for null or invalid ISO', () => {
    expect(formatBoundedRelativeTime(null, now)).toBe('Never');
    expect(formatBoundedRelativeTime('not-a-date', now)).toBe('Never');
  });

  it('returns just now for recent timestamps', () => {
    expect(formatBoundedRelativeTime('2026-08-25T11:59:30.000Z', now)).toBe('just now');
  });

  it('formats minute and hour buckets', () => {
    expect(formatBoundedRelativeTime('2026-08-25T11:45:00.000Z', now)).toBe('15m ago');
    expect(formatBoundedRelativeTime('2026-08-25T09:00:00.000Z', now)).toBe('3h ago');
  });

  it('caps day display at >30d', () => {
    expect(formatBoundedRelativeTime('2026-08-15T12:00:00.000Z', now)).toBe('10d ago');
    expect(formatBoundedRelativeTime('2026-07-01T12:00:00.000Z', now)).toBe('>30d');
  });
});
