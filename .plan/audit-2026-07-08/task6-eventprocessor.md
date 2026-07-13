# Task 6 — Event Processor & Plugin Layer Audit

**Date:** 2026-07-08  
**Scope:** event-processor, plugins/, filters/, rules/

---

## 1. Data Flow Contract

### 1.1 gRPC Transport: Agent-Manager to Event-Processor

The agent-manager exposes three gRPC services (defined in `agent-manager/protos/`):

| Service | Key Stream | Direction |
|---|---|---|
| `AgentService.AgentStream` | `BidirectionalStream` (UtmCommand / CommandResult) | panel ↔ agent |
| `CollectorService.CollectorStream` | `CollectorMessages` (CollectorConfig / ConfigKnowledge) | manager ↔ collector |
| `PingService.Ping` | `PingRequest` → `PingResponse` | heartbeat |

**Log delivery path** does NOT use agent-manager gRPC directly. Logs travel via:

1. Agent/collector writes raw log to the `inputs` plugin HTTP endpoint (or syslog/netflow listener on the inputs plugin).
2. The `inputs` plugin converts each log to a `plugins.Log` protobuf (from `github.com/threatwinds/go-sdk`) and streams it to the event-processor over a **Unix domain socket** at `$WORK_DIR/sockets/engine_server.sock` using the `Engine_InputServer` streaming RPC (defined in the ThreatWinds go-sdk, not in this repo's own protos).
3. The event-processor `engineServer.Input()` handler receives `*plugins.Log` messages.

**Key proto types from go-sdk (inferred from usage):**

| Type | Purpose |
|---|---|
| `plugins.Log` | Raw inbound log from inputs plugin; carries `Id`, `DataType`, `DataSource`, `Raw`, `TenantId`, `TenantName` |
| `plugins.Event` | Normalized event after pipeline filter execution |
| `plugins.Alert` | Fired alert from rule engine |
| `plugins.Side` | Origin or target endpoint fields (ip, host, user, domain, process, command, geolocation) |
| `plugins.Impact` | CIA triad scores (Confidentiality, Integrity, Availability uint32) |
| `plugins.Ack` | Streaming ACK after each log is accepted |
| `plugins.Transform` / `plugins.Draft` | Used by parsing plugins (e.g., geolocation dynamic op) |

---

### 1.2 OpenSearch Index Patterns

| Index Pattern | Written By | Contents |
|---|---|---|
| `v11-log-{dataType}-{YYYY.MM.DD}` | `writer.WriteEvent` via `sdkos.BuildCurrentDayIndex("v11", "log", event.DataType)` | Normalized event documents |
| `v11-alert-{YYYY.MM.DD}` | `writer.WriteAlert` and `alerts` plugin via `sdkos.BuildCurrentDayIndex("v11", "alert")` | Alert documents |
| `v11-alert-*` | Searched for dedup / parent-child grouping | Alert query pattern |
| `v11-log-linux-*` (example) | Searched by rule correlation queries | Per-datatype log query pattern |

The index naming convention is `v11-{type}-{dataType?}-{YYYY.MM.DD}`. DataType is interpolated from the event field. Examples: `v11-log-linux-2026.07.08`, `v11-log-wineventlog-2026.07.08`, `v11-alert-2026.07.08`.

---

### 1.3 Guaranteed Fields on Every Normalized Event

These fields are set unconditionally in `eventToDoc()` (writer/events.go) and `eventToMap()` (rules/engine.go):

| Field | Type | Notes |
|---|---|---|
| `@timestamp` | string (RFC3339Nano) | Set at ingest time |
| `id` | string (UUID) | Unique event identifier |
| `dataType` | string | Source type (e.g., `linux`, `wineventlog`, `suricata`) |
| `dataSource` | string | Source identifier (agent hostname or collector ID) |
| `tenantId` | string | Multi-tenant isolation key |
| `tenantName` | string | Human-readable tenant name |
| `raw` | string | Original raw log message |
| `action` | string | Normalized action (e.g., syscall name, event category) |
| `actionResult` | string | Outcome of the action (success/failure) |
| `severity` | string | Log-level severity label mapped from source priority |
| `protocol` | string | Network protocol if applicable |

---

### 1.4 Optional / Source-Specific Fields

| Field Group | Description |
|---|---|
| `log.*` | Source-specific key-value pairs from filter parsing (e.g., `log.message`, `log.pid`, `log.eventID`). Fields with `log.` prefix are nested under a `log` object in OpenSearch. |
| `origin` | Populated when a source IP/user is identified. Contains: `ip`, `host`, `user`, `domain`, `process`, `command`, and optionally `geolocation` (country, city, countryCode, asn, aso, coordinates). |
| `target` | Same structure as `origin`; populated when a destination is identified. |
| `origin.ip` / `target.ip` | Also stored as flat top-level dot-notation keys for OpenSearch term queries. |
| `statusCode` | Integer; populated by some filters (e.g., auditd exit code). |
| `asset.*` / `identity.*` | Populated by `lookup.Enrich()` enterprise feature. |

---

### 1.5 Alert Document Structure (written to OpenSearch)

Full structure from `alertToDoc()` + `AlertFields` in `plugins/alerts/main.go`:

```
{
  "@timestamp":    RFC3339Nano string,
  "lastUpdate":    RFC3339Nano string,
  "id":            UUID string,
  "name":          string,            // rule name
  "dataType":      string,
  "dataSource":    string,
  "tenantId":      string,
  "tenantName":    string,
  "category":      string,            // MITRE tactic (e.g., "Credential Access")
  "technique":     string,            // MITRE technique ID (e.g., "T1110")
  "description":   string,
  "references":    []string,
  "severity":      string ("1"/"2"/"3" — low/medium/high),
  "impactScore":   uint32,            // sum of C+I+A; >= 9 → isIncident = true
  "isIncident":    bool,
  "status":        int (1 = "Automatic review"),
  "statusLabel":   string,
  "deduplicateBy": []string,          // fields used for dedup
  "groupBy":       []string,          // fields used for parent-child grouping
  "parentId":      string,            // set if this is a child alert
  "impact": {
    "confidentiality": uint32,
    "integrity":       uint32,
    "availability":    uint32
  },
  "adversary": { ... Side doc ... },  // who triggered the alert
  "target":    { ... Side doc ... },  // who was targeted
  "eventIds":  []string,              // UUIDs of the triggering events
  "lastEvent": *Event,                // embedded last event (alerts plugin only)
  "severityLabel": string,            // "Low" / "Medium" / "High"
  "solution":      string,
  "tags":          []string,
  "notes":         string,
  "tagRulesApplied": []int,
  "deduplicatedBy": []string,
  "groupedBy":      []string
}
```

**Side document structure:**
```
{
  "ip":      string,
  "host":    string,
  "user":    string,
  "domain":  string,
  "process": string,
  "command": string,
  "geolocation": {
    "country": string, "city": string, "countryCode": string,
    "asn": string, "aso": string,
    "coordinates": { "lat": float, "lon": float }
  }
}
```

---

### 1.6 Filter Format

**Custom YAML pipeline format** — NOT Logstash, NOT Sigma, NOT raw Grok.

File structure:
```yaml
pipeline:
  - dataTypes:
      - linux         # matches this event's dataType field
    steps:
      - json:
          source: raw
          where: 'startsWith("raw", "{")'   # CEL expression
      - grok:
          patterns:
            - field_name: log.message
              pattern: '{{.greedy}}'
          source: raw
      - rename:
          from: [log.HOSTNAME]
          to: origin.host
          where: 'exists("log.HOSTNAME")'
      - add:
          function: string
          params:
            key: severity
            value: "error"
          where: 'equals("log.priority", "3")'
      - cast:
          fields: [statusCode]
          to: int
      - delete:
          fields: [log.rawField]
      - kv:
          fieldSplit: " "
          valueSplit: "="
      - dynamic:
          plugin: com.utmstack.geolocation
          params:
            source: origin.ip
            destination: origin.geolocation
```

Available operators: `json`, `grok`, `rename`, `add`, `cast`, `trim`, `drop`, `delete`, `kv`, `dynamic`.

Each step has an optional `where` field containing a **CEL (Common Expression Language)** expression for conditional execution.

Grok uses named patterns from the go-sdk library (e.g., `{{.greedy}}`), not Logstash-style `%{PATTERN:field}`.

**Hot-reload:** Filter YAML files are watched via a polling goroutine with a **30-second tick** (see `pipeline/loader.go:watchLoop`). No restart required.

---

### 1.7 Rule Format

**Custom YAML, NOT Sigma.** Per-file structure (single rule or list):

```yaml
id: 1001
name: "Linux: Possible SSH Brute Force Attack"
dataTypes:
  - linux
category: "Credential Access"
technique: "T1110"
adversary: "origin"     # which side becomes adversary: "origin" or "target"
description: "..."
where: |
  contains("log.message", "Failed password") && safe("origin.ip", "") != ""
correlation:
  - indexPattern: "v11-log-linux-*"
    with:
      - field: "origin.ip"
        operator: filter_match
        value: "{{.origin.ip}}"    # template resolved from triggering event
    within: "5m"
    count: 5
    or:                            # optional fallback branches
      - ...
deduplicateBy:
  - "adversary.ip"
groupBy:
  - "adversary.ip"
impact:
  confidentiality: 2
  integrity: 1
  availability: 1
# Enterprise extensions:
riskScore: 40           # if set, feeds risk scorer instead of direct alert
sequence:               # multi-step sequence detection
  - where: "..."
    within: "5m"
anomalyDetect: true     # baseline anomaly flag
```

**How rules fire:**
1. Every inbound event is matched against rules for its `dataType`.
2. The `where` CEL expression is evaluated against the event map. If true:
3. If `correlation` is present, an OpenSearch query is executed against `indexPattern` to count events matching `with` conditions within `within` duration. If count >= `count` threshold, the rule fires.
4. A `plugins.Alert` is built from the rule and event; severity is derived from `impactScore` (1-4=low, 5-7=medium, 8+=high); `isIncident` is true when impactScore >= 9.
5. Rules with `riskScore > 0` or `sequence` steps are dispatched to enterprise packages (`risk.scorer`, `sequence.engine`) instead of direct alert creation.
6. **Hot-reload:** Rules use the same 30-second polling watcher as filters.

---

## 2. Plugin Inventory

### 2.1 Plugin Process Model

All companion plugins run as **separate OS processes** within the same Docker container, launched by `entrypoint.sh`. The entrypoint starts all processes in background (`&`) and uses `wait -n` — if **any single plugin exits**, the entire container shuts down. There is no individual restart/supervision per plugin.

| Plugin | Binary | Process Type | In Eventprocessor Dockerfile? | Backend Health Check? | UI Status Page? | Crash Behavior |
|---|---|---|---|---|---|---|
| engine (event-processor) | `/usr/local/bin/engine` | Core engine (always started) | Yes | `GET /health` and `GET /api/healthcheck` on :8000 | No dedicated UI | Container dies, Docker restarts container |
| config | `/usr/local/bin/config-plugin` | Companion (skipped in `manager` mode) | Yes | No separate endpoint | No | Container dies |
| events | `/usr/local/bin/events-plugin` | Analysis plugin (SDK `InitAnalysisPlugin`) | Yes | No | No | Container dies |
| alerts | `/usr/local/bin/alerts-plugin` | Correlation plugin (SDK `InitCorrelationPlugin`) | Yes | No | No | Container dies |
| geolocation | `/usr/local/bin/geolocation-plugin` | Parsing/dynamic-op plugin (SDK `InitParsingPlugin`) | Yes | No | No | Container dies |
| feeds | `plugins/feeds/` | Manager-mode only; ThreatWinds threat intel ingestion | No (NOT in Dockerfile) | No | No | N/A — external process |
| compliance-orchestrator | `plugins/compliance-orchestrator/` | Standalone Go binary; polls backend + OS | No (NOT in Dockerfile) | No | Partial (compliance page uses DEMO data) | N/A — external process |
| inputs | `plugins/inputs/` | HTTP ingest gateway for agents/collectors | No (NOT in Dockerfile) | `GET /health` within inputs service | No | N/A — separate service |
| soc-ai | `plugins/soc-ai/` | AI alert enrichment | No | No | No | N/A — separate service |
| stats | `plugins/stats/` | Metrics/statistics collector | No | No | No | N/A — separate service |
| modules-config | `plugins/modules-config/` | Pushes module config to engine | No | No | No | N/A — separate service |
| aws | `plugins/aws/` | AWS CloudTrail/etc. ingest | No | No | No | N/A — separate service |
| azure | `plugins/azure/` | Azure log ingest | No | No | No | N/A — separate service |
| gcp | `plugins/gcp/` | GCP log ingest | No | No | No | N/A — separate service |
| o365 | `plugins/o365/` | Microsoft 365 log ingest | No | No | No | N/A — separate service |
| bitdefender | `plugins/bitdefender/` | Bitdefender AV log ingest | No | No | No | N/A — separate service |
| crowdstrike | `plugins/crowdstrike/` | CrowdStrike log ingest | No | No | No | N/A — separate service |
| sophos | `plugins/sophos/` | Sophos log ingest | No | No | No | N/A — separate service |

**Notes on crash behavior for in-container plugins:**
The `entrypoint.sh` `wait -n` pattern means a crash of `events-plugin`, `alerts-plugin`, `geolocation-plugin`, or `config-plugin` terminates the container. The `restart: unless-stopped` Docker policy then restarts the container. This causes a brief (~15-60s) gap in log processing and alert generation during recovery.

---

## 3. Compliance Orchestrator Analysis

### 3.1 What It Does

The compliance orchestrator is a standalone Go plugin that automates compliance control evaluation. Architecture:

1. **Bootstrap** (`bootstrap.go`): Connects to Spring Boot backend and OpenSearch.
2. **Scheduler** (`scheduler/scheduler.go`): Every 24 hours, fetches `ControlConfig` records from `GET /api/compliance/control-config` and puts them on a Jobs channel.
3. **Workers** (`workers/worker.go`): Consume Jobs channel, run evaluations in parallel.
4. **Evaluator** (`evaluator/evaluator.go`): For each control config, runs SQL queries against OpenSearch (via OpenSearch SQL API), applies evaluation rules, computes compliance status.
5. **Results**: Indexed back into OpenSearch via `BackendClient.IndexEvaluationResult`.

**Evaluation rules:**
- `NO_HITS_ALLOWED` — pass if hit count == 0
- `MIN_HITS_REQUIRED` — pass if hit count >= ruleValue
- `THRESHOLD_MAX` — pass if hit count <= ruleValue

**Control strategies:** `ALL` (all sub-queries must pass) or `ANY` (at least one must pass).

**Compliance frameworks in backend (from F-06 plan):** HIPAA, PCI, ISO27001, NIST, SOC2, plus Custom.

### 3.2 Is It in the Eventprocessor Dockerfile?

**No.** The `event-processor/Dockerfile` only includes: `config-plugin`, `events-plugin`, `alerts-plugin`, `geolocation-plugin`. The compliance-orchestrator is not built or deployed in the eventprocessor container.

```bash
# Confirmed absent from Dockerfile:
grep "compliance-orchestrator" event-processor/Dockerfile
# (no output)
```

The docker-compose.yml does **not** define a `compliance-orchestrator` service. There is no deployment mechanism for it in the current compose stack.

### 3.3 What Would Happen If Enabled

If the compliance-orchestrator were deployed as a standalone service:
- It would query `GET /api/compliance/control-config` to fetch controls
- Execute OpenSearch SQL queries once per 24 hours per control
- Write evaluation results to OpenSearch
- The frontend compliance posture tab would reflect real data instead of `DEMO_FRAMEWORKS` static data

Currently the posture tab in `/compliance/page.tsx` uses `DEMO_FRAMEWORKS` hardcoded data. The backend APIs exist and are verified (per F-06 plan).

### 3.4 Plan Status

Per `.plan/features/F-06-compliance-full.md`:
- **Priority:** Tier 2, 5 days effort
- **Backend:** COMPLETE (all Java resources exist)
- **Plugin:** Code exists but not deployed
- **Frontend:** Partial — posture tab uses demo data; reports and schedule tabs partially wired

**Known bug:** `report.service.ts` calls `GET /api/utm-compliance-report-schedules` which does not exist; correct endpoint is `GET /api/compliance-report-schedules-by-user`.

---

## 4. Filter Pack Inventory and Deployment

### 4.1 Filter Packs (36 total YAML files across 25 source categories)

| Category | Files | Source Types Covered |
|---|---|---|
| antivirus | 5 | Bitdefender GZ, Deceptive Bytes, ESET ESMC, Kaspersky, SentinelOne |
| aws | 1 | AWS CloudTrail / services |
| azure | 1 | Azure Event Hub |
| cisco | 4 | ASA, CS Switch, Firepower, Meraki |
| crowdstrike | 1 | CrowdStrike Falcon |
| fortinet | 2 | FortiGate, FortiWeb |
| generic | 1 | Generic syslog fallback |
| github | 1 | GitHub audit logs |
| google | 1 | GCP (Google Cloud Platform) |
| ibm | 2 | IBM AIX, IBM AS/400 |
| json | 1 | Generic JSON input |
| linux | 1 | Linux (systemd/journald + auditd) |
| macos | 2 | macOS syslog, macOS system |
| mikrotik | 1 | MikroTik firewall |
| netflow | 1 | NetFlow v5/v9/IPFIX |
| office365 | 1 | Microsoft 365 |
| paloalto | 1 | Palo Alto Networks firewall |
| pfsense | 1 | pfSense firewall |
| sonicwall | 1 | SonicWall firewall |
| sophos | 2 | Sophos Central, Sophos XG Firewall |
| suricata | 1 | Suricata NIDS |
| syslog | 1 | Generic syslog |
| utmstack | 1 | UTMStack internal events |
| vmware | 1 | VMware ESXi |
| windows | 1 | Windows Event Log |

**Total: 36 filter files, 25 source categories.**

### 4.2 Rules Inventory

**634 rule files** organized into subdirectories mirroring the filter structure. Categories include: antivirus/bitdefender_gz, cisco, cloud, crowdstrike, generic, github, ibm, json, linux, macos, mikrotik, nids, netflow, office365, paloalto, pfsense, sonicwall, syslog, and more.

### 4.3 Deployment Mechanism

Filters are mounted into the container as a read-only volume bind:
```yaml
# docker-compose.override.yml
volumes:
  - ../filters:/workdir/pipeline/filters:ro
```

Rules are in a named volume `ep_rules` mounted at `/workdir/rules`.

### 4.4 Hot-Reload Mechanism

Both filters and rules use a **30-second polling watcher** (goroutine with `time.NewTicker(30 * time.Second)`) that calls `reload()`. No container restart is required to pick up changes to filter or rule YAML files.

The `.plan/SESSION-PROMPTS.md` confirms this: "Wait 35 seconds for hot-reload to pick up the mounted YAMLs."

### 4.5 UI for Filter Management

**None currently.** There is no UI page to view, edit, or manage filter packs. Filters are managed as YAML files in the git repository.

---

## 5. Critical Gaps and Risks

### RISK-1: Single-Container Crash Cascade (HIGH)
**Issue:** All 5 binaries (engine + 4 companion plugins) run in the same Docker container. If any companion plugin exits (crash, OOM, unhandled panic), `wait -n` triggers `cleanup()` which kills the entire container including the engine. A buggy `alerts-plugin` panic takes down log processing entirely.

**Impact:** Full log processing outage until Docker restart completes (~15-60s).

**Recommendation:** Move companion plugins to separate containers with independent healthchecks and restart policies. OR add `supervisor`/`s6-overlay` with per-process restart inside the container.

### RISK-2: No Per-Plugin Health Checks (MEDIUM)
**Issue:** The event-processor exposes `GET /health` for the engine, but there are no individual health endpoints for companion plugins (events, alerts, geolocation, config). The backend has no visibility into individual plugin health.

**Impact:** A silently wedged plugin (connected but not processing) is invisible to operators.

**Recommendation:** Expose per-plugin health metrics (processed count, last-processed timestamp, error count) on the existing `/health` endpoint or a new `/health/plugins` endpoint.

### RISK-3: Compliance Orchestrator Not Deployed (MEDIUM)
**Issue:** The compliance-orchestrator plugin exists in `plugins/compliance-orchestrator/` but is not included in any Dockerfile or docker-compose service. The frontend compliance posture tab shows static demo data.

**Impact:** Compliance reporting is non-functional in production. The backend APIs and DB schema are ready (per F-06 plan), the plugin code is ready, but there is no deployment wiring.

**Recommendation:** Add a `compliance-orchestrator` service to docker-compose.yml and wire it to the backend. This unblocks F-06 frontend work.

### RISK-4: CEL Debug Logging Left in Production (LOW)
**Issue:** `rules/engine.go` line 65 has a hardcoded debug printf for rule ID 1001:
```go
if rule.ID == 1001 {
    fmt.Printf("[CEL DEBUG] rule=%d ok=%v err=%v eventJSON=%s\n", ...)
}
```
Similarly, `executeSearchRequest` always prints `[CORR DEBUG]` output for every correlation query.

**Impact:** Performance overhead (format + syscall per event), and stdout log noise in production. These should be removed or gated behind a log level.

### RISK-5: TLS InsecureSkipVerify in Writers (LOW)
**Issue:** Both `writer/alerts.go` and `rules/engine.go` use `TLSClientConfig: &tls.Config{InsecureSkipVerify: true}` for their OpenSearch HTTP clients.

**Impact:** Susceptible to MITM in environments where OpenSearch uses a self-signed cert. Acceptable for dev but should be replaced with proper cert pinning or CA bundle in production.

### RISK-6: Geolocation Data Not Bundled (MEDIUM)
**Issue:** The geolocation enrichment (`enrichment/geo.go`) expects MaxMind-format CSV files at `$WORK_DIR/geolocation/`. These files are not in the git repository and not in the Dockerfile. If the directory is empty, `geoReady` is never set and all geo enrichment silently does nothing.

**Impact:** No IP geolocation data for any events. Threat maps, country-based filters in rules, and geo-based alert dedup all silently fail.

**Recommendation:** Document the required CSV files and add a startup check that warns (or errors) if geo data is missing.

### RISK-7: Feeds Plugin Only Runs in Manager Mode (LOW)
**Issue:** `plugins/feeds/main.go` checks `mode != "manager"` and exits immediately if not in manager mode. The feeds plugin is also not in the eventprocessor Dockerfile. ThreatWinds threat intel feeds are only available if the feeds service is deployed separately and configured.

**Impact:** Threat intel enrichment (`enrichment/feeds.go`) may have no data if feeds are not configured.

### RISK-8: No UI for Filter/Rule Management (MEDIUM)
**Issue:** There is no operator UI to view currently-loaded filters or rules, see last-reload timestamps, or validate that a filter is working for a given dataType. The `GET /api/v1/modules-config` endpoint exists but returns only module config pushed by the backend, not filter/rule status.

**Recommendation:** Add a `GET /api/v1/pipeline/status` endpoint that returns loaded dataTypes, number of rules per dataType, and last reload timestamp. Wire this to a simple admin UI panel.

---

## 6. Summary

**Architecture:** The event-processor is a custom Go SIEM engine (not Logstash-based). It uses a custom YAML pipeline format for field normalization, custom YAML rules for CEL+correlation-based alerting, and a Unix-socket gRPC interface to receive logs from the inputs plugin.

**Data contract is well-defined** through `plugins.Event`, `plugins.Alert`, and `plugins.Side` proto types from the ThreatWinds go-sdk. The OpenSearch index pattern `v11-log-{dataType}-{date}` and `v11-alert-{date}` is stable and consistently used.

**The plugin ecosystem is split:** 5 plugins run in-container (with crash cascade risk), and ~12+ plugins run as external processes not yet wired into the compose stack.

**Compliance orchestrator is the biggest deployment gap** — all backend infrastructure is ready but the plugin has no deployment mechanism.
