#!/bin/bash
# Sprint 36 API tests using X-Tenant-Prefix: cwm (direct prefix header)
BASE="http://localhost:8088"

echo "=== Auth ==="
TOKEN=$(curl -s -X POST "$BASE/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "OK: ${TOKEN:0:20}..."

echo ""
echo "=== 1. GET /api/ha-alerts (cwm tenant, limit=5) ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  "$BASE/api/ha-alerts?limit=5&sort=-severity" | python3 -m json.tool 2>/dev/null | head -60

echo ""
echo "=== 2. GET /api/ha-alerts/summary (cwm) ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  "$BASE/api/ha-alerts/summary" | python3 -m json.tool 2>/dev/null | head -40

echo ""
echo "=== 3. GET /api/ha-alerts/{id} detail ==="
ALERT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  "$BASE/api/ha-alerts?limit=1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['id'] if d.get('items') else 'NONE')" 2>/dev/null)
echo "AlertID: $ALERT_ID"
if [ "$ALERT_ID" != "NONE" ] && [ -n "$ALERT_ID" ]; then
  curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
    "$BASE/api/ha-alerts/$ALERT_ID" | python3 -m json.tool 2>/dev/null | head -80
fi

echo ""
echo "=== 4. Cursor pagination: page 2 via cursor ==="
CURSOR=$(curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  "$BASE/api/ha-alerts?limit=3&sort=-severity" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextCursor','NONE'))" 2>/dev/null)
echo "Cursor: ${CURSOR:0:30}..."
if [ "$CURSOR" != "NONE" ] && [ "$CURSOR" != "None" ] && [ -n "$CURSOR" ]; then
  echo "Fetching page 2..."
  curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
    "$BASE/api/ha-alerts?limit=3&sort=-severity&cursor=$CURSOR" | python3 -m json.tool 2>/dev/null | head -30
fi

echo ""
echo "=== 5. Filter: severity=critical ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  "$BASE/api/ha-alerts?severity=critical&limit=10" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Total critical: {d[\"totalApproximate\"]}, items: {len(d[\"items\"])}')" 2>/dev/null

echo ""
echo "=== 6. SSE stream (2 second sample) ==="
curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Prefix: cwm" \
  -H "Accept: text/event-stream" "$BASE/api/ha-alerts/stream" &
SSE_PID=$!
sleep 2
kill $SSE_PID 2>/dev/null
wait $SSE_PID 2>/dev/null

echo ""
echo "=== DONE ==="
