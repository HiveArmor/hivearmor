# 10 — Mission Control Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** CommandCenterPage.tsx (all 307 lines), .plan/frontend-v3-spec/visual-approval/MC-REDESIGN-INSPECTION-REPORT.md (referenced), complete-route-catalogue.md CMD-01

---

## 1. Implementation Summary

**Route:** `/command`  
**Component:** `CommandCenterPage.tsx` (307 lines)  
**Page title:** "Mission Control" (line 92)

### What Is Actually Implemented

The current CommandCenterPage contains:

| Widget/Section | Component | Data Source | Status |
|---|---|---|---|
| KPI tile: Active Alerts | KpiTile | getAlertSummary() → /api/overview/count-alerts-today-and-last-week (partial) | PARTIALLY_IMPLEMENTED |
| KPI tile: Critical count | KpiTile | summary.critical from same query | PARTIALLY_IMPLEMENTED |
| KPI tile: High count | KpiTile | summary.high | PARTIALLY_IMPLEMENTED |
| KPI tile: Medium count | KpiTile | summary.medium | PARTIALLY_IMPLEMENTED |
| KPI tile: Live EPS | KpiTile | useEpsStream() SSE → /api/eps/stream | PARTIALLY_IMPLEMENTED |
| EPS chart | EpsChart | data=[] HARDCODED EMPTY | BROKEN |
| Live Alert Stream | LiveAlertStream | useAlertStream() SSE → /api/alerts/stream | PARTIALLY_IMPLEMENTED |
| Recent Incidents table | RecentIncidentsTable | getIncidents({status:'open', size:5}) | PARTIALLY_IMPLEMENTED |
| Status dock (inline) | Inline at bottom | SSE connection status + EPS number | PARTIALLY_IMPLEMENTED |

### Missing vs Mission Control Specification

The Mission Control spec (CMD-01) requires 9 specialized widgets beyond the current simple KPI + chart layout:

| Spec Widget | Status | Spec Description | Backend Readiness |
|---|---|---|---|
| Operational Globe / Pulse | MISSING | Geographic threat map showing active threat locations | GET /api/overview/geo-threats exists (UNPROTECTED) |
| Defensive Posture widget | MISSING | Score gauge for current security posture | GET /api/ha-posture/score exists |
| Priority Work Queue widget | MISSING | Top N prioritized alerts requiring action | GET /api/ha-queue VERIFIED PROTECTED |
| Sensor Coverage widget | MISSING | % agents reporting vs total agents | GET /api/agent-manager/agents exists |
| Analyst Capacity widget | MISSING | Active analysts / total; queue depth per analyst | No endpoint exists |
| Threat Conditions widget | MISSING | Current threat level (ELEVATED/SEVERE) display | No endpoint exists |
| Response Readiness widget | MISSING | SOAR playbook readiness score | No endpoint exists |
| Detection Health widget | MISSING | Rule count active/total; last rule fired time | No endpoint exists |
| Data Health widget | MISSING | Events/sec trend; parser health; index lag | No endpoint exists |

**9 spec widgets: 0 implemented, 3 have backend support, 6 require full-stack development.**

---

## 2. Per-Widget Detailed Assessment

### 2.1 Operational Globe / Pulse
**Status: MISSING**

- Spec: Interactive world map or pulse visualization showing real-time threat origins by geographic location
- Backend: `GET /api/overview/geo-threats` exists and returns geo-tagged alert data
- Frontend: No globe component exists anywhere in the codebase
- Rule from spec: No animated world maps (anti-pattern); an accessible alternative is required
- **Required approach:** ECharts `MapChart` with country-level threat heatmap + accessible table fallback
- **Note:** The spec explicitly forbids animated world map (spec anti-patterns), but a static choropleth is acceptable

### 2.2 Defensive Posture Widget
**Status: MISSING**

- Spec: Shows an overall posture score (0-100) with trend indicator
- Backend: `GET /api/ha-posture/score` available
- Frontend: `HaPostureResource` confirmed; no widget consuming it in CommandCenterPage
- **Required:** Gauge chart (ECharts) or radial progress display

### 2.3 Priority Work Queue Widget
**Status: MISSING**

- Spec: Shows top 5-10 most urgent alerts requiring analyst action, ordered by priority score
- Backend: `GET /api/ha-queue` VERIFIED PROTECTED (ANALYST, SOC_MANAGER, ADMIN)
- Frontend: AnalystQueuePage exists at /queue but no compact queue widget in CommandCenterPage
- **Required:** Inline mini-queue table in CommandCenterPage; link to /queue for full view

### 2.4 Sensor Coverage Widget
**Status: MISSING**

- Spec: Percentage of expected sensors reporting; highlight sensors that have gone silent
- Backend: `GET /api/agent-manager/agents` available (agent-manager gRPC service)
- Frontend: SensorGridPage at /posture/sensors exists but no mini-widget for Command Center
- **Required:** Mini sensor status indicator tile

### 2.5 Analyst Capacity Widget
**Status: FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Shows number of analysts currently active, queue backlog per analyst
- Backend: No endpoint for analyst presence/capacity exists
- Frontend: Not possible until backend is built
- **Required backend:** New endpoint aggregating active users by role + queue assignment

### 2.6 Threat Conditions Widget
**Status: FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Current threat level (NORMAL/ELEVATED/SEVERE/CRITICAL) based on correlation engine output
- Backend: No threat-conditions endpoint exists
- Frontend: Not possible until backend is built
- **Note:** This is equivalent to a CISA NTAS advisory display, derived from alert severity distribution

### 2.7 Response Readiness Widget
**Status: FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: SOAR playbook coverage score; number of playbooks active vs total
- Backend: No readiness score endpoint; GET /api/soar/playbooks exists (UNPROTECTED)
- Frontend: Could be partially derived from playbook count, but no readiness score exists
- **Required:** Backend aggregation endpoint

### 2.8 Detection Health Widget
**Status: FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Number of active detection rules; last rule fired timestamp; false-positive rate trend
- Backend: No health summary endpoint; GET /api/correlation-rule exists (UNPROTECTED)
- Frontend: Could count rules, but FP rate and last-fired require new backend instrumentation

### 2.9 Data Health Widget
**Status: FULL_STACK_DEVELOPMENT_REQUIRED**

- Spec: Current EPS vs expected; parser error rate; OpenSearch index lag
- Backend: EPS stream exists; no parser health or index lag endpoints
- Frontend: EPS KPI tile exists; parser health not implemented

---

## 3. Existing Implementation Quality

### 3.1 KPI Tiles
- `KpiTile` component renders title, value, optional color indicator
- `summary` data from `getAlertSummary()` → calls `/api/overview/count-alerts-today-and-last-week` (unverified)
- Loading states: ✓ (`summaryLoading` prop)
- Error states: ✓ (error banner at line 170-203)
- **Issue:** The spec commandCenter.service.ts `getAlertSummary()` calls an overview endpoint not confirmed in the API map — needs verification that the endpoint returns `{total, critical, high, medium}` shape

### 3.2 EPS Chart (Broken)
- `CommandCenterPage.tsx:251-254`: `data={[]}` — hardcoded empty array
- EpsChart component exists but receives no historical data
- Live EPS KPI tile works (via SSE); the chart showing EPS history does not

### 3.3 Live Alert Stream
- `useAlertStream()` hook opens SSE to `/api/alerts/stream`
- `LiveAlertStream` component renders a scrolling feed of incoming alerts
- **Status: PARTIALLY_IMPLEMENTED** — SSE works; display is basic; no click-to-triage, no severity coloring in stream

### 3.4 Recent Incidents Table
- `getIncidents({status:'open', size:5})` makes real API call
- `RecentIncidentsTable` renders tabular list
- **Status: PARTIALLY_IMPLEMENTED** — table loads; no deep-link to incident detail confirmed; `incidents.service.skip.ts` means the underlying service is stubbed

### 3.5 Status Dock (Inline)
- `CommandCenterPage.tsx:269-304`: Inline 28px bottom bar
- Shows SSE connection status dot + EPS number
- **Issue:** `StatusDock.tsx` exists as a shared component (`@/components/status-dock/StatusDock.tsx`) and should be reused here instead of duplicating the implementation
- Both exist simultaneously — minor inconsistency

---

## 4. Missing Spec Requirements

### 4.1 Focus Mode
- Spec: A full-screen, nav-hidden mode for NOC/SOC big-screen display
- Status: **MISSING** — no focus mode toggle anywhere in CommandCenterPage
- Implementation: Toggle sidebar collapse + masthead collapse; use `document.documentElement.requestFullscreen()`

### 4.2 No Weapon/Target Language
- Status: **COMPLIANT** — CommandCenterPage uses neutral, professional terms only
- "Mission Control", "Active Alerts", "Live EPS" — all compliant
- No "kill", "target", "weapon", "attack surface" etc. in rendered text

### 4.3 Animation Pause / Reduced Motion
- Status: **PARTIALLY_IMPLEMENTED**
- `global.css` has `@media (prefers-reduced-motion: reduce)` — stops CSS animations
- The EPS SSE indicator dot (`ha-pulse` keyframe animation) is in `tokens.css:78-83` and IS subject to this media query via global.css
- EpsChart animations: ECharts has `animation` setting; not configured to respect prefers-reduced-motion
- **Required:** Pass `animation: false` to all ECharts options when `matchMedia('(prefers-reduced-motion: reduce)').matches`

### 4.4 Accessible Alternative for Globe Animation
- Status: **N/A** (globe not implemented)
- When globe IS implemented: must include a `<table>` or `<ul>` region with equivalent threat origin data, accessible to screen readers

### 4.5 All Widgets Backed by Real API Data
- Status: **PARTIALLY_IMPLEMENTED** for KPIs and incident table; **BROKEN** for EPS chart; **MISSING** for 9 spec widgets

### 4.6 Performance: 60fps, No Memory Leak
- Status: **NEEDS_VERIFICATION**
- SSE connections: `useAlertStream` and `useEpsStream` must close connections on unmount (cleanup in useEffect return)
- No profiling data available
- React Query `refetchInterval: 30_000` for polling — appropriate

---

## 5. Compliance Score

| Category | Spec Requirements | Met | Gap |
|---|---|---|---|
| Required widgets | 9 specialized + KPIs | KPIs only (partial) | 9 widgets missing |
| Language compliance | No weapon terms | COMPLIANT | — |
| Focus mode | YES | MISSING | — |
| Reduced motion | YES | PARTIALLY | ECharts not covered |
| Real API data | All widgets | KPIs + incidents (partial) | EPS chart broken; 9 widgets missing |
| Accessible globe alternative | YES (when built) | N/A | — |

**Mission Control Compliance: ~15% of spec requirements met**

**Classification: PARTIALLY_IMPLEMENTED** — The page is a minimal viable skeleton, not the full Mission Control dashboard the spec describes.

---

## 6. Recommended Implementation Order

1. **Fix EpsChart data source** — wire `/api/overview/events-in-time` to EpsChart (P1, 0.5 sessions)
2. **Implement Defensive Posture widget** — backend exists (P1, 1 session)
3. **Implement Priority Work Queue widget** — backend exists (P1, 1 session)
4. **Implement Sensor Coverage widget** — backend exists (P2, 1 session)
5. **Implement Geo Threats widget** — backend exists; use ECharts MapChart (P2, 1.5 sessions)
6. **Implement Focus Mode** — frontend-only (P2, 0.5 sessions)
7. **Fix ECharts reduced-motion** — small change (P2, 0.5 sessions)
8. **Implement 5 full-stack widgets** — requires new backend endpoints (P3, 3+ sessions)
9. **Replace inline status dock with StatusDock component** — cleanup (P3, 0.5 sessions)
