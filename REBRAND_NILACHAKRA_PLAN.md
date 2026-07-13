# NilaChakra Full Rebrand Plan
**Created:** 2026-07-01  
**Source codebase:** UTMStack v11 monorepo  
**New brand:** NilaChakra  
**Scope:** Complete replacement of all UTMStack/utmstack/utm_* identifiers across ALL layers

---

## Session Context (what has already been done)

### Completed migrations
| Phase | What | Status |
|---|---|---|
| 0 | Baseline capture + docs | ✅ Done |
| 1 | node-sass → dart-sass | ✅ Done |
| 2 | Node 14 → Node 20 LTS | ✅ Done |
| 3 | TSLint → ESLint | ✅ Done |
| 4 | Java 17 + Spring Boot 3.3 | ✅ Done |
| 5a–5d | Angular 7 → 17 (40/40 tests passing) | ✅ Done |
| 6a | Spring Security 6 rewrite | ✅ Done |
| 6b | Spring Boot 3.3.5 + Jakarta EE | ✅ Done |
| 7 | Hibernate 6 JPQL audit | ✅ Done |
| 8 | Go module verification | ✅ Done |
| 9 | ECharts 4 → 5 | ✅ Done |
| 10 | Bootstrap 4 → 5 + jQuery removal | ✅ Done |
| UI bugs | $localize, writeValue, Discover crash, Admin 401, Dashboard 500 | ✅ Done |
| Theme | White background dark theme fix (Bootstrap 5 CSS vars) | ✅ Done |
| Branding Phase 0 | `branding.ts` created, 4 placeholder SVG logos, spec files | ✅ Done |
| Branding Phase 1–2 | Login fix, header, totp, tfa-setup, welcome, index.html, CSS class rename | ✅ Done |
| Branding Phase 3–6 | All frontend + backend email templates, 40/40 Karma tests | ✅ Done |
| SPEC 2–8 | Full rebrand specs executed, security regression passed | ✅ Done |
| Java package | `com.park.utmstack` → `com.nilachakra` (all 999 files, compiles) | ✅ Done |
| Proto (backend) | `java_package` → `com.nilachakra.service.grpc` | ✅ Done |
| Phase A safe strings | Java comments, thread names, installer display text | ✅ Done |
| Phase B Go module rename | `github.com/utmstack/UTMStack` → `github.com/encryptshellorg/nilachakra` (261 files, all Go builds pass) | ✅ Done |

### App is currently running at: http://localhost:8880
- Frontend: `utmstack-frontend:local-dev` container
- Backend: `ghcr.io/utmstack/utmstack/backend:v11.2.10` (upstream image)
- OpenSearch, PostgreSQL, agentmanager all running

---

## Full Rebrand Audit — What Remains

### Occurrence counts by layer

| Layer | Files affected | Notes |
|---|---|---|
| Java source (`.java`) | **1,001** | Primarily `com.park.utmstack` package namespace — every file |
| Go source (`.go`, `go.mod`) | **288** | Module paths `github.com/utmstack/UTMStack/...` — every import |
| Liquibase XML | **303** | `utm_*` table/column names in DB schema — HIGH RISK |
| Frontend TS/HTML (remaining) | **44** | Guides, agent paths, internal references |
| YAML/config | **49** | application.yml, docker-compose.yml, CI pipelines |
| GitHub Actions | **11** | Image registry `ghcr.io/utmstack/utmstack/...` |
| Email templates | **2** | 2 templates not yet updated |
| Proto files | **14** | `go_package = "github.com/utmstack/UTMStack/..."` |
| Shell scripts | **6** | Build/install scripts |
| Installer Go | **37** | Binary installer code |

---

## Critical Risk Classification

### 🔴 CANNOT CHANGE — Will Break Deployed Systems

| Identifier | Location | Why frozen |
|---|---|---|
| `utm_*` database table names | PostgreSQL (302+ Liquibase XML files) | Live data; renaming requires migration + all JPA entities + queries |
| `X-UtmStack-error` HTTP header | Frontend (7 files), backend responses | API contract; frontend reads this header for error display |
| `Utm-Internal-Key` header | Frontend + Backend (25 files) | Inter-service auth contract — ALL services would break simultaneously |
| `utmauth` cookie name | Frontend app.constants.ts (4 files) | Invalidates all active browser sessions |
| `SESSION_AUTH_TOKEN` key pattern | Frontend | Same — logs out all users |
| `/opt/utmstack-linux-agent/` agent paths | Guide components (132 occurrences) | Live filesystem paths on deployed endpoints |
| `github.com/utmstack/UTMStack/*` Go import paths | All Go files (288 files) | Go module system is tied to VCS path; changing = full module rename + all builds |
| `ghcr.io/utmstack/utmstack/*` container registry | CI/CD (11 files) | Container image registry; changing breaks deployments until new registry is set up |
| OpenSearch index pattern `v11-*` | Backend + Frontend (255 occurrences) | Live data indices; renaming requires index migration |
| `com.park.utmstack` Java package | All 1001 Java files | Internal package namespace — safe to rename but requires full refactor |
| `spring.application.name = UTMStack-API` | application.yml | Prometheus metric tags depend on this; changing breaks monitoring dashboards |

### 🟡 SAFE TO CHANGE — User-Visible Strings Only

| Identifier | Location | Safe reason |
|---|---|---|
| Product name strings "UTMStack" in UI templates | Frontend HTML | Display only, no functionality |
| Email template "UTMStack" text | 2 remaining templates | Display only |
| `application.branding.name` YAML | Backend YAML | Already has `${APPLICATION_BRANDING_NAME:NilaChakra}` override |
| `spring.application.name` display title | Swagger/API docs title | Not metrics-critical |
| Console log strings | Frontend/backend | Debug output only |
| Guide display text (not shell commands) | Frontend guides | Labels, not executable commands |
| `title = 'utm-stack'` in AppComponent | app.component.ts | Internal field, not user-visible |

### 🟢 ALREADY DONE

| Item | Status |
|---|---|
| `branding.ts` with `productName: 'NilaChakra'` | ✅ |
| Login page (NilaChakra heading, logo) | ✅ |
| Browser title `<title>NilaChakra</title>` | ✅ |
| Header `aria-label="NilaChakra home"` + fallback text | ✅ |
| `.bg-image-utmstack` → `.bg-image-login` CSS | ✅ |
| Security notice text in totp + tfa-setup | ✅ |
| Welcome page heading | ✅ |
| console.log('UTMStack 401') removed | ✅ |
| `SAAS_DEFAULT_PASSWORD` removed (DEBT-20) | ✅ |
| 4 placeholder SVG logos committed | ✅ |
| `global.constant.ts` DEMO_URL + ONLINE_DOCUMENTATION_BASE from branding | ✅ |

---

## 9-Spec Implementation Plan

Below is the controlled, ordered plan. Each spec builds on the previous one.

---

### SPEC 1: Baseline Audit (THIS DOCUMENT)

**Status: Complete**

Deliverables:
- This file (`REBRAND_NILACHAKRA_PLAN.md`)
- Occurrence counts by layer
- Risk classification
- Ordered spec list

---

### SPEC 2: Steering Files Update

**Scope:** Update `.kiro/steering/*.md` files to reflect NilaChakra branding  
**Risk:** None (documentation only)  
**Effort:** 2 hours

Files to update:
- `.kiro/steering/branding.md` — update product name, cookie name warnings, logo file list
- `.kiro/steering/product.md` — update product description, user personas, active routes
- `.kiro/steering/siem-domain.md` — no brand strings needed; leave as-is
- `.kiro/steering/development-workflow.md` — update image registry when ready
- `AGENTS.md` — update product name in overview section

Key changes:
```
"UTMStack" → "NilaChakra" in display contexts
Product name: UTMStack → NilaChakra
Cookie name WARNING: keep 'utmauth' — must not change
Image registry: ghcr.io/utmstack/utmstack → NEW when registry is ready
```

Gate: Steering files updated, no code changes.

---

### SPEC 3: Backend Branding Spec (application.yml + MailService)

**Scope:** Backend user-visible strings only. Java package name NOT changed here.  
**Risk:** Low — all changes are display strings and email content  
**Effort:** 1 day  
**Dependency:** None

Tasks:
1. `application.yml` — update display titles:
   - `jhipster.api-docs.title`: `UTMStack Backend API` → `NilaChakra Backend API`
   - `jhipster.api-docs.description`: update
   - Keep `spring.application.name: UTMStack-API` — DO NOT CHANGE (Prometheus metric tag)
   - `application.branding.name` default is already `NilaChakra` from previous work

2. `MailService.java` — inject `ApplicationProperties.BrandingProperties` and pass `brandingName` / `brandingSupportUrl` to all 9 email templates

3. Create `templates/mail/fragments/branding.html` Thymeleaf fragment

4. Update the 2 remaining email templates (`alertEmail.html`, `alertEmailAttachment.html`) to remove hardcoded `<b>UTM</b><b>STACK</b>` and use the fragment

Gate: No UTMStack in any email template. `mvn -s settings.xml -B` compiles.

---

### SPEC 4: Branding Spec — UI Display Strings (Frontend Remaining)

**Scope:** Remaining frontend user-visible strings that were NOT changed in Phase 1-2  
**Risk:** Low — display strings only  
**Effort:** 1 day  
**Dependency:** SPEC 3 (for consistent brand name)

Remaining frontend occurrences (44 files) breakdown:

**Group A: Guide display text (safe to change labels, NOT shell commands)**
- `guide-macos-agent` — display labels only
- `guide-winlogbeat` — display labels
- `guide-syslog/syslog.steps.ts` — "UTMStack agent" → `BRANDING.productName + ' agent'`
- `guide-kaspersky/kasp-steps.ts`
- `guide-eset/eset-steps.ts`
- `guide-sentinel-one/sentinel.steps.ts`
- `guide-netflow` — display path label (NOT the `C:\Program Files\UTMStack\` shell command)

⚠️ DO NOT change `/opt/utmstack-linux-agent/` or `C:\Program Files\UTMStack\` shell commands

**Group B: Remaining component strings**
- `utm-lite-version.component.html` — "UTMStack Lite" → `branding.productName`
- `contact-us.component.html` — logo path + support URL
- `app-restart-api.component.html` — "UTMStack detected changes"
- `app-config-delete-confirm.component.html` — "UTMStack"
- `utm-report-header.component.ts` — report logo from `BRANDING.logoWhitePath`
- Scanner components — report filenames

**Group C: AppComponent title**
- `app.component.ts` — inject `Title` service, call `setTitle(BRANDING.productName)` in `ngOnInit`

Gate: `grep -r '"UTMStack"\|'\''UTMStack'\''' frontend/src/app --include="*.{ts,html}"` → zero results (excluding documented exceptions).

---

### SPEC 5: API Contract Tests

**Scope:** Write tests that verify critical contracts remain unchanged after any rebrand  
**Risk:** None (test-only)  
**Effort:** 0.5 day  
**Dependency:** None

Tests to write:

**Frontend (Karma/Jasmine):**
```typescript
// branding.spec.ts
it('BRANDING.productName is NilaChakra', () => expect(BRANDING.productName).toBe('NilaChakra'));
it('BRANDING has no undefined values', () => Object.values(BRANDING).forEach(v => expect(v).toBeTruthy()));

// auth.constants.spec.ts  
it('COOKIE_AUTH_TOKEN is utmauth (MUST NOT CHANGE)', () => expect(COOKIE_AUTH_TOKEN).toBe('utmauth'));
it('ACCESS_KEY is Utm-Internal-Key (MUST NOT CHANGE)', () => expect(ACCESS_KEY).toBe('Utm-Internal-Key'));
it('SESSION_AUTH_TOKEN contains hostname (MUST NOT CHANGE)', () => expect(SESSION_AUTH_TOKEN).toBeTruthy());

// global.constant.spec.ts
it('DEMO_URL comes from BRANDING', () => expect(DEMO_URL).toBe(BRANDING.demoUrl));
it('ONLINE_DOCUMENTATION_BASE comes from BRANDING', () => expect(ONLINE_DOCUMENTATION_BASE).toBe(BRANDING.docsUrl));
```

**Backend (Spring Boot test):**
```java
// BrandingPropertiesTest.java
@SpringBootTest
class BrandingPropertiesTest {
    @Test void brandingNameIsNilaChakra() { ... }
    @Test void springAppNameIsStillUTMStackAPI() { ... } // MUST NOT CHANGE
}
```

Gate: All new tests pass alongside existing 26 Karma specs.

---

### SPEC 6: UI Branding Implementation

**Scope:** Replace all user-visible "UTMStack" occurrences in Angular UI. DOES NOT touch Java packages, Go modules, DB table names.  
**Risk:** Low — UI text changes only  
**Effort:** 1 day  
**Dependency:** SPEC 4 done, SPEC 5 tests written

This is the full execution of SPEC 4's task list, verified by automated grep checks:

```bash
# All these greps must return zero after SPEC 6
grep -r '"UTMStack"' frontend/src/app --include="*.{ts,html}" | grep -v "x-utmstack-error\|UtmstackCoreModule\|x-UtmStack\|utm-stack"
```

Also includes:
- Logo rename: old UTMStack logo files → canonical NilaChakra names
- `logo-animated.gif` placeholder creation (currently missing)
- Favicon update to NilaChakra themed `.ico`

Gate: Playwright test `test-rebrand.mjs` passes all checks.

---

### SPEC 7: Backend Migration Implementation

**Scope:** Java package rename `com.park.utmstack` → `com.nilachakra` (or chosen package)  
**Risk:** 🔴 HIGH — 1001 files, requires full rebuild and deploy  
**Effort:** 3–5 days  
**Dependency:** SPEC 5 (API tests) must pass before this

#### Decision required before starting SPEC 7

You must decide the new Java package name. Options:
1. `com.nilachakra` — matches new brand name
2. `io.nilachakra` — common for new startups
3. Keep `com.park.utmstack` — internal package, never user-visible; lowest risk

**Recommendation: Keep `com.park.utmstack` for now.** It is a pure internal identifier. No user ever sees it. Changing it requires:
- Renaming 1001 Java files
- Updating all import statements
- Re-running all Liquibase migrations
- Rebuilding the WAR
- Full integration test suite

If you want to proceed, the plan is:

```
Phase A — Rename package com.park.utmstack → com.nilachakra
  - IDE rename (IntelliJ: Refactor → Rename Package)
  - Verify all 1001 files updated
  - mvn -s settings.xml -B compiles clean

Phase B — Update application.yml display values
  - spring.application.name: UTMStack-API → NilaChakra-API
    (only after Prometheus dashboards are updated)
  - jhipster.api-docs.title: already done in SPEC 3

Phase C — Update remaining backend strings
  - "UTMStack" in log messages, exception messages
  - "UTMStack" in comments (optional)

Phase D — Go module rename (VERY HIGH RISK)
  github.com/utmstack/UTMStack → github.com/nilachakra/nilachakra
  - Requires: new GitHub organization OR repo rename
  - Requires: all go.mod files updated
  - Requires: all import paths in 288 Go files updated
  - Requires: agent binaries rebuilt and redistributed to all deployed endpoints
  - Recommendation: DEFER until new GitHub org is set up
```

Gate: `mvn -B -Pprod clean package -s settings.xml` succeeds. All integration tests pass.

---

### SPEC 8: Security Regression Review

**Scope:** Verify that no security contracts were broken by the rebrand  
**Risk:** Medium — auth constants are high-risk  
**Effort:** 0.5 day  
**Dependency:** SPEC 6 + SPEC 7 complete

Checklist:

```
□ COOKIE_AUTH_TOKEN === 'utmauth'    — grep app.constants.ts → verify unchanged
□ ACCESS_KEY === 'Utm-Internal-Key'  — grep app.constants.ts → verify unchanged
□ SESSION_AUTH_TOKEN key pattern     — grep app.constants.ts → verify unchanged
□ utmauth cookie still set on login  — Playwright test: login and check document.cookie
□ Utm-Internal-Key header still sent — Network tab: any /api/ request has header
□ JWT auth flow works end-to-end    — Playwright: login → dashboard → logout
□ TFA enrollment still works        — Manual test: enable TOTP on test account
□ Admin 401 → redirects to login    — Playwright: call /api/users without token → 401 → /login
□ X-UtmStack-error header still read — Playwright: trigger auth error, check error message appears
□ Agent gRPC still connects         — Check agentmanager logs for active connections
□ spring.application.name unchanged  — curl /management/info → check app name in Prometheus
```

Gate: All security checks pass, Playwright auth test passes.

---

### SPEC 9: Release Checklist

**Scope:** Final verification before pushing to production  
**Risk:** None (checklist only)  
**Effort:** 1 hour  
**Dependency:** ALL previous specs complete

```
□ SPEC 1-8 all complete and gated
□ `npm test -- --watch=false` → 26 SUCCESS
□ `mvn -s settings.xml test` → all pass
□ `go test ./...` in agent-manager → pass
□ Production build clean: npm run build → no errors
□ Production WAR: mvn -B -Pprod clean package → success
□ Docker build: docker build -t nilachakra-frontend . → success
□ E2E smoke: http://localhost:8880 → NilaChakra login page visible
□ Login works: admin/localdev123! → dashboard loads
□ Header shows NilaChakra
□ Browser tab shows "NilaChakra"
□ No console errors (except pre-existing backend 500)
□ Email test: trigger activation email → "NilaChakra" in email body
□ PDF report test: generate compliance report → NilaChakra in header
□ Steering files updated to reflect new state
□ This document updated with final status
□ Git commit message: "rebrand: UTMStack → NilaChakra (Phase X complete)"
□ PR opened to release/v11 branch
□ Tier-3 approver notified (required by pr-checks.yml)
```

---

## What is NEVER changing (permanent frozen list)

These identifiers are frozen forever — changing them would break live deployments without a coordinated full-stack release:

| Identifier | Value | Why frozen |
|---|---|---|
| Cookie name | `utmauth` | All active browser sessions |
| Session token key | `<HOSTNAME>_AUTH_TOKEN` | All active browser sessions |
| Internal header | `Utm-Internal-Key` | All frontend↔backend calls |
| X-error header | `X-UtmStack-error` | Frontend error parsing |
| Database tables | `utm_*` (76 tables) | Live PostgreSQL data |
| OpenSearch indices | `v11-*` | Live alert/log data |
| Agent binary paths | `/opt/utmstack-linux-agent/` | Deployed on endpoints |
| Go module path | `github.com/utmstack/UTMStack/` | Until new org/repo created |
| Container registry | `ghcr.io/utmstack/utmstack/` | Until new registry created |
| Spring app name | `UTMStack-API` | Prometheus metric tags |

---

## Recommended Execution Order

```
Week 1:
  Mon  → SPEC 2: Steering files (2h) + SPEC 3: Backend branding strings (4h)
  Tue  → SPEC 4 analysis: catalogue remaining frontend strings
  Wed  → SPEC 5: Write API contract tests
  Thu  → SPEC 6: UI branding implementation + deploy + verify
  Fri  → SPEC 8: Security regression review

Week 2 (if Java package rename approved):
  Mon  → SPEC 7 Phase A: Java package rename decision + IDE rename
  Tue  → SPEC 7 Phase B: Compile, test, fix
  Wed  → SPEC 7 Phase C: Deploy and integration test
  Thu  → SPEC 9: Release checklist + PR

Go module rename (if approved):
  Requires new GitHub org setup first → separate project
```

---

## Files in This Repository That Track This Work

| File | Purpose |
|---|---|
| `REBRAND_NILACHAKRA_PLAN.md` | **This file** — master audit and plan |
| `.kiro/specs/product-rebranding/requirements.md` | Formal requirements (Kiro spec format) |
| `.kiro/specs/product-rebranding/design.md` | Technical design document |
| `.kiro/specs/product-rebranding/tasks.md` | Ordered task list with dependency graph |
| `frontend/src/environments/branding.ts` | **THE** canonical frontend brand config |
| `frontend/src/assets/img/logo-full.svg` | Placeholder logo (replace with final art) |
| `frontend/src/assets/img/logo-icon.svg` | Placeholder icon |
| `frontend/src/assets/img/logo-white-full.svg` | Placeholder white logo |
| `frontend/src/assets/img/logo-white-icon.svg` | Placeholder white icon |
| `.cursor-audit/test-rebrand.mjs` | Automated Playwright rebrand verification |
| `.cursor-audit/screenshots/nilachakra-login.png` | Login page screenshot |
