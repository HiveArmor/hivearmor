#!/usr/bin/env bash
# =============================================================================
# seed-incidents.sh — Inject realistic incident lifecycle data into HiveArmor
#
# Drives the REST API end-to-end. No raw SQL. Every incident, alert link,
# note, and status transition goes through the real business logic.
#
# Usage:
#   ./seed-incidents.sh               # seed all 5 incidents
#   ./seed-incidents.sh --teardown    # delete seeded incidents (by name prefix)
#   ./seed-incidents.sh --status      # print current incident list from API
#
# Requirements: curl, jq
# =============================================================================

set -euo pipefail

API="http://localhost:8089"
USERNAME="admin"
PASSWORD="localdev123!"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Auth ──────────────────────────────────────────────────────────────────────

get_token() {
  local resp
  resp=$(curl -sf -X POST "${API}/api/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\",\"rememberMe\":false}")
  echo "$resp" | jq -r '.token // .id_token // empty'
}

TOKEN=$(get_token)
if [[ -z "$TOKEN" ]]; then
  echo -e "${RED}✗ Authentication failed — is the backend running at ${API}?${NC}" >&2
  exit 1
fi

H_AUTH="Authorization: Bearer ${TOKEN}"
H_JSON="Content-Type: application/json"

api_post()  { curl -sf -X POST  -H "$H_AUTH" -H "$H_JSON" "${API}$1" -d "$2"; }
api_put()   { curl -sf -X PUT   -H "$H_AUTH" -H "$H_JSON" "${API}$1" -d "$2"; }
api_get()   { curl -sf          -H "$H_AUTH"               "${API}$1"; }
api_delete(){ curl -sf -X DELETE -H "$H_AUTH"              "${API}$1"; }

log()   { echo -e "${CYAN}  →${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
header(){ echo -e "\n${BOLD}$*${NC}"; }

# ── Alert ID helpers ──────────────────────────────────────────────────────────
# These reference OpenSearch doc IDs that were written by seed-data.sh.
# If alerts haven't been seeded, the IDs are still valid references
# (the FK is unenforced — alert_id is a plain varchar in utm_incident_alert).
# For determinism we use fixed IDs that match the seed-data.sh pattern.

ALERT_IDS=(
  "a1b2c3d4e5f6a1b2c3d4e5f6"
  "b2c3d4e5f6a7b2c3d4e5f6a7"
  "c3d4e5f6a7b8c3d4e5f6a7b8"
  "d4e5f6a7b8c9d4e5f6a7b8c9"
  "e5f6a7b8c9d0e5f6a7b8c9d0"
  "f6a7b8c9d0e1f6a7b8c9d0e1"
  "a7b8c9d0e1f2a7b8c9d0e1f2"
  "b8c9d0e1f2a3b8c9d0e1f2a3"
  "c9d0e1f2a3b4c9d0e1f2a3b4"
  "d0e1f2a3b4c5d0e1f2a3b4c5"
  "e1f2a3b4c5d6e1f2a3b4c5d6"
  "f2a3b4c5d6e7f2a3b4c5d6e7"
  "a3b4c5d6e7f8a3b4c5d6e7f8"
  "b4c5d6e7f8a9b4c5d6e7f8a9"
  "c5d6e7f8a9b0c5d6e7f8a9b0"
)

# Severity: 1=LOW 2=MEDIUM 3=HIGH  |  Status: 1=AUTO_REVIEW 2=OPEN 3=IN_REVIEW 5=COMPLETED

# ── Teardown ──────────────────────────────────────────────────────────────────

teardown() {
  header "Teardown — removing seeded incidents"
  local incidents
  incidents=$(api_get "/api/ha-incidents?page=0&size=100" | jq -c '.[]')
  local count=0
  while IFS= read -r inc; do
    local id name
    id=$(echo "$inc" | jq -r '.id')
    name=$(echo "$inc" | jq -r '.incidentName')
    if [[ "$name" == SEED-* ]]; then
      api_delete "/api/ha-incidents/${id}" >/dev/null 2>&1 || true
      log "Deleted: #${id} ${name}"
      count=$((count+1))
    fi
  done <<< "$incidents"
  ok "Removed ${count} seeded incident(s)"
}

# ── Status ────────────────────────────────────────────────────────────────────

show_status() {
  header "Current incidents"
  api_get "/api/ha-incidents?page=0&size=100" | \
    jq -r '.[] | "  #\(.id)  \(.incidentStatus)  P\(.incidentPriority // "?")  \(.incidentName)"'
}

# ── Create incident ───────────────────────────────────────────────────────────

create_incident() {
  local name="$1" desc="$2" assigned="$3"
  shift 3
  # remaining args are alternating: alertId alertName alertStatus alertSeverity
  local alert_list="["
  local first=true
  while [[ $# -ge 4 ]]; do
    local aid="$1" aname="$2" astatus="$3" asev="$4"
    shift 4
    $first || alert_list+=","
    alert_list+="{\"alertId\":\"${aid}\",\"alertName\":\"${aname}\",\"alertStatus\":${astatus},\"alertSeverity\":${asev}}"
    first=false
  done
  alert_list+="]"

  local body
  body=$(jq -n \
    --arg n "$name" --arg d "$desc" --arg a "$assigned" \
    --argjson al "$alert_list" \
    '{incidentName:$n, incidentDescription:$d, incidentAssignedTo:$a, alertList:$al}')

  api_post "/api/ha-incidents" "$body" | jq -r '.id'
}

add_alerts() {
  local inc_id="$1"; shift
  local alert_list="["
  local first=true
  while [[ $# -ge 4 ]]; do
    local aid="$1" aname="$2" astatus="$3" asev="$4"
    shift 4
    $first || alert_list+=","
    alert_list+="{\"alertId\":\"${aid}\",\"alertName\":\"${aname}\",\"alertStatus\":${astatus},\"alertSeverity\":${asev}}"
    first=false
  done
  alert_list+="]"
  api_post "/api/ha-incidents/add-alerts" \
    "{\"incidentId\":${inc_id},\"alertList\":${alert_list}}" >/dev/null
}

set_priority() {
  local inc_id="$1" priority="$2"
  api_put "/api/ha-incidents/${inc_id}/priority" "{\"priority\":\"${priority}\"}" >/dev/null
}

set_status() {
  local inc_id="$1" status="$2"
  local inc
  inc=$(api_get "/api/ha-incidents/${inc_id}")
  local updated
  updated=$(echo "$inc" | jq --arg s "$status" '.incidentStatus = $s')
  api_put "/api/ha-incidents/change-status" "$updated" >/dev/null
}

add_note() {
  local inc_id="$1" text="$2"
  api_post "/api/utm-incident-notes" \
    "{\"incidentId\":${inc_id},\"noteText\":\"${text}\"}" >/dev/null
}

# ── Main seed ─────────────────────────────────────────────────────────────────

seed() {
  echo -e "\n${BOLD}============================================================${NC}"
  echo -e "${BOLD}  HiveArmor Incident Lifecycle Seed${NC}"
  echo -e "${BOLD}============================================================${NC}"
  log "Authenticated as ${USERNAME} @ ${API}"

  # ------------------------------------------------------------------
  # INC-01  SSH Brute Force → Privilege Escalation  (OPEN, P1, Active)
  # Scenario: Ongoing attack. Analyst just opened it. No resolution yet.
  # ------------------------------------------------------------------
  header "INC-01: SSH Brute Force → Privilege Escalation (OPEN / P1)"

  log "Creating incident..."
  INC1=$(create_incident \
    "SEED-INC-01: SSH Brute Force Escalating to Privilege Escalation" \
    "141 failed SSH logins from 185.220.101.33 against srv-db-01 in under 2 minutes. One login succeeded as user 'backup'. Subsequent sudo execution to /bin/bash detected. Host may be fully compromised." \
    "analyst1" \
    "${ALERT_IDS[0]}" "SSH Brute Force — 141 Failed Logins" 2 3 \
    "${ALERT_IDS[1]}" "Successful SSH Login After Brute Force" 2 3 \
    "${ALERT_IDS[2]}" "Privilege Escalation via sudo (backup→root)" 3 3)
  ok "Created INC-01 → id=${INC1}"

  log "Setting P1 priority (1h SLA)..."
  set_priority "$INC1" "P1"

  log "Adding initial triage note..."
  add_note "$INC1" "Triage: 185.220.101.33 is a known Tor exit node (VirusTotal: 47/95 engines). Attacker gained root on srv-db-01. Isolating host from network segment pending forensic review. IR playbook initiated."

  log "Adding follow-up note..."
  add_note "$INC1" "Follow-up 10m later: confirmed /etc/passwd modification and cron backdoor installed at /etc/cron.d/update. Pulling memory dump. CIRT lead notified."

  ok "INC-01 complete (OPEN, P1, 2 notes, 3 alerts)"

  # ------------------------------------------------------------------
  # INC-02  Ransomware Detonation on Finance Workstation (IN_REVIEW, P1)
  # Scenario: Active IR. Analyst transitioned to in-review, collecting evidence.
  # ------------------------------------------------------------------
  header "INC-02: Ransomware Detonation — Finance Workstation (IN_REVIEW / P1)"

  log "Creating incident..."
  INC2=$(create_incident \
    "SEED-INC-02: Ransomware Detonation on WKSTN-FINANCE-04" \
    "Windows Defender triggered on WKSTN-FINANCE-04 at 06:14 UTC. Process tree: OUTLOOK.EXE → wscript.exe → powershell.exe -enc [...] → vssadmin.exe delete shadows. File extension changes to .locked observed across mapped drives. Backup job connectivity lost." \
    "lead-analyst" \
    "${ALERT_IDS[3]}" "Windows Defender — Ransomware Behavior Detected" 2 3 \
    "${ALERT_IDS[4]}" "Volume Shadow Copy Deletion (vssadmin)" 2 3 \
    "${ALERT_IDS[5]}" "Mass File Rename — .locked Extension" 3 3 \
    "${ALERT_IDS[6]}" "Suspicious PowerShell Base64 Payload" 3 3)
  ok "Created INC-02 → id=${INC2}"

  log "Setting P1 priority..."
  set_priority "$INC2" "P1"

  log "Transitioning to IN_REVIEW..."
  set_status "$INC2" "IN_REVIEW"

  log "Adding triage note..."
  add_note "$INC2" "Isolation complete. WKSTN-FINANCE-04 pulled from network at 06:22 UTC. Email gateway quarantine applied to originating phishing message (SHA256: 3a7f2b...). Affected mapped drives: \\\\fileserver01\\Finance, \\\\fileserver01\\Contracts."

  log "Adding forensic note..."
  add_note "$INC2" "Forensics: Payload is LockBit 3.0 variant. Initial vector confirmed as .xlsm attachment in phishing email received 05:47 UTC. Macro execution enabled by user. IOC package submitted to threat intel feed. Backup restore from 2026-07-09 23:00 UTC snapshot initiated — ETA 4h."

  log "Adding additional linked alerts..."
  add_alerts "$INC2" \
    "${ALERT_IDS[7]}" "Lateral SMB Probe from Infected Host" 3 2

  ok "INC-02 complete (IN_REVIEW, P1, 2 notes, 5 alerts)"

  # ------------------------------------------------------------------
  # INC-03  C2 Beacon — Long-Dwell APT Implant (OPEN, P2)
  # Scenario: Newly detected, lower urgency, assigned for investigation.
  # ------------------------------------------------------------------
  header "INC-03: C2 Beacon — Possible APT Long-Dwell Implant (OPEN / P2)"

  log "Creating incident..."
  INC3=$(create_incident \
    "SEED-INC-03: C2 Beacon Pattern — Possible Long-Dwell APT Implant" \
    "Periodic outbound HTTPS connections from HOST-WKS-12 (10.0.1.30) to 203.0.113.55:443 every 4 hours over the past 11 days. Destination resolves to a bulletproof hosting provider with 0 legitimate traffic. Beacon interval consistent with Cobalt Strike default jitter. No lateral movement observed yet." \
    "analyst2" \
    "${ALERT_IDS[8]}"  "C2 Beacon Detected — Regular Interval HTTPS" 2 3 \
    "${ALERT_IDS[9]}"  "DNS Query to Suspicious Domain (cdn-update-svc.net)" 2 2 \
    "${ALERT_IDS[10]}" "Outbound Connection to Malicious IP (203.0.113.55)" 2 2)
  ok "Created INC-03 → id=${INC3}"

  log "Setting P2 priority (4h SLA)..."
  set_priority "$INC3" "P2"

  log "Adding investigation note..."
  add_note "$INC3" "Threat Intel hit: 203.0.113.55 attributed to APT-29 (Cozy Bear) infrastructure by CISA advisory 2026-06-18. Host-WKS-12 belongs to CFO office. Full disk image ordered. EDR full scan running. Network team has added silent tap — do NOT isolate yet to preserve attacker visibility."

  ok "INC-03 complete (OPEN, P2, 1 note, 3 alerts)"

  # ------------------------------------------------------------------
  # INC-04  SQL Injection on Public Web App  (COMPLETED, P2)
  # Scenario: Fully resolved. Shows the closed lifecycle with solution.
  # ------------------------------------------------------------------
  header "INC-04: SQL Injection Attack — Public API Endpoint (COMPLETED / P2)"

  log "Creating incident..."
  INC4=$(create_incident \
    "SEED-INC-04: SQL Injection on /api/v2/search Endpoint — Contained" \
    "WAF triggered on 847 SQLi payloads targeting /api/v2/search from IP range 198.51.100.0/24 starting 2026-07-09 22:14 UTC. Payloads included UNION SELECT and time-based blind injection patterns. DB query logs show 3 successful data extraction queries returning customer PII fields before WAF rule tightened." \
    "analyst1" \
    "${ALERT_IDS[11]}" "WAF: SQL Injection Detected (847 events)" 3 3 \
    "${ALERT_IDS[12]}" "DB Query Log — Suspicious UNION SELECT Execution" 2 3)
  ok "Created INC-04 → id=${INC4}"

  log "Setting P2 priority..."
  set_priority "$INC4" "P2"

  log "Moving through lifecycle: OPEN → IN_REVIEW → COMPLETED"
  set_status "$INC4" "IN_REVIEW"
  add_note "$INC4" "Root cause: parameterized query missing on search endpoint added in commit a3f7b2 (2026-07-01). Developer error — no code review for that PR. Affected records: ~240 rows exposed (email + hashed password only, no plaintext). Notifying DPO for GDPR assessment. WAF emergency rule blocking /api/v2/search from affected IPs."
  add_note "$INC4" "Remediation: (1) Hotfix deployed — prepared statements enforced. (2) WAF permanent rule added. (3) Affected users notified and sessions invalidated. (4) GDPR 72h notification filed. Closing incident — containment and remediation complete."
  set_status "$INC4" "COMPLETED"

  ok "INC-04 complete (COMPLETED, P2, 2 notes, 2 alerts)"

  # ------------------------------------------------------------------
  # INC-05  Insider Threat — Bulk Data Export  (OPEN, P1, SLA context)
  # Scenario: High-severity, flagged this morning. Tests SLA pressure display.
  # ------------------------------------------------------------------
  header "INC-05: Insider Threat — Anomalous Bulk Data Export (OPEN / P1)"

  log "Creating incident..."
  INC5=$(create_incident \
    "SEED-INC-05: Insider Threat — Anomalous Bulk Export by Privileged User" \
    "DLP alert: user 'mwilson' (Sales Director) exported 18,000 customer records from CRM to personal Dropbox account at 23:42 UTC on 2026-07-09. mwilson submitted resignation yesterday. Export bypassed DLP by using a browser plugin. HR confirmed last day is 2026-07-15. Legal hold required." \
    "lead-analyst" \
    "${ALERT_IDS[13]}" "DLP: Bulk Export to Personal Cloud Storage (18K records)" 2 3 \
    "${ALERT_IDS[14]}" "Anomalous After-Hours Data Access — mwilson" 2 3)
  ok "Created INC-05 → id=${INC5}"

  log "Setting P1 priority..."
  set_priority "$INC5" "P1"

  log "Adding urgent note..."
  add_note "$INC5" "URGENT: Legal notified. mwilson account suspended at 08:05 UTC pending investigation. All active sessions terminated. Forensic preservation order on mwilson's workstation (WKSTN-SALES-08) and mail archive initiated. Browser plugin identified as 'CloudSave Pro' — flagging for enterprise blacklist. Coordinating with HR and Legal."

  ok "INC-05 complete (OPEN, P1, 1 note, 2 alerts)"

  # ------------------------------------------------------------------
  # Summary
  # ------------------------------------------------------------------
  echo ""
  echo -e "${BOLD}============================================================${NC}"
  echo -e "${GREEN}${BOLD}  Seed complete — 5 incidents created${NC}"
  echo -e "${BOLD}============================================================${NC}"
  echo ""

  printf "${BOLD}%-6s %-55s %-12s %-6s %-8s${NC}\n" "ID" "Name" "Status" "Pri" "Alerts"
  printf "%-6s %-55s %-12s %-6s %-8s\n" "$INC1" "SSH Brute Force → Privilege Escalation" "OPEN"      "P1" "3"
  printf "%-6s %-55s %-12s %-6s %-8s\n" "$INC2" "Ransomware Detonation — Finance WS"       "IN_REVIEW" "P1" "5"
  printf "%-6s %-55s %-12s %-6s %-8s\n" "$INC3" "C2 Beacon — APT Long-Dwell Implant"       "OPEN"      "P2" "3"
  printf "%-6s %-55s %-12s %-6s %-8s\n" "$INC4" "SQL Injection — Public API"               "COMPLETED" "P2" "2"
  printf "%-6s %-55s %-12s %-6s %-8s\n" "$INC5" "Insider Threat — Bulk Data Export"        "OPEN"      "P1" "2"
  echo ""

  echo -e "Verify in the UI:"
  echo -e "  ${CYAN}http://localhost:3000/incidents${NC}              — incident board"
  echo -e "  ${CYAN}http://localhost:3000/incidents/${INC1}${NC}   — INC-01 detail (OPEN/P1)"
  echo -e "  ${CYAN}http://localhost:3000/incidents/${INC2}${NC}   — INC-02 detail (IN_REVIEW/P1)"
  echo -e "  ${CYAN}http://localhost:3000/incidents/${INC4}${NC}   — INC-04 detail (COMPLETED)"
  echo ""
  echo -e "Teardown: ${CYAN}./seed-incidents.sh --teardown${NC}"
}

# ── Entry point ───────────────────────────────────────────────────────────────

case "${1:-}" in
  --teardown) teardown ;;
  --status)   show_status ;;
  *)          seed ;;
esac
