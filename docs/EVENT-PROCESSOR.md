# HiveArmor Event Processor — Technical Reference

> Audience: platform developers and tool administrators
> Binary: `event-processor/` · Module: `github.com/hivearmor/event-processor`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Process Lifecycle](#2-process-lifecycle)
3. [Configuration Reference](#3-configuration-reference)
4. [Log Parser / Pipeline System](#4-log-parser--pipeline-system)
   - 4.1 [How Parsing Works](#41-how-parsing-works)
   - 4.2 [Pipeline Operators Reference](#42-pipeline-operators-reference)
   - 4.3 [CEL Where-Clause Syntax](#43-cel-where-clause-syntax)
   - 4.4 [Adding a Parser for a New Log Source](#44-adding-a-parser-for-a-new-log-source)
5. [Correlation Rules System](#5-correlation-rules-system)
   - 5.1 [Rule Schema Reference](#51-rule-schema-reference)
   - 5.2 [SOP: Writing a New Correlation Rule](#52-sop-writing-a-new-correlation-rule)
   - 5.3 [SOP: Modifying an Existing Rule](#53-sop-modifying-an-existing-rule)
   - 5.4 [Rule Testing Workflow](#54-rule-testing-workflow)
6. [Enrichment](#6-enrichment)
7. [Writers (OpenSearch)](#7-writers-opensearch)
8. [Enterprise Features](#8-enterprise-features)
9. [HTTP API Reference](#9-http-api-reference)
10. [Extending the Engine](#10-extending-the-engine)
11. [Tool Administrator Runbook](#11-tool-administrator-runbook)

---

## 1. Architecture Overview

```
External Log Source
        │
        ▼
  Agent (inputs plugin)
  :50051 gRPC TLS
        │
        ▼  unix socket
  $WORK_DIR/sockets/engine_server.sock
        │
        ▼
  ┌─────────────────────────────────────────┐
  │        HiveArmor Event Processor         │
  │                                          │
  │  Log → [Pipeline Filter] → Event         │
  │           │                              │
  │           ▼                              │
  │    [Enrichment: Geo + TI]                │
  │           │                              │
  │           ▼                              │
  │  WriteEvent → _v3_hive_{type}-YYYY.MM.DD │
  │           │                              │
  │           ▼                              │
  │    [Rules Engine: CEL + Correlation]     │
  │           │                              │
  │           ▼                              │
  │  WriteAlert → _v3_hive_alert-YYYY.MM.DD  │
  │           │                              │
  │           ▼                              │
  │    [Enterprise: Risk / Offense]          │
  └─────────────────────────────────────────┘
        │
        ▼
   OpenSearch (localhost:9200)
```

**The event processor is the only component that performs log parsing.** There is no separate parser service. The pipeline filter YAML files *are* the parsers.

### What this component owns

| Responsibility | Where |
|---|---|
| Log normalization / parsing | `pipeline/` |
| CEL expression evaluation | `pipeline/cel_where.go`, `rules/engine.go` |
| Correlation / alerting | `rules/` |
| IP geolocation | `enrichment/geo.go` |
| Threat-intel enrichment | `enrichment/feeds.go` |
| OpenSearch write (events) | `writer/events.go` |
| OpenSearch write (alerts) | `writer/alerts.go` |
| Enterprise: risk scoring | `enterprise/risk/` |
| Enterprise: offense engine | `enterprise/offense/` |
| Enterprise: lookup tables | `enterprise/lookup/` |
| Enterprise: anomaly baseline | `enterprise/baseline/` |
| Enterprise: sequence detection | `enterprise/sequence/` |
| HTTP health + module config | `http/health.go`, `http/modules.go` |
| Test injection endpoint | `http/ingest.go` (`POST /v1/inject`) |

---

## 2. Process Lifecycle

```
main()
  │
  ├─ sdkos.Connect()           ← OpenSearch connection pool
  ├─ pipeline.Init(filterDir)  ← load + hot-reload filter YAML every 30s
  ├─ rules.Init(rulesDir)      ← load + hot-reload rule YAML every 30s
  ├─ enrichment.SetGeoDir()    ← lazy-load MaxMind CSV on first lookup
  ├─ enrichment.InitFeeds()    ← threat-intel lookup against _v3_hive_lookup-*
  ├─ writer.InitEventWriter()  ← BulkQueue (5s flush, 500-doc threshold)
  ├─ writer.InitAlertWriter()  ← direct PUT per alert
  ├─ lookup.Init()             ← 5-min LRU cache for asset/identity tables
  ├─ baseline.Init()           ← 15-min goroutine for anomaly stats
  ├─ offense.Init()            ← alert grouping engine
  ├─ risk.Init()               ← risk score accumulator
  │
  ├─ grpc.StartEngineSocket()  ← unix socket on $WORK_DIR/sockets/engine_server.sock
  ├─ grpc.StartModulesGRPC()   ← :9003 for module config queries
  │
  ├─ http.StartPublicServer()  ← :8000 (or $PUBLIC_PORT) — backend-facing
  └─ http.StartIngestServer()  ← :8090 (or $INGEST_PORT) — test injection
```

Hot-reload: both `pipeline.Init` and `rules.Init` start background goroutines that re-read their directories every 30 seconds. **No restart is needed when adding or editing YAML files in production.**

---

## 3. Configuration Reference

All configuration is via environment variables. No config file.

| Variable | Default | Description |
|---|---|---|
| `WORK_DIR` | `/workdir` | Root for all runtime files (filters, rules, sockets, geo data) |
| `OPENSEARCH_HOST` | `localhost` | OpenSearch hostname |
| `OPENSEARCH_PORT` | `9200` | OpenSearch port |
| `OPENSEARCH_USER` | `admin` | OpenSearch username |
| `OPENSEARCH_PASSWORD` | `LocalDev@2024!` | OpenSearch password |
| `POSTGRESQL_HOST` | `localhost` | Postgres hostname (future use) |
| `POSTGRESQL_PORT` | `5432` | Postgres port |
| `POSTGRESQL_USER` | `postgres` | Postgres user |
| `POSTGRESQL_PASSWORD` | `localdev123!` | Postgres password |
| `POSTGRESQL_DB` | `hivearmor` | Postgres database name |
| `PUBLIC_PORT` | `8000` | HTTP port for backend-facing API |
| `INGEST_PORT` | `8090` | HTTP port for test injection endpoint |
| `MODE` | `manager` | Runtime mode (manager = standalone) |
| `NODE_NAME` | `manager` | Node identifier |
| `GIN_MODE` | `debug` | Set to `release` in production |
| `INTERNAL_KEY` | *(hardcoded dev key)* | HMAC key for internal service auth |

### Runtime file layout under `$WORK_DIR`

```
$WORK_DIR/
  pipeline/
    filters/          ← filter YAML files (one per integration or vendor)
  rules/              ← correlation rule YAML files
  sockets/
    engine_server.sock ← gRPC unix socket (created at startup)
  geolocation/        ← MaxMind CSV files (GeoLite2-City, GeoLite2-ASN)
```

---

## 4. Log Parser / Pipeline System

### 4.1 How Parsing Works

When a raw log arrives (via gRPC from the agent, or via `POST /v1/inject`), the pipeline executor:

1. Creates a working map `data` containing `raw`, `dataType`, `dataSource`.
2. Loads all `PipelineBlock` entries whose `dataTypes` list includes the log's `dataType`.
3. Runs each `Step` in order. Each step has an optional `where` CEL guard — if it evaluates false the step is skipped.
4. After all steps, calls `buildEvent()` which promotes standard fields from `data["log"]`, `data["origin"]`, `data["target"]` into a typed `*plugins.Event` protobuf.

The data map during processing looks like:

```json
{
  "raw": "<original log string>",
  "dataType": "linux",
  "dataSource": "my-server",
  "log": {
    "message": "...",
    "action": "failed",
    "eventID": "4625"
  },
  "origin": { "ip": "1.2.3.4", "user": "root" },
  "target": { "ip": "10.0.0.1" },
  "action": "failed",
  "severity": "medium"
}
```

The `log.*` namespace is for arbitrary parsed fields. `origin`, `target`, `action`, `severity`, `protocol`, `connectionStatus` are standard top-level fields that map directly to the Event protobuf.

### 4.2 Pipeline Operators Reference

All operators are defined in `event-processor/pipeline/operators/`.

#### `json` — Parse JSON from a field

```yaml
- json:
    source: raw           # field containing JSON string
    where: ""             # optional CEL guard (omit to always run)
```

Parses `data[source]` as JSON and merges all fields flat into `data["log"]`. Nested objects are dot-flattened: `{"user": {"name": "alice"}}` → `log.user.name = "alice"`.

#### `grok` — Pattern-based field extraction

```yaml
- grok:
    source: raw
    patterns:
      - fieldName: log.timestamp
        pattern: "{{.monthName}} {{.monthDay}} {{.time}}"
      - fieldName: origin.host
        pattern: "{{.hostname}}"
      - fieldName: origin.user
        pattern: "for {{.word}}"
      - fieldName: origin.ip
        pattern: "from {{.ipv4}}"
```

Patterns are matched left-to-right against the remaining unmatched text. Each named field is stored in `data["log"]` unless the field name contains a dot and matches a top-level key (`origin.ip`, `target.ip`, `origin.user`, etc.), in which case `setDeep` places it in the correct nested map.

**Available tokens:**

| Token | Matches |
|---|---|
| `{{.integer}}` | Integer, optionally signed |
| `{{.float}}` | Floating-point number |
| `{{.word}}` | Non-whitespace sequence |
| `{{.data}}` | Any characters (non-greedy) |
| `{{.greedy}}` | Any characters (greedy) |
| `{{.ipv4}}` | IPv4 address |
| `{{.ipv6}}` | IPv6 address |
| `{{.hostname}}` | Hostname / FQDN |
| `{{.time}}` | `HH:MM:SS[.fraction]` |
| `{{.monthName}}` | `Jan`, `Feb`, ... `Dec` |
| `{{.monthDay}}` | 1-31 with optional leading space |
| `{{.day}}` | 1-31 |
| `{{.year}}` | 4-digit year |
| `{{.space}}` | One or more whitespace characters |

#### `rename` — Move a field

```yaml
- rename:
    from: [log.sourceIP]
    to: origin.ip
```

Moves `data["log"]["sourceIP"]` to `data["origin"]["ip"]`. Removes the source.

#### `add` — Set a literal value

```yaml
- add:
    params:
      key: log.action
      value: "failed"
    where: 'contains("log.message", "Failed password")'
```

Sets `data[key]` to `value`. The optional `where` CEL expression gates it.

#### `cast` — Type coerce fields

```yaml
- cast:
    fields: [log.bytes, log.packets]
    to: int
```

Converts the listed string fields to integers in-place. Currently supports `to: int`.

#### `trim` — Strip a substring from fields

```yaml
- trim:
    function: prefix     # prefix | suffix | substring
    substring: "sshd: "
    fields: [log.message]
```

#### `drop` — Discard the event

```yaml
- drop: {}
  where: 'contains("raw", "CRON")'
```

Returns `nil` from `Execute()` — the event is silently discarded, nothing is written to OpenSearch.

#### `delete` — Remove fields

```yaml
- delete:
    fields: [log.password, log.token]
```

Removes the listed fields from the data map.

#### `kv` — Parse key=value pairs

```yaml
- kv:
    fieldSplit: " "    # delimiter between pairs
    valueSplit: "="    # delimiter between key and value
```

Reads `data["raw"]`, splits on `fieldSplit`, then on `valueSplit`, and stores all pairs under `data["log"]`.

#### `dynamic` — Plugin dispatch

```yaml
- dynamic:
    plugin: com.hivearmor.geolocation
    params:
      source: origin.ip       # field holding the IP to look up
      destination: origin.geolocation   # where to store the result
```

Currently supports `com.hivearmor.geolocation`. Reads an IP from `source`, runs a MaxMind CSV lookup, and stores the result map at `destination`.

---

### 4.3 CEL Where-Clause Syntax

Where expressions are evaluated by the go-sdk CEL engine. The entire data map is serialized to JSON and injected as `_data_` (a string variable). Custom functions operate on field *paths* using `gjson` dot-notation.

**Custom functions:**

| Function | Signature | Description |
|---|---|---|
| `contains` | `contains("field.path", "substring")` | True if field contains substring (case-sensitive) |
| `safe` | `safe("field.path", "default")` | Returns field value or default if missing/null |
| `exists` | `exists("field.path")` | True if field exists and is non-null |
| `equals` | `equals("field.path", "value")` | True if field equals value |

**Critical rule:** Always use string literals as the first argument. Do **not** use native CEL map access (`data["field"]`) in these functions — it is transformed incorrectly by the SDK.

```yaml
# CORRECT
where: contains("log.message", "Failed password") && safe("origin.ip", "") != ""

# WRONG — the SDK prepends _data_ before log["message"], passing the value not the path
where: contains(log["message"], "Failed password")
```

---

### 4.4 Adding a Parser for a New Log Source

**This is a YAML-only operation. No Go code changes are needed. No restart is needed.**

#### Step 1 — Choose a `dataType` identifier

Use lowercase, no spaces, no hyphens. Examples: `linux`, `wineventlog`, `suricata`, `paloalto`, `crowdstrike`.

#### Step 2 — Create the filter file

Create `$WORK_DIR/pipeline/filters/<vendor>-<product>.yaml` (in development: `event-processor/pipeline/filters/<vendor>.yaml` if you maintain filters in the repo).

The file structure:

```yaml
pipeline:
  - dataTypes:
      - <your-datatype>
    steps:
      # Step 1: parse the raw string
      # Step 2: rename/promote fields
      # Step 3: enrich (geo, drop noise, etc.)
```

#### Step 3 — Identify the log format

| Log format | Use operator |
|---|---|
| JSON log | `json` |
| Syslog / custom delimited | `grok` |
| `key=value` pairs | `kv` |
| Structured but needs remap | `rename` + `add` |

#### Step 4 — Write the parser

**Example A: JSON log source (e.g., CrowdStrike Falcon)**

```yaml
pipeline:
  - dataTypes:
      - crowdstrike
    steps:
      # Parse the outer JSON envelope
      - json:
          source: raw

      # Map vendor fields to HiveArmor schema
      - rename:
          from: [log.event.UserIp]
          to: origin.ip

      - rename:
          from: [log.event.UserName]
          to: origin.user

      - rename:
          from: [log.event.ComputerName]
          to: origin.host

      - rename:
          from: [log.event.EventSimpleName]
          to: log.action

      # Add geolocation for origin IP
      - dynamic:
          plugin: com.hivearmor.geolocation
          params:
            source: origin.ip
            destination: origin.geolocation

      # Drop health-check events
      - drop: {}
        where: 'safe("log.action", "") == "HealthCheck"'

      # Normalize severity
      - add:
          params:
            key: severity
            value: "high"
          where: 'contains("log.action", "Detection")'
```

**Example B: Syslog source (e.g., Fortinet FortiGate)**

```yaml
pipeline:
  - dataTypes:
      - fortinet
    steps:
      # Fortinet uses key=value format
      - kv:
          fieldSplit: " "
          valueSplit: "="

      # Map to schema
      - rename:
          from: [log.srcip]
          to: origin.ip

      - rename:
          from: [log.dstip]
          to: target.ip

      - rename:
          from: [log.srcuser]
          to: origin.user

      - rename:
          from: [log.action]
          to: log.action

      - rename:
          from: [log.msg]
          to: log.message

      - dynamic:
          plugin: com.hivearmor.geolocation
          params:
            source: origin.ip
            destination: origin.geolocation

      # Drop non-traffic logs
      - drop: {}
        where: 'safe("log.type", "") == "event" && safe("log.subtype", "") == "system"'
```

**Example C: Mixed syslog with grok**

```yaml
pipeline:
  - dataTypes:
      - cisco-asa
    steps:
      # Extract header
      - grok:
          source: raw
          patterns:
            - fieldName: log.timestamp
              pattern: "{{.monthName}} {{.monthDay}} {{.time}}"
            - fieldName: log.host
              pattern: "{{.hostname}}"
            - fieldName: log.message
              pattern: "%ASA-{{.integer}}-{{.integer}}: {{.greedy}}"

      # Extract IPs from message for specific event types
      - grok:
          source: log.message
          where: 'contains("log.message", "Built inbound")'
          patterns:
            - fieldName: origin.ip
              pattern: "{{.ipv4}}"
            - fieldName: target.ip
              pattern: "to {{.ipv4}}"

      - dynamic:
          plugin: com.hivearmor.geolocation
          params:
            source: origin.ip
            destination: origin.geolocation
```

#### Step 5 — Test the parser

Use the `POST /v1/inject` endpoint:

```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "crowdstrike",
    "dataSource": "my-sensor",
    "raw": "{\"event\":{\"UserIp\":\"1.2.3.4\",\"UserName\":\"jdoe\",\"EventSimpleName\":\"UserLogon\"}}"
  }'
```

Check the response:
- `"status": "processed"` — event was written to OpenSearch
- `"status": "dropped"` — a `drop` step fired; check your `where` conditions
- `"alerts": 1` — a rule also fired

Verify the document in OpenSearch:
```bash
curl -sk -u admin:LocalDev@2024! \
  "https://localhost:9200/_v3_hive_crowdstrike-*/_search?pretty&size=1&sort=@timestamp:desc"
```

#### Step 6 — (Optional) Add correlation rules

Once the parser is verified, add rule YAML files to `$WORK_DIR/rules/` — see [Section 5](#5-correlation-rules-system).

#### Can this be done from the UI?

Currently **no** — filter YAML files must be placed on the host filesystem under `$WORK_DIR/pipeline/filters/`. A UI-based filter editor is on the roadmap (tracked in `.plan/PROMPTS_INDEX.md`). The engine hot-reloads from disk every 30 seconds, so no restart is needed after placing a new file.

---

## 5. Correlation Rules System

### 5.1 Rule Schema Reference

Rules are YAML files in `$WORK_DIR/rules/`. Each file can contain a single rule object or a YAML list of rules.

```yaml
- id: 1001                        # integer, must be unique across all rules
  name: "Linux: SSH Brute Force"  # display name in the UI
  dataTypes:                      # which log types this rule applies to
    - linux
  category: "Credential Access"   # MITRE tactic name
  technique: "T1110"              # MITRE ATT&CK technique ID
  adversary: "origin"             # which side is the attacker: origin | target
  description: "..."              # human-readable description
  references:                     # optional CVE / URL list
    - "https://attack.mitre.org/techniques/T1110/"

  # CEL expression — evaluated per event; must return true to continue
  where: |
    contains("log.message", "Failed password") && safe("origin.ip", "") != ""

  # Correlation: count matching historical events in OpenSearch before firing
  correlation:
    - indexPattern: "_v3_hive_linux-*"
      with:
        - field: "origin.ip"
          operator: filter_match      # filter_match | filter_term
          value: "{{.origin.ip}}"     # {{.field.path}} is substituted from current event
        - field: "log.action"
          operator: filter_match
          value: "failed"
      within: "5m"                   # time window (Go duration: 5m, 1h, 24h)
      count: 5                       # minimum matching events required

  # Dedup: don't re-fire the same alert for the same adversary IP within 7 days
  deduplicateBy:
    - "adversary.ip"

  # Group: child alerts are parented to the first open alert with the same groupBy key
  groupBy:
    - "adversary.ip"

  # Impact scores (0-3 each); sum determines severity
  impact:
    confidentiality: 2    # 0=none, 1=low, 2=medium, 3=high
    integrity: 1
    availability: 1
    # sum=4 → severity "1" (low)
    # sum ≥5 → severity "2" (medium / OPEN HIGH)
    # sum ≥8 → severity "3" (high, isIncident=true)
```

**Severity mapping:**

| Impact sum | Severity field | UI label |
|---|---|---|
| 0-4 | `"1"` | Low |
| 5-7 | `"2"` | Medium / High (OPEN HIGH) |
| 8-9 | `"3"` | High / Critical (OPEN CRITICAL) |

**Correlation operators:**

| Operator | OpenSearch query type | Use for |
|---|---|---|
| `filter_match` | `match` query | Text fields, analyzed strings, IP addresses |
| `filter_term` | `term` query on `field.keyword` | Exact keyword fields with `.keyword` sub-field |

**Template substitution in `value`:**

`{{.field.path}}` is replaced with the value of that field from the triggering event's flat JSON. Supports dot-path: `{{.origin.ip}}`, `{{.log.action}}`, `{{.dataSource}}`.

**Enterprise-only rule fields:**

```yaml
riskScore: 10              # accumulate instead of direct alert (risk engine)
anomalyDetect: true        # compare count to 30-day 3σ baseline instead of fixed count
sequence:                  # ordered multi-step detection
  - where: 'contains("log.message", "Failed password")'
    within: "30s"
  - where: 'contains("log.message", "session opened")'
    within: "5m"
```

---

### 5.2 SOP: Writing a New Correlation Rule

**Prerequisite:** The log source must already have a parser (Section 4.4) and events must be flowing into `_v3_hive_<dataType>-*`.

#### Step 1 — Identify the attack pattern

Define the detection in three parts:
- **Trigger condition** (`where`): what makes a single event suspicious?
- **Historical context** (`correlation`): how many matching events must exist in what time window?
- **Impact**: what is the blast radius if this fires?

#### Step 2 — Inspect the actual event JSON

Query OpenSearch to see what fields are available:

```bash
curl -sk -u admin:LocalDev@2024! \
  "https://localhost:9200/_v3_hive_<dataType>-*/_search?pretty&size=1&sort=@timestamp:desc" \
  | jq '._source'
```

Note the exact field names. Remember:
- Log fields are stored as `log.<key>` (e.g., `log.message`, `log.action`, `log.eventID`)
- Origin/target IPs are stored as both `origin.ip` (nested) and flat `"origin.ip"` key

#### Step 3 — Write the rule YAML

Create or append to a file in `$WORK_DIR/rules/`. Choose an unused integer ID. File naming convention: `<datatype>-<detection-theme>.yaml`.

```yaml
- id: 4001                           # pick unused ID
  name: "Palo Alto: Admin Login Brute Force"
  dataTypes:
    - paloalto
  category: "Credential Access"
  technique: "T1110"
  adversary: "origin"
  description: "Multiple failed admin login attempts to a Palo Alto device."
  where: |
    contains("log.message", "failed authentication") && safe("origin.ip", "") != ""
  correlation:
    - indexPattern: "_v3_hive_paloalto-*"
      with:
        - field: "origin.ip"
          operator: filter_match
          value: "{{.origin.ip}}"
      within: "10m"
      count: 5
  deduplicateBy:
    - "adversary.ip"
  impact:
    confidentiality: 3
    integrity: 2
    availability: 1
```

#### Step 4 — Test the where clause

Inject a test event and confirm `ok=true` in engine logs:

```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "paloalto",
    "dataSource": "pa-fw-01",
    "originIp": "1.2.3.4",
    "log": {"message": "failed authentication for admin"}
  }'
```

Check engine output for `[CEL DEBUG] rule=4001 ok=true`.

#### Step 5 — Test correlation

Wait for 5+ matching events to accumulate in OpenSearch (either inject them or wait for real traffic), then inject the trigger again. Expect `"alerts": 1` in the response.

#### Step 6 — Verify in the UI

Navigate to `/alerts` in the frontend. The new alert should appear at the top of the list view with the correct name, severity, and technique tag.

#### Step 7 — Remove debug logging before production

The `[CEL DEBUG]` lines in `rules/engine.go:64-66` should be removed once rules are validated:

```go
// Remove before production:
if rule.ID == 1001 {
    fmt.Printf("[CEL DEBUG] rule=%d ok=%v ...\n", ...)
}
```

---

### 5.3 SOP: Modifying an Existing Rule

1. Edit the YAML file in `$WORK_DIR/rules/`.
2. The engine hot-reloads every 30 seconds — no restart needed.
3. If lowering/raising `count` or changing `within`, be aware existing dedup entries in OpenSearch may suppress the first alert if the IP was seen recently.
4. To force a re-fire after changing dedup fields, either change `deduplicateBy` or wait 7 days.

---

### 5.4 Rule Testing Workflow

The `POST /v1/inject` endpoint accepts synthetic events:

```json
{
  "dataType": "linux",         // required — routes to correct pipeline + rules
  "dataSource": "test-host",
  "tenantId": "local",
  "raw": "<raw log string>",   // optional — processed by pipeline
  "originIp": "1.2.3.4",      // optional — overrides pipeline output
  "originUser": "root",        // optional
  "targetIp": "10.0.0.1",     // optional
  "log": {                     // optional — pre-parsed log fields
    "message": "Failed password for root",
    "action": "failed",
    "eventID": "4625"
  }
}
```

**Correlation requires the BulkQueue flush delay (5 seconds).** To reliably test a rule with `count: N`, inject N-1 events, wait 7+ seconds for the flush, then inject the Nth event.

---

## 6. Enrichment

### Geolocation

File: `enrichment/geo.go`

Loaded lazily from `$WORK_DIR/geolocation/`. Expects MaxMind GeoLite2 CSV format:
- `GeoLite2-ASN-Blocks-IPv4.csv`
- `GeoLite2-ASN-Blocks-IPv6.csv`
- `GeoLite2-City-Blocks-IPv4.csv`
- `GeoLite2-City-Blocks-IPv6.csv`
- `GeoLite2-City-Locations-en.csv`

Returns: `country`, `city`, `countryCode`, `asn`, `aso`, `latitude`, `longitude`.

Used automatically in pipelines via the `dynamic: com.hivearmor.geolocation` operator.

### Threat Intelligence Feeds

File: `enrichment/feeds.go`

Queries `_v3_hive_lookup-*` OpenSearch indices for IP reputation. Loaded on startup, cached with a 5-minute TTL. Enriches events by storing a `log.threatIntel` field if the origin IP matches a known-bad indicator.

---

## 7. Writers (OpenSearch)

### Event Writer (`writer/events.go`)

Uses `sdkos.BulkQueue` — batches documents and flushes every 5 seconds or at 500 documents. Index name: `_v3_hive_<dataType>-YYYY.MM.DD` (dot-date format).

Each event document includes:
- All standard fields: `@timestamp`, `id`, `dataType`, `dataSource`, `raw`, `action`, `actionResult`, `severity`, `protocol`
- Log fields flattened as `log.<key>`: `log.message`, `log.action`, `log.eventID`, etc.
- Origin/target as both nested object (`origin.ip` inside `origin: {}`) and flat key (`"origin.ip": "1.2.3.4"`) to support both match and term queries.

### Alert Writer (`writer/alerts.go`)

Writes directly via HTTP PUT (not bulk queue) to `_v3_hive_alert-YYYY.MM.DD`. Before writing:
1. **Dedup check**: queries `_v3_hive_alert-*` for the same `name` + same `deduplicateBy` field values within 7 days. Skips if found.
2. **Group check**: queries for a parent alert with the same `groupBy` fields in the last 24 hours. Sets `parentId` if found.

---

## 8. Enterprise Features

| Feature | Package | What it does |
|---|---|---|
| Risk Scoring | `enterprise/risk/` | Accumulates per-IP risk points; flushes alert when threshold (100) reached; 10% hourly decay |
| Offense Engine | `enterprise/offense/` | Groups ≥3 related alerts (same adversary IP/user within 2h) into a `_v3_hive_offense-*` document |
| Lookup Tables | `enterprise/lookup/` | Enriches events from `_v3_hive_lookup-assets` and `_v3_hive_lookup-identities`; 5-min LRU cache |
| Anomaly Baseline | `enterprise/baseline/` | 15-min goroutine; computes 30-day mean+3σ per data source; triggers anomaly alerts |
| Sequence Detection | `enterprise/sequence/` | Stateful multi-step detection using in-memory LRU(10000); fires when ordered steps match in time windows |

---

## 9. HTTP API Reference

### Public Server (`:8000` / `$PUBLIC_PORT`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"status":"ok"}` |
| `GET` | `/api/healthcheck` | Alias for health |
| `POST` | `/api/v1/modules-config` | Accepts module configuration from the backend |

### Ingest Server (`:8090` / `$INGEST_PORT`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{"service":"hivearmor-event-processor","status":"ok"}` |
| `POST` | `/v1/inject` | Inject a synthetic log event for testing |

**`POST /v1/inject` request body** — see [Section 5.4](#54-rule-testing-workflow).

**`POST /v1/inject` response:**
```json
{
  "status": "processed",        // or "dropped" if a drop step fired
  "id": "<event UUID>",
  "index": "_v3_hive_linux",
  "alerts": 1,                  // number of alerts that fired
  "alertIds": ["<alert UUID>"]
}
```

---

## 10. Extending the Engine

### Adding a New Pipeline Operator

1. Create `event-processor/pipeline/operators/<name>_op.go`.
2. Add the operator type to `pipeline/types.go` as a new struct field on `Step`.
3. Add the YAML deserialization tag to `Step`.
4. Add a `case step.<NewOp> != nil:` branch in `pipeline/executor.go`.
5. Rebuild the binary.

Example skeleton:

```go
// operators/regex_op.go
package operators

import "regexp"

type RegexDef struct{ Pattern, Source, Target string }

func RegexOp(defs []RegexDef, data map[string]any) {
    for _, d := range defs {
        src := getString(data, d.Source)
        re, err := regexp.Compile(d.Pattern)
        if err != nil { continue }
        if m := re.FindString(src); m != "" {
            setDeep(data, d.Target, m)
        }
    }
}
```

### Adding a New Dynamic Plugin

Add a case to the `switch pluginName` in `operators/dynamic_op.go`:

```go
case "com.hivearmor.threatintel":
    ip := getString(data, params["source"])
    result := myThreatIntelLookup(ip)
    setDeep(data, params["destination"], result)
```

### Adding a New Enterprise Feature

Follow the pattern in `enterprise/risk/scorer.go`:
- `Init(osURL, user, pass string)` — called from `main.go`
- A background goroutine for periodic operations
- Access `writer.WriteAlert()` to emit alerts
- Access `sdkos.BulkQueue` for OpenSearch writes

---

## 11. Tool Administrator Runbook

### Deploying a New Log Source Parser

1. SSH into the host or update the volume-mounted config.
2. Place the filter YAML in `$WORK_DIR/pipeline/filters/`.
3. Wait up to 30 seconds — the engine hot-reloads automatically.
4. Verify: `curl -s http://localhost:8090/health` should still return `ok`.
5. Send a test event via `POST /v1/inject` and confirm it processes.

### Deploying a New Correlation Rule

1. Place the rule YAML in `$WORK_DIR/rules/`.
2. Wait up to 30 seconds — hot-reload applies automatically.
3. No restart needed.
4. Test with `POST /v1/inject` as described in [Section 5.4](#54-rule-testing-workflow).

### Restarting the Engine

```bash
# Docker environment
docker compose restart eventprocessor

# Systemd
systemctl restart hivearmor-eventprocessor

# Local dev — stop and restart via the launch.json preview server
```

Restart is only needed when:
- The engine binary itself has been recompiled
- Environment variables have changed
- The `$WORK_DIR/sockets/` directory was manually deleted (socket recreation requires restart)

### Rebuilding the Binary

```bash
cd event-processor
GOCACHE=$TMPDIR/go-build GOPATH=$HOME/go GOMODCACHE=$HOME/go/pkg/mod \
  go build -o /path/to/event-processor .
```

### Checking Rule Load Status

There is no REST endpoint for loaded rules yet. Check engine startup logs:

```bash
docker logs hivearmor-eventprocessor 2>&1 | grep -E "started|warn|ERROR"
```

Rules failing to parse are silently skipped — if a rule isn't firing, verify the YAML parses correctly:

```bash
python3 -c "import yaml; yaml.safe_load(open('myrule.yaml'))" && echo OK
```

### OpenSearch Index Reference

| Index pattern | Contents | Written by |
|---|---|---|
| `_v3_hive_<type>-YYYY.MM.DD` | Normalized events | Event writer (BulkQueue) |
| `_v3_hive_alert-YYYY.MM.DD` | Fired alerts | Alert writer (direct PUT) |
| `_v3_hive_offense-YYYY.MM.DD` | Grouped offenses | Offense engine |
| `_v3_hive_risk-scores-YYYY.MM.DD` | Per-IP risk accumulator | Risk scorer |
| `_v3_hive_baselines-YYYY.MM.DD` | Anomaly baseline stats | Baseline collector |
| `_v3_hive_lookup-assets` | Asset reference data | Manual / seed tool |
| `_v3_hive_lookup-identities` | Identity reference data | Manual / seed tool |

### Environment Variable Quick Reference

For local dev (`$TMPDIR/ep-workdir`):

```bash
WORK_DIR=/tmp/ep-workdir
OPENSEARCH_HOST=localhost
OPENSEARCH_PORT=9200
OPENSEARCH_USER=admin
OPENSEARCH_PASSWORD=LocalDev@2024!
GIN_MODE=release
PUBLIC_PORT=8001
INGEST_PORT=8090
```