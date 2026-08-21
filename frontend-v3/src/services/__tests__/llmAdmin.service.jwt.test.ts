/**
 * Property 14: JWT header is the only credential channel.
 *
 * For any method on `llmAdminService` and any JWT string in
 * `localStorage['hivearmor_auth_token']`, the outbound HTTP request SHALL
 * carry the header `Authorization: Bearer <jwt>` and SHALL NOT carry
 * credentials in the URL, in a cookie, or in the request body.
 *
 * **Validates: Requirements 7.3**
 */
import * as fc from 'fast-check';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { llmAdminService } from '@/services/llmAdmin.service';
import type { LlmConfigUpdateDTO } from '@/types/llmAdmin.types';

// ---------------------------------------------------------------------------
// Shared mutable state updated per property iteration.
// This avoids needing to re-import the module per token value since
// llmAdminService.authHeaders() calls localStorage.getItem on every invocation.
// ---------------------------------------------------------------------------

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

/** URL string passed as the first argument to fetch(). */
function capturedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string;
}

/** RequestInit passed as the second argument to fetch(). */
function capturedInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

/**
 * Returns the Authorization header value from a RequestInit, tolerating any
 * letter-casing of the header key.
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
 * Returns the serialised body string from a RequestInit (empty string when
 * there is no body, e.g. for GET requests).
 */
function bodyString(init: RequestInit): string {
  return typeof init.body === 'string' ? init.body : '';
}

/**
 * Stubs global fetch to return a minimal success response.
 * The response JSON shape covers all three GET endpoints.
 */
function stubFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        configured: true,
        provider: 'ollama',
        latencyMs: 42,
        models: [],
      }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
  .filter((s) => !s.includes(' '));

// ---------------------------------------------------------------------------
// Property 14 — getStatus
// ---------------------------------------------------------------------------

describe('Property 14: JWT header is the only credential channel', () => {

  test(
    'getStatus sends JWT only in Authorization header, not in URL or cookies',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          const fetchMock = stubFetchOk();

          // Call the service — do NOT await; the fetch() call is issued
          // synchronously before the first continuation, so the mock captures it.
          void llmAdminService.getStatus();

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

          // credentials option must not be set to 'include' (which would send
          // browser cookies automatically)
          expect(init.credentials).not.toBe('include');
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 14 — updateConfig (POST with body)
  // ---------------------------------------------------------------------------

  test(
    'updateConfig sends JWT only in Authorization header, not in URL, body, or cookies',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          const fetchMock = stubFetchOk();

          const dto: LlmConfigUpdateDTO = {
            provider: 'ollama',
            baseUrl: 'http://ollama:11434',
            model: 'llama3.2:3b',
          };

          void llmAdminService.updateConfig(dto);

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);
          const body = bodyString(init);

          // Authorization header must be exactly `Bearer <token>`
          expect(authHeader(init)).toBe(`Bearer ${token}`);

          // Token must NOT appear anywhere in the URL
          expect(url).not.toContain(token);

          // Token must NOT appear as a raw substring in the serialised body
          expect(body).not.toContain(token);

          // No Cookie header carrying the token
          const cookie = cookieHeader(init);
          if (cookie) {
            expect(cookie).not.toContain(token);
          }

          // credentials option must not be set to 'include'
          expect(init.credentials).not.toBe('include');
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 14 — listModels
  // ---------------------------------------------------------------------------

  test(
    'listModels sends JWT only in Authorization header, not in URL or cookies',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;
          const fetchMock = stubFetchOk();

          void llmAdminService.listModels();

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

          // credentials option must not be set to 'include'
          expect(init.credentials).not.toBe('include');
        }),
        { numRuns: 100 },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // Property 14 — pullModel (POST SSE, captured on the initial fetch)
  // ---------------------------------------------------------------------------

  test(
    'pullModel sends JWT only in Authorization header, not in URL, body, or cookies',
    () => {
      fc.assert(
        fc.property(tokenArb, (token) => {
          currentToken = token;

          // pullModel reads r.body which must be a readable stream.
          // We mock it returning a minimal body so the function can proceed
          // past the `if (!r.ok || !r.body)` guard, but we do not await the
          // generator — we only need to observe the fetch call.
          const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            body: {
              getReader: () => ({
                read: vi
                  .fn()
                  .mockResolvedValueOnce({
                    value: new TextEncoder().encode(
                      'data: {"status":"success","total":null,"completed":null,"digest":null}\n\n',
                    ),
                    done: false,
                  })
                  .mockResolvedValueOnce({ value: undefined, done: true }),
                cancel: vi.fn(),
              }),
            },
          });
          vi.stubGlobal('fetch', fetchMock);

          // Invoke the async generator — do NOT consume it; we only need
          // the first fetch() call to have been issued.
          void (async () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _frame of llmAdminService.pullModel('llama3.2:3b')) {
              break; // stop after first yield
            }
          })();

          expect(fetchMock).toHaveBeenCalledTimes(1);

          const url = capturedUrl(fetchMock);
          const init = capturedInit(fetchMock);
          const body = bodyString(init);

          // Authorization header must be exactly `Bearer <token>`
          expect(authHeader(init)).toBe(`Bearer ${token}`);

          // Token must NOT appear anywhere in the URL
          expect(url).not.toContain(token);

          // Token must NOT appear as a raw substring in the serialised body
          expect(body).not.toContain(token);

          // No Cookie header carrying the token
          const cookie = cookieHeader(init);
          if (cookie) {
            expect(cookie).not.toContain(token);
          }

          // credentials option must not be set to 'include'
          expect(init.credentials).not.toBe('include');
        }),
        { numRuns: 100 },
      );
    },
  );
});
