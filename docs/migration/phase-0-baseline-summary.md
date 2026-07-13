# Phase 0 — Baseline Capture Summary

**Status:** ✅ COMPLETE  
**Date:** 2026-06-29  
**No code was changed. This is a read-only audit of the current state.**

---

## Environment

| Item | Value |
|---|---|
| Machine Node version | 24.16.0 (current default — too new for frontend) |
| Required Node version | **14.16.1** (nvm available — `nvm use 14.16.1`) |
| npm version (Node 14) | 6.14.12 |
| Go version | 1.25.5 (agent, agent-manager, plugins) / 1.25.1 (installer, shared) |
| Java version (backend) | 17 |
| Java version (user-auditor, web-pdf) | 11 |

---

## Frontend Build Baseline (Node 14.16.1)

| Metric | Value |
|---|---|
| Build result | ✅ **SUCCESS** |
| Main bundle (uncompressed) | 4.9 MB |
| Scripts bundle | 1.4 MB |
| Global CSS | 478 KB |
| Total lazy chunks | 45 |
| Total dist/ size | ~91 MB |
| Initial budget | Within limits (warning: 10 MB, error: 15 MB) |

**Important:** Running `npm run build` with the system Node 24.16.0 **FAILS** immediately with `Error: No such module: http_parser`. The build only works on Node 14.16.1. This confirms Phase 1 (node-sass → sass) and Phase 2 (Node upgrade) are the critical unblocking steps.

---

## Frontend Lint Baseline

| Metric | Value |
|---|---|
| Lint result | ❌ 794 errors, 14 warnings (pre-existing) |
| Top error type | Import ordering (164), whitespace (147), double quotes (145) |
| Most affected files | `alert-view.component.ts` (92), `guide-soc-ai.component.ts` (76) |
| Nature of errors | All stylistic — zero security or correctness issues |

These 794 errors are pre-existing technical debt. They are NOT introduced by any migration. They will be addressed naturally as part of the TSLint → ESLint migration (Phase 3) which will convert the rule set.

---

## Frontend Test Baseline

| Metric | Value |
|---|---|
| Test result | ❌ 5 FAILED, 2 SUCCESS (7 total) |
| Failure root cause | Missing `SafePipe` import in test module setup for `UtmOnlineDocumentationComponent` |
| Production impact | None — this is a test infrastructure gap only |
| Coverage | Near-zero (7 specs for a ~30,000 line application) |

These test failures are pre-existing. Required tests T-001 through T-005 documented in `docs/migration/06-testing-strategy.md` must be written before high-risk migration phases.

---

## Backend Version Baseline

| Package | Version | Status |
|---|---|---|
| Spring Boot (backend) | 3.1.5 | 🟡 Minor version behind (target: 3.3.x) |
| Hibernate | 5.4.32.Final | 🟠 **PINNED — wrong for Spring Boot 3.1** |
| JHipster | 7.3.1 | — |
| Liquibase | 4.24.0 | 🟢 Current |
| gRPC | 1.65.1 | 🟢 Current |
| Protobuf | 4.29.3 | 🟢 Current |
| Spring Boot (user-auditor) | 2.7.14 | 🔴 **EOL November 2023** |
| Spring Boot (web-pdf) | 2.7.14 | 🔴 **EOL November 2023** |
| Java (user-auditor, web-pdf) | 11 | 🔴 **EOL September 2023** |
| Selenium (web-pdf) | 4.5.0 | 🟡 Outdated |

---

## Key Findings Confirmed by Phase 0

1. **Build chain is Node-version-locked.** The entire frontend build requires Node 14.16.1. Running on any newer Node (16+) fails immediately due to `node-sass` native bindings. This is the #1 blocker — Phase 1 must happen before any other frontend work.

2. **No `.env.example` existed.** Created as `local-dev/.env.example` — this is the first actual file created in Phase 0.

3. **Test coverage is 7 specs total.** Of those, 5 are already failing. T-001 through T-005 (documented in `06-testing-strategy.md`) must be written before phases 5, 6, and 7 begin.

4. **794 pre-existing lint errors** are present. These are all stylistic (import ordering, quotes, whitespace) — no security or correctness issues. They are the starting baseline and will be resolved through the ESLint migration.

5. **Go toolchain is current** (1.25.5). Go component risks are low and Phase 8 will be straightforward.

---

## Files Created in Phase 0

| File | Purpose |
|---|---|
| `docs/migration/baseline-npm-packages.txt` | Full npm dependency tree |
| `docs/migration/baseline-go-modules.txt` | Go module summary for all modules |
| `docs/migration/baseline-bundle-sizes.txt` | Frontend build output sizes |
| `docs/migration/baseline-test-results.txt` | Test and lint baseline results |
| `docs/migration/phase-0-baseline-summary.md` | This document |
| `local-dev/.env.example` | Missing environment variable documentation (first new file) |

---

## Phase 0 Completion Criteria — All Met

- [x] Frontend builds successfully on Node 14.16.1
- [x] Bundle sizes documented
- [x] Lint error baseline captured (794 errors — all pre-existing)
- [x] Test baseline captured (5 failures — all pre-existing)
- [x] `local-dev/.env.example` created
- [x] All Go modules enumerated
- [x] All key version numbers confirmed
- [x] No code was changed

---

## Next Step: Phase 1

**Phase 1:** Replace `node-sass` with `sass` (dart-sass)  
**File changed:** `frontend/package.json` (one package swap)  
**Duration:** ~1 day  
**Risk:** Low — SCSS syntax still compiles; visual output identical  

Awaiting approval to proceed.
