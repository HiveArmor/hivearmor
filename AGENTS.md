# AGENTS.md — HiveArmor Repository Guide

## Overview

**HiveArmor** (Hyper-scale Incident Visibility Engine) — enterprise SIEM/XDR platform.  
Multi-language monorepo. Short name: `ha`.

| Directory | Language | Build |
|---|---|---|
| `backend/` | Java 17 (Spring Boot 3.3, JHipster 8) | Maven (`mvn`) |
| `frontend-v2/` | Next.js 14 + React 18 (TypeScript 5, Node 20) | npm |
| `frontend/` | Angular 17 — legacy, scheduled for deletion | — |
| `agent/` | Go 1.25.5 | `go build` (+ ldflags) |
| `agent-manager/` | Go 1.25.5 | `go build` |
| `hivearmor-collector/` | Go 1.25.5 | `go build` (+ ldflags) |
| `as400/` | Go 1.25.5 | `go build` (+ ldflags) |
| `plugins/*/` | Go 1.25.5 | `go build` (17 modules) |
| `shared/` | Go 1.25.1 | — (shared library) |
| `installer/` | Go 1.25.1 | `go build` (+ ldflags) |
| `user-auditor/` | Java 17 | Maven |
| `web-pdf/` | Java 17 | Maven |

## Build Commands

### Backend (Java)
```bash
cd backend
mvn -s settings.xml -B                        # Run Spring Boot dev server (port 8080)
mvn -B -Pprod clean package -s settings.xml   # Production WAR → target/hivearmor.war
```
- Maven settings: `backend/settings.xml` authenticates to GitHub Packages via `MAVEN_TK` env var (GitHub PAT with `read:packages`).
- Spring profiles: `dev` (default), `prod`, `tls`. Config in `backend/src/main/resources/config/`.
- **No `src/test/` directory** — tests are embedded in `src/main/java/`.

### Frontend v2 (Next.js)
```bash
cd frontend-v2
npm run dev          # dev server on port 3000
npm run build        # production build (standalone output)
npm run lint         # ESLint
npm run test         # Vitest
```

### Go Components
Each module is independent. Build from its directory:
```bash
cd agent
go build -o hivearmor_agent_service .
```

**`shared/` replace directives:** `agent/go.mod` and `agent/updater/go.mod` have `replace github.com/hivearmor/shared => ../shared`. These two modules cannot be built outside the repo.

**ldflags required for agent, collector, and as400:**
```bash
# Agent
go build -ldflags "-X 'github.com/hivearmor/agent/config.REPLACE_KEY=<secret>'" .

# Collector
go build -ldflags "-X 'github.com/hivearmor/hivearmor-collector/config.REPLACE_KEY=<secret>'" .

# AS400 Collector
go build -ldflags "-X 'github.com/hivearmor/as400/config.REPLACE_KEY=<secret>'" .
```
CI injects `$AGENT_SECRET_PREFIX` for all three. Without it, these services cannot authenticate.

**Cross-compilation:** Set `GOOS`/`GOARCH`/`CGO_ENABLED=0` before `go build`. CI builds Linux (amd64/arm64), Windows (amd64/arm64), macOS (arm64).

### Plugins
Each plugin under `plugins/*/` is a standalone Go module. Build binary named `com.hivearmor.<name>.plugin`.

**16 plugins** are copied into `event_processor.Dockerfile`. The `plugins/` directory has 17 modules — `compliance-orchestrator` exists but is not yet in the Dockerfile.

### Installer
```bash
cd installer
bash build.sh   # Uses ldflags for config injection
```
`build.sh` injects `DEFAULT_BRANCH`, `INSTALLER_VERSION`, `REPLACE` (encryption salt), and `PUBLIC_KEY` via `-ldflags`.

### Geolocation Data
Event processor needs CSV files downloaded at build time. `geolocation/` is gitignored — must be populated from the CDN before Docker build.

## CI / CD

### PR Checks
`.github/workflows/pr-checks.yml` — runs on PRs to `release/**`, `v10`, `v11`. Triggers Go dependency checks, AI review, and approver job.

### Deployment Pipeline
`.github/workflows/v11-deployment-pipeline.yml` — active pipeline. Triggers: push to `release/v11**` (dev), `release.published` (prod).

### Reusable Workflows
- `reusable-java.yml` — Maven build + Docker push to `ghcr.io/hivearmor/<image>:<tag>`
- `reusable-golang.yml` — `go test ./...`, `go build`, Docker push
- `reusable-node.yml` — Node 20, `npm install && npm run build`, Docker push
- `reusable-sign-agent.yml` — Windows (jsign + GCP KMS) and macOS (codesign + notarytool) signing
- `reusable-basic.yml` — Docker build-only

### Agent Signing Workflow
`installer-release.yml` builds the installer binary with ldflags using `CM_ENCRYPT_SALT` and `CM_SIGN_PUBLIC_KEY` secrets.

## Key Architecture Notes

- **Event processor** is the core Go-based log correlation engine. Loads compiled plugin binaries at runtime (`com.hivearmor.<name>.plugin`). `event_processor.Dockerfile` expects all plugins pre-built alongside it.
- **Backend** serves the REST API at `/api/ha-*`. WAR packaging. `filters/` and `rules/` are YAML files copied into the container.
- **Frontend-v2** is the active Next.js UI. JWT stored in `localStorage` under key `hivearmor_auth_token`.
- **Agent** runs on endpoints (Windows/Linux/macOS). Binary: `hivearmor_agent_service`. Communicates with `agent-manager` via gRPC.
- **Collector** (`hivearmor-collector/`) and **AS400** (`as400/`) are separate log collection services.

## Gotchas

- **ldflags are mandatory** for `agent`, `hivearmor-collector`, and `as400` — `REPLACE_KEY` is injected at build time. Without it, services cannot authenticate.
- **Backend uses GitHub Packages** — `settings.xml` requires GitHub PAT in `$MAVEN_TK`.
- **Plugin binary names are exact** — `com.hivearmor.<name>.plugin` — event-processor loads by this name, wrong name = plugin not found.
- **Installer build requires ldflags** — see `installer/build.sh`.
- **Geolocation data must be downloaded** — event processor Docker build fails without `./geolocation/` CSV files.
- **`.plugin` binaries are gitignored** — build artifacts, not committed.
- **OpenSearch index pattern is version-locked** — `_v3_hive_<type>-YYYY.MM.DD` — do not change without a full migration.
