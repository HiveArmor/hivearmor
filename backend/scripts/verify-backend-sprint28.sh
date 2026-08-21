#!/bin/sh
set -euo pipefail

# =============================================================================
# Sprint 28 Backend Verification — HiveArmor UEBA Signals & Rule Generation
# Runs three ordered gates: Liquibase validate, Sprint 28 unit tests, and
# a full production build. Fails fast on any non-zero exit.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Detect mvn on PATH; fall back to ./mvnw
command -v mvn >/dev/null 2>&1 && MVN=mvn || MVN="${BACKEND_DIR}/mvnw"

printf '=== Sprint 28 Backend Verification ===\n\n'

# =============================================================================
# Gate 1 — Liquibase changeset validation
# =============================================================================
printf '--- Gate 1: Liquibase validate ---\n'
cd "${BACKEND_DIR}"
"${MVN}" -s settings.xml liquibase:validate
printf '[PASS] Gate 1: Liquibase validate\n\n'

# =============================================================================
# Gate 2 — Sprint 28 backend unit tests
# =============================================================================
printf '--- Gate 2: Sprint 28 unit tests ---\n'
cd "${BACKEND_DIR}"
"${MVN}" -Dtest="Ha*Signal*Test,Ha*RuleGen*Test,VerificationCheck*Test,UtmAlertResourceSignalIsolation*Test" \
    test -s settings.xml
printf '[PASS] Gate 2: Sprint 28 unit tests\n\n'

# =============================================================================
# Gate 3 — Production Maven build
# =============================================================================
printf '--- Gate 3: Production build ---\n'
cd "${BACKEND_DIR}"
"${MVN}" -B -Pprod clean package -s settings.xml
printf '[PASS] Gate 3: Production build\n\n'

# =============================================================================
# Summary
# =============================================================================
printf '================================================================\n'
printf 'Sprint 28 Backend Verification: ALL GATES PASSED\n'
printf '================================================================\n'
