# HiveArmor Installer

> **Hyper-scale Incident Visibility Engine** — automated stack deployment for Linux servers.

The HiveArmor installer is a self-contained Go binary that provisions a production-ready HiveArmor SIEM/XDR instance from a bare Linux server in a single command. It handles every step of first-run setup: prerequisite validation, Docker installation, TLS certificate generation, image pull, environment configuration, service startup, and CM server registration.

---

## Table of Contents

- [Supported Platforms](#supported-platforms)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [What the Installer Does](#what-the-installer-does)
- [Services Started](#services-started)
- [CM Server Registration](#cm-server-registration)
- [Auto-Update](#auto-update)
- [Post-Install Access](#post-install-access)
- [Building from Source](#building-from-source)
- [Troubleshooting](#troubleshooting)
- [Support](#support)

---

## Supported Platforms

| Distribution | Versions |
|---|---|
| Ubuntu | 22.04 LTS, 24.04 LTS |
| Debian | 12 (Bookworm) |
| RHEL | 8, 9 |
| Rocky Linux | 8, 9 |
| AlmaLinux | 8, 9 |

Minimum hardware: 8 CPU cores, 16 GB RAM, 200 GB SSD. A dedicated server or VM is strongly recommended. Do not install on a shared host.

---

## Prerequisites

- 64-bit Linux on a supported distribution (see above)
- Root access (or `sudo` elevation)
- Outbound internet access on ports 80, 443 (image pull, CM registration, TLS certificate issuance)
- Inbound ports that must be open before running the installer:

| Port | Protocol | Service |
|---|---|---|
| 443 | TCP | HiveArmor UI / API (HTTPS) |
| 9000 | TCP | AgentManager gRPC (agent enrollment) |
| 9001 | TCP | AgentManager gRPC TLS |
| 514 | UDP/TCP | Syslog ingestion (hivearmor-collector) |

A valid FQDN pointing to the server is required if you want a signed TLS certificate. A self-signed certificate is generated automatically if no domain is provided.

---

## Quick Start

Download the latest installer binary from the [HiveArmor releases page](https://github.com/hivearmor/releases) and run it as root:

```bash
# Download
curl -fsSL https://github.com/hivearmor/releases/latest/download/hivearmor-installer-linux-amd64 \
  -o hivearmor-installer
chmod +x hivearmor-installer

# Run as root
sudo ./hivearmor-installer install \
  --host your-server.example.com \
  --license YOUR_LICENSE_KEY
```

The installer is interactive by default. Provide `--non-interactive` to suppress all prompts (CI/automated deployments):

```bash
sudo ./hivearmor-installer install \
  --host your-server.example.com \
  --license YOUR_LICENSE_KEY \
  --non-interactive
```

**Alpha / staging deployments** use the `--env alpha` flag, which points registration at `cmdev.onlyhacker.org` instead of the production CM server:

```bash
sudo ./hivearmor-installer install \
  --host your-server.example.com \
  --license YOUR_LICENSE_KEY \
  --env alpha
```

---

## What the Installer Does

The installer runs the following steps in order. Each step is logged to `/var/log/hivearmor/install.log`.

### 1. Prerequisite Validation

- Checks the OS distribution and version against the supported matrix
- Verifies CPU cores, RAM, and available disk space
- Confirms required ports are not already bound
- Checks outbound connectivity to `ghcr.io`, `cm.onlyhacker.org` (or `cmdev.onlyhacker.org`), and `letsencrypt.org`

### 2. Docker Installation

- Detects whether Docker Engine is already present
- If absent, installs Docker Engine from the official Docker repository for the detected distro
- Enables and starts the `docker` system service
- Installs Docker Compose v2 plugin

### 3. TLS Certificate Generation

- If `--host` resolves to the local machine and port 80 is available, obtains a Let's Encrypt certificate via the ACME HTTP-01 challenge
- Otherwise generates a 4096-bit RSA self-signed certificate valid for 10 years
- Certificates are written to `/opt/hivearmor/certs/`

### 4. Environment Configuration

- Generates cryptographically random values for `INTERNAL_KEY`, `JWT_SECRET`, and `DB_PASSWORD`
- Writes `/opt/hivearmor/.env` with all service environment variables
- Creates the Docker Compose project directory at `/opt/hivearmor/`

### 5. Image Pull

- Pulls all required Docker images from `ghcr.io/hivearmor/` for the installed release version
- Verifies image digests against the manifest published on the CM server

### 6. Service Startup

- Writes the production Docker Compose file to `/opt/hivearmor/docker-compose.yml`
- Starts all services via `docker compose up -d`
- Waits for health checks on each service (configurable timeout: 5 minutes)
- Installs a systemd unit (`hivearmor.service`) that starts the stack on boot

### 7. CM Server Registration

Registers the new instance with the CM server and activates the provided license key (see [CM Server Registration](#cm-server-registration) below).

---

## Services Started

| Container name | Image | Role |
|---|---|---|
| `hivearmor-backend` | `ghcr.io/hivearmor/backend` | REST API (Java 17 / Spring Boot 3.3), PostgreSQL via Liquibase, scheduled workers |
| `hivearmor-frontend` | `ghcr.io/hivearmor/frontend` | Next.js 14 UI, served on port 443 behind nginx |
| `event-processor` | `ghcr.io/hivearmor/event-processor` | Go-based log correlation engine; YAML rules + filters, CEL expressions |
| `agent-manager` | `ghcr.io/hivearmor/agent-manager` | gRPC agent registry (ports 9000/9001), manages agent enrollment and commands |
| `hivearmor-collector` | `ghcr.io/hivearmor/collector` | Syslog/UDP/TCP ingestion from network devices and appliances |
| `opensearch` | `ghcr.io/hivearmor/opensearch` | Log event storage; index pattern `_v3_hive_<type>-YYYY.MM.DD` |
| `postgresql` | `ghcr.io/hivearmor/postgresql` | Application database (users, rules, incidents, dashboards, agent registry) |

Plugin binaries (`com.hivearmor.<name>.plugin`) are bundled inside the `event-processor` image. All 17 plugins — including `alerts`, `aws`, `azure`, `o365`, `crowdstrike`, `sophos`, `gcp`, `soc-ai`, `geolocation`, and others — are activated based on your license tier.

---

## CM Server Registration

After the stack is healthy, the installer registers the instance with the HiveArmor Central Management (CM) server. Registration:

- Uses **HMAC-SHA256** request signing. The shared secret (`CM_ENCRYPT_SALT`) is injected at installer build time and never transmitted over the network.
- Sends the server hostname, OS fingerprint, installer version, and license key.
- Receives an instance token stored in `/opt/hivearmor/.instance-token`. This token is used by the running stack for subsequent CM communication (update checks, telemetry, license refresh).

| Environment | CM Endpoint |
|---|---|
| Production | `https://cm.onlyhacker.org` |
| Alpha / staging | `https://cmdev.onlyhacker.org` |

The production CM endpoint is used by default. Pass `--env alpha` to use the staging endpoint.

---

## Auto-Update

Once registered, the HiveArmor stack checks the CM server for available updates on a configurable schedule (default: every 6 hours). Updates are applied as rolling container replacements with zero downtime:

1. New image tags are pulled in the background while the current version continues running.
2. Containers are replaced one at a time in dependency order (database and OpenSearch last).
3. If any replacement fails a health check, the previous image is automatically restored.

The auto-update behavior can be configured in `/opt/hivearmor/.env`:

```dotenv
# Disable auto-updates entirely
HA_AUTO_UPDATE=false

# Check interval in minutes (default 360)
HA_UPDATE_CHECK_INTERVAL=360
```

To apply updates manually:

```bash
sudo hivearmor-installer update
```

---

## Post-Install Access

| Service | URL | Default credentials |
|---|---|---|
| HiveArmor UI | `https://<your-host>/` | `admin` / *(set during install)* |
| Backend API | `https://<your-host>/api/ha-*` | JWT Bearer (obtain via UI login) |
| OpenSearch Dashboards | `https://<your-host>:5601/` | `admin` / *(generated, see `.env`)* |

The admin password is displayed once at the end of installation and stored (hashed) in the PostgreSQL database. It is not recoverable from the installer after first run; use the UI's password reset if lost.

Agent enrollment: download the HiveArmor agent from the UI under **Settings > Agents** and run it on the target endpoint. The agent connects back to `<your-host>:9000` using the enrollment key shown in the UI. Service names on the endpoint are `HiveArmorAgent` (Windows) or `hivearmor-agent` (Linux/macOS).

---

## Building from Source

The installer requires two ldflags to be injected at build time by CI. Builds without these flags will start but cannot authenticate with the agent fleet or the CM server.

```bash
go build \
  -ldflags "-X main.ReplaceKey=${REPLACE_KEY} -X main.CmEncryptSalt=${CM_ENCRYPT_SALT}" \
  -o hivearmor-installer \
  ./cmd/installer
```

| ldflag | Purpose |
|---|---|
| `main.ReplaceKey` (`REPLACE_KEY`) | Shared secret embedded in agent and collector binaries; used for agent-to-AgentManager gRPC mutual auth |
| `main.CmEncryptSalt` (`CM_ENCRYPT_SALT`) | HMAC salt for CM server request signing |

Both values are secrets managed by CI. Do not commit them to source control. Local development builds work without them but will fail agent enrollment and CM registration.

Go 1.25.5 or later is required. The installer module path is `github.com/hivearmor/installer`.

```bash
cd installer
go test ./...
go vet ./...
```

---

## Troubleshooting

**Installation log**

All output is tee'd to `/var/log/hivearmor/install.log`. Attach this file when opening a support ticket.

**Check service status**

```bash
cd /opt/hivearmor && docker compose ps
docker compose logs --tail=100 hivearmor-backend
```

**Restart the full stack**

```bash
sudo systemctl restart hivearmor
```

**Re-run a failed installation**

The installer is idempotent. Re-run the original command; completed steps are skipped.

**Port conflicts**

If a required port is already bound, the installer will exit with an error listing the conflicting process. Stop the conflicting service or change its port before re-running.

**Time synchronization**

JWT validation and log correlation are sensitive to clock skew. Ensure `chronyd` or `systemd-timesyncd` is running and the server clock is accurate to within 30 seconds.

---

## Version Policy

| Series | Status | Support ends |
|---|---|---|
| v11.x | Current LTS | November 2030 |
| v10.x | End of life | July 2026 |

Security patches are backported to the current LTS release. New features ship on `main` and are tagged into the next minor release.

---

## Support

| Channel | Details |
|---|---|
| Documentation | https://docs.hivearmor.io |
| Community issues | https://github.com/hivearmor/hivearmor/issues |
| Enterprise support | support@hivearmor.io |
| Security disclosures | security@hivearmor.io (PGP key on docs site) |

---

*HiveArmor is available under community (free) and enterprise license tiers. See [https://docs.hivearmor.io/licensing](https://docs.hivearmor.io/licensing) for feature comparison.*