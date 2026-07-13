# Task 3: Complete Data Flow Audit — Log Collection to Frontend Display

**Audit Date:** 2026-07-08
**Codebase:** /Users/encryptshell/GIT/UTMStack-11

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT / COLLECTOR HOST                              │
│                                                                              │
│  Collectors:                                                                 │
│  • Syslog TCP/UDP (:7014)     • NetFlow UDP (:2055)                          │
│  • Linux journald/auditd      • Windows Event Log (wevtapi)                 │
│  • File tail (nginx, pg)      • macOS (external binary)                     │
│  • Filebeat log reader        • HTTP integrations (:8080)                   │
│                │                                                             │
│                ▼                                                             │
│  LogQueue chan *plugins.Log [10,000]                                         │
│                │                                                             │
│  logprocessor: SQLite WAL (logs.db, processed=false)                        │
│                │                                                             │
│                ▼                                                             │
│  gRPC :50051 → plugins/inputs (TLS, key+id+type auth)                       │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ ACK (LastId) ← sent back once log hits localLogsChannel
┌─────────────────────────────────────────────────────────────────────────────┐
│                          plugins/inputs                                      │
│                                                                              │
│  gRPC :50051 (TLS)  OR  HTTPS :8080 (connection-key)                        │
│                │                                                             │
│  localLogsChannel [cpu*100]                                                  │
│                │                                                             │
│  output.go (cpu goroutines) → unix:///workDir/sockets/engine_server.sock    │
│                                  (NO TLS, NO AUTH on this hop)              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ immediate Ack sent before processing completes
┌─────────────────────────────────────────────────────────────────────────────┐
│                          event-processor                                     │
│                                                                              │
│  engine_socket.go: Input() → go processLog(log)  [UNBOUNDED goroutines]     │
│                                                                              │
│  Pipeline:                                                                   │
│  1. pipeline.Execute()    — YAML filters (grok/json/kv/drop), hot-reload    │
│  2. lookup.Enrich()       — asset/identity (OS cache, 5-min refresh)        │
│  3. enrichment.Enrich()   — geo + threat intel (15-min refresh)             │
│  4. writer.WriteEvent()   — BulkQueue → v11-log-<dataType>-YYYY.MM.DD      │
│  5. rulesengine.Evaluate() — CEL + OpenSearch correlation                   │
│  6. writer.WriteAlert()   — direct HTTP PUT → v11-alert-YYYY.MM.DD         │
│     └── offense.Process() — (enterprise) → v11-offense-YYYY.MM.DD          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ OpenSearch indices
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OpenSearch                                          │
│                                                                              │
│  v11-log-<dataType>-YYYY.MM.DD     (logs, bulk, 5s/500-event flush)         │
│  v11-alert-YYYY.MM.DD              (alerts, direct PUT per alert)           │
│  v11-offense-YYYY.MM.DD            (offenses, written by separate service)  │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ Spring Boot Java backend
┌─────────────────────────────────────────────────────────────────────────────┐
│                          backend (Java / Spring Boot)                        │
│                                                                              │
│  Index patterns from Postgres utm_index_pattern table:                       │
│  • LOGS   → v11-log-*                                                        │
│  • ALERTS → v11-alert-*                                                      │
│                                                                              │
│  Key endpoints:                                                              │
│  POST /api/elasticsearch/search     — log/event queries                      │
│  POST /api/elasticsearch/search/sql — SQL queries                           │
│  GET  /api/utm-alerts/count-open-alerts                                     │
│  POST /api/utm-alerts/status,tags,notes                                     │
│  GET  /api/offenses, /api/offenses/{id}/alerts                              │
│  GET  /api/overview/*               — dashboard aggregations                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼ Angular SPA (relative URLs, proxy-dependent)
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Angular Frontend                                    │
│                                                                              │
│  No real-time streaming — polling only:                                      │
│  • OpenAlertsService polls api/utm-alerts/count-open-alerts every 3s        │
│  • Alert list has no auto-poll (banner-triggered only)                      │
│  • Dashboard auto-refresh BROKEN (empty callback, service never injected)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Hop-by-Hop Detail with File:Line References

### Hop 1: Collector → LogQueue

| Collector | File | Key Lines | Notes |
|---|---|---|---|
| Syslog TCP/UDP | `agent/collector/syslog/syslog.go` | listener goroutines | RFC5425 or newline framing; UDP max 2048B, TCP max 8192B |
| NetFlow | `agent/collector/netflow/netflow.go` | :235, :276-308 | v1/5/6/7/9/IPFIX; template cache per source IP, 30-min TTL |
| File tail | `agent/collector/file/file.go` | :265-272 | fsnotify + 1s poll; seeks to end on first open; **explicit drop when full** |
| Linux journald | `agent/collector/platform/linux_amd64.go` | :125 | `journalctl -f -o json` subprocess |
| Linux auditd | `agent/collector/platform/auditd.go`, `stream.go` | stream.go:51, :56-63 | netlink multicast; **drops on full with sequence log** |
| Windows Event Log | `agent/collector/platform/windows_amd64.go` | :345-348 | win32 EvtSubscribe; **drops silently when incomingEvents [1024] full** |
| macOS | `agent/collector/platform/darwin.go` | :128 | external binary stdout; DataType="macos" |
| Filebeat | `agent/collector/platform/filebeat_amd64.go` | :20-48 | reads log files from beats/filebeat/logs/; falls through to "generic" |

**LogQueue:** `agent/agent/logprocessor.go:32` — `make(chan *plugins.Log, 10000)`

### Hop 2: LogQueue → SQLite → gRPC :50051

- SQLite write (before send): `agent/agent/logprocessor.go:144` — `processed=false`
- gRPC send: `logprocessor.go:150` — `plClient.Send(newLog)`
- ACK receive (separate goroutine): `logprocessor.go:103-127` — sets `processed=true` for `ack.LastId`
- Send failure handler: `logprocessor.go` via `HandleGRPCStreamError` — EOF/Unavailable/Canceled → reconnect; other → sleep 10s, continue
- Requeue on reconnect: `logprocessor.go:164-205` — `CleanCountedLogs` re-queues unprocessed rows every 10 minutes
- TLS client: `agent/agent/conn.go:40,77` — `InsecureSkipVerify` = config value (install-time flag)
- Auth metadata: `serv/service.go:115-117` — headers `key`, `id`, `type`

### Hop 3: inputs plugin receives and forwards

- gRPC server: `plugins/inputs/handlers.go:161-241` — TLS :50051, `Integration/ProcessLog`
- Auth: `auth.go:63-139` — validates key+id+type from cache; cache synced from agent-manager every 20s (`auth.go:52-61`)
- Channel push: `handlers.go:273` — pushes to `localLogsChannel`, then **immediately** sends `Ack{LastId}`
- HTTP entry: `handlers.go:80-125` — HTTPS :8080, `POST /v1/logs`, connection-key header
- Buffer: `plugins/inputs/main.go:64` — `make(chan *plugins.Log, cpu*100)`
- Unix socket forward: `plugins/inputs/output.go` — `cpu` goroutines; `unix:///workDir/sockets/engine_server.sock`; on error, signals restart and exits, **in-flight log dropped**

### Hop 4: event-processor receives

- Socket server: `event-processor/grpc/engine_socket.go:19-33`
- Handler: `engine_socket.go:39-48` — calls `go processLog(log)` then sends Ack; **Ack before processing completes**

### Hop 5: Filter Pipeline

- Executor: `event-processor/pipeline/executor.go:13-94`
- Filter files: YAML in `<workDir>/pipeline/filters/`, hot-reloaded every 30s
- Operators: `json`, `grok`, `rename`, `add`, `cast`, `trim`, `drop`, `delete`, `kv`, `dynamic`
- CEL guards: `pipeline/cel_where.go:EvalWhere()` — returns `false` on error (silent skip)
- Drop returns: `nil` from `pipeline.Execute()` — silently discards event, no counter
- Linux filter: `filters/linux/linux.yml` — 4-phase extraction; journald field rename → schema fields `origin.host`, `origin.user`, `origin.process`, `action`, `actionResult`, `severity`
- Full filter coverage: 36 data types across 25 directories

### Hop 6: Enrichment

- Asset/identity: `enterprise/lookup/service.go:154-178` — OpenSearch cache, 5-min refresh, cap 10,000 each
- Geo + threat intel: `enrichment/geo.go:253-271` — MaxMind CSV + in-memory cache, 15-min refresh, cap 10,000

### Hop 7: OpenSearch Write (events)

- Writer: `event-processor/writer/events.go:32-39` — `sdkos.BulkQueue`
- Index: `v11-log-<dataType>-YYYY.MM.DD`
- Flush: every 5s or 500 events
- Nil guard: `events.go:33-35` — if `eventQueue == nil`, events silently discarded
- Failure: `AddWithID` retries 3x; no dead-letter queue

### Hop 8: Rule Evaluation

- Engine: `event-processor/rules/engine.go:50-83`
- Rule loader: `rules/loader.go` — recursive walk `<workDir>/rules/`, 30s hot-reload
- CEL eval: silent skip on error (`engine.go:67`)
- Correlation: OpenSearch `bool/must` query on `correlation.indexPattern` with `within` duration filter
- Alert build: `buildAlert()` → severity from impactScore (>=8 high, >=5 medium, else low)
- Debug printf left in code: `engine.go:65` (`[CEL DEBUG]`) and `engine.go:193` (`[CORR DEBUG]`) — fires on every evaluation in production

### Hop 9: OpenSearch Write (alerts)

- Writer: `event-processor/writer/alerts.go`
- Index: `v11-alert-YYYY.MM.DD`
- Dedup: 7-day lookback on `v11-alert-*` by `deduplicateBy` fields + name → silently drops if match
- Grouping: 24-hour lookback for parent alert by name + `groupBy` fields
- HTTP PUT: direct per-alert (`alerts.go:62-72`) — errors silently ignored, no retry, no dead-letter
- Incident flag: `isIncident=true` if `impactScore >= 9`
- Status: always writes `status=1` ("Automatic review"), `statusLabel="Automatic review"`

### Hop 10: Backend Query (Java)

- Index patterns: from Postgres `utm_index_pattern` table, loaded on `ApplicationReadyEvent`
  - LOGS → `v11-log-*` (after migration `20241227001`)
  - ALERTS → `v11-alert-*` (after migration `20241227001`)
- Key service: `backend/src/main/java/com/nilachakra/service/elasticsearch/ElasticsearchService.java`
- Query builder: `SearchUtil.toQuery()` — BoolQuery from FilterType objects
- Alert fields used: `id.keyword`, `parentId.keyword`, `status`, `tags`, `isIncident`, `name.keyword`, `severityLabel.keyword`, `category.keyword`, `dataSource.keyword`, `@timestamp`

### Hop 11: API to Frontend

| Endpoint | Index | Returns |
|---|---|---|
| `POST /api/elasticsearch/search` | any (indexPattern param) | paged `List<Map>` |
| `POST /api/elasticsearch/search/sql` | any | paged `List<Map>` |
| `GET /api/utm-alerts/count-open-alerts` | `v11-alert-*` | `Long` count |
| `GET /api/offenses` | `v11-offense-*` | paged `List<Map>` |
| `GET /api/overview/*` | `v11-alert-*`, `v11-log-*` | aggregation types |

### Hop 12: Frontend Consumption (Angular)

- Alert list: `frontend/src/app/data-management/alert-management/` — no auto-poll; count-based banner triggers reload
- Count poll: `alert-open-status.service.ts:30` — every 3s to `api/utm-alerts/count-open-alerts`
- Duplicate poll: `utm-notification-alert.component.ts:37` — every 30s (same endpoint, redundant)
- Dashboard: `dashboard-render.component.ts:148-150` — `onRefreshTime()` has empty callback body; no auto-refresh

---

## 3. WHERE Logs Can Be LOST

| # | Location | Mechanism | Severity | File:Line |
|---|---|---|---|---|
| L1 | Agent file collector | Explicit `default:` drop when `LogQueue` full | HIGH | `agent/collector/file/file.go:265-272` |
| L2 | Agent auditd | Drops and logs sequence number when `LogQueue` full | HIGH | `agent/collector/platform/stream.go:56-63` |
| L3 | Agent Windows EventLog | Silent drop when `incomingEvents [1024]` full | HIGH | `agent/collector/platform/windows_amd64.go:345-348` |
| L4 | inputs plugin Unix socket | Log in-flight when socket error occurs is dropped and not re-queued | HIGH | `plugins/inputs/output.go:68-73` |
| L5 | event-processor filter | `drop` step returns `nil` with no counter or log entry | MEDIUM | `event-processor/pipeline/executor.go:71-73` |
| L6 | event-processor event writer | If `eventQueue == nil` at startup (OpenSearch not ready), all events discarded | CRITICAL | `event-processor/writer/events.go:33-35` |
| L7 | event-processor event writer | Bulk queue retries 3x; on permanent OpenSearch failure, events lost | HIGH | `event-processor/writer/events.go:37-38` |
| L8 | event-processor | `go processLog(log)` — Ack sent before processing; crash mid-pipeline = log lost | HIGH | `event-processor/grpc/engine_socket.go:46-47` |
| L9 | inputs plugin channel | `localLogsChannel [cpu*100]` exhausted under burst → gRPC stream stalls → timeout | MEDIUM | `plugins/inputs/main.go:64` |
| L10 | Agent: invalid key self-uninstall | After 100 consecutive "invalid agent key" errors, agent uninstalls itself | HIGH | `agent/agent/logprocessor.go:225-228` |

---

## 4. WHERE Alerts Can Be MISSED

| # | Location | Mechanism | Severity | File:Line |
|---|---|---|---|---|
| A1 | Rule CEL eval failure | CEL error on malformed `where` expression → rule silently skipped, no alert | HIGH | `event-processor/rules/engine.go:67` |
| A2 | Filter CEL eval failure | CEL error on `where` guard → filter step silently skipped, event may reach rule with wrong fields | MEDIUM | `event-processor/pipeline/cel_where.go:36` |
| A3 | `must_not_term` operator not implemented | Rules using `must_not_term` in correlation blocks silently omit that filter → false positives and missed suppression | HIGH | `event-processor/rules/engine.go:157` |
| A4 | Alert write error ignored | HTTP PUT failure to write alert → alert permanently lost, no retry, no dead-letter | HIGH | `event-processor/writer/alerts.go:62-72` |
| A5 | Dedup window too broad | 7-day dedup window: legitimate repeated attacks within 7 days generate zero new alerts | MEDIUM | `event-processor/writer/alerts.go:116-185` |
| A6 | `user_added_to_admin_group` logic error | `contains("usermod -aG sudo")` makes `adduser`/`useradd` paths impossible to match | MEDIUM | `rules/linux/user_added_to_admin_group.yml:17` |
| A7 | Missing rule coverage | No rules at all for `utmstack` dataType; cloud rules for `aws`/`azure`/`google` are in `rules/cloud/` not separate directories — coverage is present but fragmented | LOW | `rules/` |
| A8 | CEF syslog no field extraction | `rules/syslog/cef/` rules exist but `syslog-generic.yml` filter captures only `log.message` as raw — CEF fields are never parsed | HIGH | `filters/syslog/` |
| A9 | `enterprise/offense` index never written by any code in repo | All offense endpoints return empty results if the external offense-writing service is absent | CRITICAL | `backend/.../OffenseResource.java:34` |
| A10 | `riskScore` and `sequence` rules skipped in community engine | Enterprise-only rules silently produce no alerts in community builds | MEDIUM | `event-processor/rules/engine.go:52-56` |

---

## 5. WHERE Data Is STALE

| # | Location | Staleness Window | Impact | File:Line |
|---|---|---|---|---|
| S1 | Asset/identity enrichment cache | 5-minute refresh from OpenSearch | Asset ownership changes not reflected for up to 5 min | `enterprise/lookup/service.go:154-178` |
| S2 | Geo + threat intel cache | 15-minute refresh | New threat IPs not flagged for up to 15 min | `enrichment/geo.go:253-271` |
| S3 | inputs auth key cache | 20-second sync from agent-manager | Revoked agent keys may be valid for up to 20s | `plugins/inputs/auth.go:52-61` |
| S4 | Filter hot-reload | 30-second re-scan | Updated filters don't apply to events in the pipeline for 30s | `event-processor/pipeline/loader.go:38` |
| S5 | Rule hot-reload | 30-second re-scan | Updated rules don't apply for 30s | `event-processor/rules/loader.go:38` |
| S6 | Backend index pattern cache | Loaded once at startup from Postgres | Index pattern changes require backend restart to take effect | `UtmIndexPatternServiceImpl.java:57-59` |
| S7 | Frontend alert count | 3-second poll | Alert count badge lags by up to 3s | `alert-open-status.service.ts:30` |
| S8 | Frontend alert list | No auto-poll — user interaction or count-increase banner only | Alert list can be indefinitely stale if count stays flat | `alert-view.component.ts` |
| S9 | Dashboard charts | AUTO-REFRESH BROKEN — empty callback | Dashboard charts never update automatically | `dashboard-render.component.ts:148-150` |
| S10 | Event writer bulk flush | 5-second max or 500-event threshold | Events visible in OpenSearch at most 5s after processing | `event-processor/writer/events.go` |

---

## 6. WHERE the Chain Is BROKEN

| # | Location | Condition | Symptom | File |
|---|---|---|---|---|
| B1 | inputs → event-processor Unix socket | TLS-free, unauthenticated — any process with socket access can inject events | Security break, not availability | `plugins/inputs/output.go` |
| B2 | `POST :8090/v1/inject` HTTP endpoint | No authentication middleware applied | Unauthenticated event injection bypasses entire collector chain | `event-processor/http/ingest.go`, `http/server.go:47-54` |
| B3 | Backend index patterns from Postgres | If migration `20241227001` not applied or rolled back | Queries `log-*` / `alert-*` instead of `v11-log-*` / `v11-alert-*` → zero results, no error | `20241227001_updating-system-index-pattern.xml` |
| B4 | `v11-offense-*` index | No code in this repo writes it | All offense endpoints return empty results silently | `OffenseResource.java:34`, `writer/` |
| B5 | `v11-log-compliance-evaluation` index | No observable writer in this repo | Compliance evaluation endpoints return empty silently | `ElasticsearchService.java:528,554` |
| B6 | InsecureSkipVerify on all OS TLS clients | Default in code (not just dev config) | All event-processor → OpenSearch connections vulnerable to MITM | 6 files: `rules/engine.go:37`, `writer/alerts.go:35`, etc. |
| B7 | Agent TLS validation disabled | `insecure: true` in config.yml | All agent → inputs-plugin gRPC connections vulnerable to MITM | `agent/agent/conn.go:77` |
| B8 | `eventQueue` nil at startup | OpenSearch not ready when `InitEventWriter()` runs | All events silently discarded until restart | `event-processor/writer/events.go:33-35` |
| B9 | OffenseResource.getOffenseAlerts() | Uses `"id"` field instead of `"id.keyword"` for IS_ONE_OF filter | Offense → alert link may return no results | `OffenseResource.java:175` |
| B10 | `statusLabel` type mismatch | Go writes string `"Automatic review"`, Java expects `AlertStatus` enum | `statusLabel` may deserialize as `null` in API responses | `plugins/alerts/main.go`, `UtmAlert.java` |

---

## 7. Proto / Message Contracts Between Services

### Contract 1: Agent ↔ plugins/inputs

**Proto:** `agent/protos/` (compiled from `plugins.proto`)

Message: `plugins.Log`
```protobuf
message Log {
  string id = 1;          // UUID
  string dataType = 2;    // collector type key
  string dataSource = 3;  // hostname or source IP
  string raw = 4;         // raw log string
  string timestamp = 5;   // RFC3339Nano
}
```
Stream: `Integration.ProcessLog(stream Log) returns (stream Ack)`
ACK: `message Ack { string lastId = 1; }`

**Risk:** The Ack is sent at `handlers.go:273` once the log enters `localLogsChannel`. The agent marks the SQLite row as processed. If the event-processor crashes between Unix socket receive and OpenSearch write, the log is gone — the agent's durability guarantee has already been discharged.

### Contract 2: plugins/inputs ↔ event-processor Unix socket

**Proto:** same `plugins.Log` / `Engine.Input` RPC
**Transport:** Unix domain socket, no TLS, no auth
**Risk:** Any co-located process can connect to this socket and inject arbitrary `plugins.Log` messages with any `dataType`, `dataSource`, or `raw` content.

### Contract 3: Agent ↔ agent-manager

**Proto:** `agent.proto` — `AgentService`
- `RegisterAgent(AgentRequest) → AuthResponse`
- `AgentStream(stream BidirectionalStream) ↔ (stream BidirectionalStream)` — bidirectional command channel
- `UtmCommand`: `agent_id`, `command`, `executed_by`, `cmd_id`, `origin_type`, `origin_id`, `reason`, `shell`
- `CommandResult`: `agent_id`, `result`, `executed_at`, `cmd_id`

**Risk:** This channel carries remote command execution. The `shell` field accepts `cmd`, `powershell`, `sh`, `bash`. Auth relies on the `key` header which is AES-decrypted from config.yml at agent startup.

### Contract 4: event-processor → OpenSearch

No formal contract — direct HTTP REST. Index name is constructed by string interpolation:
```go
"v11-log-" + dataType + "-" + time.Now().Format("2006.01.02")
```
**Risk:** If `dataType` contains special characters (e.g., `/`, `*`, `?`), the index name would be invalid. No sanitization observed. Also, no index template management is visible in this repo — mappings may drift as new data types are introduced.

### Contract 5: event-processor → backend (implicit, via OpenSearch)

No direct service-to-service connection. The backend reads what the event-processor writes. The implicit contract is:
- Logs: `v11-log-<dataType>-YYYY.MM.DD` with fields `@timestamp`, `dataType`, `dataSource`, `id`, and all filter-extracted fields
- Alerts: `v11-alert-YYYY.MM.DD` with the `AlertFields` struct (see Hop 9)

**Risk:** The backend's `ElasticsearchService` references field names like `id.keyword`, `parentId.keyword`, `name.keyword` as keyword sub-fields. If the OpenSearch index mappings don't define these `.keyword` sub-fields (not enforced by any index template in this repo), these queries return zero results silently.

### Contract 6: Backend → Frontend

REST/JSON. No OpenAPI spec or generated client observed. Frontend `ElasticDataService` sends typed `ElasticSearchQuery` objects; backend returns generic `List<Map>`. Field name alignment is implicit — no schema validation.

---

## 8. Critical Findings Summary

### CRITICAL
1. **`eventQueue == nil` on startup** (`writer/events.go:33-35`): If OpenSearch is not ready when the event-processor initializes, all events are silently discarded until restart. No startup health check prevents premature processing.
2. **`v11-offense-*` never written in this repo** (`OffenseResource.java:34`): All offense/incident escalation endpoints show empty data if the external offense service is absent.
3. **Unauthenticated inject endpoint** (`event-processor/http/ingest.go` + `http/server.go:47-54`): `POST :8090/v1/inject` has no auth middleware. Any reachable process can generate synthetic SIEM events and trigger alerts.

### HIGH
4. **Ack-before-processing on Unix socket** (`engine_socket.go:46-47`): The event-processor sends Ack immediately before `go processLog()` completes. Events that fail mid-pipeline are permanently lost with no way to replay.
5. **Alert write errors silently ignored** (`writer/alerts.go:62-72`): OpenSearch HTTP PUT failures for alerts produce no retry, no dead-letter queue, no counter.
6. **`must_not_term` unimplemented** (`rules/engine.go:157`): Correlation rules using this operator silently omit the filter, producing false positives.
7. **All OpenSearch TLS connections have `InsecureSkipVerify: true`** (6 files): MITM attack on the OpenSearch channel would expose all SIEM data and allow injecting false results.
8. **Dashboard auto-refresh broken** (`dashboard-render.component.ts:148-150`): Dashboards never auto-update. Users must manually refresh to see current state.
9. **CEF syslog events have no field extraction** (missing filter): CEF-format syslog events arrive as raw strings only; rules against CEF fields never match.
10. **Debug printf in production rules engine** (`engine.go:65`, `engine.go:193`): Every rule evaluation logs event JSON and correlation query details to stdout.

### MEDIUM
11. Dedup 7-day window suppresses legitimate repeated attacks
12. Alert list has no auto-poll; only count-increase banner triggers reload
13. Backend index patterns loaded once at startup — requires restart on change
14. `user_added_to_admin_group.yml` logic error excludes `adduser`/`useradd` paths
15. Agent self-uninstall on 100 consecutive invalid-key responses (DoS vector)

---

*End of Task 3 — Data Flow Audit*
