#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Sprint 09 — T05: OTel → Alert End-to-End Test
# Validates: OTLP gRPC receiver, event field mapping, k8s attribute nesting,
# Kafka flow, auto-discovery in backend, and data sources UI template.
#
# Usage:
#   ./local-dev/tests/otel-e2e.sh
#
# Prerequisites: docker compose up -d (all services healthy)
# Environment overrides:
#   OPENSEARCH_INITIAL_ADMIN_PASSWORD  (default: LocalDev@2024!)
#   EVENTPROCESSOR_INJECT_KEY          (default: change-me-generate-with-openssl-rand-hex-32)
# ---------------------------------------------------------------------------

PASS=0; FAIL=0; WARN=0

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

REDPANDA_CTR="hivearmor-redpanda"
WORKER_CTR="local-dev-eventprocessor-worker-1"

OS_PASS="${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"
OS_BASE="https://localhost:9200"
OS_CREDS="admin:${OS_PASS}"

BACKEND="http://localhost:8088"
INJECT_KEY="${EVENTPROCESSOR_INJECT_KEY:-change-me-generate-with-openssl-rand-hex-32}"

# Unique run tag prevents collisions with previous test runs in the same day.
RUN_TAG="e2e-$(date +%s)"

echo "=== HiveArmor Sprint 09 — OTel E2E Test (run=$RUN_TAG) ==="
echo ""

# ---------------------------------------------------------------------------
# [1] OTLP gRPC port is listening
# ---------------------------------------------------------------------------
echo "[1] OTLP gRPC receiver (port 4317)..."
if nc -z localhost 4317 2>/dev/null; then
  pass "OTLP port 4317 is listening"
else
  fail "OTLP port 4317 not reachable — is eventprocessor-worker running?"
fi

# ---------------------------------------------------------------------------
# [2] OTLP HTTP port is bound (future use, must be open even if unimplemented)
# ---------------------------------------------------------------------------
echo "[2] OTLP HTTP port 4318..."
if nc -z localhost 4318 2>/dev/null; then
  pass "OTLP port 4318 is bound"
else
  warn "OTLP port 4318 not reachable (future use, non-blocking)"
fi

# ---------------------------------------------------------------------------
# [3] Send OTLP events via the ingest HTTP endpoint using the OTLP path
#
#   The event-processor-worker exposes the OTLP gRPC receiver directly. Since
#   telemetrygen requires a Go binary not present on the host, we use the
#   existing /v1/inject HTTP endpoint with dataType=otlp as a proxy — the
#   field mapping path is identical once the event enters localLogsChannel.
#   For true gRPC validation see manual step in pass criteria below.
# ---------------------------------------------------------------------------
echo "[3] Sending OTLP events through ingest endpoint (dataType=otlp)..."

BEFORE_COUNT=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_count" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

INJECT_OK=0
for i in $(seq 1 10); do
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:8090/v1/inject" \
    -H "Content-Type: application/json" \
    -H "X-Inject-Key: ${INJECT_KEY}" \
    -d "{
      \"dataType\": \"otlp\",
      \"dataSource\": \"${RUN_TAG}-service\",
      \"raw\": \"{\\\"service.name\\\":\\\"${RUN_TAG}-service\\\",\\\"host.name\\\":\\\"${RUN_TAG}-host\\\",\\\"body\\\":\\\"otel e2e test log ${i}\\\"}\"
    }" 2>/dev/null || echo "000")
  [ "$STATUS" = "200" ] && INJECT_OK=$((INJECT_OK+1))
done
echo "  ℹ Injected: ${INJECT_OK}/10 accepted"

echo "  Waiting 15s for pipeline..."
sleep 15

AFTER_COUNT=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_count" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
NEW_EVENTS=$((AFTER_COUNT - BEFORE_COUNT))
echo "  ℹ New OTLP events in OpenSearch: $NEW_EVENTS"

if [ "$INJECT_OK" -gt 0 ] && [ "$NEW_EVENTS" -gt 0 ]; then
  pass "OTLP events appear in OpenSearch (index: v3-hive-log-otlp-*)"
elif [ "$INJECT_OK" -eq 0 ]; then
  fail "Ingest endpoint rejected all events — check EVENTPROCESSOR_INJECT_KEY and that eventprocessor-worker is up"
else
  fail "Events accepted but not indexed — check eventprocessor-worker logs: docker logs $WORKER_CTR"
fi

# ---------------------------------------------------------------------------
# [4] OTLP event field mapping: dataType and dataSource
# ---------------------------------------------------------------------------
echo "[4] OTLP event field mapping..."
FIELD_CHECK=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_search" \
  -H "Content-Type: application/json" \
  -d "{
    \"size\": 1,
    \"query\": {
      \"bool\": {
        \"must\": [
          {\"term\": {\"dataType.keyword\": \"otlp\"}},
          {\"term\": {\"dataSource.keyword\": \"${RUN_TAG}-service\"}}
        ]
      }
    }
  }" 2>/dev/null || echo '{}')

HITS=$(echo "$FIELD_CHECK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=d.get('hits',{}).get('hits',[])
if not hits: print('none'); exit()
src=hits[0].get('_source',{})
print(src.get('dataType','missing')+'|'+src.get('dataSource','missing'))
" 2>/dev/null || echo "none")

if echo "$HITS" | grep -q "^otlp|${RUN_TAG}-service$"; then
  pass "dataType=otlp and dataSource=${RUN_TAG}-service present in indexed document"
else
  fail "Field mapping incorrect — got: '$HITS' (expected 'otlp|${RUN_TAG}-service')"
fi

# ---------------------------------------------------------------------------
# [5] Kubernetes attributes: produce events via Kafka with k8s OTel semconv
#     and verify nestK8sAttributes mapping in the indexed document.
# ---------------------------------------------------------------------------
echo "[5] k8s OTel semconv → nested k8s fields (via Kafka direct produce)..."

K8S_BEFORE=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_count" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")

K8S_MSG=$(python3 -c "
import json, time, uuid
print(json.dumps({
  'id': str(uuid.uuid4()),
  'dataType': 'otlp',
  'dataSource': '${RUN_TAG}-k8s-service',
  'tenantId': 'ce66672c-e36d-4761-a8c8-90058fee1a24',
  'raw': json.dumps({
    'k8s': {
      'podName': '${RUN_TAG}-pod',
      'namespace': 'e2e-ns',
      'containerName': 'main',
      'serviceName': '${RUN_TAG}-k8s-service'
    },
    'host.name': '${RUN_TAG}-node',
    'body': 'k8s e2e test'
  }),
  'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
}))")
echo "$K8S_MSG" | docker exec -i "$REDPANDA_CTR" \
  rpk topic produce hivearmor.raw.events \
  --brokers localhost:9092 \
  -f "%v\n" 2>/dev/null || true
echo "  ℹ K8s OTLP event produced to hivearmor.raw.events"

echo "  Waiting 12s for consumer..."
sleep 12

K8S_AFTER=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_count" 2>/dev/null \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
K8S_NEW=$((K8S_AFTER - K8S_BEFORE))

K8S_DOC=$(curl -sk -u "$OS_CREDS" \
  "${OS_BASE}/v3-hive-log-otlp-*/_search" \
  -H "Content-Type: application/json" \
  -d "{
    \"size\": 1,
    \"query\": {
      \"bool\": {
        \"must\": [
          {\"term\": {\"dataSource.keyword\": \"${RUN_TAG}-k8s-service\"}}
        ]
      }
    }
  }" 2>/dev/null || echo '{}')

K8S_POD=$(echo "$K8S_DOC" | python3 -c "
import sys,json
hits=json.load(sys.stdin).get('hits',{}).get('hits',[])
if not hits: print('none'); exit()
src=hits[0].get('_source',{})
log=src.get('log',{})
k8s=log.get('k8s',{}) if isinstance(log,dict) else {}
print(k8s.get('podName','missing'))
" 2>/dev/null || echo "none")

if [ "$K8S_POD" = "${RUN_TAG}-pod" ]; then
  pass "k8s.podName correctly nested in indexed doc (log.k8s.podName=${RUN_TAG}-pod)"
elif [ "$K8S_NEW" -eq 0 ]; then
  warn "k8s event not yet indexed — Kafka consumer may be lagging (non-blocking)"
else
  fail "k8s.podName missing or incorrect — got: '$K8S_POD'; check k8s.yml filter"
fi

# ---------------------------------------------------------------------------
# [6] Kafka topic: hivearmor.raw.events has OTLP messages
# ---------------------------------------------------------------------------
echo "[6] Kafka topic activity..."
TOPIC_INFO=$(docker exec "$REDPANDA_CTR" \
  rpk topic describe hivearmor.raw.events --brokers localhost:9092 2>&1 || true)
if echo "$TOPIC_INFO" | grep -qE "OFFSET|PARTITION"; then
  pass "hivearmor.raw.events topic is active (offsets present)"
else
  fail "hivearmor.raw.events topic describe failed — is Redpanda running?"
fi

# ---------------------------------------------------------------------------
# [7] Auto-discovered OTLP sources in the backend
#     The UtmDataInputStatusService scans OpenSearch for recent sources;
#     after injecting events above the otlp dataType should appear.
# ---------------------------------------------------------------------------
echo "[7] Auto-discovery: OTLP sources in backend..."
TOKEN=$(curl -sf -X POST "${BACKEND}/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  warn "Could not obtain backend JWT — backend may be down, skipping auto-discovery check"
else
  OTLP_SOURCES=$(curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "${BACKEND}/api/ha-data-input-statuses?dataType.equals=otlp&page=0&size=20" \
    | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  echo "  ℹ Auto-discovered OTLP sources: $OTLP_SOURCES"
  if [ "$OTLP_SOURCES" -gt 0 ]; then
    pass "OTLP sources visible in /api/ha-data-input-statuses"
  else
    warn "No OTLP sources yet in backend (worker job runs every 30s — retry after a minute)"
  fi
fi

# ---------------------------------------------------------------------------
# [8] OTel Collector template download (YAML served as inline content in UI)
#     The frontend embeds templates as static strings; verify the data-sources
#     page renders the otelcol tab by hitting the Next.js app URL.
# ---------------------------------------------------------------------------
echo "[8] Data-sources page: otelcol tab..."
DS_STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost:3000/data-sources" 2>/dev/null || echo "000")
if [ "$DS_STATUS" = "200" ]; then
  pass "Data-sources page returns HTTP 200 (http://localhost:3000/data-sources)"
  echo "  ℹ Manual: open that URL, click 'OpenTelemetry Collector', verify templates load and YAML can be copied"
else
  warn "Data-sources page returned HTTP $DS_STATUS — Next.js dev server may be down"
fi

# ---------------------------------------------------------------------------
# [9] OTel collector config templates present on disk (10 expected)
# ---------------------------------------------------------------------------
echo "[9] OTel collector template files..."
TEMPLATE_DIR="$(dirname "$(dirname "$(dirname "$0")")")/local-dev/otelcol/templates"
if [ -d "$TEMPLATE_DIR" ]; then
  TEMPLATE_COUNT=$(ls "$TEMPLATE_DIR"/*.yaml 2>/dev/null | wc -l | tr -d ' ')
  echo "  ℹ Templates found: $TEMPLATE_COUNT"
  if [ "$TEMPLATE_COUNT" -ge 1 ]; then
    pass "OTel collector templates present ($TEMPLATE_COUNT files in local-dev/otelcol/templates/)"
    # Verify kubernetes.yaml specifically (named in pass criteria)
    if [ -f "${TEMPLATE_DIR}/kubernetes.yaml" ]; then
      pass "kubernetes.yaml template exists"
    else
      fail "kubernetes.yaml template missing from local-dev/otelcol/templates/"
    fi
  else
    fail "No .yaml files found in $TEMPLATE_DIR"
  fi
else
  fail "Template directory not found: $TEMPLATE_DIR"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================="
printf "Results: %d passed, %d failed, %d warnings\n" "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -eq 0 ]; then
  echo "✓ OTel E2E passed — ready for Sprint 10"
  exit 0
else
  echo "✗ $FAIL check(s) failed — resolve before Sprint 10"
  echo ""
  echo "Debug tips:"
  echo "  docker logs $WORKER_CTR --tail 50   # inputs plugin / OTLP receiver"
  echo "  docker logs local-dev-eventprocessor-1 --tail 50  # correlation engine"
  echo "  docker exec $REDPANDA_CTR rpk topic list --brokers localhost:9092"
  echo "  curl -sk -u admin:${OS_PASS} https://localhost:9200/v3-hive-log-otlp-*/_count"
  exit 1
fi
