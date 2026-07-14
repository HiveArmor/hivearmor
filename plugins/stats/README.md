# HiveArmor Stats Plugin

**Plugin name:** `com.hivearmor.stats`  
**Module:** `github.com/hivearmor/plugins/stats`  
**Language:** Go 1.25.5

---

## Overview

The Stats plugin is the platform telemetry component of HiveArmor — Hyper-scale Incident Visibility Engine. It runs as a notification plugin inside the Event Processor pipeline, silently accumulating processing counters and flushing them to OpenSearch on a rolling interval. The resulting data powers the **Administration → Platform Health** dashboard in the HiveArmor UI, giving operators a real-time view of pipeline throughput and drop rates across every log source and data type in the stack.

No user configuration is required. The plugin starts automatically as part of the standard HiveArmor stack.

---

## What It Measures

The plugin subscribes to four internal pipeline topics and counts every event that passes through each stage:

| Topic | What it counts |
|---|---|
| `EnqueueSuccess` | Events accepted into the processing queue (throughput) |
| `ParsingDropped` | Events discarded at the parsing stage |
| `AnalysisDropped` | Events discarded during the analysis/enrichment stage |
| `CorrelationDropped` | Events discarded at the correlation stage |

Each counter is broken down by **data source** (the originating agent or collector) and **data type** (the log category, e.g., `firewall`, `windows`, `syslog`). This lets the platform health dashboard surface per-source drop rates and flag sources that are generating malformed or unrecognized events.

---

## How It Works

1. The Event Processor emits a notification message on one of the four topics for every log event it processes.
2. The Stats plugin receives these notifications via its gRPC notification handler.
3. An in-memory accumulator (sharded across `runtime.NumCPU()` worker goroutines) increments the counter for the `(topic, dataSource, dataType)` key.
4. Every **10 minutes**, the accumulator flushes all accumulated counters to OpenSearch and resets.

Each flushed record has the following shape:

```json
{
  "@timestamp": "2026-07-14T12:00:00.000000000Z",
  "dataSource": "agent-hostname-or-collector-id",
  "dataType":   "windows",
  "count":      4821,
  "type":       "TopicEnqueueSuccess"
}
```

### Retry and resilience

Each OpenSearch write is attempted up to **3 times** with exponential backoff (2 s → 4 s → 8 s). If all retries fail, the error is logged to the platform error stream and the batch is discarded. The accumulator resets regardless, so a transient OpenSearch outage causes a gap in metrics rather than unbounded memory growth.

---

## OpenSearch Index

Records are written to a **monthly rolling index**:

```
_v3_hive_statistics-YYYY.MM
```

Example: `_v3_hive_statistics-2026.07`

The index follows the standard HiveArmor OpenSearch index naming convention (`_v3_hive_<type>-<period>`). Do not rename or restructure this index — the backend queries it by this exact pattern.

---

## Configuration

None required. The plugin reads its OpenSearch connection details from the shared plugin configuration provided by the Event Processor at startup (`org.opensearch` config block). These values are supplied automatically by the HiveArmor stack via environment variables or the platform configuration service.

There are no plugin-specific settings, flags, or config files.

---

## Integration Points

| Component | Interaction |
|---|---|
| **Event Processor** | Delivers notification messages to the plugin over gRPC |
| **OpenSearch** | Receives flushed statistics documents |
| **HiveArmor Backend** | Queries `_v3_hive_statistics-*` to populate the platform health dashboard |
| **HiveArmor UI** | Displays metrics at Administration → Platform Health |

---

## Building

The plugin is built as part of the standard HiveArmor plugin build pipeline. To build manually:

```bash
cd plugins/stats
go build -o com.hivearmor.stats .
```

The resulting binary must be named `com.hivearmor.stats` — the Event Processor loads plugins by this exact name.

> **Note:** The `stats` plugin does not require the `REPLACE_KEY` ldflags injection that the `agent`, `hivearmor-collector`, and `as400` components need. It can be built without additional build-time secrets.

---

## Deployment

The plugin binary is placed alongside the other plugin binaries in the Event Processor's plugin directory. The Event Processor discovers and launches it on startup. In the standard Docker stack this is handled automatically by the `hivearmor/event-processor` container image.

```
# Docker image
hivearmor/event-processor   # local dev
ghcr.io/hivearmor/event-processor  # CI / production
```

---

## Observability

If the plugin fails to connect to OpenSearch at startup, it logs the error and exits with code 1. The Event Processor supervisor will restart it. Indexing failures (after all retries) are logged to the platform error stream and can be viewed in the HiveArmor log viewer under source `plugin_com.hivearmor.stats`.

---

## Support

- **Documentation:** https://docs.hivearmor.io  
- **Support:** support@hivearmor.io  
- **GitHub:** https://github.com/hivearmor  

HiveArmor v11.x LTS is supported until November 2030.
