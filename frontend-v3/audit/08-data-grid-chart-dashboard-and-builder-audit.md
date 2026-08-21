# 08 — Data Grid, Chart, Dashboard, and Builder Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** SiemDataGrid.tsx, HaChart.tsx, DashboardViewPage.tsx, DashboardStudioPage.skip.ts, MetricsBuilderPage.tsx, PlaybookBuilderPage.tsx, LiveFeedRenderer.tsx, package.json

---

## 1. SiemDataGrid — ServerSide Row Model Workaround

### 1.1 The Problem

The specification calls for server-side pagination using AG Grid's `ServerSideRowModel` (SSRM), which:
- Loads pages from the backend on demand
- Supports sorting/filtering server-side without loading all data
- Required for high-volume grids (alerts: 100k+ rows/day)

**AG Grid Community 36 does NOT include SSRM.** SSRM is an Enterprise feature.

### 1.2 The Workaround

`SiemDataGrid.tsx` bridges `IServerSideDatasource` → `IDatasource (InfiniteRowModel)`:
- Accepts an `IServerSideDatasource` interface (Enterprise API) at the component boundary
- Internally wraps it in an `IDatasource` implementation (Community API)
- Uses `InfiniteRowModel` (Community) instead of `ServerSideRowModel` (Enterprise)

### 1.3 Limitations vs Spec Requirements

| Feature | Spec Requirement | SSRM (Enterprise) | InfiniteRowModel (Community) | Gap |
|---|---|---|---|---|
| Server-side sort | YES | YES | YES (via IDatasource) | NONE — works |
| Server-side filter | YES | YES | YES (partial) | MINOR — filter parameters must be manually forwarded |
| Total row count | YES | YES | YES (via `rowCount` in IDatasource) | MINOR — count must be set from X-Total-Count header |
| Column grouping | YES | YES | NO — InfiniteRowModel doesn't support row groups | GAP |
| Pivot mode | NICE-TO-HAVE | YES | NO | ACCEPTABLE |
| Grouped aggregations | YES | YES | NO | GAP |
| Row detail master/detail | YES | YES | Limited | GAP |

### 1.4 Practical Impact

For the primary use case (flat list of alerts/incidents with server-side paging), the workaround is **functionally adequate**. Grouped views (e.g., "group by severity") and master-detail views (incident with expandable sub-row showing alerts) are not possible without Enterprise.

**Severity: P1** — Works for primary use cases; grouped/hierarchical views require Enterprise upgrade.

### 1.5 AG Grid Enterprise Features Check

Scan for accidentally used Enterprise APIs (would cause console errors in Community build):

| Enterprise API | Found in codebase? | Risk |
|---|---|---|
| `ServerSideRowModel` | NOT directly used (bridged away) | Mitigated |
| `RowGroupingModule` | NOT found | Safe |
| `SetFilterModule` | NOT found | Safe |
| `ColumnMenuModule` | NOT found | Safe |
| `ExcelExportModule` | NOT found | Safe |

**Result: No Enterprise APIs used directly.** The bridge is the only boundary point.

---

## 2. HaChart — ECharts Wrapper

### 2.1 Component Status

`frontend-v3/src/components/ha-chart/HaChart.tsx`

- Wraps Apache ECharts 6.1.0
- Accepts `option: EChartsOption` prop
- Supports `style` prop for dimensions
- Tests: `HaChart.test.tsx` ✓

### 2.2 Missing Features

| Feature | Spec Requirement | Status |
|---|---|---|
| Loading state | YES — show skeleton/spinner while data loads | PARTIALLY_IMPLEMENTED — `loading` prop exists; implementation not fully verified |
| Empty state | YES — "No data available" message | MISSING — no empty state handling |
| Error state | YES — error message with retry | MISSING — no error state |
| Accessible description | YES — WCAG 2.1.4 | MISSING — no aria-label, no role=img, no title |
| Reduced motion | YES — disable animations | MISSING — no `animation: false` on prefers-reduced-motion |
| Resize observer | YES — resize on container change | NEEDS_VERIFICATION — ECharts has built-in resize; hook unclear |

### 2.3 Usage in CommandCenterPage

`CommandCenterPage.tsx:251-254`:
```tsx
<EpsChart
  loading={summaryLoading}
  data={[]}    // HARDCODED EMPTY ARRAY
/>
```

The `data=[]` is hardcoded — no endpoint feeds real EPS history data to EpsChart. This chart is permanently empty.

**Root cause:** `/api/overview/events-in-time` exists but is not wired to EpsChart. EpsChart only shows live EPS from SSE, not historical data.

---

## 3. DashboardCanvas (GridStack 13)

### 3.1 GridStack Initialization

`DashboardViewPage.tsx:106-131`:
```typescript
const grid = GridStack.init({
  column: 12,
  cellHeight: 80,
  animate: true,
  draggable: { handle: '.widget-drag-handle' },
  resizable: { handles: 'se' },
  staticGrid: true, // starts locked
}, gridElRef.current);
```

- 12-column grid at 80px cell height
- Starts in static (non-draggable) mode
- Edit mode toggle works (DashboardViewPage.tsx:134-137)
- Drag handle class: `widget-drag-handle`

### 3.2 Layout Persistence

`DashboardViewPage.tsx:139-169`:
- Save layout reads GridStack node positions
- Makes direct `fetch()` call (bypasses `apiClient.ts`) — inconsistent with rest of codebase
- Saves to `/api/ha-dashboards/{id}` PUT with updated visualization positions

**Issues:**
1. Direct `fetch()` at line 160 bypasses the centralized `apiClient.ts` (no consistent 401 handling)
2. No optimistic update — grid layout reverts if save fails
3. No draft/publish workflow — saves immediately to production

### 3.3 Layout Ownership and Tenant Isolation

- No `tenantId` on `UtmDashboard` (confirmed from backend audit)
- No ownership check — any authenticated user can save any dashboard's layout
- GAP-SEC-12 confirmed: GET/POST/PUT on `/api/ha-dashboards` are UNPROTECTED

### 3.4 Random/Mock Data in DashboardViewPage

`DashboardViewPage.tsx:80`:
```typescript
id: `filter-${Date.now()}-${Math.random()}`,
```

This is `Math.random()` for generating unique filter IDs — **this is NOT mock data**, it is correct use for stable key generation. However it is a non-deterministic ID which can cause test flakiness.

**Assessment:** Not a mock data issue; acceptable use.

---

## 4. DashboardStudioPage — MISSING

**File:** `frontend-v3/src/pages/dashboards/DashboardStudioPage.skip.ts` and `DashboardStudioRenderers.skip.ts`

Both files are `.skip.ts` — excluded from TypeScript compilation.

The router has:
```typescript
path: 'dashboards/studio',
element: <AuthGuard><DashboardStudioPage /></AuthGuard>
```

But `DashboardStudioPage` is imported from a `.skip.ts` file, which means the imported module is a stub (or empty).

**Impact:** `/dashboards/studio` and `/dashboards/:id/edit` routes are **not functional**. Users cannot create new dashboards or fully edit existing ones.

**Spec requirement:** DSH-03 Dashboard Studio is a core feature for ANALYST and SOC_MANAGER roles.

**Required Action:** Implement `DashboardStudioPage.tsx` as a full GridStack canvas with widget configuration panel.

---

## 5. MetricsBuilderPage — Current State

`frontend-v3/src/pages/dashboards/MetricsBuilderPage.tsx` — active, not a .skip.ts

**Status:** PARTIALLY_IMPLEMENTED — page exists but all visualization queries are blocked by `GAP_SEC_06_RESOLVED = false`

The page allows building visualization queries but cannot execute them (preview is blocked) until GAP-SEC-06 is resolved.

**Query Safety:** The MetricsBuilder allows users to define OpenSearch queries. There is no sandboxing or query-length limit visible in the frontend. Until GAP-SEC-06 is resolved at the backend level, the frontend gate (`GAP_SEC_06_RESOLVED = false`) is the only protection.

**Risk:** When GAP-SEC-06 is resolved, the backend must enforce query resource limits (max time, max result size) to prevent abuse via crafted large queries.

---

## 6. Mock/Random Data Found

From grep results:

### 6.1 PlaybookBuilderPage.tsx — INITIAL_NODES
`PlaybookBuilderPage.tsx:47-54`:
```typescript
const INITIAL_NODES: Node<PlaybookNodeData>[] = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 300, y: 50 },
    data: { label: 'Alert Received', nodeType: 'trigger' },
  },
];
```

This is a **default empty state** for a new playbook (one trigger node). Not mock data — correct behavior.

**Comment in file:** `// BACKEND_REQUIRED: /api/soar/playbooks endpoint is not yet implemented in the backend.`

This is incorrect — the backend endpoint DOES exist at `/api/soar/playbooks` (confirmed by backend scan). The endpoint is just UNPROTECTED (SEC-GAP-08). The frontend can be wired once the security gap is resolved.

### 6.2 LiveFeedRenderer.tsx — Math.random()
`frontend-v3/src/pages/dashboards/studio/renderers/LiveFeedRenderer.tsx`

Contains `Math.random()` — needs investigation. This may be generating demo/mock alert data for the studio preview widget.

**Assessment:** If this is seeding mock data into a visible widget, it is a MOCK_ONLY issue. Studio renderers are in a `.skip.ts` file so this is currently not visible to users.

### 6.3 toastStore.ts — Math.random()
`toastStore.ts` uses `Math.random()` for toast ID generation. This is correct (unique ID for toasts).

---

## 7. Summary

| Component | Status | P0/P1/P2 | Key Issue |
|---|---|---|---|
| SiemDataGrid (InfiniteRowModel workaround) | COMPLIANT_WITH_MINOR_GAPS | P1 | No grouped views; Enterprise needed for full spec |
| HaChart (ECharts wrapper) | PARTIALLY_IMPLEMENTED | P1 | Missing empty/error states; no a11y labels |
| DashboardViewPage (GridStack) | PARTIALLY_IMPLEMENTED | P1 | GAP_SEC_06 blocks all widgets; direct fetch() bypass |
| DashboardStudioPage | MISSING | P1 | Entire page in .skip.ts |
| MetricsBuilderPage | PARTIALLY_IMPLEMENTED | P1 | GAP_SEC_06 blocks all queries |
| PlaybookBuilderPage | COMPLIANT_WITH_MINOR_GAPS | P2 | Save/load partial; INITIAL_NODES comment wrong |
| Mock data in pages | NONE FOUND | — | Math.random() usages are for ID generation or studio-only preview |
