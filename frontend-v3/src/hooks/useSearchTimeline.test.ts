/**
 * Property test P5 — `useSearchTimeline` query key shape
 *
 * Validates: Requirements 3.5
 *
 * Property 5: The queryKey passed to useQuery by useSearchTimeline is exactly
 *   ['search-timeline', query, from.toISOString(), to.toISOString()]
 *
 * This test mocks @tanstack/react-query's useQuery to capture the options
 * object passed in, then asserts the queryKey matches the expected shape
 * for several representative inputs.
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock apiClient so no real fetch is attempted ──────────────────────────────
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue([]),
  },
}));

// ── Capture the queryKey passed to useQuery ───────────────────────────────────
// We keep a reference to the last options object seen by useQuery.
let capturedOptions: { queryKey?: unknown[] } = {};

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: vi.fn((options: { queryKey?: unknown[] }) => {
      capturedOptions = options;
      // Return the shape TanStack Query would return for a disabled query.
      return {
        data: undefined,
        isLoading: false,
        isError: false,
        isFetching: false,
        isSuccess: false,
        status: 'pending',
        fetchStatus: 'idle',
      };
    }),
  };
});

// Import AFTER mocks are registered so the module picks up the mocked version.
import { useSearchTimeline } from './useSearchTimeline';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Renders the hook and returns the queryKey that was handed to useQuery. */
function getQueryKey(
  query: string,
  from: Date,
  to: Date
): unknown[] {
  capturedOptions = {};
  renderHook(() => useSearchTimeline(query, from, to));
  return capturedOptions.queryKey ?? [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSearchTimeline — queryKey shape (Property 5)', () => {
  beforeEach(() => {
    capturedOptions = {};
  });

  it('a. typical query string and date pair produces the correct queryKey', () => {
    const query = 'action:login AND severity:high';
    const from = new Date('2024-03-15T08:00:00.000Z');
    const to = new Date('2024-03-15T20:00:00.000Z');

    const key = getQueryKey(query, from, to);

    expect(key).toHaveLength(4);
    expect(key[0]).toBe('search-timeline');
    expect(key[1]).toBe(query);
    expect(key[2]).toBe(from.toISOString());
    expect(key[3]).toBe(to.toISOString());
  });

  it('b. empty string query still produces the correct queryKey shape', () => {
    // The hook is disabled for empty queries (enabled: false) but the queryKey
    // shape must still be correct — TanStack Query uses it for cache identity.
    const query = '';
    const from = new Date('2024-01-01T00:00:00.000Z');
    const to = new Date('2024-01-02T00:00:00.000Z');

    const key = getQueryKey(query, from, to);

    expect(key).toHaveLength(4);
    expect(key[0]).toBe('search-timeline');
    expect(key[1]).toBe(''); // empty string is preserved verbatim
    expect(key[2]).toBe(from.toISOString());
    expect(key[3]).toBe(to.toISOString());
  });

  it('c. unicode query string is included verbatim in the queryKey', () => {
    const query = 'unicöde query 日本語';
    const from = new Date('2025-06-10T12:30:00.000Z');
    const to = new Date('2025-06-10T18:45:00.000Z');

    const key = getQueryKey(query, from, to);

    expect(key).toHaveLength(4);
    expect(key[0]).toBe('search-timeline');
    expect(key[1]).toBe(query); // exact unicode string preserved
    expect(key[2]).toBe(from.toISOString());
    expect(key[3]).toBe(to.toISOString());
  });

  it('d. very old and far-future dates produce ISO 8601 strings in the queryKey', () => {
    const query = 'event.code:4625';
    // Unix epoch (very old)
    const from = new Date('1970-01-01T00:00:00.000Z');
    // Far future
    const to = new Date('2999-12-31T23:59:59.999Z');

    const key = getQueryKey(query, from, to);

    expect(key).toHaveLength(4);
    expect(key[0]).toBe('search-timeline');
    expect(key[1]).toBe(query);
    // Both date slots must be ISO 8601 strings matching the toISOString() output.
    expect(key[2]).toBe('1970-01-01T00:00:00.000Z');
    expect(key[3]).toBe('2999-12-31T23:59:59.999Z');
    // Sanity-check the format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(typeof key[2]).toBe('string');
    expect(typeof key[3]).toBe('string');
    expect((key[2] as string).endsWith('Z')).toBe(true);
    expect((key[3] as string).endsWith('Z')).toBe(true);
  });
});
