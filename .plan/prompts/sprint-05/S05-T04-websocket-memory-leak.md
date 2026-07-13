# S05-T04: Fix WebSocket Memory Leak in IR Console Hook

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** PERF-04
**Dependencies:** None
**Estimated time:** 1–2 hours

---

## Context

The hook `frontend-v2/src/hooks/use-incident-command-ws.ts` manages a STOMP-over-SockJS WebSocket connection for the Incident Response (IR) console terminal. The hook maintains two resources that must be explicitly cleaned up: the WebSocket connection itself and a heartbeat `setInterval` that fires every 10 seconds. When the user navigates away from the IR console page, these resources can survive if the cleanup is incomplete.

The hook has two `useEffect` calls. The first (hostname-reactive, lines 181–193) does call `disconnect()` in its return/cleanup function — that part is correct. The second `useEffect` (mount/unmount, lines 195–201) only calls `clearInterval(heartbeatRef.current)` directly; it does NOT call `disconnect()`. If the hostname-reactive effect has not yet run (e.g., because `hostname` is undefined on first mount), or if both effects race on unmount, the WebSocket connection can survive the component lifecycle. Over an analyst's shift — navigating in and out of the IR console multiple times — leaked WebSocket connections and interval timers accumulate, exhausting browser connection slots and causing degraded performance.

The correct fix is to call `disconnect()` from the mount/unmount effect's cleanup, ensuring the WebSocket and heartbeat are torn down unconditionally on unmount regardless of effect ordering. The `disconnect()` function is already idempotent (it guards on `wsRef.current` being non-null before sending a STOMP DISCONNECT frame and calling `ws.close()`), so calling it twice is safe.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/frontend-v2/src/hooks/use-incident-command-ws.ts` — read the entire file carefully. Key sections:
   - `disconnect()` function (line 82): see that it is idempotent — clears interval, sends STOMP DISCONNECT, closes socket, nulls `wsRef.current`.
   - `connect(host)` function (line 92): sets up `ws.onopen`, `ws.onmessage`, `ws.onerror`, `ws.onclose`.
   - Heartbeat `setInterval` (line 162): started inside the `ws.onmessage` handler on receipt of the STOMP `CONNECTED` frame; stored in `heartbeatRef.current`.
   - First `useEffect` (line 181–193): hostname-reactive, cleanup calls `disconnect()`. This is correct.
   - Second `useEffect` (line 195–201): mount/unmount, cleanup only calls `clearInterval`. **This is the bug.**

---

## Implementation Steps

### Step 1 — Fix the mount/unmount useEffect cleanup

The only code change required is in the second `useEffect`. Change it so the cleanup function calls `disconnect()` instead of (or in addition to) the inline `clearInterval`:

**Current code (lines 195–201):**
```typescript
useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
    clearInterval(heartbeatRef.current);
  };
}, []);
```

**Fixed code:**
```typescript
useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
    disconnect(); // ensures WebSocket AND heartbeat are both torn down on unmount
  };
}, []);
```

The inline `clearInterval` can be removed because `disconnect()` (line 83) already calls `clearInterval(heartbeatRef.current)` as its first operation. Keeping both is also harmless since `clearInterval` on an already-cleared or undefined timer is a no-op.

### Step 2 — Verify disconnect() is stable as a dependency

`disconnect` is defined with `useCallback` (or as a plain function inside the hook body). Confirm it does not need to be in the `useEffect` dependency array. Since the `useEffect` has `[]` (mount/unmount only), and `disconnect` is a stable function reference closed over refs (not state), this is correct — no dependency array change is needed.

If `disconnect` is NOT wrapped in `useCallback`, add it:

```typescript
const disconnect = useCallback(() => {
  clearInterval(heartbeatRef.current);
  if (wsRef.current) {
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('DISCONNECT\n\n\0'); // STOMP DISCONNECT frame
    }
    wsRef.current.close();
    wsRef.current = null;
  }
  setStatus('disconnected');
}, []); // no dependencies — only operates on refs and state setter
```

### Step 3 — Add a dev-mode warning for leaked connections (optional, low effort)

Inside `connect()`, before creating the new `WebSocket`, add a guard that warns if a previous connection is still open:

```typescript
function connect(host: string) {
  if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
    console.warn('[use-incident-command-ws] connect() called while previous WebSocket is still open — disconnecting first');
    disconnect();
  }
  // ... rest of connect
}
```

This surfaces future regressions immediately in the browser console during development.

---

## Test Commands

```bash
# Unit tests
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2
npm test -- --testPathPattern="use-incident-command-ws"

# Full frontend test suite
npm test

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

Write this test in `frontend-v2/src/hooks/__tests__/use-incident-command-ws.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useIncidentCommandWs } from '../use-incident-command-ws';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = MockWebSocket.CLOSED; }
}

let mockWs: MockWebSocket;

beforeEach(() => {
  mockWs = new MockWebSocket();
  (global as any).WebSocket = jest.fn(() => mockWs);
});

afterEach(() => {
  jest.clearAllMocks();
});

test('disconnect is called on unmount, closing the WebSocket', () => {
  const { result, unmount } = renderHook(() =>
    useIncidentCommandWs('localhost')
  );

  // Simulate connection opening and STOMP CONNECTED frame
  act(() => { mockWs.onopen?.(); });
  act(() => {
    mockWs.onmessage?.({
      data: 'CONNECTED\nversion:1.2\n\n\0',
    } as MessageEvent);
  });

  // Verify connected
  expect(result.current.status).toBe('connected');

  // Unmount the hook (simulates navigating away)
  unmount();

  // WebSocket must be closed after unmount
  expect(mockWs.closed).toBe(true);
});

test('heartbeat interval is cleared on unmount', () => {
  const clearSpy = jest.spyOn(global, 'clearInterval');
  const { unmount } = renderHook(() => useIncidentCommandWs('localhost'));

  act(() => { mockWs.onopen?.(); });
  act(() => {
    mockWs.onmessage?.({ data: 'CONNECTED\nversion:1.2\n\n\0' } as MessageEvent);
  });

  unmount();

  expect(clearSpy).toHaveBeenCalled();
});

test('multiple unmounts do not throw (disconnect is idempotent)', () => {
  const { unmount } = renderHook(() => useIncidentCommandWs('localhost'));
  expect(() => {
    unmount();
    unmount(); // second unmount must not throw
  }).not.toThrow();
});
```

---

## Acceptance Criteria

- [ ] The mount/unmount `useEffect` cleanup calls `disconnect()` before returning.
- [ ] Navigating away from the IR console page results in `WebSocket.close()` being called (verifiable via browser DevTools Network tab — the WS connection status changes to "Closed").
- [ ] The heartbeat interval timer is cleared on unmount (no residual timers visible in `window.__timers` or browser DevTools performance profiler).
- [ ] `useIncidentCommandWs` unit tests pass, including the unmount-closes-websocket assertion.
- [ ] `npx tsc --noEmit` reports zero errors.
- [ ] `npm run lint` passes with no new warnings.
- [ ] Repeated navigation in and out of the IR console page (5+ times) does not accumulate open WebSocket connections in browser DevTools.
