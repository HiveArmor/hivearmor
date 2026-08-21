/**
 * Property 5: JWT header-only transmission.
 *
 * For any HTTP request issued by any sprint function, the JWT appears only in
 * the Authorization: Bearer header — never in the URL path, query string, or fragment.
 *
 * Validates: Requirements 9.3, 9.10, 22.5, 22.6
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const TEST_JWT = 'eyJhbGciOiJIUzI1NiJ9.test.payload';

// ---------------------------------------------------------------------------
// Setup: mock localStorage and global fetch
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => (key === 'hivearmor_auth_token' ? TEST_JWT : null)),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Creates a mock fetch that returns a resolved Response with the given body. */
function mockFetchWith(body: unknown, ok = true) {
  const response = {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
    body: {
      getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ value: new TextEncoder().encode('data:{"delta":"x","done":false}\n'), done: false })
          .mockResolvedValueOnce({ value: new TextEncoder().encode('data:{"delta":"","done":true,"totalTokens":1}\n'), done: false })
          .mockResolvedValueOnce({ done: true, value: undefined as unknown as Uint8Array }),
        cancel: vi.fn(),
      }),
    },
  };
  return vi.fn().mockResolvedValue(response);
}

function capturedUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return fetchMock.mock.calls[0][0] as string;
}

function capturedHeaders(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return init?.headers as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 5: JWT header-only transmission', () => {

  it('streamChat sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith(null);
    vi.stubGlobal('fetch', fetchMock);

    const { streamChat } = await import('@/services/aiChatService');
    // Drain the generator
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _evt of streamChat(
      [{ role: 'user', content: 'hi' }],
      'general',
    )) { /* consume */ }

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });

  it('getHistory sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith([]);
    vi.stubGlobal('fetch', fetchMock);

    const { getHistory } = await import('@/services/aiChatService');
    await getHistory('alert', 'ctx-1');

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });

  it('generateTriage sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith({ summary: 'ok' });
    vi.stubGlobal('fetch', fetchMock);

    const { generateTriage } = await import('@/services/aiChatService');
    await generateTriage('alert-1');

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });

  it('getAiStatus sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith({ configured: true, provider: 'openai' });
    vi.stubGlobal('fetch', fetchMock);

    const { getAiStatus } = await import('@/services/aiChatService');
    await getAiStatus();

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });

  it('generateIncidentSummary sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith({
      narrative: 'n', threatActorType: 'APT', recommendedSteps: ['s'], riskLevel: 'high',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { generateIncidentSummary } = await import('@/services/aiChatService');
    await generateIncidentSummary('inc-1');

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });

  it('saveHistory sends JWT only in Authorization header, never in URL', async () => {
    const fetchMock = mockFetchWith({
      id: 1, userLogin: 'u', contextType: 'general', contextId: null,
      messages: [], createdAt: '', updatedAt: '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const { saveHistory } = await import('@/services/aiChatService');
    await saveHistory([{ role: 'user', content: 'hi' }], 'general');

    const url = capturedUrl(fetchMock);
    const headers = capturedHeaders(fetchMock);

    expect(headers['Authorization']).toBe(`Bearer ${TEST_JWT}`);
    expect(url).not.toContain(TEST_JWT);
  });
});
