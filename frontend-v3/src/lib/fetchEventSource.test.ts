import { describe, it, expect, vi, afterEach } from 'vitest';

import { fetchEventSource, type SseMessage } from './fetchEventSource';

/** Build a Response whose body streams the given chunks, then ends. */
function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

afterEach(() => vi.restoreAllMocks());

describe('fetchEventSource', () => {
  it('sends the token in the Authorization header, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse(['event: ping\ndata: {}\n\n']));
    vi.stubGlobal('fetch', fetchMock);

    const handle = fetchEventSource('/api/ha-alerts/A1/stream', {
      token: 'JWT123',
      onMessage: () => {},
      reconnectDelayMs: 0,
    });
    await flush();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ha-alerts/A1/stream');            // no ?access_token / ?token
    expect(url).not.toContain('JWT123');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer JWT123');
    handle.close();
  });

  it('dispatches named events with parsed data', async () => {
    const events: SseMessage[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([
      'event: alert.updated\ndata: {"id":"A1"}\nid: 7\n\n',
      'event: story.appended\ndata: {"item":1}\n\n',
    ])));

    fetchEventSource('/x', { token: 't', onMessage: (m) => events.push(m), reconnectDelayMs: 0 });
    await flush(); await flush();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: 'alert.updated', data: '{"id":"A1"}', id: '7' });
    expect(events[1]).toMatchObject({ event: 'story.appended', data: '{"item":1}' });
  });

  it('concatenates multi-line data and ignores keepalive comments', async () => {
    const events: SseMessage[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([
      ': keepalive\n\n',
      'data: line1\ndata: line2\n\n',
    ])));

    fetchEventSource('/x', { token: 't', onMessage: (m) => events.push(m), reconnectDelayMs: 0 });
    await flush(); await flush();

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line1\nline2');
    expect(events[0].event).toBe('message');
  });

  it('handles a frame split across chunk boundaries', async () => {
    const events: SseMessage[] = [];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse([
      'event: split\nda', 'ta: {"ok":true}\n', '\n',
    ])));

    fetchEventSource('/x', { token: 't', onMessage: (m) => events.push(m), reconnectDelayMs: 0 });
    await flush(); await flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'split', data: '{"ok":true}' });
  });

  it('close() aborts the request and stops reconnects', async () => {
    const abort = vi.fn();
    const OriginalAC = AbortController;
    vi.stubGlobal('AbortController', class extends OriginalAC { abort() { abort(); super.abort(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamingResponse(['data: x\n\n'])));

    const handle = fetchEventSource('/x', { token: 't', onMessage: () => {}, reconnectDelayMs: 0 });
    handle.close();
    expect(abort).toHaveBeenCalled();
  });
});
