/**
 * Property 9: JWT header is the only credential channel (UEBA frontend).
 *
 * For every call in `uebaService`, the outgoing `Request` carries
 * `Authorization: Bearer <token>` sourced from `localStorage['hivearmor_auth_token']`,
 * has no credential-bearing query parameters, and reads no other storage key.
 *
 * **Validates: Requirements 5.6, 6.10, 7.8**
 */
import * as fc from 'fast-check';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getDeviations,
  getRiskScores,
  getEntityTimeline,
  getPeerGroups,
  getRiskTrend,
  getAnomalyCounts,
} from '@/services/ueba.service';

// ---------------------------------------------------------------------------
// Shared mutable state updated per property iteration.
// ---------------------------------------------------------------------------

let currentToken = '';

/** Track all localStorage keys accessed during a property run. */
let accessedKeys: string[] = [];

const localStorageMock = {
  getItem: vi.fn((key: string) => {
    accessedKeys.push(key);
    return key === 'hivearmor_auth_token' ? currentToken : null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() { return 0; },
  key: vi.fn(() => null),
};

// Mock the auth store before the module loads
vi.mock('@/store/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      selectedTenantId: null,
      logout: vi.fn(),
    })),
  },
}));

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** URL string passed as the first argument to fetch(). */
function capturedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string;
}

/** RequestInit passed as the second argument to fetch(). */
function capturedInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

/**
 * Extracts the Authorization header value from a RequestInit,
 * tolerating any letter-casing of the header key.
 */
function authHeader(init: RequestInit): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  return (
    headers['Authorization'] ??
    headers['authorization'] ??
    Object.entries(headers).find(
      ([k]) => k.toLowerCase() === 'authorization',
    )?.[1]
  );
}

/**
 * Extracts the cookie header (if any) from a RequestInit.
 */
function cookieHeader(init: RequestInit): string | undefined {
  const headers = init?.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  return (
    headers['Cookie'] ??
    headers['cookie'] ??
    Object.entries(headers).find(
      ([k]) => k.toLowerCase() === 'cookie',
    )?.[1]
  );
}

/**
 * Stubs global fetch to return a minimal success JSON response.
 */
function stubFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: (h: string) => h === 'content-type' ? 'application/json' : null },
    json: () =>
      Promise.resolve({
        points: [],
        baselines: [],
        tier10: 0,
        tier25: 0,
        tier50: 0,
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generates token strings that look like real JWTs (no spaces, min 10 chars).
 */
const tokenArb = fc
  .string({ minLength: 10, maxLength: 80 })
  .filter((s) => !s.includes(' '));

// ---------------------------------------------------------------------------
// Property 9 — getDeviations
// ---------------------------------------------------------------------------

describe('Property 9: JWT header is the only credential channel (UEBA frontend)', () => {

  test(
    'getDeviations sends JWT only in Authorization header, not in URL or cookies, and reads only hivearmor_auth_token',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getDeviations();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          // Authorization header must be exactly `Bearer <token>`
          expect(authHeader(init)).toBe(`Bearer ${token}`);

          // Token must NOT appear anywhere in the URL
          expect(url).not.toContain(token);

          // No Cookie header carrying the token
          const cookie = cookieHeader(init);
          if (cookie) {
            expect(cookie).not.toContain(token);
          }

          // credentials option must not send browser cookies automatically
          expect(init.credentials).not.toBe('include');

          // Only hivearmor_auth_token should be read from localStorage
          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys, 'No other storage key should be accessed').toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 9 — getRiskScores
  // ---------------------------------------------------------------------------

  test(
    'getRiskScores sends JWT only in Authorization header, not in URL or cookies',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getRiskScores();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          expect(authHeader(init)).toBe(`Bearer ${token}`);
          expect(url).not.toContain(token);

          const cookie = cookieHeader(init);
          if (cookie) {
            expect(cookie).not.toContain(token);
          }
          expect(init.credentials).not.toBe('include');

          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 9 — getEntityTimeline
  // ---------------------------------------------------------------------------

  test(
    'getEntityTimeline sends JWT only in Authorization header, never in URL query params',
    () => {
      const userIdArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes(' '));

      fc.assert(
        fc.property(tokenArb, userIdArb, (token, userId) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getEntityTimeline(userId);

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          expect(authHeader(init)).toBe(`Bearer ${token}`);
          expect(url).not.toContain(token);

          const cookie = cookieHeader(init);
          if (cookie) {
            expect(cookie).not.toContain(token);
          }
          expect(init.credentials).not.toBe('include');

          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 9 — getPeerGroups
  // ---------------------------------------------------------------------------

  test(
    'getPeerGroups sends JWT only in Authorization header',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getPeerGroups();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          expect(authHeader(init)).toBe(`Bearer ${token}`);
          expect(url).not.toContain(token);

          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 9 — getRiskTrend
  // ---------------------------------------------------------------------------

  test(
    'getRiskTrend sends JWT only in Authorization header',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getRiskTrend();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          expect(authHeader(init)).toBe(`Bearer ${token}`);
          expect(url).not.toContain(token);

          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 9 — getAnomalyCounts
  // ---------------------------------------------------------------------------

  test(
    'getAnomalyCounts sends JWT only in Authorization header',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          accessedKeys = [];
          const fetchMock = stubFetchOk();

          void getAnomalyCounts();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          expect(authHeader(init)).toBe(`Bearer ${token}`);
          expect(url).not.toContain(token);

          const nonAuthKeys = accessedKeys.filter(k => k !== 'hivearmor_auth_token');
          expect(nonAuthKeys).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    },
  );
});
