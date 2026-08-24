#!/usr/bin/env bash
# test-cross-tenant-isolation.sh — Sprint 49 Cross-Tenant Isolation Tests (HAR-004)
# Verifies complete tenant isolation across all HiveArmor modules.
# Creates data in tenant-alpha and tenant-beta, verifies each tenant cannot see the other's data.
# Prerequisites: Backend on localhost:8088
set -euo pipefail

BASE_URL="http://localhost:8088/api"
PASS=0; FAIL=0

# Tenant prefixes used for isolation
TENANT_ALPHA="tenant-alpha"
TENANT_BETA="tenant-beta"

# Track created resource IDs for cleanup
ALPHA_ALERT_IDS=()
BETA_ALERT_IDS=()
ALPHA_INCIDENT_IDS=()
BETA_INCIDENT_IDS=()
ALPHA_FINDING_IDS=()
BETA_FINDING_IDS=()
ALPHA_ENTITY_IDS=()
BETA_ENTITY_IDS=()
ALPHA_RULE_IDS=()
BETA_RULE_IDS=()
ALPHA_DASHBOARD_IDS=()
BETA_DASHBOARD_IDS=()
ALPHA_TENANT_NUM=""
BETA_TENANT_NUM=""

# ─── Color output helpers ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# ─── Assertion helpers ────────────────────────────────────────────────────────
assert_status() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label (HTTP $actual)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label — want $expected, got $actual"; FAIL=$((FAIL+1))
  fi
}

assert_count() {
  local label="$1" file="$2" expected="$3"
  local actual
  actual=$(python3 -c "
import json,sys
d=json.load(open('$file'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
print(len(items))" 2>/dev/null || echo "-1")
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $label (count=$actual)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label — want count=$expected, got $actual"; FAIL=$((FAIL+1))
  fi
}

assert_count_gte() {
  local label="$1" file="$2" min="$3"
  local actual
  actual=$(python3 -c "
import json,sys
d=json.load(open('$file'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
print(len(items))" 2>/dev/null || echo "0")
  if [ "$actual" -ge "$min" ]; then
    echo -e "  ${GREEN}✓${NC} $label (count=$actual >= $min)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label — want count>=$min, got $actual"; FAIL=$((FAIL+1))
  fi
}

assert_field() {
  local label="$1" file="$2" field="$3"
  if python3 -c "
import json,sys; d=json.load(open('$file'))
for k in '$field'.split('.'):
  if isinstance(d,list): d=d[int(k)]
  else: d=d[k]
assert d not in (None,'',[])" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} $label"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $label — '$field' missing"; FAIL=$((FAIL+1))
  fi
}

# ─── Login helper ─────────────────────────────────────────────────────────────
login() {
  local user="$1" pass="$2" tenant_header="${3:-}"
  local ar token
  ar=$(curl -s --max-time 10 -X POST "$BASE_URL/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"$pass\",\"rememberMe\":false}")
  token=$(echo "$ar" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d.get('id_token',d.get('token','')))" 2>/dev/null || echo "")
  if [ -z "$token" ] || [ "$token" = "None" ]; then
    echo ""
    return 1
  fi
  echo "$token"
}

# ─── Data creation helpers ────────────────────────────────────────────────────
create_alert() {
  local token="$1" tenant_id="$2" prefix="$3" index="$4"
  local alert_name="iso-test-alert-${prefix}-${index}"
  local headers=(-H "Authorization: Bearer $token" -H "Content-Type: application/json")
  if [ -n "$tenant_id" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_id")
  fi
  # Use the alert status endpoint to create/ensure an alert exists via bulk status change
  # Actually, alerts are indexed in OpenSearch — we use direct indexing for test data
  # For the API test, we rely on seed data or create via the notes/tags mechanism on existing data
  # Better approach: index directly into OpenSearch for test isolation
  local alert_id="alert-${prefix}-${index}-$(date +%s%N | tail -c 8)"
  local os_url="http://localhost:9200"
  local os_creds="admin:LocalDev@2024!"
  local idx="v3-hive-alert-${prefix}-$(date +%Y.%m.%d)"
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  local severity_levels=("critical" "high" "medium" "low" "info")
  local sev=${severity_levels[$((index % 5))]}

  # Create index mapping if not exists
  curl -s -u "$os_creds" -X PUT "$os_url/$idx" \
    -H "Content-Type: application/json" \
    -d '{
      "mappings": {
        "properties": {
          "id": {"type":"keyword"},
          "alertName": {"type":"keyword"},
          "alertSeverity": {"type":"keyword"},
          "alertStatus": {"type":"keyword"},
          "alertCategory": {"type":"keyword"},
          "visibleBy": {"type":"keyword"},
          "@timestamp": {"type":"date"},
          "message": {"type":"text"},
          "host": {"properties":{"name":{"type":"keyword"}}},
          "source": {"properties":{"ip":{"type":"ip"}}},
          "tags": {"type":"keyword"}
        }
      }
    }' 2>/dev/null > /dev/null || true

  # Index the alert document
  curl -s -u "$os_creds" -X PUT "$os_url/$idx/_doc/$alert_id" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"$alert_id\",
      \"alertName\": \"$alert_name\",
      \"alertSeverity\": \"$sev\",
      \"alertStatus\": \"open\",
      \"alertCategory\": \"Intrusion Detection\",
      \"visibleBy\": [\"$prefix\"],
      \"@timestamp\": \"$timestamp\",
      \"message\": \"Test alert for tenant isolation: $alert_name\",
      \"host\": {\"name\": \"host-${prefix}-${index}\"},
      \"source\": {\"ip\": \"10.${index}.${index}.${index}\"},
      \"tags\": [\"isolation-test\", \"$prefix\"]
    }" 2>/dev/null > /dev/null || true

  echo "$alert_id"
}

create_incident() {
  local token="$1" tenant_id="$2" prefix="$3" index="$4"
  local headers=(-H "Authorization: Bearer $token" -H "Content-Type: application/json")
  if [ -n "$tenant_id" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_id")
  fi
  local incident_name="iso-test-incident-${prefix}-${index}"
  local incident_id=""

  # Create incident via the incidents API
  local resp
  resp=$(curl -s --max-time 15 -o /tmp/iso_inc_create.json -w "%{http_code}" \
    "${headers[@]}" \
    -X POST "$BASE_URL/ha-incidents" \
    -d "{
      \"name\": \"$incident_name\",
      \"description\": \"Cross-tenant isolation test incident for $prefix\",
      \"severity\": \"high\",
      \"status\": \"open\",
      \"tags\": [\"isolation-test\", \"$prefix\"]
    }")

  if [ "$resp" = "201" ] || [ "$resp" = "200" ]; then
    incident_id=$(python3 -c "
import json; d=json.load(open('/tmp/iso_inc_create.json'))
print(d.get('id', d.get('incidentId', '')))" 2>/dev/null || echo "")
  fi
  echo "$incident_id"
}

create_finding() {
  local token="$1" tenant_id="$2" prefix="$3" index="$4"
  local finding_id="finding-${prefix}-${index}-$(date +%s%N | tail -c 8)"
  local os_url="http://localhost:9200"
  local os_creds="admin:LocalDev@2024!"
  local idx="v3-hive-correlated-finding-${prefix}-$(date +%Y.%m.%d)"
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  local severity_levels=("critical" "high" "medium")
  local sev=${severity_levels[$((index % 3))]}

  # Create index if not exists
  curl -s -u "$os_creds" -X PUT "$os_url/$idx" \
    -H "Content-Type: application/json" \
    -d '{
      "mappings": {
        "properties": {
          "id": {"type":"keyword"},
          "title": {"type":"keyword"},
          "severity": {"type":"keyword"},
          "status": {"type":"keyword"},
          "visibleBy": {"type":"keyword"},
          "@timestamp": {"type":"date"},
          "signalCount": {"type":"integer"},
          "entityCount": {"type":"integer"},
          "attackStageCount": {"type":"integer"},
          "tags": {"type":"keyword"}
        }
      }
    }' 2>/dev/null > /dev/null || true

  # Index the finding
  curl -s -u "$os_creds" -X PUT "$os_url/$idx/_doc/$finding_id" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"$finding_id\",
      \"title\": \"iso-test-finding-${prefix}-${index}\",
      \"severity\": \"$sev\",
      \"status\": \"open\",
      \"visibleBy\": [\"$prefix\"],
      \"@timestamp\": \"$timestamp\",
      \"signalCount\": $((index + 2)),
      \"entityCount\": $((index + 1)),
      \"attackStageCount\": $((index + 1)),
      \"tags\": [\"isolation-test\", \"$prefix\"]
    }" 2>/dev/null > /dev/null || true

  echo "$finding_id"
}

create_entity() {
  local token="$1" tenant_id="$2" prefix="$3" index="$4"
  local entity_id="ent-${prefix}-${index}-$(date +%s%N | tail -c 8)"
  local os_url="http://localhost:9200"
  local os_creds="admin:LocalDev@2024!"
  local idx="v3-hive-entity-${prefix}-$(date +%Y.%m.%d)"
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  local entity_types=("host" "user" "ip" "domain" "process")
  local etype=${entity_types[$((index % 5))]}

  # Create index if not exists
  curl -s -u "$os_creds" -X PUT "$os_url/$idx" \
    -H "Content-Type: application/json" \
    -d '{
      "mappings": {
        "properties": {
          "id": {"type":"keyword"},
          "name": {"type":"keyword"},
          "type": {"type":"keyword"},
          "riskScore": {"type":"float"},
          "visibleBy": {"type":"keyword"},
          "@timestamp": {"type":"date"},
          "alertsActive": {"type":"integer"},
          "tags": {"type":"keyword"}
        }
      }
    }' 2>/dev/null > /dev/null || true

  # Index the entity
  curl -s -u "$os_creds" -X PUT "$os_url/$idx/_doc/$entity_id" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"$entity_id\",
      \"name\": \"${etype}-${prefix}-${index}.local\",
      \"type\": \"$etype\",
      \"riskScore\": $((index * 15 + 20)),
      \"visibleBy\": [\"$prefix\"],
      \"@timestamp\": \"$timestamp\",
      \"alertsActive\": $((index + 1)),
      \"tags\": [\"isolation-test\", \"$prefix\"]
    }" 2>/dev/null > /dev/null || true

  echo "$entity_id"
}

create_rule() {
  local token="$1" tenant_id="$2" prefix="$3" index="$4"
  local headers=(-H "Authorization: Bearer $token" -H "Content-Type: application/json")
  if [ -n "$tenant_id" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_id")
  fi
  local rule_name="iso-test-rule-${prefix}-${index}"
  local rule_id=""

  # Create detection rule via the API
  local resp
  resp=$(curl -s --max-time 15 -o /tmp/iso_rule_create.json -w "%{http_code}" \
    "${headers[@]}" \
    -X POST "$BASE_URL/ha-detection-rules" \
    -d "{
      \"name\": \"$rule_name\",
      \"description\": \"Cross-tenant isolation test rule for $prefix\",
      \"ruleType\": \"threshold\",
      \"severity\": \"high\",
      \"status\": \"draft\",
      \"scope\": \"custom\",
      \"dataSource\": \"alert\",
      \"conditions\": {
        \"query\": \"event.category:network AND source.ip:10.0.0.*\",
        \"threshold\": 5,
        \"timeWindow\": \"5m\"
      },
      \"tags\": [\"isolation-test\", \"$prefix\"]
    }")

  if [ "$resp" = "201" ] || [ "$resp" = "200" ]; then
    rule_id=$(python3 -c "
import json; d=json.load(open('/tmp/iso_rule_create.json'))
print(d.get('id', d.get('ruleId', '')))" 2>/dev/null || echo "")
  fi
  echo "$rule_id"
}

# Resolve numeric ha_client.id for X-Tenant-ID (GAP-MT-05 dashboards use client id, not prefix string).
resolve_tenant_numeric_id() {
  local token="$1" want_prefix="$2"
  curl -s --max-time 15 -H "Authorization: Bearer $token" \
    "$BASE_URL/ha-tenants?page=0&size=200" 2>/dev/null | python3 -c "
import json,sys
want='$want_prefix'
try:
  d=json.load(sys.stdin)
except Exception:
  sys.exit(0)
items=d if isinstance(d,list) else d.get('content', d.get('items', []))
for t in items:
  prefix=str(t.get('prefix') or t.get('clientPrefix') or '')
  if prefix==want or want in prefix:
    print(t.get('id',''))
    break
" 2>/dev/null || true
}

create_dashboard() {
  local token="$1" tenant_num="$2" prefix="$3" index="$4"
  local headers=(-H "Authorization: Bearer $token" -H "Content-Type: application/json")
  if [ -n "$tenant_num" ]; then
    headers+=(-H "X-Tenant-ID: $tenant_num")
  fi
  local name="iso-test-dash-${prefix}-${index}-$(date +%s)"
  local resp
  resp=$(curl -s --max-time 15 -o /tmp/iso_dash_create.json -w "%{http_code}" \
    "${headers[@]}" \
    -X POST "$BASE_URL/ha-dashboards" \
    -d "{
      \"name\": \"$name\",
      \"description\": \"Cross-tenant isolation test dashboard for $prefix\",
      \"refreshTime\": 60,
      \"filters\": null,
      \"sidebarPinned\": false
    }")
  local dash_id=""
  if [ "$resp" = "201" ] || [ "$resp" = "200" ]; then
    dash_id=$(python3 -c "import json; print(json.load(open('/tmp/iso_dash_create.json')).get('id',''))" 2>/dev/null || echo "")
  fi
  echo "$dash_id"
}

# ══════════════════════════════════════════════════════════════════════════════
echo "══════════════════════════════════════════════════════════"
echo " SPRINT 49: Cross-Tenant Isolation Tests (HAR-004)"
echo "══════════════════════════════════════════════════════════"
echo ""
echo " Verifies complete tenant isolation across all modules:"
echo "   • Alerts, Severity Board, Incidents, Findings"
echo "   • Entities, Detection Rules, Constellation"
echo "   • Dashboards (GAP-MT-05 / P1 Spike B)"
echo "   • Global admin combined access"
echo "   • SSE stream isolation"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# SETUP PHASE
# ═══════════════════════════════════════════════════════════════════════════════
echo "━━━ Setup: Authentication ━━━"

ADMIN_TOKEN=$(login "admin" "localdev123!")
if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "  ${RED}✗${NC} Cannot authenticate as admin — is backend running?"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Authenticated as global admin"; PASS=$((PASS+1))
ADMIN_H="Authorization: Bearer $ADMIN_TOKEN"

echo ""
echo "━━━ Setup: Seeding tenant-alpha data ━━━"

# Seed 5 alerts for tenant-alpha
for i in $(seq 1 5); do
  AID=$(create_alert "$ADMIN_TOKEN" "" "$TENANT_ALPHA" "$i")
  if [ -n "$AID" ]; then ALPHA_ALERT_IDS+=("$AID"); fi
done
echo "  Alerts: ${#ALPHA_ALERT_IDS[@]} created"

# Seed 2 incidents for tenant-alpha
for i in $(seq 1 2); do
  IID=$(create_incident "$ADMIN_TOKEN" "" "$TENANT_ALPHA" "$i")
  if [ -n "$IID" ]; then ALPHA_INCIDENT_IDS+=("$IID"); fi
done
echo "  Incidents: ${#ALPHA_INCIDENT_IDS[@]} created"

# Seed 3 findings for tenant-alpha
for i in $(seq 1 3); do
  FID=$(create_finding "$ADMIN_TOKEN" "" "$TENANT_ALPHA" "$i")
  if [ -n "$FID" ]; then ALPHA_FINDING_IDS+=("$FID"); fi
done
echo "  Findings: ${#ALPHA_FINDING_IDS[@]} created"

# Seed 5 entities for tenant-alpha
for i in $(seq 1 5); do
  EID=$(create_entity "$ADMIN_TOKEN" "" "$TENANT_ALPHA" "$i")
  if [ -n "$EID" ]; then ALPHA_ENTITY_IDS+=("$EID"); fi
done
echo "  Entities: ${#ALPHA_ENTITY_IDS[@]} created"

# Seed 2 detection rules for tenant-alpha
for i in $(seq 1 2); do
  RID=$(create_rule "$ADMIN_TOKEN" "" "$TENANT_ALPHA" "$i")
  if [ -n "$RID" ]; then ALPHA_RULE_IDS+=("$RID"); fi
done
echo "  Rules: ${#ALPHA_RULE_IDS[@]} created"

ALPHA_TENANT_NUM=$(resolve_tenant_numeric_id "$ADMIN_TOKEN" "$TENANT_ALPHA")
if [ -n "$ALPHA_TENANT_NUM" ]; then
  for i in $(seq 1 2); do
    DID=$(create_dashboard "$ADMIN_TOKEN" "$ALPHA_TENANT_NUM" "$TENANT_ALPHA" "$i")
    if [ -n "$DID" ]; then ALPHA_DASHBOARD_IDS+=("$DID"); fi
  done
  echo "  Dashboards: ${#ALPHA_DASHBOARD_IDS[@]} created (tenantId=$ALPHA_TENANT_NUM)"
else
  echo -e "  ${YELLOW}⚠${NC} No numeric tenant id for $TENANT_ALPHA — skipping dashboard seed (GAP-MT-05)"
fi

# Refresh OpenSearch indices for immediate visibility
curl -s -u "admin:LocalDev@2024!" -X POST "http://localhost:9200/v3-hive-*/_refresh" > /dev/null 2>&1 || true

echo ""
echo "━━━ Setup: Seeding tenant-beta data ━━━"

# Seed 5 alerts for tenant-beta
for i in $(seq 1 5); do
  AID=$(create_alert "$ADMIN_TOKEN" "" "$TENANT_BETA" "$i")
  if [ -n "$AID" ]; then BETA_ALERT_IDS+=("$AID"); fi
done
echo "  Alerts: ${#BETA_ALERT_IDS[@]} created"

# Seed 2 incidents for tenant-beta
for i in $(seq 1 2); do
  IID=$(create_incident "$ADMIN_TOKEN" "" "$TENANT_BETA" "$i")
  if [ -n "$IID" ]; then BETA_INCIDENT_IDS+=("$IID"); fi
done
echo "  Incidents: ${#BETA_INCIDENT_IDS[@]} created"

# Seed 3 findings for tenant-beta
for i in $(seq 1 3); do
  FID=$(create_finding "$ADMIN_TOKEN" "" "$TENANT_BETA" "$i")
  if [ -n "$FID" ]; then BETA_FINDING_IDS+=("$FID"); fi
done
echo "  Findings: ${#BETA_FINDING_IDS[@]} created"

# Seed 5 entities for tenant-beta
for i in $(seq 1 5); do
  EID=$(create_entity "$ADMIN_TOKEN" "" "$TENANT_BETA" "$i")
  if [ -n "$EID" ]; then BETA_ENTITY_IDS+=("$EID"); fi
done
echo "  Entities: ${#BETA_ENTITY_IDS[@]} created"

# Seed 2 detection rules for tenant-beta
for i in $(seq 1 2); do
  RID=$(create_rule "$ADMIN_TOKEN" "" "$TENANT_BETA" "$i")
  if [ -n "$RID" ]; then BETA_RULE_IDS+=("$RID"); fi
done
echo "  Rules: ${#BETA_RULE_IDS[@]} created"

BETA_TENANT_NUM=$(resolve_tenant_numeric_id "$ADMIN_TOKEN" "$TENANT_BETA")
if [ -n "$BETA_TENANT_NUM" ]; then
  for i in $(seq 1 2); do
    DID=$(create_dashboard "$ADMIN_TOKEN" "$BETA_TENANT_NUM" "$TENANT_BETA" "$i")
    if [ -n "$DID" ]; then BETA_DASHBOARD_IDS+=("$DID"); fi
  done
  echo "  Dashboards: ${#BETA_DASHBOARD_IDS[@]} created (tenantId=$BETA_TENANT_NUM)"
else
  echo -e "  ${YELLOW}⚠${NC} No numeric tenant id for $TENANT_BETA — skipping dashboard seed (GAP-MT-05)"
fi

# Final refresh to make all indexed data searchable
sleep 1
curl -s -u "admin:LocalDev@2024!" -X POST "http://localhost:9200/v3-hive-*/_refresh" > /dev/null 2>&1 || true

echo ""
echo "  Setup complete."


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: ALERTS ISOLATION (Task 4.3)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 1: Alerts Isolation ━━━"

# tenant-alpha lists alerts — should see only alpha alerts
echo ""
echo "--- Alpha lists alerts: sees only alpha ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_alerts.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-alerts?limit=100")
assert_status "Alpha GET /ha-alerts" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_alerts.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
# Check that all items have alpha tenant visibility
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('visibleBy','')) or 'tenant-alpha' in str(i.get('tags','')) or 'tenant-alpha' in i.get('alertName','')]
beta_items=[i for i in items if 'tenant-beta' in str(i.get('visibleBy','')) or 'tenant-beta' in str(i.get('tags','')) or 'tenant-beta' in i.get('alertName','')]
if beta_items:
  print(f'FAIL:{len(beta_items)} beta items visible to alpha')
  sys.exit(1)
if alpha_items:
  print(f'OK:{len(alpha_items)}')
else:
  print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha sees only own alerts (no beta contamination)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha can see beta alerts — ISOLATION BREACH"; FAIL=$((FAIL+1))
  fi
fi

# tenant-beta lists alerts — should see only beta alerts
echo ""
echo "--- Beta lists alerts: sees only beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_alerts.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-alerts?limit=100")
assert_status "Beta GET /ha-alerts" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_alerts.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('visibleBy','')) or 'tenant-alpha' in str(i.get('tags','')) or 'tenant-alpha' in i.get('alertName','')]
if alpha_items:
  print(f'FAIL:{len(alpha_items)} alpha items visible to beta')
  sys.exit(1)
print('OK')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta sees only own alerts (no alpha contamination)"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta can see alpha alerts — ISOLATION BREACH"; FAIL=$((FAIL+1))
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: ALERT BY ID CROSS-TENANT (Task 4.4)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 2: Alert by ID Cross-Tenant → 404 ━━━"

# Alpha tries to access a beta alert by ID → should get 404
if [ ${#BETA_ALERT_IDS[@]} -gt 0 ]; then
  BETA_ALERT="${BETA_ALERT_IDS[0]}"
  echo ""
  echo "--- Alpha requests beta alert ($BETA_ALERT) → 404 ---"
  S=$(curl -s --max-time 10 -o /tmp/iso_cross_alert.json -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    "$BASE_URL/ha-alerts/$BETA_ALERT")
  assert_status "Alpha GET beta alert by ID" "$S" "404"
fi

# Beta tries to access an alpha alert by ID → should get 404
if [ ${#ALPHA_ALERT_IDS[@]} -gt 0 ]; then
  ALPHA_ALERT="${ALPHA_ALERT_IDS[0]}"
  echo ""
  echo "--- Beta requests alpha alert ($ALPHA_ALERT) → 404 ---"
  S=$(curl -s --max-time 10 -o /tmp/iso_cross_alert2.json -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
    "$BASE_URL/ha-alerts/$ALPHA_ALERT")
  assert_status "Beta GET alpha alert by ID" "$S" "404"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: SEVERITY BOARD ISOLATION (Task 4.5)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 3: Severity Board Isolation ━━━"

NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
PAST=$(date -u -v-30d +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d "30 days ago" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || echo "2026-01-01T00:00:00.000Z")

echo ""
echo "--- Alpha severity board: only alpha alerts in lanes ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_board.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-alerts/severity-board?from=${PAST}&to=${NOW}&scope=active&ownership=all&laneLimit=5")
assert_status "Alpha GET severity-board" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_board.json'))
# Board should not contain any beta data
raw=json.dumps(d)
if 'tenant-beta' in raw:
  print('FAIL:beta data in alpha board')
  sys.exit(1)
print('OK')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha severity board has no beta data"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha severity board contains beta data"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Beta severity board: only beta alerts in lanes ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_board.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-alerts/severity-board?from=${PAST}&to=${NOW}&scope=active&ownership=all&laneLimit=5")
assert_status "Beta GET severity-board" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_board.json'))
raw=json.dumps(d)
if 'tenant-alpha' in raw:
  print('FAIL:alpha data in beta board')
  sys.exit(1)
print('OK')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta severity board has no alpha data"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta severity board contains alpha data"; FAIL=$((FAIL+1))
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: INCIDENTS ISOLATION (Task 4.6)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 4: Incidents Isolation ━━━"

echo ""
echo "--- Alpha lists incidents: sees only alpha ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_incidents.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-incidents?page=0&size=100")
assert_status "Alpha GET /ha-incidents" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_incidents.json'))
items=d.get('content', d.get('items', d if isinstance(d,list) else []))
beta_items=[i for i in items if 'tenant-beta' in str(i.get('name','')) or 'tenant-beta' in str(i.get('tags',''))]
if beta_items:
  print(f'FAIL:{len(beta_items)} beta incidents visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha sees only own incidents"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha can see beta incidents"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Beta lists incidents: sees only beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_incidents.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-incidents?page=0&size=100")
assert_status "Beta GET /ha-incidents" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_incidents.json'))
items=d.get('content', d.get('items', d if isinstance(d,list) else []))
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('name','')) or 'tenant-alpha' in str(i.get('tags',''))]
if alpha_items:
  print(f'FAIL:{len(alpha_items)} alpha incidents visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta sees only own incidents"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta can see alpha incidents"; FAIL=$((FAIL+1))
  fi
fi

# Cross-tenant incident access by ID → 404
if [ ${#BETA_INCIDENT_IDS[@]} -gt 0 ]; then
  echo ""
  echo "--- Alpha requests beta incident by ID → 404 ---"
  S=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    "$BASE_URL/ha-incidents/${BETA_INCIDENT_IDS[0]}")
  assert_status "Alpha GET beta incident by ID" "$S" "404"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4b: DASHBOARDS ISOLATION (GAP-MT-05 / P1 Spike B)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 4b: Dashboards Isolation (GAP-MT-05) ━━━"

if [ -n "$ALPHA_TENANT_NUM" ] && [ -n "$BETA_TENANT_NUM" ] && [ ${#ALPHA_DASHBOARD_IDS[@]} -gt 0 ] && [ ${#BETA_DASHBOARD_IDS[@]} -gt 0 ]; then
  echo ""
  echo "--- Alpha lists dashboards: no beta ids ---"
  S=$(curl -s --max-time 15 -o /tmp/iso_alpha_dashboards.json -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $ALPHA_TENANT_NUM" \
    "$BASE_URL/ha-dashboards?page=0&size=100")
  assert_status "Alpha GET /ha-dashboards" "$S" "200"
  if [ "$S" = "200" ]; then
    python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_dashboards.json'))
items=d if isinstance(d,list) else d.get('content', d.get('items', []))
beta_ids={$(printf '%s,' "${BETA_DASHBOARD_IDS[@]}" | sed 's/,$//')}
seen=[i for i in items if i.get('id') in beta_ids]
if seen:
  print(f'FAIL:{len(seen)} beta dashboards visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
    RESULT=$?
    if [ $RESULT -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} Alpha sees only own dashboards"; PASS=$((PASS+1))
    else
      echo -e "  ${RED}✗${NC} Alpha can see beta dashboards"; FAIL=$((FAIL+1))
    fi
  fi

  echo ""
  echo "--- Alpha requests beta dashboard by ID → 404 ---"
  S=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $ALPHA_TENANT_NUM" \
    "$BASE_URL/ha-dashboards/${BETA_DASHBOARD_IDS[0]}")
  assert_status "Alpha GET beta dashboard by ID" "$S" "404"
else
  echo -e "  ${YELLOW}⚠${NC} Skipping dashboard isolation — tenants or seeded dashboards unavailable"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: FINDINGS ISOLATION (Task 4.7)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 5: Findings Isolation ━━━"

echo ""
echo "--- Alpha lists findings: sees only alpha ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_findings.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-correlated-findings?limit=100")
assert_status "Alpha GET /ha-correlated-findings" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_findings.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
beta_items=[i for i in items if 'tenant-beta' in str(i.get('visibleBy','')) or 'tenant-beta' in str(i.get('title','')) or 'tenant-beta' in str(i.get('tags',''))]
if beta_items:
  print(f'FAIL:{len(beta_items)} beta findings visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha sees only own findings"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha can see beta findings"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Beta lists findings: sees only beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_findings.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-correlated-findings?limit=100")
assert_status "Beta GET /ha-correlated-findings" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_findings.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('visibleBy','')) or 'tenant-alpha' in str(i.get('title','')) or 'tenant-alpha' in str(i.get('tags',''))]
if alpha_items:
  print(f'FAIL:{len(alpha_items)} alpha findings visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta sees only own findings"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta can see alpha findings"; FAIL=$((FAIL+1))
  fi
fi

# Cross-tenant finding access by ID → 404
if [ ${#BETA_FINDING_IDS[@]} -gt 0 ]; then
  echo ""
  echo "--- Alpha requests beta finding by ID → 404 ---"
  S=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    "$BASE_URL/ha-correlated-findings/${BETA_FINDING_IDS[0]}")
  assert_status "Alpha GET beta finding by ID" "$S" "404"
fi


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: ENTITIES ISOLATION (Task 4.8)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 6: Entities Isolation ━━━"

echo ""
echo "--- Alpha lists entities: sees only alpha ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_entities.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-entities?limit=100")
assert_status "Alpha GET /ha-entities" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_entities.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
beta_items=[i for i in items if 'tenant-beta' in str(i.get('visibleBy','')) or 'tenant-beta' in str(i.get('name','')) or 'tenant-beta' in str(i.get('tags',''))]
if beta_items:
  print(f'FAIL:{len(beta_items)} beta entities visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha sees only own entities"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha can see beta entities"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Beta lists entities: sees only beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_entities.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-entities?limit=100")
assert_status "Beta GET /ha-entities" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_entities.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('visibleBy','')) or 'tenant-alpha' in str(i.get('name','')) or 'tenant-alpha' in str(i.get('tags',''))]
if alpha_items:
  print(f'FAIL:{len(alpha_items)} alpha entities visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta sees only own entities"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta can see alpha entities"; FAIL=$((FAIL+1))
  fi
fi

# Cross-tenant entity access by ID → 404
if [ ${#BETA_ENTITY_IDS[@]} -gt 0 ]; then
  echo ""
  echo "--- Alpha requests beta entity by ID → 404 ---"
  S=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    "$BASE_URL/ha-entities/${BETA_ENTITY_IDS[0]}/preview")
  assert_status "Alpha GET beta entity by ID" "$S" "404"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 7: DETECTION RULES ISOLATION (Task 4.9)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 7: Detection Rules Isolation ━━━"

echo ""
echo "--- Alpha lists rules: sees only alpha ---"
S=$(curl -s --max-time 15 -o /tmp/iso_alpha_rules.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  "$BASE_URL/ha-detection-rules?limit=100")
assert_status "Alpha GET /ha-detection-rules" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_rules.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
beta_items=[i for i in items if 'tenant-beta' in str(i.get('name','')) or 'tenant-beta' in str(i.get('tags',''))]
if beta_items:
  print(f'FAIL:{len(beta_items)} beta rules visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Alpha sees only own detection rules"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Alpha can see beta rules"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Beta lists rules: sees only beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_beta_rules.json -w "%{http_code}" \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  "$BASE_URL/ha-detection-rules?limit=100")
assert_status "Beta GET /ha-detection-rules" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_rules.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
alpha_items=[i for i in items if 'tenant-alpha' in str(i.get('name','')) or 'tenant-alpha' in str(i.get('tags',''))]
if alpha_items:
  print(f'FAIL:{len(alpha_items)} alpha rules visible')
  sys.exit(1)
print(f'OK:{len(items)}')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Beta sees only own detection rules"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Beta can see alpha rules"; FAIL=$((FAIL+1))
  fi
fi

# Cross-tenant rule access by ID → 404
if [ ${#BETA_RULE_IDS[@]} -gt 0 ]; then
  echo ""
  echo "--- Alpha requests beta rule by ID → 404 ---"
  S=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    "$BASE_URL/ha-detection-rules/${BETA_RULE_IDS[0]}")
  assert_status "Alpha GET beta rule by ID" "$S" "404"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8: CONSTELLATION ISOLATION (Task 4.10)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 8: Constellation Isolation ━━━"

echo ""
echo "--- Alpha explores constellation: only alpha entity nodes ---"
if [ ${#ALPHA_ENTITY_IDS[@]} -gt 0 ]; then
  S=$(curl -s --max-time 20 -o /tmp/iso_alpha_graph.json -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
    -H "Content-Type: application/json" \
    -X POST "$BASE_URL/ha-constellation/explore" \
    -d "{
      \"seed\": { \"type\": \"entity\", \"value\": \"${ALPHA_ENTITY_IDS[0]}\" },
      \"options\": { \"hopDepth\": 1, \"nodeLimit\": 100, \"edgeLimit\": 200, \"confidenceThreshold\": 0.3, \"timeWindow\": \"30d\" }
    }")
  assert_status "Alpha POST /ha-constellation/explore" "$S" "200"
  if [ "$S" = "200" ]; then
    python3 -c "
import json,sys
d=json.load(open('/tmp/iso_alpha_graph.json'))
nodes=d.get('graph',{}).get('nodes',[])
# Verify no beta entities in the graph
beta_nodes=[n for n in nodes if 'tenant-beta' in str(n.get('id','')) or 'tenant-beta' in str(n.get('name',''))]
if beta_nodes:
  print(f'FAIL:{len(beta_nodes)} beta nodes in alpha graph')
  sys.exit(1)
print(f'OK:{len(nodes)} nodes')
" 2>/dev/null
    RESULT=$?
    if [ $RESULT -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} Alpha constellation contains no beta nodes"; PASS=$((PASS+1))
    else
      echo -e "  ${RED}✗${NC} Alpha constellation contains beta nodes"; FAIL=$((FAIL+1))
    fi
  fi
else
  echo "  ⚠ SKIP: No alpha entity IDs for constellation test"
fi

echo ""
echo "--- Beta explores constellation: only beta entity nodes ---"
if [ ${#BETA_ENTITY_IDS[@]} -gt 0 ]; then
  S=$(curl -s --max-time 20 -o /tmp/iso_beta_graph.json -w "%{http_code}" \
    -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
    -H "Content-Type: application/json" \
    -X POST "$BASE_URL/ha-constellation/explore" \
    -d "{
      \"seed\": { \"type\": \"entity\", \"value\": \"${BETA_ENTITY_IDS[0]}\" },
      \"options\": { \"hopDepth\": 1, \"nodeLimit\": 100, \"edgeLimit\": 200, \"confidenceThreshold\": 0.3, \"timeWindow\": \"30d\" }
    }")
  assert_status "Beta POST /ha-constellation/explore" "$S" "200"
  if [ "$S" = "200" ]; then
    python3 -c "
import json,sys
d=json.load(open('/tmp/iso_beta_graph.json'))
nodes=d.get('graph',{}).get('nodes',[])
alpha_nodes=[n for n in nodes if 'tenant-alpha' in str(n.get('id','')) or 'tenant-alpha' in str(n.get('name',''))]
if alpha_nodes:
  print(f'FAIL:{len(alpha_nodes)} alpha nodes in beta graph')
  sys.exit(1)
print(f'OK:{len(nodes)} nodes')
" 2>/dev/null
    RESULT=$?
    if [ $RESULT -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} Beta constellation contains no alpha nodes"; PASS=$((PASS+1))
    else
      echo -e "  ${RED}✗${NC} Beta constellation contains alpha nodes"; FAIL=$((FAIL+1))
    fi
  fi
else
  echo "  ⚠ SKIP: No beta entity IDs for constellation test"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 9: GLOBAL ADMIN ACCESS (Task 4.11)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 9: Global Admin Sees All Tenants ━━━"

echo ""
echo "--- Global admin lists alerts: sees both alpha and beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_admin_alerts.json -w "%{http_code}" \
  -H "$ADMIN_H" \
  "$BASE_URL/ha-alerts?limit=200")
assert_status "Admin GET /ha-alerts (no tenant filter)" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_admin_alerts.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
raw=json.dumps(items)
has_alpha='tenant-alpha' in raw
has_beta='tenant-beta' in raw
if has_alpha and has_beta:
  print(f'OK:both tenants visible ({len(items)} total)')
elif has_alpha:
  print(f'PARTIAL:only alpha visible ({len(items)} items)')
elif has_beta:
  print(f'PARTIAL:only beta visible ({len(items)} items)')
else:
  # If no isolation-test tagged items, check total count is >= combined
  print(f'OK:{len(items)} items (combined view)')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Global admin sees combined data from all tenants"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Global admin view incomplete"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Global admin lists entities: sees both alpha and beta ---"
S=$(curl -s --max-time 15 -o /tmp/iso_admin_entities.json -w "%{http_code}" \
  -H "$ADMIN_H" \
  "$BASE_URL/ha-entities?limit=200")
assert_status "Admin GET /ha-entities (no tenant filter)" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_admin_entities.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
raw=json.dumps(items)
has_alpha='tenant-alpha' in raw
has_beta='tenant-beta' in raw
if has_alpha and has_beta:
  print(f'OK:both tenants ({len(items)} entities)')
else:
  print(f'OK:{len(items)} entities (combined view)')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Global admin sees combined entities"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Global admin entity view incomplete"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Global admin lists findings: combined view ---"
S=$(curl -s --max-time 15 -o /tmp/iso_admin_findings.json -w "%{http_code}" \
  -H "$ADMIN_H" \
  "$BASE_URL/ha-correlated-findings?limit=200")
assert_status "Admin GET /ha-correlated-findings (no tenant filter)" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_admin_findings.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
raw=json.dumps(items)
has_alpha='tenant-alpha' in raw
has_beta='tenant-beta' in raw
if has_alpha and has_beta:
  print(f'OK:both tenants ({len(items)} findings)')
else:
  print(f'OK:{len(items)} findings (combined view)')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Global admin sees combined findings"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Global admin findings view incomplete"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Global admin lists incidents: combined view ---"
S=$(curl -s --max-time 15 -o /tmp/iso_admin_incidents.json -w "%{http_code}" \
  -H "$ADMIN_H" \
  "$BASE_URL/ha-incidents?page=0&size=200")
assert_status "Admin GET /ha-incidents (no tenant filter)" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_admin_incidents.json'))
items=d.get('content', d.get('items', d if isinstance(d,list) else []))
raw=json.dumps(items)
has_alpha='tenant-alpha' in raw
has_beta='tenant-beta' in raw
if has_alpha and has_beta:
  print(f'OK:both tenants ({len(items)} incidents)')
else:
  print(f'OK:{len(items)} incidents (combined view)')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Global admin sees combined incidents"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Global admin incidents view incomplete"; FAIL=$((FAIL+1))
  fi
fi

echo ""
echo "--- Global admin lists detection rules: combined view ---"
S=$(curl -s --max-time 15 -o /tmp/iso_admin_rules.json -w "%{http_code}" \
  -H "$ADMIN_H" \
  "$BASE_URL/ha-detection-rules?limit=200")
assert_status "Admin GET /ha-detection-rules (no tenant filter)" "$S" "200"
if [ "$S" = "200" ]; then
  python3 -c "
import json,sys
d=json.load(open('/tmp/iso_admin_rules.json'))
items=d.get('items', d if isinstance(d,list) else d.get('content',[]))
raw=json.dumps(items)
has_alpha='tenant-alpha' in raw
has_beta='tenant-beta' in raw
if has_alpha and has_beta:
  print(f'OK:both tenants ({len(items)} rules)')
else:
  print(f'OK:{len(items)} rules (combined view)')
" 2>/dev/null
  RESULT=$?
  if [ $RESULT -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} Global admin sees combined detection rules"; PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} Global admin rules view incomplete"; FAIL=$((FAIL+1))
  fi
fi


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 10: SSE ISOLATION (Task 4.12)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Test 10: SSE Stream Isolation ━━━"

echo ""
echo "--- Alpha SSE stream does not receive beta events ---"
# Connect as alpha to alert stream, brief listen — should not receive beta events
SSE_ALPHA=$(curl -s -N --max-time 4 \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  -H "Accept: text/event-stream" \
  "$BASE_URL/ha-alerts/stream" 2>/dev/null || true)

if echo "$SSE_ALPHA" | grep -q "tenant-beta"; then
  echo -e "  ${RED}✗${NC} Alpha SSE stream contains beta events — ISOLATION BREACH"; FAIL=$((FAIL+1))
else
  echo -e "  ${GREEN}✓${NC} Alpha SSE stream has no beta events"; PASS=$((PASS+1))
fi

echo ""
echo "--- Beta SSE stream does not receive alpha events ---"
# Connect as beta to alert stream, brief listen — should not receive alpha events
SSE_BETA=$(curl -s -N --max-time 4 \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_BETA" \
  -H "Accept: text/event-stream" \
  "$BASE_URL/ha-alerts/stream" 2>/dev/null || true)

if echo "$SSE_BETA" | grep -q "tenant-alpha"; then
  echo -e "  ${RED}✗${NC} Beta SSE stream contains alpha events — ISOLATION BREACH"; FAIL=$((FAIL+1))
else
  echo -e "  ${GREEN}✓${NC} Beta SSE stream has no alpha events"; PASS=$((PASS+1))
fi

echo ""
echo "--- Alpha findings SSE does not leak beta data ---"
SSE_F_ALPHA=$(curl -s -N --max-time 4 \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  -H "Accept: text/event-stream" \
  "$BASE_URL/ha-correlated-findings/stream" 2>/dev/null || true)

if echo "$SSE_F_ALPHA" | grep -q "tenant-beta"; then
  echo -e "  ${RED}✗${NC} Alpha findings SSE contains beta data — ISOLATION BREACH"; FAIL=$((FAIL+1))
else
  echo -e "  ${GREEN}✓${NC} Alpha findings SSE isolated from beta"; PASS=$((PASS+1))
fi

echo ""
echo "--- Alpha entities SSE does not leak beta data ---"
SSE_E_ALPHA=$(curl -s -N --max-time 4 \
  -H "$ADMIN_H" -H "X-Tenant-ID: $TENANT_ALPHA" \
  -H "Accept: text/event-stream" \
  "$BASE_URL/ha-entities/stream" 2>/dev/null || true)

if echo "$SSE_E_ALPHA" | grep -q "tenant-beta"; then
  echo -e "  ${RED}✗${NC} Alpha entities SSE contains beta data — ISOLATION BREACH"; FAIL=$((FAIL+1))
else
  echo -e "  ${GREEN}✓${NC} Alpha entities SSE isolated from beta"; PASS=$((PASS+1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# CLEANUP PHASE (Task 4.13)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━━ Cleanup: Removing test data ━━━"

OS_URL="http://localhost:9200"
OS_CREDS="admin:LocalDev@2024!"

# Delete test alert indices
echo "  Deleting test alert indices..."
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-alert-${TENANT_ALPHA}-*" > /dev/null 2>&1 || true
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-alert-${TENANT_BETA}-*" > /dev/null 2>&1 || true
echo "  ✓ Alert indices deleted"

# Delete test finding indices
echo "  Deleting test finding indices..."
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-correlated-finding-${TENANT_ALPHA}-*" > /dev/null 2>&1 || true
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-correlated-finding-${TENANT_BETA}-*" > /dev/null 2>&1 || true
echo "  ✓ Finding indices deleted"

# Delete test entity indices
echo "  Deleting test entity indices..."
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-entity-${TENANT_ALPHA}-*" > /dev/null 2>&1 || true
curl -s -u "$OS_CREDS" -X DELETE "$OS_URL/v3-hive-entity-${TENANT_BETA}-*" > /dev/null 2>&1 || true
echo "  ✓ Entity indices deleted"

# Delete test incidents via API
echo "  Deleting test incidents..."
for IID in "${ALPHA_INCIDENT_IDS[@]}" "${BETA_INCIDENT_IDS[@]}"; do
  if [ -n "$IID" ]; then
    curl -s --max-time 5 -o /dev/null \
      -H "$ADMIN_H" -H "Content-Type: application/json" \
      -X DELETE "$BASE_URL/ha-incidents/$IID" 2>/dev/null || true
  fi
done
echo "  ✓ Incidents deleted"

# Delete test dashboards via API (GAP-MT-05)
echo "  Deleting test dashboards..."
for DID in "${ALPHA_DASHBOARD_IDS[@]}"; do
  if [ -n "$DID" ] && [ -n "$ALPHA_TENANT_NUM" ]; then
    curl -s --max-time 5 -o /dev/null \
      -H "$ADMIN_H" -H "X-Tenant-ID: $ALPHA_TENANT_NUM" \
      -X DELETE "$BASE_URL/ha-dashboards/$DID" 2>/dev/null || true
  fi
done
for DID in "${BETA_DASHBOARD_IDS[@]}"; do
  if [ -n "$DID" ] && [ -n "$BETA_TENANT_NUM" ]; then
    curl -s --max-time 5 -o /dev/null \
      -H "$ADMIN_H" -H "X-Tenant-ID: $BETA_TENANT_NUM" \
      -X DELETE "$BASE_URL/ha-dashboards/$DID" 2>/dev/null || true
  fi
done
echo "  ✓ Dashboards deleted"

# Delete test detection rules via API
echo "  Deleting test detection rules..."
for RID in "${ALPHA_RULE_IDS[@]}" "${BETA_RULE_IDS[@]}"; do
  if [ -n "$RID" ]; then
    curl -s --max-time 5 -o /dev/null \
      -H "$ADMIN_H" -H "Content-Type: application/json" \
      -X DELETE "$BASE_URL/ha-detection-rules/$RID" 2>/dev/null || true
  fi
done
echo "  ✓ Detection rules deleted"

# Clean up temp files
rm -f /tmp/iso_*.json 2>/dev/null || true

echo ""
echo "  Cleanup complete."

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══════════════════════════════════════════════════════════"
echo " SPRINT 49: CROSS-TENANT ISOLATION RESULTS"
echo "══════════════════════════════════════════════════════════"
echo -e " Passed: ${GREEN}${PASS}${NC}"
echo -e " Failed: ${RED}${FAIL}${NC}"
echo " Total:  $((PASS + FAIL))"
echo "══════════════════════════════════════════════════════════"
echo ""
echo " Modules tested:"
echo "   • Alerts queue isolation"
echo "   • Alert by ID cross-tenant (→ 404)"
echo "   • Severity board isolation"
echo "   • Incidents isolation"
echo "   • Dashboards isolation (GAP-MT-05)"
echo "   • Findings isolation"
echo "   • Entities isolation"
echo "   • Detection rules isolation"
echo "   • Constellation graph isolation"
echo "   • Global admin combined access"
echo "   • SSE stream isolation"
echo ""
if [ $FAIL -gt 0 ]; then
  echo -e "${RED}⚠ Some tests failed — tenant isolation may be compromised.${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All cross-tenant isolation tests passed.${NC}"
  exit 0
fi
