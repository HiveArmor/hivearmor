# HiveArmor — Agent Installation Guide

**Audience:** System administrators deploying endpoint monitoring  
**Version:** v1.x

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Installing on Linux](#3-installing-on-linux)
4. [Installing on Windows](#4-installing-on-windows)
5. [Installing on macOS](#5-installing-on-macos)
6. [Verifying the Installation](#6-verifying-the-installation)
7. [Updating the Agent](#7-updating-the-agent)
8. [Uninstalling the Agent](#8-uninstalling-the-agent)
9. [Agent Configuration Reference](#9-agent-configuration-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

The HiveArmor Agent is a lightweight binary that:

- Collects system logs (Windows Event Log, Linux syslog/journald, macOS unified log)
- Sends logs to the HiveArmor server via gRPC TLS on port **9000**
- Executes remote commands issued from the Admin panel
- Self-updates when new versions are available (via the updater service)

The agent connects **outbound** on TCP 9000 — no inbound firewall rules are needed on the endpoint.

### Architecture

```
Endpoint (Agent)
  ├── Reads local logs (OS-native collectors)
  ├── Sends → gRPC TLS → AgentManager :9000
  │     └── AgentManager → registers in PostgreSQL, forwards logs
  └── Receives remote command responses
```

---

## 2. Prerequisites

| Platform | Minimum OS | Notes |
|---|---|---|
| Linux | Ubuntu 20.04 / RHEL 8 / Debian 10 | Runs as a systemd service |
| Windows | Windows Server 2016 / Windows 10 | Runs as a Windows service |
| macOS | macOS 12 (Monterey) | Runs as a LaunchDaemon |

**Network requirements:**
- TCP 9000 outbound to `<HIVEARMOR_SERVER_IP>` must be open
- DNS resolution for the server hostname is recommended

**Disk:** ~50 MB for the agent binary + up to 200 MB for local log buffering

---

## 3. Installing on Linux

### Quick install (one-liner)

```bash
# Replace HIVEARMOR_SERVER_IP with your server's IP or hostname
curl -fsSL https://<HIVEARMOR_SERVER_IP>/api/ha-agent-manager/installer/download/linux \
  -o /tmp/hivearmor-agent-linux
chmod +x /tmp/hivearmor-agent-linux
sudo /tmp/hivearmor-agent-linux --install --host <HIVEARMOR_SERVER_IP>
```

### Manual install

1. **Download the agent binary**

```bash
# Get the token for the download endpoint
TOKEN=$(curl -s -X POST https://<SERVER>:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASS>","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id_token'])")

# Download the Linux agent
curl -o /tmp/hivearmor_agent \
  -H "Authorization: Bearer $TOKEN" \
  "https://<SERVER>:8088/api/ha-agent-manager/installer/download/linux"
chmod +x /tmp/hivearmor_agent
```

2. **Install the agent**

```bash
sudo mv /tmp/hivearmor_agent /usr/local/bin/hivearmor_agent
sudo /usr/local/bin/hivearmor_agent --install --host <HIVEARMOR_SERVER_IP>
```

3. **The installer creates:**
   - Config file: `/etc/hivearmor/agent.yml`
   - systemd service: `hivearmor-agent.service`

4. **Verify the service is running**

```bash
sudo systemctl status hivearmor-agent
sudo journalctl -u hivearmor-agent -n 50
```

### Firewall configuration (Linux)

```bash
# Allow outbound TCP 9000 (if iptables)
iptables -A OUTPUT -p tcp --dport 9000 -j ACCEPT

# UFW
ufw allow out 9000/tcp
```

---

## 4. Installing on Windows

### Quick install (PowerShell, run as Administrator)

```powershell
# Replace SERVER with your HiveArmor server IP or hostname
$server = "<HIVEARMOR_SERVER_IP>"

# Download agent installer
Invoke-WebRequest -Uri "https://$server/api/ha-agent-manager/installer/download/windows" `
  -OutFile "$env:TEMP\hivearmor_agent.exe" -UseBasicParsing

# Install
Start-Process -FilePath "$env:TEMP\hivearmor_agent.exe" `
  -ArgumentList "--install", "--host", $server `
  -Verb RunAs -Wait
```

### Manual install steps

1. **Download the agent:**
   - Log in to the HiveArmor UI
   - Navigate to **Administration → Agents → Download Agent → Windows**
   - Save `hivearmor_agent.exe` to the target machine

2. **Run the installer (as Administrator):**

```cmd
cd C:\Downloads
hivearmor_agent.exe --install --host <HIVEARMOR_SERVER_IP>
```

3. **What the installer creates:**
   - Install directory: `C:\Program Files\HiveArmor\`
   - Config file: `C:\Program Files\HiveArmor\agent.yml`
   - Windows service: `HiveArmorAgent` (starts automatically)

4. **Verify the service:**

```powershell
Get-Service -Name "HiveArmorAgent"
# Status should be: Running

# View logs
Get-Content "C:\Program Files\HiveArmor\logs\agent.log" -Tail 50
```

### Collecting Windows Event Logs

The agent automatically collects:
- Security events (4624, 4625, 4634, 4720, 4726, 4728, 4732, 4756 and more)
- System events
- Application events

To add custom event log channels:

1. Navigate to **Administration → Agents → Agent Detail → Log Sources**
2. Click **Add Event Log Channel**
3. Enter the channel path (e.g., `Microsoft-Windows-PowerShell/Operational`)

---

## 5. Installing on macOS

### Quick install (Terminal, run with sudo)

```bash
SERVER="<HIVEARMOR_SERVER_IP>"

# Download agent
curl -fsSL "https://$SERVER/api/ha-agent-manager/installer/download/macos" \
  -o /tmp/hivearmor_agent
chmod +x /tmp/hivearmor_agent

# Install
sudo /tmp/hivearmor_agent --install --host $SERVER
```

### What the installer creates

- Binary: `/usr/local/bin/hivearmor_agent`
- Config: `/etc/hivearmor/agent.yml`
- LaunchDaemon plist: `/Library/LaunchDaemons/com.hivearmor.agent.plist`

### macOS-specific log sources

The agent collects:
- Unified System Log (OSLog) — auth, security, network events
- Application logs from `/var/log/`

### Verify the service

```bash
sudo launchctl list | grep hivearmor
# Shows: <PID> 0 com.hivearmor.agent

sudo launchctl print system/com.hivearmor.agent
```

---

## 6. Verifying the Installation

After installing, verify the agent appears in the HiveArmor panel within **2–5 minutes**:

1. Log in to the HiveArmor UI
2. Navigate to **Administration → Agents**
3. Look for the new hostname — it should show **Online**

If it does not appear:
- Check the agent log (see Troubleshooting)
- Verify TCP 9000 is reachable from the endpoint
- Confirm the `--host` value is the correct server IP

---

## 7. Updating the Agent

### Automatic updates (default)

The agent includes an auto-updater (`HiveArmorUpdater` service on Linux/Windows, or the daemon equivalent on macOS). When the server publishes a new agent version:

1. The updater checks the server for a newer binary
2. Downloads and verifies the signature
3. Restarts the agent service with the new binary

No action required from the administrator.

### Manual update

```bash
# Linux
sudo systemctl stop hivearmor-agent
sudo hivearmor_agent --update
sudo systemctl start hivearmor-agent

# Windows (run as Administrator)
Stop-Service HiveArmorAgent
C:\Program Files\HiveArmor\hivearmor_agent.exe --update
Start-Service HiveArmorAgent
```

---

## 8. Uninstalling the Agent

```bash
# Linux
sudo hivearmor_agent --uninstall

# Windows (run as Administrator, from install directory)
hivearmor_agent.exe --uninstall

# macOS
sudo hivearmor_agent --uninstall
```

After uninstalling, the agent will appear as **Offline** in the admin panel and can be deleted from **Administration → Agents**.

---

## 9. Agent Configuration Reference

Config file location:
- Linux / macOS: `/etc/hivearmor/agent.yml`
- Windows: `C:\Program Files\HiveArmor\agent.yml`

```yaml
# HiveArmor Agent Configuration
server:
  host: 192.168.1.100    # HiveArmor server IP or hostname
  port: 9000             # gRPC agent manager port
  tls: true              # TLS is required in production

agent:
  name: ""               # Leave blank to use system hostname
  heartbeat: 60          # Seconds between heartbeat pings

collectors:
  windows_events: true   # Collect Windows Event Log (Windows only)
  syslog: true           # Collect syslog / journald (Linux only)
  oslog: true            # Collect OS log (macOS only)
  custom_paths:          # Additional log file paths to tail
    - /var/log/app/*.log

updater:
  enabled: true          # Allow automatic updates
  check_interval: 3600   # Check for updates every hour
```

> Do not modify `server.host` or `server.tls` manually after installation. Use the UI to update the server address and redeploy.

---

## 10. Troubleshooting

### Agent does not appear in Admin panel

**Check connectivity:**
```bash
# From the endpoint, test TCP 9000
nc -zv <HIVEARMOR_SERVER_IP> 9000
# Expected: Connection to <IP> 9000 port [tcp/*] succeeded!
```

**Check agent logs:**
```bash
# Linux
sudo journalctl -u hivearmor-agent -n 100

# Windows
Get-Content "C:\Program Files\HiveArmor\logs\agent.log" -Tail 50

# macOS
log stream --predicate 'subsystem == "com.hivearmor.agent"' --info
```

**Common errors:**

| Error | Cause | Fix |
|---|---|---|
| `connection refused port 9000` | AgentManager not running or firewall blocking | Check `docker compose ps agentmanager` on server; check firewall |
| `certificate verify failed` | Self-signed cert rejected | The agent trusts HiveArmor's built-in CA — ensure you're using the correct server hostname |
| `authentication failed` | Wrong INTERNAL_KEY | Reinstall agent or check server INTERNAL_KEY in `.env` |
| `service not starting` | Binary permissions | `chmod +x /usr/local/bin/hivearmor_agent` |

### Agent is Online but no logs flowing

1. Check the agent's log collection is enabled: **Admin → Agents → Agent Detail → Log Sources**
2. Verify the correct log channels are active
3. Confirm the event processor is running: `docker compose ps eventprocessor`
4. Check event processor logs: `docker compose logs eventprocessor --tail=50`

### High CPU usage from the agent

The agent uses about 1–5% CPU normally. If higher:
- Reduce `heartbeat` interval in config (increase the number)
- Reduce `custom_paths` entries
- Check if a `custom_paths` pattern matches extremely large files
