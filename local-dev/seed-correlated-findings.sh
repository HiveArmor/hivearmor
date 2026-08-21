#!/usr/bin/env bash
# =============================================================================
# seed-correlated-findings.sh — Sprint 44 Correlated Findings test data
#
# Seeds 20 correlated findings (10 CWM + 6 Workmates1 + 4 Workmates2) with:
#   - Multi-stage attack chains (3-6 stages per finding)
#   - 3-7 signals per finding with rule names, severities, MITRE techniques
#   - 5-15 entities per finding (ip, host, user, process, file)
#   - Relationship graphs with 4-12 edges
#   - Analyst-readable markdown narratives (2-5 paragraphs)
#   - Correlation reasons with confidence scores
#   - 15 finding_notes in PostgreSQL for reviewing/confirmed findings
#   - Status distribution: 8 new, 5 reviewing, 4 confirmed, 3 dismissed
#   - MITRE ATT&CK coverage: TA0001-TA0011, techniques T1078-T1218
#   - Timestamps spanning last 14 days
#
# Usage:
#   cd local-dev && bash seed-correlated-findings.sh
#   cd local-dev && bash seed-correlated-findings.sh --teardown
#
# Prerequisites:
#   - PostgreSQL on localhost:5438 (postgres / localdev123!)
#   - OpenSearch on https://localhost:9200 (admin / LocalDev@2024!)
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OS="curl -sk -u ${OS_USER}:${OS_PASS}"
PG_HOST="localhost"
PG_PORT="5438"
PG_USER="postgres"
PG_DB="hivearmor"
export PGPASSWORD="localdev123!"

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
info()   { echo -e "${CYAN}  →${NC} $*"; }
ok()     { echo -e "${GREEN}  ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()   { echo -e "${RED}  ✗${NC} $*"; }
header() { echo -e "\n${BOLD}$*${NC}"; }

# ─── Date helpers ───────────────────────────────────────────────────────────────
# Generate ISO timestamps relative to now
days_ago() {
  local days=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -v-${days}d +%Y-%m-%dT%H:%M:%S.000Z
  else
    date -u -d "${days} days ago" +%Y-%m-%dT%H:%M:%S.000Z
  fi
}

days_ago_index() {
  local days=$1
  if [[ "$(uname)" == "Darwin" ]]; then
    date -u -v-${days}d +%Y.%m.%d
  else
    date -u -d "${days} days ago" +%Y.%m.%d
  fi
}

# ─── Teardown ───────────────────────────────────────────────────────────────────
teardown() {
  header "Teardown — removing Sprint 44 correlated findings seed data"
  info "Removing PostgreSQL finding_notes..."
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -q 2>/dev/null << 'SQL' || true
DELETE FROM finding_notes WHERE finding_id LIKE 'cor-%';
SQL
  ok "PostgreSQL cleanup done"
  info "Removing OpenSearch correlation indices..."
  ${CURL_OS} -X DELETE "${OS_URL}/v3-hive-correlation-*" 2>/dev/null > /dev/null || true
  ok "OpenSearch correlation indices removed"
  info "Removing index template..."
  ${CURL_OS} -X DELETE "${OS_URL}/_index_template/v3-hive-correlation-template" 2>/dev/null > /dev/null || true
  ok "Index template removed"
  ok "Teardown complete"
  exit 0
}
[[ "${1:-}" == "--teardown" ]] && teardown

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  HiveArmor — Sprint 44 Correlated Findings Seed (20 findings)${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
info "PostgreSQL: ${PG_HOST}:${PG_PORT}/${PG_DB}"
info "OpenSearch: ${OS_URL}"
echo ""

# ─── Idempotent: clean previous seed data ───────────────────────────────────────
header "Step 0: Teardown previous seed data (idempotent re-run)"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -q 2>/dev/null << 'SQL' || true
DELETE FROM finding_notes WHERE finding_id LIKE 'cor-%';
SQL
${CURL_OS} -X DELETE "${OS_URL}/v3-hive-correlation-*" 2>/dev/null > /dev/null || true
${CURL_OS} -X DELETE "${OS_URL}/_index_template/v3-hive-correlation-template" 2>/dev/null > /dev/null || true
ok "Previous seed data removed"


# ─── Step 1: Create index template ─────────────────────────────────────────────
header "Step 1: Create OpenSearch index template for v3-hive-correlation-*"

${CURL_OS} -X PUT "${OS_URL}/_index_template/v3-hive-correlation-template" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["v3-hive-correlation-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.mapping.total_fields.limit": 2000
    },
    "mappings": {
      "properties": {
        "id": { "type": "keyword" },
        "title": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
        "narrative": { "type": "text" },
        "severity": { "type": "keyword" },
        "status": { "type": "keyword" },
        "assignee": { "type": "keyword" },
        "createdAt": { "type": "date" },
        "updatedAt": { "type": "date" },
        "confidence": { "type": "float" },
        "signalCount": { "type": "integer" },
        "eventCount": { "type": "integer" },
        "attackStageCount": { "type": "integer" },
        "entityCount": { "type": "integer" },
        "leadEntity": {
          "type": "object",
          "properties": {
            "type": { "type": "keyword" },
            "value": { "type": "keyword" }
          }
        },
        "stages": {
          "type": "nested",
          "properties": {
            "order": { "type": "integer" },
            "name": { "type": "keyword" },
            "mitreTactic": { "type": "keyword" },
            "mitreTechnique": { "type": "keyword" },
            "description": { "type": "text" },
            "signalIds": { "type": "keyword" },
            "timestamp": { "type": "date" },
            "status": { "type": "keyword" }
          }
        },
        "entities": {
          "type": "nested",
          "properties": {
            "id": { "type": "keyword" },
            "type": { "type": "keyword" },
            "value": { "type": "keyword" },
            "role": { "type": "keyword" },
            "riskScore": { "type": "integer" },
            "firstSeen": { "type": "date" },
            "lastSeen": { "type": "date" },
            "signalCount": { "type": "integer" }
          }
        },
        "relationships": {
          "type": "nested",
          "properties": {
            "source": { "type": "keyword" },
            "target": { "type": "keyword" },
            "type": { "type": "keyword" },
            "evidence": { "type": "text" }
          }
        },
        "correlationReasons": {
          "type": "nested",
          "properties": {
            "type": { "type": "keyword" },
            "description": { "type": "text" },
            "confidence": { "type": "float" },
            "evidence": { "type": "text" }
          }
        },
        "mitreTactics": { "type": "keyword" },
        "mitreTechniques": { "type": "keyword" },
        "visibleBy": { "type": "keyword" }
      }
    }
  }
}' 2>/dev/null | grep -q '"acknowledged":true' && ok "Index template created" || fail "Index template creation failed"


# ─── Step 2: Seed CWM Tenant Findings (10 findings) ────────────────────────────
header "Step 2: Seed CWM tenant findings (10 attack chains)"

# Helper to index a finding document
index_finding() {
  local tenant="$1"
  local days_offset="$2"
  local doc="$3"
  local index_date
  index_date=$(days_ago_index "$days_offset")
  local index="v3-hive-correlation-${tenant}-${index_date}"
  local id
  id=$(echo "$doc" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

  local result
  result=$(${CURL_OS} -X PUT "${OS_URL}/${index}/_doc/${id}" \
    -H "Content-Type: application/json" \
    -d "$doc" 2>/dev/null)

  if echo "$result" | grep -q '"result":"created"\|"result":"updated"'; then
    ok "Indexed: ${id} → ${index}"
  else
    fail "Failed to index ${id}: $result"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 1: Multi-stage Ransomware Deployment (5 stages)
# Status: new | Severity: critical | Days ago: 1
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-1: Multi-stage Ransomware Deployment"
CWM_F1_CREATED=$(days_ago 1)
CWM_F1_UPDATED=$(days_ago 0)

read -r -d '' CWM_F1 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-001",
  "title": "Multi-stage Ransomware Deployment via Compromised VPN",
  "narrative": "## Attack Summary\n\nAn external threat actor gained initial access through a compromised VPN credential belonging to user `carlos.rodriguez`. The credential was likely obtained through a previous phishing campaign identified in separate alert cluster ALR-7821.\n\n## Execution Chain\n\nWithin 30 minutes of initial VPN authentication from IP 203.0.113.88 (geolocation: Eastern Europe), the attacker deployed a PowerShell-based loader on workstation FIN-WKS-044. The loader established persistence via a scheduled task named 'WindowsUpdate' set to execute every 4 hours. Network telemetry shows the loader beaconing to C2 infrastructure at 198.51.100.44 on port 443 using domain-fronting techniques.\n\n## Lateral Movement & Impact\n\nThe attacker harvested Kerberos tickets from FIN-WKS-044 memory using a custom Mimikatz variant, then moved laterally to ENG-SRV-012 and HR-LPT-007 via SMB admin shares. At 07:15 UTC, the ransomware payload (identified as LockBit 3.0 variant) was deployed across 3 hosts in the finance network segment, encrypting 847 files before EDR containment triggered.\n\n## Analyst Recommendation\n\nImmediate incident escalation recommended. The attack demonstrates sophisticated tradecraft including credential theft, domain-fronting C2, and rapid lateral movement. All compromised hosts should be isolated and reimaged.",
  "severity": "critical",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.94,
  "signalCount": 12,
  "eventCount": 847,
  "attackStageCount": 5,
  "entityCount": 8,
  "leadEntity": { "type": "ip", "value": "203.0.113.88" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "VPN login from unusual geolocation using carlos.rodriguez credentials", "signalIds": ["sig-001-001", "sig-001-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "PowerShell loader deployed on FIN-WKS-044 with encoded command", "signalIds": ["sig-001-003", "sig-001-004", "sig-001-005"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1053", "description": "Scheduled task WindowsUpdate created for 4-hour beacon interval", "signalIds": ["sig-001-006"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "SMB lateral movement to ENG-SRV-012 and HR-LPT-007 using stolen Kerberos tickets", "signalIds": ["sig-001-007", "sig-001-008", "sig-001-009"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 5, "name": "Impact", "mitreTactic": "TA0040", "mitreTechnique": "T1486", "description": "LockBit 3.0 ransomware deployed across finance segment encrypting 847 files", "signalIds": ["sig-001-010", "sig-001-011", "sig-001-012"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-001-001", "type": "user", "value": "carlos.rodriguez", "role": "victim", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-001-002", "type": "host", "value": "FIN-WKS-044", "role": "compromised", "riskScore": 98, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 6 },
    { "id": "ent-001-003", "type": "host", "value": "ENG-SRV-012", "role": "compromised", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-001-004", "type": "host", "value": "HR-LPT-007", "role": "compromised", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-001-005", "type": "ip", "value": "203.0.113.88", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-001-006", "type": "ip", "value": "198.51.100.44", "role": "infrastructure", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-001-007", "type": "process", "value": "powershell.exe -enc", "role": "attacker", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-001-008", "type": "file", "value": "C:\\Windows\\Temp\\svchost_update.exe", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 }
  ],
  "relationships": [
    { "source": "ent-001-005", "target": "ent-001-001", "type": "authenticated_as", "evidence": ["VPN authentication event from 203.0.113.88"] },
    { "source": "ent-001-001", "target": "ent-001-002", "type": "executed_on", "evidence": ["User session on FIN-WKS-044 post-VPN"] },
    { "source": "ent-001-007", "target": "ent-001-002", "type": "executed_on", "evidence": ["PowerShell process creation event"] },
    { "source": "ent-001-002", "target": "ent-001-006", "type": "communicated_with", "evidence": ["C2 beacon traffic to 198.51.100.44:443"] },
    { "source": "ent-001-002", "target": "ent-001-003", "type": "lateral_movement", "evidence": ["SMB connection with admin share access", "Kerberos TGS request"] },
    { "source": "ent-001-002", "target": "ent-001-004", "type": "lateral_movement", "evidence": ["SMB admin share connection"] },
    { "source": "ent-001-007", "target": "ent-001-008", "type": "dropped_file", "evidence": ["File write event: svchost_update.exe"] },
    { "source": "ent-001-008", "target": "ent-001-003", "type": "executed_on", "evidence": ["Ransomware payload execution on ENG-SRV-012"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Sequential detection rules triggered following ATT&CK kill chain progression from Initial Access through Impact", "confidence": 0.95, "evidence": "5 rules fired within 45-minute window matching known ransomware playbook" },
    { "type": "shared_entity", "description": "Common user account carlos.rodriguez and host FIN-WKS-044 across initial access, execution, and lateral movement stages", "confidence": 0.92, "evidence": "Entity carlos.rodriguez present in 4 of 12 signals" },
    { "type": "temporal_proximity", "description": "All 12 signals occurred within a 45-minute window indicating single-operator attack", "confidence": 0.88, "evidence": "First signal at 06:30 UTC, last at 07:15 UTC" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0003", "TA0008", "TA0040"],
  "mitreTechniques": ["T1078", "T1059", "T1053", "T1021", "T1486"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F1=$(echo "$CWM_F1" | sed "s/CREATED_PLACEHOLDER/${CWM_F1_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F1_UPDATED}/g")
index_finding "cwm" 1 "$CWM_F1"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 2: Credential Theft & Lateral Movement (4 stages)
# Status: reviewing | Severity: high | Days ago: 3 | Assignee: maya.chen
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-2: Credential Theft & Lateral Movement"
CWM_F2_CREATED=$(days_ago 3)
CWM_F2_UPDATED=$(days_ago 2)

read -r -d '' CWM_F2 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-002",
  "title": "Credential Theft and Lateral Movement - Finance Domain",
  "narrative": "## Attack Summary\n\nA compromised service account `admin-svc-01` was used to perform credential dumping on domain controller DC-PROD-01, followed by lateral movement to three finance department workstations. The initial compromise vector appears to be a misconfigured service principal with Kerberoastable SPN.\n\n## Credential Access\n\nAt 14:20 UTC, anomalous Kerberos TGS requests were detected from workstation FIN-WKS-022 targeting the admin-svc-01 service principal. The request pattern matches Kerberoasting activity — multiple RC4-encrypted tickets requested in rapid succession. Within 8 minutes, the attacker obtained a valid session on DC-PROD-01 using the cracked credential.\n\n## Lateral Movement Pattern\n\nFrom DC-PROD-01, the attacker performed LDAP enumeration of finance department OUs, then established WMI sessions to FIN-WKS-018, FIN-WKS-033, and FIN-DB-01. Each session executed a reconnaissance script collecting stored credentials from browser credential stores and SSH key directories.\n\n## Impact Assessment\n\nNo data exfiltration detected yet, but the attacker has positioned themselves with broad access to financial systems. The compromised service account has Domain Admin equivalent privileges through group nesting.",
  "severity": "high",
  "status": "reviewing",
  "assignee": "maya.chen",
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.87,
  "signalCount": 7,
  "eventCount": 234,
  "attackStageCount": 4,
  "entityCount": 9,
  "leadEntity": { "type": "user", "value": "admin-svc-01" },
  "stages": [
    { "order": 1, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1558", "description": "Kerberoasting attack targeting admin-svc-01 SPN from FIN-WKS-022", "signalIds": ["sig-002-001", "sig-002-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Privilege Escalation", "mitreTactic": "TA0004", "mitreTechnique": "T1078", "description": "Domain admin login with cracked service account credentials", "signalIds": ["sig-002-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Discovery", "mitreTactic": "TA0007", "mitreTechnique": "T1018", "description": "LDAP enumeration of finance department OUs and workstations", "signalIds": ["sig-002-004", "sig-002-005"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "WMI lateral movement to FIN-WKS-018, FIN-WKS-033, and FIN-DB-01", "signalIds": ["sig-002-006", "sig-002-007"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-002-001", "type": "user", "value": "admin-svc-01", "role": "compromised", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-002-002", "type": "host", "value": "FIN-WKS-022", "role": "attacker", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-002-003", "type": "host", "value": "DC-PROD-01", "role": "compromised", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-002-004", "type": "host", "value": "FIN-WKS-018", "role": "victim", "riskScore": 78, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-002-005", "type": "host", "value": "FIN-WKS-033", "role": "victim", "riskScore": 78, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-002-006", "type": "host", "value": "FIN-DB-01", "role": "victim", "riskScore": 92, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-002-007", "type": "process", "value": "wmiprvse.exe", "role": "attacker", "riskScore": 75, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-002-008", "type": "user", "value": "SYSTEM", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-002-009", "type": "file", "value": "C:\\Windows\\Temp\\enum.ps1", "role": "attacker", "riskScore": 88, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-002-002", "target": "ent-002-001", "type": "authenticated_as", "evidence": ["Kerberos TGS request for admin-svc-01 SPN"] },
    { "source": "ent-002-001", "target": "ent-002-003", "type": "authenticated_as", "evidence": ["Domain admin logon to DC-PROD-01"] },
    { "source": "ent-002-003", "target": "ent-002-004", "type": "lateral_movement", "evidence": ["WMI connection from DC to FIN-WKS-018"] },
    { "source": "ent-002-003", "target": "ent-002-005", "type": "lateral_movement", "evidence": ["WMI connection from DC to FIN-WKS-033"] },
    { "source": "ent-002-003", "target": "ent-002-006", "type": "lateral_movement", "evidence": ["WMI connection from DC to FIN-DB-01"] },
    { "source": "ent-002-007", "target": "ent-002-004", "type": "executed_on", "evidence": ["WMI provider host process on target"] },
    { "source": "ent-002-007", "target": "ent-002-009", "type": "dropped_file", "evidence": ["Reconnaissance script written to temp directory"] }
  ],
  "correlationReasons": [
    { "type": "shared_entity", "description": "Service account admin-svc-01 is the common thread across Kerberoasting, domain logon, and lateral movement", "confidence": 0.92, "evidence": "admin-svc-01 appears in 5 of 7 signals" },
    { "type": "behavior_sequence", "description": "Classic Kerberoasting → privilege escalation → lateral movement attack pattern", "confidence": 0.89, "evidence": "Attack follows documented APT playbook for Active Directory compromise" },
    { "type": "temporal_proximity", "description": "All activity within 25-minute window from credential theft to lateral movement", "confidence": 0.85, "evidence": "14:20 to 14:45 UTC on same day" }
  ],
  "mitreTactics": ["TA0006", "TA0004", "TA0007", "TA0008"],
  "mitreTechniques": ["T1558", "T1078", "T1018", "T1021"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F2=$(echo "$CWM_F2" | sed "s/CREATED_PLACEHOLDER/${CWM_F2_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F2_UPDATED}/g")
index_finding "cwm" 3 "$CWM_F2"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 3: Supply Chain Compromise via Package Manager (6 stages)
# Status: confirmed | Severity: critical | Days ago: 5
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-3: Supply Chain Compromise via Package Manager"
CWM_F3_CREATED=$(days_ago 5)
CWM_F3_UPDATED=$(days_ago 3)

read -r -d '' CWM_F3 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-003",
  "title": "Supply Chain Compromise via Typosquatted NPM Package",
  "narrative": "## Attack Summary\n\nA developer workstation DEV-WKS-091 installed a typosquatted npm package `lodsah` (mimicking `lodash`) during a routine `npm install`. The malicious package contained a postinstall script that downloaded and executed a second-stage payload from attacker-controlled infrastructure.\n\n## Initial Compromise\n\nThe package `lodsah@4.17.22` was added to `package.json` of the internal microservices repository at 09:15 UTC. The postinstall hook executed `node -e` with an obfuscated script that fetched content from `cdn-assets[.]workers[.]dev`. This domain was registered 72 hours prior to the attack and serves as a Cloudflare Worker proxy to the actual C2.\n\n## Persistence & Discovery\n\nThe second-stage payload installed a Node.js-based backdoor as a systemd service named `node-health-monitor` on the developer workstation. The backdoor enumerated environment variables, SSH keys, and AWS credentials stored in `~/.aws/credentials`. It then scanned the internal network for accessible Kubernetes API servers.\n\n## Lateral Spread\n\nUsing harvested AWS credentials, the attacker accessed the EKS cluster and deployed a modified container image to the `payment-service` deployment. The container included a credential harvester targeting service mesh tokens.\n\n## Data Collection & Exfiltration\n\nThe compromised payment-service container intercepted and logged API tokens from service-to-service communications. Collected tokens were base64-encoded and exfiltrated via DNS TXT queries to `telemetry-prod[.]net` at a rate of approximately 500 bytes per query to avoid detection.\n\n## Current Status\n\nThe malicious package has been removed from the repository. The compromised EKS deployment has been rolled back. DNS exfiltration was active for approximately 6 hours before detection.",
  "severity": "critical",
  "status": "confirmed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.91,
  "signalCount": 15,
  "eventCount": 1203,
  "attackStageCount": 6,
  "entityCount": 12,
  "leadEntity": { "type": "host", "value": "DEV-WKS-091" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1195", "description": "Typosquatted npm package lodsah installed via package.json", "signalIds": ["sig-003-001", "sig-003-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "Postinstall script executed obfuscated Node.js payload", "signalIds": ["sig-003-003", "sig-003-004", "sig-003-005"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1543", "description": "Systemd service node-health-monitor installed as backdoor", "signalIds": ["sig-003-006", "sig-003-007"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Discovery", "mitreTactic": "TA0007", "mitreTechnique": "T1552", "description": "Enumeration of AWS credentials, SSH keys, and K8s API servers", "signalIds": ["sig-003-008", "sig-003-009"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 5, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "EKS cluster access via stolen AWS credentials; malicious container deployed", "signalIds": ["sig-003-010", "sig-003-011", "sig-003-012"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 6, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1048", "description": "Service mesh tokens exfiltrated via DNS TXT queries to telemetry-prod.net", "signalIds": ["sig-003-013", "sig-003-014", "sig-003-015"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-003-001", "type": "host", "value": "DEV-WKS-091", "role": "compromised", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 7 },
    { "id": "ent-003-002", "type": "user", "value": "jake.morrison", "role": "victim", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-003-003", "type": "ip", "value": "104.21.45.112", "role": "infrastructure", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-003-004", "type": "host", "value": "eks-prod-cluster", "role": "compromised", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-003-005", "type": "process", "value": "node -e (obfuscated)", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-003-006", "type": "file", "value": "node_modules/lodsah/postinstall.js", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-003-007", "type": "ip", "value": "52.14.88.201", "role": "infrastructure", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-003-008", "type": "host", "value": "payment-service-pod-7f8c", "role": "compromised", "riskScore": 98, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-003-009", "type": "user", "value": "aws-deploy-svc", "role": "compromised", "riskScore": 93, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-003-010", "type": "ip", "value": "185.199.108.22", "role": "attacker", "riskScore": 94, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-003-011", "type": "file", "value": "/var/lib/systemd/node-health-monitor", "role": "attacker", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-003-012", "type": "process", "value": "kubectl apply -f", "role": "attacker", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-003-006", "target": "ent-003-001", "type": "executed_on", "evidence": ["npm postinstall triggered on DEV-WKS-091"] },
    { "source": "ent-003-005", "target": "ent-003-003", "type": "communicated_with", "evidence": ["HTTP GET to cdn-assets.workers.dev (104.21.45.112)"] },
    { "source": "ent-003-005", "target": "ent-003-011", "type": "dropped_file", "evidence": ["Backdoor binary written to systemd path"] },
    { "source": "ent-003-001", "target": "ent-003-007", "type": "communicated_with", "evidence": ["K8s API server scan from developer workstation"] },
    { "source": "ent-003-009", "target": "ent-003-004", "type": "authenticated_as", "evidence": ["AWS credential used for EKS cluster access"] },
    { "source": "ent-003-012", "target": "ent-003-008", "type": "executed_on", "evidence": ["Malicious container deployed to payment-service"] },
    { "source": "ent-003-008", "target": "ent-003-010", "type": "exfiltrated_to", "evidence": ["DNS TXT queries to telemetry-prod.net resolving to 185.199.108.22"] },
    { "source": "ent-003-001", "target": "ent-003-009", "type": "authenticated_as", "evidence": ["AWS credentials harvested from ~/.aws/credentials"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Supply chain attack pattern: malicious package → code execution → credential theft → lateral to cloud → exfiltration", "confidence": 0.93, "evidence": "6 distinct attack stages detected in sequence over 8-hour window" },
    { "type": "shared_entity", "description": "Developer workstation DEV-WKS-091 is the pivot point connecting package compromise to cloud infrastructure access", "confidence": 0.91, "evidence": "DEV-WKS-091 present in 7 of 15 signals" },
    { "type": "temporal_proximity", "description": "Package install to first exfiltration within 3 hours; full chain within 8 hours", "confidence": 0.86, "evidence": "09:15 to 17:30 UTC activity window" },
    { "type": "behavior_sequence", "description": "Matches known supply-chain attack TTPs documented in MITRE ATT&CK Software Supply Chain Compromise", "confidence": 0.90, "evidence": "T1195.002 pattern with cloud pivot" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0003", "TA0007", "TA0008", "TA0010"],
  "mitreTechniques": ["T1195", "T1059", "T1543", "T1552", "T1021", "T1048"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F3=$(echo "$CWM_F3" | sed "s/CREATED_PLACEHOLDER/${CWM_F3_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F3_UPDATED}/g")
index_finding "cwm" 5 "$CWM_F3"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 4: Insider Data Exfiltration (3 stages)
# Status: confirmed | Severity: high | Days ago: 7
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-4: Insider Data Exfiltration"
CWM_F4_CREATED=$(days_ago 7)
CWM_F4_UPDATED=$(days_ago 5)

read -r -d '' CWM_F4 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-004",
  "title": "Insider Data Exfiltration via Personal Cloud Storage",
  "narrative": "## Attack Summary\n\nUser `patricia.nguyen` (Senior Financial Analyst, departing employee — resignation submitted 2 weeks ago) has been systematically downloading sensitive financial reports and uploading them to personal Google Drive and Dropbox accounts over a 5-day period.\n\n## Collection Activity\n\nStarting 7 days ago, patricia.nguyen accessed 47 documents from the restricted SharePoint site `Finance-Confidential` that she had not previously accessed in her 3-year tenure. Access patterns show bulk download activity between 22:00-23:30 UTC (outside normal working hours for US East timezone). Documents include quarterly earnings drafts, M&A due diligence files, and compensation benchmarking data.\n\n## Exfiltration Method\n\nDLP sensors detected uploads to `drive.google.com` and `dropbox.com` from patricia.nguyen's workstation FIN-LPT-012 totaling 2.3 GB across 12 upload sessions. File names were modified before upload (renamed from corporate naming convention to generic names like 'project_notes_q3.xlsx').\n\n## Risk Assessment\n\nThis appears to be a classic departing employee data theft scenario. The renamed files and after-hours activity suggest deliberate concealment. HR has been notified and legal hold has been placed on the user's account.",
  "severity": "high",
  "status": "confirmed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.89,
  "signalCount": 5,
  "eventCount": 156,
  "attackStageCount": 3,
  "entityCount": 6,
  "leadEntity": { "type": "user", "value": "patricia.nguyen" },
  "stages": [
    { "order": 1, "name": "Collection", "mitreTactic": "TA0009", "mitreTechnique": "T1213", "description": "Bulk access to 47 restricted SharePoint documents outside normal hours", "signalIds": ["sig-004-001", "sig-004-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Staging", "mitreTactic": "TA0009", "mitreTechnique": "T1074", "description": "Files renamed and staged in local Downloads folder for upload", "signalIds": ["sig-004-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1567", "description": "2.3 GB uploaded to personal Google Drive and Dropbox over 12 sessions", "signalIds": ["sig-004-004", "sig-004-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-004-001", "type": "user", "value": "patricia.nguyen", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-004-002", "type": "host", "value": "FIN-LPT-012", "role": "compromised", "riskScore": 80, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-004-003", "type": "ip", "value": "142.250.80.46", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-004-004", "type": "ip", "value": "162.125.66.1", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-004-005", "type": "file", "value": "Finance-Confidential/Q3_Earnings_Draft.xlsx", "role": "victim", "riskScore": 98, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-004-006", "type": "file", "value": "project_notes_q3.xlsx", "role": "attacker", "riskScore": 85, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-004-001", "target": "ent-004-002", "type": "authenticated_as", "evidence": ["User session on FIN-LPT-012"] },
    { "source": "ent-004-001", "target": "ent-004-005", "type": "executed_on", "evidence": ["SharePoint document access and download"] },
    { "source": "ent-004-005", "target": "ent-004-006", "type": "dropped_file", "evidence": ["File rename from corporate to generic naming"] },
    { "source": "ent-004-002", "target": "ent-004-003", "type": "exfiltrated_to", "evidence": ["HTTPS upload to drive.google.com"] },
    { "source": "ent-004-002", "target": "ent-004-004", "type": "exfiltrated_to", "evidence": ["HTTPS upload to dropbox.com"] }
  ],
  "correlationReasons": [
    { "type": "behavior_sequence", "description": "Classic insider threat pattern: bulk collection → staging with obfuscation → exfiltration to personal accounts", "confidence": 0.92, "evidence": "Matches CERT insider threat behavioral indicators" },
    { "type": "shared_entity", "description": "User patricia.nguyen is the sole actor across all three stages", "confidence": 0.98, "evidence": "Single user account in all 5 signals" },
    { "type": "temporal_proximity", "description": "Activity concentrated in after-hours windows over 5-day period", "confidence": 0.82, "evidence": "22:00-23:30 UTC activity pattern across 5 consecutive days" }
  ],
  "mitreTactics": ["TA0009", "TA0010"],
  "mitreTechniques": ["T1213", "T1074", "T1567"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F4=$(echo "$CWM_F4" | sed "s/CREATED_PLACEHOLDER/${CWM_F4_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F4_UPDATED}/g")
index_finding "cwm" 7 "$CWM_F4"

# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 5: Cryptominer Deployment via CI/CD (4 stages)
# Status: new | Severity: medium | Days ago: 2
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-5: Cryptominer Deployment via CI/CD"
CWM_F5_CREATED=$(days_ago 2)
CWM_F5_UPDATED=$(days_ago 1)

read -r -d '' CWM_F5 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-005",
  "title": "Cryptominer Deployment via Compromised CI/CD Pipeline",
  "narrative": "## Attack Summary\n\nA GitHub Actions workflow in the `infra-terraform` repository was modified to include a cryptominer download step disguised as a Terraform plugin. The modified workflow executed on 6 self-hosted runners before detection.\n\n## Initial Access\n\nThe attacker gained access to the repository through a compromised developer PAT (Personal Access Token) belonging to `ci-bot-03`. The token was found in a public GitHub gist posted 4 days prior, likely as an accidental leak. The attacker used this token to push a commit modifying `.github/workflows/terraform-plan.yml`.\n\n## Execution & Resource Hijacking\n\nThe modified workflow added a step that downloaded `terraform-provider-helper` from a Cloudflare R2 bucket. This binary is actually XMRig configured to mine Monero using pool `pool.hashvault.pro:443`. The miner consumed 80% CPU on each of the 6 affected runners (RUNNER-01 through RUNNER-06) for approximately 18 hours.\n\n## Detection & Response\n\nThe anomaly was detected by CPU utilization alerts exceeding baseline thresholds on the self-hosted runners. Network monitoring identified TLS connections to known mining pool infrastructure. Estimated resource cost: approximately $340 in compute at cloud billing rates.",
  "severity": "medium",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.86,
  "signalCount": 6,
  "eventCount": 312,
  "attackStageCount": 4,
  "entityCount": 8,
  "leadEntity": { "type": "user", "value": "ci-bot-03" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "Compromised GitHub PAT for ci-bot-03 used to modify workflow", "signalIds": ["sig-005-001"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "Modified GitHub Actions workflow downloads and executes cryptominer", "signalIds": ["sig-005-002", "sig-005-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Command and Control", "mitreTactic": "TA0011", "mitreTechnique": "T1071", "description": "XMRig miner connects to pool.hashvault.pro:443 via TLS stratum protocol", "signalIds": ["sig-005-004", "sig-005-005"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Impact", "mitreTactic": "TA0040", "mitreTechnique": "T1496", "description": "80% CPU consumed on 6 self-hosted runners for 18 hours mining Monero", "signalIds": ["sig-005-006"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-005-001", "type": "user", "value": "ci-bot-03", "role": "compromised", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-005-002", "type": "host", "value": "RUNNER-01", "role": "victim", "riskScore": 75, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-005-003", "type": "host", "value": "RUNNER-04", "role": "victim", "riskScore": 75, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-005-004", "type": "ip", "value": "131.153.76.130", "role": "infrastructure", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-005-005", "type": "process", "value": "terraform-provider-helper", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-005-006", "type": "file", "value": ".github/workflows/terraform-plan.yml", "role": "compromised", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-005-007", "type": "ip", "value": "45.76.34.100", "role": "attacker", "riskScore": 80, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-005-008", "type": "host", "value": "RUNNER-06", "role": "victim", "riskScore": 75, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-005-007", "target": "ent-005-001", "type": "authenticated_as", "evidence": ["GitHub API auth with stolen PAT from IP 45.76.34.100"] },
    { "source": "ent-005-001", "target": "ent-005-006", "type": "executed_on", "evidence": ["Commit pushed modifying workflow file"] },
    { "source": "ent-005-006", "target": "ent-005-005", "type": "dropped_file", "evidence": ["Workflow step downloads cryptominer binary"] },
    { "source": "ent-005-005", "target": "ent-005-002", "type": "executed_on", "evidence": ["Process execution on RUNNER-01"] },
    { "source": "ent-005-005", "target": "ent-005-003", "type": "executed_on", "evidence": ["Process execution on RUNNER-04"] },
    { "source": "ent-005-005", "target": "ent-005-004", "type": "communicated_with", "evidence": ["Stratum mining protocol to pool.hashvault.pro"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "CI/CD compromise pattern: stolen credential → workflow modification → cryptominer deployment → resource hijacking", "confidence": 0.88, "evidence": "4 detection rules fired matching CI/CD attack playbook" },
    { "type": "shared_entity", "description": "ci-bot-03 service account connects credential compromise to workflow modification", "confidence": 0.94, "evidence": "ci-bot-03 PAT used in GitHub API calls and commit authentication" },
    { "type": "temporal_proximity", "description": "Credential use to first miner execution within 12 minutes", "confidence": 0.90, "evidence": "PAT auth at 03:42, first runner CPU spike at 03:54 UTC" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0011", "TA0040"],
  "mitreTechniques": ["T1078", "T1059", "T1071", "T1496"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F5=$(echo "$CWM_F5" | sed "s/CREATED_PLACEHOLDER/${CWM_F5_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F5_UPDATED}/g")
index_finding "cwm" 2 "$CWM_F5"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 6: Phishing → C2 → Data Theft (5 stages)
# Status: reviewing | Severity: high | Days ago: 4 | Assignee: james.wilson
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-6: Phishing → C2 → Data Theft"
CWM_F6_CREATED=$(days_ago 4)
CWM_F6_UPDATED=$(days_ago 2)

read -r -d '' CWM_F6 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-006",
  "title": "Phishing to C2 Establishment and Targeted Data Theft",
  "narrative": "## Attack Summary\n\nUser `diana.foster` in the Legal department received a spearphishing email containing a malicious OneNote attachment. The attachment delivered an IcedID dropper that established a Cobalt Strike beacon, ultimately leading to exfiltration of attorney-client privileged documents.\n\n## Initial Compromise\n\nThe phishing email arrived at 10:22 UTC with subject 'Updated Contract Terms - Urgent Review Required' from a spoofed external counsel address. The OneNote file `Contract_Amendment_v3.one` contained an embedded HTA file that executed on click. The HTA downloaded an IcedID DLL from a compromised WordPress site (blog.northernlights-travel[.]com).\n\n## Command & Control\n\nIcedID established persistence and downloaded a Cobalt Strike beacon (watermark: 1234567890) from staging infrastructure at 91.92.248.14. The beacon uses HTTPS with malleable C2 profile mimicking Microsoft Teams traffic (User-Agent and URI patterns matching legitimate Teams API calls). Beacon interval: 60 seconds with 25% jitter.\n\n## Discovery & Collection\n\nFrom diana.foster's workstation LEGAL-WKS-003, the operator performed network reconnaissance identifying the Legal department file share FS-LEGAL-01. They then mounted the share and selectively copied files from the `Litigation-Hold` and `M&A-Pending` directories, totaling 890 MB of privileged documents.\n\n## Exfiltration\n\nData was staged in a password-protected 7z archive, then exfiltrated over the existing C2 channel in 5 MB chunks to avoid triggering DLP byte-count thresholds. Total exfiltration completed over 4 hours using slow-drip technique.\n\n## Legal Impact\n\nExfiltrated documents include attorney-client privileged materials related to ongoing litigation. Breach notification to opposing counsel may be required per court rules.",
  "severity": "high",
  "status": "reviewing",
  "assignee": "james.wilson",
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.91,
  "signalCount": 9,
  "eventCount": 567,
  "attackStageCount": 5,
  "entityCount": 10,
  "leadEntity": { "type": "user", "value": "diana.foster" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1566", "description": "Spearphishing email with malicious OneNote attachment to diana.foster", "signalIds": ["sig-006-001", "sig-006-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "HTA payload executes IcedID dropper DLL from compromised website", "signalIds": ["sig-006-003", "sig-006-004"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Command and Control", "mitreTactic": "TA0011", "mitreTechnique": "T1071", "description": "Cobalt Strike beacon established with Teams-mimicking malleable C2 profile", "signalIds": ["sig-006-005", "sig-006-006"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Collection", "mitreTactic": "TA0009", "mitreTechnique": "T1039", "description": "890 MB of privileged legal documents collected from FS-LEGAL-01 file share", "signalIds": ["sig-006-007", "sig-006-008"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 5, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1041", "description": "Data exfiltrated over C2 channel in 5 MB chunks using slow-drip technique", "signalIds": ["sig-006-009"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-006-001", "type": "user", "value": "diana.foster", "role": "victim", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-006-002", "type": "host", "value": "LEGAL-WKS-003", "role": "compromised", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 7 },
    { "id": "ent-006-003", "type": "ip", "value": "91.92.248.14", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-006-004", "type": "host", "value": "FS-LEGAL-01", "role": "victim", "riskScore": 92, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-006-005", "type": "file", "value": "Contract_Amendment_v3.one", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-006-006", "type": "process", "value": "mshta.exe", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-006-007", "type": "process", "value": "rundll32.exe (IcedID)", "role": "attacker", "riskScore": 98, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-006-008", "type": "ip", "value": "192.0.2.100", "role": "infrastructure", "riskScore": 78, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-006-009", "type": "file", "value": "C:\\Users\\diana.foster\\AppData\\staged_docs.7z", "role": "attacker", "riskScore": 90, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-006-010", "type": "user", "value": "external-counsel@lawfirm-spoofed.com", "role": "attacker", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-006-010", "target": "ent-006-001", "type": "communicated_with", "evidence": ["Phishing email delivery to diana.foster"] },
    { "source": "ent-006-005", "target": "ent-006-002", "type": "executed_on", "evidence": ["OneNote attachment opened on LEGAL-WKS-003"] },
    { "source": "ent-006-006", "target": "ent-006-007", "type": "dropped_file", "evidence": ["mshta.exe spawned rundll32 loading IcedID DLL"] },
    { "source": "ent-006-007", "target": "ent-006-003", "type": "communicated_with", "evidence": ["Cobalt Strike beacon HTTPS traffic"] },
    { "source": "ent-006-002", "target": "ent-006-004", "type": "lateral_movement", "evidence": ["SMB mount of legal file share from compromised workstation"] },
    { "source": "ent-006-004", "target": "ent-006-009", "type": "dropped_file", "evidence": ["Files copied and compressed into 7z archive"] },
    { "source": "ent-006-009", "target": "ent-006-003", "type": "exfiltrated_to", "evidence": ["Archive exfiltrated over C2 in chunked transfers"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Complete phishing kill chain: email delivery → malware execution → C2 → collection → exfiltration", "confidence": 0.93, "evidence": "5 sequential ATT&CK stages detected with clear causal chain" },
    { "type": "shared_entity", "description": "Workstation LEGAL-WKS-003 is the pivot connecting email compromise to file share access", "confidence": 0.95, "evidence": "LEGAL-WKS-003 present in 7 of 9 signals" },
    { "type": "temporal_proximity", "description": "Email received to first exfiltration within 6 hours", "confidence": 0.87, "evidence": "10:22 to 16:45 UTC same-day activity" },
    { "type": "behavior_sequence", "description": "IcedID → Cobalt Strike handoff matches documented threat actor TTP for legal sector targeting", "confidence": 0.84, "evidence": "Watermark and malleable profile match tracked actor cluster" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0011", "TA0009", "TA0010"],
  "mitreTechniques": ["T1566", "T1059", "T1071", "T1039", "T1041"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F6=$(echo "$CWM_F6" | sed "s/CREATED_PLACEHOLDER/${CWM_F6_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F6_UPDATED}/g")
index_finding "cwm" 4 "$CWM_F6"

# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 7: DNS Tunneling Exfiltration (3 stages)
# Status: new | Severity: medium | Days ago: 2
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-7: DNS Tunneling Exfiltration"
CWM_F7_CREATED=$(days_ago 2)
CWM_F7_UPDATED=$(days_ago 1)

read -r -d '' CWM_F7 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-007",
  "title": "DNS Tunneling Data Exfiltration from Database Server",
  "narrative": "## Attack Summary\n\nDatabase server DB-PROD-03 is generating anomalous DNS queries with base32-encoded subdomains directed at `update-check[.]cloud-metrics[.]io`. The pattern is consistent with iodine or dnscat2 DNS tunneling tools being used to exfiltrate data from the database.\n\n## DNS Anomaly Detection\n\nThe HiveArmor DNS analytics engine flagged DB-PROD-03 at 14:30 UTC for generating 4,200 unique subdomain queries to a single domain within a 30-minute window. Normal DNS behavior for this server averages 15 unique domains per hour. The subdomain labels are 63 characters long and contain only base32 characters (A-Z, 2-7), consistent with tunnel encoding.\n\n## Data Exfiltration Estimation\n\nBased on query volume and encoding overhead, approximately 180 MB of data has been exfiltrated over the past 48 hours. The tunnel operates in bursts of 200-300 queries every 10 minutes, likely triggered by a cron job or scheduled task. Response TXT records contain encoded commands, suggesting bidirectional communication.\n\n## Investigation Status\n\nThe DNS tunneling domain was registered 7 days ago via a privacy-protected registrar. The authoritative nameserver resolves to infrastructure in a hosting provider known for bulletproof hosting. The initial compromise vector for DB-PROD-03 has not yet been identified — further investigation needed.",
  "severity": "medium",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.83,
  "signalCount": 4,
  "eventCount": 4200,
  "attackStageCount": 3,
  "entityCount": 5,
  "leadEntity": { "type": "host", "value": "DB-PROD-03" },
  "stages": [
    { "order": 1, "name": "Command and Control", "mitreTactic": "TA0011", "mitreTechnique": "T1071", "description": "DNS tunnel established to update-check.cloud-metrics.io using base32 encoding", "signalIds": ["sig-007-001", "sig-007-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Collection", "mitreTactic": "TA0009", "mitreTechnique": "T1005", "description": "Database records collected and staged for exfiltration via DNS", "signalIds": ["sig-007-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "suspected" },
    { "order": 3, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1048", "description": "180 MB exfiltrated via DNS TXT queries over 48-hour period in periodic bursts", "signalIds": ["sig-007-004"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-007-001", "type": "host", "value": "DB-PROD-03", "role": "compromised", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-007-002", "type": "ip", "value": "198.51.100.200", "role": "attacker", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-007-003", "type": "process", "value": "/usr/local/bin/.dns-helper", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-007-004", "type": "ip", "value": "10.0.5.53", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-007-005", "type": "file", "value": "/tmp/.cache_dns_buf", "role": "attacker", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-007-003", "target": "ent-007-001", "type": "executed_on", "evidence": ["Hidden process running on DB-PROD-03"] },
    { "source": "ent-007-003", "target": "ent-007-005", "type": "dropped_file", "evidence": ["Staging buffer file for DNS exfiltration"] },
    { "source": "ent-007-001", "target": "ent-007-004", "type": "communicated_with", "evidence": ["DNS queries to internal resolver 10.0.5.53"] },
    { "source": "ent-007-004", "target": "ent-007-002", "type": "communicated_with", "evidence": ["Recursive DNS resolution to attacker nameserver"] },
    { "source": "ent-007-005", "target": "ent-007-002", "type": "exfiltrated_to", "evidence": ["Data encoded in DNS subdomain queries"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "DNS tunneling detection: anomalous query volume + base32 encoding + known bad domain + periodic burst pattern", "confidence": 0.86, "evidence": "3 DNS analytics rules triggered simultaneously" },
    { "type": "behavior_sequence", "description": "Scheduled burst pattern every 10 minutes matches cron-based exfiltration automation", "confidence": 0.80, "evidence": "Consistent 200-300 query bursts at 10-minute intervals for 48 hours" },
    { "type": "temporal_proximity", "description": "All anomalous DNS activity concentrated within 48-hour window", "confidence": 0.78, "evidence": "First anomalous query detected 48 hours ago, ongoing" }
  ],
  "mitreTactics": ["TA0011", "TA0009", "TA0010"],
  "mitreTechniques": ["T1071", "T1005", "T1048"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F7=$(echo "$CWM_F7" | sed "s/CREATED_PLACEHOLDER/${CWM_F7_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F7_UPDATED}/g")
index_finding "cwm" 2 "$CWM_F7"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 8: Kerberoasting → Domain Admin (4 stages)
# Status: reviewing | Severity: critical | Days ago: 6 | Assignee: maya.chen
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-8: Kerberoasting → Domain Admin"
CWM_F8_CREATED=$(days_ago 6)
CWM_F8_UPDATED=$(days_ago 4)

read -r -d '' CWM_F8 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-008",
  "title": "Kerberoasting to Domain Admin Compromise",
  "narrative": "## Attack Summary\n\nA coordinated Kerberoasting campaign targeted 12 service accounts with weak SPNs in the corporate Active Directory forest. The attacker successfully cracked 3 service account passwords offline, then used the highest-privilege account to achieve Domain Admin access.\n\n## Kerberoasting Campaign\n\nBetween 02:00-02:45 UTC, workstation IT-WKS-077 generated 12 Kerberos TGS-REP requests for service principals using RC4 encryption (downgrade from AES256). The targeted SPNs include SQL Server service accounts, IIS application pools, and a backup operator account. The request volume and RC4 downgrade triggered the Kerberoasting detection rule.\n\n## Credential Cracking & Access\n\nApproximately 4 hours after the TGS requests, the attacker authenticated as `sql-svc-prod` (one of the targeted accounts) from an external IP 203.0.113.55. This account has `GenericAll` permissions on the Domain Admins group through a misconfigured ACL inheritance chain. The attacker then added a new user `svc-health-check` to Domain Admins.\n\n## Persistence\n\nThe newly created Domain Admin account `svc-health-check` was used to create a Golden Ticket using krbtgt hash access. DCSync was detected from IT-WKS-077, extracting the krbtgt, KRBTGT, and Administrator account hashes.\n\n## Scope of Compromise\n\nWith krbtgt hash access, the attacker can generate tickets for any account in the forest. This represents a complete domain compromise. Full forest recovery (krbtgt double-rotation, trust reset) is required.",
  "severity": "critical",
  "status": "reviewing",
  "assignee": "maya.chen",
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.96,
  "signalCount": 8,
  "eventCount": 445,
  "attackStageCount": 4,
  "entityCount": 10,
  "leadEntity": { "type": "host", "value": "IT-WKS-077" },
  "stages": [
    { "order": 1, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1558", "description": "Kerberoasting campaign targeting 12 service SPNs with RC4 downgrade", "signalIds": ["sig-008-001", "sig-008-002", "sig-008-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Privilege Escalation", "mitreTactic": "TA0004", "mitreTechnique": "T1078", "description": "Authentication as sql-svc-prod with GenericAll on Domain Admins; new DA account created", "signalIds": ["sig-008-004", "sig-008-005"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1558", "description": "DCSync attack extracting krbtgt hash for Golden Ticket capability", "signalIds": ["sig-008-006", "sig-008-007"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Defense Evasion", "mitreTactic": "TA0005", "mitreTechnique": "T1550", "description": "Golden Ticket generated — attacker can impersonate any domain account", "signalIds": ["sig-008-008"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-008-001", "type": "host", "value": "IT-WKS-077", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 6 },
    { "id": "ent-008-002", "type": "user", "value": "sql-svc-prod", "role": "compromised", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-008-003", "type": "user", "value": "svc-health-check", "role": "attacker", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-008-004", "type": "host", "value": "DC-PROD-01", "role": "victim", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-008-005", "type": "ip", "value": "203.0.113.55", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-008-006", "type": "user", "value": "krbtgt", "role": "victim", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-008-007", "type": "process", "value": "mimikatz.exe", "role": "attacker", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-008-008", "type": "user", "value": "backup-svc-01", "role": "compromised", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-008-009", "type": "user", "value": "iis-app-pool-02", "role": "compromised", "riskScore": 78, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-008-010", "type": "host", "value": "DC-PROD-02", "role": "victim", "riskScore": 90, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-008-001", "target": "ent-008-002", "type": "authenticated_as", "evidence": ["Kerberoasting TGS request then login as sql-svc-prod"] },
    { "source": "ent-008-001", "target": "ent-008-004", "type": "communicated_with", "evidence": ["TGS requests to domain controller DC-PROD-01"] },
    { "source": "ent-008-005", "target": "ent-008-002", "type": "authenticated_as", "evidence": ["External IP login with cracked credential"] },
    { "source": "ent-008-002", "target": "ent-008-003", "type": "executed_on", "evidence": ["DA group modification — added svc-health-check"] },
    { "source": "ent-008-003", "target": "ent-008-004", "type": "authenticated_as", "evidence": ["DCSync replication request to DC-PROD-01"] },
    { "source": "ent-008-007", "target": "ent-008-006", "type": "executed_on", "evidence": ["DCSync extracting krbtgt hash"] },
    { "source": "ent-008-001", "target": "ent-008-008", "type": "authenticated_as", "evidence": ["Kerberoasting attempt on backup-svc-01"] },
    { "source": "ent-008-001", "target": "ent-008-009", "type": "authenticated_as", "evidence": ["Kerberoasting attempt on iis-app-pool-02"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Kerberoasting → credential use → privilege escalation → DCSync — textbook AD compromise chain", "confidence": 0.96, "evidence": "4 high-fidelity rules triggered in sequence" },
    { "type": "shared_entity", "description": "IT-WKS-077 is the single source of all Kerberoasting and DCSync activity", "confidence": 0.98, "evidence": "IT-WKS-077 present in 6 of 8 signals" },
    { "type": "temporal_proximity", "description": "Kerberoasting to DCSync within 6 hours (including offline cracking time)", "confidence": 0.92, "evidence": "02:00 UTC Kerberoasting, 06:15 UTC credential use, 08:30 UTC DCSync" },
    { "type": "behavior_sequence", "description": "RC4 downgrade + multiple SPN targeting + 4-hour gap + DA escalation matches known APT Active Directory playbook", "confidence": 0.94, "evidence": "Pattern matches MITRE G0007 (APT28) AD attack documentation" }
  ],
  "mitreTactics": ["TA0006", "TA0004", "TA0003", "TA0005"],
  "mitreTechniques": ["T1558", "T1078", "T1558", "T1550"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F8=$(echo "$CWM_F8" | sed "s/CREATED_PLACEHOLDER/${CWM_F8_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F8_UPDATED}/g")
index_finding "cwm" 6 "$CWM_F8"

# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 9: Webshell Persistence (3 stages)
# Status: dismissed | Severity: low | Days ago: 10
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-9: Webshell Persistence"
CWM_F9_CREATED=$(days_ago 10)
CWM_F9_UPDATED=$(days_ago 8)

read -r -d '' CWM_F9 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-009",
  "title": "Webshell Persistence on Exchange Server",
  "narrative": "## Attack Summary\n\nAn ASPX webshell was deployed to Exchange server EXCH-01 via an exploited ProxyShell vulnerability chain (CVE-2021-34473, CVE-2021-34523, CVE-2021-31207). The webshell provides remote command execution capability and has been active for approximately 72 hours before detection.\n\n## Initial Exploitation\n\nThe ProxyShell exploitation sequence was detected through anomalous HTTP requests to `/autodiscover/autodiscover.json` with mailbox enumeration patterns followed by PowerShell payload delivery via the WDAC bypass path. The exploiting IP 45.77.65.211 is associated with known ProxyShell scanning infrastructure.\n\n## Webshell Installation\n\nThe webshell was written to `C:\\Program Files\\Microsoft\\Exchange Server\\V15\\FrontEnd\\HttpProxy\\owa\\auth\\errorPage.aspx` — a path designed to blend with legitimate Exchange error pages. The shell uses AES encryption for command/response communication and includes anti-forensics features (log deletion, timestamp stomping).\n\n## Current Assessment\n\nDismissed: Investigation determined this is a known-good penetration test webshell deployed by the red team during authorized testing engagement RT-2026-Q3. The webshell was part of the Exchange security validation scope. Red team confirmed and provided engagement authorization documentation.",
  "severity": "low",
  "status": "dismissed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.79,
  "signalCount": 3,
  "eventCount": 89,
  "attackStageCount": 3,
  "entityCount": 5,
  "leadEntity": { "type": "host", "value": "EXCH-01" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1190", "description": "ProxyShell exploitation chain against Exchange server EXCH-01", "signalIds": ["sig-009-001"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "PowerShell payload execution via WDAC bypass path", "signalIds": ["sig-009-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1505", "description": "ASPX webshell deployed to Exchange OWA auth directory", "signalIds": ["sig-009-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-009-001", "type": "host", "value": "EXCH-01", "role": "compromised", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-009-002", "type": "ip", "value": "45.77.65.211", "role": "attacker", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-009-003", "type": "file", "value": "errorPage.aspx", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-009-004", "type": "process", "value": "w3wp.exe (MSExchangeOWAAppPool)", "role": "infrastructure", "riskScore": 70, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-009-005", "type": "user", "value": "NT AUTHORITY\\SYSTEM", "role": "infrastructure", "riskScore": 65, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-009-002", "target": "ent-009-001", "type": "communicated_with", "evidence": ["ProxyShell HTTP exploitation requests"] },
    { "source": "ent-009-004", "target": "ent-009-003", "type": "dropped_file", "evidence": ["Webshell written by IIS worker process"] },
    { "source": "ent-009-002", "target": "ent-009-003", "type": "communicated_with", "evidence": ["Command execution via webshell HTTP POST"] },
    { "source": "ent-009-003", "target": "ent-009-005", "type": "executed_on", "evidence": ["Commands execute as SYSTEM via IIS app pool"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "ProxyShell exploitation → PowerShell execution → webshell persistence matches documented Exchange attack chain", "confidence": 0.85, "evidence": "3 rules triggered in expected ProxyShell sequence" },
    { "type": "shared_entity", "description": "Exchange server EXCH-01 and attacker IP 45.77.65.211 connected across exploitation and persistence stages", "confidence": 0.90, "evidence": "Same source IP across initial access and webshell communication" },
    { "type": "temporal_proximity", "description": "Exploitation to webshell deployment within 5 minutes", "confidence": 0.92, "evidence": "Automated exploitation chain" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0003"],
  "mitreTechniques": ["T1190", "T1059", "T1505"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F9=$(echo "$CWM_F9" | sed "s/CREATED_PLACEHOLDER/${CWM_F9_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F9_UPDATED}/g")
index_finding "cwm" 10 "$CWM_F9"


# ─────────────────────────────────────────────────────────────────────────────────
# CWM Finding 10: Living Off the Land Binary Attack (4 stages)
# Status: new | Severity: high | Days ago: 1
# ─────────────────────────────────────────────────────────────────────────────────
info "CWM-10: Living Off the Land Binary Attack"
CWM_F10_CREATED=$(days_ago 1)
CWM_F10_UPDATED=$(days_ago 0)

read -r -d '' CWM_F10 << 'ENDJSON' || true
{
  "id": "cor-2026-0801-010",
  "title": "Living Off the Land Binary Attack Chain - LOLBIN Abuse",
  "narrative": "## Attack Summary\n\nAn attacker is using legitimate Windows binaries (LOLBINs) to execute a multi-stage attack on workstation HR-WKS-015 while evading traditional signature-based detection. The attack chain uses certutil, mshta, and bitsadmin exclusively — no dropped malware binaries detected.\n\n## Execution via LOLBINs\n\nThe attack initiated with `certutil.exe -urlcache -f` downloading an encoded payload from `https://pastebin[.]com/raw/Ab3Cd4Ef` to the user's temp directory. The payload was decoded using `certutil -decode` from base64 to an HTA file. `mshta.exe` then executed the HTA, which spawned a JScript-based reverse shell.\n\n## Persistence & C2\n\nPersistence was established using `bitsadmin /create /download` with a transfer job named 'Microsoft_Update_Helper' that re-downloads the payload every 6 hours. The BITS job survives reboots and runs under the user's context. C2 communication uses `mshta.exe` executing inline VBScript that makes HTTPS requests to `cdn-static[.]azureedge-mirror[.]net`.\n\n## Defense Evasion\n\nThe entire attack chain uses only digitally-signed Microsoft binaries, bypassing application whitelisting policies. No custom executables were written to disk. Process command lines were obfuscated using environment variable expansion and string concatenation techniques.\n\n## Current Status\n\nThe attack is active. The BITS persistence job is still running and the C2 beacon is active. EDR behavioral rules triggered on the certutil download pattern and mshta network activity, but the lack of malware on disk makes containment challenging without host isolation.",
  "severity": "high",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.88,
  "signalCount": 7,
  "eventCount": 198,
  "attackStageCount": 4,
  "entityCount": 8,
  "leadEntity": { "type": "host", "value": "HR-WKS-015" },
  "stages": [
    { "order": 1, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1218", "description": "certutil.exe used to download and decode payload; mshta.exe executes HTA", "signalIds": ["sig-010-001", "sig-010-002", "sig-010-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1197", "description": "BITS transfer job Microsoft_Update_Helper re-downloads payload every 6 hours", "signalIds": ["sig-010-004"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Command and Control", "mitreTactic": "TA0011", "mitreTechnique": "T1071", "description": "mshta.exe VBScript C2 beacon to cdn-static.azureedge-mirror.net", "signalIds": ["sig-010-005", "sig-010-006"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" },
    { "order": 4, "name": "Defense Evasion", "mitreTactic": "TA0005", "mitreTechnique": "T1218", "description": "Exclusive use of signed Microsoft binaries bypasses application whitelisting", "signalIds": ["sig-010-007"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-010-001", "type": "host", "value": "HR-WKS-015", "role": "compromised", "riskScore": 94, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 7 },
    { "id": "ent-010-002", "type": "user", "value": "marcus.bell", "role": "victim", "riskScore": 72, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-010-003", "type": "process", "value": "certutil.exe", "role": "attacker", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-010-004", "type": "process", "value": "mshta.exe", "role": "attacker", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-010-005", "type": "process", "value": "bitsadmin.exe", "role": "attacker", "riskScore": 80, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-010-006", "type": "ip", "value": "13.107.42.16", "role": "infrastructure", "riskScore": 75, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-010-007", "type": "ip", "value": "104.20.67.143", "role": "attacker", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-010-008", "type": "file", "value": "C:\\Users\\marcus.bell\\AppData\\Local\\Temp\\update.hta", "role": "attacker", "riskScore": 93, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 }
  ],
  "relationships": [
    { "source": "ent-010-003", "target": "ent-010-007", "type": "communicated_with", "evidence": ["certutil download from pastebin"] },
    { "source": "ent-010-003", "target": "ent-010-008", "type": "dropped_file", "evidence": ["certutil -decode output to HTA file"] },
    { "source": "ent-010-004", "target": "ent-010-008", "type": "executed_on", "evidence": ["mshta.exe executing the decoded HTA"] },
    { "source": "ent-010-004", "target": "ent-010-006", "type": "communicated_with", "evidence": ["C2 beacon HTTPS traffic via VBScript"] },
    { "source": "ent-010-005", "target": "ent-010-001", "type": "executed_on", "evidence": ["BITS job created for persistence on host"] },
    { "source": "ent-010-002", "target": "ent-010-001", "type": "authenticated_as", "evidence": ["User session context for LOLBIN execution"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "LOLBIN chain: certutil download → mshta execution → BITS persistence → C2 beacon matches documented LOLBIN abuse patterns", "confidence": 0.90, "evidence": "4 behavioral rules triggered for signed binary abuse" },
    { "type": "shared_entity", "description": "HR-WKS-015 is the single host across all LOLBIN execution stages", "confidence": 0.97, "evidence": "All 7 signals originate from HR-WKS-015" },
    { "type": "behavior_sequence", "description": "certutil → mshta → bitsadmin sequence matches LOLBAS project documented attack patterns", "confidence": 0.86, "evidence": "Three LOLBINs used in sequence within 5-minute window" },
    { "type": "temporal_proximity", "description": "Download to C2 establishment within 3 minutes", "confidence": 0.93, "evidence": "Automated attack chain execution" }
  ],
  "mitreTactics": ["TA0002", "TA0003", "TA0011", "TA0005"],
  "mitreTechniques": ["T1218", "T1197", "T1071", "T1218"],
  "visibleBy": ["cwm"]
}
ENDJSON

CWM_F10=$(echo "$CWM_F10" | sed "s/CREATED_PLACEHOLDER/${CWM_F10_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${CWM_F10_UPDATED}/g")
index_finding "cwm" 1 "$CWM_F10"

ok "CWM tenant: 10 findings indexed"


# ─── Step 3: Seed Workmates1 Tenant Findings (6 findings) ──────────────────────
header "Step 3: Seed Workmates1 tenant findings (6 attack chains)"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 1: Cloud Account Takeover (4 stages)
# Status: new | Severity: high | Days ago: 2
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-1: Cloud Account Takeover"
WM1_F1_CREATED=$(days_ago 2)
WM1_F1_UPDATED=$(days_ago 1)

read -r -d '' WM1_F1 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-001",
  "title": "Azure AD Account Takeover via Token Theft",
  "narrative": "## Attack Summary\n\nMultiple Azure AD accounts experienced token theft via an adversary-in-the-middle (AiTM) phishing kit. The attacker captured session tokens for 3 users in the finance department, then used those tokens to access SharePoint and OneDrive resources without triggering MFA challenges.\n\n## Token Theft Mechanism\n\nUsers received phishing emails directing them to a convincing Microsoft 365 login page hosted at `login-microsoftonline[.]app`. This AiTM proxy captured both credentials and the resulting session cookies. The stolen tokens were replayed from IP 185.220.101.45 (Tor exit node) within 4 minutes of the original authentication.\n\n## Lateral Access\n\nUsing the stolen tokens, the attacker accessed shared finance drives and downloaded 23 files related to vendor payment information. The attacker also modified a mail transport rule to BCC external messages to an attacker-controlled inbox.\n\n## Detection\n\nAnomalous sign-in properties (impossible travel, Tor IP, token replay without device compliance) triggered multiple Conditional Access violation alerts. The mail rule modification was flagged by the Exchange Online threat policy.",
  "severity": "high",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.89,
  "signalCount": 6,
  "eventCount": 178,
  "attackStageCount": 4,
  "entityCount": 8,
  "leadEntity": { "type": "ip", "value": "185.220.101.45" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "AiTM phishing captures session tokens for 3 finance users", "signalIds": ["sig-011-001", "sig-011-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Defense Evasion", "mitreTactic": "TA0005", "mitreTechnique": "T1550", "description": "Session token replay from Tor exit bypassing MFA", "signalIds": ["sig-011-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Collection", "mitreTactic": "TA0009", "mitreTechnique": "T1213", "description": "23 files downloaded from shared finance SharePoint drives", "signalIds": ["sig-011-004", "sig-011-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1098", "description": "Mail transport rule created to BCC to attacker inbox", "signalIds": ["sig-011-006"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-011-001", "type": "user", "value": "sarah.kim@workmates1.com", "role": "victim", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-011-002", "type": "user", "value": "david.chen@workmates1.com", "role": "victim", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-011-003", "type": "user", "value": "rachel.patel@workmates1.com", "role": "victim", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-011-004", "type": "ip", "value": "185.220.101.45", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-011-005", "type": "ip", "value": "23.128.248.72", "role": "infrastructure", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-011-006", "type": "host", "value": "outlook.office365.com", "role": "victim", "riskScore": 70, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-011-007", "type": "file", "value": "Finance/Vendor_Payments_Q3.xlsx", "role": "victim", "riskScore": 92, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-011-008", "type": "user", "value": "attacker-bcc@protonmail.com", "role": "attacker", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-011-004", "target": "ent-011-001", "type": "authenticated_as", "evidence": ["Token replay authentication as sarah.kim"] },
    { "source": "ent-011-004", "target": "ent-011-002", "type": "authenticated_as", "evidence": ["Token replay authentication as david.chen"] },
    { "source": "ent-011-004", "target": "ent-011-003", "type": "authenticated_as", "evidence": ["Token replay authentication as rachel.patel"] },
    { "source": "ent-011-001", "target": "ent-011-007", "type": "executed_on", "evidence": ["File download via SharePoint API"] },
    { "source": "ent-011-001", "target": "ent-011-006", "type": "communicated_with", "evidence": ["Mail rule modification via EWS API"] },
    { "source": "ent-011-006", "target": "ent-011-008", "type": "exfiltrated_to", "evidence": ["BCC mail rule forwarding to external address"] }
  ],
  "correlationReasons": [
    { "type": "shared_entity", "description": "Single Tor IP 185.220.101.45 used for all three compromised account sessions", "confidence": 0.95, "evidence": "Same source IP across all token replay events" },
    { "type": "temporal_proximity", "description": "All three account compromises within 8-minute window", "confidence": 0.92, "evidence": "Token replays at 11:04, 11:08, and 11:12 UTC" },
    { "type": "behavior_sequence", "description": "AiTM phishing → token replay → data access → persistence via mail rules", "confidence": 0.88, "evidence": "Matches BEC/AiTM attack pattern documented in Microsoft threat intelligence" }
  ],
  "mitreTactics": ["TA0001", "TA0005", "TA0009", "TA0003"],
  "mitreTechniques": ["T1078", "T1550", "T1213", "T1098"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F1=$(echo "$WM1_F1" | sed "s/CREATED_PLACEHOLDER/${WM1_F1_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F1_UPDATED}/g")
index_finding "workmates1" 2 "$WM1_F1"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 2: Malware Dropper via USB (3 stages)
# Status: confirmed | Severity: medium | Days ago: 8
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-2: Malware Dropper via USB"
WM1_F2_CREATED=$(days_ago 8)
WM1_F2_UPDATED=$(days_ago 6)

read -r -d '' WM1_F2 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-002",
  "title": "USB-Delivered Malware with Automated Spreading",
  "narrative": "## Attack Summary\n\nA USB device connected to lobby kiosk KIOSK-LBY-02 deployed an autorun-based malware dropper that propagated to 4 additional workstations via network shares before containment. The malware is a variant of Raspberry Robin known for its USB-based initial access technique.\n\n## Initial Infection Vector\n\nAt 08:45 UTC, a USB mass storage device (VID:0x1234 PID:0x5678) was connected to the lobby kiosk. The device contained a malicious .lnk shortcut file that executed `msiexec /q /i` targeting a WebDAV share controlled by the attacker. The MSI package installed a DLL-based payload into `C:\\ProgramData\\Microsoft\\Crypto\\RSA\\`.\n\n## Network Propagation\n\nThe dropper enumerated accessible network shares and copied itself to 4 writable locations: `\\\\RECEP-PC-01\\Public`, `\\\\CONF-ROOM-A\\Shared`, `\\\\HR-PRINT-01\\Drivers`, and `\\\\IT-SUPPLY\\Software`. Each copy included a modified .lnk file designed to execute when the share is browsed in Explorer.\n\n## Containment\n\nEDR quarantined the dropper DLL on the kiosk and the propagated copies were removed from network shares. The kiosk has been reimaged and USB ports have been disabled on all lobby devices per updated policy.",
  "severity": "medium",
  "status": "confirmed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.85,
  "signalCount": 5,
  "eventCount": 67,
  "attackStageCount": 3,
  "entityCount": 7,
  "leadEntity": { "type": "host", "value": "KIOSK-LBY-02" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1091", "description": "USB device with malicious LNK file connected to lobby kiosk", "signalIds": ["sig-012-001", "sig-012-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1218", "description": "msiexec.exe used to install dropper DLL from attacker WebDAV share", "signalIds": ["sig-012-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "Malware propagated to 4 network shares via SMB write access", "signalIds": ["sig-012-004", "sig-012-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-012-001", "type": "host", "value": "KIOSK-LBY-02", "role": "compromised", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-012-002", "type": "host", "value": "RECEP-PC-01", "role": "victim", "riskScore": 75, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-012-003", "type": "host", "value": "CONF-ROOM-A", "role": "victim", "riskScore": 72, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-012-004", "type": "ip", "value": "193.42.33.100", "role": "attacker", "riskScore": 94, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-012-005", "type": "process", "value": "msiexec.exe /q /i", "role": "attacker", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-012-006", "type": "file", "value": "C:\\ProgramData\\Microsoft\\Crypto\\RSA\\mshelper.dll", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-012-007", "type": "file", "value": "E:\\Documents.lnk", "role": "attacker", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-012-007", "target": "ent-012-001", "type": "executed_on", "evidence": ["LNK shortcut executed on kiosk from USB"] },
    { "source": "ent-012-005", "target": "ent-012-004", "type": "communicated_with", "evidence": ["msiexec fetching MSI from attacker WebDAV"] },
    { "source": "ent-012-005", "target": "ent-012-006", "type": "dropped_file", "evidence": ["MSI installer dropped dropper DLL"] },
    { "source": "ent-012-006", "target": "ent-012-002", "type": "lateral_movement", "evidence": ["Malware copy written to RECEP-PC-01 share"] },
    { "source": "ent-012-006", "target": "ent-012-003", "type": "lateral_movement", "evidence": ["Malware copy written to CONF-ROOM-A share"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "USB delivery → MSI execution → network propagation matches Raspberry Robin worm behavior", "confidence": 0.87, "evidence": "3 detection rules for USB-based worm activity triggered in sequence" },
    { "type": "shared_entity", "description": "Dropper DLL mshelper.dll is the common malware across initial infection and lateral spread", "confidence": 0.93, "evidence": "Same SHA256 hash detected on kiosk and in 4 network shares" },
    { "type": "temporal_proximity", "description": "USB insertion to full propagation within 12 minutes", "confidence": 0.90, "evidence": "08:45 USB detected, 08:57 last share write completed" }
  ],
  "mitreTactics": ["TA0001", "TA0002", "TA0008"],
  "mitreTechniques": ["T1091", "T1218", "T1021"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F2=$(echo "$WM1_F2" | sed "s/CREATED_PLACEHOLDER/${WM1_F2_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F2_UPDATED}/g")
index_finding "workmates1" 8 "$WM1_F2"


# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 3: SQL Injection to Data Dump (5 stages)
# Status: reviewing | Severity: critical | Days ago: 3 | Assignee: james.wilson
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-3: SQL Injection to Data Dump"
WM1_F3_CREATED=$(days_ago 3)
WM1_F3_UPDATED=$(days_ago 1)

read -r -d '' WM1_F3 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-003",
  "title": "SQL Injection Leading to Customer Database Exfiltration",
  "narrative": "## Attack Summary\n\nThe public-facing web application `portal.workmates1.com` was exploited via a blind SQL injection vulnerability in the search endpoint. The attacker extracted the full customer database (150,000 records) including PII and hashed credentials over a 6-hour period using out-of-band data exfiltration.\n\n## Exploitation Phase\n\nStarting at 03:00 UTC, WAF logs show a series of time-based blind SQL injection probes against `/api/v2/search?q=` from a rotating pool of residential proxy IPs. After 45 minutes of enumeration, the attacker identified the injection point and began extracting table schemas.\n\n## Data Extraction\n\nThe attacker used `xp_dirtree` and DNS-based out-of-band exfiltration to extract data without triggering response-size alerts. Database records were encoded into DNS queries to a domain controlled by the attacker. The technique bypasses traditional WAF rules that monitor HTTP response sizes.\n\n## Privilege Escalation on Database\n\nAfter extracting user data, the attacker escalated privileges within SQL Server using `xp_cmdshell` to execute OS commands as the SQL service account. A reverse shell was established back to the attacker's infrastructure.\n\n## Impact Assessment\n\nCustomer PII including names, emails, phone numbers, and bcrypt password hashes for 150,000 accounts have been compromised. GDPR/CCPA breach notification requirements apply. The SQL Server service account had domain user privileges, providing potential for further lateral movement.\n\n## Remediation\n\nThe vulnerable endpoint has been patched. The SQL Server has been isolated for forensic analysis. Password reset notifications have been prepared for affected customers pending legal review.",
  "severity": "critical",
  "status": "reviewing",
  "assignee": "james.wilson",
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.93,
  "signalCount": 9,
  "eventCount": 8900,
  "attackStageCount": 5,
  "entityCount": 9,
  "leadEntity": { "type": "host", "value": "WEB-PROD-01" },
  "stages": [
    { "order": 1, "name": "Reconnaissance", "mitreTactic": "TA0043", "mitreTechnique": "T1595", "description": "SQL injection probing against search endpoint from residential proxies", "signalIds": ["sig-013-001", "sig-013-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1190", "description": "Blind SQL injection exploit on /api/v2/search parameter", "signalIds": ["sig-013-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Collection", "mitreTactic": "TA0009", "mitreTechnique": "T1005", "description": "Customer database extraction via DNS OOB exfiltration (150K records)", "signalIds": ["sig-013-004", "sig-013-005", "sig-013-006"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Privilege Escalation", "mitreTactic": "TA0004", "mitreTechnique": "T1059", "description": "xp_cmdshell enabled for OS command execution as SQL service account", "signalIds": ["sig-013-007", "sig-013-008"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 5, "name": "Command and Control", "mitreTactic": "TA0011", "mitreTechnique": "T1071", "description": "Reverse shell established from SQL Server to attacker C2", "signalIds": ["sig-013-009"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-013-001", "type": "host", "value": "WEB-PROD-01", "role": "victim", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-013-002", "type": "host", "value": "SQL-PROD-02", "role": "compromised", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 6 },
    { "id": "ent-013-003", "type": "ip", "value": "45.134.26.18", "role": "attacker", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-013-004", "type": "ip", "value": "92.118.160.5", "role": "attacker", "riskScore": 88, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-013-005", "type": "user", "value": "sql-svc-webapp", "role": "compromised", "riskScore": 93, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-013-006", "type": "process", "value": "sqlservr.exe", "role": "compromised", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-013-007", "type": "ip", "value": "198.51.100.77", "role": "infrastructure", "riskScore": 94, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-013-008", "type": "process", "value": "cmd.exe /c powershell", "role": "attacker", "riskScore": 96, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-013-009", "type": "file", "value": "customers_full_dump.csv", "role": "victim", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-013-003", "target": "ent-013-001", "type": "communicated_with", "evidence": ["SQL injection HTTP requests to web server"] },
    { "source": "ent-013-001", "target": "ent-013-002", "type": "communicated_with", "evidence": ["Malicious SQL queries forwarded to database"] },
    { "source": "ent-013-006", "target": "ent-013-009", "type": "executed_on", "evidence": ["Database query extracting customer records"] },
    { "source": "ent-013-002", "target": "ent-013-003", "type": "exfiltrated_to", "evidence": ["DNS OOB exfiltration of database contents"] },
    { "source": "ent-013-006", "target": "ent-013-008", "type": "executed_on", "evidence": ["xp_cmdshell spawning command process"] },
    { "source": "ent-013-008", "target": "ent-013-007", "type": "communicated_with", "evidence": ["Reverse shell connection to C2 server"] },
    { "source": "ent-013-005", "target": "ent-013-006", "type": "authenticated_as", "evidence": ["SQL service account running database engine"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Web exploitation → SQL injection → data exfiltration → privilege escalation → C2 establishment", "confidence": 0.94, "evidence": "5 rules triggered matching web application attack kill chain" },
    { "type": "shared_entity", "description": "SQL-PROD-02 database server is the pivot between web exploitation and OS-level compromise", "confidence": 0.96, "evidence": "SQL-PROD-02 present in 6 of 9 signals" },
    { "type": "temporal_proximity", "description": "Recon to C2 within 6 hours; data extraction concentrated in 4-hour window", "confidence": 0.88, "evidence": "03:00 to 09:00 UTC attack timeline" },
    { "type": "behavior_sequence", "description": "Blind SQLi → OOB exfil → xp_cmdshell matches documented APT web server exploitation playbook", "confidence": 0.91, "evidence": "Technique combination matches threat intelligence for web-focused operators" }
  ],
  "mitreTactics": ["TA0043", "TA0001", "TA0009", "TA0004", "TA0011"],
  "mitreTechniques": ["T1595", "T1190", "T1005", "T1059", "T1071"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F3=$(echo "$WM1_F3" | sed "s/CREATED_PLACEHOLDER/${WM1_F3_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F3_UPDATED}/g")
index_finding "workmates1" 3 "$WM1_F3"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 4: Brute Force SSH → Pivot (3 stages)
# Status: dismissed | Severity: medium | Days ago: 12
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-4: Brute Force SSH → Pivot"
WM1_F4_CREATED=$(days_ago 12)
WM1_F4_UPDATED=$(days_ago 10)

read -r -d '' WM1_F4 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-004",
  "title": "SSH Brute Force Followed by Internal Pivot Attempt",
  "narrative": "## Attack Summary\n\nJump server BASTION-01 experienced a sustained SSH brute force attack from a botnet of 15 IPs. One credential combination succeeded (root with a weak password), and the attacker attempted to pivot to internal systems before being blocked by network segmentation.\n\n## Brute Force Campaign\n\nBetween 01:00-04:30 UTC, BASTION-01 received 47,000 SSH authentication attempts from 15 unique source IPs across 8 countries. The attempts targeted common usernames (root, admin, ubuntu, deploy). At 04:28 UTC, the combination root/Summer2026! succeeded.\n\n## Pivot Attempt\n\nThe authenticated session immediately attempted SSH connections to 10.0.1.0/24, 10.0.2.0/24, and 10.0.3.0/24 subnets. All internal pivot attempts were blocked by firewall rules that restrict bastion egress to a specific jump target list. The attacker session was terminated after 3 minutes.\n\n## Resolution\n\nDismissed: The brute force was opportunistic (not targeted) and the pivot was blocked by existing controls. Root password has been disabled (key-only auth enforced). The 15 source IPs have been added to the perimeter blocklist. No data access or lateral movement achieved.",
  "severity": "medium",
  "status": "dismissed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.76,
  "signalCount": 4,
  "eventCount": 47000,
  "attackStageCount": 3,
  "entityCount": 5,
  "leadEntity": { "type": "host", "value": "BASTION-01" },
  "stages": [
    { "order": 1, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1110", "description": "SSH brute force campaign: 47,000 attempts from 15 IPs over 3.5 hours", "signalIds": ["sig-014-001", "sig-014-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "Successful root login with weak password Summer2026!", "signalIds": ["sig-014-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "SSH pivot attempts to internal subnets — all blocked by firewall", "signalIds": ["sig-014-004"], "timestamp": "UPDATED_PLACEHOLDER", "status": "blocked" }
  ],
  "entities": [
    { "id": "ent-014-001", "type": "host", "value": "BASTION-01", "role": "compromised", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-014-002", "type": "ip", "value": "45.155.205.100", "role": "attacker", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-014-003", "type": "ip", "value": "194.26.29.44", "role": "attacker", "riskScore": 80, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-014-004", "type": "user", "value": "root", "role": "compromised", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-014-005", "type": "process", "value": "sshd", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 }
  ],
  "relationships": [
    { "source": "ent-014-002", "target": "ent-014-001", "type": "communicated_with", "evidence": ["47,000 SSH connection attempts"] },
    { "source": "ent-014-002", "target": "ent-014-004", "type": "authenticated_as", "evidence": ["Successful root login after brute force"] },
    { "source": "ent-014-004", "target": "ent-014-001", "type": "executed_on", "evidence": ["Interactive shell session established"] },
    { "source": "ent-014-001", "target": "ent-014-003", "type": "communicated_with", "evidence": ["Outbound SSH attempts to internal subnets (blocked)"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Brute force detection → successful auth → immediate lateral movement attempt", "confidence": 0.82, "evidence": "3 rules triggered: brute force threshold, anomalous auth, internal scan" },
    { "type": "temporal_proximity", "description": "Success authentication to pivot attempt within 30 seconds", "confidence": 0.95, "evidence": "Automated post-exploitation suggesting scripted attack" },
    { "type": "shared_entity", "description": "Source IP 45.155.205.100 linked to both brute force and authenticated session", "confidence": 0.88, "evidence": "Same IP for attack and successful login" }
  ],
  "mitreTactics": ["TA0006", "TA0001", "TA0008"],
  "mitreTechniques": ["T1110", "T1078", "T1021"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F4=$(echo "$WM1_F4" | sed "s/CREATED_PLACEHOLDER/${WM1_F4_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F4_UPDATED}/g")
index_finding "workmates1" 12 "$WM1_F4"


# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 5: API Key Leak & Cloud Abuse (4 stages)
# Status: new | Severity: high | Days ago: 1
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-5: API Key Leak & Cloud Abuse"
WM1_F5_CREATED=$(days_ago 1)
WM1_F5_UPDATED=$(days_ago 0)

read -r -d '' WM1_F5 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-005",
  "title": "Exposed API Key Used for Cloud Resource Abuse",
  "narrative": "## Attack Summary\n\nAn AWS access key belonging to the `deploy-automation` IAM user was found in a public GitHub repository commit. Within 2 hours of the commit being pushed, the key was used from an unauthorized IP to spin up 20 GPU instances for cryptocurrency mining in us-east-1 and eu-west-1 regions.\n\n## Key Exposure\n\nDeveloper `tom.huang` accidentally committed `.env.production` containing the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the deploy-automation user. The commit was pushed to a public repository at 11:45 UTC. GitHub secret scanning alerted at 11:47 UTC, but the key was already scraped by automated scanners.\n\n## Unauthorized Cloud Usage\n\nAt 13:52 UTC, the key was used from IP 23.94.141.200 (US VPS provider) to call `ec2:RunInstances` launching p3.2xlarge GPU instances. 12 instances in us-east-1 and 8 instances in eu-west-1 were launched with a user-data script installing XMRig. Estimated cloud spend: $4,800/hour.\n\n## Containment & Impact\n\nCloudTrail alert triggered on IAM anomaly at 14:15 UTC. The key was deactivated at 14:22 UTC. All unauthorized instances were terminated. Total unauthorized spend before containment: approximately $2,400. No access to production data was attempted — purely resource abuse for mining.",
  "severity": "high",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.92,
  "signalCount": 5,
  "eventCount": 245,
  "attackStageCount": 4,
  "entityCount": 7,
  "leadEntity": { "type": "user", "value": "deploy-automation" },
  "stages": [
    { "order": 1, "name": "Reconnaissance", "mitreTactic": "TA0043", "mitreTechnique": "T1593", "description": "Automated scraping of exposed AWS key from public GitHub commit", "signalIds": ["sig-015-001"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "Unauthorized API calls using exposed deploy-automation credentials", "signalIds": ["sig-015-002", "sig-015-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Execution", "mitreTactic": "TA0002", "mitreTechnique": "T1059", "description": "20 GPU instances launched with XMRig mining user-data script", "signalIds": ["sig-015-004"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Impact", "mitreTactic": "TA0040", "mitreTechnique": "T1496", "description": "GPU cryptocurrency mining consuming $4,800/hour in cloud resources", "signalIds": ["sig-015-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "contained" }
  ],
  "entities": [
    { "id": "ent-015-001", "type": "user", "value": "deploy-automation", "role": "compromised", "riskScore": 96, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-015-002", "type": "user", "value": "tom.huang", "role": "victim", "riskScore": 70, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-015-003", "type": "ip", "value": "23.94.141.200", "role": "attacker", "riskScore": 94, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-015-004", "type": "host", "value": "i-0a1b2c3d4e5f (x20)", "role": "infrastructure", "riskScore": 80, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-015-005", "type": "file", "value": ".env.production", "role": "victim", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-015-006", "type": "process", "value": "xmrig --coin monero", "role": "attacker", "riskScore": 95, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-015-007", "type": "ip", "value": "pool.supportxmr.com", "role": "infrastructure", "riskScore": 82, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-015-002", "target": "ent-015-005", "type": "dropped_file", "evidence": ["Accidental commit of .env.production to public repo"] },
    { "source": "ent-015-003", "target": "ent-015-001", "type": "authenticated_as", "evidence": ["AWS API calls using leaked access key"] },
    { "source": "ent-015-001", "target": "ent-015-004", "type": "executed_on", "evidence": ["ec2:RunInstances creating 20 GPU instances"] },
    { "source": "ent-015-004", "target": "ent-015-006", "type": "executed_on", "evidence": ["XMRig process running on all instances"] },
    { "source": "ent-015-006", "target": "ent-015-007", "type": "communicated_with", "evidence": ["Mining pool connection from GPU instances"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Secret exposure → unauthorized API use → resource provisioning → cryptomining", "confidence": 0.94, "evidence": "4 rules triggered: GitHub secret alert, CloudTrail anomaly, instance launch burst, mining traffic" },
    { "type": "shared_entity", "description": "deploy-automation IAM user connects the GitHub exposure to cloud resource abuse", "confidence": 0.97, "evidence": "Same access key ID in commit and CloudTrail events" },
    { "type": "temporal_proximity", "description": "Key exposed to mining operation within 2 hours", "confidence": 0.90, "evidence": "11:45 UTC commit, 13:52 UTC first instance launch" }
  ],
  "mitreTactics": ["TA0043", "TA0001", "TA0002", "TA0040"],
  "mitreTechniques": ["T1593", "T1078", "T1059", "T1496"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F5=$(echo "$WM1_F5" | sed "s/CREATED_PLACEHOLDER/${WM1_F5_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F5_UPDATED}/g")
index_finding "workmates1" 1 "$WM1_F5"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates1 Finding 6: Rogue Wi-Fi Access Point (3 stages)
# Status: new | Severity: medium | Days ago: 3
# ─────────────────────────────────────────────────────────────────────────────────
info "WM1-6: Rogue Wi-Fi Access Point"
WM1_F6_CREATED=$(days_ago 3)
WM1_F6_UPDATED=$(days_ago 2)

read -r -d '' WM1_F6 << 'ENDJSON' || true
{
  "id": "cor-2026-0802-006",
  "title": "Rogue Wi-Fi Access Point Credential Harvesting",
  "narrative": "## Attack Summary\n\nA rogue wireless access point mimicking the corporate SSID 'Workmates-Corp' was detected in the 3rd floor conference area. The rogue AP performed captive portal credential harvesting, capturing credentials for 7 users who connected and authenticated against the fake portal.\n\n## Detection\n\nThe wireless IDS detected a new BSSID (AA:BB:CC:DD:EE:FF) broadcasting SSID 'Workmates-Corp' with signal strength inconsistent with known AP locations. The rogue AP used an open authentication scheme with a captive portal, unlike the legitimate WPA3-Enterprise configuration.\n\n## Credential Capture\n\nSeven users connected to the rogue AP between 09:00-11:30 UTC during a conference room meeting. The captive portal presented a Microsoft 365-style login page. Network monitoring detected the rogue AP relaying captured credentials to 185.141.63.88 via HTTPS.\n\n## Response\n\nPhysical security located and seized a Raspberry Pi 4 device with external antenna hidden behind a conference room display. The device contained the hostapd configuration and a local SQLite database with 7 captured credential pairs. All affected users have been notified and passwords reset.",
  "severity": "medium",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.81,
  "signalCount": 4,
  "eventCount": 45,
  "attackStageCount": 3,
  "entityCount": 6,
  "leadEntity": { "type": "host", "value": "Rogue-AP-AA:BB:CC:DD:EE:FF" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1557", "description": "Rogue AP broadcasting corporate SSID with evil twin captive portal", "signalIds": ["sig-016-001"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1556", "description": "7 users authenticated against fake captive portal, credentials captured", "signalIds": ["sig-016-002", "sig-016-003"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1048", "description": "Captured credentials relayed to external server 185.141.63.88", "signalIds": ["sig-016-004"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-016-001", "type": "host", "value": "Rogue-AP-AA:BB:CC:DD:EE:FF", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 4 },
    { "id": "ent-016-002", "type": "user", "value": "meeting-attendees (7 users)", "role": "victim", "riskScore": 78, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-016-003", "type": "ip", "value": "185.141.63.88", "role": "attacker", "riskScore": 92, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-016-004", "type": "ip", "value": "192.168.100.1", "role": "attacker", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-016-005", "type": "host", "value": "Raspberry-Pi-4B", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-016-006", "type": "file", "value": "/opt/evilportal/creds.db", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-016-005", "target": "ent-016-001", "type": "executed_on", "evidence": ["Raspberry Pi running hostapd rogue AP"] },
    { "source": "ent-016-001", "target": "ent-016-002", "type": "communicated_with", "evidence": ["Wi-Fi association from 7 victim devices"] },
    { "source": "ent-016-002", "target": "ent-016-006", "type": "dropped_file", "evidence": ["Credentials stored in local SQLite database"] },
    { "source": "ent-016-005", "target": "ent-016-003", "type": "exfiltrated_to", "evidence": ["HTTPS POST of harvested credentials to C2"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "WIDS rogue AP detection → credential capture alert → exfiltration traffic detection", "confidence": 0.84, "evidence": "3 rules triggered: rogue BSSID, captive portal anomaly, credential relay traffic" },
    { "type": "shared_entity", "description": "Rogue AP BSSID connects all three stages — same device performing all actions", "confidence": 0.96, "evidence": "Single BSSID AA:BB:CC:DD:EE:FF across all signals" },
    { "type": "temporal_proximity", "description": "AP deployment to credential exfiltration within 2.5-hour meeting window", "confidence": 0.85, "evidence": "09:00 to 11:30 UTC activity correlating with scheduled conference" }
  ],
  "mitreTactics": ["TA0001", "TA0006", "TA0010"],
  "mitreTechniques": ["T1557", "T1556", "T1048"],
  "visibleBy": ["workmates1"]
}
ENDJSON

WM1_F6=$(echo "$WM1_F6" | sed "s/CREATED_PLACEHOLDER/${WM1_F6_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM1_F6_UPDATED}/g")
index_finding "workmates1" 3 "$WM1_F6"

ok "Workmates1 tenant: 6 findings indexed"


# ─── Step 4: Seed Workmates2 Tenant Findings (4 findings) ──────────────────────
header "Step 4: Seed Workmates2 tenant findings (4 attack chains)"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates2 Finding 1: RDP Brute Force and Ransomware (4 stages)
# Status: reviewing | Severity: critical | Days ago: 2 | Assignee: maya.chen
# ─────────────────────────────────────────────────────────────────────────────────
info "WM2-1: RDP Brute Force and Ransomware"
WM2_F1_CREATED=$(days_ago 2)
WM2_F1_UPDATED=$(days_ago 1)

read -r -d '' WM2_F1 << 'ENDJSON' || true
{
  "id": "cor-2026-0803-001",
  "title": "RDP Brute Force Leading to Network-Wide Ransomware",
  "narrative": "## Attack Summary\n\nAn internet-exposed RDP server (TERM-SRV-01) was compromised via brute force authentication. The attacker used the foothold to disable Windows Defender across 12 hosts via Group Policy, then deployed Phobos ransomware encrypting file shares and database backups.\n\n## Initial Access\n\nRDP brute force from IP range 5.188.86.0/24 targeted TERM-SRV-01 over a 6-hour period with approximately 180,000 attempts. The account `admin.backup` was compromised using the password `Backup2025!`. The server was exposed to the internet due to a misconfigured firewall rule added during a maintenance window 3 weeks ago.\n\n## Defense Evasion\n\nThe attacker used the `admin.backup` account (which has Group Policy modification privileges) to push a GPO disabling Windows Defender real-time protection and tamper protection across the `Servers` OU. This affected 12 servers within 15 minutes of GPO replication.\n\n## Ransomware Deployment\n\nPhobos ransomware was deployed via PsExec to all 12 servers simultaneously. The ransomware encrypted local drives and mapped network shares. Backup files on NAS-BKP-01 were specifically targeted and encrypted, including the SQL backup directory. A ransom note demanding 5 BTC was placed on each affected system.\n\n## Impact\n\n12 servers encrypted, 2.3 TB of data affected. Recovery from offsite backups (48-hour RPO) is in progress. Business operations impacted for Finance, HR, and Engineering departments.",
  "severity": "critical",
  "status": "reviewing",
  "assignee": "maya.chen",
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.95,
  "signalCount": 7,
  "eventCount": 180000,
  "attackStageCount": 4,
  "entityCount": 9,
  "leadEntity": { "type": "host", "value": "TERM-SRV-01" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "RDP brute force compromise of admin.backup on internet-exposed TERM-SRV-01", "signalIds": ["sig-017-001", "sig-017-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Defense Evasion", "mitreTactic": "TA0005", "mitreTechnique": "T1562", "description": "Group Policy used to disable Defender on 12 servers in Servers OU", "signalIds": ["sig-017-003", "sig-017-004"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Lateral Movement", "mitreTactic": "TA0008", "mitreTechnique": "T1021", "description": "PsExec deployment to 12 servers using admin.backup credentials", "signalIds": ["sig-017-005", "sig-017-006"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Impact", "mitreTactic": "TA0040", "mitreTechnique": "T1486", "description": "Phobos ransomware encrypts 2.3 TB across 12 servers and backup NAS", "signalIds": ["sig-017-007"], "timestamp": "UPDATED_PLACEHOLDER", "status": "active" }
  ],
  "entities": [
    { "id": "ent-017-001", "type": "host", "value": "TERM-SRV-01", "role": "compromised", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-017-002", "type": "user", "value": "admin.backup", "role": "compromised", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-017-003", "type": "ip", "value": "5.188.86.44", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-017-004", "type": "host", "value": "NAS-BKP-01", "role": "victim", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-017-005", "type": "process", "value": "psexec.exe", "role": "attacker", "riskScore": 92, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-017-006", "type": "file", "value": "phobos_payload.exe", "role": "attacker", "riskScore": 99, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-017-007", "type": "host", "value": "DC-WM2-01", "role": "compromised", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-017-008", "type": "host", "value": "SQL-WM2-01", "role": "victim", "riskScore": 96, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-017-009", "type": "file", "value": "DECRYPT_FILES.txt", "role": "attacker", "riskScore": 90, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-017-003", "target": "ent-017-001", "type": "communicated_with", "evidence": ["180,000 RDP brute force attempts"] },
    { "source": "ent-017-003", "target": "ent-017-002", "type": "authenticated_as", "evidence": ["Successful RDP login as admin.backup"] },
    { "source": "ent-017-002", "target": "ent-017-007", "type": "authenticated_as", "evidence": ["GPO modification via domain controller"] },
    { "source": "ent-017-005", "target": "ent-017-008", "type": "executed_on", "evidence": ["PsExec deploying payload to SQL server"] },
    { "source": "ent-017-005", "target": "ent-017-004", "type": "executed_on", "evidence": ["PsExec deploying payload to backup NAS"] },
    { "source": "ent-017-006", "target": "ent-017-009", "type": "dropped_file", "evidence": ["Ransomware creating ransom note on each host"] },
    { "source": "ent-017-001", "target": "ent-017-005", "type": "executed_on", "evidence": ["PsExec launched from compromised terminal server"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "RDP brute force → Defender disable via GPO → PsExec lateral movement → ransomware deployment", "confidence": 0.96, "evidence": "4 high-fidelity rules triggered in classic RDP-to-ransomware sequence" },
    { "type": "shared_entity", "description": "admin.backup account used across initial compromise, GPO modification, and PsExec deployment", "confidence": 0.98, "evidence": "Single compromised account in all 7 signals" },
    { "type": "temporal_proximity", "description": "Brute force success to ransomware deployment within 2 hours", "confidence": 0.94, "evidence": "Credential compromise at 06:30, ransomware at 08:45 UTC" },
    { "type": "behavior_sequence", "description": "Disable AV → deploy ransomware is a textbook pattern for Phobos/Dharma ransomware operators", "confidence": 0.93, "evidence": "Matches Phobos TTP profile documented in CISA advisory AA23-158A" }
  ],
  "mitreTactics": ["TA0001", "TA0005", "TA0008", "TA0040"],
  "mitreTechniques": ["T1078", "T1562", "T1021", "T1486"],
  "visibleBy": ["workmates2"]
}
ENDJSON

WM2_F1=$(echo "$WM2_F1" | sed "s/CREATED_PLACEHOLDER/${WM2_F1_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM2_F1_UPDATED}/g")
index_finding "workmates2" 2 "$WM2_F1"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates2 Finding 2: Malicious Browser Extension (3 stages)
# Status: new | Severity: medium | Days ago: 4
# ─────────────────────────────────────────────────────────────────────────────────
info "WM2-2: Malicious Browser Extension"
WM2_F2_CREATED=$(days_ago 4)
WM2_F2_UPDATED=$(days_ago 3)

read -r -d '' WM2_F2 << 'ENDJSON' || true
{
  "id": "cor-2026-0803-002",
  "title": "Malicious Browser Extension Stealing Session Cookies",
  "narrative": "## Attack Summary\n\nA Chrome browser extension 'PDF Tools Pro' (ID: abcdefghijklmnop) installed on 5 workstations in the sales department was identified as a credential stealer. The extension captures session cookies and form data from banking and SaaS login pages, exfiltrating them to a Telegram bot.\n\n## Extension Analysis\n\nThe extension was approved through the internal extension request process 2 weeks ago. It appeared legitimate with 10,000+ Chrome Web Store downloads and positive reviews. However, a recent update (v2.4.1 pushed 4 days ago) added content scripts that inject into all HTTPS pages and intercept `document.cookie` and form submissions matching patterns for known banking domains, Salesforce, and HubSpot.\n\n## Data Exfiltration\n\nCaptured data is base64-encoded and sent via `fetch()` POST requests to `https://api.telegram.org/bot<token>/sendMessage`. The extension intercepts approximately 40 cookie/form submissions per day per user across the 5 affected workstations.\n\n## Scope\n\nAll 5 sales team members' active sessions for Salesforce, HubSpot, and corporate banking portal are considered compromised. Session tokens have been invalidated and passwords reset.",
  "severity": "medium",
  "status": "new",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.84,
  "signalCount": 5,
  "eventCount": 200,
  "attackStageCount": 3,
  "entityCount": 7,
  "leadEntity": { "type": "process", "value": "chrome.exe (PDF Tools Pro)" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1189", "description": "Malicious browser extension update injects credential-stealing content scripts", "signalIds": ["sig-018-001", "sig-018-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1539", "description": "Extension captures session cookies and form data from SaaS and banking sites", "signalIds": ["sig-018-003", "sig-018-004"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Exfiltration", "mitreTactic": "TA0010", "mitreTechnique": "T1567", "description": "Stolen data exfiltrated to Telegram bot API via HTTPS POST", "signalIds": ["sig-018-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-018-001", "type": "process", "value": "chrome.exe (PDF Tools Pro)", "role": "attacker", "riskScore": 95, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-018-002", "type": "host", "value": "SALES-WKS-01", "role": "compromised", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-018-003", "type": "host", "value": "SALES-WKS-03", "role": "compromised", "riskScore": 82, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-018-004", "type": "user", "value": "sales-team (5 users)", "role": "victim", "riskScore": 78, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-018-005", "type": "ip", "value": "149.154.167.220", "role": "infrastructure", "riskScore": 70, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-018-006", "type": "file", "value": "extension-id-abcdefghijklmnop", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-018-007", "type": "user", "value": "salesforce-session-tokens", "role": "victim", "riskScore": 90, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 }
  ],
  "relationships": [
    { "source": "ent-018-006", "target": "ent-018-002", "type": "executed_on", "evidence": ["Extension active on SALES-WKS-01"] },
    { "source": "ent-018-006", "target": "ent-018-003", "type": "executed_on", "evidence": ["Extension active on SALES-WKS-03"] },
    { "source": "ent-018-001", "target": "ent-018-007", "type": "executed_on", "evidence": ["Content script intercepting session cookies"] },
    { "source": "ent-018-001", "target": "ent-018-005", "type": "exfiltrated_to", "evidence": ["HTTPS POST to Telegram Bot API (149.154.167.220)"] }
  ],
  "correlationReasons": [
    { "type": "shared_entity", "description": "Extension ID abcdefghijklmnop is the common element across all 5 affected workstations", "confidence": 0.96, "evidence": "Same extension ID detected on all compromised machines" },
    { "type": "behavior_sequence", "description": "Extension update → cookie interception → Telegram exfiltration matches known malicious extension pattern", "confidence": 0.85, "evidence": "Pattern matches Chrome Web Store supply chain attack TTPs" },
    { "type": "temporal_proximity", "description": "All credential theft started after extension v2.4.1 update 4 days ago", "confidence": 0.90, "evidence": "No suspicious activity before update; immediate theft after" }
  ],
  "mitreTactics": ["TA0001", "TA0006", "TA0010"],
  "mitreTechniques": ["T1189", "T1539", "T1567"],
  "visibleBy": ["workmates2"]
}
ENDJSON

WM2_F2=$(echo "$WM2_F2" | sed "s/CREATED_PLACEHOLDER/${WM2_F2_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM2_F2_UPDATED}/g")
index_finding "workmates2" 4 "$WM2_F2"


# ─────────────────────────────────────────────────────────────────────────────────
# Workmates2 Finding 3: Container Escape & Cloud Pivot (4 stages)
# Status: confirmed | Severity: high | Days ago: 6
# ─────────────────────────────────────────────────────────────────────────────────
info "WM2-3: Container Escape & Cloud Pivot"
WM2_F3_CREATED=$(days_ago 6)
WM2_F3_UPDATED=$(days_ago 4)

read -r -d '' WM2_F3 << 'ENDJSON' || true
{
  "id": "cor-2026-0803-003",
  "title": "Container Escape to Host and Cloud Metadata Theft",
  "narrative": "## Attack Summary\n\nA vulnerable container running an unpatched version of Apache Struts (CVE-2023-50164) was exploited, allowing the attacker to escape the container to the underlying host node. From the host, the attacker accessed the cloud instance metadata service (IMDS) to obtain temporary IAM credentials with broad permissions.\n\n## Container Exploitation\n\nThe Struts vulnerability in the `invoice-processor` deployment allowed arbitrary file upload. The attacker uploaded a JSP webshell to the container's writable layer. Using the webshell, they discovered the container was running with `--privileged` flag and had access to the host's `/proc` filesystem.\n\n## Container Escape\n\nExploiting the privileged container configuration, the attacker used the `nsenter` technique via `/proc/1/ns/mnt` to break out to the host node `k8s-worker-03`. On the host, they accessed Docker socket and enumerated all running containers and their environment variables.\n\n## Cloud Credential Theft\n\nFrom the host node, the attacker curled the AWS IMDS v1 endpoint at `http://169.254.169.254/latest/meta-data/iam/security-credentials/` obtaining temporary credentials for the `k8s-node-role` IAM role. These credentials have S3, DynamoDB, and SQS access.\n\n## Current Status\n\nThe compromised node has been drained and cordoned. IMDSv2 enforcement is being rolled out to all nodes. The invoice-processor has been patched and the privileged flag removed.",
  "severity": "high",
  "status": "confirmed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.90,
  "signalCount": 6,
  "eventCount": 312,
  "attackStageCount": 4,
  "entityCount": 8,
  "leadEntity": { "type": "host", "value": "k8s-worker-03" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1190", "description": "Apache Struts CVE-2023-50164 exploited in invoice-processor container", "signalIds": ["sig-019-001", "sig-019-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Privilege Escalation", "mitreTactic": "TA0004", "mitreTechnique": "T1611", "description": "Container escape via nsenter on privileged container to host node", "signalIds": ["sig-019-003", "sig-019-004"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Credential Access", "mitreTactic": "TA0006", "mitreTechnique": "T1552", "description": "IMDS v1 accessed to steal IAM temporary credentials from node role", "signalIds": ["sig-019-005"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 4, "name": "Discovery", "mitreTactic": "TA0007", "mitreTechnique": "T1613", "description": "Docker API enumeration of all containers and environment variables on host", "signalIds": ["sig-019-006"], "timestamp": "UPDATED_PLACEHOLDER", "status": "confirmed" }
  ],
  "entities": [
    { "id": "ent-019-001", "type": "host", "value": "k8s-worker-03", "role": "compromised", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 5 },
    { "id": "ent-019-002", "type": "host", "value": "invoice-processor-pod-9a2b", "role": "compromised", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-019-003", "type": "ip", "value": "103.136.42.88", "role": "attacker", "riskScore": 94, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-019-004", "type": "user", "value": "k8s-node-role", "role": "compromised", "riskScore": 93, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-019-005", "type": "ip", "value": "169.254.169.254", "role": "infrastructure", "riskScore": 60, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-019-006", "type": "process", "value": "nsenter -t 1 -m -u -i -n", "role": "attacker", "riskScore": 99, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-019-007", "type": "file", "value": "upload/shell.jsp", "role": "attacker", "riskScore": 97, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "CREATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-019-008", "type": "process", "value": "docker ps -a", "role": "attacker", "riskScore": 75, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-019-003", "target": "ent-019-002", "type": "communicated_with", "evidence": ["Struts exploitation HTTP requests"] },
    { "source": "ent-019-003", "target": "ent-019-007", "type": "dropped_file", "evidence": ["JSP webshell uploaded via file upload vuln"] },
    { "source": "ent-019-006", "target": "ent-019-001", "type": "executed_on", "evidence": ["nsenter breaking into host mount namespace"] },
    { "source": "ent-019-001", "target": "ent-019-005", "type": "communicated_with", "evidence": ["HTTP request to IMDS endpoint from host"] },
    { "source": "ent-019-008", "target": "ent-019-001", "type": "executed_on", "evidence": ["Docker API enumeration on host"] },
    { "source": "ent-019-002", "target": "ent-019-006", "type": "executed_on", "evidence": ["nsenter spawned from within container"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Web exploit → container escape → IMDS access matches cloud-native attack progression", "confidence": 0.92, "evidence": "4 rules fired: Struts exploit, container escape, IMDS access, Docker enum" },
    { "type": "shared_entity", "description": "k8s-worker-03 is the common host connecting container escape to cloud credential theft", "confidence": 0.95, "evidence": "Host node present in 5 of 6 signals" },
    { "type": "behavior_sequence", "description": "Privileged container + nsenter + IMDS is a well-documented cloud-native attack path", "confidence": 0.89, "evidence": "Matches MITRE ATT&CK Containers matrix escalation pattern" },
    { "type": "temporal_proximity", "description": "Exploit to credential theft within 20 minutes", "confidence": 0.91, "evidence": "Automated exploitation chain with minimal dwell time" }
  ],
  "mitreTactics": ["TA0001", "TA0004", "TA0006", "TA0007"],
  "mitreTechniques": ["T1190", "T1611", "T1552", "T1613"],
  "visibleBy": ["workmates2"]
}
ENDJSON

WM2_F3=$(echo "$WM2_F3" | sed "s/CREATED_PLACEHOLDER/${WM2_F3_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM2_F3_UPDATED}/g")
index_finding "workmates2" 6 "$WM2_F3"

# ─────────────────────────────────────────────────────────────────────────────────
# Workmates2 Finding 4: Email Account Compromise & BEC (3 stages)
# Status: dismissed | Severity: low | Days ago: 11
# ─────────────────────────────────────────────────────────────────────────────────
info "WM2-4: Email Account Compromise & BEC"
WM2_F4_CREATED=$(days_ago 11)
WM2_F4_UPDATED=$(days_ago 9)

read -r -d '' WM2_F4 << 'ENDJSON' || true
{
  "id": "cor-2026-0803-004",
  "title": "Business Email Compromise - Invoice Redirect Attempt",
  "narrative": "## Attack Summary\n\nThe email account of `angela.martinez@workmates2.com` (Accounts Payable Manager) was compromised via credential stuffing. The attacker created inbox rules to hide reply-chain emails and attempted to redirect a $145,000 vendor payment by modifying banking details in an ongoing email thread.\n\n## Account Compromise\n\nAt 22:15 UTC, a successful login to angela.martinez's Microsoft 365 account was detected from IP 41.216.186.33 (Nigeria). The password was reused from a breach of a fitness app (credential dump posted to a dark web forum 3 weeks ago). MFA was not enabled for this account due to a legacy policy exception.\n\n## Email Manipulation\n\nThe attacker created two inbox rules: (1) 'Move to RSS Feeds' for emails containing 'payment' or 'invoice' from the specific vendor, (2) 'Mark as Read' for all emails from the finance director. The attacker then replied in an existing thread with the vendor, providing modified bank account details for the upcoming quarterly payment.\n\n## Detection & Resolution\n\nDismissed: The vendor independently confirmed the change via phone call before processing (as per payment modification SOP). No funds were transferred to the attacker account. The account has been secured with MFA enabled and password changed. The inbox rules were removed.\n\n## Residual Risk\n\nThe attacker had read access to angela.martinez's inbox for approximately 14 hours before detection. Email content including financial schedules, vendor contracts, and internal budget discussions may have been viewed.",
  "severity": "low",
  "status": "dismissed",
  "assignee": null,
  "createdAt": "CREATED_PLACEHOLDER",
  "updatedAt": "UPDATED_PLACEHOLDER",
  "confidence": 0.78,
  "signalCount": 3,
  "eventCount": 34,
  "attackStageCount": 3,
  "entityCount": 5,
  "leadEntity": { "type": "user", "value": "angela.martinez@workmates2.com" },
  "stages": [
    { "order": 1, "name": "Initial Access", "mitreTactic": "TA0001", "mitreTechnique": "T1078", "description": "Credential stuffing login from Nigerian IP using reused password", "signalIds": ["sig-020-001"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 2, "name": "Persistence", "mitreTactic": "TA0003", "mitreTechnique": "T1098", "description": "Inbox rules created to hide payment-related emails from view", "signalIds": ["sig-020-002"], "timestamp": "CREATED_PLACEHOLDER", "status": "confirmed" },
    { "order": 3, "name": "Impact", "mitreTactic": "TA0040", "mitreTechnique": "T1657", "description": "BEC payment redirect attempt for $145K vendor invoice", "signalIds": ["sig-020-003"], "timestamp": "UPDATED_PLACEHOLDER", "status": "blocked" }
  ],
  "entities": [
    { "id": "ent-020-001", "type": "user", "value": "angela.martinez@workmates2.com", "role": "victim", "riskScore": 85, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-020-002", "type": "ip", "value": "41.216.186.33", "role": "attacker", "riskScore": 92, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 2 },
    { "id": "ent-020-003", "type": "host", "value": "outlook.office365.com", "role": "infrastructure", "riskScore": 60, "firstSeen": "CREATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 3 },
    { "id": "ent-020-004", "type": "user", "value": "vendor-acme-payments@supplier.com", "role": "victim", "riskScore": 70, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 },
    { "id": "ent-020-005", "type": "file", "value": "Modified_Invoice_Q3_2026.pdf", "role": "attacker", "riskScore": 88, "firstSeen": "UPDATED_PLACEHOLDER", "lastSeen": "UPDATED_PLACEHOLDER", "signalCount": 1 }
  ],
  "relationships": [
    { "source": "ent-020-002", "target": "ent-020-001", "type": "authenticated_as", "evidence": ["Credential stuffing login to M365 account"] },
    { "source": "ent-020-001", "target": "ent-020-003", "type": "communicated_with", "evidence": ["Inbox rule creation and email manipulation"] },
    { "source": "ent-020-001", "target": "ent-020-004", "type": "communicated_with", "evidence": ["Reply in existing thread with modified payment details"] },
    { "source": "ent-020-001", "target": "ent-020-005", "type": "dropped_file", "evidence": ["Modified invoice PDF attached to BEC email"] }
  ],
  "correlationReasons": [
    { "type": "rule_chain", "description": "Anomalous login → inbox rule creation → payment redirect matches BEC attack pattern", "confidence": 0.82, "evidence": "3 rules: impossible travel login, inbox rule creation, payment modification" },
    { "type": "shared_entity", "description": "angela.martinez account is the single compromised identity across all stages", "confidence": 0.97, "evidence": "All activity under same account" },
    { "type": "behavior_sequence", "description": "Login → hide emails → reply in payment thread is textbook BEC playbook", "confidence": 0.80, "evidence": "Matches FBI IC3 documented BEC attack methodology" }
  ],
  "mitreTactics": ["TA0001", "TA0003", "TA0040"],
  "mitreTechniques": ["T1078", "T1098", "T1657"],
  "visibleBy": ["workmates2"]
}
ENDJSON

WM2_F4=$(echo "$WM2_F4" | sed "s/CREATED_PLACEHOLDER/${WM2_F4_CREATED}/g" | sed "s/UPDATED_PLACEHOLDER/${WM2_F4_UPDATED}/g")
index_finding "workmates2" 11 "$WM2_F4"

ok "Workmates2 tenant: 4 findings indexed"


# ─── Step 5: Insert finding_notes in PostgreSQL ─────────────────────────────────
header "Step 5: Insert 15 finding_notes for reviewing/confirmed findings"

# tenant_id: 1=CWM, 2=Workmates1, 3=Workmates2
# Notes for: reviewing (cor-002,006,008,013,017) and confirmed (cor-003,004,012,019)
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -q << 'SQL'
INSERT INTO finding_notes (id, finding_id, content, author, mentions, tenant_id, created_at) VALUES
-- CWM-2 (reviewing, maya.chen)
('fn-001', 'cor-2026-0801-002', 'Confirmed Kerberoasting activity via event logs on DC-PROD-01. TGS requests show RC4 downgrade pattern consistent with Rubeus tool. Recommending immediate password rotation for all targeted SPNs.', 'maya.chen', NULL, 1, NOW() - INTERVAL '2 days'),
('fn-002', 'cor-2026-0801-002', 'Checked with IT team - admin-svc-01 has GenericAll on Domain Admins through nested group membership. This is a critical misconfiguration that should be remediated regardless of this incident.', 'maya.chen', 'james.wilson', 1, NOW() - INTERVAL '1 day 18 hours'),
('fn-003', 'cor-2026-0801-002', '@maya.chen I can see WMI lateral movement in the network flow logs. The recon script on FIN-WKS-018 matches a known toolset. Should we escalate to incident?', 'james.wilson', 'maya.chen', 1, NOW() - INTERVAL '1 day 12 hours'),

-- CWM-6 (reviewing, james.wilson)
('fn-004', 'cor-2026-0801-006', 'IcedID dropper hash matches VirusTotal submission from 3 days ago. The Cobalt Strike watermark 1234567890 is associated with a financially-motivated threat group tracked as TEMP.Sprout.', 'james.wilson', NULL, 1, NOW() - INTERVAL '2 days'),
('fn-005', 'cor-2026-0801-006', 'DLP team confirmed 890MB was the upper bound. Some files in Litigation-Hold directory contain attorney-client privileged material. Looping in legal@.', 'james.wilson', 'maya.chen', 1, NOW() - INTERVAL '1 day 6 hours'),

-- CWM-8 (reviewing, maya.chen)
('fn-006', 'cor-2026-0801-008', 'This is a complete domain compromise. DCSync gives them krbtgt which means Golden Ticket capability. We need to initiate full AD forest recovery procedures per IR-PLAN-007.', 'maya.chen', NULL, 1, NOW() - INTERVAL '4 days'),
('fn-007', 'cor-2026-0801-008', 'Forensic timeline shows IT-WKS-077 was compromised before the Kerberoasting. Need to investigate how the attacker got initial access to that workstation. Checking proxy logs for the past week.', 'maya.chen', 'james.wilson', 1, NOW() - INTERVAL '3 days 12 hours'),

-- CWM-3 (confirmed)
('fn-008', 'cor-2026-0801-003', 'Supply chain attack confirmed. The npm package lodsah was a typosquat registered 72 hours before the attack. Package has been reported and removed from registry. Internal repo is now clean.', 'james.wilson', NULL, 1, NOW() - INTERVAL '4 days'),
('fn-009', 'cor-2026-0801-003', 'EKS forensics complete. The malicious container was running for 6 hours. Service mesh token interception confirmed via pod network captures. Rotating all service mesh certificates.', 'maya.chen', NULL, 1, NOW() - INTERVAL '3 days 8 hours'),

-- CWM-4 (confirmed)
('fn-010', 'cor-2026-0801-004', 'HR confirmed patricia.nguyen submitted resignation 2 weeks ago. DLP logs show 2.3GB uploaded to personal cloud storage accounts. Legal hold placed on her M365 account and all accessed files.', 'james.wilson', NULL, 1, NOW() - INTERVAL '5 days 6 hours'),

-- Workmates1-3 (reviewing, james.wilson)
('fn-011', 'cor-2026-0802-003', 'Confirmed SQL injection in search endpoint. The OOB exfiltration used xp_dirtree to DNS — clever way to bypass WAF response inspection. Patch deployed to staging, pending production push.', 'james.wilson', NULL, 2, NOW() - INTERVAL '2 days'),
('fn-012', 'cor-2026-0802-003', 'Customer data extraction confirmed: 150K records including PII. Initiating GDPR Article 33 notification process. @maya.chen please coordinate with legal on timeline.', 'james.wilson', 'maya.chen', 2, NOW() - INTERVAL '1 day 8 hours'),

-- Workmates1-2 (confirmed)
('fn-013', 'cor-2026-0802-002', 'USB device seized from lobby. Raspberry Robin variant confirmed by malware analysis team. All propagated copies removed from network shares. Kiosk reimaged and USB ports disabled.', 'maya.chen', NULL, 2, NOW() - INTERVAL '6 days'),

-- Workmates2-1 (reviewing, maya.chen)
('fn-014', 'cor-2026-0803-001', 'Critical: 12 servers encrypted including backup NAS. Recovery from offsite tape backups initiated — ETA 48 hours for full restoration. Business continuity plan activated for affected departments.', 'maya.chen', 'james.wilson', 3, NOW() - INTERVAL '1 day 12 hours'),

-- Workmates2-3 (confirmed)
('fn-015', 'cor-2026-0803-003', 'Container escape confirmed via privileged mode misconfiguration. IMDSv2 enforcement policy now applied to all node groups. invoice-processor redeployed without privileged flag. Node drained and reimaged.', 'james.wilson', NULL, 3, NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;
SQL

ok "15 finding_notes inserted"


# ─── Step 6: Verify seed data ──────────────────────────────────────────────────
header "Step 6: Verify seeded data"

# Refresh indices for immediate searchability
${CURL_OS} -X POST "${OS_URL}/v3-hive-correlation-*/_refresh" 2>/dev/null > /dev/null
info "Indices refreshed"

# Count documents per tenant
CWM_COUNT=$(${CURL_OS} -s "${OS_URL}/v3-hive-correlation-cwm-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
WM1_COUNT=$(${CURL_OS} -s "${OS_URL}/v3-hive-correlation-workmates1-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
WM2_COUNT=$(${CURL_OS} -s "${OS_URL}/v3-hive-correlation-workmates2-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null || echo "0")
TOTAL_COUNT=$((CWM_COUNT + WM1_COUNT + WM2_COUNT))

echo ""
info "CWM findings:        ${CWM_COUNT}/10"
info "Workmates1 findings: ${WM1_COUNT}/6"
info "Workmates2 findings: ${WM2_COUNT}/4"
info "Total findings:      ${TOTAL_COUNT}/20"

if [[ "$TOTAL_COUNT" -eq 20 ]]; then
  ok "All 20 findings indexed successfully"
else
  warn "Expected 20 findings, got ${TOTAL_COUNT}"
fi

# Verify status distribution
info "Verifying status distribution..."
STATUS_RESULT=$(${CURL_OS} -s "${OS_URL}/v3-hive-correlation-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "size": 0,
    "aggs": {
      "by_status": { "terms": { "field": "status", "size": 10 } }
    }
  }' 2>/dev/null)

NEW_COUNT=$(echo "$STATUS_RESULT" | python3 -c "import sys,json; buckets=json.load(sys.stdin)['aggregations']['by_status']['buckets']; print(next((b['doc_count'] for b in buckets if b['key']=='new'),0))" 2>/dev/null || echo "?")
REVIEWING_COUNT=$(echo "$STATUS_RESULT" | python3 -c "import sys,json; buckets=json.load(sys.stdin)['aggregations']['by_status']['buckets']; print(next((b['doc_count'] for b in buckets if b['key']=='reviewing'),0))" 2>/dev/null || echo "?")
CONFIRMED_COUNT=$(echo "$STATUS_RESULT" | python3 -c "import sys,json; buckets=json.load(sys.stdin)['aggregations']['by_status']['buckets']; print(next((b['doc_count'] for b in buckets if b['key']=='confirmed'),0))" 2>/dev/null || echo "?")
DISMISSED_COUNT=$(echo "$STATUS_RESULT" | python3 -c "import sys,json; buckets=json.load(sys.stdin)['aggregations']['by_status']['buckets']; print(next((b['doc_count'] for b in buckets if b['key']=='dismissed'),0))" 2>/dev/null || echo "?")

info "Status: new=${NEW_COUNT} reviewing=${REVIEWING_COUNT} confirmed=${CONFIRMED_COUNT} dismissed=${DISMISSED_COUNT}"
info "Expected: new=8 reviewing=5 confirmed=4 dismissed=3"

# Verify PostgreSQL notes
NOTES_COUNT=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -t -c "SELECT COUNT(*) FROM finding_notes WHERE finding_id LIKE 'cor-%';" 2>/dev/null | tr -d ' ')
info "PostgreSQL finding_notes: ${NOTES_COUNT}/15"

# Sample verification: fetch one finding to confirm structure
info "Sample document verification..."
SAMPLE=$(${CURL_OS} -s "${OS_URL}/v3-hive-correlation-cwm-*/_search" \
  -H "Content-Type: application/json" \
  -d '{"size":1,"query":{"term":{"id":"cor-2026-0801-001"}}}' 2>/dev/null)

HAS_STAGES=$(echo "$SAMPLE" | python3 -c "import sys,json; doc=json.load(sys.stdin)['hits']['hits'][0]['_source']; print('yes' if len(doc.get('stages',[])) > 0 else 'no')" 2>/dev/null || echo "no")
HAS_ENTITIES=$(echo "$SAMPLE" | python3 -c "import sys,json; doc=json.load(sys.stdin)['hits']['hits'][0]['_source']; print('yes' if len(doc.get('entities',[])) > 0 else 'no')" 2>/dev/null || echo "no")
HAS_NARRATIVE=$(echo "$SAMPLE" | python3 -c "import sys,json; doc=json.load(sys.stdin)['hits']['hits'][0]['_source']; print('yes' if len(doc.get('narrative','')) > 100 else 'no')" 2>/dev/null || echo "no")
HAS_RELATIONSHIPS=$(echo "$SAMPLE" | python3 -c "import sys,json; doc=json.load(sys.stdin)['hits']['hits'][0]['_source']; print('yes' if len(doc.get('relationships',[])) > 0 else 'no')" 2>/dev/null || echo "no")
HAS_REASONS=$(echo "$SAMPLE" | python3 -c "import sys,json; doc=json.load(sys.stdin)['hits']['hits'][0]['_source']; print('yes' if len(doc.get('correlationReasons',[])) > 0 else 'no')" 2>/dev/null || echo "no")

if [[ "$HAS_STAGES" == "yes" && "$HAS_ENTITIES" == "yes" && "$HAS_NARRATIVE" == "yes" && "$HAS_RELATIONSHIPS" == "yes" && "$HAS_REASONS" == "yes" ]]; then
  ok "Sample document structure verified: stages ✓ entities ✓ narrative ✓ relationships ✓ correlationReasons ✓"
else
  warn "Sample document missing fields: stages=${HAS_STAGES} entities=${HAS_ENTITIES} narrative=${HAS_NARRATIVE} relationships=${HAS_RELATIONSHIPS} correlationReasons=${HAS_REASONS}"
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  Seed complete! 20 correlated findings across 3 tenants.${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Findings distribution:"
echo "    CWM (10):        Multi-stage Ransomware, Credential Theft, Supply Chain,"
echo "                     Insider Exfil, Cryptominer, Phishing→C2, DNS Tunnel,"
echo "                     Kerberoasting, Webshell, LOLBIN"
echo "    Workmates1 (6):  Cloud Account Takeover, USB Malware, SQL Injection,"
echo "                     SSH Brute Force, API Key Leak, Rogue Wi-Fi"
echo "    Workmates2 (4):  RDP Ransomware, Browser Extension, Container Escape, BEC"
echo ""
echo "  Status distribution: 8 new, 5 reviewing, 4 confirmed, 3 dismissed"
echo "  MITRE coverage: TA0001-TA0011 (11 tactics), 10+ techniques"
echo "  Finding notes: 15 analyst notes in PostgreSQL"
echo ""
echo "  To verify in OpenSearch Dashboards:"
echo "    ${OS_URL}/_cat/indices/v3-hive-correlation-*?v"
echo ""
echo "  To teardown:"
echo "    bash seed-correlated-findings.sh --teardown"
echo ""
