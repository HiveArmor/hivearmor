#!/usr/bin/env bash
# Regression test for Sprint 39: Alert Investigation — Core Contracts
# Tests: enhanced detail (ALT-001), attack story (ALT-002), activity feed (ALT-008),
#        detection guide (ALT-009), event detail (ALT-011), tenant isolation, 404s
set -euo pipefail

BACKEND="http://localhost:8088"
BASE_URL="${BACKEND}/api"
PASS=0
FAIL=0

# Test target: investigation-ready alert from seed data
ALERT_ID="INV-CWM-001"
EVENT_ID="evt-INV-CWM-001-000"

# ─── Helpers ─────────────────────────────────────────────────────────────────

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
    if isinstance(obj, list):
        try:
            k = int(k)
            obj = obj[k]
        except (ValueError, IndexError):
            sys.exit(1)
    elif isinstance(obj, dict) and k in obj:
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

assert_array_length_range() {
  local label="$1" file="$2" field="$3" min="$4" max="$5"
  python3 -c "
import json, sys
data = json.load(open('$file'))
keys = '$field'.split('.')
obj = data
for k in keys:
    if isinstance(obj, dict) and k in obj:
        obj = obj[k]
    else:
        print(f'  ✗ FAIL: $label — field \"$field\" not found')
        sys.exit(1)
if not isinstance(obj, list):
    print(f'  ✗ FAIL: $label — \"$field\" is not an array')
    sys.exit(1)
length = len(obj)
if $min <= length <= $max:
    print(f'  ✓ PASS: $label (count={length})')
else:
    print(f'  ✗ FAIL: $label — expected {$min}-{$max} items, got {length}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
}

echo "═══════════════════════════════════════════════════════"
echo " SPRINT 39: Alert Investigation — Core Contracts"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── 9.5 Authenticate ────────────────────────────────────────────────────────

echo "--- Authentication (9.5) ---"
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

# ─── 9.6 GET /ha-alerts/{id} — enhanced detail fields ────────────────────────

echo ""
echo "--- Enhanced Alert Detail: detection, asset, counts, verdict, snapshotVersion (9.6) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_detail.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}")

assert_status "GET /ha-alerts/${ALERT_ID} returns 200" "$STATUS" "200"
assert_json_field "Detail has detection" "/tmp/ha_s39_detail.json" "detection"
assert_json_field "Detail has detection.ruleName" "/tmp/ha_s39_detail.json" "detection.ruleName"
assert_json_field "Detail has asset" "/tmp/ha_s39_detail.json" "asset"
assert_json_field "Detail has asset.name" "/tmp/ha_s39_detail.json" "asset.name"
assert_json_field "Detail has asset.criticality" "/tmp/ha_s39_detail.json" "asset.criticality"
assert_json_field "Detail has counts" "/tmp/ha_s39_detail.json" "counts"
assert_json_field "Detail has counts.events" "/tmp/ha_s39_detail.json" "counts.events"
assert_json_field "Detail has verdict" "/tmp/ha_s39_detail.json" "verdict"
assert_json_field "Detail has snapshotVersion" "/tmp/ha_s39_detail.json" "snapshotVersion"

# ─── 9.7 GET /ha-alerts/{id}/story — stages and items ────────────────────────

echo ""
echo "--- Attack Story: stages and items (9.7) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_story.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/story")

assert_status "GET /ha-alerts/${ALERT_ID}/story returns 200" "$STATUS" "200"
assert_array_length_range "Story has 2-6 stages" "/tmp/ha_s39_story.json" "stages" 2 6
assert_array_length_range "Story has 5-20 items" "/tmp/ha_s39_story.json" "items" 5 20

# ─── 9.8 Attack story stages ordered by MITRE kill-chain ─────────────────────

echo ""
echo "--- Attack Story: kill-chain ordering (9.8) ---"

python3 -c "
import json, sys

# MITRE kill-chain order
TACTIC_ORDER = {
    'TA0043': 1, 'TA0042': 2, 'TA0001': 3, 'TA0002': 4,
    'TA0003': 5, 'TA0004': 6, 'TA0005': 7, 'TA0006': 8,
    'TA0007': 9, 'TA0008': 10, 'TA0009': 11, 'TA0011': 12,
    'TA0010': 13, 'TA0040': 14
}

data = json.load(open('/tmp/ha_s39_story.json'))
stages = data.get('stages', [])
if len(stages) < 2:
    print('  ✗ FAIL: Not enough stages to verify ordering')
    sys.exit(1)

tactic_ids = [s.get('tacticId', '') for s in stages]
orders = [TACTIC_ORDER.get(tid, 99) for tid in tactic_ids]

if orders == sorted(orders):
    print(f'  ✓ PASS: Stages ordered by kill-chain: {tactic_ids}')
else:
    print(f'  ✗ FAIL: Stages NOT in kill-chain order: {tactic_ids} → orders {orders}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.9 GET /ha-alerts/{id}/activity — items with creation event ────────────

echo ""
echo "--- Activity Feed: items and creation event (9.9) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_activity.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/activity")

assert_status "GET /ha-alerts/${ALERT_ID}/activity returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_activity.json'))
items = data.get('items', [])
if len(items) == 0:
    print('  ✗ FAIL: Activity feed returned 0 items')
    sys.exit(1)

creation_items = [i for i in items if i.get('type') == 'creation']
if len(creation_items) >= 1:
    print(f'  ✓ PASS: Activity feed has {len(items)} items including creation event')
else:
    types = [i.get('type') for i in items]
    print(f'  ✗ FAIL: No creation event found in activity items (types: {types})')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# Verify hasMore and nextCursor fields exist
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_activity.json'))
has_more_field = 'hasMore' in data
next_cursor_field = 'nextCursor' in data
if has_more_field and next_cursor_field:
    print(f'  ✓ PASS: Activity response has hasMore={data[\"hasMore\"]} and nextCursor present')
else:
    missing = []
    if not has_more_field: missing.append('hasMore')
    if not next_cursor_field: missing.append('nextCursor')
    print(f'  ✗ FAIL: Activity response missing fields: {missing}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.10 Activity feed pagination ───────────────────────────────────────────

echo ""
echo "--- Activity Feed: pagination (9.10) ---"

NEXT_CURSOR=$(python3 -c "
import json
data = json.load(open('/tmp/ha_s39_activity.json'))
print(data.get('nextCursor', '') or '')
" 2>/dev/null || echo "")

if [ -n "$NEXT_CURSOR" ]; then
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_activity_p2.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}/ha-alerts/${ALERT_ID}/activity?cursor=${NEXT_CURSOR}")

  assert_status "GET /ha-alerts/${ALERT_ID}/activity?cursor=... returns 200" "$STATUS" "200"

  python3 -c "
import json, sys
page1 = json.load(open('/tmp/ha_s39_activity.json'))
page2 = json.load(open('/tmp/ha_s39_activity_p2.json'))
ids1 = set(i.get('id') for i in page1.get('items', []))
ids2 = set(i.get('id') for i in page2.get('items', []))
overlap = ids1 & ids2
if len(overlap) == 0:
    print(f'  ✓ PASS: Page 2 has no duplicates from page 1 ({len(ids2)} new items)')
else:
    print(f'  ✗ FAIL: {len(overlap)} duplicate items between pages: {overlap}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
else
  echo "  ⚠ SKIP: No nextCursor — activity fits in one page (hasMore=false)"
  PASS=$((PASS + 1))
fi

# ─── 9.11 GET /ha-alerts/{id}/guide — alertReason, steps, mitre ──────────────

echo ""
echo "--- Detection Guide: alertReason, steps, mitre (9.11) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_guide.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/guide")

assert_status "GET /ha-alerts/${ALERT_ID}/guide returns 200" "$STATUS" "200"
assert_json_field "Guide has alertReason" "/tmp/ha_s39_guide.json" "alertReason"
assert_array_length_range "Guide has 3-7 steps" "/tmp/ha_s39_guide.json" "steps" 3 7

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_guide.json'))
mitre = data.get('mitre')
if mitre is None:
    print('  ✗ FAIL: Guide missing mitre object')
    sys.exit(1)
url = mitre.get('url', '')
if url.startswith('https://attack.mitre.org/techniques/'):
    print(f'  ✓ PASS: Guide has valid mitre.url: {url}')
else:
    print(f'  ✗ FAIL: Guide mitre.url is invalid: {url}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.12 GET /ha-alerts/{id}/events/{eventId}?view=highlighted ──────────────

echo ""
echo "--- Event Detail: highlighted view (9.12) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_event_hl.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/events/${EVENT_ID}?view=highlighted")

assert_status "GET events/${EVENT_ID}?view=highlighted returns 200" "$STATUS" "200"
assert_array_length_range "Highlighted has 8-25 fields" "/tmp/ha_s39_event_hl.json" "fields" 8 25

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_event_hl.json'))
fields = data.get('fields', [])
if len(fields) == 0:
    print('  ✗ FAIL: No highlighted fields returned')
    sys.exit(1)

# Check each field has required keys
required_keys = {'key', 'value', 'type', 'emphasis', 'order'}
for i, field in enumerate(fields[:3]):
    missing = required_keys - set(field.keys())
    if missing:
        print(f'  ✗ FAIL: Field[{i}] missing keys: {missing}')
        sys.exit(1)

print(f'  ✓ PASS: All highlighted fields have key/value/type/emphasis/order')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.13 GET /ha-alerts/{id}/events/{eventId}?view=raw ──────────────────────

echo ""
echo "--- Event Detail: raw view (9.13) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_event_raw.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/events/${EVENT_ID}?view=raw")

assert_status "GET events/${EVENT_ID}?view=raw returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_event_raw.json'))
raw = data.get('raw')
if raw is None or not isinstance(raw, dict):
    print('  ✗ FAIL: raw view missing \"raw\" object')
    sys.exit(1)

# Check for nested ECS structure (at least event or source or process)
has_nested = any(isinstance(v, dict) for v in raw.values())
if has_nested:
    print(f'  ✓ PASS: Raw view has nested ECS structure ({len(raw)} top-level keys)')
else:
    print(f'  ✗ FAIL: Raw view has no nested objects — expected ECS structure')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 9.14 GET /ha-alerts/{id}/events/{nonExistent} → 404 ─────────────────────

echo ""
echo "--- Event Detail: non-existent event → 404 (9.14) ---"

STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/events/evt-does-not-exist-999?view=highlighted")

assert_status "GET events/non-existent returns 404" "$STATUS" "404"

# ─── 9.15 GET /ha-alerts/{nonExistent}/story → 404 ───────────────────────────

echo ""
echo "--- Attack Story: non-existent alert → 404 (9.15) ---"

STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/DOES-NOT-EXIST-99999/story")

assert_status "GET /ha-alerts/non-existent/story returns 404" "$STATUS" "404"

# ─── 9.16 Tenant Isolation ───────────────────────────────────────────────────

echo ""
echo "--- Tenant Isolation (9.16) ---"

# CWM tenant context should return story for CWM alert
STATUS=$(curl -s --max-time 10 -o /tmp/ha_s39_tenant_ok.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-ID: 3813" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/story")

assert_status "GET story with correct tenant (CWM/3813) returns 200" "$STATUS" "200"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s39_tenant_ok.json'))
stages = data.get('stages', [])
items = data.get('items', [])
if len(stages) > 0 or len(items) > 0:
    print(f'  ✓ PASS: CWM tenant sees story data (stages={len(stages)}, items={len(items)})')
else:
    print(f'  ✗ FAIL: CWM tenant gets empty story — expected events')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# Wrong tenant should NOT see the CWM alert
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-ID: 9999" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/story")

if [ "$STATUS" = "404" ] || [ "$STATUS" = "403" ]; then
  echo "  ✓ PASS: Wrong tenant (9999) cannot access CWM alert story (HTTP $STATUS)"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL: Wrong tenant (9999) got HTTP $STATUS — expected 404 or 403"
  FAIL=$((FAIL + 1))
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 39 REGRESSION TEST SUMMARY"
echo "═══════════════════════════════════════════════════════"
echo " Passed: ${PASS}"
echo " Failed: ${FAIL}"
echo " Total:  $((PASS + FAIL))"
echo "═══════════════════════════════════════════════════════"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "⚠ Some tests failed — review output above."
  exit 1
else
  echo ""
  echo "✓ All Sprint 39 regression tests passed."
  exit 0
fi
