# Phase 5c — Angular 12 → Angular 16 Migration

**Date**: June 2026  
**Status**: ✅ Complete  
**Branch**: In-progress migration  

## What Changed

| Component | Before (Phase 5b) | After (Phase 5c) |
|---|---|---|
| Angular | 12.2.17 | 16.2.12 |
| TypeScript | 4.3.5 | 5.1.6 |
| RxJS | 6.6.7 | 7.8.1 |
| Toastr | ng6-toastr-notifications@1 | ngx-toastr@16 |
| @angular-devkit/build-angular | 12.x | 16.2.16 |
| zone.js | 0.11.x | 0.13.3 |

## Files Modified

### Core Package Updates
- `frontend/package.json` — all Angular packages to `^16.2.12`, TypeScript to `^5.1.6`, RxJS to `^7.8.1`, zone.js to `^0.13.3`, added `ngx-toastr@16`, removed `ng6-toastr-notifications`

### angular.json Changes
1. Removed deprecated options: `extractCss`, `vendorChunk`, `buildOptimizer`, `defaultProject`
2. Added `stylePreprocessorOptions.includePaths: ["src", "src/assets", "src/assets/styles"]` (build + test)
3. Changed `optimization.styles.inlineCritical: false` (critters CSS inliner fails with Angular 7-era nested CSS in component files)
4. Added `node_modules/ngx-toastr/toastr.css` to global styles array
5. Both `build.options` and `test.options` blocks updated

### SCSS Tilde Removal (Angular 16 sass-loader dropped `~` support)
All `@import "~..."` → `@import "..."` in:
- `src/styles.scss` — ng-select and highlight.js CSS
- `src/assets/styles/_svg-icon.scss` — bootstrap breakpoints mixin
- `src/assets/vendor/vendor.scss` — bootstrap main
- `src/app/shared/components/layout/footer/footer.component.scss` — theme/var
- `src/app/active-directory/shared/components/active-directory-tree/active-directory-tree.component.scss` — theme
- `src/app/scanner/scanner-config/target/target-list/target-list.component.scss` — theme/var/custom-elements

### Toastr Replacement
**`ng6-toastr-notifications`** uses `ReflectiveInjector` which was removed in Angular 15. Replaced with **`ngx-toastr@16`**.

API changes:
| Old method | New method |
|---|---|
| `toastr.successToastr(msg, title)` | `toastr.success(msg, title)` |
| `toastr.errorToastr(msg, title, opts)` | `toastr.error(msg, title, opts)` |
| `toastr.warningToastr(msg, title, opts)` | `toastr.warning(msg, title, opts)` |
| `toastr.infoToastr(msg, title, opts)` | `toastr.info(msg, title, opts)` |
| `toastr.customToastr(html, null, {enableHTML})` | `toastr.info(html, null, {enableHtml})` |
| `{position: 'bottom-right'}` option | removed — use `ToastrModule.forRoot({positionClass: 'toast-bottom-right'})` |
| `{toastTimeout: 2000}` | `{timeOut: 2000}` |
| Class: `ToastrManager` | Class: `ToastrService` |
| Import: `ng6-toastr-notifications` | Import: `ngx-toastr` |

Modified files:
- `src/app/app.module.ts` — updated import, added default config to `ToastrModule.forRoot()`
- `src/app/shared/alert/utm-toast.service.ts` — full rewrite with new API

### test.ts Update
`src/test.ts` was rewritten for Angular 16 webpack 5 compatibility:
- Old: `import 'zone.js/dist/zone-testing'` + `require.context('./', true, /\.spec\.ts$/)` dynamic discovery
- New: `import 'zone.js'` + `import 'zone.js/testing'` — spec file discovery handled by `tsconfig.spec.json#include`
- Added `{teardown: {destroyAfterEach: false}}` to `initTestEnvironment()` for Angular 16

### Test Spec Fixes (Angular 16 Ivy strict module validation)
Angular 16 Ivy strictly validates all modules in `TestBed.configureTestingModule({imports: [...]}`. Several legacy packages lack proper `@NgModule` annotations:
- `Ng2Webstorage` (ngx-webstorage@2) — not Ivy compatible as a module import
- `NgbModule`, `NgbPopoverModule`, `NgbDropdownModule` (@ng-bootstrap/ng-bootstrap@4) — not Ivy compatible
- `NgSelectModule` (@ng-select/ng-select@2) — not Ivy compatible

**Fix pattern used**:
1. For service consumers: replace module imports with manual `useValue` mocks
2. For component tests: use `NO_ERRORS_SCHEMA` + declare stub `@Directive` classes with matching `exportAs` names

Files updated:
- `src/app/blocks/interceptor/auth.interceptor.spec.ts` — `Ng2Webstorage.forRoot()` → mock providers, `TestBed.get` → `TestBed.inject`
- `src/app/incident-response/shared/component/action-conditional/action-conditional.component.spec.ts` — `NgbModule` removed, `NgbDropdown*` stubs declared
- `src/app/incident-response/shared/component/action-terminal/action-terminal.component.spec.ts` — `NgbModule` removed, `NgbPopoverStub` declared
- `src/app/incident-response/shared/component/action-builder/action-builder.component.spec.ts` — `Ng2Webstorage.forRoot()` and `NgSelectModule` removed, mock providers added

### TypeScript Changes (fixed in earlier sub-phases, verified on Angular 16)
- `entryComponents` — removed from all 38 NgModule files (not supported in Angular 16)
- String `loadChildren` — converted to function form in all 30 lazy routes
- `module: "es2015"` → `"es2020"` in tsconfig.json
- `target: "es5"` → `"es2020"` in tsconfig.json

## Build Results

```
✔ Browser application bundle generation complete.
✔ Index html generation complete.
Build at: 2026-06-29 — Hash: dce91ac8b94b516e — Time: ~15s

main.js      : 4.06 MB (gzip: 914 kB)   ← was 4.9 MB on Angular 7
styles.css   : 485 kB  (gzip: 60 kB)
scripts.js   : 1.41 MB (gzip: 381 kB)
polyfills.js : 35 kB   (gzip: 11 kB)
```

## Test Results

```
TOTAL: 26 SUCCESS
```
All 26 tests passing including T-004 (AccountService identity), T-005a (AuthInterceptor security), and all pre-existing specs.

## Known Warnings (non-blocking)

- TypeScript compiler warns about `"target"` and `"useDefineForClassFields"` — Angular CLI sets these per browserslist config. Resolves in Phase 5d when tsconfig is updated for Angular 17+.
- ~50 "unused file" TypeScript warnings from disabled routes (scanner, vulnerability-scanner, report) — these are pre-existing, do not remove the files.
- Two compliance component CSS warnings about `tr { ... }` nested syntax — these are Angular 16's esbuild CSS optimizer being strict about CSS nesting. Non-blocking; resolves when those CSS files are updated.

## Why `inlineCritical: false`

Angular 16 uses `critters` to inline above-the-fold CSS into `index.html`. The `critters` PostCSS parser rejects Angular 7-era nested CSS in component `.css` files (e.g., `compliance-latest-evaluations-view.component.css` with nested `tr {}`). Disabling `inlineCritical` bypasses this step — the app loads the full stylesheet on first visit instead. Performance impact is negligible for a SPA protected behind auth.

## What's Deferred to Phase 5d (Angular 17/18/19)

- ESLint migration (now unblocked — TypeScript 5.1 satisfies `@angular-eslint` requirements)
- Upgrade `@ng-bootstrap/ng-bootstrap` to v15+ (requires Angular 16+) — this will remove all the test stub workarounds
- Upgrade `@ng-select/ng-select` to v12+ (requires Angular 16+)
- Upgrade `ngx-webstorage` to v13+ (requires Angular 16+)
- Remove `--openssl-legacy-provider` flag (requires Angular 17+ CLI which uses webpack 5 without the MD4 hashing issue)
- Fix compliance component CSS nesting syntax → then re-enable `inlineCritical: true`
- Consider migrating to esbuild builder (`@angular-devkit/build-angular:browser-esbuild`) for faster builds
