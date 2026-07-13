# Cursor AI UI/UX Changes — Deep Audit Report

**Generated:** June 27, 2026  
**Scope:** All UI/UX changes made by Cursor AI to the UTMStack-11 frontend  
**Status:** AUDIT ONLY — No changes will be made without confirmation

---

## Executive Summary

Cursor AI performed a **massive visual overhaul** of the Angular 7 frontend, converting it from a light theme (`#F2F3F7` background) to a dark "proSIEM" theme (`#0B0D14` background). The changes span:

- **14 new global SCSS partials** created in `frontend/src/styles/`
- **4 legacy SCSS files** rewritten (`theme.scss`, `var.scss`, `custom-elements.scss`, `styles.scss`)
- **65 component-level `.scss` files** modified (out of 501 total)
- **~8,524 lines** of new/rewritten global SCSS
- **1 separate frontend-v2** (Next.js/React) app created at `frontend-v2/`
- **3 documentation files** generated (`UI_IMPROVEMENT_PLAN.md`, `CODEBASE_ANALYSIS.md`, plus Kiro specs)

---

## Part 1: Global Style Architecture Changes

### New File: `src/styles/_tokens.scss` (201 lines) — DESIGN TOKEN SYSTEM

This is the **foundation** of all changes. It defines a complete "proSIEM" design token system:

| Category | Tokens | Example Values |
|----------|--------|----------------|
| Surfaces | `$bg-body`, `$bg-sidebar`, `$bg-card`, `$bg-elevated`, `$bg-hover` | `#0B0D14`, `#10131C`, `#151922`, `#1C2232`, `#1E2640` |
| Accent | `$accent`, `$accent-dim`, `$accent-glow`, `$accent-dark` | `#4F8EF7`, `rgba(79,142,247,0.12)` |
| Severity | `$sev-critical` through `$sev-info` (+bg/bd variants) | `#FF4560`, `#FF8C38`, `#F5C842`, `#22D3EE`, `#64748B` |
| Text | `$text-100` through `$text-400` | `#DDE6FF`, `#8899BB`, `#4A5880`, `#2A3655` |
| Borders | `$border-100`, `$border-200`, `$border-focus` | `#1C2232`, `#2A3655`, `rgba(79,142,247,0.45)` |
| Typography | `$font-ui`, `$font-mono`, size scale `$t-8` to `$t-28` | Inter, JetBrains Mono |
| Spacing | `$s-1` through `$s-8` (4px grid) | 4px to 32px |
| Radii | `$r-xs` through `$r-pill` | 3px to 999px |
| Layout | `$sidebar-w`, `$header-h`, table density tokens | 220px, 52px |
| Motion | `$ease-fast`, `$ease-base`, `$ease-slow` | 120ms, 220ms, 380ms |
| Shadows | `$shadow-sm` (none), `$shadow-lg`, `$shadow-purple` | Flat surfaces, overlay-only shadows |
| Legacy aliases | Maps old names → new tokens | `$surface-primary → $bg-card` etc. |

**Concern:** The token file also includes 60+ "legacy aliases" at the bottom to bridge old variable names. This creates a dual-naming system that could confuse future developers.

### Rewritten: `src/assets/styles/theme.scss` (233 lines)

**Before (original):** Defined ~15 color variables (`$primary-color: #232f3e`, `$success-color: #4caf50`, etc.)

**After:** Now acts as a "Legacy Theme Bridge" that:
- Imports `_tokens.scss`
- Maps all old variable names to new token values
- Adds complete Bootstrap theme maps (`$theme-colors`, `$theme-hover-colors`, `$theme-inverse-colors`, etc.)
- Adds gray ramp, `$dark-*` variables, and `$theme-text-colors` map

**Impact:** Every component that `@import "../theme"` now gets completely different color values propagated.

### Rewritten: `src/assets/styles/var.scss` (58 lines)

**Before (original):** Defined layout variables, grid breakpoints, icon sizes

**After:** Now a "Legacy Layout Bridge" that imports tokens and provides:
- `$navbar-primary-height` → `$nav-height` (52px)
- SVG icon sizes map (unchanged)
- Grid breakpoints (unchanged)
- Legacy shadow/radius/transition aliases

### Rewritten: `src/assets/styles/custom-elements.scss` (645 lines)

**Before:** Component overrides with hardcoded light colors

**After:** Complete rewrite with dark theme variables for cards, modals, form controls, ng-select, tables, navigation, dropdowns, tabs, badges, pagination, list groups, popovers, tooltips, breadcrumbs, checkboxes, filter panels, alerts, and print overrides.

### Rewritten: `src/styles.scss` (1,095 lines)

**Before:** Imported legacy partials + had global styles inline

**After:** Complete restructure:
1. Imports 14 new partials first (tokens → global → shell → buttons → tables → etc.)
2. Then imports legacy files (theme, var, custom-elements, icons, etc.)
3. Then has remaining inline rules (forms, alerts, badges, utilities, modals, popovers, compliance layouts, etc.)

---

## Part 2: New Global Partial Files (14 files)

| File | Lines | Purpose |
|------|-------|---------|
| `_tokens.scss` | 201 | Design token system (source of truth) |
| `_global.scss` | 382 | Body, typography, scrollbars, cards, Bootstrap neutralization, print |
| `_shell.scss` | 137 | App layout grid, sidebar/content flex, breadcrumb bar, tooltips |
| `_buttons.scss` | 356 | All button variants (`.btn-*`, `.utm-button-*`, `.setting-filter`, time pills) |
| `_tables.scss` | 338 | Data table mixin + `.utm-data-table` variants (compact, comfortable, dense) |
| `_filters.scss` | 207 | Filter toolbar, chips, time triggers, context menus, utm-box |
| `_features.scss` | 359 | List workspace layout, alert table cards, dashboard, log explorer, rule editor |
| `_modules.scss` | 477 | Settings headers, modules panel, SOAR cards, compliance, data sources, admin, auth |
| `_charts.scss` | 124 | Chart card headers, containers, visualization toolbar, schedule pickers |
| `_components.scss` | 1,498 | Header, sidebar, admin rail, tables, buttons, forms, ng-select, severity badges, KPI cards, modals, tabs, pagination, legacy migrations |
| `_pages.scss` | 895 | Page title bars, dashboard KPI grid, alert management, log explorer, MITRE, geo, timeline, compliance, settings, SOAR, compliance, data sources, rules |
| `_utility-overrides.scss` | 174 | Bootstrap `.bg-*`, `.text-*`, `.border-*` neutralization |
| `_page-overrides.scss` | 413 | Component-scoped overrides (selectable list, code editor, compliance, SOAR, providers, log explorer, alerts) |
| `_ng-select-overrides.scss` | 217 | Complete ng-select dark theme (control, panel, options, multi-chips, native selects, dropdown items) |

---

## Part 3: Component-Level SCSS Changes (65 files)

### By Module:

| Module | Files Modified | Key Changes |
|--------|---------------|-------------|
| **Shared/Layout** | 12 | Header, left-nav, sidebar, breadcrumb bar, notifications, version info |
| **Alert Management** | 7 | Alert view, severity bar, echoes timeline, status, child columns, apply-incident, full detail |
| **Incident Response (SOAR)** | 7 | Playbooks, action-sidebar, condition-builder, condition-item, action-builder, new-playbook, action-conditional |
| **App Management/Settings** | 5 | Sidebar, menu, identity provider (3 files) |
| **Log Analyzer** | 3 | Field panel, view, query-filter-selector |
| **Rule Management** | 4 | Sidebar, expression console, rule view, add rule |
| **Compliance** | 3 | Templates, evaluation history, cp-standard |
| **Dashboard** | 3 | KPI strip, dashboard grid, render |
| **Shared/Filters** | 4 | Refresh filter, elastic filter time, elastic filter, time filter |
| **Auth/Login** | 4 | Login, TFA setup, TOTP, login providers |
| **Graphic Builder** | 3 | Visualization create, table view, text builder |
| **Logstash** | 2 | Pipelines, filter create |
| **Admin** | 1 | User management |
| **Others** | 7 | Scanner, report, incident notes, app-module guides, schedule config, modal header, time data refresh, dtable columns |

### Nature of component changes:
- Importing `tokens` or theme variables
- Replacing hardcoded colors (`#FFFFFF`, `#f8f8f8`, `#212529`) with token variables
- Adding dark surface backgrounds, border colors, text colors
- Updating hover/active states to use accent colors
- Making layouts flex/grid-based for proper containment

---

## Part 4: Design Language Shift

### Color Philosophy Change

| Element | Before (Light) | After (proSIEM Dark) |
|---------|---------------|---------------------|
| Page background | `#F2F3F7` (light gray) | `#0B0D14` (near-black) |
| Cards | `#FFFFFF` (white) | `#151922` (dark slate) |
| Elevated surfaces | `#FFFFFF` | `#1C2232` (blue-gray) |
| Primary accent | `#232f3e` (dark navy) | `#4F8EF7` (vibrant blue) |
| Primary text | `#3F4254` (dark gray) | `#DDE6FF` (light blue-white) |
| Secondary text | `#666666` | `#8899BB` (muted blue-gray) |
| Borders | `#d3dae6` (light gray) | `#1C2232` (subtle dark) |
| Severity critical | `#f44336` | `#FF4560` |
| Severity high | `#FF9800` | `#FF8C38` |
| Severity medium | `#FFA800` | `#F5C842` |
| Success | `#4caf50` | `#3DD68C` |

### Typography Change

| Element | Before | After |
|---------|--------|-------|
| Font family | Poppins | Inter |
| Base size | 13px (0.8125rem) | 13px (`$t-13`) |
| Body/labels | 12px (forced `.75rem !important`) | 10-13px (contextual) |
| Headings | No formal scale | h1=22px, h2=16px, h3=14px, h4=13px, h5/h6=10px |
| Monospace | None defined | JetBrains Mono / Cascadia Code / Fira Code |
| Label style | Normal | Uppercase, bold, 0.07em letter-spacing |

### Layout Change

| Element | Before | After |
|---------|--------|-------|
| App shell | Nested divs | CSS Grid (header row + body row) |
| Header height | ~64px | 52px (`$header-h`) |
| Sidebar | Fixed width | 220px (collapsible to 52px) |
| Tables | Bootstrap defaults | Custom compact density (34px rows, 4px padding) |
| Scrollbars | 8px | 5px (thinner) |
| Card borders | `border-radius: 0` | `8px` (`$r-md`) |
| Shadows | Bootstrap defaults | Flat (none for cards, only for overlays) |
| Body effect | None | Dot-grid radial gradient overlay |

---

## Part 5: Potential Issues & Risks

### High Risk
1. **Font change (Poppins → Inter):** Loads from Google Fonts at runtime. If the import fails or is slow, UI renders with system fallback.
2. **Label styling change:** All `<label>` elements are now uppercase + bold + letter-spacing. This will affect form labels, filter labels, and any component using `<label>` semantically.
3. **Table density reduction:** Tables now have 34px row height with 4px vertical padding. Dense data may be harder to scan.
4. **Aggressive `!important` usage:** Many overrides use `!important` to fight Bootstrap specificity. Creates maintainability debt.
5. **Duplicate rule definitions:** Some rules appear in both `_components.scss` AND `custom-elements.scss` AND `_global.scss` (e.g., cards, modals, tables). Cascade conflicts likely.

### Medium Risk
6. **Body dot-grid overlay:** `body::before` adds a fixed radial-gradient pattern. May affect print or screenshot tools.
7. **ng-select blanket overrides:** Heavy `!important` usage on ng-select may break custom per-component select styling.
8. **Sidebar fixed position:** `.app-sidebar` uses `position: fixed` which may conflict with the existing Angular layout.
9. **Page title suppression:** `.page-title` elements are hidden with `display: none !important` — page context may be lost.
10. **Scrollbar width reduction (8px → 5px):** May impact usability on touchscreens.

### Low Risk
11. **Print styles:** `@media print` blocks restore white backgrounds — should work but untested.
12. **Severity row tinting:** Table rows get left borders + background tint based on severity class. Requires HTML templates to apply correct classes.
13. **Animation (ok-pulse):** Status dot animation may cause repaints on low-power devices.

---

## Part 6: `frontend-v2/` — Separate Next.js App

Cursor AI also created a **completely separate frontend** at `frontend-v2/` using:
- Next.js (React)
- TypeScript
- Tailwind CSS
- Zustand (state management)
- ECharts (charts)

This includes a visualization builder, dashboard components, alert/incident views, and admin pages. It's a parallel rewrite, not a modification of the existing Angular app.

**This is a separate project and does NOT affect the Angular frontend directly.**

---

## Part 7: Page-by-Page Audit Plan

Below is the audit plan for each page. **I will wait for your confirmation before making any changes.**

### 1. Dashboard (`/dashboard`)
- **Changes made:** KPI grid layout, chart card styling, dashboard gridster background, chart header compression (28px), widget embedded table padding
- **Audit items:** Verify KPI cards render, chart backgrounds match, gridster drag-and-drop still works, chart headers readable at 28px height
- **Risk:** Chart header truncation with `text-overflow: ellipsis`

### 2. Alert Management (`/data`)
- **Changes made:** Full list-workspace layout (flex), filter panel sidebar styling, alert table card, severity row tinting, toolbar status pills, alert slide panel
- **Audit items:** Verify filter panel scrolls, severity badges visible, status filter pills work, table row hover states, action column width
- **Risk:** Filter panel fixed 280px min-width may overflow on small screens

### 3. Log Analyzer (`/discover`)
- **Changes made:** Search bar styling, field panel sidebar, filter pills, log row formatting, query status indicators, view toggles
- **Audit items:** Verify Monaco editor still loads, search input focus ring works, field panel scrolls, log timestamp alignment
- **Risk:** `font-family: $font-mono` on search bar changes expected appearance

### 4. Incident Management (`/incident`)
- **Changes made:** Timeline styling, incident notes component
- **Audit items:** Verify timeline renders with gradient, notes component readable
- **Risk:** Low

### 5. Incident Response / SOAR (`/soar`)
- **Changes made:** Playbook cards grid layout, action builder blocks, condition builder, new-playbook modal, slide panel
- **Audit items:** Verify playbook cards render in grid, action blocks connected visually, condition hover states, vertical line connectors
- **Risk:** Complex visual flow (lines/arrows) may be disrupted

### 6. Correlation Rules (`/alerting-rules`)
- **Changes made:** Sidebar navigation, expression console, rule view, add rule modal, rule editor container
- **Audit items:** Verify sidebar nav active states, expression console code rendering, add-rule modal sizing
- **Risk:** Low-medium

### 7. Compliance (`/compliance`)
- **Changes made:** Templates component, evaluation history, standard management, section navigation, report viewer, loading overlays
- **Audit items:** Verify list-group navigation, section icons, compliance report viewer active section indicator, loading overlay covers correctly
- **Risk:** Print layout for compliance reports may need verification

### 8. Data Sources (`/data-sources`)
- **Changes made:** Module cards (integration tiles), card-header-title backgrounds
- **Audit items:** Verify integration logos visible on dark background (`filter: brightness(0.9) saturate(0.85)`), active module indicator
- **Risk:** Image filter may make some logos hard to see

### 9. Admin / Settings (`/management`)
- **Changes made:** App management sidebar, two-column layout, settings card backgrounds, health status indicators
- **Audit items:** Verify sidebar nav routing, settings forms readable, health-check status pills
- **Risk:** Low

### 10. Visualization Builder (`/creator`)
- **Changes made:** Visualization create component, chart containers, header-property toolbar
- **Audit items:** Verify chart canvas renders on dark background, toolbar controls accessible
- **Risk:** Low

### 11. Login / Auth
- **Changes made:** Auth card styling, TFA/TOTP components, login providers, method selection cards, QR container
- **Audit items:** Verify login form readable, 2FA codes visible, method selection cards interactive, QR code scannable on dark background
- **Risk:** QR code visibility on `$surface-ground` (`#0B0D14`) background

### 12. User Management (`/management/users`)
- **Changes made:** User management component SCSS
- **Audit items:** Verify user table renders, action buttons visible
- **Risk:** Low

### 13. Logstash / Data Parsing (`/data-parsing`)
- **Changes made:** Pipeline component, filter create component
- **Audit items:** Verify pipeline cards render, code editor background
- **Risk:** Low

### 14. Header & Navigation (Global)
- **Changes made:** Complete header redesign (52px, grid-based), left nav component, breadcrumb bar, notification panel, version info, menu navigation
- **Audit items:** Verify all nav links visible, notification badge renders, user avatar displays, brand logo/text visible, active menu indicators work, breadcrumb routing
- **Risk:** Header height reduction (64px → 52px) may clip existing content

### 15. Shared Components (Global)
- **Changes made:** Modal headers, time filters, refresh filters, elastic filters, code editor, schedule config, dtable columns panel
- **Audit items:** Verify modals open/close properly, time filter popover positions correctly, filter chips readable, code editor dark background
- **Risk:** Popover z-index conflicts (multiple z-index values: 99999, 100000, 2061)

---

## Part 8: Recommendations

1. **Build verification first:** Run `NODE_OPTIONS=--max_old_space_size=8192 npm run build` to confirm the SCSS compiles without errors.
2. **Visual regression per page:** Each page should be opened and compared side-by-side with the original design.
3. **Deduplicate rules:** `_components.scss` (1,498 lines) overlaps significantly with `custom-elements.scss` and `_global.scss`. These should be consolidated.
4. **Remove `frontend-v2/`** from the main repo if it's not intended to ship — it adds confusion about which frontend is production.
5. **Address `!important` debt:** Count is likely 200+ across the new files. Consider CSS specificity restructuring.
6. **Test print layouts:** Compliance reports and dashboard exports rely on print CSS.
7. **Validate font loading:** Inter + JetBrains Mono load from Google Fonts CDN — ensure this works in air-gapped environments.

---

## Summary of Decisions Needed

| # | Decision | Options |
|---|----------|---------|
| 1 | Accept dark theme conversion? | Keep / Revert / Partial |
| 2 | Accept font change (Poppins → Inter)? | Keep Inter / Restore Poppins / Mix |
| 3 | Accept label styling (uppercase+bold)? | Keep / Revert to normal case |
| 4 | Accept table density reduction? | Keep compact / Restore comfortable |
| 5 | Accept header height reduction (52px)? | Keep / Increase |
| 6 | Keep `frontend-v2/` in repo? | Keep / Remove / Move to separate repo |
| 7 | Address `!important` debt now or later? | Now / Later / Incrementally |
| 8 | Approach per page? | Review all at once / Page-by-page approval |

---

**Awaiting your confirmation before making any changes. Let me know which pages you'd like me to audit first, or if you want to proceed with any specific corrections.**
