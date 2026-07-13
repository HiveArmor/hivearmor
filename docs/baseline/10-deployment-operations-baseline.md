# 10 — Deployment and Operations Baseline

## Deployment Model

**Orchestration**: Docker Swarm (`docker stack deploy`)
**Installer**: Single Go binary provisions everything from scratch on Ubuntu 22.04 LTS
**Container Registry**: `ghcr.io/utmstack/utmstack/<service>:<tag>`
**Update mechanism**: Installer binary runs as a background service, polls Customer Manager API for updates, pulls and applies new images

---

## Environment Variables (Required)

### Backend

| Variable | Required | Notes |
|---|---|---|
| `DB_HOST` | Yes | PostgreSQL hostname |
| `DB_PORT` | Yes | PostgreSQL port (5432) |
| `DB_NAME` | Yes | Database name (`utmstack`) |
| `DB_USER` | Yes | PostgreSQL user |
| `DB_PASS` | Yes | PostgreSQL password |
| `ELASTICSEARCH_HOST` | Yes | OpenSearch hostname |
| `ELASTICSEARCH_PORT` | Yes | OpenSearch port (9200) |
| `ELASTICSEARCH_USER` | Yes | OpenSearch user (`admin`) |
| `ELASTICSEARCH_PASSWORD` | Yes | OpenSearch password |
| `INTERNAL_KEY` | Yes | Shared secret for inter-service auth |
| `ENCRYPTION_KEY` | Yes | Encryption key for sensitive data |
| `GRPC_AGENT_MANAGER_HOST` | Yes | Agent-manager hostname |
| `GRPC_AGENT_MANAGER_PORT` | Yes | Agent-manager gRPC port (9000) |
| `EVENT_PROCESSOR_HOST` | Yes | Event processor hostname |
| `EVENT_PROCESSOR_PORT` | Yes | Event processor port (9002) |
| `SOC_AI_BASE_URL` | Yes | SOC AI endpoint URL |
| `SERVER_NAME` | Yes | Server hostname for TLS/links |
| `APP_TFA_ENABLED` | No | Override TFA enforcement (default: true) |

### AgentManager

| Variable | Required | Notes |
|---|---|---|
| `INTERNAL_KEY` | Yes | Same as backend |
| `ENCRYPTION_KEY` | Yes | Same as backend |
| `UTM_HOST` | Yes | Backend URL for connection key validation |
| `PANEL_SERV_NAME` | Yes | Backend service name |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Yes | PostgreSQL `agentmanager` database |

### EventProcessor (via plugin config)

| Variable / Config | Required | Notes |
|---|---|---|
| OpenSearch host/port/user/password | Yes | Plugin config for org.opensearch |
| PostgreSQL credentials | Yes | For `com.utmstack.config` plugin |
| `WORK_DIR` | Yes | Working directory for pipeline/rules/filters |
| `MODE` | Yes | `manager` or `worker` |
| `NODE_NAME` | Yes | Node identifier |

### User Auditor

| Variable | Required |
|---|---|
| `SERVER_NAME`, `INTERNAL_KEY` | Yes |
| `DB_USER`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_PASS` | Yes |
| `ELASTICSEARCH_HOST`, `ELASTICSEARCH_PORT`, `ELASTICSEARCH_USER`, `ELASTICSEARCH_PASSWORD` | Yes |

---

## Docker Compose Service Overview (local-dev)

All services run as `linux/amd64` (Rosetta on Apple Silicon).

| Service | Image | Memory Limit | Healthcheck |
|---|---|---|---|
| postgres | `ghcr.io/.../postgres:latest` | 1024 MB | `pg_isready` |
| opensearch | `ghcr.io/.../opensearch:latest` | 3072 MB | HTTPS cluster health |
| agentmanager | `ghcr.io/.../agent-manager:<tag>` | 512 MB | `nc -z localhost 9000` |
| backend | `ghcr.io/.../backend:<tag>` | 1536 MB | HTTP `/api/healthcheck` |
| eventprocessor | `ghcr.io/.../eventprocessor:<tag>` | 2048 MB | `nc -z localhost 8000` |
| user-auditor | `ghcr.io/.../user-auditor:<tag>` | 512 MB | Actuator health |
| web-pdf | `ghcr.io/.../web-pdf:<tag>` | 1024 MB | None |
| frontend | `ghcr.io/.../frontend:<tag>` | 256 MB | HTTP `/` |

**Total baseline memory**: ~10.5 GB

---

## Volumes

| Volume | Mounted By | Content |
|---|---|---|
| `postgres_data` | postgres | PostgreSQL data directory |
| `opensearch_data` | opensearch | OpenSearch data |
| `opensearch_backups` | opensearch | Snapshot repository |
| `updates_data` | agentmanager, backend | Agent binary updates |
| `datasources_data` | backend | Data source config (`/etc/utmstack`) |
| `ep_pipeline` | eventprocessor | Parsed filter YAML files |
| `ep_logs` | eventprocessor | Event processor logs |
| `ep_rules` | eventprocessor | Correlation rule YAML files |
| `shm_data` | web-pdf | Chrome shared memory (`/dev/shm`) |
| `./certs` (bind) | multiple | TLS certificates |

---

## Production Installation

### Minimum System Requirements

| Data Sources | Hot Storage | CPU | RAM | Disk |
|---|---|---|---|---|
| 50 (120 GB/month) | 1 month | 4 cores | 16 GB | 150 GB |
| 120 (250 GB/month) | 1 month | 8 cores | 16 GB | 250 GB |
| 240 (500 GB/month) | 1 month | 16 cores | 32 GB | 500 GB |
| 500 (1000 GB/month) | 1 month | 32 cores | 64 GB | 1000 GB |

> Beyond 500 data sources: requires secondary nodes (horizontal scaling)

### Installation Steps
```bash
# Ubuntu 22.04 LTS
sudo apt update && sudo apt install wget
wget http://github.com/utmstack/UTMStack/releases/latest/download/installer
sudo su
chmod +x installer
./installer       # Installs, generates secrets, writes /root/utmstack.yml, starts stack
```

---

## Observability

### Metrics
- **Prometheus**: Exposed at `/management/prometheus` (Spring Actuator)
- **JHipster metrics**: `/management/jhimetrics`
- Metrics include: JVM, HTTP request timings (percentiles), Logback, process, system

### Health Checks
- Spring Actuator: `/management/health` (shows liveness, readiness, DB, custom probes)
- Custom: `/api/healthcheck` (public, no auth)
- OpenSearch health: Backend queries cluster health on 60s schedule
- gRPC health: `grpc.health.v1.Health/Check` (agent-manager)
- Docker healthchecks on all services in `docker-compose.yml`

### Logging
- Backend: SLF4J + Logback via Spring Boot, structured JSON in prod
- Backend log levels configurable at runtime via `/management/loggers`
- Go services: `threatwinds/logger` library (structured)
- Agent: file-based log at `config.ServiceLogFile`
- EventProcessor: file-based at `ep_logs` volume

### Tracing
- `TraceIdFilter` and `MdcCleanupFilter` inject trace IDs into MDC for backend requests
- No distributed tracing (no Jaeger/Zipkin/OTLP)

---

## Backup and Restore

### Database Backup
- PostgreSQL: No automated backup configured in docker-compose
- Recommended: `pg_dump` scheduled externally, or PostgreSQL continuous archiving
- Volumes: `postgres_data` — can snapshot at VM/storage level

### OpenSearch Backup
- `opensearch_backups` volume mounted as snapshot repository (`/usr/share/opensearch/backups`)
- Snapshot API available via OpenSearch; no automated snapshot policy configured
- Risk: No verified backup/restore procedure documented

### Configuration Backup
- `/root/utmstack.yml` — generated secrets (must be backed up)
- `ep_pipeline` and `ep_rules` volumes — can be regenerated from DB by config plugin

---

## Performance and Scaling

### Known Bottlenecks
1. **Frontend build heap**: 8 GB required for `ng build --prod` — uncommon CI requirement
2. **Single-node OpenSearch**: Production default is single-node; no horizontal sharding configured
3. **Backend thread pool**: max 1000 threads, queue 10,000 — adequate for most deployments
4. **Scheduling fixed delays**: Several services run on fixed delay (not cron) — can cascade if service is slow
5. **No connection pool visible for EventProcessor→OpenSearch**: Direct SDK calls per request
6. **gRPC in-memory command channels**: `CommandResultChannel` map in agent-manager could grow unbounded if commands time out without cleanup

### Horizontal Scaling Path
- Multiple event processor workers supported (`MODE=worker` vs `manager`)
- Backend can be scaled horizontally (stateless JWT, shared PostgreSQL/OpenSearch)
- AgentManager is stateful (in-memory stream maps) — scaling requires session affinity
- Frontend is stateless — multiple replicas trivial

---

## Database Migrations in Production

- Liquibase runs automatically on backend startup
- **No zero-downtime migration strategy** — schema changes block during migration
- New column additions are backward compatible; column removals/renames are not
- Recommended: Run Liquibase migrate as a pre-startup job (not built in currently)
