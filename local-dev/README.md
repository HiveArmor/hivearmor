# UTMStack Local Development Environment

## Quick Start

```bash
cd local-dev
docker compose up -d
```

Wait ~3 minutes for all services to initialize (Liquibase migrations + OpenSearch startup under Rosetta).

## Access

| Service | URL | Credentials |
|---|---|---|
| **Web UI** | https://localhost:4443 | `admin` / `localdev123!` |
| **Backend API** | http://localhost:8088 | JWT from /api/authenticate |
| **OpenSearch** | https://localhost:9200 | `admin` / `LocalDev@2024!` |
| **PostgreSQL** | localhost:5438 | `postgres` / `localdev123!` |
| **Agent Manager gRPC** | localhost:9000 | internal |
| **Agent Manager HTTP** | localhost:9001 | internal |
| **Event Processor** | localhost:8000 | internal |

## Default Admin Login

- **Username:** `admin`
- **Password:** `localdev123!` (same as DB_PASS — set on first startup)
- **2FA:** Disabled in local dev (`APP_TFA_ENABLED=false`)
- **First login:** Will show `firstLogin: true` — the UI may prompt you to change password

## Architecture (Local)

```
Browser → https://localhost:4443 → [frontend/nginx]
                                        ├── / → Angular SPA
                                        ├── /api → backend:8080
                                        ├── /ws → backend:8080 (WebSocket)
                                        └── /dependencies → agentmanager:9001

backend:8080 → postgres:5432 (utmstack DB)
             → opensearch:9200 (log storage)
             → agentmanager:9000 (gRPC)
             → eventprocessor:8000/9002

agentmanager → postgres:5432 (agentmanager DB)
user-auditor → postgres:5432 (userauditor DB) + opensearch:9200
web-pdf      → frontend (Selenium screenshot → PDF)
```

## Notes

- All images are **linux/amd64** running under Rosetta emulation on Apple Silicon
- Expect ~20-30% performance overhead vs native
- OpenSearch uses `discovery.type=single-node` and `bootstrap.system_call_filter=false` (required for Docker Desktop)
- Some services show "unhealthy" due to missing `nc` command in containers — they work fine
- Event processor logs "plugin configuration not found" errors — normal until integrations are configured
- The `!` in passwords requires single quotes in zsh: `curl -u 'admin:LocalDev@2024!'`

## Stopping

```bash
cd local-dev
docker compose down        # Stop containers, keep data
docker compose down -v     # Stop and DELETE all data
```

## Troubleshooting

### OpenSearch crashes with "bootstrap checks failed"
Already fixed: `bootstrap.system_call_filter=false` and `discovery.type=single-node`

### curl hangs with "dquote>"
Use single quotes for passwords with `!`: `curl -u 'admin:pass!'`

### Backend shows 500 on /api/authenticate
Include `"rememberMe": false` in the JSON body.

### Port conflicts
Default ports were chosen to avoid common conflicts:
- 4443 instead of 443
- 8088 instead of 8080
- 5438 instead of 5432
