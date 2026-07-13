# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

**HiveArmor** — Hyper-scale Incident Visibility Engine. Enterprise SIEM/XDR platform.
- UI brand: **HiveArmor**
- Backend Java package: **com.hivearmor**
- Docker images: **hivearmor/** (local), **ghcr.io/hivearmor/** (CI)
- Go module paths: `github.com/hivearmor/...`
- Short name: `ha`

## Repository Layout

| Directory | Language | Role |
|---|---|---|
| `frontend-v2/` | Next.js 14 + React 18 + TypeScript | **Active UI — all new UI work goes here** |
| `frontend/` | Angular 17 | Legacy UI — scheduled for deletion, do not touch |
| `backend/` | Java 17 + Spring Boot 3.3 + JHipster 8 | REST API, DB migrations, scheduled workers |
| `agent/` | Go 1.25.5 | Endpoint agent (Windows/Linux/macOS) |
| `agent-manager/` | Go 1.25.5 | gRPC agent registry |
| `hivearmor-collector/` | Go 1.25.5 | Log collector |
| `plugins/*/` | Go 1.25.5 | 17 correlation engine plugins |
| `event-processor/` | Go 1.25.5 | Core log correlation engine |
| `local-dev/` | Docker Compose | Full stack local environment |
| `.plan/` | Markdown | Feature roadmap, session prompts — read before starting any feature |

## Feature Planning — Always Read First

Before working on any feature, read the corresponding file in `.plan/features/`. The index is at `.plan/PROMPTS_INDEX.md`. The master roadmap is at `.plan/MASTER_PLAN.md`.

Key path shortcuts from PROMPTS_INDEX:
- Backend REST: `backend/src/main/java/com/hivearmor/web/rest/`
- Backend Service: `backend/src/main/java/com/hivearmor/service/`
- New UI pages: `frontend-v2/src/app/(app)/`
- New UI services: `frontend-v2/src/services/`
- New UI components: `frontend-v2/src/components/`

## Local Dev Environment

```bash
# Start full Docker stack
cd local-dev && docker compose up -d

# Next.js dev server (port 3000)
cd frontend-v2 && npm run dev

# Backend dev server (port 8080, proxied to 8088 by Docker)
cd backend && mvn -s settings.xml -B
```

| Service | URL | Credentials |
|---|---|---|
| HiveArmor UI (Next.js) | http://localhost:3000 | admin / localdev123! |
| Backend API | http://localhost:8088 | admin / localdev123! |
| OpenSearch Dashboards | http://localhost:5601 | admin / LocalDev@2024! |
| PostgreSQL | localhost:5438 | postgres / localdev123! |

Get an API token for curl testing:
```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

`local-dev/.env.example` lists all required env vars. Copy to `local-dev/.env` before first run. `APP_TFA_ENABLED=false` is set in dev so no TFA challenge.

## Build Commands

### Frontend v2 (Next.js)
```bash
cd frontend-v2
npm run dev          # dev server
npm run build        # production build (output: standalone)
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest watch mode
```

### Backend (Java)
```bash
cd backend
mvn -s settings.xml -B                           # dev server
mvn -B -Pprod clean package -s settings.xml      # production WAR → target/hivearmor.war
mvn -s settings.xml liquibase:validate           # validate DB migrations (run before merging schema changes)
mvn -s settings.xml test                         # run tests
```
Requires `$MAVEN_TK` env var — GitHub PAT with `read:packages` for GitHub Packages.

### Go Components
```bash
cd agent && go build -o hivearmor_agent_service .
cd agent-manager && go build .
```
**`agent`, `hivearmor-collector`, and `as400` require ldflags** — `REPLACE_KEY` must be injected at build time or authentication fails. CI injects `$AGENT_SECRET_PREFIX`. Do not build these for production without it.

`agent/go.mod` and `agent/updater/go.mod` have `replace` directives pointing to `../shared` — these modules cannot be built outside the repo.

## Architecture Overview

### Data Flow
```
Log source → Agent/Collector → gRPC → EventProcessor
  → parse (YAML filters/) → enrich (geo, feeds) → correlate (YAML rules/)
  → index to OpenSearch (_v3_hive_<type>-YYYY.MM.DD) → backend queries → frontend displays
```
Correlation runs before data reaches OpenSearch — this is intentional, do not short-circuit it.

### Service Communication
| From | To | Protocol | Auth |
|---|---|---|---|
| Browser | backend | HTTPS | JWT `Authorization: Bearer` |
| Backend | OpenSearch | HTTPS | env var basic auth |
| Backend | AgentManager | gRPC | `INTERNAL_KEY` env var |
| Backend | EventProcessor | HTTP | `X-Internal-Key` header |
| Agent/Collector | AgentManager | gRPC TLS 1.3 | `REPLACE_KEY` (ldflags) |

No message broker. Do not add Kafka or RabbitMQ without an explicit architecture decision.

### Databases
- **PostgreSQL `hivearmor`** — app data (users, rules, incidents, dashboards); managed by Liquibase
- **OpenSearch `_v3_hive_<type>-YYYY.MM.DD`** — all log events and alerts; index pattern is **version-locked, do not change**
- **PostgreSQL `hivearmor_agents`** — agent registry; managed by GORM auto-migrate

### Frontend v2 Architecture
- App Router with `(app)/` route group for protected pages (auth guard in layout)
- API proxy: `src/app/api/[...path]/route.ts` forwards all `/api/*` requests to `BACKEND_URL`
- State: Zustand stores in `src/store/` (auth, alert-stream, theme, visualization)
- Data fetching: TanStack Query v5 via service files in `src/services/`
- JWT localStorage key: `hivearmor_auth_token`

### Backend Architecture
- JHipster 8 scaffolding; Spring Security 6 `SecurityFilterChain` bean pattern
- JWT key is **ephemeral** — regenerated on every restart, invalidating all sessions (known issue DEBT-14)
- Scheduled workers: alert tagging (30s), SOAR response rules (30s), pipeline sync (20s), OpenSearch health (60s), compliance reports (5s), user cleanup (daily 01:00)

## Firm Constraints — Do Not Break

- **OpenSearch index pattern `_v3_hive_<type>-YYYY.MM.DD`** — changing it requires migrating every existing index and every query across all services
- **`INTERNAL_KEY`** — shared by backend, agentmanager, eventprocessor; changing it requires simultaneous redeploy of all three
- **Plugin binary names** must be `com.hivearmor.<name>.plugin` — eventprocessor loads by this exact name
- **Liquibase changesets are immutable** once merged — never edit a shipped changeset, only add new ones
- **Go module paths** `github.com/hivearmor/...`

## Security Rules (New Code)

Every new backend endpoint must have either a `@PreAuthorize` annotation or an explicit entry in `SecurityConfiguration.java`. Public endpoints must be explicitly added to the public path list.

Never replicate these existing known gaps in new code:
- Password/secret values in URL query params (SEC-01: `GET /api/check-credentials?password=`)
- CORS `allowed-origins: '*'` in prod config (SEC-03)
- `InsecureTrustManagerFactory` for gRPC/TLS (SEC-04)
- OpenSearch queries via string concatenation with user input — use `SearchUtil` DSL builders only

Audit trail required for: alert status changes, incident status changes, user login/logout, agent remote commands, API key usage.

## Schema Change Rules

Add new Liquibase file: `backend/src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml`  
Include it in `master.xml` in strict date order. Run `mvn -s settings.xml liquibase:validate` before merging. New columns must have a default value or be nullable. No `DROP COLUMN` or `RENAME COLUMN` without a 2-release deprecation cycle.

## API Change Rules

No API versioning — all endpoints at `/api/`. API endpoint prefix is `/api/ha-*`. Breaking changes (removed/renamed endpoints or fields) require keeping the old endpoint with a `Deprecation` header for at least 2 releases. Additive changes are always safe.

## Known Open Security Issues

Tracked in `.plan/features/SEC-FIXES.md` and `docs/baseline/12-risk-register.md`:
- SEC-01: Password in GET query param (`AccountResource.java`)
- SEC-02: JWT key rotates on restart (`TokenProvider.java`)
- SEC-03: CORS wildcard in prod config
- SEC-04: gRPC `InsecureTrustManagerFactory`

Fix these before shipping new features to production.
