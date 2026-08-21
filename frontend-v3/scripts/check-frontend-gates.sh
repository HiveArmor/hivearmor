#!/usr/bin/env bash
# Sprint 29 — Check 7: Frontend v3 gates
# Runs build, lint, type-check, and test in sequence.
# Fails fast on any non-zero exit code.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

echo "=== Frontend v3 Gate Check ==="
echo "Working directory: $(pwd)"
echo ""

echo "→ npm run build"
npm run build
echo ""

echo "→ npm run lint"
npm run lint
echo ""

echo "→ npm run type-check"
npm run type-check
echo ""

echo "→ npm run test -- --run"
npm run test -- --run
echo ""

echo "✓ All frontend gates passed"
