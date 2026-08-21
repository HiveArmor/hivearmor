#!/usr/bin/env bash
# =============================================================================
# seed-constellation-graph.sh — Sprint 48 Threat Constellation test data
#
# Seeds OpenSearch with graph data for the Threat Constellation module:
#   - 100+ entity nodes in v3-hive-entity-cwm
#   - 200+ relationship edges in v3-hive-relationship-cwm
#   - 3 attack clusters with high mutual connectivity
#   - Confidence distribution: 30% high, 40% medium, 30% low
#   - Evidence per edge: 1-5 events with realistic timestamps (last 14 days)
#
# Usage:
#   cd local-dev && bash seed-constellation-graph.sh
#   cd local-dev && bash seed-constellation-graph.sh --teardown
#
# Prerequisites:
#   - OpenSearch on https://localhost:9200 (admin / LocalDev@2024!)
# =============================================================================
set -euo pipefail

OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OS="curl -sk -u ${OS_USER}:${OS_PASS}"

ENTITY_IDX="v3-hive-entity-cwm"
REL_IDX="v3-hive-relationship-cwm"
LOG_IDX="v3-hive-log-cwm"
ALERT_IDX="v3-hive-alert-cwm"

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${CYAN}  →${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}$*${NC}"; }

# ─── Date helpers ────────────────────────────────────────────────────────────────
NOW_EPOCH=$(date +%s)

random_ts_last_14d() {
  local day_offset=$(( RANDOM % 14 ))
  local hour=$(( RANDOM % 24 ))
  local minute=$(( RANDOM % 60 ))
  local second=$(( RANDOM % 60 ))
  local ts_epoch=$(( NOW_EPOCH - day_offset * 86400 - (24 - hour) * 3600 + minute * 60 + second ))
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$ts_epoch" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

days_ago() {
  local days=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

# ─── Confidence helpers ──────────────────────────────────────────────────────────
# Distribution: 30% high (0.85-1.0), 40% medium (0.5-0.84), 30% low (0.3-0.49)
# Uses RANDOM modulo to approximate the distribution per-call
random_confidence() {
  local roll=$(( RANDOM % 100 ))
  if (( roll < 30 )); then
    # High: 0.85-1.0
    echo "0.$(( 85 + RANDOM % 16 ))"
  elif (( roll < 70 )); then
    # Medium: 0.50-0.84
    echo "0.$(( 50 + RANDOM % 35 ))"
  else
    # Low: 0.30-0.49
    echo "0.$(( 30 + RANDOM % 20 ))"
  fi
}

# ─── Evidence generator ──────────────────────────────────────────────────────────
generate_evidence() {
  local count=$1 rel_type=$2
  local result="["
  for (( e=0; e<count; e++ )); do
    local ts=$(random_ts_last_14d)
    local desc=""
    case "$rel_type" in
      authenticated_to) desc="Authentication event - session established" ;;
      communicated_with) desc="Network connection - $(( RANDOM % 9999 + 100 ))KB transferred" ;;
      executed_on) desc="Process creation event logged" ;;
      resolved_to) desc="DNS resolution query answered" ;;
      dropped_by) desc="File write operation detected" ;;
      accessed_from)
        local protos=("SMB" "RDP" "SSH")
        desc="Remote access session - ${protos[$(( RANDOM % 3 ))]} protocol" ;;
      exfiltrated_to) desc="Large data transfer - $(( RANDOM % 50 + 5 ))MB outbound" ;;
      belongs_to) desc="Group membership verified" ;;
      *) desc="Event observed" ;;
    esac
    (( e > 0 )) && result+=","
    result+="{\"eventId\":\"evt-${rel_type:0:4}-$(( RANDOM % 9999 ))\",\"timestamp\":\"${ts}\",\"description\":\"${desc}\"}"
  done
  result+="]"
  echo "$result"
}

# ─── Teardown ───────────────────────────────────────────────────────────────────
teardown() {
  header "Teardown — removing Sprint 48 constellation graph seed data"
  info "Deleting constellation entities..."
  ${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"term":{"tags.keyword":"constellation-seed"}}}' 2>/dev/null > /dev/null || true
  info "Deleting constellation relationships..."
  ${CURL_OS} -X POST "${OS_URL}/${REL_IDX}/_delete_by_query" \
    -H "Content-Type: application/json" \
    -d '{"query":{"match_all":{}}}' 2>/dev/null > /dev/null || true
  ok "Sprint 48 constellation seed data removed"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 48 Threat Constellation Seed                   ${NC}"
echo -e "${BOLD}  (100+ entities, 200+ relationships, 3 attack clusters)            ${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "OpenSearch: ${OS_URL}"
echo ""

# =============================================================================
# STEP 1: Create required indices (idempotent)
# =============================================================================
header "Step 1: Create required indices"

for IDX in "$ENTITY_IDX" "$REL_IDX" "$LOG_IDX" "$ALERT_IDX"; do
  ${CURL_OS} -X PUT "${OS_URL}/${IDX}" \
    -H "Content-Type: application/json" \
    -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}' \
    2>/dev/null > /dev/null || true
done
ok "All indices ready (entity, relationship, log, alert)"

# =============================================================================
# STEP 2: Seed 100+ entity nodes
# =============================================================================
header "Step 2: Seed entity nodes (100+ total)"

ENTITY_BULK=$(mktemp /tmp/ha_constellation_entities_XXXXXX.ndjson)
ENTITY_COUNT=0

# --- 30 Hosts ---
info "Generating hosts (30)..."
declare -a HOST_NAMES=(
  "FIN-WKS-001" "FIN-WKS-002" "FIN-WKS-003" "FIN-WKS-004" "FIN-WKS-005"
  "FIN-WKS-006" "FIN-WKS-007" "FIN-WKS-008" "FIN-WKS-009" "FIN-WKS-010"
  "FIN-WKS-011" "FIN-WKS-012" "FIN-WKS-013" "FIN-WKS-014" "FIN-WKS-015"
  "ENG-SRV-001" "ENG-SRV-002" "ENG-SRV-003" "ENG-SRV-004" "ENG-SRV-005"
  "ENG-SRV-006" "ENG-SRV-007" "ENG-SRV-008" "ENG-SRV-009" "ENG-SRV-010"
  "DC-001" "DC-002" "DC-003"
  "PRINT-001" "PRINT-002"
)
# Cluster A hosts (added separately)
declare -a CLUSTER_A_HOSTS=("FIN-WKS-044" "ENG-SRV-012")
# Cluster B hosts
declare -a CLUSTER_B_HOSTS=("HR-LPT-001" "HR-LPT-003" "HR-LPT-007")
# Cluster C hosts (ENG-SRV-005, ENG-SRV-006, ENG-SRV-008 already in HOST_NAMES)

declare -a HOST_DISPLAY_PREFIXES=(
  "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation"
  "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation"
  "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation" "Finance Workstation"
  "Engineering Server" "Engineering Server" "Engineering Server" "Engineering Server" "Engineering Server"
  "Engineering Server" "Engineering Server" "Engineering Server" "Engineering Server" "Engineering Server"
  "Domain Controller" "Domain Controller" "Domain Controller"
  "Print Server" "Print Server"
)

# Seed standard 30 hosts
for i in "${!HOST_NAMES[@]}"; do
  HOST="${HOST_NAMES[$i]}"
  SLUG=$(echo "$HOST" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  ENT_ID="ent-host-${SLUG}"
  DISPLAY="${HOST_DISPLAY_PREFIXES[$i]} ${HOST##*-}"
  RISK=$(( 20 + RANDOM % 60 ))
  RISK_LEVEL="low"
  (( RISK >= 40 )) && RISK_LEVEL="medium"
  (( RISK >= 70 )) && RISK_LEVEL="high"
  (( RISK >= 85 )) && RISK_LEVEL="critical"
  ALERTS=$(( RANDOM % 8 ))
  FIRST_SEEN=$(days_ago $(( 30 + RANDOM % 150 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"host","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"os":"Windows Server 2022","department":"%s"},"tags":["constellation-seed"],"visibleBy":["default"]}\n' \
    "$ENT_ID" "$HOST" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$ALERTS" "$FIRST_SEEN" "$LAST_SEEN" \
    "$(echo "${HOST_DISPLAY_PREFIXES[$i]}" | awk '{print $1}')" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done

# Seed cluster-specific hosts
for HOST in "${CLUSTER_A_HOSTS[@]}"; do
  SLUG=$(echo "$HOST" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  ENT_ID="ent-host-${SLUG}"
  RISK=$(( 80 + RANDOM % 20 ))
  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"host","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"critical","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"os":"Windows 11","department":"Finance"},"tags":["constellation-seed","compromised","cluster-a"],"visibleBy":["default"]}\n' \
    "$ENT_ID" "$HOST" "Finance Workstation ${HOST##*-}" "$RISK" "$(( 8 + RANDOM % 8 ))" "$(days_ago 180)" "$(random_ts_last_14d)" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done

for HOST in "${CLUSTER_B_HOSTS[@]}"; do
  SLUG=$(echo "$HOST" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  ENT_ID="ent-host-${SLUG}"
  RISK=$(( 70 + RANDOM % 25 ))
  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"host","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"high","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"os":"Windows 11","department":"HR"},"tags":["constellation-seed","phishing-target","cluster-b"],"visibleBy":["default"]}\n' \
    "$ENT_ID" "$HOST" "HR Laptop ${HOST##*-}" "$RISK" "$(( 4 + RANDOM % 6 ))" "$(days_ago 120)" "$(random_ts_last_14d)" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "Hosts: ${ENTITY_COUNT} seeded"

# --- 25 Users ---
info "Generating users (25)..."
declare -a USER_NAMES=(
  "sarah.chen" "james.wilson" "priya.sharma" "carlos.rodriguez" "aisha.thompson"
  "david.nakamura" "elena.volkov" "marcus.bailey"
  "admin-svc-01" "admin-svc-02" "admin-svc-03" "admin-svc-04" "admin-svc-05"
  "svc-backup" "svc-monitoring" "svc-deploy" "svc-scanner"
  "kevin.wright" "tom.huang" "alex.turner" "sarah.johnson"
  "lisa.park" "ryan.mitchell" "anna.kowalski" "omar.hassan"
)
declare -a USER_DISPLAYS=(
  "Sarah Chen" "James Wilson" "Priya Sharma" "Carlos Rodriguez" "Aisha Thompson"
  "David Nakamura" "Elena Volkov" "Marcus Bailey"
  "Admin Service 01" "Admin Service 02" "Admin Service 03" "Admin Service 04" "Admin Service 05"
  "Backup Service" "Monitoring Service" "Deploy Service" "Scanner Service"
  "Kevin Wright" "Tom Huang" "Alex Turner" "Sarah Johnson"
  "Lisa Park" "Ryan Mitchell" "Anna Kowalski" "Omar Hassan"
)

for i in "${!USER_NAMES[@]}"; do
  USER="${USER_NAMES[$i]}"
  SLUG=$(echo "$USER" | tr '.' '-' | tr '[:upper:]' '[:lower:]')
  ENT_ID="ent-user-${SLUG}"
  DISPLAY="${USER_DISPLAYS[$i]}"
  RISK=$(( 15 + RANDOM % 70 ))
  RISK_LEVEL="low"
  (( RISK >= 40 )) && RISK_LEVEL="medium"
  (( RISK >= 70 )) && RISK_LEVEL="high"
  (( RISK >= 85 )) && RISK_LEVEL="critical"
  # Make cluster-involved users higher risk
  [[ "$USER" == "carlos.rodriguez" ]] && RISK=85 && RISK_LEVEL="critical"
  [[ "$USER" == "svc-deploy" ]] && RISK=78 && RISK_LEVEL="high"
  ALERTS=$(( RANDOM % 6 ))
  TAGS="[\"constellation-seed\""
  [[ "$USER" == "carlos.rodriguez" ]] && TAGS+=",\"cluster-a\""
  [[ "$USER" == "svc-deploy" ]] && TAGS+=",\"cluster-c\""
  [[ "$USER" =~ ^admin-svc ]] && TAGS+=",\"service-account\""
  [[ "$USER" =~ ^svc- ]] && TAGS+=",\"service-account\""
  TAGS+="]"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"user","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"accountType":"%s"},"tags":%s,"visibleBy":["default"]}\n' \
    "$ENT_ID" "$USER" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$ALERTS" \
    "$(days_ago $(( 60 + RANDOM % 300 )))" "$(random_ts_last_14d)" \
    "$([[ "$USER" =~ ^(admin-svc|svc-) ]] && echo "service" || echo "human")" \
    "$TAGS" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "Users: 25 seeded (total: ${ENTITY_COUNT})"

# --- 25 IPs ---
info "Generating IPs (25)..."
declare -a IP_ADDRS=(
  "10.1.5.10" "10.1.5.20" "10.1.5.30" "10.1.5.40" "10.1.5.50"
  "10.1.5.60" "10.1.5.70" "10.1.5.80"
  "10.1.10.10" "10.1.10.20" "10.1.10.30" "10.1.10.40" "10.1.10.50"
  "203.0.113.10" "203.0.113.22" "203.0.113.45" "203.0.113.88" "203.0.113.99"
  "198.51.100.5" "198.51.100.15" "198.51.100.22" "198.51.100.30" "198.51.100.44"
  "8.8.8.8" "1.1.1.1"
)
declare -a IP_DISPLAYS=(
  "Internal Finance 5.10" "Internal Finance 5.20" "Internal Finance 5.30" "Internal Finance 5.40" "Internal Finance 5.50"
  "Internal Finance 5.60" "Internal Finance 5.70" "Internal Finance 5.80"
  "Internal Eng 10.10" "Internal Eng 10.20" "Internal Eng 10.30" "Internal Eng 10.40" "Internal Eng 10.50"
  "External Attacker 113.10" "External Attacker 113.22" "External Attacker 113.45" "External C2 Server" "External Attacker 113.99"
  "External Suspicious 100.5" "External Suspicious 100.15" "External Cryptominer Pool" "External Suspicious 100.30" "External Suspicious 100.44"
  "Google DNS" "Cloudflare DNS"
)
declare -a IP_RISK=(
  30 25 28 22 35 20 32 27
  40 38 42 35 45
  96 82 77 99 88
  89 75 92 70 68
  5 5
)
declare -a IP_RISK_LEVELS=(
  "low" "low" "low" "low" "low" "low" "low" "low"
  "medium" "low" "medium" "low" "medium"
  "critical" "high" "high" "critical" "critical"
  "critical" "high" "critical" "high" "high"
  "low" "low"
)

for i in "${!IP_ADDRS[@]}"; do
  IP="${IP_ADDRS[$i]}"
  SLUG=$(echo "$IP" | tr '.' '-')
  ENT_ID="ent-ip-${SLUG}"
  DISPLAY="${IP_DISPLAYS[$i]}"
  RISK="${IP_RISK[$i]}"
  RISK_LEVEL="${IP_RISK_LEVELS[$i]}"
  ALERTS=$(( RANDOM % 10 ))
  TAGS="[\"constellation-seed\""
  [[ "$IP" == "203.0.113.88" ]] && TAGS+=",\"cluster-a\",\"c2-server\""
  [[ "$IP" == "198.51.100.22" ]] && TAGS+=",\"cluster-c\",\"cryptominer\""
  [[ "$IP" =~ ^203\.0\.113 ]] && TAGS+=",\"external-attacker\""
  [[ "$IP" =~ ^198\.51\.100 ]] && TAGS+=",\"external-suspicious\""
  [[ "$IP" =~ ^10\. ]] && TAGS+=",\"internal\""
  TAGS+="]"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"ip","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"geo":"%s","asn":"%s"},"tags":%s,"visibleBy":["default"]}\n' \
    "$ENT_ID" "$IP" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$ALERTS" \
    "$(days_ago $(( 10 + RANDOM % 90 )))" "$(random_ts_last_14d)" \
    "$([[ "$IP" =~ ^10\. ]] && echo "Internal" || echo "External")" \
    "$([[ "$IP" =~ ^10\. ]] && echo "AS-INTERNAL" || echo "AS$(( RANDOM % 60000 + 1000 ))")" \
    "$TAGS" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "IPs: 25 seeded (total: ${ENTITY_COUNT})"

# --- 10 Processes ---
info "Generating processes (10)..."
declare -a PROC_NAMES=(
  "powershell.exe" "cmd.exe" "svchost.exe" "rundll32.exe" "certutil.exe"
  "python3" "mimikatz.exe" "cobalt_strike.exe" "wscript.exe" "mshta.exe"
)
declare -a PROC_DISPLAYS=(
  "PowerShell" "Command Prompt" "Service Host" "RunDLL32" "CertUtil"
  "Python 3" "Mimikatz" "Cobalt Strike Beacon" "Windows Script Host" "MSHTA"
)
declare -a PROC_RISK=( 72 45 30 68 75 55 99 98 65 70 )
declare -a PROC_RISK_LEVELS=( "high" "medium" "low" "high" "high" "medium" "critical" "critical" "high" "high" )

for i in "${!PROC_NAMES[@]}"; do
  PROC="${PROC_NAMES[$i]}"
  SLUG=$(echo "$PROC" | tr '[:upper:]' '[:lower:]' | sed 's/\.exe$//' | tr '.' '-')
  ENT_ID="ent-process-${SLUG}"
  DISPLAY="${PROC_DISPLAYS[$i]}"
  RISK="${PROC_RISK[$i]}"
  RISK_LEVEL="${PROC_RISK_LEVELS[$i]}"
  ALERTS=$(( RANDOM % 12 ))
  TAGS="[\"constellation-seed\",\"process\""
  [[ "$PROC" == "mimikatz.exe" || "$PROC" == "cobalt_strike.exe" ]] && TAGS+=",\"malware-tool\""
  [[ "$PROC" == "powershell.exe" || "$PROC" == "cmd.exe" ]] && TAGS+=",\"living-off-the-land\""
  TAGS+="]"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"process","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"sha256":"e3b0c44298fc1c149afbf4c8996fb924%04x","signed":%s},"tags":%s,"visibleBy":["default"]}\n' \
    "$ENT_ID" "$PROC" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$ALERTS" \
    "$(days_ago $(( 5 + RANDOM % 30 )))" "$(random_ts_last_14d)" \
    "$(( RANDOM % 9999 ))" \
    "$([[ "$PROC" == "svchost.exe" || "$PROC" == "cmd.exe" ]] && echo "true" || echo "false")" \
    "$TAGS" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "Processes: 10 seeded (total: ${ENTITY_COUNT})"

# --- 5 Files ---
info "Generating files (5)..."
declare -a FILE_NAMES=( "beacon.dll" "payload.ps1" "exfil.zip" "dump.dmp" "implant.exe" )
declare -a FILE_DISPLAYS=( "Beacon DLL" "PowerShell Payload" "Exfiltration Archive" "Memory Dump" "Implant Binary" )
declare -a FILE_RISK=( 95 92 88 75 97 )
declare -a FILE_RISK_LEVELS=( "critical" "critical" "critical" "high" "critical" )

for i in "${!FILE_NAMES[@]}"; do
  FILE="${FILE_NAMES[$i]}"
  SLUG=$(echo "$FILE" | tr '[:upper:]' '[:lower:]' | sed 's/\./\-/')
  ENT_ID="ent-file-${SLUG}"
  DISPLAY="${FILE_DISPLAYS[$i]}"
  RISK="${FILE_RISK[$i]}"
  RISK_LEVEL="${FILE_RISK_LEVELS[$i]}"
  TAGS="[\"constellation-seed\",\"malicious-file\""
  [[ "$FILE" == "payload.ps1" ]] && TAGS+=",\"cluster-b\""
  TAGS+="]"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"file","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"sha256":"a1b2c3d4e5f6%04x%04x%04x%04x%04x","size":%d},"tags":%s,"visibleBy":["default"]}\n' \
    "$ENT_ID" "$FILE" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$(( 3 + RANDOM % 8 ))" \
    "$(days_ago $(( 2 + RANDOM % 12 )))" "$(random_ts_last_14d)" \
    "$(( RANDOM % 9999 ))" "$(( RANDOM % 9999 ))" "$(( RANDOM % 9999 ))" "$(( RANDOM % 9999 ))" "$(( RANDOM % 9999 ))" \
    "$(( 1024 + RANDOM % 500000 ))" \
    "$TAGS" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "Files: 5 seeded (total: ${ENTITY_COUNT})"

# --- 5 Domains ---
info "Generating domains (5)..."
declare -a DOMAIN_NAMES=( "cdn-update.xyz" "secure-login-portal.net" "microsft-update.com" "c2.malicious.io" "dl-patch.info" )
declare -a DOMAIN_DISPLAYS=( "Fake CDN Update" "Phishing Portal" "Typosquat MS Update" "C2 Server Domain" "Malware Download" )
declare -a DOMAIN_RISK=( 97 94 90 99 86 )
declare -a DOMAIN_RISK_LEVELS=( "critical" "critical" "critical" "critical" "critical" )

for i in "${!DOMAIN_NAMES[@]}"; do
  DOMAIN="${DOMAIN_NAMES[$i]}"
  SLUG=$(echo "$DOMAIN" | tr '.' '-')
  ENT_ID="ent-domain-${SLUG}"
  DISPLAY="${DOMAIN_DISPLAYS[$i]}"
  RISK="${DOMAIN_RISK[$i]}"
  RISK_LEVEL="${DOMAIN_RISK_LEVELS[$i]}"
  TAGS="[\"constellation-seed\",\"malicious-domain\""
  [[ "$DOMAIN" == "secure-login-portal.net" ]] && TAGS+=",\"cluster-b\""
  TAGS+="]"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$ENT_ID" >> "$ENTITY_BULK"
  printf '{"entityId":"%s","type":"domain","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","alertCount":%d,"firstSeen":"%s","lastSeen":"%s","metadata":{"registrar":"Unknown","registered":"%s"},"tags":%s,"visibleBy":["default"]}\n' \
    "$ENT_ID" "$DOMAIN" "$DISPLAY" "$RISK" "$RISK_LEVEL" "$(( 5 + RANDOM % 10 ))" \
    "$(days_ago $(( 3 + RANDOM % 20 )))" "$(random_ts_last_14d)" \
    "$(days_ago $(( 30 + RANDOM % 60 )))" \
    "$TAGS" >> "$ENTITY_BULK"
  (( ENTITY_COUNT++ ))
done
ok "Domains: 5 seeded (total: ${ENTITY_COUNT})"

# Index all entities via _bulk
info "Indexing ${ENTITY_COUNT} entities via _bulk API..."
RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "@${ENTITY_BULK}" 2>/dev/null)
if echo "$RESPONSE" | grep -q '"errors":true'; then
  warn "Some bulk indexing errors in entities (non-fatal, may be re-run)"
fi
rm -f "$ENTITY_BULK"
ok "Entity nodes indexed: ${ENTITY_COUNT} total"

# =============================================================================
# STEP 3: Seed 200+ relationship edges
# =============================================================================
header "Step 3: Seed relationship edges (200+ total)"

REL_BULK=$(mktemp /tmp/ha_constellation_rels_XXXXXX.ndjson)
REL_COUNT=0

# --- authenticated_to (30 edges): users→hosts ---
info "Generating authenticated_to relationships (30)..."
declare -a AUTH_PAIRS=(
  "ent-user-sarah-chen|ent-host-fin-wks-001|Interactive logon (daily)"
  "ent-user-sarah-chen|ent-host-fin-wks-002|RDP session"
  "ent-user-james-wilson|ent-host-eng-srv-001|SSH session"
  "ent-user-james-wilson|ent-host-eng-srv-002|SSH session"
  "ent-user-priya-sharma|ent-host-fin-wks-003|Interactive logon"
  "ent-user-priya-sharma|ent-host-eng-srv-003|RDP session"
  "ent-user-carlos-rodriguez|ent-host-fin-wks-044|Interactive logon (compromised)"
  "ent-user-carlos-rodriguez|ent-host-eng-srv-012|Lateral movement logon"
  "ent-user-carlos-rodriguez|ent-host-dc-001|DC authentication"
  "ent-user-aisha-thompson|ent-host-fin-wks-004|Interactive logon"
  "ent-user-david-nakamura|ent-host-eng-srv-004|SSH session"
  "ent-user-elena-volkov|ent-host-fin-wks-005|Interactive logon"
  "ent-user-marcus-bailey|ent-host-eng-srv-005|SSH session"
  "ent-user-admin-svc-01|ent-host-dc-001|Service logon"
  "ent-user-admin-svc-01|ent-host-dc-002|Service logon"
  "ent-user-admin-svc-02|ent-host-eng-srv-001|Service logon"
  "ent-user-admin-svc-02|ent-host-eng-srv-002|Service logon"
  "ent-user-admin-svc-03|ent-host-dc-003|Service logon"
  "ent-user-admin-svc-04|ent-host-fin-wks-006|Service logon"
  "ent-user-admin-svc-05|ent-host-eng-srv-007|Service logon"
  "ent-user-svc-backup|ent-host-eng-srv-008|Backup service logon"
  "ent-user-svc-backup|ent-host-dc-001|Backup service logon"
  "ent-user-svc-monitoring|ent-host-eng-srv-009|Monitoring agent"
  "ent-user-svc-monitoring|ent-host-dc-002|Monitoring agent"
  "ent-user-svc-deploy|ent-host-eng-srv-005|Deploy service logon"
  "ent-user-svc-deploy|ent-host-eng-srv-006|Deploy service logon"
  "ent-user-svc-deploy|ent-host-eng-srv-008|Deploy service logon"
  "ent-user-kevin-wright|ent-host-fin-wks-007|Interactive logon"
  "ent-user-tom-huang|ent-host-eng-srv-010|SSH session"
  "ent-user-alex-turner|ent-host-fin-wks-008|Interactive logon"
)

for PAIR in "${AUTH_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SLUG="${SRC#ent-user-}"
  TGT_SLUG="${TGT#ent-host-}"
  REL_ID="rel-authenticated-to-${SRC_SLUG}-${TGT_SLUG}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 60 + RANDOM % 40 ))"
  EVT_COUNT=$(( 10 + RANDOM % 200 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 5 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "authenticated_to")
  FIRST_SEEN=$(days_ago $(( 7 + RANDOM % 60 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"authenticated_to","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "authenticated_to: 30 edges (total: ${REL_COUNT})"

# --- communicated_with (50 edges): hosts→IPs ---
info "Generating communicated_with relationships (50)..."
declare -a COMM_PAIRS=(
  "ent-host-fin-wks-044|ent-ip-203-0-113-88|HTTPS beaconing (C2)"
  "ent-host-fin-wks-044|ent-host-eng-srv-012|SMB (12 sessions)"
  "ent-host-eng-srv-012|ent-host-dc-001|LDAP queries"
  "ent-host-eng-srv-012|ent-ip-203-0-113-88|HTTPS exfil"
  "ent-host-fin-wks-001|ent-ip-10-1-5-10|Internal file share"
  "ent-host-fin-wks-002|ent-ip-10-1-5-20|Internal file share"
  "ent-host-fin-wks-003|ent-ip-10-1-5-30|Internal file share"
  "ent-host-fin-wks-004|ent-ip-10-1-5-40|Internal traffic"
  "ent-host-fin-wks-005|ent-ip-10-1-5-50|Internal traffic"
  "ent-host-fin-wks-006|ent-ip-10-1-5-60|Internal traffic"
  "ent-host-fin-wks-007|ent-ip-10-1-5-70|Internal traffic"
  "ent-host-fin-wks-008|ent-ip-10-1-5-80|Internal traffic"
  "ent-host-eng-srv-001|ent-ip-10-1-10-10|Server traffic"
  "ent-host-eng-srv-002|ent-ip-10-1-10-20|Server traffic"
  "ent-host-eng-srv-003|ent-ip-10-1-10-30|Server traffic"
  "ent-host-eng-srv-004|ent-ip-10-1-10-40|Server traffic"
  "ent-host-eng-srv-005|ent-ip-10-1-10-50|Server traffic"
  "ent-host-eng-srv-005|ent-ip-198-51-100-22|Cryptominer pool connection"
  "ent-host-eng-srv-006|ent-ip-198-51-100-22|Cryptominer pool connection"
  "ent-host-eng-srv-008|ent-ip-198-51-100-22|Cryptominer pool connection"
  "ent-host-eng-srv-006|ent-host-eng-srv-005|Internal P2P mining"
  "ent-host-eng-srv-008|ent-host-eng-srv-006|Internal P2P mining"
  "ent-host-hr-lpt-001|ent-ip-203-0-113-99|Phishing callback"
  "ent-host-hr-lpt-001|ent-host-hr-lpt-003|Internal spread"
  "ent-host-hr-lpt-003|ent-host-hr-lpt-007|Internal spread"
  "ent-host-hr-lpt-007|ent-domain-secure-login-portal-net|C2 communication"
  "ent-host-fin-wks-001|ent-host-dc-001|Domain auth"
  "ent-host-fin-wks-002|ent-host-dc-001|Domain auth"
  "ent-host-fin-wks-003|ent-host-dc-001|Domain auth"
  "ent-host-fin-wks-004|ent-host-dc-002|Domain auth"
  "ent-host-fin-wks-005|ent-host-dc-002|Domain auth"
  "ent-host-eng-srv-001|ent-host-dc-001|Domain auth"
  "ent-host-eng-srv-002|ent-host-dc-001|Domain auth"
  "ent-host-eng-srv-003|ent-host-dc-002|Domain auth"
  "ent-host-eng-srv-004|ent-host-dc-002|Domain auth"
  "ent-host-eng-srv-005|ent-host-dc-003|Domain auth"
  "ent-host-eng-srv-006|ent-host-dc-003|Domain auth"
  "ent-host-eng-srv-007|ent-host-dc-003|Domain auth"
  "ent-host-fin-wks-009|ent-ip-8-8-8-8|DNS queries"
  "ent-host-fin-wks-010|ent-ip-8-8-8-8|DNS queries"
  "ent-host-eng-srv-008|ent-ip-1-1-1-1|DNS queries"
  "ent-host-eng-srv-009|ent-ip-1-1-1-1|DNS queries"
  "ent-host-fin-wks-011|ent-ip-203-0-113-10|Suspicious connection"
  "ent-host-fin-wks-012|ent-ip-198-51-100-5|Suspicious connection"
  "ent-host-eng-srv-010|ent-ip-203-0-113-22|Suspicious connection"
  "ent-host-fin-wks-013|ent-ip-198-51-100-15|Suspicious connection"
  "ent-host-fin-wks-014|ent-ip-203-0-113-45|Suspicious connection"
  "ent-host-dc-001|ent-ip-10-1-10-10|DC replication"
  "ent-host-dc-002|ent-ip-10-1-10-20|DC replication"
  "ent-host-dc-003|ent-ip-10-1-10-30|DC replication"
)

for PAIR in "${COMM_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SLUG="${SRC#ent-*-}"
  TGT_SLUG="${TGT#ent-*-}"
  # Extract a cleaner slug
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-communicated-with-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 50 + RANDOM % 50 ))"
  EVT_COUNT=$(( 5 + RANDOM % 1500 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 5 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "communicated_with")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 14 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"communicated_with","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "communicated_with: 50 edges (total: ${REL_COUNT})"

# --- executed_on (25 edges): processes→hosts ---
info "Generating executed_on relationships (25)..."
declare -a EXEC_PAIRS=(
  "ent-process-powershell|ent-host-fin-wks-044|Encoded command execution"
  "ent-process-powershell|ent-host-eng-srv-012|Download cradle"
  "ent-process-powershell|ent-host-hr-lpt-001|Payload execution"
  "ent-process-powershell|ent-host-hr-lpt-003|Lateral script"
  "ent-process-powershell|ent-host-fin-wks-001|Admin task"
  "ent-process-cmd|ent-host-fin-wks-044|Recon commands"
  "ent-process-cmd|ent-host-eng-srv-001|Scheduled task"
  "ent-process-cmd|ent-host-dc-001|Domain enumeration"
  "ent-process-cmd|ent-host-eng-srv-005|Mining setup"
  "ent-process-svchost|ent-host-dc-001|Normal service"
  "ent-process-svchost|ent-host-dc-002|Normal service"
  "ent-process-svchost|ent-host-dc-003|Normal service"
  "ent-process-rundll32|ent-host-fin-wks-044|DLL sideload"
  "ent-process-rundll32|ent-host-hr-lpt-007|Suspicious DLL load"
  "ent-process-certutil|ent-host-eng-srv-012|File download via certutil"
  "ent-process-certutil|ent-host-fin-wks-003|Certificate operation"
  "ent-process-python3|ent-host-eng-srv-005|Cryptominer script"
  "ent-process-python3|ent-host-eng-srv-006|Mining worker"
  "ent-process-python3|ent-host-eng-srv-008|Mining worker"
  "ent-process-mimikatz|ent-host-fin-wks-044|Credential dump"
  "ent-process-mimikatz|ent-host-eng-srv-012|Pass-the-hash"
  "ent-process-cobalt-strike|ent-host-fin-wks-044|Beacon callback"
  "ent-process-cobalt-strike|ent-host-eng-srv-012|Beacon lateral"
  "ent-process-wscript|ent-host-hr-lpt-001|VBS dropper"
  "ent-process-mshta|ent-host-hr-lpt-003|HTA payload"
)

for PAIR in "${EXEC_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-executed-on-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 55 + RANDOM % 45 ))"
  EVT_COUNT=$(( 1 + RANDOM % 50 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 5 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "executed_on")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 14 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"executed_on","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "executed_on: 25 edges (total: ${REL_COUNT})"

# --- resolved_to (15 edges): domains→IPs ---
info "Generating resolved_to relationships (15)..."
declare -a DNS_PAIRS=(
  "ent-domain-cdn-update-xyz|ent-ip-203-0-113-10|A record resolution"
  "ent-domain-cdn-update-xyz|ent-ip-203-0-113-22|Secondary A record"
  "ent-domain-cdn-update-xyz|ent-ip-198-51-100-5|Fallback resolution"
  "ent-domain-secure-login-portal-net|ent-ip-203-0-113-45|A record resolution"
  "ent-domain-secure-login-portal-net|ent-ip-203-0-113-99|Secondary A record"
  "ent-domain-secure-login-portal-net|ent-ip-198-51-100-15|Rotating IP"
  "ent-domain-microsft-update-com|ent-ip-203-0-113-10|A record resolution"
  "ent-domain-microsft-update-com|ent-ip-198-51-100-30|Secondary"
  "ent-domain-c2-malicious-io|ent-ip-203-0-113-88|Primary C2 resolution"
  "ent-domain-c2-malicious-io|ent-ip-203-0-113-22|Backup C2 IP"
  "ent-domain-c2-malicious-io|ent-ip-198-51-100-44|Failover resolution"
  "ent-domain-dl-patch-info|ent-ip-198-51-100-5|A record resolution"
  "ent-domain-dl-patch-info|ent-ip-203-0-113-45|Secondary"
  "ent-domain-dl-patch-info|ent-ip-198-51-100-30|Tertiary"
  "ent-domain-cdn-update-xyz|ent-ip-198-51-100-44|Fast-flux rotation"
)

for PAIR in "${DNS_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-resolved-to-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 70 + RANDOM % 30 ))"
  EVT_COUNT=$(( 20 + RANDOM % 500 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "resolved_to")
  FIRST_SEEN=$(days_ago $(( 2 + RANDOM % 14 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"resolved_to","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "resolved_to: 15 edges (total: ${REL_COUNT})"

# --- dropped_by (10 edges): files→processes ---
info "Generating dropped_by relationships (10)..."
declare -a DROP_PAIRS=(
  "ent-file-beacon-dll|ent-process-cobalt-strike|Beacon DLL dropped by CS"
  "ent-file-beacon-dll|ent-process-rundll32|Loaded via rundll32"
  "ent-file-payload-ps1|ent-process-powershell|Script written to disk"
  "ent-file-payload-ps1|ent-process-wscript|Dropped by VBS macro"
  "ent-file-exfil-zip|ent-process-powershell|Archive created for staging"
  "ent-file-exfil-zip|ent-process-cmd|Compressed via command line"
  "ent-file-dump-dmp|ent-process-mimikatz|LSASS memory dump"
  "ent-file-dump-dmp|ent-process-powershell|Created via Out-Minidump"
  "ent-file-implant-exe|ent-process-certutil|Downloaded via certutil"
  "ent-file-implant-exe|ent-process-powershell|Invoke-WebRequest download"
)

for PAIR in "${DROP_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-dropped-by-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 65 + RANDOM % 35 ))"
  EVT_COUNT=$(( 1 + RANDOM % 15 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 3 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "dropped_by")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 10 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"dropped_by","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "dropped_by: 10 edges (total: ${REL_COUNT})"

# --- accessed_from (20 edges): hosts→hosts (lateral movement) ---
info "Generating accessed_from relationships (20)..."
declare -a ACCESS_PAIRS=(
  "ent-host-fin-wks-044|ent-host-eng-srv-012|SMB admin share access"
  "ent-host-eng-srv-012|ent-host-dc-001|LDAP + Kerberos"
  "ent-host-fin-wks-044|ent-host-dc-001|Pass-the-ticket"
  "ent-host-hr-lpt-001|ent-host-hr-lpt-003|SMB lateral spread"
  "ent-host-hr-lpt-003|ent-host-hr-lpt-007|RDP pivot"
  "ent-host-eng-srv-005|ent-host-eng-srv-006|SSH tunnel"
  "ent-host-eng-srv-006|ent-host-eng-srv-008|SSH tunnel"
  "ent-host-eng-srv-005|ent-host-eng-srv-008|Direct SSH"
  "ent-host-fin-wks-001|ent-host-fin-wks-002|SMB file share"
  "ent-host-fin-wks-003|ent-host-fin-wks-004|RDP session"
  "ent-host-eng-srv-001|ent-host-eng-srv-002|SSH key-based"
  "ent-host-eng-srv-003|ent-host-eng-srv-004|SSH key-based"
  "ent-host-fin-wks-005|ent-host-print-001|Print job"
  "ent-host-fin-wks-010|ent-host-print-002|Print job"
  "ent-host-dc-001|ent-host-dc-002|DC replication"
  "ent-host-dc-002|ent-host-dc-003|DC replication"
  "ent-host-fin-wks-009|ent-host-dc-001|Group policy fetch"
  "ent-host-eng-srv-007|ent-host-dc-003|Group policy fetch"
  "ent-host-fin-wks-011|ent-host-dc-002|Group policy fetch"
  "ent-host-eng-srv-009|ent-host-dc-001|WSUS update check"
)

for PAIR in "${ACCESS_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-accessed-from-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 50 + RANDOM % 50 ))"
  EVT_COUNT=$(( 3 + RANDOM % 100 ))
  EVIDENCE_COUNT=$(( 1 + RANDOM % 5 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "accessed_from")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 14 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"accessed_from","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "accessed_from: 20 edges (total: ${REL_COUNT})"

# --- exfiltrated_to (10 edges): hosts→IPs/domains ---
info "Generating exfiltrated_to relationships (10)..."
declare -a EXFIL_PAIRS=(
  "ent-host-fin-wks-044|ent-ip-203-0-113-88|Large HTTPS upload (45MB)"
  "ent-host-fin-wks-044|ent-domain-cdn-update-xyz|Staged data exfil"
  "ent-host-eng-srv-012|ent-ip-203-0-113-88|Database dump transfer"
  "ent-host-eng-srv-012|ent-domain-c2-malicious-io|Encrypted exfil channel"
  "ent-host-hr-lpt-007|ent-domain-secure-login-portal-net|Credential harvest upload"
  "ent-host-hr-lpt-003|ent-ip-203-0-113-99|Email archive exfil"
  "ent-host-fin-wks-001|ent-ip-198-51-100-5|Suspicious large transfer"
  "ent-host-eng-srv-001|ent-ip-203-0-113-10|Encoded data upload"
  "ent-host-fin-wks-003|ent-domain-dl-patch-info|Compressed archive sent"
  "ent-host-eng-srv-010|ent-ip-198-51-100-15|Unusual outbound volume"
)

for PAIR in "${EXFIL_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-exfiltrated-to-${SRC_SHORT}-${TGT_SHORT}"
  CONF=$(random_confidence)
  STRENGTH="0.$(( 60 + RANDOM % 40 ))"
  EVT_COUNT=$(( 1 + RANDOM % 20 ))
  EVIDENCE_COUNT=$(( 2 + RANDOM % 4 ))
  EVIDENCE=$(generate_evidence $EVIDENCE_COUNT "exfiltrated_to")
  FIRST_SEEN=$(days_ago $(( 1 + RANDOM % 7 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"exfiltrated_to","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "exfiltrated_to: 10 edges (total: ${REL_COUNT})"

# --- belongs_to (40 edges): hosts→subnet groups, users→AD groups ---
info "Generating belongs_to relationships (40)..."
declare -a BELONGS_PAIRS=(
  "ent-host-fin-wks-001|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-002|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-003|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-004|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-005|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-006|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-007|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-008|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-fin-wks-044|ent-group-finance-subnet|Finance VLAN member"
  "ent-host-eng-srv-001|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-002|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-003|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-004|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-005|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-006|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-007|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-008|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-eng-srv-012|ent-group-engineering-subnet|Engineering VLAN member"
  "ent-host-dc-001|ent-group-dc-subnet|Domain Controllers"
  "ent-host-dc-002|ent-group-dc-subnet|Domain Controllers"
  "ent-host-dc-003|ent-group-dc-subnet|Domain Controllers"
  "ent-host-hr-lpt-001|ent-group-hr-subnet|HR VLAN member"
  "ent-host-hr-lpt-003|ent-group-hr-subnet|HR VLAN member"
  "ent-host-hr-lpt-007|ent-group-hr-subnet|HR VLAN member"
  "ent-user-sarah-chen|ent-group-ad-finance|AD Finance Group"
  "ent-user-priya-sharma|ent-group-ad-finance|AD Finance Group"
  "ent-user-carlos-rodriguez|ent-group-ad-finance|AD Finance Group"
  "ent-user-elena-volkov|ent-group-ad-finance|AD Finance Group"
  "ent-user-james-wilson|ent-group-ad-engineering|AD Engineering Group"
  "ent-user-david-nakamura|ent-group-ad-engineering|AD Engineering Group"
  "ent-user-marcus-bailey|ent-group-ad-engineering|AD Engineering Group"
  "ent-user-tom-huang|ent-group-ad-engineering|AD Engineering Group"
  "ent-user-admin-svc-01|ent-group-ad-domain-admins|Domain Admins"
  "ent-user-admin-svc-02|ent-group-ad-domain-admins|Domain Admins"
  "ent-user-admin-svc-03|ent-group-ad-domain-admins|Domain Admins"
  "ent-user-svc-backup|ent-group-ad-backup-operators|Backup Operators"
  "ent-user-svc-deploy|ent-group-ad-engineering|AD Engineering Group"
  "ent-user-svc-monitoring|ent-group-ad-monitoring|Monitoring Group"
  "ent-user-aisha-thompson|ent-group-ad-hr|AD HR Group"
  "ent-user-kevin-wright|ent-group-ad-finance|AD Finance Group"
)

# First, create the group entities
declare -a GROUP_ENTITIES=(
  "ent-group-finance-subnet|group|Finance Subnet (10.1.5.0/24)|Finance VLAN"
  "ent-group-engineering-subnet|group|Engineering Subnet (10.1.10.0/24)|Engineering VLAN"
  "ent-group-dc-subnet|group|Domain Controllers (10.1.1.0/24)|DC Subnet"
  "ent-group-hr-subnet|group|HR Subnet (10.1.20.0/24)|HR VLAN"
  "ent-group-ad-finance|group|AD Finance Group|Active Directory"
  "ent-group-ad-engineering|group|AD Engineering Group|Active Directory"
  "ent-group-ad-domain-admins|group|Domain Admins|Active Directory"
  "ent-group-ad-backup-operators|group|Backup Operators|Active Directory"
  "ent-group-ad-monitoring|group|Monitoring Group|Active Directory"
  "ent-group-ad-hr|group|AD HR Group|Active Directory"
)

# Seed group entities
for GROUP_DEF in "${GROUP_ENTITIES[@]}"; do
  IFS='|' read -r GRP_ID GRP_TYPE GRP_DISPLAY GRP_META <<< "$GROUP_DEF"
  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$ENTITY_IDX" "$GRP_ID" >> "$REL_BULK"
  printf '{"entityId":"%s","type":"group","value":"%s","displayName":"%s","riskScore":10,"riskLevel":"low","alertCount":0,"firstSeen":"%s","lastSeen":"%s","metadata":{"groupType":"%s"},"tags":["constellation-seed","infrastructure"],"visibleBy":["default"]}\n' \
    "$GRP_ID" "$GRP_DISPLAY" "$GRP_DISPLAY" "$(days_ago 365)" "$(random_ts_last_14d)" "$GRP_META" >> "$REL_BULK"
  (( ENTITY_COUNT++ ))
done

for PAIR in "${BELONGS_PAIRS[@]}"; do
  IFS='|' read -r SRC TGT LABEL <<< "$PAIR"
  SRC_SHORT=$(echo "$SRC" | sed 's/^ent-[a-z]*-//')
  TGT_SHORT=$(echo "$TGT" | sed 's/^ent-[a-z]*-//')
  REL_ID="rel-belongs-to-${SRC_SHORT}-${TGT_SHORT}"
  CONF="0.99"
  STRENGTH="0.95"
  EVT_COUNT=1
  EVIDENCE=$(generate_evidence 1 "belongs_to")
  FIRST_SEEN=$(days_ago $(( 90 + RANDOM % 200 )))
  LAST_SEEN=$(random_ts_last_14d)

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$REL_IDX" "$REL_ID" >> "$REL_BULK"
  printf '{"relationshipId":"%s","source":"%s","target":"%s","relationshipType":"belongs_to","strength":%s,"confidence":%s,"label":"%s","eventCount":%d,"firstSeen":"%s","lastSeen":"%s","evidence":%s,"visibleBy":["default"]}\n' \
    "$REL_ID" "$SRC" "$TGT" "$STRENGTH" "$CONF" "$LABEL" "$EVT_COUNT" "$FIRST_SEEN" "$LAST_SEEN" "$EVIDENCE" >> "$REL_BULK"
  (( REL_COUNT++ ))
done
ok "belongs_to: 40 edges (total: ${REL_COUNT})"

# Index all relationships via _bulk
info "Indexing ${REL_COUNT} relationships via _bulk API..."
# Split into chunks to avoid request-too-large
split -l 2000 "$REL_BULK" /tmp/ha_constellation_rels_chunk_
for CHUNK in /tmp/ha_constellation_rels_chunk_*; do
  RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
    -H "Content-Type: application/x-ndjson" \
    --data-binary "@${CHUNK}" 2>/dev/null)
  if echo "$RESPONSE" | grep -q '"errors":true'; then
    warn "Some bulk indexing errors in relationships (non-fatal)"
  fi
  rm -f "$CHUNK"
done
rm -f "$REL_BULK"
ok "Relationship edges indexed: ${REL_COUNT} total"

# Refresh indices for immediate searchability
${CURL_OS} -X POST "${OS_URL}/${ENTITY_IDX}/_refresh" 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/${REL_IDX}/_refresh" 2>/dev/null > /dev/null || true

# =============================================================================
# STEP 4: Verify seeded data
# =============================================================================
header "Step 4: Verification"

# Count entities
ENT_RESULT=$(${CURL_OS} "${OS_URL}/${ENTITY_IDX}/_count" \
  -H "Content-Type: application/json" \
  -d '{"query":{"term":{"tags.keyword":"constellation-seed"}}}' 2>/dev/null)
ENT_TOTAL=$(echo "$ENT_RESULT" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
info "Entities in index: ${ENT_TOTAL:-unknown}"
if [[ "${ENT_TOTAL:-0}" -ge 100 ]]; then
  ok "Entity count ≥ 100 ✓"
else
  warn "Entity count < 100 (got ${ENT_TOTAL:-0})"
fi

# Count relationships
REL_RESULT=$(${CURL_OS} "${OS_URL}/${REL_IDX}/_count" 2>/dev/null)
REL_TOTAL=$(echo "$REL_RESULT" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
info "Relationships in index: ${REL_TOTAL:-unknown}"
if [[ "${REL_TOTAL:-0}" -ge 200 ]]; then
  ok "Relationship count ≥ 200 ✓"
else
  warn "Relationship count < 200 (got ${REL_TOTAL:-0})"
fi

# Verify Cluster A connectivity (FIN-WKS-044)
info "Verifying Cluster A (Finance compromise)..."
CLUSTER_A=$(${CURL_OS} "${OS_URL}/${REL_IDX}/_count" \
  -H "Content-Type: application/json" \
  -d '{"query":{"bool":{"should":[{"term":{"source.keyword":"ent-host-fin-wks-044"}},{"term":{"target.keyword":"ent-host-fin-wks-044"}}]}}}' 2>/dev/null)
CLUSTER_A_COUNT=$(echo "$CLUSTER_A" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [[ "${CLUSTER_A_COUNT:-0}" -ge 4 ]]; then
  ok "Cluster A (FIN-WKS-044): ${CLUSTER_A_COUNT} connected edges ✓"
else
  warn "Cluster A connectivity low: ${CLUSTER_A_COUNT:-0} edges"
fi

# Verify Cluster B connectivity (HR-LPT-001)
info "Verifying Cluster B (Phishing chain)..."
CLUSTER_B=$(${CURL_OS} "${OS_URL}/${REL_IDX}/_count" \
  -H "Content-Type: application/json" \
  -d '{"query":{"bool":{"should":[{"term":{"source.keyword":"ent-host-hr-lpt-001"}},{"term":{"target.keyword":"ent-host-hr-lpt-001"}},{"term":{"source.keyword":"ent-host-hr-lpt-003"}},{"term":{"target.keyword":"ent-host-hr-lpt-003"}},{"term":{"source.keyword":"ent-host-hr-lpt-007"}},{"term":{"target.keyword":"ent-host-hr-lpt-007"}}]}}}' 2>/dev/null)
CLUSTER_B_COUNT=$(echo "$CLUSTER_B" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [[ "${CLUSTER_B_COUNT:-0}" -ge 5 ]]; then
  ok "Cluster B (HR phishing): ${CLUSTER_B_COUNT} connected edges ✓"
else
  warn "Cluster B connectivity low: ${CLUSTER_B_COUNT:-0} edges"
fi

# Verify Cluster C connectivity (ENG-SRV-005)
info "Verifying Cluster C (Cryptominer)..."
CLUSTER_C=$(${CURL_OS} "${OS_URL}/${REL_IDX}/_count" \
  -H "Content-Type: application/json" \
  -d '{"query":{"bool":{"should":[{"term":{"source.keyword":"ent-host-eng-srv-005"}},{"term":{"target.keyword":"ent-host-eng-srv-005"}},{"term":{"source.keyword":"ent-host-eng-srv-006"}},{"term":{"target.keyword":"ent-host-eng-srv-006"}},{"term":{"source.keyword":"ent-host-eng-srv-008"}},{"term":{"target.keyword":"ent-host-eng-srv-008"}}]}}}' 2>/dev/null)
CLUSTER_C_COUNT=$(echo "$CLUSTER_C" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [[ "${CLUSTER_C_COUNT:-0}" -ge 5 ]]; then
  ok "Cluster C (Cryptominer): ${CLUSTER_C_COUNT} connected edges ✓"
else
  warn "Cluster C connectivity low: ${CLUSTER_C_COUNT:-0} edges"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Seed Complete                                                      ${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Entities:       ${GREEN}${ENTITY_COUNT}${NC} (hosts: 35, users: 25, IPs: 25, processes: 10, files: 5, domains: 5, groups: 10)"
echo -e "  Relationships:  ${GREEN}${REL_COUNT}${NC} (auth: 30, comm: 50, exec: 25, dns: 15, drop: 10, access: 20, exfil: 10, belongs: 40)"
echo -e "  Clusters:       ${GREEN}3${NC} (Finance compromise, Phishing chain, Cryptominer)"
echo -e "  Confidence:     30% high (0.85-1.0), 40% medium (0.5-0.84), 30% low (0.3-0.49)"
echo ""
echo -e "  ${CYAN}Cluster A:${NC} FIN-WKS-044 → ENG-SRV-012 → DC-001 (carlos.rodriguez, 203.0.113.88)"
echo -e "  ${CYAN}Cluster B:${NC} HR-LPT-001 → HR-LPT-003 → HR-LPT-007 (payload.ps1, secure-login-portal.net)"
echo -e "  ${CYAN}Cluster C:${NC} ENG-SRV-005 → ENG-SRV-006 → ENG-SRV-008 (svc-deploy, 198.51.100.22)"
echo ""
echo -e "  Run ${YELLOW}bash seed-constellation-graph.sh --teardown${NC} to remove this data"
echo ""
