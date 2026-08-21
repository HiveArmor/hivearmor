# Performance Baseline — Sprint 49: API Hardening

## Overview

This document records p50/p95/p99 latency baselines for key HiveArmor API endpoints,
established after Sprint 49 hardening (security headers, validation, rate limiting,
idempotency). These numbers are local-dev relative — not production SLA targets, but
regression-detection baselines.

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Tool | k6 (Grafana) |
| Script | `local-dev/perf/k6-baseline.js` |
| Virtual Users | 50 per scenario (250 total concurrent) |
| Duration | 5 minutes sustained load per scenario |
| Target | Local-dev Docker Compose stack |
| Hardware | _[TO BE FILLED — CPU, RAM, disk type]_ |
| Data Volume | _[TO BE FILLED — number of seeded alerts, entities, etc.]_ |
| Backend Version | Sprint 49 (post-hardening) |
| JVM | Java 17 (Spring Boot 3.3) |
| Database | PostgreSQL 15 + OpenSearch 2.x |

## Results

### Alert Queue — `POST /api/ha-alerts/queue`

| Metric | Value |
|--------|-------|
| p50 | _[PENDING]_ |
| p95 | _[PENDING]_ (threshold: < 2000ms) |
| p99 | _[PENDING]_ |
| Throughput (req/s) | _[PENDING]_ |
| Error Rate | _[PENDING]_ |

### Severity Board — `POST /api/ha-alerts/severity-board`

| Metric | Value |
|--------|-------|
| p50 | _[PENDING]_ |
| p95 | _[PENDING]_ (threshold: < 1500ms) |
| p99 | _[PENDING]_ |
| Throughput (req/s) | _[PENDING]_ |
| Error Rate | _[PENDING]_ |

### Threat Hunt Search — `POST /api/ha-hunt/search`

| Metric | Value |
|--------|-------|
| p50 | _[PENDING]_ |
| p95 | _[PENDING]_ (threshold: < 5000ms) |
| p99 | _[PENDING]_ |
| Throughput (req/s) | _[PENDING]_ |
| Error Rate | _[PENDING]_ |

### Entity Inventory — `GET /api/ha-entities`

| Metric | Value |
|--------|-------|
| p50 | _[PENDING]_ |
| p95 | _[PENDING]_ (threshold: < 2000ms) |
| p99 | _[PENDING]_ |
| Throughput (req/s) | _[PENDING]_ |
| Error Rate | _[PENDING]_ |

### Constellation Explore — `POST /api/ha-graph/explore`

| Metric | Value |
|--------|-------|
| p50 | _[PENDING]_ |
| p95 | _[PENDING]_ (threshold: < 3000ms) |
| p99 | _[PENDING]_ |
| Throughput (req/s) | _[PENDING]_ |
| Error Rate | _[PENDING]_ |

## Known Bottlenecks

| Endpoint | Observation | Recommendation |
|----------|-------------|----------------|
| _[PENDING]_ | _[PENDING]_ | _[PENDING]_ |

## Notes

- Actual values will be filled after running `k6 run local-dev/perf/k6-baseline.js`
  against the full local-dev stack with seeded data.
- Running the baseline requires the complete stack (PostgreSQL, OpenSearch, backend)
  to be up and data seeded via `local-dev/seed-data.sh`.
- These baselines are for regression detection — if a future sprint significantly
  degrades these numbers, investigate before merging.
- The k6 script authenticates once per VU (setup phase) and reuses the JWT token.
- Sleep intervals between requests simulate realistic user think time.

## How to Run

```bash
# Install k6 (macOS)
brew install k6

# Start the stack
cd local-dev && docker compose up -d

# Seed test data
bash local-dev/seed-data.sh

# Run baseline
k6 run local-dev/perf/k6-baseline.js

# Export results to JSON (optional)
k6 run --out json=results.json local-dev/perf/k6-baseline.js
```

## Change Log

| Date | Change |
|------|--------|
| Sprint 49 | Initial baseline creation (pending execution) |
