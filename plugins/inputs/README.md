# HiveArmor — Inputs Plugin

**Plugin name:** `com.hivearmor.inputs.plugin`
**Module:** `github.com/hivearmor/plugins/inputs`
**Language:** Go 1.25.5
**Part of:** [HiveArmor](https://docs.hivearmor.io) — Hyper-scale Incident Visibility Engine

---

## Overview

The Inputs plugin is the primary log ingestion gateway for HiveArmor. Every event that enters the correlation pipeline passes through this plugin first. It authenticates inbound connections, normalises log metadata, wraps each event in the versioned `ha.raw-event.v1` contract, and publishes it to the durable raw-event topic using backpressure-aware delivery. The local Unix-socket path remains a compatibility fallback during the production-pilot migration.

The plugin exposes two authenticated transport endpoints:

| Transport | Address | Purpose |
|---|---|---|
| gRPC TLS 1.3 (streaming) | `:50051` | HiveArmor agents, hivearmor-collector, and other gRPC-capable integrations |
| HTTPS REST | `:8080` | Direct HTTP log submissions and GitHub webhook events |

Both endpoints require a TLS 1.3 connection. Plain-text connections are rejected.

---

## Architecture

```
HiveArmor Agent (gRPC TLS)     ─┐
hivearmor-collector (gRPC TLS)  ├──► Inputs plugin (:50051 / :8080)
Direct HTTP sources             ─┘          │
                                            │  authenticate
                                            │  normalise metadata
                                            │  buffer (per-CPU channel)
                                            ▼
                              Redpanda / Kafka
                              (hivearmor.raw.events)
                                            │
                                            ▼
                              Event Processor consumer
                                            │
                                            ▼
                              Correlation → OpenSearch
                              (_v3_hive_<type>-YYYY.MM.DD)
```

The plugin runs as a worker process inside the Event Processor container. It starts only when the plugin configuration key `plugin_com.hivearmor.inputs.env.mode` is set to `worker`. The Event Processor framework manages lifecycle; the plugin does not need to be started or stopped independently.

---

## Authentication

Three authentication paths are supported, checked in priority order on every inbound connection.

### 1. Agent / collector key (gRPC only)

Each registered agent and collector has a unique key issued by AgentManager. The plugin fetches the full key table from AgentManager over gRPC (TLS, authenticated with `INTERNAL_KEY`) at startup and then refreshes it every 20 seconds. A cache-miss triggers an immediate refresh, rate-limited to once every 2 seconds per connector type, to prevent key-flooding attacks.

gRPC metadata fields required:

| Field | Value |
|---|---|
| `key` | Per-connector secret key |
| `id` | Numeric connector ID |
| `type` | `agent` or `collector` |

### 2. Connection key (gRPC and HTTPS)

The connection key is a shared token fetched from the backend at `GET /api/federation-service/token` using the `Utm-Internal-Key` header. It is cached in memory and re-fetched on every 20-second auth sync cycle.

- **gRPC:** pass in metadata field `connection-key`.
- **HTTPS:** pass in request header `Utm-Connection-Key`.

### 3. Internal key (gRPC only)

Intra-service calls from other HiveArmor components (e.g. the backend or other plugins) may authenticate with the shared `INTERNAL_KEY` by passing it in gRPC metadata field `internal-key`.

### GitHub webhook authentication

`POST /v1/github-webhook` validates the `X-Hub-Signature-256` header using HMAC-SHA256 keyed with the current connection key. Requests with a missing or invalid signature are rejected with `403`.

### Certificate loading

The plugin loads TLS credentials from the path configured in `certsFolder` (plugin config key `com.hivearmor.certsFolder`). Expected filenames are `ha.crt` and `ha.key`. If the files are not present the plugin retries up to three times with exponential back-off (2 s, 4 s, 8 s) before aborting.

---

## Log Delivery Pipeline

1. An authenticated log event is received over gRPC or HTTPS.
2. Missing metadata fields (`id`, `tenant_id`, `data_type`, `data_source`, `timestamp`) are populated with safe defaults.
3. The event is enqueued into an in-memory channel. Channel capacity is `NumCPU * 100`. If the channel is full the plugin returns `503 Service Unavailable` to the caller, which must retry.
4. When `KAFKA_BROKER` is configured, one sender goroutine per CPU validates the normalized record, wraps it in `ha.raw-event.v1`, and publishes it synchronously to `hivearmor.raw.events` with `acks=all`, a 4 MiB batch cap and automatic topic creation disabled.
5. Kafka records are keyed by `tenantId:connectorId` and carry schema, event, tenant, connector, content-type, and producer headers. A success response means the broker accepted the record; it does not mean detection processing has completed.
6. When Kafka is configured it is the only production path. Broker write failures retry with exponential backoff and then return an error so the agent keeps the unprocessed spool row. The local Unix socket is used only when Kafka is not configured; it is not a Kafka fallback.
7. The Event Processor validates the envelope and its cross-field/header invariants before accepting the embedded `plugins.Log`. Malformed records are published to `hivearmor.raw.events.quarantine` with a redacted reason and then the original offset is committed. Unwrapped legacy records are counted and accepted only during the documented deprecation window.

The authoritative envelope and migration policy are documented in [`docs/contracts/raw-event-envelope-v1.md`](../../docs/contracts/raw-event-envelope-v1.md). The machine-readable schema is [`docs/contracts/schemas/ha-raw-event-v1.schema.json`](../../docs/contracts/schemas/ha-raw-event-v1.schema.json).

---

## HTTP Endpoints

All HTTP endpoints require TLS 1.3. Plaintext HTTP is not served.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/logs` | Connection key | Submit a single log event (JSON-encoded `Log` proto) |
| `POST` | `/v1/github-webhook` | HMAC-SHA256 signature | Receive GitHub webhook payloads |
| `GET` | `/v1/ping` | None | Liveness probe — returns `{"ping":"ok"}` |
| `GET` | `/v1/health` | None | Health probe — returns `200 OK` |

### Log submission format (`POST /v1/logs`)

The request body must be a JSON-encoded `plugins.Log` proto message. Compatibility handlers still fill selected missing values before publication:

| Field | Default when absent |
|---|---|
| `id` | New UUID v4 |
| `tenant_id` | Legacy default tenant (compatibility only; secure enrollment must supply the authoritative tenant before a multi-tenant pilot) |
| `data_type` | `generic` |
| `data_source` | `unknown` |
| `timestamp` | Current UTC time (RFC 3339 nanoseconds) |

On success the response is `200 OK` with body `{"last_id": "<uuid>"}`.

---

## gRPC Service

The plugin implements the `Integration` gRPC service defined in the platform SDK. The primary method is `ProcessLog`, a bidirectional streaming RPC.

```
service Integration {
    rpc ProcessLog(stream Log) returns (stream Ack);
}
```

The server listens on `0.0.0.0:50051` with TLS 1.3. Authentication interceptors run on both unary and streaming calls. Maximum inbound message size is 20 MB.

The gRPC health protocol (`grpc.health.v1`) is also registered and reports `SERVING` once the plugin is ready.

---

## Startup Sequence

1. Verify plugin mode is `worker`; exit silently if not.
2. Block until AgentManager reports healthy (gRPC health check, retries every 5 seconds until success).
3. Load TLS certificates (retry up to 3 times with exponential back-off).
4. Initialise `LogAuthService`: fetch agent keys, collector keys, and connection key from AgentManager and backend.
5. Start background auth sync goroutine (20-second ticker).
6. Allocate per-CPU log delivery channels and sender goroutines.
7. Start HTTPS server on `:8080` (background goroutine).
8. Start gRPC server on `:50051` (blocks; this is the main goroutine).

---

## Configuration

The plugin is not user-configurable. All configuration is injected by the Event Processor framework from the shared HiveArmor plugin configuration block (`com.hivearmor`). Relevant keys read at runtime:

| Key | Description |
|---|---|
| `certsFolder` | Path to directory containing `ha.crt` and `ha.key` |
| `agentManager` | AgentManager gRPC address (host:port) |
| `internalKey` | Shared internal key for intra-service calls |
| `backend` | Backend HTTP base URL for connection-key fetch |

The delivery path reads these environment variables directly:

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKER` | unset | Comma-separated broker addresses. Required for the production-pilot durable path. |
| `HIVEARMOR_VERSION` | `development` | Producer version recorded in the raw-event envelope. Release builds must set an immutable version. |
| `INPUTS_SOCKET_SECRET` | `change-me-in-production` | Shared secret for the local engine Unix socket. Must be set in production. |

---

## Throughput and Backpressure

The plugin is designed for high-throughput workloads:

- One sender goroutine per CPU core drains the bounded input channel. Kafka publishing batches up to 100 records with a 5 ms batch timeout while retaining synchronous delivery confirmation.
- The in-memory channel buffer (`NumCPU * 100` slots) absorbs short bursts without blocking callers.
- When the buffer is full the plugin signals the caller to retry (`503` over HTTP; stream error over gRPC). The caller is responsible for retry logic — the plugin does not drop events silently.
- Kafka delivery uses `acks=all`, five attempts, and bounded backoff. A caller can treat success as broker acceptance, not as completed normalization, detection, or indexing.
- The socket compatibility path still waits for an engine `Ack` before returning success.
- Auth key sync is cached in memory with a per-type refresh cooldown, so high connection rates do not generate unbounded RPCs against AgentManager.

---

## Dependencies

| Package | Purpose |
|---|---|
| `github.com/gin-gonic/gin` | HTTP server and routing |
| `google.golang.org/grpc` | gRPC server (inbound from agents) and client (outbound to AgentManager and engine) |
| `github.com/google/uuid` | UUID generation for log IDs |
| `github.com/threatwinds/go-sdk` | HiveArmor plugin SDK: proto types, engine socket client, config, structured error logging |

---

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor
