# 14 — Change Readiness Plan

## Purpose

This document defines the safe sequence of changes before undertaking backend versioning, branding, or major feature work. Each phase must be completed and validated before the next begins.

---

## Pre-Conditions Checklist

Before making ANY structural changes:

- [ ] All baseline documents in `docs/baseline/` reviewed and approved
- [ ] Development environment running successfully with `local-dev/docker-compose.yml`
- [ ] All team members have read `AGENTS.md` and understand build requirements
- [ ] CI pipeline runs green on current code
- [ ] `/root/utmstack.yml` secrets backed up (for any environment being modified)

---

## Phase 0: Foundation (Do First)

### 0.1 Fix Critical Bugs (No Risk)
- [ ] Fix `jib-maven-plugin.image` in `pom.xml` from `eclipse-temurin:11` → `eclipse-temurin:17-jre-jammy`
- [ ] Create `local-dev/.env.example` with all required variables
- [ ] Fix `SAAS_DEFAULT_PASSWORD` exposed in `global.constant.ts`
- [ ] Set `DEBUG_INFO_ENABLED: false` in `environment.prod.ts`

### 0.2 Add Minimal Test Infrastructure
- [ ] Add at minimum one backend integration test for `/api/authenticate` flow
- [ ] Add at minimum one backend unit test for `TokenProvider`
- [ ] Add Go unit test for `isInternalKeyValid` in agent-manager interceptor
- [ ] Run `npm test -- --single-run` and fix any failing existing specs
- [ ] Add `go test ./...` step to CI PR checks workflow

### 0.3 Environment Documentation
- [ ] Verify all required env vars documented in `local-dev/.env.example`
- [ ] Add a `docs/local-setup.md` quick start guide
- [ ] Confirm Liquibase migration history is clean (no stuck locks)

---

## Phase 1: Backend Versioning

### 1.1 Assessment
- [ ] Review all 50+ REST resource classes for API surface
- [ ] Identify endpoints consumed by frontend, agents, and external integrations
- [ ] Map all API calls in the frontend to determine breaking change surface

### 1.2 API Versioning Strategy
**Recommended approach**: Add `/api/v1/` prefix via a versioning adapter layer.

Options:
- **Option A** (Recommended): URL path versioning (`/api/v1/`). Add Spring `RequestMapping` prefix to new controllers. Keep existing `/api/` endpoints active with deprecation headers.
- **Option B**: Header versioning (`Accept: application/vnd.utmstack.v1+json`). Less visible, harder to test.

### 1.3 Safe Change Sequence
1. Introduce `/api/v1/` prefix on **new** endpoints only — existing endpoints unchanged
2. Add `Deprecation` response header to old endpoints
3. Migrate frontend to new endpoints one module at a time (start with admin/config)
4. After frontend fully migrated: keep old endpoints for 2 sprints for external API users
5. Remove old endpoints with a documented breaking change in release notes

### 1.4 Database Migration Safety
- [ ] All new Liquibase changesets must be backward-compatible (add-only) for 2 releases
- [ ] No `DROP COLUMN`, `RENAME COLUMN`, or table removal without 2-release deprecation
- [ ] Run `liquibase validate` in CI before merge
- [ ] Consider adding a `liquibase:update-testing-rollback` step in CI

---

## Phase 2: Branding Change

### 2.1 Preparation (Do Before Any Branding Change)
- [ ] Complete branding inventory from `docs/baseline/11-branding-impact-analysis.md`
- [ ] Confirm new brand assets are ready (logos, colors, fonts) before starting
- [ ] Create a dedicated feature branch: `feature/rebrand-<newname>`

### 2.2 Backend Branding (Low Risk, Do First)
- [ ] Update `application.yml`: `spring.application.name`, API docs title
- [ ] Update `pom.xml`: `<name>` element
- [ ] Update email templates (9 HTML files) — create a design-reviewed template first
- [ ] Add `application.branding.name` config property for runtime product name in emails

### 2.3 Frontend Branding (Medium Risk, Do Second)

**Safe order**:
1. **Colors**: Update `_tokens.scss` — cascades everywhere automatically. Test in all major views.
2. **Logo files**: Replace all 11 image files in `assets/img/`. Update favicon.
3. **CSS class names**: Rename `.bg-image-utmstack` → `.bg-image-login` in `styles.scss` and `index.html`
4. **Constants**: Update `global.constant.ts` (DEMO_URL, ONLINE_DOCUMENTATION_BASE)
5. **Integration guide text**: Bulk find/replace in `app-module/guides/` HTML/TS files
6. **Cookie name**: ⚠️ Only change `COOKIE_AUTH_TOKEN = 'utmauth'` if you can deploy a coordinated migration that clears old cookies
7. **Agent install paths**: Update after new agent binaries with new paths are deployed

### 2.4 Agent/CLI Branding (Do Last — Requires Binary Release)
- [ ] Update help text in `installer/main.go`, `agent/cmd/root.go`, `utmstack-collector/main.go`
- [ ] Requires new binary builds and distribution
- [ ] Coordinate with Customer Manager release

### 2.5 Validation
- [ ] Smoke test all 18 active routes after branding changes
- [ ] Test email notification flow (activation, alert, TFA)
- [ ] Test PDF/compliance report generation
- [ ] Verify login background renders correctly
- [ ] Check all 9 email templates render correctly in a real mail client

---

## Phase 3: Angular/Frontend Upgrade (Large Scope — Plan Separately)

> This is the highest-risk change. Plan as a dedicated sprint/epic.

### 3.1 Pre-Upgrade Requirements
- [ ] Minimum 60% component test coverage before starting
- [ ] Feature freeze on frontend during migration
- [ ] Node 14 → Node 18/20 enabled (requires node-sass → sass migration first)

### 3.2 Migration Path
Angular 7 → 12 → 16 → 17 (each major version requires its own migration guide):
1. Migrate `node-sass` → `sass` (dart-sass) — unblocks Node upgrade
2. Upgrade Node 14 → 18 (LTS)
3. Angular 7 → 12 (large: module lazy loading syntax change, ViewChild change, etc.)
4. Angular 12 → 16 (Ivy stabilization, standalone component option)
5. Angular 16 → 17+ (optional: adopt signals, control flow syntax)
6. Migrate TSLint → ESLint
7. Remove jQuery

### 3.3 Each Angular Upgrade Step
- [ ] Run `ng update @angular/core@<target> @angular/cli@<target>`
- [ ] Run migration schematics
- [ ] Fix compilation errors
- [ ] Run full test suite
- [ ] Manual smoke test of all 18 routes

---

## Breaking Change Communication Protocol

For any change that breaks:
- The `/api/` contract (endpoint removed, field renamed)
- Agent authentication (`REPLACE_KEY`, gRPC proto changes)
- Cookie/token names
- Integration agent install paths

**Required steps**:
1. Document the breaking change in the next release's changelog
2. Maintain backward compatibility for at least 2 releases
3. Add deprecation warning in API response headers
4. Update `AGENTS.md` with new requirements
5. Notify known external API users (if any)

---

## Rollback Plan

| Change | Rollback Method |
|---|---|
| Backend endpoint change | Keep old endpoint active; traffic switch via nginx if needed |
| Database migration | Liquibase rollback (requires rollback scripts — **currently not written**) |
| Docker image update | `docker service update --image <old-tag> <service>` |
| Frontend deployment | Re-deploy previous Docker image |
| Agent binary | Installer serves binaries; previous version still downloadable |
| Branding change | Git revert the feature branch |
