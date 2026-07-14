# HiveArmor Agent

The HiveArmor Agent is a lightweight Go binary that runs on Windows, Linux, and macOS endpoints. It collects security-relevant logs and events, forwards them to the HiveArmor platform via gRPC over TLS 1.3, and executes SOC response commands issued through the HiveArmor console.

HiveArmor is an enterprise SIEM/XDR platform — Hyper-scale Incident Visibility Engine.

---

## Supported Platforms

| Platform | Architecture | Service Manager | Service Name |
|---|---|---|---|
| Windows 10/11, Server 2016+ | amd64, arm64 | Windows SCM | `HiveArmorAgent` |
| Ubuntu 22.04 / 24.04 | amd64, arm64 | systemd | `hivearmor-agent` |
| Debian 12 | amd64, arm64 | systemd | `hivearmor-agent` |
| RHEL / Rocky / AlmaLinux 8, 9 | amd64, arm64 | systemd | `hivearmor-agent` |
| macOS 13+ | amd64, arm64 | launchd | `com.hivearmor.agent` |

---

## What the Agent Collects

| Data Type | Platform | Internal Type Tag |
|---|---|---|
| Windows Event Logs (Security, System, Application, PowerShell) | Windows | `wineventlog` |
| Linux system events | Linux | `linux` |
| macOS system events | macOS | `macos` |
| Syslog (UDP/TCP 7014) | All | `syslog` |
| Linux Audit Framework events (auditd) | Linux | `auditd` |
| File integrity events (fsnotify) | All | via file collector |
| NetFlow v5/v9/IPFIX (UDP 2055) | All | `netflow` |
| Application logs (Nginx, PostgreSQL, Apache, IIS, HAProxy) | All | per-module |
| Middleware logs (MySQL, MongoDB, Redis, Kafka, Elasticsearch) | All | per-module |

All collected data is streamed to the HiveArmor Event Processor via gRPC (port 50051) for parsing, enrichment, and correlation before being indexed in OpenSearch.

### Linux Audit Rules

On Linux, the agent automatically installs auditd (if not present) and deploys HiveArmor's audit ruleset to:

```
/etc/audit/rules.d/50-hivearmor.rules
```

The rules are additive — they do not replace existing audit policy. They cover:

- Command execution (`execve`, auid >= 1000)
- Privilege escalation (`setuid`, `setgid`, and variants)
- Sensitive file writes (`/etc/shadow`, `/etc/passwd`, `/etc/sudoers`, `/etc/ssh/sshd_config`, `/root/.ssh`)
- Log tampering (`/var/log/wtmp`, `/var/log/btmp`, `/var/log/lastlog`)
- Kernel module loading (`init_module`, `finit_module`, `delete_module`)
- Audit configuration changes (`/etc/audit`, `/etc/audisp`)
- System time changes (`adjtimex`, `settimeofday`, `clock_settime`)

Rules are versioned (`AuditdVersion` constant). When the agent updates and the version changes, rules are redeployed and reloaded automatically without restarting the auditd service.

Auditd setup is skipped silently in containers (`/.dockerenv`, `/run/.containerenv`, cgroup check) and when audit config is locked in immutable mode (`-e 2`).

---

## Installation

### Automated (Recommended)

Use the `hivearmor-installer` binary, which handles agent download, TLS certificate provisioning, service registration, and first-run configuration in a single step. The installer is available from:

- **Production CM**: `https://cm.onlyhacker.org`
- **Dev CM**: `https://cmdev.onlyhacker.org`

Follow the on-screen instructions in the HiveArmor console under **Agents > Deploy**.

### Manual Installation

Download the agent binary for your platform from the CM server's dependencies endpoint:

```
https://<cm-server>:9001/private/dependencies/agent/<binary>
```

Then run the install command as an administrator / root:

```bash
# Linux / macOS
sudo ./hivearmor_agent_service install <server_address> <ha_key> no

# Windows (Administrator PowerShell)
.\hivearmor_agent_service.exe install <server_address> <ha_key> no
```

**Arguments:**

| Argument | Description |
|---|---|
| `server_address` | Hostname or IP of the HiveArmor backend (no port, no scheme) |
| `ha_key` | Agent enrollment key from the HiveArmor console |
| `no` / `yes` | Skip TLS certificate validation (`yes` is for dev/self-signed; use `no` in production) |

The install command:
1. Verifies connectivity to ports 9000, 9001, and 50051 on the server
2. Downloads `version.json` from the CM dependency server
3. Registers the agent with AgentManager via gRPC and saves encrypted credentials
4. Installs and starts the `HiveArmorAgent` OS service
5. On Linux: installs auditd and deploys audit rules (root required)

### Uninstall

```bash
# Linux / macOS
sudo ./hivearmor_agent_service uninstall

# Windows (Administrator PowerShell)
.\hivearmor_agent_service.exe uninstall
```

Uninstall stops and removes the `HiveArmorAgent` and `HiveArmorUpdater` services and cleans up audit rules on Linux.

---

## Auto-Update

A companion binary, `HiveArmorUpdater`, runs as a separate OS service and is responsible for keeping the agent up to date.

| Platform | Service Name |
|---|---|
| Windows | `HiveArmorUpdater` |
| Linux | `hivearmor-updater` (systemd) |
| macOS | `com.hivearmor.updater` (launchd) |

The updater polls the CM server for new versions, downloads the updated binary, replaces the agent binary on disk, and restarts the `HiveArmorAgent` service. No manual intervention is required. The updater itself can be updated by the CM server in a two-phase process.

---

## Configuration

The agent does not require manual configuration. After initial enrollment via the `install` command, all runtime configuration — enabled data sources, collection intervals, data retention settings, and response command authorization — is delivered from AgentManager via gRPC streaming.

The only local file is `config.yml`, written by the `install` command:

```yaml
server: <server_address>
agent-id: <integer>
agent-key: <AES-encrypted key>
insecure: false
```

The `agent-key` field is AES-encrypted at rest using the `REPLACE_KEY` build-time secret combined with a per-installation UUID. Do not edit this file manually.

---

## Service Ports

| Port | Protocol | Direction | Purpose |
|---|---|---|---|
| 9000 | gRPC / TLS | Outbound | AgentManager — registration, command channel, config streaming |
| 9001 | HTTPS | Outbound | CM dependency server — version info, binary downloads |
| 50051 | gRPC / TLS | Outbound | Log forwarding to Event Processor |

All outbound connections originate from the agent. No inbound ports are opened on the endpoint.

---

## Building from Source

### Prerequisites

- Go 1.25.5 or later
- The `../shared` module must be present (this repo uses a `replace` directive in `go.mod`)
- The `REPLACE_KEY` build secret (injected at build time; authentication fails without it)

### Build

```bash
cd agent
go build \
  -ldflags "-X github.com/hivearmor/agent/config.REPLACE_KEY=<secret>" \
  -o hivearmor_agent_service \
  .
```

For the updater:

```bash
cd agent/updater
go build \
  -ldflags "-X github.com/hivearmor/agent/updater/config.REPLACE_KEY=<secret>" \
  -o hivearmor_updater_service \
  .
```

Replace `<secret>` with the value of `$AGENT_SECRET_PREFIX` from the CI environment. Binaries built without this flag will fail to decrypt the local `config.yml` on startup.

Windows resource files (`rsrc_windows_*.syso`) are checked in and embedded automatically by the Go toolchain on Windows target builds.

### Cross-Compilation

```bash
# Linux amd64
GOOS=linux GOARCH=amd64 go build -ldflags "..." -o hivearmor_agent_service_linux_amd64 .

# Windows amd64
GOOS=windows GOARCH=amd64 go build -ldflags "..." -o hivearmor_agent_service_windows_amd64.exe .

# macOS arm64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -ldflags "..." -o hivearmor_agent_service_darwin_arm64 .
```

---

## CLI Reference

```
hivearmor_agent_service <command> [args]

Commands:
  install <server> <ha_key> <insecure>   Install and register the agent service
  uninstall                              Stop and remove the agent service
  run                                    Run the agent in the foreground (used by the service manager)
  change-paths                           Update file collection paths
  change-port                            Update a syslog listener port
  change-retention <days>                Set local log retention (days; empty = use server default)
  enable-integration <type>              Enable a data source integration
  disable-integration <type>             Disable a data source integration
  load-tls-certs                         Reload integration TLS certificates from disk
```

---

## Logging

| Platform | Log File |
|---|---|
| Windows | `<install_dir>\logs\hivearmor_agent.log` |
| Linux | `<install_dir>/logs/hivearmor_agent.log` |
| macOS | `<install_dir>/logs/hivearmor_agent.log` |

The install directory is the directory containing the agent binary. On Linux, this is typically `/opt/hivearmor/agent/`.

---

## Security Notes

- The agent communicates exclusively over TLS 1.3. Certificate validation is enabled by default and should not be disabled in production.
- The `agent-key` credential is AES-encrypted using a build-time secret (`REPLACE_KEY`) combined with a per-device UUID. The plaintext key never touches disk.
- The agent does not open any listening ports on the endpoint.
- On Linux, audit rule deployment requires root. The agent gracefully skips auditd setup if it lacks privileges.

---

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor
