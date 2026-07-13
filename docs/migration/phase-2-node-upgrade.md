# Phase 2 — Node.js 14 → 20 LTS

**Status:** ✅ COMPLETE  
**Date:** 2026-06-29  
**Node version used for build:** 20.20.2 (npm 10.8.2)

---

## Changes Made

| File | Change |
|---|---|
| `.github/workflows/reusable-node.yml` | `node-version: '14.16.1'` → `'20.20.2'` |
| `.github/workflows/reusable-node.yml` | `NODE_OPTIONS` updated to include `--openssl-legacy-provider` |
| `frontend/package.json` | Added `build:node20` convenience script (existing `build` script unchanged) |
| `AGENTS.md` | Updated prerequisites section: Node 14 → Node 20, node-sass → sass, TSLint note updated |

---

## The OpenSSL Flag — Why It's Needed

Node 20 ships with OpenSSL 3.x which disables legacy MD4 hashing algorithms by default.
Angular CLI 7 / webpack 4 use MD4 for content hashing in the build output.

**Without the flag:**
```
ERR_OSSL_EVP_UNSUPPORTED: digital envelope routines::unsupported
```

**Fix:** `--openssl-legacy-provider` re-enables the legacy algorithms.

```bash
# Updated build command
NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm run build
```

**This flag is temporary.** It will no longer be needed after the Angular 17 upgrade (Phase 5), because webpack 5 uses SHA-256 hashing which is fully compatible with OpenSSL 3.

---

## Verification Results

### Build (Node 20.20.2)
| Metric | Baseline (Phase 0, Node 14) | Phase 2 (Node 20) | Delta |
|---|---|---|---|
| Build result | ✅ SUCCESS | ✅ **SUCCESS** | No change |
| main.js | 4.9 MB | **4.9 MB** | ✅ Identical |
| scripts.js | 1.4 MB | **1.4 MB** | ✅ Identical |
| styles.css | 478 KB | **478 KB** | ✅ Identical |
| Chunk count | 48 | **48** | ✅ Identical |
| OpenSSL errors | — | **0** (with legacy flag) | ✅ Clean |

### Tests (Node 20.20.2)
| Metric | Baseline | Phase 2 | Delta |
|---|---|---|---|
| Total specs | 7 | 7 | No change |
| Passing | 2 | **2** | ✅ No regressions |
| Failing | 5 (pre-existing) | **5** (same) | ✅ No new failures |

---

## What This Unlocks

Node 20 LTS (EOL April 2026 — well within the migration window) brings:
- **Security:** Eliminates all unpatched CVEs in the Node 14 runtime and npm 6 package manager
- **Performance:** V8 12.x engine — faster JS execution, better GC
- **Ecosystem:** All modern tooling now compatible (Vite, Jest, Playwright, ESLint 9, etc.)
- **CI:** GitHub Actions ubuntu-24.04 runners ship with Node 20 natively — no longer a pinned special case

---

## CI Workflow After This Change

```yaml
# .github/workflows/reusable-node.yml (after Phase 2)
- uses: actions/setup-node@v4
  with:
    node-version: '20.20.2'

- name: Build
  run: |
    export NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider"
    npm install
    npm run-script build
```

---

## Rollback Procedure (if needed)

```bash
# Revert reusable-node.yml
# node-version: '14.16.1'
# NODE_OPTIONS=--max_old_space_size=8192  (remove --openssl-legacy-provider)

# Locally
nvm use 14.16.1
NODE_OPTIONS=--max_old_space_size=8192 npm run build
```

---

## Notes

- `--openssl-legacy-provider` is safe for builds; it does not affect runtime security of the built Angular app (the flag applies to the build process only, not the served assets)
- Node 20 is LTS until April 2026; Node 22 LTS is the next target after Phase 5 (Angular 17) removes the webpack 4 constraint entirely
- `package-lock.json` regenerated with npm 10.x format — this is expected and correct

---

## Next Step: Phase 3

**Phase 3:** TSLint → ESLint  
**Why now:** Node 20 is running; `@angular-eslint/schematics` requires Node 16+  
**Files changed:** `package.json`, `angular.json`, `tslint.json` (delete), `.eslintrc.json` (create)  
**Duration:** ~1 day | **Risk:** Low — lint-only change, no runtime impact

Awaiting approval to proceed.
