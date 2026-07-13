# Platform Owner Runbook

> **Audience**: Development team and infrastructure team who own this fork of UTMStack.  
> **Version**: Post-migration (Phases 0–10 complete). Angular 17, Spring Boot 3.3, Bootstrap 5.  
> **Last updated**: June 2026

---

## Table of Contents

1. [Repository Ownership — What Changes When You Fork](#1-repository-ownership)
2. [Repository & Branch Strategy](#2-repository--branch-strategy)
3. [Local Development Setup](#3-local-development-setup)
4. [Building Each Component](#4-building-each-component)
5. [CI/CD Pipeline — What to Change for Your Repo](#5-cicd-pipeline)
6. [GitHub Secrets & Variables Reference](#6-github-secrets--variables-reference)
7. [Container Registry Setup](#7-container-registry-setup)
8. [Hosting & Deployment](#8-hosting--deployment)
9. [Merging Code Changes (PR Workflow)](#9-merging-code-changes)
10. [Agent Distribution](#10-agent-distribution)
11. [Secrets & Credentials Management](#11-secrets--credentials-management)
12. [Known Deferred Items](#12-known-deferred-items)

---

## 1. Repository Ownership

### What you inherited from the upstream fork

This project was originally `utmstack/UTMStack`. You now own it independently. Here is what still
points to the **original organisation** and must be updated before you push to your own GitHub:

| Item | Original value | What to change to |
|---|---|---|
| `pom.xml` `<groupId>` | `com.atlasinside` | your org's groupId, e.g. `com.yourcompany` |
| `backend/settings.xml` `<url>` | `maven.pkg.github.com/utmstack/**` | `maven.pkg.github.com/YOUR_ORG/**` |
| All `ghcr.io/utmstack/utmstack/...` image refs | `ghcr.io/utmstack/utmstack/` | `ghcr.io/YOUR_ORG/YOUR_REPO/` |
| `reusable-*.yml` username | `utmstack` | your GitHub username or org |
| `local-dev/docker-compose.yml` image tags | `ghcr.io/utmstack/utmstack/` | `ghcr.io/YOUR_ORG/YOUR_REPO/` |
| `v11-deployment-pipeline.yml` CM URLs | `cm.utmstack.com`, `cm.dev.utmstack.com` | your own Customer Manager or remove |
| `installer/` binary — removes CM dependency | n/a | Already resolved in Phase 8 (license-manager-sdk removed) |

> **Priority order**: image registry first, then Maven settings, then CM URLs.

### The Customer Manager (CM) dependency

The original pipeline pushes built images to UTMStack's Customer Manager API to trigger rolling
deployments on their servers. **You do not have access to their CM.** You have two options:

- **Option A (recommended for teams)**: Remove the `publish_new_version` and `schedule` jobs from the
  pipeline. Use your own deployment mechanism (Portainer, Ansible, Watchtower, or manual).
- **Option B**: Build your own lightweight Customer Manager (a REST API that receives version
  notifications and triggers `docker service update` on your server).

---

## 2. Repository & Branch Strategy

### Rename branches for your fork

The original branch names are `v11`, `release/v11*`. Rename them to match your project:

```bash
git checkout v11
git checkout -b main              # rename v11 → main
git push origin main
git push origin --delete v11      # delete old if desired
```

### Recommended branch model

| Branch | Purpose | CI trigger |
|---|---|---|
| `main` | Stable production code | PR merge only |
| `release/v1.*` | Pre-release builds | Push → Docker build |
| `feature/*` | Feature development | PR checks only |
| `fix/*` | Hotfix branches | PR checks only |

### PR targets

All PRs should target `main` or `release/*` — never push directly to `main`.

---

## 3. Local Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Node.js | **20.20.2 LTS** | `nvm install 20 && nvm use 20` |
| Java | **17** (Temurin) | `brew install --cask temurin@17` |
| Maven | **3.9.x** | `brew install maven` |
| Go | **1.26.x** | `brew install go` |
| nvm | Latest | https://github.com/nvm-sh/nvm |

### Clone and first-time setup

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO

# Frontend
cd frontend && nvm use 20 && npm install && cd ..

# Backend — requires GitHub PAT with read:packages for your org's Maven packages
export MAVEN_TK=ghp_your_github_pat
cd backend && mvn -s settings.xml dependency:resolve && cd ..
```

### Start the full stack locally

```bash
cd local-dev
cp .env.example .env
# Edit .env — fill in all required values (see Section 6)
docker compose up -d
```

Access points:
- UI: `https://localhost` or `http://localhost:8880`
- API: `http://localhost:8080`
- OpenSearch: `https://localhost:9200`
- Default admin: `admin` / `(printed to backend logs on first run)`

### Start frontend dev server (hot reload)

```bash
cd frontend
nvm use 20
NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm start
# Serves at http://localhost:4200
```

### Start backend dev server

```bash
cd backend
export MAVEN_TK=ghp_your_github_pat
mvn -s settings.xml -B
# Serves at http://localhost:8080
```

---

## 4. Building Each Component

### Frontend

```bash
cd frontend
nvm use 20
npm install
# Development build
NODE_OPTIONS="--max_old_space_size=8192 --openssl-legacy-provider" npm run build
# Output: frontend/dist/utm-stack/
```

Why `--openssl-legacy-provider`: Angular CLI 17 with the classic webpack builder uses MD4 hashing
which is blocked by OpenSSL 3 (Node 20). This flag is needed until the Angular 18 esbuild builder
is adopted (Phase 5e, deferred).

**Run tests:**
```bash
npm test -- --watch=false
# Expected: TOTAL: 26 SUCCESS
```

### Backend

```bash
cd backend
export MAVEN_TK=ghp_your_github_pat  # GitHub PAT — read:packages on your org

# Development WAR (dev profile)
mvn -s settings.xml -B

# Production WAR
mvn -B -Pprod clean package -s settings.xml -Drevision=11.0.0

# Validate Liquibase migrations before pushing
mvn -s settings.xml liquibase:validate
```

> **Note**: `MAVEN_TK` is used by `settings.xml` to authenticate to GitHub Packages.
> The backend depends on `com.utmstack:opensearch-connector` which is hosted there.
> If you move to your own registry, update `settings.xml` accordingly.
> See `docs/migration/deferred-build-verification.md` for full details.

**Run tests:**
```bash
mvn -s settings.xml test -Dtest=TokenProviderTest,UserJWTControllerTest
# Expected: Tests run: 14, Failures: 0
```

### Agent (Go — requires ldflags)

```bash
cd agent

# Linux amd64
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -o utmstack_agent_service_linux_amd64 \
  -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=YOUR_SECRET_KEY'" .

# Windows amd64
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -o utmstack_agent_service_windows_amd64.exe \
  -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=YOUR_SECRET_KEY'" .

# macOS arm64
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 \
  go build -o utmstack_agent_service_darwin_arm64 \
  -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=YOUR_SECRET_KEY'" .

# Updater (no ldflags needed)
cd updater && GOOS=linux GOARCH=amd64 go build -o utmstack_updater_service_linux_amd64 .
```

> **IMPORTANT**: `REPLACE_KEY` is your agent authentication secret. Every agent deployed in
> the field is compiled with this key. **Changing it requires reinstalling all deployed agents.**
> Choose it once and keep it secret. Store in GitHub Secrets as `AGENT_SECRET_PREFIX`.

### Agent Manager

```bash
cd agent-manager
go build -o agent-manager -v .
# Then build Docker image — see Dockerfile in agent-manager/
```

### Collector

```bash
cd utmstack-collector
GOOS=linux GOARCH=amd64 \
  go build -o utmstack_collector \
  -ldflags "-X 'github.com/utmstack/UTMStack/utmstack-collector/config.REPLACE_KEY=YOUR_SECRET_KEY'" .
```

### Plugins (all 16)

```bash
for plugin in alerts aws azure bitdefender config crowdstrike events feeds gcp geolocation \
              inputs modules-config o365 soc-ai sophos stats; do
  cd plugins/$plugin
  GOOS=linux GOARCH=amd64 go build -o com.utmstack.$plugin.plugin -v .
  cd ../..
done
```

> Plugin binaries **must** be named `com.utmstack.<name>.plugin` — the event processor
> loads them by this convention at startup.

### Installer

```bash
cd installer
go build \
  -ldflags "
    -X 'installer/config.DEFAULT_BRANCH=main'
    -X 'installer/config.INSTALLER_VERSION=1.0.0'
    -X 'installer/config.REPLACE=your-encryption-salt'
    -X 'installer/config.PUBLIC_KEY=your-rsa-public-key-pem'
  " \
  -o utmstack-installer .
```

> The installer binary provisions a fresh Ubuntu 22.04 host, installs Docker Swarm,
> and deploys the entire stack. The `REPLACE` and `PUBLIC_KEY` fields are no longer
> used for licensing (removed in Phase 8), but the build system still expects them.
> Pass any non-empty values.

---

## 5. CI/CD Pipeline

### What the current pipeline does

The pipeline `v11-deployment-pipeline.yml` was designed for UTMStack's original infrastructure:
1. Determines version (from branch name or release tag)
2. Queries their Customer Manager for the latest version number
3. Builds all 8 Docker images and pushes to `ghcr.io/utmstack/utmstack/`
4. Publishes the new version to their Customer Manager
5. Schedules a rolling deployment to their internal servers

### Minimum changes required for your fork

**Step 1 — Update image registry paths in workflow files**

Search and replace all occurrences of `ghcr.io/utmstack/utmstack/` with `ghcr.io/YOUR_ORG/YOUR_REPO/`:

```bash
find .github/workflows -name "*.yml" -exec \
  sed -i '' 's|ghcr.io/utmstack/utmstack/|ghcr.io/YOUR_ORG/YOUR_REPO/|g' {} \;
```

Also update `local-dev/docker-compose.yml` image tags.

**Step 2 — Remove or replace the Customer Manager integration**

Remove these jobs from `v11-deployment-pipeline.yml` (they call `cm.utmstack.com`):
- `publish_new_version`
- `schedule`

Or replace them with your own deployment trigger.

**Step 3 — Remove the version-auto-increment logic**

The `setup_deployment` job queries UTMStack's CM API to auto-increment dev version numbers.
Replace with a simpler version strategy:

```yaml
# Simple replacement — use the branch name + commit SHA
- name: Set version
  id: set-env
  run: |
    SHORT_SHA=$(echo "${{ github.sha }}" | cut -c1-7)
    TAG="${GITHUB_REF_NAME//\//-}-${SHORT_SHA}"
    echo "tag=$TAG" >> $GITHUB_OUTPUT
    echo "environment=dev" >> $GITHUB_OUTPUT
```

**Step 4 — Remove signing workflows (unless you have Apple/MS signing certs)**

The `sign_agent_windows` and `sign_agent_macos` jobs require:
- Apple Developer account + notarytool credentials
- Microsoft code-signing certificate via GCP KMS (JSign)

If you don't have these, make `build_agent_manager` depend directly on `build_agent`
and skip signing. Unsigned binaries work fine on Linux/macOS for internal deployments.

**Step 5 — Update PR checks (`pr-checks.yml`)**

The PR checks call UTMStack's AI review API (ThreatWinds). Remove `ai_review` job and
the `approver` job's `tier3_reviewers` or update to your own reviewers.

Simplest replacement:
```yaml
# Replace ai_review and approver with just a build check
build_check:
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@v4
    - run: echo "PR checks passed"
```

### Minimal working pipeline for your fork

After the above changes, your pipeline does:
1. On push to `release/*`: build all Docker images → push to your GHCR
2. On PR: Go dependency scan + optional AI review

That's sufficient to ship updates to your production server.

---

## 6. GitHub Secrets & Variables Reference

These must be set in **Settings → Secrets and variables → Actions** of your GitHub repository.

### Secrets (sensitive — never logged)

| Secret name | What it is | How to generate |
|---|---|---|
| `AGENT_SECRET_PREFIX` | Agent authentication key injected via ldflags | `openssl rand -hex 32` — **choose once, never change** |
| `MAVEN_TK` | GitHub PAT for `read:packages` on your org's Maven packages | GitHub → Settings → Developer settings → Personal access tokens → `read:packages` |
| `CM_ENCRYPT_SALT` | Installer encryption salt (can be any string if you don't use UTMStack's CM) | `openssl rand -hex 16` |
| `CM_SIGN_PUBLIC_KEY` | RSA public key for installer license verification (unused after Phase 8) | Any RSA public key PEM, or a placeholder |
| `API_SECRET` | ThreatWinds AI review API secret — remove if not using AI review | N/A if removed |
| `THREATWINDS_API_KEY` | ThreatWinds changelog generation | N/A if removed |
| `THREATWINDS_API_SECRET` | ThreatWinds changelog generation | N/A if removed |
| `CM_SERVICE_ACCOUNT_DEV` | JSON `{"id":"...","key":"..."}` for dev CM auth | N/A — remove publish_new_version job |
| `CM_SERVICE_ACCOUNT_PROD` | JSON `{"id":"...","key":"..."}` for prod CM auth | N/A — remove publish_new_version job |
| `APPROVER_APP_ID` | GitHub App ID for the approver bot | N/A if removed |
| `APPROVER_PRIVATE_KEY` | GitHub App private key for the approver bot | N/A if removed |

### Variables (non-sensitive — visible in logs)

| Variable name | What it is | Example |
|---|---|---|
| `TW_EVENT_PROCESSOR_VERSION_DEV` | Base image tag for the event processor (dev) | `latest` |
| `TW_EVENT_PROCESSOR_VERSION_PROD` | Base image tag for the event processor (prod) | `v1.2.3` |
| `GCP_PROJECT_PROD` | GCP project ID for KMS signing | `your-gcp-project` |
| `KMS_KEYRING_LOCATION` | GCP KMS keyring location | `global` |
| `KMS_KEYRING_NAME` | GCP KMS keyring name | `code-signing` |
| `KMS_KEY_NAME` | GCP KMS key name | `agent-signing-key` |
| `SCHEDULE_INSTANCES_DEV` | Comma-separated CM instance IDs for dev | N/A — remove schedule job |
| `SCHEDULE_INSTANCES_PROD` | Comma-separated CM instance IDs for prod | N/A — remove schedule job |

### Minimum required secrets (simplified pipeline)

If you remove the CM, AI review, and signing integrations, you only need:

| Secret | Required for |
|---|---|
| `AGENT_SECRET_PREFIX` | Building agent/collector binaries |
| `MAVEN_TK` | Building the Java backend |

---

## 7. Container Registry Setup

All Docker images are published to GitHub Container Registry (GHCR).

### Enable GHCR for your repository

1. Go to your GitHub org/account → **Settings → Packages**
2. Ensure "Improve container support" is enabled

### First push — make images public (optional)

After your first pipeline run, images are private by default. To make them public:

1. GitHub → your org → **Packages**
2. Click each image → **Package Settings** → Change visibility → Public

Or keep them private and ensure your production server can authenticate:
```bash
echo $GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Image naming convention

Your images will be at: `ghcr.io/YOUR_ORG/YOUR_REPO/<service>:<tag>`

Services: `backend`, `frontend`, `agent-manager`, `eventprocessor`, `user-auditor`, `web-pdf`

Infrastructure images (postgres, opensearch) are still pulled from `ghcr.io/utmstack/utmstack/` —
these are stable and do not change with your customisations. You can optionally mirror them.

---

## 8. Hosting & Deployment

### Production requirements

| Resource | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 4 cores | 8 cores |
| RAM | 16 GB | 32 GB |
| Disk | 100 GB SSD | 500 GB SSD |
| Network | Port 443, 80, 9000 (gRPC) open | — |

> For more than 500 data sources (deployed agents), add secondary nodes.

### Install Docker and Swarm on a fresh Ubuntu 22.04 server

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Initialize single-node Swarm
docker swarm init

# Authenticate to GHCR
echo $GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### Deploy the stack

```bash
# Create the env file on the server
cat > /opt/utmstack/.env << 'EOF'
UTMSTACK_TAG=v11.1.0
SERVER_NAME=your-server-hostname-or-ip
POSTGRES_PASSWORD=your-strong-password
OPENSEARCH_INITIAL_ADMIN_PASSWORD=YourStr0ng!Password
INTERNAL_KEY=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

# Copy docker-compose.yml to the server
scp local-dev/docker-compose.yml user@server:/opt/utmstack/

# Deploy
ssh user@server "cd /opt/utmstack && docker compose up -d"
```

### Rolling update (after a new build)

```bash
# Pull new images and update services with zero downtime
ssh user@server << 'EOF'
cd /opt/utmstack
export UTMSTACK_TAG=v11.2.0   # the new tag
docker compose pull
docker compose up -d --no-deps --build backend frontend agent-manager
EOF
```

> **Session impact**: Backend restart invalidates all JWT sessions (ephemeral signing key).
> Schedule backend updates during low-traffic windows and notify users beforehand.

### Health check

```bash
# Check all services are running
ssh user@server "docker compose ps"

# Check backend
curl -s http://localhost:8080/api/ping

# Check agent-manager gRPC port
nc -zv localhost 9000

# Check OpenSearch
curl -sk https://localhost:9200/_cluster/health \
  -u admin:$OPENSEARCH_INITIAL_ADMIN_PASSWORD | jq .status
```

---

## 9. Merging Code Changes

### Branch protection rules (recommended)

Set these on your `main` branch in **Settings → Branches → Add rule**:

- ☑ Require pull request reviews (1 approver minimum)
- ☑ Require status checks to pass before merging
  - Go dependency scan
  - Build check
- ☑ Require branches to be up to date before merging
- ☑ Do not allow bypassing the above settings

### PR workflow

```
1. Create feature branch from main
   git checkout main && git pull
   git checkout -b feature/my-change

2. Make changes, commit
   git add . && git commit -m "feat: describe change"

3. Push and open PR
   git push -u origin feature/my-change
   # Open PR on GitHub targeting main

4. CI runs: Go deps scan, build check
5. At least 1 reviewer approves
6. Merge (squash merge recommended)
```

### Deployment rule for security-sensitive changes

Per `testing.md`: **never merge to main without tests** for:
- Auth flows (`security/jwt/`, `SecurityConfiguration.java`)
- SOAR rule evaluation (`UtmAlertResponseRuleService`)
- Alert deduplication (`plugins/alerts/main.go`)
- New REST endpoints (need happy-path + 401 test)

Current test coverage status:
- Frontend: 26 specs ✅
- Backend: 14 specs (T-001, T-002) ✅
- Go: 0 test files (vacuous pass) — tracked in `testing.md`

---

## 10. Agent Distribution

### How agents reach deployed endpoints

1. The **agent installer binary** is built with `REPLACE_KEY` baked in via ldflags
2. It registers with `agent-manager` on port 9000 (TLS 1.3)
3. After registration, it receives an `id` + `key` pair stored in SQLite locally
4. All subsequent communication uses `key/id/type` metadata headers

### Building agent binaries for distribution

Agents for different platforms are built in CI. For manual builds:

```bash
cd agent

# Set your secret (same one as AGENT_SECRET_PREFIX in GitHub Secrets)
export AGENT_SECRET="your-32-char-hex-secret"

# Linux
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -o dist/utmstack_agent_service_linux_amd64 \
  -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .

# Windows  
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -o dist/utmstack_agent_service_windows_amd64.exe \
  -ldflags "-X 'github.com/utmstack/UTMStack/agent/config.REPLACE_KEY=${AGENT_SECRET}'" .
```

### Distributing agents to endpoints

Option A — Serve binaries via HTTPS from your server:
```bash
# Place binaries in a web-accessible directory on the server
scp dist/* user@server:/var/www/html/agents/
# Endpoints download and run: curl https://your-server/agents/utmstack_agent_service_linux_amd64 -o agent && chmod +x agent && ./agent install
```

Option B — The frontend's **Getting Started** screen generates install commands automatically
once you set the `SERVER_NAME` env var correctly.

### Install commands (endpoint side)

**Linux:**
```bash
curl -sSL https://YOUR_SERVER/agents/utmstack_agent_service_linux_amd64 -o /usr/bin/utmstack_agent_service
chmod +x /usr/bin/utmstack_agent_service
utmstack_agent_service install --connection-key YOUR_CONNECTION_KEY --manager-ip YOUR_SERVER_IP
```

**Windows (PowerShell as Admin):**
```powershell
Invoke-WebRequest -Uri "https://YOUR_SERVER/agents/utmstack_agent_service_windows_amd64.exe" -OutFile "C:\utmstack_agent_service.exe"
C:\utmstack_agent_service.exe install --connection-key YOUR_CONNECTION_KEY --manager-ip YOUR_SERVER_IP
```

> The **connection key** is generated per-agent from the UI under Data Sources → Add Agent.

---

## 11. Secrets & Credentials Management

### Load-bearing secrets — change with extreme caution

| Secret | Where stored | Impact of change |
|---|---|---|
| `INTERNAL_KEY` | `.env` on server + GitHub Secrets | Restart backend + agent-manager + eventprocessor simultaneously |
| `AGENT_SECRET_PREFIX` (REPLACE_KEY) | GitHub Secrets + compiled into agent binary | Every deployed agent must be reinstalled |
| `ENCRYPTION_KEY` | `.env` on server | Encrypted config values in DB become unreadable |
| `POSTGRES_PASSWORD` | `.env` on server | All 3 services that use Postgres must restart with new password |
| `OPENSEARCH_INITIAL_ADMIN_PASSWORD` | `.env` on server | All services that query OpenSearch must restart |

### Rotation procedure for INTERNAL_KEY

If you must rotate `INTERNAL_KEY`:

```bash
# 1. Generate new key
NEW_KEY=$(openssl rand -hex 32)

# 2. Update .env on server
sed -i "s/INTERNAL_KEY=.*/INTERNAL_KEY=$NEW_KEY/" /opt/utmstack/.env

# 3. Restart ALL three services simultaneously
docker compose up -d --no-deps backend agent-manager eventprocessor

# 4. All active user sessions are invalidated (JWT key rotation)
# Notify users before doing this
```

### Secrets storage for the team

Use a team password manager (Vault, 1Password Teams, Bitwarden) to store:
- `AGENT_SECRET_PREFIX` (production value)
- `ENCRYPTION_KEY` (production value)
- `INTERNAL_KEY` (production value)
- All GitHub Secrets values

**Never store secrets in the repository.** The `.env` file is in `.gitignore`.

---

## 12. Known Deferred Items

These items were tracked during migration and are **not blocking** but should be addressed:

| Item | File | Priority |
|---|---|---|
| Backend full compile verification | `docs/migration/deferred-build-verification.md` | High — do before first production deploy |
| Go test coverage (T-003+) | `testing.md` — Go section | Medium — needed before modifying agent/SOAR code |
| Angular esbuild builder (Phase 5e) | Removes `--openssl-legacy-provider` requirement | Low |
| Bootstrap 5 — `badge-pill` → `rounded-pill` | Minor class rename | Low |
| Branding abstraction (Phase 11) | `.kiro/specs/product-rebranding/` — spec written | When ready |
| ng-bootstrap v16 — individual imports | 42 modules still use `NgbModule` blob | Low — works, not urgent |
| Hibernate 6 JPQL full audit | `docs/migration/phase-7-hibernate6-jpql-audit.md` — clean | Ongoing due diligence |

---

*End of runbook. For architecture details see `docs/baseline/01-architecture-overview.md`.  
For migration history see `docs/migration/`.*
