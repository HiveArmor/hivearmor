# OWN-01: Event Processor — Full Investigation Report

> Generated: 2026-07-07  
> Status: Phase A complete — ready to begin Phase B (build)

---

## 1. Complete Data Flow Architecture

```
Field Agent (utmstack-agent binary)
    │
    ├── gRPC/TLS → agentmanager:9000
    │       Registration, commands, config push, ping/heartbeat
    │
    └── gRPC/TLS → event-processor-worker:50051
            plugins.Integration/ProcessLog (bidirectional stream)
                    │
                    │   [SQLite + 10k in-memory queue on agent side]
                    │   [auth key validated against agent-manager every 20s]
                    │
                    └── Unix socket (engine_server.sock)
                            └── ThreatWinds analysis engine (closed-source binary)
                                        │
                                        ├── filter pipeline (UTMStack YAML DSL)
                                        ├── correlation rule engine (CEL)
                                        ├── geolocation enrichment
                                        ├── threat intel feeds
                                        ├── alert deduplication
                                        │
                                        └── OpenSearch bulk write
                                                ├── v11-log-{dataType}-YYYY.MM.DD
                                                └── v11-alert-YYYY.MM.DD

backend (Java, port 8088)
    └── HTTP POST → event-processor-manager:9002/api/v1/modules-config
            (module config push)
```

**Critical finding:** The actual log enrichment/correlation happens inside the **ThreatWinds engine** (the closed-source binary inside the upstream image). The Go `plugins/*` code is open and wraps around it. When we build OWN-01, we are **replacing the entire container** — both the Go wrapper and the engine.

---

## 2. gRPC Wire Protocol

### 2.1 Agent → Event-Processor-Worker

The agent connects to port **50051** and calls `plugins.Integration/ProcessLog` — a bidirectional streaming RPC.

From `/plugins/inputs/handlers.go` and `/agent/agent/logprocessor.go`:

```protobuf
// Inferred proto (actual .proto not in repo — defined in UTMStack go-sdk)
service Integration {
  rpc ProcessLog(stream Log) returns (stream Log) {}
}

message Log {
  string id         = 1;  // agent-assigned UUID for the log entry
  string type       = 2;  // dataType: "linux", "wineventlog", "suricata", etc.
  string data_type  = 3;  // redundant with type in some SDK versions
  string data       = 4;  // raw log string (syslog line, JSON blob, etc.)
  string source     = 5;  // agent hostname / sensor ID
  string tenant_id  = 6;
  // Agent auth metadata sent as gRPC metadata headers:
  //   "key"  → agent_key (from RegisterAgent response)
  //   "id"   → agent_id (string form of uint32)
  //   "type" → "AGENT" or "COLLECTOR"
}
```

**Auth mechanism:** Agent auth is via gRPC metadata (not a field in the proto). The inputs plugin validates inbound `key`/`id` against a 20-second-refreshed cache of agent-manager's key list.

**Acknowledgment:** The bidirectional stream returns an ack `Log` message back to the agent. On receipt the agent marks the SQLite entry as `processed: true`.

**Buffering:** Agent maintains a SQLite DB + 10,000-entry in-memory channel. Every 10 minutes unprocessed SQLite entries are replayed (crash recovery). On connection loss reconnects with backoff (10s initial, 60s max). After 100 consecutive invalid-key rejections the agent self-uninstalls.

### 2.2 Agent ↔ Agent-Manager

These protos are fully documented in `/agent-manager/protos/`:

| Service | RPC | Type | Purpose |
|---------|-----|------|---------|
| `AgentService` | `RegisterAgent` | Unary | First registration, returns `AuthResponse{id, key}` |
| `AgentService` | `AgentStream` | Bidi stream | Command dispatch + result collection (`BidirectionalStream` oneof) |
| `AgentService` | `ListAgents` | Unary | Panel: list agents with status |
| `PanelService` | `ProcessCommand` | Bidi stream | UI → agent command execution |
| `CollectorService` | `CollectorStream` | Bidi stream | Collector config push + ack |
| `PingService` | `Ping` | Client stream | Keep-alive / last-seen update |

Key message types (full field tables in `/agent-manager/protos/*.proto`):
- `AgentRequest` — ip, hostname, os, platform, version, mac, aliases, addresses
- `BidirectionalStream` — oneof `UtmCommand` | `CommandResult`
- `UtmCommand` — agent_id, command, shell hint (`cmd`/`powershell`/`bash`/`sh`), cmd_id, reason
- `CommandResult` — agent_id, result string, executed_at timestamp, cmd_id

### 2.3 Backend → Event-Processor-Manager

**HTTP:** `POST http://eventprocessor:9002/api/v1/modules-config?nameShort=<module>`  
Auth: `internal-key` header  
Payload: module configuration JSON (managed by `EventProcessorManagerService.java`)

**gRPC (internal):** Port 9003, used by other Go plugins inside the event-processor to read module configs.

---

## 3. Filter Format Specification

### 3.1 File Layout

```
filters/
  linux/linux.yml           (470 lines)
  windows/windows-events.yml (3000+ lines)
  cisco/asa.yml             (5900+ lines)
  suricata/suricata.yml     (175 lines)
  netflow/netflow.yml       (1160 lines)
  aws/aws.yml               (225 lines)
  generic/generic.yml       (13 lines)
  json/json-input.yml       (8 lines)
  utmstack/utmstack.yml     (18 lines)
  # ... 20+ more source categories
```

### 3.2 Format (UTMStack YAML Pipeline DSL)

This is **NOT Logstash DSL** — it is UTMStack's proprietary pipeline format, parsed by Go code in the closed-source ThreatWinds engine (and likely also in `plugins/config`).

```yaml
pipeline:
  - dataTypes:
      - "linux"           # matches incoming log's type field
    steps:
      - <operator>:       # see operators below
          ...
```

### 3.3 Step Operators

| Operator | Purpose | Key Fields |
|----------|---------|------------|
| `json` | Parse JSON string from field | `source`, `where` |
| `grok` | Tokenize string with ordered patterns | `patterns[]{fieldName, pattern}`, `source`, `where` |
| `rename` | Rename a field | `from: [field]`, `to: field`, `where` |
| `add` | Set field to literal value | `function: string`, `params.key`, `params.value`, `where` |
| `cast` | Type-coerce field(s) | `fields: []`, `to: int`, `where` |
| `trim` | Strip prefix/suffix from field(s) | `function: prefix\|suffix\|substring`, `substring`, `fields: []`, `where` |
| `drop` | Discard the entire event | `where` (mandatory) |
| `delete` | Remove specific fields | `fields: []`, `where` |
| `kv` | Parse key=value format | `fieldSplit`, `valueSplit` |
| `dynamic` | Call a named plugin | `plugin`, `params{}`, `where` |

**Grok pattern tokens** (Go template syntax within pattern strings):
`{{.integer}}`, `{{.word}}`, `{{.data}}`, `{{.greedy}}`, `{{.ipv4}}`, `{{.ipv6}}`,
`{{.hostname}}`, `{{.time}}`, `{{.monthName}}`, `{{.monthDay}}`, `{{.day}}`, `{{.year}}`, `{{.space}}`

**Known `dynamic` plugins:**
- `com.utmstack.geolocation` — params: `source` (IP field), `destination` (output field)

### 3.4 `where` Expression Language

Functional syntax supporting:

```
exists("field.path")
equals("field", value)
equalsIgnoreCase("field", "str")
oneOf("field", [v1, v2])
startsWith("field", "str")
contains("field", "str")
regexMatch("field", "pattern")
greaterThan("field", number)
!expr
expr && expr
expr || expr
log.messageId==106001          # direct comparison shorthand
log.messageId>=109201 && log.messageId<=109213
```

### 3.5 Normalized Event Schema (output fields)

All filters converge on this common output namespace:

| Namespace | Fields |
|-----------|--------|
| `origin.*` | `ip`, `port`, `host`, `user`, `process`, `command`, `path`, `group`, `bytesSent`, `bytesReceived`, `geolocation` |
| `target.*` | `ip`, `port`, `host`, `user`, `domain`, `geolocation` |
| `action` | Primary action/event verb |
| `actionResult` | `accepted` / `denied` / outcome string |
| `severity` | Human label decoded from numeric priority |
| `statusCode` | Exit/status code (int) |
| `protocol` | Network protocol string |
| `log.*` | All source-specific parsed fields (unpromoted) |
| `raw` | Original unparsed log string |

---

## 4. Rule Format Specification

### 4.1 File Layout

```
rules/
  linux/debian_family/*.yml
  linux/rhel_family/*.yml
  windows/*.yml
  nids/suricata/*.yml
  generic/generic/*.yml
  antivirus/ cisco/ cloud/ crowdstrike/ fortinet/
  github/ ibm/ json/ macos/ mikrotik/ netflow/
  office365/ paloalto/ pfsense/ sonicwall/ sophos/
  syslog/ vmware/
```

### 4.2 Rule Schema

```yaml
# Rule version v1.0.1          ← informational comment only
dataTypes:
  - "linux"                     # routes to v11-log-linux-* index
name: "System Linux: ..."       # human name → stored in alert
impact:
  confidentiality: 1            # 1-3 scale
  integrity: 2
  availability: 3
category: "Defense Evasion"     # MITRE tactic
technique: "T1562.001 - ..."    # MITRE technique
adversary: origin               # "origin" or "target" — which side is attacker
references:
  - "https://attack.mitre.org/..."
description: |
  Multi-line description.
where: <CEL expression>         # PRIMARY match condition
afterEvents:                    # OPTIONAL: threshold correlation
  - indexPattern: v11-log-linux-*
    with:
      - field: origin.user
        operator: filter_term
        value: '{{.origin.user}}'  # template resolved from trigger event
    within: 15m
    count: 10
    or:                         # OPTIONAL: alternative sub-query
      - indexPattern: ...
groupBy:                        # OPTIONAL: link as child of matching parent alert
  - origin.ip
  - origin.user
deduplicateBy:                  # OPTIONAL: suppress duplicates (7-day window)
  - origin.ip
  - target.user
```

### 4.3 CEL Functions (rule `where` clause)

Same expression language as filter `where` clauses plus additional:

| Function | Signature |
|----------|-----------|
| `exists("field")` | bool |
| `equals("field", val)` | bool |
| `equalsIgnoreCase("field", str)` | bool |
| `contains("field", str\|list)` | bool |
| `containsAll("field", list)` | bool |
| `oneOf("field", list)` | bool |
| `startsWith("field", str\|list)` | bool |
| `endsWith("field", str\|list)` | bool |
| `regexMatch("field", pattern)` | bool |
| `lessThan / greaterThan / lessOrEqual / greaterOrEqual` | bool |
| `inCIDR("field", "x.x.x.x/n")` | bool |
| `isHour / isMinute / isDayOfWeek / isWeekend / isWorkDay` | bool |
| `isBetweenTime("field", "HH:MM", "HH:MM")` | bool |
| `safe("field", default)` | value |

### 4.4 Correlation (`afterEvents`) Operators

| Operator | OpenSearch equivalent |
|----------|----------------------|
| `filter_term` | term query (exact match) |
| `filter_match` | match query (tokenized) |
| `must_not_term` | must_not term |
| `must_not_match` | must_not match |

Template values `'{{.field.path}}'` are resolved against the triggering event JSON at evaluation time.

---

## 5. OpenSearch Index Architecture

### 5.1 Global Index Template

- Template name: `utmstack_indexes`
- Patterns: `v11-alert-*`, `v11-log-*`, `.utm-*`, `.utmstack-*`
- Settings: 1 shard, 0 replicas, **50,000 field limit** (dynamic mapping, no static schema)
- **No explicit JSON mapping files exist** — all fields are dynamic

### 5.2 Index Naming Convention

```
v11-log-{dataType}-YYYY.MM.DD     ← normalized events (daily rollover)
v11-alert-YYYY.MM.DD              ← correlation alerts (daily rollover)
v11-statistics-YYYY.MM            ← ingest metrics (monthly)
v11-api-access-logs-*             ← API key audit
v11-backend-logs                  ← Java backend events
v11-log-compliance-evaluation     ← compliance check results
v11-soc-ai                        ← LLM triage results
```

### 5.3 Registered Index Patterns (utm_index_pattern table)

| Pattern | Module(s) |
|---------|-----------|
| `v11-log-*` | All logs (catch-all) |
| `v11-alert-*` | All alerts |
| `v11-log-linux-*` | LINUX_AGENT |
| `v11-log-wineventlog-*` | WINDOWS_AGENT |
| `v11-log-netflow-*` | NETFLOW |
| `v11-log-aws-*` | AWS_IAM_USER |
| `v11-log-azure-*` | AZURE |
| `v11-log-o365-*` | O365 |
| `v11-log-firewall-*` | Cisco, Fortigate, Sophos, Palo Alto, SonicWall, UFW, Mikrotik, Meraki, PFSense, FortiWeb |
| `v11-log-suricata-*` | SURICATA |
| `v11-log-antivirus-*` | ESET, Sentinel One, Kaspersky, Bitdefender |
| `v11-log-macos-*` | MACOS |
| `v11-log-github-*` | GITHUB |
| `v11-log-generic-*` | Generic |
| `v11-log-json-input-*` | JSON input |
| `v11-log-syslog-*` | SYSLOG |
| `v11-log-ibm-as400-*` | AS_400 |
| `v11-log-crowdstrike-*` | CrowdStrike |
| *(33+ more — see data.sql lines 1097–1148)* | |

### 5.4 `v11-log-*` Event Document Schema

```json
{
  "@timestamp": "2024-01-15T10:30:00Z",
  "id": "uuid",
  "deviceTime": "2024-01-15T10:30:00Z",
  "dataType": "linux",
  "dataSource": "hostname-or-sensor-id",
  "tenantId": "string",
  "tenantName": "string",
  "raw": "original unparsed log string",
  "log": { /* free-form parsed fields — source-specific */ },
  "origin": {
    "ip": "1.2.3.4",
    "port": "22",
    "host": "hostname",
    "user": "username",
    "process": "sshd",
    "command": "full command line",
    "path": "/working/dir",
    "group": "group-name",
    "bytesSent": 0,
    "bytesReceived": 0,
    "geolocation": { "country": "...", "city": "...", "latitude": 0, "longitude": 0, "asn": "", "aso": "", "countryCode": "" }
  },
  "target": { /* same structure as origin */ },
  "protocol": "tcp",
  "connectionStatus": "string",
  "statusCode": 0,
  "actionResult": "accepted",
  "action": "system.auth",
  "severity": "medium",
  "errors": [],
  "compliance": { /* per-framework compliance metadata */ }
}
```

### 5.5 `v11-alert-*` Alert Document Schema

```json
{
  "@timestamp": "...",
  "id": "uuid",
  "parentId": "uuid-or-null",
  "status": 1,
  "statusLabel": "Automatic review",
  "isIncident": false,
  "name": "System Linux: Possible Brute Force Attack",
  "category": "Credential Access",
  "severity": 2,
  "severityLabel": "Medium",
  "technique": "T1110 - Brute Force",
  "description": "...",
  "references": ["https://attack.mitre.org/..."],
  "dataType": "linux",
  "dataSource": "hostname",
  "impact": { "confidentiality": 2, "integrity": 2, "availability": 3 },
  "impactScore": 7,
  "adversary": { /* Side object — see below */ },
  "target": { /* Side object */ },
  "events": [ /* array of Event objects that triggered the alert */ ],
  "lastEvent": { /* most recent Event */ },
  "tags": [],
  "notes": "",
  "tagRulesApplied": [],
  "deduplicatedBy": ["origin.ip", "origin.user"],
  "groupedBy": ["origin.ip", "origin.user"],
  "errors": [],
  "tenantId": "string",
  "tenantName": "string",
  /* SOC AI fields (populated async by soc-ai plugin): */
  "gpt_timestamp": "...",
  "gpt_classification": "possible incident",
  "gpt_reasoning": "...",
  "gpt_next_steps": "..."
}
```

**Side object** (used in `adversary.*` and `target.*`):  
Network: `ip`, `host`, `user`, `group`, `port`, `domain`, `mac`, `url`, `cidr`  
Geo: `geolocation.{country, city, latitude, longitude, asn, aso, countryCode, accuracy}`  
Traffic: `bytesSent`, `bytesReceived`, `packagesSent`, `packagesReceived`  
TLS/Fingerprints: `ja3Fingerprint`, `jarmFingerprint`, `sshBanner`, `sshFingerprint`, `certificateFingerprint`  
Email: `email`, `emailSubject`, `emailBody`, `emailAddress`, `dkim`  
Process: `process`, `processState`, `command`, `windowsScheduledTask`, `windowsServiceName`  
File: `file`, `path`, `filename`, `sizeInBytes`, `mimeType`  
Hashes: `hash`, `md5`, `sha1`, `sha256`, `sha512`, `authentihash`  
Vuln: `cpe`, `cve`  
Malware: `malware`, `malwareFamily`, `malwareType`

---

## 6. Backend Pipeline Management (Java)

The backend manages filters/pipelines via PostgreSQL only — **no gRPC or HTTP calls to the event-processor** for filter content. Filters/rules are synced from filesystem YAML on startup by `DefinitionSyncService`.

### Key tables:
- `utm_logstash_filter` — stores raw filter YAML content as a string
- `utm_logstash_pipeline` — named pipelines, each linked to a module
- `utm_group_logstash_pipeline_filters` — pivot: which filters belong to which pipeline
- `utm_logstash_filter_group` — filter categories (grouping label)

### REST API:
- `GET/DELETE /api/logstash-pipelines` — pipeline management
- `GET /api/logstash-pipelines/stats` — pipeline health (polls `v11-statistics-*` every 20s)
- `POST/PUT/GET/DELETE /api/utm-filters` — filter CRUD
- `GET /api/utm-logstash-filter-groups` — filter groups

### Important: Startup sync behavior
`DefinitionSyncService` (a `CommandLineRunner`) scans `./nilachakra/filters/*.yaml` and `./nilachakra/rules/*.yaml` and upserts all system-owned records into PostgreSQL on every app start. Direct DB edits to system records will be overwritten on next restart.

---

## 7. Event-Processor Container Internals

### Ports (internal Docker network, not all host-mapped in local-dev):

| Port | Protocol | Purpose |
|------|----------|---------|
| 50051 | gRPC/TLS | Inbound log stream from agents |
| 8080 | HTTPS | REST log ingestion (external collectors) |
| 9002 | HTTP | Module config API (backend calls this) |
| 9003 | gRPC | Internal config reading by plugins |
| 8000 | HTTP | Manager API + healthcheck (`nc -z localhost 8000`) |

### In local-dev (`local-dev/docker-compose.yml`):
- **Image:** `ghcr.io/utmstack/utmstack/eventprocessor:v11.2.10`
- **Ports mapped to host:** only `8000:8000`
- **Volumes:** `ep_pipeline:/workdir/pipeline`, `ep_logs:/workdir/logs`, `ep_rules:/workdir/rules/nilachakra`, `./certs:/cert:ro`, `updates_data:/updates`
- **Env:** `MODE=manager`, `LOG_LEVEL=200`, `GIN_MODE=release`
- **Memory limit:** 2048 MB

### Production split (installer):
- `event-processor-worker` — `MODE=worker`, global mode, port 50051
- `event-processor-manager` — `MODE=manager`, placement on manager node, port 8000

---

## 8. Recommended Build Approach

### 8.1 Go Service (Recommended)

**Build a pure Go event processor.** The existing `plugins/` directory is already Go and already implements the wrapper layer. The ThreatWinds binary is the only closed-source component we need to replace.

```
event-processor/
├── main.go
├── server/
│   ├── grpc.go          # gRPC server on :50051 (receives agents)
│   └── http.go          # HTTP server on :8000 (health) + :9002 (module config)
├── pipeline/
│   ├── engine.go        # orchestrates filter → enrich → correlate → write
│   └── queue.go         # 10k-entry channel, batch flush to OpenSearch
├── filters/
│   ├── loader.go        # parse UTMStack YAML pipeline DSL
│   ├── executor.go      # execute step operators
│   └── operators/
│       ├── json.go
│       ├── grok.go      # implement grok pattern tokens
│       ├── rename.go
│       ├── add.go
│       ├── cast.go
│       ├── trim.go
│       ├── drop.go
│       ├── delete.go
│       └── kv.go
├── cel/
│   └── engine.go        # CEL evaluator with custom functions (reuse go-sdk/plugins/cel.go)
├── rules/
│   ├── loader.go        # parse rule YAML
│   └── executor.go      # where eval + afterEvents OpenSearch queries
├── enrichment/
│   ├── geo.go           # MaxMind GeoLite2 for IP → geolocation
│   └── feeds.go         # threat intel IP/domain lookup
├── dedup/
│   └── dedup.go         # 7-day alert dedup cache (Redis or in-memory LRU)
├── writer/
│   ├── events.go        # write to v11-log-{type}-YYYY.MM.DD
│   └── alerts.go        # write to v11-alert-YYYY.MM.DD
└── config/
    └── module.go        # serve /api/v1/modules-config for backend
```

**Why Go (not Logstash wrapper):**
- The filter format is UTMStack's own DSL, not native Logstash — we'd still need to translate it
- The rule format is YAML + CEL — fully implementable in Go
- The existing `plugins/` code is Go and provides reusable building blocks (CEL engine, OpenSearch writer, gRPC server patterns)
- Zero JVM overhead
- Single binary, easy Docker packaging
- The existing go-sdk has the proto definitions and most helpers we need

**Why NOT a Logstash wrapper:**
- Filters aren't Logstash DSL — they'd need full translation
- Logstash doesn't have the correlation/alert engine
- Extra JVM process, complexity, slower startup

### 8.2 Key Reuse from Existing Code

| Source | What to reuse |
|--------|---------------|
| `plugins/inputs/` | gRPC server + auth validation pattern |
| `go-sdk/plugins/cel.go` + `cel_overloads.go` | CEL engine with all custom functions |
| `go-sdk/plugins/events/` | OpenSearch event writer (`FlushInterval: 10s`, `FlushThreshold: 50`) |
| `go-sdk/plugins/alerts/` | Alert construction + dedup logic |
| `plugins/config/` | Rule YAML loader (already uses `gopkg.in/yaml.v3`) |
| `go-sdk/sdkos/` | Index name builder (`BuildCurrentDayIndex("v11", "log", dataType)`) |

---

## 9. Recommended OpenSearch Index Mapping

The current system uses **fully dynamic mapping with 50k field limit** — no static schema. For enterprise-grade SIEM, we should define **explicit mappings** on the index templates to gain:
- Consistent field types (no `text`/`keyword` conflicts across data sources)
- Better query performance (keyword for exact match, text for full-text)
- Proper geo_point type for lat/lon
- Date fields parsed correctly

### Recommended Index Template for `v11-log-*`

```json
{
  "index_patterns": ["v11-log-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.mapping.total_fields.limit": 50000,
      "index.refresh_interval": "5s",
      "index.codec": "best_compression"
    },
    "mappings": {
      "dynamic": true,
      "dynamic_date_formats": ["strict_date_optional_time", "yyyy/MM/dd HH:mm:ss"],
      "properties": {
        "@timestamp":       { "type": "date" },
        "deviceTime":       { "type": "date" },
        "id":               { "type": "keyword" },
        "dataType":         { "type": "keyword" },
        "dataSource":       { "type": "keyword" },
        "tenantId":         { "type": "keyword" },
        "tenantName":       { "type": "keyword" },
        "raw":              { "type": "text", "index": false },
        "action":           { "type": "keyword" },
        "actionResult":     { "type": "keyword" },
        "severity":         { "type": "keyword" },
        "statusCode":       { "type": "integer" },
        "protocol":         { "type": "keyword" },
        "connectionStatus": { "type": "keyword" },
        "origin": {
          "properties": {
            "ip":           { "type": "ip" },
            "port":         { "type": "integer" },
            "host":         { "type": "keyword" },
            "user":         { "type": "keyword" },
            "process":      { "type": "keyword" },
            "command":      { "type": "text", "fields": { "keyword": { "type": "keyword", "ignore_above": 1024 } } },
            "path":         { "type": "keyword" },
            "group":        { "type": "keyword" },
            "bytesSent":    { "type": "long" },
            "bytesReceived": { "type": "long" },
            "geolocation": {
              "properties": {
                "country":     { "type": "keyword" },
                "city":        { "type": "keyword" },
                "countryCode": { "type": "keyword" },
                "asn":         { "type": "keyword" },
                "aso":         { "type": "keyword" },
                "accuracy":    { "type": "integer" },
                "coordinates": { "type": "geo_point" }
              }
            }
          }
        },
        "target": {
          "properties": {
            "ip":     { "type": "ip" },
            "port":   { "type": "integer" },
            "host":   { "type": "keyword" },
            "user":   { "type": "keyword" },
            "domain": { "type": "keyword" },
            "geolocation": { "properties": { /* same as origin.geolocation */ } }
          }
        }
      }
    }
  },
  "priority": 100
}
```

### Recommended Index Template for `v11-alert-*`

```json
{
  "index_patterns": ["v11-alert-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.mapping.total_fields.limit": 10000,
      "index.refresh_interval": "1s",
      "index.codec": "best_compression"
    },
    "mappings": {
      "properties": {
        "@timestamp":    { "type": "date" },
        "id":            { "type": "keyword" },
        "parentId":      { "type": "keyword" },
        "status":        { "type": "integer" },
        "statusLabel":   { "type": "keyword" },
        "isIncident":    { "type": "boolean" },
        "name":          { "type": "keyword" },
        "category":      { "type": "keyword" },
        "technique":     { "type": "keyword" },
        "severity":      { "type": "integer" },
        "severityLabel": { "type": "keyword" },
        "description":   { "type": "text", "index": false },
        "dataType":      { "type": "keyword" },
        "dataSource":    { "type": "keyword" },
        "tenantId":      { "type": "keyword" },
        "impact": {
          "properties": {
            "confidentiality": { "type": "integer" },
            "integrity":       { "type": "integer" },
            "availability":    { "type": "integer" }
          }
        },
        "impactScore":   { "type": "integer" },
        "adversary":     { "type": "object" },
        "target":        { "type": "object" },
        "tags":          { "type": "keyword" },
        "deduplicatedBy":{ "type": "keyword" },
        "groupedBy":     { "type": "keyword" },
        "gpt_classification": { "type": "keyword" },
        "gpt_reasoning":      { "type": "text", "index": false },
        "gpt_next_steps":     { "type": "text", "index": false }
      }
    }
  },
  "priority": 100
}
```

**Key improvements over current dynamic-only schema:**
- `ip` type fields: enables CIDR queries, subnet aggregations natively
- `geo_point`: enables map visualizations and geo-distance queries
- `raw` field: `"index": false` — saves significant storage (raw logs are large strings we never search at the ES level)
- `long` for byte counts: enables range queries, sum aggregations for traffic stats
- Separate 1s refresh on alerts vs 5s on logs: alerts surface in dashboards faster

---

## 10. Enterprise SIEM Feature Recommendations (Splunk/QRadar parity)

### 10.1 Features Already Present
- Log normalization (filters)
- Correlation rules with thresholds and time windows
- Alert deduplication and parent-child grouping
- MITRE ATT&CK tagging
- Geolocation enrichment
- SOC AI triage (LLM classification)
- Compliance control evaluation

### 10.2 Missing Features to Implement in OWN-01

#### A. Flow-Based Offenses (QRadar-style)
QRadar's "offense" model is superior to individual alerts: related alerts auto-aggregate into an ongoing "offense" with a score, timeline, and contributing events. Implement:
- An **Offense engine**: when `groupBy` matches an existing alert, escalate it to an offense rather than creating a new alert
- **Magnitude scoring**: combines severity, frequency, and recency into a single 0-10 score
- **Offense lifecycle**: New → In Progress → Closed, with MTTD/MTTR metrics

#### B. Asset-Aware Correlation (Splunk ES Risk-Based Alerting)
Splunk Enterprise Security's **Risk Based Alerting** assigns risk scores to assets/identities rather than firing raw alerts. Implement:
- A **Risk score index** (`v11-risk-scores`): accumulates per-IP/per-user risk scores from rule matches
- Rule attribute: `riskScore: 20` — instead of immediately creating an alert, add to the asset's running risk score
- **Risk threshold rules**: fire an alert when an asset's accumulated risk exceeds a threshold (e.g., 100 points in 1 hour)
- This dramatically reduces alert fatigue while maintaining detection sensitivity

#### C. Lookup Tables / Reference Data (Splunk lookups)
Both Splunk and QRadar support enrichment via reference data:
- **Allowlists/denylists**: IPs, domains, hashes — evaluated during rule processing
- **Asset tables**: IP → hostname, business unit, criticality tier
- **Identity tables**: username → department, manager, access tier
- **Reference sets** (QRadar): dynamic sets that rules can add to / query
- Store in OpenSearch (`v11-lookup-*` indices), cache in-memory with 5-min TTL

#### D. Statistical Anomaly Detection (Splunk MLTK / QRadar Anomaly Detection)
Current rules are all threshold-based. Add:
- **Baseline learning**: compute rolling average + stddev for metrics (events/hour per user, login locations, data volumes)
- **Dynamic thresholds**: alert when a metric is > 3σ from its 30-day baseline
- **Rare item detection**: alert when a rarely-seen value appears (new country, new process hash)
- Implementation: periodic baseline jobs writing to `v11-baselines-*`, evaluated during correlation

#### E. Event Aggregation (Flow Records)
- **NetFlow/IPFIX aggregation**: bin raw flow records into 5-minute summaries (src/dst pairs, total bytes, packet counts)
- Reduces storage by 95% vs storing raw flows; enables long-term traffic trend analysis
- Write to `v11-flow-summary-YYYY.MM` (monthly rollover, no daily deletion)

#### F. Field-Level Encryption / Data Masking
QRadar supports field obfuscation for PII compliance. Implement:
- Configurable field masking rules: hash or truncate `origin.user`, `email`, etc. before writing to OpenSearch
- Encryption at the index level for compliance data

#### G. Structured Threat Intelligence Integration
Beyond IP/domain feeds:
- **STIX/TAXII** feed consumption: ingest threat intel bundles (IOCs, TTPs, campaigns)
- **VirusTotal / OTX / MISP** integration for hash, IP, domain lookups
- Enrich events with `threatIntel.matched: true`, `threatIntel.source`, `threatIntel.severity`
- Store matches in `v11-threat-intel-matches-*`

#### H. Chain Rules / Multi-Stage Attack Detection
Current correlation handles single-event + threshold. Add:
- **Sequence detection**: Rule A then Rule B within N minutes from same origin
- **Playbook correlation**: MITRE kill-chain stage detection (e.g., Recon → Lateral Movement → Exfiltration pattern)
- Implement as a stateful rule type with `sequence:` instead of `afterEvents:`

#### I. Real-Time Forwarding / SIEM Federation
- **Syslog forwarding**: forward matched events/alerts to upstream SIEM or MSSP (CEF/LEEF format)
- **Kafka output**: publish alerts to Kafka topic for downstream consumers (SOAR, ticketing)
- **Webhook output**: POST alerts to Slack, PagerDuty, Jira, ServiceNow

#### J. Performance & Scalability Features
- **Hot-warm-cold architecture** for OpenSearch: hot (NVMe, 7 days), warm (SSD, 30 days), cold (HDD, 90 days), frozen (S3, 1 year)
- **Index lifecycle management**: current ISM is basic 30-day delete; add warm/cold tiers
- **Adaptive search**: auto-route queries to the appropriate tier
- **Event sampling**: for very high-volume sources (>10k EPS), configurable sampling rate to reduce storage while maintaining detection coverage

#### K. Audit Trail & Chain of Custody
Enterprise SIEMs have tamper-evident audit logs. Implement:
- **Log receipt acknowledgment**: agent receives cryptographic receipt for each submitted batch
- **Index signing**: periodic signing of index contents (or use OpenSearch's audit log feature)
- **Alert action audit**: every status change, assignment, close action timestamped and attributed

---

## 11. Implementation Sequence

| Phase | What | Duration |
|-------|------|----------|
| A ✅ | Understand wire protocol (this document) | 1 week |
| B | Build Go gRPC server + filter executor | 4 weeks |
| C | Rule CEL engine + afterEvents correlation | 2 weeks |
| D | Geolocation + threat intel enrichment | 1 week |
| E | Alert dedup + grouping + OpenSearch writer | 1 week |
| F | Module config HTTP server (replace 9002 API) | 0.5 weeks |
| G | Shadow mode A/B test vs upstream | 2 weeks |
| H | Cutover + Risk-Based Alerting (10.2.B) | 1 week |
| I | Statistical anomaly detection (10.2.D) | 3 weeks |

**Total to parity:** ~8 weeks  
**Total to surpass upstream + enterprise features:** ~12 weeks

---

## 12. Immediate Quick Wins (Before OWN-01 Build Starts)

1. **Pin event-processor version**: change `${UTMSTACK_TAG}` to `v11.2.10` in docker-compose — prevents surprise upstream updates breaking production
2. **Document which `plugins/` are open-source**: the `plugins/` directory IS open-source Go — we can extend it now
3. **Add explicit index mappings**: the recommended mapping in section 9 can be applied today to the existing OpenSearch without touching the event-processor
4. **Implement Risk Score index** (v11-risk-scores): this can be a standalone Go microservice consuming from `v11-alert-*` and maintaining scores — no event-processor changes needed

---

## References

- Filter files: `filters/linux/linux.yml`, `filters/windows/windows-events.yml`, `filters/cisco/asa.yml`
- Rule files: `rules/linux/debian_family/`, `rules/linux/rhel_family/`, `rules/windows/`
- Proto files: `agent-manager/protos/*.proto`, `agent/protos/*.proto`
- Go SDK: `go-sdk/plugins/cel.go`, `go-sdk/plugins/events/queue.go`, `go-sdk/plugins/alerts/main.go`
- Backend: `backend/src/main/java/com/nilachakra/service/logstash_pipeline/UtmLogstashPipelineService.java`
- Backend: `backend/src/main/java/com/nilachakra/service/DefinitionSyncService.java`
- Docker: `local-dev/docker-compose.yml` (lines 197-232)
- Index patterns: `backend/src/main/resources/config/liquibase/scripts/data.sql` (lines 1097-1148)
- Agent log processor: `agent/agent/logprocessor.go`
- Inputs plugin: `plugins/inputs/handlers.go`, `plugins/inputs/auth.go`, `plugins/inputs/output.go`
