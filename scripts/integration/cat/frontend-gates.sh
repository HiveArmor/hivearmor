#!/usr/bin/env bash
# Category 9: frontend gates (Req 12.6)
# Runs the four FrontendGates npm commands in fixed order.
# Fails on the first non-zero exit code.
set -uo pipefail

FRONTEND_DIR="${FRONTEND_DIR:-frontend-v3}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FE_DIR="${REPO_ROOT}/${FRONTEND_DIR}"

echo "[CAT9] Running frontend gates in ${FE_DIR}"

cd "${FE_DIR}"

echo "[CAT9] 1/4: npm run typecheck"
npm run typecheck || { echo "[FAIL] typecheck failed" >&2; exit 1; }

echo "[CAT9] 2/4: npm run lint"
npm run lint || { echo "[FAIL] lint failed" >&2; exit 1; }

echo "[CAT9] 3/4: npm run test -- --run"
npm run test -- --run || { echo "[FAIL] tests failed" >&2; exit 1; }

echo "[CAT9] 4/4: npm run build"
npm run build || { echo "[FAIL] build failed" >&2; exit 1; }

echo "[PASS] All four frontend gates passed"
exit 0
