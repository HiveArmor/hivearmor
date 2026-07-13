# HiveArmor — Parser / Filter Authoring Guide

**Audience:** Security Engineers, Integration Developers  
**Version:** v1.x

---

## Table of Contents

1. [Overview](#1-overview)
2. [How Parsers Work](#2-how-parsers-work)
3. [Filter File Structure](#3-filter-file-structure)
4. [Pipeline Operators Reference](#4-pipeline-operators-reference)
5. [CEL Where-Clause Syntax](#5-cel-where-clause-syntax)
6. [Standard Event Schema (Target Field Names)](#6-standard-event-schema-target-field-names)
7. [Tutorial: Writing a New Parser](#7-tutorial-writing-a-new-parser)
8. [Deploying a Parser](#8-deploying-a-parser)
9. [Testing a Parser](#9-testing-a-parser)
10. [Existing Parser Reference](#10-existing-parser-reference)

---

## 1. Overview

HiveArmor parsers (called **filters** in the codebase) are YAML files that define how raw log bytes are transformed into structured events. They live in the `filters/` directory, organized by log source:

```
filters/
├── windows/        Windows Event Log (WinEventLog)
├── linux/          Linux syslog / journald
├── macos/          macOS unified log
├── cisco/          Cisco ASA, IOS
├── paloalto/       Palo Alto firewall
├── fortinet/       FortiGate
├── pfsense/        pfSense
├── sonicwall/      SonicWall
├── mikrotik/       MikroTik Router
├── sophos/         Sophos Endpoint/XG
├── crowdstrike/    CrowdStrike Falcon
├── suricata/       Suricata NIDS alerts
├── syslog/         Generic syslog fallback
├── json/           Generic JSON (any structured source)
├── aws/            AWS CloudTrail
├── azure/          Azure Activity Log
├── google/         Google Workspace
├── office365/      Microsoft Office 365
├── netflow/        NetFlow v5/v9/IPFIX
├── antivirus/      Generic AV events
├── generic/        Catch-all fallback
└── hivearmor/      Internal platform events
```

---

## 2. How Parsers Work

When the event processor receives a raw log event, it:

1. **Identifies the data type** — the agent or collector tags each event with a `dataType` string (e.g., `linux`, `wineventlog`, `paloalto`)
2. **Selects the pipeline** — finds the filter YAML where `dataTypes` includes that tag
3. **Runs the pipeline steps** in order — each step transforms the event in place
4. **Enriches the event** — adds GeoIP data (latitude, longitude, ASN) to IP fields
5. **Indexes the result** into OpenSearch under `_v3_hive_log-<dataType>-YYYY.MM.DD`

### Field naming convention

All output fields follow dot-notation camelCase paths:
- `log.message` — the primary human-readable log message
- `log.eventId` — numeric event identifier (Windows event ID, etc.)
- `origin.ip` — source IP address
- `origin.user` — source username
- `destination.ip` — destination IP
- `destination.port` — destination port
- `network.protocol` — protocol (tcp, udp, http, etc.)

---

## 3. Filter File Structure

```yaml
# A filter file can define multiple pipelines for different dataTypes

pipeline:
  - dataTypes:       # List of dataType tags this pipeline handles
      - wineventlog
    steps:           # Ordered list of transformation steps
      - json:
          source: raw

      - rename:
          from:
            - log.winlog.event_id
          to: log.eventId

      - lookup:
          field: log.eventId
          map:
            "4625": "failed_login"
            "4624": "successful_login"
          target: log.action
          default: "unknown"
```

---

## 4. Pipeline Operators Reference

### `json`

Parses a JSON string from a source field into structured sub-fields.

```yaml
- json:
    source: raw           # field to parse (default: raw)
    target: log           # root field to write parsed values into (default: log)
    where: 'startsWith("raw", "{")'  # optional: only execute if condition is true
```

### `grok`

Extracts fields using named regex patterns.

```yaml
- grok:
    source: log.message    # field to run patterns against
    patterns:
      - field_name: origin.ip
        pattern: 'src=(?P<ip>\d+\.\d+\.\d+\.\d+)'
      - field_name: log.action
        pattern: 'action=(?P<action>\w+)'
    where: 'exists("log.message")'  # optional condition
```

Built-in pattern aliases:
- `{{.greedy}}` — matches everything (`.+`)
- `{{.ipv4}}` — matches IPv4 addresses
- `{{.number}}` — matches integers

### `rename`

Renames or remaps fields. Supports dot-notation paths.

```yaml
- rename:
    from:
      - log.src_ip
    to: origin.ip
    where: 'exists("log.src_ip")'   # optional
```

Rename multiple fields at once (from/to must have equal length arrays):

```yaml
- rename:
    from:
      - log.source_address
      - log.dest_address
    to:
      - origin.ip
      - destination.ip
```

### `lookup`

Maps a field value to a new value using a dictionary.

```yaml
- lookup:
    field: log.eventId
    map:
      "4625": "failed_login"
      "4624": "successful_login"
      "4634": "logoff"
    target: log.action    # write result to this field
    default: "unknown"    # value if no key matches
```

### `split`

Splits a field value on a delimiter into an array.

```yaml
- split:
    source: log.message
    delimiter: ","
    target: log.fields
```

### `trim`

Removes leading/trailing whitespace from a field value.

```yaml
- trim:
    field: log.message
```

### `lowercase` / `uppercase`

```yaml
- lowercase:
    field: log.action
- uppercase:
    field: log.protocol
```

### `set`

Sets a field to a static value (useful for tagging).

```yaml
- set:
    field: log.category
    value: "authentication"
    where: 'contains("log.action", "login")'
```

### `copy`

Copies a field value to another field.

```yaml
- copy:
    from: log.src_ip
    to: origin.ip
    where: 'exists("log.src_ip")'
```

### `date`

Parses a date string and writes it to a standard timestamp field.

```yaml
- date:
    field: log.timestamp
    formats:
      - "Jan 02 15:04:05"
      - "2006-01-02T15:04:05Z"
    target: "@timestamp"
```

### `where` (inline filtering)

Any step can include a `where` clause to make it conditional. The value is a CEL expression (see [Section 5](#5-cel-where-clause-syntax)).

---

## 5. CEL Where-Clause Syntax

Conditions use the Common Expression Language (CEL) — a simple, safe expression language.

### Functions

| Function | Description | Example |
|---|---|---|
| `exists("field")` | True if field exists and is non-empty | `exists("log.src_ip")` |
| `contains("field", "value")` | True if field value contains substring | `contains("log.message", "Failed password")` |
| `startsWith("field", "value")` | True if field starts with string | `startsWith("raw", "{")` |
| `endsWith("field", "value")` | True if field ends with string | `endsWith("log.file", ".exe")` |
| `regexMatch("field", "pattern")` | True if field matches regex | `regexMatch("log.message", "^Error")` |
| `safe("field", "default")` | Returns field value or default if missing | `safe("origin.ip", "")` |

### Operators

```
&&   — logical AND
||   — logical OR
!    — logical NOT
==   — equals
!=   — not equals
>    — greater than (numbers)
<    — less than (numbers)
```

### Examples

```
# Only process if raw looks like JSON
startsWith("raw", "{")

# Only process if field exists and has a specific value
exists("log.eventId") && log.eventId == "4625"

# Match multiple log message patterns
contains("log.message", "Failed password") || contains("log.message", "authentication failure")

# Process only if source IP is non-empty
safe("origin.ip", "") != ""

# Complex condition
regexMatch("log.message", "sudo:") && contains("log.message", "COMMAND=")
```

---

## 6. Standard Event Schema (Target Field Names)

Always map your source fields to these standard names. This ensures rules and dashboards work correctly.

### Core fields

| Field | Type | Description |
|---|---|---|
| `log.message` | string | Primary human-readable message |
| `log.action` | string | Action performed (login, logout, create, delete, etc.) |
| `log.severity` | string | low / medium / high / critical |
| `log.category` | string | MITRE ATT&CK category |
| `log.technique` | string | MITRE ATT&CK technique ID (e.g., T1110) |
| `@timestamp` | ISO8601 | Event timestamp |
| `log.dataType` | string | Source data type (set by the agent, do not override) |

### Origin (source of the action)

| Field | Type | Description |
|---|---|---|
| `origin.ip` | string | Source IP address |
| `origin.port` | number | Source port |
| `origin.hostname` | string | Source hostname |
| `origin.user` | string | Source username |
| `origin.domain` | string | Source domain |
| `origin.mac` | string | Source MAC address |

### Destination (target of the action)

| Field | Type | Description |
|---|---|---|
| `destination.ip` | string | Destination IP |
| `destination.port` | number | Destination port |
| `destination.hostname` | string | Destination hostname |
| `destination.user` | string | Destination/target username |

### Network

| Field | Type | Description |
|---|---|---|
| `network.protocol` | string | tcp, udp, icmp, http, etc. |
| `network.bytes` | number | Total bytes transferred |
| `network.direction` | string | inbound / outbound |

### Enrichment (added automatically)

| Field | Type | Description |
|---|---|---|
| `origin.geo.country` | string | Country name from GeoIP |
| `origin.geo.lat` | number | Latitude |
| `origin.geo.lon` | number | Longitude |
| `origin.asn` | string | Autonomous system number |
| `origin.aso` | string | Autonomous system organization |

---

## 7. Tutorial: Writing a New Parser

**Goal:** Parse HAProxy access log lines like:
```
192.168.1.5:54321 [15/Jul/2026:10:23:44.123] frontend backend/server1 1/0/2/8/11 200 1024 - - ---- 3/2/1/0/0 0/0 "GET /api/health HTTP/1.1"
```

### Step 1: Create the filter file

```bash
mkdir -p filters/haproxy
touch filters/haproxy/haproxy.yml
```

### Step 2: Write the pipeline

```yaml
# HAProxy access log filter, version 1.0.0
pipeline:
  - dataTypes:
      - haproxy
    steps:
      # Extract fields using grok (named regex)
      - grok:
          source: raw
          patterns:
            - field_name: _client
              pattern: '(?P<ip>\d+\.\d+\.\d+\.\d+):\d+'
            - field_name: log.timestamp
              pattern: '\[(?P<ts>[^\]]+)\]'
            - field_name: log.frontend
              pattern: '\] (?P<fe>\S+) '
            - field_name: log.statusCode
              pattern: ' (?P<code>\d{3}) '
            - field_name: log.bytes
              pattern: ' \d{3} (?P<bytes>\d+) '
            - field_name: _request
              pattern: '"(?P<req>[^"]+)"'

      # Map the extracted client IP to standard schema
      - rename:
          from:
            - _client.ip
          to: origin.ip

      # Parse the HTTP request line
      - grok:
          source: _request.req
          patterns:
            - field_name: network.protocol
              pattern: '(?P<method>GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) '
            - field_name: log.url
              pattern: '(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) (?P<url>\S+)'

      # Map status code to a log action
      - lookup:
          field: log.statusCode
          map:
            "200": "allowed"
            "401": "unauthorized"
            "403": "forbidden"
            "500": "server_error"
          target: log.action
          default: "http_request"

      # Set the human-readable message
      - set:
          field: log.message
          value: "HAProxy request from {{origin.ip}}: {{network.protocol}} {{log.url}} -> {{log.statusCode}}"
```

### Step 3: Test the parser (see Section 9)

### Step 4: Deploy (see Section 8)

---

## 8. Deploying a Parser

### Automatic sync (recommended)

The backend syncs the `filters/` directory to the event processor every 20 seconds. Just commit your filter file:

```bash
# Copy your filter to the filters directory
cp filters/haproxy/haproxy.yml filters/haproxy/haproxy.yml

# The event processor will pick it up within 30 seconds
# Watch the event processor logs to confirm
docker compose logs eventprocessor -f | grep -i "haproxy\|pipeline\|reload"
```

### Manual push

```bash
# Copy directly to the ep_pipeline volume
docker compose cp filters/haproxy/haproxy.yml \
  eventprocessor:/workdir/pipeline/haproxy/haproxy.yml

# Signal the event processor to reload pipelines
curl -X POST http://localhost:8000/reload-pipelines
```

---

## 9. Testing a Parser

### Using the inject endpoint

The event processor exposes a test injection endpoint:

```bash
# Replace INJECT_KEY with the value of EVENTPROCESSOR_INJECT_KEY in .env
curl -X POST http://localhost:8090/v1/inject \
  -H "X-Inject-Key: <INJECT_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataType": "haproxy",
    "raw": "192.168.1.5:54321 [15/Jul/2026:10:23:44.123] frontend backend/server1 200 1024 \"GET /api/health HTTP/1.1\""
  }'
```

The response will include the parsed event fields. Verify that `origin.ip`, `log.action`, etc. are populated correctly.

### Checking OpenSearch

After injecting test data, verify it indexed correctly:

```bash
curl -sk https://localhost:9200/_v3_hive_log-haproxy-*/_search \
  -u "admin:<OPENSEARCH_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"size": 1, "sort": [{"@timestamp": "desc"}]}' \
  | python3 -m json.tool
```

---

## 10. Existing Parser Reference

| Source | Filter file | DataType tag |
|---|---|---|
| Linux syslog / journald | `filters/linux/*.yml` | `linux` |
| Windows Event Log | `filters/windows/windows-events.yml` | `wineventlog` |
| macOS unified log | `filters/macos/*.yml` | `macos` |
| Syslog (generic) | `filters/syslog/syslog-generic.yml` | `syslog` |
| JSON (any source) | `filters/json/*.yml` | `json` |
| Palo Alto | `filters/paloalto/*.yml` | `paloalto` |
| Cisco ASA / IOS | `filters/cisco/*.yml` | `cisco` |
| FortiGate | `filters/fortinet/*.yml` | `fortinet` |
| pfSense | `filters/pfsense/*.yml` | `pfsense` |
| SonicWall | `filters/sonicwall/*.yml` | `sonicwall` |
| MikroTik | `filters/mikrotik/*.yml` | `mikrotik` |
| Sophos | `filters/sophos/*.yml` | `sophos` |
| CrowdStrike | `filters/crowdstrike/*.yml` | `crowdstrike` |
| Bitdefender | `filters/antivirus/*.yml` | `bitdefender` |
| Suricata | `filters/suricata/*.yml` | `suricata` |
| AWS CloudTrail | `filters/aws/*.yml` | `aws` |
| Azure AD | `filters/azure/*.yml` | `azure` |
| Office 365 | `filters/office365/*.yml` | `office365` |
| Google Workspace | `filters/google/*.yml` | `google` |
| NetFlow | `filters/netflow/*.yml` | `netflow` |
| Generic catch-all | `filters/generic/*.yml` | `generic` |
