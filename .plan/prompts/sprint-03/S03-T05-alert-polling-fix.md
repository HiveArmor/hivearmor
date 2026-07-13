# S03-T05 — Remove Dual SSE+Interval Alert Polling Storm

**Sprint:** 3 (Frontend RBAC + Key UX Features)  
**Severity:** MEDIUM — Performance/OpenSearch overload  
**Issue ID:** PERF-03  
**Dependencies:** None  
**Estimated time:** 2 hours

---

## Context

The alerts page fires TWO concurrent refresh mechanisms simultaneously:
1. An SSE (Server-Sent Events) listener that fires `loadAlerts()` on each event
2. A `setInterval` every 30 seconds that also fires `loadAlerts()`

During high-volume alert ingestion, SSE events fire at high frequency, each triggering a full OpenSearch query. The 30s interval fires on top of that. With no debounce, this can trigger dozens of concurrent OpenSearch queries per minute, overwhelming the backend.

**Affected file:** `frontend-v2/src/app/(app)/alerts/page.tsx`

---

## What to Read First

1. `frontend-v2/src/app/(app)/alerts/page.tsx` — find the SSE listener setup and `setInterval` for alert loading
2. Look for `EventSource`, `useEffect`, and `setInterval` in the file
3. Check if there's a custom SSE hook: `grep -r "EventSource\|useSSE\|useSse" frontend-v2/src/ --include="*.ts" --include="*.tsx" -l`

---

## Implementation Steps

### Step 1: Find both polling mechanisms

In `alerts/page.tsx`, locate:
1. The SSE setup (likely something like `new EventSource(...)` or a hook call)
2. The `setInterval` for polling

### Step 2: Remove the `setInterval` when SSE is active

The strategy: use SSE as the primary mechanism, fall back to polling ONLY if SSE fails.

```typescript
import { useRef, useEffect, useCallback } from 'react';

export default function AlertsPage() {
    const loadAlerts = useCallback(async () => {
        // ... existing load logic
    }, [/* dependencies */]);

    const sseActiveRef = useRef(false);
    const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Add debounce to prevent rapid-fire SSE triggers
    const debouncedLoad = useDebouncedCallback(loadAlerts, 1000);  // 1 second debounce

    useEffect(() => {
        // Initial load
        loadAlerts();

        // Start SSE
        const eventSource = new EventSource('/api/alerts/stream');
        
        eventSource.onopen = () => {
            sseActiveRef.current = true;
            // SSE is active — clear any fallback interval
            if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
                fallbackIntervalRef.current = null;
            }
        };

        eventSource.onmessage = () => {
            // SSE event received — debounced reload (not immediate)
            debouncedLoad();
        };

        eventSource.onerror = () => {
            sseActiveRef.current = false;
            // SSE failed — start fallback polling at 30s
            if (!fallbackIntervalRef.current) {
                fallbackIntervalRef.current = setInterval(loadAlerts, 30000);
            }
        };

        return () => {
            eventSource.close();
            sseActiveRef.current = false;
            if (fallbackIntervalRef.current) {
                clearInterval(fallbackIntervalRef.current);
            }
        };
    }, [loadAlerts, debouncedLoad]);
```

### Step 3: Create `useDebouncedCallback` if not already available

Check if debounce utility exists:
```bash
grep -r "useDebouncedCallback\|debounce" frontend-v2/src/hooks/ --include="*.ts"
```

If not, install or create:

```typescript
// frontend-v2/src/hooks/use-debounced-callback.ts
import { useCallback, useRef } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): T {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    return useCallback((...args: Parameters<T>) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => fn(...args), delay);
    }, [fn, delay]) as T;
}
```

### Step 4: Ensure the OLD setInterval is REMOVED

After your changes, run:
```bash
grep -n "setInterval" frontend-v2/src/app/\(app\)/alerts/page.tsx
```
The only `setInterval` that should exist is inside the `onerror` handler (the fallback). Any standalone `setInterval(loadAlerts, 30000)` outside the error handler must be removed.

### Step 5: Write tests

Create: `frontend-v2/src/app/(app)/alerts/__tests__/polling.test.tsx`

```typescript
import { render, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import AlertsPage from '../page';

// Mock EventSource
class MockEventSource {
    static instances: MockEventSource[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    
    constructor(public url: string) {
        MockEventSource.instances.push(this);
    }
    close = vi.fn();
    fireOpen() { this.onopen?.(); }
    fireMessage(data: string) { this.onmessage?.({ data }); }
    fireError() { this.onerror?.(); }
}

vi.stubGlobal('EventSource', MockEventSource);
vi.mock('@/services/alert.service');

describe('AlertsPage polling behavior', () => {
    let loadAlertsSpy: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
        MockEventSource.instances = [];
        vi.useFakeTimers();
        vi.mocked(alertService.listAlerts).mockResolvedValue({ data: [], total: 0 });
    });
    
    afterEach(() => vi.useRealTimers());

    it('does NOT start setInterval when SSE is active', async () => {
        render(<AlertsPage />);
        const sse = MockEventSource.instances[0];
        
        act(() => sse.fireOpen());
        
        // Advance time past 30s
        act(() => vi.advanceTimersByTime(60000));
        
        // loadAlerts should only have been called once (initial load)
        // NOT every 30 seconds
        const callCount = vi.mocked(alertService.listAlerts).mock.calls.length;
        expect(callCount).toBe(1);  // only initial load
    });

    it('debounces rapid SSE messages (many events = one API call)', async () => {
        render(<AlertsPage />);
        const sse = MockEventSource.instances[0];
        act(() => sse.fireOpen());
        
        // Fire 10 SSE events rapidly
        for (let i = 0; i < 10; i++) {
            act(() => sse.fireMessage('alert'));
        }
        
        // Before debounce resolves: should not have called loadAlerts more than initial
        const callsBefore = vi.mocked(alertService.listAlerts).mock.calls.length;
        
        // After 1100ms (debounce timeout):
        act(() => vi.advanceTimersByTime(1100));
        
        await waitFor(() => {
            const callsAfter = vi.mocked(alertService.listAlerts).mock.calls.length;
            // Should be callsBefore + 1 (one debounced call), not +10
            expect(callsAfter - callsBefore).toBe(1);
        });
    });

    it('starts fallback polling when SSE fails', async () => {
        render(<AlertsPage />);
        const sse = MockEventSource.instances[0];
        act(() => sse.fireError());
        
        const initialCalls = vi.mocked(alertService.listAlerts).mock.calls.length;
        
        act(() => vi.advanceTimersByTime(30000));
        
        await waitFor(() => {
            const newCalls = vi.mocked(alertService.listAlerts).mock.calls.length;
            expect(newCalls).toBeGreaterThan(initialCalls);
        });
    });
});
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

npx tsc --noEmit

npx vitest run src/app/\(app\)/alerts/__tests__/polling.test.tsx

# Verify no standalone setInterval in alerts page:
grep -n "setInterval" src/app/\(app\)/alerts/page.tsx
# Should only appear INSIDE the onerror handler, or not at all

# Manual performance test with running stack:
# Open http://localhost:3000/alerts
# Open browser DevTools → Network tab
# Filter by XHR/Fetch
# Watch for /api/utm-alerts requests over 60 seconds
# With SSE active: should see at most 1-2 requests per minute
# Previously (broken): would see 2+ requests per incoming SSE event
```

---

## Acceptance Criteria

- [ ] No standalone `setInterval` runs while SSE connection is open
- [ ] SSE events are debounced (1 second) before triggering a reload
- [ ] 10 rapid SSE events produce at most 1 API call
- [ ] If SSE fails/disconnects, fallback polling starts at 30s interval
- [ ] When SSE reconnects, fallback interval is cleared
- [ ] All 3 tests pass
- [ ] `npx tsc --noEmit` passes
