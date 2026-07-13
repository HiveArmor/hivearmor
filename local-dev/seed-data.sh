#!/bin/bash
# Seed realistic data into OpenSearch for dashboard visualizations
# This generates alerts, events (generic, wineventlog, linux, firewall) for the last 7 days

ES_URL="https://localhost:9200"
ES_USER="admin"
ES_PASS="LocalDev@2024!"
CURL="curl -sk -u ${ES_USER}:${ES_PASS}"

echo "=== HiveArmor OpenSearch Data Seeder ==="
echo ""

# Clean up old data first
echo "=== Cleaning old data ==="
echo "Deleting old alert indices..."
$CURL -X DELETE "${ES_URL}/v11-alert-*" > /dev/null 2>&1
echo "Deleting old log indices..."
$CURL -X DELETE "${ES_URL}/v11-log-*" > /dev/null 2>&1
echo "Old data removed."
echo ""

# Date calculations - last 7 days
TODAY=$(date -u +%Y-%m-%d)
generate_date() {
  local days_ago=$1
  date -u -v-${days_ago}d +%Y-%m-%d 2>/dev/null || date -u -d "${days_ago} days ago" +%Y-%m-%d
}

generate_timestamp() {
  local date=$1
  local hour=$(( RANDOM % 24 ))
  local min=$(( RANDOM % 60 ))
  local sec=$(( RANDOM % 60 ))
  printf "%sT%02d:%02d:%02d.000Z" "$date" "$hour" "$min" "$sec"
}

# Arrays for realistic data
ALERT_NAMES=(
  "Brute Force Authentication Attempt"
  "Suspicious PowerShell Execution"
  "Lateral Movement Detected"
  "Data Exfiltration Attempt"
  "Unauthorized Service Installation"
  "Privilege Escalation Attempt"
  "Malware Communication Detected"
  "SQL Injection Attempt"
  "Port Scan Detected"
  "Unauthorized Access Attempt"
  "Ransomware Behavior Detected"
  "Credential Dumping Attempt"
  "DNS Tunneling Detected"
  "Phishing Link Clicked"
  "Anomalous Network Traffic"
  "Unauthorized Registry Modification"
  "Suspicious File Download"
  "Remote Code Execution Attempt"
  "Command and Control Communication"
  "Account Compromise Detected"
)

CATEGORIES=(
  "Credential Access"
  "Execution"
  "Lateral Movement"
  "Exfiltration"
  "Persistence"
  "Privilege Escalation"
  "Command and Control"
  "Initial Access"
  "Discovery"
  "Defense Evasion"
  "Impact"
  "Collection"
)

TECHNIQUES=(
  "T1110 - Brute Force"
  "T1059 - Command and Scripting Interpreter"
  "T1021 - Remote Services"
  "T1048 - Exfiltration Over Alternative Protocol"
  "T1543 - Create or Modify System Process"
  "T1068 - Exploitation for Privilege Escalation"
  "T1071 - Application Layer Protocol"
  "T1190 - Exploit Public-Facing Application"
  "T1046 - Network Service Scanning"
  "T1078 - Valid Accounts"
  "T1486 - Data Encrypted for Impact"
  "T1003 - OS Credential Dumping"
)

DATA_SOURCES=("workstation-01" "workstation-02" "workstation-03" "workstation-05" "workstation-07" "workstation-12" "dc-01" "dc-02" "file-server-01" "web-server-01" "web-server-02" "mail-server" "db-server-01" "app-server-01" "linux-server-01" "linux-server-02")
USERS=("admin" "jdoe" "mwilson" "svc_backup" "svc_web" "administrator" "root" "deploy" "jenkins" "www-data" "postgres" "nginx" "elastic" "tomcat")
COUNTRIES=("China" "Russia" "North Korea" "Iran" "Brazil" "United States" "Germany" "Romania" "Netherlands" "Ukraine")
CITIES=("Beijing" "Moscow" "Pyongyang" "Tehran" "São Paulo" "New York" "Berlin" "Bucharest" "Amsterdam" "Kyiv")
ADVERSARY_IPS=("185.220.101.33" "45.155.205.12" "103.75.201.5" "91.219.236.18" "177.54.145.100" "198.51.100.42" "203.0.113.55" "192.0.2.99" "185.100.87.41" "78.128.113.66")
INTERNAL_IPS=("10.0.1.10" "10.0.1.13" "10.0.1.15" "10.0.1.20" "10.0.1.25" "10.0.1.30" "192.168.1.100" "192.168.1.104" "192.168.1.110" "192.168.1.113" "192.168.1.114" "192.168.1.120")

SEVERITIES=(1 2 3 4)
SEVERITY_LABELS=("LOW" "MEDIUM" "HIGH" "CRITICAL")
STATUSES=(2 3 4 5)
STATUS_LABELS=("Open" "In Review" "Completed" "Auto-Resolved")
DATA_TYPES=("wineventlog" "linux" "generic" "firewall")

# Linux event messages
LINUX_MESSAGES=(
  "Failed password for invalid user"
  "Accepted publickey for root from"
  "Service started"
  "Service stopped unexpectedly"
  "Disk space critical on /dev/sda1"
  "Connection refused from"
  "Out of memory: Kill process"
  "segfault at address"
  "New session opened for user"
  "PAM authentication failure"
  "sudo command executed by"
  "Firewall rule updated"
  "Package installed successfully"
  "Cron job execution failed"
  "SSH brute force detected"
  "Kernel panic - not syncing"
  "File permission changed"
  "User account created"
  "Network interface down"
  "Certificate expiring soon"
)

LINUX_ACTIONS=("authentication_failure" "session_open" "service_start" "service_stop" "disk_alert" "connection_refused" "oom_kill" "segfault" "session_new" "pam_failure" "sudo_exec" "fw_update" "package_install" "cron_fail" "brute_force" "kernel_panic" "chmod" "useradd" "ifdown" "cert_warn")

# Windows event messages
WIN_MESSAGES=(
  "An account was successfully logged on"
  "An account failed to log on"
  "A new process has been created"
  "A service was installed in the system"
  "Special privileges assigned to new logon"
  "An attempt was made to access an object"
  "A user account was changed"
  "The audit log was cleared"
  "A scheduled task was created"
  "Windows Defender detected malware"
  "PowerShell script block logging"
  "Remote Desktop connection established"
  "Group membership was enumerated"
  "A user account was locked out"
  "Kerberos pre-authentication failed"
)

WIN_EVENT_IDS=("4624" "4625" "4688" "4697" "4672" "4663" "4738" "1102" "4698" "1116" "4104" "4778" "4799" "4740" "4771")
WIN_ACTIONS=("logon_success" "logon_failure" "process_created" "service_installed" "special_logon" "object_access" "account_changed" "audit_cleared" "task_created" "malware_detected" "powershell" "rdp_connect" "group_enum" "account_locked" "kerberos_fail")

# Firewall event messages
FW_MESSAGES=(
  "Connection blocked - port scan detected"
  "Outbound connection to known malicious IP"
  "Inbound connection from blocked country"
  "Rate limit exceeded from source"
  "DDoS mitigation activated"
  "VPN tunnel established"
  "NAT translation created"
  "Intrusion prevention rule triggered"
  "Connection allowed"
  "Connection denied by policy"
)

FW_ACTIONS=("block" "alert" "block" "rate_limit" "ddos_mitigate" "vpn_connect" "nat_create" "ips_trigger" "allow" "deny")

# Generic event messages
GENERIC_MESSAGES=(
  "System health check passed"
  "Application error detected"
  "Database connection pool exhausted"
  "API rate limit approaching"
  "Backup completed successfully"
  "Configuration change detected"
  "License expiration warning"
  "High CPU utilization detected"
  "Memory threshold exceeded"
  "SSL certificate renewal needed"
  "DNS resolution timeout"
  "Load balancer health check failed"
  "Container restart detected"
  "Deployment rollback triggered"
  "Webhook delivery failed"
)

GENERIC_ACTIONS=("health_check" "app_error" "db_pool_exhaust" "rate_limit_warn" "backup_complete" "config_change" "license_warn" "high_cpu" "memory_alert" "ssl_renewal" "dns_timeout" "lb_fail" "container_restart" "rollback" "webhook_fail")

echo "Generating alerts..."

# Generate 500+ alerts spread across 7 days
ALERT_BULK=""
ALERT_COUNT=0
for days_ago in 0 1 2 3 4 5 6; do
  DATE=$(generate_date $days_ago)
  INDEX="v11-alert-${DATE}"
  
  # More alerts on recent days
  if [ $days_ago -lt 2 ]; then
    NUM_ALERTS=$(( 80 + RANDOM % 40 ))
  elif [ $days_ago -lt 4 ]; then
    NUM_ALERTS=$(( 60 + RANDOM % 30 ))
  else
    NUM_ALERTS=$(( 40 + RANDOM % 20 ))
  fi
  
  for i in $(seq 1 $NUM_ALERTS); do
    TIMESTAMP=$(generate_timestamp "$DATE")
    NAME_IDX=$(( RANDOM % ${#ALERT_NAMES[@]} ))
    CAT_IDX=$(( RANDOM % ${#CATEGORIES[@]} ))
    TECH_IDX=$(( RANDOM % ${#TECHNIQUES[@]} ))
    SEV_IDX=$(( RANDOM % 4 ))
    STAT_IDX=$(( RANDOM % 4 ))
    DS_IDX=$(( RANDOM % ${#DATA_SOURCES[@]} ))
    USR_IDX=$(( RANDOM % ${#USERS[@]} ))
    COUNTRY_IDX=$(( RANDOM % ${#COUNTRIES[@]} ))
    ADV_IDX=$(( RANDOM % ${#ADVERSARY_IPS[@]} ))
    INT_IDX=$(( RANDOM % ${#INTERNAL_IPS[@]} ))
    DT_IDX=$(( RANDOM % ${#DATA_TYPES[@]} ))
    PORT=$(( 1024 + RANDOM % 64000 ))
    
    # Weight severity toward medium/high for realism
    WEIGHTED_SEV=$(( (RANDOM % 10) ))
    if [ $WEIGHTED_SEV -lt 2 ]; then SEV_IDX=3; # 20% critical
    elif [ $WEIGHTED_SEV -lt 5 ]; then SEV_IDX=2; # 30% high
    elif [ $WEIGHTED_SEV -lt 8 ]; then SEV_IDX=1; # 30% medium
    else SEV_IDX=0; # 20% low
    fi

    # Generate a unique alert ID
    ALERT_ID=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-f0-9' | head -c 24)
    
    DOC=$(cat <<EOF
{"id":"${ALERT_ID}","@timestamp":"${TIMESTAMP}","name":"${ALERT_NAMES[$NAME_IDX]} #${ALERT_COUNT}","severity":${SEVERITIES[$SEV_IDX]},"severityLabel":"${SEVERITY_LABELS[$SEV_IDX]}","status":${STATUSES[$STAT_IDX]},"statusLabel":"${STATUS_LABELS[$STAT_IDX]}","category":"${CATEGORIES[$CAT_IDX]}","technique":"${TECHNIQUES[$TECH_IDX]}","dataType":"${DATA_TYPES[$DT_IDX]}","dataSource":"${DATA_SOURCES[$DS_IDX]}","target":{"ip":"${INTERNAL_IPS[$INT_IDX]}","host":"host-${i}","user":"${USERS[$USR_IDX]}"},"adversary":{"ip":"${ADVERSARY_IPS[$ADV_IDX]}","host":"external","geolocation":{"country":"${COUNTRIES[$COUNTRY_IDX]}","city":"${CITIES[$COUNTRY_IDX]}"}},"source":{"ip":"${ADVERSARY_IPS[$ADV_IDX]}","host":"external","port":${PORT}},"destination":{"ip":"${INTERNAL_IPS[$INT_IDX]}","host":"host-${i}","port":443},"tags":[],"notes":"","isIncident":false,"description":"Alert triggered by correlation rule","impact":{"confidentiality":$(( RANDOM % 3 + 1 )),"integrity":$(( RANDOM % 3 + 1 )),"availability":$(( RANDOM % 3 + 1 ))},"events":[{"dataType":"${DATA_TYPES[$DT_IDX]}","action":"detected","timestamp":"${TIMESTAMP}"}]}
EOF
)
    ALERT_BULK="${ALERT_BULK}{\"index\":{\"_index\":\"${INDEX}\",\"_id\":\"${ALERT_ID}\"}}\n${DOC}\n"
    ALERT_COUNT=$((ALERT_COUNT + 1))
    
    # Flush every 100 docs
    if [ $((ALERT_COUNT % 100)) -eq 0 ]; then
      printf "$ALERT_BULK" | $CURL -X POST "${ES_URL}/_bulk" -H "Content-Type: application/x-ndjson" --data-binary @- > /dev/null 2>&1
      ALERT_BULK=""
      echo "  Alerts indexed: ${ALERT_COUNT}"
    fi
  done
done

# Flush remaining alerts
if [ -n "$ALERT_BULK" ]; then
  printf "$ALERT_BULK" | $CURL -X POST "${ES_URL}/_bulk" -H "Content-Type: application/x-ndjson" --data-binary @- > /dev/null 2>&1
fi
echo "Total alerts created: ${ALERT_COUNT}"
echo ""

# Generate log events for each type
generate_logs() {
  local LOG_TYPE=$1
  local INDEX_PREFIX=$2
  local TOTAL=0
  local BULK=""
  
  echo "Generating ${LOG_TYPE} logs..."
  
  for days_ago in 0 1 2 3 4 5 6; do
    DATE=$(generate_date $days_ago)
    INDEX="${INDEX_PREFIX}${DATE}"
    
    # More events on recent days
    if [ $days_ago -lt 2 ]; then
      NUM_EVENTS=$(( 200 + RANDOM % 100 ))
    elif [ $days_ago -lt 4 ]; then
      NUM_EVENTS=$(( 150 + RANDOM % 80 ))
    else
      NUM_EVENTS=$(( 100 + RANDOM % 50 ))
    fi
    
    for i in $(seq 1 $NUM_EVENTS); do
      TIMESTAMP=$(generate_timestamp "$DATE")
      DS_IDX=$(( RANDOM % ${#DATA_SOURCES[@]} ))
      USR_IDX=$(( RANDOM % ${#USERS[@]} ))
      INT_IDX=$(( RANDOM % ${#INTERNAL_IPS[@]} ))
      INT_IDX2=$(( RANDOM % ${#INTERNAL_IPS[@]} ))
      SEV=$(( RANDOM % 4 + 1 ))

      local MSG=""
      local ACTION=""
      local EVT_ID=""
      
      if [ "$LOG_TYPE" == "wineventlog" ]; then
        MSG_IDX=$(( RANDOM % ${#WIN_MESSAGES[@]} ))
        MSG="${WIN_MESSAGES[$MSG_IDX]}"
        ACTION="${WIN_ACTIONS[$MSG_IDX]}"
        EVT_ID="${WIN_EVENT_IDS[$MSG_IDX]}"
      elif [ "$LOG_TYPE" == "linux" ]; then
        MSG_IDX=$(( RANDOM % ${#LINUX_MESSAGES[@]} ))
        MSG="${LINUX_MESSAGES[$MSG_IDX]}"
        ACTION="${LINUX_ACTIONS[$MSG_IDX]}"
        EVT_ID="${LINUX_ACTIONS[$MSG_IDX]}"
      elif [ "$LOG_TYPE" == "firewall" ]; then
        MSG_IDX=$(( RANDOM % ${#FW_MESSAGES[@]} ))
        MSG="${FW_MESSAGES[$MSG_IDX]}"
        ACTION="${FW_ACTIONS[$MSG_IDX]}"
        EVT_ID="${FW_ACTIONS[$MSG_IDX]}"
      else
        MSG_IDX=$(( RANDOM % ${#GENERIC_MESSAGES[@]} ))
        MSG="${GENERIC_MESSAGES[$MSG_IDX]}"
        ACTION="${GENERIC_ACTIONS[$MSG_IDX]}"
        EVT_ID="${GENERIC_ACTIONS[$MSG_IDX]}"
      fi
      
      DOC=$(cat <<EOF
{"@timestamp":"${TIMESTAMP}","message":"${MSG}","dataType":"${LOG_TYPE}","dataSource":"${DATA_SOURCES[$DS_IDX]}","severity":${SEV},"event":{"action":"${ACTION}","id":"${EVT_ID}"},"source":{"ip":"${INTERNAL_IPS[$INT_IDX]}","host":"${DATA_SOURCES[$DS_IDX]}"},"destination":{"ip":"${INTERNAL_IPS[$INT_IDX2]}","host":"dest-${i}"},"user":{"name":"${USERS[$USR_IDX]}"}}
EOF
)
      BULK="${BULK}{\"index\":{\"_index\":\"${INDEX}\"}}\n${DOC}\n"
      TOTAL=$((TOTAL + 1))
      
      if [ $((TOTAL % 200)) -eq 0 ]; then
        printf "$BULK" | $CURL -X POST "${ES_URL}/_bulk" -H "Content-Type: application/x-ndjson" --data-binary @- > /dev/null 2>&1
        BULK=""
        echo "  ${LOG_TYPE} logs indexed: ${TOTAL}"
      fi
    done
  done
  
  if [ -n "$BULK" ]; then
    printf "$BULK" | $CURL -X POST "${ES_URL}/_bulk" -H "Content-Type: application/x-ndjson" --data-binary @- > /dev/null 2>&1
  fi
  echo "Total ${LOG_TYPE} logs created: ${TOTAL}"
  echo ""
}

generate_logs "wineventlog" "v11-log-wineventlog-"
generate_logs "linux" "v11-log-linux-"
generate_logs "firewall" "v11-log-firewall-"
generate_logs "generic" "v11-log-generic-"

echo ""
echo "=== Seeding PostgreSQL incidents ==="

# Get DB connection info
PGHOST="localhost"
PGPORT="5438"
PGUSER="postgres"
PGDB="hivearmor"

# Read password from .env
PGPASS=$(grep "POSTGRES_PASSWORD" "$(dirname "$0")/.env" | cut -d= -f2)

export PGPASSWORD="$PGPASS"

# Insert incidents
echo "Inserting incidents..."
for i in $(seq 1 25); do
  SEVERITY=$(( RANDOM % 4 + 1 ))
  STATUS_VALS=("OPEN" "IN_REVIEW" "COMPLETED" "AUTO_RESOLVED")
  STATUS=${STATUS_VALS[$(( RANDOM % 4 ))]}
  DAYS_AGO=$(( RANDOM % 7 ))
  
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDB" -c "
    INSERT INTO utm_incident (incident_name, incident_description, incident_status, incident_severity, incident_created_date, incident_assigned_to)
    VALUES (
      'INC-$(printf "%04d" $i) ${ALERT_NAMES[$(( RANDOM % ${#ALERT_NAMES[@]} ))]}',
      'Automated incident created from correlated alerts. Multiple indicators of compromise detected across the network.',
      '${STATUS}',
      ${SEVERITY},
      NOW() - INTERVAL '${DAYS_AGO} days' - INTERVAL '$(( RANDOM % 24 )) hours',
      '${USERS[$(( RANDOM % ${#USERS[@]} ))]}'
    ) ON CONFLICT (incident_name) DO NOTHING;
  " 2>/dev/null
done
echo "Incidents inserted."

echo ""
echo "=== Refreshing indices ==="
$CURL -X POST "${ES_URL}/_refresh" > /dev/null 2>&1

echo ""
echo "=== Summary ==="
echo "Checking final counts..."
ALERT_TOTAL=$($CURL "${ES_URL}/v11-alert-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null)
LOG_TOTAL=$($CURL "${ES_URL}/v11-log-*/_count" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['count'])" 2>/dev/null)
echo "  Total alerts: ${ALERT_TOTAL}"
echo "  Total log events: ${LOG_TOTAL}"
echo ""
echo "Done! Dashboard visualizations should now have rich data."
