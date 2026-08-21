#!/usr/bin/env bash
# generate-findings.sh — Generates a correlated finding and bulk-indexes it to OpenSearch
# Part of HiveArmor E2E Pipeline Integration Test (Sprint 50) — Simulation Mode
#
# Usage:
#   ./generate-findings.sh [--date=YYYY.MM.DD] [--opensearch-url=URL]
#
# Options:
#   --date=YYYY.MM.DD       Override the index date (default: 2026.08.20)
#   --opensearch-url=URL    Override OpenSearch URL (default: auto-detect https then http)
#   --help                  Show this help message
#
# Behavior:
#   1. Generates a correlated attack chain finding as a JSON document
#   2. Bulk indexes it to v3-hive-correlation-YYYY.MM.DD
#   3. Verifies document count ≥1
#
# Exit codes:
#   0 — success
#   1 — failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
INDEX_DATE="2026.08.20"
OPENSEARCH_URL=""
EXPECTED_COUNT=1

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

INDEX_NAME="v3-hive-correlation-${INDEX_DATE}"
echo "Target index: ${INDEX_NAME}"

###############################################################################
# Generate correlated finding as JSON
###############################################################################
generate_findings() {
    local bulk_file
    bulk_file=$(mktemp /tmp/e2e-findings-bulk-XXXXXXXX)
    mv "$bulk_file" "${bulk_file}.ndjson"
    bulk_file="${bulk_file}.ndjson"

    # -------------------------------------------------------------------------
    # Finding 1: Multi-Stage Attack Chain
    # Links: brute-force → lateral-movement → exfiltration alerts
    # -------------------------------------------------------------------------
    local finding_id="e2e-finding-attack-chain-001"
    echo "{\"index\":{\"_index\":\"${INDEX_NAME}\",\"_id\":\"${finding_id}\"}}" >> "$bulk_file"
    cat >> "$bulk_file" <<'FINDING1'
{"findingId":"e2e-finding-attack-chain-001","title":"Multi-Stage Attack: Credential Access → Lateral Movement → Exfiltration","description":"Correlated attack sequence starting with brute force on ENG-SRV-012, lateral movement to FIN-WKS-044 via SMB, followed by data exfiltration to 203.0.113.88","severity":"critical","confidence":0.87,"alerts":[{"id":"e2e-alert-brute-force-001","title":"Brute Force Login","severity":"high"},{"id":"e2e-alert-lateral-movement-001","title":"Lateral Movement via SMB","severity":"high"},{"id":"e2e-alert-exfiltration-001","title":"Data Exfiltration","severity":"critical"}],"entities":[{"id":"ent-ip-203-0-113-45","type":"ip","value":"203.0.113.45","role":"attacker"},{"id":"ent-host-eng-srv-012","type":"host","value":"ENG-SRV-012","role":"initial_access"},{"id":"ent-host-fin-wks-044","type":"host","value":"FIN-WKS-044","role":"target"},{"id":"ent-ip-203-0-113-88","type":"ip","value":"203.0.113.88","role":"c2_exfil"}],"timeline":[{"timestamp":"2026-08-20T14:20:00.000Z","stage":"Initial Access","description":"Brute force SSH login attempts on ENG-SRV-012"},{"timestamp":"2026-08-20T14:30:00.000Z","stage":"Credential Access","description":"Successful login after 8 failed attempts"},{"timestamp":"2026-08-20T14:35:00.000Z","stage":"Lateral Movement","description":"SMB connection from ENG-SRV-012 to FIN-WKS-044 (ADMIN$ share)"},{"timestamp":"2026-08-20T14:40:00.000Z","stage":"Execution","description":"Encoded PowerShell execution on FIN-WKS-044"},{"timestamp":"2026-08-20T14:45:00.000Z","stage":"Exfiltration","description":"150MB transferred to 203.0.113.88 over HTTPS"}],"mitreTactics":["Credential Access","Lateral Movement","Execution","Exfiltration"],"visibleBy":["default"],"@timestamp":"2026-08-20T15:00:00.000Z"}
FINDING1

    # Bulk API requires trailing newline
    echo "" >> "$bulk_file"

    echo "$bulk_file"
}

###############################################################################
# Index findings via bulk API
###############################################################################
index_findings() {
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

            echo "WARNING: ${error_count} findings had errors during indexing" >&2

            # Show first error for debugging
            local first_error
            first_error=$(echo "$response" | jq -r '[.items[] | select(.index.error != null)][0].index.error.reason // "unknown"' 2>/dev/null)
            echo "  First error: ${first_error}" >&2

            if [[ $indexed -eq 0 ]]; then
                echo "ERROR: All findings failed to index" >&2
                return 1
            fi

            echo "Indexed ${indexed}/${item_count} findings (${error_count} errors)"
        else
            echo "Successfully indexed ${item_count} findings"
        fi
    else
        # Fallback without jq
        if echo "$response" | grep -q '"errors":true'; then
            echo "WARNING: Some findings had errors during bulk indexing" >&2
            if echo "$response" | grep -q '"status":4[0-9][0-9]'; then
                echo "ERROR: Bulk indexing failed" >&2
                return 1
            fi
            echo "Bulk indexing completed with some errors"
        elif echo "$response" | grep -q '"errors":false'; then
            echo "Successfully indexed all findings"
        else
            echo "WARNING: Could not parse bulk response" >&2
            echo "  Response (first 500 chars): ${response:0:500}" >&2
            return 1
        fi
    fi

    return 0
}

###############################################################################
# Verify finding count
###############################################################################
verify_count() {
    echo ""
    echo "Verifying finding count..."

    # Wait a moment for OpenSearch to refresh
    sleep 1

    # Force refresh the index
    curl "${CURL_OPTS[@]}" -X POST "${OPENSEARCH_URL}/${INDEX_NAME}/_refresh" &>/dev/null || true

    local count_response
    count_response=$(curl "${CURL_OPTS[@]}" -X GET "${OPENSEARCH_URL}/v3-hive-correlation-*/_count" 2>&1)

    local count=0
    if [[ "$HAS_JQ" == "true" ]]; then
        count=$(echo "$count_response" | jq -r '.count // 0' 2>/dev/null)
    else
        count=$(echo "$count_response" | sed -E 's/.*"count"\s*:\s*([0-9]+).*/\1/' | head -1)
    fi

    if [[ -z "$count" ]]; then
        count=0
    fi

    echo "Finding count in v3-hive-correlation-*: ${count}"

    if [[ "$count" -ge "$EXPECTED_COUNT" ]]; then
        echo "✓ Verification passed: ${count} findings indexed (expected ≥${EXPECTED_COUNT})"
        return 0
    else
        echo "✗ Verification failed: expected ≥${EXPECTED_COUNT} findings, got ${count}" >&2
        return 1
    fi
}

###############################################################################
# Main execution
###############################################################################
main() {
    echo "=== HiveArmor E2E Finding Generation (Simulation Mode) ==="
    echo ""

    # Generate findings and get bulk file path
    echo "Generating correlated attack chain finding..."
    local bulk_file
    bulk_file=$(generate_findings)
    trap "rm -f '$bulk_file'" EXIT

    echo ""
    echo "Indexing findings to ${INDEX_NAME}..."
    if ! index_findings "$bulk_file"; then
        echo ""
        echo "=== Finding Generation Failed ==="
        exit 1
    fi

    # Verify
    if verify_count; then
        echo ""
        echo "=== Finding Generation Complete ==="
        exit 0
    else
        echo ""
        echo "=== Finding Generation Complete (with warnings) ==="
        exit 1
    fi
}

main
