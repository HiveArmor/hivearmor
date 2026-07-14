# HiveArmor Events Plugin

**Plugin name:** `com.hivearmor.events.plugin`
**Module:** `github.com/hivearmor/plugins/events`
**Language:** Go 1.25.5
**Part of:** HiveArmor — Hyper-scale Incident Visibility Engine

---

## Overview

The events plugin is an internal infrastructure component of the HiveArmor correlation engine. It acts as the terminal write stage for correlated log events: every event that passes through the event processor's analysis pipeline is handed to this plugin, which serializes it and writes it into OpenSearch for long-term storage, querying, and alerting.

This plugin is not a user-configurable integration. It runs automatically as a managed process inside the HiveArmor stack and requires no operator configuration beyond what the platform provides at startup.

---

## Role in the Architecture

```
Log source
  -> Agent / Collector (gRPC)
    -> EventProcessor (YAML rules + filters, CEL expressions, time-window correlation)
      -> [analysis plugins run in parallel]
        -> com.hivearmor.events.plugin   <-- this plugin
          -> OpenSearch (_v3_hive_<type>-YYYY.MM.DD)
```

The event processor loads all plugins by their binary name. When an event completes analysis, it is dispatched to each registered analysis plugin. This plugin receives the event, converts it to JSON, enqueues it in an in-memory channel, and drains the channel through a bulk writer into OpenSearch.

Key responsibilities:

- Receive analyzed events from the correlation engine via the plugin SDK (`plugins.InitAnalysisPlugin`).
- Enqueue events into an in-process channel sized to `100 * runtime.NumCPU()`.
- Spawn `2 * runtime.NumCPU()` goroutines to drain the queue concurrently.
- Build the correct time-partitioned OpenSearch index name from the event's `dataType` field using the locked pattern `_v3_hive_log_<dataType>-YYYY.MM.DD`.
- Write events to OpenSearch via a bulk queue that flushes every 10 seconds or at 50 documents, whichever comes first.
- Block startup until OpenSearch reports a yellow or green cluster health status, with up to 30 retry attempts at 5-second intervals.
- Establish a mutually-authenticated TLS connection to OpenSearch using the platform CA certificate at `/cert/ca.crt`.

---

## OpenSearch Index Pattern

Events are indexed using the platform-wide locked pattern:

```
_v3_hive_log_<dataType>-YYYY.MM.DD
```

**Do not change this pattern.** It is shared across every HiveArmor service and every existing index in a deployment. Altering it requires migrating all existing indices and updating all query paths across the backend, event processor, and every plugin.

---

## Configuration

This plugin reads its OpenSearch connection details at startup from the shared plugin configuration key `org.opensearch`:

| Key | Description |
|---|---|
| `opensearch.host` | OpenSearch hostname or IP |
| `opensearch.port` | OpenSearch port (typically `9200`) |
| `opensearch.user` | Basic auth username |
| `opensearch.password` | Basic auth password |

These values are injected by the HiveArmor platform. No manual configuration file is required.

The CA certificate for TLS validation is read from `/cert/ca.crt`. If the file is absent or cannot be parsed, the plugin falls back to the default system transport (no custom CA).

---

## Build

```bash
cd plugins/events
go build -o com.hivearmor.events.plugin .
```

The output binary name `com.hivearmor.events.plugin` is required. The event processor discovers and loads plugins by this exact filename. Renaming the binary will cause the plugin to be silently skipped at runtime.

No ldflags are required for this plugin. (The `agent`, `hivearmor-collector`, and `as400` components require `REPLACE_KEY` ldflags — this plugin does not.)

---

## Tests

```bash
go test ./...
```

The test suite covers the OpenSearch startup health-check behavior:

- `TestWaitForOpenSearch_SucceedsWhenHealthy` — verifies the writer starts immediately when OpenSearch responds 200.
- `TestWaitForOpenSearch_FailsAfterMaxRetries` — verifies a fatal error is returned after all retry attempts are exhausted.
- `TestWaitForOpenSearch_RetriesOnTransientFailure` — verifies the writer correctly retries on transient 503 responses and succeeds once the cluster recovers.

---

## Operational Notes

**Startup behavior.** The plugin will not accept any events until the OpenSearch cluster health endpoint returns a yellow or green status. If OpenSearch is not available after 30 attempts (2.5 minutes), the plugin exits with a fatal error. The event processor will restart it according to its supervision policy.

**Backpressure.** The in-process event channel has a fixed capacity of `100 * runtime.NumCPU()`. If the channel fills faster than the bulk writer can drain it (e.g., during an OpenSearch slowdown), new events are dropped and an error is logged. This is a deliberate load-shedding decision — the correlation engine pipeline must not block on writer saturation.

**Bulk flush.** Events are written to OpenSearch in bulk batches. A batch is flushed when either 50 documents have accumulated or 10 seconds have elapsed since the last flush. Bulk writes are not retried on failure (`MaxRetries: 0`); failed writes are logged and discarded to prevent unbounded memory growth.

**TLS.** Communication with OpenSearch uses HTTPS with the HiveArmor internal CA. The CA certificate is expected at `/cert/ca.crt`, which is bind-mounted by the platform's Docker Compose and Kubernetes configurations.

---

## Dependencies

| Dependency | Purpose |
|---|---|
| `github.com/threatwinds/go-sdk` | Plugin SDK — gRPC analysis plugin lifecycle, config, OpenSearch bulk writer |
| `github.com/tidwall/gjson` | Fast JSON field extraction for `dataType` and `id` from event payloads |

---

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor
