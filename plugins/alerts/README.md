# HiveArmor Alerts Plugin

**Plugin ID:** `com.hivearmor.alerts`

The HiveArmor Alerts Plugin is a correlation engine plugin that handles alert deduplication, grouping, and lifecycle management within the HiveArmor SIEM/XDR platform. It consumes alerts produced by the Event Processor, eliminates noise through configurable deduplication, links related alerts into parent-child hierarchies, and persists enriched alert documents to OpenSearch.

---

## Features

- **Alert Deduplication** — Checks incoming alerts against the last seven days of indexed alerts using configurable `DeduplicateBy` fields. Duplicate alerts are silently dropped, keeping the alert queue clean and actionable.
- **Alert Correlation (Grouping)** — When deduplication passes, the plugin searches for an existing root-level alert that matches the incoming alert's `GroupBy` fields. A match causes the new alert to be indexed as a child of the parent, building a traceable alert chain.
- **Status Lifecycle Management** — When a correlated child alert arrives and the parent alert has a status of "Completed" (status 5), the parent is automatically re-opened to "Open" (status 2) so analysts are not left with a silently closed but still-active threat.
- **OpenSearch Integration** — Alert documents are indexed into the daily-partitioned `_v3_hive_alert-YYYY.MM.DD` index following HiveArmor's locked index pattern. Documents carry full metadata: severity, status, references, last event, deduplication fields, and grouping fields.
- **Retry Logic with Exponential Backoff** — All OpenSearch search and indexing operations are retried up to three times (2 s → 4 s → 8 s) before failing, tolerating transient cluster unavailability without dropping alerts.
- **Panic Recovery** — Each processing function wraps its logic in a deferred recover. Panics are captured, logged via the SDK error catcher, and do not terminate the plugin process.

---

## Configuration

The plugin reads its configuration from the `org.opensearch` plugin configuration block. The following fields are required:

| Field      | Description                            |
|------------|----------------------------------------|
| `host`     | OpenSearch cluster hostname or IP      |
| `port`     | OpenSearch cluster port (typically 9200) |
| `user`     | OpenSearch username                    |
| `password` | OpenSearch password                    |

The plugin connects over HTTPS. Ensure the OpenSearch node's TLS certificate is trusted by the host running the plugin.

---

## How It Works

### Initialization

On startup the plugin:

1. Reads the `org.opensearch` configuration block and constructs an HTTPS connection URL.
2. Calls `sdkos.Connect` to establish an authenticated OpenSearch client.
3. Registers itself with the Event Processor correlation bus via `plugins.InitCorrelationPlugin("com.hivearmor.alerts", correlate)`.

If either step fails, the plugin waits five seconds and exits with a non-zero code so the container orchestrator can restart it.

### Correlation Pipeline

Each alert received from the Event Processor passes through the following stages in order:

#### Stage 1 — Deduplication

The `isDuplicate` function queries the `_v3_hive_alert` index pattern across the past seven days. The query is built using the SDK's `BoolBuilder` and filters on:

- `name` (always matched exactly)
- Every field listed in `alert.DeduplicateBy`, using term queries for string, numeric, and boolean values. Array-index notation (e.g. `events.0.field`) is normalised to the flat field path before querying.

If any document is found, the alert is a duplicate and processing stops immediately — no document is indexed, no error is returned.

#### Stage 2 — Parent Alert Lookup

The `getPreviousAlertId` function searches for an existing alert with the same `name` that:

- Matches all fields listed in `alert.GroupBy` (same term-query logic as deduplication).
- Does not have a `parentId` field (i.e., is itself a root/parent alert, not already a child).

The search is retried up to three times with exponential backoff. On success:

- The matched alert's ID is returned as the `parentId` for the new alert.
- `updateParentAlertToOpen` is called in a goroutine to re-open the parent if its status is "Completed".

#### Stage 3 — Alert Indexing

The `newAlert` function constructs an `AlertFields` document containing:

| Field              | Value                                        |
|--------------------|----------------------------------------------|
| `@timestamp`       | Alert timestamp from the Event Processor     |
| `status`           | `1` ("Automatic review")                     |
| `statusLabel`      | `"Automatic review"`                         |
| `severity`         | `1` (low) / `2` (medium) / `3` (high)        |
| `severityLabel`    | `"Low"` / `"Medium"` / `"High"`              |
| `parentId`         | ID of the parent alert, or empty string      |
| `lastEvent`        | Last event in `alert.Events`                 |
| `reference`        | `alert.References`                           |
| `deduplicatedBy`   | `alert.DeduplicateBy`                        |
| `groupedBy`        | `alert.GroupBy`                              |
| All `plugins.Alert` fields | Name, category, description, technique, dataSource, dataType, adversary, target, events, impact, impactScore, errors |

The document is indexed into `_v3_hive_alert-<YYYY.MM.DD>` using `sdkos.IndexDoc`. Indexing is retried up to three times with exponential backoff. If all retries fail, the error is returned to the Event Processor for logging.

### Status Values Reference

| Integer | Label              | Meaning                                              |
|---------|--------------------|------------------------------------------------------|
| `1`     | Automatic review   | Newly created, awaiting analyst triage               |
| `2`     | Open               | Under active investigation                           |
| `5`     | Completed          | Resolved; re-opened to `2` when new child arrives    |

---

## OpenSearch Index Pattern

All alert documents use the HiveArmor version-locked index pattern:

```
_v3_hive_alert-YYYY.MM.DD
```

**Do not change this pattern.** It is consistent across all HiveArmor services and plugins. Changing it requires migrating every existing index and updating every query in every service simultaneously.

---

## Installation

The alerts plugin is deployed as part of the HiveArmor platform. In production it runs as a managed container under the `hivearmor/` (local) or `ghcr.io/hivearmor/` (CI/prod) Docker image namespace and is started automatically by the Event Processor plugin loader.

The Event Processor discovers plugins by binary name. The binary must be named exactly:

```
com.hivearmor.alerts.plugin
```

---

## Building

### Prerequisites

- Go 1.25.5 or later
- Network access to resolve Go module dependencies

### Build

```bash
cd plugins/alerts
go build -o com.hivearmor.alerts.plugin .
```

### Run Tests

```bash
cd plugins/alerts
go test ./...
```

---

## Development

### Local Stack

Start the full HiveArmor local stack before running the plugin in development:

```bash
cd local-dev && docker compose up -d
```

| Service              | URL                      | Credentials              |
|----------------------|--------------------------|--------------------------|
| HiveArmor UI         | http://localhost:3000    | admin / localdev123!     |
| Backend API          | http://localhost:8088    | admin / localdev123!     |
| OpenSearch Dashboards| http://localhost:5601    | admin / LocalDev@2024!   |

### Plugin Registration

The plugin registers under the name `com.hivearmor.alerts`. The Event Processor must be running and reachable for the `InitCorrelationPlugin` call to succeed. Confirm the plugin name matches exactly — the Event Processor loads plugins by this exact identifier.

---

## Dependencies

| Module                                        | Role                                        |
|-----------------------------------------------|---------------------------------------------|
| `github.com/threatwinds/go-sdk`               | Plugin bus, OpenSearch DSL builders, catcher |
| `github.com/tidwall/gjson`                    | JSON field extraction for dedup/groupBy queries |
| `google.golang.org/protobuf`                  | Protobuf message handling for alert structs  |
| `github.com/opensearch-project/opensearch-go/v4` | OpenSearch REST client (indirect)         |

---

## Related Components

| Component         | Role                                                          |
|-------------------|---------------------------------------------------------------|
| `event-processor` | Correlation engine; calls this plugin for every alert it emits |
| `plugins/feeds`   | Threat intelligence feed enrichment, runs before alert indexing |
| `plugins/geolocation` | GeoIP enrichment applied to events before alerting        |
| `backend`         | Java REST API that serves alert data to the HiveArmor UI      |
| `frontend-v2`     | Next.js UI; displays and manages alerts at `/alerts`          |

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)
- Support: support@hivearmor.io
