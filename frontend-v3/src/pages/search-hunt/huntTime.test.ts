import { describe, expect, it } from 'vitest';

import { formatAbsoluteUtc, formatRelativeTime } from './huntTime';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('formatRelativeTime', () => {
  it('renders sub-minute as "just now"', () => {
    expect(formatRelativeTime(ago(10_000), NOW)).toBe('just now');
  });
  it('renders seconds/minutes/hours/days/weeks/months/years', () => {
    expect(formatRelativeTime(ago(50_000), NOW)).toBe('50s ago');
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * 3600_000), NOW)).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW)).toBe('2d ago');
    expect(formatRelativeTime(ago(14 * 86_400_000), NOW)).toBe('2w ago');
    expect(formatRelativeTime(ago(60 * 86_400_000), NOW)).toBe('2mo ago');
    expect(formatRelativeTime(ago(800 * 86_400_000), NOW)).toBe('2y ago');
  });
  it('handles future skew and invalid input', () => {
    expect(formatRelativeTime(new Date(NOW + 5 * 60_000).toISOString(), NOW)).toBe('in the future');
    expect(formatRelativeTime('not-a-date', NOW)).toBe('—');
  });
});

describe('formatAbsoluteUtc', () => {
  it('formats ISO to a readable UTC string', () => {
    expect(formatAbsoluteUtc('2026-09-06T10:44:30.633Z')).toBe('2026-09-06 10:44:30 UTC');
  });
  it('returns empty for invalid input', () => {
    expect(formatAbsoluteUtc('nope')).toBe('');
  });
});
