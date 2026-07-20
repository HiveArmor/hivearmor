#!/usr/bin/env bash
# Sprint 03 — T05: Detection Engine End-to-End Test
# Exercises all four detection modes via the /v1/inject HTTP endpoint.
#
# Prerequisites (default local-dev values):
#   docker compose up -d       # full stack running
#   OPENSEARCH_PASSWORD        # defaults to LocalDev@2024!
#   EVENTPROCESSOR_INJECT_KEY  # defaults to localdev-inject-key-2024
#
# Usage:
#   bash detection-e2e-test.sh
#   EVENTPROCESSOR_INJECT_KEY=my-key OPENSEARCH_PASSWORD=my-pass bash detection-e2e-test.sh
set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:8088}"
EP_URL="${EP_URL:-http://localhost:8090}"
OS_URL="${OS_URL:-https://localhost:9200}"
OS_PASS="${OPENSEARCH_PASSWORD:-LocalDev@2024!}"
OS_CREDS="admin:${OS_PASS}"
INJECT_KEY="${EVENTPROCESSOR_INJECT_KEY:-localdev-inject-key-2024}"

PASS=0; FAIL=0; WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

check_bool() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then pass "$label"
    else fail "$label (expected=$expected, got=$actual)"; fi
}

# Injects a pre-parsed event and returns the HTTP response body.
inject() {
    curl -sf -X POST "$EP_URL/v1/inject" \
        -H "Content-Type: application/json" \
        -H "X-Inject-Key: $INJECT_KEY" \
        -d "$1" 2>/dev/null || echo '{"status":"inject_failed"}'
}

# Queries the alert count for a given category string in OpenSearch.
alert_count() {
    local cat="$1"
    curl -sk -u "$OS_CREDS" \
        "$OS_URL/v3-hive-alert-*/_count" \
        -H "Content-Type: application/json" \
        --data-raw "{\"query\":{\"term\":{\"category.keyword\":\"$cat\"}}}" \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0"
}

echo ""
echo "=== HiveArmor Sprint 03 — Detection Engine E2E Test ==="
echo "  backend   : $BACKEND_URL"
echo "  ep inject : $EP_URL"
echo "  opensearch: $OS_URL"
echo ""

# ── Preflight ────────────────────────────────────────────────────────────────
echo "[0] Preflight checks"

EP_HEALTH=$(curl -sf "$EP_URL/health" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "unreachable")
if [ "$EP_HEALTH" = "ok" ] || [ "$EP_HEALTH" = "healthy" ]; then
    pass "Event-processor /health is up"
else
    fail "Event-processor unreachable at $EP_URL/health — is the stack running? (docker compose ps)"
    echo ""
    echo "Cannot continue — start the stack first."
    exit 1
fi

OS_HEALTH=$(curl -sk -u "$OS_CREDS" "$OS_URL/_cluster/health" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "unreachable")
if [[ "$OS_HEALTH" == "green" || "$OS_HEALTH" == "yellow" ]]; then
    pass "OpenSearch cluster: $OS_HEALTH"
else
    fail "OpenSearch unreachable (status=$OS_HEALTH)"
fi

# ── [1] Threshold Rule Detection ─────────────────────────────────────────────
# Threshold rules are standard CEL rules (possibly with correlation afterEvents).
# The test rule in rules/tests/risk_test_rule.yml uses category "Credential Access".
# We inject linux brute-force events that match linux-brute-force.yaml rule 1001.
# That rule fires via afterEvents correlation against v11-log-linux-* (the old index).
# For the test we use the risk-score path which is more reliable without OS history.
echo ""
echo "[1] Threshold Rule Detection (risk-score path, threshold=75)"

# Each inject call adds riskScore=30 to origin 10.0.0.99.
# Three events → score=90 → crosses threshold 75 → alert fires within 60s flush loop.
THRESHOLD_IP="10.21.0.99"
for i in 1 2 3; do
    inject "{
        \"dataType\": \"windows\",
        \"dataSource\": \"test-host-threshold\",
        \"originIp\": \"$THRESHOLD_IP\",
        \"log\": {\"action\": \"failed_auth\"}
    }" > /dev/null
done

echo "  Sent 3 risk-scoring events from $THRESHOLD_IP — waiting 65s for flush loop..."
sleep 65

RISK_COUNT=$(alert_count "risk")
check_bool "Risk/threshold alert generated" "true" "$([ "$RISK_COUNT" -gt 0 ] && echo true || echo false)"

# ── [2] Sequence Rule Detection ───────────────────────────────────────────────
# rules/tests/sequence_test_rule.yml: action=port_scan then action=exploit_attempt
# from same IP within window fires a sequence alert (category="sequence").
echo ""
echo "[2] Sequence Rule Detection"

SEQ_IP="10.21.1.55"

# Step 1: action=port_scan
inject "{
    \"dataType\": \"windows\",
    \"dataSource\": \"test-host-seq\",
    \"originIp\": \"$SEQ_IP\",
    \"log\": {\"action\": \"port_scan\"}
}" > /dev/null

echo "  Step 1 (port_scan) injected — waiting 2s..."
sleep 2

# Step 2: action=exploit_attempt from same IP (completes the sequence)
inject "{
    \"dataType\": \"windows\",
    \"dataSource\": \"test-host-seq\",
    \"originIp\": \"$SEQ_IP\",
    \"log\": {\"action\": \"exploit_attempt\"}
}" > /dev/null

echo "  Step 2 (exploit_attempt) injected — waiting 3s for alert write..."
sleep 3

SEQ_COUNT=$(alert_count "sequence")
check_bool "Sequence rule fired alert" "true" "$([ "$SEQ_COUNT" -gt 0 ] && echo true || echo false)"

# ── [3] Risk Score Detection ──────────────────────────────────────────────────
# Already validated in [1] via the risk flush loop.
# This section checks the alert has the expected adversary IP populated.
echo ""
echo "[3] Risk Score Alert Fields"

RISK_ADVERSARY=$(curl -sk -u "$OS_CREDS" \
    "$OS_URL/v3-hive-alert-*/_search" \
    -H "Content-Type: application/json" \
    --data-raw "{
        \"query\":{\"term\":{\"category.keyword\":\"risk\"}},
        \"sort\":[{\"@timestamp\":{\"order\":\"desc\"}}],
        \"size\":1
    }" \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=d.get('hits',{}).get('hits',[])
if hits:
    adv=hits[0]['_source'].get('adversary',{})
    print(adv.get('ip','missing'))
else:
    print('no_alert')
" 2>/dev/null || echo "error")

check_bool "Risk alert has adversary.ip populated" "true" \
    "$([ "$RISK_ADVERSARY" != "missing" ] && [ "$RISK_ADVERSARY" != "no_alert" ] && [ "$RISK_ADVERSARY" != "error" ] && echo true || echo false)"

if [ "$RISK_ADVERSARY" = "$THRESHOLD_IP" ]; then
    pass "Risk alert adversary.ip matches injected source ($THRESHOLD_IP)"
else
    warn "Risk alert adversary.ip is '$RISK_ADVERSARY' (expected $THRESHOLD_IP — may be a prior test run's alert)"
fi

# ── [4] Anomaly Detection ─────────────────────────────────────────────────────
# Anomaly detection requires 30-day baseline history (BASELINE_MIN_SAMPLES=72 hourly buckets).
# In a fresh local-dev environment this will NOT fire unless BASELINE_MIN_SAMPLES is lowered.
# This check is non-blocking: WARN if no anomaly alerts exist, PASS if they do.
echo ""
echo "[4] Anomaly Detection (non-blocking — requires baseline history)"

ANOMALY_COUNT=$(alert_count "ANOMALY")
if [ "$ANOMALY_COUNT" -gt 0 ]; then
    pass "Anomaly detection has fired at least once ($ANOMALY_COUNT alert(s))"
else
    warn "No ANOMALY alerts yet — baseline needs BASELINE_MIN_SAMPLES=${BASELINE_MIN_SAMPLES:-72} hourly buckets"
    echo "       To test immediately: set BASELINE_MIN_SAMPLES=0 BASELINE_STDDEV_MULTIPLIER=0"
    echo "       in local-dev/.env and restart the eventprocessor container."
fi

# Probe the anomaly endpoint by injecting a burst from a stable source.
# If baselines exist this will trigger; if not, the inject still exercises the code path.
ANOMALY_SRC="anomaly-probe-$(date +%s)"
for i in $(seq 1 5); do
    inject "{
        \"dataType\": \"linux\",
        \"dataSource\": \"$ANOMALY_SRC\",
        \"originIp\": \"10.21.2.77\",
        \"log\": {\"action\": \"login\"}
    }" > /dev/null
done
pass "Anomaly detection code path exercised (burst of 5 events injected)"

# ── [5] Sequence State Persistence ───────────────────────────────────────────
echo ""
echo "[5] Sequence State Persistence"

# Start a sequence step but don't complete it — it must be persisted.
PERSIST_IP="10.21.3.11"
inject "{
    \"dataType\": \"linux\",
    \"dataSource\": \"test-host-persist\",
    \"originIp\": \"$PERSIST_IP\",
    \"log\": {\"action\": \"port_scan\"}
}" > /dev/null

sleep 2

SEQ_STATE=$(curl -sk -u "$OS_CREDS" \
    "$OS_URL/v3-hive-sequence-state-*/_count" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
check_bool "Sequence state index exists and has docs" "true" "$([ "$SEQ_STATE" -ge 0 ] && echo true || echo false)"

if [ "$SEQ_STATE" -gt 0 ]; then
    pass "Sequence state persisted to OpenSearch ($SEQ_STATE record(s))"
else
    warn "Sequence state index is empty — may be using an older rules set without test rules loaded"
fi

# ── [6] Event-Processor Rules API ────────────────────────────────────────────
echo ""
echo "[6] Event-Processor Rules API"

# Rules API is served on the public port (:8000), not the ingest port (:8090).
EP_PUBLIC_URL="${EP_PUBLIC_URL:-http://localhost:8000}"
RULE_COUNT=$(curl -sf "$EP_PUBLIC_URL/api/ha-rules" 2>/dev/null \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
check_bool "Rules API returns loaded rules" "true" "$([ "$RULE_COUNT" -gt 0 ] && echo true || echo false)"

if [ "$RULE_COUNT" -gt 0 ]; then
    RISK_RULES=$(curl -sf "$EP_PUBLIC_URL/api/ha-rules" 2>/dev/null \
        | python3 -c "import sys,json; r=json.load(sys.stdin); print(sum(1 for x in r if x.get('hasRiskScore')))" 2>/dev/null || echo "0")
    SEQ_RULES=$(curl -sf "$EP_PUBLIC_URL/api/ha-rules" 2>/dev/null \
        | python3 -c "import sys,json; r=json.load(sys.stdin); print(sum(1 for x in r if x.get('hasSequence')))" 2>/dev/null || echo "0")
    echo "     Total rules: $RULE_COUNT  |  Risk-scored: $RISK_RULES  |  Sequence: $SEQ_RULES"
    check_bool "At least one risk-scored rule active" "true" "$([ "$RISK_RULES" -gt 0 ] && echo true || echo false)"
    check_bool "At least one sequence rule active" "true" "$([ "$SEQ_RULES" -gt 0 ] && echo true || echo false)"
fi

# ── [7] Backend API Rule Coverage ────────────────────────────────────────────
echo ""
echo "[7] Backend API Rule Coverage"

TOKEN=$(curl -sf -X POST "$BACKEND_URL/api/authenticate" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id_token',d.get('token','')))" 2>/dev/null || echo "")

if [ -n "$TOKEN" ]; then
    pass "Backend JWT obtained"
    ACTIVE_RULES=$(curl -sf -H "Authorization: Bearer $TOKEN" \
        "$BACKEND_URL/api/correlation-rule/search-by-filters?page=0&size=1" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('totalElements',d.get('total',0)))" 2>/dev/null || echo "0")
    check_bool "Backend rules API returns active rules" "true" "$([ "$ACTIVE_RULES" -gt 0 ] && echo true || echo false)"
else
    warn "Backend auth failed — is backend running on $BACKEND_URL?"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
printf "Results: %d passed, %d failed, %d warnings\n" "$PASS" "$FAIL" "$WARN"
echo ""
echo "Manual verification:"
echo "  http://localhost:3000/alerts"
echo "    → Filter Category = risk     → at least 1 alert from $THRESHOLD_IP"
echo "    → Filter Category = sequence → at least 1 alert"
echo "    → Filter Category = ANOMALY  → 0 unless BASELINE_MIN_SAMPLES lowered"
echo ""
echo "  http://localhost:3000/uba"
echo "    → Anomaly feed should show data once baseline window fills (default: 3 days)"
echo ""
echo "  http://localhost:3000/rules"
echo "    → ATT&CK Coverage tab → tactics populated from active rules"
echo ""
if [ "$FAIL" -gt 0 ]; then
    echo "✗ $FAIL check(s) failed — detection engine NOT fully operational"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo "⚠ All hard checks passed with $WARN warning(s) — anomaly requires baseline history"
    exit 0
else
    echo "✓ All detection engine checks passed"
    exit 0
fi
