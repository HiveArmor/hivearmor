#!/usr/bin/env bash
# inject-events.sh — Reads NDJSON event files and bulk-indexes to OpenSearch
# DEPRECATED FOR DETECTION ACCEPTANCE: direct indexing bypasses collectors,
# normalization and rule evaluation. This remains a legacy UI dataset hydrator.
# Use ../tests/raw-log-alert-e2e.sh for detection acceptance.
# Part of HiveArmor E2E Pipeline Integration Test (Sprint 50)
#
# Usage:
#   ./inject-events.sh [--date=YYYY.MM.DD] [--opensearch-url=URL]
#
# Options:
#   --date=YYYY.MM.DD       Override the index date (default: extracted from first event)
#   --opensearch-url=URL    Override OpenSearch URL (default: auto-detect https then http)
#   --help                  Show this help message
#
# Behavior:
#   1. Reads NDJSON event files from local-dev/e2e/events/
#   2. Ensures all documents have visibleBy: ["default"]
#   3. Builds OpenSearch _bulk request body
#   4. Indexes to v3-hive-log-YYYY.MM.DD
#   5. Optionally attempts gRPC injection via agent-manager (falls back to direct bulk)
#   6. Verifies document count matches expected (500)
#
# Exit codes:
#   0 — success
#   1 — failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENTS_DIR="${SCRIPT_DIR}/events"

# Default values
INDEX_DATE=""
OPENSEARCH_URL=""
EXPECTED_COUNT=500

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
# Extract date from first event @timestamp if not provided
###############################################################################
extract_date_from_events() {
    local first_file=""
    for f in "${EVENTS_DIR}/windows-events.json" "${EVENTS_DIR}/linux-events.json" "${EVENTS_DIR}/network-events.json"; do
        if [[ -f "$f" && -s "$f" ]]; then
            first_file="$f"
            break
        fi
    done

    if [[ -z "$first_file" ]]; then
        echo "ERROR: No event files found in ${EVENTS_DIR}/" >&2
        exit 1
    fi

    local first_line
    first_line=$(head -1 "$first_file")

    if [[ "$HAS_JQ" == "true" ]]; then
        # Use jq to extract @timestamp
        local ts
        ts=$(echo "$first_line" | jq -r '.["@timestamp"]' 2>/dev/null)
        if [[ -n "$ts" && "$ts" != "null" ]]; then
            # Convert 2026-08-20T14:01:15.000Z → 2026.08.20
            echo "$ts" | sed -E 's/^([0-9]{4})-([0-9]{2})-([0-9]{2}).*/\1.\2.\3/'
            return
        fi
    fi

    # Fallback: sed-based extraction
    echo "$first_line" | sed -E 's/.*"@timestamp"\s*:\s*"([0-9]{4})-([0-9]{2})-([0-9]{2}).*/\1.\2.\3/' | head -1
}

if [[ -z "$INDEX_DATE" ]]; then
    INDEX_DATE=$(extract_date_from_events)
    if [[ -z "$INDEX_DATE" ]]; then
        echo "ERROR: Could not extract date from event files. Use --date=YYYY.MM.DD" >&2
        exit 1
    fi
fi

INDEX_NAME="v3-hive-log-${INDEX_DATE}"
echo "Target index: ${INDEX_NAME}"

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

###############################################################################
# Check if event files exist
###############################################################################
EVENT_FILES=(
    "${EVENTS_DIR}/windows-events.json"
    "${EVENTS_DIR}/linux-events.json"
    "${EVENTS_DIR}/network-events.json"
)

for f in "${EVENT_FILES[@]}"; do
    if [[ ! -f "$f" ]]; then
        echo "ERROR: Event file not found: $f" >&2
        echo "Run generate-events.sh first to create event files." >&2
        exit 1
    fi
done

###############################################################################
# Count total events
###############################################################################
TOTAL_EVENTS=0
for f in "${EVENT_FILES[@]}"; do
    count=$(wc -l < "$f" | tr -d ' ')
    TOTAL_EVENTS=$((TOTAL_EVENTS + count))
done

echo "Injecting ${TOTAL_EVENTS} events to ${INDEX_NAME}..."

###############################################################################
# gRPC injection attempt (optional — if agent-manager is reachable)
###############################################################################
try_grpc_injection() {
    # Check if agent-manager gRPC is reachable (default port 50051)
    if curl -s --connect-timeout 2 "http://localhost:50051" &>/dev/null 2>&1; then
        echo "Agent-manager detected at localhost:50051 — gRPC injection available"
        echo "(gRPC injection not implemented in this script — using direct OpenSearch bulk)"
        return 1
    fi
    return 1
}

###############################################################################
# Build bulk request body and inject via OpenSearch _bulk API
###############################################################################
inject_via_bulk_api() {
    local bulk_file
    bulk_file=$(mktemp /tmp/e2e-bulk-XXXXXXXX)
    mv "$bulk_file" "${bulk_file}.ndjson"
    bulk_file="${bulk_file}.ndjson"
    trap "rm -f '$bulk_file'" EXIT

    local action_line="{\"index\":{\"_index\":\"${INDEX_NAME}\"}}"

    for f in "${EVENT_FILES[@]}"; do
        while IFS= read -r line; do
            # Skip empty lines
            [[ -z "$line" ]] && continue

            # Ensure visibleBy field exists — add if missing
            if [[ "$HAS_JQ" == "true" ]]; then
                # Use jq to verify/add visibleBy
                line=$(echo "$line" | jq -c 'if .visibleBy == null then . + {"visibleBy": ["default"]} else . end' 2>/dev/null || echo "$line")
            else
                # Fallback: check if visibleBy is present via grep
                if ! echo "$line" | grep -q '"visibleBy"'; then
                    # Insert visibleBy before the closing brace
                    line="${line%\}},\"visibleBy\":[\"default\"]}"
                fi
            fi

            # Write action line + document line
            echo "$action_line" >> "$bulk_file"
            echo "$line" >> "$bulk_file"
        done < "$f"
    done

    # Bulk API requires trailing newline
    echo "" >> "$bulk_file"

    local bulk_size
    bulk_size=$(wc -c < "$bulk_file" | tr -d ' ')
    echo "Bulk request body size: $(( bulk_size / 1024 )) KB"

    # Send bulk request (split into chunks if >10MB to avoid timeouts)
    local max_chunk_bytes=10485760  # 10MB
    if [[ "$bulk_size" -gt "$max_chunk_bytes" ]]; then
        echo "Large payload — splitting into chunks..."
        inject_chunked "$bulk_file"
    else
        inject_single "$bulk_file"
    fi
}

###############################################################################
# Single bulk inject
###############################################################################
inject_single() {
    local bulk_file="$1"

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
        exit 1
    fi

    handle_bulk_response "$response"
}

###############################################################################
# Chunked bulk inject (for large payloads)
###############################################################################
inject_chunked() {
    local bulk_file="$1"
    local chunk_lines=1000  # 500 action+doc pairs per chunk
    local chunk_file
    chunk_file=$(mktemp /tmp/e2e-chunk-XXXXXXXX)
    mv "$chunk_file" "${chunk_file}.ndjson"
    chunk_file="${chunk_file}.ndjson"

    local total_errors=0
    local total_indexed=0
    local chunk_num=0
    local line_count=0

    > "$chunk_file"

    while IFS= read -r line; do
        echo "$line" >> "$chunk_file"
        line_count=$((line_count + 1))

        if [[ $line_count -ge $chunk_lines ]]; then
            chunk_num=$((chunk_num + 1))
            echo "" >> "$chunk_file"

            local response
            response=$(curl "${CURL_OPTS[@]}" \
                -X POST \
                -H "Content-Type: application/x-ndjson" \
                --data-binary "@${chunk_file}" \
                "${OPENSEARCH_URL}/_bulk" 2>&1)

            local chunk_result
            chunk_result=$(parse_bulk_response "$response")
            local indexed="${chunk_result%%:*}"
            local errors="${chunk_result##*:}"
            total_indexed=$((total_indexed + indexed))
            total_errors=$((total_errors + errors))

            > "$chunk_file"
            line_count=0
        fi
    done < "$bulk_file"

    # Flush remaining lines
    if [[ $line_count -gt 0 ]]; then
        echo "" >> "$chunk_file"
        local response
        response=$(curl "${CURL_OPTS[@]}" \
            -X POST \
            -H "Content-Type: application/x-ndjson" \
            --data-binary "@${chunk_file}" \
            "${OPENSEARCH_URL}/_bulk" 2>&1)

        local chunk_result
        chunk_result=$(parse_bulk_response "$response")
        local indexed="${chunk_result%%:*}"
        local errors="${chunk_result##*:}"
        total_indexed=$((total_indexed + indexed))
        total_errors=$((total_errors + errors))
    fi

    rm -f "$chunk_file"

    if [[ $total_errors -gt 0 ]]; then
        echo "ERROR: ${total_errors} documents failed to index" >&2
        return 1
    fi

    echo "Successfully indexed ${total_indexed} documents (in ${chunk_num} chunks)"
    return 0
}

###############################################################################
# Parse bulk response — returns "indexed:errors"
###############################################################################
parse_bulk_response() {
    local response="$1"

    if [[ "$HAS_JQ" == "true" ]]; then
        local has_errors
        has_errors=$(echo "$response" | jq -r '.errors // false' 2>/dev/null)
        local item_count
        item_count=$(echo "$response" | jq -r '.items | length' 2>/dev/null)

        if [[ "$has_errors" == "true" ]]; then
            local error_count
            error_count=$(echo "$response" | jq '[.items[] | select(.index.error != null)] | length' 2>/dev/null)
            local indexed=$((item_count - error_count))
            echo "${indexed}:${error_count}"
        else
            echo "${item_count}:0"
        fi
    else
        # Fallback: grep-based parsing
        if echo "$response" | grep -q '"errors":true'; then
            # Count error entries
            local error_count
            error_count=$(echo "$response" | grep -o '"error"' | wc -l | tr -d ' ')
            echo "0:${error_count}"
        elif echo "$response" | grep -q '"errors":false'; then
            echo "0:0"
        else
            echo "0:0"
        fi
    fi
}

###############################################################################
# Handle bulk response (for single inject)
###############################################################################
handle_bulk_response() {
    local response="$1"

    # Check if response is valid JSON
    if [[ -z "$response" ]]; then
        echo "ERROR: Empty response from OpenSearch bulk API" >&2
        exit 1
    fi

    if [[ "$HAS_JQ" == "true" ]]; then
        local has_errors
        has_errors=$(echo "$response" | jq -r '.errors // false' 2>/dev/null)
        local item_count
        item_count=$(echo "$response" | jq -r '.items | length // 0' 2>/dev/null)

        if [[ "$has_errors" == "true" ]]; then
            local error_count
            error_count=$(echo "$response" | jq '[.items[] | select(.index.error != null)] | length' 2>/dev/null)
            local indexed=$((item_count - error_count))

            echo "WARNING: ${error_count} documents had errors during indexing" >&2

            # Show first error for debugging
            local first_error
            first_error=$(echo "$response" | jq -r '[.items[] | select(.index.error != null)][0].index.error.reason // "unknown"' 2>/dev/null)
            echo "  First error: ${first_error}" >&2

            if [[ $indexed -eq 0 ]]; then
                echo "ERROR: All documents failed to index" >&2
                exit 1
            fi

            echo "Indexed ${indexed}/${item_count} documents (${error_count} errors)"
        else
            echo "Successfully indexed ${item_count} documents"
        fi
    else
        # Fallback without jq
        if echo "$response" | grep -q '"errors":true'; then
            echo "WARNING: Some documents had errors during bulk indexing" >&2
            echo "  Install jq for detailed error reporting" >&2
            # Check if it's a total failure
            if echo "$response" | grep -q '"status":4[0-9][0-9]'; then
                echo "ERROR: Bulk indexing failed" >&2
                exit 1
            fi
            echo "Bulk indexing completed with some errors"
        elif echo "$response" | grep -q '"errors":false'; then
            echo "Successfully indexed all documents"
        else
            echo "WARNING: Could not parse bulk response" >&2
            echo "  Response (first 500 chars): ${response:0:500}" >&2
            exit 1
        fi
    fi
}

###############################################################################
# Verify document count
###############################################################################
verify_count() {
    echo ""
    echo "Verifying document count..."

    # Wait a moment for OpenSearch to refresh
    sleep 1

    # Force refresh the index
    curl "${CURL_OPTS[@]}" -X POST "${OPENSEARCH_URL}/${INDEX_NAME}/_refresh" &>/dev/null || true

    local count_response
    count_response=$(curl "${CURL_OPTS[@]}" -X GET "${OPENSEARCH_URL}/v3-hive-log-*/_count" 2>&1)

    local count=0
    if [[ "$HAS_JQ" == "true" ]]; then
        count=$(echo "$count_response" | jq -r '.count // 0' 2>/dev/null)
    else
        count=$(echo "$count_response" | sed -E 's/.*"count"\s*:\s*([0-9]+).*/\1/' | head -1)
    fi

    if [[ -z "$count" ]]; then
        count=0
    fi

    echo "Document count in v3-hive-log-*: ${count}"

    if [[ "$count" -ge "$EXPECTED_COUNT" ]]; then
        echo "✓ Verification passed: ${count} documents indexed (expected ≥${EXPECTED_COUNT})"
        return 0
    else
        echo "✗ Verification failed: expected ≥${EXPECTED_COUNT} documents, got ${count}" >&2
        return 1
    fi
}

###############################################################################
# Main execution
###############################################################################
main() {
    echo "=== HiveArmor E2E Event Injection ==="
    echo ""

    # Try gRPC injection first (optional)
    if try_grpc_injection; then
        echo "Events injected via gRPC"
    else
        # Fallback: direct OpenSearch bulk API (always works in local-dev)
        echo "Using direct OpenSearch bulk API..."
        inject_via_bulk_api
    fi

    echo ""

    # Verify
    if verify_count; then
        echo ""
        echo "=== Injection Complete ==="
        exit 0
    else
        echo ""
        echo "=== Injection Complete (with warnings) ==="
        exit 1
    fi
}

main
