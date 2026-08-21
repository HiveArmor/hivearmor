#!/bin/bash
# Sprint 36 API contract tests
set -e

BASE="http://localhost:8088"

echo "=== Authenticating ==="
TOKEN=$(curl -s -X POST "$BASE/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${TOKEN:0:30}..."

echo ""
echo "=== 1. GET /api/ha-alerts (cursor pagination, limit=3) ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alerts?limit=3&sort=-severity" | python3 -m json.tool | head -40

echo ""
echo "=== 2. GET /api/ha-alerts/summary ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alerts/summary" | python3 -m json.tool | head -30

echo ""
echo "=== 3. GET /api/ha-alert-views?scope=me ==="
curl -s -w "\nHTTP:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alert-views?scope=me"

echo ""
echo ""
echo "=== 4. GET /api/ha-alerts/{id} (detail projection) ==="
# First get an alert ID from the list
ALERT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alerts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['id'] if 'items' in d and d['items'] else 'NONE')" 2>/dev/null)
echo "Alert ID: $ALERT_ID"
if [ "$ALERT_ID" != "NONE" ] && [ -n "$ALERT_ID" ]; then
  curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
    "$BASE/api/ha-alerts/$ALERT_ID" | python3 -m json.tool | head -50
fi

echo ""
echo "=== 5. Invalid sort field returns 400 ==="
curl -s -w "\nHTTP:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alerts?sort=-invalidField"

echo ""
echo ""
echo "=== 6. Invalid filter returns 400 ==="
curl -s -w "\nHTTP:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  "$BASE/api/ha-alerts?severity=INVALID_VALUE"

echo ""
echo ""
echo "=== 7. POST /api/ha-alerts/bulk/status (missing reason for closed) ==="
curl -s -w "\nHTTP:%{http_code}" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  -H "Content-Type: application/json" -H "Idempotency-Key: test-key-1" \
  -X POST "$BASE/api/ha-alerts/bulk/status" \
  -d '{"alertIds":["test-1"],"targetStatus":"closed","previewToken":"tok","itemVersions":{}}'

echo ""
echo ""
echo "=== 8. GET /api/ha-alerts/stream (SSE - first 3 lines) ==="
timeout 3 curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 1" \
  -H "Accept: text/event-stream" "$BASE/api/ha-alerts/stream" | head -5 || true

echo ""
echo "=== DONE ==="
