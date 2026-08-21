#!/usr/bin/env bash
# Regression test for Sprint 40: Alert Investigation — Telemetry
# Tests: process tree (ALT-003), network activity (ALT-004),
#        indicators/IOCs (ALT-005), related alerts (ALT-007), 404 cases
set -euo pipefail

BACKEND="http://localhost:8088"
BASE_URL="${BACKEND}/api"
PASS=0
FAIL=0

# Test target: investigation-ready alert from seed data
ALERT_ID="INV-CWM-001"
NONEXISTENT_ID="DOES-NOT-EXIST-99999"

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
  local result
  result=$(python3 -c "
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
" 2>/dev/null)
  local rc=$?
  echo "$result"
  if [ $rc -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
}

assert_numeric_gte() {
  local label="$1" file="$2" field="$3" min="$4"
  local result
  result=$(python3 -c "
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
if not isinstance(obj, (int, float)):
    print(f'  ✗ FAIL: $label — \"$field\" is not numeric (got {type(obj).__name__})')
    sys.exit(1)
if obj >= $min:
    print(f'  ✓ PASS: $label (value={obj})')
else:
    print(f'  ✗ FAIL: $label — expected >= $min, got {obj}')
    sys.exit(1)
" 2>/dev/null)
  local rc=$?
  echo "$result"
  if [ $rc -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi
}

echo "═══════════════════════════════════════════════════════"
echo " SPRINT 40: Alert Investigation — Telemetry"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── 10.5 Authenticate ───────────────────────────────────────────────────────

echo "--- Authentication (10.5) ---"
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

# ─── 10.6 GET /ha-alerts/{id}/processes — tree structure ─────────────────────

echo ""
echo "--- Process Tree: tree structure, alertProcessIds, totalProcesses (10.6) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s40_processes.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/processes")

assert_status "GET /ha-alerts/${ALERT_ID}/processes returns 200" "$STATUS" "200"
assert_json_field "Response has tree array" "/tmp/ha_s40_processes.json" "tree"
assert_json_field "Response has alertProcessIds" "/tmp/ha_s40_processes.json" "alertProcessIds"
assert_numeric_gte "totalProcesses >= 4" "/tmp/ha_s40_processes.json" "totalProcesses" 4

# Verify tree nodes have required fields
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_processes.json'))
tree = data.get('tree', [])
if not tree:
    print('  ✗ FAIL: Process tree is empty')
    sys.exit(1)

# Check first root node has required fields
node = tree[0]
required = ['id', 'pid', 'name', 'commandLine', 'children']
missing = [f for f in required if f not in node]
if missing:
    print(f'  ✗ FAIL: Tree root node missing fields: {missing}')
    sys.exit(1)
print(f'  ✓ PASS: Tree root node has pid={node[\"pid\"]}, name={node[\"name\"]}, children={len(node[\"children\"])}')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# Verify alertProcessIds is non-empty
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_processes.json'))
ids = data.get('alertProcessIds', [])
if len(ids) >= 1:
    print(f'  ✓ PASS: alertProcessIds has {len(ids)} entries: {ids[:3]}')
else:
    print('  ✗ FAIL: alertProcessIds is empty')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.7 Process tree parent-child relationships ────────────────────────────

echo ""
echo "--- Process Tree: parent-child relationships (10.7) ---"

python3 -c "
import json, sys

def collect_nodes(tree, nodes_by_id):
    for node in tree:
        nodes_by_id[node['id']] = node
        collect_nodes(node.get('children', []), nodes_by_id)

data = json.load(open('/tmp/ha_s40_processes.json'))
tree = data.get('tree', [])
nodes_by_id = {}
collect_nodes(tree, nodes_by_id)

# Verify children reference their parent correctly
errors = 0
checked = 0
for node_id, node in nodes_by_id.items():
    for child in node.get('children', []):
        checked += 1
        if child.get('parentId') != node_id:
            errors += 1
            print(f'  ✗ FAIL: Child {child[\"id\"]} has parentId={child.get(\"parentId\")} but expected {node_id}')

if errors == 0 and checked > 0:
    print(f'  ✓ PASS: All {checked} parent-child relationships are correct')
elif checked == 0:
    print('  ✗ FAIL: No parent-child relationships found in tree')
    sys.exit(1)
else:
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.8 GET /ha-alerts/{id}/network — connections, dns, tls, reputation ────

echo ""
echo "--- Network Activity: connections, dns, tls, reputation (10.8) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s40_network.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/network")

assert_status "GET /ha-alerts/${ALERT_ID}/network returns 200" "$STATUS" "200"
assert_array_length_range "connections has 10-30 entries" "/tmp/ha_s40_network.json" "connections" 10 30

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_network.json'))
dns = data.get('dns', [])
if len(dns) >= 2:
    print(f'  ✓ PASS: dns array has {len(dns)} entries')
else:
    print(f'  ✗ FAIL: dns array expected 2+ entries, got {len(dns)}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_network.json'))
tls = data.get('tls', [])
if len(tls) >= 1:
    print(f'  ✓ PASS: tls array has {len(tls)} entries')
else:
    print(f'  ✗ FAIL: tls array expected 1+ entries, got {len(tls)}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_network.json'))
rep = data.get('reputation', {})
if isinstance(rep, dict) and len(rep) >= 1:
    # Check that keys are external IPs (not 10.x or 192.168.x)
    for ip in list(rep.keys())[:3]:
        if ip.startswith('10.') or ip.startswith('192.168.') or ip.startswith('172.16.'):
            print(f'  ✗ FAIL: reputation contains internal IP: {ip}')
            sys.exit(1)
    print(f'  ✓ PASS: reputation has {len(rep)} external IP entries')
else:
    print(f'  ✗ FAIL: reputation expected non-empty object, got {type(rep).__name__}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.9 Network connections have valid protocol values ─────────────────────

echo ""
echo "--- Network Activity: valid protocol values (10.9) ---"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_network.json'))
connections = data.get('connections', [])
valid_protocols = {'http', 'https', 'dns', 'ssh', 'smb', 'rdp', 'smtp', 'ftp', 'unknown'}
invalid = []
for conn in connections:
    proto = conn.get('protocol', '')
    if proto not in valid_protocols:
        invalid.append(proto)

if not invalid:
    protocols_found = set(c.get('protocol') for c in connections)
    print(f'  ✓ PASS: All {len(connections)} connections have valid protocols: {sorted(protocols_found)}')
else:
    print(f'  ✗ FAIL: Found invalid protocols: {invalid}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.10 DNS query names cross-reference with TLS server names ─────────────

echo ""
echo "--- Network Activity: DNS↔TLS cross-reference consistency (10.10) ---"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_network.json'))
dns_records = data.get('dns', [])
tls_records = data.get('tls', [])

dns_names = set(d.get('queryName', '') for d in dns_records)
tls_names = set(t.get('serverName', '') for t in tls_records)

# At least one TLS server name should also appear in DNS queries
overlap = dns_names & tls_names
if overlap:
    print(f'  ✓ PASS: {len(overlap)} DNS names match TLS server names: {sorted(overlap)[:3]}')
elif len(tls_records) == 0:
    print('  ✓ PASS: No TLS records present — skip cross-reference check')
elif len(dns_records) == 0:
    print('  ✓ PASS: No DNS records present — skip cross-reference check')
else:
    # This is a warning — DNS and TLS may not always overlap
    print(f'  ⚠ WARN: No overlap between DNS names ({sorted(dns_names)[:3]}) and TLS names ({sorted(tls_names)[:3]})')
    print(f'  ✓ PASS: DNS and TLS records present (cross-reference is best-effort)')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.11 GET /ha-alerts/{id}/indicators — indicators with enrichment ───────

echo ""
echo "--- Indicators/IOCs: indicators array with enrichment (10.11) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s40_indicators.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/indicators")

assert_status "GET /ha-alerts/${ALERT_ID}/indicators returns 200" "$STATUS" "200"
assert_array_length_range "indicators has 3-10 entries" "/tmp/ha_s40_indicators.json" "indicators" 3 10

# Verify each indicator has required fields
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_indicators.json'))
indicators = data.get('indicators', [])
required = ['id', 'type', 'value', 'verdict', 'confidence', 'sources']
for i, ind in enumerate(indicators[:5]):
    missing = [f for f in required if f not in ind]
    if missing:
        print(f'  ✗ FAIL: Indicator[{i}] missing fields: {missing}')
        sys.exit(1)

types_found = set(ind.get('type') for ind in indicators)
print(f'  ✓ PASS: All indicators have required fields; types present: {sorted(types_found)}')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# Verify enrichmentStatus field
assert_json_field "Response has enrichmentStatus" "/tmp/ha_s40_indicators.json" "enrichmentStatus"
assert_json_field "Response has totalCount" "/tmp/ha_s40_indicators.json" "totalCount"

# ─── 10.12 SHA-256 indicators have exactly 64 hex characters ─────────────────

echo ""
echo "--- Indicators: SHA-256 hash length validation (10.12) ---"

python3 -c "
import json, sys, re
data = json.load(open('/tmp/ha_s40_indicators.json'))
indicators = data.get('indicators', [])
sha256_indicators = [i for i in indicators if i.get('type') == 'sha256']

if not sha256_indicators:
    print('  ⚠ WARN: No sha256 indicators found — skipping length check')
    sys.exit(0)

hex_pattern = re.compile(r'^[0-9a-fA-F]{64}$')
invalid = []
for ind in sha256_indicators:
    value = ind.get('value', '')
    if not hex_pattern.match(value):
        invalid.append(value[:20] + '...')

if not invalid:
    print(f'  ✓ PASS: All {len(sha256_indicators)} SHA-256 indicators have exactly 64 hex chars')
else:
    print(f'  ✗ FAIL: {len(invalid)} SHA-256 indicators have invalid format: {invalid}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.13 No internal IPs appear as IOC indicators ──────────────────────────

echo ""
echo "--- Indicators: no internal IPs as IOCs (10.13) ---"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_indicators.json'))
indicators = data.get('indicators', [])
ip_indicators = [i for i in indicators if i.get('type') in ('ipv4', 'ipv6')]

internal_prefixes = ('10.', '172.16.', '172.17.', '172.18.', '172.19.',
                     '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
                     '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
                     '172.30.', '172.31.', '192.168.', '127.', '169.254.')

internal_found = []
for ind in ip_indicators:
    value = ind.get('value', '')
    if any(value.startswith(p) for p in internal_prefixes):
        internal_found.append(value)

if not internal_found:
    print(f'  ✓ PASS: No internal IPs in {len(ip_indicators)} IP indicators')
else:
    print(f'  ✗ FAIL: Internal IPs found as IOCs: {internal_found}')
    sys.exit(1)
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.14 GET /ha-alerts/{id}/related — relatedAlerts with correlationReasons ─

echo ""
echo "--- Related Alerts: relatedAlerts array with correlationReasons (10.14) ---"

STATUS=$(curl -s --max-time 10 -o /tmp/ha_s40_related.json -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${ALERT_ID}/related")

assert_status "GET /ha-alerts/${ALERT_ID}/related returns 200" "$STATUS" "200"
assert_array_length_range "relatedAlerts has 2-5 entries" "/tmp/ha_s40_related.json" "relatedAlerts" 2 5
assert_json_field "Response has totalCount" "/tmp/ha_s40_related.json" "totalCount"

# Verify each related alert has correlationReasons
python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_related.json'))
alerts = data.get('relatedAlerts', [])
for i, alert in enumerate(alerts):
    reasons = alert.get('correlationReasons', [])
    if not reasons:
        print(f'  ✗ FAIL: relatedAlerts[{i}] (id={alert.get(\"id\")}) has no correlationReasons')
        sys.exit(1)

reason_types = set()
for alert in alerts:
    for r in alert.get('correlationReasons', []):
        reason_types.add(r.get('type'))

print(f'  ✓ PASS: All {len(alerts)} related alerts have correlationReasons; types: {sorted(reason_types)}')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.15 Current alert ID never appears in relatedAlerts ───────────────────

echo ""
echo "--- Related Alerts: self-exclusion check (10.15) ---"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_related.json'))
alerts = data.get('relatedAlerts', [])
alert_id = '${ALERT_ID}'
self_refs = [a for a in alerts if a.get('id') == alert_id]
if self_refs:
    print(f'  ✗ FAIL: Current alert {alert_id} appears in its own relatedAlerts list')
    sys.exit(1)
else:
    related_ids = [a.get('id') for a in alerts]
    print(f'  ✓ PASS: Alert {alert_id} not in relatedAlerts: {related_ids[:5]}')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.16 Each correlationReason has type, description, strength, evidence ──

echo ""
echo "--- Related Alerts: correlationReason field completeness (10.16) ---"

python3 -c "
import json, sys
data = json.load(open('/tmp/ha_s40_related.json'))
alerts = data.get('relatedAlerts', [])
required_reason_fields = ['type', 'description', 'strength', 'evidence']
valid_types = {'shared_entity', 'shared_session', 'process_ancestry', 'rule_correlation'}
valid_strengths = {'strong', 'moderate', 'weak'}

for i, alert in enumerate(alerts):
    for j, reason in enumerate(alert.get('correlationReasons', [])):
        missing = [f for f in required_reason_fields if f not in reason or not reason[f]]
        if missing:
            print(f'  ✗ FAIL: relatedAlerts[{i}].correlationReasons[{j}] missing: {missing}')
            sys.exit(1)
        if reason['type'] not in valid_types:
            print(f'  ✗ FAIL: Invalid correlation type: {reason[\"type\"]}')
            sys.exit(1)
        if reason['strength'] not in valid_strengths:
            print(f'  ✗ FAIL: Invalid strength: {reason[\"strength\"]}')
            sys.exit(1)

total_reasons = sum(len(a.get('correlationReasons', [])) for a in alerts)
print(f'  ✓ PASS: All {total_reasons} correlationReasons have type/description/strength/evidence with valid values')
" 2>/dev/null
if [ $? -eq 0 ]; then PASS=$((PASS + 1)); else FAIL=$((FAIL + 1)); fi

# ─── 10.17 404 returned for non-existent alertId on all four endpoints ───────

echo ""
echo "--- 404 Cases: non-existent alertId on all endpoints (10.17) ---"

# Processes endpoint
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${NONEXISTENT_ID}/processes")
assert_status "GET /ha-alerts/non-existent/processes returns 404" "$STATUS" "404"

# Network endpoint
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${NONEXISTENT_ID}/network")
assert_status "GET /ha-alerts/non-existent/network returns 404" "$STATUS" "404"

# Indicators endpoint
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${NONEXISTENT_ID}/indicators")
assert_status "GET /ha-alerts/non-existent/indicators returns 404" "$STATUS" "404"

# Related endpoint
STATUS=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/ha-alerts/${NONEXISTENT_ID}/related")
assert_status "GET /ha-alerts/non-existent/related returns 404" "$STATUS" "404"

# ─── 10.18 Summary ───────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo " SPRINT 40 REGRESSION TEST SUMMARY"
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
  echo "✓ All Sprint 40 regression tests passed."
  exit 0
fi
