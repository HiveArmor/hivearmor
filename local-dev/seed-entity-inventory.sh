#!/usr/bin/env bash
# =============================================================================
# seed-entity-inventory.sh — Sprint 45 Entity Intelligence test data
#
# Seeds 200 entities across 3 tenants into OpenSearch:
#   - CWM (tenant 1):        90 entities (36 hosts, 27 users, 18 IPs, 9 domains)
#   - Workmates1 (tenant 2): 60 entities (24 hosts, 18 users, 12 IPs, 6 domains)
#   - Workmates2 (tenant 3): 50 entities (20 hosts, 15 users, 10 IPs, 5 domains)
#
# Risk distribution: 30 critical(80-100), 50 high(60-79), 70 medium(30-59), 50 low(0-29)
# Trend distribution: 40 rising, 120 stable, 40 declining
# Criticality: 20 critical, 40 high, 80 medium, 40 low, 20 unclassified
#
# Usage:
#   cd local-dev && bash seed-entity-inventory.sh
#   cd local-dev && bash seed-entity-inventory.sh --teardown
#
# Prerequisites:
#   - OpenSearch on https://localhost:9200 (admin / LocalDev@2024!)
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

# Date helpers — compute relative dates
NOW_EPOCH=$(date +%s)
days_ago() {
  local days=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -j -f "%s" "$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  else
    date -u -d "@$(( NOW_EPOCH - days * 86400 ))" "+%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

# ─── Teardown ───────────────────────────────────────────────────────────────────
teardown() {
  header "Teardown — removing Sprint 45 entity seed data"
  for IDX in v3-hive-entity-cwm v3-hive-entity-workmates1 v3-hive-entity-workmates2; do
    ${CURL_OS} -X DELETE "${OS_URL}/${IDX}" 2>/dev/null > /dev/null || true
  done
  ok "Entity indices deleted"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 45 Entity Intelligence Seed (200 entities)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "OpenSearch: ${OS_URL}"
echo ""

# ─── Step 0: Clean previous data ────────────────────────────────────────────────
header "Step 0: Remove previous entity seed data (idempotent)"
for IDX in v3-hive-entity-cwm v3-hive-entity-workmates1 v3-hive-entity-workmates2; do
  ${CURL_OS} -X DELETE "${OS_URL}/${IDX}" 2>/dev/null > /dev/null || true
done
ok "Previous entity indices removed"

# ─── Step 1: Create indices ─────────────────────────────────────────────────────
header "Step 1: Create entity indices"
for IDX in v3-hive-entity-cwm v3-hive-entity-workmates1 v3-hive-entity-workmates2; do
  ${CURL_OS} -X PUT "${OS_URL}/${IDX}" \
    -H "Content-Type: application/json" \
    -d '{"settings":{"number_of_shards":1,"number_of_replicas":0}}' \
    2>/dev/null > /dev/null
done
ok "Indices created: v3-hive-entity-cwm, v3-hive-entity-workmates1, v3-hive-entity-workmates2"

# ─── Step 2: Build bulk payload ─────────────────────────────────────────────────
header "Step 2: Generate and index 200 entities"

BULK_FILE=$(mktemp /tmp/ha_entity_bulk_XXXXXX.ndjson)
trap "rm -f ${BULK_FILE}" EXIT

# Helper: append one entity document to the bulk file
# Usage: add_entity INDEX ID TYPE VALUE DISPLAY_NAME RISK_SCORE RISK_LEVEL RISK_TREND \
#                  CRITICALITY ALERT_COUNT BASELINE_DEV FIRST_SEEN LAST_SEEN TENANT_ID \
#                  TAGS OBS_SOURCES
add_entity() {
  local index="$1" id="$2" type="$3" value="$4" displayName="$5"
  local riskScore="$6" riskLevel="$7" riskTrend="$8" criticality="$9"
  local alertCount="${10}" baselineDev="${11}" firstSeen="${12}" lastSeen="${13}"
  local tenantId="${14}" tags="${15}" obsSources="${16}"

  printf '{"index":{"_index":"%s","_id":"%s"}}\n' "$index" "$id" >> "$BULK_FILE"
  printf '{"id":"%s","type":"%s","value":"%s","displayName":"%s","riskScore":%d,"riskLevel":"%s","riskTrend":"%s","criticality":"%s","alertCount":%d,"baselineDeviation":%s,"firstSeen":"%s","lastSeen":"%s","tenantId":%d,"tags":%s,"observationSources":%s}\n' \
    "$id" "$type" "$value" "$displayName" "$riskScore" "$riskLevel" "$riskTrend" \
    "$criticality" "$alertCount" "$baselineDev" "$firstSeen" "$lastSeen" \
    "$tenantId" "$tags" "$obsSources" >> "$BULK_FILE"
}

# =============================================================================
# TENANT 1: CWM — 90 entities (36 hosts, 27 users, 18 IPs, 9 domains)
# =============================================================================
IDX_CWM="v3-hive-entity-cwm"
TID_CWM=1

# ─── CWM Hosts (36) ─────────────────────────────────────────────────────────────
# ENG-SRV-001 to ENG-SRV-014 (14 engineering servers)
add_entity "$IDX_CWM" "ent-host-eng-srv-001" "host" "ENG-SRV-001" "Engineering Server 001" \
  95 "critical" "rising" "critical" 18 "0.92" "$(days_ago 300)" "$(days_ago 0)" $TID_CWM \
  '["engineering","linux","critical-infra"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-002" "host" "ENG-SRV-002" "Engineering Server 002" \
  72 "high" "stable" "high" 6 "0.31" "$(days_ago 280)" "$(days_ago 1)" $TID_CWM \
  '["engineering","linux","production"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-003" "host" "ENG-SRV-003" "Engineering Server 003" \
  65 "high" "stable" "medium" 4 "0.22" "$(days_ago 250)" "$(days_ago 2)" $TID_CWM \
  '["engineering","linux","staging"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-004" "host" "ENG-SRV-004" "Engineering Server 004" \
  48 "medium" "stable" "medium" 2 "0.18" "$(days_ago 200)" "$(days_ago 3)" $TID_CWM \
  '["engineering","linux","development"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-005" "host" "ENG-SRV-005" "Engineering Server 005" \
  42 "medium" "declining" "medium" 1 "0.12" "$(days_ago 190)" "$(days_ago 5)" $TID_CWM \
  '["engineering","linux","development"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-006" "host" "ENG-SRV-006" "Engineering Server 006" \
  38 "medium" "stable" "medium" 1 "0.15" "$(days_ago 180)" "$(days_ago 4)" $TID_CWM \
  '["engineering","linux","ci-cd"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-007" "host" "ENG-SRV-007" "Engineering Server 007" \
  55 "medium" "rising" "medium" 3 "0.68" "$(days_ago 170)" "$(days_ago 1)" $TID_CWM \
  '["engineering","linux","build"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-008" "host" "ENG-SRV-008" "Engineering Server 008" \
  25 "low" "declining" "low" 0 "0.10" "$(days_ago 160)" "$(days_ago 8)" $TID_CWM \
  '["engineering","linux","test"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-009" "host" "ENG-SRV-009" "Engineering Server 009" \
  18 "low" "declining" "low" 0 "0.08" "$(days_ago 150)" "$(days_ago 10)" $TID_CWM \
  '["engineering","linux","test"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-010" "host" "ENG-SRV-010" "Engineering Server 010" \
  82 "critical" "rising" "high" 12 "0.85" "$(days_ago 140)" "$(days_ago 0)" $TID_CWM \
  '["engineering","linux","production"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-011" "host" "ENG-SRV-011" "Engineering Server 011" \
  33 "medium" "stable" "medium" 1 "0.20" "$(days_ago 200)" "$(days_ago 6)" $TID_CWM \
  '["engineering","linux","staging"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-012" "host" "ENG-SRV-012" "Engineering Server 012" \
  28 "low" "declining" "low" 0 "0.05" "$(days_ago 210)" "$(days_ago 12)" $TID_CWM \
  '["engineering","linux","archive"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-013" "host" "ENG-SRV-013" "Engineering Server 013" \
  45 "medium" "stable" "medium" 2 "0.25" "$(days_ago 220)" "$(days_ago 3)" $TID_CWM \
  '["engineering","linux","monitoring"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-eng-srv-014" "host" "ENG-SRV-014" "Engineering Server 014" \
  61 "high" "stable" "medium" 5 "0.30" "$(days_ago 230)" "$(days_ago 2)" $TID_CWM \
  '["engineering","linux","production"]' '["endpoint","network"]'

# FIN-WKS-001 to FIN-WKS-012 (12 finance workstations)
add_entity "$IDX_CWM" "ent-host-fin-wks-001" "host" "FIN-WKS-001" "Finance Workstation 001" \
  88 "critical" "rising" "high" 15 "0.78" "$(days_ago 340)" "$(days_ago 0)" $TID_CWM \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-002" "host" "FIN-WKS-002" "Finance Workstation 002" \
  74 "high" "stable" "high" 7 "0.35" "$(days_ago 320)" "$(days_ago 1)" $TID_CWM \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-003" "host" "FIN-WKS-003" "Finance Workstation 003" \
  68 "high" "rising" "high" 9 "0.72" "$(days_ago 300)" "$(days_ago 0)" $TID_CWM \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-004" "host" "FIN-WKS-004" "Finance Workstation 004" \
  52 "medium" "stable" "high" 3 "0.28" "$(days_ago 290)" "$(days_ago 2)" $TID_CWM \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-005" "host" "FIN-WKS-005" "Finance Workstation 005" \
  46 "medium" "stable" "medium" 2 "0.22" "$(days_ago 280)" "$(days_ago 4)" $TID_CWM \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-006" "host" "FIN-WKS-006" "Finance Workstation 006" \
  39 "medium" "declining" "medium" 1 "0.15" "$(days_ago 270)" "$(days_ago 7)" $TID_CWM \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-007" "host" "FIN-WKS-007" "Finance Workstation 007" \
  63 "high" "stable" "high" 5 "0.32" "$(days_ago 260)" "$(days_ago 1)" $TID_CWM \
  '["finance","windows","treasury"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-008" "host" "FIN-WKS-008" "Finance Workstation 008" \
  22 "low" "declining" "medium" 0 "0.12" "$(days_ago 250)" "$(days_ago 9)" $TID_CWM \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-009" "host" "FIN-WKS-009" "Finance Workstation 009" \
  15 "low" "declining" "low" 0 "0.05" "$(days_ago 240)" "$(days_ago 15)" $TID_CWM \
  '["finance","windows","payroll"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-010" "host" "FIN-WKS-010" "Finance Workstation 010" \
  70 "high" "rising" "high" 8 "0.65" "$(days_ago 230)" "$(days_ago 0)" $TID_CWM \
  '["finance","windows","treasury"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-011" "host" "FIN-WKS-011" "Finance Workstation 011" \
  34 "medium" "stable" "medium" 1 "0.18" "$(days_ago 220)" "$(days_ago 5)" $TID_CWM \
  '["finance","windows","audit"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-fin-wks-012" "host" "FIN-WKS-012" "Finance Workstation 012" \
  60 "high" "stable" "medium" 5 "0.26" "$(days_ago 210)" "$(days_ago 3)" $TID_CWM \
  '["finance","windows","compliance"]' '["endpoint","network"]'

# HR-LPT-001 to HR-LPT-005 (5 HR laptops)
add_entity "$IDX_CWM" "ent-host-hr-lpt-001" "host" "HR-LPT-001" "HR Laptop 001" \
  44 "medium" "stable" "medium" 2 "0.20" "$(days_ago 180)" "$(days_ago 2)" $TID_CWM \
  '["hr","windows","employee-data"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-hr-lpt-002" "host" "HR-LPT-002" "HR Laptop 002" \
  31 "medium" "stable" "medium" 1 "0.16" "$(days_ago 170)" "$(days_ago 4)" $TID_CWM \
  '["hr","windows","recruitment"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-hr-lpt-003" "host" "HR-LPT-003" "HR Laptop 003" \
  19 "low" "declining" "low" 0 "0.08" "$(days_ago 160)" "$(days_ago 14)" $TID_CWM \
  '["hr","windows","benefits"]' '["endpoint","network"]'

# DC-001 to DC-003 (3 domain controllers — critical)
add_entity "$IDX_CWM" "ent-host-dc-001" "host" "DC-001" "Domain Controller 001" \
  91 "critical" "rising" "critical" 20 "0.88" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["infrastructure","windows-server","domain-controller"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-dc-002" "host" "DC-002" "Domain Controller 002" \
  84 "critical" "stable" "critical" 10 "0.35" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["infrastructure","windows-server","domain-controller"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-dc-003" "host" "DC-003" "Domain Controller 003" \
  62 "high" "stable" "high" 5 "0.28" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["infrastructure","windows-server","domain-controller"]' '["endpoint","network"]'

# PRINT-001 to PRINT-003 (3 print servers)
add_entity "$IDX_CWM" "ent-host-print-001" "host" "PRINT-001" "Print Server 001" \
  12 "low" "declining" "low" 0 "0.05" "$(days_ago 300)" "$(days_ago 3)" $TID_CWM \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-print-002" "host" "PRINT-002" "Print Server 002" \
  8 "low" "stable" "low" 0 "0.03" "$(days_ago 290)" "$(days_ago 7)" $TID_CWM \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-print-003" "host" "PRINT-003" "Print Server 003" \
  10 "low" "declining" "low" 0 "0.02" "$(days_ago 280)" "$(days_ago 20)" $TID_CWM \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_CWM" "ent-host-hr-lpt-015" "host" "HR-LPT-015" "HR Laptop 015" \
  48 "medium" "stable" "medium" 2 "0.21" "$(days_ago 100)" "$(days_ago 3)" $TID_CWM \
  '["hr","windows","general"]' '["endpoint","network"]'

# ─── CWM Users (27) ─────────────────────────────────────────────────────────────
add_entity "$IDX_CWM" "ent-user-sarah-chen" "user" "sarah.chen" "Sarah Chen (SOC Analyst)" \
  85 "critical" "rising" "high" 14 "0.76" "$(days_ago 350)" "$(days_ago 0)" $TID_CWM \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-james-wilson" "user" "james.wilson" "James Wilson (Security Engineer)" \
  71 "high" "stable" "high" 6 "0.30" "$(days_ago 340)" "$(days_ago 1)" $TID_CWM \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-priya-sharma" "user" "priya.sharma" "Priya Sharma (SOC Lead)" \
  78 "high" "rising" "high" 9 "0.70" "$(days_ago 330)" "$(days_ago 0)" $TID_CWM \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-carlos-rodriguez" "user" "carlos.rodriguez" "Carlos Rodriguez (IT Admin)" \
  66 "high" "stable" "high" 5 "0.28" "$(days_ago 320)" "$(days_ago 1)" $TID_CWM \
  '["it-ops","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-aisha-thompson" "user" "aisha.thompson" "Aisha Thompson (Network Engineer)" \
  62 "high" "stable" "medium" 4 "0.22" "$(days_ago 310)" "$(days_ago 2)" $TID_CWM \
  '["network","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-david-nakamura" "user" "david.nakamura" "David Nakamura (DevOps)" \
  63 "high" "stable" "medium" 4 "0.24" "$(days_ago 300)" "$(days_ago 1)" $TID_CWM \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-elena-volkov" "user" "elena.volkov" "Elena Volkov (Data Analyst)" \
  41 "medium" "stable" "medium" 2 "0.18" "$(days_ago 290)" "$(days_ago 3)" $TID_CWM \
  '["analytics","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-marcus-bailey" "user" "marcus.bailey" "Marcus Bailey (Finance Director)" \
  69 "high" "rising" "high" 7 "0.62" "$(days_ago 280)" "$(days_ago 0)" $TID_CWM \
  '["finance","privileged"]' '["identity","endpoint"]'

# Service accounts (critical)
add_entity "$IDX_CWM" "ent-user-admin-svc-01" "user" "admin-svc-01" "Admin Service Account - Primary" \
  93 "critical" "rising" "critical" 22 "0.95" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-admin-svc-02" "user" "admin-svc-02" "Admin Service Account - Secondary" \
  87 "critical" "stable" "critical" 11 "0.38" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-admin-svc-03" "user" "admin-svc-03" "Admin Service Account - DR" \
  60 "high" "stable" "high" 4 "0.25" "$(days_ago 365)" "$(days_ago 2)" $TID_CWM \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-svc-backup" "user" "svc-backup" "Admin Service Account - Backup" \
  76 "high" "rising" "critical" 8 "0.71" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["service-account","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-svc-monitoring" "user" "svc-monitoring" "Service Account - Monitoring" \
  35 "medium" "stable" "medium" 1 "0.14" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["service-account","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-svc-deploy" "user" "svc-deploy" "Service Account - Deploy" \
  50 "medium" "stable" "high" 3 "0.22" "$(days_ago 300)" "$(days_ago 1)" $TID_CWM \
  '["service-account","privileged"]' '["identity","endpoint"]'

# Additional CWM users to reach 27
add_entity "$IDX_CWM" "ent-user-lisa-park" "user" "lisa.park" "Lisa Park (HR Manager)" \
  37 "medium" "stable" "medium" 1 "0.16" "$(days_ago 270)" "$(days_ago 3)" $TID_CWM \
  '["hr","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-ryan-cooper" "user" "ryan.cooper" "Ryan Cooper (Developer)" \
  33 "medium" "stable" "low" 1 "0.14" "$(days_ago 260)" "$(days_ago 2)" $TID_CWM \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-maya-patel" "user" "maya.patel" "Maya Patel (QA Lead)" \
  24 "low" "stable" "low" 0 "0.09" "$(days_ago 250)" "$(days_ago 5)" $TID_CWM \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-tom-huang" "user" "tom.huang" "Tom Huang (Cloud Architect)" \
  64 "high" "stable" "high" 5 "0.30" "$(days_ago 240)" "$(days_ago 1)" $TID_CWM \
  '["engineering","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-nicole-adams" "user" "nicole.adams" "Nicole Adams (Compliance Officer)" \
  43 "medium" "stable" "medium" 2 "0.20" "$(days_ago 230)" "$(days_ago 2)" $TID_CWM \
  '["compliance","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-kevin-wright" "user" "kevin.wright" "Kevin Wright (Sys Admin)" \
  65 "high" "rising" "medium" 5 "0.60" "$(days_ago 220)" "$(days_ago 0)" $TID_CWM \
  '["it-ops","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-sarah-johnson" "user" "sarah.johnson" "Sarah Johnson (CFO)" \
  73 "high" "stable" "high" 6 "0.33" "$(days_ago 350)" "$(days_ago 1)" $TID_CWM \
  '["executive","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-mike-chen" "user" "mike.chen" "Mike Chen (Intern)" \
  14 "low" "declining" "low" 0 "0.06" "$(days_ago 60)" "$(days_ago 8)" $TID_CWM \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-admin-svc-04" "user" "admin-svc-04" "Admin Service Account - Exchange" \
  80 "critical" "stable" "critical" 9 "0.36" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-admin-svc-05" "user" "admin-svc-05" "Admin Service Account - SQL" \
  67 "high" "stable" "critical" 5 "0.27" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["service-account","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-jenny-liu" "user" "jenny.liu" "Jenny Liu (Marketing)" \
  11 "low" "declining" "low" 0 "0.04" "$(days_ago 200)" "$(days_ago 18)" $TID_CWM \
  '["marketing","standard"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-alex-turner" "user" "alex.turner" "Alex Turner (Incident Responder)" \
  77 "high" "rising" "high" 8 "0.69" "$(days_ago 180)" "$(days_ago 0)" $TID_CWM \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_CWM" "ent-user-diana-ross" "user" "diana.ross" "Diana Ross (Receptionist)" \
  9 "low" "declining" "low" 0 "0.03" "$(days_ago 150)" "$(days_ago 10)" $TID_CWM \
  '["admin","standard"]' '["identity","endpoint"]'

# ─── CWM IPs (18) ────────────────────────────────────────────────────────────────
# Internal IPs
add_entity "$IDX_CWM" "ent-ip-10-1-5-1" "ip" "10.1.5.1" "10.1.5.1 (Core Switch)" \
  45 "medium" "stable" "high" 2 "0.20" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-1-5-10" "ip" "10.1.5.10" "10.1.5.10 (DNS Primary)" \
  38 "medium" "stable" "critical" 1 "0.15" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-1-5-20" "ip" "10.1.5.20" "10.1.5.20 (DHCP Server)" \
  22 "low" "stable" "medium" 0 "0.10" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-1-10-5" "ip" "10.1.10.5" "10.1.10.5 (App Server)" \
  61 "high" "stable" "medium" 4 "0.24" "$(days_ago 300)" "$(days_ago 1)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-1-10-15" "ip" "10.1.10.15" "10.1.10.15 (DB Server)" \
  68 "high" "rising" "high" 6 "0.65" "$(days_ago 300)" "$(days_ago 0)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-2-1-1" "ip" "10.2.1.1" "10.2.1.1 (VPN Gateway)" \
  47 "medium" "stable" "medium" 2 "0.22" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-192-168-1-1" "ip" "192.168.1.1" "192.168.1.1 (Edge Router)" \
  36 "medium" "stable" "medium" 1 "0.17" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-192-168-1-50" "ip" "192.168.1.50" "192.168.1.50 (WiFi AP)" \
  16 "low" "declining" "low" 0 "0.07" "$(days_ago 200)" "$(days_ago 5)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-192-168-1-100" "ip" "192.168.1.100" "192.168.1.100 (Printer)" \
  7 "low" "declining" "medium" 0 "0.02" "$(days_ago 180)" "$(days_ago 22)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
# External suspicious IPs
add_entity "$IDX_CWM" "ent-ip-203-0-113-10" "ip" "203.0.113.10" "203.0.113.10 (Suspicious C2)" \
  96 "critical" "rising" "unclassified" 25 "0.98" "$(days_ago 45)" "$(days_ago 0)" $TID_CWM \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-203-0-113-22" "ip" "203.0.113.22" "203.0.113.22 (Known Scanner)" \
  82 "critical" "stable" "unclassified" 12 "0.40" "$(days_ago 60)" "$(days_ago 1)" $TID_CWM \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-203-0-113-45" "ip" "203.0.113.45" "203.0.113.45 (Tor Exit Node)" \
  77 "high" "rising" "unclassified" 8 "0.72" "$(days_ago 30)" "$(days_ago 0)" $TID_CWM \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-198-51-100-5" "ip" "198.51.100.5" "198.51.100.5 (Phishing Host)" \
  89 "critical" "rising" "unclassified" 19 "0.90" "$(days_ago 35)" "$(days_ago 0)" $TID_CWM \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-198-51-100-20" "ip" "198.51.100.20" "198.51.100.20 (Brute Force)" \
  75 "high" "stable" "medium" 7 "0.34" "$(days_ago 50)" "$(days_ago 2)" $TID_CWM \
  '["external","suspicious"]' '["network"]'
# External benign IPs
add_entity "$IDX_CWM" "ent-ip-8-8-8-8" "ip" "8.8.8.8" "8.8.8.8 (Google DNS)" \
  5 "low" "stable" "low" 0 "0.02" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["external","benign"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-1-1-1-1" "ip" "1.1.1.1" "1.1.1.1 (Cloudflare DNS)" \
  3 "low" "stable" "low" 0 "0.01" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["external","benign"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-1-5-50" "ip" "10.1.5.50" "10.1.5.50 (NTP Server)" \
  20 "low" "stable" "medium" 0 "0.08" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_CWM" "ent-ip-10-2-1-50" "ip" "10.2.1.50" "10.2.1.50 (Proxy Server)" \
  54 "medium" "stable" "medium" 3 "0.23" "$(days_ago 300)" "$(days_ago 1)" $TID_CWM \
  '["internal","trusted"]' '["network"]'

# ─── CWM Domains (9) ────────────────────────────────────────────────────────────
# Internal domains
add_entity "$IDX_CWM" "ent-domain-corp-hivearmor-local" "domain" "corp.hivearmor.local" "corp.hivearmor.local (Corporate AD)" \
  30 "medium" "stable" "critical" 1 "0.14" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-mail-internal" "domain" "mail.internal" "mail.internal (Exchange)" \
  40 "medium" "stable" "high" 2 "0.19" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-vpn-internal" "domain" "vpn.internal" "vpn.internal (VPN Portal)" \
  33 "medium" "stable" "high" 1 "0.16" "$(days_ago 365)" "$(days_ago 0)" $TID_CWM \
  '["internal"]' '["network","cloud"]'
# Suspicious domains
add_entity "$IDX_CWM" "ent-domain-cdn-update-xyz" "domain" "cdn-update.xyz" "cdn-update.xyz (Suspicious DGA)" \
  97 "critical" "rising" "unclassified" 23 "0.96" "$(days_ago 40)" "$(days_ago 0)" $TID_CWM \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-secure-login-portal-net" "domain" "secure-login-portal.net" "secure-login-portal.net (Phishing)" \
  94 "critical" "rising" "unclassified" 20 "0.93" "$(days_ago 35)" "$(days_ago 0)" $TID_CWM \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-microsft-update-com" "domain" "microsft-update.com" "microsft-update.com (Typosquat)" \
  90 "critical" "stable" "unclassified" 16 "0.39" "$(days_ago 50)" "$(days_ago 1)" $TID_CWM \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-dl-patch-info" "domain" "dl-patch.info" "dl-patch.info (Malware Delivery)" \
  86 "critical" "rising" "unclassified" 13 "0.82" "$(days_ago 45)" "$(days_ago 0)" $TID_CWM \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-updates-internal" "domain" "updates.internal" "updates.internal (WSUS)" \
  15 "low" "declining" "medium" 0 "0.06" "$(days_ago 365)" "$(days_ago 1)" $TID_CWM \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_CWM" "ent-domain-git-internal" "domain" "git.internal" "git.internal (GitLab)" \
  26 "low" "stable" "medium" 0 "0.11" "$(days_ago 300)" "$(days_ago 1)" $TID_CWM \
  '["internal"]' '["network","cloud"]'

# =============================================================================
# TENANT 2: Workmates1 — 60 entities (24 hosts, 18 users, 12 IPs, 6 domains)
# =============================================================================
IDX_WM1="v3-hive-entity-workmates1"
TID_WM1=2

# ─── Workmates1 Hosts (24) ───────────────────────────────────────────────────────
add_entity "$IDX_WM1" "ent-host-eng-srv-015" "host" "ENG-SRV-015" "Engineering Server 015" \
  83 "critical" "rising" "critical" 13 "0.80" "$(days_ago 290)" "$(days_ago 0)" $TID_WM1 \
  '["engineering","linux","production"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-eng-srv-016" "host" "ENG-SRV-016" "Engineering Server 016" \
  62 "high" "stable" "high" 5 "0.29" "$(days_ago 270)" "$(days_ago 1)" $TID_WM1 \
  '["engineering","linux","staging"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-eng-srv-017" "host" "ENG-SRV-017" "Engineering Server 017" \
  44 "medium" "stable" "medium" 2 "0.20" "$(days_ago 250)" "$(days_ago 3)" $TID_WM1 \
  '["engineering","linux","development"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-eng-srv-018" "host" "ENG-SRV-018" "Engineering Server 018" \
  31 "medium" "declining" "medium" 1 "0.12" "$(days_ago 240)" "$(days_ago 8)" $TID_WM1 \
  '["engineering","linux","test"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-eng-srv-019" "host" "ENG-SRV-019" "Engineering Server 019" \
  55 "medium" "stable" "medium" 3 "0.25" "$(days_ago 230)" "$(days_ago 2)" $TID_WM1 \
  '["engineering","linux","ci-cd"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-eng-srv-020" "host" "ENG-SRV-020" "Engineering Server 020" \
  21 "low" "declining" "low" 0 "0.09" "$(days_ago 220)" "$(days_ago 10)" $TID_WM1 \
  '["engineering","linux","archive"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-013" "host" "FIN-WKS-013" "Finance Workstation 013" \
  76 "high" "rising" "high" 8 "0.68" "$(days_ago 310)" "$(days_ago 0)" $TID_WM1 \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-014" "host" "FIN-WKS-014" "Finance Workstation 014" \
  64 "high" "stable" "high" 5 "0.30" "$(days_ago 300)" "$(days_ago 1)" $TID_WM1 \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-015" "host" "FIN-WKS-015" "Finance Workstation 015" \
  49 "medium" "stable" "medium" 2 "0.22" "$(days_ago 290)" "$(days_ago 3)" $TID_WM1 \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-016" "host" "FIN-WKS-016" "Finance Workstation 016" \
  35 "medium" "declining" "medium" 1 "0.10" "$(days_ago 280)" "$(days_ago 9)" $TID_WM1 \
  '["finance","windows","payroll"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-017" "host" "FIN-WKS-017" "Finance Workstation 017" \
  71 "high" "stable" "high" 7 "0.33" "$(days_ago 270)" "$(days_ago 1)" $TID_WM1 \
  '["finance","windows","treasury"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-018" "host" "FIN-WKS-018" "Finance Workstation 018" \
  27 "low" "declining" "low" 1 "0.13" "$(days_ago 260)" "$(days_ago 6)" $TID_WM1 \
  '["finance","windows","accounting"]' '["endpoint","network"]'

add_entity "$IDX_WM1" "ent-host-fin-wks-019" "host" "FIN-WKS-019" "Finance Workstation 019" \
  42 "medium" "stable" "medium" 2 "0.19" "$(days_ago 250)" "$(days_ago 4)" $TID_WM1 \
  '["finance","windows","compliance"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-020" "host" "FIN-WKS-020" "Finance Workstation 020" \
  62 "high" "rising" "medium" 5 "0.62" "$(days_ago 240)" "$(days_ago 0)" $TID_WM1 \
  '["finance","windows","audit"]' '["endpoint","network"]'

add_entity "$IDX_WM1" "ent-host-hr-lpt-004" "host" "HR-LPT-004" "HR Laptop 004" \
  40 "medium" "stable" "medium" 2 "0.18" "$(days_ago 160)" "$(days_ago 3)" $TID_WM1 \
  '["hr","windows","employee-data"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-hr-lpt-005" "host" "HR-LPT-005" "HR Laptop 005" \
  23 "low" "stable" "low" 0 "0.10" "$(days_ago 150)" "$(days_ago 7)" $TID_WM1 \
  '["hr","windows","recruitment"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-hr-lpt-006" "host" "HR-LPT-006" "HR Laptop 006" \
  17 "low" "declining" "low" 0 "0.06" "$(days_ago 140)" "$(days_ago 16)" $TID_WM1 \
  '["hr","windows","benefits"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-hr-lpt-007" "host" "HR-LPT-007" "HR Laptop 007" \
  32 "medium" "stable" "medium" 1 "0.15" "$(days_ago 130)" "$(days_ago 4)" $TID_WM1 \
  '["hr","windows","training"]' '["endpoint","network"]'

add_entity "$IDX_WM1" "ent-host-dc-004" "host" "DC-004" "Domain Controller 004" \
  88 "critical" "stable" "critical" 11 "0.37" "$(days_ago 365)" "$(days_ago 0)" $TID_WM1 \
  '["infrastructure","windows-server","domain-controller"]' '["endpoint","network"]'

add_entity "$IDX_WM1" "ent-host-print-004" "host" "PRINT-004" "Print Server 004" \
  9 "low" "declining" "low" 0 "0.03" "$(days_ago 250)" "$(days_ago 8)" $TID_WM1 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-print-005" "host" "PRINT-005" "Print Server 005" \
  6 "low" "declining" "low" 0 "0.02" "$(days_ago 240)" "$(days_ago 25)" $TID_WM1 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-fin-wks-021" "host" "FIN-WKS-021" "Finance Workstation 021" \
  53 "medium" "stable" "medium" 3 "0.24" "$(days_ago 230)" "$(days_ago 2)" $TID_WM1 \
  '["finance","windows","reporting"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-hr-lpt-015-wm1" "host" "HR-LPT-015" "HR Laptop 015" \
  29 "low" "declining" "low" 1 "0.13" "$(days_ago 120)" "$(days_ago 5)" $TID_WM1 \
  '["hr","windows","general"]' '["endpoint","network"]'
add_entity "$IDX_WM1" "ent-host-print-006-wm1" "host" "PRINT-006" "Print Server 006" \
  7 "low" "declining" "low" 0 "0.02" "$(days_ago 230)" "$(days_ago 26)" $TID_WM1 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'

# ─── Workmates1 Users (18) ───────────────────────────────────────────────────────
add_entity "$IDX_WM1" "ent-user-anna-kowalski" "user" "anna.kowalski" "Anna Kowalski (SOC Analyst)" \
  79 "high" "rising" "high" 9 "0.74" "$(days_ago 320)" "$(days_ago 0)" $TID_WM1 \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-ben-okafor" "user" "ben.okafor" "Ben Okafor (Threat Hunter)" \
  68 "high" "stable" "high" 6 "0.30" "$(days_ago 310)" "$(days_ago 1)" $TID_WM1 \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-claire-dupont" "user" "claire.dupont" "Claire Dupont (IT Manager)" \
  54 "medium" "stable" "medium" 3 "0.23" "$(days_ago 300)" "$(days_ago 2)" $TID_WM1 \
  '["it-ops","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-derek-santos" "user" "derek.santos" "Derek Santos (Developer)" \
  36 "medium" "stable" "medium" 1 "0.17" "$(days_ago 290)" "$(days_ago 3)" $TID_WM1 \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-emma-fischer" "user" "emma.fischer" "Emma Fischer (Accountant)" \
  43 "medium" "stable" "medium" 2 "0.20" "$(days_ago 280)" "$(days_ago 2)" $TID_WM1 \
  '["finance","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-frank-miller" "user" "frank.miller" "Frank Miller (VP Engineering)" \
  72 "high" "stable" "high" 7 "0.32" "$(days_ago 340)" "$(days_ago 1)" $TID_WM1 \
  '["executive","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-grace-kim" "user" "grace.kim" "Grace Kim (DBA)" \
  60 "high" "stable" "high" 4 "0.28" "$(days_ago 270)" "$(days_ago 1)" $TID_WM1 \
  '["engineering","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-hassan-ali" "user" "hassan.ali" "Hassan Ali (Network Admin)" \
  46 "medium" "stable" "medium" 3 "0.21" "$(days_ago 260)" "$(days_ago 2)" $TID_WM1 \
  '["network","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-iris-wang" "user" "iris.wang" "Iris Wang (Compliance)" \
  32 "medium" "stable" "medium" 1 "0.14" "$(days_ago 250)" "$(days_ago 5)" $TID_WM1 \
  '["compliance","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-jack-brown" "user" "jack.brown" "Jack Brown (Help Desk)" \
  19 "low" "declining" "low" 0 "0.08" "$(days_ago 240)" "$(days_ago 7)" $TID_WM1 \
  '["it-ops","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-kate-nguyen" "user" "kate.nguyen" "Kate Nguyen (Security Intern)" \
  13 "low" "declining" "low" 0 "0.05" "$(days_ago 90)" "$(days_ago 12)" $TID_WM1 \
  '["security","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-wm1-admin-svc-01" "user" "wm1-admin-svc-01" "Admin Service Account - WM1 Primary" \
  91 "critical" "rising" "critical" 17 "0.88" "$(days_ago 365)" "$(days_ago 0)" $TID_WM1 \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-wm1-admin-svc-02" "user" "wm1-admin-svc-02" "Admin Service Account - WM1 Backup" \
  65 "high" "stable" "critical" 5 "0.27" "$(days_ago 365)" "$(days_ago 1)" $TID_WM1 \
  '["service-account","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-wm1-svc-backup" "user" "wm1-svc-backup" "Service Account - WM1 Backup Agent" \
  48 "medium" "stable" "medium" 2 "0.21" "$(days_ago 300)" "$(days_ago 2)" $TID_WM1 \
  '["service-account","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-wm1-svc-monitoring" "user" "wm1-svc-monitoring" "Service Account - WM1 Monitor" \
  33 "medium" "stable" "medium" 1 "0.15" "$(days_ago 300)" "$(days_ago 1)" $TID_WM1 \
  '["service-account","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-leo-garcia" "user" "leo.garcia" "Leo Garcia (Project Manager)" \
  25 "low" "stable" "low" 0 "0.10" "$(days_ago 200)" "$(days_ago 4)" $TID_WM1 \
  '["management","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-mia-johnson" "user" "mia.johnson" "Mia Johnson (Sales)" \
  16 "low" "declining" "low" 0 "0.04" "$(days_ago 180)" "$(days_ago 20)" $TID_WM1 \
  '["sales","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM1" "ent-user-nate-davis" "user" "nate.davis" "Nate Davis (Finance Analyst)" \
  61 "high" "stable" "medium" 4 "0.24" "$(days_ago 260)" "$(days_ago 2)" $TID_WM1 \
  '["finance","standard"]' '["identity","endpoint"]'

# ─── Workmates1 IPs (12) ────────────────────────────────────────────────────────
add_entity "$IDX_WM1" "ent-ip-10-1-5-100" "ip" "10.1.5.100" "10.1.5.100 (WM1 Core Switch)" \
  42 "medium" "stable" "high" 2 "0.19" "$(days_ago 365)" "$(days_ago 0)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-10-1-5-110" "ip" "10.1.5.110" "10.1.5.110 (WM1 DNS)" \
  34 "medium" "stable" "medium" 1 "0.14" "$(days_ago 365)" "$(days_ago 1)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-10-1-10-100" "ip" "10.1.10.100" "10.1.10.100 (WM1 App Server)" \
  50 "medium" "stable" "medium" 3 "0.23" "$(days_ago 280)" "$(days_ago 1)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-10-2-1-100" "ip" "10.2.1.100" "10.2.1.100 (WM1 VPN)" \
  39 "medium" "stable" "medium" 1 "0.17" "$(days_ago 300)" "$(days_ago 0)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-192-168-1-200" "ip" "192.168.1.200" "192.168.1.200 (WM1 Edge)" \
  26 "low" "stable" "low" 0 "0.11" "$(days_ago 250)" "$(days_ago 3)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-192-168-1-201" "ip" "192.168.1.201" "192.168.1.201 (WM1 WiFi)" \
  14 "low" "stable" "low" 0 "0.06" "$(days_ago 200)" "$(days_ago 6)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-203-0-113-50" "ip" "203.0.113.50" "203.0.113.50 (Suspicious Proxy)" \
  85 "critical" "rising" "unclassified" 15 "0.82" "$(days_ago 40)" "$(days_ago 0)" $TID_WM1 \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-203-0-113-77" "ip" "203.0.113.77" "203.0.113.77 (Cryptominer)" \
  78 "high" "rising" "unclassified" 10 "0.75" "$(days_ago 35)" "$(days_ago 0)" $TID_WM1 \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-198-51-100-30" "ip" "198.51.100.30" "198.51.100.30 (Data Exfil)" \
  92 "critical" "rising" "unclassified" 21 "0.91" "$(days_ago 30)" "$(days_ago 0)" $TID_WM1 \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-198-51-100-45" "ip" "198.51.100.45" "198.51.100.45 (Botnet C2)" \
  74 "high" "stable" "unclassified" 6 "0.32" "$(days_ago 55)" "$(days_ago 2)" $TID_WM1 \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-10-1-5-120" "ip" "10.1.5.120" "10.1.5.120 (WM1 File Server)" \
  46 "medium" "stable" "medium" 2 "0.20" "$(days_ago 300)" "$(days_ago 2)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM1" "ent-ip-10-1-10-120" "ip" "10.1.10.120" "10.1.10.120 (WM1 DB)" \
  63 "high" "rising" "high" 5 "0.67" "$(days_ago 280)" "$(days_ago 0)" $TID_WM1 \
  '["internal","trusted"]' '["network"]'

# ─── Workmates1 Domains (6) ─────────────────────────────────────────────────────
add_entity "$IDX_WM1" "ent-domain-wm1-corp-local" "domain" "wm1.corp.local" "wm1.corp.local (WM1 AD)" \
  32 "medium" "stable" "critical" 1 "0.14" "$(days_ago 365)" "$(days_ago 0)" $TID_WM1 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM1" "ent-domain-wm1-mail-internal" "domain" "wm1-mail.internal" "wm1-mail.internal (WM1 Mail)" \
  37 "medium" "stable" "medium" 1 "0.16" "$(days_ago 365)" "$(days_ago 1)" $TID_WM1 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM1" "ent-domain-wm1-vpn-internal" "domain" "wm1-vpn.internal" "wm1-vpn.internal (WM1 VPN)" \
  29 "low" "stable" "medium" 0 "0.12" "$(days_ago 365)" "$(days_ago 1)" $TID_WM1 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM1" "ent-domain-fast-download-xyz" "domain" "fast-download.xyz" "fast-download.xyz (Suspicious)" \
  81 "critical" "rising" "unclassified" 11 "0.79" "$(days_ago 40)" "$(days_ago 0)" $TID_WM1 \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_WM1" "ent-domain-login-verify-net" "domain" "login-verify.net" "login-verify.net (Credential Theft)" \
  87 "critical" "stable" "unclassified" 14 "0.38" "$(days_ago 50)" "$(days_ago 1)" $TID_WM1 \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_WM1" "ent-domain-wm1-sharepoint-internal" "domain" "sharepoint.wm1.local" "sharepoint.wm1.local (SharePoint)" \
  20 "low" "stable" "medium" 0 "0.08" "$(days_ago 300)" "$(days_ago 2)" $TID_WM1 \
  '["internal"]' '["network","cloud"]'

# =============================================================================
# TENANT 3: Workmates2 — 50 entities (20 hosts, 15 users, 10 IPs, 5 domains)
# =============================================================================
IDX_WM2="v3-hive-entity-workmates2"
TID_WM2=3

# ─── Workmates2 Hosts (20) ───────────────────────────────────────────────────────
add_entity "$IDX_WM2" "ent-host-fin-wks-022" "host" "FIN-WKS-022" "Finance Workstation 022" \
  80 "critical" "rising" "high" 10 "0.77" "$(days_ago 280)" "$(days_ago 0)" $TID_WM2 \
  '["finance","windows","pci-scope"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-023" "host" "FIN-WKS-023" "Finance Workstation 023" \
  66 "high" "stable" "high" 5 "0.29" "$(days_ago 270)" "$(days_ago 1)" $TID_WM2 \
  '["finance","windows","treasury"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-024" "host" "FIN-WKS-024" "Finance Workstation 024" \
  47 "medium" "stable" "medium" 2 "0.21" "$(days_ago 260)" "$(days_ago 3)" $TID_WM2 \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-025" "host" "FIN-WKS-025" "Finance Workstation 025" \
  38 "medium" "declining" "medium" 1 "0.12" "$(days_ago 250)" "$(days_ago 10)" $TID_WM2 \
  '["finance","windows","payroll"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-026" "host" "FIN-WKS-026" "Finance Workstation 026" \
  55 "medium" "stable" "medium" 3 "0.25" "$(days_ago 240)" "$(days_ago 2)" $TID_WM2 \
  '["finance","windows","reporting"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-027" "host" "FIN-WKS-027" "Finance Workstation 027" \
  22 "low" "declining" "low" 0 "0.09" "$(days_ago 230)" "$(days_ago 8)" $TID_WM2 \
  '["finance","windows","audit"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-028" "host" "FIN-WKS-028" "Finance Workstation 028" \
  63 "high" "rising" "high" 6 "0.66" "$(days_ago 220)" "$(days_ago 0)" $TID_WM2 \
  '["finance","windows","compliance"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-029" "host" "FIN-WKS-029" "Finance Workstation 029" \
  41 "medium" "stable" "medium" 2 "0.19" "$(days_ago 210)" "$(days_ago 4)" $TID_WM2 \
  '["finance","windows","accounting"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-fin-wks-030" "host" "FIN-WKS-030" "Finance Workstation 030" \
  73 "high" "stable" "high" 7 "0.33" "$(days_ago 200)" "$(days_ago 1)" $TID_WM2 \
  '["finance","windows","treasury"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-008" "host" "HR-LPT-008" "HR Laptop 008" \
  34 "medium" "stable" "medium" 1 "0.15" "$(days_ago 150)" "$(days_ago 5)" $TID_WM2 \
  '["hr","windows","employee-data"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-009" "host" "HR-LPT-009" "HR Laptop 009" \
  18 "low" "declining" "low" 0 "0.07" "$(days_ago 140)" "$(days_ago 15)" $TID_WM2 \
  '["hr","windows","recruitment"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-010" "host" "HR-LPT-010" "HR Laptop 010" \
  52 "medium" "rising" "medium" 4 "0.64" "$(days_ago 130)" "$(days_ago 0)" $TID_WM2 \
  '["hr","windows","benefits"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-011" "host" "HR-LPT-011" "HR Laptop 011" \
  27 "low" "stable" "low" 1 "0.12" "$(days_ago 120)" "$(days_ago 6)" $TID_WM2 \
  '["hr","windows","training"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-012" "host" "HR-LPT-012" "HR Laptop 012" \
  44 "medium" "stable" "medium" 2 "0.20" "$(days_ago 110)" "$(days_ago 3)" $TID_WM2 \
  '["hr","windows","payroll"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-013" "host" "HR-LPT-013" "HR Laptop 013" \
  15 "low" "declining" "low" 0 "0.05" "$(days_ago 100)" "$(days_ago 19)" $TID_WM2 \
  '["hr","windows","general"]' '["endpoint","network"]'

add_entity "$IDX_WM2" "ent-host-dc-005" "host" "DC-005" "Domain Controller 005" \
  86 "critical" "stable" "critical" 9 "0.35" "$(days_ago 365)" "$(days_ago 0)" $TID_WM2 \
  '["infrastructure","windows-server","domain-controller"]' '["endpoint","network"]'

add_entity "$IDX_WM2" "ent-host-print-006" "host" "PRINT-006" "Print Server 006" \
  8 "low" "declining" "low" 0 "0.03" "$(days_ago 220)" "$(days_ago 9)" $TID_WM2 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-print-007" "host" "PRINT-007" "Print Server 007" \
  5 "low" "declining" "medium" 0 "0.01" "$(days_ago 210)" "$(days_ago 28)" $TID_WM2 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-print-008" "host" "PRINT-008" "Print Server 008" \
  11 "low" "declining" "low" 0 "0.04" "$(days_ago 200)" "$(days_ago 11)" $TID_WM2 \
  '["infrastructure","linux","print-services"]' '["endpoint","network"]'
add_entity "$IDX_WM2" "ent-host-hr-lpt-014" "host" "HR-LPT-014" "HR Laptop 014" \
  37 "medium" "stable" "medium" 1 "0.16" "$(days_ago 90)" "$(days_ago 4)" $TID_WM2 \
  '["hr","windows","compliance"]' '["endpoint","network"]'

# ─── Workmates2 Users (15) ───────────────────────────────────────────────────────
add_entity "$IDX_WM2" "ent-user-oliver-schmidt" "user" "oliver.schmidt" "Oliver Schmidt (CISO)" \
  84 "critical" "rising" "critical" 12 "0.81" "$(days_ago 350)" "$(days_ago 0)" $TID_WM2 \
  '["executive","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-patricia-lee" "user" "patricia.lee" "Patricia Lee (SOC Analyst)" \
  67 "high" "stable" "high" 5 "0.29" "$(days_ago 300)" "$(days_ago 1)" $TID_WM2 \
  '["security","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-quinn-taylor" "user" "quinn.taylor" "Quinn Taylor (Sys Admin)" \
  75 "high" "rising" "high" 8 "0.73" "$(days_ago 290)" "$(days_ago 0)" $TID_WM2 \
  '["it-ops","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-rachel-moore" "user" "rachel.moore" "Rachel Moore (Developer)" \
  39 "medium" "stable" "medium" 1 "0.17" "$(days_ago 280)" "$(days_ago 3)" $TID_WM2 \
  '["engineering","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-sam-jackson" "user" "sam.jackson" "Sam Jackson (Finance)" \
  51 "medium" "stable" "medium" 3 "0.23" "$(days_ago 270)" "$(days_ago 2)" $TID_WM2 \
  '["finance","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-tina-white" "user" "tina.white" "Tina White (HR Director)" \
  62 "high" "stable" "medium" 5 "0.26" "$(days_ago 260)" "$(days_ago 1)" $TID_WM2 \
  '["hr","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-victor-ross" "user" "victor.ross" "Victor Ross (Contractor)" \
  46 "medium" "rising" "medium" 3 "0.61" "$(days_ago 120)" "$(days_ago 0)" $TID_WM2 \
  '["contractor","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-wendy-clark" "user" "wendy.clark" "Wendy Clark (Legal)" \
  30 "medium" "stable" "medium" 1 "0.14" "$(days_ago 250)" "$(days_ago 4)" $TID_WM2 \
  '["legal","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-xavier-diaz" "user" "xavier.diaz" "Xavier Diaz (Network Eng)" \
  24 "low" "declining" "low" 0 "0.09" "$(days_ago 240)" "$(days_ago 6)" $TID_WM2 \
  '["network","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-yuki-tanaka" "user" "yuki.tanaka" "Yuki Tanaka (Data Scientist)" \
  17 "low" "declining" "low" 0 "0.05" "$(days_ago 200)" "$(days_ago 14)" $TID_WM2 \
  '["analytics","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-wm2-admin-svc-01" "user" "wm2-admin-svc-01" "Admin Service Account - WM2 Primary" \
  90 "critical" "stable" "critical" 10 "0.37" "$(days_ago 365)" "$(days_ago 0)" $TID_WM2 \
  '["service-account","domain-admin"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-wm2-admin-svc-02" "user" "wm2-admin-svc-02" "Admin Service Account - WM2 Secondary" \
  62 "high" "stable" "critical" 4 "0.26" "$(days_ago 365)" "$(days_ago 1)" $TID_WM2 \
  '["service-account","privileged"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-wm2-svc-deploy" "user" "wm2-svc-deploy" "Service Account - WM2 Deploy" \
  43 "medium" "stable" "medium" 2 "0.19" "$(days_ago 300)" "$(days_ago 2)" $TID_WM2 \
  '["service-account","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-zara-ahmed" "user" "zara.ahmed" "Zara Ahmed (Marketing)" \
  10 "low" "declining" "low" 0 "0.03" "$(days_ago 180)" "$(days_ago 21)" $TID_WM2 \
  '["marketing","standard"]' '["identity","endpoint"]'
add_entity "$IDX_WM2" "ent-user-wm2-svc-monitoring" "user" "wm2-svc-monitoring" "Service Account - WM2 Monitor" \
  35 "medium" "stable" "medium" 1 "0.15" "$(days_ago 300)" "$(days_ago 1)" $TID_WM2 \
  '["service-account","standard"]' '["identity","endpoint"]'

# ─── Workmates2 IPs (10) ─────────────────────────────────────────────────────────
add_entity "$IDX_WM2" "ent-ip-10-1-5-200" "ip" "10.1.5.200" "10.1.5.200 (WM2 Core Switch)" \
  43 "medium" "stable" "high" 2 "0.19" "$(days_ago 365)" "$(days_ago 0)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-10-1-5-210" "ip" "10.1.5.210" "10.1.5.210 (WM2 DNS)" \
  31 "medium" "stable" "medium" 1 "0.14" "$(days_ago 365)" "$(days_ago 1)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-10-2-1-200" "ip" "10.2.1.200" "10.2.1.200 (WM2 VPN)" \
  37 "medium" "stable" "medium" 1 "0.16" "$(days_ago 300)" "$(days_ago 1)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-192-168-1-250" "ip" "192.168.1.250" "192.168.1.250 (WM2 Edge)" \
  23 "low" "declining" "low" 0 "0.10" "$(days_ago 250)" "$(days_ago 4)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-10-1-10-200" "ip" "10.1.10.200" "10.1.10.200 (WM2 App Server)" \
  48 "medium" "stable" "medium" 2 "0.22" "$(days_ago 280)" "$(days_ago 2)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-203-0-113-88" "ip" "203.0.113.88" "203.0.113.88 (DDoS Source)" \
  94 "critical" "rising" "unclassified" 22 "0.94" "$(days_ago 30)" "$(days_ago 0)" $TID_WM2 \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-203-0-113-99" "ip" "203.0.113.99" "203.0.113.99 (Exploit Kit)" \
  83 "critical" "stable" "unclassified" 11 "0.39" "$(days_ago 45)" "$(days_ago 1)" $TID_WM2 \
  '["external","malicious"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-198-51-100-60" "ip" "198.51.100.60" "198.51.100.60 (Spam Relay)" \
  69 "high" "stable" "unclassified" 5 "0.30" "$(days_ago 60)" "$(days_ago 3)" $TID_WM2 \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-198-51-100-70" "ip" "198.51.100.70" "198.51.100.70 (Port Scanner)" \
  61 "high" "declining" "unclassified" 3 "0.15" "$(days_ago 70)" "$(days_ago 9)" $TID_WM2 \
  '["external","suspicious"]' '["network"]'
add_entity "$IDX_WM2" "ent-ip-10-1-5-220" "ip" "10.1.5.220" "10.1.5.220 (WM2 Backup)" \
  28 "low" "stable" "medium" 0 "0.11" "$(days_ago 300)" "$(days_ago 3)" $TID_WM2 \
  '["internal","trusted"]' '["network"]'

# ─── Workmates2 Domains (5) ─────────────────────────────────────────────────────
add_entity "$IDX_WM2" "ent-domain-wm2-corp-local" "domain" "wm2.corp.local" "wm2.corp.local (WM2 AD)" \
  31 "medium" "stable" "critical" 1 "0.13" "$(days_ago 365)" "$(days_ago 0)" $TID_WM2 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM2" "ent-domain-wm2-mail-internal" "domain" "wm2-mail.internal" "wm2-mail.internal (WM2 Mail)" \
  36 "medium" "stable" "medium" 1 "0.16" "$(days_ago 365)" "$(days_ago 1)" $TID_WM2 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM2" "ent-domain-data-sync-pro-com" "domain" "data-sync-pro.com" "data-sync-pro.com (Suspicious Exfil)" \
  89 "critical" "rising" "unclassified" 16 "0.86" "$(days_ago 35)" "$(days_ago 0)" $TID_WM2 \
  '["suspicious"]' '["network","cloud"]'
add_entity "$IDX_WM2" "ent-domain-wm2-vpn-internal" "domain" "wm2-vpn.internal" "wm2-vpn.internal (WM2 VPN)" \
  25 "low" "stable" "medium" 0 "0.10" "$(days_ago 365)" "$(days_ago 1)" $TID_WM2 \
  '["internal"]' '["network","cloud"]'
add_entity "$IDX_WM2" "ent-domain-api-tracker-xyz" "domain" "api-tracker.xyz" "api-tracker.xyz (Beacon)" \
  79 "high" "rising" "unclassified" 9 "0.74" "$(days_ago 40)" "$(days_ago 0)" $TID_WM2 \
  '["suspicious"]' '["network","cloud"]'

# ─── Step 3: Send bulk request to OpenSearch ────────────────────────────────────
header "Step 3: Bulk index entities into OpenSearch"

ENTITY_COUNT=$(grep -c '"index"' "$BULK_FILE")
info "Bulk file contains ${ENTITY_COUNT} entity documents"

RESPONSE=$(${CURL_OS} -X POST "${OS_URL}/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary "@${BULK_FILE}" 2>/dev/null)

ERRORS=$(echo "$RESPONSE" | grep -o '"errors":true' || echo "")
if [[ -n "$ERRORS" ]]; then
  warn "Some bulk operations reported errors"
  echo "$RESPONSE" | grep -o '"error":{[^}]*}' | head -5
else
  ok "All ${ENTITY_COUNT} entities indexed successfully"
fi

# Refresh indices
${CURL_OS} -X POST "${OS_URL}/v3-hive-entity-cwm/_refresh" 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-entity-workmates1/_refresh" 2>/dev/null > /dev/null || true
${CURL_OS} -X POST "${OS_URL}/v3-hive-entity-workmates2/_refresh" 2>/dev/null > /dev/null || true

# ─── Step 4: Verification ───────────────────────────────────────────────────────
header "Step 4: Verification"
echo ""
info "Entity counts per index:"
for IDX in v3-hive-entity-cwm v3-hive-entity-workmates1 v3-hive-entity-workmates2; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/${IDX}/_count" 2>/dev/null | grep -o '"count":[0-9]*' | cut -d: -f2)
  printf "  %-35s %s entities\n" "${IDX}:" "${COUNT:-?}"
done

echo ""
info "Entity type distribution (all tenants):"
for TYPE in host user ip domain; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/v3-hive-entity-*/_count" \
    -H "Content-Type: application/json" \
    -d "{\"query\":{\"term\":{\"type\":\"${TYPE}\"}}}" 2>/dev/null | \
    grep -o '"count":[0-9]*' | cut -d: -f2)
  printf "  %-12s %s\n" "${TYPE}:" "${COUNT:-?}"
done

echo ""
info "Risk level distribution (all tenants):"
for LEVEL in critical high medium low; do
  COUNT=$(${CURL_OS} -s "${OS_URL}/v3-hive-entity-*/_count" \
    -H "Content-Type: application/json" \
    -d "{\"query\":{\"term\":{\"riskLevel\":\"${LEVEL}\"}}}" 2>/dev/null | \
    grep -o '"count":[0-9]*' | cut -d: -f2)
  printf "  %-12s %s\n" "${LEVEL}:" "${COUNT:-?}"
done

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Seed complete — 200 entities across 3 tenants${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Tenant breakdown:"
echo "    CWM (tenant 1):        90 entities (36 hosts, 27 users, 18 IPs, 9 domains)"
echo "    Workmates1 (tenant 2): 60 entities (24 hosts, 18 users, 12 IPs, 6 domains)"
echo "    Workmates2 (tenant 3): 50 entities (20 hosts, 15 users, 10 IPs, 5 domains)"
echo ""
echo "  Risk distribution: 30 critical, 50 high, 70 medium, 50 low"
echo "  Trend distribution: 40 rising, 120 stable, 40 declining"
echo "  Criticality: 20 critical, 40 high, 80 medium, 40 low, 20 unclassified"
echo ""
echo "  Teardown: bash seed-entity-inventory.sh --teardown"
echo ""
