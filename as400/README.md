# HiveArmor AS400 Collector

Log collection service for IBM AS/400 (iSeries) systems that integrates with the HiveArmor platform for security analysis and event correlation.

## Overview

HiveArmor AS400 Collector is a Go service that acts as a bridge between IBM AS/400 systems and the HiveArmor Hyper-scale Incident Visibility Engine. It is installed on an intermediate Linux host, connects to multiple remotely configured AS/400 systems, collects security logs, and transmits them in real-time to the HiveArmor server for correlation and analysis.

Configuration of which AS/400 systems to monitor is pushed from the HiveArmor management panel — no manual config file editing is required after installation.

### Key Features

- **Multi-Server Collection**: Monitor multiple AS/400 systems from a single collector instance
- **Remote Configuration**: AS/400 server list is managed from the HiveArmor panel and delivered over a live gRPC configuration stream
- **Local Persistence**: SQLite-backed queue ensures no logs are lost during transient network failures
- **Configurable Retention**: Cap local database size by setting a maximum retention limit in megabytes
- **Java JAR Integration**: Delegates low-level AS/400 connectivity to a bundled `as400-collector.jar` that is managed as a subprocess
- **AES-Encrypted Credentials**: AS/400 passwords are encrypted at rest using AES with a per-installation key
- **TLS Transport**: All communication with the HiveArmor server uses TLS 1.3
- **Auto-Updates**: A companion updater service (`HiveArmorAS400Updater`) polls the HiveArmor server and applies binary updates automatically
- **Automatic Reconnection**: Exponential-backoff reconnect logic handles server restarts and network interruptions without operator intervention

---

## Requirements

| Requirement | Details |
|---|---|
| Operating System | Linux (Ubuntu 22.04/24.04, Debian 12, RHEL/Rocky/AlmaLinux 8/9 recommended) |
| Privileges | Root or equivalent administrator permissions |
| Java Runtime | Installed automatically during the install step if absent |
| HiveArmor Server | Reachable on ports **9000**, **9001**, and **50051** |
| AS/400 Systems | Network-reachable from the collector host |
| HiveArmor Agent | `/hivearmor.yaml` and `/hivearmor/` directory must exist on the host |

---

## Network Ports

| Port | Protocol | Purpose |
|---|---|---|
| 9000 | gRPC / TLS | Agent Manager — registration, config streaming, ping |
| 9001 | HTTPS | Dependency downloads (JAR, updater binary, version manifest) |
| 50051 | gRPC / TLS | Log Auth Proxy — authenticated log forwarding to the event pipeline |

---

## Installation

### 1. Obtain the collector binary

Download the installer binary from your HiveArmor server or the HiveArmor release channel for your platform.

### 2. Run the installer

```bash
sudo ./hivearmor_as400_collector install <server_address> <collector_key> <skip_tls_verify>
```

| Argument | Description |
|---|---|
| `server_address` | Hostname or IP of your HiveArmor server |
| `collector_key` | Registration key shown in the HiveArmor panel |
| `skip_tls_verify` | `yes` to skip TLS certificate validation (dev/self-signed only), otherwise `no` |

Example:

```bash
sudo ./hivearmor_as400_collector install ha.example.com xxxxxxxxxxxxxxxx no
```

### Installation Steps (performed automatically)

1. Verify connectivity to the HiveArmor server on ports 9000, 9001, and 50051
2. Download the dependency manifest (`version.json`) from the server
3. Download the AS/400 collector JAR (`as400-collector.jar`)
4. Download the updater binary (`hivearmor_as400_updater_service`)
5. Install the Java Runtime Environment if not already present
6. Register the collector with HiveArmor's Agent Manager over gRPC
7. Save and AES-encrypt the configuration to `config.yml`
8. Initialize the SQLite log retention policy
9. Create and enable the `HiveArmorAS400Collector` systemd service
10. Install and enable the `HiveArmorAS400Updater` systemd service

---

## Configuration of AS/400 Servers

AS/400 server configuration is managed **entirely from the HiveArmor panel** — there is no local config file to edit. After installation the collector opens a persistent gRPC stream to the Agent Manager. When you add, update, or remove AS/400 sources in the panel the new configuration is pushed to the collector automatically.

Each AS/400 source requires the following fields:

| Field | Description |
|---|---|
| **Tenant** | Logical group or identifier name for this AS/400 instance |
| **Hostname** | IP address or hostname of the AS/400 system |
| **User ID** | User account used to connect to the AS/400 |
| **Password** | Connection password (encrypted with AES before being written to disk) |

If all AS/400 sources are removed from the panel the collector stops the JAR subprocess and removes the local server configuration file until new sources are added.

---

## CLI Reference

The collector binary accepts the following subcommands:

```
hivearmor_as400_collector <command> [args]
```

| Command | Description |
|---|---|
| `install <server> <key> <insecure>` | Install and register the collector as a system service |
| `run` | Start the collector (invoked by systemd; not normally called directly) |
| `change-retention <megabytes>` | Update the maximum size of the local SQLite log buffer (in MB) |
| `clean-logs` | Manually remove log entries that exceed the current retention limit |
| `uninstall` | Deregister the collector, remove both system services, and delete config |
| `help` | Print this command reference |

### Examples

```bash
# Install
sudo ./hivearmor_as400_collector install ha.example.com myregkey no

# Limit local log buffer to 500 MB
sudo ./hivearmor_as400_collector change-retention 500

# Remove the collector completely
sudo ./hivearmor_as400_collector uninstall
```

---

## Local File Layout

All files are stored relative to the collector's working directory (the directory containing the binary).

| Path | Purpose |
|---|---|
| `config.yml` | Encrypted collector configuration (server address, collector ID, key) |
| `uuid.yml` | Per-installation UUID used to derive the AES encryption key |
| `retention.json` | Local log retention limit in megabytes |
| `logs_process/logs.db` | SQLite queue of pending log batches |
| `local_storage/server.json` | Cached AS/400 server list written by the config stream |
| `as400-collector.jar` | Java-based AS/400 connector managed as a subprocess |
| `hivearmor_as400_updater_service` | Auto-update companion binary |
| `version.json` | Current version manifest (`version` and `jar_version`) |
| `logs/hivearmor_as400.log` | Collector service log |

---

## System Services

Two systemd services are installed:

| Service Name | Binary | Role |
|---|---|---|
| `HiveArmorAS400Collector` | `hivearmor_as400_collector` | Main collection service; manages the JAR subprocess and gRPC streams |
| `HiveArmorAS400Updater` | `hivearmor_as400_updater_service` | Polls the HiveArmor server for binary updates and applies them |

Both services are configured with `Restart=always` and start automatically after the network is available.

---

## Auto-Updates

The `HiveArmorAS400Updater` service handles version management without operator intervention:

1. Periodically downloads `version.json` from the HiveArmor server over port 9001
2. Compares the remote version against the locally installed version
3. If an update is available, downloads the new collector binary and JAR
4. Performs a rolling restart of `HiveArmorAS400Collector`

No manual binary updates are required during normal operation.

---

## Security Notes

- AS/400 credentials are never stored in plaintext. Passwords are AES-encrypted using a key derived from the collector's installation UUID (`uuid.yml`) and a build-time secret injected at compile time via ldflags (`REPLACE_KEY`).
- All communication with the HiveArmor server uses TLS. The `insecure: true` flag in `config.yml` (set via the `yes` argument at install time) disables certificate validation and should only be used in development or air-gapped environments with self-signed certificates.
- The collector registers with HiveArmor's Agent Manager using a one-time registration key. After registration the key is discarded and subsequent authentication uses the collector's unique ID and AES-encrypted key stored in `config.yml`.
- Log data in transit uses the HiveArmor gRPC log forwarding protocol on port 50051 with TLS.

---

## Troubleshooting

### Collector fails to start with "service is not installed"

Run the `install` subcommand first. The `run` command requires the systemd service entry to exist.

### "Error trying to connect to server"

Verify that ports 9000, 9001, and 50051 are open between the collector host and the HiveArmor server. Check firewall rules on both ends.

### No logs appearing in HiveArmor

1. Check that at least one AS/400 source is configured in the HiveArmor panel.
2. Confirm the AS/400 host is reachable from the collector host.
3. Review `logs/hivearmor_as400.log` for JAR subprocess errors.
4. Verify `/hivearmor.yaml` exists on the host (required pre-condition).

### Log buffer growing unbounded

Run `change-retention` to cap the SQLite database size, then `clean-logs` to immediately enforce the new limit.

---

## Compatibility

| HiveArmor Version | Collector Version | Support Status |
|---|---|---|
| v11.x | 1.0.x | Supported (LTS until Nov 2030) |
| v10.x | — | End of support Jul 2026 |

---

## Support and Resources

| Resource | URL |
|---|---|
| Documentation | https://docs.hivearmor.io |
| GitHub | https://github.com/hivearmor |
| Support | support@hivearmor.io |

---

## License

HiveArmor AS400 Collector is part of the HiveArmor platform. Community and Enterprise license tiers are available. See the root repository LICENSE file for terms.