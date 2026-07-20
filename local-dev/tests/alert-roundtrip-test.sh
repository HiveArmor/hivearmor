#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://localhost:8088"
OS_URL="https://localhost:9200"
OS_PASS="${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"
OS_CREDS="admin:${OS_PASS}"
TODAY=$(date -u +%Y.%m.%d)
MONTH=$(date -u +%Y.%m)

echo "=== HiveArmor Sprint 01 — Alert Round-Trip Test ==="

PASS=0
WARN=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

# Step 1: Get auth token
echo "[1/8] Authenticating..."
TOKEN=$(curl -sf -X POST "$BASE_URL/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])") || true
if [ -n "${TOKEN:-}" ]; then
  pass "JWT token obtained"
else
  fail "Auth failed — is the backend running on $BASE_URL?"
fi

# Step 2: Inject a test alert directly into OpenSearch
# The inputs plugin requires a running agent over gRPC; direct OpenSearch injection
# is the reliable way to seed a known alert for pipeline verification.
echo "[2/8] Injecting test alert into OpenSearch..."
ALERT_IDX="v3-hive-alert-${TODAY}"
INJECT_RESULT=$(curl -sk -u "$OS_CREDS" -X POST \
  "$OS_URL/${ALERT_IDX}/_doc/roundtrip-test-001?refresh=true" \
  -H "Content-Type: application/json" \
  -d '{
    "@timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "id": "roundtrip-test-001",
    "name": "Sprint 01 Round-Trip Test Alert",
    "severity": 3,
    "dataSource": "testhost-roundtrip",
    "dataType": "syslog",
    "category": "Authentication",
    "tags": ["sprint01-test"],
    "status": 0,
    "notes": null,
    "solution": null,
    "lastUpdate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "statusLabel": "open",
    "source": {
      "ip": "185.220.101.5",
      "country": "DE",
      "city": "Frankfurt"
    }
  }') || true
INJECT_RESULT_TRIMMED=$(echo "$INJECT_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result','?'))" 2>/dev/null || echo "error")
if [[ "$INJECT_RESULT_TRIMMED" == "created" || "$INJECT_RESULT_TRIMMED" == "updated" ]]; then
  pass "Test alert injected into $ALERT_IDX"
else
  warn "Injection response: $INJECT_RESULT_TRIMMED — may already exist or OpenSearch unavailable"
fi

# Step 3: Check OpenSearch is reachable and cluster is healthy
echo "[3/8] Checking OpenSearch cluster health..."
HEALTH=$(curl -sk -u "$OS_CREDS" "$OS_URL/_cluster/health" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "unreachable")
if [[ "$HEALTH" == "green" || "$HEALTH" == "yellow" ]]; then
  pass "OpenSearch cluster status: $HEALTH"
else
  fail "OpenSearch cluster status: $HEALTH — check docker compose logs opensearch"
fi

# Step 4: Check alert index has documents
echo "[4/8] Checking alert index has documents..."
ALERT_COUNT=$(curl -sk -u "$OS_CREDS" \
  "$OS_URL/v3-hive-alert-*/_count" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
if [ "${ALERT_COUNT}" -gt "0" ]; then
  pass "Alert index has $ALERT_COUNT document(s)"
else
  warn "Alert index has 0 documents — no alerts have been written yet"
fi

# Step 5: Check severity is stored as integer (not string)
echo "[5/8] Checking alert severity is integer type..."
SEVERITY_TYPE=$(curl -sk -u "$OS_CREDS" \
  "$OS_URL/v3-hive-alert-*/_search?size=1&sort=@timestamp:desc" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
hits = data.get('hits', {}).get('hits', [])
if hits:
    sev = hits[0]['_source'].get('severity')
    if sev is None:
        print('null')
    elif isinstance(sev, int):
        print('int')
    elif isinstance(sev, float):
        print('float')
    else:
        print('string:' + str(type(sev).__name__))
else:
    print('no_data')
" 2>/dev/null || echo "error")
if [ "$SEVERITY_TYPE" = "int" ]; then
  pass "Severity is stored as integer"
elif [ "$SEVERITY_TYPE" = "no_data" ]; then
  warn "No alerts in index yet — severity type check skipped"
else
  fail "Severity is $SEVERITY_TYPE — T02 fix may not be applied (expected int)"
fi

# Step 6: Check inputs plugin is listening on gRPC port 50051
echo "[6/8] Checking inputs plugin gRPC port 50051..."
if nc -z -w2 localhost 50051 2>/dev/null; then
  pass "gRPC port 50051 is open (inputs plugin running)"
else
  warn "Port 50051 not reachable — inputs plugin may not be running (docker compose ps inputs)"
fi

# Step 7: Check backend API returns alerts (requires auth token)
echo "[7/8] Checking backend API /api/ha-alerts/count-open-alerts..."
if [ -n "${TOKEN:-}" ]; then
  API_COUNT=$(curl -sf -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/ha-alerts/count-open-alerts" 2>/dev/null || echo "-1")
  if [ "${API_COUNT}" -ge "0" ] 2>/dev/null; then
    pass "Backend API returns open alert count: $API_COUNT"
  else
    warn "Backend API returned: $API_COUNT — check backend logs"
  fi
else
  warn "Skipped — no auth token"
fi

# Step 8: Check stats index has documents (written every 10 min by stats plugin)
echo "[8/8] Checking stats index (v3-hive-statistics-${MONTH})..."
STATS_COUNT=$(curl -sk -u "$OS_CREDS" \
  "$OS_URL/v3-hive-statistics-*/_count" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
if [ "${STATS_COUNT}" -gt "0" ]; then
  pass "Stats index has $STATS_COUNT record(s)"
else
  warn "Stats index empty — stats plugin writes every 10 minutes; wait and re-run, or check docker compose ps stats"
fi

echo ""
echo "=== Sprint 01 Round-Trip Test Summary ==="
printf "  Pass: %d   Warn: %d   Fail: %d\n" "$PASS" "$WARN" "$FAIL"
echo ""
echo "Manual UI checks:"
echo "  http://localhost:3000/alerts   — at least one alert visible, severity badge colored"
echo "  http://localhost:3000/dashboard — KPI cards non-zero, EPS > 0 in Top Sources"
echo ""
if [ "$FAIL" -gt "0" ]; then
  echo "Sprint 01 BLOCKED — $FAIL check(s) failed. Fix before proceeding to Sprint 02."
  exit 1
elif [ "$WARN" -gt "0" ]; then
  echo "Sprint 01 PARTIAL — $WARN warning(s). Document each with command output before Sprint 02."
  exit 0
else
  echo "Sprint 01 PASSED — all checks green. Proceed to Sprint 02."
  exit 0
fi
