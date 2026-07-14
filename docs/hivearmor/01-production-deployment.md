# HiveArmor — Production Deployment Guide

**Audience:** Infrastructure / DevOps engineers  
**Version:** v1.x

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Server Sizing](#2-server-sizing)
3. [Install the HiveArmor Stack](#3-install-the-hivearmor-stack)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [TLS / Certificate Setup](#5-tls--certificate-setup)
6. [Firewall Rules](#6-firewall-rules)
7. [First Login & Admin Password](#7-first-login--admin-password)
8. [Health Checks](#8-health-checks)
9. [Upgrading](#9-upgrading)
10. [Backup & Restore](#10-backup--restore)
11. [Uninstall](#11-uninstall)
12. [Production Checklist](#12-production-checklist)

---

## 1. Prerequisites

### Operating System
| Platform | Supported versions |
|---|---|
| Ubuntu | 22.04 LTS, 24.04 LTS |
| Debian | 12 (Bookworm) |
| RHEL / Rocky / AlmaLinux | 8, 9 |

> Windows Server is **not** supported for the server stack. Windows is only supported for agent endpoints.

### Required software on the host
| Software | Version | Notes |
|---|---|---|
| Docker Engine | 24+ | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose plugin | v2.20+ | Included with Docker Engine |
| `openssl` | any | For key generation |
| `curl` / `wget` | any | For health checks |

### Hardware (minimum — production)
| Component | Minimum | Recommended |
|---|---|---|
| CPU | 8 cores | 16 cores |
| RAM | 16 GB | 32 GB |
| OS disk | 50 GB SSD | 100 GB SSD |
| Data disk | 500 GB | 2 TB+ NVMe |

> OpenSearch is the largest consumer: allocate at least 50% of RAM to the JVM heap (set via `OPENSEARCH_JAVA_OPTS`).

---

## 2. Server Sizing

| Logs/day | RAM | CPU | Disk (3-month retention) |
|---|---|---|---|
| < 1 M events | 16 GB | 8 cores | 500 GB |
| 1–10 M events | 32 GB | 16 cores | 2 TB |
| 10–50 M events | 64 GB | 32 cores | 8 TB |
| > 50 M events | 128 GB+ | 64 cores | Scale-out required |

For scale-out, run a dedicated OpenSearch cluster and point all services to it via `ELASTICSEARCH_HOST`.

---

## 3. Install the HiveArmor Stack

### Option A — Automated installer (recommended)

The `installer` binary handles Docker installation, TLS certificate generation, and first-run setup:

```bash
# Download the latest release
curl -fsSL https://github.com/hivearmor/hivearmor/releases/latest/download/installer-linux-amd64 \
  -o /usr/local/bin/hivearmor-installer
chmod +x /usr/local/bin/hivearmor-installer

# Install (run as root or with sudo)
sudo hivearmor-installer --install
```

What the installer does:
1. Checks / installs Docker if missing
2. Generates a self-signed TLS certificate for `SERVER_NAME`
3. Writes `/root/hivearmor.yml` with generated secrets
4. Pulls all container images from `ghcr.io/hivearmor/`
5. Starts all services via Docker Compose
6. Prints the auto-generated admin password

After installation, access the UI at `https://<your-server-ip>` with username `admin` and the printed password.

---

### Option B — Manual Docker Compose

Use this when you need more control (custom TLS, different data paths, air-gap deployments).

#### 3.1 Clone the repository

```bash
git clone https://github.com/hivearmor/hivearmor.git /opt/hivearmor
cd /opt/hivearmor/local-dev
```

#### 3.2 Generate TLS certificates

```bash
# Create certs directory
mkdir -p certs

# Generate CA
openssl genrsa -out certs/ca.key 4096
openssl req -x509 -new -nodes -key certs/ca.key -sha256 -days 3650 \
  -out certs/ca.crt -subj "/CN=HiveArmor CA"

# Generate server cert (replace YOUR_SERVER_IP or FQDN)
SERVER_NAME=hivearmor.yourdomain.com
openssl genrsa -out certs/opensearch.key 2048
openssl req -new -key certs/opensearch.key \
  -out certs/opensearch.csr \
  -subj "/CN=${SERVER_NAME}"
openssl x509 -req -in certs/opensearch.csr \
  -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -out certs/opensearch.crt -days 3650 -sha256 \
  -extfile <(echo "subjectAltName=DNS:${SERVER_NAME},IP:127.0.0.1")
```

#### 3.3 Create `.env` from the example

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values (see [Section 4](#4-environment-variables-reference)).

#### 3.4 Start the stack

```bash
# Pull images first (avoids timeout on first start)
docker compose pull

# Start all services
docker compose up -d

# Follow startup logs
docker compose logs -f --tail=50
```

Services start in this order (enforced by `depends_on`):
1. `postgres` → `opensearch`
2. `agentmanager` (needs postgres)
3. `backend` (needs postgres, opensearch, agentmanager)
4. `eventprocessor` (needs postgres, opensearch, backend)
5. `user-auditor` (needs postgres, opensearch)
6. `web-pdf` (needs backend)
7. `frontend-v2` (needs backend)

Allow **3–5 minutes** for OpenSearch to initialize on first start.

---

## 4. Environment Variables Reference

All variables are set in `local-dev/.env`. Required for production:

| Variable | Required | Description | Example |
|---|---|---|---|
| `SERVER_NAME` | ✅ | FQDN or IP of the server (for TLS SAN and links) | `siem.acme.com` |
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL admin password | `openssl rand -hex 32` |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | ✅ | OpenSearch admin password (8+ chars, mixed case, digit, symbol) | `MyStr0ng!Pass` |
| `INTERNAL_KEY` | ✅ | Shared secret between backend, agent-manager, event-processor | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | ✅ | JWT signing key + config encryption key | `openssl rand -base64 64` |
| `EVENTPROCESSOR_INJECT_KEY` | ✅ | API key for the event processor inject endpoint | `openssl rand -hex 32` |
| `APP_TFA_ENABLED` | ✅ | Two-factor auth. **Must be `true` in production** | `true` |
| `JHIPSTER_CORS_ALLOWED_ORIGINS` | ✅ | Comma-separated allowed CORS origins | `https://siem.acme.com` |

> **Security note:** `INTERNAL_KEY` and `ENCRYPTION_KEY` must be identical across all services. Changing `ENCRYPTION_KEY` invalidates all active JWT sessions.

### Generating secure values

```bash
# INTERNAL_KEY / EVENTPROCESSOR_INJECT_KEY
openssl rand -hex 32

# ENCRYPTION_KEY (longer, base64)
openssl rand -base64 64

# POSTGRES_PASSWORD / OPENSEARCH password
openssl rand -base64 24 | tr -dc 'a-zA-Z0-9!@#$%' | head -c 20
```

---

## 5. TLS / Certificate Setup

### Using your own certificate (CA-signed or Let's Encrypt)

Replace the self-signed certs in `local-dev/certs/`:

```bash
# Copy your certificate files
cp /path/to/your/server.crt local-dev/certs/opensearch.crt
cp /path/to/your/server.key local-dev/certs/opensearch.key
cp /path/to/your/ca-bundle.crt local-dev/certs/ca.crt

# Restart services that use the certs
docker compose restart opensearch agentmanager backend
```

### Let's Encrypt with Certbot

```bash
certbot certonly --standalone -d siem.acme.com
cp /etc/letsencrypt/live/siem.acme.com/fullchain.pem local-dev/certs/opensearch.crt
cp /etc/letsencrypt/live/siem.acme.com/privkey.pem local-dev/certs/opensearch.key
cp /etc/letsencrypt/live/siem.acme.com/chain.pem local-dev/certs/ca.crt
docker compose restart opensearch agentmanager backend
```

---

## 6. Firewall Rules

### Inbound (what external systems need to reach)

| Port | Protocol | Service | Source |
|---|---|---|---|
| 443 / 80 | TCP | UI (via nginx/reverse proxy) | End users |
| 3000 | TCP | Next.js UI (direct, no proxy) | End users |
| 9000 | TCP/gRPC | Agent Manager (agent registration) | Endpoint agents |
| 9001 | TCP/gRPC | Agent Manager (agent heartbeat) | Endpoint agents |
| 8088 | TCP | Backend API (optional, only if no proxy) | Admins |
| 514 | UDP/TCP | Syslog intake (hivearmor-collector) | Network devices, servers |

### Internal / same-host only (block externally)
| Port | Service |
|---|---|
| 5432 | PostgreSQL |
| 9200 | OpenSearch |
| 5601 | OpenSearch Dashboards (**remove in production**) |
| 8080 | Backend (internal Docker network) |
| 9090 | Agent Manager admin |
| 50051 | Event Processor gRPC (agent intake) |

---

## 7. First Login & Admin Password

### Automated installer
The admin password is printed at the end of installation. It is also stored in `/root/hivearmor.yml`.

### Manual setup
The backend auto-generates an admin user on first start. The password is printed in the backend container logs:

```bash
docker compose logs backend | grep -i "admin.*password\|default.*password"
```

### Changing the admin password
1. Log in at `https://<SERVER_NAME>/login`
2. Navigate to **Administration → User Management**
3. Click on the `admin` user → **Change Password**

---

## 8. Health Checks

Quick check that all services are up:

```bash
# One-liner status
docker compose ps

# Individual health check endpoints
curl -sf http://localhost:8088/api/healthcheck && echo "Backend OK"
curl -sk https://localhost:9200/_cluster/health \
  -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" | python3 -m json.tool
curl -sf http://localhost:3000/login | grep -q "HiveArmor" && echo "Frontend OK"
```

### Service dependency order

If services fail to start, check in this order:
1. `postgres` — must be healthy before anything else
2. `opensearch` — slowest to start (1–2 min); backend will retry
3. `agentmanager` — depends on postgres
4. `backend` — depends on all three above
5. Everything else

---

## 9. Upgrading

```bash
cd /opt/hivearmor

# 1. Pull the new images (replace TAG with the new version)
export HIVEARMOR_TAG=v1.2.0
docker compose pull

# 2. Stop and restart with zero-downtime rolling update
# Backend and frontend can be restarted independently
docker compose up -d --no-deps backend frontend-v2

# 3. Verify
docker compose ps
docker compose logs backend --tail=30
```

> **Schema migrations** run automatically on backend startup via Liquibase. No manual SQL needed. Always back up PostgreSQL before upgrading.

---

## 10. Backup & Restore

### PostgreSQL backup

```bash
# Backup (run from host)
docker compose exec postgres pg_dumpall -U postgres \
  > /backup/hivearmor-$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U postgres \
  < /backup/hivearmor-20260101.sql
```

### OpenSearch snapshot backup

```bash
# Create snapshot (run in OpenSearch Dashboards Dev Tools or curl)
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<PASS>","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id_token'])")

# Trigger snapshot via backend API
curl -X POST http://localhost:8088/api/ha-opensearch/snapshot \
  -H "Authorization: Bearer $TOKEN"
```

Snapshot data is stored in the `opensearch_backups` Docker volume, mounted at `/usr/share/opensearch/backups`.

---

## 11. Uninstall

```bash
# Using the installer
sudo hivearmor-installer --uninstall

# Manual
cd /opt/hivearmor/local-dev
docker compose down -v    # -v removes all volumes (destroys all data)
docker compose down       # keep volumes (data preserved)
```

---

## 12. Production Checklist

Before going live, verify each item:

- [ ] `APP_TFA_ENABLED=true` — two-factor auth is on
- [ ] `JHIPSTER_CORS_ALLOWED_ORIGINS` set to your exact domain (not `*`)
- [ ] `INTERNAL_KEY` is a random 32-byte hex value (not the example)
- [ ] `ENCRYPTION_KEY` is a random base64-64 value (not the example)
- [ ] OpenSearch Dashboards service **removed** from docker-compose (dev only, exposes full cluster access)
- [ ] Port 5601 (Dashboards), 5432 (Postgres), 9200 (OpenSearch) firewalled from external access
- [ ] TLS certificate is valid and trusted (CA-signed or Let's Encrypt)
- [ ] Admin password changed from default
- [ ] Backup job scheduled for PostgreSQL (daily minimum)
- [ ] OpenSearch index lifecycle policy active (ISM policy `hivearmor_ism_policy` auto-deletes old indices)
- [ ] Docker resource limits reviewed for your hardware (memory limits in docker-compose.yml)
- [ ] Log rotation configured on the host for Docker daemon logs (`/etc/docker/daemon.json` → `log-opts`)
- [ ] Known security issues from [SEC-FIXES.md](../../.plan/features/SEC-FIXES.md) reviewed and accepted or mitigated