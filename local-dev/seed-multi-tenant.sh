#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Multi-tenant data seed for full tenant isolation testing
# =============================================================================
# Tenants: Workmates1, CWM, Workmates2
# Index types: log, event (EDR), alert
# Flushes ALL old test data first.
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

echo "============================================================"
echo "  HiveArmor Multi-Tenant Data Seed"
echo "  Tenants: Workmates1, CWM, Workmates2"
echo "============================================================"

# --- Step 1: Flush ALL old test indices ---
echo ""
echo "==> Flushing old test data..."
curl ${CURL_OPTS} -X DELETE "${OS_URL}/v3-hive-log-*" 2>/dev/null && echo "  Deleted: v3-hive-log-*" || echo "  (no log indices to delete)"
curl ${CURL_OPTS} -X DELETE "${OS_URL}/v3-hive-event-*" 2>/dev/null && echo "  Deleted: v3-hive-event-*" || echo "  (no event indices to delete)"
curl ${CURL_OPTS} -X DELETE "${OS_URL}/v3-hive-alert-*" 2>/dev/null && echo "  Deleted: v3-hive-alert-*" || echo "  (no alert indices to delete)"

# --- Step 2: Create index mappings ---
create_log_index() {
  local idx=$1
  curl ${CURL_OPTS} -X PUT "${OS_URL}/${idx}" -H 'Content-Type: application/json' -d '{
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": { "properties": {
      "@timestamp": { "type": "date" }, "ingestedAt": { "type": "date" },
      "event": { "properties": { "severity": { "type": "integer" }, "category": { "type": "keyword" }, "action": { "type": "keyword" }, "type": { "type": "keyword" }, "outcome": { "type": "keyword" } } },
      "host": { "properties": { "name": { "type": "keyword" }, "ip": { "type": "ip" }, "os": { "properties": { "name": { "type": "keyword" } } } } },
      "user": { "properties": { "name": { "type": "keyword" }, "domain": { "type": "keyword" } } },
      "source": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" }, "geo": { "properties": { "country_name": { "type": "keyword" } } } } },
      "destination": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" } } },
      "message": { "type": "text" }, "dataType": { "type": "keyword" }, "dataSource": { "type": "keyword" },
      "data_stream": { "properties": { "dataset": { "type": "keyword" } } },
      "logx": { "type": "object", "enabled": false }, "visibleBy": { "type": "keyword" }
    } }
  }' 2>/dev/null > /dev/null
}

create_event_index() {
  local idx=$1
  curl ${CURL_OPTS} -X PUT "${OS_URL}/${idx}" -H 'Content-Type: application/json' -d '{
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": { "properties": {
      "@timestamp": { "type": "date" }, "ingestedAt": { "type": "date" },
      "event": { "properties": { "severity": { "type": "integer" }, "category": { "type": "keyword" }, "action": { "type": "keyword" }, "type": { "type": "keyword" }, "outcome": { "type": "keyword" } } },
      "host": { "properties": { "name": { "type": "keyword" }, "ip": { "type": "ip" }, "os": { "properties": { "name": { "type": "keyword" } } } } },
      "user": { "properties": { "name": { "type": "keyword" }, "domain": { "type": "keyword" } } },
      "process": { "properties": { "name": { "type": "keyword" }, "pid": { "type": "integer" }, "executable": { "type": "keyword" }, "command_line": { "type": "text" }, "parent": { "properties": { "name": { "type": "keyword" }, "pid": { "type": "integer" } } } } },
      "file": { "properties": { "path": { "type": "keyword" }, "name": { "type": "keyword" }, "hash": { "properties": { "sha256": { "type": "keyword" } } } } },
      "source": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" } } },
      "destination": { "properties": { "ip": { "type": "ip" }, "port": { "type": "integer" } } },
      "message": { "type": "text" }, "dataType": { "type": "keyword" }, "dataSource": { "type": "keyword" },
      "data_stream": { "properties": { "dataset": { "type": "keyword" } } },
      "visibleBy": { "type": "keyword" }
    } }
  }' 2>/dev/null > /dev/null
}

create_alert_index() {
  local idx=$1
  curl ${CURL_OPTS} -X PUT "${OS_URL}/${idx}" -H 'Content-Type: application/json' -d '{
    "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
    "mappings": { "properties": {
      "@timestamp": { "type": "date" }, "ingestedAt": { "type": "date" },
      "name": { "type": "keyword" }, "id": { "type": "keyword" },
      "event": { "properties": { "severity": { "type": "integer" }, "category": { "type": "keyword" }, "action": { "type": "keyword" } } },
      "host": { "properties": { "name": { "type": "keyword" } } },
      "user": { "properties": { "name": { "type": "keyword" } } },
      "source": { "properties": { "ip": { "type": "ip" } } },
      "severity": { "type": "integer" }, "severityLabel": { "type": "keyword" },
      "status": { "type": "integer" }, "statusLabel": { "type": "keyword" },
      "category": { "type": "keyword" }, "dataSource": { "type": "keyword" },
      "message": { "type": "text" }, "tags": { "type": "keyword" },
      "visibleBy": { "type": "keyword" }
    } }
  }' 2>/dev/null > /dev/null
}

echo ""
echo "==> Creating indices for 3 tenants..."
for PREFIX in workmates1 cwm workmates2; do
  create_log_index "v3-hive-log-${PREFIX}-${TODAY}"
  create_event_index "v3-hive-event-${PREFIX}-${TODAY}"
  create_alert_index "v3-hive-alert-${PREFIX}-${TODAY}"
  echo "  Created: log, event, alert indices for '${PREFIX}'"
done

# --- Step 3: Seed data per tenant ---
seed_logs() {
  local PREFIX=$1 TENANT_NAME=$2 DOMAIN=$3 COUNT=$4
  local IDX="v3-hive-log-${PREFIX}-${TODAY}"
  local BULK=""
  local HOSTS=("SRV-${PREFIX}-01" "SRV-${PREFIX}-02" "WKS-${PREFIX}-10" "FW-${PREFIX}-01" "DC-${PREFIX}-01")
  local USERS=("admin" "j.doe" "analyst01" "svc_backup" "k.admin")
  local SOURCES=("Windows Security" "FortiGate" "Linux Syslog" "AWS CloudTrail" "Palo Alto")
  local ACTIONS=("logon_failed" "logon_success" "connection_denied" "connection_accepted" "file_created" "dns_query" "ConsoleLogin")
  local CATEGORIES=("authentication" "authentication" "network" "network" "host" "network" "iam")

  for i in $(seq 1 ${COUNT}); do
    local TS=$(gen_ts $(( RANDOM % 14400 )))
    local HOST=${HOSTS[$(( RANDOM % ${#HOSTS[@]} ))]}
    local USER=${USERS[$(( RANDOM % ${#USERS[@]} ))]}
    local AI=$(( RANDOM % ${#ACTIONS[@]} ))
    local ACTION=${ACTIONS[$AI]}
    local CAT=${CATEGORIES[$AI]}
    local SRC=${SOURCES[$(( RANDOM % ${#SOURCES[@]} ))]}
    local SRC_IP="10.$(( RANDOM % 255 )).$(( RANDOM % 255 )).$(( RANDOM % 255 ))"
    local DST_IP="192.168.$(( RANDOM % 5 )).$(( RANDOM % 255 ))"
    local SEV=$(( RANDOM % 4 + 1 ))
    BULK+='{"index":{"_index":"'"${IDX}"'"}}'$'\n'
    BULK+='{"@timestamp":"'"${TS}"'","ingestedAt":"'"${INGEST_TS}"'","event":{"severity":'"${SEV}"',"category":"'"${CAT}"'","action":"'"${ACTION}"'","type":"info","outcome":"success"},"host":{"name":"'"${HOST}"'","ip":"'"${DST_IP}"'","os":{"name":"Windows Server 2022"}},"user":{"name":"'"${USER}"'","domain":"'"${DOMAIN}"'"},"source":{"ip":"'"${SRC_IP}"'","port":'"$(( RANDOM % 60000 + 1024 ))"',"geo":{"country_name":"United States"}},"destination":{"ip":"'"${DST_IP}"'","port":'"$(( RANDOM % 65535 + 1 ))"'},"message":"['"${TENANT_NAME}"'] '"${ACTION}"' by '"${USER}"'@'"${DOMAIN}"' on '"${HOST}"'","dataType":"log","dataSource":"'"${SRC}"'","data_stream":{"dataset":"'"${PREFIX}"'.security"},"visibleBy":"'"${PREFIX}"'"}'$'\n'
  done
  echo "$BULK" | curl ${CURL_OPTS} -X POST "${OS_URL}/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @- 2>/dev/null > /dev/null
  echo "  Logs: ${COUNT} events → ${IDX}"
}

seed_events() {
  local PREFIX=$1 TENANT_NAME=$2 DOMAIN=$3 COUNT=$4
  local IDX="v3-hive-event-${PREFIX}-${TODAY}"
  local BULK=""
  local HOSTS=("WKS-${PREFIX}-10" "WKS-${PREFIX}-11" "SRV-${PREFIX}-01")
  local USERS=("admin" "j.doe" "SYSTEM" "LOCAL SERVICE")
  local PROCS=("powershell.exe" "cmd.exe" "svchost.exe" "certutil.exe" "whoami.exe" "net.exe" "chrome.exe")

  for i in $(seq 1 ${COUNT}); do
    local TS=$(gen_ts $(( RANDOM % 14400 )))
    local HOST=${HOSTS[$(( RANDOM % ${#HOSTS[@]} ))]}
    local USER=${USERS[$(( RANDOM % ${#USERS[@]} ))]}
    local PROC=${PROCS[$(( RANDOM % ${#PROCS[@]} ))]}
    local SRC_IP="10.$(( RANDOM % 255 )).$(( RANDOM % 255 )).$(( RANDOM % 255 ))"
    local SEV=$(( RANDOM % 3 + 1 ))
    BULK+='{"index":{"_index":"'"${IDX}"'"}}'$'\n'
    BULK+='{"@timestamp":"'"${TS}"'","ingestedAt":"'"${INGEST_TS}"'","event":{"severity":'"${SEV}"',"category":"process","action":"process_started","type":"start","outcome":"success"},"host":{"name":"'"${HOST}"'","ip":"'"${SRC_IP}"'","os":{"name":"Windows 11"}},"user":{"name":"'"${USER}"'","domain":"'"${DOMAIN}"'"},"process":{"name":"'"${PROC}"'","pid":'"$(( RANDOM % 60000 + 100 ))"',"executable":"C:\\Windows\\System32\\'"${PROC}"'","command_line":"'"${PROC}"' /c whoami","parent":{"name":"explorer.exe","pid":'"$(( RANDOM % 5000 + 1000 ))"'}},"source":{"ip":"'"${SRC_IP}"'"},"message":"['"${TENANT_NAME}"'] Process '"${PROC}"' started by '"${USER}"' on '"${HOST}"'","dataType":"event","dataSource":"Sysmon","data_stream":{"dataset":"'"${PREFIX}"'.edr"},"visibleBy":"'"${PREFIX}"'"}'$'\n'
  done
  echo "$BULK" | curl ${CURL_OPTS} -X POST "${OS_URL}/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @- 2>/dev/null > /dev/null
  echo "  EDR events: ${COUNT} → ${IDX}"
}

seed_alerts() {
  local PREFIX=$1 TENANT_NAME=$2 COUNT=$3
  local IDX="v3-hive-alert-${PREFIX}-${TODAY}"
  local BULK=""
  local NAMES=("Brute force detected" "Suspicious process execution" "Lateral movement attempt" "Data exfiltration risk" "Privilege escalation" "C2 communication detected")
  local CATS=("Credential Access" "Execution" "Lateral Movement" "Exfiltration" "Privilege Escalation" "Command and Control")

  for i in $(seq 1 ${COUNT}); do
    local TS=$(gen_ts $(( RANDOM % 14400 )))
    local NI=$(( RANDOM % ${#NAMES[@]} ))
    local NAME=${NAMES[$NI]}
    local CAT=${CATS[$NI]}
    local SEV=$(( RANDOM % 4 + 1 ))
    local SEVLABEL="low"
    if [ $SEV -eq 2 ]; then SEVLABEL="medium"; fi
    if [ $SEV -eq 3 ]; then SEVLABEL="high"; fi
    if [ $SEV -eq 4 ]; then SEVLABEL="critical"; fi
    BULK+='{"index":{"_index":"'"${IDX}"'"}}'$'\n'
    BULK+='{"@timestamp":"'"${TS}"'","ingestedAt":"'"${INGEST_TS}"'","name":"'"${NAME}"'","id":"ALT-'"${PREFIX}"'-'"${i}"'","event":{"severity":'"${SEV}"',"category":"'"${CAT}"'","action":"alert_generated"},"host":{"name":"SRV-'"${PREFIX}"'-01"},"user":{"name":"admin"},"source":{"ip":"10.'"$(( RANDOM % 255 ))"'.'"$(( RANDOM % 255 ))"'.'"$(( RANDOM % 255 ))"'"},"severity":'"${SEV}"',"severityLabel":"'"${SEVLABEL}"'","status":1,"statusLabel":"Open","category":"'"${CAT}"'","dataSource":"Correlation Engine","message":"['"${TENANT_NAME}"'] '"${NAME}"' detected","tags":["auto-generated"],"visibleBy":"'"${PREFIX}"'"}'$'\n'
  done
  echo "$BULK" | curl ${CURL_OPTS} -X POST "${OS_URL}/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @- 2>/dev/null > /dev/null
  echo "  Alerts: ${COUNT} → ${IDX}"
}

echo ""
echo "==> Seeding tenant: Workmates1"
seed_logs "workmates1" "Workmates1" "WORKMATES1.COM" 60
seed_events "workmates1" "Workmates1" "WORKMATES1.COM" 30
seed_alerts "workmates1" "Workmates1" 15

echo ""
echo "==> Seeding tenant: CWM"
seed_logs "cwm" "CWM" "CWM.IO" 45
seed_events "cwm" "CWM" "CWM.IO" 25
seed_alerts "cwm" "CWM" 12

echo ""
echo "==> Seeding tenant: Workmates2"
seed_logs "workmates2" "Workmates2" "WORKMATES2.NET" 50
seed_events "workmates2" "Workmates2" "WORKMATES2.NET" 20
seed_alerts "workmates2" "Workmates2" 10

# --- Step 4: Verify ---
echo ""
echo "==> Verifying document counts..."
sleep 1
echo ""
printf "  %-45s %s\n" "INDEX" "DOCS"
printf "  %-45s %s\n" "---------------------------------------------" "----"
for PREFIX in workmates1 cwm workmates2; do
  for TYPE in log event alert; do
    IDX="v3-hive-${TYPE}-${PREFIX}-${TODAY}"
    COUNT=$(curl ${CURL_OPTS} -s "${OS_URL}/${IDX}/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count','?'))" 2>/dev/null || echo "?")
    printf "  %-45s %s\n" "${IDX}" "${COUNT}"
  done
done

echo ""
echo "============================================================"
echo "  Tenant Isolation Test Plan:"
echo ""
echo "  1. Select 'All authorized tenants' → see ALL data"
echo "  2. Select 'Workmates1' → only v3-hive-*-workmates1-* data"
echo "  3. Select 'CWM' → only v3-hive-*-cwm-* data"
echo "  4. Select 'Workmates2' → only v3-hive-*-workmates2-* data"
echo ""
echo "  Use the Index selector to verify per-type isolation:"
echo "  - 'Raw logs' → v3-hive-log-<tenant>-*"
echo "  - 'Endpoint events' → v3-hive-event-<tenant>-*"
echo "  - 'Alerts' → v3-hive-alert-<tenant>-*"
echo "============================================================"
