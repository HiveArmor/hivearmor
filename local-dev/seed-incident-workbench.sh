#!/usr/bin/env bash
# =============================================================================
# seed-incident-workbench.sh — Sprint 43 Incident Workbench test data
#
# Seeds 30 incidents (12 CWM + 10 Workmates1 + 8 Workmates2) with:
#   - Tasks with checklists (incident_tasks)
#   - Activity entries (incident_activity)
#   - Evidence items (v3-hive-evidence-<tenant>-*)
#   - Evidence custody events (evidence_custody)
#   - Linked alerts (v3-hive-alert-<tenant>-*)
#   - Entity links (hive_incident_entity)
#   - 3 similar incident chains for INC-003 testing
#
# Usage:
#   cd local-dev && bash seed-incident-workbench.sh
#   cd local-dev && bash seed-incident-workbench.sh --teardown
#
# Prerequisites:
#   - PostgreSQL on localhost:5438 (postgres / localdev123!)
#   - OpenSearch on https://localhost:9200 (admin / LocalDev@2024!)
#   - python3 (stdlib only, no external deps)
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OS="curl -sk -u ${OS_USER}:${OS_PASS}"
PG_HOST="localhost"
PG_PORT="5438"
PG_USER="postgres"
PG_DB="hivearmor"
export PGPASSWORD="localdev123!"
TODAY=$(date -u +%Y.%m.%d)
BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${CYAN}  →${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}$*${NC}"; }

teardown() {
  header "Teardown — removing Sprint 43 workbench seed data"
  info "Removing PostgreSQL data..."
  docker exec -i local-dev-postgres-1 psql -U postgres -d hivearmor -q 2>/dev/null << 'SQL'
DELETE FROM evidence_custody WHERE incident_id LIKE 'IWB-%';
DELETE FROM incident_activity WHERE incident_id LIKE 'IWB-%';
DELETE FROM incident_tasks WHERE incident_id LIKE 'IWB-%';
DELETE FROM hive_incident_history WHERE incident_id IN (
  SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%'
);
DELETE FROM hive_incident_entity WHERE incident_id IN (
  SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%'
);
DELETE FROM hive_incident WHERE incident_name LIKE 'IWB-%';
SQL
  ok "PostgreSQL cleanup done"
  info "Removing OpenSearch evidence & alert docs..."
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-incident-*/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"prefix":{"id":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-evidence-*/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
  ok "OpenSearch cleanup done"
  ok "Teardown complete"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 43 Incident Workbench Seed (30 incidents)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "PostgreSQL: ${PG_HOST}:${PG_PORT}/${PG_DB}"
info "OpenSearch: ${OS_URL}"
echo ""

# ─── Idempotent: clean previous seed data before re-seeding ─────────────────
header "Step 0: Teardown previous seed data (idempotent re-run)"
docker exec -i local-dev-postgres-1 psql -U postgres -d hivearmor -q 2>/dev/null << 'SQL' || true
DELETE FROM evidence_custody WHERE incident_id LIKE 'IWB-%';
DELETE FROM incident_activity WHERE incident_id LIKE 'IWB-%';
DELETE FROM incident_tasks WHERE incident_id LIKE 'IWB-%';
DELETE FROM hive_incident_history WHERE incident_id IN (
  SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%'
);
DELETE FROM hive_incident_entity WHERE incident_id IN (
  SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%'
);
DELETE FROM hive_incident WHERE incident_name LIKE 'IWB-%';
SQL
${CURL_OS} -X POST "${OS_URL}/v3-hive-incident-*/_delete_by_query" \
  -H "Content-Type: application/json" \
  -d '{"query":{"prefix":{"id":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-evidence-*/_delete_by_query" \
  -H "Content-Type: application/json" \
  -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_delete_by_query" \
  -H "Content-Type: application/json" \
  -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null > /dev/null || true
ok "Previous seed data removed"

header "Step 1: Ensure OpenSearch indices exist"
for PREFIX in cwm workmates1 workmates2; do
  ${CURL_OS} -X PUT "${OS_URL}/v3-hive-incident-${PREFIX}-${TODAY}" \
    -H "Content-Type: application/json" -d '{"settings":{"number_of_shards":1,"number_of_replicas":0},"mappings":{"properties":{"@timestamp":{"type":"date"},"id":{"type":"keyword"},"title":{"type":"text","fields":{"keyword":{"type":"keyword"}}},"description":{"type":"text"},"severity":{"type":"keyword"},"status":{"type":"keyword"},"priority":{"type":"keyword"},"assignee":{"type":"keyword"},"createdAt":{"type":"date"},"createdBy":{"type":"keyword"},"tenantId":{"type":"long"},"visibleBy":{"type":"keyword"},"version":{"type":"integer"},"tags":{"type":"keyword"},"updatedAt":{"type":"date"}}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X PUT "${OS_URL}/v3-hive-evidence-${PREFIX}-${TODAY}" \
    -H "Content-Type: application/json" -d '{"settings":{"number_of_shards":1,"number_of_replicas":0},"mappings":{"properties":{"@timestamp":{"type":"date"},"incidentId":{"type":"keyword"},"title":{"type":"text","fields":{"keyword":{"type":"keyword"}}},"type":{"type":"keyword"},"sourceSystem":{"type":"keyword"},"collectedAt":{"type":"date"},"createdAt":{"type":"date"},"sha256":{"type":"keyword"},"classification":{"type":"keyword"},"size":{"type":"long"},"visibleBy":{"type":"keyword"},"tenantId":{"type":"long"}}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X PUT "${OS_URL}/v3-hive-alert-${PREFIX}-${TODAY}" \
    -H "Content-Type: application/json" -d '{"settings":{"number_of_shards":1,"number_of_replicas":0},"mappings":{"properties":{"@timestamp":{"type":"date"},"name":{"type":"keyword"},"id":{"type":"keyword"},"incidentId":{"type":"keyword"},"severity":{"type":"integer"},"severityLabel":{"type":"keyword"},"status":{"type":"integer"},"statusLabel":{"type":"keyword"},"category":{"type":"keyword"},"ruleName":{"type":"keyword"},"host":{"properties":{"name":{"type":"keyword"}}},"user":{"properties":{"name":{"type":"keyword"}}},"source":{"properties":{"ip":{"type":"ip"}}},"destination":{"properties":{"ip":{"type":"ip"}}},"message":{"type":"text"},"visibleBy":{"type":"keyword"},"tenantId":{"type":"long"},"tags":{"type":"keyword"}}}}' 2>/dev/null > /dev/null || true
done
ok "Indices ready for cwm, workmates1, workmates2 (incidents, evidence, alerts)"

header "Step 2: Generate seed data"
TMPDIR=$(mktemp -d /tmp/ha_iwb_XXXXXX)
trap "rm -rf ${TMPDIR}" EXIT
python3 "${SCRIPT_DIR}/seed-incident-workbench-gen.py" "${TMPDIR}"

header "Step 3: Load PostgreSQL data (incidents, tasks, activity, custody, entities)"
docker exec -i local-dev-postgres-1 psql -U postgres -d hivearmor -q < "${TMPDIR}/seed.sql" 2>/dev/null
ok "PostgreSQL data loaded"

header "Step 4: Load OpenSearch incident documents (INC-001 PATCH support)"
${CURL_OS} -X POST "${OS_URL}/_bulk" -H "Content-Type: application/x-ndjson" \
  --data-binary "@${TMPDIR}/incidents.ndjson" 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errs = sum(1 for i in items if 'error' in i.get('index', {}))
    print(f'  Indexed {len(items)} incident docs (errors: {errs})')
except:
    print('  Incident bulk insert completed')
"

header "Step 5: Load OpenSearch evidence items"
${CURL_OS} -X POST "${OS_URL}/_bulk" -H "Content-Type: application/x-ndjson" \
  --data-binary "@${TMPDIR}/evidence.ndjson" 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errs = sum(1 for i in items if 'error' in i.get('index', {}))
    print(f'  Indexed {len(items)} evidence docs (errors: {errs})')
except:
    print('  Evidence bulk insert completed')
"

header "Step 6: Load OpenSearch linked alerts"
${CURL_OS} -X POST "${OS_URL}/_bulk" -H "Content-Type: application/x-ndjson" \
  --data-binary "@${TMPDIR}/alerts.ndjson" 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errs = sum(1 for i in items if 'error' in i.get('index', {}))
    print(f'  Indexed {len(items)} alert docs (errors: {errs})')
except:
    print('  Alert bulk insert completed')
"
${CURL_OS} -X POST "${OS_URL}/v3-hive-incident-*/_refresh" 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-evidence-*/_refresh" 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_refresh" 2>/dev/null > /dev/null || true

header "Step 7: Verification"
echo ""
info "PostgreSQL counts:"
INC_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM hive_incident WHERE incident_name LIKE 'IWB-%';" 2>/dev/null)
TASK_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM incident_tasks WHERE incident_id LIKE 'IWB-%';" 2>/dev/null)
ACT_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM incident_activity WHERE incident_id LIKE 'IWB-%';" 2>/dev/null)
CUST_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM evidence_custody WHERE incident_id LIKE 'IWB-%';" 2>/dev/null)
ENT_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM hive_incident_entity WHERE incident_id IN (SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%');" 2>/dev/null)
HIST_COUNT=$(docker exec local-dev-postgres-1 psql -U postgres -d hivearmor -tAq \
  -c "SELECT COUNT(*) FROM hive_incident_history WHERE incident_id IN (SELECT id FROM hive_incident WHERE incident_name LIKE 'IWB-%');" 2>/dev/null)
printf "  %-25s %s\n" "Incidents:" "${INC_COUNT:-?}"
printf "  %-25s %s\n" "Tasks:" "${TASK_COUNT:-?}"
printf "  %-25s %s\n" "Activity entries:" "${ACT_COUNT:-?}"
printf "  %-25s %s\n" "Timeline entries:" "${HIST_COUNT:-?}"
printf "  %-25s %s\n" "Custody events:" "${CUST_COUNT:-?}"
printf "  %-25s %s\n" "Entity links:" "${ENT_COUNT:-?}"
echo ""
info "OpenSearch counts:"
for PREFIX in cwm workmates1 workmates2; do
  EVI=$(${CURL_OS} -s "${OS_URL}/v3-hive-evidence-${PREFIX}-*/_count" \
    -H "Content-Type: application/json" \
    -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('count','?'))" 2>/dev/null || echo "?")
  ALT=$(${CURL_OS} -s "${OS_URL}/v3-hive-alert-${PREFIX}-*/_count" \
    -H "Content-Type: application/json" \
    -d '{"query":{"prefix":{"incidentId":{"value":"IWB-"}}}}' 2>/dev/null | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('count','?'))" 2>/dev/null || echo "?")
  printf "  %-25s evidence=%s  alerts=%s\n" "${PREFIX}:" "${EVI}" "${ALT}"
done

header "Step 8: API check (optional — requires backend at localhost:8088)"
API_URL="http://localhost:8088"
TOKEN=$(curl -sf -X POST "${API_URL}/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))" 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
  API_COUNT=$(curl -sf -H "Authorization: Bearer ${TOKEN}" \
    "${API_URL}/api/ha-incidents?page=0&size=100" 2>/dev/null | \
    python3 -c "import sys,json; data=json.load(sys.stdin); print(len([i for i in data if 'IWB-' in i.get('incidentName','')]))" 2>/dev/null || echo "?")
  ok "GET /ha-incidents returns ${API_COUNT} IWB-* incidents"
else
  warn "Backend not running — skipping API verification"
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Seed complete — 30 incidents with full workbench data${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Tenant breakdown:"
echo "    CWM:        12 incidents (4 critical, 3 high, 3 medium, 2 low)"
echo "    Workmates1: 10 incidents (2 critical, 3 high, 3 medium, 2 low)"
echo "    Workmates2:  8 incidents (2 critical, 2 high, 2 medium, 2 low)"
echo ""
echo "  Similar incident chains (INC-003 testing):"
echo "    Chain A (SMB Lateral):      IWB-CWM-001, IWB-CWM-002, IWB-CWM-006, IWB-WM2-001"
echo "    Chain B (Phishing):         IWB-CWM-003, IWB-CWM-008, IWB-WM1-001, IWB-WM1-003, IWB-WM1-006"
echo "    Chain C (Credential Theft): IWB-CWM-005, IWB-CWM-010, IWB-WM1-004, IWB-WM2-003"
echo ""
echo "  Teardown: bash seed-incident-workbench.sh --teardown"
echo ""
