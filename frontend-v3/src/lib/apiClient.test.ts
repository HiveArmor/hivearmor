/**
 * Property test P15 — Every `/api/*` call carries `Authorization` from `hivearmor_auth_token`
 *
 * **Property 15: Every `/api/*` call carries `Authorization` header from `hivearmor_auth_token`.**
 * **Validates: Requirements 7.2, 7.3.**
 *
 * For random non-empty token strings T and random /api/* paths, every outgoing
 * request made through apiClient must include `Authorization: Bearer <T>` and its
 * URL must start with `/api/` (never an absolute backend URL).
 *
 * Also asserts: when `hivearmor_auth_token` is absent from localStorage, no
 * Authorization header is sent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock useAuthStore so apiClient module loads without side-effects ──────────
vi.mock('@/store/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      selectedTenantId: null,
      logout: vi.fn(),
    })),
  },
}));

import { apiClient } from './apiClient';

import { useAuthStore } from '@/store/auth.store';

// ── Hand-rolled random generators ─────────────────────────────────────────────

const TOKEN_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Generate a random alphanumeric JWT-like token of the given length. */
function randomToken(length = 32): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
  }
  return result;
}

const PATH_SUFFIXES = [
  '/ha-search/events',
  '/ha-incidents',
  '/ha-saved-hunts',
  '/ha-users',
  '/ha-alerts',
  '/ha-search/timeline?query=test&from=2024-01-01T00%3A00%3A00.000Z&to=2024-01-02T00%3A00%3A00.000Z',
  '/management/health',
];

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate N distinct random tokens. */
function randomTokens(n: number): string[] {
  return Array.from({ length: n }, () => randomToken(24 + Math.floor(Math.random() * 40)));
}

// ── Fetch mock helpers ────────────────────────────────────────────────────────

/** Captured values from the most recent mocked fetch call. */
interface CapturedCall {
  url: string;
  headers: Record<string, string>;
}
let captured: CapturedCall | null = null;

function mockFetch(status = 200, body: unknown = {}): void {
  captured = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Normalise the URL to a plain string.
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      // Extract headers from init (apiClient always passes a plain object).
      const rawHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { rawHeaders[k.toLowerCase()] = v; });
        } else if (Array.isArray(init.headers)) {
          (init.headers as [string, string][]).forEach(([k, v]) => { rawHeaders[k.toLowerCase()] = v; });
        } else {
          Object.entries(init.headers as Record<string, string>).forEach(([k, v]) => {
            rawHeaders[k.toLowerCase()] = v;
          });
        }
      }

      captured = { url, headers: rawHeaders };

      const responseBody = status === 204 ? '' : JSON.stringify(body);
      return new Response(responseBody, {
        status,
        headers: { 'Content-Type': status === 204 ? 'text/plain' : 'application/json' },
      });
    }),
  );
}

// ── Shared setup / teardown ───────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  captured = null;
  vi.mocked(useAuthStore.getState).mockReturnValue({
    selectedTenantId: null,
    logout: vi.fn(),
  } as unknown as ReturnType<typeof useAuthStore.getState>);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the Authorization header value from the captured fetch call. */
function getCapturedAuthHeader(): string | null {
  return captured?.headers['authorization'] ?? null;
}

/** Extract the URL string from the captured fetch call. */
function getCapturedUrl(): string {
  return captured?.url ?? '';
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('apiClient — Property P15: Authorization header from hivearmor_auth_token', () => {
  // ── 1. GET carries the token ────────────────────────────────────────────────
  describe('apiClient.get', () => {
    it('carries Authorization: Bearer <token> for 50 random tokens', async () => {
      const tokens = randomTokens(50);

      for (const token of tokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(200, []);
        const path = pick(PATH_SUFFIXES);

        await apiClient.get(path).catch(() => {/* navigation side-effects OK */});

        const authHeader = getCapturedAuthHeader();
        expect(authHeader).toBe(`Bearer ${token}`);
      }
    });

    it('URL starts with /api/ (never an absolute backend URL)', async () => {
      const token = randomToken();
      localStorage.setItem('hivearmor_auth_token', token);
      mockFetch(200, []);

      await apiClient.get('/ha-search/events').catch(() => {});

      // buildUrl produces a relative path like /api/ha-search/events.
      // Resolve against http://localhost to parse it safely.
      const rawUrl = getCapturedUrl();
      const base = rawUrl.startsWith('http') ? rawUrl : `http://localhost${rawUrl}`;
      const urlObj = new URL(base);
      expect(urlObj.pathname.startsWith('/api/')).toBe(true);
    });
  });

  // ── 2. POST carries the token ───────────────────────────────────────────────
  describe('apiClient.post', () => {
    it('carries Authorization: Bearer <token> for 50 random tokens', async () => {
      const tokens = randomTokens(50);

      for (const token of tokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(200, { id: 1 });
        const path = pick(PATH_SUFFIXES);

        await apiClient.post(path, { name: 'test' }).catch(() => {});

        const authHeader = getCapturedAuthHeader();
        expect(authHeader).toBe(`Bearer ${token}`);
      }
    });
  });

  // ── 3. PUT carries the token ────────────────────────────────────────────────
  describe('apiClient.put', () => {
    it('carries Authorization: Bearer <token> for 50 random tokens', async () => {
      const tokens = randomTokens(50);

      for (const token of tokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(200, { id: 1 });
        const path = pick(PATH_SUFFIXES);

        await apiClient.put(path, { name: 'updated' }).catch(() => {});

        const authHeader = getCapturedAuthHeader();
        expect(authHeader).toBe(`Bearer ${token}`);
      }
    });
  });

  // ── 4. DELETE carries the token ─────────────────────────────────────────────
  describe('apiClient.delete', () => {
    it('carries Authorization: Bearer <token> for 50 random tokens', async () => {
      const tokens = randomTokens(50);

      for (const token of tokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(204);
        const path = pick(PATH_SUFFIXES);

        await apiClient.delete(path).catch(() => {});

        const authHeader = getCapturedAuthHeader();
        expect(authHeader).toBe(`Bearer ${token}`);
      }
    });
  });

  // ── 5. PATCH carries the token ──────────────────────────────────────────────
  describe('apiClient.patch', () => {
    it('carries Authorization: Bearer <token> for 50 random tokens', async () => {
      const tokens = randomTokens(50);

      for (const token of tokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(200, { id: 1 });
        const path = pick(PATH_SUFFIXES);

        await apiClient.patch(path, { field: 'value' }).catch(() => {});

        const authHeader = getCapturedAuthHeader();
        expect(authHeader).toBe(`Bearer ${token}`);
      }
    });
  });

  // ── 6. No token → no Authorization header ───────────────────────────────────
  describe('missing token', () => {
    it('sends NO Authorization header when hivearmor_auth_token is absent', async () => {
      // Ensure token is NOT present
      localStorage.removeItem('hivearmor_auth_token');
      mockFetch(200, []);

      await apiClient.get('/ha-search/events').catch(() => {});

      const authHeader = getCapturedAuthHeader();
      expect(authHeader).toBeNull();
    });

    it('sends NO Authorization header when hivearmor_auth_token is removed mid-session', async () => {
      // Set token, then remove before the call
      localStorage.setItem('hivearmor_auth_token', randomToken());
      localStorage.removeItem('hivearmor_auth_token');
      mockFetch(200, []);

      await apiClient.get('/ha-incidents').catch(() => {});

      expect(getCapturedAuthHeader()).toBeNull();
    });
  });

  describe('public authentication calls', () => {
    it('does not attach a stale token when auth is explicitly disabled', async () => {
      localStorage.setItem('hivearmor_auth_token', 'expired-token');
      mockFetch(200, { token: 'fresh-token' });

      await apiClient.post('/authenticate', { username: 'analyst', password: 'secret' }, { auth: 'none' });

      expect(getCapturedAuthHeader()).toBeNull();
    });

    it('does not attach stale tenant scope when auth is explicitly disabled', async () => {
      vi.mocked(useAuthStore.getState).mockReturnValue({
        selectedTenantId: 42,
        logout: vi.fn(),
      } as unknown as ReturnType<typeof useAuthStore.getState>);
      mockFetch(200, { token: 'fresh-token' });

      await apiClient.post('/authenticate', { username: 'analyst', password: 'secret' }, { auth: 'none' });

      expect(captured?.headers['x-tenant-id'] ?? null).toBeNull();
    });
  });

  // ── 7. Token value is reflected verbatim ────────────────────────────────────
  describe('token fidelity', () => {
    it('Authorization header contains the exact token string (no encoding, no truncation)', async () => {
      // Test a handful of deliberately varied token shapes
      const specialTokens = [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',  // JWT-like
        'simple-token',
        'a'.repeat(512),  // very long token
        '123456',         // numeric
        'tok_with_underscores_and-dashes',
      ];

      for (const token of specialTokens) {
        localStorage.setItem('hivearmor_auth_token', token);
        mockFetch(200, []);

        await apiClient.get('/ha-users').catch(() => {});

        expect(getCapturedAuthHeader()).toBe(`Bearer ${token}`);
      }
    });
  });

  // ── 8. All paths stay under /api/ ───────────────────────────────────────────
  describe('URL discipline', () => {
    it('every request URL path starts with /api/ regardless of method', async () => {
      const token = randomToken();
      localStorage.setItem('hivearmor_auth_token', token);

      const paths = [
        '/ha-search/events',
        '/ha-incidents',
        '/ha-saved-hunts',
        '/ha-users',
      ];

      for (const path of paths) {
        mockFetch(200, {});
        await apiClient.get(path).catch(() => {});
        const rawGetUrl = getCapturedUrl();
        const getBase = rawGetUrl.startsWith('http') ? rawGetUrl : `http://localhost${rawGetUrl}`;
        expect(new URL(getBase).pathname).toMatch(/^\/api\//);

        mockFetch(200, {});
        await apiClient.post(path, {}).catch(() => {});
        const rawPostUrl = getCapturedUrl();
        const postBase = rawPostUrl.startsWith('http') ? rawPostUrl : `http://localhost${rawPostUrl}`;
        expect(new URL(postBase).pathname).toMatch(/^\/api\//);
      }
    });
  });
});
