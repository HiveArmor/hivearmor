# 15 — Contradiction and Technical Debt Register
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** DashboardViewPage.tsx, IncidentDetailPage.skip.ts, incidents.service.skip.ts, SiemDataGrid.tsx, auth.store.ts, PlaybookBuilderPage.tsx, toastStore.ts, constants/status.constants.ts

---

## Contradictions Between Spec and Implementation

### CONTRADICTION-01: AG Grid ServerSide Row Model (Enterprise) vs Community Licence

**Spec requirement:** `SiemDataGrid.tsx` should use `ServerSideRowModel` for server-side pagination (AG Grid Enterprise feature)

**Implementation:** `SiemDataGrid.tsx` bridges `IServerSideDatasource → IDatasource (InfiniteRowModel)` using Community-only APIs

**Contradiction:** The spec calls for Enterprise pagination behaviour; the codebase uses Community 36 which does not support SSRM. The workaround covers the basic pagination case but breaks:
- Grouped row views (group-by-severity, group-by-status)
- Master-detail row expansion (incident → sub-alerts)
- Tree data

**Resolution options:**
1. Accept InfiniteRowModel as "good enough" for all planned use cases (update spec)
2. Purchase AG Grid Enterprise licence (one-time or annual subscription)

**Current classification:** COMPLIANT_WITH_MINOR_GAPS (workaround works for flat lists)
**Recommended:** Update spec to document the workaround; add roadmap item for Enterprise if grouped views are required

---

### CONTRADICTION-02: `.skip.ts` Exclusion Mechanism — Not in Spec

**Spec:** No `.skip.ts` mechanism defined. Spec expects fully implemented pages.

**Implementation:** 26 `.skip.ts` files silently exclude page implementations from TypeScript compilation. Router imports these stub files without error. Pages appear to be "present" in routes but render stubs or incomplete functionality.

**Contradiction:** The spec assumes all imported components are functional. The `.skip.ts` pattern creates invisible capability gaps — a page at a route URL appears reachable but is non-functional, with no error message or placeholder for the user.

**Debt characteristics:**
- Not documented in spec or AGENTS.md
- Zero runtime indication of stub state
- TypeScript `type-check` passes by excluding these files — creates false confidence
- 3 of the 26 `.skip.ts` files contain `node:test` tests that will never run

**Resolution:** 
- Short term: Add `EngineeringNotice` component to all stub pages to make the stub state visible to users
- Long term: Replace `.skip.ts` stubs with working implementations; remove mechanism entirely

---

### CONTRADICTION-03: `toast.ts` / `toastStore.ts` — In-Memory Stub

**Spec:** Toast notifications should use PatternFly 6 `AlertGroup` component for accessible, dismissible notifications

**Implementation:** `toastStore.ts` is an in-memory Zustand store for toast messages. It uses `Math.random()` for ID generation. No `AlertGroup` renders the toasts in the app shell.

**Contradiction:** The spec's `toast` system should produce visible, accessible alerts. The current store holds toast data but nothing renders it — all toasts silently disappear.

**Evidence:** `ToastStack.test.ts` exists — tests pass, but the rendered output is not visible in the running app because `<ToastStack>` may not be mounted in `AppLayout.tsx`.

**Resolution:** Mount `<ToastStack>` or `<AlertGroup>` in AppLayout.tsx; wire it to the Zustand store.

---

### CONTRADICTION-04: MASTER_PLAN.md Contains Old Branding Names

**Spec:** The project is rebranded as "HiveArmor" throughout all documentation, code, and UI

**Contradiction:** `.plan/MASTER_PLAN.md` contains legacy names including:
- "ArmorSight" (previous product name)
- `utm_token` (UTMStack-era token key)

**Evidence:** From `.plan/MASTER_PLAN.md` content (referenced in CLAUDE.md / AGENTS.md)

**Impact:** Confusing for new developers reading the plan; may cause copy-paste errors where old branding appears in new features

**Resolution:** Update MASTER_PLAN.md to use HiveArmor branding consistently; replace `utm_token` references with `hivearmor_auth_token`

---

### CONTRADICTION-05: DEBT-14 — Ephemeral JWT Key

**Spec:** Authentication sessions should persist across backend restarts

**Implementation:** `JwtKeyService.java` (backend) generates a new signing key on every application startup. All active sessions are immediately invalidated when the backend restarts.

**Contradiction:** This creates an operationally unacceptable situation where:
- Planned deployments log out all active analysts
- Emergency restarts during an incident clear all active sessions
- Frontend correctly handles the resulting 401 but user experience is broken

**Required fix:** Store JWT signing key in environment variable or database; never generate at startup.

**Priority: P0** — Blocks production reliability

---

### CONTRADICTION-06: Three `.skip.ts` Files Use `node:test` Instead of Vitest

**Spec:** All tests use Vitest (`import { describe, it, expect } from 'vitest'`)

**Implementation:** Three `.skip.ts` test files use `node:test` (Node.js built-in test runner) and `node:assert/strict`:
- `IncidentDetailPage.skip.ts:6-7`
- `incidents.service.skip.ts:7-9`
- `alerts.service.skip.ts` (inferred same pattern)

**Contradiction:** Vitest will never discover these tests (`.skip.ts` files are excluded from TypeScript compilation). These tests contribute 0% to the coverage report.

**Additional contradiction in incidents.service.skip.ts:** Uses `readFileSync` to read source files directly — a structural test pattern incompatible with the jsdom environment that Vitest uses.

**Resolution:** Convert to `vitest` imports; use proper mocking; rename from `.skip.ts` to `.test.ts`

---

### CONTRADICTION-07: DashboardStudioPage.skip.ts — No Active Counterpart

**Spec:** `DashboardStudioPage` at routes `/dashboards/studio` and `/dashboards/:id/edit` is a fully functional dashboard editor

**Implementation:** `DashboardStudioPage.skip.ts` exists; `DashboardStudioRenderers.skip.ts` exists; there is NO active `DashboardStudioPage.tsx` that these skip files are "temporarily" replacing.

**Contradiction:** Unlike other `.skip.ts` pairs where the `.tsx` file exists alongside, here the studio page has NO `.tsx` counterpart. The route leads to a stub with no upgrade path visible in the code.

**Resolution:** Build `DashboardStudioPage.tsx` from scratch; `DashboardStudioRenderers.tsx` for widget renderer registry

---

### CONTRADICTION-08: `active-directory.service.ts` — Fully Stubbed Service

**Spec:** Active Directory integration is planned for `/posture/active-directory`

**Implementation:** `active-directory.service.ts` exists as a service file but ALL methods return mock/stub data. No `/api/ha-ad/*` endpoints exist in the backend. The service is a non-functional stub.

**Evidence:** ActiveDirectoryPage.skip.ts also excludes the page component.

**Contradiction:** The service file suggests this feature is "in development" but there is zero backend support and the page is fully excluded.

**Resolution:** 
- Mark `active-directory.service.ts` as PLACEHOLDER in comments
- Do not import it into active code until backend is ready
- Remove from router or show "Coming Soon" page

---

### CONTRADICTION-09: `GAP_SEC_06_RESOLVED = false` — Frontend-Only Gate with No Backend Enforcement

**Spec (rules):** Security gates should be enforced at the backend; frontend gates are advisory only

**Implementation:** `DashboardViewPage.tsx:33`:
```typescript
const GAP_SEC_06_RESOLVED = false;
```

This constant gates ALL visualization rendering. When `false`, widgets show "security fix pending" message instead of data.

**Contradiction:** The gate is frontend-only. If an attacker bypasses the frontend (e.g., calls the API directly), they can still execute arbitrary OpenSearch queries via `POST /api/ha-visualizations/run` with no authorization. The frontend gate does NOT protect the backend.

**Additional contradiction:** The constant is named for "GAP-SEC-06" but the backend capability matrix uses "SEC-GAP-15" for `/api/ha-visualizations/run`. Naming inconsistency.

**Resolution:**
- Backend fix: Add `@PreAuthorize("hasAnyRole('ANALYST', 'SOC_MANAGER', 'ADMIN')")` to `VisualizationsResource.java`
- Frontend: Set `GAP_SEC_06_RESOLVED = true` ONLY after confirming the backend fix is deployed
- Document the naming: GAP-SEC-06 (in-code) == SEC-GAP-15 (in capability matrix)

---

### CONTRADICTION-10: `SearchHuntPage.skip.ts` Only — No Active SearchHuntPage.tsx

**Spec:** Full Search & Hunt page at `/hunt` with Monaco query editor, histogram, results grid

**Implementation:** `SearchHuntPage.skip.ts` exists; `SearchHuntPage.tsx` is imported in router but its content is unknown — the router imports `SearchHuntPage` which likely resolves to the `.skip.ts` stub since no active `.tsx` was found.

**Contradiction:** This is the same as CONTRADICTION-07 — the skip file has no active counterpart. The `/hunt` route renders a stub with no functionality.

**Resolution:** Implement `SearchHuntPage.tsx` as the primary search interface; remove `.skip.ts`

---

## Technical Debt Register

| Debt ID | Type | Description | File(s) | Impact | Effort | Priority |
|---|---|---|---|---|---|---|
| DEBT-01 | Architecture | 26 .skip.ts files silently hiding features | 26 files listed in doc 03 | High — invisible capability gaps | Large (requires implementing all) | P0-P1 |
| DEBT-02 | Architecture | No route code splitting — all pages eagerly loaded | router/index.tsx | Medium — bundle size penalty | Small | P1 |
| DEBT-03 | Security | DEBT-14: ephemeral JWT key | Backend JwtKeyService | High — all sessions invalidated on restart | Small (backend) | P0 |
| DEBT-04 | Security | 18 SEC-GAP categories — missing @PreAuthorize | Multiple backend resources | Critical — authorization bypassed | Large (backend) | P0 |
| DEBT-05 | Code quality | Direct `fetch()` in DashboardViewPage bypasses apiClient.ts | DashboardViewPage.tsx:160 | Low — inconsistent error handling | Small | P3 |
| DEBT-06 | Code quality | PlaybookBuilderPage comment says "backend not implemented" (wrong) | PlaybookBuilderPage.tsx:35 | Low — confusing for developers | Tiny | P3 |
| DEBT-07 | Code quality | 20+ files with rgba() instead of color-mix() | Multiple .tsx files | Low — token system bypassed | Small (systematic find/replace) | P1 |
| DEBT-08 | Testing | 3 .skip.ts files with node:test (dead tests) | .skip.ts files | High — false coverage confidence | Small | P1 |
| DEBT-09 | Testing | No Storybook, no Playwright, no axe-core | Project-wide | High — zero visual/E2E/a11y testing | Large | P1 |
| DEBT-10 | UX | StatusDock duplicated inline in CommandCenterPage | CommandCenterPage.tsx:269-304 | Low — maintenance burden | Tiny | P3 |
| DEBT-11 | UX | toastStore.ts stub — no <ToastStack> mounted in AppLayout | toastStore.ts, AppLayout.tsx | Medium — no visible notifications | Small | P2 |
| DEBT-12 | Branding | Old names (ArmorSight, utm_token) in MASTER_PLAN.md | .plan/MASTER_PLAN.md | Low — developer confusion | Tiny | P3 |
| DEBT-13 | Architecture | 3 deprecated routes (-old suffix) | router/index.tsx | Low — bundle size + confusion | Tiny | P3 |
| DEBT-14 | Architecture | Inline styles throughout instead of CSS Modules | 50+ component files | Medium — no hover/focus CSS pseudo-selectors | Large | P2 |
| DEBT-15 | Architecture | Non-interactive `<div onClick>` elements (keyboard inaccessible) | HiveIntelligencePage + others | High — WCAG A failure | Medium | P1 |
| DEBT-16 | Security | GAP_SEC_06_RESOLVED naming inconsistency (SEC-GAP-06 vs SEC-GAP-15) | DashboardViewPage.tsx:33 | Low — developer confusion | Tiny | P3 |
| DEBT-17 | Architecture | Dashboard save uses direct fetch() instead of apiClient | DashboardViewPage.tsx:160 | Low — no 401 auto-logout | Tiny | P3 |
| DEBT-18 | UX | auth.store.ts getDefaultLanding sends READ_ONLY to /queue | auth.store.ts:71 | Medium — READ_ONLY users can't access queue | Tiny | P2 |
