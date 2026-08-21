# HiveArmor production-pilot topology and ownership

Recorded: **2026-08-14 11:26:51 IST (UTC+05:30)**  
Status: canonical target for the single-node pilot; deployment implementation remains under `PILOT-07`.

## Trust zones and exposed ports

| Zone | Components | Exposure rule |
|---|---|---|
| Endpoint | Windows/Linux agent | Outbound TLS only to the published enrollment/ingress name. Local spool is service-account restricted. |
| Edge | Reverse proxy, agent ingestion gateway | Only HTTPS UI/API and gRPC agent-ingress ports are host-published. Rate limits and certificate policy apply here. |
| Application | backend, agent-manager, event-processor manager/worker | Private Compose networks only. No direct internet or analyst-browser access. |
| Data | PostgreSQL, OpenSearch, Redpanda | Private data network only. No host-published database, search or broker-console port. |
| Operations | backup/snapshot jobs, metrics collector | Restricted operator network/identity; no public dashboards or test injection. |

Exact host ports and DNS names are installer inputs and must pass preflight. Internal service ports remain those implemented by each component unless a later timestamped decision changes them.

## Service ownership

| Service | Owns | Does not own | Pilot dependency |
|---|---|---|---|
| `frontend-v3` | Analyst presentation, cancellation, bounded client cache | Tenant authorization, authoritative counts, secrets | Reverse proxy/backend |
| Backend | User auth/RBAC, tenant membership, operational APIs, enrollment-token administration, audit | Raw event acceptance, rule execution | PostgreSQL/OpenSearch/agent-manager |
| Agent-manager | Device enrollment state, device identity/revocation, heartbeat/command channel | Tenant selection from producer payload | PostgreSQL/backend trust |
| Inputs plugin | TLS ingress, connector verification, authoritative transport envelope, broker delivery receipt | Normalization, detection, default tenant selection | Agent-manager/backend/Redpanda |
| Redpanda | Durable ordered transport, retention, replay offsets | Normalization or alert correctness | Persistent volume/topic bootstrap |
| Event processor | Parse, normalize, enrich, rule evaluation, processing outcome | User authorization or UI fixture data | Redpanda/OpenSearch/backend internal API |
| OpenSearch | Event/alert/finding projections, search, lifecycle, snapshots | Device credentials or user authentication authority | Protected volumes/PKI/snapshot repository |
| PostgreSQL | Transactional product state, users/tenants, enrollment/device metadata, migrations/backups | High-volume raw event store | Protected volume/backup job |
| Reverse proxy | TLS edge, routing, size/rate limits, security headers | Backend authorization decisions | Operator certificate/DNS configuration |

## Canonical event ownership

- Raw source identity: agent/collector plus ingress authentication.
- Transport identity and received time: inputs plugin.
- Normalized event: event processor with parser/schema provenance.
- Detection result and rule version: event processor.
- Analyst lifecycle state: backend-authorized API and its audit store.
- Search projection: OpenSearch, always constrained by backend-resolved tenant/field authorization.

`docs/contracts/raw-event-envelope-v1.md` is the current raw transport contract. OpenSearch naming remains version-locked; the current code/document difference between `v3-hive-*` builders and the `_v3_hive_*` AGENTS statement requires an explicit migration decision before any rename.

## Canonical data flows

1. Operator creates a tenant/policy-bound one-time enrollment token in the backend.
2. Agent uses protected bootstrap material and receives a device identity from agent-manager.
3. Agent durably spools source records and streams them over verified TLS.
4. Inputs derives scope from identity, builds a versioned envelope and acknowledges only after durable broker acceptance.
5. Event processor consumes, normalizes, evaluates rules and makes the required event/alert outcome durable before committing.
6. Backend authorizes bounded event/alert searches and mutations; frontend-v3 renders explicit freshness and failure states.
7. Lifecycle jobs enforce retention and create tested backups/snapshots.

Steps 1–2 and the stronger guarantees in steps 3–7 are planned in `PILOT-01` onward; they are not implied by this topology document.

## Deprecation inventory

| Legacy surface | State and date | Successor | Removal gate |
|---|---|---|---|
| Unwrapped `plugins.Log` values on `hivearmor.raw.events` | `DEPRECATED` 2026-08-14 11:57:50 IST; telemetry implemented | `ha.raw-event.v1` | Zero use over retention window and two releases; target 2027-02-14. |
| Deployment/CI packaging `frontend-v2` | `REPLACEMENT REQUIRED`; not yet runtime-deprecated | Versioned `frontend-v3` image | `PILOT-07` clean install and compatibility notice. |
| Shared connection-key enrollment | `REPLACEMENT REQUIRED`; security migration needed before deprecation can be enforced | One-time enrollment token/device identity | `PILOT-01` migration and agent upgrade path. |
| Plaintext full agent-key synchronization | `REPLACEMENT REQUIRED` | Verified identity plus bounded revocation state | `PILOT-01/02` authorization tests. |
| Direct engine socket as production ingestion | `COMPATIBILITY ONLY` | Inputs gateway to Redpanda | `PILOT-03/04` outage/replay proof. |
| `/v1/inject` in a production profile | `TEST ONLY` | Real agent/protocol acceptance | Pilot profile proves port disabled/unpublished. |

Only the raw Kafka payload is technically deprecated by this phase. Other rows remain replacement-required until a working successor and migration lifecycle exist; documentation alone does not make them deprecated.

## Topic ownership

| Topic | Producer | Consumer | Current retention | Pilot action |
|---|---|---|---|---|
| `hivearmor.raw.events` | Inputs and authorized integrations | Event processor | 24 hours in local setup | Versioned envelope, 4 MiB `max.message.bytes`. |
| `hivearmor.raw.events.quarantine` | Event processor parse failures | Operator replay | 7 days in local setup | Redacted reason header; original body preserved. |
| `hivearmor.raw.events.retry` | Reserved for retry budget | Event processor | 24 hours in local setup | Topic exists; write failures currently stay uncommitted. |
| `hivearmor.processed.events` | Intended event processor | Entity graph/other projections | 24 hours | Confirm ownership/use during `PILOT-00` baseline; remove or implement explicitly. |
| `hivearmor.alerts` | Intended detection output | Downstream consumers | 7 days | Confirm whether canonical or unused before adding producers. |
| `hivearmor.compliance.evidence` | Intended compliance producer | Compliance projection | 24 hours | Outside pilot minimum; retain only if an active owner exists. |

## Phase-0 review gate

- Every service and state store has one named owner.
- Only intended edge ports are allowed in the future pilot profile.
- Legacy surfaces have an honest state and successor.
- The raw event schema is machine-readable and tested in producer/consumer code.
- Remaining decisions are recorded rather than silently embedded in Compose.
