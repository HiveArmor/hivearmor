#!/usr/bin/env bash
# verify-sprint-27-frontend.sh
# Sprint 27 — Ollama LLM Provider: frontend verification gate
# Runs all frontend checks in frontend-v3/:
#   1. npm run build
#   2. npm run lint
#   3. npm run type-check
#   4. npm run test -- --run
#
# Requirements: 10.7
# Exit 0 on full success, 1 on any failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend-v3"

# ──────────────────────────────────────────────
# Helper: print a section header
# ──────────────────────────────────────────────
header() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "════════════════════════════════════════════════════════════"
}

# ──────────────────────────────────────────────
# Sanity: frontend-v3 must exist
# ──────────────────────────────────────────────
if [[ ! -d "${FRONTEND_DIR}" ]]; then
  echo "ERROR: frontend-v3 directory not found at ${FRONTEND_DIR}" >&2
  exit 1
fi

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "ERROR: No package.json found in ${FRONTEND_DIR}" >&2
  exit 1
fi

cd "${FRONTEND_DIR}"

# ──────────────────────────────────────────────
# Step 1: Build
# ──────────────────────────────────────────────
header "STEP 1/4 — Frontend Build (npm run build)"
npm run build
echo "✓ Build passed"

# ──────────────────────────────────────────────
# Step 2: Lint
# ──────────────────────────────────────────────
header "STEP 2/4 — Lint (npm run lint)"
npm run lint
echo "✓ Lint passed"

# ──────────────────────────────────────────────
# Step 3: Type-check
# ──────────────────────────────────────────────
header "STEP 3/4 — Type-check (npm run type-check)"
npm run type-check
echo "✓ Type-check passed"

# ──────────────────────────────────────────────
# Step 4: Tests
# ──────────────────────────────────────────────
header "STEP 4/4 — Unit + Property Tests (npm run test -- --run)"
npm run test -- --run
echo "✓ Tests passed"

# ──────────────────────────────────────────────
# All gates green
# ──────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✓ ALL FRONTEND GATES PASSED (Sprint 27 — Req 10.7)"
echo "════════════════════════════════════════════════════════════"
echo ""
exit 0
