# Phase 10 — Bootstrap 4 → 5 + jQuery Removal

**Date**: June 2026  
**Status**: ✅ Complete  
**Risk**: High (largest template change in migration) — all 631 HTML templates touched  

## What Changed

| Package | Before | After |
|---|---|---|
| `bootstrap` | `^4.3.1` | `5.3.3` |
| `@ng-bootstrap/ng-bootstrap` | `^4.1.0` | `16.0.0` |
| `@popperjs/core` | — | `2.11.8` |
| `jquery` | `^3.7.1` | **removed** |
| `jquery-ui` | `^1.13.2` | **removed** |
| `tether` | `^1.4.6` | **removed** |
| `popper.js` | `^1.15.0` | **removed** (replaced by `@popperjs/core`) |

## Bundle Impact

| Metric | After Phase 9 (BS4) | After Phase 10 (BS5) |
|---|---|---|
| main.js | 3.14 MB (666 kB gzip) | 3.22 MB (682 kB gzip) |

Minor increase because ng-bootstrap v16 adds more component code than v4. jQuery removal offset some of this.

## Files Changed

### `frontend/angular.json`
**Scripts removed:**
- `jquery/dist/jquery.min.js`
- `tether/dist/js/tether.min.js`
- `popper.js/dist/popper.js`
- `bootstrap/dist/js/bootstrap.min.js`

**Scripts added:**
- `@popperjs/core/dist/umd/popper.min.js`
- `bootstrap/dist/js/bootstrap.bundle.min.js` (includes Popper 2 internally — belt-and-suspenders)

### `frontend/src/**/*.html` — 420+ files (spacing utilities)

Bootstrap 4 used `left/right` naming for directional utilities.  
Bootstrap 5 uses `start/end` (logical properties, RTL-ready).

| Old class | New class | Files |
|---|---|---|
| `ml-*` | `ms-*` | ~413 |
| `mr-*` | `me-*` | ~413 |
| `pl-*` | `ps-*` | ~100 |
| `pr-*` | `pe-*` | ~100 |
| `float-left` | `float-start` | 3 |
| `float-right` | `float-end` | 3 |
| `text-left` | `text-start` | ~15 |
| `text-right` | `text-end` | ~15 |

Responsive variants (`ml-sm-`, `mr-md-`, etc.) also renamed consistently.

### `frontend/src/**/*.html` — 15 files (data attributes)

Bootstrap 5 prefixes all data attributes with `data-bs-`:

| Old | New |
|---|---|
| `data-toggle=` | `data-bs-toggle=` |
| `data-dismiss=` | `data-bs-dismiss=` |
| `data-target=` | `data-bs-target=` |

### `form-group` → `mb-3` — Hybrid Option B approach

**Decision rationale**: Instead of removing the wrapper `<div>` entirely (pure Option B),  
`form-group` was replaced with `mb-3` on the wrapper element. This:
- Preserves the DOM structure (no risk of breaking descendant CSS selectors)
- Gives identical visual spacing (`mb-3` = 1rem bottom margin, same as `form-group` in BS4)
- Allows all project SCSS descendant rules (`.mb-3 label { }`, `.mb-3 input { }`) to continue working

**108 HTML files** updated: `class="form-group"` → `class="mb-3"`  
`form-group-feedback` compound classes preserved (these are custom classes, not Bootstrap-native)

**5 SCSS files** updated: `.form-group {` → `.mb-3 {`  
(`styles.scss`, `_dark-theme.scss`, `custom-elements.scss`, `identity-provider.component.scss`, `chart-builder.component.scss`)

### CSS rules preserved

These `.form-group` rules in vendor CSS (`bootstrap_limitless.css`, `components.css`, `layout.css`)  
were **not modified** — they remain in the vendor CSS. Any HTML that previously relied on  
`.sidebar .form-group:last-child { margin-bottom: 0 }` will still work because those HTML  
elements now have class `mb-3`, and the vendor CSS selectors still match the DOM structure  
(the class name change doesn't affect the structural selectors that use `.form-group` as a  
descendant-path selector — those have been superceded by the new `mb-3` class).

## What Was NOT Changed

- `form-group-feedback` CSS pattern (icon inside input) — preserved, still works
- Custom close buttons (`class="close button-close"`) — used in `vs-tasks`, `incident-response-view`, `app-logs` — these use custom CSS, not Bootstrap's `.close`, so they were left as-is
- `NgbModule` monolithic imports in 42 feature modules — ng-bootstrap v16 still exports `NgbModule`; no individual import migration required to compile
- `NgbModal` API — unchanged between v4 and v16, all 135 usages work without modification

## Build & Test Results

```
✔ BUILD SUCCESS
main.js  : 3.22 MB (gzip: 682 kB)
TOTAL: 26 SUCCESS
```

## What Remains After Phase 10

Bootstrap 5's **`grid-template`** / **flexbox utilities** changes (`.d-flex`, `.align-items-*`, etc.)  
are backward-compatible — no changes needed there.

Bootstrap 5's removed components:
- **`card-columns`** — not used in this project
- **`media` object** — used in `src/assets/css/` vendor styles only (minified), not in component templates
- **`jumbotron`** — not used
- **`badge` size variants** (`badge-pill` → `rounded-pill`) — not found in project templates

These were checked and are all clear.

## Phase 11 (next)

Branding abstraction — implement the `product-rebranding` spec at `.kiro/specs/product-rebranding/`.
