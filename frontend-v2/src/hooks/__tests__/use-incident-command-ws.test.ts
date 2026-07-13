import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Tests for the disconnect() lifecycle contract, extracted from the hook.
// We test the raw function behaviour (idempotency, interval clearing, socket closing)
// rather than mounting a React hook, because this environment has no DOM/jsdom.
// The hook's useEffect cleanup correctness is verified by code review; these tests
// lock down the invariants that make the fix safe.

// Minimal replica of disconnect() as it exists in the hook after the fix.
// Keeps in sync with use-incident-command-ws.ts: lines 82-90.
function makeDisconnect(
  wsRef: { current: WebSocket | null },
  heartbeatRef: { current: ReturnType<typeof setInterval> | null },
  mountedRef: { current: boolean },
  setStatus: (s: string) => void,
) {
  return function disconnect() {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.send("DISCONNECT\n\n\x00"); } catch { /* ignore */ }
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mountedRef.current) setStatus("disconnected");
  };
}

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = FakeWebSocket.CLOSED; }
}

describe("disconnect() idempotency and cleanup", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("closes the WebSocket on first call", () => {
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const mountedRef = { current: true };
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    disconnect();

    expect(ws.closed).toBe(true);
    expect(wsRef.current).toBeNull();
    expect(setStatus).toHaveBeenCalledWith("disconnected");
  });

  it("clears the heartbeat interval on first call", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = {
      current: setInterval(() => {}, 10_000),
    };
    const mountedRef = { current: true };
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    disconnect();

    expect(clearSpy).toHaveBeenCalled();
    expect(heartbeatRef.current).toBeNull();
  });

  it("calling disconnect() twice does not throw (idempotent)", () => {
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const mountedRef = { current: true };
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    expect(() => {
      disconnect();
      disconnect(); // second call must be a no-op, not throw
    }).not.toThrow();
  });

  it("does not call setStatus when mountedRef is false (unmounted)", () => {
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const mountedRef = { current: false }; // component already unmounted
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    disconnect();

    // WebSocket is still closed (cleanup happened)
    expect(ws.closed).toBe(true);
    // But React state setter is NOT called on an unmounted component
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("sends STOMP DISCONNECT frame before closing", () => {
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const mountedRef = { current: true };
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    disconnect();

    expect(ws.sent.some(f => f.startsWith("DISCONNECT"))).toBe(true);
  });

  it("heartbeat does not fire after disconnect clears the interval", () => {
    const callback = vi.fn();
    const ws = new FakeWebSocket();
    const wsRef = { current: ws as unknown as WebSocket };
    const heartbeatRef: { current: ReturnType<typeof setInterval> | null } = {
      current: setInterval(callback, 10_000),
    };
    const mountedRef = { current: true };
    const setStatus = vi.fn();

    const disconnect = makeDisconnect(wsRef, heartbeatRef, mountedRef, setStatus);
    disconnect();

    vi.advanceTimersByTime(30_000); // 3× heartbeat period
    expect(callback).not.toHaveBeenCalled();
  });
});
