/**
 * Property 9: `searchService` never embeds the JWT in the URL.
 *
 * For any JWT string and any (query, indexPattern) inputs, the fetch call issued
 * by translateNlToDsl must:
 *   - NOT contain the JWT as a substring in the URL
 *   - carry the Authorization header set to exactly `Bearer ${token}`
 *   - NOT embed the JWT anywhere in the serialised request body
 *
 * **Validates: Requirements 7.5, 7.6, 7.7, 16.3**
 */
import * as fc from 'fast-check';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { translateNlToDsl } from '@/services/searchService';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Mutable ref updated per property iteration so localStorage.getItem returns
 *  the current token without needing a full module reload. */
let currentToken = '';

const localStorageMock = {
  getItem: vi.fn((key: string) =>
    key === 'hivearmor_auth_token' ? currentToken : null,
  ),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

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

/** URL passed as the first argument to fetch. */
function capturedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string;
}

/** RequestInit passed as the second argument to fetch. */
function capturedInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

/**
 * Extracts the Authorization header value from the captured RequestInit,
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

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generates token strings that look like real JWTs (no spaces, min 10 chars)
 * but are fully arbitrary — the property must hold for ALL such strings.
 */
const tokenArb = fc
  .string({ minLength: 10, maxLength: 80 })
  .filter((s) => s.length > 0 && !s.includes(' '));

const queryArb = fc.string({ minLength: 1, maxLength: 200 });
const indexPatternArb = fc.string({ minLength: 1, maxLength: 100 });

// ---------------------------------------------------------------------------
// Property 9
// ---------------------------------------------------------------------------

describe('Property 9: searchService never embeds JWT in URL', () => {
  test(
    'translateNlToDsl never puts JWT in URL and always sends it in Authorization header',
    () => {
      fc.assert(
        fc.property(tokenArb, queryArb, indexPatternArb, (token, query, indexPattern) => {
          // Update the shared token so localStorage.getItem returns this token
          currentToken = token;

          // Stub fetch to capture call arguments and return a minimal happy-path response
          const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                dsl: '{"query":{"match_all":{}}}',
                explanation: '',
                confidence: 0.75,
              }),
          });
          vi.stubGlobal('fetch', fetchMock);

          // Call translateNlToDsl — do NOT await.
          // The underlying fetch() call is made synchronously before the first
          // `await response.json()` continuation, so fetchMock is captured
          // on the same tick.
          void translateNlToDsl(query, indexPattern);

          // fetch must have been called exactly once
          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);

          // Assertion 1: JWT does NOT appear anywhere in the URL
          expect(url, `URL must not contain the token`).not.toContain(token);

          // Assertion 2: Authorization header equals `Bearer ${token}` exactly
          const auth = authHeader(init);
          expect(auth, `Authorization header must be "Bearer ${token}"`).toBe(
            `Bearer ${token}`,
          );

          // Assertion 3: JWT does NOT appear as a raw substring in the request body
          const body = typeof init.body === 'string' ? init.body : '';
          expect(body, `Request body must not contain the raw token`).not.toContain(
            token,
          );
        }),
        { numRuns: 100 },
      );
    },
  );
});
