# HiveArmor E2E Backend Pipeline Test Results

**Date:** 2026-08-02  
**Stack uptime:** ~45 minutes  
**Frontend:** excluded (testing backend only)

---

## Infrastructure Layer

| Component | Status | Details |
|-----------|--------|---------|
| PostgreSQL | ✓ UP | Port 5438, accepting connections |
| OpenSearch | ✓ UP | Yellow (normal for single-node), 110+ shards |
| Redpanda (Kafka) | ✓ UP | Healthy, 4 topics present |
| Neo4j | ✓ UP | Port 7474/7687, APOC plugin loaded |

## Service Layer

| Service | Status | Details |
|---------|--------|---------|
| Backend (Java/Spring Boot) | ✓ UP | Port 8088, JWT auth working |
| Agent-Manager | ✓ UP | gRPC port 9000 |
| Event-Processor (manager) | ✓ UP | Port 8000/8090, 642 rules loaded |
| Event-Processor (worker) | ✓ UP | gRPC 50051, OTLP 4317 |
| User-Auditor | ✓ UP | Tomcat initialized |
| Entity-Graph | ✓ UP | 4 Kafka workers, Neo4j connected |
| Compliance Orchestrator | ✓ UP | Last run today, 79 mappings |
| Redpanda Console | ✓ UP | Port 8081 |

## Alert Round-Trip Test (Sprint 01)

| Check | Result |
|-------|--------|
| JWT authentication | ✓ PASS |
| Alert injection to OpenSearch | ✓ PASS |
| OpenSearch cluster health | ✓ PASS (yellow) |
| Alert index has documents | ✓ PASS (509 alerts) |
| Severity stored as integer | ✓ PASS |
| Inputs plugin gRPC port 50051 | ✓ PASS |
| Backend API alert count | ✓ PASS (259 open) |
| Stats index | ⚠ WARN (empty — stats plugin interval) |

**Score: 7/8 PASS**

## Kafka Pipeline E2E (Sprint 08)

| Check | Result |
|-------|--------|
| Redpanda cluster health | ✓ PASS |
| Required Kafka topics present | ✓ PASS (all 4) |
| Ingest endpoint reachable | ✓ PASS |
| HTTP inject → Kafka → OpenSearch | ✓ PASS (20/20 events) |
| Consumer group registered | ✓ PASS |
| 1000-event throughput test | ✓ PASS (8 seconds, all in OS) |
| Consumer lag | ✓ PASS (lag = 0) |
| Redpanda Console UI | ✓ PASS |
| Alert generation from Kafka events | ⚠ WARN (needs afterEvents history) |

**Score: 8/9 PASS** (with correct EVENTPROCESSOR_INJECT_KEY)

## Detection Engine (Sprint 03)

| Check | Result |
|-------|--------|
| Rules loaded from YAML | ✓ PASS (642 rules) |
| CEL rule evaluation | ✓ PASS (eventCode=1102 → 2 alerts fired!) |
| afterEvents correlation (OS query) | ✓ FUNCTIONAL |
| Risk/threshold detection | ⚠ NOT ACTIVE (hasRiskScore=0, Sprint 12 feature) |
| Sequence detection | ⚠ NOT ACTIVE (hasSequence=0, Sprint 12 feature) |
| Anomaly detection | ⚠ NEEDS BASELINE (72 hourly buckets minimum) |
| Event-Processor rules API | ✓ PASS |
| Backend rules API | ✓ PASS |

**Score: 5/8 PASS** — Remaining items are Sprint 12 features not yet built

## Enrichment Pipeline

| Enrichment | Status | Details |
|------------|--------|---------|
| GeoIP (CSV) | ✓ LOADED | 663K ASN blocks, 3.7M city blocks, 80K locations |
| GeoIP (MMDB fallback) | ⚠ NOT MOUNTED | /opt/hivearmor/geo/ missing |
| Threat Intel feeds | ✓ INITIALIZED | 15-minute refresh loop active |
| Graph context | ✓ INITIALIZED | Queries alert history for related entities |
| Compliance evaluator | ✓ ACTIVE | 1406 evidence docs indexed today |

**Note:** GeoIP enrichment is loaded and functional in the event-processor, but the `/v1/inject` test endpoint has a code issue where it creates a temp map for enrichment but doesn't write the geo results back to the proto Event. The production path (Kafka consumer → full pipeline) handles this correctly.

## Compliance

| Check | Result |
|-------|--------|
| Health endpoint | ✓ ok |
| Evidence indexing | ✓ Active (v3-hive-compliance-evidence-2026.08.02) |
| Mapping count | ✓ 79 compliance mappings |

## Ports Verified Open

| Port | Service |
|------|---------|
| 5438 | PostgreSQL |
| 8088 | Backend REST API |
| 8000 | Event-Processor public API |
| 8090 | Event-Processor inject endpoint |
| 8094 | Compliance orchestrator |
| 9000 | Agent-Manager gRPC |
| 9200 | OpenSearch |
| 4317 | OTLP gRPC receiver |
| 50051 | Inputs plugin (agent/collector gRPC) |
| 7474 | Neo4j HTTP browser |
| 7687 | Neo4j Bolt protocol |
| 19092 | Kafka external API |
| 8081 | Redpanda Console |

---

## Summary

```
PASS:     30 checks
WARNINGS:  6 checks  
FAILURES:  0 critical
```

## Known Issues Found

1. **Stats plugin not writing** — May need longer uptime or config check
2. **Risk/Sequence rules not active** — These are Sprint 12 features (Go SDK work in progress)
3. **Anomaly detection needs baseline** — Requires 72+ hours of historical data
4. **GeoIP inject path** — `ingest.go:ingestEventMap()` creates a minimal map that enrichment writes to, but the geo result isn't written back to the Event proto before OpenSearch indexing
5. **MMDB file not mounted** — docker-compose.yml has the volume mount commented out
6. **Test scripts use wrong default inject key** — `kafka-e2e.sh` defaults to `change-me-generate-with-openssl-rand-hex-32` but `.env` has `localdev-inject-key-2024`

## How to Reproduce

```bash
cd local-dev
docker compose up -d   # wait ~3 min

# Sprint 01 (basic health)
bash tests/alert-roundtrip-test.sh

# Sprint 03 (detection engine)
bash tests/detection-e2e-test.sh

# Sprint 08 (Kafka pipeline) — USE CORRECT KEY
EVENTPROCESSOR_INJECT_KEY=localdev-inject-key-2024 bash tests/kafka-e2e.sh

# Manual inject test (triggers alert!)
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -H "X-Inject-Key: localdev-inject-key-2024" \
  -d '{"dataType":"wineventlog","dataSource":"DC01","originIp":"10.0.1.1","log":{"eventCode":"1102"}}'
```
