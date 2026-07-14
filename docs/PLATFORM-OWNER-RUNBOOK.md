# HiveArmor Platform Owner Runbook

> **Audience**: DevOps and infrastructure engineers operating the HiveArmor platform.
> **Version**: v11.x (LTS — supported until November 2030).
> **Last updated**: July 2026

---

## Table of Contents

1. [Repository & Branch Strategy](#1-repository--branch-strategy)
2. [Local Development Setup](#2-local-development-setup)
3. [Building Each Component](#3-building-each-component)
4. [CI/CD Pipeline](#4-cicd-pipeline)
5. [GitHub Secrets & Variables Reference](#5-github-secrets--variables-reference)
6. [Container Registry Setup](#6-container-registry-setup)
7. [Hosting & Deployment](#7-hosting--deployment)
8. [Merging Code Changes (PR Workflow)](#8-merging-code-changes)
9. [Agent Distribution](#9-agent-distribution)
10. [Secrets & Credentials Management](#10-secrets--credentials-management)
11. [Known Technical Debt](#11-known-technical-debt)

---

## 1. Repository & Branch Strategy

### GitHub organisation and repository

- GitHub org: **HiveArmor**
- Repository: `https://github.com/hivearmor/hivearmor`
- Container registry: `ghcr.io/hivearmor/`

### Branch model

| Branch | Purpose | CI trigger |
|---|---|---|
| `main` | Stable production code | PR merge only |
| `release/v1.*` | Pre-release builds | Push → Docker build + image publish |
| `feature/*` | Feature development | PR checks only |
| `fix/*` | Hotfix branches | PR checks only |

### PR targets

All PRs must target `main` or `release/*`. Never push directly to `main`.

---

## 2. Local Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Node.js | **20 LTS** | `nvm install 20 && nvm use 20` |
| Java | **17** (Temurin) | `brew install --cask temurin@17` |
| Maven | **3.9.x** | `brew install maven` |
| Go | **1.25.5** | https://go.dev/dl/ |
| nvm | Latest | https://github.com/nvm-sh/nvm |

### Clone and first-time setup

```bash
git clone https://github.com/hivearmor/hivearmor.git
cd hivearmor

# Next.js frontend (active UI)
cd frontend-v2 && npm install && cd ..

# Backend — requires a GitHub PAT with read:packages on the hivearmor org
export MAVEN_TK=ghp_your_github_pat
cd backend && mvn -s settings.xml dependency:resolve && cd ..
```

### Start the full stack locally

```bash
cd local-dev
cp .env.example .env
# Edit .env — fill in all required values (see Section 5)
# Set APP_TFA_ENABLED=false for local dev to skip the TFA challenge
docker compose up -d
```

Local access points:

| Service | URL | Credentials |
|---|---|---|
| HiveArmor UI (Next.js) | http://localhost:3000 | admin / localdev123! |
| Backend API | http://localhost:8088 | admin / localdev123! |
| OpenSearch Dashboards | http://localhost:5601 | admin / LocalDev@2024! |
| PostgreSQL | localhost:5438 | postgres / localdev123! |
| AgentManager gRPC | localhost:9000 | — |

### Start the Next.js dev server (hot reload)

```bash
cd frontend-v2
nvm use 20
npm run dev
# Serves at http://localhost:3000
```

### Start the backend dev server

```bash
cd backend
export MAVEN_TK=ghp_your_github_pat
mvn -s settings.xml -B
# Serves at http://localhost:8080 (proxied to 8088 by docker-compose)
```

### Get an API token for curl testing

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

---

## 3. Building Each Component

### Frontend v2 (Next.js)

```bash
cd frontend-v2
nvm use 20
npm install

# Development server
npm run dev

# Production build (output: .next/standalone)
npm run build

# Lint
npm run lint

# Tests (Vitest)
npm run test
```

### Backend (Java)

```bash
cd backend
export MAVEN_TK=ghp_your_github_pat   # GitHub PAT — read:packages on hivearmor org

# Development server
mvn -s settings.xml -B

# Production WAR
mvn -B -Pprod clean package -s settings.xml -Drevision=11.0.0
# Output: target/hivearmor.war

# Validate Liquibase migrations (run before every schema change PR)
mvn -s settings.xml liquibase:validate

# Run tests
mvn -s settings.xml test
```

The `settings.xml` authenticates to `https://maven.pkg.github.com/hivearmor/**` using `MAVEN_TK`. The `pom.xml` `groupId` is `com.hivearmor`.

> **Schema change rule**: Liquibase changesets are immutable once merged. Never edit a shipped changeset — only add new ones. New columns must have a default value or be nullable. Follow the naming convention `backend/src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml` and register in `master.xml` in strict date order.

### Agent (Go — requires ldflags)

The agent binary must be compiled with `REPLACE_KEY` injected via ldflags. Every agent deployed in the field is compiled with this key. **Changing it requires reinstalling all deployed agents.** Store the value in GitHub Secrets as `AGENT_SECRET_PREFIX`.

```bash
cd agent
export AGENT_SECRET="your-32-char-hex-secret"   # same as AGENT_SECRET_PREFIX in GitHub Secrets

# Linux amd64
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -o hivearmor_agent_service_linux_amd64 \
  -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# Linux arm64
GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
  go build -o hivearmor_agent_service_linux_arm64 \
  -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# Windows amd64
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -o hivearmor_agent_service_windows_amd64.exe \
  -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# Windows arm64
GOOS=windows GOARCH=arm64 CGO_ENABLED=0 \
  go build -o hivearmor_agent_service_windows_arm64.exe \
  -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# macOS arm64
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 \
  go build -o hivearmor_agent_service_darwin_arm64 \
  -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# Updater (no ldflags required)
cd updater && GOOS=linux GOARCH=amd64 go build -o hivearmor_updater_service_linux_amd64 .
```

OS service names installed on endpoints:
- Windows: `HiveArmorAgent` (main), `HiveArmorUpdater`
- Linux/macOS: `hivearmor-agent.service` (systemd)

### Agent Manager

```bash
cd agent-manager
go build -o agent-manager -v .
# Then build Docker image via agent-manager/Dockerfile
```

### Collector (hivearmor-collector — requires ldflags)

```bash
cd hivearmor-collector
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -o hivearmor_collector \
  -ldflags "-X 'github.com/hivearmor/hivearmor-collector/config.REPLACE_KEY=${AGENT_SECRET}'" .
```

### Plugins (17)

```bash
for plugin in alerts aws azure bitdefender compliance-orchestrator config crowdstrike events \
              feeds gcp geolocation inputs modules-config o365 soc-ai sophos stats; do
  cd plugins/$plugin
  GOOS=linux GOARCH=amd64 go build -o com.hivearmor.$plugin.plugin -v .
  cd ../..
done
```

> Plugin binaries **must** be named `com.hivearmor.<name>.plugin`. The event processor loads them by this exact convention at startup.

### Installer

```bash
cd installer
go build \
  -ldflags "
    -X 'github.com/hivearmor/installer/config.DEFAULT_BRANCH=prod'
    -X 'github.com/hivearmor/installer/config.INSTALLER_VERSION=11.0.0'
    -X 'github.com/hivearmor/installer/config.REPLACE=${CM_ENCRYPT_SALT}'
    -X 'github.com/hivearmor/installer/config.PUBLIC_KEY=${CM_SIGN_PUBLIC_KEY}'
  " \
  -o hivearmor-installer .
```

The installer binary provisions a fresh server, installs Docker, generates TLS certificates, and deploys the full stack. `CM_ENCRYPT_SALT` and `CM_SIGN_PUBLIC_KEY` are used by the CM integration for instance registration and license verification.

---

## 4. CI/CD Pipeline

### What the pipeline does

`v11-deployment-pipeline.yml`:

1. Determines the version tag (from the branch name or release tag)
2. Queries the Customer Manager (CM) at `cmdev.onlyhacker.org` (dev) or `cm.onlyhacker.org` (prod) for the latest version number
3. Builds all Docker images and pushes to `ghcr.io/hivearmor/`
4. Publishes the new version to CM
5. Schedules a rolling deployment to registered instances via CM

### Pipeline jobs summary

| Job | Purpose |
|---|---|
| `setup_deployment` | Resolves version tag and CM URL based on branch |
| `build_backend` | Builds and pushes `ghcr.io/hivearmor/backend:<tag>` |
| `build_frontend` | Builds and pushes `ghcr.io/hivearmor/frontend-v2:<tag>` |
| `build_agent` | Cross-compiles agent binaries for Linux/Windows/macOS with ldflags |
| `build_agent_manager` | Builds and pushes `ghcr.io/hivearmor/agent-manager:<tag>` |
| `build_eventprocessor` | Builds and pushes `ghcr.io/hivearmor/eventprocessor:<tag>` |
| `build_collector` | Compiles `hivearmor_collector` with ldflags |
| `sign_agent_windows` | Signs Windows binaries (requires GCP KMS + JSign) |
| `sign_agent_macos` | Signs macOS binaries (requires Apple Developer notarytool) |
| `publish_new_version` | Registers the new version with CM |
| `schedule` | Triggers rolling deployment on CM-registered instances |

### Image registry paths

All production images are published to:

```
ghcr.io/hivearmor/backend:<tag>
ghcr.io/hivearmor/frontend-v2:<tag>
ghcr.io/hivearmor/agent-manager:<tag>
ghcr.io/hivearmor/eventprocessor:<tag>
```

Local development images use the `hivearmor/<service>:local` tag built by `docker compose build`.

### Removing agent code signing (if you lack Apple/MS certs)

The `sign_agent_windows` and `sign_agent_macos` jobs require:
- Apple Developer account + notarytool credentials for macOS notarisation
- A Microsoft code-signing certificate via GCP KMS (JSign) for Windows

If these are not available, make `build_agent_manager` depend directly on `build_agent` and remove the signing jobs. Unsigned binaries work on Linux for internal deployments.

### PR checks (`pr-checks.yml`)

Runs on every PR:
- Go dependency vulnerability scan (`_pr-reusable-go-deps.yml`)
- Automated approver bot (`_pr-reusable-approver.yml`)
- Optional AI review (`_pr-reusable-ai-review.yml`)

---

## 5. GitHub Secrets & Variables Reference

Set in **Settings → Secrets and variables → Actions** of the `hivearmor/hivearmor` repository.

### Secrets (sensitive — never logged)

| Secret | What it is | How to generate |
|---|---|---|
| `AGENT_SECRET_PREFIX` | Agent authentication key injected via ldflags into agent and collector binaries | `openssl rand -hex 32` — **choose once, never change** |
| `MAVEN_TK` | GitHub PAT with `read:packages` on the hivearmor org | GitHub → Settings → Developer settings → Personal access tokens → `read:packages` |
| `CM_ENCRYPT_SALT` | Encryption salt used by the installer for CM communication | `openssl rand -hex 16` |
| `CM_SIGN_PUBLIC_KEY` | RSA public key PEM for CM license verification | RSA 2048 or 4096 public key |
| `CM_SERVICE_ACCOUNT_DEV` | JSON `{"id":"...","key":"..."}` for dev CM auth | Issued by CM admin panel at cmdev.onlyhacker.org |
| `CM_SERVICE_ACCOUNT_PROD` | JSON `{"id":"...","key":"..."}` for prod CM auth | Issued by CM admin panel at cm.onlyhacker.org |
| `APPROVER_APP_ID` | GitHub App ID for the PR approver bot | GitHub App registration |
| `APPROVER_PRIVATE_KEY` | GitHub App private key for the PR approver bot | GitHub App registration |

### Variables (non-sensitive — visible in logs)

| Variable | What it is | Example |
|---|---|---|
| `TW_EVENT_PROCESSOR_VERSION_DEV` | Base image tag for event processor (dev builds) | `latest` |
| `TW_EVENT_PROCESSOR_VERSION_PROD` | Base image tag for event processor (prod builds) | `v1.2.3` |
| `GCP_PROJECT_PROD` | GCP project for KMS Windows code signing | `your-gcp-project` |
| `KMS_KEYRING_LOCATION` | GCP KMS keyring location | `global` |
| `KMS_KEYRING_NAME` | GCP KMS keyring name | `code-signing` |
| `KMS_KEY_NAME` | GCP KMS key name | `agent-signing-key` |
| `SCHEDULE_INSTANCES_DEV` | Comma-separated CM instance IDs for dev deployments | `inst-abc123,inst-def456` |
| `SCHEDULE_INSTANCES_PROD` | Comma-separated CM instance IDs for prod deployments | `inst-xyz789` |

### Minimum required secrets

If you are not using agent code signing or the CM deployment automation, you only need:

| Secret | Required for |
|---|---|
| `AGENT_SECRET_PREFIX` | Building agent and collector binaries |
| `MAVEN_TK` | Building the Java backend |

---

## 6. Container Registry Setup

All Docker images are published to GitHub Container Registry (GHCR) under the `hivearmor` org.

### Enable GHCR for the organisation

1. GitHub org → **Settings → Packages**
2. Ensure "Improve container support" is enabled

### First push — package visibility

After the first pipeline run, images are private by default. To make them public:

1. GitHub → HiveArmor org → **Packages**
2. Click each package → **Package Settings** → Change visibility → Public

To keep them private and authenticate the production server:

```bash
echo $GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Image naming convention

```
ghcr.io/hivearmor/<service>:<tag>
```

Services: `backend`, `frontend-v2`, `agent-manager`, `eventprocessor`, `user-auditor`, `web-pdf`

Infrastructure images (PostgreSQL, OpenSearch) are separate stable images. Mirror them to your own registry if you need air-gapped deployments.

---

## 7. Hosting & Deployment

### Supported operating systems

| OS | Versions |
|---|---|
| Ubuntu | 22.04 LTS, 24.04 LTS |
| Debian | 12 |
| RHEL / Rocky Linux / AlmaLinux | 8, 9 |

### Production server requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores | 8 cores |
| RAM | 16 GB | 32 GB |
| Disk | 100 GB SSD | 500 GB SSD |
| Ports | 80, 443, 9000 (gRPC) | — |

For more than 500 deployed agents, provision additional nodes and distribute the event processor load.

### Install Docker on a fresh server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Authenticate to GHCR
echo $GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Automated installation (recommended)

Use the `hivearmor-installer` binary to provision a fresh server. The installer handles Docker installation, TLS certificate generation, stack deployment, and CM instance registration:

```bash
# On the target server
chmod +x hivearmor-installer
./hivearmor-installer
```

### Manual deployment

```bash
# Create the environment file on the server
mkdir -p /opt/hivearmor
cat > /opt/hivearmor/.env << 'EOF'
HIVEARMOR_TAG=v11.1.0
SERVER_NAME=your-server-hostname-or-ip
POSTGRES_PASSWORD=your-strong-password
OPENSEARCH_INITIAL_ADMIN_PASSWORD=YourStr0ng!Password
INTERNAL_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -base64 64)
EVENTPROCESSOR_INJECT_KEY=$(openssl rand -hex 32)
APP_TFA_ENABLED=true
EOF

# Copy docker-compose.yml to the server
scp local-dev/docker-compose.yml user@server:/opt/hivearmor/

# Deploy
ssh user@server "cd /opt/hivearmor && docker compose up -d"
```

### Rolling update (after a new build)

```bash
ssh user@server << 'EOF'
cd /opt/hivearmor
export HIVEARMOR_TAG=v11.2.0
docker compose pull
docker compose up -d --no-deps backend agent-manager eventprocessor frontend-v2
EOF
```

> **Session impact**: Backend restart regenerates the ephemeral JWT signing key, invalidating all active user sessions (tracked as DEBT-14). Schedule backend updates during low-traffic windows and notify users in advance.

### Health checks

```bash
# All services running
ssh user@server "cd /opt/hivearmor && docker compose ps"

# Backend API
curl -s http://localhost:8088/api/healthcheck

# AgentManager gRPC port
nc -zv localhost 9000

# OpenSearch cluster health
curl -sk https://localhost:9200/_cluster/health \
  -u admin:$OPENSEARCH_INITIAL_ADMIN_PASSWORD | python3 -m json.tool | grep status

# Event processor health
curl -sf http://localhost:8090/health
```

---

## 8. Merging Code Changes

### Branch protection rules (required on `main`)

Configure in **Settings → Branches → Add rule** for `main`:

- Require pull request reviews (1 approver minimum)
- Require status checks to pass before merging:
  - Go dependency scan
  - Build check
- Require branches to be up to date before merging
- Do not allow bypassing the above settings

### PR workflow

```
1. Create feature branch from main
   git checkout main && git pull
   git checkout -b feature/my-change

2. Make changes and commit
   git add <specific files> && git commit -m "feat: describe change"

3. Push and open PR
   git push -u origin feature/my-change
   # Open PR on GitHub targeting main

4. CI runs: Go dependency scan, build check
5. At least 1 reviewer approves
6. Squash merge into main
```

### Security-sensitive changes — mandatory test coverage

Never merge to `main` without tests for:
- Auth flows (`security/jwt/`, `SecurityConfiguration.java`)
- SOAR rule evaluation (`UtmAlertResponseRuleService`)
- Alert deduplication (`plugins/alerts/main.go`)
- New REST endpoints (require a happy-path test and a 401 test)

### New endpoint checklist

Every new backend endpoint must have **either** a `@PreAuthorize` annotation or an explicit entry in `SecurityConfiguration.java`. Public endpoints must be explicitly added to the public path list. Audit trail is required for: alert status changes, incident status changes, user login/logout, agent remote commands, API key usage.

### API change rules

All endpoints live at `/api/ha-*`. No API versioning layer. Breaking changes (removed or renamed endpoints or fields) require keeping the old endpoint with a `Deprecation` response header for at least 2 releases. Additive changes are always safe.

---

## 9. Agent Distribution

### How agents reach deployed endpoints

1. The `hivearmor-installer` binary (or the agent binary distributed directly) is compiled with `REPLACE_KEY` baked in via ldflags
2. The agent registers with `agent-manager` on port 9000 over TLS 1.3
3. After registration, the endpoint stores an `id` + `key` pair locally in SQLite
4. All subsequent communication uses `key/id/type` metadata headers

### Building agent binaries for distribution

See Section 3 for the full build commands. Binaries for all platforms are built automatically in CI on every push to `release/*`.

### Distributing agents to endpoints

**Option A — Serve binaries from your server:**

```bash
# Copy built binaries to a web-accessible directory
scp dist/hivearmor_agent_service_* user@server:/var/www/html/agents/

# On the endpoint (Linux)
curl -sSL https://YOUR_SERVER/agents/hivearmor_agent_service_linux_amd64 \
  -o /usr/bin/hivearmor_agent_service
chmod +x /usr/bin/hivearmor_agent_service
hivearmor_agent_service install \
  --connection-key YOUR_CONNECTION_KEY \
  --manager-ip YOUR_SERVER_IP
```

**Option B — Generated install commands from the UI:**

The HiveArmor UI's **Data Sources → Add Agent** screen generates platform-specific install commands automatically once `SERVER_NAME` is correctly set in `.env`.

### Install commands (endpoint side)

**Linux:**

```bash
curl -sSL https://YOUR_SERVER/agents/hivearmor_agent_service_linux_amd64 \
  -o /usr/bin/hivearmor_agent_service
chmod +x /usr/bin/hivearmor_agent_service
hivearmor_agent_service install \
  --connection-key YOUR_CONNECTION_KEY \
  --manager-ip YOUR_SERVER_IP
```

**Windows (PowerShell as Administrator):**

```powershell
Invoke-WebRequest -Uri "https://YOUR_SERVER/agents/hivearmor_agent_service_windows_amd64.exe" `
  -OutFile "C:\hivearmor_agent_service.exe"
C:\hivearmor_agent_service.exe install `
  --connection-key YOUR_CONNECTION_KEY `
  --manager-ip YOUR_SERVER_IP
```

The **connection key** is generated per-agent from the UI under Data Sources → Add Agent.

---

## 10. Secrets & Credentials Management

### Load-bearing secrets — change with extreme caution

| Secret | Where stored | Impact of change |
|---|---|---|
| `INTERNAL_KEY` | `.env` on server + GitHub Secrets | Must restart backend, agent-manager, and eventprocessor simultaneously |
| `AGENT_SECRET_PREFIX` (REPLACE_KEY) | GitHub Secrets + compiled into agent/collector binaries | Every deployed agent and collector must be reinstalled |
| `ENCRYPTION_KEY` | `.env` on server | Encrypted config values stored in the database become unreadable |
| `POSTGRES_PASSWORD` | `.env` on server | All services using PostgreSQL must restart with the new password |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | `.env` on server | All services that query OpenSearch must restart |

### Rotation procedure for INTERNAL_KEY

```bash
# 1. Generate a new key
NEW_KEY=$(openssl rand -hex 32)

# 2. Update .env on the server
sed -i "s/INTERNAL_KEY=.*/INTERNAL_KEY=$NEW_KEY/" /opt/hivearmor/.env

# 3. Restart all three services simultaneously
cd /opt/hivearmor
docker compose up -d --no-deps backend agent-manager eventprocessor

# All active user sessions are invalidated by the JWT key rotation.
# Notify users before doing this.
```

### Secrets storage for the team

Store all production secrets in a team password manager (HashiCorp Vault, 1Password Teams, Bitwarden, or equivalent):

- `AGENT_SECRET_PREFIX` (production value)
- `ENCRYPTION_KEY` (production value)
- `INTERNAL_KEY` (production value)
- `POSTGRES_PASSWORD` (production value)
- All GitHub Secrets values
- CM service account credentials

**Never commit secrets to the repository.** The `.env` file is in `.gitignore`.

### Known open security issues

The following issues are tracked in `.plan/features/SEC-FIXES.md` and `docs/baseline/12-risk-register.md`. Fix them before shipping to production:

| ID | Location | Issue |
|---|---|---|
| SEC-01 | `AccountResource.java` | Password exposed in GET query parameter |
| SEC-02 | `TokenProvider.java` | JWT signing key is ephemeral and rotates on every backend restart (DEBT-14) |
| SEC-03 | Production Spring config | CORS `allowed-origins: '*'` in production config |
| SEC-04 | gRPC client | `InsecureTrustManagerFactory` used for TLS |

---

## 11. Known Technical Debt

| Item | Reference | Priority |
|---|---|---|
| SEC-01 through SEC-04 security fixes | `.plan/features/SEC-FIXES.md` | High — fix before production |
| Ephemeral JWT key (DEBT-14) | `TokenProvider.java` | High — causes user session loss on every backend restart |
| Go test coverage (agent, collector, plugins) | `docs/TEST-PLAN.md` Go section | Medium — add before modifying agent or SOAR code |
| Hibernate 6 JPQL full audit | `docs/baseline/` | Ongoing due diligence |
| Legacy Angular UI in `frontend/` | Scheduled for deletion per CLAUDE.md | Low — do not add new features to it |

---

*For architecture details see `docs/baseline/01-architecture-overview.md`.*
*For the event processor internals see `docs/EVENT-PROCESSOR.md`.*
*Support: support@hivearmor.io | Docs: https://docs.hivearmor.io | GitHub: https://github.com/hivearmor*