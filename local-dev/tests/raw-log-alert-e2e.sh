#!/usr/bin/env bash
# Proves raw telemetry -> normalization -> detection -> indexed alert.
# This test never writes to v3-hive-log-* or v3-hive-alert-* directly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${LOCAL_DEV_DIR}/.env"

read_local_env() {
    local key="$1"
    if [[ ! -f "$ENV_FILE" ]]; then
        return 0
    fi
    sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

EVENTPROCESSOR_URL="${EVENTPROCESSOR_URL:-http://127.0.0.1:8090}"
OPENSEARCH_URL="${OPENSEARCH_URL:-https://127.0.0.1:9200}"
INJECT_KEY="${EVENTPROCESSOR_INJECT_KEY:-$(read_local_env EVENTPROCESSOR_INJECT_KEY)}"
OS_USER="${OPENSEARCH_USER:-admin}"
OS_PASS="${OPENSEARCH_PASSWORD:-$(read_local_env OPENSEARCH_INITIAL_ADMIN_PASSWORD)}"

if [[ -z "$INJECT_KEY" || -z "$OS_PASS" ]]; then
    echo "ERROR: local inject/OpenSearch credentials are unavailable" >&2
    exit 1
fi

RUN_ID="raw-e2e-$(date -u +%Y%m%dT%H%M%SZ)-$$"
HOST_NAME="E2E-WKS-${RUN_ID##*-}"
RAW_EVENT=$(printf '{"eventType":"POWERSHELL_SCRIPTBLOCK","dataType":"powershell","@timestamp":"%s","pid":7124,"scriptBlock":"powershell.exe -NoProfile -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAKQA= # %s","scriptPath":"","hostname":"%s","dataSource":"%s (agent-e2e)","severity":"HIGH","testRunId":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$RUN_ID" "$HOST_NAME" "$HOST_NAME" "$RUN_ID")
REQUEST=$(jq -nc --arg raw "$RAW_EVENT" --arg source "$HOST_NAME (agent-e2e)" '{dataType:"powershell",dataSource:$source,tenantId:"default",raw:$raw}')

echo "[raw-e2e] run: ${RUN_ID}"
echo "[raw-e2e] verifying the inject boundary fails closed without a key"
UNAUTH_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${EVENTPROCESSOR_URL}/v1/inject" -H 'Content-Type: application/json' -d "$REQUEST")
if [[ "$UNAUTH_STATUS" != "401" ]]; then
    echo "ERROR: unauthenticated injection returned HTTP ${UNAUTH_STATUS}, expected 401" >&2
    exit 1
fi

echo "[raw-e2e] submitting one raw ETW Script Block event"
RESPONSE=$(curl -sS -X POST "${EVENTPROCESSOR_URL}/v1/inject" -H 'Content-Type: application/json' -H "X-Inject-Key: ${INJECT_KEY}" -d "$REQUEST")
STATUS=$(jq -r '.status // empty' <<<"$RESPONSE")
EVENT_ID=$(jq -r '.id // empty' <<<"$RESPONSE")
ALERT_ID=$(jq -r '.alertIds[0] // empty' <<<"$RESPONSE")
ALERT_COUNT=$(jq -r '.alerts // 0' <<<"$RESPONSE")

if [[ "$STATUS" != "processed" || -z "$EVENT_ID" || "$ALERT_COUNT" -lt 1 || -z "$ALERT_ID" ]]; then
    echo "ERROR: engine did not return a generated alert for the raw event" >&2
    jq . <<<"$RESPONSE" >&2
    exit 1
fi

OS_CURL=(curl -skS -u "${OS_USER}:${OS_PASS}" -H 'Content-Type: application/json')

poll_document() {
    local index_pattern="$1"
    local document_id="$2"
    local attempts=0
    while [[ $attempts -lt 20 ]]; do
        local result
        result=$("${OS_CURL[@]}" -X POST "${OPENSEARCH_URL}/${index_pattern}/_search" -d "{\"size\":1,\"query\":{\"ids\":{\"values\":[\"${document_id}\"]}}}")
        if [[ $(jq -r '.hits.total.value // 0' <<<"$result") -ge 1 ]]; then
            printf '%s' "$result"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done
    return 1
}

echo "[raw-e2e] waiting for the normalized event and generated alert"
EVENT_RESULT=$(poll_document 'v3-hive-log-*' "$EVENT_ID") || {
    echo "ERROR: normalized event ${EVENT_ID} was not indexed" >&2
    exit 1
}
ALERT_RESULT=$(poll_document 'v3-hive-alert-*' "$ALERT_ID") || {
    echo "ERROR: generated alert ${ALERT_ID} was not indexed" >&2
    exit 1
}

EVENT_SOURCE=$(jq -c '.hits.hits[0]._source' <<<"$EVENT_RESULT")
ALERT_SOURCE=$(jq -c '.hits.hits[0]._source' <<<"$ALERT_RESULT")

jq -e --arg run "$RUN_ID" --arg host "$HOST_NAME" '
    (.raw | contains($run)) and
    (.log.scriptBlock | contains("-EncodedCommand")) and
    (.origin.host == $host) and
    (.origin.process == "powershell.exe") and
    (.action == "POWERSHELL_SCRIPTBLOCK")
' <<<"$EVENT_SOURCE" >/dev/null

jq -e --arg event "$EVENT_ID" '
    (.name == "E2E: Encoded PowerShell Script Block") and
    (.technique | contains("T1059.001")) and
    (.mitreTechniqueId == "T1059.001") and
    (.mitreTechniqueName == "PowerShell") and
    (.dataSources | length == 1) and
    (.sourceEventIds | index($event) != null) and
    (.eventIds | index($event) != null)
' <<<"$ALERT_SOURCE" >/dev/null

echo "[raw-e2e] PASS"
echo "EVENT_ID=${EVENT_ID}"
echo "ALERT_ID=${ALERT_ID}"
echo "ALERT_NAME=$(jq -r '.name' <<<"$ALERT_SOURCE")"
echo "TECHNIQUE=$(jq -r '.technique' <<<"$ALERT_SOURCE")"
