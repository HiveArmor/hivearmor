#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Seed multi-tenant log events for testing tenant isolation
# =============================================================================
# Creates logs in separate tenant-scoped indices:
#   v3-hive-log-northstar-YYYY.MM.DD  (Northstar Finance)
#   v3-hive-log-acme-YYYY.MM.DD       (Acme Corp)
#   v3-hive-log-YYYY.MM.DD            (Default / shared)
# =============================================================================

set -euo pipefail

OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OPTS="-sk -u ${OS_USER}:${OS_PASS}"

TODAY=$(date -u +%Y.%m.%d)
NOW_EPOCH=$(date -u +%s)
INGEST_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

gen_ts() {
  local offset=$1
  date -u -r $(( NOW_EPOCH - offset )) +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || \
  date -u -d "@$(( NOW_EPOCH - offset ))" +%Y-%m-%dT%H:%M:%S.000Z
}

# Function to create an index with standard mapping
create_index() {
  local index=$1
  echo "==> Creating index: ${index}"
  curl ${CURL_OPTS} -X PUT "${OS_URL}/${index}" -H 'Content-Type: application/json' -d '{
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "ingestedAt": { "type": "date" },
        "event": { "properties": { "severity": { "type": "integer" }, "category": { "type": "keyword" }, "action": { "type": "keyword" }, "type": { "type": "keyword" }, "outcome": { "type": "keyword" } } },
        "host": { "properties": { "name": { "type": "keyword" }, "ip": { "type": "ip" }, "os": { "properties": { "name": { "type": "keyword" } } } } },
        "user": { "properties": { "name": { "type": "keyword" }, "domain": { "type": "keyword" } } },
        "source": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" }, "geo": { "properties": { "country_name": { "type": "keyword" }, "city_name": { "type": "keyword" } } } } },
        "destination": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" } } },
        "message": { "type": "text" },
        "dataType": { "type": "keyword" },
        "dataSource": { "type": "keyword" },
        "data_stream": { "properties": { "dataset": { "type": "keyword" } } },
        "logx": { "type": "object", "enabled": false },
        "visibleBy": { "type": "keyword" }
      }
    }
  }' 2>/dev/null && echo " OK" || echo " (may already exist)"
}

# Function to bulk insert events for a tenant
seed_tenant() {
  local INDEX=$1
  local TENANT_PREFIX=$2
  local TENANT_NAME=$3
  local DOMAIN=$4
  local COUNT=$5

  echo "==> Seeding ${COUNT} events for tenant '${TENANT_NAME}' → ${INDEX}"

  BULK=""
  HOSTS=("SRV-${TENANT_PREFIX}-01" "SRV-${TENANT_PREFIX}-02" "WKS-${TENANT_PREFIX}-10" "WKS-${TENANT_PREFIX}-11" "FW-${TENANT_PREFIX}-01")
  USERS=("admin" "j.doe" "a.analyst" "svc_monitor" "b.admin")
  ACTIONS=("logon_failed" "logon_success" "connection_denied" "connection_accepted" "process_started" "dns_query" "ConsoleLogin")
  CATEGORIES=("authentication" "network" "process" "network" "process" "network" "iam")
  SOURCES=("Windows Security" "FortiGate" "Sysmon" "AWS CloudTrail" "Linux Syslog")

  for i in $(seq 1 ${COUNT}); do
    TS=$(gen_ts $(( RANDOM % 14400 )))
    HOST=${HOSTS[$(( RANDOM % ${#HOSTS[@]} ))]}
    USER=${USERS[$(( RANDOM % ${#USERS[@]} ))]}
    ACTION_IDX=$(( RANDOM % ${#ACTIONS[@]} ))
    ACTION=${ACTIONS[$ACTION_IDX]}
    CATEGORY=${CATEGORIES[$ACTION_IDX]}
    SOURCE=${SOURCES[$(( RANDOM % ${#SOURCES[@]} ))]}
    SRC_IP="10.$(( RANDOM % 255 )).$(( RANDOM % 255 )).$(( RANDOM % 255 ))"
    DST_IP="192.168.$(( RANDOM % 5 )).$(( RANDOM % 255 ))"
    SEV=$(( RANDOM % 4 + 1 ))
    OUTCOME="success"
    if [[ "$ACTION" == *"failed"* || "$ACTION" == *"denied"* ]]; then OUTCOME="failure"; fi

    BULK+='{"index":{"_index":"'"${INDEX}"'"}}'$'\n'
    BULK+='{"@timestamp":"'"${TS}"'","ingestedAt":"'"${INGEST_TS}"'","event":{"severity":'"${SEV}"',"category":"'"${CATEGORY}"'","action":"'"${ACTION}"'","type":"info","outcome":"'"${OUTCOME}"'"},"host":{"name":"'"${HOST}"'","ip":"'"${DST_IP}"'","os":{"name":"Windows Server 2022"}},"user":{"name":"'"${USER}"'","domain":"'"${DOMAIN}"'"},"source":{"ip":"'"${SRC_IP}"'","port":'"$(( RANDOM % 60000 + 1024 ))"',"geo":{"country_name":"United States","city_name":"Dallas"}},"destination":{"ip":"'"${DST_IP}"'","port":'"$(( RANDOM % 65535 + 1 ))"'},"message":"['"${TENANT_NAME}"'] '"${ACTION}"' by '"${USER}"'@'"${DOMAIN}"' on '"${HOST}"' from '"${SRC_IP}"'","dataType":"log","dataSource":"'"${SOURCE}"'","data_stream":{"dataset":"'"${TENANT_PREFIX}"'.security"},"logx":{},"visibleBy":"'"${TENANT_PREFIX}"'"}'$'\n'
  done

  echo "$BULK" | curl ${CURL_OPTS} -X POST "${OS_URL}/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @- 2>/dev/null | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errors = r.get('errors', False)
    print(f'  Indexed: {len(items)} documents, errors: {errors}')
except:
    print('  Bulk insert completed')
"
}

# ============================================================================
# Create indices for each tenant
# ============================================================================

NORTHSTAR_INDEX="v3-hive-log-northstar-${TODAY}"
ACME_INDEX="v3-hive-log-acme-${TODAY}"

create_index "${NORTHSTAR_INDEX}"
create_index "${ACME_INDEX}"

# ============================================================================
# Seed data per tenant
# ============================================================================

seed_tenant "${NORTHSTAR_INDEX}" "northstar" "Northstar Finance" "NORTHSTAR.IO" 50
seed_tenant "${ACME_INDEX}" "acme" "Acme Corp" "ACME.LOCAL" 40

# ============================================================================
# Verify
# ============================================================================

echo ""
echo "==> Verifying document counts..."
sleep 1

for idx in "${NORTHSTAR_INDEX}" "${ACME_INDEX}" "v3-hive-log-${TODAY}"; do
  COUNT=$(curl ${CURL_OPTS} -s "${OS_URL}/${idx}/_count" -H 'Content-Type: application/json' 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count','?'))" 2>/dev/null || echo "?")
  echo "  ${idx}: ${COUNT} documents"
done

echo ""
echo "==> Multi-tenant data seeded!"
echo ""
echo "    Tenant isolation test:"
echo "      - When masthead shows 'Northstar Finance' → only northstar events visible"
echo "      - When masthead shows 'Acme Corp' → only acme events visible"
echo "      - When masthead shows 'All authorized tenants' → all events visible"
echo ""
echo "    Index patterns:"
echo "      v3-hive-log-northstar-*  → Northstar Finance (visibleBy: northstar)"
echo "      v3-hive-log-acme-*       → Acme Corp (visibleBy: acme)"
echo "      v3-hive-log-*            → Default / all tenants (visibleBy: default)"
