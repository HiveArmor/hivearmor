#!/usr/bin/env bash
# Regression test for Sprint 38: Alert Triage Drawer & Quick Actions Polish
# Tests: detail projection, notes, tags, incident-link, severity board, tenant isolation
set -euo pipefail

BACKEND="http://localhost:8088"
BASE_URL="${BACKEND}/api"
PASS=0
FAIL=0

# ─── Helpers ─────────────────────────────────────────────────────────────────

assert_contains() {
  local label="$1" response="$2" expected="$3"
  if echo "$response" | grep -q "$expected"; then
    echo "  ✓ PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $label — expected to find '$expected'"
    FAIL=$((FAIL + 1))
  fi
}

assert_status() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ PASS: $label (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $label — expected HTTP $expected, got $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local label="$1" file="$2" field="$3"
  if python3 -c "
import json, sys
data = json.load(open('$file'))
keys = '$field'.split('.')
obj = data
for k in keys:
    if isinstance(obj, dict) and k in obj:
        obj = obj[k]
    else:
        sys.exit(1)
if obj is None or obj == '' or obj == []:
    sys.exit(1)
sys.exit(0)
" 2>/dev/null; then
    echo "  ✓ PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $label — field '$field' missing or empty"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════════════"
echo " SPRINT 38: Alert Triage Drawer & Quick Actions Polish"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── 9.2 Authenticate ────────────────────────────────────────────────────────

echo "--- Authentication ---"
AUTH_RESPONSE=$(curl -s --max-time 10 -X POST "${BASE_URL}/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}')

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  ✗ FAIL: Could not authenticate — is the backend running at ${BACKEND}?"
  echo ""
  echo "Results: 0 passed, 1 failed"
  exit 1
fi
echo "  ✓ PASS: Authenticated successfully"
PASS=$((PASS + 1))

# ─── 9.3 GET /ha-alerts?limit=5 — availableActions per item ──────────────────

echo ""
echo "--- Alert Queue: availableActions ---"
STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_list.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts?limit=5")

assert_status "GET /ha-alerts?limit=5 returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s38_list.json'))
items = data.get('items', [])
if len(items) == 0:
    print('  ✗ FAIL: No items returned in alert list')
    sys.exit(1)
all_have_actions = all('availableActions' in item for item in items)
if all_have_actions:
    print(f'  ✓ PASS: All {len(items)} items have availableActions array')
else:
    missing = [i for i, item in enumerate(items) if 'availableActions' not in item]
    print(f'  ✗ FAIL: Items at indices {missing} missing availableActions')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.4 GET /ha-alerts/{id} — detail fields ─────────────────────────────────

echo ""
echo "--- Alert Detail: renderedReason, occurrenceCount, riskBreakdown, timeline ---"

ALERT_ID=$(python3 -c "
import json
data = json.load(open('/tmp/ha_s38_list.json'))
items = data.get('items', [])
if items:
    print(items[0].get('id', ''))
" 2>/dev/null || echo "")

if [ -z "$ALERT_ID" ]; then
  echo "  ✗ FAIL: Could not extract first alert ID from list"
  FAIL=$((FAIL + 1))
else
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_detail.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}/ha-alerts/${ALERT_ID}")

  assert_status "GET /ha-alerts/${ALERT_ID} returns 200" "$STATUS" "200"
  assert_json_field "Detail has renderedReason" "/tmp/ha_s38_detail.json" "renderedReason"
  assert_json_field "Detail has occurrenceCount" "/tmp/ha_s38_detail.json" "occurrenceCount"
  assert_json_field "Detail has riskBreakdown (non-empty)" "/tmp/ha_s38_detail.json" "riskBreakdown"
  assert_json_field "Detail has timeline (non-empty)" "/tmp/ha_s38_detail.json" "timeline"
fi

# ─── 9.5 POST /ha-alerts/{id}/notes — returns 201 ────────────────────────────

echo ""
echo "--- Quick Action: Create Note ---"

if [ -n "$ALERT_ID" ]; then
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_note.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"body":"Test note from sprint 38","visibility":"soc"}' \
    "${BASE_URL}/ha-alerts/${ALERT_ID}/notes")

  assert_status "POST /ha-alerts/{id}/notes returns 201" "$STATUS" "201"
else
  echo "  ⚠ SKIP: No alert ID available"
fi

# ─── 9.6 POST /ha-alerts/{id}/tags — returns 200 with updated tags ───────────

echo ""
echo "--- Quick Action: Apply Tags ---"

if [ -n "$ALERT_ID" ]; then
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_tags.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"addTags":["sprint-38-test"],"removeTags":[]}' \
    "${BASE_URL}/ha-alerts/${ALERT_ID}/tags")

  assert_status "POST /ha-alerts/{id}/tags returns 200" "$STATUS" "200"

  # Verify response contains the tag we added
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s38_tags.json'))
tags = data.get('tags', data.get('updatedTags', []))
if 'sprint-38-test' in tags:
    print('  ✓ PASS: Response contains added tag \"sprint-38-test\"')
else:
    print(f'  ✗ FAIL: Tag \"sprint-38-test\" not found in response tags: {tags}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
else
  echo "  ⚠ SKIP: No alert ID available"
fi

# ─── 9.7 POST /ha-alerts/{id}/incident-link/preview — returns previewToken ───

echo ""
echo "--- Quick Action: Incident Link Preview ---"

PREVIEW_TOKEN=""
if [ -n "$ALERT_ID" ]; then
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_preview.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"mode":"create_new"}' \
    "${BASE_URL}/ha-alerts/${ALERT_ID}/incident-link/preview")

  assert_status "POST /ha-alerts/{id}/incident-link/preview returns 200" "$STATUS" "200"

  PREVIEW_TOKEN=$(python3 -c "
import json
data = json.load(open('/tmp/ha_s38_preview.json'))
print(data.get('previewToken', ''))
" 2>/dev/null || echo "")

  if [ -n "$PREVIEW_TOKEN" ]; then
    echo "  ✓ PASS: Preview response contains previewToken"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: Preview response missing previewToken"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠ SKIP: No alert ID available"
fi

# ─── 9.8 POST /ha-alerts/{id}/incident-link — with previewToken + Idempotency-Key ─

echo ""
echo "--- Quick Action: Incident Link Execute ---"

if [ -n "$ALERT_ID" ] && [ -n "$PREVIEW_TOKEN" ]; then
  IDEMPOTENCY_KEY=$(python3 -c "import uuid; print(str(uuid.uuid4()))" 2>/dev/null || echo "sprint38-test-$(date +%s)")

  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_link.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
    -d "{\"mode\":\"create_new\",\"previewToken\":\"${PREVIEW_TOKEN}\",\"reason\":\"Sprint 38 regression test\"}" \
    "${BASE_URL}/ha-alerts/${ALERT_ID}/incident-link")

  assert_status "POST /ha-alerts/{id}/incident-link returns 200" "$STATUS" "200"
elif [ -z "$PREVIEW_TOKEN" ]; then
  echo "  ⚠ SKIP: No previewToken from previous step"
else
  echo "  ⚠ SKIP: No alert ID available"
fi

# ─── 9.9 GET /ha-alerts/severity-board — returns correct total ────────────────

echo ""
echo "--- Severity Board ---"

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
PAST=$(date -u -v-7d +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u --date="7 days ago" +"%Y-%m-%dT%H:%M:%S.000Z")

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_board.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/severity-board?from=${PAST}&to=${NOW}&scope=active&ownership=all&laneLimit=4")

assert_status "GET /ha-alerts/severity-board returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s38_board.json'))
overview = data.get('overview', {})
total = overview.get('total', 0)
lanes = data.get('lanes', [])
if total > 0:
    print(f'  ✓ PASS: Severity board total={total} (non-zero, matching seeded data)')
else:
    print(f'  ✗ FAIL: Severity board total is 0 — expected non-zero from seeded data')
    sys.exit(1)
if len(lanes) == 5:
    print(f'  ✓ PASS: Severity board has 5 lanes')
else:
    print(f'  ✗ FAIL: Expected 5 severity lanes, got {len(lanes)}')
    sys.exit(1)
" 2>/dev/null
BOARD_RESULT=$?
if [ $BOARD_RESULT -eq 0 ]; then PASS=$((PASS + 2)); else FAIL=$((FAIL + 2)); fi

# ─── 9.10 Tenant isolation — CWM only ────────────────────────────────────────

echo ""
echo "--- Tenant Isolation (CWM tenant 3813) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s38_cwm.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-ID: 3813" \
  "${BASE_URL}/ha-alerts?limit=100")

assert_status "GET /ha-alerts?limit=100 with X-Tenant-ID:3813 returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s38_cwm.json'))
items = data.get('items', [])
if len(items) == 0:
    print('  ✗ FAIL: No items returned for CWM tenant')
    sys.exit(1)
non_cwm = [item for item in items if item.get('tenantName', '').upper() != 'CWM']
if len(non_cwm) == 0:
    print(f'  ✓ PASS: All {len(items)} items belong to CWM tenant (tenant isolation verified)')
else:
    bad_tenants = set(item.get('tenantName', 'UNKNOWN') for item in non_cwm)
    print(f'  ✗ FAIL: {len(non_cwm)} items have non-CWM tenantName: {bad_tenants}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 38 REGRESSION TEST SUMMARY"
echo "═══════════════════════════════════════════════════════"
echo " Passed: ${PASS}"
echo " Failed: ${FAIL}"
echo "═══════════════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "⚠ Some tests failed — review output above."
  exit 1
else
  echo ""
  echo "✓ All Sprint 38 regression tests passed."
  exit 0
fi
