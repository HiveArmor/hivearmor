# 20 — Test and Acceptance Plan
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit  
**Evidence base:** Doc 13 (Testing and Quality audit), TI-01 through TI-06 (doc 14), A11Y gaps (doc 12)

---

## 1. Unit Tests

### Current State
- 204 tests passing across hooks, lib, services, and components
- 3 test files use `node:test` and are never discovered by Vitest (TI-01)
- No tests in `src/pages/` directory — 182 page files have 0 unit test coverage
- Hook coverage: `useAlertStream`, `useEpsStream`, `useAuthBootstrap` untested (TI-06)

### Target Coverage by Horizon

| Horizon | Target Coverage | Priority Files |
|---|---|---|
| H0 | Convert 3 dead test files; maintain 204+ count | `incidents.service.test.ts`, `alerts.service.test.ts` |
| H1 | 60% statement coverage on `src/lib/` and `src/services/` | `severity.ts`, `status.ts`, `roles.ts`, `apiClient.ts` |
| H2 | 70% on new page services; test all new hooks | `search.service.ts`, `evidence.service.ts` |
| H3 | 70% on detection service, SOAR service | `detection.service.ts`, `soar.service.ts` |
| H4+ | 80%+ on all `src/lib/`, `src/services/`, `src/hooks/` | Full coverage |

### Required Unit Test Files (by Horizon)

**H0:**
- `src/services/incidents.service.test.ts` — replace node:test stub; mock `apiClient`; test all CRUD methods
- `src/services/alerts.service.test.ts` — replace node:test stub; test pagination, filter params
- Hook tests: `src/hooks/useAuthBootstrap.test.ts`, `src/hooks/useAlertStream.test.ts`, `src/hooks/useEpsStream.test.ts`

**H1:**
- `src/components/toast/ToastStack.test.tsx` — verify renders PatternFly AlertGroup on store update
- `src/components/app-layout/AppLayout.test.tsx` — verify skip nav link renders

**H2:**
- `src/services/search.service.test.ts`
- `src/services/evidence.service.test.ts`
- `src/pages/incidents/IncidentDetailPage.test.tsx`
- `src/pages/search/SearchHuntPage.test.tsx`

---

## 2. Component Tests

### Target: All `Ha*` Wrapper Components

Each shared `Ha*` component requires:
1. A Vitest component test using `@testing-library/react`
2. A Storybook story (all variants)
3. An axe-core accessibility assertion

Priority order for component tests:

| Priority | Component | Why |
|---|---|---|
| 1 | `HaChart.tsx` | aria-label gap (A11Y-03); used everywhere |
| 2 | `SiemDataGrid.tsx` | Core data display; InfiniteRowModel bridge |
| 3 | `HaDrawer.tsx` | Alert and incident context drawers |
| 4 | `FilterChipsRow.tsx` | Used in alerts and search |
| 5 | `StatusDock.tsx` | Always visible; SSE state display |
| 6 | `LiveModeToggle.tsx` | Used in alert grids |
| 7 | `HaButton.tsx` | All interactive actions |
| 8 | `HaBadge.tsx` | Severity/status display |
| 9 | `HaMasthead.tsx` | Shell header |
| 10 | `HaNavigation.tsx` | Sidebar navigation |

### Acceptance Criteria per Component
1. All variant stories render in Storybook without console errors
2. `axe()` assertion in Vitest returns 0 violations
3. Keyboard navigation test: focus, Enter/Space activation where applicable
4. Error/empty/loading states covered

---

## 3. Integration Tests

Integration tests validate TanStack Query + service + API client paths end-to-end within the frontend (mocked at the HTTP boundary using MSW).

### Required Integration Tests

| Test File | What It Covers | Mock Layer |
|---|---|---|
| `src/services/__tests__/alerts-integration.test.ts` | Pagination, filter params, X-Total-Count handling | MSW mock `/api/ha-alerts` |
| `src/services/__tests__/incidents-integration.test.ts` | CRUD lifecycle, error states | MSW mock `/api/ha-incidents/*` |
| `src/services/__tests__/auth-integration.test.ts` | Login → localStorage → headers on next request | MSW mock `/api/authenticate` |
| `src/services/__tests__/sse-integration.test.ts` | SSE connect, event parse, reconnect, store update | Mock EventSource |
| `src/services/__tests__/tenant-integration.test.ts` | `X-Tenant-ID` injected when selectedTenantId set | MSW inspect headers |

### MSW Setup
- Install: `msw@2` (browser and Node modes)
- Handlers in `src/test/mocks/handlers.ts`
- Server in `src/test/mocks/server.ts` (Node mode for Vitest)
- Worker in `src/test/mocks/browser.ts` (browser mode for Storybook)

---

## 4. E2E Tests (Playwright)

### Critical User Journeys (must be covered before any production deployment)

| Test | File | Steps | Assertions |
|---|---|---|---|
| Login | `e2e/login.spec.ts` | Navigate /login → enter credentials → submit | Redirected to /command; JWT in localStorage |
| Alert triage | `e2e/alert-triage.spec.ts` | Navigate /alerts → click alert → change status → add note | Status badge updates; note persists on refresh |
| Incident creation | `e2e/incident-creation.spec.ts` | Navigate /incidents → New Incident → fill form → submit | Incident appears in list |
| Search query | `e2e/search-query.spec.ts` | Navigate /hunt → enter NL query → submit | Results grid populates |
| Rule activation | `e2e/rule-activation.spec.ts` | Navigate /rules → find inactive rule → toggle active | Activation confirmed via API |

### Playwright Configuration
```
playwright.config.ts targets:
- baseURL: http://localhost:5173 (dev) or http://localhost:4173 (preview)
- browsers: chromium (required), firefox (optional), webkit (optional)
- reporter: html (local), github (CI)
- retries: 2 on CI
- timeout: 30s per test
```

### CI Integration
- Run `npm run test:e2e` (playwright test) in PR check workflow
- Gate: All E2E tests must pass before merge to `release/**`
- Screenshots on failure automatically uploaded as CI artifacts

---

## 5. Storybook

### Setup Procedure
1. Install `@storybook/react-vite@8` (compatible with Vite 8)
2. Configure `main.ts` to load `src/**/*.stories.tsx`
3. Configure `preview.ts` to import `tokens.css` and PatternFly base styles
4. Add MSW addon for stories that require API data

### Story Structure per Component
```
ComponentName.stories.tsx:
  export default { title: 'HiveArmor/ComponentName', component: ComponentName }
  export const Default = {}
  export const Loading = { args: { isLoading: true } }
  export const Error = { args: { isError: true } }
  export const Empty = { args: { data: [] } }
  // variant stories for each prop combination
```

### Design Token Validation
- Storybook `preview.ts` must import `tokens.css` — all stories must render within token constraints
- No story should pass `style={{ backgroundColor: '#070A0F' }}` — must use `var(--ha-background)`
- Add Storybook a11y addon for visual accessibility checks in the Storybook UI

---

## 6. Visual Regression

### Tooling Recommendation: Chromatic
- Integrates with Storybook; runs on every PR
- Baselines stored in Chromatic cloud
- Alternative if no Chromatic budget: Playwright `toHaveScreenshot()` with committed PNG baselines

### Baseline Procedure
1. Complete H1 (Storybook scaffold)
2. Establish first baseline: run Chromatic once in `--auto-accept-changes` mode
3. All future PRs compare against that baseline
4. Diff threshold: 0.1% pixel change triggers review

### Golden Screen Coverage
Per `.plan/frontend-v3-spec/visual-approval/golden-screen-index.md` requirement (TI-05):
- Target: All 550 specified golden screens
- Current: 0/550
- Phase 1 priority (H1): 20 screens (all Ha* components, Login, Command Center, Alerts list, Incident list)
- Phase 2 priority (H2): +100 screens (core SOC workflows)
- Full coverage: Horizon 4

---

## 7. Accessibility

### axe-core Integration in Vitest
```typescript
// src/test/setup-axe.ts
import { configureAxe } from 'vitest-axe';
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });
// (color-contrast disabled until dark theme tokens are fully validated)
```

Each page-level test:
```typescript
import { axe } from '@/test/setup-axe';
it('has no a11y violations', async () => {
  const { container } = render(<PageComponent />);
  expect(await axe(container)).toHaveNoViolations();
});
```

### WCAG 2.2 AA Acceptance Criteria

| WCAG Criterion | Current Status | Required Fix |
|---|---|---|
| 1.1.1 Non-text Content | FAIL — HaChart missing aria-label | H1-FND-03 batch |
| 2.4.1 Bypass Blocks | FAIL — No skip nav | H1-FND-03 batch |
| 4.1.3 Status Messages | PARTIAL — SSE alerts not in aria-live | FE-16 in H1 |
| 2.3.3 Animation | NOT IMPLEMENTED — no prefers-reduced-motion in ECharts | FE-17 in H1 |
| 1.4.3 Contrast | NEEDS_VERIFICATION — dark theme tokens need audit | H1 |

All 5 above must reach PASS before any production deployment.

---

## 8. Golden Screen Coverage

Per spec requirement, key routes requiring golden screen sign-off:

| Route | Priority | Notes |
|---|---|---|
| `/login` | P0 | Auth entry point |
| `/command` | P0 | Mission Control |
| `/alerts` | P0 | Primary analyst view |
| `/alerts/severity` | P1 | Severity board |
| `/incidents` | P0 | Incident list |
| `/incidents/:id` | P1 | Incident detail (H2) |
| `/hunt` | P1 | Search (H2) |
| `/offenses` | P1 | Correlated findings |
| `/rules` | P1 | Detection rules (H3) |
| `/response/playbooks` | P1 | SOAR (H3) |
| `/dashboards` | P1 | Dashboard gallery |
| `/dashboards/:id` | P1 | Dashboard view |
| `/intelligence` | P1 | Hive Intelligence |

---

## 9. Performance

### Lighthouse CI Thresholds (required for production)

| Metric | Target | Current Estimate |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | Unknown — no measurement |
| INP (Interaction to Next Paint) | < 200ms | Unknown |
| CLS (Cumulative Layout Shift) | < 0.1 | Unknown |
| Performance score | ≥ 90 | Unknown |
| Accessibility score | ≥ 95 | Unknown |

### Bundle Size Budget

| Metric | Target | Current |
|---|---|---|
| Initial JS | < 500 KB | 4.1 MB (no code splitting) |
| Per-route chunk | < 150 KB | N/A (all eager) |
| Total assets | < 2 MB | 4.1 MB |

### Lighthouse CI Setup
- Install `@lhci/cli`
- Add `.lighthouserc.json` with thresholds above
- Run `lhci autorun` in PR check workflow against `npm run preview` server

---

## 10. Security Testing

### Endpoints to Fuzz in CI (OWASP ZAP Scope)

Priority endpoints for automated security scanning:

| Endpoint | Attack Vectors |
|---|---|
| `POST /api/authenticate` | Brute force, username enumeration |
| `POST /api/ha-alerts/status` | Privilege escalation (until H0-SEC-01 deployed) |
| `PUT /api/offenses/{id}` | Injection (Groovy — until H0-SEC-04 deployed) |
| `POST /api/ha-visualizations/run` | Injection (OpenSearch DSL — until H0-SEC-07 deployed) |
| `POST /api/ha-search/nl-query` | Prompt injection, query injection |
| `GET /api/ha-clients` | clientPass exposure (until H0-SEC-03 deployed) |

### OWASP ZAP Integration
- Run ZAP passive scan against local dev stack in CI nightly
- Run ZAP active scan in staging environment only (not prod)
- Alert on any new HIGH or CRITICAL findings
- Gate: ZAP scan must show 0 CRITICAL before release tag

### Frontend Security Headers (nginx)
Verify presence of:
- `Content-Security-Policy` — restrict script sources
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — restrict camera/microphone/geolocation
