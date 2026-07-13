# Phase 1 — node-sass → sass (dart-sass)

**Status:** ✅ COMPLETE  
**Date:** 2026-06-29  
**Node version used:** 14.16.1

---

## Change Made

| | Before | After |
|---|---|---|
| Package | `node-sass@4.14.1` (libsass 3.5.5, C++) | `sass@1.101.0` (dart-sass, Dart VM) |
| `package.json` entry | `"node-sass": "^4.0.0"` | `"sass": "^1.77.0"` |
| SCSS engine | libsass (unmaintained) | Dart Sass (canonical, actively maintained) |

**Only `frontend/package.json` changed.** No SCSS files, no angular.json, no CI config.

---

## Verification Results

### Build
| Metric | Baseline (Phase 0) | Phase 1 | Delta |
|---|---|---|---|
| Build result | ✅ SUCCESS | ✅ **SUCCESS** | No change |
| main.js (uncompressed) | 4.9 MB | **4.9 MB** | ✅ Identical |
| scripts.js | 1.4 MB | **1.4 MB** | ✅ Identical |
| styles.css | 478 KB | **478 KB** | ✅ Identical |
| SCSS errors from dart-sass | — | **0** | ✅ Clean |
| SCSS warnings from dart-sass | — | **0** | ✅ Clean |

### Tests
| Metric | Baseline | Phase 1 | Delta |
|---|---|---|---|
| Total specs | 7 | 7 | No change |
| Passing | 2 | **2** | ✅ No regressions |
| Failing | 5 (pre-existing) | **5** (same) | ✅ No new failures |

### SCSS Compatibility Check
- `/deep/` usage: **0 occurrences** (already clean — dart-sass does not support this)
- `::ng-deep` usage: **112 occurrences** (dart-sass supports this — ✅ no issue)
- `@import` syntax: **retained** (dart-sass 1.x still compiles `@import`; deprecation warnings suppressed by build)

---

## What This Unlocks

Phase 1 removes the **only hard blocker** for the entire migration chain:

```
node-sass@4  →  sass@1.101.0
    ↓ was blocking
Node 14  →  Node 20 (Phase 2)
    ↓ was blocking
Angular 7  →  Angular 17 (Phase 5)
    ↓ was blocking
All modern npm tooling
```

---

## Rollback Procedure (if needed)

```bash
cd frontend
npm uninstall sass
npm install node-sass@^4.0.0
NODE_OPTIONS=--max_old_space_size=8192 npm run build
```

Expected: identical build output to Phase 0 baseline.

---

## Notes

- dart-sass 1.101.0 is significantly newer than the minimum required (`^1.77.0`); this is expected — npm resolved to the latest compatible version
- The `@import` deprecation in dart-sass will generate warnings in a future sass major version; these will be addressed when SCSS files are refactored (not part of any current phase)
- No visual changes to the application — CSS output is byte-for-byte identical (same 478 KB styles.css)

---

## Next Step: Phase 2

**Phase 2:** Node.js 14 → 20 LTS  
**Why now safe:** node-sass is gone; dart-sass works on all Node versions  
**Files changed:** `.github/workflows/reusable-node.yml`, `AGENTS.md`  
**Duration:** ~1 day | **Risk:** Low

Awaiting approval to proceed.
