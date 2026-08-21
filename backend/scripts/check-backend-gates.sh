#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Check 8 — Backend Gates (Sprint 29 UEBA Baseline Verification)
# Runs two ordered gates: Liquibase validate and full production Maven build.
# Fails fast on any non-zero exit.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Detect mvn on PATH; fall back to ./mvnw
command -v mvn >/dev/null 2>&1 && MVN=mvn || MVN="${BACKEND_DIR}/mvnw"

printf '=== Backend Gate Check ===\n\n'

# =============================================================================
# Gate 1 — Liquibase changeset validation
# =============================================================================
printf '→ %s -s settings.xml liquibase:validate\n' "${MVN}"
cd "${BACKEND_DIR}"
"${MVN}" -s settings.xml liquibase:validate
printf '[PASS] Gate 1: Liquibase validate\n\n'

# =============================================================================
# Gate 2 — Production Maven build
# =============================================================================
printf '→ %s -B -Pprod clean package -s settings.xml\n' "${MVN}"
cd "${BACKEND_DIR}"
"${MVN}" -B -Pprod clean package -s settings.xml
printf '[PASS] Gate 2: Production build\n\n'

# =============================================================================
# Summary
# =============================================================================
printf '================================================================\n'
printf '✓ All backend gates passed\n'
printf '================================================================\n'
