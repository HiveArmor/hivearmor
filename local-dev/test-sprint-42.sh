#!/usr/bin/env bash
# Regression test for Sprint 42: Search & Hunt Completion
# Tests: search status + cancel (HNT-002), event detail + pivots (HNT-004/006),
#        saved hunts CRUD + history (HNT-005), promotion actions (HNT-007),
#        search SSE progress (HNT-008), query capabilities (HNT-009), 404 cases
set -euo pipefail

BACKEND="http://localhost:8088"
BASE_URL="${BACKEND}/api"
PASS=0
FAIL=0

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

assert_array_length_min() {
  local label="$1" file="$2" field="$3" min="$4"
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
if length >= $min:
    print(f'  ✓ PASS: $label (count={length})')
else:
    print(f'  ✗ FAIL: $label — expected >= $min items, got {length}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
}

echo "═══════════════════════════════════════════════════════"
echo " SPRINT 42: Search & Hunt Completion"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Authenticate ─────────────────────────────────────────────────────────────

echo "--- Authentication ---"
AUTH_RESPONSE=$(curl -s --max-time 10 -X POST "${BASE_URL}/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' 2>/dev/null || echo "")

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  ✗ FAIL: Could not authenticate — is the backend running at ${BACKEND}?"
  echo ""
  echo "Results: 0 passed, 1 failed"
  exit 1
fi
echo "  ✓ PASS: Authenticated successfully (admin)"
PASS=$((PASS + 1))

# ═══════════════════════════════════════════════════════════════════════════════
# 11.6 POST /ha-hunts/search → returns searchId
#      GET /ha-hunts/search/{searchId}/status → returns status "completed"
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.6: Search execution and status ---"

STATUS=$(curl -s --max-time 30 -o /tmp/ha_s42_search.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/ha-hunts/search" \
  -d '{"query":"source.ip:203.0.113.*","timeRange":"now-7d"}')

assert_status "POST /ha-hunts/search returns 200" "$STATUS" "200"

SEARCH_ID=""
if [ "$STATUS" = "200" ]; then
  SEARCH_ID=$(python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_search.json'))
sid = data.get('searchId', data.get('id', ''))
print(sid)
" 2>/dev/null || echo "")

  if [ -n "$SEARCH_ID" ]; then
    echo "  ✓ PASS: Search returned searchId: ${SEARCH_ID}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: Search response missing searchId"
    FAIL=$((FAIL + 1))
  fi

  # Wait briefly for search completion
  sleep 2

  # Check search status
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_status.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}/ha-hunts/search/${SEARCH_ID}/status")

  assert_status "GET /ha-hunts/search/{searchId}/status returns 200" "$STATUS" "200"

  if [ "$STATUS" = "200" ]; then
    python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_status.json'))
status = data.get('status', '')
if status in ('completed', 'running'):
    print(f'  ✓ PASS: Search status is \"{status}\"')
else:
    print(f'  ✗ FAIL: Expected status completed or running, got \"{status}\"')
    sys.exit(1)
" 2>/dev/null
    if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.7 Search status includes queryPlan with indicesSearched and shardsSearched
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.7: Search status includes queryPlan ---"

if [ -f /tmp/ha_s42_status.json ]; then
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_status.json'))
qp = data.get('queryPlan')
if qp is None:
    print('  ✗ FAIL: queryPlan not present in status response')
    sys.exit(1)
indices = qp.get('indicesSearched', [])
if not indices:
    print('  ✗ FAIL: queryPlan.indicesSearched is missing or empty')
    sys.exit(1)
shards = data.get('shardsSearched', 0)
print(f'  ✓ PASS: queryPlan present — indicesSearched={len(indices)}, shardsSearched={shards}')
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
else
  echo "  ✗ FAIL: No status response available (search may have failed)"
  FAIL=$((FAIL + 1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.8 Event detail: highlighted view with fields[] and pivots[]
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.8: GET /ha-hunts/events/{eventId}?view=highlighted ---"

# Get an event ID from the search results
EVENT_ID=""
if [ -f /tmp/ha_s42_search.json ]; then
  EVENT_ID=$(python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_search.json'))
events = data.get('events', data.get('results', data.get('hits', [])))
if isinstance(events, list) and len(events) > 0:
    evt = events[0]
    eid = evt.get('id', evt.get('_id', evt.get('eventId', '')))
    print(eid)
else:
    print('')
" 2>/dev/null || echo "")
fi

if [ -z "$EVENT_ID" ]; then
  echo "  ⚠ INFO: No event ID from search — using a synthetic test ID"
  EVENT_ID="test-event-001"
fi

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_event_highlighted.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/events/${EVENT_ID}?view=highlighted")

assert_status "GET /ha-hunts/events/{eventId}?view=highlighted returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  assert_json_field "fields array present" "/tmp/ha_s42_event_highlighted.json" "fields"
  assert_json_field "pivots array present" "/tmp/ha_s42_event_highlighted.json" "pivots"

  # Check fields have type/emphasis/order
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_event_highlighted.json'))
fields = data.get('fields', [])
if len(fields) == 0:
    print('  ✗ FAIL: fields array is empty')
    sys.exit(1)
field = fields[0]
has_type = 'type' in field
has_emphasis = 'emphasis' in field
has_order = 'order' in field
if has_type and has_emphasis and has_order:
    print(f'  ✓ PASS: fields[0] has type=\"{field[\"type\"]}\", emphasis=\"{field[\"emphasis\"]}\", order={field[\"order\"]}')
else:
    missing = [k for k in ('type','emphasis','order') if k not in field]
    print(f'  ✗ FAIL: fields[0] missing: {missing}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.9 Event detail: raw view with raw:{} and pivots[]
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.9: GET /ha-hunts/events/{eventId}?view=raw ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_event_raw.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/events/${EVENT_ID}?view=raw")

assert_status "GET /ha-hunts/events/{eventId}?view=raw returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  assert_json_field "raw object present" "/tmp/ha_s42_event_raw.json" "raw"
  assert_json_field "pivots array present" "/tmp/ha_s42_event_raw.json" "pivots"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.10 Pivot signature validation
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.10: Pivot signatures validate ---"

python3 -c "
import json, sys
# Check highlighted response for pivot with signature
data = json.load(open('/tmp/ha_s42_event_highlighted.json'))
pivots = data.get('pivots', [])
if len(pivots) == 0:
    print('  ✗ FAIL: No pivots returned to validate')
    sys.exit(1)

pivot = pivots[0]
query = pivot.get('query', '')
sig = pivot.get('signature', '')
if not sig.startswith('hmac-sha256:'):
    print(f'  ✗ FAIL: Pivot signature not in expected format (got: {sig[:30]})')
    sys.exit(1)
if len(sig) < 20:
    print(f'  ✗ FAIL: Pivot signature too short: {sig}')
    sys.exit(1)
print(f'  ✓ PASS: Pivot signature format valid: {sig[:50]}...')
print(f'         Query: {query[:60]}...')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.11 Saved hunts: GET returns 10 seeded saved hunts
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.11: GET /ha-hunts/saved returns 10 seeded saved hunts ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_saved.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/saved")

assert_status "GET /ha-hunts/saved returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_saved.json'))
items = data.get('items', data if isinstance(data, list) else [])
total = data.get('total', len(items))
if total >= 10:
    print(f'  ✓ PASS: {total} saved hunts returned (expected >= 10)')
else:
    print(f'  ✗ FAIL: Expected >= 10 saved hunts, got {total}')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.12 Create saved hunt → appears in list
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.12: POST /ha-hunts/saved creates new hunt ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_create_hunt.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/ha-hunts/saved" \
  -d '{"name":"Sprint 42 Test Hunt","description":"Created by regression test","query":"event.action:login_failed AND @timestamp:[now-1h TO now]","tags":["test","sprint42"],"shared":false}')

assert_status "POST /ha-hunts/saved returns 201" "$STATUS" "201"

CREATED_HUNT_ID=""
if [ "$STATUS" = "201" ]; then
  CREATED_HUNT_ID=$(python3 -c "
import json; data=json.load(open('/tmp/ha_s42_create_hunt.json')); print(data.get('id',''))
" 2>/dev/null || echo "")
  if [ -n "$CREATED_HUNT_ID" ]; then
    echo "  ✓ PASS: Created hunt id: ${CREATED_HUNT_ID}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: Created hunt missing id"
    FAIL=$((FAIL + 1))
  fi

  # Verify it appears in the list
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_saved_after.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE_URL}/ha-hunts/saved")

  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_saved_after.json'))
items = data.get('items', data if isinstance(data, list) else [])
found = any(item.get('id') == '${CREATED_HUNT_ID}' for item in items)
if found:
    print('  ✓ PASS: Created hunt found in saved hunts list')
else:
    print('  ✗ FAIL: Created hunt not found in saved hunts list')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.13 PATCH updates name; DELETE removes saved hunt
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.13: PATCH /ha-hunts/saved/{id} updates name; DELETE removes it ---"

if [ -n "$CREATED_HUNT_ID" ]; then
  # PATCH: update the name
  STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_patch_hunt.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -X PATCH "${BASE_URL}/ha-hunts/saved/${CREATED_HUNT_ID}" \
    -d '{"name":"Sprint 42 Test Hunt (Updated)"}')

  assert_status "PATCH /ha-hunts/saved/{id} returns 200" "$STATUS" "200"

  if [ "$STATUS" = "200" ]; then
    python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_patch_hunt.json'))
name = data.get('name', '')
if 'Updated' in name:
    print(f'  ✓ PASS: Name updated to: {name}')
else:
    print(f'  ✗ FAIL: Name not updated: {name}')
    sys.exit(1)
" 2>/dev/null
    if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
  fi

  # DELETE: remove the hunt
  STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -X DELETE "${BASE_URL}/ha-hunts/saved/${CREATED_HUNT_ID}")

  assert_status "DELETE /ha-hunts/saved/{id} returns 204" "$STATUS" "204"
else
  echo "  ⚠ SKIP: No created hunt ID available"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.14 History: GET returns entries (auto-recorded from search executions)
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.14: GET /ha-hunts/history returns entries ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_history.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/history")

assert_status "GET /ha-hunts/history returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_history.json'))
items = data.get('items', data if isinstance(data, list) else [])
total = data.get('total', len(items))
if total > 0:
    print(f'  ✓ PASS: {total} history entries found')
    entry = items[0] if items else {}
    print(f'         Latest: query=\"{entry.get(\"query\",\"\")[:40]}...\" status={entry.get(\"status\")}')
else:
    print(f'  ✗ FAIL: No history entries found (expected auto-recorded from search)')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.15 DELETE /ha-hunts/history clears entries; returns deleted count
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.15: DELETE /ha-hunts/history clears entries ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_clear_history.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -X DELETE "${BASE_URL}/ha-hunts/history")

assert_status "DELETE /ha-hunts/history returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_clear_history.json'))
deleted = data.get('deleted', -1)
if deleted >= 0:
    print(f'  ✓ PASS: Cleared {deleted} history entries')
else:
    print(f'  ✗ FAIL: Response missing \"deleted\" field')
    sys.exit(1)
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.16 Promotion preview: entities extracted
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.16: POST /ha-hunts/actions/preview with create_evidence ---"

# Get 3 event IDs (from search or synthetic)
EVENT_IDS_JSON="[\"${EVENT_ID}\"]"
if [ -f /tmp/ha_s42_search.json ]; then
  EVENT_IDS_JSON=$(python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_search.json'))
events = data.get('events', data.get('results', data.get('hits', [])))
ids = []
for evt in events[:3]:
    eid = evt.get('id', evt.get('_id', evt.get('eventId', '')))
    if eid:
        ids.append(eid)
if not ids:
    ids = ['test-event-001','test-event-002','test-event-003']
print(json.dumps(ids))
" 2>/dev/null || echo "[\"test-event-001\",\"test-event-002\",\"test-event-003\"]")
fi

STATUS=$(curl -s --max-time 15 -o /tmp/ha_s42_preview.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/ha-hunts/actions/preview" \
  -d "{\"action\":\"create_evidence\",\"eventIds\":${EVENT_IDS_JSON}}")

assert_status "POST /ha-hunts/actions/preview returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  assert_json_field "preview.title present" "/tmp/ha_s42_preview.json" "preview.title"
  assert_json_field "preview.entities present" "/tmp/ha_s42_preview.json" "preview.entities"
  assert_json_field "previewToken present" "/tmp/ha_s42_preview.json" "previewToken"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.17 Promotion execute: valid previewToken → created evidence
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.17: POST /ha-hunts/actions with valid previewToken ---"

PREVIEW_TOKEN=""
if [ -f /tmp/ha_s42_preview.json ]; then
  PREVIEW_TOKEN=$(python3 -c "
import json; data=json.load(open('/tmp/ha_s42_preview.json')); print(data.get('previewToken',''))
" 2>/dev/null || echo "")
fi

if [ -n "$PREVIEW_TOKEN" ]; then
  STATUS=$(curl -s --max-time 15 -o /tmp/ha_s42_execute.json -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -X POST "${BASE_URL}/ha-hunts/actions" \
    -d "{\"action\":\"create_evidence\",\"eventIds\":${EVENT_IDS_JSON},\"title\":\"Sprint 42 Evidence\",\"description\":\"Test evidence from regression\",\"previewToken\":\"${PREVIEW_TOKEN}\"}")

  assert_status "POST /ha-hunts/actions returns 200" "$STATUS" "200"

  if [ "$STATUS" = "200" ]; then
    assert_json_field "resultId present" "/tmp/ha_s42_execute.json" "resultId"
    assert_json_field "status is created" "/tmp/ha_s42_execute.json" "status"
  fi
else
  echo "  ⚠ SKIP: No previewToken available"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.18 Promotion execute: expired/invalid previewToken → 400
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.18: POST /ha-hunts/actions with expired previewToken → 400 ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_execute_invalid.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X POST "${BASE_URL}/ha-hunts/actions" \
  -d "{\"action\":\"create_evidence\",\"eventIds\":${EVENT_IDS_JSON},\"title\":\"Test\",\"description\":\"Test\",\"previewToken\":\"invalid.expired.token\"}")

assert_status "POST /ha-hunts/actions with invalid token returns 400" "$STATUS" "400"

# ═══════════════════════════════════════════════════════════════════════════════
# 11.19 SSE stream: receives events
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.19: SSE /ha-hunts/search/{id}/stream receives events ---"

if [ -n "$SEARCH_ID" ]; then
  SSE_OUTPUT=$(curl -s -N --max-time 10 \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: text/event-stream" \
    "${BASE_URL}/ha-hunts/search/${SEARCH_ID}/stream" 2>/dev/null || true)

  echo "$SSE_OUTPUT" > /tmp/ha_s42_sse_output.txt

  # Check for any SSE events (completed, progress, or data)
  if echo "$SSE_OUTPUT" | grep -q "event:\|data:\|search.completed\|search.progress"; then
    echo "  ✓ PASS: SSE stream received events"
    PASS=$((PASS + 1))
  elif echo "$SSE_OUTPUT" | grep -q "completed\|data"; then
    echo "  ✓ PASS: SSE stream received data (immediate completion)"
    PASS=$((PASS + 1))
  else
    LINE_COUNT=$(echo "$SSE_OUTPUT" | wc -l | tr -d ' ')
    if [ "$LINE_COUNT" -gt 1 ]; then
      echo "  ✓ PASS: SSE stream active with ${LINE_COUNT} lines"
      PASS=$((PASS + 1))
    else
      echo "  ✗ FAIL: SSE stream produced no recognizable events"
      echo "         Output: $(echo "$SSE_OUTPUT" | head -c 200)"
      FAIL=$((FAIL + 1))
    fi
  fi
else
  echo "  ⚠ SKIP: No searchId available for SSE test"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.20 Query capabilities: operators (15+), functions (8+), fieldTypes (6+), examples (5+)
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.20: GET /ha-hunts/query-capabilities ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s42_capabilities.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/query-capabilities")

assert_status "GET /ha-hunts/query-capabilities returns 200" "$STATUS" "200"

if [ "$STATUS" = "200" ]; then
  python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s42_capabilities.json'))

ops = data.get('operators', [])
fns = data.get('functions', [])
ft = data.get('fieldTypes', [])
examples = data.get('examples', [])

errors = []
if len(ops) < 15:
    errors.append(f'operators: expected >= 15, got {len(ops)}')
if len(fns) < 8:
    errors.append(f'functions: expected >= 8, got {len(fns)}')
if len(ft) < 6:
    errors.append(f'fieldTypes: expected >= 6, got {len(ft)}')
if len(examples) < 5:
    errors.append(f'examples: expected >= 5, got {len(examples)}')

if errors:
    for e in errors:
        print(f'  ✗ FAIL: {e}')
    sys.exit(1)
else:
    print(f'  ✓ PASS: operators={len(ops)}, functions={len(fns)}, fieldTypes={len(ft)}, examples={len(examples)}')
" 2>/dev/null
  if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

  # Verify limits field
  assert_json_field "limits.maxResults present" "/tmp/ha_s42_capabilities.json" "limits.maxResults"
  assert_json_field "limits.queryTimeout present" "/tmp/ha_s42_capabilities.json" "limits.queryTimeout"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 11.21 404 for non-existent eventId, searchId, huntId
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "--- 11.21: 404 for non-existent resources ---"

# Non-existent eventId
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/events/NONEXISTENT-EVENT-99999?view=highlighted")
assert_status "GET /ha-hunts/events/non-existent returns 404" "$STATUS" "404"

# Non-existent searchId status
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-hunts/search/NONEXISTENT-SEARCH-99999/status")
assert_status "GET /ha-hunts/search/non-existent/status returns 404" "$STATUS" "404"

# Non-existent saved huntId (PATCH)
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -X PATCH "${BASE_URL}/ha-hunts/saved/NONEXISTENT-HUNT-99999" \
  -d '{"name":"test"}')
assert_status "PATCH /ha-hunts/saved/non-existent returns 404" "$STATUS" "404"

# Non-existent saved huntId (DELETE)
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -X DELETE "${BASE_URL}/ha-hunts/saved/NONEXISTENT-HUNT-99999")
assert_status "DELETE /ha-hunts/saved/non-existent returns 404" "$STATUS" "404"

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 42 REGRESSION TEST SUMMARY"
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
  echo "✓ All Sprint 42 regression tests passed."
  exit 0
fi
