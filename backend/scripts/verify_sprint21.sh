#!/bin/sh
set -euo pipefail

# =============================================================================
# Sprint 21 Verification Harness — HiveArmor MSSP Foundation Layer
# Runs eight ordered checks plus two auxiliary gates against a running
# local-dev stack. All checks must pass before Sprint 22 begins.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"

# Detect mvn on PATH; fall back to ./mvnw
command -v mvn 2>/dev/null && MVN=mvn || MVN="${BACKEND_DIR}/mvnw"

# --- PostgreSQL connection defaults (override via env) -----------------------
PSQL_HOST="${PGHOST:-localhost}"
PSQL_PORT="${PGPORT:-5438}"
PSQL_USER="${PGUSER:-postgres}"
PSQL_DB="${PGDATABASE:-hivearmor}"
PSQL_PASS="${PGPASSWORD:-localdev123!}"

# Export password so psql picks it up without prompting
export PGPASSWORD="${PSQL_PASS}"

BACKEND_URL="${BACKEND_URL:-http://localhost:8088}"

# --- Counters ----------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
EXIT_CODE=0

# --- Helper functions --------------------------------------------------------
pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    printf '[PASS] %s\n' "$1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    EXIT_CODE=1
    printf '[FAIL] %s\n' "$1"
    if [ -n "${2:-}" ]; then
        printf '       Reason: %s\n' "$2"
    fi
}

run_psql() {
    # $1 = SQL query; output to stdout
    PGPASSWORD="${PSQL_PASS}" psql \
        -h "${PSQL_HOST}" \
        -p "${PSQL_PORT}" \
        -U "${PSQL_USER}" \
        -d "${PSQL_DB}" \
        --no-align \
        --tuples-only \
        -c "$1"
}

# =============================================================================
# Check 1 — Liquibase validate
# =============================================================================
printf '\n--- Check 1: Liquibase validate ---\n'
cd "${BACKEND_DIR}"
if "${MVN}" -s settings.xml liquibase:validate -q 2>&1; then
    pass "Check 1: Liquibase validate"
else
    fail "Check 1: Liquibase validate" "mvn liquibase:validate exited non-zero"
fi

# =============================================================================
# Check 2 — ha_client.client_prefix column presence
# =============================================================================
printf '\n--- Check 2: ha_client.client_prefix presence ---\n'
COL2_RESULT=$(run_psql "SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name='ha_client' AND column_name='client_prefix';" 2>&1) || true

COL2_TYPE=$(echo "${COL2_RESULT}" | awk -F'|' 'NR==1{print $1}' | tr -d ' ')
COL2_LEN=$(echo "${COL2_RESULT}" | awk -F'|' 'NR==1{print $2}' | tr -d ' ')
COL2_ROWS=$(echo "${COL2_RESULT}" | grep -c '|' || echo 0)

if [ "${COL2_ROWS}" -eq 0 ]; then
    fail "Check 2: ha_client.client_prefix presence" "Column not found"
elif [ "${COL2_TYPE}" != "character varying" ]; then
    fail "Check 2: ha_client.client_prefix presence" "Expected data_type='character varying', got '${COL2_TYPE}'"
elif [ "${COL2_LEN}" != "20" ]; then
    fail "Check 2: ha_client.client_prefix presence" "Expected character_maximum_length=20, got '${COL2_LEN}'"
else
    pass "Check 2: ha_client.client_prefix presence (VARCHAR(20))"
fi

# =============================================================================
# Check 3 — ha_tenant_user shape
# =============================================================================
printf '\n--- Check 3: ha_tenant_user column set ---\n'
COL3_RESULT=$(run_psql "SELECT column_name FROM information_schema.columns WHERE table_name='ha_tenant_user' ORDER BY ordinal_position;" 2>&1) || true

# Build a sorted, pipe-delimited string of column names
COL3_NAMES=$(echo "${COL3_RESULT}" | tr -d ' ' | sort | tr '\n' '|' | sed 's/|$//')
EXPECTED3="assigned_at|client_id|id|jhi_user_id|tenant_role"

if [ -z "${COL3_NAMES}" ]; then
    fail "Check 3: ha_tenant_user shape" "Table ha_tenant_user not found or has no columns"
elif [ "${COL3_NAMES}" != "${EXPECTED3}" ]; then
    fail "Check 3: ha_tenant_user shape" "Column set '${COL3_NAMES}' != expected '{id, client_id, jhi_user_id, tenant_role, assigned_at}'"
else
    pass "Check 3: ha_tenant_user shape {id, client_id, jhi_user_id, tenant_role, assigned_at}"
fi

# =============================================================================
# Check 4 — TenantContextTest
# =============================================================================
printf '\n--- Check 4: TenantContextTest ---\n'
cd "${BACKEND_DIR}"
if "${MVN}" -s settings.xml test -Dtest=TenantContextTest -q 2>&1; then
    pass "Check 4: TenantContextTest"
else
    fail "Check 4: TenantContextTest" "mvn test -Dtest=TenantContextTest exited non-zero"
fi

# =============================================================================
# Check 5 — TenantContextFilterTest
# =============================================================================
printf '\n--- Check 5: TenantContextFilterTest ---\n'
cd "${BACKEND_DIR}"
if "${MVN}" -s settings.xml test -Dtest=TenantContextFilterTest -q 2>&1; then
    pass "Check 5: TenantContextFilterTest"
else
    fail "Check 5: TenantContextFilterTest" "mvn test -Dtest=TenantContextFilterTest exited non-zero"
fi

# =============================================================================
# Check 6 — MsspIndexResolverTest
# =============================================================================
printf '\n--- Check 6: MsspIndexResolverTest ---\n'
cd "${BACKEND_DIR}"
if "${MVN}" -s settings.xml test -Dtest=MsspIndexResolverTest -q 2>&1; then
    pass "Check 6: MsspIndexResolverTest"
else
    fail "Check 6: MsspIndexResolverTest" "mvn test -Dtest=MsspIndexResolverTest exited non-zero"
fi

# =============================================================================
# Check 7 — Alert API smoke test
# =============================================================================
printf '\n--- Check 7: Alert API smoke test ---\n'

# Step 7a: POST /api/authenticate to obtain JWT token
AUTH_RESPONSE=$(curl -s -w '\n%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
    "${BACKEND_URL}/api/authenticate" 2>&1) || true

AUTH_HTTP_STATUS=$(echo "${AUTH_RESPONSE}" | tail -n1)
AUTH_BODY=$(echo "${AUTH_RESPONSE}" | sed '$d')

if [ "${AUTH_HTTP_STATUS}" != "200" ]; then
    fail "Check 7: Alert API smoke test" "POST /api/authenticate returned HTTP ${AUTH_HTTP_STATUS}"
else
    # Step 7b: Extract JWT token from response body
    # Handles both {"id_token":"..."} and {"token":"..."} response shapes
    JWT_TOKEN=$(echo "${AUTH_BODY}" | sed 's/.*"id_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | grep -v '^{' || true)
    if [ -z "${JWT_TOKEN}" ] || [ "${JWT_TOKEN}" = "${AUTH_BODY}" ]; then
        # Try "token" key as fallback
        JWT_TOKEN=$(echo "${AUTH_BODY}" | sed 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | grep -v '^{' || true)
    fi

    if [ -z "${JWT_TOKEN}" ] || [ "${JWT_TOKEN}" = "${AUTH_BODY}" ]; then
        fail "Check 7: Alert API smoke test" "Could not extract JWT token from authenticate response"
    else
        # Step 7c: GET /api/ha-alerts?size=1 with Authorization header
        ALERTS_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
            -X GET \
            -H "Authorization: Bearer ${JWT_TOKEN}" \
            "${BACKEND_URL}/api/ha-alerts?size=1" 2>&1) || true

        if [ "${ALERTS_STATUS}" = "200" ] || [ "${ALERTS_STATUS}" = "204" ]; then
            pass "Check 7: Alert API smoke test (HTTP ${ALERTS_STATUS})"
        else
            fail "Check 7: Alert API smoke test" "GET /api/ha-alerts?size=1 returned HTTP ${ALERTS_STATUS}, expected 200 or 204"
        fi
    fi
fi

# =============================================================================
# Check 8 — Production Maven build
# =============================================================================
printf '\n--- Check 8: Production Maven build ---\n'
cd "${BACKEND_DIR}"
WAR_PATH="${BACKEND_DIR}/target/hivearmor.war"

BUILD_FAILED=0
if ! "${MVN}" -B -Pprod clean package -s settings.xml 2>&1; then
    BUILD_FAILED=1
fi

if [ "${BUILD_FAILED}" -eq 1 ]; then
    fail "Check 8: Production Maven build" "mvn -B -Pprod clean package exited non-zero"
elif [ ! -f "${WAR_PATH}" ]; then
    fail "Check 8: Production Maven build" "WAR not found at ${WAR_PATH}"
else
    pass "Check 8: Production Maven build (${WAR_PATH})"
fi

# =============================================================================
# Auxiliary Gate A — Structural gate: no hardcoded v3-hive-alert- in service/web layer
# =============================================================================
printf '\n--- Auxiliary Gate A: No hardcoded v3-hive-alert- in service/web layers ---\n'
HARDCODED_COUNT=$(grep -R '"v3-hive-alert-' \
    "${REPO_ROOT}/backend/src/main/java/com/hivearmor/service" \
    "${REPO_ROOT}/backend/src/main/java/com/hivearmor/web/rest" \
    --include='*.java' 2>/dev/null | grep -v '^import ' | wc -l | tr -d ' ') || HARDCODED_COUNT=0

if [ "${HARDCODED_COUNT}" -eq 0 ]; then
    pass "Auxiliary Gate A: Structural gate (0 hardcoded v3-hive-alert- literals)"
else
    fail "Auxiliary Gate A: Structural gate" "${HARDCODED_COUNT} hardcoded 'v3-hive-alert-' literal(s) found in service/web/rest layer"
fi

# =============================================================================
# Auxiliary Gate B — Negative gate: CHECK constraint rejects invalid client_prefix
# =============================================================================
printf '\n--- Auxiliary Gate B: CHECK constraint rejects invalid client_prefix ---\n'

# Attempt INSERT with an invalid prefix value; capture the PostgreSQL error code
CONSTRAINT_SQL="BEGIN;
INSERT INTO ha_client (client_prefix)
VALUES ('INVALID PREFIX!!')
ON CONFLICT DO NOTHING;
ROLLBACK;"

CONSTRAINT_OUTPUT=$(run_psql "${CONSTRAINT_SQL}" 2>&1) || true
CONSTRAINT_ERR_CODE=$(echo "${CONSTRAINT_OUTPUT}" | grep -oE 'ERROR:[[:space:]]+[0-9]{5}' | grep -oE '[0-9]{5}' | head -1 || true)

# PostgreSQL error code 23514 = check_violation
if [ "${CONSTRAINT_ERR_CODE}" = "23514" ]; then
    pass "Auxiliary Gate B: Negative gate (PostgreSQL error 23514 check_violation confirmed)"
else
    # Also accept the text form if numeric code not present
    if echo "${CONSTRAINT_OUTPUT}" | grep -q 'check_violation\|ha_client_prefix_fmt\|23514'; then
        pass "Auxiliary Gate B: Negative gate (check constraint violation confirmed)"
    else
        fail "Auxiliary Gate B: Negative gate" "Expected PostgreSQL error 23514 (ha_client_prefix_fmt CHECK violation), got: ${CONSTRAINT_OUTPUT}"
    fi
fi

# =============================================================================
# Summary
# =============================================================================
printf '\n================================================================\n'
printf 'Sprint 21 Verification Summary\n'
printf '  Passed: %d\n' "${PASS_COUNT}"
printf '  Failed: %d\n' "${FAIL_COUNT}"
printf '================================================================\n'

if [ "${EXIT_CODE}" -ne 0 ]; then
    printf '[FAIL] One or more Sprint 21 checks failed. Sprint 22 is NOT gated.\n'
else
    printf '[PASS] All Sprint 21 checks passed. Sprint 22 is gated and ready.\n'
fi

exit "${EXIT_CODE}"
