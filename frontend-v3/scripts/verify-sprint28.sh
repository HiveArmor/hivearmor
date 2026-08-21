#!/usr/bin/env bash
# Sprint 28 — Check 7: Frontend v3 gates
# Runs build, lint, type-check, and test in sequence.
# Fails fast on any non-zero exit code.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

echo "=== Sprint 28 Check 7: Frontend v3 gates ==="
echo "Working directory: $(pwd)"
echo ""

echo "[1/4] npm run build"
npm run build
echo ""

echo "[2/4] npm run lint"
npm run lint
echo ""

echo "[3/4] npm run type-check"
npm run type-check
echo ""

echo "[4/4] npm run test -- --run"
npm run test -- --run
echo ""

echo "=== All frontend v3 gates passed ==="
