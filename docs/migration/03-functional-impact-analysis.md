# 03 — Functional Impact Analysis

> For each upgrade, which application features, screens, and backend areas are affected.

---

## node-sass → sass (dart-sass)

**Impact level:** Low  
**Affected areas:**
- All frontend SCSS compilation (`frontend/src/styles.scss`, `_tokens.scss`, and all component `.scss` files)
- CI/CD frontend build step in `reusable-node.yml`

**What could break:** If any SCSS uses deprecated `@import` that triggers dart-sass warnings. The existing `@import` syntax still compiles in dart-sass (it's deprecated but not removed). No UI changes expected if SCSS compiles correctly.

**UI screens affected:** All screens (if SCSS compilation fails, all styles break)  
**Routes affected:** All  
**API calls affected:** None  
**Backend affected:** None  
**Tests needed:** Full visual regression pass; confirm build output is byte-for-byte equivalent styles

---

## Node.js 14 → 20

**Impact level:** Medium  
**Affected areas:**
- Frontend build process entirely
- `npm install` (some packages may have Node 20 compatibility issues)
- `node-sass` (MUST be replaced before this upgrade)

**What could break:** Any npm package with native bindings (`node-gyp`) will fail. The `node-sass@4` is the primary blocker.

**UI screens affected:** All (build-time change)  
**Routes affected:** None (runtime-only frontend)  
**API calls affected:** None  
**Backend affected:** None  
**Tests needed:** Full build, lint, and unit test pass on Node 20

---

## Angular 7 → 17

**Impact level:** Very High  
**Affected areas (all UI modules):**

| Module | Impact |
|---|---|
| Auth/Login | `AuthInterceptor`, `AuthExpiredInterceptor`, route guards — API changes |
| Dashboard | `ngx-echarts` version change; gridster2 compatibility |
| Alert management | All `data-management/` components; alert service, filter components |
| Log analyzer | Monaco editor integration; OpenSearch query components |
| Incident management | SOAR playbook builder; incident status components |
| Compliance | Report scheduling; PDF preview |
| Rule management | YAML rule editor; correlation rule forms |
| Admin/User management | User CRUD forms; permission management |
| Integration guides | Guide step components; syslog/agent install instructions |
| Getting started | Wizard component |
| Real-time notifications | WebSocket STOMP integration |

**Specific breaking areas:**
- **Lazy loading syntax:** All `loadChildren: './module#Class'` strings must become arrow function imports (migration schematic handles this)
- **@angular/forms:** Typed forms in v14+ — form controls now typed; existing `FormControl` usages may need type annotations
- **ViewChild/ContentChild:** `static` flag semantics changed
- **RxJS interop:** Observable pipe-only pattern (v7 RxJS); `toPromise()` removed
- **TS strict mode:** TypeScript 5 strict mode will expose latent type errors
- **ngx-echarts upgrade:** v4 → v8+ requires chart option API changes
- **ng-bootstrap upgrade:** 4→14 has breaking API changes in modal, popover, tooltip components
- **ngx-webstorage:** API changes in v4+
- **@ng-select:** v2 → v12 has breaking configuration API changes

**Routes affected:** All lazy-loaded routes  
**API calls affected:** None (HTTP client API is stable)  
**Backend affected:** None  
**Authentication flow:** Guards (`UserRouteAccessService`) — minor refactoring to modern guard pattern  
**Tests needed:** Full Karma unit test pass; manual E2E on all 18 active routes

---

## Spring Boot 3.1.5 → 3.3.x (backend)

**Impact level:** Medium  
**Affected areas:**
- Auto-configuration classes — some deprecated in 3.2, removed in 3.3
- Spring Security configuration (`SecurityConfiguration.java`) — minor API method deprecations
- `WebSecurityConfigurerAdapter` — DEPRECATED in Spring Security 5.7, REMOVED in 6.x (Boot 3.x)

**Critical:** `SecurityConfiguration extends WebSecurityConfigurerAdapter` is already using deprecated API that is removed in Spring Boot 3.x/Spring Security 6. This is the **single most important breaking change** in the backend upgrade.

**What could break:**
- `SecurityConfiguration.java` — must be rewritten to use `SecurityFilterChain` bean pattern (not `WebSecurityConfigurerAdapter`)
- Any custom `configure(HttpSecurity http)` override patterns
- `@EnableGlobalMethodSecurity` → replaced by `@EnableMethodSecurity` in Spring Security 6

**UI screens affected:** All (auth flow changes)  
**Routes affected:** Auth routes, all protected routes  
**API calls affected:** All authenticated endpoints  
**RBAC affected:** Yes — security configuration rewrite  
**Backend affected:** `SecurityConfiguration.java`, any security-adjacent config  
**Tests needed:** Full auth flow test; RBAC verification; all authenticated endpoint smoke tests

---

## Hibernate 5.4.32 → 6.4.x

**Impact level:** High  
**Affected areas:**
- All JPA entity classes (`domain/` packages — 30+ entities)
- All JPQL/HQL queries across services
- All Spring Data JPA repository methods
- `@OneToMany`, `@ManyToMany` join fetch queries

**What could break:**
- HQL syntax: `from Entity e` → requires `select e from Entity e` in strict mode
- `@ElementCollection` behavior changes
- Criteria API method name changes
- `@Formula` annotation behavior changes
- Implicit join paths in JPQL may become strict

**SIEM-specific risk:** Alert queries, correlation rule queries, incident history queries — any JPQL that uses implicit joins.

**UI screens affected:** All data-fetching screens (alerts, incidents, dashboards, compliance, rules)  
**API calls affected:** All paginated and search endpoints  
**Database affected:** Schema unchanged; query behavior may differ  
**Tests needed:** Full query regression; compare query output before/after; pagination tests

---

## Spring Boot 2.7.14 → 3.3.x (user-auditor, web-pdf)

**Impact level:** High  
**Affected areas (user-auditor):**
- All `javax.*` imports → `jakarta.*` (massive find/replace across all Java files)
- Spring Security configuration (same WebSecurityConfigurerAdapter issue as main backend)
- Any Hibernate 5-specific ORM code

**Affected areas (web-pdf):**
- `javax.*` → `jakarta.*`
- Selenium 4.5 → 4.20 compatibility with headless Chrome in the new JVM
- Any Spring MVC annotation that changed namespace

**What could break:**
- User session auditing write path — if `jakarta.*` migration is incomplete, service won't start
- PDF rendering — Selenium with newer Chrome may render reports differently

**Audit trail affected:** Yes (user-auditor is the audit trail service)  
**Tests needed:** User login/logout generates audit records; audit query returns correct results; PDF generation test on all report templates

---

## ECharts 4.4 → 5.5

**Impact level:** Medium  
**Affected areas:**
- All dashboard visualizations (bar, line, pie, gauge, heatmap, scatter, word cloud, 3D)
- Geographic map visualizations (Leaflet integration)
- Chart builder (`graphic-builder/` module)
- All predefined charts in `defined-charts/`
- `utm-color.const.ts` — ECharts 5 palette API changes

**What could break:**
- Some chart option keys were renamed or restructured in ECharts 5
- `echarts-gl` v1 is not compatible with echarts v5 — must upgrade `echarts-gl` to v2+
- `echarts-leaflet` compatibility with ECharts 5 must be verified
- `echarts-wordcloud` v1 must be upgraded to v2

**UI screens affected:** Dashboard overview, all custom dashboards, visualization builder, geographic views  
**Tests needed:** Visual pass on every chart type; verify all dashboard widgets render correctly

---

## Bootstrap 4 → 5

**Impact level:** Medium  
**Affected areas:**
- All component templates that use Bootstrap classes
- All modal usage (Bootstrap 5 modal API changed)
- All dropdown usage
- All form control classes (`form-group` removed in v5)
- `jquery` and `popper.js` must be removed (Bootstrap 5 is vanilla JS)

**What could break:**
- `form-group` class is removed in Bootstrap 5 — all forms need updating
- Some utility class names changed (`ml-*`, `mr-*` → `ms-*`, `me-*`)
- Data attributes changed (`data-toggle` → `data-bs-toggle`, etc.)
- Any `$('.modal').modal()` jQuery patterns must become Bootstrap 5 JS API

**UI screens affected:** All (Bootstrap is the global CSS framework)  
**Components affected:** All forms, modals, dropdowns, tooltips, popovers  
**Tests needed:** Full visual regression on all major screens; form submission flows; modal open/close

---

## TSLint → ESLint

**Impact level:** Low  
**Affected areas:**
- `frontend/tslint.json` → replaced by `.eslintrc.json` + `angular-eslint.json`
- `angular.json` lint builder: `@angular-devkit/build-angular:tslint` → `@angular-eslint/builder:lint`
- CI lint step in `reusable-node.yml`

**What could break:** Some TSLint rules have no direct ESLint equivalent; existing lint warnings may increase or decrease in number.

**Tests needed:** `npm run lint` passes with no blocking errors

---

## gRPC Backend 1.65.1 → 1.67.x

**Impact level:** Low  
**Affected areas:**
- `GrpcConfiguration.java` channel configuration
- Agent manager communication
- Event processor HTTP communication

**What could break:** None expected; minor version bump.

**SIEM-critical paths:** Agent registration, SOAR command dispatch, log ingestion  
**Tests needed:** Agent connects and streams logs successfully after upgrade; SOAR command round-trip test

---

## Remove elasticsearch-rest-high-level-client

**Impact level:** Medium  
**Affected areas:**
- Any backend service still importing `org.elasticsearch.client.*`
- Any code that instantiates `RestHighLevelClient` directly

**What could break:** Compile errors if any remaining usages exist; needs full code search.

**Tests needed:** Full backend compile; all OpenSearch query endpoints return correct results

---

## Impact Summary by SIEM Function

| SIEM Function | Affected by |
|---|---|
| Log ingestion pipeline | gRPC upgrade (minor) |
| Detection/correlation | Hibernate upgrade (query behavior), Spring Boot upgrade |
| Alert generation | Hibernate upgrade, Spring Boot upgrade |
| Alert triage UI | Angular upgrade, ECharts upgrade, Bootstrap upgrade |
| Incident management | Angular upgrade, Spring Boot upgrade |
| SOAR execution | Spring Boot upgrade (security config), gRPC upgrade |
| Compliance reports | Angular upgrade, user-auditor Spring Boot upgrade, web-pdf Spring Boot upgrade |
| Log analyzer | Angular upgrade, Monaco Editor upgrade |
| Dashboard/visualization | Angular upgrade, ECharts upgrade |
| Authentication | **Spring Boot 3.x security config rewrite** (HIGH risk) |
| RBAC | **Spring Boot 3.x security config rewrite** (HIGH risk) |
| User audit trail | user-auditor Spring Boot 2.7→3.3 upgrade |
| PDF reports | web-pdf Spring Boot upgrade, Selenium upgrade |
| Real-time notifications | Angular upgrade (STOMP/WebSocket integration) |
