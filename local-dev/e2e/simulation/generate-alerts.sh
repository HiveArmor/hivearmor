#!/usr/bin/env bash
# generate-alerts.sh — Generates 5 simulated alerts and bulk-indexes them to OpenSearch
# Part of HiveArmor E2E Pipeline Integration Test (Sprint 50) — Simulation Mode
#
# Usage:
#   ./generate-alerts.sh [--date=YYYY.MM.DD] [--opensearch-url=URL]
#
# Options:
#   --date=YYYY.MM.DD       Override the index date (default: 2026.08.20)
#   --opensearch-url=URL    Override OpenSearch URL (default: auto-detect https then http)
#   --help                  Show this help message
#
# Behavior:
#   1. Generates 5 simulated alerts as JSON documents
#   2. Bulk indexes them to v3-hive-alert-YYYY.MM.DD
#   3. Verifies document count ≥5
#
# Exit codes:
#   0 — success
#   1 — failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values — use today's date for the index so timestamps match
INDEX_DATE=$(date -u +"%Y.%m.%d")
OPENSEARCH_URL=""
EXPECTED_COUNT=5

###############################################################################
# Argument parsing
###############################################################################
show_help() {
    sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
    exit 0
}

for arg in "$@"; do
    case "$arg" in
        --date=*)
            INDEX_DATE="${arg#--date=}"
            ;;
        --opensearch-url=*)
            OPENSEARCH_URL="${arg#--opensearch-url=}"
            ;;
        --help|-h)
            show_help
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

###############################################################################
# Utility: check if jq is available
###############################################################################
HAS_JQ=false
if command -v jq &>/dev/null; then
    HAS_JQ=true
fi

###############################################################################
# Auto-detect OpenSearch URL (try HTTPS first, then HTTP)
###############################################################################
detect_opensearch_url() {
    local creds="admin:LocalDev@2024!"

    # Try HTTPS first (with -k for self-signed certs)
    if curl -sk -u "$creds" --connect-timeout 3 "https://localhost:9200/_cluster/health" &>/dev/null; then
        echo "https://localhost:9200"
        return
    fi

    # Fall back to HTTP
    if curl -s -u "$creds" --connect-timeout 3 "http://localhost:9200/_cluster/health" &>/dev/null; then
        echo "http://localhost:9200"
        return
    fi

    echo ""
}

if [[ -z "$OPENSEARCH_URL" ]]; then
    OPENSEARCH_URL=$(detect_opensearch_url)
    if [[ -z "$OPENSEARCH_URL" ]]; then
        echo "ERROR: Cannot connect to OpenSearch at localhost:9200 (tried HTTPS and HTTP)" >&2
        echo "Make sure OpenSearch is running: cd local-dev && docker compose up -d" >&2
        exit 1
    fi
fi

echo "OpenSearch URL: ${OPENSEARCH_URL}"

# Credentials for OpenSearch
OS_CREDS="admin:LocalDev@2024!"

# Curl options based on protocol
CURL_OPTS=(-s -u "$OS_CREDS")
if [[ "$OPENSEARCH_URL" == https://* ]]; then
    CURL_OPTS+=(-k)
fi

INDEX_NAME="v3-hive-alert-${INDEX_DATE}"
echo "Target index: ${INDEX_NAME}"

###############################################################################
# Generate 5 simulated alerts as JSON
# Schema notes:
#   - severity: numeric integer (9=critical, 7-8=high, 4-6=medium, 1-3=low, 0=info)
#   - status: numeric integer (2=Open, 3=In Progress, 4=Escalated, 5=Closed)
#   - mitre: nested object with tactic, technique, name fields (passthrough)
#   - name: alert name field (used by some DTOs)
#   - entities[]: array of {id, type, value}
#   - @timestamp: must be within the last 24h for severity board to pick it up
###############################################################################
generate_alerts() {
    local bulk_file
    bulk_file=$(mktemp /tmp/e2e-alerts-bulk-XXXXXXXX)
    mv "$bulk_file" "${bulk_file}.ndjson"
    bulk_file="${bulk_file}.ndjson"

    local action_line="{\"index\":{\"_index\":\"${INDEX_NAME}\",\"_id\":\"ALERT_ID_PLACEHOLDER\"}}"

    # Generate timestamps relative to "now" so the severity board picks them up
    # The severity board uses a 24h lookback window
    local now_epoch
    now_epoch=$(date +%s)
    local ts_base=$((now_epoch - 3600))  # 1 hour ago

    local ts1 ts2 ts3 ts4 ts5
    ts1=$(date -u -r $((ts_base - 600)) +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "@$((ts_base - 600))" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    ts2=$(date -u -r $((ts_base - 480)) +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "@$((ts_base - 480))" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    ts3=$(date -u -r $((ts_base - 360)) +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "@$((ts_base - 360))" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    ts4=$(date -u -r $((ts_base - 240)) +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "@$((ts_base - 240))" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)
    ts5=$(date -u -r $((ts_base))       +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u -d "@$((ts_base))"       +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null)

    # Fallback if neither date format worked (use fixed recent timestamps)
    if [[ -z "$ts1" ]]; then
        ts1="2026-08-20T14:30:00.000Z"
        ts2="2026-08-20T14:33:30.000Z"
        ts3="2026-08-20T14:37:30.000Z"
        ts4="2026-08-20T14:35:30.000Z"
        ts5="2026-08-20T15:30:00.000Z"
    fi

    # -------------------------------------------------------------------------
    # Alert 1: Brute Force Login (severity 7 = high)
    # -------------------------------------------------------------------------
    local alert1_id="e2e-alert-brute-force-001"
    echo "${action_line//ALERT_ID_PLACEHOLDER/$alert1_id}" >> "$bulk_file"
    printf '{"alertId":"e2e-alert-brute-force-001","name":"Brute Force Login: 203.0.113.45 → 10.1.10.12","title":"Brute Force Login: 203.0.113.45 → 10.1.10.12","description":"8 failed login attempts from 203.0.113.45 in 10 minutes targeting ENG-SRV-012","severity":7,"severityLabel":"High","riskScore":75,"status":2,"statusLabel":"Open","category":"credential-access","rule":{"id":"rule-brute-force-login","name":"Brute Force Login Attempt"},"mitre":{"tactic":"Credential Access","technique":"T1110","name":"Brute Force"},"entities":[{"id":"ent-ip-203-0-113-45","type":"ip","value":"203.0.113.45"},{"id":"ent-ip-10-1-10-12","type":"ip","value":"10.1.10.12"},{"id":"ent-user-root","type":"user","value":"root"},{"id":"ent-host-eng-srv-012","type":"host","value":"ENG-SRV-012"}],"sourceEvents":["evt-auth-001","evt-auth-002","evt-auth-003","evt-auth-004","evt-auth-005","evt-auth-006","evt-auth-007","evt-auth-008"],"firstEventTime":"%s","lastEventTime":"%s","detectedAt":"%s","@timestamp":"%s","visibleBy":["default"]}\n' "$ts1" "$ts1" "$ts1" "$ts1" >> "$bulk_file"

    # -------------------------------------------------------------------------
    # Alert 2: Encoded PowerShell Execution (severity 9 = critical)
    # -------------------------------------------------------------------------
    local alert2_id="e2e-alert-encoded-powershell-001"
    echo "${action_line//ALERT_ID_PLACEHOLDER/$alert2_id}" >> "$bulk_file"
    printf '{"alertId":"e2e-alert-encoded-powershell-001","name":"Encoded PowerShell Execution: FIN-WKS-044","title":"Encoded PowerShell Execution: FIN-WKS-044","description":"PowerShell with encoded command detected on FIN-WKS-044 by carlos.rodriguez","severity":9,"severityLabel":"Critical","riskScore":90,"status":2,"statusLabel":"Open","category":"execution","rule":{"id":"rule-encoded-powershell","name":"Encoded PowerShell Execution"},"mitre":{"tactic":"Execution","technique":"T1059.001","name":"Command and Scripting Interpreter: PowerShell"},"entities":[{"id":"ent-host-fin-wks-044","type":"host","value":"FIN-WKS-044"},{"id":"ent-user-carlos-rodriguez","type":"user","value":"carlos.rodriguez"},{"id":"ent-ip-10-1-5-44","type":"ip","value":"10.1.5.44"}],"sourceEvents":["evt-proc-001","evt-proc-002"],"firstEventTime":"%s","lastEventTime":"%s","detectedAt":"%s","@timestamp":"%s","visibleBy":["default"]}\n' "$ts2" "$ts2" "$ts2" "$ts2" >> "$bulk_file"

    # -------------------------------------------------------------------------
    # Alert 3: Lateral Movement via SMB (severity 8 = high)
    # -------------------------------------------------------------------------
    local alert3_id="e2e-alert-lateral-movement-001"
    echo "${action_line//ALERT_ID_PLACEHOLDER/$alert3_id}" >> "$bulk_file"
    printf '{"alertId":"e2e-alert-lateral-movement-001","name":"Lateral Movement via SMB: 10.1.5.44 → 10.1.10.12","title":"Lateral Movement via SMB: 10.1.5.44 → 10.1.10.12","description":"Authentication followed by SMB connection from 10.1.5.44 to 10.1.10.12 within 5 minutes","severity":8,"severityLabel":"High","riskScore":80,"status":2,"statusLabel":"Open","category":"lateral-movement","rule":{"id":"rule-lateral-movement-smb","name":"Lateral Movement via SMB"},"mitre":{"tactic":"Lateral Movement","technique":"T1021.002","name":"Remote Services: SMB/Windows Admin Shares"},"entities":[{"id":"ent-ip-10-1-5-44","type":"ip","value":"10.1.5.44"},{"id":"ent-host-fin-wks-044","type":"host","value":"FIN-WKS-044"},{"id":"ent-host-eng-srv-012","type":"host","value":"ENG-SRV-012"}],"sourceEvents":["evt-auth-009","evt-net-001"],"firstEventTime":"%s","lastEventTime":"%s","detectedAt":"%s","@timestamp":"%s","visibleBy":["default"]}\n' "$ts3" "$ts3" "$ts3" "$ts3" >> "$bulk_file"

    # -------------------------------------------------------------------------
    # Alert 4: DNS Tunneling Detected (severity 5 = medium)
    # -------------------------------------------------------------------------
    local alert4_id="e2e-alert-dns-tunneling-001"
    echo "${action_line//ALERT_ID_PLACEHOLDER/$alert4_id}" >> "$bulk_file"
    printf '{"alertId":"e2e-alert-dns-tunneling-001","name":"DNS Tunneling Detected: 10.1.5.44 → cdn-update.xyz","title":"DNS Tunneling Detected: 10.1.5.44 → cdn-update.xyz","description":"55 DNS queries to cdn-update.xyz from 10.1.5.44 in 5 minutes","severity":5,"severityLabel":"Medium","riskScore":55,"status":2,"statusLabel":"Open","category":"command-and-control","rule":{"id":"rule-dns-tunneling","name":"DNS Tunneling Detected"},"mitre":{"tactic":"Command and Control","technique":"T1071.004","name":"Application Layer Protocol: DNS"},"entities":[{"id":"ent-host-fin-wks-044","type":"host","value":"FIN-WKS-044"},{"id":"ent-ip-10-1-5-44","type":"ip","value":"10.1.5.44"},{"id":"ent-domain-cdn-update-xyz","type":"domain","value":"cdn-update.xyz"}],"sourceEvents":["evt-dns-001","evt-dns-002","evt-dns-003","evt-dns-004","evt-dns-005"],"firstEventTime":"%s","lastEventTime":"%s","detectedAt":"%s","@timestamp":"%s","visibleBy":["default"]}\n' "$ts4" "$ts4" "$ts4" "$ts4" >> "$bulk_file"

    # -------------------------------------------------------------------------
    # Alert 5: Data Exfiltration (severity 10 = critical)
    # -------------------------------------------------------------------------
    local alert5_id="e2e-alert-exfiltration-001"
    echo "${action_line//ALERT_ID_PLACEHOLDER/$alert5_id}" >> "$bulk_file"
    printf '{"alertId":"e2e-alert-exfiltration-001","name":"Data Exfiltration: 10.1.5.44 → 203.0.113.88","title":"Data Exfiltration: 10.1.5.44 → 203.0.113.88","description":"157286400 bytes transferred from 10.1.5.44 to 203.0.113.88 in 1 hour","severity":10,"severityLabel":"Critical","riskScore":95,"status":2,"statusLabel":"Open","category":"exfiltration","rule":{"id":"rule-data-exfiltration","name":"Data Exfiltration Detected"},"mitre":{"tactic":"Exfiltration","technique":"T1048","name":"Exfiltration Over Alternative Protocol"},"entities":[{"id":"ent-host-fin-wks-044","type":"host","value":"FIN-WKS-044"},{"id":"ent-ip-203-0-113-88","type":"ip","value":"203.0.113.88"},{"id":"ent-ip-10-1-5-44","type":"ip","value":"10.1.5.44"}],"sourceEvents":["evt-net-010","evt-net-011","evt-net-012","evt-net-013","evt-net-014"],"firstEventTime":"%s","lastEventTime":"%s","detectedAt":"%s","@timestamp":"%s","visibleBy":["default"]}\n' "$ts5" "$ts5" "$ts5" "$ts5" >> "$bulk_file"

    # Bulk API requires trailing newline
    echo "" >> "$bulk_file"

    echo "$bulk_file"
}

###############################################################################
# Index alerts via bulk API
###############################################################################
index_alerts() {
    local bulk_file="$1"

    local bulk_size
    bulk_size=$(wc -c < "$bulk_file" | tr -d ' ')
    echo "Bulk request body size: $(( bulk_size / 1024 )) KB"

    local response
    local curl_exit=0
    response=$(curl "${CURL_OPTS[@]}" \
        -X POST \
        -H "Content-Type: application/x-ndjson" \
        --data-binary "@${bulk_file}" \
        "${OPENSEARCH_URL}/_bulk" 2>&1) || curl_exit=$?

    if [[ $curl_exit -ne 0 ]]; then
        echo "ERROR: curl failed with exit code ${curl_exit}" >&2
        echo "  Could not reach OpenSearch at ${OPENSEARCH_URL}" >&2
        return 1
    fi

    # Check if response is valid
    if [[ -z "$response" ]]; then
        echo "ERROR: Empty response from OpenSearch bulk API" >&2
        return 1
    fi

    # Parse response
    if [[ "$HAS_JQ" == "true" ]]; then
        local has_errors
        has_errors=$(echo "$response" | jq -r '.errors // false' 2>/dev/null)
        local item_count
        item_count=$(echo "$response" | jq -r '.items | length // 0' 2>/dev/null)

        if [[ "$has_errors" == "true" ]]; then
            local error_count
            error_count=$(echo "$response" | jq '[.items[] | select(.index.error != null)] | length' 2>/dev/null)
            local indexed=$((item_count - error_count))

            echo "WARNING: ${error_count} alerts had errors during indexing" >&2

            # Show first error for debugging
            local first_error
            first_error=$(echo "$response" | jq -r '[.items[] | select(.index.error != null)][0].index.error.reason // "unknown"' 2>/dev/null)
            echo "  First error: ${first_error}" >&2

            if [[ $indexed -eq 0 ]]; then
                echo "ERROR: All alerts failed to index" >&2
                return 1
            fi

            echo "Indexed ${indexed}/${item_count} alerts (${error_count} errors)"
        else
            echo "Successfully indexed ${item_count} alerts"
        fi
    else
        # Fallback without jq
        if echo "$response" | grep -q '"errors":true'; then
            echo "WARNING: Some alerts had errors during bulk indexing" >&2
            if echo "$response" | grep -q '"status":4[0-9][0-9]'; then
                echo "ERROR: Bulk indexing failed" >&2
                return 1
            fi
            echo "Bulk indexing completed with some errors"
        elif echo "$response" | grep -q '"errors":false'; then
            echo "Successfully indexed all alerts"
        else
            echo "WARNING: Could not parse bulk response" >&2
            echo "  Response (first 500 chars): ${response:0:500}" >&2
            return 1
        fi
    fi

    return 0
}

###############################################################################
# Verify alert count
###############################################################################
verify_count() {
    echo ""
    echo "Verifying alert count..."

    # Wait a moment for OpenSearch to refresh
    sleep 1

    # Force refresh the index
    curl "${CURL_OPTS[@]}" -X POST "${OPENSEARCH_URL}/${INDEX_NAME}/_refresh" &>/dev/null || true

    local count_response
    count_response=$(curl "${CURL_OPTS[@]}" -X GET "${OPENSEARCH_URL}/v3-hive-alert-*/_count" 2>&1)

    local count=0
    if [[ "$HAS_JQ" == "true" ]]; then
        count=$(echo "$count_response" | jq -r '.count // 0' 2>/dev/null)
    else
        count=$(echo "$count_response" | sed -E 's/.*"count"\s*:\s*([0-9]+).*/\1/' | head -1)
    fi

    if [[ -z "$count" ]]; then
        count=0
    fi

    echo "Alert count in v3-hive-alert-*: ${count}"

    if [[ "$count" -ge "$EXPECTED_COUNT" ]]; then
        echo "✓ Verification passed: ${count} alerts indexed (expected ≥${EXPECTED_COUNT})"
        return 0
    else
        echo "✗ Verification failed: expected ≥${EXPECTED_COUNT} alerts, got ${count}" >&2
        return 1
    fi
}

###############################################################################
# Main execution
###############################################################################
main() {
    echo "=== HiveArmor E2E Alert Generation (Simulation Mode) ==="
    echo ""

    # Generate alerts and get bulk file path
    echo "Generating 5 simulated alerts..."
    local bulk_file
    bulk_file=$(generate_alerts)
    trap "rm -f '$bulk_file'" EXIT

    echo "Indexing alerts to ${INDEX_NAME}..."
    if ! index_alerts "$bulk_file"; then
        echo ""
        echo "=== Alert Generation Failed ==="
        exit 1
    fi

    # Verify
    if verify_count; then
        echo ""
        echo "=== Alert Generation Complete ==="
        exit 0
    else
        echo ""
        echo "=== Alert Generation Complete (with warnings) ==="
        exit 1
    fi
}

main
