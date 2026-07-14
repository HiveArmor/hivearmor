# HiveArmor Plugins

HiveArmor plugins are standalone Go binaries that extend the **Event Processor** — the core correlation engine that parses, enriches, and correlates all log data before it is indexed into OpenSearch.

Each plugin runs as a supervised companion process alongside the Event Processor and communicates with it over a Unix-socket gRPC connection (`sockets/engine_server.sock` inside the shared work directory). The Event Processor discovers and loads plugins by binary name, so the naming convention is mandatory.

---

## Naming Convention

Every plugin binary **must** be named:

```
com.hivearmor.<name>.plugin
```

The Event Processor looks up plugins by this exact name. A binary with any other name will not be loaded. Examples:

| Plugin directory | Binary name |
|---|---|
| `alerts/` | `com.hivearmor.alerts.plugin` |
| `geolocation/` | `com.hivearmor.geolocation.plugin` |
| `soc-ai/` | `com.hivearmor.soc-ai.plugin` |
| `compliance-orchestrator/` | `com.hivearmor.compliance-orchestrator.plugin` |

---

## Available Plugins

| Plugin | Directory | Description |
|---|---|---|
| **alerts** | `alerts/` | Correlation and deduplication of alerts; groups related alerts to reduce noise |
| **aws** | `aws/` | Ingests logs from Amazon CloudWatch (CloudTrail, VPC Flow Logs, GuardDuty, and more) |
| **azure** | `azure/` | Ingests logs from Azure Monitor / Log Analytics Workspace |
| **bitdefender** | `bitdefender/` | Receives events from Bitdefender GravityZone Cloud via the event push service |
| **compliance-orchestrator** | `compliance-orchestrator/` | Orchestrates compliance checks and report generation across log sources |
| **config** | `config/` | Keeps detection content (YAML rules, filters, patterns, tenant config) in sync from PostgreSQL to the plugin work directory consumed by the correlation layer |
| **crowdstrike** | `crowdstrike/` | Streams real-time events from CrowdStrike Falcon Event Streams |
| **events** | `events/` | Handles internal platform events and status signals |
| **feeds** | `feeds/` | Threat intelligence ingestion; pulls indicator feeds and makes them available for enrichment |
| **gcp** | `gcp/` | Collects logs from Google Cloud Logging (GCP Cloud Audit, VPC Flow, Security Command Center) |
| **geolocation** | `geolocation/` | GeoIP enrichment; appends country, city, and ASN fields to log events |
| **inputs** | `inputs/` | Authenticates and ingests all logs arriving from HiveArmor Agents and external integrations; the primary ingest gateway |
| **modules-config** | `modules-config/` | Module-level configuration management for integration settings |
| **o365** | `o365/` | Ingests Microsoft Office 365 activity logs (Exchange, SharePoint, Teams, Azure AD) |
| **soc-ai** | `soc-ai/` | AI-powered alert analysis; enriches alerts with natural-language summaries and recommended response steps |
| **sophos** | `sophos/` | Ingests events from Sophos Central (endpoint, firewall, email, ZTNA) |
| **stats** | `stats/` | Collects and exposes internal platform metrics (event throughput, correlation latency, plugin health) |

---

## How Plugins Communicate

All plugins run as companion processes managed by **supervisord** inside the `hivearmor/event-processor` Docker image. Startup is coordinated by `entrypoint.sh`, which waits for the engine Unix socket before launching companions.

```
Event Processor (engine_server.sock)
        |
        | Unix-socket gRPC
        |
   +---------+-----------+-----------+
   |         |           |           |
alerts   geolocation  inputs      stats  ...
```

The socket path is `$WORK_DIR/sockets/engine_server.sock` (permissions `0600`). Plugins use the [ThreatWinds Go SDK](https://github.com/threatwinds/go-sdk) and register themselves with one of the SDK init functions:

| SDK call | Used by |
|---|---|
| `plugins.InitCorrelationPlugin(name, fn)` | `alerts`, `soc-ai` |
| `plugins.InitParsingPlugin(name, fn)` | `geolocation` |
| `plugins.InitNotificationPlugin(name, fn)` | `stats` |

Cloud-integration plugins (aws, azure, gcp, crowdstrike, o365, sophos, bitdefender, feeds) use `plugins.SendLogsFromChannel` to push ingested events into the processing pipeline.

---

## Building a Plugin

Each plugin is a self-contained Go module under its own directory. Build commands follow the standard Go pattern:

```bash
# Build with the required binary name
cd plugins/alerts
go build -o com.hivearmor.alerts.plugin .

# Cross-compile for the container (linux/amd64)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -o com.hivearmor.alerts.plugin .
```

For production Docker builds, plugins are compiled inside the multi-stage `event-processor/Dockerfile` and copied to `/usr/local/bin/` with their canonical names.

See the `README.md` inside each plugin directory for plugin-specific build requirements, environment variables, and integration configuration.

---

## Go Module Paths

All plugin modules follow the path convention:

```
github.com/hivearmor/plugins/<name>
```

The shared `../shared` module is available via `replace` directives where needed. Plugins cannot be built in isolation outside the repository if they depend on `shared`.

---

## Adding a New Plugin

1. Create a directory under `plugins/<name>/`.
2. Initialize a Go module: `go mod init github.com/hivearmor/plugins/<name>`.
3. Add the ThreatWinds Go SDK dependency and call the appropriate `plugins.Init*Plugin("com.hivearmor.<name>", handler)` function from `main()`.
4. Name the output binary `com.hivearmor.<name>.plugin`.
5. Add the plugin to `event-processor/Dockerfile` (build and copy steps) and `event-processor/entrypoint.sh` (`add_companion` call).
6. Follow the [Security Rules](../CLAUDE.md#security-rules-new-code) — any plugin that exposes an HTTP endpoint must use `@PreAuthorize` or an explicit security configuration entry.

---

## Support and Documentation

- Full documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- Support: [support@hivearmor.io](mailto:support@hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)
