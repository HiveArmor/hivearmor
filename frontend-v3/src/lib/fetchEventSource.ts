/**
 * fetchEventSource — a minimal, dependency-free Server-Sent-Events client built on
 * `fetch()` + `ReadableStream` so the JWT travels in the `Authorization` header instead of
 * the URL query string (B0-5c: native `EventSource` cannot set headers, which forced the
 * token into `?access_token=` / `?token=` — a bearer-credential leak into proxy logs,
 * browser history, and Referer headers).
 *
 * Parity with the browser `EventSource` this replaces:
 *  - parses `event:`, `data:` (multi-line), and `id:` fields per the SSE wire format;
 *  - dispatches to named-event handlers (default event name is "message");
 *  - auto-reconnects with a fixed backoff, replaying `Last-Event-ID`;
 *  - `:` comment lines (keepalives) are ignored.
 *
 * The token is read from the caller (never logged). Cancellation is via AbortController.
 */

export interface SseMessage {
  /** Event name — the SSE `event:` field, or 'message' when absent. */
  event: string;
  /** The concatenated `data:` payload for this event. */
  data: string;
  /** The `id:` field for this event, if any. */
  id?: string;
}

export interface FetchEventSourceOptions {
  /** Bearer token sent as `Authorization: Bearer <token>`. Never placed in the URL. */
  token: string;
  /** Called for every parsed event. */
  onMessage: (message: SseMessage) => void;
  /** Called when the stream connects (HTTP 200 + body). */
  onOpen?: () => void;
  /** Called on a transport error (before a reconnect is scheduled). */
  onError?: (error: unknown) => void;
  /** Reconnect delay in ms (default 5000). Pass 0 to disable auto-reconnect. */
  reconnectDelayMs?: number;
}

export interface FetchEventSourceHandle {
  /** Close the stream and stop reconnecting. Idempotent. */
  close: () => void;
}

/**
 * Opens an authenticated SSE stream. Returns a handle whose `close()` aborts the
 * connection and cancels any pending reconnect.
 */
export function fetchEventSource(url: string, options: FetchEventSourceOptions): FetchEventSourceHandle {
  const { token, onMessage, onOpen, onError, reconnectDelayMs = 5000 } = options;

  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastEventId: string | undefined;

  const connect = async (): Promise<void> => {
    if (closed) return;
    controller = new AbortController();
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      };
      if (lastEventId) headers['Last-Event-ID'] = lastEventId;

      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }
      onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = indexOfFrameEnd(buffer)) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep).replace(/^(\r\n\r\n|\n\n|\r\r)/, '');
          const message = parseFrame(frame);
          if (message) {
            if (message.id !== undefined) lastEventId = message.id;
            onMessage(message);
          }
        }
      }
      // Server closed the stream cleanly — reconnect unless we were told to stop.
      throw new Error('SSE stream ended');
    } catch (error) {
      if (closed || (error as Error)?.name === 'AbortError') return;
      onError?.(error);
      if (reconnectDelayMs > 0) {
        reconnectTimer = setTimeout(() => void connect(), reconnectDelayMs);
      }
    }
  };

  void connect();

  return {
    close: () => {
      closed = true;
      controller?.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    },
  };
}

/** Returns the index just past the end of the first complete SSE frame, or -1. */
function indexOfFrameEnd(buffer: string): number {
  const candidates = ['\r\n\r\n', '\n\n', '\r\r']
    .map((sep) => ({ sep, at: buffer.indexOf(sep) }))
    .filter((c) => c.at !== -1)
    .sort((a, b) => a.at - b.at);
  if (candidates.length === 0) return -1;
  return candidates[0].at;
}

/** Parses one SSE frame (already stripped of its trailing blank line). */
function parseFrame(frame: string): SseMessage | null {
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split(/\r\n|\n|\r/)) {
    if (rawLine === '' || rawLine.startsWith(':')) continue; // blank or comment/keepalive
    const colon = rawLine.indexOf(':');
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    // Per spec: strip a single leading space after the colon.
    let val = colon === -1 ? '' : rawLine.slice(colon + 1);
    if (val.startsWith(' ')) val = val.slice(1);
    if (field === 'event') event = val;
    else if (field === 'data') dataLines.push(val);
    else if (field === 'id') id = val;
  }

  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n'), id };
}
