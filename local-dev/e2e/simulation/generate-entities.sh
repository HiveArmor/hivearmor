#!/usr/bin/env bash
# generate-entities.sh — Generates 30+ entity documents and bulk-indexes them to OpenSearch
# Part of HiveArmor E2E Pipeline Integration Test (Sprint 50) — Simulation Mode
#
# Usage:
#   ./generate-entities.sh [--date=YYYY.MM.DD] [--opensearch-url=URL]
#
# Options:
#   --date=YYYY.MM.DD       Override the index date (default: 2026.08.20)
#   --opensearch-url=URL    Override OpenSearch URL (default: auto-detect https then http)
#   --help                  Show this help message
#
# Behavior:
#   1. Generates 30+ entity documents (hosts, users, IPs)
#   2. Bulk indexes them to v3-hive-entity-YYYY.MM.DD
#   3. Verifies document count ≥30
#
# Exit codes:
#   0 — success
#   1 — failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default values
INDEX_DATE="2026.08.20"
OPENSEARCH_URL=""
EXPECTED_COUNT=30

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

INDEX_NAME="v3-hive-entity-${INDEX_DATE}"
echo "Target index: ${INDEX_NAME}"

###############################################################################
# Generate entity documents
###############################################################################
generate_entities() {
    local bulk_file
    bulk_file=$(mktemp /tmp/e2e-entities-bulk-XXXXXXXX)
    mv "$bulk_file" "${bulk_file}.ndjson"
    bulk_file="${bulk_file}.ndjson"

    # Helper: add an entity to the bulk file
    # Args: entityId, type, value, displayName, eventCount, alertCount, riskScore, riskLevel
    add_entity() {
        local entity_id="$1"
        local etype="$2"
        local value="$3"
        local display_name="$4"
        local event_count="$5"
        local alert_count="$6"
        local risk_score="$7"
        local risk_level="$8"

        echo "{\"index\":{\"_index\":\"${INDEX_NAME}\",\"_id\":\"${entity_id}\"}}" >> "$bulk_file"
        printf '{"entityId":"%s","type":"%s","value":"%s","displayName":"%s","firstSeen":"2026-08-20T14:00:00.000Z","lastSeen":"2026-08-20T15:55:00.000Z","eventCount":%d,"alertCount":%d,"riskScore":%d,"riskLevel":"%s","visibleBy":["default"],"@timestamp":"2026-08-20T15:55:00.000Z"}\n' \
            "$entity_id" "$etype" "$value" "$display_name" "$event_count" "$alert_count" "$risk_score" "$risk_level" >> "$bulk_file"
    }

    # =========================================================================
    # HOST ENTITIES (~15)
    # =========================================================================
    echo "  Generating host entities..." >&2

    # Critical: appears in critical-severity alert
    add_entity "ent-host-fin-wks-044" "host" "FIN-WKS-044" "Finance Workstation 044" 45 3 92 "critical"

    # High: appears in high-severity alert
    add_entity "ent-host-eng-srv-012" "host" "ENG-SRV-012" "Engineering Server 012" 30 2 72 "high"

    # Medium: appears in medium-severity alert
    add_entity "ent-host-dc-001" "host" "DC-001" "Domain Controller 001" 18 1 48 "medium"

    # Low: no alert association
    add_entity "ent-host-fw-edge-01" "host" "FW-EDGE-01" "Firewall Edge 01" 22 0 15 "low"
    add_entity "ent-host-dns-int-01" "host" "DNS-INT-01" "DNS Internal 01" 20 0 12 "low"
    add_entity "ent-host-hr-wks-001" "host" "HR-WKS-001" "HR Workstation 001" 8 0 10 "low"
    add_entity "ent-host-mkt-wks-002" "host" "MKT-WKS-002" "Marketing Workstation 002" 6 0 10 "low"
    add_entity "ent-host-web-srv-01" "host" "WEB-SRV-01" "Web Server 01" 15 0 18 "low"
    add_entity "ent-host-db-srv-01" "host" "DB-SRV-01" "Database Server 01" 12 0 20 "low"
    add_entity "ent-host-mail-srv-01" "host" "MAIL-SRV-01" "Mail Server 01" 10 0 14 "low"
    add_entity "ent-host-backup-srv-01" "host" "BACKUP-SRV-01" "Backup Server 01" 8 0 11 "low"
    add_entity "ent-host-vpn-gw-01" "host" "VPN-GW-01" "VPN Gateway 01" 14 0 16 "low"
    add_entity "ent-host-ids-sen-01" "host" "IDS-SEN-01" "IDS Sensor 01" 12 0 13 "low"
    add_entity "ent-host-proxy-01" "host" "PROXY-01" "Proxy Server 01" 10 0 15 "low"
    add_entity "ent-host-dev-srv-001" "host" "DEV-SRV-001" "Development Server 001" 9 0 12 "low"

    # =========================================================================
    # USER ENTITIES (~10)
    # =========================================================================
    echo "  Generating user entities..." >&2

    # Critical: appears in critical-severity alert
    add_entity "ent-user-carlos-rodriguez" "user" "carlos.rodriguez" "Carlos Rodriguez" 35 3 88 "critical"

    # High: appears in high-severity alert
    add_entity "ent-user-root" "user" "root" "Root Account" 20 2 70 "high"

    # Medium: moderate activity
    add_entity "ent-user-admin" "user" "admin" "Administrator" 15 1 45 "medium"

    # Low: no alert association
    add_entity "ent-user-svc-backup" "user" "svc-backup" "Service Account: Backup" 10 0 15 "low"
    add_entity "ent-user-j-martinez" "user" "j.martinez" "J Martinez" 8 0 12 "low"
    add_entity "ent-user-s-patel" "user" "s.patel" "S Patel" 7 0 10 "low"
    add_entity "ent-user-m-chen" "user" "m.chen" "M Chen" 6 0 10 "low"
    add_entity "ent-user-a-johnson" "user" "a.johnson" "A Johnson" 5 0 10 "low"
    add_entity "ent-user-t-williams" "user" "t.williams" "T Williams" 5 0 10 "low"
    add_entity "ent-user-svc-monitor" "user" "svc-monitor" "Service Account: Monitor" 12 0 14 "low"

    # =========================================================================
    # IP ENTITIES (~15)
    # =========================================================================
    echo "  Generating IP entities..." >&2

    # Critical: appears in critical-severity alert
    add_entity "ent-ip-10-1-5-44" "ip" "10.1.5.44" "Internal: 10.1.5.44" 40 4 93 "critical"
    add_entity "ent-ip-203-0-113-88" "ip" "203.0.113.88" "External: 203.0.113.88" 20 2 89 "critical"

    # High: appears in high-severity alert
    add_entity "ent-ip-203-0-113-45" "ip" "203.0.113.45" "External: 203.0.113.45" 25 1 68 "high"
    add_entity "ent-ip-10-1-10-12" "ip" "10.1.10.12" "Internal: 10.1.10.12" 22 2 65 "high"

    # Medium: moderate activity
    add_entity "ent-ip-10-1-1-53" "ip" "10.1.1.53" "Internal: 10.1.1.53" 15 1 42 "medium"

    # Low: no alert association
    add_entity "ent-ip-10-1-1-1" "ip" "10.1.1.1" "Internal: 10.1.1.1" 18 0 18 "low"
    add_entity "ent-ip-192-168-1-100" "ip" "192.168.1.100" "Internal: 192.168.1.100" 10 0 12 "low"
    add_entity "ent-ip-10-1-5-10" "ip" "10.1.5.10" "Internal: 10.1.5.10" 8 0 11 "low"
    add_entity "ent-ip-10-1-5-20" "ip" "10.1.5.20" "Internal: 10.1.5.20" 7 0 10 "low"
    add_entity "ent-ip-10-1-2-50" "ip" "10.1.2.50" "Internal: 10.1.2.50" 9 0 13 "low"
    add_entity "ent-ip-172-16-0-100" "ip" "172.16.0.100" "Internal: 172.16.0.100" 6 0 10 "low"
    add_entity "ent-ip-8-8-8-8" "ip" "8.8.8.8" "External: 8.8.8.8" 30 0 10 "low"
    add_entity "ent-ip-1-1-1-1" "ip" "1.1.1.1" "External: 1.1.1.1" 25 0 10 "low"
    add_entity "ent-ip-198-51-100-50" "ip" "198.51.100.50" "External: 198.51.100.50" 5 0 10 "low"

    # Bulk API requires trailing newline
    echo "" >> "$bulk_file"

    echo "$bulk_file"
}

###############################################################################
# Index entities via bulk API
###############################################################################
index_entities() {
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

            echo "WARNING: ${error_count} entities had errors during indexing" >&2

            # Show first error for debugging
            local first_error
            first_error=$(echo "$response" | jq -r '[.items[] | select(.index.error != null)][0].index.error.reason // "unknown"' 2>/dev/null)
            echo "  First error: ${first_error}" >&2

            if [[ $indexed -eq 0 ]]; then
                echo "ERROR: All entities failed to index" >&2
                return 1
            fi

            echo "Indexed ${indexed}/${item_count} entities (${error_count} errors)"
        else
            echo "Successfully indexed ${item_count} entities"
        fi
    else
        # Fallback without jq
        if echo "$response" | grep -q '"errors":true'; then
            echo "WARNING: Some entities had errors during bulk indexing" >&2
            if echo "$response" | grep -q '"status":4[0-9][0-9]'; then
                echo "ERROR: Bulk indexing failed" >&2
                return 1
            fi
            echo "Bulk indexing completed with some errors"
        elif echo "$response" | grep -q '"errors":false'; then
            echo "Successfully indexed all entities"
        else
            echo "WARNING: Could not parse bulk response" >&2
            echo "  Response (first 500 chars): ${response:0:500}" >&2
            return 1
        fi
    fi

    return 0
}

###############################################################################
# Verify entity count
###############################################################################
verify_count() {
    echo ""
    echo "Verifying entity count..."

    # Wait a moment for OpenSearch to refresh
    sleep 1

    # Force refresh the index
    curl "${CURL_OPTS[@]}" -X POST "${OPENSEARCH_URL}/${INDEX_NAME}/_refresh" &>/dev/null || true

    local count_response
    count_response=$(curl "${CURL_OPTS[@]}" -X GET "${OPENSEARCH_URL}/v3-hive-entity-*/_count" 2>&1)

    local count=0
    if [[ "$HAS_JQ" == "true" ]]; then
        count=$(echo "$count_response" | jq -r '.count // 0' 2>/dev/null)
    else
        count=$(echo "$count_response" | sed -E 's/.*"count"\s*:\s*([0-9]+).*/\1/' | head -1)
    fi

    if [[ -z "$count" ]]; then
        count=0
    fi

    echo "Entity count in v3-hive-entity-*: ${count}"

    if [[ "$count" -ge "$EXPECTED_COUNT" ]]; then
        echo "✓ Verification passed: ${count} entities indexed (expected ≥${EXPECTED_COUNT})"
        return 0
    else
        echo "✗ Verification failed: expected ≥${EXPECTED_COUNT} entities, got ${count}" >&2
        return 1
    fi
}

###############################################################################
# Main execution
###############################################################################
main() {
    echo "=== HiveArmor E2E Entity Generation (Simulation Mode) ==="
    echo ""

    # Generate entities and get bulk file path
    echo "Generating 39 simulated entities (15 hosts, 10 users, 14 IPs)..."
    local bulk_file
    bulk_file=$(generate_entities)
    trap "rm -f '$bulk_file'" EXIT

    echo ""
    echo "Indexing entities to ${INDEX_NAME}..."
    if ! index_entities "$bulk_file"; then
        echo ""
        echo "=== Entity Generation Failed ==="
        exit 1
    fi

    # Verify
    if verify_count; then
        echo ""
        echo "=== Entity Generation Complete ==="
        exit 0
    else
        echo ""
        echo "=== Entity Generation Complete (with warnings) ==="
        exit 1
    fi
}

main
