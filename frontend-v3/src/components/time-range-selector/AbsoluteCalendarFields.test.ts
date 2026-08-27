/**
 * AbsoluteCalendarFields — unit tests
 */

import { describe, it, expect } from 'vitest';

import { parseLocalDatetime, toLocalDatetime } from './AbsoluteCalendarFields';

describe('AbsoluteCalendarFields helpers', () => {
  it('round-trips local datetime strings', () => {
    const source = new Date(2026, 7, 27, 11, 13, 0, 0);
    const local = toLocalDatetime(source);
    expect(local).toBe('2026-08-27T11:13');
    const parsed = parseLocalDatetime(local);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(27);
    expect(parsed?.getHours()).toBe(11);
    expect(parsed?.getMinutes()).toBe(13);
  });

  it('rejects malformed local datetime strings', () => {
    expect(parseLocalDatetime('2026-08-27')).toBeNull();
    expect(parseLocalDatetime('not-a-date')).toBeNull();
  });
});
