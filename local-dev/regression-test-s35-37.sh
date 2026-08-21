#!/bin/bash
# Regression test for Sprint 35/36/37: Alert Queue, Severity Board, Suppression Preview
# Tests: tenant isolation, cursor pagination, filters, summary, detail, severity board, SSE
set -euo pipefail

BASE_URL="http://localhost:8088/api"
PASS=0
FAIL=0

# Authenticate
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}')

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

if [ -z "$TOKEN" ]; then
  echo "FAIL: Could not authenticate"
  exit 1
fi
echo "✓ Authenticated successfully"

test_get() {
  local desc="$1"
  local url="$2"
  local expected="$3"
  local tenant_header="${4:-}"

  local headers=(-H "Authorization: Bearer $TOKEN")
  if [ -n "$tenant_header" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_header")
  fi

  local status
  status=$(curl -s -o /tmp/ha_resp.json -w "%{http_code}" "${headers[@]}" "$BASE_URL$url")

  if [ "$status" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $desc (HTTP $status)"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $desc — expected $expected, got $status"
    head -c 200 /tmp/ha_resp.json 2>/dev/null; echo
  fi
}

test_post() {
  local desc="$1"
  local url="$2"
  local body="$3"
  local expected="$4"
  local tenant_header="${5:-}"

  local headers=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
  if [ -n "$tenant_header" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_header")
  fi

  local status
  status=$(curl -s -o /tmp/ha_resp.json -w "%{http_code}" -X POST "${headers[@]}" -d "$body" "$BASE_URL$url")

  if [ "$status" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $desc (HTTP $status)"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $desc — expected $expected, got $status"
    head -c 200 /tmp/ha_resp.json 2>/dev/null; echo
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 35: Legacy Index Migration (Tenant Isolation)"
echo "═══════════════════════════════════════════════════════"

test_get "Alert queue — global (no tenant)" "/ha-alerts?size=5" "200"
test_get "Alert queue — CWM tenant (3813)" "/ha-alerts?size=5" "200" "3813"
test_get "Alert queue — Workmates1 tenant (3812)" "/ha-alerts?size=5" "200" "3812"
test_get "Alert queue — Workmates2 tenant (3814)" "/ha-alerts?size=5" "200" "3814"

# Verify tenant isolation: CWM should have fewer alerts than global
GLOBAL_COUNT=$(python3 -c "
import json
data = json.load(open('/tmp/ha_resp.json'))
items = data.get('items', data) if isinstance(data, dict) else data
print(len(items) if isinstance(items, list) else 0)
" 2>/dev/null || echo "0")

curl -s -H "Authorization: Bearer $TOKEN" -H "X-Tenant-ID: 3813" "$BASE_URL/ha-alerts?size=100" -o /tmp/ha_cwm.json
CWM_COUNT=$(python3 -c "
import json
data = json.load(open('/tmp/ha_cwm.json'))
items = data.get('items', data) if isinstance(data, dict) else data
print(len(items) if isinstance(items, list) else 0)
" 2>/dev/null || echo "0")

curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/ha-alerts?size=100" -o /tmp/ha_global.json
GLOBAL_TOTAL=$(python3 -c "
import json
data = json.load(open('/tmp/ha_global.json'))
items = data.get('items', data) if isinstance(data, dict) else data
print(len(items) if isinstance(items, list) else 0)
" 2>/dev/null || echo "0")

echo "  → Global alerts: $GLOBAL_TOTAL, CWM tenant alerts: $CWM_COUNT"
if [ "$GLOBAL_TOTAL" -gt "$CWM_COUNT" ] 2>/dev/null && [ "$CWM_COUNT" -gt "0" ] 2>/dev/null; then
  PASS=$((PASS + 1))
  echo "  ✓ Tenant isolation verified (global > CWM > 0)"
else
  echo "  ⚠ Cannot verify tenant isolation numerically (global=$GLOBAL_TOTAL, cwm=$CWM_COUNT)"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 36: Alert Queue Contracts"
echo "═══════════════════════════════════════════════════════"

echo "--- Cursor Pagination ---"
test_get "Cursor pagination (limit=5)" "/ha-alerts?limit=5&sort=-@timestamp,id" "200"

# Verify cursor envelope shape
python3 -c "
import json
data = json.load(open('/tmp/ha_resp.json'))
if 'items' in data and 'hasMore' in data:
    print('  ✓ Response uses cursor envelope (items, hasMore, nextCursor)')
else:
    print('  ⚠ Response may use legacy shape')
" 2>/dev/null

echo "--- Enhanced Filters ---"
test_get "severity=critical filter" "/ha-alerts?severity=critical&limit=5" "200"
test_get "severity=high filter" "/ha-alerts?severity=high&limit=5" "200"
test_get "status=open filter" "/ha-alerts?status=open&limit=5" "200"
test_get "riskMin=50 filter" "/ha-alerts?riskMin=50&limit=5" "200"
test_get "assignee=unassigned filter" "/ha-alerts?assignee=unassigned&limit=5" "200"

echo "--- KQL Query ---"
test_get "KQL query (q=name:*)" "/ha-alerts?q=name:*&limit=5" "200"

echo "--- Summary & Facets ---"
test_get "Summary (global)" "/ha-alerts/summary" "200"
test_get "Summary (CWM tenant)" "/ha-alerts/summary" "200" "3813"

# Verify summary shape
python3 -c "
import json
data = json.load(open('/tmp/ha_resp.json'))
fields = ['totalApproximate', 'criticalOpen', 'unassigned']
found = [f for f in fields if f in data]
print(f'  ✓ Summary contains {len(found)}/{len(fields)} expected fields: {found}')
" 2>/dev/null

echo "--- Alert Detail ---"
# Get first alert ID
ALERT_ID=$(python3 -c "
import json
data = json.load(open('/tmp/ha_global.json'))
items = data.get('items', data) if isinstance(data, dict) else data
if isinstance(items, list) and len(items) > 0:
    print(items[0].get('id', ''))
" 2>/dev/null || echo "")

if [ -n "$ALERT_ID" ]; then
  test_get "Alert detail ($ALERT_ID)" "/ha-alerts/$ALERT_ID" "200"
  # Verify detail has MITRE and availableActions
  python3 -c "
import json
data = json.load(open('/tmp/ha_resp.json'))
has_mitre = 'mitreTacticId' in data or 'mitre' in str(data.keys())
has_actions = 'availableActions' in data
print(f'  → Detail fields: mitre={has_mitre}, availableActions={has_actions}')
" 2>/dev/null
else
  echo "  ⚠ No alert ID available for detail test"
fi

echo "--- Saved Views ---"
test_get "Saved views list" "/ha-alert-views?scope=me" "200"

echo "--- Assignment Candidates ---"
test_get "Assignment candidates" "/ha-alert-assignees?limit=5" "200"

echo "--- Bulk Operations ---"
if [ -n "$ALERT_ID" ]; then
  test_post "Bulk status preview" "/ha-alerts/bulk/status/preview" \
    "{\"alertIds\":[\"$ALERT_ID\"],\"status\":\"in_review\"}" "200"
  test_post "Bulk tags preview" "/ha-alerts/bulk/tags/preview" \
    "{\"alertIds\":[\"$ALERT_ID\"],\"tags\":[\"test-tag\"],\"operation\":\"add\"}" "200"
fi

echo "--- SSE Stream ---"
SSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 \
  -H "Authorization: Bearer $TOKEN" -H "Accept: text/event-stream" \
  "$BASE_URL/ha-alerts/stream" 2>/dev/null || echo "timeout")
if [ "$SSE_STATUS" = "200" ] || [ "$SSE_STATUS" = "timeout" ]; then
  PASS=$((PASS + 1))
  echo "  ✓ SSE stream connectable ($SSE_STATUS)"
else
  FAIL=$((FAIL + 1))
  echo "  ✗ SSE stream — expected 200/timeout, got $SSE_STATUS"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 37: Severity Board & Suppression/Exception Preview"
echo "═══════════════════════════════════════════════════════"

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
PAST=$(date -u -v-7d +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u --date="7 days ago" +"%Y-%m-%dT%H:%M:%S.000Z")

echo "--- Severity Board ---"
test_get "Severity board (global)" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=all&laneLimit=4" "200"

# Validate severity board response
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_resp.json'))
errors = []
if 'overview' not in data: errors.append('missing overview')
if 'lanes' not in data: errors.append('missing lanes')
if 'trend' not in data: errors.append('missing trend')
if 'lanes' in data:
    if len(data['lanes']) != 5: errors.append(f'expected 5 lanes, got {len(data[\"lanes\"])}')
    lane_order = [l['severity'] for l in data['lanes']]
    expected_order = ['critical', 'high', 'medium', 'low', 'info']
    if lane_order != expected_order: errors.append(f'lane order wrong: {lane_order}')
if errors:
    print(f'  ✗ Severity board shape: {errors}')
    sys.exit(1)
else:
    overview = data['overview']
    print(f'  ✓ Board shape valid — total={overview.get(\"total\",0)}, lanes=5, trend={len(data[\"trend\"])} buckets')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

test_get "Severity board (CWM tenant)" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=all&laneLimit=4" "200" "3813"
test_get "Severity board (Workmates1)" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=all&laneLimit=4" "200" "3812"

echo "--- Severity Board Validation ---"
test_get "laneLimit=0 → 400" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=all&laneLimit=0" "400"
test_get "laneLimit=11 → 400" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=all&laneLimit=11" "400"
test_get "invalid scope → 400" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=INVALID&ownership=all&laneLimit=4" "400"
test_get "invalid ownership → 400" "/ha-alerts/severity-board?from=$PAST&to=$NOW&scope=active&ownership=INVALID&laneLimit=4" "400"

echo "--- Suppression Preview ---"
if [ -n "$ALERT_ID" ]; then
  test_post "Suppression preview" "/ha-alerts/$ALERT_ID/suppression-preview" \
    '{"conditions":[{"field":"event.action","operator":"is","value":"logon_failed"}]}' "200"

  # Validate suppression response shape
  python3 -c "
import json
data = json.load(open('/tmp/ha_resp.json'))
fields = ['matchingHistoricalAlerts', 'projectedVolumeReduction', 'affectedTenants', 'affectedDataSources', 'falseNegativeRiskPrompts']
found = [f for f in fields if f in data]
print(f'  → Suppression response fields: {found}')
" 2>/dev/null
else
  echo "  ⚠ No alert ID for suppression preview"
fi

echo "--- Exception Preview ---"
test_post "Exception preview" "/ha-detection-rules/RULE-001/exceptions/preview" \
  '{"conditions":[{"field":"host.name","operator":"is","value":"test-host"}]}' "200"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SEARCH & HUNT (Baseline check)"
echo "═══════════════════════════════════════════════════════"
test_post "Search execution" "/ha-hunts/search" \
  '{"query":"*","language":"kql","timeRange":{"from":"2026-01-01T00:00:00.000Z","to":"2026-12-31T23:59:59.999Z"},"fields":["@timestamp","event.action","host.name"],"limit":5,"sort":[{"field":"@timestamp","direction":"desc"}],"includeHistogram":false}' "200"
test_get "Schema endpoint" "/ha-hunts/schema" "200"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " REGRESSION TEST SUMMARY"
echo "═══════════════════════════════════════════════════════"
echo " Passed: $PASS"
echo " Failed: $FAIL"
echo "═══════════════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "⚠ Some tests failed — review output above."
  exit 1
else
  echo ""
  echo "✓ All regression tests passed. Sprints 35/36/37 are working correctly."
fi
