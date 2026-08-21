#!/usr/bin/env bash
# apply-entity-template.sh
#
# Creates the OpenSearch index template for entity intelligence documents:
#   v3-hive-entity-*    Entity inventory (risk scores, criticality, baselines)
#
# Usage:
#   OPENSEARCH_URL=https://localhost:9200 \
#   OPENSEARCH_USER=admin \
#   OPENSEARCH_PASS=LocalDev@2024! \
#   bash apply-entity-template.sh
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

TEMPLATE_FILE="${SCRIPT_DIR}/entity-template.json"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "ERROR: Template file not found: ${TEMPLATE_FILE}"
  exit 1
fi

echo "Applying HiveArmor entity intelligence index template..."
echo "  Target: ${OS_URL}/_index_template/v3-hive-entity"
echo ""

# Apply the template via PUT _index_template/v3-hive-entity
RESPONSE=$(curl "${CURL_OPTS[@]}" -w "\n%{http_code}" -X PUT \
  "${OS_URL}/_index_template/v3-hive-entity" \
  -d @"${TEMPLATE_FILE}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" -ge 200 && "${HTTP_CODE}" -lt 300 ]]; then
  echo "  ✓ Template 'v3-hive-entity' created successfully (HTTP ${HTTP_CODE})"
else
  echo "  ✗ Failed to create template (HTTP ${HTTP_CODE})"
  echo "  Response: ${BODY}"
  exit 1
fi

echo ""
echo "Template applied:"
echo "  v3-hive-entity → v3-hive-entity-* (entity inventory documents)"
echo ""
echo "Fields mapped:"
echo "  id               keyword       Unique entity identifier"
echo "  type             keyword       Entity type (host, user, ip, domain)"
echo "  value            keyword       Entity value (hostname, username, IP, domain)"
echo "  displayName      text+keyword  Human-readable name (standard analyzer + keyword)"
echo "  riskScore        integer       Risk score (0-100)"
echo "  riskLevel        keyword       Risk level (critical, high, medium, low)"
echo "  riskTrend        keyword       Trend direction (rising, stable, declining)"
echo "  criticality      keyword       Business criticality (critical, high, medium, low, unclassified)"
echo "  alertCount       integer       Number of associated alerts"
echo "  lastSeen         date          Last observation timestamp"
echo "  firstSeen        date          First observation timestamp"
echo "  baselineDeviation float        Deviation from baseline (0.0-1.0)"
echo "  tags             keyword[]     Entity tags"
echo "  observationSources keyword[]   Observation sources (endpoint, network, identity, cloud)"
echo "  tenantId         long          Tenant identifier"
echo ""

# Verify: check that the template exists and matches our index pattern
echo "Verifying template applies to v3-hive-entity-* indices..."
VERIFY_RESPONSE=$(curl "${CURL_OPTS[@]}" -s -X GET \
  "${OS_URL}/_index_template/v3-hive-entity")

if echo "${VERIFY_RESPONSE}" | grep -q '"v3-hive-entity-\*"'; then
  echo "  ✓ Template verified: matches index pattern v3-hive-entity-*"
else
  echo "  ⚠ Template created but pattern verification unclear. Check manually:"
  echo "    curl -sk -u admin:LocalDev@2024! ${OS_URL}/_index_template/v3-hive-entity"
fi

echo ""
echo "Done. New indices matching v3-hive-entity-* will use this template automatically."
