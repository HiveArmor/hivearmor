# SIEM Comparison: Log Parsing, Correlation Rules, and Admin Self-Service

> Research baseline: adversarially verified claims from primary sources (Splunk, Sentinel, Elastic, Sigma official docs + GitHub repos). QRadar data is from practitioner blogs and PeerSpot reviews — treat as directionally accurate but not adversarially verified. Last updated 2026-07-08.

---

## 1. Platform Overview

| Dimension | Splunk ES | Microsoft Sentinel | Elastic Security | IBM QRadar | **ArmorSight** |
|---|---|---|---|---|---|
| Query language | SPL + `tstats` | KQL | EQL / ES\|QL | AQL (SQL-like) | CEL |
| Normalization schema | CIM (JSON data models) | ASIM (KQL UDFs) | ECS (field map) | QNorm (DSM-based) | Custom YAML |
| Rule format | YAML + SPL (contentctl) | KQL in portal/ARM | YAML + EQL/KQL | CRE GUI conditions | YAML (native) |
| Log parsing mechanism | `props.conf` + `transforms.conf` + TA add-ons | KQL parsers + DCR | Logstash / ingest pipeline | DSM Editor / Log Source Extensions | YAML pipeline operators |
| Analyst-only rule authoring | Partial (ad-hoc SPL in UI, but content library needs contentctl) | Partial (templates only; custom rules need KQL) | Yes, 7-step wizard | Partial (CRE GUI, but complex) | **Yes, via YAML files** |
| Parser authoring without code | No (TA development) | No (KQL required) | No (Logstash config) | Partial (DSM Editor GUI) | **Yes, via YAML pipeline** |
| Hot-reload without restart | No | N/A (cloud) | No | No | **Yes, 30s poll** |

---

## 2. Log Parsing Deep-Dive

### 2.1 Splunk

**Mechanism**: Technology Add-Ons (TAs) contain `props.conf` and `transforms.conf` files.

```ini
# props.conf — tell Splunk which lines belong to this source
[source::...sshd...]
SHOULD_LINEMERGE = false
TIME_FORMAT = %b %d %H:%M:%S
MAX_TIMESTAMP_LOOKAHEAD = 18

# transforms.conf — extract fields via regex
[extract-sshd-fields]
REGEX = sshd.*? from (?P<src_ip>\d+\.\d+\.\d+\.\d+) port (?P<src_port>\d+)
FORMAT = src_ip::$1 src_port::$2
```

- **Normalization**: After extraction, events are mapped to CIM fields (e.g., `src` → CIM `src`) through the TA or manually in the data model
- **CIM data models**: JSON files shipped with the CIM add-on (427K+ downloads), defining field names for each security domain (Authentication, Endpoint, Network Traffic, etc.)
- **`tstats` acceleration**: Queries run against pre-summarized data — fast, but requires the data model acceleration to be configured first
- **Analyst impact**: Writing a new TA requires editing `props.conf`/`transforms.conf` — configuration files that deploy as Splunk apps. Not a UI workflow; requires file editing and app deployment

**Production detection engineering** (Splunk Security Content):
- Detections are YAML files with embedded SPL, validated via `contentctl` CLI tool
- The GitHub repo (`splunk/security_content`) is the canonical source; files like:
  ```yaml
  name: Windows Modify Registry
  search: '| tstats count FROM datamodel=Endpoint.Registry
           where Registry.registry_path=*firewall* ...'
  ```
- Analysts **can** write ad-hoc correlation searches directly in the ES UI without contentctl; contentctl applies to the community content library and private detection pipelines

### 2.2 Microsoft Sentinel / ASIM

**Mechanism**: ASIM (Advanced Security Information Model) parsers are KQL functions stored as workspace functions.

```kql
// Example ASIM DNS parser (KQL)
let DNS_parser = (disabled: bool = false) {
  CommonSecurityLog
  | where not(disabled)
  | where DeviceEventClassID has_any ("dns")
  | extend
      EventType = "Query",
      DnsQuery  = iff(isnotempty(DestinationHostName), DestinationHostName, ""),
      SrcIpAddr = SourceIP
};
```

- **Source-agnostic analytics**: Once a source's ASIM parser is deployed, all rules written against normalized ASIM fields automatically cover the new source — no rule changes needed
- **Analyst impact**: Using pre-built ASIM-normalized analytics rules requires no KQL. But writing a **new** ASIM parser for an unsupported source requires developer-level KQL. Microsoft docs explicitly state: *"You should have at least a basic familiarity with data science and analysis and the Kusto Query Language."*
- **Rule templates**: Microsoft and vendor-authored templates let analysts instantiate rules without writing KQL; the wizard auto-fills all fields

### 2.3 Elastic Security / ECS

**Mechanism**: Elastic Common Schema (ECS) maps source fields at index time, usually via Logstash, ingest pipelines, or Elastic Agent integrations.

```
# Before ECS — analyst must query all these to find one IP:
src:10.42.42.42 OR client_ip:10.42.42.42 OR apache.access.remote_ip:10.42.42.42

# After ECS — single query:
source.ip:10.42.42.42
```

- **ECS field vocabulary**: `event.kind` (8 allowed values: alert, asset, enrichment, event, metric, state, pipeline_error, signal), `event.category`, `event.type`, `event.outcome` — all controlled vocabularies, not free-form
- **Ingest pipeline** (Logstash grok): Described by practitioners as *"main pain point prone to errors that can stall entire pipelines"* — non-developer analysts face friction
- **Analyst impact**: 7-step rule wizard is accessible. But sequence/ordered-event detection requires EQL — a code-like language with SQL-like syntax. No visual builder for EQL sequence rules

### 2.4 IBM QRadar (DSM-based)

> Note: This section is sourced from practitioner blogs and PeerSpot reviews, not adversarially verified official documentation.

**Mechanism**: Device Support Modules (DSMs) handle parsing. QRadar ships DSMs for 450+ log sources. Custom sources use the DSM Editor (GUI) or Log Source Extensions (XML/regex config files).

- **DSM Editor**: GUI-based tool for defining regex field extraction rules against raw log lines — does not require writing code, but requires understanding regex and QRadar's field taxonomy
- **Log Source Extensions**: XML files that override or extend existing DSMs; these are deployed via the QRadar admin UI without server access
- **QNorm fields**: QRadar normalizes events into a fixed schema (sourceIP, destinationIP, username, eventName, etc.) — similar intent to CIM/ECS but less documented as an open standard
- **AQL**: *"If you know SQL, learning AQL takes very little time. The two languages are quite close."* (practitioner). Supports INCIDR() for IP range filtering, BETWEEN, regex matching. SELECT fields FROM events/flows WHERE conditions
- **Analyst impact**: DSM Editor is more accessible than editing conf files, but practitioners report: *"you need some advanced customers in order to use the custom rules"* and *"QRadar lacks a human-friendly query language"*

### 2.5 ArmorSight (YAML Pipeline)

**Mechanism**: YAML pipeline files in `$WORK_DIR/pipeline/filters/` with 10 operator types. Hot-reload every 30 seconds — no restart needed.

```yaml
- id: linux-sshd
  dataTypes:
    - linux
  steps:
    - type: grok
      input: raw
      pattern: "{{.syslogHeader}} sshd\\[{{.pid}}\\]: (?P<message>.*)"
    - type: json
      input: raw
    - type: add
      field: origin.ip
      value: "{{.log.clientIP}}"
      where: 'safe("log.clientIP", "") != ""'
```

Available operators:

| Operator | What it does |
|---|---|
| `json` | Parse JSON string → flat `log.*` fields |
| `grok` | Named-group regex with token patterns (`{{.ipv4}}`, `{{.hostname}}`, etc.) |
| `rename` | Rename field(s) |
| `add` | Set field to literal value (conditional) |
| `cast` | Type-coerce field to int/float |
| `trim` | Strip prefix/suffix from field value |
| `drop` | Discard event if condition matches |
| `delete` | Remove one or more fields from event |
| `kv` | Parse `key=value key2=value2` format |
| `dynamic` | Dispatch to external plugin (geolocation) |

**Analyst impact**: Writing a new parser requires editing a YAML file and dropping it into `$WORK_DIR/pipeline/filters/`. No code, no restart, no deployment — **the most accessible parser authoring model of any platform reviewed**.

---

## 3. Correlation Rules Deep-Dive

### 3.1 Splunk Enterprise Security

Correlation searches are SPL queries that run on a schedule. A minimal example:

```spl
| tstats count FROM datamodel=Authentication
  WHERE Authentication.action=failure
  BY Authentication.src, Authentication.user, _time span=10m
| where count > 5
| eval severity="high", technique="T1110"
```

- **Scheduling**: Ad-hoc in the ES UI (New Correlation Search), or YAML + contentctl for managed libraries
- **Notable events**: Alert output → creates a "notable event" in the ES incident review queue
- **Risk-based alerting**: Risk scores accumulate per entity (src/user) across multiple lower-confidence rules; high aggregate risk triggers a summary notable event. This involves risk modifier searches — a developer-level workflow
- **Analyst UI capability**: Can write SPL correlation searches in the ES UI without developer involvement. The YAML+contentctl pipeline applies to systematic detection engineering at scale

### 3.2 Microsoft Sentinel

Scheduled analytics rules run KQL at configurable intervals (5 min to 14 days):

```kql
let timeframe = 10m;
SecurityEvent
| where EventID == 4625
| summarize FailCount = count() by Account, Computer, bin(TimeGenerated, timeframe)
| where FailCount > 5
| extend severity = "High", technique = "T1110.003"
```

- **Template path**: Analysts browse the Content Hub, select a pre-built template, review the auto-filled wizard, enable — no KQL writing required
- **Custom rule path**: Requires writing KQL in the rule editor — explicitly documented prerequisite
- **ASIM normalization advantage**: Rules written against ASIM fields (e.g., `_Im_Authentication`) automatically cover new sources without rule changes

### 3.3 Elastic Security

The 7-step rule creation wizard supports 7 rule types without backend deployment:

1. **Custom query** — EQL/KQL/Lucene, most flexible
2. **Threshold** — count-based, e.g., >5 failures from same IP in 10 min
3. **Event correlation (EQL)** — sequences of ordered events (requires EQL syntax)
4. **Indicator match** — match against threat intel lists
5. **New terms** — detect first-seen values
6. **ES|QL** — Elasticsearch query language rules
7. **Machine learning** — anomaly detection jobs

Sequence detection (multi-step attack chains) is EQL-only — there is no visual builder for ordered sequences.

### 3.4 IBM QRadar CRE

> Note: From practitioner blogs, not adversarially verified.

The Custom Rules Engine (CRE) uses a **GUI-based condition builder** — conditions appear as readable English clauses:

```
When the event(s) were detected by one or more of these log sources: Firewall
AND the destination IP is NOT one of: RFC1918 private ranges
AND the destination port is one of: C2 common ports (22, 443, 4444, 8080)
AND this condition has been true for more than 3 events in the last 5 minutes

Perform these actions: Create offense | Email notification
```

- No AQL required for threshold/count-based rules in the CRE GUI
- AQL is used for ad-hoc threat hunting and custom rule conditions that need complex filtering
- Building block rules: reusable condition groups that can be referenced in multiple detection rules — similar to Splunk macros
- **Offense management**: Correlated alert that groups related events/flows. QRadar caps at 2,500 simultaneously open offenses — exceeding this limit degrades alert generation
- **Analyst impact**: CRE GUI is more accessible than SPL/KQL for threshold detection. Practitioners report complexity for non-trivial rules still requires advanced experience

### 3.5 ArmorSight (CEL + YAML)

```yaml
- id: 1001
  dataTypes: [linux]
  name: "Linux: Possible SSH Brute Force Attack"
  impact: [adversary, network]
  category: "Credential Access"
  technique: "T1110.003"
  adversary: "{{.origin.ip}}"
  where: 'contains("log.message", "Failed password") && safe("origin.ip", "") != ""'
  correlation:
    - indexPattern: "v11-log-linux-*"
      with:
        - field: "origin.ip"
          operator: filter_match
          value: "{{.origin.ip}}"
        - field: "log.message"
          operator: filter_match
          value: "Failed password"
      within: "10m"
      count: 5
  deduplicateBy: [adversary.ip]
  groupBy: [adversary.ip]
  riskScore: 40
```

CEL WHERE expression syntax for ArmorSight:

| Function | Signature | Example |
|---|---|---|
| `contains` | `contains("field.path", "substring")` | `contains("log.message", "Failed password")` |
| `safe` | `safe("field.path", "default")` | `safe("origin.ip", "") != ""` |
| `exists` | `exists("field.path")` | `exists("log.eventID")` |

**Critical CEL rule**: First argument is always a **string literal gjson path**, never a CEL map access expression. `log["X"]` syntax causes the go-sdk transform to use the field's VALUE as the path — always fails silently.

---

## 4. Admin User Self-Service: What Each Platform Allows

| Action | Splunk ES | Sentinel | Elastic | QRadar | **ArmorSight** |
|---|---|---|---|---|---|
| Create threshold rule (count > N) | Yes (SPL in UI) | Yes (KQL required) | Yes (wizard, no code) | Yes (CRE GUI) | **Yes (YAML)** |
| Create sequence/ordered rule | No (contentctl) | No (KQL required) | No (EQL required) | Partial (CRE GUI) | **Yes (YAML sequence)** |
| Create new log parser | No (TA dev required) | No (KQL required) | No (Logstash config) | Partial (DSM Editor) | **Yes (YAML operators)** |
| Modify existing parser | No | No | No | Partial (DSM Editor) | **Yes (edit YAML)** |
| Hot-reload without restart | No | N/A (cloud) | No | No | **Yes (30s)** |
| Use pre-built rule templates | Yes (ESCU) | Yes (Content Hub) | Yes (prebuilt rules) | Yes (built-in rules) | Roadmap |
| Version control rules | Yes (contentctl) | Yes (ARM/Bicep) | Yes (YAML export) | Limited | **Yes (git-tracked YAML)** |

**ArmorSight advantage**: The YAML-based pipeline and rule format is the most accessible for admin self-service. An admin can write a new parser or rule in ~15 minutes using a text editor, drop the file in the watched directory, and see it active within 30 seconds — no deployment, no restart, no code review required.

---

## 5. Best Practices for Log Parsing

### 5.1 Normalization-First Architecture

All enterprise SIEMs use some form of normalization schema (CIM, ASIM, ECS, OCSF). The pattern is always the same:

1. **Extract** raw fields at ingest (regex, JSON parse, KV parse)
2. **Promote** vendor-specific fields to normalized names (`sourceAddress` → `origin.ip`)
3. **Enrich** with context (geolocation, asset hostname, user identity)
4. **Index** with correct types (IP as `ip`, timestamps as `date`)

Without normalization, every correlation rule must account for all source-specific field names.

### 5.2 Parser Operator Order

Recommended operator sequence in ArmorSight pipeline YAML:

```yaml
steps:
  # 1. Parse structure first
  - type: json      # or grok for unstructured
    input: raw

  # 2. Normalize field names
  - type: rename
    from: [log.src_ip, log.client_addr, log.remote_addr]
    to: origin.ip

  # 3. Enrich with geolocation
  - type: dynamic
    plugin: com.utmstack.geolocation
    input: origin.ip
    output: origin.geo

  # 4. Discard noise last (don't waste steps on events you'll drop)
  - type: drop
    where: 'safe("log.action", "") == "health-check"'
```

### 5.3 Field Type Consistency

ArmorSight stores flat keys (e.g., `"origin.ip"`) AND nested objects (`origin: {ip: ...}`) to support both OpenSearch `match` queries and `keyword` filters. Do not change this dual-storage pattern.

IP fields: use `filter_match` operator in correlation rules, not `filter_term`. The `filter_term` operator appends `.keyword` which breaks IP fields that don't have a keyword sub-field.

### 5.4 Parser Testing Pattern

Before deploying a new parser YAML, test with a direct inject:

```bash
curl -s -X POST http://localhost:8090/v1/inject \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "linux",
    "dataSource": "test-server",
    "tenantID": "default",
    "raw": "Jul  8 12:00:01 server sshd[1234]: Failed password for root from 10.0.0.1 port 22 ssh2"
  }'
```

Then query OpenSearch within 7 seconds (BulkQueue flush interval is 5s):

```bash
curl -sk -u admin:${OPENSEARCH_PASSWORD} \
  "https://localhost:9200/v11-log-linux-*/_search?q=origin.ip:10.0.0.1&size=1" | jq .hits.hits[0]._source
```

---

## 6. Best Practices for Correlation Rules

### 6.1 Rule Design Methodology (Palantir ADS Framework)

Every detection rule should document:
1. **Goal**: What attack behavior is this detecting?
2. **Categorization**: MITRE ATT&CK technique + tactic
3. **Strategy abstract**: The observable evidence (what logs, what fields, what counts)
4. **Technical context**: How the attack works and why this evidence is reliable
5. **Blind spots / assumptions**: What this rule will miss, what it assumes about environment
6. **False positives**: Known benign scenarios that trigger this rule
7. **Response**: What an analyst should do when this fires
8. **Severity**: Impact rating
9. **References**: Threat intel, CVE, blog posts

### 6.2 Correlation Type Selection

| Scenario | Best approach | ArmorSight support |
|---|---|---|
| Count > N in time window | Threshold correlation | `count: N, within: "10m"` |
| Ordered sequence of events | Sequence detection | `sequence:` block |
| Risk accumulation across rules | Risk scoring | `riskScore: N` |
| Unusual volume vs baseline | Anomaly detection | `anomalyDetect: true` |
| IoC match (known bad IP/domain) | Indicator match | Lookup table enrichment |

### 6.3 Timing Pitfalls

**ArmorSight-specific**: The BulkQueue flushes every 5 seconds (or at 500 docs). Correlation queries run immediately after the triggering event is processed — **not** after the BulkQueue flush. This means:

- N events needed for correlation: inject N-1 first, wait 7+ seconds (5s flush + 2s buffer), then inject the Nth event
- The triggering event itself is evaluated from memory (in-process), not from OpenSearch
- All N-1 prior events must be in OpenSearch before the Nth event is processed

### 6.4 Deduplication and Grouping

In ArmorSight rule YAML:
- `deduplicateBy`: Fields that identify a duplicate alert (checked against `v11-alert-*` within 7 days). Use `[adversary.ip]` for brute-force type rules
- `groupBy`: Fields used to aggregate child alerts under a parent offense-type alert (checked within 24h)

These are distinct: dedup prevents re-writing the same alert; groupBy creates parent/child relationships for related incidents.

---

## 7. ArmorSight Roadmap: UI-Based Rule and Parser Authoring

The current YAML-file model is powerful but requires SSH/file access to the server. To enable full admin self-service from the frontend:

### 7.1 Phase 1 — API-Backed Editor (Near-term)

Add REST endpoints to the event processor HTTP server:
- `GET  /api/v1/pipelines` — list all filter YAML files
- `GET  /api/v1/pipelines/{id}` — get single pipeline YAML
- `PUT  /api/v1/pipelines/{id}` — write/update a pipeline YAML (triggers hot-reload)
- `GET  /api/v1/rules` — list all rule YAML files
- `PUT  /api/v1/rules/{id}` — write/update a rule YAML

The existing 30-second hot-reload mechanism means changes take effect within a polling interval — no restart required.

### 7.2 Phase 2 — Structured Rule Builder (Medium-term)

Build a React form in the ArmorSight frontend (Next.js):
- **Parser builder**: Step-by-step form for each operator type with field-autocomplete from the OpenSearch mapping
- **Rule builder**: Name, category, MITRE technique selector, CEL WHERE expression editor (with syntax highlighting and validation), correlation fields (index pattern, filter expressions, count, time window)
- **Test panel**: Paste a sample raw log line → run it through the pipeline in real-time → show extracted fields → show which rules would fire

### 7.3 Phase 3 — Template Marketplace (Long-term)

Similar to Splunk's ESCU content library or Sentinel's Content Hub:
- Community-contributed rule and parser YAMLs with version numbers
- One-click import into the engine's watched directories
- Staged testing: test environment first, then promote to production

### 7.4 Sigma Integration (Strategic)

Sigma is a vendor-neutral YAML detection format with a specification for `temporal_ordered` sequence detection. ArmorSight's CEL+YAML rule format is architecturally compatible with Sigma's model. A `sigma-to-armorsight` transpiler would:
- Accept Sigma rule YAML
- Map `logsource.category` to `dataTypes`
- Translate `detection.selection` field conditions to CEL `where` expressions
- Map `detection.condition` aggregations to `correlation` blocks

This would give ArmorSight access to the entire Sigma detection library (3000+ rules) without manual porting.

---

## 8. Sources

- [Splunk Security Content Repository](https://github.com/splunk/security_content) — contentctl pipeline, YAML+SPL detection format
- [Splunkbase CIM Add-on](https://splunkbase.splunk.com/app/1621) — JSON data model files, field normalization
- [Microsoft Sentinel: Scheduled Rules Overview](https://learn.microsoft.com/en-us/azure/sentinel/scheduled-rules-overview) — KQL prerequisite, run intervals
- [Microsoft Sentinel: ASIM Normalization](https://learn.microsoft.com/en-us/azure/sentinel/normalization) — source-agnostic extension model
- [Elastic Security: Rule Creation UI](https://www.elastic.co/docs/solutions/security/detect-and-alert/using-the-rule-ui) — 7-step wizard, EQL for sequences
- [ECS Getting Started](https://www.elastic.co/guide/en/ecs/current/ecs-getting-started.html) — field unification example, controlled vocabularies
- [OCSF Schema](https://schema.ocsf.io/) — profile overlays, class IDs
- [Sigma Specification](https://github.com/SigmaHQ/sigma-specification) — temporal_ordered correlation type
- [QRadar Rules Engineering (blog)](https://medium.com/@khlifiayoob/qradar-rules-engineering-a-firewall-based-c2-detection-rule-using-threat-intelligence-threshold-4cee8176db2f) — CRE GUI conditions
- [AQL Threat Hunting (blog)](https://aryuksektepe.medium.com/threat-hunting-with-aql-from-reactive-to-proactive-8841c117b957) — AQL syntax, SQL similarity
- [Palantir ADS Framework](https://github.com/palantir/alerting-detection-strategy-framework/blob/master/ADS-Framework.md) — detection rule methodology
