# Task 9: Performance and Reliability Audit

**Audit Date:** 2026-07-08
**Scope:** Backend OpenSearch queries, frontend rendering, memory leaks, Docker infrastructure

---

## 1. Backend Query Risk Table

| Service / File | Method | Issue | Risk Level |
|---|---|---|---|
| `ElasticsearchService` | `getFieldValues(keyword, indexPattern)` | Hardcoded `size(10000)` on terms aggregation — fetches up to 10,000 distinct keyword values into JVM heap on every call. No `_source` filter needed (agg only), but the bucket count is unbounded in practice. | HIGH |
| `UtmDataInputStatusService` | anonymous `SearchRequest` (line 487–500) | `size(10000)` with `.collapse()` on `STATISTICS_INDEX_PATTERN` — pulls 10,000 raw documents into memory to build a per-source stats map. The collapse reduces the final document count but OpenSearch still allocates 10,000 result slots. | HIGH |
| `SourceActivityProvider` | `buildActivityQuery` | Terms agg `by_source` with `size(10000)` AND nested `by_type` with `size(10000)` — at 10,000 sources × 10,000 types × 1 topHit, the in-memory shard footprint can exceed JVM limits during alert storms. | HIGH |
| `RequestDsl` | `applyPagination` (LIST_CHART branch, line 81) | `size(10000)` with `_source` excludes then explicit field includes — field filtering is present (mitigating factor), but 10,000 hits per chart widget request is still large. Called synchronously per chart render. | MEDIUM |
| `UtmComplianceControlEvaluationLatestService` | `getControlsWithLastEvaluation` | **N+1 query pattern**: iterates over a `Page<UtmComplianceControlConfig>` (default page = 20 controls) and calls `elasticsearchService.getLatestControlEvaluation(control.getId())` once per control — 20+ separate round-trips to OpenSearch per page load. | HIGH |
| `SearchUtil.buildIsInFields` / `buildIsNotInFields` | `defaultField("*")` wildcard query-string | Uses `query_string` with `defaultField("*")` and leading wildcard `*value*` — this is a full-document scan on every field. No field filtering. Can cause OpenSearch circuit-breaker trips on large indices. | HIGH |
| `SearchUtil.buildContainOperator` / `buildDoesNotContainOperator` | leading wildcard search | `*value*` pattern in `query_string` — leading wildcards force segment-level scans; not cacheable; slow on high-cardinality fields. Used in general filter UI (any user query). | MEDIUM |
| `ElasticsearchService.getAllIndexes` | (index listing) | Calls `getIndices(pattern, sort)` which fetches **all** index records then does Java-side pagination (`PagedListHolder`). If there are thousands of indices, the entire list is loaded into memory before pagination. | MEDIUM |
| `SqlQueryFilterService` | `toSqlCondition` (IS, CONTAIN, IS_ONE_OF, etc.) | **SQL injection risk**: filter values are string-interpolated directly into SQL without parameterization or escaping (`field + " = '" + list.get(0) + "'"` etc.). If user-controlled, this is a critical security issue as well as a reliability risk. | CRITICAL (security + reliability) |
| `ElasticsearchService` | `search(filters, top, indexPattern, pageable, type)` via `buildQuery` | Uses offset-based pagination (`from` + `size` via `applyPaginationAndSort`). At deep pages (e.g. page 500 × size 20 = `from: 10000`), OpenSearch performs full-scan + in-memory sort of 10,000 docs before slicing. | MEDIUM |

**Positive findings:**
- `searchStream` uses proper `search_after` pagination with `@timestamp desc, _id desc` tiebreaker — correct for large exports.
- `getLatestDocument`, `exists`, `count`, `getLatestControlEvaluation` are all bounded (`size(1)` or `size(0)`).
- `getControlEvaluations` is bounded at `size(30)`.
- Caffeine cache exists only for TFA setup state (10-minute TTL, max 1,000 entries). No query result caching exists anywhere.

---

## 2. Frontend Rendering Performance Risk Table

| Component / File | Issue | Impact |
|---|---|---|
| `alerts/page.tsx` | Non-virtualized list: `filtered.map((alert) => {...})` renders all rows in DOM. Default page size 40 is acceptable, but at `pageSize=100` (selectable via UI) or during rapid re-renders, all 100 alert rows are full DOM nodes. | MEDIUM |
| `logs/log-results-table.tsx` | Correctly virtualized with `@tanstack/react-virtual`. No issue. | None |
| `alerts/page.tsx` — KPI polling | `setInterval(loadKpis, 60_000)` runs 4 count-only queries (`size:1`) every 60s *independently* from the 30s alert list poll. Total: 5 OpenSearch queries every 30s just for the alerts page, compounding during alert storms. | MEDIUM |
| `alerts/page.tsx` — alert list + SSE | Both `setInterval(() => loadAlerts(true), 30_000)` AND `useAlertStream` (SSE) are active simultaneously. The SSE correctly notifies on new alerts, but the 30s poll also fires unconditionally. When alerts are streaming rapidly, every SSE event triggers `loadAlerts(true)` which issues a fresh paginated OpenSearch query. | HIGH |
| `dashboard/page.tsx` | `setInterval(() => loadAll(true), 30_000)` — full dashboard refresh every 30s regardless of visibility. No `document.visibilityState` check. | LOW–MEDIUM |
| `vulnerability-scanner/page.tsx` | `setInterval(() => loadOverview(true), POLL_INTERVAL_MS)` — polling every N seconds for scanner overview. Cleanup correctly uses `pollRef`. Low severity but adds to query load. | LOW |
| `React.memo` usage | Only 1 component uses `memo()` (`PlaybookNode`). 215 `useMemo`/`useCallback` usages exist but no data components (alert rows, log rows) are memoized, meaning parent re-renders cascade to all children. | MEDIUM |
| `investigation/investigation-entity-graph.tsx` | `window.addEventListener("mousemove"/"mouseup")` at line 284–285. The return cleanup at 281–282 only removes if the drag-end fires correctly; if the component unmounts mid-drag, both global listeners stay attached. | MEDIUM |

---

## 3. Memory Leak Inventory

### SSE Connections

| Hook | File | Status |
|---|---|---|
| `useEpsStream` | `hooks/useEpsStream.ts` | **Clean** — cleanup function calls `es.close()` and nulls ref on both unmount and error. |
| `useAlertStream` | `hooks/useAlertStream.ts` | **Partially clean** — cleanup calls `es.close()`, but `onerror` nulls `esRef.current` without reconnecting; if the component re-mounts before cleanup, a ghost connection can linger. SSE connections are not cleaned up on auth token expiry (no reconnect logic). |

### WebSocket

| Hook | File | Status |
|---|---|---|
| `useIncidentCommandWs` | `hooks/use-incident-command-ws.ts` | **Mostly clean** — `disconnect()` clears heartbeat interval and closes WS. Unmount effect sets `mountedRef.current = false` and clears heartbeat, but does **not** call `disconnect()` — the WS socket itself is not closed on unmount if `hostname` is still set. Race condition: if `hostname` changes and old `connect()` fires after new `disconnect()`, `wsRef.current` can point to a closed socket. Heartbeat interval at line 162 captured in closure may fire after WS is closed. |

### Event Listeners

| Component | Listener | Cleanup Status |
|---|---|---|
| `investigation-entity-graph.tsx` | `window.mousemove + mouseup` (lines 284–285) | Cleanup at 281–282 runs inside the drag-start handler's sub-cleanup — **only fires when drag ends via mouseup**. If component unmounts mid-drag, global listeners leak. |
| `investigation-evidence-board.tsx` | `window.mousemove + mouseup` (lines 122–123) | Same pattern — same risk. |
| `admin/page.tsx`, `integrations/page.tsx`, `threat-intel/page.tsx` | `window.keydown`, `document.mousedown` | All have `return () => removeEventListener(...)` in effect cleanup. **Clean.** |
| `layout/topbar.tsx`, `layout/command-palette.tsx` | `document.keydown` | Cleanup present. **Clean.** |

### Polling Without Cleanup

| File | Pattern | Status |
|---|---|---|
| `alerts/page.tsx` line 270 | `setInterval` → `return () => clearInterval(id)` | **Clean** |
| `alerts/page.tsx` line 323 | `setInterval(loadKpis, 60_000)` | **Clean** — uses `mounted` flag + clearInterval |
| `dashboard/page.tsx` line 73 | `setInterval` → `return () => clearInterval(id)` | **Clean** |
| `admin/page.tsx` line 1420 | `setInterval(refresh, 30_000)` | **Clean** — clearInterval in both else-branch and cleanup |
| `vulnerability-scanner/page.tsx` line 212 | `pollRef.current = setInterval(...)` + cleanup | **Clean** |

---

## 4. Infrastructure Risks (Docker / Config)

### OpenSearch
- JVM heap: `OPENSEARCH_JAVA_OPTS=-Xms1024m -Xmx1024m` (1 GB heap, fixed). Container memory limit is 3072 MB (3 GB). With 1 GB JVM heap plus native OpenSearch off-heap (segments, page cache), the container will OOM before OpenSearch's own circuit breakers trigger if query load is high. Recommended minimum heap for production SIEM: 2–4 GB.
- `bootstrap.memory_lock=false` — allows heap swapping to disk under pressure, which causes latency spikes not OOM kills. Acceptable for dev, problematic for prod under storm conditions.
- Single-node configuration (`discovery.type=single-node`) — no shard redundancy. Index loss on container failure.

### PostgreSQL
- HikariCP pool configured in `application-prod.yml` without `maximumPoolSize` — defaults to **10 connections**. PostgreSQL is configured with `max_connections=1000` in docker-compose, so the ceiling is high, but 10 backend connections per pod may bottleneck during concurrent API requests. No explicit `minimumIdle`, `connectionTimeout`, or `idleTimeout` set.
- Memory limit: 1024 MB (reasonable for dev).

### Redis
- Redis **is** actually used by the backend: `AlertRedisPublisher` publishes to a `ALERTS_CHANNEL` for SSE streaming. In `application-dev.yml`, Redis is explicitly disabled (`redis.enabled: false`). In production (`application-prod.yml`), Redis is enabled via `REDIS_HOST`/`REDIS_PORT` env vars. Redis has a 128 MB memory limit — with no `maxmemory-policy` set, Redis will block writes when full.
- No `maxmemory-policy` configured on the redis service in docker-compose. Default is `noeviction`, meaning Redis will return errors on new writes when memory is full rather than evicting old data.

### Missing Health Checks
- **`web-pdf`** service has no `healthcheck`. It depends on `backend: service_started` and `frontend: service_started` (not `service_healthy`). Selenium-based PDF service can silently fail and never be detected.
- **`frontend-v2`** service has no `healthcheck`. If Next.js fails to start or crashes, no container restart signal is generated beyond the `restart: unless-stopped` policy.
- **`opensearch-dashboards`** has no `healthcheck`. Minor (dev-only service), but if dashboards crashes, no alerting.

### OpenSearch Dashboards in docker-compose
- Marked as `# DEV ONLY` in comments but is present in the same `docker-compose.yml` file. Risk of accidentally deploying to prod. Should be in a separate `docker-compose.dev.yml` override.

---

## 5. Top 5 Performance Issues Most Likely to Cause Incident During High-Volume Alert Storms

**Ranked by likelihood of causing a production incident during high-volume alert ingestion:**

### 1. Compliance N+1 Query Pattern — Compliance Page Lock-Up (HIGH)
**File:** `UtmComplianceControlEvaluationLatestService.getControlsWithLastEvaluation`
**Mechanism:** Each page load fires N sequential OpenSearch round-trips (one per control, default page size = 20). Under alert storms, OpenSearch latency increases; 20 × 500ms = 10s page load. N+1 also prevents OpenSearch from batching/caching. With multiple users loading the compliance page simultaneously, this creates a query pile-up.
**Fix:** Fetch a page of `controlIds` first, then use a single multi-search or terms query to retrieve all latest evaluations in one request.

### 2. `getFieldValues` size(10000) + OverviewService Called Per Dashboard Refresh (HIGH)
**File:** `ElasticsearchService.getFieldValues`, called by `OverviewService` every 30s dashboard refresh
**Mechanism:** Terms aggregation requesting 10,000 buckets on a log index. During a storm, if the `log-*` index has thousands of unique `dataType` values, this agg uses significant OpenSearch heap. At 30s intervals with multiple browser tabs open, concurrent aggregations can cause OpenSearch heap pressure and trigger circuit-breaker 503s.
**Fix:** Cap at 100–200 unique data types; cache the result in Caffeine for 60s since data types change slowly.

### 3. `UtmDataInputStatusService` size(10000) Collapse Query (HIGH)
**File:** `UtmDataInputStatusService`, line 487–500
**Mechanism:** Fetches 10,000 documents via a collapse query to enumerate active data sources. This query runs on the statistics index on every `getDataSourceStatus` call. Under a storm, the statistics index grows rapidly; a size-10,000 collapse query forces OpenSearch to evaluate 10,000 hits before collapsing, holding them in memory simultaneously.
**Fix:** Replace with an aggregation-only query (`.size(0)` with terms agg), which is what `SourceActivityProvider.buildActivityQuery` already does correctly — consolidate to that pattern.

### 4. Alert Page Dual-Refresh: SSE + setInterval Both Trigger OpenSearch Queries (HIGH)
**File:** `frontend-v2/src/app/(app)/alerts/page.tsx`
**Mechanism:** `useAlertStream` (SSE) calls `loadAlerts(true)` on every new alert event, AND a 30s `setInterval` also calls `loadAlerts`. During a storm with 10 alerts/second, `loadAlerts` is called effectively continuously. Each call issues a paginated OpenSearch search. The backend has no rate limiting or debouncing on the alerts search endpoint. This can generate hundreds of concurrent OpenSearch queries from a single browser tab.
**Fix:** Debounce `loadAlerts` calls from SSE events (e.g. 3s trailing debounce). The setInterval can be dropped entirely once SSE triggers are debounced correctly.

### 5. HikariCP Default Pool Size (10) Under Concurrent API Load (MEDIUM–HIGH)
**File:** `application-prod.yml` — no `maximumPoolSize` set
**Mechanism:** With 10 active browser sessions each polling alerts (30s), dashboard (30s), and KPIs (60s) simultaneously, the backend can easily exhaust 10 Hikari connections waiting on slow OpenSearch responses. JPA queries queue behind OpenSearch-heavy operations sharing the same thread pool. Result: `HikariPool-1 - Connection is not available` timeouts on unrelated database operations (menu loads, user preferences, config reads).
**Fix:** Set `maximumPoolSize: 25` in `application-prod.yml` hikari config and increase `connectionTimeout` from default 30s to detect pool exhaustion faster.

---

## Summary Statistics

- **Backend queries with `size >= 1000`:** 4 (getFieldValues@10000, UtmDataInputStatusService@10000, SourceActivityProvider@10000×2, RequestDsl LIST_CHART@10000)
- **N+1 patterns found:** 1 confirmed (compliance controls page)
- **Queries using `search_after` (efficient):** 1 (`searchStream`)
- **Queries using offset pagination (potential deep-page issue):** All other paged queries via `applyPaginationAndSort`
- **Queries using `_source` field filtering:** 1 (RequestDsl LIST_CHART — but only on the 10,000-size branch)
- **Cache coverage:** TFA setup only (not query results)
- **Frontend virtualizers:** 1 (log results table) — alerts table not virtualized
- **Polling intervals active simultaneously on alerts page:** 2 (30s + 60s) plus SSE
- **Memory leak confirmed:** WebSocket unmount path in `useIncidentCommandWs` does not call `disconnect()`; investigation graph global mouse listeners leak on unmount-during-drag
- **Docker services without healthcheck:** `web-pdf`, `frontend-v2`, `opensearch-dashboards`
