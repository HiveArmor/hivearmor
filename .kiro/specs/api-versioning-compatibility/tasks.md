# Implementation Plan: API Versioning and Compatibility

## Overview

Incrementally introduce a `/api/v1/` URL namespace for UTMStack v11's REST API while keeping every
existing `/api/` endpoint active and behaviorally identical. The work is gated on a test foundation
that does not yet exist (`backend/src/test/`). Four phases ship over four releases; no Liquibase
changesets are required, and every phase is rollback-safe via Docker image swap.

**Phase gate rule:** All Phase 0 tasks must be merged and verified before any Phase 1 task begins.
Phase 1 must be stable in production for at least one Release_Cycle before Phase 2 begins.
Phase 2 must be stable for at least one Release_Cycle before Phase 3 begins.

---

## Tasks

## Phase 0 — Test Foundation and Infrastructure

> **Gate:** No endpoint is deprecated after this phase. All backend infrastructure is live, the
> CI test gate is active, the `DeprecationInterceptor` is in the frontend, and the manual rollback
> acceptance test (Property 8) has been executed and recorded in the PR description.

- [ ] 0. Add jqwik and spring-boot-starter-test dependencies to pom.xml
  - [ ] 0.1 Add `jqwik 1.8.5` and `spring-boot-starter-test` as `<scope>test</scope>` dependencies to `backend/pom.xml`
    - Insert immediately before the closing `</dependencies>` tag
    - Verify `mvn -s settings.xml dependency:resolve` resolves without error
    - _Requirements: 9.1 — establishes test infrastructure; Design: Testing Strategy / PBT library dependency additions_

- [ ] 1. Create backend test directory and base test infrastructure
  - [ ] 1.1 Create `backend/src/test/java/com/park/utmstack/AbstractApiVersioningTest.java`
    - Run `mkdir -p backend/src/test/java/com/park/utmstack` (resolves DEBT-01)
    - Implement the `@SpringBootTest` + `@AutoConfigureMockMvc` base class exactly as specified in the design document
    - Implement `adminJwt()` and `userJwt()` helpers using `TokenProvider.createToken()`
    - Verify `mvn -s settings.xml test` compiles and exits zero (no test methods yet)
    - _Requirements: 9.1 — DEBT-01 resolution; Design: Testing Strategy / AbstractApiVersioningTest.java_

- [ ] 2. Create the versioning package skeleton (DeprecationRegistry, DeprecationHeaderFilter, VersioningConfiguration)
  - [ ] 2.1 Create `backend/src/main/java/com/park/utmstack/config/versioning/DeprecationRegistry.java`
    - Implement as a Spring `@Component` singleton with an immutable `LinkedHashMap` populated in the constructor
    - The constructor map is **empty** at this stage (no deprecated paths yet)
    - Implement `lookup(String requestPath)` and `allEntries()` as specified in the design
    - _Requirements: 4.1, 4.2, 4.3, 10.1, 10.4 — in-memory registry with no DB writes; Design: Component 2_
  - [ ] 2.2 Create `backend/src/main/java/com/park/utmstack/config/versioning/DeprecationHeaderFilter.java`
    - Extend `OncePerRequestFilter`; inject `DeprecationRegistry` via constructor
    - Implement the `/api/` + not `/api/v1/` negative-match guard as designed
    - Set `Deprecation`, `Sunset`, and `Link` headers **before** `chain.doFilter()` call
    - Register via `FilterRegistrationBean` inside `VersioningConfiguration` with `order = Ordered.LOWEST_PRECEDENCE - 10` and `urlPattern = /api/*`
    - Implement WARN-level logging on `DeprecationRegistry.lookup()` exception; do not swallow the chain exception
    - _Requirements: 4.1, 4.2, 4.3, 4.4 — RFC 8594 header injection; Design: Component 3_
  - [ ] 2.3 Create `backend/src/main/java/com/park/utmstack/config/versioning/VersioningConfiguration.java`
    - Annotate with `@Configuration`; add the `FilterRegistrationBean` for `DeprecationHeaderFilter`
    - Add **empty inner `@RestController` stubs** for each Phase 1 resource group (no method bodies yet — stubs only to verify routing wires up): `SystemConfigV1`, `ModulesV1`, `DashboardsV1`, `GettingStartedV1`
    - All inner controllers annotated with `@RestController @RequestMapping("/api/v1")`
    - Must NOT import any `Repository` class; must NOT contain `@Scheduled` methods
    - _Requirements: 2.1, 2.2, 2.7 — Version_Adapter skeleton; Design: Component 1_

- [ ] 3. Modify SecurityConfiguration.java — append /api/v1/** antMatchers rules
  - ⚠️ **SECURITY REVIEW REQUIRED** — this task touches `SecurityConfiguration.java`
  - [ ] 3.1 Append `/api/v1/**` antMatchers rules to `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java`
    - Apply the exact diff from the design document, inserting immediately before `.antMatchers("/api/**").hasAnyAuthority(ADMIN, USER)`
    - Add the `permitAll()` block for `/api/v1/authenticate`, `/api/v1/ping`, `/api/v1/date-format`, `/api/v1/healthcheck`, `/api/v1/releaseInfo`, `/api/v1/account/reset-password/**`, `/api/v1/utm-providers`, `/api/v1/images/all`, `/api/v1/info/version`
    - Add restricted role blocks mirroring legacy: `enrollment/**` → `PRE_VERIFICATION_USER`; `tfa/**` → per design; `utm-incident-jobs` → `ADMIN`; `utm-incident-variables/**` → `ADMIN`
    - Add `denyAll()` for `/api/v1/custom-reports/**` adjacent to `/api/custom-reports/**`
    - Add `/api/v1/**` catch-all **before** `/api/**` catch-all
    - **Do NOT** add `/api/v1/authenticateFederationServiceManager` (Requirement 11.5)
    - **Do NOT** modify, reorder, or delete any existing antMatchers rule
    - _Requirements: 1.7, 2.5, 2.6, 2.7, 8.1, 8.2, 8.3, 8.4, 8.5; Design: Component 4_

- [ ] 4. Extend CORS exposed-headers in application YAML files
  - [ ] 4.1 Update `backend/src/main/resources/config/application-dev.yml` — append `Deprecation,Sunset` to the `exposed-headers` value (additive only; no other CORS setting touched)
    - _Requirements: 4.6; Design: Component 5_
  - [ ] 4.2 Apply the identical change to `backend/src/main/resources/config/application-prod.yml`
    - _Requirements: 4.6; Design: Component 5_

- [ ] 5. Write Phase 0 property-based tests (jqwik)
  - [ ] 5.1 Create `backend/src/test/java/com/park/utmstack/versioning/ContractExampleTest.java`
    - Extend `AbstractApiVersioningTest`
    - Test: `GET /api/v0/utm-alerts` → 404 (unregistered version prefix)
    - Test: `GET /api/v1/custom-reports/anything` with ADMIN JWT → 403 (denyAll rule)
    - Test: `GET /api/v1/utm-configuration-parameters` with no credentials → 401
    - Test: Verify no `Deprecation` header on `/api/v1/` responses when registry is empty
    - Mock all service beans with `@MockBean`
    - _Requirements: 2.4, 4.4, 9.1, 9.3; Design: Testing Strategy / ContractExampleTest_
  - [ ] 5.2 Create `backend/src/test/java/com/park/utmstack/versioning/SecurityNegativeTest.java`
    - Test: `/api/v1/authenticateFederationServiceManager` → 404 (must not be registered)
    - Test: `GET /api/v1/utm-incident-jobs` with USER JWT → 403 (ADMIN-only constraint)
    - Test: `GET /api/v1/utm-incident-jobs` with ADMIN JWT → delegates (mock returns 200)
    - _Requirements: 8.3, 8.4, 11.5; Design: Testing Strategy / SecurityNegativeTest_

  - [ ]* 5.3 Write property test for URL symmetry (Property 1)
    - Create `backend/src/test/java/com/park/utmstack/versioning/UrlSymmetryPropertyTest.java`
    - **Property 1: URL Symmetry** — for any migrated GET path and valid JWT, Legacy_URL and Versioned_URL return identical HTTP status codes
    - Use `@Property(tries = 100)` with `@ForAll("migratedGetPaths")` arbitraries drawn from the Phase 0 stub endpoints
    - Mock service layer via `@MockBean` to return deterministic 200 responses
    - **Validates: Requirements 1.1, 1.2, 2.1, 3.1, 3.2, 9.2**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 1: URL Symmetry`
  - [ ]* 5.4 Write property test for deprecation header idempotence (Property 2) and no versioned-URL headers (Property 6)
    - Create `backend/src/test/java/com/park/utmstack/versioning/DeprecationHeaderPropertyTest.java`
    - **Property 2: Deprecation Header Idempotence** — for n ∈ [1..100] calls to a deprecated Legacy_URL, all responses carry identical `Deprecation`, `Sunset`, and `Link` values
    - **Property 6: No Versioned-URL Deprecation Headers** — `/api/v1/**` responses never carry `Deprecation` or `Sunset` headers
    - Registry is empty in Phase 0; seed a single test entry for Property 2 via a test-only `@Bean` override
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 9.4**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 2: Deprecation Header Idempotence`
  - [ ]* 5.5 Write property test for security constraint preservation (Property 3)
    - Create `backend/src/test/java/com/park/utmstack/versioning/SecurityConstraintPropertyTest.java`
    - **Property 3: Security Constraint Preservation** — for each registered antMatchers path, ROLE_USER token returns same 200/403 outcome on Legacy_URL and Versioned_URL
    - Enumerate registered paths via MockMvc; test both ADMIN and USER tokens
    - **Validates: Requirements 2.6, 8.2, 8.4, 8.5, 8.6**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 3: Security Constraint Preservation`

  - [ ]* 5.6 Write property test for pagination contract invariant (Property 4)
    - Create `backend/src/test/java/com/park/utmstack/versioning/PaginationPropertyTest.java`
    - **Property 4: Pagination Contract Invariant** — for page ≥ 0 and size ∈ [1..200], `X-Total-Count` header value and body array length are identical on Legacy_URL and Versioned_URL
    - Mock service layer to return a deterministic `Page<T>` with predictable count
    - **Validates: Requirements 1.4, 1.6, 9.5**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 4: Pagination Contract Invariant`
  - [ ]* 5.7 Write property test for error envelope format invariant (Property 5)
    - Create `backend/src/test/java/com/park/utmstack/versioning/ErrorEnvelopePropertyTest.java`
    - **Property 5: Error Envelope Format Invariant** — invalid requests return `Content-Type: application/problem+json` with `title`, `status`, `detail` fields from both Legacy_URL and Versioned_URL
    - Generate random malformed bodies (missing required fields, wrong types) using jqwik arbitraries
    - **Validates: Requirements 1.5, 9.6, 11.3**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 5: Error Envelope Format Invariant`
  - [ ]* 5.8 Write property test for unauthenticated access uniformity (Property 7)
    - Create `backend/src/test/java/com/park/utmstack/versioning/UnauthenticatedAccessPropertyTest.java`
    - **Property 7: Unauthenticated Access Uniformity** — for every non-public endpoint path, no-credential requests return 401 on both Legacy_URL and Versioned_URL
    - Randomize request body and query param combinations; assert 401 for all
    - **Validates: Requirements 1.3, 2.5, 9.3**
    - Tag comment: `// Feature: api-versioning-compatibility, Property 7: Unauthenticated Access Uniformity`

- [ ] 6. Add backend test CI gate to pr-checks.yml
  - [ ] 6.1 Add a `backend_tests` job to `.github/workflows/pr-checks.yml`
    - New job runs on `ubuntu-24.04`; must be listed in the `needs` array of `all_checks_passed`
    - Add step: `- name: Run backend tests` / `run: cd backend && mvn -s settings.xml test` / `env: MAVEN_TK: ${{ secrets.MAVEN_TK }}`
    - The job must run before the `approver` job (add `backend_tests` to `approver.needs`)
    - Verify the YAML is valid by running `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pr-checks.yml'))"` locally
    - _Requirements: 9.8; Design: CI integration / pr-checks.yml addition_

- [ ] 7. Add frontend DeprecationInterceptor
  - [ ] 7.1 Create `frontend/src/app/blocks/interceptor/deprecation.interceptor.ts`
    - Implement `HttpInterceptor` that reads the `Deprecation` response header; calls `console.warn` with URL and `Sunset` date when `Deprecation === 'true'`
    - Import only from `@angular/common/http` and `rxjs/operators`; no new npm dependencies
    - _Requirements: 5.4; Design: Frontend Migration / DeprecationInterceptor_
  - [ ] 7.2 Register `DeprecationInterceptor` in `frontend/src/app/app.module.ts`
    - Add to the `HTTP_INTERCEPTORS` provider array **after** `AuthExpiredInterceptor`
    - Do NOT touch `AuthInterceptor`, `AuthExpiredInterceptor`, or any existing interceptor
    - _Requirements: 5.4, 5.5; Design: Frontend Migration / DeprecationInterceptor_
  - [ ]* 7.3 Write unit tests for DeprecationInterceptor
    - Create `frontend/src/app/blocks/interceptor/deprecation.interceptor.spec.ts`
    - Use `HttpClientTestingModule` + `TestBed.configureTestingModule`
    - Test: response with `Deprecation: true` and `Sunset` → `console.warn` called with URL and sunset date
    - Test: response without `Deprecation` header → `console.warn` not called
    - _Requirements: 5.4; Design: Frontend Migration / FP1-FP2_

- [ ] 8. Update API inventory documentation for Phase 0
  - [ ] 8.1 Update `docs/baseline/03-backend-api-inventory.md`
    - Add a "Versioning Status" column to each endpoint table: values are `Legacy Only`, `Dual-Routed`, `Deprecated`, `Removed`
    - All existing entries start as `Legacy Only`
    - Add a "Planned Deprecation Phase" column; fill in Phase 1/2/3 assignments per the design migration order table
    - _Requirements: 7.3; Design: Data Models / Deprecation inventory_

- [ ] 9. Phase 0 rollback acceptance test (Property 8 — manual gate)
  - [ ] 9.1 Execute the manual rollback acceptance test procedure and record results in the PR description
    - Step 1: Deploy the versioned image on local Docker Swarm (`docker stack deploy -c local-dev/docker-compose.yml utmstack`)
    - Step 2: Confirm `GET /api/utm-configuration-parameters` returns 200 (no `Deprecation` header — registry is empty)
    - Step 3: Confirm `GET /api/v1/utm-configuration-parameters` stub returns 200 (routing is live)
    - Step 4: Run `docker service update --image <previous-tag> backend`
    - Step 5: Confirm `GET /api/utm-configuration-parameters` still returns 200 with no `Deprecation` header
    - Step 6: Confirm `GET /api/v1/utm-configuration-parameters` returns 404 (handler gone)
    - Step 7: Paste pass/fail output into the Phase 0 PR description
    - **This task must pass before the Phase 0 PR merges**
    - _Requirements: 10.2, 10.3, 10.5; Design: Rollback Design / Mechanism; Requirements Property 8_

- [ ] 10. Phase 0 checkpoint — verify all tests pass
  - Run `cd backend && mvn -s settings.xml test` — all tests must be green
  - Run `cd frontend && npm test -- --single-run` — deprecation interceptor spec must pass
  - Confirm `pr-checks.yml` backend_tests job passes on a draft PR
  - Ensure all tests pass; ask the user if questions arise.

---

## Phase 1 — Low-Risk Read-Only Endpoints

> **Gate:** Phase 0 merged and in production. No high-risk endpoints touched in this phase.
> Deprecation headers begin emitting for Phase 1 paths. `Sunset` date set ≥ 2 Release_Cycles ahead.

- [ ] 11. Implement Phase 1 backend endpoint handlers in VersioningConfiguration.java
  - [ ] 11.1 Implement `SystemConfigV1` inner controller in `VersioningConfiguration.java`
    - Wire `/api/v1/utm-configuration-parameters` GET/POST/PUT/DELETE to `UtmConfigurationParameterService` (same calls as `UtmConfigurationParameterResource`)
    - Wire `/api/v1/utm-configuration-sections` GET/POST/PUT/DELETE to `UtmConfigurationSectionService`
    - Constructor-inject both service beans; no repository imports
    - _Requirements: 2.1, 2.2, 3.1, 3.2; Design: Phase 1 endpoint groups_
  - [ ] 11.2 Implement `ModulesV1` inner controller in `VersioningConfiguration.java`
    - Wire `/api/v1/utm-modules` and `/api/v1/utm-module-groups` to their respective service classes
    - Match method signatures and return types exactly to the corresponding legacy controllers
    - _Requirements: 2.1, 2.2, 3.1, 3.2; Design: Phase 1 endpoint groups_
  - [ ] 11.3 Implement `DashboardsV1` inner controller in `VersioningConfiguration.java`
    - Wire `/api/v1/utm-dashboards`, `/api/v1/utm-visualizations`, `/api/v1/utm-dashboard-visualizations` to service layer
    - Preserve `X-Total-Count` header propagation from the service layer's `Page` return values
    - _Requirements: 1.4, 2.1, 2.2, 3.1; Design: Phase 1 endpoint groups_
  - [ ] 11.4 Implement `GettingStartedV1` inner controller in `VersioningConfiguration.java`
    - Wire `/api/v1/getting-started` GET to `GettingStartedService`
    - _Requirements: 2.1, 2.2, 3.1; Design: Phase 1 endpoint groups_

- [ ] 12. Populate DeprecationRegistry with Phase 1 entries
  - [ ] 12.1 Add Phase 1 path entries to `DeprecationRegistry.java` constructor map
    - Add entries for all 8 Phase 1 legacy paths: `/api/utm-configuration-parameters`, `/api/utm-configuration-sections`, `/api/utm-modules`, `/api/utm-module-groups`, `/api/utm-dashboards`, `/api/utm-visualizations`, `/api/utm-dashboard-visualizations`, `/api/getting-started`
    - Set `sunsetDate` to a date ≥ 2 Release_Cycles in the future (e.g. `"Sat, 31 Dec 2026 00:00:00 GMT"`)
    - Set `successorPath` to the corresponding `/api/v1/<resource>` path
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.2; Design: DeprecationRegistry / Phase 1_
  - [ ] 12.2 Update `docs/baseline/03-backend-api-inventory.md`
    - Change Phase 1 entries from `Legacy Only` to `Dual-Routed`
    - Record the first-deprecated release version and planned removal release version for each entry (Requirement 7.3)
    - _Requirements: 7.3, 7.2; Design: Data Models_

- [ ] 13. Write Phase 1 contract tests
  - [ ] 13.1 Add Phase 1 example-based contract tests to `ContractExampleTest.java`
    - For each Phase 1 endpoint: one test asserting Legacy_URL and Versioned_URL return the same status code with ADMIN JWT
    - For each Phase 1 endpoint: one test asserting Legacy_URL response carries `Deprecation: true`, `Sunset`, and `Link` headers (Requirements 9.2, 9.4)
    - For each Phase 1 endpoint: one test asserting Versioned_URL response carries NO `Deprecation` header
    - For each paginated Phase 1 endpoint: one test asserting `X-Total-Count` is present and equal on both URLs (Requirement 9.5)
    - For each Phase 1 endpoint: one unauthenticated request test asserting 401 on both Legacy_URL and Versioned_URL (Requirement 9.3)
    - _Requirements: 9.2, 9.3, 9.4, 9.5; Design: Contract tests section_
  - [ ]* 13.2 Update `UrlSymmetryPropertyTest.java` to include Phase 1 paths in the `migratedGetPaths` arbitrary
    - Add all 8 Phase 1 path suffixes to the `Arbitraries.of(...)` list
    - **Property 1: URL Symmetry**
    - **Validates: Requirements 1.1, 1.2, 2.1, 3.1, 9.2**
  - [ ]* 13.3 Update `PaginationPropertyTest.java` to include Phase 1 paginated paths
    - Add `utm-configuration-parameters`, `utm-modules`, `utm-dashboards`, `utm-visualizations` to pagination test arbitraries
    - **Property 4: Pagination Contract Invariant**
    - **Validates: Requirements 1.4, 1.6, 9.5**

- [ ] 14. Migrate Phase 1 frontend modules (1a–1d)
  - [ ] 14.1 Migrate `frontend/src/app/admin/` system configuration services (Phase 1a)
    - Update `utm-configuration-parameter.service.ts`: change all `${SERVER_API_URL}api/utm-configuration-parameters` to `${SERVER_API_URL}api/v1/utm-configuration-parameters`
    - Update `utm-configuration-section.service.ts` with the same pattern
    - Verify no remaining `api/utm-configuration` references in these files
    - _Requirements: 5.1, 5.2, 5.3; Design: Frontend Migration 1a_
  - [ ]* 14.2 Write Angular spec tests for Phase 1a service migration
    - Update/create `utm-configuration-parameter.service.spec.ts` — mock HTTP and assert new `/api/v1/` URL is called
    - Update/create `utm-configuration-section.service.spec.ts` — same pattern
    - _Requirements: 5.1; Design: Per-module migration pattern step 2_
  - [ ] 14.3 Migrate `frontend/src/app/app-module/` services (Phase 1b)
    - Update `utm-modules.service.ts` and `utm-module-groups.service.ts` URL paths to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 1b_
  - [ ]* 14.4 Write Angular spec tests for Phase 1b services
    - Create/update spec files for `utm-modules.service.ts` and `utm-module-groups.service.ts`
    - _Requirements: 5.1; Design: Per-module migration pattern_
  - [ ] 14.5 Migrate `frontend/src/app/graphic-builder/` dashboard services (Phase 1c)
    - Update `utm-dashboard.service.ts` and `utm-visualization.service.ts` URL paths to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 1c_
  - [ ]* 14.6 Write Angular spec tests for Phase 1c services
    - Create/update spec files for dashboard and visualization services
    - _Requirements: 5.1; Design: Per-module migration pattern_
  - [ ] 14.7 Migrate `frontend/src/app/getting-started/` service (Phase 1d)
    - Update `getting-started.service.ts` URL path to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 1d_
  - [ ]* 14.8 Write Angular spec test for Phase 1d service
    - Create/update `getting-started.service.spec.ts`
    - _Requirements: 5.1; Design: Per-module migration pattern_

- [ ] 15. Phase 1 checkpoint — verify all tests pass
  - Run `cd backend && mvn -s settings.xml test` — all property and contract tests green
  - Run `cd frontend && npm test -- --single-run` — all migrated service specs pass
  - Manually verify Phase 1 modules render correctly in local dev stack (`https://localhost`)
  - Ensure all tests pass; ask the user if questions arise.

---

## Phase 2 — Medium-Risk Write Endpoints

> **Gate:** Phase 1 stable in production for ≥ 1 Release_Cycle with zero regressions.
> Alert read GETs, incidents, compliance, correlation rules, and log search are migrated.

- [ ] 16. Implement Phase 2 backend endpoint handlers in VersioningConfiguration.java
  - [ ] 16.1 Implement `AlertsReadV1` inner controller for read-only alert endpoints
    - Wire `GET /api/v1/utm-alerts` and `GET /api/v1/utm-alerts/count-open-alerts` to `UtmAlertService`
    - Preserve JHipster_Pagination (`page`, `size`, `sort` → `Pageable`) and `X-Total-Count` header
    - Do NOT implement PUT/POST alert endpoints in this task — those are Phase 3
    - _Requirements: 2.1, 2.2, 3.1, 3.2; Design: Phase 2 endpoint groups_
  - [ ] 16.2 Implement `IncidentsV1` inner controller
    - Wire `/api/v1/utm-incidents`, `/api/v1/utm-incident-alerts`, `/api/v1/utm-incident-history` to their respective service classes
    - Preserve pagination headers on list endpoints
    - _Requirements: 2.1, 2.2, 3.1; Design: Phase 2 endpoint groups_
  - [ ] 16.3 Implement `ComplianceV1` inner controller
    - Wire all `/api/v1/utm-compliance-*` paths to `UtmComplianceService` and related services
    - _Requirements: 2.1, 2.2, 3.1; Design: Phase 2 endpoint groups_
  - [ ] 16.4 Implement `CorrelationRulesV1` inner controller
    - Wire `/api/v1/utm-correlation-rules` GET/POST/PUT/DELETE to `UtmCorrelationRulesService`
    - _Requirements: 2.1, 2.2, 3.1; Design: Phase 2 endpoint groups_

- [ ] 17. Populate DeprecationRegistry with Phase 2 entries
  - [ ] 17.1 Add Phase 2 path entries to `DeprecationRegistry.java` constructor map
    - Add entries for: `/api/utm-alerts` (GET), `/api/utm-incidents`, `/api/utm-incident-alerts`, `/api/utm-incident-history`, `/api/utm-compliance-*` (all variants), `/api/utm-correlation-rules`
    - Set `sunsetDate` ≥ 2 Release_Cycles ahead; set `successorPath` for each
    - _Requirements: 4.1, 4.2, 7.1, 7.2; Design: Phase 2_
  - [ ] 17.2 Update `docs/baseline/03-backend-api-inventory.md`
    - Change Phase 2 entries to `Dual-Routed`; record deprecation schedule
    - _Requirements: 7.3; Design: Data Models_

- [ ] 18. Write Phase 2 contract tests
  - [ ] 18.1 Add Phase 2 contract tests to `ContractExampleTest.java`
    - For each Phase 2 endpoint: same five test patterns as Phase 1 (status symmetry, headers present on legacy, headers absent on versioned, pagination, unauthenticated 401)
    - Add one invalid-body test per write endpoint asserting `400 Bad Request` with `application/problem+json` on both URLs (Requirement 11.3)
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 11.3; Design: Contract tests_
  - [ ]* 18.2 Update `UrlSymmetryPropertyTest.java` with Phase 2 paths
    - Add Phase 2 path suffixes to `migratedGetPaths` arbitrary
    - **Property 1: URL Symmetry**
    - **Validates: Requirements 1.1, 1.2, 2.1, 3.1**
  - [ ]* 18.3 Update `PaginationPropertyTest.java` with Phase 2 paginated paths
    - Add `utm-alerts`, `utm-incidents`, `utm-correlation-rules` to pagination arbitraries
    - **Property 4: Pagination Contract Invariant**
    - **Validates: Requirements 1.4, 9.5**
  - [ ]* 18.4 Update `ErrorEnvelopePropertyTest.java` with Phase 2 write endpoint paths
    - Add Phase 2 write paths (POST/PUT) to the invalid-body arbitrary generation
    - **Property 5: Error Envelope Format Invariant**
    - **Validates: Requirements 1.5, 9.6, 11.3**

- [ ] 19. Migrate Phase 2 frontend modules (2a–2d)
  - [ ] 19.1 Migrate `frontend/src/app/data-management/` alert service — GET paths only (Phase 2a)
    - Update `utm-alert.service.ts` GET method URLs only to `/api/v1/utm-alerts`
    - Leave PUT/POST paths on legacy URLs (Phase 3 task 25.1 handles writes)
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 2a_
  - [ ]* 19.2 Write Angular spec tests for Phase 2a alert service GET migration
    - Assert GET methods use `/api/v1/` URL; assert PUT/POST still use `/api/` URL
    - _Requirements: 5.1; Design: Per-module migration pattern_
  - [ ] 19.3 Migrate `frontend/src/app/incident/` incident services (Phase 2b)
    - Update `utm-incident.service.ts` and `utm-incident-history.service.ts` to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 2b_
  - [ ]* 19.4 Write Angular spec tests for Phase 2b incident services
    - _Requirements: 5.1; Design: Per-module migration pattern_
  - [ ] 19.5 Migrate `frontend/src/app/compliance/` services (Phase 2c)
    - Update all `utm-compliance-*.service.ts` files to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 2c_
  - [ ]* 19.6 Write Angular spec tests for Phase 2c compliance services
    - _Requirements: 5.1; Design: Per-module migration pattern_
  - [ ] 19.7 Migrate `frontend/src/app/rule-management/` correlation rules service (Phase 2d)
    - Update `utm-correlation-rules.service.ts` to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 2d_
  - [ ]* 19.8 Write Angular spec tests for Phase 2d correlation rules service
    - _Requirements: 5.1; Design: Per-module migration pattern_

- [ ] 20. Phase 2 checkpoint — verify all tests pass
  - Run `cd backend && mvn -s settings.xml test` — all tests green
  - Run `cd frontend && npm test -- --single-run` — all Phase 2 service specs pass
  - Verify alert list, incident, and compliance modules render correctly in local dev stack
  - Ensure all tests pass; ask the user if questions arise.

---

## Phase 3 — High-Risk Endpoints (Last)

> **Gate:** Phases 1 and 2 must have operated in production for ≥ 1 Release_Cycle each with zero
> regressions. Each sub-phase below (3a–3e) ships as a separate PR with dedicated security
> reviewer sign-off. The high-risk endpoint checklists from the design document must appear in
> each PR description.

- [ ] 21. Implement Phase 3 backend handlers — alert status writes (Phase 3a)
  - ⚠️ **SECURITY REVIEW REQUIRED** — touches alert status write path and `@AuditEvent`
  - [ ] 21.1 Add alert write methods to `AlertsReadV1` controller in `VersioningConfiguration.java` (or add a new `AlertsWriteV1` inner class)
    - Wire `PUT /api/v1/utm-alerts` (status update) to `UtmAlertService.updateStatus()` — identical body to `UtmAlertResource.updateAlertStatus()`
    - Preserve `@AuditEvent` annotation (writes to `utm_alert_log`) — alert status audit trail must be maintained
    - Preserve `addFalsePositiveTag` conditional logic and `updateStatusAndTag` vs `updateStatus` branching exactly as in the legacy handler
    - Alert status integer values 1–5 must pass through unaltered
    - _Requirements: 2.1, 2.2, 3.1, 11.1, 11.2; Design: High-Risk Checklist / PUT utm-alerts; siem-domain: Alert Status Lifecycle_
  - [ ] 21.2 Populate `DeprecationRegistry.java` with `PUT /api/utm-alerts` entry
    - _Requirements: 4.1, 4.2, 7.1; Design: Phase 3_
  - [ ] 21.3 Update `docs/baseline/03-backend-api-inventory.md` — alert write paths to `Dual-Routed`
    - _Requirements: 7.3_

- [ ] 22. Write Phase 3a contract tests — alert status writes
  - [ ] 22.1 Add alert write contract tests to `ContractExampleTest.java`
    - Test: `PUT /api/v1/utm-alerts` with valid body and each status value 1–5 → 200 on both Legacy_URL and Versioned_URL (mock `UtmAlertService`)
    - Test: `PUT /api/v1/utm-alerts` with invalid status value → 400 with `application/problem+json` on both URLs (Requirement 11.3)
    - Test: `PUT /api/v1/utm-alerts` with no credentials → 401 on both URLs
    - _Requirements: 9.2, 9.3, 11.1, 11.3; Design: High-Risk Checklist / PUT utm-alerts_
  - [ ]* 22.2 Update `ErrorEnvelopePropertyTest.java` for alert write paths
    - Add `PUT /api/v1/utm-alerts` to invalid-body test arbitraries
    - **Property 5: Error Envelope Format Invariant**
    - **Validates: Requirements 1.5, 11.3**

- [ ] 23. Implement Phase 3 backend handler — log search (Phase 3b)
  - [ ] 23.1 Add `LogSearchV1` inner controller to `VersioningConfiguration.java`
    - Wire `POST /api/v1/elasticsearch/search` to `ElasticsearchService` — raw OpenSearch DSL passthrough, no field transformation
    - Verify `SearchUtil` DSL builders are used; no string concatenation with user input
    - _Requirements: 2.1, 2.2, 11.1; Design: High-Risk Checklist / elasticsearch/search; security-rbac: Known Security Gaps_
  - [ ] 23.2 Populate `DeprecationRegistry.java` with `POST /api/elasticsearch/search` entry
    - _Requirements: 4.1, 7.1; Design: Phase 3_
  - [ ] 23.3 Migrate `frontend/src/app/log-analyzer/` log search service (Phase 2e)
    - Update `elasticsearch.service.ts` search POST URL to `/api/v1/elasticsearch/search`
    - Do NOT change field names or DSL structure in any existing query object
    - _Requirements: 5.1, 5.2, 11.1; Design: Frontend Migration 2e_
  - [ ]* 23.4 Write contract and Angular spec tests for log search migration
    - Backend contract: valid DSL body → 200; malformed DSL → 400 with problem+json (Req 11.3)
    - Angular spec: assert POST uses `/api/v1/elasticsearch/search` URL
    - _Requirements: 9.2, 11.3; Design: High-Risk Checklist / elasticsearch/search_

- [ ] 24. Implement Phase 3 backend handlers — SOAR (Phase 3c)
  - ⚠️ **SECURITY REVIEW REQUIRED** — touches SOAR response rules and incident jobs
  - [ ] 24.1 Add `ResponseRulesV1` inner controller to `VersioningConfiguration.java`
    - Wire `GET/POST /api/v1/utm-alert-response-rules` to `UtmAlertResponseRuleService`
    - The REST CRUD layer only; do NOT touch the 30-second scheduler or gRPC dispatch path
    - _Requirements: 2.1, 2.2, 11.1, 11.2; Design: High-Risk Checklist / utm-alert-response-rules; siem-domain: SOAR_
  - [ ] 24.2 Add `IncidentJobsV1` inner controller to `VersioningConfiguration.java`
    - Wire `POST /api/v1/utm-incident-jobs` to `UtmIncidentJobService`
    - Confirm `ROLE_ADMIN` constraint is mirrored in `SecurityConfiguration.java` for the new `/api/v1/utm-incident-jobs` paths
    - ⚠️ **SECURITY REVIEW REQUIRED** — verify ADMIN-only constraint not accidentally downgraded
    - _Requirements: 2.1, 8.4, 11.1; Design: High-Risk Checklist / utm-incident-jobs_
  - [ ] 24.3 Populate `DeprecationRegistry.java` with SOAR path entries
    - Add entries for `/api/utm-alert-response-rules` and `/api/utm-incident-jobs`
    - _Requirements: 4.1, 7.1; Design: Phase 3_
  - [ ] 24.4 Migrate SOAR frontend services (Phase 3b frontend)
    - Update `frontend/src/app/incident-response/utm-alert-response-rules.service.ts` to `/api/v1/`
    - Update `utm-incident-jobs.service.ts` to `/api/v1/`
    - _Requirements: 5.1, 5.2; Design: Frontend Migration 3b_
  - [ ]* 24.5 Write contract tests for SOAR endpoints
    - Backend: `POST /api/v1/utm-incident-jobs` with USER JWT → 403; with ADMIN JWT → 200 (mock)
    - Backend: `POST /api/v1/utm-alert-response-rules` invalid body → 400 problem+json
    - Angular spec: assert service files use `/api/v1/` paths
    - _Requirements: 9.2, 11.3, 8.4; Design: High-Risk Checklist / utm-incident-jobs_

- [ ] 25. Migrate Phase 3a frontend — alert write paths
  - [ ] 25.1 Update `frontend/src/app/data-management/utm-alert.service.ts` PUT/POST paths to `/api/v1/`
    - Task 19.1 already migrated GET paths; this task handles write methods only
    - Do NOT alter `AUTH_TOKEN` storage keys, `utmauth` cookie name, or `Utm-Internal-Key` header
    - _Requirements: 5.1, 5.2, 5.3, 11.4; Design: Frontend Migration 3a_
  - [ ]* 25.2 Write Angular spec test for alert write path migration
    - Assert PUT method uses `/api/v1/utm-alerts` URL
    - _Requirements: 5.1; Design: Per-module migration pattern_

- [ ] 26. Implement Phase 3 backend handlers — auth endpoints (Phase 3d — last of all)
  - ⚠️ **SECURITY REVIEW REQUIRED** — touches authentication flow; must have dedicated security sign-off from Kbayero or osmontero
  - [ ] 26.1 Verify dual-routing confirmation release requirement is met before starting
    - Auth endpoints are migrated only after the Dual_Routing_Period for those endpoints has been confirmed complete (≥ 2 releases with both URLs active and tested)
    - Record confirmation in the PR description; no code changes until confirmed
    - _Requirements: 3.5, 11.2; Design: Auth endpoints special rule_
  - [ ] 26.2 Add `AuthV1` inner controller to `VersioningConfiguration.java`
    - Wire `POST /api/v1/authenticate` to `UserJWTController.authorize()` (same service call)
    - Wire `POST /api/v1/tfa/verify-code`, `GET /api/v1/tfa/refresh`, and `/api/v1/tfa/**` to their existing service methods
    - Wire `/api/v1/enrollment/**` with `PRE_VERIFICATION_USER` scoping preserved
    - Verify `LoginResponseDTO` field names are identical: `token`, `method`, `success`, `tfaConfigured`, `forceTfa`, `tfaExpiresInSeconds`, `firstLogin`
    - Do NOT add `/api/v1/authenticateFederationServiceManager` (Requirement 11.5)
    - _Requirements: 2.1, 8.5, 11.1, 11.5; Design: High-Risk Checklist / authenticate; security-rbac: JWT Lifecycle_
  - [ ] 26.3 Populate `DeprecationRegistry.java` with auth path entries
    - Add entries for `/api/authenticate`, `/api/tfa/verify-code`, `/api/tfa/refresh`, `/api/enrollment/**`
    - _Requirements: 4.1, 7.1; Design: Phase 3_

- [ ] 27. Write Phase 3d auth contract tests and verify AuthInterceptor/AuthExpiredInterceptor
  - [ ] 27.1 Add auth endpoint contract tests to `ContractExampleTest.java`
    - Test: `POST /api/v1/authenticate` happy path (TFA disabled) → 200 with `token` field in body (mock `UserJWTController`)
    - Test: `POST /api/v1/authenticate` wrong password → 401
    - Test: `POST /api/v1/tfa/verify-code` with PRE_VERIFICATION_USER JWT → 200 (mock TFA service)
    - Test: `POST /api/v1/tfa/verify-code` with invalid code → 401 (assert 401 not 403)
    - Test: `POST /api/v1/authenticate` response body must contain all LoginResponseDTO fields
    - _Requirements: 9.2, 11.1, 11.3; Design: High-Risk Checklist / authenticate_
  - [ ]* 27.2 Write/update `auth.interceptor.spec.ts` — verify Bearer attached to /api/v1/** (Frontend Property FP1)
    - For sampled `/api/v1/<resource>` URLs with a mock token in sessionStorage, assert the outgoing `HttpRequest` carries `Authorization: Bearer <token>`
    - **Validates: Requirements 5.5; Design: Frontend property tests FP1**
  - [ ]* 27.3 Write/update `auth-expired.interceptor.spec.ts` — verify logout on 401/403 from /api/v1/** (Frontend Property FP2)
    - Mock 401 and 403 responses for `/api/v1/` URLs; assert logout service is called and stored tokens are cleared
    - **Validates: Requirements 5.6; Design: Frontend property tests FP2**
  - [ ] 27.4 Migrate `frontend/src/app/core/auth/auth-jwt.service.ts` auth endpoints (Phase 3c frontend)
    - Update `POST /api/authenticate` → `/api/v1/authenticate`; `POST /api/tfa/verify-code` → `/api/v1/tfa/verify-code`; `GET /api/tfa/refresh` → `/api/v1/tfa/refresh`
    - Do NOT change `COOKIE_AUTH_TOKEN = 'utmauth'`, `SESSION_AUTH_TOKEN` key pattern, or `ACCESS_KEY = 'Utm-Internal-Key'`
    - _Requirements: 5.1, 5.3, 5.7, 11.4; Design: Frontend Migration 3c_
  - [ ]* 27.5 Write Angular spec test for auth service URL migration
    - Assert login POST uses `/api/v1/authenticate`; assert TFA verify POST uses `/api/v1/tfa/verify-code`
    - _Requirements: 5.1, 5.3_

- [ ] 28. Update docs/baseline/03-backend-api-inventory.md for Phase 3
  - [ ] 28.1 Update all Phase 3 endpoint entries to `Dual-Routed` with deprecation schedule
    - Record first-deprecated release, planned removal release, and sunset date for all Phase 3 paths
    - _Requirements: 7.3, 7.5; Design: Data Models_
  - [ ] 28.2 Verify zero remaining Legacy_URL references in frontend service files
    - Scan all `frontend/src/app/**/*.service.ts` files for `api/` path strings (excluding auth endpoints that were deferred by Requirement 5.7 and are now migrated)
    - The only acceptable legacy references are any that have not yet exited their Dual_Routing_Period
    - _Requirements: 5.7; Design: Frontend Migration Sequencing_

- [ ] 29. Final Phase 3 checkpoint — verify all tests pass
  - Run `cd backend && mvn -s settings.xml test` — entire test suite green
  - Run `cd frontend && npm test -- --single-run` — all service and interceptor specs pass
  - Run immutable contracts checklist (design document: Immutable contracts checklist section): verify `utmauth` cookie name, `SESSION_AUTH_TOKEN` key, `Utm-Internal-Key` header, `INTERNAL_KEY`/`REPLACE_KEY` env vars, OpenSearch index pattern, alert status integers 1–5, and Liquibase changesets are all unchanged
  - Ensure all tests pass; ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all non-`*` tasks must be completed before a phase merges.
- Tasks explicitly flagged ⚠️ **SECURITY REVIEW REQUIRED** touch `SecurityConfiguration.java`, alert audit paths, or authentication flows and must include Kbayero or osmontero as a required reviewer.
- The `VersioningConfiguration.java` inner controllers must never import Repository classes directly — all data access goes through the service layer.
- Every phase PR must include the relevant High-Risk Endpoint checklist items from the design document in its PR description.
- No Liquibase changesets are created for this feature; all versioning state lives in source code.
- Property tests use the `// Feature: api-versioning-compatibility, Property N: <title>` tag comment as the first line in each `@Property` method.
- Phase 0 is the only phase that requires a manual rollback acceptance test before merging.


## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["0.1"]
    },
    {
      "id": 1,
      "tasks": ["1.1"]
    },
    {
      "id": 2,
      "tasks": ["2.1", "2.2"]
    },
    {
      "id": 3,
      "tasks": ["2.3"]
    },
    {
      "id": 4,
      "tasks": ["3.1", "4.1", "4.2"]
    },
    {
      "id": 5,
      "tasks": ["5.1", "5.2", "6.1", "7.1"]
    },
    {
      "id": 6,
      "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "7.2", "8.1"]
    },
    {
      "id": 7,
      "tasks": ["7.3", "9.1"]
    },
    {
      "id": 8,
      "tasks": ["11.1", "11.2", "11.3", "11.4"]
    },
    {
      "id": 9,
      "tasks": ["12.1"]
    },
    {
      "id": 10,
      "tasks": ["12.2", "13.1", "14.1", "14.3", "14.5", "14.7"]
    },
    {
      "id": 11,
      "tasks": ["13.2", "13.3", "14.2", "14.4", "14.6", "14.8"]
    },
    {
      "id": 12,
      "tasks": ["16.1", "16.2", "16.3", "16.4"]
    },
    {
      "id": 13,
      "tasks": ["17.1"]
    },
    {
      "id": 14,
      "tasks": ["17.2", "18.1", "19.1", "19.3", "19.5", "19.7"]
    },
    {
      "id": 15,
      "tasks": ["18.2", "18.3", "18.4", "19.2", "19.4", "19.6", "19.8"]
    },
    {
      "id": 16,
      "tasks": ["21.1", "23.1", "24.1", "24.2"]
    },
    {
      "id": 17,
      "tasks": ["21.2", "21.3", "23.2", "24.3"]
    },
    {
      "id": 18,
      "tasks": ["22.1", "23.3", "24.4", "25.1"]
    },
    {
      "id": 19,
      "tasks": ["22.2", "23.4", "24.5", "25.2", "26.1"]
    },
    {
      "id": 20,
      "tasks": ["26.2"]
    },
    {
      "id": 21,
      "tasks": ["26.3"]
    },
    {
      "id": 22,
      "tasks": ["27.1", "27.4"]
    },
    {
      "id": 23,
      "tasks": ["27.2", "27.3", "27.5", "28.1"]
    },
    {
      "id": 24,
      "tasks": ["28.2"]
    }
  ]
}
```
