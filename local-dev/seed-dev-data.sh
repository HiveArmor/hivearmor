#!/usr/bin/env bash
# =============================================================================
# seed-dev-data.sh — Seed realistic dev data for all HiveArmor UI pages
#
# Seeds:
#   1. PostgreSQL app data via REST API (incidents, investigation sessions,
#      saved queries, reports, correlation rules, playbooks, compliance)
#   2. OpenSearch events via REST (alerts, log events) in correct index pattern
#
# Usage:
#   cd local-dev && bash seed-dev-data.sh          # seed everything
#   bash seed-dev-data.sh --os-only                # OpenSearch only
#   bash seed-dev-data.sh --api-only               # API/PostgreSQL only
#   bash seed-dev-data.sh --status                 # check counts, no write
#
# Requirements: curl, jq, python3
# =============================================================================

set -euo pipefail

API="http://localhost:8088"
OS_URL="https://localhost:9200"
OS_CREDS="admin:LocalDev@2024!"
USERNAME="admin"
PASSWORD="localdev123!"

TODAY=$(date +%Y.%m.%d)
YESTERDAY=$(date -v-1d +%Y.%m.%d 2>/dev/null || date -d "yesterday" +%Y.%m.%d)
TWO_DAYS_AGO=$(date -v-2d +%Y.%m.%d 2>/dev/null || date -d "2 days ago" +%Y.%m.%d)

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

OS_ONLY=false
API_ONLY=false
STATUS_ONLY=false

for arg in "$@"; do
  case $arg in
    --os-only)   OS_ONLY=true ;;
    --api-only)  API_ONLY=true ;;
    --status)    STATUS_ONLY=true ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo -e "${CYAN}[seed]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[err]${NC} $*"; }

get_token() {
  local resp
  resp=$(curl -sf -X POST "${API}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\",\"rememberMe\":false}")
  echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id_token') or d.get('token',''))"
}

api() {
  local method="$1"; local path="$2"; local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sf -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sf -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

os_index() {
  local index="$1"; local doc="$2"
  curl -sf -X POST "${OS_URL}/${index}/_doc" \
    -u "${OS_CREDS}" --insecure \
    -H "Content-Type: application/json" \
    -d "$doc" > /dev/null
}

# ── Status check ──────────────────────────────────────────────────────────────

if $STATUS_ONLY; then
  log "Checking backend status…"
  TOKEN=$(get_token)
  echo "Incidents:     $(api GET '/api/ha-incidents?page=0&size=1' | python3 -c 'import sys,json; print(json.load(sys.stdin).get("totalElements","?"))' 2>/dev/null || echo '?')"
  echo "Alerts(OS):    $(curl -sf "https://localhost:9200/v3-hive-alert-${TODAY}/_count" -u "${OS_CREDS}" --insecure | python3 -c 'import sys,json; print(json.load(sys.stdin).get("count","?"))' 2>/dev/null || echo '?')"
  echo "Inv Sessions:  $(api GET '/api/ha-investigation-sessions' | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"
  echo "Saved Queries: $(api GET '/api/ha-saved-queries' | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo '?')"
  exit 0
fi

log "Getting auth token…"
TOKEN=$(get_token)
if [[ -z "$TOKEN" ]]; then
  err "Could not get auth token. Is the backend running at ${API}?"
  exit 1
fi
ok "Token obtained"

# ═══════════════════════════════════════════════════════════════
# PART 1 — OpenSearch: Alert + Log events
# ═══════════════════════════════════════════════════════════════

if ! $API_ONLY; then
  log "Seeding OpenSearch (index pattern: v3-hive-*-YYYY.MM.DD)…"

  SEVERITY_NAMES=("informational" "low" "medium" "high" "critical")
  CATEGORIES=("authentication" "malware" "network" "policy_violation" "privilege_escalation" "lateral_movement" "data_exfiltration" "endpoint")
  HOSTNAMES=("dc01.corp.local" "ws-finance-12.corp.local" "srv-web-01.dmz" "workstation-dev-03.corp.local" "srv-db-02.prod" "laptop-exec-01.corp.local")
  SOURCE_IPS=("10.0.1.15" "10.0.2.31" "192.168.10.5" "10.0.3.88" "172.16.0.44" "10.0.1.200")
  DEST_IPS=("10.0.0.1" "8.8.8.8" "192.168.1.1" "10.0.0.50" "203.0.113.45" "10.10.0.5")

  # Seed 40 alert events across today and yesterday
  log "  Seeding alert events…"
  for i in $(seq 1 40); do
    SEV_IDX=$(( (i - 1) % 5 ))
    SEV=${SEVERITY_NAMES[$SEV_IDX]}
    SEV_NUM=$SEV_IDX
    CAT=${CATEGORIES[$((i % ${#CATEGORIES[@]}))]}
    HOST=${HOSTNAMES[$((i % ${#HOSTNAMES[@]}))]}
    SRC_IP=${SOURCE_IPS[$((i % ${#SOURCE_IPS[@]}))]}
    DST_IP=${DEST_IPS[$((i % ${#DEST_IPS[@]}))]}
    IDX="v3-hive-alert-${TODAY}"
    [[ $i -gt 25 ]] && IDX="v3-hive-alert-${YESTERDAY}"

    os_index "$IDX" "{
      \"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"severity\": ${SEV_NUM},
      \"severity_label\": \"${SEV}\",
      \"title\": \"Dev Seed: ${CAT^} alert on ${HOST}\",
      \"status\": \"open\",
      \"event.category\": \"${CAT}\",
      \"source.ip\": \"${SRC_IP}\",
      \"destination.ip\": \"${DST_IP}\",
      \"agent.hostname\": \"${HOST}\",
      \"rule.name\": \"seed-rule-${i}\",
      \"seed\": true
    }"
  done
  ok "  40 alert events seeded (v3-hive-alert-${TODAY} + ${YESTERDAY})"

  # Seed 60 windows log events
  log "  Seeding Windows log events…"
  WIN_CODES=("4624" "4625" "4648" "4672" "4688" "4697" "4720" "4740" "7045" "1102")
  for i in $(seq 1 60); do
    CODE=${WIN_CODES[$((i % ${#WIN_CODES[@]}))]}
    HOST=${HOSTNAMES[$((i % ${#HOSTNAMES[@]}))]}
    IDX="v3-hive-log-windows-${TODAY}"
    [[ $i -gt 40 ]] && IDX="v3-hive-log-windows-${YESTERDAY}"
    [[ $i -gt 55 ]] && IDX="v3-hive-log-windows-${TWO_DAYS_AGO}"

    os_index "$IDX" "{
      \"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"event.code\": \"${CODE}\",
      \"event.action\": \"seed-windows-event\",
      \"source.ip\": \"${SOURCE_IPS[$((i % ${#SOURCE_IPS[@]}))]}\",
      \"user.name\": \"dev_user_${i}\",
      \"agent.hostname\": \"${HOST}\",
      \"seed\": true
    }"
  done
  ok "  60 Windows log events seeded"

  # Seed 30 Linux log events
  log "  Seeding Linux log events…"
  LINUX_ACTIONS=("ssh_login" "sudo_command" "cron_job" "file_write" "process_start" "network_connection")
  for i in $(seq 1 30); do
    ACT=${LINUX_ACTIONS[$((i % ${#LINUX_ACTIONS[@]}))]}
    HOST=${HOSTNAMES[$((i % ${#HOSTNAMES[@]}))]}
    os_index "v3-hive-log-linux-${TODAY}" "{
      \"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"event.action\": \"${ACT}\",
      \"source.ip\": \"${SOURCE_IPS[$((i % ${#SOURCE_IPS[@]}))]}\",
      \"user.name\": \"svc_account_${i}\",
      \"agent.hostname\": \"${HOST}\",
      \"seed\": true
    }"
  done
  ok "  30 Linux log events seeded"

  # Seed 20 firewall events
  log "  Seeding firewall log events…"
  for i in $(seq 1 20); do
    ACTION=$([ $((i % 3)) -eq 0 ] && echo "blocked" || echo "allowed")
    os_index "v3-hive-log-firewall-${TODAY}" "{
      \"@timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"event.action\": \"${ACTION}\",
      \"source.ip\": \"${SOURCE_IPS[$((i % ${#SOURCE_IPS[@]}))]}\",
      \"destination.ip\": \"${DEST_IPS[$((i % ${#DEST_IPS[@]}))]}\",
      \"destination.port\": $((1024 + i * 17)),
      \"network.protocol\": \"tcp\",
      \"seed\": true
    }"
  done
  ok "  20 firewall events seeded"

  ok "OpenSearch seeding complete"
fi

# ═══════════════════════════════════════════════════════════════
# PART 2 — API / PostgreSQL data
# ═══════════════════════════════════════════════════════════════

if ! $OS_ONLY; then

  # ── Incidents ────────────────────────────────────────────────
  log "Seeding incidents…"
  INCIDENT_NAMES=(
    "Ransomware activity detected on finance workstations"
    "Credential stuffing attack against VPN gateway"
    "Suspected insider data exfiltration — HR department"
    "Lateral movement from compromised service account"
    "Command and control beacon detected on DMZ server"
    "Privilege escalation via scheduled task on DC01"
    "Phishing campaign targeting executive accounts"
    "Anomalous AWS S3 data access from unknown IP"
  )
  SEVERITIES=(3 2 3 2 3 1 2 1)
  STATUSES=("open" "in_progress" "open" "in_progress" "open" "resolved" "open" "open")
  ASSIGNEES=("admin" "admin" "" "admin" "" "admin" "" "")

  for i in "${!INCIDENT_NAMES[@]}"; do
    NAME="${INCIDENT_NAMES[$i]}"
    SEV="${SEVERITIES[$i]}"
    STATUS="${STATUSES[$i]}"
    ASSIGNEE="${ASSIGNEES[$i]}"
    ASSIGNEE_JSON=""
    [[ -n "$ASSIGNEE" ]] && ASSIGNEE_JSON=", \"incidentAssignedTo\": \"${ASSIGNEE}\""

    RESP=$(api POST "/api/ha-incidents" "{
      \"incidentName\": \"[SEED] ${NAME}\",
      \"incidentStatus\": \"${STATUS}\",
      \"incidentSeverity\": ${SEV},
      \"incidentDescription\": \"Seeded incident for dev/test — ${NAME}\"
      ${ASSIGNEE_JSON}
    }" 2>/dev/null || echo '{}')

    INC_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
    if [[ -n "$INC_ID" ]]; then
      ok "  Incident #${INC_ID}: ${NAME:0:50}…"
    else
      warn "  Could not create incident: ${NAME:0:50} (may already exist)"
    fi
  done

  # ── Investigation Sessions ────────────────────────────────────
  log "Seeding investigation sessions…"
  SESSION_NAMES=(
    "Ransomware Triage — Finance Workstations"
    "Threat Hunt — Lateral Movement Indicators"
    "VPN Gateway Brute Force Investigation"
    "Insider Threat Analysis — HR"
    "APT Beacon Analysis — DMZ"
  )
  for i in "${!SESSION_NAMES[@]}"; do
    NAME="${SESSION_NAMES[$i]}"
    STATUS=$([ $((i % 3)) -eq 0 ] && echo "active" || echo "open")
    api POST "/api/ha-investigation-sessions" "{
      \"sessionName\": \"[SEED] ${NAME}\",
      \"description\": \"Dev seed session — ${NAME}\",
      \"status\": \"${STATUS}\",
      \"assignedTo\": \"admin\"
    }" > /dev/null 2>&1 || warn "  Session may already exist: ${NAME:0:50}"
    ok "  Session: ${NAME:0:50}"
  done

  # ── Saved Queries ────────────────────────────────────────────
  log "Seeding saved queries…"
  QUERIES=(
    '{"name":"[SEED] Failed logins last 24h","query":"event.code:4625","description":"Windows failed login events"}'
    '{"name":"[SEED] Critical alerts open","query":"severity:3 AND status:open","description":"All open critical severity alerts"}'
    '{"name":"[SEED] Lateral movement indicators","query":"event.category:lateral_movement","description":"Lateral movement detection events"}'
    '{"name":"[SEED] Privileged account activity","query":"event.code:4672 OR event.code:4673","description":"Special privilege use events"}'
    '{"name":"[SEED] Outbound to suspicious IPs","query":"event.action:blocked AND network.protocol:tcp","description":"Firewall blocked outbound connections"}'
  )
  for q in "${QUERIES[@]}"; do
    api POST "/api/ha-saved-queries" "$q" > /dev/null 2>&1 || warn "  Saved query may already exist"
  done
  ok "  5 saved queries seeded"

  # ── Correlation Rules ─────────────────────────────────────────
  log "Seeding correlation rules…"
  RULES=(
    '{"ruleName":"[SEED] Multiple failed logins same host","ruleActive":true,"ruleDescription":"Detects brute force — 5+ failed logins within 5 min from same source","ruleSeverity":2,"dataTypes":["windows"]}'
    '{"ruleName":"[SEED] Admin account after hours","ruleActive":true,"ruleDescription":"Admin login outside business hours","ruleSeverity":3,"dataTypes":["windows","linux"]}'
    '{"ruleName":"[SEED] Scheduled task created","ruleActive":false,"ruleDescription":"New scheduled task created — potential persistence","ruleSeverity":2,"dataTypes":["windows"]}'
    '{"ruleName":"[SEED] Data transfer over 1GB","ruleActive":true,"ruleDescription":"Large outbound data transfer detected","ruleSeverity":3,"dataTypes":["firewall","proxy"]}'
    '{"ruleName":"[SEED] Lateral movement via SMB","ruleActive":true,"ruleDescription":"SMB connections to multiple hosts from single source","ruleSeverity":2,"dataTypes":["windows","network"]}'
  )
  for rule in "${RULES[@]}"; do
    api POST "/api/correlation-rule" "$rule" > /dev/null 2>&1 || warn "  Rule may already exist"
  done
  ok "  5 correlation rules seeded"

  # ── SOAR Playbooks (canonical /api/ha-playbooks; executable steps only) ──
  log "Seeding SOAR playbooks…"
  PLAYBOOKS=(
    '{"name":"[SEED] Ransomware Response","description":"STAGING CANDIDATE — notify then isolate (agentId at execute)","triggerType":"alert-triggered","active":false,"steps":[{"stepIndex":0,"stepType":"condition","label":"Ransomware category","config":{"field":"alert.category","op":"eq","value":"ransomware"}},{"stepIndex":1,"stepType":"action","label":"Notify SOC","config":{"actionId":"send-webhook","method":"POST","body":"{\"source\":\"hivearmor\",\"event\":\"seed-ransomware\"}"}},{"stepIndex":2,"stepType":"delay","label":"Confirm window","config":{"delaySeconds":2}},{"stepIndex":3,"stepType":"action","label":"Isolate host","config":{"actionId":"isolate_host","params":{"duration":"24h"}}}]}'
    '{"name":"[SEED] ATO Webhook Escalate","description":"STAGING CANDIDATE — identity ATO escalate via webhook only (no Okta disable_user)","triggerType":"alert-triggered","active":true,"steps":[{"stepIndex":0,"stepType":"condition","label":"High or critical","config":{"field":"alert.severity","op":"in","value":["high","critical"]}},{"stepIndex":1,"stepType":"delay","label":"Identity review","config":{"delaySeconds":2}},{"stepIndex":2,"stepType":"action","label":"Notify identity channel","config":{"actionId":"send-webhook","method":"POST","body":"{\"source\":\"hivearmor\",\"event\":\"seed-ato\"}"}}]}'
    '{"name":"[SEED] Phishing Triage","description":"STAGING CANDIDATE — phishing triage delay + webhook","triggerType":"alert-triggered","active":true,"steps":[{"stepIndex":0,"stepType":"delay","label":"Mailbox context","config":{"delaySeconds":2}},{"stepIndex":1,"stepType":"condition","label":"Phishing category","config":{"field":"alert.category","op":"eq","value":"phishing"}},{"stepIndex":2,"stepType":"action","label":"Notify SOC","config":{"actionId":"send-webhook","method":"POST","body":"{\"source\":\"hivearmor\",\"event\":\"seed-phishing\"}"}}]}'
    '{"name":"[SEED] Malware Containment","description":"STAGING CANDIDATE — quarantine + isolate (agentId at execute)","triggerType":"alert-triggered","active":false,"steps":[{"stepIndex":0,"stepType":"action","label":"Quarantine file","config":{"actionId":"quarantine_file","params":{"path":"/tmp/sample.bin"}}},{"stepIndex":1,"stepType":"action","label":"Isolate host","config":{"actionId":"isolate_host","params":{"duration":"24h"}}},{"stepIndex":2,"stepType":"delay","label":"Follow-up pause","config":{"delaySeconds":5}}]}'
    '{"name":"[SEED] Brute-Force Triage","description":"STAGING CANDIDATE — brute-force condition + webhook","triggerType":"alert-triggered","active":true,"steps":[{"stepIndex":0,"stepType":"condition","label":"Brute-force category","config":{"field":"alert.category","op":"eq","value":"brute-force"}},{"stepIndex":1,"stepType":"action","label":"Notify SOC","config":{"actionId":"send-webhook","method":"POST","body":"{\"source\":\"hivearmor\",\"event\":\"seed-brute-force\"}"}}]}'
    '{"name":"[SEED] Lateral Movement Containment","description":"STAGING CANDIDATE — isolate pivot host (agentId at execute)","triggerType":"alert-triggered","active":false,"steps":[{"stepIndex":0,"stepType":"condition","label":"Lateral movement","config":{"field":"alert.technique","op":"eq","value":"lateral-movement"}},{"stepIndex":1,"stepType":"delay","label":"Confirm pivot","config":{"delaySeconds":3}},{"stepIndex":2,"stepType":"action","label":"Isolate host","config":{"actionId":"isolate_host","params":{"duration":"8h"}}}]}'
  )
  for pb in "${PLAYBOOKS[@]}"; do
    api POST "/api/ha-playbooks" "$pb" > /dev/null 2>&1 || warn "  Playbook may already exist"
  done
  ok "  6 SOAR playbooks seeded (with steps)"

  # ── Reports ───────────────────────────────────────────────────
  log "Seeding report records…"
  api POST "/api/ha-reports" '{
    "name": "[SEED] Weekly Security SITREP",
    "type": "SITREP",
    "status": "COMPLETED",
    "description": "Dev seed report — weekly security situation report"
  }' > /dev/null 2>&1 || warn "  Report may already exist"

  api POST "/api/ha-reports" '{
    "name": "[SEED] Ransomware Incident Report",
    "type": "INCIDENT",
    "status": "COMPLETED",
    "description": "Dev seed — post-incident report for ransomware event"
  }' > /dev/null 2>&1 || warn "  Report may already exist"

  api POST "/api/ha-reports" '{
    "name": "[SEED] Q3 After-Action Review",
    "type": "AFTER_ACTION",
    "status": "DRAFT",
    "description": "Dev seed — Q3 AAR draft"
  }' > /dev/null 2>&1 || warn "  Report may already exist"
  ok "  3 report records seeded"

  # ── Scheduled Reports ─────────────────────────────────────────
  log "Seeding scheduled report…"
  api POST "/api/ha-reports/scheduled" '{
    "name": "[SEED] Weekly Security Digest",
    "reportType": "SITREP",
    "cronExpression": "0 8 * * 1",
    "active": true,
    "recipients": ["admin@hivearmor.local"]
  }' > /dev/null 2>&1 || warn "  Scheduled report may already exist"
  ok "  1 scheduled report seeded"

  # ── Compliance governance (POA&M + exceptions) ─────────────
  log "Seeding compliance governance (POA&M + exceptions)…"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if bash "${SCRIPT_DIR}/seed-compliance-governance.sh"; then
    ok "  Compliance governance seed complete"
  else
    warn "  Compliance governance seed skipped (PostgreSQL or tables unavailable)"
  fi

  # ── Compliance evidence (OpenSearch + PCI score) ─────────────
  log "Seeding compliance evidence (OpenSearch)…"
  if bash "${SCRIPT_DIR}/seed-compliance-evidence.sh"; then
    ok "  Compliance evidence seed complete"
  else
    warn "  Compliance evidence seed skipped (OpenSearch or PostgreSQL unavailable)"
  fi

  ok "API / PostgreSQL seeding complete"
fi

echo ""
echo -e "${BOLD}${GREEN}✓ Dev seed complete${NC}"
echo ""
echo "Data seeded:"
echo "  OpenSearch: 40 alerts, 60 win logs, 30 linux logs, 20 firewall logs"
echo "  Incidents: up to 8 seeded (check /incidents)"
echo "  Investigation Sessions: up to 5 seeded (check /investigate/sessions)"
echo "  Saved Queries: up to 5 seeded (check /hunt)"
echo "  Correlation Rules: up to 5 seeded (check /defend/detection-rules)"
echo "  SOAR Playbooks: up to 6 seeded with steps (check /response/playbooks)"
echo "  Reports: up to 3 report records + 1 scheduled (check /reports)"
echo "  Compliance governance: POA&M + exceptions (check /compliance drawer tabs)"
echo "  Compliance evidence: OpenSearch v3-hive-compliance-evidence-* (check /compliance)"
echo ""
echo "Indices written:"
echo "  v3-hive-alert-${TODAY}"
echo "  v3-hive-alert-${YESTERDAY}"
echo "  v3-hive-log-windows-${TODAY} + ${YESTERDAY} + ${TWO_DAYS_AGO}"
echo "  v3-hive-log-linux-${TODAY}"
echo "  v3-hive-log-firewall-${TODAY}"
echo ""
echo "Run with --status to verify counts."
