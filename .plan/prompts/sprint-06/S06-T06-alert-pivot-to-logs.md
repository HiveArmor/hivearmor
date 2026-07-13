# S06-T06 — Alert Pivot to Logs (Click Alert → See Triggering Events)

**Sprint:** 6 (Enterprise Features)
**Severity:** CRITICAL
**Issue ID:** ENT-02
**Dependencies:** None
**Estimated time:** 5 hours

---

## Context

When an analyst views an alert at `/incidents/[id]`, there is no way to see the underlying raw log events that triggered it. "Pivot to logs" is a fundamental SIEM capability: analyst clicks an alert, clicks "View in Logs", and lands on the log search page pre-filtered to the same time window and host/source as the alert. This is a Tier 1 enterprise sales blocker.

**Current state:**
- `frontend-v2/src/app/(app)/incidents/[id]/page.tsx` — alert detail page with Evidence Board, Attack Timeline, Entity Graph tabs. No "View in Logs" button exists.
- `frontend-v2/src/app/(app)/logs/page.tsx` — the log search page. Does NOT read URL query parameters on mount.
- `frontend-v2/src/components/logs/log-detail-drawer.tsx` — has an intra-logs `PivotAction` type (lines 15-16) for `"search-related"` within the logs page, but there is no cross-page pivot from incidents to logs.

**What needs to be built:**
1. A "View in Logs" button on the incident/alert detail page that navigates to `/logs` with URL params encoding the time window and filters
2. A URL param reader in the logs page that pre-fills the search bar and time filter from those params

---

## What to Read First

Before writing any code, read these files completely:

1. `frontend-v2/src/app/(app)/incidents/[id]/page.tsx` — understand the alert data shape (fields: `id`, `utmAlertName`, `utmAlertTimestamp`, `utmAlertSeverity`, host/source fields)
2. `frontend-v2/src/app/(app)/logs/page.tsx` — understand how the logs page initializes its query state (look for `useLogTabs` or similar hooks)
3. `frontend-v2/src/components/logs/log-detail-drawer.tsx` — the `PivotAction` type at lines 15-16 shows the pattern to follow for intra-page pivots
4. `frontend-v2/src/services/incidents.service.ts` (or equivalent) — the alert/incident data model, specifically what fields are available (timestamp, source IP, hostname, alert name)
5. Look for a `useLogStore` or `useLogTabs` hook that manages log query state — understand how to set an initial query string programmatically

---

## Implementation Steps

### Step 1: Define the pivot URL scheme

The logs page will accept these URL query parameters:

| Param | Purpose | Example |
|---|---|---|
| `q` | KQL filter pre-filled in search bar | `host.name:"web-01"` |
| `from` | Start of time window (ISO 8601) | `2026-07-08T10:00:00Z` |
| `to` | End of time window (ISO 8601) | `2026-07-08T10:15:00Z` |
| `index` | Index pattern to search | `logs-*` |
| `pivotFrom` | Source page label for breadcrumb | `alert:12345` |

### Step 2: Add URL param reading to the logs page

In `frontend-v2/src/app/(app)/logs/page.tsx`, add a `useEffect` that reads params on mount and initializes the query state:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
// ... existing imports ...

export default function LogsPage() {
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  // Read pivot params on first mount only
  useEffect(() => {
    if (initialized.current) return;
    const q = searchParams.get('q');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const index = searchParams.get('index');

    if (q || from || to || index) {
      initialized.current = true;
      // Set these into your existing log query state
      // The exact setter depends on whether you use a zustand store, React state, or a hook.
      // Example (adjust to match the actual state management pattern):
      if (q) setQuery(q);
      if (from && to) setTimeRange({ from, to });
      if (index) setIndexPattern(index);
    }
  }, [searchParams]);

  // ... rest of existing page code ...
}
```

> IMPORTANT: Read the existing `logs/page.tsx` to find the actual state setters (`setQuery`, `setTimeRange`, `setIndexPattern`) — they may be from a Zustand store, a URL-sync hook, or local state. Use whatever pattern is already in the file. Do not introduce a new state management approach.

### Step 3: Create the pivot URL builder utility

Create `frontend-v2/src/lib/alert-pivot.ts`:

```typescript
export interface AlertPivotParams {
  alertId: string | number;
  alertName: string;
  timestamp: string;       // ISO 8601 — the alert's trigger time
  windowMinutes?: number;  // default 15 minutes either side
  hostname?: string;
  sourceIp?: string;
  indexPattern?: string;
}

/**
 * Build the /logs URL with pre-filled filters for a given alert.
 * The time window is ±windowMinutes around the alert timestamp.
 */
export function buildAlertPivotUrl(params: AlertPivotParams): string {
  const {
    alertId,
    alertName,
    timestamp,
    windowMinutes = 15,
    hostname,
    sourceIp,
    indexPattern = 'logs-*',
  } = params;

  const ts = new Date(timestamp);
  const from = new Date(ts.getTime() - windowMinutes * 60_000).toISOString();
  const to = new Date(ts.getTime() + windowMinutes * 60_000).toISOString();

  // Build KQL filter — use the most specific available field
  const filters: string[] = [];
  if (hostname) filters.push(`host.name:"${hostname}"`);
  else if (sourceIp) filters.push(`source.ip:"${sourceIp}"`);

  const q = filters.join(' AND ');

  const p = new URLSearchParams({
    from,
    to,
    index: indexPattern,
    pivotFrom: `alert:${alertId}`,
  });
  if (q) p.set('q', q);

  return `/logs?${p.toString()}`;
}
```

Unit test for the utility — create `frontend-v2/src/lib/__tests__/alert-pivot.test.ts`:

```typescript
import { buildAlertPivotUrl } from '../alert-pivot';

describe('buildAlertPivotUrl', () => {
  const base = {
    alertId: '42',
    alertName: 'Brute Force',
    timestamp: '2026-07-08T12:00:00Z',
  };

  it('builds a URL with ±15 min time window by default', () => {
    const url = buildAlertPivotUrl(base);
    expect(url).toContain('from=2026-07-08T11%3A45%3A00.000Z');
    expect(url).toContain('to=2026-07-08T12%3A15%3A00.000Z');
  });

  it('includes hostname in KQL when provided', () => {
    const url = buildAlertPivotUrl({ ...base, hostname: 'web-01' });
    expect(url).toContain('q=host.name%3A%22web-01%22');
  });

  it('falls back to sourceIp when hostname is absent', () => {
    const url = buildAlertPivotUrl({ ...base, sourceIp: '192.168.1.1' });
    expect(url).toContain('q=source.ip%3A%22192.168.1.1%22');
  });

  it('omits q param when no host or ip available', () => {
    const url = buildAlertPivotUrl(base);
    expect(url).not.toContain('q=');
  });

  it('includes pivotFrom for breadcrumb', () => {
    const url = buildAlertPivotUrl(base);
    expect(url).toContain('pivotFrom=alert%3A42');
  });

  it('respects custom windowMinutes', () => {
    const url = buildAlertPivotUrl({ ...base, windowMinutes: 60 });
    expect(url).toContain('from=2026-07-08T11%3A00%3A00.000Z');
    expect(url).toContain('to=2026-07-08T13%3A00%3A00.000Z');
  });
});
```

### Step 4: Add the "View in Logs" button to the alert detail page

In `frontend-v2/src/app/(app)/incidents/[id]/page.tsx`, add the button near the top of the alert detail view. Find where the alert header renders (severity badge, alert name, timestamp) and add:

```tsx
import { useRouter } from 'next/navigation';
import { buildAlertPivotUrl } from '@/lib/alert-pivot';
import { ExternalLink } from 'lucide-react';

// Inside the component, after the alert data is loaded:
const router = useRouter();

function handlePivotToLogs() {
  if (!alert) return;
  const url = buildAlertPivotUrl({
    alertId: alert.id,
    alertName: alert.utmAlertName,
    timestamp: alert.utmAlertTimestamp,
    hostname: alert.utmAlertAffectedHostname ?? alert.utmAlertSourceHostname,
    sourceIp: alert.utmAlertSourceIp,
  });
  router.push(url);
}

// In the JSX, next to the existing action buttons:
<Button variant="outline" size="sm" onClick={handlePivotToLogs}>
  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
  View in Logs
</Button>
```

> Note: Inspect the actual alert model fields (read `incidents.service.ts` and the `[id]/page.tsx` data shape) and use the correct field names for timestamp, hostname, and source IP. The names above are guesses — match them exactly.

### Step 5: Add breadcrumb on the logs page when pivoting from an alert

In `frontend-v2/src/app/(app)/logs/page.tsx`, when `pivotFrom` param is present, show a small banner:

```tsx
const pivotFrom = searchParams.get('pivotFrom');

// In the JSX, above the search bar:
{pivotFrom?.startsWith('alert:') && (
  <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b text-sm">
    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    <span>
      Showing logs related to{' '}
      <button
        onClick={() => router.push(`/incidents/${pivotFrom.replace('alert:', '')}`)}
        className="underline"
      >
        Alert #{pivotFrom.replace('alert:', '')}
      </button>
    </span>
    <button
      className="ml-auto text-muted-foreground hover:text-foreground"
      onClick={() => router.push('/logs')}
    >
      Clear
    </button>
  </div>
)}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/frontend-v2

# Run utility unit tests
npx jest src/lib/__tests__/alert-pivot --no-coverage

# Type check
npx tsc --noEmit

# Manual E2E steps (requires running app):
# 1. Open http://localhost:3000/incidents
# 2. Click on any alert with a known host
# 3. Verify "View in Logs" button appears in the alert header
# 4. Click it — browser should navigate to /logs with ?from=, ?to=, ?q= params
# 5. Verify the logs page shows the pre-filled query in the search bar
# 6. Verify the time range picker reflects the ±15 min window
# 7. Verify the "Showing logs related to Alert #X" banner appears
# 8. Clicking "Clear" navigates back to /logs with no params
```

---

## Acceptance Criteria

- [ ] `buildAlertPivotUrl` utility generates correct ISO 8601 timestamps ±15 minutes around the alert time
- [ ] "View in Logs" button appears in the alert detail page header (not buried in a menu)
- [ ] Clicking "View in Logs" navigates to `/logs?from=...&to=...&q=...&index=...`
- [ ] The logs page reads `q`, `from`, `to`, `index` params on first mount and pre-fills the search bar and time range
- [ ] When hostname is available, KQL filter uses `host.name:"..."` 
- [ ] When no hostname, KQL filter uses `source.ip:"..."` as fallback
- [ ] When neither hostname nor IP is available, no `q` param is set (time window is still applied)
- [ ] A breadcrumb banner shows on the logs page when `pivotFrom` param is present, with a link back to the source alert
- [ ] Clicking "Clear" on the breadcrumb navigates to `/logs` with no params
- [ ] Utility unit tests pass (6 test cases)
- [ ] `npx tsc --noEmit` passes with zero errors
