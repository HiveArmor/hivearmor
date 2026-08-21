/**
 * Property 8: JWT header is the only credential channel.
 *
 * For every call in `ruleGenerationService`, the outgoing `Request` carries an
 * `Authorization: Bearer <token>` header sourced from
 * `localStorage['hivearmor_auth_token']`, has no credential-bearing query params,
 * and reads no other storage key.
 *
 * **Validates: Requirements 5.10, 6.6**
 */
import * as fc from 'fast-check';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { ruleGenerationService } from '@/services/ruleGeneration.service';
import type { GenerateRequestDTO } from '@/types/ruleGeneration.types';

// ---------------------------------------------------------------------------
// Shared mutable state updated per property iteration.
// ---------------------------------------------------------------------------

let currentToken = '';

const localStorageMock = {
  getItem: vi.fn((key: string) =>
    key === 'hivearmor_auth_token' ? currentToken : null,
  ),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
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
 * Credential-bearing query param patterns that must NEVER appear in URLs.
 */
const CREDENTIAL_PARAMS = ['token=', 'key=', 'auth=', 'credential='];

/**
 * Stubs global fetch to return a minimal success response.
 */
function stubFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        id: 1,
        status: 'pending_review',
        ruleName: 'test-rule',
        ruleYaml: 'name: test',
        signalKey: 'key',
        requestedBy: null,
        approvedPath: null,
        createdAt: '2026-07-25T00:00:00Z',
        updatedAt: '2026-07-25T00:00:00Z',
        minCount: 3,
        truePositiveTotal: 5,
        falsePositiveTotal: 2,
        groups: [],
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
// Shared assertion helpers — verify all three JWT channel invariants
// ---------------------------------------------------------------------------

function assertJwtOnlyChannel(
  fetchMock: ReturnType<typeof vi.fn>,
  token: string,
): void {
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const url = capturedUrl(fetchMock);
  const init = capturedInit(fetchMock);

  // 1. Authorization header equals exactly `Bearer <token>`
  expect(authHeader(init)).toBe(`Bearer ${token}`);

  // 2. URL does not contain credential-bearing query params
  for (const param of CREDENTIAL_PARAMS) {
    expect(url.toLowerCase()).not.toContain(param);
  }

  // 3. Token must NOT appear anywhere in the URL
  expect(url).not.toContain(token);

  // 4. No Cookie header carrying the token
  const cookie = cookieHeader(init);
  if (cookie) {
    expect(cookie).not.toContain(token);
  }

  // 5. credentials option must not be set to 'include'
  expect(init.credentials).not.toBe('include');

  // 6. localStorage.getItem was ONLY called with 'hivearmor_auth_token'
  const getItemCalls = localStorageMock.getItem.mock.calls;
  for (const [key] of getItemCalls) {
    expect(key).toBe('hivearmor_auth_token');
  }
}

// ---------------------------------------------------------------------------
// Property 8 — all six ruleGenerationService methods
// ---------------------------------------------------------------------------

describe('Property 8: JWT header is the only credential channel', () => {
  test('getSignalSummary sends JWT only in Authorization header', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        void ruleGenerationService.getSignalSummary();

        assertJwtOnlyChannel(fetchMock, token);
      }),
      { numRuns: 100 },
    );
  });

  test('getPendingSessions sends JWT only in Authorization header', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        void ruleGenerationService.getPendingSessions();

        assertJwtOnlyChannel(fetchMock, token);
      }),
      { numRuns: 100 },
    );
  });

  test('generateSession sends JWT only in Authorization header, not in body', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        const dto: GenerateRequestDTO = {
          signalKey: 'windows-auth-failure',
          minCount: 3,
        };

        void ruleGenerationService.generateSession(dto);

        assertJwtOnlyChannel(fetchMock, token);

        // Additionally verify the token is NOT in the request body
        const init = capturedInit(fetchMock);
        const body = typeof init.body === 'string' ? init.body : '';
        expect(body).not.toContain(token);
      }),
      { numRuns: 100 },
    );
  });

  test('approveSession sends JWT only in Authorization header', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        void ruleGenerationService.approveSession(42);

        assertJwtOnlyChannel(fetchMock, token);
      }),
      { numRuns: 100 },
    );
  });

  test('rejectSession sends JWT only in Authorization header', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        void ruleGenerationService.rejectSession(99);

        assertJwtOnlyChannel(fetchMock, token);
      }),
      { numRuns: 100 },
    );
  });

  test('regenerateSession sends JWT only in Authorization header, not in body', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        currentToken = token;
        localStorageMock.getItem.mockClear();
        const fetchMock = stubFetchOk();

        const dto: GenerateRequestDTO = {
          signalKey: 'linux-ssh-brute',
          minCount: 5,
        };

        void ruleGenerationService.regenerateSession(7, dto);

        assertJwtOnlyChannel(fetchMock, token);

        // Additionally verify the token is NOT in the request body
        const init = capturedInit(fetchMock);
        const body = typeof init.body === 'string' ? init.body : '';
        expect(body).not.toContain(token);
      }),
      { numRuns: 100 },
    );
  });
});
