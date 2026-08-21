# 18 — Batch Plan and Dependency Map
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit  
**Purpose:** Break each roadmap horizon into independently reviewable batches.

---

## BATCH H0-SEC-01: Add @PreAuthorize to Critical Alert Endpoints

**Objective:** Protect all alert-mutation endpoints from unauthenticated role escalation.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-01, SEC-GAP-01  
**Preconditions:** None  
**Files expected to be created:** None  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java`  
**Backend dependency:** Add `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN','THREAT_HUNTER')")` to `updateAlertStatus`, `addNote`, `addTag`, `convertToIncident` methods  
**Database/search dependency:** None  
**Security considerations:** Without this fix any authenticated user (ROLE_USER) can mutate alert state  
**Tenant considerations:** None at this stage  
**Accessibility considerations:** None  
**Unit tests:** Add `UtmAlertResourceSecurityTest.java` asserting 403 for ROLE_USER on mutations  
**Integration tests:** None  
**E2E tests:** None  
**Storybook stories:** None  
**Acceptance criteria:**  
1. `POST /api/ha-alerts/status` returns 403 for ROLE_USER  
2. `POST /api/ha-alerts/notes` returns 403 for ROLE_USER  
3. `POST /api/ha-alerts/tags` returns 403 for ROLE_USER  
4. `POST /api/ha-alerts/convert-to-incident` returns 403 for ROLE_USER  
5. All four endpoints return 200 for ROLE_ANALYST  
**Rollback:** Remove `@PreAuthorize` annotations — restores previous open behaviour  
**Estimated complexity:** S  
**Parallel work allowed:** Yes (independent of all other H0 batches)

---

## BATCH H0-SEC-02: Add @PreAuthorize to Authority/Role Endpoints

**Objective:** Prevent privilege escalation through unprotected role management endpoints.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-02, SEC-GAP-02  
**Preconditions:** None  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/web/rest/AuthorityResource.java`  
**Backend dependency:** Add `@PreAuthorize("hasRole('ADMIN')")` to all CRUD methods  
**Security considerations:** CRITICAL — any user can currently create ROLE_ADMIN and escalate  
**Unit tests:** Add `AuthorityResourceSecurityTest.java` asserting 403 for ROLE_USER  
**Acceptance criteria:**  
1. `POST /api/authority` returns 403 for all non-ADMIN roles  
2. `DELETE /api/authority/{name}` returns 403 for all non-ADMIN roles  
3. `GET /api/authority` returns 200 for ROLE_ADMIN  
**Rollback:** Remove annotations  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-SEC-03: Remove clientPass from UtmClientResource Response

**Objective:** Eliminate plaintext credential exposure from client API response.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-03, SEC-GAP-03  
**Preconditions:** None  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/service/dto/UtmClientDTO.java` — remove `clientPass` field  
- `backend/src/main/java/com/hivearmor/web/rest/UtmClientResource.java` — verify no leak  
**Security considerations:** CRITICAL — plaintext password in API response  
**Unit tests:** `UtmClientResourceTest.java` asserting `clientPass` absent from JSON response  
**Acceptance criteria:**  
1. `GET /api/ha-clients` response JSON does not contain `clientPass` key  
2. `GET /api/ha-clients/{id}` response JSON does not contain `clientPass` key  
**Rollback:** Restore `clientPass` field to DTO (not recommended — only for emergency rollback)  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-SEC-04: Fix Groovy Injection in OffenseResource

**Objective:** Eliminate RCE vulnerability in offense status update endpoint.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-05, SEC-GAP-05  
**Preconditions:** Architecture decision on replacement evaluator (CEL vs restricted DSL)  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/web/rest/OffenseResource.java`  
- Remove Groovy dependency from `pom.xml` if exclusively used here  
**Backend dependency:** Add `@PreAuthorize("hasAnyRole('SOC_MANAGER','ADMIN')")` to offense PUT endpoint  
**Security considerations:** CRITICAL — Groovy execution allows arbitrary JVM code execution  
**Unit tests:** Test that CEL evaluator rejects system-call expressions  
**Acceptance criteria:**  
1. `PUT /api/offenses/{id}` returns 403 for ROLE_USER  
2. Groovy expression in request body is rejected with 400  
3. Valid CEL expression evaluates correctly  
**Rollback:** Restore Groovy evaluator + revert `@PreAuthorize`  
**Estimated complexity:** M  
**Parallel work allowed:** No — requires architecture agreement first

---

## BATCH H0-SEC-05: Fix DEBT-14 — Persistent JWT Signing Key

**Objective:** Prevent all user sessions being invalidated on every backend restart.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-06, DEBT-14, AUTH-09  
**Preconditions:** `JWT_SECRET` environment variable defined in all deployment environments (min 256-bit base64)  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/security/jwt/JwtKeyService.java`  
- `local-dev/.env.example` — add `JWT_SECRET=` entry  
- `local-dev/.env` — add `JWT_SECRET` value  
**Backend dependency:** Spring `@Value("${app.jwt-secret}")` or env var fallback to DB-persisted key  
**Security considerations:** Key must be stored securely; never commit actual key value  
**Unit tests:** Test that service uses env key rather than generating random  
**Acceptance criteria:**  
1. Backend restart does not invalidate existing valid JWT tokens  
2. Tokens signed before restart are accepted after restart  
3. `JWT_SECRET` missing → application refuses to start with clear error  
**Rollback:** Set env var to empty to trigger regeneration mode (temporary emergency only)  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-SEC-06: Add @PreAuthorize to Incident CRUD

**Objective:** Prevent unauthenticated users from manipulating incident records.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-07, SEC-GAP-17  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/web/rest/UtmIncidentResource.java`  
**Backend dependency:** `@PreAuthorize("hasAnyRole('ANALYST','SOC_MANAGER','ADMIN')")` on all CRUD methods  
**Acceptance criteria:**  
1. `POST /api/ha-incidents` returns 403 for ROLE_USER  
2. `PUT /api/ha-incidents/change-status` returns 403 for ROLE_USER  
3. All incident endpoints return 200 for ROLE_ANALYST  
**Rollback:** Remove annotations  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-SEC-07: Add @PreAuthorize to ha-visualizations/run

**Objective:** Close the backend security gap that the frontend `GAP_SEC_06_RESOLVED=false` gate is masking.  
**Horizon:** H0  
**Requirement IDs addressed:** BE-12, SEC-GAP-15, CONTRADICTION-09  
**Files expected to be modified:**  
- `backend/src/main/java/com/hivearmor/web/rest/VisualizationsResource.java`  
- `frontend-v3/src/pages/dashboards/DashboardViewPage.tsx` — set `GAP_SEC_06_RESOLVED = true` after backend fix is deployed  
**Acceptance criteria:**  
1. `POST /api/ha-visualizations/run` returns 403 for ROLE_USER  
2. Returns 200 for ROLE_ANALYST  
3. `GAP_SEC_06_RESOLVED = true` in `DashboardViewPage.tsx` — all dashboard widgets render  
**Rollback:** Revert annotation; set `GAP_SEC_06_RESOLVED = false`  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-FE-01: Convert .skip.ts Test Files to Vitest

**Objective:** Make the 3 dead test files discoverable by Vitest; fix dead test coverage.  
**Horizon:** H0  
**Requirement IDs addressed:** TI-01, CONTRADICTION-06  
**Files expected to be modified:**  
- `frontend-v3/src/pages/incidents/IncidentDetailPage.skip.ts` — rename and rewrite  
- `frontend-v3/src/services/incidents.service.skip.ts` — rename and rewrite  
- `frontend-v3/src/services/alerts.service.skip.ts` — rename and rewrite  
**Files expected to be created:**  
- `frontend-v3/src/services/incidents.service.test.ts`  
- `frontend-v3/src/services/alerts.service.test.ts`  
**Backend dependency:** None  
**Unit tests:** The batch IS the test work  
**Acceptance criteria:**  
1. `npm run test` discovers and runs all 3 converted test files  
2. No `node:test` or `assert` imports remain in the test suite  
3. All converted tests pass  
4. Total test count increases from 204  
**Rollback:** Restore `.skip.ts` files  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H0-FE-02: Add Route Guards and Visible Stub State

**Objective:** Make it visually obvious to users when a route resolves to an unimplemented stub.  
**Horizon:** H0  
**Requirement IDs addressed:** CONTRADICTION-02  
**Files expected to be created:**  
- `frontend-v3/src/components/engineering-notice/EngineeringNotice.tsx`  
**Files expected to be modified:**  
- All 26 `.skip.ts` stub files — mount `<EngineeringNotice>` component  
**Acceptance criteria:**  
1. Navigating to `/hunt` shows "Feature under development" notice  
2. No blank white screens on any stub route  
3. Navigation links to stub routes remain functional (no broken links)  
**Rollback:** Remove `EngineeringNotice` mounts  
**Estimated complexity:** S  
**Parallel work allowed:** Yes (after component created)

---

## BATCH H1-FND-01: Route Code Splitting

**Objective:** Reduce initial JS bundle from 4.1 MB to under 500 KB via lazy imports.  
**Horizon:** H1  
**Requirement IDs addressed:** FE-15, PERF-01  
**Preconditions:** H0 complete  
**Files expected to be modified:**  
- `frontend-v3/src/router/index.tsx` — wrap all page imports in `React.lazy()`  
**Files expected to be created:**  
- `frontend-v3/src/components/app-suspense-fallback/AppSuspenseFallback.tsx`  
**Acceptance criteria:**  
1. Initial JS bundle < 500 KB (Vite build report)  
2. Each lazy route chunk < 150 KB  
3. `<Suspense>` fallback renders during chunk load  
4. No page navigation errors introduced  
**Rollback:** Revert to eager imports in `router/index.tsx`  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H1-FND-02: Toast / AlertGroup Integration

**Objective:** Make toast notifications visible — currently silently dropped.  
**Horizon:** H1  
**Requirement IDs addressed:** CONTRADICTION-03  
**Files expected to be modified:**  
- `frontend-v3/src/components/app-layout/AppLayout.tsx` — mount `<ToastStack>`  
- `frontend-v3/src/components/toast/ToastStack.tsx` — wire to PatternFly `AlertGroup`  
**Acceptance criteria:**  
1. `toast.success('message')` call results in visible PatternFly Alert in top-right  
2. Toast auto-dismisses after 5s  
3. Multiple toasts stack correctly  
4. Close button dismisses individual toast  
**Rollback:** Unmount `<ToastStack>` from AppLayout  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H1-FND-03: Skip Nav + Chart Aria Labels

**Objective:** Fix 2 WCAG Level A failures.  
**Horizon:** H1  
**Requirement IDs addressed:** FE-13, FE-14, A11Y-01, A11Y-03  
**Files expected to be modified:**  
- `frontend-v3/src/components/app-layout/AppLayout.tsx` — add skip nav link  
- `frontend-v3/src/components/charts/HaChart.tsx` — add `aria-label` prop  
- All pages using `<HaChart>` — pass descriptive `aria-label`  
**Acceptance criteria:**  
1. Tab from page start focuses skip nav link  
2. Activating skip nav focuses `#main-content`  
3. All `<HaChart>` instances have non-empty `aria-label`  
4. axe-core reports 0 violations on these rules  
**Rollback:** Revert AppLayout and HaChart changes  
**Estimated complexity:** S  
**Parallel work allowed:** Yes

---

## BATCH H1-TEST-01: Storybook + Playwright + axe-core Scaffold

**Objective:** Establish the full test infrastructure for visual regression, E2E, and accessibility.  
**Horizon:** H1  
**Requirement IDs addressed:** TI-02, TI-03, TI-04  
**Preconditions:** H1-FND-01 complete (lazy routes need Suspense before Playwright can navigate)  
**Files expected to be created:**  
- `.storybook/main.ts`, `.storybook/preview.ts`  
- `playwright.config.ts`  
- `src/test/setup-axe.ts`  
- Stories for: `HaButton`, `HaCard`, `HaDrawer`, `HaChart`, `HaBadge`, `SiemDataGrid`, `FilterChipsRow`, `StatusDock`, `LiveModeToggle`  
- E2E tests: `e2e/login.spec.ts`, `e2e/alert-triage.spec.ts`  
**Acceptance criteria:**  
1. `npx storybook build` succeeds  
2. `npx playwright test` runs without configuration errors  
3. `npm run test` includes axe-core setup  
4. Zero axe violations on Login page  
**Rollback:** Remove packages and config files  
**Estimated complexity:** M  
**Parallel work allowed:** No (depends on H1-FND-01)

---

## BATCH H2-SEARCH-01: Activate SearchHuntPage

**Objective:** Implement the primary log search and threat hunting interface.  
**Horizon:** H2  
**Requirement IDs addressed:** FS-08, CONTRADICTION-10, FE-09  
**Preconditions:** H1 complete; histogram endpoint built (FULL_STACK_DEVELOPMENT_REQUIRED)  
**Files expected to be created:**  
- `frontend-v3/src/pages/search/SearchHuntPage.tsx`  
- `frontend-v3/src/services/search.service.ts` (if not exists)  
- `frontend-v3/src/pages/search/SearchHuntPage.test.tsx`  
**Files expected to be modified:**  
- Remove/replace `frontend-v3/src/pages/search/SearchHuntPage.skip.ts`  
**Backend dependency:** `POST /api/ha-search/nl-query` (exists), `GET /api/ha-search/histogram` (new endpoint required)  
**Acceptance criteria:**  
1. `/hunt` route renders functional search page  
2. NL query sends to `/api/ha-search/nl-query`  
3. Results render in `SiemDataGrid`  
4. Histogram chart renders above results  
5. Saved queries panel shows/hides  
**Rollback:** Restore `.skip.ts` stub  
**Estimated complexity:** L  
**Parallel work allowed:** No (depends on H2-INCIDENT-01 infrastructure)

---

## BATCH H2-INCIDENT-01: Activate IncidentDetailPage

**Objective:** Implement the full incident detail workflow for analysts.  
**Horizon:** H2  
**Requirement IDs addressed:** FE-01, FE-02, FE-03, FE-04, FE-05  
**Preconditions:** H1 complete; H0-SEC-06 (incident endpoint protection)  
**Files expected to be created:**  
- `frontend-v3/src/pages/incidents/IncidentDetailPage.tsx`  
- `frontend-v3/src/pages/incidents/components/EvidencePanel.tsx`  
- `frontend-v3/src/pages/incidents/components/EvidenceBoard.tsx`  
- `frontend-v3/src/pages/incidents/components/IncidentTimeline.tsx`  
- `frontend-v3/src/pages/incidents/components/AiSummaryBlock.tsx`  
**Files expected to be modified:**  
- Remove `frontend-v3/src/pages/incidents/IncidentDetailPage.skip.ts`  
**Backend dependency:** All `/api/ha-incidents/{id}/*` endpoints (VERIFIED PROTECTED)  
**Acceptance criteria:**  
1. `/incidents/:id` renders incident detail  
2. Evidence items load and CRUD works  
3. Timeline panel renders events  
4. AI summary triggers SSE stream  
**Rollback:** Restore `.skip.ts` stub  
**Estimated complexity:** XL  
**Parallel work allowed:** Yes (parallel with H2-SEARCH-01)

---

## BATCH H2-FINDING-01: Activate CorrelatedFindingsPage

**Objective:** Implement the correlated findings (offenses) list and detail view.  
**Horizon:** H2  
**Requirement IDs addressed:** CONTRADICTION-07 (partial), route fix  
**Preconditions:** H0-SEC-04 (Groovy fix + `@PreAuthorize` on offenses)  
**Files expected to be created:**  
- `frontend-v3/src/pages/correlated-findings/CorrelatedFindingsPage.tsx`  
**Backend dependency:** `GET /api/offenses`, `GET /api/offenses/{id}`, `GET /api/offenses/{id}/alerts`  
**Acceptance criteria:**  
1. `/offenses` renders paginated findings list  
2. Status control disabled until `SEC-03` resolved (per existing UI rule)  
3. Clicking finding opens detail with associated alerts  
**Rollback:** Restore stub  
**Estimated complexity:** M  
**Parallel work allowed:** Yes

---

## BATCH H2-EVIDENCE-01: Evidence Board Persistence

**Objective:** Implement evidence board with chain-of-custody tracking.  
**Horizon:** H2  
**Requirement IDs addressed:** FE-01, FE-02  
**Preconditions:** H2-INCIDENT-01  
**Files expected to be created:**  
- `frontend-v3/src/services/evidence.service.ts`  
**Backend dependency:** `GET/POST/PUT/DELETE /api/ha-incidents/{incidentId}/evidence-items` (VERIFIED PROTECTED)  
**Acceptance criteria:**  
1. Evidence items persist across page refresh  
2. Edit/delete updates immediately reflect  
3. Chain of custody timestamps shown  
**Estimated complexity:** M  
**Parallel work allowed:** No (depends on H2-INCIDENT-01)

---

## BATCH H3-DETECT-01: Detection Rules Editor Activation

**Objective:** Implement the correlation rule editor with Monaco, MITRE mapping, and Sigma sync.  
**Horizon:** H3  
**Requirement IDs addressed:** FE-12, detection rules `.skip.ts` files  
**Preconditions:** H0-SEC-08 (`@PreAuthorize` on correlation-rule endpoints)  
**Files expected to be created:**  
- `frontend-v3/src/pages/detection/DetectionRulesPage.tsx`  
- `frontend-v3/src/pages/detection/components/RuleEditorPanel.tsx`  
- `frontend-v3/src/pages/detection/components/MitreMappingPanel.tsx`  
- `frontend-v3/src/pages/detection/components/SigmaSyncPanel.tsx`  
**Backend dependency:** `/api/correlation-rule/*`, `POST /api/ha-sigma-sync/trigger`, `GET /api/mitre/coverage`  
**Acceptance criteria:**  
1. `/rules` renders rules list  
2. Monaco editor loads rule YAML  
3. Save triggers PUT /api/correlation-rule  
4. Sigma sync button triggers sync job  
**Estimated complexity:** L  
**Parallel work allowed:** Yes (parallel with H3-RESPONSE-01)

---

## BATCH H3-RESPONSE-01: SOAR Playbook Builder Activation

**Objective:** Complete the ReactFlow playbook builder with action palette and approval gates.  
**Horizon:** H3  
**Requirement IDs addressed:** FE-24, SOAR `.skip.ts` files  
**Preconditions:** H0-SEC-08 (`@PreAuthorize` on SOAR endpoints)  
**Files expected to be modified:**  
- `frontend-v3/src/pages/response/PlaybookBuilderPage.tsx` (partial impl exists)  
**Backend dependency:** `GET/POST/PUT/DELETE /api/soar/playbooks/*`, `POST /api/soar/playbooks/{id}/execute`  
**Acceptance criteria:**  
1. ReactFlow canvas renders with draggable action nodes  
2. Playbook saves to backend  
3. Delete action works (FE-24)  
4. Execution triggers and shows result  
**Estimated complexity:** L  
**Parallel work allowed:** Yes

---

## BATCH H4-DASH-01: Dashboard Studio Activation

**Objective:** Build the missing DashboardStudioPage from scratch (no active .tsx counterpart exists).  
**Horizon:** H4  
**Requirement IDs addressed:** DASH-03, CONTRADICTION-07  
**Preconditions:** H0-SEC-07 (`GAP_SEC_06_RESOLVED = true`); DEC-10 (dashboard ownership decision)  
**Files expected to be created:**  
- `frontend-v3/src/pages/dashboards/DashboardStudioPage.tsx`  
- `frontend-v3/src/pages/dashboards/DashboardStudioRenderers.tsx`  
**Files expected to be modified:**  
- Remove `DashboardStudioPage.skip.ts`, `DashboardStudioRenderers.skip.ts`  
**Backend dependency:** `POST /api/ha-dashboards`, `PUT /api/ha-dashboards`  
**Acceptance criteria:**  
1. Widget palette renders available widget types  
2. GridStack canvas accepts drag-drop widget placement  
3. Save persists layout to backend  
4. Load retrieves and renders saved layout  
**Estimated complexity:** XL  
**Parallel work allowed:** No (depends on H2 infrastructure)

---

## BATCH H4-REPORT-01: Report Generation Activation

**Objective:** Implement SITREP, Incident, and After-Action report generation.  
**Horizon:** H4  
**Requirement IDs addressed:** FS-04, FS-05, FS-06  
**Preconditions:** Backend report endpoints built (FULL_STACK_DEVELOPMENT_REQUIRED); DEC-11 (output format decision)  
**Files expected to be created:**  
- `frontend-v3/src/pages/reports/SitrepReportPage.tsx`  
- `frontend-v3/src/pages/reports/IncidentReportsPage.tsx`  
- `frontend-v3/src/pages/reports/AfterActionReportsPage.tsx`  
**Backend dependency:** `POST /api/ha-reports/generate/sitrep`, `GET /api/ha-incidents/{id}/report`, `GET /api/ha-incidents/{id}/after-action` — all require backend build  
**Acceptance criteria:**  
1. Report generation form submits and shows progress  
2. Completed report renders in viewer  
3. Download triggers PDF export  
**Estimated complexity:** L per report type  
**Parallel work allowed:** Yes (each report type is independent)

---

## BATCH H5-PARSER-01: Parser Intelligence Foundation

**Objective:** Build parser health dashboard and drift detection UI.  
**Horizon:** H5  
**Requirement IDs addressed:** FS-13, FS-14  
**Preconditions:** H4 complete; backend parser health endpoint built  
**Files expected to be created:**  
- `frontend-v3/src/pages/parsers/ParserHealthPage.tsx`  
- `frontend-v3/src/services/parser-health.service.ts`  
**Backend dependency:** `GET /api/ha-parsers/{id}/health` — requires build  
**Security considerations:** DEC-07 (Parser DSL) must be approved before AI parser work begins  
**Acceptance criteria:**  
1. Parser health grid shows status per parser  
2. Drift alert surfaces on significant log-shape change  
**Estimated complexity:** M  
**Parallel work allowed:** Yes

---

## BATCH H6-TENANT-01: Backend Tenant Isolation Foundation

**Objective:** Add `tenant_id` column to all data tables and enforce row-level isolation.  
**Horizon:** H6  
**Requirement IDs addressed:** FS-01, TENANT-01 through TENANT-07  
**Preconditions:** DEC-02 (tenant architecture decision) — BLOCKING. Do NOT start without this decision.  
**Files expected to be created:**  
- Liquibase changelog `2026NNNN001_add_tenant_id_to_alerts.xml`  
- Liquibase changelog `2026NNNN002_add_tenant_id_to_incidents.xml`  
- (12+ changelogs total, one per table)  
- `backend/src/main/java/com/hivearmor/security/TenantFilter.java`  
**Files expected to be modified:**  
- All affected resource classes — inject tenant filter into queries  
- `liquibase/master.xml` — include all new changelogs  
**Database/search dependency:** Liquibase migration; OpenSearch index query injection  
**Security considerations:** CRITICAL — incomplete implementation causes data leakage between tenants  
**Tenant considerations:** This IS the tenant work  
**Acceptance criteria:**  
1. User in Tenant A cannot access alerts belonging to Tenant B  
2. OpenSearch queries are scoped by tenant_id  
3. SSE streams filter by tenant  
4. All existing data migrated to default tenant  
5. `liquibase:validate` passes  
**Rollback:** Revert changelogs (non-trivial if data migration has run)  
**Estimated complexity:** XL  
**Parallel work allowed:** No — requires dedicated team and architecture oversight
