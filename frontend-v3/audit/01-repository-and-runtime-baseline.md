# Audit Document 01 — Repository and Runtime Baseline
## HiveArmor frontend-v3 Phase 1A Audit
**Generated:** 2026-07-25  
**Auditor:** Phase 1A automated baseline agent  
**Repo root:** `/Users/encryptshell/GIT/UTMStack-11`  
**Target:** `frontend-v3/`

---

## 1. Repository State

### Active Branch
```
* main
```
Other local branches: `feature/changeForRelese`, `release/v11.0.1`, `claude/frosty-satoshi-186e5f`, `worktree-s03-api-contract`, `worktree-s05-auth-pages`, `worktree-s06-app-shell`

### Last 10 Commits (git log --oneline -10)
```
b749b48 fix: standardise all OpenSearch index names to v3-hive-* format
0008f00 fix: OpenSearch index names, engine socket, missing endpoints
f681e80 fix(plugins,local-dev): fix compliance index name and missing plugins.yaml bind-mount
c289bba fix(local-dev): add ep_sockets shared volume to fix eventprocessor-worker unhealthy
89d19c2 feat(sprint-08,09,10): plugins, entity-graph service, filters, local-dev infra
ac95e37 feat(sprint-04,05,06,09,10): frontend — live data, AI, compliance, entity graph, OTel
d0106a5 feat(sprint-04,05,06,07): backend services — UBA, compliance, AI, sigma, incident
e5174f4 feat(sprint-03,08,09,10): detection engines, Kafka consumer, OTLP, graph enrichment
bc29fe8 feat(sprint-02): SQL injection fix, audit trail, event-processor security
0dc6630 feat(sprint-02): API key hashing + JWT signing key persistence
```

### Git Status — Dirty Files
`frontend-v3/` shows as **untracked** (`?? frontend-v3/`) — the entire `frontend-v3/` directory is new and has not yet been committed to the repository. All contents are untracked.

Post-command mutation check: `git status --short frontend-v3/` returns `?? frontend-v3/` — **no source files were mutated by the audit commands**.

---

## 2. Stack Inventory

All versions from `frontend-v3/package.json`:

### Runtime Dependencies
| Package | Version |
|---|---|
| `@monaco-editor/react` | 4.7.0 |
| `@patternfly/react-core` | 6.6.0 |
| `@patternfly/react-icons` | 6.6.0 |
| `@tanstack/react-query` | 5.101.2 |
| `ag-grid-community` | 36.0.1 |
| `ag-grid-react` | 36.0.1 |
| `echarts` | 6.1.0 |
| `echarts-for-react` | 3.0.6 |
| `gridstack` | 13.0.0 |
| `lucide-react` | 0.468.0 |
| `monaco-editor` | 0.55.1 |
| `react` | 18.3.1 |
| `react-dom` | 18.3.1 |
| `react-router-dom` | 6.25.1 |
| `reactflow` | ^11.11.4 |
| `zustand` | 5.0.14 |

### Dev Dependencies
| Package | Version |
|---|---|
| `@testing-library/dom` | ^10.4.1 |
| `@testing-library/jest-dom` | 6.4.6 |
| `@testing-library/react` | 16.0.0 |
| `@testing-library/user-event` | 14.5.2 |
| `@types/jest` | ^30.0.0 |
| `@types/node` | ^26.1.1 |
| `@types/react` | 18.3.3 |
| `@types/react-dom` | 18.3.0 |
| `@typescript-eslint/eslint-plugin` | 7.15.0 |
| `@typescript-eslint/parser` | 7.15.0 |
| `@vitejs/plugin-react` | 4.3.1 |
| `@vitest/coverage-v8` | 4.1.10 |
| `esbuild` | ^0.21.5 |
| `eslint` | 8.57.0 |
| `eslint-plugin-import` | 2.29.1 |
| `eslint-plugin-react` | 7.34.3 |
| `eslint-plugin-react-hooks` | 4.6.2 |
| `eslint-plugin-react-refresh` | 0.4.7 |
| `jsdom` | 24.1.1 |
| `typescript` | 5.9.3 |
| `vite` | 8.1.5 |
| `vitest` | 4.1.10 |

**Design notes:** PatternFly 6.6.0, AG Grid 36, ECharts 6.1, GridStack 13, Zustand 5, React Router 6 — all match the technology mandates in `.cursor/rules/hivearmor.mdc`.

---

## 3. Available npm Scripts

| Script | Command | Ran in Audit | Result |
|---|---|---|---|
| `dev` | `vite` | Yes (already running) | PASS — listening on :3000 |
| `build` | `tsc --noEmit && node scripts/build.mjs` | Yes | PASS (exit 0) |
| `lint` | `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0` | Yes | PASS (exit 0) |
| `type-check` | `tsc --noEmit` | Yes | PASS (exit 0) |
| `test` | `vitest run` | Yes | PASS (48 files, 204 tests) |
| `test:watch` | `vitest watch` | Not run | — |
| `test:coverage` | `vitest run --coverage` | Not run | — |
| `preview` | `vite preview` | Not run | — |

All four CI gate commands (`lint`, `type-check`, `test`, `build`) **pass** with zero errors.

---

## 4. Baseline Command Outcomes

### 4.1 `npm run lint`
```
Working directory: frontend-v3/
Command: eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0
Exit code: 0
Warnings: 0
Errors: 0
Notes: npm warns "Unknown env config devdir" (npm config cosmetic issue, not ESLint)
Result: PASS
```

### 4.2 `npm run type-check`
```
Working directory: frontend-v3/
Command: tsc --noEmit
Exit code: 0
TypeScript errors: 0
Duration: ~5s
Result: PASS
```

### 4.3 `npm run test`
```
Working directory: frontend-v3/
Command: vitest run
Exit code: 0
Test files: 48 passed (48)
Tests: 204 passed (204)
Duration: 3.11s (transform 2.02s, setup 3.36s, import 5.58s, tests 2.51s, environment 15.02s)
Warnings:
  - "[vite] warning: `esbuild` option was specified by vite:react-babel plugin. Deprecated, use `oxc` instead."
  - "[vite] warning: `optimizeDeps.esbuildOptions` option deprecated, use `optimizeDeps.rolldownOptions` instead."
  - "Both esbuild and oxc options were set. oxc options will be used."
Result: PASS
```

**Deprecation warnings** (non-blocking): These warnings are from `@vitejs/plugin-react` (4.3.1) reporting that the `esbuild` JSX option is deprecated in favour of `oxc`. No tests fail as a result. The configuration in `vite.config.ts` sets `esbuild.jsx: 'automatic'` which triggers this. This is a future maintenance item for when `@vitejs/plugin-react` drops the esbuild path entirely.

### 4.4 `npm run build`
```
Working directory: frontend-v3/
Command: tsc --noEmit && node scripts/build.mjs
Exit code: 0
Output:
  Building JS bundle…
  Building CSS bundle…
  ✓ Build complete → dist/
    dist/assets/index.js  4228kb (4.1 MB uncompressed; 18 MB with source map)
    dist/assets/index.css 3kb
    dist/index.html
Result: PASS
```

**Note on bundle size:** `dist/assets/index.js` is 4.1 MB uncompressed. This is a single-chunk build — no code-splitting is configured. For a production SIEM dashboard this is acceptable, but code-splitting (per route or per heavy library like monaco/ag-grid/echarts) would improve initial load time.

---

## 5. Build Artifacts

`dist/` contents after successful build:
```
dist/
├── assets/
│   ├── index.js       (4228 KB — entire app bundle, no code-split)
│   ├── index.js.map   (18 MB — source map, not served in prod)
│   └── index.css      (3 KB — compiled tokens + global styles)
├── favicon.svg
└── index.html
```

No chunked assets, no lazy-loaded routes. Code-splitting is a future optimisation opportunity.

---

## 6. `.skip.ts` File Inventory

The `tsconfig.json` `exclude` array contains `["**/*.skip.ts"]`. This means all `.skip.ts` files are **excluded from TypeScript compilation and from Vitest** (which respects the tsconfig exclude). These are test files authored using `node:test` / `assert` instead of Vitest — they cannot run under the project's test runner and were intentionally quarantined.

**26 `.skip.ts` files found** across `src/`:

| File | Feature / Session | Active `.tsx` Counterpart? | Notes |
|---|---|---|---|
| `components/engineering-notice/EngineeringNotice.skip.ts` | S34 | ✅ `EngineeringNotice.tsx` | Uses node:test |
| `hooks/useOpenAlertCount.skip.ts` | hooks | ✅ `useOpenAlertCount.ts` | Uses node:test |
| `pages/admin/users/AdminUsersPage.skip.ts` | ADM-01 | ✅ `AdminUsersPage.tsx` | Uses node:test |
| `pages/analyst-queue/AnalystQueuePage.skip.ts` | CMD-02 | ✅ `AnalystQueuePage.tsx` | Uses node:test |
| `pages/analyst-queue/components/QueueToolbar.skip.ts` | CMD-02 | ✅ `QueueToolbar.tsx` | Uses node:test |
| `pages/analyst-queue/components/SseBanner.skip.ts` | CMD-02 | ✅ `SseBanner.tsx` | Uses node:test |
| `pages/correlated-findings/CorrelatedFindingDetailPage.skip.ts` | CFD | ✅ `CorrelatedFindingDetailPage.tsx` | Uses `node:assert/strict` |
| `pages/correlated-findings/CorrelatedFindingsPage.skip.ts` | CFD | ✅ `CorrelatedFindingsPage.tsx` | Uses `node:assert/strict` |
| `pages/dashboards/DashboardStudioPage.skip.ts` | S32 | ✅ `DashboardStudioPage.tsx` | Uses node:test |
| `pages/dashboards/DashboardStudioRenderers.skip.ts` | S33 | ❌ No `DashboardStudioRenderers.tsx` exists | References non-existent module |
| `pages/detection-rules/DetectionRulesPage.skip.ts` | S22 / DEF-01 | ✅ `DetectionRulesPage.tsx` | Uses node:test |
| `pages/detection-rules/RuleEditorPage.skip.ts` | S23 | ✅ `RuleEditorPage.tsx` | Uses node:test |
| `pages/incidents/IncidentDetailPage.skip.ts` | CMD-04 | ✅ `IncidentDetailPage.tsx` | Uses node:test |
| `pages/incidents/IncidentListPage.skip.ts` | incidents | ✅ `IncidentListPage.tsx` | Uses node:test |
| `pages/posture/AssetsPage.skip.ts` | posture | ✅ `posture/assets/AssetsPage.tsx` | Skip in wrong dir level |
| `pages/posture/VulnerabilitiesPage.skip.ts` | GAP-BE-01/03 | ✅ `posture/vulnerabilities/VulnerabilitiesPage.tsx` | Skip in wrong dir level |
| `pages/posture/active-directory/ActiveDirectoryPage.skip.ts` | POS-08 | ✅ `ActiveDirectoryPage.tsx` | Uses node:test |
| `pages/reports/AfterActionReportsPage.skip.ts` | S34 | ✅ `AfterActionReportsPage.tsx` | Uses node:test |
| `pages/reports/IncidentReportsPage.skip.ts` | S34 | ✅ `IncidentReportsPage.tsx` | Uses node:test |
| `pages/reports/SitrepReportPage.skip.ts` | S34 | ✅ `SitrepReportPage.tsx` | Uses node:test |
| `pages/response/ResponseActivityPage.skip.ts` | DEF-07 | ✅ `ResponseActivityPage.tsx` | Uses node:test |
| `pages/response/ResponsePlaybooksPage.skip.ts` | DEF-04 | ✅ `ResponsePlaybooksPage.tsx` | Uses node:test |
| `pages/search-hunt/SearchHuntPage.skip.ts` | INV-01 | ✅ `SearchHuntPage.tsx` | Uses node:test |
| `services/alerts.service.skip.ts` | alerts | ✅ `alerts.service.ts` | Uses node:test |
| `services/incidents.service.skip.ts` | incidents | ✅ `incidents.service.ts` | Uses node:test |
| `services/offenses.service.skip.ts` | offenses | ✅ `offenses.service.ts` | Uses node:test |

**Root cause:** Multiple earlier sessions authored tests using `node:test`/`assert` rather than Vitest. These were quarantined via the `.skip.ts` extension + tsconfig exclude. The project rule in `.cursor/rules/hivearmor.mdc` explicitly forbids `node:test` and requires Vitest. These 26 files represent **technical debt** — each should be rewritten using Vitest and renamed to `.test.ts`.

**Special case — `DashboardStudioRenderers.skip.ts`:** No counterpart `.tsx` file named `DashboardStudioRenderers` exists. This test file references a module that does not exist as a standalone file. It likely references widget renderer functions inside `DashboardStudioPage.tsx`. Requires investigation before rewrite.

---

## 7. Test File Inventory

### Active `.test.ts` / `.test.tsx` Files (48 files)

**Components (30 files):**
- `AccessDeniedState.test.ts`
- `AddFilterPopover.test.tsx`
- `AlertContextDrawer.test.tsx`
- `ConfidenceIndicator.test.tsx`
- `CronHumanLabel.test.ts`
- `DensitySelector.test.tsx`
- `EmptyState.test.ts`
- `EntityBadge.test.tsx`
- `ErrorState.test.ts`
- `EvidenceCard.test.tsx`
- `FieldSelectorPopover.test.tsx`
- `FilterBuilder.test.tsx`
- `HaButton.test.ts`
- `HaChart.test.tsx`
- `ConfirmationModal.test.ts`
- `HaFormGroup.test.ts`
- `HaModal.test.ts`
- `HaSelect.test.ts`
- `HaSwitch.test.ts`
- `HaTabs.test.ts`
- `HaToggleGroup.test.ts`
- `HaWizard.test.ts`
- `LoadingState.test.ts`
- `SeverityLabel.test.tsx`
- `SiemDataGrid.test.tsx`
- `SlaIndicator.test.tsx`
- `StatusLabel.test.tsx`
- `TenantBadge.test.tsx`
- `TimeRangeSelector.test.tsx`
- `ToastStack.test.ts`

**Hooks (1 file):**
- `useRowDensity.test.ts`

**Lib / Utilities (4 files):**
- `alertFilterFields.test.ts`
- `roles.test.ts`
- `severity.test.ts`
- `status.test.ts`

**Pages (5 files):**
- `alertsListDatasource.test.ts`
- `CommandCenterPage.test.ts`
- `DashboardCanvasPage.test.ts`
- `DashboardGalleryPage.test.ts`
- `ReportTemplatesPage.test.ts`
- `ScheduledReportsPage.test.ts`

**Services (2 files):**
- `constellation.service.test.ts`
- `entities.service.test.ts`

**Stores (4 files):**
- `alertStream.store.test.ts`
- `auth.store.test.ts`
- `sidebar.store.test.ts`
- `theme.store.test.ts`

**Types (1 file):**
- `constellation.types.test.ts`

### Test Runner Details
| Item | Value |
|---|---|
| Runner | Vitest 4.1.10 |
| Config file | `vitest.config.ts` |
| Environment | `jsdom` |
| Setup file | `src/test/setup.ts` (imports `@testing-library/jest-dom`) |
| Coverage provider | `v8` |
| Coverage scope | `src/lib/**`, `src/hooks/**`, `src/services/**` |
| Coverage threshold | Lines ≥ 80% |
| Total test files | 48 (all pass) |
| Total tests | 204 (all pass) |

### Coverage Gaps
Pages and components have test files for roughly 30 shared components but **zero Vitest tests for 20+ page-level components** (alerts, incidents, detection rules, investigations, response, etc.). These are exactly the pages covered by the 26 `.skip.ts` files. The actual coverage percentage for page-level code is near 0%.

---

## 8. Dev Server Configuration

| Item | Value |
|---|---|
| Port | 3000 (Vite dev server) |
| Process | Already running (PID 22459 observed via lsof) |
| Backend proxy | `/api/*` → `VITE_BACKEND_URL ?? http://localhost:8088` |
| Management proxy | `/management/*` → `VITE_BACKEND_URL ?? http://localhost:8088` |
| SSE stream handling | Custom `proxyRes` hook: sets `x-accel-buffering: no` and `cache-control: no-cache` for `text/event-stream` requests — prevents proxy buffering on SSE endpoints |
| changeOrigin | true |
| secure | false (HTTP dev, no TLS verification) |
| Build output | `dist/` |
| Source maps | Disabled in production build (`sourcemap: false`) |

---

## 9. TypeScript Configuration

| Setting | Value | Notes |
|---|---|---|
| `target` | `ES2020` | Modern target |
| `strict` | `true` | Full strict mode |
| `noUnusedLocals` | `true` | Enforced |
| `noUnusedParameters` | `true` | Enforced |
| `noFallthroughCasesInSwitch` | `true` | Enforced |
| `moduleResolution` | `bundler` | Vite-native |
| `verbatimModuleSyntax` | `true` | Requires `import type` for type-only imports |
| `isolatedModules` | `true` | Required for Vite/esbuild compatibility |
| `noEmit` | `true` | Compile checks only, no output |
| `jsx` | `react-jsx` | Automatic JSX runtime |
| `skipLibCheck` | `true` | Skips checking node_modules `.d.ts` |
| `include` | `["src"]` | |
| `exclude` | `["**/*.skip.ts"]` | Quarantines node:test files |

### Path Aliases
```
@/*           → src/*
@/components  → src/components/*
@/services    → src/services/*
@/hooks       → src/hooks/*
@/store       → src/store/*
@/lib         → src/lib/*
@/constants   → src/constants/*
@/types       → src/types/*
@/pages       → src/pages/*
```

---

## 10. Route Definitions

Routes are defined in `src/router/index.tsx` using `createBrowserRouter` (React Router v6). The app bootstraps auth from localStorage in `App.tsx` before rendering the router.

### Public Routes (no AuthGuard)
| Path | Component |
|---|---|
| `/login` | `LoginPage` |
| `/login/tfa` | `TfaPage` |
| `/access-denied` | `AccessDeniedPage` |

### Index Redirect
`/` → redirects to `/queue` (Analyst Queue)

### Protected Routes (AuthGuard with various role constraints)

| Path | Component | Required Roles |
|---|---|---|
| `/queue` | `AnalystQueuePage` | ANALYST, SOC_MANAGER, ADMIN |
| `/command` | `CommandCenterPage` | any authenticated |
| `/alerts` | `AlertsListPage` | any authenticated |
| `/alerts/severity` | `AlertSeverityBoardPage` | any authenticated |
| `/offenses` | `CorrelatedFindingsPage` | any authenticated |
| `/offenses/:id` | `CorrelatedFindingDetailPage` | any authenticated |
| `/incidents` | `IncidentListPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/incidents/:id` | `IncidentDetailPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/hunt` | `SearchHuntPage` | any authenticated |
| `/investigations` | `InvestigationsPage` | any authenticated |
| `/investigations/:id` | `InvestigationDetailPage` | any authenticated |
| `/entities` | `EntityListPage` | ANALYST, ADMIN |
| `/entities/:id` | `EntityDetailPage` | ANALYST, ADMIN |
| `/constellation` | `ThreatConstellationPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/intelligence` | `HiveIntelligencePage` | ANALYST, SOC_MANAGER, ADMIN |
| `/rules` | `DetectionRulesPage` | SOC_MANAGER, ADMIN |
| `/rules/new` | `RuleEditorPage` | SOC_MANAGER, ADMIN |
| `/rules/:id/edit` | `RuleEditorPage` | SOC_MANAGER, ADMIN |
| `/rules/:id/test` | `RuleTestPage` | SOC_MANAGER, ADMIN |
| `/response/playbooks` | `ResponsePlaybooksPage` | SOC_MANAGER, ADMIN |
| `/response/playbooks/new/build` | `PlaybookBuilderPage` | SOC_MANAGER, ADMIN |
| `/response/playbooks/:id/build` | `PlaybookBuilderPage` | SOC_MANAGER, ADMIN |
| `/response/activity` | `ResponseActivityPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/response/authority` | `ResponseAuthorityPage` | ADMIN only |
| `/posture/assets` | `AssetsPage` | any authenticated |
| `/posture/identities` | `IdentitiesPage` | any authenticated |
| `/posture/active-directory` | `ActiveDirectoryPage` | SOC_MANAGER, ADMIN |
| `/posture/exposure` | `ExposurePage` | any authenticated |
| `/posture/sensors` | `SensorGridPage` | ADMIN only |
| `/posture/vulnerabilities` | `VulnerabilitiesPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/posture/readiness` | `ReadinessMatrixPage` | ANALYST, SOC_MANAGER, ADMIN |
| `/compliance` | `CompliancePage` | any authenticated |
| `/dashboards` | `DashboardGalleryPage` | any authenticated |
| `/dashboards/studio` | `DashboardStudioPage` | any authenticated |
| `/dashboards/:id` | `DashboardViewPage` | any authenticated |
| `/dashboards/:id/edit` | `DashboardStudioPage` | any authenticated |
| `/dashboards/metrics/builder` | `MetricsBuilderPage` | any authenticated |
| `/reports/sitrep` | `SitrepReportPage` | any authenticated |
| `/reports/incidents` | `IncidentReportsPage` | any authenticated |
| `/reports/after-action` | `AfterActionReportsPage` | any authenticated |
| `/reports/scheduled` | `ScheduledReportsPage` | any authenticated |
| `/reports/templates` | `ReportTemplatesPage` | any authenticated |
| `/admin/users` | `AdminUsersPage` | ADMIN only |
| `/admin/tenants` | `TenantsPage` | ADMIN only |
| `/admin/tenants-old` | `AdminTenantsPage` | ADMIN only (legacy) |
| `/admin/retention` | `RetentionPage` | ADMIN only |
| `/admin/data-parsing` | `DataParsingPage` | ADMIN only |
| `/admin/integrations` | `AdminIntegrationsPage` | ADMIN only |
| `/admin/notifications` | `AdminNotificationsPage` | ADMIN only |
| `/admin/connection-keys` | `AdminConnectionKeysPage` | ADMIN only |
| `/admin/audit` | `AuditPage` | ADMIN only |
| `/admin/audit-old` | `AdminAuditPage` | ADMIN only (legacy) |
| `/admin/settings` | `PlatformSettingsPage` | ADMIN only |
| `/admin/settings-old` | `AdminSettingsPage` | ADMIN only (legacy) |

**Notes:**
- The audit was directed at several route paths that do not match the router: `/alerts/board` → actual path is `/alerts/severity`; `/search` → actual path is `/hunt`; `/correlated-findings` → actual path is `/offenses`; `/detection-rules` → actual path is `/rules`.
- Legacy `-old` routes exist for tenants, audit, and settings — these are preserved for backward compatibility during migration.

---

## 11. Runtime Limitations

| Item | Status | Reason |
|---|---|---|
| Playwright MCP live screenshots | **NOT available** in this session | Playwright MCP is configured in `.mcp.json` but was not active in this agent session (no MCP servers connected). Prior session screenshots exist in `.playwright-mcp/` and `local-dev/`. |
| `npm run test:coverage` | Not run | Only verification gates run; not required for Phase 1A |
| `npm run test:watch` | Not run | Non-interactive environment |
| Backend endpoint responses | Partially verified | Backend is live at :8088; auth works; individual API endpoints not exercised beyond auth |
| `.skip.ts` test execution | Cannot run | These files use `node:test` which is incompatible with the Vitest runner |
| Source map analysis | Not performed | 18 MB `.js.map` not analysed for dead code |
