#!/usr/bin/env bash
# Generates one rich, explicitly linked alert-investigation dataset for local E2E review.
# The e2e-* IDs are deterministic and safe to re-index. No production fixture flag is used.

set -euo pipefail

OPENSEARCH_URL="${OPENSEARCH_URL:-https://localhost:9200}"
OS_CREDS="${OS_CREDS:-admin:LocalDev@2024!}"
INDEX_DATE="${INDEX_DATE:-$(date -u +%Y.%m.%d)}"
ALERT_INDEX="v3-hive-alert-${INDEX_DATE}"
LOG_INDEX="v3-hive-log-${INDEX_DATE}"
ALERT_ID="e2e-alert-investigation-rich-001"

now_epoch=$(date +%s)
iso_at() {
  date -u -r $((now_epoch + $1)) +"%Y-%m-%dT%H:%M:%S.000Z"
}

t1=$(iso_at -420)
t2=$(iso_at -390)
t3=$(iso_at -360)
t4=$(iso_at -330)
t5=$(iso_at -300)
t6=$(iso_at -270)
detected_at=$(iso_at -240)

bulk_file=$(mktemp /tmp/hivearmor-investigation-evidence-XXXXXXXX)
trap 'rm -f "$bulk_file"' EXIT

append_document() {
  local index_name="$1"
  local document_id="$2"
  local payload="$3"
  printf '{"index":{"_index":"%s","_id":"%s"}}\n%s\n' \
    "$index_name" "$document_id" "$payload" >> "$bulk_file"
}

append_document "$LOG_INDEX" "inv-evt-001" "{\"@timestamp\":\"${t1}\",\"event\":{\"id\":\"inv-evt-001\",\"category\":\"process\",\"type\":\"start\",\"action\":\"document_opened\",\"outcome\":\"success\"},\"host\":{\"name\":\"FIN-WKS-044\",\"os\":{\"family\":\"windows\"}},\"user\":{\"name\":\"maya.chen\",\"domain\":\"NORTHSTAR\"},\"process\":{\"name\":\"winword.exe\",\"pid\":4312,\"command_line\":\"winword.exe invoice-review.docm\",\"parent\":{\"name\":\"explorer.exe\",\"pid\":1204}},\"source\":{\"ip\":\"10.44.18.118\"},\"mitre\":{\"tactic\":{\"id\":\"TA0002\",\"name\":\"Execution\"},\"technique\":{\"id\":\"T1204.002\",\"name\":\"Malicious File\"}},\"visibleBy\":[\"default\"]}"
append_document "$LOG_INDEX" "inv-evt-002" "{\"@timestamp\":\"${t2}\",\"event\":{\"id\":\"inv-evt-002\",\"category\":\"process\",\"type\":\"start\",\"action\":\"encoded_script_started\",\"outcome\":\"success\"},\"host\":{\"name\":\"FIN-WKS-044\",\"os\":{\"family\":\"windows\"}},\"user\":{\"name\":\"maya.chen\",\"domain\":\"NORTHSTAR\"},\"process\":{\"name\":\"powershell.exe\",\"pid\":4488,\"command_line\":\"powershell.exe -NoProfile -EncodedCommand SQBFAFgA\",\"parent\":{\"name\":\"winword.exe\",\"pid\":4312}},\"source\":{\"ip\":\"10.44.18.118\"},\"mitre\":{\"tactic\":{\"id\":\"TA0002\",\"name\":\"Execution\"},\"technique\":{\"id\":\"T1059.001\",\"name\":\"PowerShell\"}},\"visibleBy\":[\"default\"]}"
append_document "$LOG_INDEX" "inv-evt-003" "{\"@timestamp\":\"${t3}\",\"event\":{\"id\":\"inv-evt-003\",\"category\":\"file\",\"type\":\"creation\",\"action\":\"payload_written\",\"outcome\":\"success\"},\"host\":{\"name\":\"FIN-WKS-044\"},\"user\":{\"name\":\"maya.chen\"},\"process\":{\"name\":\"powershell.exe\",\"pid\":4488},\"file\":{\"name\":\"telemetry-cache.dll\",\"path\":\"C:\\\\ProgramData\\\\telemetry-cache.dll\",\"hash\":{\"sha256\":\"f1831c9e764c0d5dbad71896d728f1413d3a1b6a2083b15f73a9e45c5dd35d0a\"}},\"mitre\":{\"tactic\":{\"id\":\"TA0005\",\"name\":\"Defense Evasion\"},\"technique\":{\"id\":\"T1027\",\"name\":\"Obfuscated Files or Information\"}},\"visibleBy\":[\"default\"]}"
append_document "$LOG_INDEX" "inv-evt-004" "{\"@timestamp\":\"${t4}\",\"event\":{\"id\":\"inv-evt-004\",\"category\":\"network\",\"type\":\"connection\",\"action\":\"outbound_tls_connected\",\"outcome\":\"success\",\"duration\":1840000000},\"host\":{\"name\":\"FIN-WKS-044\"},\"user\":{\"name\":\"maya.chen\"},\"process\":{\"name\":\"powershell.exe\",\"pid\":4488},\"source\":{\"ip\":\"10.44.18.118\",\"port\":53442},\"destination\":{\"ip\":\"198.51.100.42\",\"port\":443},\"network\":{\"transport\":\"tcp\",\"bytes\":48312,\"bytes_out\":32218},\"tls\":{\"server_name\":\"cdn-update-check.example\",\"version\":\"1.3\",\"client\":{\"ja3\":\"72a589da586844d7f0818ce684948eea\"}},\"threat\":{\"indicator\":{\"type\":\"malicious\",\"confidence\":93,\"provider\":\"HiveArmor curated intel\",\"marking\":{\"tlp\":\"amber\"},\"ip_reputation\":{\"score\":93,\"category\":\"command-and-control\",\"source\":\"HiveArmor Intelligence\"}}},\"mitre\":{\"tactic\":{\"id\":\"TA0011\",\"name\":\"Command and Control\"},\"technique\":{\"id\":\"T1071.001\",\"name\":\"Web Protocols\"}},\"visibleBy\":[\"default\"]}"
append_document "$LOG_INDEX" "inv-evt-005" "{\"@timestamp\":\"${t5}\",\"event\":{\"id\":\"inv-evt-005\",\"category\":\"network\",\"type\":\"protocol\",\"action\":\"dns_query\",\"outcome\":\"success\"},\"host\":{\"name\":\"FIN-WKS-044\"},\"process\":{\"name\":\"powershell.exe\",\"pid\":4488},\"source\":{\"ip\":\"10.44.18.118\",\"port\":54018},\"destination\":{\"ip\":\"10.44.0.53\",\"port\":53},\"dns\":{\"question\":{\"name\":\"cdn-update-check.example\",\"type\":\"A\"},\"resolved_ip\":[\"198.51.100.42\"]},\"network\":{\"transport\":\"udp\",\"bytes\":164},\"mitre\":{\"tactic\":{\"id\":\"TA0011\",\"name\":\"Command and Control\"},\"technique\":{\"id\":\"T1071.004\",\"name\":\"DNS\"}},\"visibleBy\":[\"default\"]}"
append_document "$LOG_INDEX" "inv-evt-006" "{\"@timestamp\":\"${t6}\",\"event\":{\"id\":\"inv-evt-006\",\"category\":\"registry\",\"type\":\"creation\",\"action\":\"run_key_created\",\"outcome\":\"success\"},\"host\":{\"name\":\"FIN-WKS-044\"},\"user\":{\"name\":\"maya.chen\"},\"process\":{\"name\":\"reg.exe\",\"pid\":4520,\"parent\":{\"name\":\"powershell.exe\",\"pid\":4488}},\"registry\":{\"path\":\"HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\\\\TelemetryCache\"},\"mitre\":{\"tactic\":{\"id\":\"TA0003\",\"name\":\"Persistence\"},\"technique\":{\"id\":\"T1060\",\"name\":\"Registry Run Keys\"}},\"visibleBy\":[\"default\"]}"

append_document "$ALERT_INDEX" "$ALERT_ID" "{\"alertId\":\"${ALERT_ID}\",\"name\":\"Encoded PowerShell established persistence and contacted new infrastructure\",\"title\":\"Encoded PowerShell established persistence and contacted new infrastructure\",\"description\":\"A finance workstation opened a macro document, launched encoded PowerShell, wrote an unsigned payload, contacted a low-prevalence destination, and established Run-key persistence.\",\"severity\":10,\"riskScore\":96,\"confidence\":94,\"status\":2,\"category\":\"endpoint\",\"rule\":{\"id\":\"rule-e2e-investigation-rich\",\"name\":\"Encoded script with persistence and outbound callback\",\"description\":\"Correlates encoded PowerShell, payload creation, network callback, and persistence.\"},\"mitre\":{\"tactic\":{\"id\":\"TA0002\",\"name\":\"Execution\"},\"technique\":{\"id\":\"T1059.001\",\"name\":\"PowerShell\"}},\"entities\":[{\"id\":\"entity-host-fin-wks-044\",\"type\":\"host\",\"value\":\"FIN-WKS-044\"},{\"id\":\"entity-ip-198-51-100-42\",\"type\":\"ip\",\"value\":\"198.51.100.42\"}],\"sourceEvents\":[\"inv-evt-001\",\"inv-evt-002\",\"inv-evt-003\",\"inv-evt-004\",\"inv-evt-005\",\"inv-evt-006\"],\"tags\":[\"e2e-investigation\",\"authorized-simulation\"],\"dataSources\":[\"Windows EDR\",\"DNS\",\"Firewall\"],\"detectedAt\":\"${detected_at}\",\"@timestamp\":\"${detected_at}\",\"updatedAt\":\"${detected_at}\",\"visibleBy\":[\"default\"]}"

curl_options=(-sS -u "$OS_CREDS" -H "Content-Type: application/x-ndjson")
if [[ "$OPENSEARCH_URL" == https://* ]]; then
  curl_options+=(-k)
fi

response=$(curl "${curl_options[@]}" -X POST --data-binary "@${bulk_file}" "${OPENSEARCH_URL}/_bulk?refresh=wait_for")
if command -v jq >/dev/null 2>&1; then
  if [[ "$(printf '%s' "$response" | jq -r '.errors')" != "false" ]]; then
    printf '%s\n' "$response" | jq '.items[] | select(.index.error != null)'
    exit 1
  fi
fi

printf 'Indexed rich investigation alert %s with 6 linked events into %s and %s\n' \
  "$ALERT_ID" "$ALERT_INDEX" "$LOG_INDEX"
