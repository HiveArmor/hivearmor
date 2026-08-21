#!/usr/bin/env bash
# Category 8: opensearch-indices
# Requirements: 12.3
#
# Verifies that at least one HiveArmor OpenSearch index matching the pattern
# v3-hive-* exists and is accessible.
#
# The index pattern follows HiveArmor's version-locked convention:
#   v3-hive-<type>-YYYY.MM.DD  (single-tenant)
#   v3-hive-<type>-<tenantPrefix>-YYYY.MM.DD  (MSSP)
# Wildcard used: v3-hive-*
#
# Exit codes:
#   0 — at least one v3-hive-* index is present
#   1 — OpenSearch is unreachable, returned an error, or no matching index found
set -uo pipefail

OPENSEARCH_URL="${OPENSEARCH_URL:-https://localhost:9200}"
OPENSEARCH_USER="${OPENSEARCH_USER:-admin}"
OPENSEARCH_PASS="${OPENSEARCH_PASS:-LocalDev@2024!}"

echo "[CAT8] Querying OpenSearch at ${OPENSEARCH_URL} for v3-hive-* indices"

# Issue _cat/indices for the wildcard pattern.
# -k: skip TLS verification (self-signed cert in local-dev)
# -s: silent (suppress progress meter)
# -f: fail (non-zero exit) on HTTP 4xx/5xx
# -u: basic auth
response=$(curl -sk -f \
    -u "${OPENSEARCH_USER}:${OPENSEARCH_PASS}" \
    "${OPENSEARCH_URL}/_cat/indices/v3-hive-*?h=index" 2>&1)
curl_exit=$?

if [[ $curl_exit -ne 0 ]]; then
    echo "[FAIL] OpenSearch unreachable or returned an error at ${OPENSEARCH_URL} (curl_exit=${curl_exit})" >&2
    echo "[FAIL] Response: ${response}" >&2
    exit 1
fi

# Trim whitespace from the response
trimmed=$(echo "$response" | xargs)

if [[ -z "$trimmed" ]]; then
    echo "[FAIL] No v3-hive-* indices found in OpenSearch — ingest pipeline may not have run yet" >&2
    exit 1
fi

# Count the matching indices
index_count=$(echo "$response" | grep -c 'v3-hive-' || true)

echo "[PASS] Found ${index_count} v3-hive-* index(es) in OpenSearch:"
echo "$response" | head -10
if [[ "$index_count" -gt 10 ]]; then
    echo "  ... (${index_count} total)"
fi

exit 0
