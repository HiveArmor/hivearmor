# 17 — Implementation Roadmap
## HiveArmor frontend-v3

**Audit date:** 2026-07-26
**Author:** Phase 2 audit
**Evidence base:** Documents 01–15 (Phase 1 audit), backend resource inventory (doc 06), missing feature register (doc 14), contradiction register (doc 15)

> Every item references specific audit findings. This is not a generic phase list — each horizon is grounded in evidence.

---

## Horizon Overview

| Horizon | Name | Focus | Prerequisite |
|---|---|---|---|
| H0 | Safety and Baseline | Fix all P0 security gaps; stabilise test infrastructure | None |
| H1 | Foundation and Shell | Performance, accessibility, toast, route corrections | H0 complete |
| H2 | Core SOC Workflows | Alert triage, incident management, search, investigations | H1 complete |
| H3 | Detection, Response, and Intelligence | Rules editor, SOAR, threat intel | H2 complete |
| H4 | Posture, Dashboards, Reports, Administration | Dashboard studio, reports, compliance, admin | H3 (partial) |
| H5 | Parser Intelligence | Parser health, drift, AI, deployment governance | H4 (partial) |
| H6 | MSSP and Multi-Tenancy | Full tenant isolation across all layers | H0 + architecture decision |

---

## Horizon 0 — Safety and Baseline

**Objective:** Make the system safe to deploy. No other horizon can ship while P0 security gaps are open.

**Evidence basis:** BE-01 through BE-12, DEBT-14, SEC-GAP-01 through SEC-GAP-18 (doc 07), CONTRADICTION-06 (doc 15), TI-01 (doc 14).

### H0-SEC-01: Add `@PreAuthorize` to Alert Mutation Endpoints (BE-01)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java`
- **Endpoints:** `POST /api/ha-alerts/status`, `POST /api/ha-alerts/notes`, `POST /api/ha-alerts/tags`, `POST /api/ha-alerts/convert-to-incident`
- **Required annotation:** `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")`
- **Risk:** Any authenticated user (including read-only) can mutate alert state, add tags, and convert alerts to incidents

### H0-SEC-02: Add `@PreAuthorize` to Role/Authority Endpoints (BE-02)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/AuthorityResource.java`
- **Endpoints:** `GET /api/authority`, `POST /api/authority`, `PUT /api/authority`, `DELETE /api/authority/{name}`
- **Required annotation:** `@PreAuthorize("hasRole('ADMIN')")`
- **Risk:** Any authenticated user can create, modify, or delete roles — privilege escalation path

### H0-SEC-03: Remove `clientPass` from Client Response DTO (BE-03)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/UtmClientResource.java` + client DTO
- **Fix:** Remove `clientPass` field from `UtmClientDTO.java` response serialisation
- **Risk:** Password exposed to every user who calls `GET /api/ha-clients` (plaintext credential leakage — SEC-GAP-03)

### H0-SEC-04: Fix Groovy Injection in Offense Resource (BE-05)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/OffenseResource.java`
- **Fix:** Replace Groovy script execution with a restricted CEL-based evaluator; add `@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")`
- **Risk:** RCE via crafted PUT body (SEC-GAP-05). This is the most critical vulnerability in the codebase.

### H0-SEC-05: Fix DEBT-14 — Persistent JWT Signing Key (BE-06)
- **Java file:** `backend/src/main/java/com/hivearmor/security/jwt/JwtKeyService.java`
- **Fix:** Read signing key from `JWT_SECRET` env var (min 256-bit); fall back to database-persisted key; never generate randomly at startup
- **Risk:** Every backend restart invalidates all user sessions — operationally unacceptable in production; analysts lose work during incidents

### H0-SEC-06: Add `@PreAuthorize` to Incident CRUD (BE-07)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/UtmIncidentResource.java` (or equivalent)
- **Required annotation:** `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")`
- **Risk:** Any authenticated user can create, modify, and delete incidents (SEC-GAP-17)

### H0-SEC-07: Add `@PreAuthorize` to Visualizations Run (BE-12)
- **Java file:** `backend/src/main/java/com/hivearmor/web/rest/VisualizationsResource.java`
- **Endpoints:** `POST /api/ha-visualizations/run`
- **Required annotation:** `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")`
- **Context:** Frontend gates this with `GAP_SEC_06_RESOLVED = false` (CONTRADICTION-09) — but backend is fully open to direct API calls
- **After fix:** Set `GAP_SEC_06_RESOLVED = true` in `DashboardViewPage.tsx`

### H0-SEC-08: Add `@PreAuthorize` to Notification/EDR/SOAR/Correlation Endpoints (BE-08, BE-10, BE-11)
- **Files:** `UtmNotificationResource.java`, `CorrelationRuleResource.java`, `SoarPlaybookResource.java`
- **Required annotations:**
  - Notifications: `@PreAuthorize("hasRole('ADMIN')")`
  - Correlation rules: `@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")`
  - SOAR playbooks: `@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")`

### H0-FE-01: Convert 26 `.skip.ts` Test Files to Vitest (TI-01, CONTRADICTION-06)
- **Files:** `IncidentDetailPage.skip.ts`, `incidents.service.skip.ts`, `alerts.service.skip.ts` + 23 others
- **Fix:** Rename to `.test.ts`; replace `import { describe, it } from 'node:test'` with `import { describe, it, expect } from 'vitest'`; replace `assert.ok()` with `expect().toBeTruthy()`
- **Note:** `readFileSync` structural tests in `incidents.service.skip.ts` must be rewritten as proper service tests with mocked `apiClient`
- **After fix:** CI will discover and run these previously-dead tests

### H0-FE-02: Add Route Guards and Visible Stub State (CONTRADICTION-02)
- **Fix:** For all 26 routes that currently render `.skip.ts` stubs, mount an `<EngineeringNotice>` or "Coming Soon" component visible to users — prevents confusion when a route URL is reachable but non-functional
- **Note:** This is UX hygiene, not implementation. Do not activate features in this batch.

**Horizon 0 Complexity:** L  
**Team:** Backend (3 engineers), Frontend (1 engineer)  
**Rollback:** All changes are additive annotations. Rolling back a `@PreAuthorize` restores the previous (open) behaviour — acceptable rollback path.  
**Prerequisites:** None — this is the starting point.

---

## Horizon 1 — Foundation and Shell

**Objective:** Establish the performance, accessibility, and test infrastructure baseline. All subsequent feature work builds on this.

**Evidence basis:** PERF-01 (doc 12), A11Y-01 (doc 12), A11Y-03 (doc 12), CONTRADICTION-03 (doc 15), FE-13, FE-14, FE-15, TI-02 through TI-04 (doc 14).

### H1-PERF-01: Route Code Splitting — Lazy Imports (FE-15, PERF-01)
- **Fix:** Wrap all 50+ page components in `React.lazy()` + `<Suspense>`. Add route-level `ErrorBoundary`.
- **Files:** `router/index.tsx` (all page imports), plus a new `AppSuspenseFallback.tsx`
- **Impact:** Initial bundle drops from 4.1 MB → estimated < 500 KB

### H1-FND-01: Toast/AlertGroup Integration (CONTRADICTION-03)
- **Fix:** Mount `<ToastStack>` in `AppLayout.tsx`; wire to `toastStore` Zustand store; use PatternFly `AlertGroup` for rendering
- **Files:** `AppLayout.tsx`, `components/toast/ToastStack.tsx`
- **Impact:** All `toast.ts` calls that silently drop notifications will now render visibly

### H1-A11Y-01: Skip Navigation Link (FE-13, A11Y-01)
- **Fix:** Add `<a href="#main-content" className="skip-nav">Skip to main content</a>` as first element in `AppLayout.tsx`; add `id="main-content"` to main content wrapper
- **WCAG:** 2.4.1 Bypass Blocks (Level A)

### H1-A11Y-02: Chart Aria Labels (FE-14, A11Y-03)
- **Fix:** Add `aria-label` prop to `HaChart.tsx`; propagate to all `<HaChart>` usages in `CommandCenterPage.tsx` and other pages
- **WCAG:** 1.1.1 Non-Text Content (Level A)

### H1-TEST-01: Storybook Setup (TI-02)
- **Install:** `@storybook/react-vite`, decorators for tokens.css, PatternFly globals
- **Stories:** All 20+ `Ha*` wrapper components with variant stories; `SiemDataGrid` with mock data
- **Note:** No source modification; Storybook reads existing components

### H1-TEST-02: Playwright Setup (TI-03)
- **Install:** `@playwright/test`; define 5 critical E2E journeys: login, alert triage, incident creation, search, rule activation
- **Config:** `playwright.config.ts`; CI job in `.github/workflows/`

### H1-TEST-03: axe-core Integration (TI-04)
- **Install:** `@axe-core/playwright` for E2E; `axe-core` + `vitest-axe` for component tests
- **Smoke test:** Every page-level Vitest test and every Playwright page visit runs axe analysis

### H1-ROUTE-01: Fix 4 Spec Route Path Mismatches
- **Fixes:**
  - `/alerts/board` → spec says this; actual is `/alerts/severity` — update router or spec (DEC-05 decision required)
  - `/search` → actual is `/hunt` — update router or spec
  - `/correlated-findings` → actual is `/offenses` — update router or spec
  - `/detection-rules` → actual is `/rules` — update router or spec
- **Note:** Route changes require updating HaNavigation links, breadcrumbs, and any internal `navigate()` calls

**Horizon 1 Complexity:** M  
**Team:** Frontend (2 engineers), QA (1)  
**Prerequisites:** H0 complete (security gaps must be fixed first)  
**Rollback:** Additive. Lazy loading has a Suspense fallback; removing `React.lazy()` restores eager loading.

---

## Horizon 2 — Core SOC Workflows

**Objective:** Activate the primary analyst workflows. Most are currently in `.skip.ts` stubs.

**Evidence basis:** FE-01 through FE-12, FE-09, FS-08, FE-26 (doc 14).

### H2-SEARCH-01: Activate SearchHuntPage (FS-08, CONTRADICTION-10)
- **Files to create:** `src/pages/search/SearchHuntPage.tsx`
- **Remove:** `SearchHuntPage.skip.ts`
- **Components:** Monaco query editor, results SiemDataGrid, histogram ECharts chart
- **Backend dependency:** New histogram aggregation endpoint (`GET /api/ha-search/histogram`) — FULL_STACK_DEVELOPMENT_REQUIRED
- **Reuse:** Existing `SavedQueriesPanel` service layer (FE-09), `POST /api/ha-search/nl-query` for NL mode

### H2-INCIDENT-01: Activate IncidentDetailPage (FE-01 through FE-05, CONTRADICTION-06)
- **Files to create/activate:** `src/pages/incidents/IncidentDetailPage.tsx`
- **Remove:** `IncidentDetailPage.skip.ts`
- **Components:** Evidence panel (FE-01), evidence board (FE-02), evidence relationships graph (FE-03), AI summary block (FE-04), incident timeline panel (FE-05)
- **Backend:** All incident endpoints confirmed protected (VERIFIED PROTECTED per doc 14)

### H2-FINDING-01: Activate CorrelatedFindingsPage (route `/offenses`)
- **Files to create/activate:** `src/pages/correlated-findings/CorrelatedFindingsPage.tsx`
- **Prerequisite:** H0-SEC-04 (Groovy injection fix + `@PreAuthorize` on `/api/offenses/{id}`)

### H2-EVIDENCE-01: Evidence Board Persistence and Chain of Custody
- **Files:** `src/pages/incidents/components/EvidenceBoard.tsx`, evidence service
- **Backend:** `GET/POST/PUT/DELETE /api/ha-incidents/{incidentId}/evidence-items` (all VERIFIED PROTECTED)

### H2-INVEST-01: Investigation Session Workflows (FE-06 through FE-08)
- **Components:** `StartInvestigationDialog`, session items panel, `ConvertSessionToIncidentButton`
- **Backend:** `POST /api/ha-investigation-sessions/{id}/convert-to-incident` (VERIFIED PROTECTED)

### H2-AI-01: SOC AI Chat Drawer (FE-10, FE-11)
- **Files:** `src/components/soc-ai/SocAiChatDrawer.tsx`
- **Backend:** `POST /api/ha-ai/chat` (SSE), `POST /api/ha-soc-ai/query`
- **Wire:** `AppLayout.tsx` global drawer trigger; `AlertContextDrawer` AI enrichment button

**Horizon 2 Complexity:** XL  
**Team:** Frontend (3–4 engineers)  
**Prerequisites:** H1 complete  
**Rollback:** Each feature is additive. Skip files can be restored if implementation regressions discovered.

---

## Horizon 3 — Detection, Response, and Intelligence

**Objective:** Activate the detection and response layer — core differentiator for enterprise SIEM.

**Evidence basis:** FE-12, FE-24, CONTRADICTION-07 (DashboardStudio), doc 11 (Parser Intelligence partial).

### H3-DETECT-01: Detection Rules Editor Activation
- **Remove:** detection-rules-related `.skip.ts` files
- **Components:** Monaco rule editor, MITRE ATT&CK mapping panel, rule test runner
- **Backend:** `GET/POST/PUT/DELETE /api/correlation-rule/*` (after H0-SEC-08 fix), `POST /api/correlation-rule/test`
- **Sigma sync:** `SigmaSyncPanel` (FE-12) with `POST /api/ha-sigma-sync/trigger`

### H3-RESPONSE-01: SOAR Playbook Builder Activation
- **Files:** `src/pages/response/PlaybookBuilderPage.tsx` (partial implementation exists using ReactFlow)
- **Prerequisite:** H0-SEC-08 (`@PreAuthorize` on SOAR endpoints)
- **Components:** ReactFlow canvas, `ActionPalette` with `SOAR_ACTION_CATALOGUE`, approval gate nodes, delete action (FE-24)

### H3-INTEL-01: MITRE ATT&CK Heatmap Frontend
- **Files:** New `src/pages/detection/MitreCoverageHeatmapPage.tsx`
- **Backend:** `GET /api/mitre/coverage`, `GET /api/mitre/rules` (after BE-09 auth fix)
- **Component:** ECharts heatmap or D3 canvas

### H3-INTEL-02: Hive Intelligence Full Implementation
- **Files:** `src/pages/intelligence/HiveIntelligencePage.tsx` (partial — fix rgba() violations first)
- **Backend:** `GET /api/ha-threat-intel/feeds`, `POST /api/ha-threat-intel/lookup`, `GET /api/ha-threat-intel/iocs`
- **Design fix:** Replace `rgba(50,214,197,0.15)` → `color-mix()` (DESIGN-02 violation)

### H3-CONST-01: Threat Constellation Neo4j Backend Integration
- **Files:** `src/pages/constellation/ThreatConstellationPage.tsx` (exists, using ReactFlow)
- **Backend:** `GET /api/ha-graph/nodes`, `GET /api/ha-graph/edges`
- **Blocker:** DEC-08 (Neo4j schema definition must be approved before frontend can model the data)

**Horizon 3 Complexity:** XL  
**Team:** Frontend (2–3), Backend (1 for MITRE fix)  
**Prerequisites:** H2 complete

---

## Horizon 4 — Posture, Dashboards, Reports, Administration

**Objective:** Complete the supporting platform layers.

**Evidence basis:** DASH-03, DASH-05, DASH-06 (doc 08), FS-04 through FS-06 (doc 14), doc 12 for compliance detail.

### H4-DASH-01: Dashboard Studio Activation (DASH-03, CONTRADICTION-07)
- **Files to create:** `src/pages/dashboards/DashboardStudioPage.tsx`, `src/pages/dashboards/DashboardStudioRenderers.tsx`
- **Note:** No active `.tsx` counterpart exists — this is a new build, not an activation
- **Remove:** `DashboardStudioPage.skip.ts`, `DashboardStudioRenderers.skip.ts`
- **Backend:** `POST /api/ha-dashboards`, `PUT /api/ha-dashboards` (after GAP-SEC-12 fix)
- **Prerequisite:** `GAP_SEC_06_RESOLVED = true` (H0-SEC-07)

### H4-REPORT-01: Report Generation Activation (FS-04, FS-05, FS-06)
- **Files:** `SitrepReportPage.tsx`, `IncidentReportsPage.tsx`, `AfterActionReportsPage.tsx`
- **Backend:** All three report generation endpoints are FULL_STACK_DEVELOPMENT_REQUIRED — backend must be built first
- **Output:** PDF (DEC-11 decision on additional formats)

### H4-POSTURE-01: Vulnerability Management (FS-02)
- **Files:** `VulnerabilitiesPage.tsx` (`.skip.ts` → full implementation)
- **Backend:** FULL_STACK_DEVELOPMENT_REQUIRED — `VulnerabilityResource.java` must be built

### H4-POSTURE-02: Compliance Framework Detail Views
- **Backend-ready:** `ComplianceFrameworkScoreResource.java` exists
- **Frontend:** Build framework detail view pages; wire `GET /api/compliance/standard-section`

### H4-ADMIN-01: Audit Log Export (BACKEND_READY_UI_MISSING)
- **Backend-ready:** `HaAuditLogResource.java` confirmed
- **Frontend:** Wire audit log export button (note: `GET /api/ha-audit-log/export` does NOT exist per API map — use pagination instead)

### H4-ADMIN-02: SSO Login Page Frontend (AUTH-03)
- **Files:** Add SSO redirect entry point to `LoginPage.tsx` or create `/login?sso=<provider>` route
- **Prerequisite:** SEC-GAP-11 fix (IdP endpoint protected) + DEC-03 (session design)
- **Backend-ready:** `GET /api/ha-sso/redirect` exists after SEC-GAP-11 fix

**Horizon 4 Complexity:** XL  
**Team:** Frontend (3), Backend (2 for new report endpoints)  
**Prerequisites:** H3 (partial), H0 security fixes complete

---

## Horizon 5 — Parser Intelligence

**Objective:** Build the advanced parser lifecycle management system. All features are FULL_STACK_DEVELOPMENT_REQUIRED.

**Evidence basis:** Doc 11 (Parser Intelligence audit) — FS-13 through FS-16 (doc 14).

### H5-PARSER-01: Parser Health Dashboard (FS-13)
- **Backend:** Build `GET /api/ha-parsers/{id}/health` endpoint
- **Frontend:** Parser health panel in admin section

### H5-PARSER-02: Unparsed Event Clustering and Drift Detection (FS-14)
- **Backend:** Event processor must add drift detection logic + expose via API
- **Frontend:** Build alert surface UI for drift notifications

### H5-PARSER-03: AI-Generated Draft Parsers (FS-15)
- **Backend:** Build AI parser generation endpoint (SOC AI infrastructure required)
- **Frontend:** Build draft parser workflow with review/approve/reject UI
- **Security note:** DEC-07 (Parser DSL security decision) must be made before implementation — AI-generated code execution is a critical risk

### H5-PARSER-04: Shadow/Canary/Promote/Rollback Pipeline (FS-16)
- **Backend:** Event processor deployment governance API
- **Frontend:** `ParserDeploymentLifecyclePage.tsx`

**Horizon 5 Complexity:** XL (estimated 8–12 sessions)  
**Team:** Go backend (2), Frontend (2), ML/AI (1)  
**Prerequisites:** H4 complete; DEC-07 approved

---

## Horizon 6 — MSSP and Multi-Tenancy

**Objective:** Full tenant isolation across all data layers. This is a separate workstream estimated at ~21 sessions.

**Evidence basis:** FS-01, FS-17, TENANT-01 through TENANT-07 (doc 02), doc 07 section 5.

### H6-TENANT-01: PostgreSQL Row-Level Security per Tenant
- **Files:** New Liquibase changesets for `tenant_id` column on 12+ tables; `TenantFilter.java` Spring component
- **Scope:** `UtmAlert`, `UtmIncident`, `UtmDashboard`, `UtmVisualization`, `UtmReport`, `HaInvestigationSession`, `UtmCorrelationRule`, `SoarPlaybook`, `UtmNotificationRule`, `HaEntity`, and 2+ more

### H6-TENANT-02: OpenSearch Per-Tenant Index Routing
- **Files:** All OpenSearch query builders must inject `must: {term: {tenant_id: X}}`
- **Scope:** Every search/aggregation/SSE feed in event processor and backend

### H6-TENANT-03: SSE Stream Isolation per Tenant
- **Files:** `AlertSseResource.java`, `LiveEpsResource.java` — filter events by tenant before emitting
- **Frontend:** No changes needed once backend filters correctly

### H6-TENANT-04: Neo4j Namespace Isolation
- **Scope:** All graph queries must be namespaced by tenant prefix

### H6-TENANT-05: Cache Partitioning
- **Scope:** Spring Cache keys must include tenant ID

### H6-FE-01: Masthead Tenant Selector (TENANT-02, FS-17)
- **Files:** `HaMasthead.tsx` — add tenant dropdown; wire to `auth.store.setSelectedTenant()`
- **Frontend prerequisite FE-26:** `setSelectedTenant()` must call `queryClient.clear()` (cache invalidation)
- **Backend prerequisite:** User-tenant association API must exist (H6-TENANT-01)

### H6-FE-02: All-Tenant Mode with Purple Masthead (TENANT-03)
- **Files:** `HaMasthead.tsx` variant; `auth.store` `CROSS_TENANT_READ` permission
- **Backend:** New `CROSS_TENANT_READ` authority

**Horizon 6 Complexity:** XL × XL (21 sessions estimate)  
**Team:** Backend (3), Frontend (2), DBA (1), Architecture lead (1)  
**Prerequisites:** H0 (security fixes); DEC-02 (tenant architecture decision — blocking)  
**Critical:** Must NOT begin H6 implementation before DEC-02 is approved and architecture is finalised. Wrong tenant architecture choice requires complete rebuild.

---

## Cross-Horizon Dependencies

```
H0 → H1 → H2 → H3 → H4 → H5
             ↘
              H6 (parallel track, own timeline)
```

H6 must be treated as a separate programme of work with its own programme manager, not a sprint item within the main delivery track.

---

## Horizon Complexity Estimates

| Horizon | Complexity | Sessions Estimate | Team Size |
|---|---|---|---|
| H0 | L | 2–3 | Backend 3, FE 1 |
| H1 | M | 3–4 | FE 2, QA 1 |
| H2 | XL | 10–14 | FE 3–4 |
| H3 | XL | 8–10 | FE 2–3, BE 1 |
| H4 | XL | 8–12 | FE 3, BE 2 |
| H5 | XL | 8–12 | Go BE 2, FE 2, ML 1 |
| H6 | XL×XL | ~21 | BE 3, FE 2, DBA 1 |
| **Total** | | **~60–76 sessions** | |
