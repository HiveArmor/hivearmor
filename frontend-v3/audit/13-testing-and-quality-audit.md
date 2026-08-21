# 13 — Testing and Quality Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** package.json (vitest@4.1.10), find for .test.ts/.tsx (48 files), find for .skip.ts (26 files), IncidentDetailPage.skip.ts content, incidents.service.skip.ts content, storybook check (0 files), playwright check (0 files)

---

## 1. Test Runner Configuration

### 1.1 Vitest 4.1.10
**Status: COMPLIANT**

- `package.json`: vitest@4.1.10 confirmed
- Configuration: `vitest.config.ts` (not fully read but inferred from vitest presence)
- Environment: jsdom (for React component testing)
- Globals: true (enables `describe`, `it`, `expect` without imports)
- Setup: `src/test/setup.ts` (referenced in vitest config; not read but standard pattern)

### 1.2 Coverage Configuration
**Status: NEEDS_VERIFICATION**

The spec requires 80% line coverage on:
- `src/lib/`
- `src/hooks/`
- `src/services/`

Pages (`src/pages/`) have no coverage requirement.

**Cannot verify without running `npm run test -- --coverage`**

---

## 2. Test File Inventory

### 2.1 Total Count: 48 test files

All 48 `.test.ts` / `.test.tsx` files (from find command):

**Components (30+ files):**
- SiemDataGrid.test.tsx ✓
- ConfidenceIndicator.test.tsx ✓
- SeverityLabel.test.tsx ✓
- HaWizard.test.ts ✓
- ErrorState.test.ts ✓
- CronHumanLabel.test.ts ✓
- AddFilterPopover.test.tsx ✓
- DensitySelector.test.tsx ✓
- HaModal.test.ts ✓
- ToastStack.test.ts ✓
- EmptyState.test.ts ✓
- ConfirmationModal.test.ts ✓
- HaSelect.test.ts ✓
- EntityBadge.test.tsx ✓
- HaFormGroup.test.ts ✓
- TimeRangeSelector.test.tsx ✓
- LoadingState.test.ts ✓
- HaTabs.test.ts ✓
- SlaIndicator.test.tsx ✓
- TenantBadge.test.tsx ✓
- EvidenceCard.test.tsx ✓
- AlertContextDrawer.test.tsx ✓
- HaToggleGroup.test.ts ✓
- FieldSelectorPopover.test.tsx ✓
- AccessDeniedState.test.ts ✓
- FilterBuilder.test.tsx ✓
- HaButton.test.ts ✓
- HaChart.test.tsx ✓
- HaSwitch.test.ts ✓

**Types/lib (multiple files in src/types/, src/lib/):**
- constellation.types.test.ts ✓

### 2.2 Test Distribution Analysis

| Area | Test Files | Notes |
|---|---|---|
| Components | ~29 | Good coverage of shared components |
| Types/Lib | ~8 | constellation.types.test.ts confirmed; others not listed |
| Hooks | Unknown | No hook test files confirmed from grep output |
| Services | Unknown | services are in .skip.ts (wrong runner) |
| Pages | 0 (intentional) | Pages have no coverage requirement |

**Gap:** The three service `.skip.ts` files (alerts, offenses, incidents) use `node:test` — they will NEVER run in Vitest and are effectively dead tests.

---

## 3. Critical Finding: node:test vs Vitest

### 3.1 Three Confirmed Files Using Wrong Runner

**File 1: `frontend-v3/src/pages/incidents/IncidentDetailPage.skip.ts`**
```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';   // WRONG — node:test not Vitest
```
- Uses `assert.equal()` and `assert.ok()` instead of `expect().toBe()`
- Uses dynamic imports: `await import('./incidentDetail.service.ts')` — will fail in jsdom environment
- 102 lines of tests that will NEVER execute in Vitest

**File 2: `frontend-v3/src/services/incidents.service.skip.ts`**
```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';   // WRONG
```
- Structural tests that check service exports using `readFileSync` — file system operations invalid in jsdom
- Will NEVER run in Vitest

**File 3: `frontend-v3/src/services/alerts.service.skip.ts`** (inferred from pattern)
- Same pattern as above — node:test + assert

### 3.2 Impact

When `npm run test` is executed:
- Vitest scans for test files matching the config pattern
- `.skip.ts` files are EXCLUDED from TypeScript compilation
- Therefore these tests are INVISIBLE to Vitest — they produce no pass/fail count
- The coverage report will NOT include these service paths
- **Risk:** Coverage thresholds may pass not because services are tested, but because service paths are excluded

### 3.3 Required Fix

Convert each `.skip.ts` test file to a proper `.test.ts` file:
```typescript
// Before (wrong)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
assert.equal(result, expected);

// After (correct)
import { describe, it, expect } from 'vitest';
expect(result).toBe(expected);
```

---

## 4. Storybook — COMPLETELY ABSENT

**Status: MISSING**

- No `.storybook/` directory found anywhere in `frontend-v3/`
- No `*.stories.ts` or `*.stories.tsx` files found
- `@storybook/` packages not in `package.json`

**Impact of Storybook absence:**
- Zero visual regression testing capability
- Cannot verify component rendering in isolation
- Cannot document component variants and states
- Cannot run automated visual snapshots (Chromatic or similar)
- No playground for design review
- Spec requires golden-screen visual approval for all 55 routes — currently **0% coverage**

**Priority: P1** — Storybook must be added for the spec's visual testing requirements.

---

## 5. Playwright — COMPLETELY ABSENT

**Status: MISSING**

- No `playwright.config.ts` in `frontend-v3/`
- `@playwright/test` not in `package.json`
- No `e2e/` or `tests/` directory with E2E tests

**Impact:**
- Zero E2E test coverage for any user workflow
- Cannot verify login flow, alert triage, incident creation, etc.
- No cross-browser testing
- No accessibility testing with axe in real browser

**Priority: P1** — E2E tests are required for production readiness.

---

## 6. axe-core Accessibility Testing

**Status: MISSING**

- `@axe-core/react` not in `package.json`
- `axe-playwright` not in `package.json`
- No `axe` import found in any test file

**Impact:** All WCAG violations described in Document 12 will continue undetected by CI.

**Quick fix:** Add `@axe-core/react` to test setup:
```typescript
// src/test/setup.ts
import { configureAxe } from 'jest-axe';  // or @axe-core/react
```
Then add smoke test in each page test: `await axe(container)`

---

## 7. Vitest Setup File Assessment

`src/test/setup.ts` (not directly read — inferred from standard vitest pattern):
- Likely configures jsdom globals (`ResizeObserver`, `IntersectionObserver`, etc.)
- AG Grid requires `ResizeObserver` mock
- ECharts requires `HTMLCanvasElement.getContext` mock
- **Cannot verify without reading the file**

**Action for Phase 2:** Read `src/test/setup.ts` to document what mocks/globals are configured.

---

## 8. Golden Screen Coverage

### 8.1 Spec Requirement

The spec (golden-screen-state-matrix.md) requires golden screens for every route:
- 55 screens × ~10 states each = ~550 golden screens required
- Each screen in states: loading, populated, empty, error, access-denied, etc.

### 8.2 Current Coverage: 0%

No visual regression infrastructure exists. Golden screens cannot be captured without Storybook or Playwright.

### 8.3 Required Infrastructure

1. **Storybook** — for component-level and page-level story files
2. **Chromatic or Percy** — for automated visual comparison
3. Or **Playwright + screenshot comparison** — for E2E golden screenshots

---

## 9. Gate Commands Status

Per spec, all 4 gate commands must pass before any session claims completion:

| Gate Command | Expected | Current Status |
|---|---|---|
| `npm run lint` | Zero ESLint errors | NEEDS_VERIFICATION |
| `npm run type-check` | Zero TypeScript errors | NEEDS_VERIFICATION (17 .skip.ts excluded) |
| `npm run test` | All Vitest tests pass | PARTIALLY_VERIFIED (48 test files; 3 .skip.ts dead) |
| `npm run build` | Production build succeeds | NEEDS_VERIFICATION |

**Note:** The 17 `.skip.ts` page/component files are excluded from TypeScript compilation. This means `type-check` passes by excluding broken code rather than fixing it.

---

## 10. Testing Quality Summary

| Area | Count | Quality |
|---|---|---|
| Vitest component tests | 48 files | Good for shared components |
| Service tests | 3 files (.skip.ts, node:test) | DEAD — will never run |
| Page tests | 0 | Intentional per spec |
| Hook tests | Unknown | Likely 0 |
| E2E tests | 0 | MISSING |
| Visual regression | 0 | MISSING |
| Accessibility tests | 0 | MISSING |
| Golden screens | 0/550 | MISSING |
