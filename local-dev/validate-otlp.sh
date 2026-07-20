#!/usr/bin/env bash
# Sprint 09 T01 – OTLP gRPC Receiver Validation Script
# Run from local-dev/ after docker compose is up.
set -euo pipefail

OPENSEARCH_URL="http://localhost:9200"
OPENSEARCH_CREDS="admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-LocalDev@2024!}"
OTLP_ENDPOINT="localhost:4317"

echo "=== Sprint 09 T01 — OTLP Validation ==="
echo ""

# ---------------------------------------------------------------------------
# Test 1: Port reachability
# ---------------------------------------------------------------------------
echo "--- Test 1: Port 4317 reachable ---"
if nc -zv "$OTLP_ENDPOINT" 2>&1 | grep -q "open\|succeeded\|Connected"; then
    echo "PASS: nc -zv $OTLP_ENDPOINT → connection succeeded"
else
    echo "FAIL: port 4317 not open"
    exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# Test 2: Send logs via otlpsend binary, verify in OpenSearch
# ---------------------------------------------------------------------------
echo "--- Test 2: Send OTLP logs via otlpsend and verify in OpenSearch ---"

UNIQUE_MSG="validation-$(date +%s)-sprint09t01"

cd "$(dirname "$0")/.."
echo "Sending test log: $UNIQUE_MSG"
go run ./plugins/inputs/cmd/otlpsend "$OTLP_ENDPOINT" "$UNIQUE_MSG" 2>&1
echo ""

echo "Waiting 8s for indexing..."
sleep 8

echo "Querying OpenSearch for dataType:OTLP..."
RESULT=$(curl -sk -u "$OPENSEARCH_CREDS" \
    "${OPENSEARCH_URL}/v3-hive-log-*/_search" \
    -H "Content-Type: application/json" \
    -d "{
        \"query\": {
            \"bool\": {
                \"must\": [
                    {\"term\": {\"dataType\": \"OTLP\"}},
                    {\"match\": {\"message\": \"$UNIQUE_MSG\"}}
                ]
            }
        },
        \"size\": 3,
        \"sort\": [{\"@timestamp\": {\"order\": \"desc\"}}]
    }" | python3 -m json.tool 2>/dev/null || echo "{}")

HITS=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hits',{}).get('total',{}).get('value',0))" 2>/dev/null || echo "0")

if [ "$HITS" -gt 0 ]; then
    echo "PASS: Found $HITS OTLP log(s) in OpenSearch"
    echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for h in d.get('hits',{}).get('hits',[]):
    s = h['_source']
    print(f\"  id={h['_id']}\")
    print(f\"  dataType={s.get('dataType','')}\")
    print(f\"  dataSource={s.get('dataSource','')}\")
    print(f\"  message={s.get('message','')}\")
    print(f\"  host={s.get('host','')}\")
    print()
"
else
    echo "FAIL: No OTLP events found in OpenSearch with message '$UNIQUE_MSG'"
    echo "Raw response:"
    echo "$RESULT"
    exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# Test 3: OTel Collector sidecar
# ---------------------------------------------------------------------------
echo "--- Test 3: OTel Collector sidecar ---"
cd local-dev 2>/dev/null || cd "$(dirname "$0")"

echo "Starting otel-collector with otelcol profile..."
docker compose --profile otelcol up -d otel-collector 2>&1
echo "Waiting 10s for collector to start..."
sleep 10

UNIQUE_MSG2="otelcol-validation-$(date +%s)"
echo "Sending test log via otel-collector (port 4319): $UNIQUE_MSG2"
cd ..
go run ./plugins/inputs/cmd/otlpsend "localhost:4319" "$UNIQUE_MSG2" 2>&1 || {
    echo "WARN: direct send to 4319 failed — collector may not be ready"
}

echo "Waiting 12s for pipeline: collector → eventprocessor-worker → opensearch..."
sleep 12

echo "Querying OpenSearch for otelcol log..."
RESULT2=$(curl -sk -u "$OPENSEARCH_CREDS" \
    "${OPENSEARCH_URL}/v3-hive-log-*/_search" \
    -H "Content-Type: application/json" \
    -d "{
        \"query\": {
            \"bool\": {
                \"must\": [
                    {\"term\": {\"dataType\": \"OTLP\"}},
                    {\"match\": {\"message\": \"$UNIQUE_MSG2\"}}
                ]
            }
        },
        \"size\": 3
    }" | python3 -m json.tool 2>/dev/null || echo "{}")

HITS2=$(echo "$RESULT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hits',{}).get('total',{}).get('value',0))" 2>/dev/null || echo "0")

if [ "$HITS2" -gt 0 ]; then
    echo "PASS: Found $HITS2 log(s) arriving via OTel Collector → OTLP receiver pipeline"
    echo "$RESULT2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for h in d.get('hits',{}).get('hits',[]):
    s = h['_source']
    print(f\"  id={h['_id']}, dataType={s.get('dataType','')}, message={s.get('message','')}\")
"
else
    echo "FAIL: No events from otel-collector found. Check: docker logs local-dev-otel-collector-1"
    echo "Raw response:"
    echo "$RESULT2"
    exit 1
fi

echo ""
echo "=== ALL TESTS PASSED ==="
