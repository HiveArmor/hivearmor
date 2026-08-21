#!/usr/bin/env bash
# Proves three raw records -> normalization -> alerts -> canonical correlated finding.
# This test never writes directly to OpenSearch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DEV_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${LOCAL_DEV_DIR}/.env"

read_local_env() {
    local key="$1"
    [[ -f "$ENV_FILE" ]] && sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

EVENTPROCESSOR_URL="${EVENTPROCESSOR_URL:-http://127.0.0.1:8090}"
OPENSEARCH_URL="${OPENSEARCH_URL:-https://127.0.0.1:9200}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8088}"
INJECT_KEY="${EVENTPROCESSOR_INJECT_KEY:-$(read_local_env EVENTPROCESSOR_INJECT_KEY)}"
OS_USER="${OPENSEARCH_USER:-admin}"
OS_PASS="${OPENSEARCH_PASSWORD:-$(read_local_env OPENSEARCH_INITIAL_ADMIN_PASSWORD)}"
BACKEND_USER="${BACKEND_USER:-admin}"
BACKEND_PASSWORD="${BACKEND_PASSWORD:-localdev123!}"

if [[ -z "$INJECT_KEY" || -z "$OS_PASS" ]]; then
    echo "ERROR: local inject/OpenSearch credentials are unavailable" >&2
    exit 1
fi

RUN_ID="finding-e2e-$(date -u +%Y%m%dT%H%M%SZ)-$$"
SHARED_USER="${RUN_ID}"
HOST_NAME="E2E-CORR-WKS-$$"
OS_CURL=(curl -skS -u "${OS_USER}:${OS_PASS}" -H 'Content-Type: application/json')

poll_document() {
    local index_pattern="$1"
    local document_id="$2"
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
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

echo "[finding-e2e] run: ${RUN_ID}"
ALERT_IDS=()
EVENT_IDS=()
for sequence in 1 2 3; do
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
    raw_event=$(jq -nc \
        --arg timestamp "$timestamp" \
        --arg run "$RUN_ID" \
        --arg user "$SHARED_USER" \
        --arg host "$HOST_NAME" \
        --argjson sequence "$sequence" \
        '{eventType:"POWERSHELL_SCRIPTBLOCK",dataType:"powershell","@timestamp":$timestamp,pid:(7100+$sequence),scriptBlock:("powershell.exe -NoProfile -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAKQA= # "+$run+"-"+($sequence|tostring)),scriptPath:"",hostname:$host,userName:$user,dataSource:($host+" (agent-e2e)"),severity:"HIGH",testRunId:$run,sequence:$sequence}')
    request=$(jq -nc --arg raw "$raw_event" --arg source "$HOST_NAME (agent-e2e)" '{dataType:"powershell",dataSource:$source,tenantId:"default",raw:$raw}')
    response=$(curl -sS -X POST "${EVENTPROCESSOR_URL}/v1/inject" -H 'Content-Type: application/json' -H "X-Inject-Key: ${INJECT_KEY}" -d "$request")
    event_id=$(jq -r '.id // empty' <<<"$response")
    alert_id=$(jq -r '.alertIds[0] // empty' <<<"$response")
    if [[ $(jq -r '.status // empty' <<<"$response") != "processed" || -z "$event_id" || -z "$alert_id" ]]; then
        echo "ERROR: raw record ${sequence} did not generate an alert" >&2
        jq . <<<"$response" >&2
        exit 1
    fi
    EVENT_IDS+=("$event_id")
    ALERT_IDS+=("$alert_id")
    echo "[finding-e2e] raw record ${sequence} generated event ${event_id} and alert ${alert_id}"
    poll_document 'v3-hive-alert-*' "$alert_id" >/dev/null || {
        echo "ERROR: generated alert ${alert_id} was not indexed before the next raw record" >&2
        exit 1
    }
done

finding_id=""
attempts=0
while [[ $attempts -lt 30 ]]; do
    result=$("${OS_CURL[@]}" -X POST "${OPENSEARCH_URL}/v3-hive-correlation-*/_search" -d "$(jq -nc --arg user "$SHARED_USER" '{size:1,query:{term:{"adversary.user.keyword":$user}}}')")
    finding_id=$(jq -r '.hits.hits[0]._source.id // empty' <<<"$result")
    [[ -n "$finding_id" ]] && break
    sleep 1
    attempts=$((attempts + 1))
done
if [[ -z "$finding_id" ]]; then
    echo "ERROR: the three generated alerts did not produce a canonical finding" >&2
    exit 1
fi

finding_result=$(poll_document 'v3-hive-correlation-*' "$finding_id")
finding=$(jq -c '.hits.hits[0]._source' <<<"$finding_result")
echo "[finding-e2e] canonical finding ${finding_id} indexed"
alerts_json=$(printf '%s\n' "${ALERT_IDS[@]}" | jq -R . | jq -s .)
events_json=$(printf '%s\n' "${EVENT_IDS[@]}" | jq -R . | jq -s .)

if ! jq -e --arg user "$SHARED_USER" --argjson alerts "$alerts_json" '
    (.status == "new") and
    (.severity == "high") and
    (.signalCount == 3) and
    (.alerts | length == 3) and
    (($alerts - .alerts) | length == 0) and
    (.stages[0].signalIds | length == 3) and
    (.mitreTechniques | index("T1059.001") != null) and
    (.entities | any(.type == "user" and .value == $user)) and
    (.correlationReasons | any(.type == "shared_entity")) and
    (.correlationReasons | any(.type == "temporal_proximity")) and
    (.narrative | contains("analyst validation is still required")) and
    (.producer.name == "hivearmor-event-processor") and
    (.correlationEngine.version == "hivearmor-event-processor finding-correlator/1") and
    (.correlationEngine.ruleIds == ["shared-adversary-2h"]) and
    (.correlationEngine.evaluatedAt | type == "string") and
    (.sourceDetectionNames | index("E2E: Encoded PowerShell Script Block") != null) and
    (.version == 1) and
    (.dataCompleteness == "complete")
' <<<"$finding" >/dev/null; then
    echo "ERROR: canonical finding projection failed contract validation" >&2
    jq '{id,title,status,severity,signalCount,alerts,stages,entities,correlationReasons,mitreTechniques,narrative,producer,correlationEngine,sourceDetectionNames,version,dataCompleteness}' <<<"$finding" >&2
    exit 1
fi

legacy=$(poll_document 'v3-hive-offense-*' "$finding_id" | jq -c '.hits.hits[0]._source')
if ! jq -e '.deprecated == true and .successorIndex == "v3-hive-correlation-*"' <<<"$legacy" >/dev/null; then
    echo "ERROR: deprecated compatibility projection is invalid" >&2
    exit 1
fi

for alert_id in "${ALERT_IDS[@]}"; do
    linked=false
    attempts=0
    while [[ $attempts -lt 15 ]]; do
        updated=$(poll_document 'v3-hive-alert-*' "$alert_id" | jq -c '.hits.hits[0]._source')
        if jq -e --arg finding "$finding_id" '.findingId == $finding and .offenseId == $finding' <<<"$updated" >/dev/null; then
            linked=true
            break
        fi
        sleep 1
        attempts=$((attempts + 1))
    done
    if [[ "$linked" != true ]]; then
        echo "ERROR: alert ${alert_id} was not linked to finding ${finding_id}" >&2
        exit 1
    fi
done

for event_id in "${EVENT_IDS[@]}"; do
    normalized=$(poll_document 'v3-hive-log-*' "$event_id" | jq -c '.hits.hits[0]._source')
    if ! jq -e --arg user "$SHARED_USER" '.origin.user == $user and (.log.scriptBlock | contains("-EncodedCommand"))' <<<"$normalized" >/dev/null; then
        echo "ERROR: normalized event ${event_id} lost the raw user or script block" >&2
        exit 1
    fi
done

token_response=$(curl -sS -X POST "${BACKEND_URL}/api/authenticate" -H 'Content-Type: application/json' -d "$(jq -nc --arg username "$BACKEND_USER" --arg password "$BACKEND_PASSWORD" '{username:$username,password:$password,rememberMe:false}')")
token=$(jq -r '.token // .id_token // empty' <<<"$token_response")
if [[ -n "$token" ]]; then
    detail=$(curl -sS -H "Authorization: Bearer ${token}" "${BACKEND_URL}/api/ha-correlated-findings/${finding_id}")
    signals=$(curl -sS -H "Authorization: Bearer ${token}" "${BACKEND_URL}/api/ha-correlated-findings/${finding_id}/signals?limit=25")
    events=$(curl -sS -H "Authorization: Bearer ${token}" "${BACKEND_URL}/api/ha-correlated-findings/${finding_id}/events?limit=25")
    if ! jq -e --arg finding "$finding_id" '.finding.id == $finding and .finding.signalCount == 3' <<<"$detail" >/dev/null; then
        echo "ERROR: authenticated finding detail contract failed" >&2
        jq . <<<"$detail" >&2
        exit 1
    fi
    if ! jq -e '.total == 3 and (.items | all(.ruleName != null))' <<<"$signals" >/dev/null; then
        echo "ERROR: authenticated signal evidence contract failed" >&2
        jq . <<<"$signals" >&2
        exit 1
    fi
    if ! jq -e --argjson ids "$events_json" '.total >= 3 and ([.items[].id] as $actual | (($ids - $actual) | length == 0))' <<<"$events" >/dev/null; then
        echo "ERROR: authenticated raw-event evidence contract failed" >&2
        jq '{total, ids: [.items[].id]}' <<<"$events" >&2
        exit 1
    fi
else
    echo "WARN: backend authentication unavailable; producer acceptance passed but API acceptance was skipped" >&2
fi

echo "[finding-e2e] PASS"
echo "FINDING_ID=${finding_id}"
echo "ALERT_IDS=$(IFS=,; echo "${ALERT_IDS[*]}")"
echo "EVENT_IDS=$(IFS=,; echo "${EVENT_IDS[*]}")"
echo "FINDING_TITLE=$(jq -r '.title' <<<"$finding")"
