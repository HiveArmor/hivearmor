# 07 — SIEM Data Flow

## End-to-End Data Flow

```
Log Source                  Agent/Collector              Event Processor               OpenSearch            Backend/UI
     │                            │                            │                            │                    │
     │──(syslog/netflow/          │                            │                            │                    │
     │   file/auditd/API)────────▶│                            │                            │                    │
     │                            │──(gRPC TLS)───────────────▶│                            │                    │
     │                            │  LogRequest{               │                            │                    │
     │                            │    dataType,               │                            │                    │
     │                            │    dataSource,             │                            │                    │
     │                            │    log body                │                            │                    │
     │                            │  }                         │                            │                    │
     │                            │                            │ 1. Parse                   │                    │
     │                            │                            │  (filter YAML rules)       │                    │
     │                            │                            │                            │                    │
     │                            │                            │ 2. Enrich                  │                    │
     │                            │                            │  (geolocation, feeds)      │                    │
     │                            │                            │                            │                    │
     │                            │                            │ 3. Correlate               │                    │
     │                            │                            │  (YAML rules)              │                    │
     │                            │                            │  • Check conditions        │                    │
     │                            │                            │  • Check AfterEvents        │                    │
     │                            │                            │  • Impact scoring           │                    │
     │                            │                            │                            │                    │
     │                            │                            │──(HTTPS index)────────────▶│ v11-events-*       │
     │                            │                            │──(HTTPS index)────────────▶│ v11-alert-*        │
     │                            │                            │                            │                    │
     │                            │                            │                            │──(HTTP poll)──────▶│
     │                            │                            │                            │                    │ Query alerts
     │                            │                            │                            │◀──(JSON)──────────│
     │                            │                            │                            │                    │
     │                            │                            │                            │◀──────────────────│ WebSocket STOMP
     │                            │                            │                            │                    │ push to UI
```

---

## Pipeline Stages Detail

### Stage 1: Log Ingestion

**From Agent (endpoint logs)**:
- Agent collects logs from syslog listener, file tail, Netflow UDP, auditd, or platform events
- Logs buffered in local SQLite (retry on network failure)
- Forwarded via gRPC `LogStream` to `com.utmstack.inputs` plugin
- Authentication: `key/id` headers + TLS 1.3

**From Collector (cloud logs)**:
- Collector polls cloud APIs (AWS, Azure, GCP, O365, etc.) on schedule
- Logs buffered in local SQLite
- Forwarded via gRPC to `com.utmstack.inputs` plugin
- Authentication: `collector_key/id` headers + TLS 1.3

**Direct (network devices)**:
- Syslog UDP/TCP → `com.utmstack.inputs` HTTP server (TLS)
- Network devices send directly to the inputs plugin listening port

### Stage 2: Parsing (Filter YAML rules)

**Location**: `plugins/config/` reads filters from PostgreSQL (`utm_logstash_filter`), writes YAML to `workdir/pipeline/filters/`

**Format**: Logstash-compatible YAML filter definitions
- Each integration has its own filter file
- Filters apply field renaming, parsing, normalization
- 25 integration categories, 200+ individual filter files
- Config plugin polls every 30s for changes

**Parsing plugins**: `geolocation`, `aws`, `azure`, `gcp`, `o365`, `bitdefender`, `crowdstrike`, `sophos`, `modules-config` apply specialized field transformations post-parse.

### Stage 3: Enrichment

**Geolocation** (`com.utmstack.geolocation`):
- Source field → lookup in MaxMind-style CSV files (loaded at startup)
- CSV files downloaded from GCS at build time: `asn-blocks-v4.csv`, `asn-blocks-v6.csv`, `blocks-v4.csv`, `blocks-v6.csv`, `locations-en.csv`
- Writes country, city, ASN, lat/lon to destination field

**Threat Intelligence** (`com.utmstack.feeds`):
- ThreatWinds API integration
- Enriches events with threat intelligence matches

### Stage 4: Correlation (YAML Rules)

**Config plugin** reads correlation rules from PostgreSQL (`utm_correlation_rules`), writes YAML to `workdir/rules/utmstack/`

**Rule structure** (YAML):
```yaml
- id: 12345
  dataTypes: ["windows-security"]
  name: "Brute Force Attack"
  category: "authentication"
  technique: "T1110"
  adversary: "..."
  where: "event.code == '4625'"        # Single-event filter
  afterEvents:                          # Temporal correlation
    - indexPattern: "v11-*"
      with:
        - field: "src.ip"
          operator: "=="
          value: "{{src.ip}}"
      within: "5m"
      count: 10
  deduplicateBy: ["src.ip", "name"]    # Dedup window: 7 days
  groupBy: ["src.ip"]                   # Parent-child grouping
  impact:
    confidentiality: 3
    integrity: 2
    availability: 1
  references: ["https://..."]
  description: "..."
  severity: "high"
```

**Rule categories**: antivirus, cisco, cloud, crowdstrike, fortinet, generic, github, ibm, json, linux, macos, mikrotik, netflow, nids, office365, paloalto, pfsense, sonicwall, sophos, suricata, syslog, vmware, windows (23 total)

### Stage 5: Alert Generation (`com.utmstack.alerts`)

1. Check deduplication (7-day window, field-based)
2. Find parent alert for grouping (same name + groupBy fields, no existing parent)
3. If duplicate → drop
4. If grouped → set `parentId`, update parent to "Open" if Completed
5. Index new alert to `v11-alert-YYYY.MM.DD` in OpenSearch
6. Retry logic: up to 3 attempts with exponential backoff

**Alert status lifecycle**:
```
1 = Automatic Review  (new alert, default)
2 = Open              (analyst acknowledged)
3 = In Review         (analyst working)
4 = Ignored           (suppressed)
5 = Completed         (resolved)
```

### Stage 6: Backend Processing (Post-Ingestion)

**Scheduled workers** (run every 30s):
- `UtmAlertTagRuleService` — applies auto-tagging rules to new alerts
- `UtmAlertResponseRuleService` — evaluates SOAR automated response rules, executes playbooks

**SOC AI Analysis**:
- `UtmAlertSocaiProcessingRequestService` queues alert for AI analysis
- Backend posts to `SOC_AI_BASE_URL/api/v1/analyze` via OkHttp
- `com.utmstack.soc-ai` plugin hosts the AI endpoint

---

## Trust Boundaries

```
[EXTERNAL / UNTRUSTED]          [INTERNAL DMZ]              [CORE SERVICES]
  Endpoint agents                 nginx proxy                  Backend (Java)
  Cloud APIs                      Port 443/80                  AgentManager (Go)
  SaaS APIs                                                     EventProcessor (Go)
  Network devices                                               PostgreSQL
  Browser clients                                               OpenSearch
```

| Boundary | Control |
|---|---|
| Internet → nginx | TLS termination, reverse proxy |
| nginx → Backend | Internal HTTP (no TLS in Docker network) |
| Browser → Backend API | JWT in Authorization header |
| Agent → AgentManager | gRPC TLS 1.3 + REPLACE_KEY + key/id auth |
| Backend → AgentManager | gRPC with InsecureTrustManagerFactory (no cert verify) |
| Backend → EventProcessor | HTTP with `X-Internal-Key` header |
| Backend → OpenSearch | HTTPS with basic auth |
| EventProcessor → OpenSearch | HTTPS with basic auth |
| EventProcessor → PostgreSQL | Direct JDBC (no TLS observed) |

---

## Data Residency and Hot/Cold Paths

**Hot path** (real-time, queryable immediately):
- All logs indexed to OpenSearch `v11-*` indices
- Alerts indexed to `v11-alert-*` indices
- No cold/archive tier implemented by default
- ISM policies can configure rollover and deletion (managed via backend API)

**Warm/Cold path**:
- OpenSearch snapshot/restore to backup volumes (`opensearch_backups` volume in docker-compose)
- No automated cold tier — manual ISM policy configuration required

**Statistics**:
- `com.utmstack.stats` writes ingestion statistics every 10 minutes to `v11-statistics-YYYY.MM`

---

## Sensitive Data in the Pipeline

| Data Type | Travels Through | Risk |
|---|---|---|
| Raw log lines | Agent → EventProcessor (gRPC, TLS) | Encrypted in transit |
| Credentials in logs (e.g., failed login attempts) | Agent → EP → OpenSearch | Stored in plaintext in OpenSearch |
| IP addresses | Full pipeline | Stored with geolocation data |
| Hostnames/usernames | Full pipeline | Stored in OpenSearch, queryable |
| Alert details | OpenSearch → Backend → Frontend | JWT-authenticated; no field-level access control |
| TFA codes | Backend memory (Caffeine) | Short-lived, not persisted |
| API keys | PostgreSQL (hashed) | Hash only stored |
| Compliance report data | Backend → web-pdf → Selenium | PDF generated in ephemeral container |
