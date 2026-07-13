# Phase 5d — Angular 16 → Angular 17 Migration

**Date**: June 2026  
**Status**: ✅ Complete  
**Branch**: In-progress migration  

## What Changed

| Component | Before (Phase 5c) | After (Phase 5d) |
|---|---|---|
| Angular | 16.2.12 | 17.3.12 |
| TypeScript | 5.1.6 | 5.4.5 |
| zone.js | 0.13.3 | 0.14.10 |
| @angular-devkit/build-angular | 16.2.16 | 17.3.11 |
| @angular/cli | 16.2.16 | 17.3.11 |
| @angular-eslint/* | 16.3.1 | 17.5.3 |
| Build builder | browser (webpack 5) | browser (webpack 5) — unchanged |
| RxJS | 7.8.1 | 7.8.1 — no change |

## Files Modified

### `frontend/package.json`
- All `@angular/*` packages: `^16.2.12` → `17.3.12` (exact pinned)
- `@angular/cli` + `@angular-devkit/build-angular`: `^16.2.16` → `17.3.11`
- `@angular-eslint/*`: `^16.3.1` → `17.5.3`
- `typescript`: `^5.1.6` → `5.4.5` (Angular 17 requires ≥5.2.0, <5.5.0)
- `zone.js`: `^0.13.3` → `0.14.10`
- `version` field: `16.0.0` → `17.0.0`

### `frontend/src/polyfills.ts`
zone.js 0.14 changed its package exports map — `zone.js/dist/zone` is no longer exported under es2020/webpack conditions.

```typescript
// Before (Angular 7 era path, broken in zone.js 0.14)
import 'zone.js/dist/zone';

// After (correct path for zone.js 0.14+)
import 'zone.js';
```

### `frontend/src/test.ts`
No change needed — `import 'zone.js'` and `import 'zone.js/testing'` already used the correct bare specifiers from Phase 5c.

### `.kiro/steering/frontend-ui.md`
Updated Angular version row, TypeScript version row, zone.js row, `@angular-eslint` row, and Angular patterns section header.

## Build Results

```
✔ Browser application bundle generation complete.
Build at: 2026-06-29 — Hash: adacb1196f4892ed — Time: ~16s

main.js      : 4.10 MB (gzip: 924 kB)   ← same as Angular 16
styles.css   : 484 kB  (gzip: 60 kB)
```

No size regression. Warnings are all pre-existing (CommonJS deps, unused disabled-route files).

## Test Results

```
TOTAL: 26 SUCCESS
```
All 26 tests passing including T-004 (UserRouteAccessService guard), T-005a (AuthInterceptor security regression), T-005b (AuthExpiredInterceptor), and all pre-existing specs.

## Why `--openssl-legacy-provider` Is Still Required

Angular 17 continues to use the classic `@angular-devkit/build-angular:browser` webpack builder. The webpack 5 + Angular CLI 7-era configuration still hashes assets using MD4, which is disabled in OpenSSL 3 (Node 20). The flag remains necessary.

The flag can be dropped when switching to the new application builder (`browser-esbuild` or `@angular-devkit/build-angular:application`) — that is a Phase 5e consideration.

## TypeScript 5.2 → 5.4 Note

Angular 17 supports TypeScript `>=5.2.0 <5.5.0`. Using 5.4.5 (the latest in the allowed range at time of migration) gives access to:
- Improved type narrowing for `using` declarations
- Improved variadic tuple types
- No breaking changes for existing Angular 7-era code patterns

## Angular 17 New Features (NOT adopted in this phase)

Angular 17 introduced several new APIs. These are **available but not adopted**:
- **Standalone components** — still `@NgModule` only until Phase 5e
- **`@defer` blocks** — deferred loading syntax in templates (requires standalone or specific setup)
- **Signals** (`signal()`, `computed()`, `effect()`) — not introduced yet
- **New application builder** (`@angular-devkit/build-angular:application`) — deferred to Phase 5e

These remain deferred to avoid scope creep. The codebase compiles cleanly under Angular 17 as a pure package-version upgrade.

## What's Deferred to Phase 5e (Angular 18/19)

- Upgrade `@ng-bootstrap/ng-bootstrap` to v17 (requires Angular 17+) — removes all Ivy stub workarounds in tests
- Upgrade `@ng-select/ng-select` to v13+ (requires Angular 17+)
- Upgrade `ngx-webstorage` to v14+ (requires Angular 17+)
- Switch to `@angular-devkit/build-angular:application` builder → removes `--openssl-legacy-provider` requirement
- Consider signals and standalone component migration
- Upgrade `ngx-toastr` to v19 (currently at v16, compatible, not urgent)

## Risk Assessment

**Actual risk**: Low — Angular 16 → 17 is the most backward-compatible jump in this migration series.  
**Rollback**: `git revert` the package.json and polyfills.ts changes, run `npm install --legacy-peer-deps`.
