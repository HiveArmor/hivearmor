#!/usr/bin/env bash
# Sprint 06 — T04: AI E2E Test
# Usage: bash local-dev/tests/ai-e2e.sh
set -euo pipefail

BACKEND="${BACKEND_URL:-http://localhost:8088}"
SOC_AI="${SOC_AI_BASE_URL:-http://localhost:8090}"
PASS=0; FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1 (expected='$2', got='$3')"; FAIL=$((FAIL+1)); }
check() { [ "$2" = "$3" ] && pass "$1" || fail "$1" "$2" "$3"; }

echo "=== HiveArmor Sprint 06 — AI E2E Test ==="
echo "  Backend : $BACKEND"
echo "  SOC-AI  : $SOC_AI"
echo ""

# ── Auth ─────────────────────────────────────────────────────────────────────
TOKEN=$(curl -sf -X POST "$BACKEND/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id_token'])") || true

if [ -z "${TOKEN:-}" ]; then
  echo "  ✗ FATAL: could not authenticate against $BACKEND — is the backend running?"
  exit 1
fi
pass "JWT token obtained"

# ── Test 1: soc-ai plugin health ──────────────────────────────────────────────
echo ""
echo "[1] soc-ai plugin health..."
AI_HEALTH=$(curl -so /dev/null -w "%{http_code}" --max-time 5 "${SOC_AI}/health" 2>/dev/null || echo "000")
check "soc-ai plugin responding on ${SOC_AI}" "200" "$AI_HEALTH"

# ── Test 2: AI provider configured ───────────────────────────────────────────
echo ""
echo "[2] AI provider configured..."
AI_CONFIG=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$BACKEND/api/soc-ai/config" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('providerConfigured', False))" \
  2>/dev/null || echo "False")
check "SOC_AI_BASE_URL is set (providerConfigured=True)" "True" "$AI_CONFIG"

PLUGIN_HEALTHY=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "$BACKEND/api/soc-ai/config" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pluginHealthy', False))" \
  2>/dev/null || echo "False")
check "soc-ai plugin reachable from backend (pluginHealthy=True)" "True" "$PLUGIN_HEALTHY"

# ── Test 3: Get an alert to analyze ──────────────────────────────────────────
echo ""
echo "[3] Fetching an alert for analysis..."
ALERT_JSON=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$BACKEND/api/elasticsearch/search" \
  -d '{"indexPattern":"_v3_hive_alert-*","query":{"match_all":{}},"size":1}' 2>/dev/null || echo "{}")

ALERT_ID=$(echo "$ALERT_JSON" | python3 -c "
import sys,json
try:
    hits = json.load(sys.stdin).get('hits',{}).get('hits',[])
    print(hits[0]['_id'] if hits else 'none')
except: print('none')
" 2>/dev/null || echo "none")

echo "  ℹ Alert ID: $ALERT_ID"

if [ "$ALERT_ID" = "none" ]; then
  echo "  ⚠ No alerts in OpenSearch — skipping alert analysis tests (Tests 4-7)"
else
  # ── Test 4: Kick off analysis (202 Accepted) ──────────────────────────────
  echo ""
  echo "[4] POST /api/soc-ai/analyze (submits alert for async LLM analysis)..."
  ALERT_SOURCE=$(echo "$ALERT_JSON" | python3 -c "
import sys,json
hits = json.load(sys.stdin).get('hits',{}).get('hits',[])
src = hits[0].get('_source', {}) if hits else {}
src['id'] = hits[0]['_id'] if hits else ''
print(json.dumps(src))
" 2>/dev/null || echo "{}")

  ANALYZE_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    "$BACKEND/api/soc-ai/analyze" \
    -d "$ALERT_SOURCE" 2>/dev/null || echo "000")
  check "POST /api/soc-ai/analyze returns 202" "202" "$ANALYZE_CODE"

  # ── Test 5: Poll for result (up to 30 s) ─────────────────────────────────
  echo ""
  echo "[5] Polling /api/soc-ai/result/${ALERT_ID} for LLM result (up to 30s)..."
  RESULT="{}"
  for i in $(seq 1 6); do
    sleep 5
    HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      "$BACKEND/api/soc-ai/result/$ALERT_ID" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      RESULT=$(curl -sf -H "Authorization: Bearer $TOKEN" \
        "$BACKEND/api/soc-ai/result/$ALERT_ID" 2>/dev/null || echo "{}")
      echo "  ℹ Result received after $((i*5))s"
      break
    fi
    echo "  ℹ Waiting... (${i}/6, HTTP $HTTP_CODE)"
  done

  # ── Test 6: confidence score valid ───────────────────────────────────────
  echo ""
  echo "[6] Validating AI result fields..."
  CONFIDENCE=$(echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
c = d.get('confidenceScore')
if c is not None and 0 <= float(c) <= 1: print('valid')
else: print('invalid')
" 2>/dev/null || echo "invalid")
  check "AI confidence score is valid (0.0-1.0)" "valid" "$CONFIDENCE"

  IS_TP=$(echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
v = d.get('isTruePositive')
print(type(v).__name__)
" 2>/dev/null || echo "NoneType")
  check "AI isTruePositive is boolean" "bool" "$IS_TP"

  TACTICS=$(echo "$RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
t = d.get('mitreTactics')
if t and t != 'null': print('yes')
else: print('no')
" 2>/dev/null || echo "no")
  check "AI MITRE tactics present in result" "yes" "$TACTICS"

  # ── Test 7: GET history ────────────────────────────────────────────────────
  echo ""
  echo "[7] GET /api/soc-ai/history/${ALERT_ID}..."
  HISTORY_CODE=$(curl -so /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$BACKEND/api/soc-ai/history/$ALERT_ID" 2>/dev/null || echo "000")
  check "GET /api/soc-ai/history returns 200" "200" "$HISTORY_CODE"
fi

# ── Test 8: NL to query ───────────────────────────────────────────────────────
echo ""
echo "[8] Natural language to query..."
NL_RESULT=$(curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$BACKEND/api/ha-search/nl-query" \
  -d '{"question":"Show me failed logins in the last hour","indexPattern":"_v3_hive_log-*"}' \
  2>/dev/null || echo "{}")

QUERY_EXISTS=$(echo "$NL_RESULT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print('yes' if 'query' in d else 'no')
" 2>/dev/null || echo "no")
check "NL query returns a query object" "yes" "$QUERY_EXISTS"

# ── Test 9: Chat endpoint responds ───────────────────────────────────────────
echo ""
echo "[9] AI chat endpoint..."
CHAT_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$BACKEND/api/ha-ai/chat" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}' \
  --max-time 15 2>/dev/null || echo "000")
# SSE endpoint returns 200; we accept 200 or 202
CHAT_OK="false"
[ "$CHAT_CODE" = "200" ] || [ "$CHAT_CODE" = "202" ] && CHAT_OK="true"
check "AI chat endpoint responds (200 or 202)" "true" "$CHAT_OK"

# ── Test 10: Unauthenticated access rejected ──────────────────────────────────
echo ""
echo "[10] Security — unauthenticated AI requests rejected..."
UNAUTH_ANALYZE=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "$BACKEND/api/soc-ai/analyze" \
  -d '{"id":"test"}' 2>/dev/null || echo "000")
check "Unauthenticated POST /api/soc-ai/analyze returns 401" "401" "$UNAUTH_ANALYZE"

UNAUTH_CHAT=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "$BACKEND/api/ha-ai/chat" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}' \
  2>/dev/null || echo "000")
check "Unauthenticated POST /api/ha-ai/chat returns 401" "401" "$UNAUTH_CHAT"

UNAUTH_NL=$(curl -so /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  "$BACKEND/api/ha-search/nl-query" \
  -d '{"question":"test"}' 2>/dev/null || echo "000")
check "Unauthenticated POST /api/ha-search/nl-query returns 401" "401" "$UNAUTH_NL"

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo "==========================================="
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq "0" ]; then
  echo "✓ AI E2E passed — ready for Sprint 07"
  exit 0
else
  echo "✗ $FAIL check(s) failed — resolve before Sprint 07"
  exit 1
fi
