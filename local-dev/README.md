# HiveArmor Local Development Environment

**HiveArmor** — Hyper-scale Incident Visibility Engine. Enterprise SIEM/XDR platform.

## Quick Start

```bash
cp .env.example .env          # copy env template (edit if needed)
cd local-dev
docker compose up -d
```

Wait approximately 3 minutes for all services to initialize. Liquibase runs DB migrations on first startup and OpenSearch requires time to start under Rosetta emulation on Apple Silicon.

## Service URLs

| Service | URL | Credentials |
|---|---|---|
| **Frontend v2 (Next.js) — Active UI** | http://localhost:3000 | `admin` / `localdev123!` |
| **Legacy Angular UI** | https://localhost:4443 | `admin` / `localdev123!` |
| **Backend API** | http://localhost:8088 | JWT from `/api/authenticate` |
| **OpenSearch** | https://localhost:9200 | `admin` / `LocalDev@2024!` |
| **OpenSearch Dashboards** | http://localhost:5601 | `admin` / `LocalDev@2024!` |
| **PostgreSQL** | localhost:5438 | `postgres` / `localdev123!` |
| **Agent Manager gRPC** | localhost:9000 | internal |
| **Agent Manager HTTP** | localhost:9001 | internal |
| **Event Processor** | localhost:8000 | internal |

> **Active UI:** `frontend-v2` (Next.js, port 3000) is the current production frontend. All new UI development goes there. The Angular UI at port 4443 is legacy and scheduled for removal — do not add features to it.

## Default Admin Account

- **Username:** `admin`
- **Password:** `localdev123!`
- **2FA:** Disabled in local dev (`APP_TFA_ENABLED=false`)
- **First login:** The UI may prompt to change the password (`firstLogin: true` in the JWT payload)

### Obtaining a Bearer Token for curl Testing

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")

# Use the token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/ha-users/current
```

> The backend regenerates its JWT signing key on every restart (known issue DEBT-14). All sessions are invalidated when the backend container restarts — obtain a new token after any restart.

## Architecture (Local Stack)

```
Browser
  ├── http://localhost:3000 ──→ [frontend-v2 / Next.js dev server]
  │                                 └── /api/* ──→ backend:8080 (API proxy)
  │
  └── https://localhost:4443 ──→ [nginx (legacy)]
                                      ├── /           → Angular SPA (legacy)
                                      ├── /api        → backend:8080
                                      ├── /ws         → backend:8080 (WebSocket)
                                      └── /dependencies → agentmanager:9001

backend:8080
  ├── postgres:5432  (hivearmor DB — app data, users, rules, incidents)
  ├── opensearch:9200 (log/alert storage, index: _v3_hive_<type>-YYYY.MM.DD)
  ├── agentmanager:9000 (gRPC — agent registry)
  └── eventprocessor:8000/9002 (correlation engine)

agentmanager
  └── postgres:5432  (hivearmor_agents DB — agent registry)

eventprocessor
  └── opensearch:9200 (writes correlated alerts)

user-auditor
  ├── postgres:5432  (hivearmor DB — audit log writes)
  └── opensearch:9200

web-pdf
  └── frontend (headless screenshot → PDF report rendering)
```

### Key Design Points

- Correlation runs in `eventprocessor` **before** data reaches OpenSearch. Do not short-circuit this.
- OpenSearch index pattern `_v3_hive_<type>-YYYY.MM.DD` is version-locked. Do not change it.
- No message broker (no Kafka, no RabbitMQ). Services communicate via HTTP, gRPC, and direct DB access.
- Backend uses Spring Security 6 `SecurityFilterChain`. Every endpoint requires `@PreAuthorize` or an explicit public-path entry.

## Running the Next.js Frontend Locally (Outside Docker)

For frontend development, run the Next.js dev server against the Docker-hosted backend:

```bash
cd frontend-v2
npm install
npm run dev          # http://localhost:3000
```

The dev server proxies all `/api/*` requests to the backend via `src/app/api/[...path]/route.ts`. The `BACKEND_URL` environment variable controls the target (default `http://localhost:8088`).

```bash
npm run build        # production build (output: standalone)
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

## Running the Backend Locally (Outside Docker)

```bash
export MAVEN_TK=<github-pat-with-read:packages>
cd backend
mvn -s settings.xml -B                         # dev server on :8080
mvn -s settings.xml test                       # run tests
mvn -s settings.xml liquibase:validate         # validate migrations before merging
mvn -B -Pprod clean package -s settings.xml   # production WAR → target/hivearmor.war
```

## Environment Variables

Copy `.env.example` to `.env` before first run. Key variables:

| Variable | Description |
|---|---|
| `DB_PASS` | PostgreSQL password (default: `localdev123!`) |
| `APP_TFA_ENABLED` | Set `false` in local dev to skip 2FA |
| `INTERNAL_KEY` | Shared secret: backend, agentmanager, eventprocessor |
| `BACKEND_URL` | URL the Next.js proxy forwards `/api/*` requests to |
| `OPENSEARCH_PASS` | OpenSearch admin password |

> `INTERNAL_KEY` is shared by backend, agentmanager, and eventprocessor. Changing it requires a simultaneous redeploy of all three services.

## Stopping the Stack

```bash
cd local-dev
docker compose down        # Stop containers, keep volume data
docker compose down -v     # Stop and DELETE all persistent data (full reset)
```

## Notes

- All images are **linux/amd64** running under Rosetta 2 emulation on Apple Silicon. Expect 20-30% performance overhead vs native x86.
- OpenSearch uses `discovery.type=single-node` and `bootstrap.system_call_filter=false` — required for Docker Desktop.
- Some containers may report "unhealthy" due to a missing `nc` binary in the health-check command. The services themselves function correctly.
- `eventprocessor` logs "plugin configuration not found" on startup — this is normal until integrations are configured via the UI.
- Passwords containing `!` require single quotes in zsh to prevent history expansion (see Troubleshooting below).

## Troubleshooting

### OpenSearch fails to start with "bootstrap checks failed"
Already handled in `docker-compose.yml` via `bootstrap.system_call_filter=false` and `discovery.type=single-node`. If you see this after editing the compose file, restore those settings.

### curl hangs with `dquote>`
The shell is interpreting `!` as a history expansion character. Use single quotes:
```bash
curl -u 'admin:LocalDev@2024!' https://localhost:9200
```

### `POST /api/authenticate` returns 500
The request body must include `"rememberMe": false`:
```bash
curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}'
```

### JWT token rejected after backend restart
The backend generates an ephemeral JWT signing key at startup (DEBT-14). All existing tokens are invalidated on restart. Obtain a new token using the snippet in the "Obtaining a Bearer Token" section above.

### Port conflicts
Ports were chosen to avoid common local service conflicts:

| Container Port | Host Port | Reason for offset |
|---|---|---|
| 443 | 4443 | Avoids requiring root / conflicts with local HTTPS |
| 8080 | 8088 | Avoids conflicts with other Spring Boot dev servers |
| 5432 | 5438 | Avoids conflicts with a local PostgreSQL install |
| 9200 | 9200 | Standard OpenSearch; free if no local ES/OS running |

### Next.js shows API errors but the Docker stack is running
Check that `BACKEND_URL` in your `.env` (or shell environment) points to `http://localhost:8088`. The Next.js dev server does not use the nginx proxy — it calls the backend directly.

### Agent Manager gRPC authentication fails
The agent and collector binaries require `REPLACE_KEY` injected at link time via `-ldflags`. The pre-built Docker images in local-dev have this baked in. If you rebuild from source without injecting `$AGENT_SECRET_PREFIX`, authentication will fail.

---

For production deployment, see [https://docs.hivearmor.io](https://docs.hivearmor.io).  
Support: support@hivearmor.io | GitHub: https://github.com/hivearmor
