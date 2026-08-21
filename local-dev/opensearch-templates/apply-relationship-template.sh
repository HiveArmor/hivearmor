#!/usr/bin/env bash
# apply-relationship-template.sh
#
# Creates the OpenSearch index template for entity relationship edges:
#   v3-hive-relationship-*    Entity-to-entity relationship documents
#
# Usage:
#   OPENSEARCH_URL=https://localhost:9200 \
#   OPENSEARCH_USER=admin \
#   OPENSEARCH_PASS=LocalDev@2024! \
#   bash apply-relationship-template.sh
#
# The index pattern follows the locked platform convention:
#   v3-hive-<type>-YYYY.MM.DD
# Do NOT change this pattern without migrating all existing data.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OS_URL="${OPENSEARCH_URL:-https://localhost:9200}"
OS_USER="${OPENSEARCH_USER:-admin}"
OS_PASS="${OPENSEARCH_PASS:-LocalDev@2024!}"

CURL_OPTS=(-sk -u "${OS_USER}:${OS_PASS}" -H "Content-Type: application/json")

TEMPLATE_FILE="${SCRIPT_DIR}/relationship-template.json"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "ERROR: Template file not found: ${TEMPLATE_FILE}"
  exit 1
fi

echo "Applying HiveArmor entity relationship index template..."
echo "  Target: ${OS_URL}/_index_template/v3-hive-relationship"
echo ""

# Apply the template via PUT _index_template/v3-hive-relationship
RESPONSE=$(curl "${CURL_OPTS[@]}" -w "\n%{http_code}" -X PUT \
  "${OS_URL}/_index_template/v3-hive-relationship" \
  -d @"${TEMPLATE_FILE}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" -ge 200 && "${HTTP_CODE}" -lt 300 ]]; then
  echo "  ✓ Template 'v3-hive-relationship' created successfully (HTTP ${HTTP_CODE})"
else
  echo "  ✗ Failed to create template (HTTP ${HTTP_CODE})"
  echo "  Response: ${BODY}"
  exit 1
fi

echo ""
echo "Template applied:"
echo "  v3-hive-relationship → v3-hive-relationship-* (entity relationship edges)"
echo ""
echo "Fields mapped:"
echo "  id                keyword       Unique relationship identifier"
echo "  sourceEntityId    keyword       Source entity ID"
echo "  targetEntityId    keyword       Target entity ID"
echo "  sourceEntityType  keyword       Source entity type (host, user, ip, domain)"
echo "  targetEntityType  keyword       Target entity type (host, user, ip, domain)"
echo "  sourceEntityValue keyword       Source entity value"
echo "  targetEntityValue keyword       Target entity value"
echo "  relationshipType  keyword       Relationship type (authenticated_to, communicated_with, etc.)"
echo "  direction         keyword       Edge direction (outbound, inbound, bidirectional)"
echo "  strength          float         Relationship strength (0.0-1.0)"
echo "  evidence          nested        Evidence entries (type, description, timestamp, eventId)"
echo "  firstSeen         date          First observation timestamp"
echo "  lastSeen          date          Last observation timestamp"
echo "  eventCount        integer       Number of supporting events"
echo "  tenantId          long          Tenant identifier"
echo ""

# Verify: check that the template exists and matches our index pattern
echo "Verifying template applies to v3-hive-relationship-* indices..."
VERIFY_RESPONSE=$(curl "${CURL_OPTS[@]}" -s -X GET \
  "${OS_URL}/_index_template/v3-hive-relationship")

if echo "${VERIFY_RESPONSE}" | grep -q '"v3-hive-relationship-\*"'; then
  echo "  ✓ Template verified: matches index pattern v3-hive-relationship-*"
else
  echo "  ⚠ Template created but pattern verification unclear. Check manually:"
  echo "    curl -sk -u admin:LocalDev@2024! ${OS_URL}/_index_template/v3-hive-relationship"
fi

echo ""
echo "Done. New indices matching v3-hive-relationship-* will use this template automatically."
