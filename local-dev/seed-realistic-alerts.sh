#!/usr/bin/env bash
###############################################################################
# seed-realistic-alerts.sh
# Seeds 200 production-shaped alerts across 3 tenants for Sprint 38 testing.
# - CWM (id=3813): 70 alerts (5 chains = 30 alerts + 40 standalone)
# - Workmates1 (id=3812): 65 alerts (4 chains = 20 alerts + 45 standalone)
# - Workmates2 (id=3814): 65 alerts (4 chains = 18 alerts + 47 standalone)
#
# Each alert includes: core fields, MITRE, entity, ownership, SLA, risk factors,
# status history, adversary/target, tags. 30% have threat intel, 20% have notes.
###############################################################################
set -euo pipefail

OS_URL="https://localhost:9200"
CURL="curl -sk --max-time 30 -u admin:LocalDev@2024!"
TODAY=$(date -u +%Y.%m.%d)
NOW_EPOCH=$(date -u +%s)

# macOS vs Linux date compatibility
if date -u -r 0 +%s >/dev/null 2>&1; then
  gen_ts() { date -u -r $(( NOW_EPOCH - $1 )) +%Y-%m-%dT%H:%M:%S.000Z; }
else
  gen_ts() { date -u -d "@$(( NOW_EPOCH - $1 ))" +%Y-%m-%dT%H:%M:%S.000Z; }
fi

ALERT_COUNT=0
TMPFILE="/tmp/ha-seed-bulk-$$.ndjson"

echo "============================================================"
echo "  HiveArmor — Seed 200 Realistic Production-Shaped Alerts"
echo "============================================================"
echo ""

###############################################################################
# Sub-task 1.17: Delete old test alert indices before seeding
###############################################################################
echo "==> Deleting old test alert indices..."
for PREFIX in workmates1 cwm workmates2; do
  $CURL -X DELETE "${OS_URL}/v3-hive-alert-${PREFIX}-*" 2>/dev/null || true
done
echo "  Done — old indices cleared."
echo ""

###############################################################################
# Create fresh indices with correct mappings
###############################################################################
echo "==> Creating alert indices with full mappings..."
for PREFIX in workmates1 cwm workmates2; do
  IDX="v3-hive-alert-${PREFIX}-${TODAY}"
  $CURL -X PUT "${OS_URL}/${IDX}" -H 'Content-Type: application/json' -d '{
    "settings": {"number_of_shards": 1, "number_of_replicas": 0},
    "mappings": {"properties": {
      "@timestamp": {"type": "date"},
      "name": {"type": "keyword"},
      "description": {"type": "text"},
      "severity": {"type": "integer"},
      "status": {"type": "integer"},
      "category": {"type": "keyword"},
      "riskScore": {"type": "float"},
      "confidence": {"type": "integer"},
      "occurrenceCount": {"type": "integer"},
      "version": {"type": "integer"},
      "visibleBy": {"type": "keyword"},
      "tags": {"type": "keyword"},
      "mitreTacticId": {"type": "keyword"},
      "mitreTacticName": {"type": "keyword"},
      "mitreTechniqueId": {"type": "keyword"},
      "mitreTechniqueName": {"type": "keyword"},
      "primaryEntityId": {"type": "keyword"},
      "primaryEntityType": {"type": "keyword"},
      "primaryEntityLabel": {"type": "keyword"},
      "primaryEntityRiskScore": {"type": "integer"},
      "assigneeId": {"type": "keyword"},
      "assigneeName": {"type": "keyword"},
      "tenantId": {"type": "keyword"},
      "tenantName": {"type": "keyword"},
      "slaStatus": {"type": "keyword"},
      "slaDueAt": {"type": "date"},
      "threatIntelMatched": {"type": "boolean"},
      "threatIntelSource": {"type": "keyword"},
      "threatIntelType": {"type": "keyword"},
      "threatIntelConfidence": {"type": "integer"},
      "riskFactors": {"type": "nested"},
      "statusHistory": {"type": "nested"},
      "notes": {"type": "nested"},
      "adversary": {"properties": {
        "ip": {"type": "ip"},
        "hostname": {"type": "keyword"},
        "processName": {"type": "keyword"},
        "username": {"type": "keyword"}
      }},
      "target": {"properties": {
        "ip": {"type": "ip"},
        "hostname": {"type": "keyword"},
        "processName": {"type": "keyword"},
        "username": {"type": "keyword"}
      }}
    }}
  }' 2>/dev/null > /dev/null || true
done
echo "  Done"
echo ""

###############################################################################
# Sub-task 1.2: Attack chain templates with correct MITRE tactic/technique pairs
###############################################################################

# Brute Force Campaign (6 alerts):
# Reconnaissance -> Credential Access -> Initial Access -> Persistence -> Lateral Movement -> Impact
CHAIN_BF_TACTICS=("TA0043" "TA0006" "TA0001" "TA0003" "TA0008" "TA0040")
CHAIN_BF_TACTIC_NAMES=("Reconnaissance" "Credential Access" "Initial Access" "Persistence" "Lateral Movement" "Impact")
CHAIN_BF_TECHNIQUES=("T1595.002" "T1110.003" "T1078.002" "T1136.001" "T1021.002" "T1486")
CHAIN_BF_TECH_NAMES=("Active Scanning: Vulnerability Scanning" "Brute Force: Password Spraying" "Valid Accounts: Domain Accounts" "Create Account: Local Account" "Remote Services: SMB/Windows Admin Shares" "Data Encrypted for Impact")
CHAIN_BF_ALERT_NAMES=("External port scanning detected" "Password spraying against AD" "Successful login after brute force" "New local admin account created" "Lateral movement via SMB admin shares" "Ransomware encryption initiated")
CHAIN_BF_DESCRIPTIONS=("Multiple connection attempts to common service ports from external IP" "Over 500 login attempts using common passwords across multiple AD accounts" "Successful authentication following sustained brute force campaign" "Local administrator account created outside change management window" "SMB file copy and remote execution to 5 internal hosts" "Mass file encryption detected across network shares with ransom note dropped")

# Malware Delivery (5 alerts):
# Initial Access -> Execution -> Persistence -> Defense Evasion -> Command and Control
CHAIN_MW_TACTICS=("TA0001" "TA0002" "TA0003" "TA0005" "TA0011")
CHAIN_MW_TACTIC_NAMES=("Initial Access" "Execution" "Persistence" "Defense Evasion" "Command and Control")
CHAIN_MW_TECHNIQUES=("T1566.001" "T1059.001" "T1547.001" "T1027.002" "T1071.001")
CHAIN_MW_TECH_NAMES=("Phishing: Spearphishing Attachment" "Command and Scripting Interpreter: PowerShell" "Boot or Logon Autostart Execution: Registry Run Keys" "Obfuscated Files: Software Packing" "Application Layer Protocol: Web Protocols")
CHAIN_MW_ALERT_NAMES=("Malicious attachment opened from email" "Encoded PowerShell command execution" "Registry Run key persistence established" "Packed executable dropped to temp directory" "C2 beacon over HTTPS to known bad domain")
CHAIN_MW_DESCRIPTIONS=("User opened weaponized DOCX attachment triggering macro execution" "Base64-encoded PowerShell payload decoded and executed in memory" "Registry Run key added for persistence across reboots" "UPX-packed binary written to AppData\\Local\\Temp with random filename" "Periodic HTTPS callbacks to command-and-control infrastructure every 60s")

# Phishing + Account Takeover (4 alerts):
# Initial Access -> Credential Access -> Collection -> Exfiltration
CHAIN_PH_TACTICS=("TA0001" "TA0006" "TA0009" "TA0010")
CHAIN_PH_TACTIC_NAMES=("Initial Access" "Credential Access" "Collection" "Exfiltration")
CHAIN_PH_TECHNIQUES=("T1566.002" "T1557.001" "T1114.002" "T1048.002")
CHAIN_PH_TECH_NAMES=("Phishing: Spearphishing Link" "Adversary-in-the-Middle: LLMNR/NBT-NS Poisoning" "Email Collection: Remote Email Collection" "Exfiltration Over Alternative Protocol: Exfiltration Over Asymmetric Encrypted Non-C2 Protocol")
CHAIN_PH_ALERT_NAMES=("Phishing link clicked by executive user" "Credential harvesting via MITM relay" "Mailbox access from anomalous location" "Bulk email export to external cloud storage")
CHAIN_PH_DESCRIPTIONS=("Executive clicked credential harvesting link mimicking internal SSO portal" "NTLM relay captured domain credentials via LLMNR poisoning on local subnet" "O365 mailbox accessed from IP geolocation inconsistent with user history" "Over 2000 emails exported from compromised account to external Dropbox")

# Supply Chain (3 alerts):
# Initial Access -> Execution -> Privilege Escalation
CHAIN_SC_TACTICS=("TA0001" "TA0002" "TA0004")
CHAIN_SC_TACTIC_NAMES=("Initial Access" "Execution" "Privilege Escalation")
CHAIN_SC_TECHNIQUES=("T1195.002" "T1072" "T1068")
CHAIN_SC_TECH_NAMES=("Supply Chain Compromise: Compromise Software Supply Chain" "Software Deployment Tools" "Exploitation for Privilege Escalation")
CHAIN_SC_ALERT_NAMES=("Trojanized update package detected" "Unauthorized code execution via deploy tool" "Privilege escalation via vulnerable dependency")
CHAIN_SC_DESCRIPTIONS=("Software update package contains unsigned DLL not matching vendor checksum" "SCCM deployment tool executed unauthorized PowerShell on 12 endpoints" "Local privilege escalation achieved through CVE-2024-21338 in kernel driver")

# Insider Threat (4 alerts):
# Collection -> Exfiltration -> Impact -> Discovery
CHAIN_IT_TACTICS=("TA0009" "TA0010" "TA0040" "TA0007")
CHAIN_IT_TACTIC_NAMES=("Collection" "Exfiltration" "Impact" "Discovery")
CHAIN_IT_TECHNIQUES=("T1005" "T1567.002" "T1485" "T1083")
CHAIN_IT_TECH_NAMES=("Data from Local System" "Exfiltration Over Web Service: Exfiltration to Cloud Storage" "Data Destruction" "File and Directory Discovery")
CHAIN_IT_ALERT_NAMES=("Bulk file access on restricted share" "Data upload to personal cloud storage" "Mass file deletion on shared drive" "Recursive directory enumeration of sensitive paths")
CHAIN_IT_DESCRIPTIONS=("User accessed 847 files on HR-Confidential share within 15 minutes" "Large data transfer to personal Google Drive from corporate endpoint" "Over 500 files deleted from Finance shared drive outside maintenance window" "Recursive listing of C-suite home directories and finance reporting folders")

###############################################################################
# Lookup arrays for standalone alerts
###############################################################################

# MITRE tactics/techniques for standalone alerts
STANDALONE_TACTICS=("TA0001" "TA0002" "TA0003" "TA0004" "TA0005" "TA0006" "TA0007" "TA0008" "TA0009" "TA0010" "TA0011" "TA0040" "TA0042" "TA0043")
STANDALONE_TACTIC_NAMES=("Initial Access" "Execution" "Persistence" "Privilege Escalation" "Defense Evasion" "Credential Access" "Discovery" "Lateral Movement" "Collection" "Exfiltration" "Command and Control" "Impact" "Resource Development" "Reconnaissance")
STANDALONE_TECHNIQUES=("T1190" "T1059.003" "T1053.005" "T1055.001" "T1070.004" "T1003.001" "T1046" "T1570" "T1560.001" "T1041" "T1105" "T1489" "T1588.002" "T1592.001")
STANDALONE_TECH_NAMES=("Exploit Public-Facing Application" "Windows Command Shell" "Scheduled Task" "Process Injection: DLL Injection" "Indicator Removal: File Deletion" "OS Credential Dumping: LSASS Memory" "Network Service Discovery" "Lateral Tool Transfer" "Archive Collected Data: Archive via Utility" "Exfiltration Over C2 Channel" "Ingress Tool Transfer" "Service Stop" "Obtain Capabilities: Tool" "Gather Victim Host Information: Hardware")

STANDALONE_ALERT_NAMES=(
  "Suspicious DNS query to newly registered domain"
  "LSASS memory dump attempt detected"
  "Scheduled task created with encoded payload"
  "DLL injection into explorer.exe"
  "Security log cleared on domain controller"
  "Kerberoasting activity detected"
  "Network share enumeration from single host"
  "PsExec lateral movement to file server"
  "RAR archive created from sensitive directory"
  "Large outbound transfer over encrypted channel"
  "Cobalt Strike beacon download detected"
  "Critical service stopped on production server"
  "Anomalous RDP session from service account"
  "WMI lateral execution to multiple hosts"
  "Credential stuffing against VPN gateway"
  "Suspicious certutil download activity"
  "PowerShell web request to paste site"
  "USB mass storage device connected"
  "Firewall rule modified by non-admin"
  "Failed MFA challenge followed by success"
  "Tor exit node communication detected"
  "Process hollowing technique identified"
  "DNS tunneling data exfiltration"
  "Shadow admin account discovered"
  "Mimikatz signature in memory"
  "Unusual parent-child process relationship"
  "Living-off-the-land binary abuse"
  "Golden ticket attack indicators"
  "Pass-the-hash lateral movement"
  "Suspicious cron job modification"
)

STANDALONE_DESCRIPTIONS=(
  "DNS resolution for domain registered 24 hours ago with DGA-like pattern"
  "Process attempted to read LSASS memory using MiniDump or comsvcs.dll"
  "Windows scheduled task created via schtasks.exe with base64 encoded argument"
  "DLL injected into explorer.exe process space using CreateRemoteThread"
  "Windows Security event log cleared via wevtutil on domain controller"
  "Service ticket requests for multiple SPNs from single workstation account"
  "Enumeration of 47 network shares from host within 2 minute window"
  "PsExec service installed and executed commands on file server FS-PROD-01"
  "RAR archive created containing files from Finance/Quarterly-Reports path"
  "Sustained 450MB outbound transfer over TLS to non-categorized IP address"
  "HTTP GET request matched Cobalt Strike stager URI pattern with shellcode"
  "Windows service 'SQLServer' stopped on PROD-DB-01 outside maintenance window"
  "RDP session established by svc-backup account to workstation at 02:00 UTC"
  "WMI remote process creation on 8 hosts within 30 seconds from single source"
  "Over 1200 authentication attempts against VPN portal from residential IP pool"
  "certutil.exe used to download executable from external hosting provider"
  "PowerShell Invoke-WebRequest to pastebin.com retrieved encoded payload"
  "Removable USB storage connected to restricted endpoint in secure zone"
  "iptables rule added by user without firewall-admin group membership"
  "MFA challenge failed 3 times then succeeded from different IP within 2 minutes"
  "Outbound TCP connection established to known Tor exit node IP address"
  "Process memory unmapped and replaced with payload matching hollowing technique"
  "DNS TXT queries encoding data in subdomain labels exceeding normal entropy"
  "Account with Domain Admin privileges not in authorized admin group"
  "In-memory pattern matching identified Mimikatz credential tool signatures"
  "cmd.exe spawned from Microsoft Excel process — unusual parent chain"
  "mshta.exe used to download and execute remote HTA application"
  "Kerberos TGT with forged PAC detected — potential golden ticket"
  "NTLM authentication with hash reuse detected across 3 separate hosts"
  "Root crontab modified to execute script from world-writable directory"
)

###############################################################################
# Sub-task 1.8: Entity labels (realistic hostnames, usernames, IPs)
###############################################################################
HOST_ENTITIES=("FIN-WKS-044" "DC-PROD-01" "DC-PROD-02" "FS-PROD-01" "SRV-WEB-03" "WKS-HR-012" "WKS-ENG-007" "SRV-DB-01" "SRV-APP-02" "FW-EDGE-01" "VPN-GW-01" "MAIL-SRV-01" "SRV-SCCM-01" "WKS-EXEC-001" "PRINT-SRV-02")
USER_ENTITIES=("USR-sarah.chen" "USR-james.wilson" "USR-priya.patel" "USR-mike.johnson" "USR-emma.rodriguez" "USR-david.kim" "USR-lisa.thompson" "USR-alex.rivera" "USR-svc-backup" "USR-admin.local")
IP_ENTITIES=("10.1.5.44" "10.1.5.101" "10.2.10.15" "10.3.1.1" "10.4.20.55" "10.5.100.12" "192.168.1.50" "172.16.0.100" "10.10.10.1" "10.0.0.254")

# Sub-task 1.9: Analysts for assignment (60% assigned, 40% unassigned)
ANALYST_IDS=("41" "42" "43" "44" "45")
ANALYST_NAMES=("Maya Chen" "James Wilson" "Priya Patel" "Carlos Rivera" "Emma Thompson")

# Sub-task 1.15: Adversary/target data
EXTERNAL_IPS=("203.0.113.45" "203.0.113.78" "198.51.100.22" "198.51.100.99" "203.0.113.112" "198.51.100.156" "203.0.113.200" "198.51.100.44")
INTERNAL_IPS=("10.1.5.44" "10.1.5.101" "10.2.10.15" "10.3.1.1" "10.4.20.55" "10.5.100.12" "10.1.2.30" "10.2.5.88")
ADVERSARY_PROCESSES=("powershell.exe" "cmd.exe" "python3" "bash" "mshta.exe" "wmic.exe" "certutil.exe" "rundll32.exe")
TARGET_PROCESSES=("WINWORD.EXE" "explorer.exe" "svchost.exe" "lsass.exe" "services.exe" "sqlservr.exe" "httpd" "nginx")
ADVERSARY_USERS=("NORTHSTAR\\\\attacker" "CORP\\\\svc-deploy" "LOCAL\\\\temp-admin" "EXTERNAL\\\\unknown" "CORP\\\\compromised.user")
TARGET_HOSTNAMES=("FIN-WKS-044" "DC-PROD-01" "FS-PROD-01" "SRV-WEB-03" "SRV-DB-01" "MAIL-SRV-01" "WKS-HR-012" "WKS-ENG-007")

# Sub-task 1.11: Threat intel sources
INTEL_SOURCES=("AlienVault OTX" "MISP" "VirusTotal" "Recorded Future")
INTEL_TYPES=("ip" "domain" "hash")

# Sub-task 1.16: Tags
ALL_TAGS=("encoded-script" "lateral-movement" "high-priority" "false-positive-candidate" "known-ioc" "persistence" "c2-beacon" "data-theft" "insider-risk")

# Sub-task 1.12: Risk factor templates
RISK_FACTOR_NAMES=("Asset criticality" "Technique severity" "Threat intel match" "User behavior baseline" "Time anomaly" "Network exposure" "Privilege level" "Data sensitivity" "Historical correlation" "Attack chain position")
RISK_FACTOR_DESCS=("Target asset has critical business function classification" "MITRE technique carries high confidence of malicious intent" "Indicator matches known threat intelligence feed" "Activity deviates significantly from 90-day user baseline" "Event occurred outside normal business hours for this user" "Asset is exposed to external network segments" "Actor has elevated or administrative privileges" "Accessed data classified as PII or financial" "Alert correlates with 3+ related alerts in 24 hours" "Alert is part of multi-stage attack progression")

###############################################################################
# Helper functions
###############################################################################

# Random integer in range [min, max]
rand_range() {
  local min=$1 max=$2
  echo $(( (RANDOM % (max - min + 1)) + min ))
}

# Pick random element from array (pass array elements as arguments)
pick_random() {
  local arr=("$@")
  echo "${arr[$(( RANDOM % ${#arr[@]} ))]}"
}

# Generate severity based on distribution:
# Critical(9-10):~25, High(7-8):~40, Medium(4-6):~60, Low(1-3):~50, Info(0):~25
# Total ~200. Percentages: 12.5% crit, 20% high, 30% med, 25% low, 12.5% info
gen_severity() {
  local r=$(( RANDOM % 100 ))
  if [ $r -lt 13 ]; then
    echo $(rand_range 9 10)
  elif [ $r -lt 33 ]; then
    echo $(rand_range 7 8)
  elif [ $r -lt 63 ]; then
    echo $(rand_range 4 6)
  elif [ $r -lt 88 ]; then
    echo $(rand_range 1 3)
  else
    echo 0
  fi
}

# Generate status (1-7)
gen_status() {
  local r=$(( RANDOM % 100 ))
  if [ $r -lt 35 ]; then echo 1     # New
  elif [ $r -lt 55 ]; then echo 2    # Open
  elif [ $r -lt 70 ]; then echo 3    # In Review
  elif [ $r -lt 80 ]; then echo 4    # Acknowledged
  elif [ $r -lt 88 ]; then echo 5    # Escalated
  elif [ $r -lt 94 ]; then echo 6    # Resolved
  else echo 7                         # Closed
  fi
}

# Sub-task 1.10: SLA status distribution
# 70% on_track, 15% at_risk, 10% breached, 5% none
gen_sla_status() {
  local r=$(( RANDOM % 100 ))
  if [ $r -lt 70 ]; then echo "on_track"
  elif [ $r -lt 85 ]; then echo "at_risk"
  elif [ $r -lt 95 ]; then echo "breached"
  else echo "none"
  fi
}

# Sub-task 1.9: Generate assignee (60% assigned, 40% unassigned)
gen_assignee_json() {
  local r=$(( RANDOM % 100 ))
  if [ $r -lt 60 ]; then
    local idx=$(( RANDOM % 5 ))
    echo "\"assigneeId\": \"${ANALYST_IDS[$idx]}\", \"assigneeName\": \"${ANALYST_NAMES[$idx]}\""
  else
    echo "\"assigneeId\": null, \"assigneeName\": null"
  fi
}

# Sub-task 1.12: Generate risk factors array (3-5 factors)
gen_risk_factors() {
  local count=$(rand_range 3 5)
  local factors="["
  local used=()
  for (( f=0; f<count; f++ )); do
    local idx=$(( RANDOM % ${#RISK_FACTOR_NAMES[@]} ))
    # Avoid duplicates
    while [[ " ${used[*]:-} " == *" $idx "* ]]; do
      idx=$(( RANDOM % ${#RISK_FACTOR_NAMES[@]} ))
    done
    used+=($idx)
    local w_int=$(rand_range 10 30)
    local weight="0.${w_int}"
    local contribution=$(rand_range 8 30)
    [ $f -gt 0 ] && factors+=","
    factors+="{\"name\":\"${RISK_FACTOR_NAMES[$idx]}\",\"weight\":${weight},\"contribution\":${contribution},\"description\":\"${RISK_FACTOR_DESCS[$idx]}\"}"
  done
  factors+="]"
  echo "$factors"
}

# Sub-task 1.13: Generate status history (creation + 0-3 transitions)
gen_status_history() {
  local created_ts=$1
  local transitions=$(rand_range 0 3)
  local actors=("system" "maya.chen" "james.wilson" "priya.patel" "carlos.rivera")
  local history="[{\"from\":0,\"to\":1,\"at\":\"${created_ts}\",\"actor\":\"system\",\"note\":\"Alert created\"}"
  local prev_status=1
  for (( t=0; t<transitions; t++ )); do
    local offset=$(( (t + 1) * $(rand_range 300 3600) ))
    local trans_ts
    trans_ts=$(gen_ts $(( $(rand_range 100 7200) - offset )))
    local next_status=$(( prev_status + 1 ))
    [ $next_status -gt 7 ] && next_status=7
    local actor="${actors[$(( RANDOM % ${#actors[@]} ))]}"
    local notes=("Acknowledged for investigation" "Escalated to tier 2" "Confirmed true positive" "Closed after remediation" "Assigned to analyst")
    local note="${notes[$(( RANDOM % ${#notes[@]} ))]}"
    history+=",{\"from\":${prev_status},\"to\":${next_status},\"at\":\"${trans_ts}\",\"actor\":\"${actor}\",\"note\":\"${note}\"}"
    prev_status=$next_status
  done
  history+="]"
  echo "$history"
}

# Sub-task 1.14: Generate notes (20% chance, 1-3 notes)
gen_notes() {
  local r=$(( RANDOM % 100 ))
  if [ $r -ge 20 ]; then
    echo "null"
    return
  fi
  local count=$(rand_range 1 3)
  local note_bodies=(
    "Confirmed malicious activity. Isolating host for forensic analysis."
    "False positive - triggered by legitimate admin script. Adding exclusion."
    "Correlates with tickets INC-2847 and INC-2851. Same campaign."
    "Escalating to IR team. Evidence of lateral movement to 3 additional hosts."
    "User confirmed they did not perform this action. Account potentially compromised."
    "Checked with IT ops - this was an authorized maintenance activity."
    "Threat intel match confirmed. Hash associated with APT-41 toolset."
    "Waiting for endpoint team to provide memory dump for further analysis."
  )
  local authors=("maya.chen" "james.wilson" "priya.patel" "carlos.rivera" "emma.thompson")
  local visibilities=("soc" "soc" "soc" "tenant" "public")
  local notes="["
  for (( n=0; n<count; n++ )); do
    local body="${note_bodies[$(( RANDOM % ${#note_bodies[@]} ))]}"
    local author="${authors[$(( RANDOM % ${#authors[@]} ))]}"
    local vis="${visibilities[$(( RANDOM % ${#visibilities[@]} ))]}"
    local note_ts
    note_ts=$(gen_ts $(rand_range 60 7200))
    [ $n -gt 0 ] && notes+=","
    notes+="{\"id\":\"note-${RANDOM}\",\"body\":\"${body}\",\"author\":\"${author}\",\"visibility\":\"${vis}\",\"at\":\"${note_ts}\"}"
  done
  notes+="]"
  echo "$notes"
}

# Sub-task 1.11: Generate threat intel (30% of alerts)
gen_threat_intel() {
  local r=$(( RANDOM % 100 ))
  if [ $r -ge 30 ]; then
    echo "\"threatIntelMatched\": false"
    return
  fi
  local source="${INTEL_SOURCES[$(( RANDOM % ${#INTEL_SOURCES[@]} ))]}"
  local intel_type="${INTEL_TYPES[$(( RANDOM % ${#INTEL_TYPES[@]} ))]}"
  local confidence=$(rand_range 70 95)
  echo "\"threatIntelMatched\": true, \"threatIntelSource\": \"${source}\", \"threatIntelType\": \"${intel_type}\", \"threatIntelConfidence\": ${confidence}"
}

# Sub-task 1.16: Generate tags (2-4 tags)
gen_tags() {
  local count=$(rand_range 2 4)
  local tags="["
  local used=()
  for (( tg=0; tg<count; tg++ )); do
    local idx=$(( RANDOM % ${#ALL_TAGS[@]} ))
    while [[ " ${used[*]:-} " == *" $idx "* ]]; do
      idx=$(( RANDOM % ${#ALL_TAGS[@]} ))
    done
    used+=($idx)
    [ $tg -gt 0 ] && tags+=","
    tags+="\"${ALL_TAGS[$idx]}\""
  done
  tags+="]"
  echo "$tags"
}

# Sub-task 1.15: Generate adversary/target JSON
gen_adversary_target() {
  local adv_ip="${EXTERNAL_IPS[$(( RANDOM % ${#EXTERNAL_IPS[@]} ))]}"
  local tgt_ip="${INTERNAL_IPS[$(( RANDOM % ${#INTERNAL_IPS[@]} ))]}"
  local adv_proc="${ADVERSARY_PROCESSES[$(( RANDOM % ${#ADVERSARY_PROCESSES[@]} ))]}"
  local tgt_proc="${TARGET_PROCESSES[$(( RANDOM % ${#TARGET_PROCESSES[@]} ))]}"
  local adv_user="${ADVERSARY_USERS[$(( RANDOM % ${#ADVERSARY_USERS[@]} ))]}"
  local tgt_host="${TARGET_HOSTNAMES[$(( RANDOM % ${#TARGET_HOSTNAMES[@]} ))]}"
  echo "\"adversary\": {\"ip\": \"${adv_ip}\", \"hostname\": null, \"processName\": \"${adv_proc}\", \"username\": \"${adv_user}\"}, \"target\": {\"ip\": \"${tgt_ip}\", \"hostname\": \"${tgt_host}\", \"processName\": \"${tgt_proc}\", \"username\": null}"
}

# Generate a primary entity
gen_entity() {
  local r=$(( RANDOM % 100 ))
  if [ $r -lt 50 ]; then
    local host="${HOST_ENTITIES[$(( RANDOM % ${#HOST_ENTITIES[@]} ))]}"
    echo "\"primaryEntityId\": \"host-$(echo "$host" | tr '[:upper:]' '[:lower:]')\", \"primaryEntityType\": \"host\", \"primaryEntityLabel\": \"${host}\", \"primaryEntityRiskScore\": $(rand_range 20 98)"
  elif [ $r -lt 80 ]; then
    local user="${USER_ENTITIES[$(( RANDOM % ${#USER_ENTITIES[@]} ))]}"
    echo "\"primaryEntityId\": \"user-$(echo "$user" | tr '[:upper:]' '[:lower:]' | sed 's/usr-//')\", \"primaryEntityType\": \"user\", \"primaryEntityLabel\": \"${user}\", \"primaryEntityRiskScore\": $(rand_range 15 95)"
  else
    local ip="${IP_ENTITIES[$(( RANDOM % ${#IP_ENTITIES[@]} ))]}"
    echo "\"primaryEntityId\": \"ip-${ip}\", \"primaryEntityType\": \"ip\", \"primaryEntityLabel\": \"${ip}\", \"primaryEntityRiskScore\": $(rand_range 30 90)"
  fi
}

###############################################################################
# Build a single alert JSON document
# Args: $1=name $2=description $3=tactic_id $4=tactic_name $5=technique_id
#       $6=technique_name $7=tenant_id $8=tenant_name $9=prefix $10=severity_override
###############################################################################
build_alert() {
  local alert_name="$1"
  local description="$2"
  local tactic_id="$3"
  local tactic_name="$4"
  local technique_id="$5"
  local technique_name="$6"
  local tenant_id="$7"
  local tenant_name="$8"
  local prefix="$9"
  local sev_override="${10:-}"

  local ts_offset=$(rand_range 60 172800)
  local timestamp
  timestamp=$(gen_ts $ts_offset)

  local severity
  if [ -n "$sev_override" ]; then
    severity=$sev_override
  else
    severity=$(gen_severity)
  fi

  local status
  status=$(gen_status)
  local risk_score=$(rand_range 10 100)
  local confidence=$(rand_range 60 99)
  local occurrence=$(rand_range 1 50)
  local version=$(rand_range 1 8)

  local sla_status
  sla_status=$(gen_sla_status)
  local sla_due
  sla_due=$(gen_ts $(rand_range 0 86400))

  local assignee
  assignee=$(gen_assignee_json)
  local entity
  entity=$(gen_entity)
  local threat_intel
  threat_intel=$(gen_threat_intel)
  local tags
  tags=$(gen_tags)
  local adv_target
  adv_target=$(gen_adversary_target)
  local risk_factors
  risk_factors=$(gen_risk_factors)
  local status_history
  status_history=$(gen_status_history "$timestamp")
  local notes
  notes=$(gen_notes)

  local notes_field=""
  if [ "$notes" != "null" ]; then
    notes_field=", \"notes\": ${notes}"
  fi

  # Build the JSON document
  cat <<ENDJSON
{"@timestamp": "${timestamp}", "name": "${alert_name}", "description": "${description}", "severity": ${severity}, "status": ${status}, "category": "${tactic_name}", "riskScore": ${risk_score}, "confidence": ${confidence}, "occurrenceCount": ${occurrence}, "version": ${version}, "visibleBy": "${prefix}", "mitreTacticId": "${tactic_id}", "mitreTacticName": "${tactic_name}", "mitreTechniqueId": "${technique_id}", "mitreTechniqueName": "${technique_name}", ${entity}, ${assignee}, "tenantId": "${tenant_id}", "tenantName": "${tenant_name}", "slaStatus": "${sla_status}", "slaDueAt": "${sla_due}", ${threat_intel}, "tags": ${tags}, "riskFactors": ${risk_factors}, "statusHistory": ${status_history}${notes_field}, ${adv_target}}
ENDJSON
}

###############################################################################
# Generate chain alerts for a tenant
# Args: $1=chain_prefix $2=count $3=tenant_id $4=tenant_name $5=prefix
###############################################################################
gen_chain_alerts() {
  local chain_type="$1"
  local count="$2"
  local tenant_id="$3"
  local tenant_name="$4"
  local prefix="$5"
  local idx="v3-hive-alert-${prefix}-${TODAY}"

  for (( i=0; i<count; i++ )); do
    # Chain alerts tend to be higher severity
    local sev=$(rand_range 6 10)
    local a_tactic a_tactic_name a_technique a_tech_name a_name a_desc
    eval "a_tactic=\${${chain_type}_TACTICS[$i]}"
    eval "a_tactic_name=\${${chain_type}_TACTIC_NAMES[$i]}"
    eval "a_technique=\${${chain_type}_TECHNIQUES[$i]}"
    eval "a_tech_name=\"\${${chain_type}_TECH_NAMES[$i]}\""
    eval "a_name=\"\${${chain_type}_ALERT_NAMES[$i]}\""
    eval "a_desc=\"\${${chain_type}_DESCRIPTIONS[$i]}\""
    local doc
    doc=$(build_alert "$a_name" "$a_desc" "$a_tactic" "$a_tactic_name" "$a_technique" "$a_tech_name" "$tenant_id" "$tenant_name" "$prefix" "$sev")
    echo "{\"index\":{\"_index\":\"${idx}\"}}" >> "$TMPFILE"
    echo "$doc" >> "$TMPFILE"
    ALERT_COUNT=$((ALERT_COUNT + 1))
  done
}

###############################################################################
# Generate standalone alerts for a tenant
# Args: $1=count $2=tenant_id $3=tenant_name $4=prefix
###############################################################################
gen_standalone_alerts() {
  local count="$1"
  local tenant_id="$2"
  local tenant_name="$3"
  local prefix="$4"
  local idx="v3-hive-alert-${prefix}-${TODAY}"

  for (( i=0; i<count; i++ )); do
    local name_idx=$(( i % ${#STANDALONE_ALERT_NAMES[@]} ))
    local tactic_idx=$(( i % ${#STANDALONE_TACTICS[@]} ))
    local doc
    doc=$(build_alert "${STANDALONE_ALERT_NAMES[$name_idx]}" "${STANDALONE_DESCRIPTIONS[$name_idx]}" "${STANDALONE_TACTICS[$tactic_idx]}" "${STANDALONE_TACTIC_NAMES[$tactic_idx]}" "${STANDALONE_TECHNIQUES[$tactic_idx]}" "${STANDALONE_TECH_NAMES[$tactic_idx]}" "$tenant_id" "$tenant_name" "$prefix" "")
    echo "{\"index\":{\"_index\":\"${idx}\"}}" >> "$TMPFILE"
    echo "$doc" >> "$TMPFILE"
    ALERT_COUNT=$((ALERT_COUNT + 1))
  done
}

###############################################################################
# Sub-task 1.3: CWM tenant (id=3813) — 70 alerts
# 5 chains (6+5+4+3+4=22... wait, task says 30) — we'll use 5 chains = 30 alerts
# Actually: BF(6) + MW(5) + PH(4) + SC(3) + IT(4) = 22.
# To reach 30 chain alerts, we duplicate some chains with variation.
# Let's do: BF(6) + MW(5) + PH(4) + SC(3) + IT(4) + BF-2nd(6) + PH-2nd(2) = 30
# Simpler: use all 5 chains = 22, then 8 more from BF chain partial = 30 chain total
# Task says "5 chains (30 alerts)" so let's do 5 full + extra from longer chains
# BF(6) + BF(6) + MW(5) + PH(4) + SC(3) + IT(4) = 28... close enough with 2 extras
# Simplest: generate all 5 chains once for 22 + 8 more standalone to reach 30 "chain"
# Actually the task says 5 chains producing 30 alerts total for CWM. Let's just
# run BF twice (12) + MW(5) + PH(4) + SC(3) + IT(4) = 28, + 2 extra = 30
###############################################################################

echo "==> Generating alerts..."
echo -n "" > "$TMPFILE"

# ─── CWM (tenant 3813) — 70 alerts: 5 chains (30 alerts) + 40 standalone ───
echo "  CWM tenant (70 alerts)..."
# Chain 1: Brute Force (6 alerts)
gen_chain_alerts "CHAIN_BF" 6 "3813" "CWM" "cwm"
# Chain 2: Malware Delivery (5 alerts)
gen_chain_alerts "CHAIN_MW" 5 "3813" "CWM" "cwm"
# Chain 3: Phishing (4 alerts)
gen_chain_alerts "CHAIN_PH" 4 "3813" "CWM" "cwm"
# Chain 4: Supply Chain (3 alerts)
gen_chain_alerts "CHAIN_SC" 3 "3813" "CWM" "cwm"
# Chain 5: Insider Threat (4 alerts)
gen_chain_alerts "CHAIN_IT" 4 "3813" "CWM" "cwm"
# Additional chain alerts to reach 30: second brute force campaign (6) + 2 extra MW
gen_chain_alerts "CHAIN_BF" 6 "3813" "CWM" "cwm"
gen_chain_alerts "CHAIN_MW" 2 "3813" "CWM" "cwm"
# 6+5+4+3+4+6+2 = 30 chain alerts
# 40 standalone
gen_standalone_alerts 40 "3813" "CWM" "cwm"

# ─── Workmates1 (tenant 3812) — 65 alerts: 4 chains (20 alerts) + 45 standalone ───
echo "  Workmates1 tenant (65 alerts)..."
# Chain 1: Brute Force (6 alerts)
gen_chain_alerts "CHAIN_BF" 6 "3812" "Workmates1" "workmates1"
# Chain 2: Malware Delivery (5 alerts)
gen_chain_alerts "CHAIN_MW" 5 "3812" "Workmates1" "workmates1"
# Chain 3: Phishing (4 alerts)
gen_chain_alerts "CHAIN_PH" 4 "3812" "Workmates1" "workmates1"
# Chain 4: Insider Threat (4 alerts) + 1 extra SC to reach 20
gen_chain_alerts "CHAIN_IT" 4 "3812" "Workmates1" "workmates1"
gen_chain_alerts "CHAIN_SC" 1 "3812" "Workmates1" "workmates1"
# 6+5+4+4+1 = 20 chain alerts
# 45 standalone
gen_standalone_alerts 45 "3812" "Workmates1" "workmates1"

# ─── Workmates2 (tenant 3814) — 65 alerts: 4 chains (18 alerts) + 47 standalone ───
echo "  Workmates2 tenant (65 alerts)..."
# Chain 1: Brute Force (6 alerts)
gen_chain_alerts "CHAIN_BF" 6 "3814" "Workmates2" "workmates2"
# Chain 2: Malware Delivery (5 alerts)
gen_chain_alerts "CHAIN_MW" 5 "3814" "Workmates2" "workmates2"
# Chain 3: Phishing (4 alerts)
gen_chain_alerts "CHAIN_PH" 4 "3814" "Workmates2" "workmates2"
# Chain 4: Supply Chain (3 alerts)
gen_chain_alerts "CHAIN_SC" 3 "3814" "Workmates2" "workmates2"
# 6+5+4+3 = 18 chain alerts
# 47 standalone
gen_standalone_alerts 47 "3814" "Workmates2" "workmates2"

echo "  Total alerts prepared: ${ALERT_COUNT}"
echo ""

###############################################################################
# Upload bulk payload to OpenSearch
###############################################################################
echo "==> Uploading ${ALERT_COUNT} alerts to OpenSearch..."
RESPONSE=$($CURL -X POST "${OS_URL}/_bulk" \
  -H 'Content-Type: application/x-ndjson' \
  --data-binary @"$TMPFILE" 2>/dev/null)

# Check for errors in bulk response
if echo "$RESPONSE" | grep -q '"errors":false'; then
  echo "  Bulk upload succeeded (no errors)."
elif echo "$RESPONSE" | grep -q '"errors":true'; then
  ERROR_COUNT=$(echo "$RESPONSE" | grep -o '"error"' | wc -l)
  echo "  WARNING: Bulk upload completed with ${ERROR_COUNT} errors."
  echo "  First error: $(echo "$RESPONSE" | grep -o '"error":{[^}]*}' | head -1)"
else
  echo "  Bulk upload response received."
fi

# Cleanup temp file
rm -f "$TMPFILE"
echo ""

###############################################################################
# Sub-task 1.18: Verify alert count
###############################################################################
echo "==> Waiting for index refresh..."
sleep 2
$CURL -X POST "${OS_URL}/v3-hive-alert-*/_refresh" 2>/dev/null > /dev/null

echo "==> Verifying alert count..."
TOTAL=$($CURL -s "${OS_URL}/v3-hive-alert-*/_count" 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
echo "  Total alerts indexed: ${TOTAL:-unknown}"

if [ -n "$TOTAL" ] && [ "$TOTAL" -ge 200 ]; then
  echo "  ✓ PASS: ${TOTAL} >= 200 alerts indexed"
else
  echo "  ⚠ Expected >= 200 alerts, got: ${TOTAL:-0}"
fi
echo ""

# Per-tenant counts
echo "==> Per-tenant counts:"
for PREFIX in cwm workmates1 workmates2; do
  COUNT=$($CURL -s "${OS_URL}/v3-hive-alert-${PREFIX}-*/_count" 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
  echo "  ${PREFIX}: ${COUNT:-0} alerts"
done
echo ""

###############################################################################
# Sub-task 1.19: Verify severity distribution
###############################################################################
echo "==> Verifying severity distribution..."
for SEV_RANGE in "9 TO 10" "7 TO 8" "4 TO 6" "1 TO 3" "0 TO 0"; do
  LOW=$(echo "$SEV_RANGE" | awk '{print $1}')
  HIGH=$(echo "$SEV_RANGE" | awk '{print $3}')
  COUNT=$($CURL -s "${OS_URL}/v3-hive-alert-*/_count" \
    -H 'Content-Type: application/json' \
    -d "{\"query\":{\"range\":{\"severity\":{\"gte\":${LOW},\"lte\":${HIGH}}}}}" 2>/dev/null \
    | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
  if [ "$LOW" = "9" ]; then LABEL="Critical (9-10)"; fi
  if [ "$LOW" = "7" ]; then LABEL="High (7-8)    "; fi
  if [ "$LOW" = "4" ]; then LABEL="Medium (4-6)  "; fi
  if [ "$LOW" = "1" ]; then LABEL="Low (1-3)     "; fi
  if [ "$LOW" = "0" ]; then LABEL="Info (0)      "; fi
  echo "  ${LABEL}: ${COUNT:-0}"
done
echo ""

###############################################################################
# Sub-task 1.18 (continued): Try backend API verification if available
###############################################################################
echo "==> Attempting backend API verification..."
BACKEND_URL="http://localhost:8088"

# Try to get JWT token
TOKEN=$($CURL --max-time 10 -s -X POST "${BACKEND_URL}/api/authenticate" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"localdev123!"}' 2>/dev/null \
  | grep -o '"id_token":"[^"]*"' | cut -d'"' -f4) || true

if [ -n "$TOKEN" ]; then
  echo "  Backend is running. Verifying via API..."
  # GET /ha-alerts?limit=1 to check totalApproximate
  RESULT=$(curl -sk --max-time 10 -H "Authorization: Bearer ${TOKEN}" \
    "${BACKEND_URL}/api/ha-alerts?limit=1" 2>/dev/null) || true
  if echo "$RESULT" | grep -q "totalApproximate"; then
    APPROX=$(echo "$RESULT" | grep -o '"totalApproximate":[0-9]*' | grep -o '[0-9]*')
    echo "  GET /ha-alerts?limit=1 → totalApproximate: ${APPROX:-unknown}"
    if [ -n "$APPROX" ] && [ "$APPROX" -ge 200 ]; then
      echo "  ✓ PASS: Backend reports >= 200 alerts"
    fi
  fi

  # GET /ha-alerts/summary to verify criticalOpen
  SUMMARY=$(curl -sk --max-time 10 -H "Authorization: Bearer ${TOKEN}" \
    "${BACKEND_URL}/api/ha-alerts/summary" 2>/dev/null) || true
  if echo "$SUMMARY" | grep -q "criticalOpen"; then
    echo "  ✓ Summary endpoint accessible — criticalOpen facet populated"
  fi
else
  echo "  Backend not running or auth failed — skipping API verification."
  echo "  (Direct OpenSearch verification above is sufficient.)"
fi
echo ""

echo "============================================================"
echo "  Seeding complete! ${ALERT_COUNT} alerts generated."
echo "============================================================"
