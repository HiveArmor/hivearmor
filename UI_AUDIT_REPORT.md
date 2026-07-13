# UTMStack v11 — Full UI Audit Report
**Date:** 2026-06-30  
**Method:** Automated Playwright headless audit (31 pages, 3 interaction tests) + source code static analysis  
**Credentials used:** admin / localdev123!  
**Base URL:** http://localhost:8880  

---

## Executive Summary

| Category | Count |
|---|---|
| Pages audited | 31 |
| Console errors (JS runtime) | 36 |
| HTTP 500 API errors | 4 |
| HTTP 401/404 errors | 4 |
| Broken/blocked UI flows | 6 |
| Warnings (empty buttons, missing elements) | 14 |
| Pages with zero errors | 14 |

**3 critical bugs** need fixing before the app is production-ready:
1. `$localize is not defined` — crashes multiple pages (Incidents, SOAR, Alerting Rules, Chart Creator)
2. `Cannot read properties of undefined (reading 'viewContainerRef')` — crashes Discover/Log Analyzer
3. `/api/overview/count-alerts-by-status` returns HTTP 500 — breaks dashboard charts

---

## BUG-001 — CRITICAL: `$localize is not defined` (7 pages affected)

**Severity:** Critical  
**Affected pages:** Dashboard, Incidents, SOAR, Alerting Rules, Chart Creator, Incident Create modal  
**Error:**
```
ERROR ReferenceError: $localize is not defined
  at consts (main.js:224:2384033)
  at Wo → Sa → Ch → T1 → Nr → Xm
```

**Root cause:** `$localize` is Angular's i18n runtime function. It's injected by the `@angular/localize` polyfill (`import '@angular/localize/init'`). This import is missing from `polyfills.ts`. The function is used at least one component that uses the `$localize` tagged template literal syntax (e.g., `$localize\`some string\``) — likely introduced by a third-party package or by a component that uses Angular i18n decorators.

**Affected bundles:** `main.js` (consts at line 2384033), lazy chunks `669`, `584`, `757`, `943`

**Fix required:**
```bash
npm install @angular/localize --save
```
Then add to `src/polyfills.ts`:
```typescript
import '@angular/localize/init';
```
Or add to `angular.json` polyfills array:
```json
"polyfills": ["@angular/localize/init", "src/polyfills.ts"]
```

**Files to change:**
- `frontend/src/polyfills.ts` — add `import '@angular/localize/init';`
- OR `frontend/angular.json` → `projects.utm-stack.architect.build.options.polyfills`

---

## BUG-002 — CRITICAL: Discover/Log Analyzer crashes on init

**Severity:** Critical  
**Page:** `/discover` (Log Analyzer)  
**Error:**
```
ERROR TypeError: Cannot read properties of undefined (reading 'viewContainerRef')
  at o.ngOnInit (2.a089c677471763ea.js:1:56141)
```

**Root cause:** A component in the log analyzer module (`2.js` chunk) accesses `viewContainerRef` on a service/injected dependency that is `undefined` at `ngOnInit` time. This is a classic null-safety issue — likely a `@ViewChild` or injected `ViewContainerRef` that hasn't been initialised before `ngOnInit` fires.

**Impact:** The Log Analyzer page renders but throws an error on init, which may prevent the search results panel or filter panel from mounting properly. The audit confirmed both `no_time_filter` and `no_results_area` findings on this page.

**File to investigate:** Find the component at chunk `2.a089c677471763ea.js` — likely in `frontend/src/app/log-analyzer/`

**Fix approach:** Add null guard before accessing `viewContainerRef`:
```typescript
ngOnInit(): void {
  if (!this.someService?.viewContainerRef) {
    console.warn('viewContainerRef not ready');
    return;
  }
  // existing init code
}
```

---

## BUG-003 — CRITICAL: Dashboard — `/api/overview/count-alerts-by-status` returns HTTP 500

**Severity:** Critical  
**Page:** `/dashboard` (Overview)  
**Errors:**
```
HTTP 500: /api/overview/count-alerts-by-status?from=now-7d/d&to=now
HTTP 500: /api/overview/count-alerts-by-status?from=now-7d&to=now
[Alert By Status] API Error: Et
```

**Root cause:** The backend `OverviewController` endpoint for `count-alerts-by-status` is failing with a 500. The date format `now-7d/d` (with floor `/d`) may be failing OpenSearch date math parsing in the current version of `opensearch-java` connector after the Spring Boot 3.3 upgrade.

**Impact:** The "Alerts by Status" chart on the dashboard overview is broken — it shows an error state. Two requests are made (one with `/d` floor, one without), both fail.

**Fix approach (backend):**
1. Check `OverviewController` → `countAlertsByStatus` method
2. Check if `now-7d/d` date math is supported by the OpenSearch client version in use
3. If not, strip the `/d` floor from the date parameter or handle the 500 gracefully in the frontend chart component

**Frontend fallback fix (immediate):** In the chart component handling this endpoint, catch HTTP errors and show "No data" instead of propagating the error:
```typescript
this.overviewService.countAlertsByStatus(params).pipe(
  catchError(err => {
    console.error('[Alert By Status] API Error:', err.message);
    return of([]);  // return empty array, don't crash
  })
).subscribe(data => this.chartData = data);
```

---

## BUG-004 — HIGH: Admin pages return 401/404 — Auth token not forwarded on direct navigation

**Severity:** High  
**Pages:** `/management/users`, `/management/api-keys`  
**Errors:**
```
Failed to load resource: 401 Unauthorized
Failed to load resource: 404
```
**API calls:** 0 (no API calls made at all)

**Root cause:** When navigating directly to `/management/users`, the auth token from the previous session is not being forwarded to the API calls. The audit navigated there after a successful login session, but the admin module's API calls returned 401. This suggests either:
1. The auth token is stored in `sessionStorage` but lost when the lazy-loaded admin module initialises
2. The `AuthInterceptor` is not attaching the Bearer token for `/management/` routes (check the `BYPASS_ROUTES` constant)

**Check `app-routes.constant.ts`:** Ensure `/management` is NOT in `BYPASS_ROUTES`.

---

## BUG-005 — HIGH: Integrations page — `Cannot read properties of null (reading 'writeValue')`

**Severity:** High  
**Page:** `/integrations`  
**Error:**
```
ERROR TypeError: Cannot read properties of null (reading 'writeValue')
  at Ve._setUpStandalone → Ve._setUpControl → Ve.ngOnChanges
```

**Root cause:** An Angular `FormControl` is being attached to a `null` form element via `[formControl]` binding. This happens when `[formControl]="someControl"` is applied to an element that doesn't implement `ControlValueAccessor`, or the control is null when the binding fires.

**Same error also on:** `/creator` (Chart Creator) — same stack trace pattern.

**Fix approach:** Find the component using `_setUpStandalone` (search for `formControl` bindings in the integrations and creator modules). Add null checks:
```typescript
// Before
[formControl]="myControl"

// Add guard in component
get myControl() {
  return this._myControl || new FormControl();
}
```

---

## BUG-006 — HIGH: Active Directory — `Cannot read properties of undefined (reading 'id')`

**Severity:** High  
**Page:** `/active-directory`  
**Error:**
```
ERROR TypeError: Cannot read properties of undefined (reading 'id')
  at n.deploy (129.c2d165caf7e54895.js:1:161490)
```

**Root cause:** The AD module's `deploy` method accesses `.id` on an object that is `undefined`. Likely a data item from the AD API response that doesn't have the expected structure when the AD module isn't actually configured/active.

**Fix approach:** Add null-safety in the `deploy` method:
```typescript
deploy(item: any) {
  if (!item?.id) { return; }  // guard
  // existing code
}
```

---

## BUG-007 — MEDIUM: Incident "Create" button does not open modal

**Severity:** Medium  
**Page:** `/incident`  
**Finding:** `Create button click did not open modal`

**Root cause:** The `$localize is not defined` error (BUG-001) fires during the Incident module's template rendering. This prevents the modal component from being properly registered, so clicking the create button fails silently.

**Fix:** Fix BUG-001 first — `$localize` polyfill will likely resolve this.

---

## BUG-008 — MEDIUM: Login form — username input type is `email` not `text`

**Severity:** Medium  
**Page:** `/login`  
**Finding:** Username input uses `type="email"` — blocks users entering non-email usernames (e.g., `admin`)

**Impact:** The `admin` username works because browsers submit it regardless, but HTML5 validation marks it as invalid (red border), which is visually misleading. Enterprise SIEM users should be able to log in with a username, not necessarily an email address.

**File:** Find the login component template in `frontend/src/app/shared/components/auth/login/login.component.html`

**Fix:**
```html
<!-- Change -->
<input type="email" class="login-input" placeholder="Username" ...>
<!-- To -->
<input type="text" class="login-input" placeholder="Username" autocomplete="username" ...>
```

---

## BUG-009 — MEDIUM: Empty buttons without accessible labels (multiple pages)

**Severity:** Medium (accessibility)  
**Affected pages:** Incidents, Data Sources  
**Finding:** Buttons with `tooltipclass="utm-tooltip-bottom"` have no text content and no `aria-label`

The button HTML found:
```html
<button type="button" container="body" placement="bottom" tooltipclass="utm-tooltip-bottom">
  <!-- empty — no text, no aria-label -->
</button>
```

**Impact:** Screen readers and automated tests cannot identify these buttons. Tooltip-only buttons need an `aria-label`.

**Fix:** Add `aria-label` to all icon-only buttons:
```html
<button type="button" aria-label="Edit record" [ngbTooltip]="'Edit'" ...>
  <i class="icon-edit"></i>
</button>
```

---

## BUG-010 — MEDIUM: Dashboard custom view `/dashboard/view/1` shows no widgets

**Severity:** Medium  
**Page:** `/dashboard/view/1`  
**Finding:** `No dashboard widgets found` — gridster renders but is empty

**Root cause:** Dashboard ID `1` may not exist in the local dev database, or the dashboard API returned an empty widget list. The page renders the gridster container but with no items. There is also no "Add widget" button visible.

**Fix (UX):** Show an empty-state prompt with a "Add your first widget" CTA when a dashboard has no widgets:
```html
<div *ngIf="widgets.length === 0" class="empty-state">
  <i class="icon-dashboard"></i>
  <p>No widgets yet. <a (click)="openWidgetPicker()">Add your first widget →</a></p>
</div>
```

---

## BUG-011 — LOW: Profile page — no save button detected

**Severity:** Low  
**Page:** `/profile`  
**Finding:** Audit selector `button[type="submit"], .btn-save` found no match

**Likely cause:** The save button uses a custom class or is inside a form with a different submit mechanism. This is a minor audit false-positive but worth verifying manually.

---

## ADDITIONAL ISSUES (Static Code Analysis)

### A1 — `app.component.ts`: Unused imports and dead code

```typescript
import {catchError, delay, distinctUntilChanged, filter, map, takeUntil, tap} from 'rxjs/operators';
// `delay`, `filter`, `takeUntil`, `tap` are imported but not used in the file
```
Also: `online = false` field is declared but never set to `true` anywhere.

### A2 — `ApiServiceCheckerService`: Race condition in `stopChecking()`

`checkApiAvailability()` is called before the `isOnlineApi$` subscriber is set up. If the HTTP response returns synchronously (e.g. in tests), `stopChecking()` is called before `startCheckApiIsOnline()` sets `intervalSub`, causing `intervalSub` to be `undefined`. Fixed in the current code with a null guard, but the underlying logic should be re-ordered:

```typescript
init() {
  // Set up subscriber FIRST
  this.isOnlineApi$.pipe(distinctUntilChanged()).subscribe(...);
  // Then fire HTTP check
  this.checkApiAvailability();
}
```

### A3 — `app.module.ts`: `APP_INITIALIZER` 30s safety timeout

The 30s safety timer is a workaround for BUG-002/003. Once those bugs are fixed, the timer should be reduced to 10s or replaced with proper error handling.

### A4 — `errorhandler.interceptor.ts`: Only handles HTTP 502

```typescript
if (err.status === 502) {
  console.log('UTMStack' + err.status);
}
```
All other HTTP errors (401, 404, 500, 503) are silently swallowed. The interceptor should at minimum emit a toast notification for 5xx errors.

### A5 — `app.component.html`: Spinner text has typos

```html
<p style="color: #DDE6FF">To change this config we nee check yor license, please wait</p>
```
→ "nee" should be "need", "yor" should be "your"

### A6 — Dashboard — Compliance export component

`ComplianceExportComponent` and `ReportExportComponent` are declared in `UtmDashboardModule` (eagerly loaded). These should be lazy-loaded or moved to the compliance module to reduce initial bundle size.

### A7 — `VulnerabilitySharedModule` imported in eagerly-loaded `UtmDashboardModule`

The vulnerability scanner is a **disabled route** (`/vulnerability-scanner` is commented out) but its shared module is still imported in the eagerly loaded dashboard module. This means all vulnerability scanner components are bundled into the initial load even though the feature is disabled.

**Fix:** Remove `VulnerabilitySharedModule` from `dashboard.module.ts`:
```typescript
// Remove this import
import {VulnerabilitySharedModule} from '../vulnerability-scanner/vulnerability-shared/vulnerability-shared.module';
```

### A8 — Login page: `type="email"` on username field (also BUG-008)

File: `src/app/shared/components/auth/login/login.component.html` — change to `type="text"`.

---

## Pages Without Errors (✅ Clean)

| Page | Status |
|---|---|
| `/data` (Alert Management) | ✅ No errors |
| `/soar/automations` | ✅ No errors |
| `/soar/playbooks` | ✅ No errors |
| `/data-parsing` | ✅ No errors |
| `/app-management` | ✅ No errors |
| `/app-management/config` | ✅ No errors |
| `/app-management/api` | ✅ No errors |
| `/threat-intelligence` | ✅ No errors |
| `/variables` | ✅ No errors |
| `/getting-started` | ✅ No errors |
| `/compliance` | ✅ No errors |
| `/profile` | ✅ No errors |

---

## Prioritised Fix Plan

| # | Bug | Severity | Effort | Fixes Also |
|---|---|---|---|---|
| 1 | BUG-001: `$localize is not defined` | Critical | 15 min | BUG-007 (incident modal) |
| 2 | BUG-002: Discover `viewContainerRef` crash | Critical | 1-2h | — |
| 3 | BUG-003: Dashboard 500 on `count-alerts-by-status` | Critical | 1h backend | — |
| 4 | BUG-004: Admin 401 on direct navigation | High | 1h | — |
| 5 | BUG-005: `writeValue` null crash (Integrations, Creator) | High | 1-2h | — |
| 6 | BUG-006: Active Directory `.id` undefined | High | 30min | — |
| 7 | A7: Remove disabled VulnerabilitySharedModule from dashboard | Low | 5 min | Reduces bundle |
| 8 | BUG-008: Login `type="email"` → `type="text"` | Medium | 5 min | — |
| 9 | BUG-009: Empty button aria-labels | Medium | 2h | Accessibility |
| 10 | A4: Error interceptor only handles 502 | Medium | 30min | — |
| 11 | A5: Spinner text typos | Low | 5 min | — |
| 12 | BUG-010: Empty dashboard state/CTA | Low | 1h | UX |

---

## Screenshots Index

All screenshots saved to `.cursor-audit/screenshots/`:

| File | Page |
|---|---|
| `00_login_page.png` | Login |
| `01_dashboard_overview.png` | Dashboard Overview |
| `02_dashboard_custom.png` | Custom Dashboard |
| `03_alerts_list.png` | Alerts List |
| `05_discover_log_analyzer.png` | Log Analyzer / Discover |
| `06_incidents.png` | Incidents |
| `07_soar_home.png` | SOAR Home |
| `10_compliance.png` | Compliance |
| `11_alerting_rules.png` | Alerting Rules |
| `13_integrations.png` | Integrations |
| `20_chart_creator.png` | Chart Creator |
| `21_admin_users.png` | Admin Users |
| `27_dashboard_date_filter.png` | Dashboard Date Filter interaction |
| `28_log_search_input.png` | Log search interaction |
| `29_incident_create_modal.png` | Incident create modal interaction |
| `30_sidebar_collapse.png` | Sidebar collapse interaction |
