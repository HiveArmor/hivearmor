# HiveArmor Feeds Plugin — Threat Intelligence Ingestion

```markdown
# HiveArmor Feeds Plugin

**Plugin name:** `com.hivearmor.feeds.plugin`

HiveArmor Feeds is a threat intelligence ingestion plugin for the [HiveArmor](https://github.com/hivearmor) enterprise SIEM/XDR platform. It extracts security entities from HiveArmor incidents and alerts, builds structured associations between those entities, and submits them to the ThreatWinds threat intelligence platform for global correlation and enrichment. The results feed back into HiveArmor's detection pipeline, enabling context-aware alert enrichment at scale.

---

## Overview

Every incident HiveArmor generates is backed by one or more alerts, each carrying a rich set of observable fields — network indicators, file hashes, identity data, email attributes, and more. The Feeds plugin harvests those observables on a recurring schedule, classifies them into typed threat intelligence entities, links related entities by association rules, and delivers the enriched bundle to ThreatWinds for cross-customer correlation.

This creates a closed loop: HiveArmor detects threats, the Feeds plugin contributes those indicators to global threat intelligence, and enriched indicators flow back to sharpen future detections.

---

## How It Works

### Ingestion cycle

The plugin runs an ingestion scheduler with a **5-minute poll interval**. On each cycle:

1. The plugin reads the current ThreatWinds configuration from the HiveArmor backend (`/api/ha-*`). If ThreatWinds is disabled, the cycle is skipped.
2. Recent incidents are fetched from the HiveArmor backend.
3. For each incident, all associated alerts and their underlying OpenSearch events are retrieved.
4. Every event's `origin` and `target` sides are traversed and all observable fields are extracted.
5. Each field is mapped to a typed ThreatWinds entity and enriched with geolocation, severity, data type, and incident/alert/event IDs.
6. An association builder links related entities using origin-to-target, same-event, and cross-event rules.
7. The final entity graph is submitted to the ThreatWinds API.

Each cycle is bounded to 90% of the poll interval to prevent overlap. Graceful shutdown is handled on `SIGINT`/`SIGTERM`.

### Entity extraction

The `FieldExtractor` traverses both `origin` and `target` sides of each event and emits typed `FlattenedField` records for all non-empty observables. The `EntityMapper` then converts those fields into structured ThreatWinds entities with enrichment context.

**Extracted entity categories:**

| Category | Observable types |
|---|---|
| Network | IP, port, hostname, domain, URL, CIDR, MAC address, ASN |
| Certificates and fingerprints | Certificate fingerprint, JA3, JARM, SSH banner, SSH fingerprint |
| Email | Address, subject, body, display name, thread index, X-Mailer, DKIM, DKIM signature |
| WHOIS | Registrant, registrar |
| File | Filename, path, size, MIME type |
| Cryptographic hashes | MD5, SHA-1, SHA-224, SHA-256, SHA-384, SHA-512 and SHA-512/224/256, SHA3-224/256/384/512, authentihash, cdhash, hex, base64 |
| Identity | Username |
| Process | Process name, state, Windows scheduled task, Windows service name and display name |
| Malware | Malware name, family, type |
| Vulnerability | CVE, CPE |
| Cryptographic keys | PGP public key, PGP private key |
| Application | Chrome extension ID, mobile app ID |
| Web | Cookie, Jabber ID |

### Association building

The `AssociationBuilder` groups entities by alert context and evaluates a set of association rules to detect relationships. Three relationship patterns are recognized:

- **Same-event** — entities extracted from the same event within an alert
- **Origin-to-target** — entities linked by their role in network communication (attacker/victim directionality)
- **Cross-event** — entities that appear across multiple events within the same incident

Detected associations are attached to the source entity before submission, giving ThreatWinds a graph rather than a flat list of indicators.

### Enrichment context

Each entity carries structured enrichment metadata:

- HiveArmor incident ID, alert ID, event ID
- Incident severity
- Alert data type and source type (`event.origin` / `event.target`)
- Geolocation: country, city, ASO, latitude/longitude, accuracy radius

---

## Requirements

### HiveArmor platform

- HiveArmor v11.x (Java 17 + Spring Boot 3.3 backend, OpenSearch `_v3_hive_<type>-YYYY.MM.DD` index pattern)
- Plugin runs in `manager` mode — the HiveArmor plugin runtime must be present
- Backend reachable on the configured internal URL; `INTERNAL_KEY` environment variable shared with the backend, agent manager, and event processor

### ThreatWinds credentials

The plugin registers and communicates with ThreatWinds at `https://apis.threatwinds.com` (production) and `https://apis.dev.threatwinds.com` (dev/QA/RC environments).

You need:

| Credential | Description |
|---|---|
| **API Key** | ThreatWinds tenant API key |
| **API Secret** | ThreatWinds tenant API secret |

If credentials are not yet configured in HiveArmor, the plugin performs automatic first-time registration using the admin account email from the HiveArmor system. A valid admin email is required for this path.

---

## Configuration

Plugin configuration is managed by the HiveArmor plugin runtime (`plugins.PluginCfg`). The Feeds plugin reads its runtime configuration from the `com.hivearmor` plugin configuration block.

| Key | Source | Description |
|---|---|---|
| `internalKey` | `com.hivearmor.internalKey` | Shared internal key for backend-to-backend auth |
| `backend` | `com.hivearmor.backend` | HiveArmor backend base URL |
| `env` | `com.hivearmor.env` | Deployment environment (`prod`, `dev`, `qa`, `rc`). Determines which ThreatWinds API endpoint is used |
| `opensearch.host` | `org.opensearch.opensearch.host` | OpenSearch hostname |
| `opensearch.port` | `org.opensearch.opensearch.port` | OpenSearch port |
| `opensearch.user` | `org.opensearch.opensearch.user` | OpenSearch username |
| `opensearch.password` | `org.opensearch.opensearch.password` | OpenSearch password |
| `postgresql.server` | `com.hivearmor.postgresql.server` | PostgreSQL hostname |
| `postgresql.port` | `com.hivearmor.postgresql.port` | PostgreSQL port |
| `postgresql.user` | `com.hivearmor.postgresql.user` | PostgreSQL username |
| `postgresql.password` | `com.hivearmor.postgresql.password` | PostgreSQL password |
| `postgresql.database` | `com.hivearmor.postgresql.database` | PostgreSQL database name |

ThreatWinds API Key and API Secret are stored in HiveArmor's backend configuration and retrieved by the plugin at the start of each ingestion cycle via `GET /api/ha-*`. They can be rotated without restarting the plugin.

---

## Architecture

```
HiveArmor incidents + alerts
        │
        ▼
 IngestionScheduler (5-min poll)
        │
        ├─▶ BackendClient          → fetches recent incidents, alerts, TW config
        │
        ├─▶ FieldExtractor         → traverses event origin/target, emits typed fields
        │
        ├─▶ EntityBuilder          → maps fields → ThreatWinds entities + enrichment ctx
        │
        ├─▶ AssociationBuilder     → links entities by same-event / origin-target / cross-event rules
        │
        └─▶ ThreadWindsClient      → submits entity graph to ThreatWinds API
```

### Package layout

```
plugins/feeds/
├── main.go                            # Plugin entry point, signal handling
├── config/
│   ├── config.go                      # TWConfig — reads plugin runtime config
│   └── const.go                       # ThreatWinds endpoint selection by environment
├── utils/
│   ├── env.go                         # Environment helpers
│   ├── files.go                       # File utilities
│   ├── aes.go                         # AES credential encryption
│   └── retry.go                       # Retry / connection-check utilities
└── internal/
    ├── initializer/
    │   ├── app.go                     # App struct: wires all components
    │   ├── clients.go                 # Constructs backend, OpenSearch, TW clients
    │   ├── pipeline.go                # Wires extractor → builder → scheduler
    │   └── setup.go                   # First-run ThreatWinds credential setup
    ├── scheduler/
    │   └── ingestion_scheduler.go     # Ticker loop, cycle orchestration, timeout guard
    ├── extractor/
    │   └── field_extractor.go         # Event side traversal, FlattenedField emission
    ├── mapper/
    │   └── entity_mapper.go           # Field key → ThreatWinds entity type mapping
    ├── association/
    │   ├── association_builder.go     # Entity graph construction
    │   ├── association_rules.go       # Rule definitions and enablement
    │   └── association_context.go     # Context comparison helpers
    ├── service/
    │   ├── incident_processor.go      # Per-incident orchestration
    │   ├── alert_processor.go         # Per-alert event processing
    │   └── entity_builder.go         # Enrichment context assembly
    ├── client/
    │   ├── backend_client.go          # HiveArmor REST API client
    │   ├── opensearch_client.go       # OpenSearch event retrieval
    │   ├── threadwinds_setup.go       # ThreatWinds registration logic
    │   └── cm_client.go               # CM server client (licensing/config)
    └── models/
        ├── incident.go
        ├── alert.go
        └── event.go
```

---

## Build

The plugin is compiled as part of the standard HiveArmor plugin build pipeline. It requires the `REPLACE_KEY` ldflag for authentication — do not build for production without it.

```bash
cd plugins/feeds
go build -ldflags "-X main.replaceKey=${REPLACE_KEY}" -o com.hivearmor.feeds.plugin .
```

For local development (no key injection required):

```bash
go build -o com.hivearmor.feeds.plugin .
```

The output binary name must be exactly `com.hivearmor.feeds.plugin`. The HiveArmor event processor loads plugins by this name.

---

## Local development

Start the full stack:

```bash
cd local-dev && docker compose up -d
```

The backend API is available at `http://localhost:8088`. Configure ThreatWinds credentials in the HiveArmor UI under **Settings > Integrations > ThreatWinds**, or supply them directly via the backend API using a bearer token:

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

The plugin runs inside the Docker stack in manager mode. To iterate on plugin code locally, build the binary and replace it in the running container, or configure the plugin runtime to load from a local path.

The dev environment points to `https://apis.dev.threatwinds.com`. Any `env` value containing `dev`, `qa`, or `rc` triggers the dev endpoint automatically.

---

## Observability

The plugin emits structured log events via the ThreatWinds `catcher` library at `INFO` and `ERROR` levels. Key log events:

| Event | Fields |
|---|---|
| `ingestion scheduler started` | `poll_interval` |
| `ingestion cycle completed` | `duration_seconds`, `incidents_processed`, `total_entities` |
| `no recent incidents to process` | — |
| `ThreadWinds is disabled, skipping ingestion cycle` | — |
| `cycle timeout or cancellation, stopping` | `processed_incidents`, `total_incidents`, `reason` |
| `association builder initialized` | `total_rules` |
| `ThreadWinds Ingestion Service stopped` | — |

---

## Security

- The plugin runs in-cluster and communicates with the HiveArmor backend using the `INTERNAL_KEY` shared secret (`X-Internal-Key` header). This key is never exposed to browser clients.
- ThreatWinds API credentials are encrypted at rest using AES and stored in HiveArmor's PostgreSQL database. They are fetched over the internal network at the start of each ingestion cycle.
- All OpenSearch queries use the `SearchUtil` DSL builder; no user-controlled input is interpolated into query strings.
- The plugin does not expose any inbound network port.

---

## Support

- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- Support: support@hivearmor.io
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)

HiveArmor v11.x LTS is supported until November 2030.
```