# F-01: Live Alert Streaming (SSE)

**Priority:** Tier 1 — Foundation  
**Effort:** 1.5 days  
**Impact:** 🔴 Critical — makes the SIEM feel alive; currently everything is polling

---

## What Exists Today

### Backend (COMPLETE — just not wired)
- `AlertSseResource.java` — SSE endpoint at `/api/utm-alerts/stream`
- `LiveEpsResource.java` — SSE endpoint at `/api/live-eps`
- Both push server-sent events when new alerts arrive

### Frontend (PARTIAL — component exists, not connected)
- `AlertNewBanner.tsx` — component exists at `src/components/alerts/alert-new-banner.tsx`
- Dashboard page has KPI cards but no live EPS widget
- Alert page uses manual polling every 30s via `useEffect` interval

---

## What Needs to Be Built

### 1. SSE client hook (`src/hooks/use-alert-stream.ts`)
- Connect to `/api/utm-alerts/stream`
- Parse SSE `data:` events → `UtmAlert` shape
- Expose: `newAlertCount`, `latestAlerts[]`, `isConnected`
- Auto-reconnect on disconnect (exponential backoff, max 30s)
- Honour auth: send `Authorization: Bearer <token>` header via `EventSource` polyfill

### 2. Wire `AlertNewBanner` to SSE hook in `/alerts/page.tsx`
- Show banner when `newAlertCount > 0`
- "X new alerts — click to refresh" pattern
- Dismiss on click → resets count, refreshes list

### 3. Global new-alert badge in sidebar nav
- `layout/sidebar.tsx` (or wherever nav lives)
- Red badge on "Alerts" nav item showing unread count
- Driven by same SSE hook (lift state to layout or use Zustand store)

### 4. Live EPS widget on dashboard
- New component `EpsLiveWidget.tsx` in `src/components/dashboard/`
- Connects to `/api/live-eps` SSE stream
- Shows: current EPS number + sparkline (last 60 seconds)
- Replace or augment existing Events KPI card

### 5. Connection status indicator
- Small dot in top-right nav bar (green=connected, yellow=reconnecting, red=disconnected)

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/hooks/use-alert-stream.ts` |
| CREATE | `src/hooks/use-eps-stream.ts` |
| CREATE | `src/components/dashboard/eps-live-widget.tsx` |
| CREATE | `src/components/layout/stream-status-dot.tsx` |
| MODIFY | `src/app/(app)/alerts/page.tsx` — wire banner |
| MODIFY | `src/app/(app)/dashboard/page.tsx` — add EPS widget |
| MODIFY | `src/components/layout/sidebar.tsx` (or nav component) — alert badge |

---

## Backend Changes Required
None — `AlertSseResource` and `LiveEpsResource` are complete.

Verify endpoints respond correctly:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:8088/api/utm-alerts/stream
curl -H "Authorization: Bearer <token>" http://localhost:8088/api/live-eps
```

---

## Test Criteria
1. Open `/alerts` page → trigger a test alert → banner appears without page refresh
2. Dashboard shows live EPS updating every second
3. Close laptop lid (network drop) → reconnects automatically
4. Alert badge in sidebar increments on new alert, clears on visit to alerts page

---

## 📋 SESSION PROMPT (copy-paste to start this feature)

```
I want to implement F-01: Live Alert Streaming for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- API proxy: src/app/api/[...path]/route.ts proxies to localhost:8088
- Auth token: localStorage key 'utm_token'
- Backend SSE endpoint 1: GET /api/utm-alerts/stream (new alerts push)
- Backend SSE endpoint 2: GET /api/live-eps (events-per-second stream)

What already exists:
- src/components/alerts/alert-new-banner.tsx (component, not wired)
- src/app/(app)/alerts/page.tsx (uses 30s polling, has AlertNewBanner import)
- src/app/(app)/dashboard/page.tsx (has KPI cards, no live EPS)
- src/components/layout/ (sidebar nav is somewhere here)

What to build:
1. src/hooks/use-alert-stream.ts — SSE hook with auto-reconnect, exposes newAlertCount + latestAlerts
2. src/hooks/use-eps-stream.ts — SSE hook for EPS number
3. src/components/dashboard/eps-live-widget.tsx — EPS number + 60s sparkline
4. src/components/layout/stream-status-dot.tsx — connection health indicator
5. Wire AlertNewBanner in alerts/page.tsx to the SSE hook
6. Add EPS widget to dashboard/page.tsx
7. Add alert badge to sidebar nav
8. Add stream status dot to top nav

Requirements:
- EventSource needs Authorization header — use a polyfill or fetch-based SSE
- Auto-reconnect with exponential backoff (1s, 2s, 4s... max 30s)
- Use Zustand store (already in deps: zustand ^5.0.14) for global alert count shared between sidebar and alerts page
- No new npm packages unless absolutely necessary

Read the files before editing. Build and test each piece before moving to the next.
```
