# 12 — Accessibility, Responsive Design, and Performance Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** global.css, tokens.css, AuthGuard.tsx, HaButton.tsx, HaChart.tsx, SiemDataGrid.tsx, StatusDock.tsx, HaInlineBanner.tsx, grep results for aria-label, prefers-reduced-motion, lazy imports

---

## 1. WCAG 2.2 AA Requirements

### 1.1 Landmark Regions
**Status: PARTIALLY_IMPLEMENTED**

- AppLayout renders the main shell but landmark `<main>`, `<nav>`, `<header>` elements not confirmed in HaNavigation or HaMasthead
- React Router routes render into an unnamed container — likely `<div>` not `<main>`
- **Required:** Wrap page content in `<main id="main-content">` for skip navigation to work

### 1.2 Heading Hierarchy
**Status: PARTIALLY_IMPLEMENTED**

- `CommandCenterPage.tsx:88`: `<h1>` for page title — correct
- `HiveIntelligencePage.tsx:216`: `<h2>` for panel title — correct
- Many components use `<div>` with font-size styling instead of semantic heading elements
- No `<h2>` audit across all pages possible without full page reads
- **Risk:** Multiple `<h1>` elements on one page or skipped heading levels

### 1.3 Skip Navigation Link
**Status: MISSING**

- No skip-to-content link found in AppLayout.tsx, HaMasthead.tsx, or router components
- WCAG 2.4.1 (Bypass Blocks) — Level A failure
- **Required:** `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>` as first element in AppLayout

### 1.4 Keyboard Support
**Status: PARTIALLY_IMPLEMENTED**

- Native `<button>` and `<input>` elements are keyboard accessible by default
- Custom interactive `<div>` elements (e.g., HiveIntelligencePage.tsx:243 `<div onClick>` for feed items) are NOT keyboard accessible
- PlaybookBuilderPage.tsx uses ReactFlow which has built-in keyboard support for nodes
- **Risk:** Click handlers on non-interactive elements throughout — WCAG 2.1.1 failure

### 1.5 Focus Management in Drawers/Modals
**Status: NEEDS_VERIFICATION**

- `HaDrawer.tsx` and `HaModal.tsx` exist as PatternFly wrappers
- PatternFly 6 drawers and modals include focus trap by default (FocusTrap from @patternfly/react-core)
- **Action:** Verify HaDrawer.tsx passes `isExpanded` to PatternFly Drawer with correct focus trap props
- `HaConfirmationModal.tsx`: test exists; focus trap not explicitly verified in code

### 1.6 Chart Accessible Descriptions
**Status: MISSING**

- `HaChart.tsx` (full component): no `aria-label`, no `role="img"`, no `<title>` inside SVG
- ECharts renders SVG — adding `aria-label` to the container div is the minimum requirement
- WCAG 1.1.1 (Non-text Content) failure
- **Required:**
  ```tsx
  <div
    role="img"
    aria-label={props.ariaLabel ?? 'Chart visualization'}
    aria-describedby={props.ariaDescribedBy}
  >
    {/* ECharts canvas */}
  </div>
  ```

### 1.7 Live-Region Announcements for SSE Updates
**Status: MISSING**

- `LiveAlertStream` component in CommandCenterPage renders incoming alerts
- No `aria-live="polite"` or `aria-live="assertive"` region found
- Screen reader users receive no notification of new alerts
- **Required:** `<div aria-live="polite" aria-atomic="false">` wrapper for alert stream announcements

### 1.8 Colour-Independent Status Indication
**Status: PARTIALLY_IMPLEMENTED**

- `SeverityLabel.tsx` uses both colour AND text label ("Critical", "High", etc.) — COMPLIANT
- `SlaIndicator.tsx` uses colour for status — needs text label audit
- Status dots (e.g., CommandCenterPage.tsx:284 SSE indicator) use colour only — WCAG 1.4.1 failure
- **Required:** Add text label or `aria-label` to all colour-only status indicators

### 1.9 Reduced Motion
**Status: PARTIALLY_IMPLEMENTED**

- `global.css` has ONE prefers-reduced-motion rule:
  ```css
  @media (prefers-reduced-motion: reduce) { ... }
  ```
- `tokens.css:78-83` defines `@keyframes ha-pulse` — subject to the global CSS rule
- ECharts animations: NOT covered — ECharts renders canvas/SVG with JS animations unaffected by CSS media queries
- AuthGuard spinner (`border: 2px solid var(--ha-primary); animation: ha-spin`) — covered by global.css
- **Required:** In `HaChart.tsx`, pass `animation: false` when `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
- **Required:** All `animation: ... infinite` inline styles should check reduced-motion

### 1.10 Aria-Label Coverage (from grep results)

| Component | aria-label count | Status |
|---|---|---|
| HaButton.tsx | 0 (allows passthrough via ...props) | NEEDS_VERIFICATION |
| HaChart.tsx | 0 (confirmed MISSING) | MISSING |
| SiemDataGrid.tsx | 0 (AG Grid provides built-in labels) | NEEDS_VERIFICATION |
| StatusDock.tsx | 0 | MISSING |
| HaInlineBanner.tsx | 2 (close button + icon) | COMPLIANT |

**Key finding:** `HaChart.tsx` has 0 aria attributes — critical for WCAG 1.1.1. All charts are invisible to screen readers.

---

## 2. Responsive Behaviour

### 2.1 Spec Breakpoints

The spec requires support for:
- 1920×1080 (primary)
- 1440×900
- 1280×800
- 1024×768 (minimum)

### 2.2 Current Implementation

The codebase uses **inline styles with fixed pixel dimensions** extensively:

Examples from CommandCenterPage.tsx:
```tsx
width: '60%'    // EPS chart column
width: '40%'    // Live alert stream column
height: '100vh'  // Page container
padding: '20px 24px'  // Fixed padding
```

`HaMasthead.tsx` and `HaNavigation.tsx` — widths not verified but likely fixed.

**Observation:** The layout is designed for wide screens. At 1024×768, the 60/40 split with 24px padding may render uncomfortably but should not break. At mobile widths (<768px), the layout would be unusable.

### 2.3 Responsive Evidence

- No CSS `@media` queries found in component `.tsx` files (inline styles cannot use media queries)
- No `breakpoint` constants found
- Sidebar: likely fixed width (no collapse confirmed without full read of HaNavigation.tsx)
- Only one `prefers-reduced-motion` media query found in global.css

### 2.4 Assessment

**Status: PARTIALLY_IMPLEMENTED for 1280×800+; NOT TESTED for 1024×768**

The spec's 1024×768 minimum requires careful testing. The current 60/40 column split in CommandCenterPage would result in a ~600px chart column and ~400px alert stream column at 1024 width, which may be acceptable. Sidebar would need to be collapsible.

**Priority: P2** — SIEM is primarily a desktop tool; 1024×768 is edge case.

---

## 3. Performance

### 3.1 Route Splitting / Lazy Loading
**Status: NOT IMPLEMENTED (with one exception)**

- Grep found `React.lazy` / lazy import in: `DataParsingPage.tsx` only
- All other 50+ pages are **eagerly imported** in `router/index.tsx`
- router/index.tsx imports all 50+ page components at the top level — no code splitting
- **Impact:** Initial bundle includes ALL page code; bundle size penalty on first load
- **Required:** Wrap major page groups in `React.lazy()` + `<Suspense>` in the router

### 3.2 Grid Virtualisation
**Status: COMPLIANT**

- AG Grid Community includes virtual DOM row virtualisation by default
- `SiemDataGrid.tsx` uses AG Grid — rows are virtualised; only visible rows are in DOM
- **No custom virtualisation needed**

### 3.3 Chart Memoisation
**Status: NEEDS_VERIFICATION**

- `HaChart.tsx` wraps ECharts; option prop changes trigger ECharts updates
- If `option` objects are created inline in render, they trigger re-renders on every parent update
- **Risk:** CommandCenterPage.tsx passes ECharts options inline → new object every render → chart flickers
- **Required:** `useMemo()` on chart option objects in all chart-rendering components

### 3.4 TanStack Query Cache
**Status: COMPLIANT**

- All data fetching uses TanStack Query v5 with appropriate `staleTime` values
- `CommandCenterPage.tsx`: `refetchInterval: 30_000` (30 seconds) — appropriate for KPI tiles
- `DashboardViewPage.tsx`: `staleTime: 5 * 60 * 1000` (5 minutes) — appropriate for dashboard config

### 3.5 Bundle Size Estimate

Without a build output, bundle size cannot be precisely measured. Key observations:
- All routes eagerly loaded: +50 pages in initial bundle
- Monaco Editor (0.55MB+ min): DataParsingPage lazy-loads this ✓
- AG Grid Community: ~1MB; not code-split per page
- PatternFly 6: ~500KB; tree-shakeable
- ReactFlow: ~300KB; not code-split
- ECharts: ~1MB; not code-split

**Estimated initial bundle: 3-5MB uncompressed** (speculation; run `npm run build` to verify)

**Action:** Enable route-level code splitting: `const AlertsListPage = React.lazy(() => import('./AlertsListPage'))`

---

## 4. Summary and Priority Matrix

| Issue | WCAG Level | Severity | Quick Fix? |
|---|---|---|---|
| Skip navigation link missing | A | P1 | YES — 30 min |
| Chart aria-label missing | A | P1 | YES — 1 hour |
| Non-interactive div click handlers | A | P1 | NO — systemic refactor |
| Colour-only status indicators | AA | P2 | PARTIAL — add aria-label |
| Live region for SSE alerts | AA | P2 | YES — 1 hour |
| ECharts reduced-motion | AA | P2 | YES — 30 min |
| Landmark regions (main) | A | P2 | YES — 30 min |
| Route splitting (performance) | N/A | P1 | MEDIUM — 2 hours |
| Chart option memoisation | N/A | P2 | YES — 1 hour |
| Responsive at 1024×768 | N/A | P2 | NO — design work |
| axe-core testing | N/A | P1 | YES — 30 min setup |
