#!/usr/bin/env bash
# Sprint 02 — T05: Security Hardening End-to-End Validation
# Run with: bash local-dev/tests/security-validation.sh
# Requires: backend running on localhost:8088, Docker stack up
set -euo pipefail

BASE_URL="http://localhost:8088"
OS_URL="https://localhost:9200"
OS_PASS="${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"
OS_CREDS="admin:${OS_PASS}"
PASS=0; FAIL=0; WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1 — $2"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1 — $2"; WARN=$((WARN+1)); }

check_eq() {
    local name="$1" expected="$2" actual="$3"
    if [ "$actual" = "$expected" ]; then
        pass "$name"
    else
        fail "$name" "expected='$expected' got='$actual'"
    fi
}

echo "=== HiveArmor Sprint 02 — Security Validation ==="
echo ""

# ── Preflight: get admin token ────────────────────────────────────────────────
echo "[0] Preflight"
TOKEN=$(curl -sf -X POST "$BASE_URL/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or d.get('id_token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
    echo "  ✗ FATAL: Could not obtain JWT — is the backend running on $BASE_URL?"
    exit 1
fi
pass "Admin JWT obtained"

# ── A: Authentication & Authorization ────────────────────────────────────────
echo ""
echo "[A] Authentication & Authorization"

# Unauthenticated requests must return 401 (SecurityProblemSupport entry point).
for endpoint in "/api/uba/summary" "/api/ha-network-scans" "/api/soc-ai/result/999"; do
    code=$(curl -so /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
    check_eq "$endpoint requires auth" "401" "$code"
done

# Admin JWT must reach protected endpoints (200 or 204 acceptable)
code=$(curl -so /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/uba/summary")
if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    pass "UBA endpoint accessible with admin JWT (HTTP $code)"
    PASS=$((PASS+1))
else
    fail "UBA endpoint accessible with admin JWT" "expected 200/204 got $code"
fi

code=$(curl -so /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/ha-network-scans")
if [ "$code" = "200" ] || [ "$code" = "204" ]; then
    pass "Network scan endpoint accessible with admin JWT (HTTP $code)"
    PASS=$((PASS+1))
else
    fail "Network scan endpoint accessible with admin JWT" "expected 200/204 got $code"
fi

# ── B: SQL Injection Protection ───────────────────────────────────────────────
echo ""
echo "[B] SQL Injection Protection"

# DML statements must be rejected (HTTP 400)
for dml in \
    "DELETE FROM v3-hive-alert-2026.07.01" \
    "DROP INDEX v3-hive-alert-*" \
    "INSERT INTO v3-hive-alert-2026.07.01 VALUES (1)" \
    "UPDATE v3-hive-alert-2026.07.01 SET severity=5 WHERE 1=1"; do
    code=$(curl -so /dev/null -w "%{http_code}" -X POST \
        "$BASE_URL/api/elasticsearch/search/sql" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"query\":\"$dml\"}")
    check_eq "DML blocked: $(echo "$dml" | cut -c1-25)..." "400" "$code"
done

# Cross-index access must be rejected (HTTP 400) — SqlQueryValidator.validateIndexAccess must block non-v3-hive-* indices
cross_resp=$(curl -si -X POST \
    "$BASE_URL/api/elasticsearch/search/sql" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT * FROM other_index LIMIT 1"}' 2>/dev/null || echo "")
cross_code=$(echo "$cross_resp" | grep "^HTTP" | head -1 | awk '{print $2}')
cross_err=$(echo "$cross_resp" | grep -i "X-HiveArmor-error" || echo "")
if [ "$cross_code" = "400" ]; then
    pass "Cross-index (v3-hive-* only) blocked by SqlQueryValidator"
    PASS=$((PASS+1))
elif [ "$cross_code" = "500" ] && echo "$cross_err" | grep -qi "SQL query failed"; then
    fail "Cross-index (v3-hive-* only) blocked" "query reached OpenSearch (validator index-check not deployed) — rebuild backend"
else
    fail "Cross-index (v3-hive-* only) blocked" "expected 400 got $cross_code"
fi

# Comment injection must be rejected
code=$(curl -so /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/api/elasticsearch/search/sql" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT * FROM v3-hive-log-2026.07.01 -- comment"}')
check_eq "SQL comment injection blocked" "400" "$code"

# Valid SELECT against a v3-hive-* index must not be blocked by the validator
# (200 = data returned; 500 = validation passed but index absent in OS; 400 = blocked)
code=$(curl -so /dev/null -w "%{http_code}" -X POST \
    "$BASE_URL/api/elasticsearch/search/sql" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT dataType, COUNT(*) FROM v3-hive-log-* GROUP BY dataType LIMIT 5"}')
if [ "$code" = "200" ] || [ "$code" = "500" ]; then
    pass "Valid SELECT on v3-hive-* not blocked by validator (HTTP $code)"
    PASS=$((PASS+1))
else
    fail "Valid SELECT on v3-hive-* should not be blocked by validation" "got HTTP $code"
fi

# ── C: API Key Security ───────────────────────────────────────────────────────
echo ""
echo "[C] API Key Security"

# Create a test key and capture the plain key returned in the response
CREATE_RESPONSE=$(curl -sf -X POST "$BASE_URL/api/api-keys" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"sec-validation-test","allowedIp":[],"expiresAt":null}' 2>/dev/null || echo '{}')

NEW_KEY=$(echo "$CREATE_RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('plainKey') or '')
" 2>/dev/null || echo "")

if [ ${#NEW_KEY} -ge 10 ]; then
    pass "API key creation returns plainKey (len=${#NEW_KEY})"
    PASS=$((PASS+1))
else
    fail "API key creation should return plainKey" "got: '$NEW_KEY'"
fi

# Verify plaintext is NOT in the api_key column; hash IS in api_key_hash
POSTGRES_CTR=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -1)
if [ -n "$POSTGRES_CTR" ]; then
    RAW_KEY=$(docker exec "$POSTGRES_CTR" psql -U postgres -d hivearmor -t -c \
        "SELECT api_key FROM api_keys WHERE name='sec-validation-test';" 2>/dev/null \
        | tr -d ' \n\r' || echo "query_failed")
    check_eq "Plaintext NOT stored in api_key column" "" "$RAW_KEY"

    HASH_LEN=$(docker exec "$POSTGRES_CTR" psql -U postgres -d hivearmor -t -c \
        "SELECT COALESCE(CAST(LENGTH(api_key_hash) AS TEXT),'null') FROM api_keys WHERE name='sec-validation-test';" 2>/dev/null \
        | tr -d ' \n\r' || echo "query_failed")
    check_eq "SHA-256 hash stored (64 hex chars)" "64" "$HASH_LEN"

    # Cleanup test key
    docker exec "$POSTGRES_CTR" psql -U postgres -d hivearmor -c \
        "DELETE FROM api_keys WHERE name='sec-validation-test';" > /dev/null 2>&1 || true
else
    warn "Postgres container not found" "skipping DB checks — run 'docker ps' to diagnose"
fi

# ── D: CORS Configuration ─────────────────────────────────────────────────────
echo ""
echo "[D] CORS Configuration (SEC-03)"

CORS_ORIGIN=$(curl -sv -X OPTIONS "$BASE_URL/api/authenticate" \
    -H "Origin: http://malicious.example.com" \
    -H "Access-Control-Request-Method: GET" 2>&1 \
    | grep -i "^< access-control-allow-origin:" | tr -d '\r\n' || echo "")

WILDCARD=$(echo "$CORS_ORIGIN" | grep -o '\*' || echo "")
check_eq "Wildcard CORS (*) not returned for arbitrary origin" "" "$WILDCARD"

if [ -n "$CORS_ORIGIN" ]; then
    pass "CORS header is set to a specific origin: $CORS_ORIGIN"
    PASS=$((PASS+1))
else
    warn "No Access-Control-Allow-Origin returned for unknown origin" "this is acceptable (origin rejected)"
fi

# ── E: TLS Verification (SEC-04) ─────────────────────────────────────────────
echo ""
echo "[E] TLS Verification (SEC-04)"

EP_CTR=$(docker ps --filter "name=eventprocessor" --format "{{.Names}}" | head -1)
if [ -n "$EP_CTR" ]; then
    INSECURE=$(docker logs "$EP_CTR" 2>&1 | grep -i "InsecureSkipVerify\|insecure_trust\|InsecureTrustManager" || echo "NOT_FOUND")
    check_eq "InsecureSkipVerify NOT in event-processor logs" "NOT_FOUND" "$INSECURE"
else
    warn "Event-processor container not found" "skipping log check — run 'docker ps' to diagnose"
fi

# Verify backend gRPC config uses proper TrustManager (static check)
GRPC_CFG="/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/hivearmor/config/GrpcConfiguration.java"
if [ -f "$GRPC_CFG" ]; then
    INSECURE_IN_SRC=$(grep -c "InsecureTrustManagerFactory" "$GRPC_CFG" 2>/dev/null; true)
    PROPER_TLS=$(grep -c "buildX509TrustManager\|trustManager" "$GRPC_CFG" 2>/dev/null; true)
    check_eq "InsecureTrustManagerFactory removed from GrpcConfiguration.java" "0" "$INSECURE_IN_SRC"
    if [ "$PROPER_TLS" -gt "0" ]; then
        pass "Proper TrustManager wired in GrpcConfiguration.java"
        PASS=$((PASS+1))
    else
        fail "No X509TrustManager found in GrpcConfiguration.java" "TLS fix may be incomplete"
    fi
fi

# ── F: JWT Token Lifetime ─────────────────────────────────────────────────────
echo ""
echo "[F] JWT Token Lifetime (SEC-02)"

LIFETIME=$(python3 - "$TOKEN" <<'EOF'
import sys, base64, json, time

token = sys.argv[1]
parts = token.split('.')
if len(parts) != 3:
    print("invalid")
    sys.exit(0)

payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
try:
    claims = json.loads(base64.urlsafe_b64decode(payload))
    exp = claims.get('exp')
    iat = claims.get('iat')
    if exp is None:
        print("no_exp")
        sys.exit(0)
    # Prefer iat when present; fall back to current time so freshly-issued tokens work
    if iat is None:
        # No iat — compute time remaining instead; flag with prefix so caller can warn
        remaining = exp - int(time.time())
        print("no_iat:" + str(remaining))
        sys.exit(0)
    print(str(exp - iat))
except Exception as e:
    print("error:" + str(e))
EOF
)

if [ "$LIFETIME" = "no_exp" ]; then
    fail "JWT token lifetime" "exp claim missing in JWT"
elif echo "$LIFETIME" | grep -q "^error\|^invalid"; then
    fail "JWT token lifetime" "could not decode JWT: $LIFETIME"
elif echo "$LIFETIME" | grep -q "^no_iat:"; then
    # JWT missing iat — verify remaining TTL instead of full configured lifetime
    REMAINING=${LIFETIME#no_iat:}
    if [ "$REMAINING" -le "28800" ] && [ "$REMAINING" -gt "0" ] 2>/dev/null; then
        warn "JWT has no iat claim (DEBT-14)" "remaining TTL is ${REMAINING}s which is ≤ 28800 — add iat to JWT claims for auditability"
    else
        fail "JWT remaining TTL is ${REMAINING}s" "expected ≤ 28800 (8 hours) — check token-validity-in-seconds config"
    fi
elif [ "$LIFETIME" -le "28800" ] && [ "$LIFETIME" -gt "0" ] 2>/dev/null; then
    pass "JWT token lifetime is ${LIFETIME}s (≤ 28800 / 8 hours)"
    PASS=$((PASS+1))
else
    fail "JWT token lifetime is ${LIFETIME}s" "expected ≤ 28800 (8 hours) — check token-validity-in-seconds config"
fi

# ── G: Audit Events in OpenSearch ─────────────────────────────────────────────
echo ""
echo "[G] Audit Trail (T03)"

AUDIT_IDX="v11-backend-logs"
AUTH_COUNT=$(curl -sk -u "$OS_CREDS" \
    "$OS_URL/${AUDIT_IDX}/_count" \
    -H "Content-Type: application/json" \
    -d '{"query":{"terms":{"type.keyword":["AUTH_SUCCESS","AUTH_FAILURE","AUTH_LOGOUT","ALERT_STATUS_UPDATE_SUCCESS","INCIDENT_CREATED","API_KEY_CREATE_SUCCESS","API_KEY_DELETE_SUCCESS","AGENT_COMMAND_EXECUTED"]}}}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

if [ "${AUTH_COUNT}" -gt "0" ]; then
    pass "Audit events present in $AUDIT_IDX (${AUTH_COUNT} records)"
    PASS=$((PASS+1))
else
    warn "No audit events found in $AUDIT_IDX" "if backend just started, trigger a login/logout and re-run"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "==================================================="
printf "Results: %d passed, %d warned, %d failed\n" "$PASS" "$WARN" "$FAIL"
echo ""

if [ "$FAIL" -gt "0" ]; then
    echo "✗ $FAIL check(s) FAILED — do not proceed to Sprint 03 until resolved."
    echo ""
    echo "Common cause: source changes not compiled into the running container."
    echo "Rebuild and restart with:"
    echo "  cd local-dev && docker compose build backend && docker compose up -d backend"
    echo ""
    echo "Manual DB verification (after rebuild):"
    echo "  docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -c \\"
    echo "    \"SELECT name, key_prefix, LENGTH(api_key_hash) AS hash_len, api_key FROM api_keys;\""
    echo "  -- api_key must be NULL for all rows; hash_len must be 64"
    exit 1
elif [ "$WARN" -gt "0" ]; then
    echo "⚠ All checks passed with $WARN warning(s) — investigate warnings before Sprint 03."
    exit 0
else
    echo "✓ All security checks passed — Sprint 02 complete. Proceed to Sprint 03."
    exit 0
fi
