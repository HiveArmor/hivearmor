#!/usr/bin/env bash
# Category 10: backend production build with liquibase:validate gate
# Requirements: 12.7, 12.8
#
# 1. Detects Maven binary (mvn on PATH, else ./mvnw inside backend/).
# 2. Runs liquibase:validate — fails Category 10 on non-zero (Req 12.8).
# 3. Runs the production build — fails Category 10 on non-zero (Req 12.7).
# 4. Asserts backend/target/hivearmor.war exists — fails Category 10 if missing (Req 12.7).
#
# Runtime dependencies: bash, Maven (mvn or ./mvnw) — no curl, no python3 needed here.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"

# ── Detect Maven binary ───────────────────────────────────────────────────────
# Prefer mvn on PATH; fall back to the Maven wrapper bundled with the backend.
if command -v mvn &>/dev/null; then
    MVN=mvn
else
    MVN="${BACKEND_DIR}/mvnw"
fi

echo "[CAT10] Maven binary: ${MVN}"
echo "[CAT10] Backend directory: ${BACKEND_DIR}"

cd "${BACKEND_DIR}"

# ── Step 1: liquibase:validate (Req 12.8) ────────────────────────────────────
echo "[CAT10] Running: ${MVN} -s settings.xml liquibase:validate"
if ! "${MVN}" -s settings.xml liquibase:validate; then
    echo "[FAIL] liquibase:validate failed — database schema is not valid" >&2
    exit 1
fi
echo "[CAT10] liquibase:validate passed"

# ── Step 2: production build (Req 12.7) ──────────────────────────────────────
echo "[CAT10] Running: ${MVN} -B -Pprod clean package -s settings.xml -DskipTests"
if ! "${MVN}" -B -Pprod clean package -s settings.xml -DskipTests; then
    echo "[FAIL] Production build failed" >&2
    exit 1
fi
echo "[CAT10] Production build completed"

# ── Step 3: assert WAR file exists (Req 12.7) ────────────────────────────────
WAR_PATH="${BACKEND_DIR}/target/hivearmor.war"
if [[ ! -f "${WAR_PATH}" ]]; then
    echo "[FAIL] Expected artifact not found: ${WAR_PATH}" >&2
    exit 1
fi
echo "[CAT10] Artifact confirmed: ${WAR_PATH}"

echo "[PASS] Category 10 — backend production build passed"
exit 0
