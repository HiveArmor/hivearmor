# 05 — Design System and Shared Components Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** `tokens.css`, all Ha* component files, `SiemDataGrid.tsx`, `DashboardCanvas`, global.css, grep results for rgba() and forbidden patterns

---

## 1. Token Compliance

**Result: COMPLIANT — all 22 design tokens present and correct**

File: `frontend-v3/src/styles/tokens.css` (77 lines, last verified 2026-07-23)

| Token | Expected | Actual | Status |
|---|---|---|---|
| --ha-background | #070A0F | #070A0F | COMPLIANT |
| --ha-surface-primary | #0D131C | #0D131C | COMPLIANT |
| --ha-surface-raised | #131C28 | #131C28 | COMPLIANT |
| --ha-border | #253244 | #253244 | COMPLIANT |
| --ha-primary | #32D6C5 | #32D6C5 | COMPLIANT |
| --ha-intelligence | #8B7CFF | #8B7CFF | COMPLIANT |
| --ha-critical | #FF5D6C | #FF5D6C | COMPLIANT |
| --ha-high | #FFAA45 | #FFAA45 | COMPLIANT |
| --ha-medium | #5AA7FF | #5AA7FF | COMPLIANT |
| --ha-positive | #40D69A | #40D69A | COMPLIANT |
| --ha-text-primary | #E8EDF4 | #E8EDF4 | COMPLIANT |
| --ha-text-secondary | #97A6B8 | #97A6B8 | COMPLIANT |
| --ha-text-xs | 0.6875rem | 0.6875rem | COMPLIANT |
| --ha-text-sm | 0.75rem | 0.75rem | COMPLIANT |
| --ha-text-base | 0.8125rem | 0.8125rem | COMPLIANT |
| --ha-text-md | 0.875rem | 0.875rem | COMPLIANT |
| --ha-font-ui | 'Inter' | 'Inter' | COMPLIANT |
| --ha-font-mono | 'JetBrains Mono' | 'JetBrains Mono' | COMPLIANT |
| --ha-radius-sm / base / md / lg | 2/4/6/8px | 2/4/6/8px | COMPLIANT |
| --ha-z-drawer/modal/toast/tooltip | 200/300/400/500 | 200/300/400/500 | COMPLIANT |
| Row heights | 32/40/48px | 32/40/48px | COMPLIANT |

**Additional tokens present (not in spec):** `--ha-text-lg`, `--ha-text-xl`, `--ha-text-2xl`, `--ha-weight-*`, `--ha-space-*`, `--ha-shadow-overlay` — these are additive, not contradictory.

---

## 2. Ha* Wrapper Inventory

**20 Ha* components found** under `frontend-v3/src/components/`

| Component | File | Wraps | Spec Required? | Status |
|---|---|---|---|---|
| HaButton | ha-button/HaButton.tsx | PatternFly Button | YES | COMPLIANT |
| HaChart | ha-chart/HaChart.tsx | Apache ECharts | YES | COMPLIANT |
| HaDrawer | ha-drawer/HaDrawer.tsx | PatternFly Drawer | YES | COMPLIANT |
| HaModal | ha-modal/HaModal.tsx | PatternFly Modal | YES | COMPLIANT |
| HaConfirmationModal | ha-confirmation-modal/HaConfirmationModal.tsx | PatternFly Modal variant | YES | COMPLIANT |
| HaSelect | ha-select/HaSelect.tsx | PatternFly Select | YES | COMPLIANT |
| HaMultiSelect | ha-multi-select/HaMultiSelect.tsx | PatternFly Select (multi) | YES | COMPLIANT |
| HaTextInput | ha-text-input/HaTextInput.tsx | PatternFly TextInput | YES | COMPLIANT |
| HaTextArea | ha-text-area/HaTextArea.tsx | PatternFly TextArea | YES | COMPLIANT |
| HaFormGroup | ha-form-group/HaFormGroup.tsx | PatternFly FormGroup | YES | COMPLIANT |
| HaTabs | ha-tabs/HaTabs.tsx | PatternFly Tabs | YES | COMPLIANT |
| HaToggle | ha-toggle/HaToggle.tsx | PatternFly Switch | YES | COMPLIANT |
| HaToggleGroup | ha-toggle-group/HaToggleGroup.tsx | PatternFly ToggleGroup | YES | COMPLIANT |
| HaSwitch | ha-switch/HaSwitch.tsx | PatternFly Switch variant | — | COMPLIANT |
| HaWizard | ha-wizard/HaWizard.tsx | PatternFly Wizard | YES | COMPLIANT |
| HaInlineBanner | ha-inline-banner/HaInlineBanner.tsx | PatternFly Alert (inline) | YES | COMPLIANT |
| HaNavigation | ha-navigation/HaNavigation.tsx | PatternFly Nav | YES | COMPLIANT |
| HaMasthead | ha-masthead/HaMasthead.tsx | PatternFly Masthead | YES | COMPLIANT |
| HaAuthContainer | ha-auth-container/HaAuthContainer.tsx | Custom auth layout | — | COMPLIANT |
| HaWordmark | ha-wordmark/HaWordmark.tsx | Brand wordmark SVG | YES | COMPLIANT |

**Spec-required wrappers NOT found:**
- `HaDataTable` (PatternFly Table for small datasets) — `SiemDataGrid` uses AG Grid for all tables
- `HaEmptyState` — `EmptyState.tsx` exists (not Ha-prefixed)
- `HaAlert` (toast/notification) — `toastStore.ts` is an in-memory stub; no PatternFly AlertGroup integration

---

## 3. Forbidden Library Check

| Library | Forbidden | Found in package.json? | Status |
|---|---|---|---|
| Tailwind CSS | YES | NO | COMPLIANT |
| Radix UI | YES | NO | COMPLIANT |
| Material UI (MUI) | YES | NO | COMPLIANT |
| Ant Design | YES | NO | COMPLIANT |
| shadcn/ui | YES | NO | COMPLIANT |
| Chart.js | YES | NO | COMPLIANT |
| Recharts | YES | NO | COMPLIANT |
| D3.js (direct) | YES | NO | COMPLIANT |
| SWR | YES | NO | COMPLIANT |
| RTK Query / Redux | YES | NO | COMPLIANT |
| Next.js router | YES | NO | COMPLIANT |
| TanStack Router | YES | NO | COMPLIANT |
| CodeMirror | YES | NO | COMPLIANT |
| Ace Editor | YES | NO | COMPLIANT |

**Result: COMPLIANT — no forbidden libraries found.**

---

## 4. Forbidden UI Patterns

| Pattern | Rule | Found? | Evidence | Status |
|---|---|---|---|---|
| Glassmorphism (`backdrop-filter: blur`) | FORBIDDEN | NO | Not found in src/styles/ or components | COMPLIANT |
| Neon glow effects | FORBIDDEN | NO | Not found | COMPLIANT |
| Decorative gradients on data surfaces | FORBIDDEN | NO | Not found | COMPLIANT |
| Border-radius > 8px on primary surfaces | FORBIDDEN | NO | tokens.css max is --ha-radius-lg: 8px; no hardcoded larger values found | COMPLIANT |
| Nested cards inside cards | FORBIDDEN | NO | DashboardViewPage.tsx: single card level | COMPLIANT |
| Multiple permanent toolbars stacked | FORBIDDEN | NO | AppLayout has single masthead + sidebar | COMPLIANT |
| Animated world maps | FORBIDDEN | NO | ThreatConstellationPage uses ECharts force graph (not world map) | COMPLIANT |

**Result: COMPLIANT — no forbidden UI patterns found.**

---

## 5. rgba() Usage Audit (color-mix() rule violation)

Files violating the `color-mix()` rule (should not use rgba() for token-derived semi-transparent backgrounds):

| File | rgba() instances | Violation description |
|---|---|---|
| HiveIntelligencePage.tsx | 3 | rgba(50,214,197,0.15), rgba(139,124,255,0.15), rgba(255,93,108,0.15), etc. |
| CommandCenterPage.tsx | 2 | rgba(255,93,108,0.1), rgba(255,170,69,0.1) — error banners |
| ThreatConstellationPage.tsx | 1 | rgba(90,167,255,0.15) — status banner |
| DashboardViewPage.tsx | 3 | rgba(255,170,69,0.1), rgba(255,93,108,0.15), rgba(90,167,255,0.15) |
| HaInlineBanner.tsx | Multiple | rgba() for variant backgrounds |
| HaDrawer.tsx | Multiple | rgba() for overlay |
| NavItem.tsx | 1 | rgba() for active state |
| HaMasthead.tsx | Multiple | rgba() for hover states |
| echartsTheme.ts | Multiple | rgba() for chart colors |
| auditActionTypes.ts | Multiple | rgba() for status colors |

**Total files violating color-mix() rule: 20** (from grep output showing rgba() in .tsx/.ts files)

**Severity: P1** — Token system is bypassed. Changes to token values won't propagate to these hard-coded rgba() instances.

**Required Action:** Systematic replacement: `rgba(255,93,108,0.15)` → `color-mix(in srgb, var(--ha-critical) 15%, transparent)`

---

## 6. CSS Module vs Inline Styles

**Observation:** The codebase uses **inline styles extensively** — virtually every component uses `style={{...}}` props rather than CSS Modules or CSS classes.

Evidence from file reads:
- `CommandCenterPage.tsx`: 50+ inline style objects
- `HiveIntelligencePage.tsx`: 80+ inline style objects  
- `ThreatConstellationPage.tsx`: 30+ inline style objects
- `DashboardViewPage.tsx`: 60+ inline style objects

**Spec alignment:** The spec does not mandate CSS Modules, but inline styles have drawbacks:
- Cannot use `:hover`, `:focus`, `:active` pseudo-selectors
- No media queries possible inline (responsive design requires JS)
- Performance: new style object every render (not memoized in most cases)
- Testing: hard to assert on styles in tests

**Status:** COMPLIANT_WITH_MINOR_GAPS — Inline styles work but limit responsive design and hover/focus states.

**Required Action:** Key interactive components (buttons, nav items) need CSS classes or inline `onMouseEnter/Leave` for hover states. Critical for WCAG 2.4.7 (focus visible).

---

## 7. EngineeringNotice.skip.ts

**File:** `frontend-v3/src/components/engineering-notice/EngineeringNotice.skip.ts`

**Purpose:** This component is described as a placeholder notice for pages that are engineering-in-progress. It is excluded from TypeScript compilation (`.skip.ts`).

**Impact:** Pages that import `EngineeringNotice` will fail to compile unless they import from the `.skip.ts` file directly (which TypeScript ignores). This may be the mechanism by which stub pages silently render a blank or minimal UI.

**Status:** The `.skip.ts` mechanism is the key architectural risk in this codebase — see document 15 for the full debt register entry.

---

## 8. Missing Shared Components (Spec-Required, Not Found)

| Spec Component | Status | Impact |
|---|---|---|
| SocAiChatDrawer (global AI drawer) | MISSING | AI chat completely absent from shell |
| CommandPalette (global keyboard shortcut Cmd+K) | MISSING | No command palette found in router or AppLayout |
| HaAlertGroup (PatternFly toast notifications) | MISSING — toastStore.ts is in-memory stub | No visible toast notifications |
| TenantSelectorDropdown | MISSING | MSSP blocked |
| SavedViewsMenu (pinned filter sets) | MISSING | No saved views in any grid |
| BulkActionBar (for alert/incident grids) | MISSING | No bulk operations |
| SessionExpiredModal | MISSING | Hard reload on session expiry |
| SkipToContentLink | MISSING | WCAG A11Y failure |
