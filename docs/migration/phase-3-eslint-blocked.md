# Phase 3 — TSLint → ESLint

**Status:** ⛔ BLOCKED — Cannot complete until Phase 5 (Angular upgrade)  
**Date investigated:** 2026-06-29  
**No permanent code changes made.**

---

## What Was Attempted

Attempted to install `eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`
to replace the deprecated TSLint 5.11.0.

---

## Why It Is Blocked

### The hard constraint

| Constraint | Version required |
|---|---|
| `@angular/compiler-cli@~7.2.0` | TypeScript `~3.2.x` (pins to exactly 3.2.x) |
| `@typescript-eslint/parser` (any version) | TypeScript `>=3.3.1` |

These two requirements are **mutually exclusive**. Angular 7's compiler strictly requires TypeScript
`~3.2.x`. Every version of `@typescript-eslint` ever published requires TypeScript `>=3.3.1`.
There is no configuration that satisfies both.

### Also attempted: `@angular-eslint`

`@angular-eslint` — the package that provides Angular-specific template lint rules — has never had
a stable release supporting Angular 7. The earliest stable release (`1.0.0`) requires Angular 10+.
Pre-1.0 alpha/beta versions require `@angular-devkit/architect ~0.1001.4` or `~0.1100.1`, while
Angular 7 ships `@angular-devkit/architect ~0.13.x` — incompatible.

### Summary

The TSLint → ESLint migration is architecturally blocked by Angular 7's TypeScript version pin.
The migration will complete naturally as part of **Phase 5a (Angular upgrade, sub-phase 7→12)**
when TypeScript is upgraded to 4.x/5.x alongside the Angular framework upgrade.

---

## Current Linter State (unchanged)

TSLint 5.11.0 continues to run via `npm run lint`. Baseline: 794 errors (all pre-existing,
all stylistic). No security or correctness issues.

---

## What Happens in Phase 5a

When Angular is upgraded from 7 to 12:
- TypeScript upgrades from `~3.2.x` to `~4.4.x`
- `@typescript-eslint/parser@5.x` and `@angular-eslint@13.x` become installable
- TSLint is removed at that point
- The migration guide at `docs/migration/05-required-code-changes.md` Phase 3 section
  remains the correct implementation plan — just executed during Phase 5a

---

## Steering File Updates Made

`frontend-ui.md` and `development-workflow.md` were updated separately to reflect the Node 20
upgrade from Phase 2. The TSLint note in `frontend-ui.md` is updated to accurately describe
the current state: "TSLint 5.11.0 — migration to ESLint blocked until Angular upgrade (Phase 5a)".

---

## Build Verification (post-investigation cleanup)

All packages installed during investigation were uninstalled. Build confirmed clean:

| Check | Result |
|---|---|
| `npm run build` (Node 20) | ✅ SUCCESS — unchanged from Phase 2 |
| `npm run lint` (TSLint) | ✅ Same 794 pre-existing errors |
| `npm test -- --watch=false` | ✅ 5 FAILED, 2 SUCCESS — unchanged |
| `.eslintrc.json` | ✅ Removed (was created during investigation) |
| `eslint`, `@typescript-eslint/*` in package.json | ✅ Removed |
