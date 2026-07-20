#!/usr/bin/env bash
# Sprint 04 — T08: SOC Workflow End-to-End Test
# Exercises the full analyst workflow: alert → incident → SOAR → close → audit.
#
# Prerequisites:
#   docker compose up -d          # full stack running
#   OPENSEARCH_INITIAL_ADMIN_PASSWORD  # defaults to LocalDev@2024!
#
# Usage:
#   bash soc-workflow-e2e.sh
#   OPENSEARCH_INITIAL_ADMIN_PASSWORD=my-pass bash soc-workflow-e2e.sh
set -euo pipefail

BASE_URL="${BACKEND_URL:-http://localhost:8088}"
OS_URL="${OS_URL:-https://localhost:9200}"
OS_PASS="${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"
OS_CREDS="admin:${OS_PASS}"

PASS=0; FAIL=0; WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

check_http() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then pass "$label"
    else fail "$label (expected HTTP $expected, got $actual)"; fi
}

check_bool() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then pass "$label"
    else fail "$label (expected=$expected, got=$actual)"; fi
}

echo ""
echo "=== HiveArmor Sprint 04 — SOC Workflow E2E Test ==="
echo "  backend:    $BASE_URL"
echo "  opensearch: $OS_URL"
echo ""

# ── [0] Preflight ─────────────────────────────────────────────────────────────
echo "[0] Preflight checks"

HEALTH=$(curl -sk -u "$OS_CREDS" "$OS_URL/_cluster/health" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','unreachable'))" 2>/dev/null || echo "unreachable")
if [[ "$HEALTH" == "green" || "$HEALTH" == "yellow" ]]; then
    pass "OpenSearch cluster: $HEALTH"
else
    fail "OpenSearch unreachable (status=$HEALTH) — run: docker compose ps"
    echo "Cannot continue without OpenSearch."
    exit 1
fi

# ── [1] Authenticate ──────────────────────────────────────────────────────────
echo ""
echo "[1] Authentication"

TOKEN=$(curl -sf -X POST "$BASE_URL/api/authenticate" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id_token',d.get('token','')))" 2>/dev/null || echo "")

if [ -n "$TOKEN" ]; then
    pass "JWT token obtained"
else
    fail "Backend auth failed — is the backend running on $BASE_URL?"
    echo "Cannot continue without auth token."
    exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# ── [2] Verify alert pipeline flowing ─────────────────────────────────────────
echo ""
echo "[2] Alert pipeline health"

ALERT_COUNT=$(curl -sk -u "$OS_CREDS" "$OS_URL/v3-hive-alert-*/_count" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

if [ "$ALERT_COUNT" -gt 0 ]; then
    pass "Alert index has $ALERT_COUNT document(s)"
else
    warn "Alert index is empty — injecting a test alert for workflow seed"
fi

# Inject a seed alert (idempotent; used if pipeline is empty)
TODAY=$(date -u +%Y.%m.%d)
SEED_ID="soc-e2e-seed-$(date -u +%s)"
curl -sk -u "$OS_CREDS" -X POST \
    "$OS_URL/v3-hive-alert-${TODAY}/_doc/${SEED_ID}?refresh=true" \
    -H "Content-Type: application/json" \
    -d '{
        "@timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
        "id": "'"$SEED_ID"'",
        "name": "SOC E2E Test Alert",
        "severity": 3,
        "dataSource": "e2e-test-host",
        "dataType": "syslog",
        "category": "Credential Access",
        "tags": ["soc-e2e-test"],
        "status": 2,
        "notes": null,
        "solution": null,
        "lastUpdate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
        "statusLabel": "open"
    }' > /dev/null
pass "Seed alert injected (id=$SEED_ID)"

# ── [3] Alert severity type check ─────────────────────────────────────────────
echo ""
echo "[3] Alert severity type check"

SEVERITY_TYPE=$(curl -sk -u "$OS_CREDS" \
    "$OS_URL/v3-hive-alert-*/_search?size=1&sort=@timestamp:desc" \
    | python3 -c "
import sys, json
d = json.load(sys.stdin)
hits = d.get('hits', {}).get('hits', [])
if hits:
    sev = hits[0]['_source'].get('severity')
    if isinstance(sev, int): print('int')
    elif isinstance(sev, float): print('float')
    elif sev is None: print('null')
    else: print('string')
else:
    print('no_data')
" 2>/dev/null || echo "error")

if [ "$SEVERITY_TYPE" = "int" ]; then
    pass "Alert severity is stored as integer"
elif [ "$SEVERITY_TYPE" = "no_data" ]; then
    warn "No alerts found — severity type check skipped"
else
    fail "Alert severity type is '$SEVERITY_TYPE' (expected int)"
fi

# ── [4] Backend alert API ──────────────────────────────────────────────────────
echo ""
echo "[4] Backend alert API"

OPEN_COUNT=$(curl -sf -H "$AUTH_HEADER" \
    "$BASE_URL/api/ha-alerts/count-open-alerts" 2>/dev/null || echo "-1")

if [ "$OPEN_COUNT" -ge 0 ] 2>/dev/null; then
    pass "Backend /api/ha-alerts/count-open-alerts → $OPEN_COUNT open alert(s)"
else
    fail "Alert count API returned unexpected value: $OPEN_COUNT"
fi

# ── [5] Create incident from seed alert ───────────────────────────────────────
echo ""
echo "[5] Alert → Incident promotion"

# ConvertToIncidentRequestBody: eventIds, incidentName, incidentId (0=new), incidentSource
INCIDENT_NAME="SOC E2E Test Incident $(date -u +%s)"
CREATE_HTTP=$(curl -so /dev/null -w "%{http_code}" -X POST \
    -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$BASE_URL/api/ha-alerts/convert-to-incident" \
    -d "{
        \"eventIds\":[\"$SEED_ID\"],
        \"incidentName\":\"$INCIDENT_NAME\",
        \"incidentId\":0,
        \"incidentSource\":\"alert\"
    }" 2>/dev/null || echo "000")

check_http "convert-to-incident returns 200" "200" "$CREATE_HTTP"

# Fetch the newly created incident by name
INCIDENT_ID=$(curl -sf -H "$AUTH_HEADER" \
    "$BASE_URL/api/ha-incidents?page=0&size=1&sort=id,desc" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('content', d.get('data', []))
if items: print(items[0].get('id','none'))
else: print('none')
" 2>/dev/null || echo "none")

if [ "$INCIDENT_ID" != "none" ] && [ "$INCIDENT_ID" != "" ]; then
    pass "Incident created — id=$INCIDENT_ID"
else
    fail "Could not retrieve created incident ID"
    INCIDENT_ID=""
fi

# ── [6] Incident evidence & timeline ──────────────────────────────────────────
echo ""
echo "[6] Incident investigation APIs"

if [ -n "$INCIDENT_ID" ]; then
    EVIDENCE_HTTP=$(curl -so /dev/null -w "%{http_code}" \
        -H "$AUTH_HEADER" "$BASE_URL/api/ha-incidents/$INCIDENT_ID/evidence" 2>/dev/null || echo "000")
    check_http "GET /ha-incidents/{id}/evidence returns 200" "200" "$EVIDENCE_HTTP"

    TIMELINE_HTTP=$(curl -so /dev/null -w "%{http_code}" \
        -H "$AUTH_HEADER" "$BASE_URL/api/ha-incidents/$INCIDENT_ID/timeline" 2>/dev/null || echo "000")
    check_http "GET /ha-incidents/{id}/timeline returns 200" "200" "$TIMELINE_HTTP"

    ENTITIES_HTTP=$(curl -so /dev/null -w "%{http_code}" \
        -H "$AUTH_HEADER" "$BASE_URL/api/ha-incidents/$INCIDENT_ID/entities" 2>/dev/null || echo "000")
    check_http "GET /ha-incidents/{id}/entities returns 200" "200" "$ENTITIES_HTTP"
else
    warn "Skipping investigation API checks — no incident ID"
fi

# ── [7] SOAR playbooks ────────────────────────────────────────────────────────
echo ""
echo "[7] SOAR playbook API"

PLAYBOOK_COUNT=$(curl -sf -H "$AUTH_HEADER" \
    "$BASE_URL/api/soar/playbooks" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('content', d.get('data', []))
print(len(items))
" 2>/dev/null || echo "0")

if [ "$PLAYBOOK_COUNT" -gt 0 ]; then
    pass "SOAR playbooks exist ($PLAYBOOK_COUNT total)"

    # Execute the first playbook against our seed alert
    FIRST_PB_ID=$(curl -sf -H "$AUTH_HEADER" \
        "$BASE_URL/api/soar/playbooks" \
        | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('content', d.get('data', []))
if items: print(items[0].get('id',''))
else: print('')
" 2>/dev/null || echo "")

    if [ -n "$FIRST_PB_ID" ]; then
        EXEC_HTTP=$(curl -so /dev/null -w "%{http_code}" -X POST \
            -H "$AUTH_HEADER" -H "Content-Type: application/json" \
            "$BASE_URL/api/soar/playbooks/$FIRST_PB_ID/execute" \
            -d "{\"alertId\":\"$SEED_ID\",\"triggerType\":\"manual\"}" 2>/dev/null || echo "000")
        check_http "Playbook execute returns 200" "200" "$EXEC_HTTP"

        EXEC_LIST_HTTP=$(curl -so /dev/null -w "%{http_code}" \
            -H "$AUTH_HEADER" \
            "$BASE_URL/api/soar/alert-executions/$SEED_ID" 2>/dev/null || echo "000")
        check_http "Alert executions API returns 200" "200" "$EXEC_LIST_HTTP"
    fi
else
    warn "No SOAR playbooks configured — skipping execute checks"
    echo "       To seed a playbook: POST /api/soar/playbooks with a definition"
fi

# ── [8] UBA summary ───────────────────────────────────────────────────────────
echo ""
echo "[8] UBA data pipeline"

UBA_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" "$BASE_URL/api/uba/summary" 2>/dev/null || echo "000")
check_http "GET /api/uba/summary returns 200" "200" "$UBA_HTTP"

UBA_ANOMALIES=$(curl -sf -H "$AUTH_HEADER" \
    "$BASE_URL/api/uba/summary" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('anomaliesLast24h',0))" 2>/dev/null || echo "0")
echo "     UBA anomalies last 24h: $UBA_ANOMALIES"

# ── [9] Close incident ────────────────────────────────────────────────────────
echo ""
echo "[9] Close incident"

if [ -n "$INCIDENT_ID" ]; then
    # GET the full incident object first so we can patch status
    INCIDENT_JSON=$(curl -sf -H "$AUTH_HEADER" \
        "$BASE_URL/api/ha-incidents/$INCIDENT_ID" 2>/dev/null || echo "")

    if [ -n "$INCIDENT_JSON" ]; then
        # Replace incidentStatus with COMPLETED (the "closed" state — IncidentStatusEnum)
        CLOSE_PAYLOAD=$(echo "$INCIDENT_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
d['incidentStatus']='COMPLETED'
d['incidentSolution']='SOC E2E test complete — no real threat'
print(json.dumps(d))
" 2>/dev/null || echo "")

        if [ -n "$CLOSE_PAYLOAD" ]; then
            CLOSE_HTTP=$(curl -so /dev/null -w "%{http_code}" -X PUT \
                -H "$AUTH_HEADER" -H "Content-Type: application/json" \
                "$BASE_URL/api/ha-incidents/change-status" \
                -d "$CLOSE_PAYLOAD" 2>/dev/null || echo "000")
            check_http "Incident closed (status=COMPLETED)" "200" "$CLOSE_HTTP"
        else
            warn "Could not build close payload from incident JSON"
        fi
    else
        warn "Could not fetch incident $INCIDENT_ID for close step"
    fi
else
    warn "Skipping close — no incident ID"
fi

# ── [10] Audit trail verification ─────────────────────────────────────────────
echo ""
echo "[10] Audit trail verification"

# Application events are stored in OpenSearch index v3-hive-backend-logs
AUDIT_COUNT=$(curl -sk -u "$OS_CREDS" \
    "$OS_URL/v3-hive-backend-logs/_count" \
    -H "Content-Type: application/json" \
    --data-raw "{\"query\":{\"range\":{\"@timestamp\":{\"gte\":\"now-15m\"}}}}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

if [ "$AUDIT_COUNT" -gt 0 ]; then
    pass "Audit events recorded in last 15 min ($AUDIT_COUNT event(s))"
else
    warn "No audit events found in v3-hive-backend-logs in the last 15 min"
    echo "       Check that backend is writing events (docker compose logs backend)"
fi

# ── [11] Dashboard data ───────────────────────────────────────────────────────
echo ""
echo "[11] Dashboard data"

GEO_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" "$BASE_URL/api/overview/geo-threats?hours=24" 2>/dev/null || echo "000")
check_http "GET /api/overview/geo-threats returns 200" "200" "$GEO_HTTP"

TIMELINE_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" "$BASE_URL/api/overview/alert-timeline?days=7" 2>/dev/null || echo "000")
check_http "GET /api/overview/alert-timeline returns 200" "200" "$TIMELINE_HTTP"

KPI_FROM="$(date -u -v-7d +%Y-%m-%dT00:00:00 2>/dev/null || date -u --date='7 days ago' +%Y-%m-%dT00:00:00)Z"
KPI_TO="$(date -u +%Y-%m-%dT23:59:59)Z"
KPI_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" "$BASE_URL/api/overview/count-alerts-by-status?from=${KPI_FROM}&to=${KPI_TO}" 2>/dev/null || echo "000")
check_http "GET /api/overview/count-alerts-by-status returns 200" "200" "$KPI_HTTP"

# ── [12] Compliance reports ───────────────────────────────────────────────────
echo ""
echo "[12] Compliance reports"

COMPLIANCE_HTTP=$(curl -so /dev/null -w "%{http_code}" \
    -H "$AUTH_HEADER" "$BASE_URL/api/ha-compliance-report-config" 2>/dev/null || echo "000")
check_http "GET /api/ha-compliance-report-config returns 200" "200" "$COMPLIANCE_HTTP"

COMPLIANCE_COUNT=$(curl -sf -H "$AUTH_HEADER" \
    "$BASE_URL/api/ha-compliance-report-config" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('content', d.get('data', []))
print(len(items))
" 2>/dev/null || echo "0")
echo "     Compliance report configs: $COMPLIANCE_COUNT"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
printf "Results: %d passed, %d failed, %d warnings\n" "$PASS" "$FAIL" "$WARN"
echo ""
echo "Manual UI walkthrough checklist:"
echo "  http://localhost:3000/alerts"
echo "    → Alert list shows real data with severity badges"
echo "    → Click any alert → detail panel populated (not empty)"
echo "    → SOC AI 'Analyze' triggers a real backend call"
echo ""
echo "  http://localhost:3000/incidents/$INCIDENT_ID"
echo "    → Evidence Board shows linked alert cards (not DEMO_EVIDENCE)"
echo "    → Timeline tab shows chronological events (not DEMO_TIMELINE)"
echo "    → Entities tab shows extracted IPs/users (not DEMO_GRAPH)"
echo "    → 'Generate AI Summary' calls backend (spinner, then real text)"
echo ""
echo "  http://localhost:3000/dashboard"
echo "    → Alert heatmap shows real bars"
echo "    → Geo map shows real points"
echo ""
echo "  http://localhost:3000/uba"
echo "    → No 'demo data' badge; anomalies populated (or 0 with explanation)"
echo ""
echo "  http://localhost:3000/compliance"
echo "    → Eye button opens report viewer"
echo ""
echo "  http://localhost:3000/data-sources"
echo "    → Eye button opens agent detail panel"
echo ""
echo "  http://localhost:3000/settings/audit-log"
echo "    → Recent events from this test run visible"
echo ""
if [ "$FAIL" -gt 0 ]; then
    echo "✗ $FAIL check(s) failed — SOC workflow NOT fully operational"
    echo "  Resolve before Sprint 05."
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "⚠ All hard checks passed with $WARN warning(s)"
    echo "  Document each warning before proceeding to Sprint 05."
    exit 0
else
    echo "✓ All SOC workflow checks passed — ready for Sprint 05"
    exit 0
fi
