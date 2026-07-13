# HiveArmor Frontend-v2 Changelog

All notable changes to `frontend-v2` are documented here.
Format: **[Date] — Category — Description — File(s) affected**

---

## 2026-07-12 — Sprint 6: HiveArmor Rebrand + Build Stabilisation

### Rebrand: ArmorSight / UTMStack → HiveArmor

#### Package & metadata
- `package.json` — name changed `armorsight` → `hivearmor`
- `src/app/layout.tsx` — page title/description updated to HiveArmor brand

#### Auth / localStorage keys
- `src/lib/api.ts` — localStorage key `utm_token` → `hivearmor_auth_token`
- `src/store/auth.ts` — sessionStorage key `armorsight_first_login` → `hivearmor_first_login`
- `src/store/theme.ts` — zustand persist name `armorsight-theme` → `hivearmor-theme`
- `src/components/layout/app-shell.tsx` — localStorage key `armorsight_theme` → `hivearmor_theme`
- `src/components/layout/sidebar.tsx` — zustand persist name `armorsight-sidebar` → `hivearmor-sidebar`

#### API paths (all 28 service files)
- All `/api/utm-*` endpoint paths → `/api/ha-*`
  - e.g. `/api/utm-alerts` → `/api/ha-alerts`, `/api/utm-incidents` → `/api/ha-incidents`, etc.
- `src/app/(app)/incidents/[id]/page.tsx` — removed legacy `auth_token` localStorage fallback; uses `hivearmor_auth_token` exclusively

#### HTTP headers
- `src/app/api/[...path]/route.ts` — forwarded response headers updated:
  `x-utmstack-error` → `x-hivearmor-error`, `x-utmstack-params` → `x-hivearmor-params`

#### Chart theme
- `src/lib/chart-theme.ts` — ECharts theme name `utmstack-dark` → `hivearmor-dark`

---

### Backend: Remove /api/utm-* deprecation bridges

All Sprint 4 dual-mapping `{"/ha-*", "/utm-*"}` arrays in Java controllers removed.
Only the canonical `/api/ha-*` path remains on each endpoint.

**Files changed:**
- `backend/.../web/rest/UtmAlertResource.java` — 5 dual mappings removed
- `backend/.../web/rest/chart_builder/UtmDashboardResource.java` — 6 dual mappings removed
- `backend/.../web/rest/incident/UtmIncidentResource.java` — all dual mappings removed
- `backend/.../web/rest/incident/UtmIncidentPriorityResource.java` — mapping updated
- `backend/.../web/rest/logstash_filter/UtmFilterResource.java` — mapping updated
- `backend/.../web/rest/idp_provider/IdentityProviderResource.java` — mapping + pagination URI updated
- `backend/.../config/SecurityConfiguration.java` — public path updated to `/api/ha-providers`

---

### CI: Remove Angular build job

- `.github/workflows/v11-deployment-pipeline.yml` — removed `build_frontend` job (Angular legacy build) and removed it from the `all_builds_complete` gate

---

### Docs updated
- `CLAUDE.md` — full rewrite with HiveArmor branding, correct API prefix, localStorage key, Go module paths, plugin naming, Docker image names, DB name
- `AGENTS.md` — full rewrite with HiveArmor branding, correct ldflags paths, plugin naming, container registry
- `README.md` — complete rewrite replacing UTMStack content with HiveArmor

---

## 2026-07-12 — Build Stabilisation: ESLint + TypeScript Fixes

The production build (`npm run build`) runs ESLint in strict mode — warnings that
block compilation must be eliminated. This section documents every fix applied.

### Rule: `@typescript-eslint/no-unused-vars`

> **Important for future developers:** This project's ESLint config does **NOT**
> honour the `_` prefix convention. Variables prefixed with `_` are still flagged
> as errors. Use one of the patterns below instead.

**Fix patterns (in priority order):**

| Scenario | Correct fix |
|---|---|
| Unused `useState` setter | `const [value] = useState(...)` — drop setter entirely |
| Unused catch binding | `catch {` — optional catch (ES2019+, valid in TS) |
| Unused callback param (can be removed from signature) | Remove the param |
| Dead computed value (never read downstream) | Delete the statement |
| Unused destructured prop (fixed public API) | `// eslint-disable-next-line @typescript-eslint/no-unused-vars` |
| Unused omit-rest destructure (e.g. `const { id: _id, ...rest }`) | `// eslint-disable-next-line @typescript-eslint/no-unused-vars` |
| Unused interface | Delete it |

**Files fixed:**

| File | What was fixed |
|---|---|
| `src/app/(app)/admin/page.tsx` | `[services, _setServices]` → `[services]` (unused setter) |
| `src/app/(app)/agents/[id]/page.tsx` | `[policyStates, _setPolicyStates]` → `[policyStates]` |
| `src/app/(app)/alerts/page.tsx` | Removed `_prev` param from `setSortField` callback |
| `src/app/(app)/compliance/page.tsx` | Deleted dead `totalFailing`/`totalPartial` loop assignments |
| `src/app/(app)/rules/page.tsx` | `catch (err)` → `catch {` for export error handler |
| `src/app/(app)/uba/page.tsx` | Deleted unused `cfg` variable in `RiskGauge` (only `color`/`score` used) |
| `src/app/(app)/creator/page.tsx` | Moved `eslint-disable` comment to correct line above `as any` cast |
| `src/components/compliance/compliance-eval-history-chart.tsx` | Deleted dead `_dotSpacing` and `totalW` variables |
| `src/components/compliance/compliance-trend-chart.tsx` | Fixed hooks-in-conditional: moved all `useState`/`useRef`/`useCallback` above early return; replaced early return with `isEmpty` flag |
| `src/components/investigation/investigation-evidence-board.tsx` | Deleted `_board` dead assignment in `addCard` |
| `src/components/logs/log-results-table.tsx` | `([k, _v])` → `([k])` in `.map()` (value unused, accessed via `getCellValue`) |
| `src/components/rules/rules-editor-panel.tsx` | `eslint-disable-next-line` on destructured `onClose: _onClose` prop |
| `src/components/rules/rules-list-panel.tsx` | `[catFilter, _setCatFilter]` → `[catFilter]`; moved `SEV_ORDER` constant to module scope so `useMemo` doesn't flag it as a missing dep |
| `src/services/__tests__/incident-variable.service.test.ts` | `eslint-disable-next-line` on `const { id: _id, ...newVar }` omit-rest pattern |
| `src/services/detection.service.ts` | `eslint-disable-next-line` on `bulkDelete(_ids)` (param unused by current impl but part of public API) |
| `src/services/overview.service.ts` | Deleted unused `AlertDoc` interface |

---

### Rule: `react-hooks/exhaustive-deps`

**Fix patterns:**

| Scenario | Correct fix |
|---|---|
| Plain `async` function used in `useEffect` | Promote to `useCallback` with correct deps; add to `useEffect` dep array |
| `useEffect` dep is `optional?.id` (property of an object) | Use the whole object `[integration]` instead |
| `useCallback` calls a helper function that closes over state | Promote helper to `useCallback` too; add as dep |
| Constant object defined inside component | Move to module scope — no longer seen as a dep |
| `useCallback` wraps `xLabels` inline array | Wrap `xLabels` in `useMemo` first, then add to `useCallback` deps |
| Intentional partial dep (reset-on-id, not on field changes) | `// eslint-disable-next-line react-hooks/exhaustive-deps` with comment |

**Files fixed:**

| File | What was fixed |
|---|---|
| `src/app/(app)/edr/[agentId]/page.tsx` | `load` promoted to `useCallback([agentId])`; added `useCallback` import |
| `src/app/(app)/edr/page.tsx` (IsolationsTab) | `load` promoted to `useCallback([filterStatus])` |
| `src/app/(app)/integrations/page.tsx` | `[integration?.id]` → `[integration]` |
| `src/app/(app)/soar/flows/page.tsx` | `snapshot` promoted to `useCallback([nodes, edges])`; `onConnect`, `handleLoadTemplate`, `handleAddNode` updated to dep on `snapshot` |
| `src/components/compliance/compliance-trend-chart.tsx` | `xLabels` wrapped in `useMemo([dataLen])`; added `useMemo` to imports |
| `src/components/rules/rules-editor-panel.tsx` | `eslint-disable-next-line` on `useEffect` — intentionally resets on `rule?.id` change only |
| `src/components/rules/rules-list-panel.tsx` | `SEV_ORDER` moved to module scope (see unused-vars section) |
| `src/hooks/use-incident-command-ws.ts` | Added `disconnect` to cleanup `useEffect` deps (safe — `disconnect` is stable `useCallback([], [])`) |

---

### TypeScript type errors

| File | Error | Fix |
|---|---|---|
| `src/app/(app)/incidents/page.tsx:140` | `Property 'id' does not exist on type '{}'` — `incidentService.create()` returned untyped `{}` | Added `<Incident>` generic to `api.post<Incident>` in `incident.service.ts` |
| `src/app/(app)/reports/page.tsx:239` | `Property 'reportType' does not exist on type 'ReportTemplate'` | Field is `repType` in the interface — corrected to `t.repType` |
| `src/app/(app)/reports/page.tsx:259` | `Property 'reportFrequency' does not exist on type 'ReportTemplate'` | Added `reportFrequency?: string` to `ReportTemplate` interface in `report.service.ts` |
| `src/app/(app)/settings/soc-ai/page.tsx:331` | `Function declarations not allowed inside blocks in strict mode` | Converted `function makeKey(...)` → `const makeKey = (...) =>` (arrow function) |
| `src/services/active-directory.service.ts:116` | `Property 'name' does not exist on type '{}'` — `winlog["user"]` typed as `unknown` | Cast to `(winlog["user"] as Record<string, unknown> \| undefined)?.["name"]` |
| `src/services/active-directory.service.ts:122` | Same pattern — `winlog["event_data"]?.["WorkstationName"]` | Simplified: `eventData` already holds `winlog["event_data"]`, used `eventData["WorkstationName"]` directly |

---

### Build config

| File | Change | Reason |
|---|---|---|
| `tsconfig.json` | Added `"vitest.config.ts"` to `exclude` array | Next.js type checker was picking up `vitest.config.ts` and failing because `vitest` package wasn't installed; test runner config should not be in the Next.js compilation scope |

---

## Notes for AI-led development

1. **ESLint is blocking** — `npm run build` runs ESLint in strict mode. Any `Error`-level lint issue fails the build. Use `npm run lint` to check before building.
2. **`_` prefix does NOT suppress unused-vars** — This project's ESLint config flags `_prefixed` vars the same as unprefixed. See the fix table above.
3. **TypeScript strict mode is on** — `"strict": true` in `tsconfig.json`. All `unknown` accesses need explicit casts. Never use `as any` in service files; use `as Record<string, unknown>`.
4. **React hooks rules are enforced as warnings** — They appear in build output but don't block by default. However, once any error exists they become visible and should be fixed to keep the output clean.
5. **`vitest.config.ts` is excluded from Next.js compilation** — Do not remove this exclusion. Install `vitest` as a dev dependency if you need to run tests (`npm install -D vitest @vitest/ui`).
6. **Services must be typed at call site** — `api.post()`, `api.put()`, `api.get()` all accept a generic `<T>`. Always pass it when the return value is used. Untyped calls infer `{}` which causes TS errors downstream.
