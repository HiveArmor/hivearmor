# 07 — Step-by-Step Migration Plan

> **Rule:** Each phase must be fully merged, deployed, and validated before the next phase begins. Do not group high-risk changes. Each phase is an independent PR.

---

## Phase 0: Baseline Capture (Now — Before Any Change)

**Objective:** Capture the current state so every later change has a known starting point.

**Why first:** We cannot validate "nothing broke" if we have no baseline.

**Tasks:**
1. Record `npm list --depth=0` output → `docs/migration/baseline-npm-packages.txt`
2. Record `mvn dependency:tree` output → `docs/migration/baseline-maven-tree.txt`
3. Run `npm run build` and save artifact sizes → `docs/migration/baseline-bundle-sizes.txt`
4. Run `npm test -- --single-run` and save test results
5. Run `mvn -s settings.xml -B -Pprod clean package -DskipTests` — confirm clean build
6. Manual smoke test: login, navigate to 5 key screens, verify no console errors
7. Document all environment variables used in `local-dev/docker-compose.yml` in `local-dev/.env.example`

**Completion criteria:** All baseline files committed. Full stack starts locally with `docker compose up`. Login works.

---

## Phase 1: CSS Build Chain Fix (node-sass → sass)

**Objective:** Replace `node-sass@4` with `sass` (dart-sass) while staying on Node 14.

**Why now:** This is the prerequisite for everything else. Without it, Node upgrade kills the build.

**Affected files:**
- `frontend/package.json`
- (potentially) `frontend/angular.json` if sass binary path is configured

**Pre-change tests:**
```bash
cd frontend && npm run build    # baseline bundle sizes
cd frontend && npm test -- --single-run
```

**Implementation tasks:**
1. `npm uninstall node-sass`
2. `npm install sass@^1.77.0`
3. Run `npm run build` — fix any dart-sass deprecation warnings that become errors (unlikely in sass@1.x but possible)
4. Update CI if any node-sass-specific paths are referenced

**Post-change tests:**
- `npm run build` → zero errors, bundle sizes within 5% of baseline
- `npm test -- --single-run` → same pass rate
- Visual check: load local stack, verify styles identical across login, dashboard, alert list

**Rollback plan:** `npm uninstall sass && npm install node-sass@^4.0.0`

**Completion criteria:** Build green on Node 14 with dart-sass. All styles visually identical.

---

## Phase 2: Node.js Runtime Upgrade (14 → 20 LTS)

**Objective:** Upgrade the Node.js runtime for frontend builds.

**Why now:** After Phase 1 removes the node-sass blocker, this is safe.

**Affected files:**
- `.github/workflows/reusable-node.yml`
- `AGENTS.md`

**Pre-change tests:** Phase 1 completion gates.

**Implementation tasks:**
1. Install Node 20 locally (`nvm install 20 && nvm use 20`)
2. `npm install` — verify clean install
3. `npm run build` — verify clean build
4. `npm test -- --single-run` — verify tests pass
5. Update `reusable-node.yml` to use Node 20
6. Update `AGENTS.md` prerequisite documentation

**Post-change tests:** Same as Phase 1 gates but on Node 20.

**Rollback plan:** Revert `reusable-node.yml` to Node 14.

**Completion criteria:** CI builds green on Node 20. Frontend build time similar to Node 14.

---

## Phase 3: TSLint → ESLint

**Objective:** Replace deprecated TSLint with ESLint + angular-eslint.

**Why now:** Low risk, no runtime impact. Safe to do before Angular upgrade because the ESLint config can be prepared for Angular 17 target.

**Affected files:**
- `frontend/package.json` (remove tslint/codelyzer, add eslint packages)
- `frontend/tslint.json` (delete)
- `frontend/.eslintrc.json` (create)
- `frontend/angular.json` (update lint builder)

**Pre-change tests:** Phase 2 completion gates.

**Implementation tasks:**
1. Run `ng add @angular-eslint/schematics` (auto-converts tslint rules to eslint equivalent)
2. Verify `npm run lint` produces reasonable output
3. Fix any new blocking lint errors
4. Delete `tslint.json` and `codelyzer` after confirming ESLint works

**Post-change tests:**
- `npm run lint` — no blocking errors
- `npm run build` — still green

**Rollback plan:** Restore `tslint.json` from git; revert package.json; revert angular.json.

**Completion criteria:** `npm run lint` uses ESLint; no TSLint references remain.

---

## Phase 4: Java 17 + Spring Boot 3.3 for user-auditor and web-pdf

**Objective:** Upgrade the two EOL services from Java 11 + Boot 2.7 to Java 17 + Boot 3.3.

**Why now:** These services are simpler than the main backend. Doing them first creates experience with the javax→jakarta migration before tackling the main backend. They are also the highest security risk (EOL frameworks).

**Affected files:**
- `user-auditor/pom.xml`
- `user-auditor/src/main/java/**/*.java` (javax→jakarta)
- `web-pdf/pom.xml`
- `web-pdf/src/main/java/**/*.java` (javax→jakarta)
- `user-auditor/Dockerfile`, `web-pdf/Dockerfile`
- `.github/workflows/v11-deployment-pipeline.yml` (java_version: '11' → '17')

**Pre-change tests:** Manual test of current audit trail and PDF generation as baseline.

**Implementation tasks:**
1. Update `user-auditor/pom.xml`: Boot 2.7.14 → 3.3.2, java.version 11 → 17
2. Run IntelliJ "Migrate to Jakarta EE 9" on all `user-auditor` Java files
3. Fix compilation errors
4. Start service locally; verify audit records write correctly
5. Repeat for `web-pdf`
6. Update Selenium to 4.20.0 in `web-pdf/pom.xml`
7. Test PDF generation with all report templates
8. Update CI Java version parameters

**Post-change tests:**
- Both services start and pass their health checks
- User login generates audit record
- PDF report generates with correct content
- Zero `javax.` imports remaining (grep check)

**Rollback plan:** Deploy previous Docker images for user-auditor and web-pdf.

**Completion criteria:** Both services on Java 17 + Boot 3.3. Health checks pass. Audit and PDF functionality verified.

---

## Phase 5: Angular 7 → 17 (Multi-Step — Largest Phase)

**Objective:** Upgrade the frontend framework from Angular 7 to Angular 17.

**Why now:** Phase 1–3 cleared the build chain. Phase 4 experience with breaking changes prepares the team.

**Sub-phases (each is its own PR):**

### 5a: Add required test foundations first
- Write T-004 (auth guard tests) and T-005 (interceptor tests) on Angular 7 — make them pass
- These tests are the safety net for the framework upgrade

### 5b: Angular 7 → 12
```bash
npx @angular/cli@12 update @angular/core@12 @angular/cli@12
npx @angular/cli@12 update rxjs@7
```
- Fix migration schematic output
- Update lazy loading syntax (schematic handles most of it)
- Verify all 18 routes still function

### 5c: Angular 12 → 16
```bash
npx @angular/cli@16 update @angular/core@16 @angular/cli@16
```
- Upgrade ng-bootstrap 4 → 14
- Fix modal/popover API changes
- Upgrade ngx-echarts 4 → 8

### 5d: Angular 16 → 17
```bash
npx @angular/cli@17 update @angular/core@17 @angular/cli@17
```
- Final API cleanup
- Update TypeScript 3.2 → 5.4
- Update all remaining dependencies to Angular 17-compatible versions

**Post-change tests:**
- All Phase 5 gate tests (see testing strategy)
- Full manual E2E on every active route
- Auth flow complete test (login → dashboard → alert → incident → logout)

**Rollback plan:** Deploy previous frontend Docker image.

**Completion criteria:** All 18 routes functional. Auth flow works. Charts render. Real-time notifications work. T-004 and T-005 tests pass.

---

## Phase 6: Spring Boot 3.3 (Main Backend) + Security Config Rewrite

**Objective:** Upgrade the main backend from Spring Boot 3.1.5 to 3.3.x and rewrite `SecurityConfiguration`.

**Why now:** After Phase 5 proves the frontend works with the current backend. This is the highest-risk backend change. Must be standalone.

**Affected files:**
- `backend/pom.xml` (Spring Boot version)
- `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java` (**full rewrite**)
- All backend Java files with `javax.*` imports
- `backend/src/main/java/com/park/utmstack/config/*Configuration.java` (various Spring config)

**Pre-change tests:** T-001 and T-002 must exist and pass on the CURRENT version before this phase begins.

**Implementation tasks:**
1. Create `SecurityConfiguration` port to `SecurityFilterChain` bean pattern in a branch
2. Run T-001 and T-002 against new config — all must pass
3. Verify SAML2 SSO flow with test IdP
4. Run javax→jakarta migration on all backend Java files
5. Update Spring Boot version in pom.xml
6. Fix any auto-configuration changes
7. Update Springdoc artifact ID to v2

**Post-change tests:** All Phase 6 gates (see testing strategy)

**⚠️ DEPLOY TIMING:** Deploy during low-traffic window. All sessions will be invalidated (JWT key rotates on restart). Notify users before deployment.

**Rollback plan:** `docker service update --image ghcr.io/.../backend:<previous-tag> backend`

**Completion criteria:** All T-001 and T-002 tests pass against new config. All auth mechanisms verified. SAML2 SSO tested. No sessions lost unexpectedly.

---

## Phase 7: Hibernate 6 (Remove Version Pin)

**Objective:** Remove the forced Hibernate 5.4.32 pin and allow Spring Boot 3.1+ to use Hibernate 6.

**Why now:** After Phase 6 stabilizes the security config. Hibernate is a data layer change — keep it isolated.

**Affected files:**
- `backend/pom.xml` (remove Hibernate version pin)
- Potentially many JPQL queries across service classes

**Pre-change tests:** T-003 (alert query baseline) must be created and passing before this phase.

**Implementation tasks:**
1. Remove `<hibernate.version>5.4.32.Final</hibernate.version>` from pom.xml
2. Compile — fix any Hibernate 6 API changes
3. Run JPQL query audit — add `select` keyword where implicit
4. Run T-003 comparison tests
5. Remove `elasticsearch-rest-high-level-client` from pom.xml
6. Search and remove any remaining `org.elasticsearch.client.*` imports

**Post-change tests:** All Phase 7 gates (see testing strategy)

**Rollback plan:** Restore Hibernate pin in pom.xml. Deploy previous backend Docker image.

**Completion criteria:** T-003 query outputs match baseline. No Hibernate errors in logs. All data-fetching endpoints return correct results.

---

## Phase 8: Go Module Updates + gRPC

**Objective:** Keep Go dependencies current; verify gRPC compatibility.

**Why now:** Go components are lower risk than Java/frontend. Safe to do after core stability is established.

**Affected files:**
- `go.mod` files in: agent/, agent-manager/, utmstack-collector/, as400/, plugins/*/
- `.github/workflows/v11-deployment-pipeline.yml` (any Go version pins)

**Implementation tasks:**
1. Run `go get -u ./... && go mod tidy` in each Go module
2. Test agent registration and log streaming
3. Test SOAR command round-trip

**Post-change tests:** Phase 8 gates (see testing strategy)

**Rollback plan:** `git revert` go.mod and go.sum changes; rebuild.

**Completion criteria:** All Go modules build. Agent connects. Logs flow. SOAR works.

---

## Phase 9: ECharts 4 → 5

**Objective:** Upgrade charts to ECharts 5 for better dashboard performance.

**Why now:** Lower risk than auth/security changes. Frontend is stable from Phase 5.

**Affected files:**
- `frontend/package.json` (echarts, echarts-gl, echarts-wordcloud, ngx-echarts)
- `frontend/src/app/**/*chart*.component.ts` and `.html`
- `frontend/src/app/graphic-builder/**`
- `frontend/src/app/defined-charts/**`
- `frontend/src/app/shared/constants/utm-color.const.ts`

**Implementation tasks:**
1. Upgrade echarts to 5.5, echarts-gl to 2.x, ngx-echarts to 18.x
2. Update chart option objects per ECharts 5 migration guide
3. Test each chart type visually

**Post-change tests:** Phase 9 gates

**Rollback plan:** Revert package.json echarts versions; rebuild frontend.

**Completion criteria:** All chart types render correctly. Dashboard performance equal or better.

---

## Phase 10: Bootstrap 4 → 5

**Objective:** Upgrade Bootstrap to v5 and remove jQuery dependency.

**Why now:** Last major UI change. All other systems stable.

**Affected files:**
- `frontend/package.json`
- `frontend/angular.json` (remove jQuery scripts)
- Virtually all HTML template files (class renames)

**Implementation tasks:**
1. Update Bootstrap to 5.3.x, ng-bootstrap to 16.x
2. Remove jQuery, tether, popper.js from package.json and angular.json scripts
3. Run bulk find/replace for class renames (ml-* → ms-*, etc.)
4. Fix form layouts (form-group removal)
5. Update data-toggle → data-bs-toggle throughout
6. Test all forms and modals

**Post-change tests:** Phase 10 gates

**Rollback plan:** Revert package.json Bootstrap version; rebuild frontend.

**Completion criteria:** All forms function. All modals open/close. No Bootstrap 4-only class errors. jQuery removed from bundle.

---

## Phase 11: Branding Abstraction (After All Technical Upgrades)

**Objective:** Consolidate branding per the `product-rebranding` spec.

**Why last:** All technical upgrades must stabilize before touching the branding layer, which affects all screens.

**Reference:** `.kiro/specs/product-rebranding/tasks.md`

**Completion criteria:** All branding changes from the rebranding spec are implemented.

---

## Migration Timeline Summary

| Phase | Description | Risk | Estimated Duration |
|---|---|---|---|
| 0 | Baseline capture | None | 1 day |
| 1 | node-sass → sass | Low | 1 day |
| 2 | Node 14 → 20 | Low | 1 day |
| 3 | TSLint → ESLint | Low | 1 day |
| 4 | Java 17 + Boot 3.3 (user-auditor, web-pdf) | Medium | 3–5 days |
| 5 | Angular 7 → 17 | High | 3–6 weeks |
| 6 | Spring Boot 3.3 (backend) + Security rewrite | Critical | 1–2 weeks |
| 7 | Hibernate 6 | High | 3–5 days |
| 8 | Go module updates | Low | 2–3 days |
| 9 | ECharts 4 → 5 | Medium | 3–5 days |
| 10 | Bootstrap 4 → 5 | High | 1–2 weeks |
| 11 | Branding abstraction | Medium | 1 week |
