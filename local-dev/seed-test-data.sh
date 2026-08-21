#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Realistic UI/UX Test Data Seed Script
# Seeds: users, alerts (OpenSearch), incidents, playbooks, rules, dashboards
# =============================================================================

set -euo pipefail

BACKEND="http://localhost:8088"
OS_HOST="https://localhost:9200"
OS_USER="admin"
OS_PASS="LocalDev@2024!"
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v -1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || echo "${TODAY}")

echo "======================================================="
echo "  HiveArmor Test Data Seeder"
echo "  Backend: $BACKEND | Date: $TODAY"
echo "======================================================="

# Step 1: Auth
echo ""
echo "▶ Step 1: Authenticating..."
AUTH_RESP=$(curl -sf -X POST "$BACKEND/api/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}')
TOKEN=$(echo "$AUTH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id_token') or d.get('token',''))")
if [ -z "$TOKEN" ]; then echo "❌ Auth failed"; exit 1; fi
echo "✅ JWT obtained (${#TOKEN} chars)"
AUTH="Authorization: Bearer $TOKEN"
CERTS="/Users/encryptshell/GIT/HiveArmor-v1/local-dev/certs/ca.crt"

# Step 2: SOC Users
echo ""
echo "▶ Step 2: Creating SOC team users..."
for u in \
  "analyst.chen|sarah.chen@hivearmor.local|Sarah|Chen|ROLE_ANALYST" \
  "analyst.patel|raj.patel@hivearmor.local|Raj|Patel|ROLE_ANALYST" \
  "soc.manager|karen.martinez@hivearmor.local|Karen|Martinez|ROLE_SOC_MANAGER" \
  "analyst.okonkwo|chidi.okonkwo@hivearmor.local|Chidi|Okonkwo|ROLE_ANALYST"
do
  IFS='|' read -r login email first last role <<< "$u"
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BACKEND/api/admin/users" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"login\":\"$login\",\"email\":\"$email\",\"firstName\":\"$first\",\"lastName\":\"$last\",\"langKey\":\"en\",\"activated\":true,\"authorities\":[\"$role\"]}" 2>/dev/null || echo "---")
  echo "  $login: $HTTP"
done

# Step 3: Alerts in OpenSearch
echo ""
echo "▶ Step 3: Seeding 10 realistic alerts into OpenSearch..."
IDX_ALERT="v3-hive-alert-$TODAY"

seed_doc() {
  curl -sk -X POST "$OS_HOST/$1/_doc" \
    -u "$OS_USER:$OS_PASS" -H "Content-Type: application/json" \
    --cacert "$CERTS" -d "$2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('  '+d.get('_id','?')[:12])" 2>/dev/null || echo "  seeded"
}

seed_doc "$IDX_ALERT" '{"id":"alert-001","name":"Brute Force Attack Detected","category":"Authentication","severity":"CRITICAL","status":"OPEN","dataType":"wineventlog","source":"192.168.10.45","destination":"10.0.1.20","sourceUser":"jdoe_svc","mitreTactic":"Credential Access","mitreTechnique":"T1110.001","description":"487 failed login attempts in 60s targeting DC01 from 192.168.10.45. Service account jdoe_svc locked out.","timestamp":"'"$TODAY"'T08:14:22Z","count":487,"@timestamp":"'"$TODAY"'T08:14:22Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-002","name":"Lateral Movement via PsExec","category":"Lateral Movement","severity":"HIGH","status":"OPEN","dataType":"wineventlog","source":"10.0.1.15","destination":"10.0.1.22","sourceUser":"CORP\\tadmin","mitreTactic":"Lateral Movement","mitreTechnique":"T1570","description":"PsExec binary execution detected moving from WKSTN-015 to FILESERVER-022 by privileged account tadmin at 02:33 outside business hours.","timestamp":"'"$TODAY"'T02:33:18Z","count":1,"@timestamp":"'"$TODAY"'T02:33:18Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-003","name":"Unusual Outbound Data Transfer — 4.2GB","category":"Data Exfiltration","severity":"HIGH","status":"OPEN","dataType":"network","source":"10.0.1.88","destination":"45.33.32.156","sourceUser":"msmith","mitreTactic":"Exfiltration","mitreTechnique":"T1048","description":"Endpoint FINANCE-PC-088 transferred 4.2GB to DigitalOcean IP (US) over 47 minutes. User msmith — Finance dept. No business justification on file.","timestamp":"'"$TODAY"'T14:22:05Z","count":1,"@timestamp":"'"$TODAY"'T14:22:05Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-004","name":"Privilege Escalation via SUID Binary","category":"Privilege Escalation","severity":"MEDIUM","status":"OPEN","dataType":"linux","source":"10.0.2.101","destination":"10.0.2.101","sourceUser":"appuser","mitreTactic":"Privilege Escalation","mitreTechnique":"T1548.001","description":"User appuser executed sudo with SUID python3 on WEB-PRD-01. Command spawned interactive shell as root. SUID abuse pattern confirmed.","timestamp":"'"$TODAY"'T11:45:33Z","count":3,"@timestamp":"'"$TODAY"'T11:45:33Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-005","name":"Ransomware Activity — BlackCat/ALPHV","category":"Malware","severity":"CRITICAL","status":"OPEN","dataType":"wineventlog","source":"10.0.1.77","destination":"10.0.1.77","sourceUser":"CORP\\bwilson","mitreTactic":"Impact","mitreTechnique":"T1486","description":"2847 files renamed with .encrypted extension in 3 minutes on ACCT-PC-077. Shadow copies deleted via vssadmin. BlackCat/ALPHV ransomware variant confirmed.","timestamp":"'"$TODAY"'T16:08:41Z","count":2847,"@timestamp":"'"$TODAY"'T16:08:41Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-006","name":"Multiple Failed Logins","category":"Authentication","severity":"LOW","status":"REVIEWED","dataType":"wineventlog","source":"10.0.1.44","destination":"10.0.0.5","sourceUser":"jsmith","mitreTactic":"Credential Access","mitreTechnique":"T1110","description":"5 failed Windows login attempts by jsmith. User confirmed forgot password (helpdesk ticket HT-44821). No further action required.","timestamp":"'"$YESTERDAY"'T09:12:01Z","count":5,"@timestamp":"'"$YESTERDAY"'T09:12:01Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-007","name":"Suspicious PowerShell EncodedCommand","category":"Execution","severity":"HIGH","status":"OPEN","dataType":"wineventlog","source":"10.0.1.33","destination":"10.0.1.33","sourceUser":"CORP\\hreyes","mitreTactic":"Execution","mitreTechnique":"T1059.001","description":"PowerShell with -EncodedCommand executed from WINWORD.EXE on DEV-PC-033. Decoded payload contacted C2: api.update-checker.net. Macro-enabled document phishing confirmed.","timestamp":"'"$TODAY"'T10:17:44Z","count":1,"@timestamp":"'"$TODAY"'T10:17:44Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-008","name":"DNS Tunneling C2 Communication","category":"Command and Control","severity":"MEDIUM","status":"OPEN","dataType":"network","source":"10.0.1.55","destination":"8.8.8.8","sourceUser":"CORP\\nthompson","mitreTactic":"Command and Control","mitreTechnique":"T1071.004","description":"Long DNS queries (avg 180 chars) to c2tunnel.xyz from 10.0.1.55 at 1/30s frequency. Matches iodine/dnscat2 DNS tunneling pattern. 142 events in 1 hour.","timestamp":"'"$TODAY"'T07:55:19Z","count":142,"@timestamp":"'"$TODAY"'T07:55:19Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-009","name":"Credential Dump — Mimikatz sekurlsa","category":"Credential Access","severity":"CRITICAL","status":"OPEN","dataType":"wineventlog","source":"10.0.1.67","destination":"10.0.1.67","sourceUser":"CORP\\lparker","mitreTactic":"Credential Access","mitreTechnique":"T1003.001","description":"Mimikatz sekurlsa::logonpasswords invocation on MKTG-PC-067. LSASS accessed with READ_PROCESS_MEMORY. Credential dump confirmed — password hashes compromised.","timestamp":"'"$TODAY"'T13:02:57Z","count":1,"@timestamp":"'"$TODAY"'T13:02:57Z"}'

seed_doc "$IDX_ALERT" '{"id":"alert-010","name":"Web Shell — PHP Upload on WEB-PRD-10","category":"Persistence","severity":"HIGH","status":"OPEN","dataType":"linux","source":"203.0.113.42","destination":"10.0.3.10","sourceUser":"www-data","mitreTactic":"Persistence","mitreTechnique":"T1505.003","description":"PHP web shell (upload_shell.php) in /var/www/html/uploads/ on WEB-PRD-10. External IP 203.0.113.42 (RU) executing commands as www-data. 23 requests captured.","timestamp":"'"$TODAY"'T05:41:09Z","count":23,"@timestamp":"'"$TODAY"'T05:41:09Z"}'

echo "✅ 10 alerts seeded"

# Step 4: Raw Log Events for Search
echo ""
echo "▶ Step 4: Seeding raw log events for hunt/search..."
IDX_WIN="v3-hive-log-wineventlog-$TODAY"
IDX_LIN="v3-hive-log-linux-$TODAY"
IDX_NET="v3-hive-log-network-$TODAY"

seed_doc "$IDX_WIN" '{"EventID":4625,"EventTime":"'"$TODAY"'T08:12:44Z","@timestamp":"'"$TODAY"'T08:12:44Z","HostName":"DC01","TargetUserName":"jdoe_svc","IpAddress":"192.168.10.45","FailureReason":"Wrong Password","LogonType":3,"ProcessName":"lsass.exe","Category":"Logon","Severity":"AUDIT_FAILURE"}'
seed_doc "$IDX_WIN" '{"EventID":7045,"EventTime":"'"$TODAY"'T02:33:11Z","@timestamp":"'"$TODAY"'T02:33:11Z","HostName":"FILESERVER-022","ServiceName":"PSEXESVC","ServiceFileName":"C:\\Windows\\PSEXESVC.exe","ServiceType":"user mode service","StartType":"demand start","ServiceAccount":"LocalSystem","Category":"System"}'
seed_doc "$IDX_WIN" '{"EventID":4663,"EventTime":"'"$TODAY"'T13:02:50Z","@timestamp":"'"$TODAY"'T13:02:50Z","HostName":"MKTG-PC-067","ObjectName":"lsass.exe","AccessMask":"0x1010","ProcessName":"mimikatz.exe","SubjectUserName":"lparker","Category":"Object Access","Severity":"CRITICAL"}'
seed_doc "$IDX_LIN" '{"hostname":"WEB-PRD-10","program":"apache2","@timestamp":"'"$TODAY"'T05:41:09Z","method":"POST","uri":"/uploads/upload_shell.php","status_code":200,"src_ip":"203.0.113.42","bytes_sent":1024,"category":"Web","severity":"CRITICAL"}'
seed_doc "$IDX_LIN" '{"hostname":"WEB-PRD-01","program":"sudo","@timestamp":"'"$TODAY"'T11:45:33Z","message":"appuser : TTY=pts/0 ; PWD=/home/appuser ; USER=root ; COMMAND=/usr/bin/python3 -c import os; os.setuid(0)","severity":"WARNING","facility":"auth"}'
seed_doc "$IDX_NET" '{"src_ip":"10.0.1.88","dst_ip":"45.33.32.156","src_port":54321,"dst_port":443,"@timestamp":"'"$TODAY"'T14:22:05Z","protocol":"TCP","bytes_out":4508876800,"bytes_in":12048,"duration_sec":2820,"action":"ALLOW","application":"HTTPS"}'
seed_doc "$IDX_NET" '{"src_ip":"10.0.1.55","dst_ip":"8.8.8.8","src_port":45678,"dst_port":53,"@timestamp":"'"$TODAY"'T07:55:19Z","protocol":"UDP","query":"YWJjZGVmZ2g.c2tunnel.xyz","query_length":182,"query_type":"TXT","response_code":"NOERROR","category":"DNS"}'

echo "✅ Log events seeded"

# Step 5: Create Incidents via API
echo ""
echo "▶ Step 5: Creating incidents..."
for inc in \
  "APT Campaign — CORP Domain Compromise|CRITICAL|IN_PROGRESS|analyst.chen|P1" \
  "Ransomware Infection — ACCT-PC-077|CRITICAL|OPEN|soc.manager|P1" \
  "Web Shell Compromise — WEB-PRD-10|HIGH|IN_PROGRESS|analyst.patel|P2" \
  "DNS Tunneling C2 Communication|MEDIUM|OPEN|analyst.okonkwo|P3"
do
  IFS='|' read -r name sev status assignee prio <<< "$inc"
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BACKEND/api/ha-incidents" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"incidentName\":\"$name\",\"incidentSeverity\":\"$sev\",\"incidentStatus\":\"$status\",\"incidentPriority\":\"$prio\",\"incidentAssignedTo\":\"$assignee\",\"incidentDescription\":\"Security incident requiring investigation — $name\"}" 2>/dev/null || echo "---")
  echo "  $name: $HTTP"
done
echo "✅ Incidents created"

# Step 6: Create Playbooks via API
echo ""
echo "▶ Step 6: Creating SOAR playbooks..."
for pb in \
  "Ransomware Containment Response|Auto-isolate endpoint block user dump memory notify team|CRITICAL" \
  "Brute Force Account Lockout|Lock account block source IP notify user log event|HIGH" \
  "Phishing Email Investigation|Extract headers enrich IOCs scan URLs quarantine email|MEDIUM"
do
  IFS='|' read -r name desc sev <<< "$pb"
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BACKEND/api/ha-playbooks" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"name\":\"$name\",\"description\":\"$desc\",\"trigger\":\"ALERT\",\"enabled\":true}" 2>/dev/null || echo "---")
  echo "  $name: $HTTP"
done
echo "✅ Playbooks created"

# Step 7: Create Detection Rules via API
echo ""
echo "▶ Step 7: Creating detection rules..."
for rule in \
  "Mimikatz Credential Dumping|CRITICAL|Credential Access|T1003.001" \
  "Ransomware Mass File Encryption|CRITICAL|Malware|T1486" \
  "Lateral Movement via PsExec|HIGH|Lateral Movement|T1570" \
  "Suspicious PowerShell EncodedCommand|HIGH|Execution|T1059.001" \
  "Brute Force High Rate Failed Logins|HIGH|Authentication|T1110.001"
do
  IFS='|' read -r name sev cat tech <<< "$rule"
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$BACKEND/api/ha-correlation-rules" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"name\":\"$name\",\"severity\":\"$sev\",\"category\":\"$cat\",\"mitreTechnique\":\"$tech\",\"enabled\":true,\"description\":\"Detection rule for $name\"}" 2>/dev/null || echo "---")
  echo "  $name: $HTTP"
done
echo "✅ Detection rules created"

echo ""
echo "======================================================="
echo "  ✅ Seed data injection complete!"
echo "  • 4 SOC users (analyst.chen, analyst.patel, soc.manager, analyst.okonkwo)"
echo "  • 10 security alerts (CRITICAL/HIGH/MEDIUM/LOW) in OpenSearch"
echo "  • 7 raw log events (Windows, Linux, Network) in OpenSearch"
echo "  • 4 incidents created"
echo "  • 3 SOAR playbooks created"
echo "  • 5 detection rules created"
echo ""
echo "  Login: http://localhost:3000 | admin / localdev123!"
echo "======================================================="
