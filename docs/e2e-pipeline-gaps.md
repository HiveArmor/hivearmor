# HiveArmor — End-to-End Pipeline Gap Analysis

**Last Updated:** 2025-07-25
**Sprint Reference:** Sprint 50 — E2E Pipeline Integration Test (E2E-009)

---

## Pipeline Overview

```
Log Source → Agent/Collector (Go) → gRPC → AgentManager → EventProcessor → OpenSearch → Backend API → Frontend
```

The full HiveArmor data pipeline has 6 stages. In the local-dev Docker Compose environment, not all stages operate identically to production. This document maps each stage's current status and what's needed for full end-to-end operation.

---

## Status Summary

| # | Stage | Local-Dev Status | Simulation Needed? | Blocker Level |
|---|-------|-----------------|-------------------|---------------|
| 1 | Log Ingestion (gRPC) | ✅ Running | No | None |
| 2 | Event Parsing (filters) | ✅ Running | No | None |
| 3 | Correlation (CEL rules) | ✅ Running | No | None |
| 4 | Enrichment (geo, threat intel) | ⚠️ Partial | Partial | Medium |
| 5 | Indexing (OpenSearch) | ✅ Running | No | None |
| 6 | API + UI Serving | ✅ Running | No | None |

> **Key finding:** The local-dev stack includes `eventprocessor` (manager) and
> `eventprocessor-worker` services. The full correlation pipeline is available
> locally. Simulation mode exists as a fallback when services are stopped or
> for faster CI runs without waiting for correlation windows.

---

## Stage 1 — Log Ingestion

### Current Status in Local-Dev

**Available.** The `agentmanager` service runs in `docker-compose.yml` and accepts gRPC connections:

- **Ports exposed:** 9000 (gRPC agent management), 9001 (metrics), 9090 (admin)
- **Health check:** `nc -z localhost 9000`
- **Auth:** `INTERNAL_KEY` environment variable (shared secret)

The `eventprocessor-worker` service (MODE=worker) accepts log ingestion directly:

- **Port 50051:** HiveArmor gRPC (agents/collector)
- **Port 4317:** OTLP gRPC
- **Port 4318:** OTLP HTTP (future)

### What's Needed for gRPC Injection

To inject logs via gRPC from a test script:

1. A proto client compiled against `sdk/plugins/plugins.proto`
2. The `INTERNAL_KEY` or `EVENTPROCESSOR_INJECT_KEY` for authentication
3. Agent-manager and eventprocessor-worker containers must be running and healthy

Alternatively, the event-processor exposes an HTTP inject endpoint:
```
POST http://localhost:8090/v1/inject
Header: X-Inject-Key: ${EVENTPROCESSOR_INJECT_KEY}
```

### Fallback: Direct OpenSearch Bulk API

When agent-manager or event-processor is unavailable, logs can be indexed directly:

```bash
curl -sk -u admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD} \
  -X POST "https://localhost:9200/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @events.ndjson
```

This bypasses parsing, enrichment, and correlation — useful for testing API/UI layers in isolation.

### Action Items

- [ ] Create a lightweight gRPC test client (or use `grpcurl`) for injecting logs from bash scripts
- [ ] Document the HTTP inject endpoint (`POST :8090/v1/inject`) in the test harness README

---

## Stage 2 — Event Parsing

### Current Status in Local-Dev

**Available.** The event-processor loads pipeline YAML configurations from:

- **Container path:** `/workdir/pipeline/`
- **Docker volume:** `ep_pipeline` (managed volume)
- **Config file:** `local-dev/hivearmor_plugins.yaml` mounted at `/workdir/pipeline/hivearmor_plugins.yaml`

The pipeline configuration defines parsing stages (YAML filter operators with CEL `where` expressions). Source code:

- `event-processor/pipeline/loader.go` — loads pipeline YAML
- `event-processor/pipeline/executor.go` — executes filter stages
- `event-processor/pipeline/cel_where.go` — CEL condition evaluation
- `event-processor/pipeline/operators/` — operator implementations

### Where Filter Files Live

| Location | Purpose |
|----------|---------|
| `event-processor/pipeline/` | Go source for pipeline execution engine |
| `ep_pipeline` Docker volume | Runtime pipeline configs (loaded at startup) |
| `local-dev/hivearmor_plugins.yaml` | Plugin orchestration config (read-only mount) |

### Action Items

- [ ] Verify pipeline YAML files in `ep_pipeline` volume are populated on first start
- [ ] Document how to add custom filter stages for development testing

---

## Stage 3 — Correlation

### Current Status in Local-Dev

**Available.** The `eventprocessor` service (MODE=manager) runs the correlation engine:

- **Rule loading:** From `/workdir/rules/hivearmor/` (Docker volume `ep_rules`)
- **Test rules:** From `local-dev/rules/test/` (read-only bind mount at `/workdir/rules/test`)
- **Built-in rules:** Compiled into the binary from `event-processor/builtin-rules/`

The correlation engine uses:

- `event-processor/rules/engine.go` — rule execution engine
- `event-processor/rules/loader.go` — YAML rule loader
- `event-processor/rules/types.go` — rule type definitions
- CEL functions from `sdk/plugins/cel.go`

### Rule File Location

```
event-processor/builtin-rules/
├── cloud/          # Cloud provider rules
├── graph/          # Entity graph rules
├── linux/          # Linux endpoint rules
├── network/        # Network device rules
├── windows/        # Windows endpoint rules
└── tests/          # Rule test fixtures

local-dev/e2e/rules/        # E2E test correlation rules (5 rules)
local-dev/rules/test/       # Development test rules (mounted into container)
```

### CEL Engine Dependencies

The CEL engine is compiled into the event-processor binary. Available CEL functions:

```
celExists, safe, inCIDR, equals, equalsIgnoreCase,
contains, containsAll, oneOf, startsWith, endsWith, regexMatch
```

These are defined in `sdk/plugins/cel.go` and **must not be renamed** (production rules reference them by name).

### How to Load Custom Rules

E2E test rules are already mountable via the `local-dev/rules/test/` bind mount:

```yaml
# docker-compose.yml (already configured)
volumes:
  - ./rules/test:/workdir/rules/test:ro
```

To add new rules:
1. Place YAML files in `local-dev/rules/test/`
2. Restart the eventprocessor container: `docker compose restart eventprocessor`
3. Verify rules loaded via health endpoint: `curl http://localhost:8000/health`

### Action Items

- [ ] Copy E2E rules from `local-dev/e2e/rules/` to `local-dev/rules/test/` for live-mode testing
- [ ] Verify rule hot-reload (or document that restart is required)
- [ ] Document rule validation: `event-processor/rule-test` binary validates YAML syntax

---

## Stage 4 — Enrichment

### Current Status in Local-Dev

**Partially available.** The event-processor includes enrichment logic, but some data sources are missing locally.

#### Geolocation Enrichment

- **Required file:** MaxMind `GeoLite2-City.mmdb` database
- **Container path:** `/opt/hivearmor/geo/GeoLite2-City.mmdb`
- **Source directory:** `geolocation/` (gitignored)
- **Status:** ⚠️ Not mounted by default. The `docker-compose.yml` has a commented-out volume mount:
  ```yaml
  # Air-gap: mount a host-side MaxMind MMDB for offline geo enrichment
  # - ./geo/GeoLite2-City.mmdb:/opt/hivearmor/geo/GeoLite2-City.mmdb:ro
  ```
- **How to enable:** Download `GeoLite2-City.mmdb` from MaxMind (requires free license key), place in `local-dev/geo/`, uncomment the volume mount.

#### Threat Intelligence Feeds

- **Status:** ❌ Not available in local-dev
- **Requirement:** API keys for threat feed providers (not included in open-source/local setup)
- **Impact:** IP reputation, domain reputation, and IoC matching are not performed
- **Workaround:** None — enrichment data is omitted from locally correlated alerts

#### Entity Resolution

- **Status:** ✅ Available
- **Implementation:** Built into event-processor binary (`event-processor/enrichment/`)
- **Neo4j graph:** Entity-graph service (`entity-graph`) consumes Kafka events and writes to Neo4j
- **Dependency:** Requires Redpanda (Kafka) and Neo4j services (both in docker-compose)

### Action Items

- [ ] Download MaxMind GeoLite2-City.mmdb and place in `local-dev/geo/`
- [ ] Uncomment geo volume mount in `docker-compose.yml`
- [ ] Document that threat intel enrichment is unavailable in local-dev (by design)

---

## Stage 5 — Indexing

### Current Status in Local-Dev

**Fully operational.** OpenSearch is the primary data store and runs without issues:

- **URL:** `https://localhost:9200`
- **Credentials:** `admin` / value of `OPENSEARCH_INITIAL_ADMIN_PASSWORD` from `.env`
- **TLS:** Self-signed certificates in `local-dev/certs/`
- **Auto-create indexes:** `action.auto_create_index=true` (set in docker-compose)

### Available APIs

| API | Endpoint | Purpose |
|-----|----------|---------|
| Bulk Index | `POST /_bulk` | High-throughput document indexing |
| Search | `POST /{index}/_search` | Query documents |
| Count | `GET /{index}/_count` | Count documents |
| Index Stats | `GET /{index}/_stats` | Index metadata |
| Cluster Health | `GET /_cluster/health` | Service availability |

### Index Patterns

```
v3-hive-log-YYYY.MM.DD         Raw log events
v3-hive-alert-YYYY.MM.DD       Correlation alerts
v3-hive-entity-YYYY.MM.DD      Resolved entities
v3-hive-correlation-YYYY.MM.DD Correlated findings
```

### Blockers

**None.** Direct OpenSearch access is fully functional for both the event-processor pipeline and simulation-mode scripts.

---

## Stage 6 — API + UI Serving

### Current Status in Local-Dev

**Fully operational.**

- **Backend:** `http://localhost:8088` (Spring Boot, port 8080 internal → 8088 external)
- **Frontend v2:** `http://localhost:3000` (Next.js — production build in container)
- **Frontend v3:** `http://localhost:5173` (Vite dev server — run separately with `cd frontend-v3 && npm run dev`)
- **OpenSearch Dashboards:** `http://localhost:5601` (dev-only query tool)

The backend reads from OpenSearch on demand — no additional configuration needed once data is indexed.

---

## Simulation Mode Limitations

When running in simulation mode (event-processor bypassed), the following limitations apply:

| Limitation | Impact | Severity |
|-----------|--------|----------|
| No real-time correlation | Rules don't evaluate incoming events; alerts are pre-generated | High |
| Timing windows not validated | Simulated alerts fire regardless of actual event timing (5m, 10m, 1h windows) | Medium |
| Enrichment data is static | No geo lookup, no threat intel enrichment on simulated alerts | Low |
| No entity resolution | Entities are manually extracted from known event values, not auto-resolved | Medium |
| Findings are manually correlated | No automated attack chain detection — links are hard-coded | High |
| No Kafka event flow | Events skip the Redpanda bus, so entity-graph service is not triggered | Medium |
| No risk score calculation | Risk scores are manually assigned, not computed by the scoring algorithm | Low |

### What Simulation Mode Proves

Despite limitations, simulation mode validates:

- ✅ OpenSearch indexing and query (bulk API, search, count)
- ✅ Backend API serving pipeline-shaped data correctly
- ✅ Frontend rendering alerts, entities, findings without errors
- ✅ Data format compatibility (ECS fields, index patterns, document structure)
- ✅ Tenant scoping (`visibleBy` field filtering)

### What Simulation Mode Does NOT Prove

- ❌ CEL rule expressions fire correctly on real event sequences
- ❌ Time-window aggregations produce correct threshold counts
- ❌ Enrichment pipeline adds geo/threat data
- ❌ Entity resolution de-duplicates and merges correctly
- ❌ Attack chain correlation identifies multi-stage sequences
- ❌ Kafka message ordering and delivery guarantees

---

## Path to Full Pipeline (Local-Dev)

### Docker Services Already Available

All core services are present in `local-dev/docker-compose.yml`:

| Service | Container | Status |
|---------|-----------|--------|
| PostgreSQL | `postgres` | ✅ Running |
| OpenSearch | `opensearch` | ✅ Running |
| Agent Manager | `agentmanager` | ✅ Running |
| Event Processor (manager) | `eventprocessor` | ✅ Running |
| Event Processor (worker) | `eventprocessor-worker` | ✅ Running |
| Backend API | `backend` | ✅ Running |
| Frontend v2 | `frontend-v2` | ✅ Running |
| Neo4j | `neo4j` | ✅ Running |
| Redpanda (Kafka) | `redpanda` | ✅ Running |
| Entity Graph | `entity-graph` | ✅ Running |

### Configuration to Enable Full Pipeline

#### Volume Mounts for Rules

Already configured in `docker-compose.yml`:
```yaml
eventprocessor:
  volumes:
    - ep_rules:/workdir/rules/hivearmor        # Production rules volume
    - ./rules/test:/workdir/rules/test:ro       # Test rules bind mount
```

To add E2E rules for live testing:
```bash
cp local-dev/e2e/rules/*.yaml local-dev/rules/test/
docker compose restart eventprocessor
```

#### Environment Variables (Already Set)

| Variable | Service | Purpose |
|----------|---------|---------|
| `OPENSEARCH_HOST` | eventprocessor | OpenSearch connectivity |
| `OPENSEARCH_PORT` | eventprocessor | OpenSearch port (9200) |
| `OPENSEARCH_USER` | eventprocessor | OpenSearch auth (admin) |
| `OPENSEARCH_PASSWORD` | eventprocessor | OpenSearch password |
| `INTERNAL_KEY` | backend, agentmanager, eventprocessor | Inter-service auth |
| `EVENTPROCESSOR_INJECT_KEY` | eventprocessor | HTTP inject auth |
| `KAFKA_BROKER` | eventprocessor, entity-graph | Redpanda connectivity |

#### gRPC Connectivity

```
Agent/Collector → port 50051 (eventprocessor-worker)
                → processed events → Kafka (redpanda:9092)
                → eventprocessor (manager) reads from Kafka
                → correlates, enriches, indexes to OpenSearch
```

#### Geo Enrichment (Optional)

```bash
# 1. Sign up at https://www.maxmind.com/ for free GeoLite2 license
# 2. Download GeoLite2-City.mmdb
# 3. Place in local-dev/geo/
mkdir -p local-dev/geo
cp ~/Downloads/GeoLite2-City.mmdb local-dev/geo/

# 4. Uncomment volume mount in docker-compose.yml:
#    - ./geo/GeoLite2-City.mmdb:/opt/hivearmor/geo/GeoLite2-City.mmdb:ro

# 5. Restart event-processor
docker compose restart eventprocessor eventprocessor-worker
```

---

## Recommended Next Steps (Prioritized)

1. **Copy E2E rules to test volume and run live-mode test** (highest priority)
   - Copies `local-dev/e2e/rules/*.yaml` → `local-dev/rules/test/`
   - Restarts event-processor to load rules
   - Runs injection via HTTP inject endpoint and waits for correlation
   - Validates that all 5 rules fire and produce real alerts
   - _Why:_ Proves the correlation engine works end-to-end with these exact rule definitions

2. **Download GeoLite2 MMDB and enable geo enrichment**
   - Enables IP geolocation on all correlated alerts
   - Proves enrichment pipeline adds `source.geo.*` and `destination.geo.*` fields
   - _Why:_ Geo data is the most commonly missing enrichment in production deployments

3. **Verify rule hot-reload behavior**
   - Determine if event-processor watches the rules directory or requires restart
   - Document the rule reload mechanism for operators
   - _Why:_ Production deployments need to update rules without downtime

4. **Inject via gRPC endpoint for full agent-path testing**
   - Build or use `grpcurl` with the event-processor proto definitions
   - Test the agent → agent-manager → event-processor path
   - _Why:_ Validates the actual production ingestion path (not just HTTP inject)

5. **Configure threat intel feed (lower priority — requires API keys)**
   - Requires subscription to a threat intelligence provider
   - Enables IoC matching, IP reputation, and domain reputation enrichment
   - _Why:_ Not critical for local validation; production uses managed feeds

---

## File References

| Path | Purpose |
|------|---------|
| `local-dev/docker-compose.yml` | All service definitions (full stack) |
| `local-dev/.env` | Environment variable configuration |
| `local-dev/.env.example` | Template with documentation |
| `local-dev/rules/test/` | Test rules mounted into event-processor |
| `local-dev/e2e/rules/` | 5 E2E correlation rules (YAML + CEL) |
| `local-dev/e2e/events/` | 500 generated log events (NDJSON) |
| `local-dev/e2e/simulation/` | Alert/entity/finding generators (sim mode) |
| `local-dev/e2e/verify/` | API and UI verification scripts |
| `local-dev/e2e-pipeline-test.sh` | Main test harness entry point |
| `event-processor/rules/` | Correlation engine source (Go) |
| `event-processor/builtin-rules/` | Built-in rule YAML files |
| `event-processor/pipeline/` | Pipeline/filter execution engine |
| `event-processor/enrichment/` | Enrichment logic (geo, entity resolution) |
| `sdk/plugins/cel.go` | CEL function definitions |
| `geolocation/` | MaxMind CSV data (gitignored, build-time download) |
