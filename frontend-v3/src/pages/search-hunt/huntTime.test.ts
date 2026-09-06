import { describe, expect, it } from 'vitest';

import { formatHuntRelativeTime, formatHuntTimestampUtc } from './huntTime';

describe('formatHuntTimestampUtc', () => {
  it('renders a readable UTC form', () => {
    expect(formatHuntTimestampUtc('2026-09-06T11:40:47.000Z')).toBe('2026-09-06 11:40:47.000 Z');
  });
  it('handles null and invalid input', () => {
    expect(formatHuntTimestampUtc(null)).toBe('—');
    expect(formatHuntTimestampUtc('not-a-date')).toBe('—');
  });
});

describe('formatHuntRelativeTime', () => {
  const now = new Date('2026-09-06T12:00:00.000Z').getTime();

  it('shows "just now" under 45 seconds', () => {
    expect(formatHuntRelativeTime('2026-09-06T11:59:30.000Z', now)).toBe('just now');
  });
  it('shows minutes', () => {
    expect(formatHuntRelativeTime('2026-09-06T11:54:00.000Z', now)).toBe('6m ago');
  });
  it('shows hours', () => {
    expect(formatHuntRelativeTime('2026-09-06T10:00:00.000Z', now)).toBe('2h ago');
  });
  it('shows days', () => {
    expect(formatHuntRelativeTime('2026-09-03T12:00:00.000Z', now)).toBe('3d ago');
  });
  it('falls back to a short date beyond 30 days', () => {
    expect(formatHuntRelativeTime('2026-07-01T12:00:00.000Z', now)).toBe('2026-07-01');
  });
  it('treats future timestamps as "just now"', () => {
    expect(formatHuntRelativeTime('2026-09-06T12:05:00.000Z', now)).toBe('just now');
  });
  it('handles null and invalid input', () => {
    expect(formatHuntRelativeTime(null, now)).toBe('—');
    expect(formatHuntRelativeTime('nope', now)).toBe('—');
  });
});
