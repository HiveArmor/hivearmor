# HiveArmor — Docker Services Reference

**Audience:** DevOps / Support / Platform Administrators  
**Version:** v1.x

---

## Service Architecture Diagram

```
External Traffic
  ├── HTTPS :443/:3000  → frontend-v2
  ├── TCP :9000/:9001   → agentmanager  (endpoint agents)
  └── UDP :514          → hivearmor-collector  (syslog devices)

┌─────────────────────────────────────────────────────────────────┐
│  Docker Network: hivearmor_default                              │
│                                                                 │
│  frontend-v2 :3000                                              │
│      └── → backend :8080  (all /api/* requests)                │
│                                                                 │
│  backend :8080                                                  │
│      ├── → postgres :5432  (app data)                          │
│      ├── → opensearch :9200  (alert/log queries)               │
│      ├── → agentmanager :9000  (gRPC, agent commands)          │
│      └── → eventprocessor :9002  (correlation config sync)     │
│                                                                 │
│  eventprocessor :9002/:8000/:8090                               │
│      ├── → postgres :5432  (pipeline state)                    │
│      ├── → opensearch :9200  (write alerts/logs)               │
│      └── ← agentmanager (forwards logs via unix socket)        │
│                                                                 │
│  agentmanager :9000/:9001/:9090                                 │
│      └── → postgres :5432  (agent registry)                    │
│                                                                 │
│  user-auditor :8080                                             │
│      ├── → postgres :5432  (audit records)                     │
│      └── → opensearch :9200  (write audit events)              │
│                                                                 │
│  web-pdf :8080                                                  │
│      └── → backend :8080  (fetches report pages via browser)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service Details

### `postgres`

| Property | Value |
|---|---|
| Image | `hivearmor/postgres:local` (custom Postgres 15) |
| Host port | `5438` |
| Internal port | `5432` |
| Data volume | `postgres_data` |
| Memory limit | 1024 MB |

**Databases created on init (via `local-dev/init-db.sql`):**

| Database | Owner | Used by |
|---|---|---|
| `hivearmor` | `postgres` | Backend API (Spring Boot) — users, alerts meta, incidents, rules, dashboards |
| `agentmanager` | `postgres` | Agent Manager — agent registry, heartbeats, commands |
| `userauditor` | `postgres` | User Auditor — session tracking, login events |

**Schema management:**
- `hivearmor` DB: managed by Liquibase (changelogs in `backend/src/main/resources/config/liquibase/changelog/`)
- `agentmanager` DB: managed by GORM auto-migrate in Go
- `userauditor` DB: managed by the user-auditor service on start

**Health check:** `pg_isready -U postgres` — checks TCP connection and PostgreSQL accepting connections.

**Key tuning parameters:**
```
shared_buffers=256MB
max_connections=1000
```

---

### `opensearch`

| Property | Value |
|---|---|
| Image | `hivearmor/opensearch:local` (OpenSearch 2.18) |
| Host port | `9200` |
| Data volume | `opensearch_data` |
| Backup volume | `opensearch_backups` |
| Memory limit | 3072 MB |
| JVM heap | `-Xms1024m -Xmx1024m` (tune to 50% of memory limit) |

**Role:** Primary log and alert storage. All events, alerts, and compliance data are stored in daily rolling indices.

**Index naming pattern (version-locked):**
```
_v3_hive_<type>-YYYY.MM.DD
```
| Index pattern | Content |
|---|---|
| `_v3_hive_log-linux-*` | Linux syslog/journald events |
| `_v3_hive_log-wineventlog-*` | Windows Event Log events |
| `_v3_hive_log-generic-*` | Generic/unclassified logs |
| `_v3_hive_log-paloalto-*` | Palo Alto firewall logs |
| `_v3_hive_log-cisco-*` | Cisco ASA/IOS logs |
| `_v3_hive_alert-*` | Correlated alerts |
| `_v3_hive_log-compliance-evaluation` | Compliance control results |

> **Never change the index naming pattern.** It is version-locked and referenced by every query in the backend, event processor, and plugins.

**Security:**
- TLS enabled (cert in `local-dev/certs/opensearch.crt`)
- Auth: admin + `OPENSEARCH_INITIAL_ADMIN_PASSWORD`

**Health check:**
```bash
curl -sk https://localhost:9200/_cluster/health \
  -u "admin:<PASSWORD>" | python3 -m json.tool
# "status": "green" is ideal; "yellow" is acceptable in single-node
```

**Tuning for production:**
```
# In .env or docker-compose.yml
OPENSEARCH_JAVA_OPTS=-Xms4096m -Xmx4096m  # Set to ~50% of container memory limit
```

---

### `agentmanager`

| Property | Value |
|---|---|
| Image | `hivearmor/agent-manager:local` |
| Host ports | `9000` (gRPC agent), `9001` (gRPC admin), `9090` (HTTP admin) |
| Memory limit | 512 MB |

**Role:** gRPC server that manages endpoint agents. It:
- Accepts agent registrations and stores them in PostgreSQL (`agentmanager` DB)
- Receives heartbeats (every 60s) and updates agent online/offline status
- Forwards log data from agents to the event processor via a unix socket
- Relays remote commands from the backend to agents
- Serves agent binary downloads (updated binaries for auto-update)

**Authentication:**
- Agent ↔ AgentManager: `REPLACE_KEY` injected at agent binary build time via ldflags
- Backend ↔ AgentManager: `INTERNAL_KEY` env var on `X-Internal-Key` header

**Ports:**

| Port | Protocol | Purpose |
|---|---|---|
| 9000 | gRPC TLS | Agent registration, log upload, command response |
| 9001 | gRPC | Admin/monitoring |
| 9090 | HTTP | Admin panel (Portainer-style terminal) |

**Health check:** `nc -z localhost 9000` — TCP connection test.

---

### `backend`

| Property | Value |
|---|---|
| Image | `hivearmor/backend:local` |
| Host port | `8088` |
| Internal port | `8080` |
| Memory limit | 1536 MB |
| Data volume | `datasources_data` (`/etc/hivearmor`) |

**Role:** Spring Boot REST API — the central application server. It:
- Serves all `/api/*` endpoints (consumed by the frontend)
- Manages users, roles, incidents, compliance, reports, dashboards
- Queries OpenSearch for alert/log data
- Calls AgentManager (gRPC) to send commands to agents
- Calls EventProcessor (HTTP) to sync correlation rules and pipelines
- Runs scheduled workers every 30–60 seconds

**Scheduled workers:**

| Worker | Interval | Purpose |
|---|---|---|
| Alert tagger | 30s | Applies tag rules to new alerts |
| SOAR engine | 30s | Evaluates automation rules |
| Pipeline sync | 20s | Pushes filter/rule changes to event processor |
| OpenSearch health | 60s | Monitors cluster health, updates ISM policy |
| Compliance reports | 5s | Evaluates compliance controls |
| User cleanup | daily 01:00 | Removes expired/inactive sessions |

**JWT:** The JWT signing key is `ENCRYPTION_KEY`. It is ephemeral — a restart regenerates it and invalidates all sessions. (Known issue DEBT-14 — persist the key to avoid session loss on restart.)

**Health check:** `curl -sf http://localhost:8080/api/healthcheck`

**Key environment variables:**
```
SERVER_NAME          — used in email links and TLS
ELASTICSEARCH_HOST   — OpenSearch hostname (internal: "opensearch")
INTERNAL_KEY         — shared with agentmanager and eventprocessor
ENCRYPTION_KEY       — JWT signing + config encryption
GRPC_AGENT_MANAGER_HOST / PORT
EVENT_PROCESSOR_HOST / PORT
```

---

### `eventprocessor`

| Property | Value |
|---|---|
| Image | `hivearmor/event-processor:local` |
| Host ports | `50051` (gRPC, agent log intake), `8000` (HTTP), `8090` (HTTP inject/SOC-AI) |
| Memory limit | 2048 MB |
| Volumes | `ep_pipeline`, `ep_logs`, `ep_rules` |

**Role:** The core SIEM correlation engine. It:
- Receives structured log events from AgentManager (via unix socket or gRPC)
- Applies **pipeline filters** (YAML in `filters/`) to parse and normalize logs
- Runs **correlation rules** (YAML in `rules/`) to generate alerts
- Enriches events with GeoIP data and threat intelligence feeds
- Indexes normalized logs and alerts into OpenSearch
- Exposes the SOC AI analysis endpoint at `:8090/soc-ai/analyze`
- Runs the Compliance Orchestrator (evaluates compliance controls)

**Pipeline volumes:**

| Volume | Mount in container | Content |
|---|---|---|
| `ep_pipeline` | `/workdir/pipeline` | Active filter/parser YAML files |
| `ep_rules` | `/workdir/rules/hivearmor` | Correlation rule YAML files |
| `ep_logs` | `/workdir/logs` | Event processor internal logs |

**Modes:**
- `MODE=manager` — default, runs the full correlation + indexing engine
- `MODE=worker` — for horizontal scaling (not used in single-node deploy)

**Health check:** `nc -z localhost 8000` — TCP connection test.

---

### `user-auditor`

| Property | Value |
|---|---|
| Image | `hivearmor/user-auditor:local` |
| Memory limit | 512 MB |

**Role:** Tracks user sessions and activity for audit compliance. It:
- Receives login/logout events from the backend
- Stores them in PostgreSQL (`userauditor` DB)
- Indexes session records into OpenSearch for search
- Exposes endpoints like `/api/utm-auditor-users-by-src` for the backend to query

**Health check:** `curl -sf http://localhost:8080/api/utm-auditor-users-by-src`

---

### `web-pdf`

| Property | Value |
|---|---|
| Image | `hivearmor/web-pdf:local` |
| Platform | `linux/amd64` (Selenium/Chrome — runs via Rosetta on Apple Silicon) |
| Memory limit | 1024 MB |
| Volume | `shm_data` (`/dev/shm` — shared memory for Chrome) |

**Role:** Headless browser service for PDF report generation. It:
- Runs a Selenium-driven Chrome browser
- Navigates to report pages in the frontend
- Captures them as PDFs
- Returns the PDF to the backend's report service

> On Apple Silicon (M1/M2/M3), this container runs via Rosetta x86-to-ARM translation. Performance is adequate for report generation but not suitable for high-concurrency use.

**Health check:** `curl -s http://localhost:8080/ | grep -q 'error'`

---

### `frontend-v2`

| Property | Value |
|---|---|
| Image | `hivearmor/frontend-v2:local` |
| Host port | `3000` |
| Memory limit | 512 MB |

**Role:** The Next.js 14 SIEM UI. It:
- Serves the React application as a Next.js standalone server
- Proxies all `/api/*` requests to the backend (via `BACKEND_URL` env var)
- Handles streaming/SSE for real-time alert updates

**Build-time arguments:**
```
NEXT_PUBLIC_API_URL=http://backend:8080   # Baked into the JS bundle
```

**Runtime environment:**
```
BACKEND_URL=http://backend:8080           # Used by Next.js API route proxy (server-side only)
HOSTNAME=0.0.0.0                          # Bind all interfaces
```

**Health check:** `wget -qO- http://127.0.0.1:3000/login`

---

### `opensearch-dashboards` ⚠️ DEV ONLY

| Property | Value |
|---|---|
| Image | `opensearchproject/opensearch-dashboards:2.18.0` |
| Host port | `5601` |
| Memory limit | 512 MB |

**Role:** OpenSearch's built-in index management and query UI. **For development and debugging only.**

> **REMOVE THIS SERVICE BEFORE PRODUCTION DEPLOYMENT.** OpenSearch Dashboards exposes full cluster admin access (index creation, deletion, mapping changes) with no additional authentication beyond the OpenSearch password. It is not hardened for internet exposure.

To remove it from production:
1. Delete the `opensearch-dashboards` service block from `docker-compose.yml`
2. Also delete the `shm_data` volume entry if unused
3. Block port 5601 at the firewall

---

## Volume Reference

| Volume | Used by | Contains |
|---|---|---|
| `postgres_data` | postgres | All PostgreSQL data files |
| `opensearch_data` | opensearch | All OpenSearch index data |
| `opensearch_backups` | opensearch | OpenSearch snapshot backups |
| `updates_data` | agentmanager, backend | Agent binary packages for distribution |
| `datasources_data` | backend | Datasource config files (`/etc/hivearmor`) |
| `ep_pipeline` | eventprocessor | Active filter YAML files |
| `ep_logs` | eventprocessor | Event processor log files |
| `ep_rules` | eventprocessor | Correlation rule YAML files |
| `shm_data` | web-pdf | Chrome shared memory (`/dev/shm`) |

---

## Resource Summary

| Service | Memory Limit | CPU Notes |
|---|---|---|
| postgres | 1024 MB | Low CPU, mostly I/O |
| opensearch | 3072 MB | High memory (JVM heap = 1024 MB default) |
| agentmanager | 512 MB | Low; spikes on mass agent connect |
| backend | 1536 MB | Medium; spikes during bulk report generation |
| eventprocessor | 2048 MB | CPU-intensive during log bursts |
| user-auditor | 512 MB | Low |
| web-pdf | 1024 MB | CPU-intensive during PDF render (Chrome) |
| frontend-v2 | 512 MB | Low (Node.js server) |
| opensearch-dashboards | 512 MB | Dev only |
| **Total** | **~11.2 GB** | Plan for 16+ GB RAM in production |

---

## Common Operational Commands

```bash
# View all service status
docker compose ps

# View logs for a service (follow)
docker compose logs -f backend --tail=50

# Restart a single service
docker compose restart eventprocessor

# Stop everything
docker compose down

# Stop and wipe all data (destructive!)
docker compose down -v

# Scale (not supported in single-node; use external OpenSearch cluster for scale-out)
docker compose up -d --scale backend=2  # backend can run multiple instances (stateless)

# Force recreate a service after image update
docker compose up -d --force-recreate --no-deps frontend-v2
```
