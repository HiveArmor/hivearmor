# Backend implementation ledger

Created: **2026-08-14 11:26:51 IST (UTC+05:30)**  
Active program: production-minimum single-node SIEM pilot  
Status rule: update this table after every implementation phase; never infer completion from UI presence.

## Status vocabulary

- `PLANNED`: requirement is scoped; no implementation claim.
- `IN PROGRESS`: the current implementation phase; only one phase may have this state.
- `CODE COMPLETE`: implementation and focused tests pass, but live acceptance is pending.
- `LIVE VERIFIED`: acceptance passed against running production-shaped services.
- `BLOCKED`: a named external dependency or decision prevents progress.
- `DEFERRED`: explicitly outside the pilot scope.

## Program ledger

| Work ID | Contract IDs | Deliverable | Status | Implementation evidence | Live evidence | Last updated |
|---|---|---|---|---|---|---|
| PILOT-00 | SIEM-001, SIEM-004, SIEM-010 | Canonical topology, event envelope, ownership, deprecations and baseline | `CODE COMPLETE` | `ha.raw-event.v1` producer/consumer, schema/header/cross-field validation, `acks=all`, tenant/source key, legacy counter and focused/full Go tests; canonical topology, deprecation policy and threat model | None; broker/container acceptance intentionally remains for later outage/replay and release gates | 2026-08-14 11:57:50 IST |
| PILOT-01 | SIEM-002 | Tenant-bound one-time enrollment and device credential lifecycle | `CODE COMPLETE` | Backend/admin REST and gRPC contracts, tenant-bound hash-only enrollment persistence, atomic consumption, opaque agent UUID, hashed rotatable/revocable device credential, protected file/stdin bootstrap/rotation, authenticated owner-only atomic local credential envelope, default-disabled legacy enrollment, redacted DTO diagnostics, manager-authoritative bounds, explicit Admin/SOC Manager authorization, no update credential echo, authorized post-revocation replacement, and same-transaction allowlisted audit events are implemented. PostgreSQL rejects audit updates/deletes; the safe audit list is tenant-scoped, bounded and secret-free. Enrollment and tenant-filter failures now preserve their RFC status/detail without `/error` redispatch, and problem extensions serialize once. Full/race/vet Go checks, focused Java/package/images, four-platform cross-builds and package inspection pass. Checked-in real-host acceptance assets now exist at `agent/release/PILOT-01-PACKAGED-HOST-ACCEPTANCE.md`, `agent/release/verify-packaged-linux.sh` and `agent/release/verify-packaged-windows.ps1`; they standardize package install/service/rotation/revoke/role evidence capture but are not themselves live host proof. Remaining Windows SCM/Linux systemd execution, packaged-host role/cross-tenant evidence and audit retention/export are tracked under `PILOT-09` / `SIEM-010` / `SIEM-009`. | At 2026-08-18 13:37:18 IST rebuilt services were healthy. Live one-use concurrent enrollment produced exactly one winner; replay, forged ID, old rotated key and revoked key were denied; authorized same-device replacement and reconnect succeeded; required audit events were returned without sensitive fields. The local authenticated REST bounds/tenant matrix passed with intended 201/200/400/404/401 statuses. Real Windows SCM/Linux systemd acceptance and authenticated role/cross-tenant packaged-host acceptance remain open. | 2026-08-18 16:59:20 IST |
| PILOT-02 | SIEM-003 | Identity-derived tenant/source authorization and bounded ingress | `LIVE VERIFIED` | `VerifyConnectorIdentity` and bounded secret-free `ListConnectorAuthorization` replace plaintext 100,000-row key sync. Inputs bind tenant from verified agent identity, reject forged/missing/revoked/unbound identity, cap messages at 4 MiB, apply per-connector/tenant rate and connection limits with Retry-After, and key Kafka records as `tenantId:connectorId`. Collector inventory no longer returns secrets. Focused agent-manager, inputs and consumer tests plus race/vet pass. | At 2026-08-18 19:55:01 IST `local-dev/tests/pilot-live-ingress.sh` passed against rebuilt agent-manager and event-processor images: enrolled ProcessLog ack, forged tenant denied, oversized payload rejected, burst `ResourceExhausted` with retry-after, revoked credential denied after projection, enrollment token absent from worker logs. OpenSearch counted the accepted event id. Collector tenant binding, cloud-plugin identity and device mTLS remain open. | 2026-08-18 19:55:01 IST |
| PILOT-03 | SIEM-004 | Durable agent spool, broker delivery, retry, quarantine and replay | `LIVE VERIFIED` (local-dev broker-outage + agent SQLite spool) | Agent collectors call `Offer` which writes SQLite before the memory queue; unprocessed rows are not reclaimed to free quota; default retention is 512 MB; Kafka publish retries with backoff and does not fall back to the engine socket; parse failures publish to `hivearmor.raw.events.quarantine` with a redacted reason and commit only after that write; quarantine messages omit Topic because the dedicated writer already has one; raw/quarantine/retry topics pin `max.message.bytes=4194304`. Unprocessed retry now runs every 15s independent of 10-minute retention reclaim. Focused agent, inputs and consumer tests plus race/vet pass. | At 2026-08-18 19:55:01 IST an unsupported schema record appeared on `hivearmor.raw.events.quarantine`; worker restart left raw.events end offset unchanged; the quarantine record survived eventprocessor restart. At 2026-08-18 22:14:41 IST `local-dev/tests/pilot-broker-outage.sh` enrolled a linux ProcessLog identity, `Offer` persisted event `5603b518-bea7-4b31-b157-538c1ff7dc44` unprocessed while Redpanda was stopped (no ack, no OpenSearch document, `LogsDropped=0`), then after restore the same spool row was acked and indexed to `v3-hive-log-acme-2026.08.18`. This is not a packaged systemd agent. `hivearmor-collector`/`as400` drop-on-full, encrypted spool and a write-failure retry budget remain open. | 2026-08-18 22:14:41 IST |
| PILOT-04 | SIEM-005 | Deterministic processing outcome, idempotent storage and commit boundary | `CODE COMPLETE` | Typed `ProcessingOutcome`; `Analyze` has no durable writes; Kafka/socket commit/ack only after `PersistRequired` (sync event + required alerts); classified alert writer errors; deterministic alert IDs; crash-point fake-store tests. Optional offense/compliance/sequence after persist. | No live detect-to-alert on a staging VM in this slice | 2026-08-18 20:40:00 IST |
| PILOT-05 | SIEM-006, DET-ING-001 | Supported Windows/Linux telemetry and tested pilot detection pack | `CODE COMPLETE` | CEL pack `PILOT-WIN-PS-ENCODED` / `PILOT-WIN-FAILED-LOGON` / `PILOT-LIN-AUTH-FAIL` with positive/negative tests; compile-at-start skip of invalid YAML; health degraded when the pack is missing from a `pilot/` tree; telemetry matrix checked in. | No enrolled-agent UI proof in this slice; `DET-ING-001` remains lab injection | 2026-08-18 20:40:00 IST |
| PILOT-06 | SIEM-007 | TLS, secret storage, non-root images and supply-chain release controls | `CODE COMPLETE` (subset) | Event-processor and `sdk/os` OpenSearch clients verify TLS; `HA_PROFILE=staging|production` rejects lab secrets; `/v1/inject` disabled on staging. Device mTLS, non-root images, SBOM remain later. | No staging VM TLS handshake proof beyond unit tests | 2026-08-18 20:40:00 IST |
| PILOT-07 | SIEM-008 | Versioned frontend-v3 single-node installer, upgrade and rollback | `CODE COMPLETE` | `frontend-v3` production Dockerfile + nginx; `deploy/staging/docker-compose.yml` publishes 443/50051/9000 only; inject off; manager-only Kafka. `docker compose config` validated. | No clean VM install; label is `STAGING CANDIDATE` artifacts, not live install | 2026-08-18 20:40:00 IST |
| PILOT-08 | SIEM-009 | Retention, backup/restore, observability, capacity and operator runbooks | `LIVE VERIFIED` (throwaway restore + off-volume copy + named Redpanda + ISM + MinIO Object Lock; not new-VM / not AWS Glacier) | Enrollment-audit NDJSON export; `run-siem009-backup-restore.sh`; daily `hivearmor-backup.timer`; capacity bytes; Redpanda `redpanda_data`; ISM `ha-hot-retention`; `run-siem009-worm-object-lock.sh` | Staging 2026-08-21 15:50:00 IST: MinIO COMPLIANCE Object Lock deny locked-version delete. Prior: named Redpanda; offhost; ISM; throwaway restore. 24h soak pack PARTIAL; AWS S3 WORM and new-VM restore remain open | 2026-08-21 15:50:00 IST |
| PILOT-09 | SIEM-010 | Complete automated and real-agent pilot release gate | `PLANNED` | Prerequisite subset landed during PILOT-01: reproducible Linux/Windows package assembly, internal/external checksums, provenance attestation and production signing fail-closed behavior. The comprehensive gate remains planned. | Local package contents inspected; no signed CI artifact, real-OS service install, outage/soak/restore or release-manifest acceptance yet. | 2026-08-18 13:11:42 IST |

## Existing evidence retained

| Evidence | State | Limitation |
|---|---|---|
| `DET-ING-001` raw PowerShell ETW to normalized event and real alert | `LIVE VERIFIED` | Uses authenticated local injection rather than a real endpoint agent. |
| `DET-ING-002` raw records to alerts and canonical correlated finding | `LIVE VERIFIED` | Does not prove agent enrollment, agent outage recovery or production deployment. |
| Agent local SQLite unprocessed-log record and retry scan | `LIVE VERIFIED` (local-dev) | Endpoint collectors spool before queue send; default retention is 512 MB; unprocessed rows are not deleted to reclaim quota. Retry of unprocessed rows is every 15s. `hivearmor-collector` and `as400` still drop on full memory queues. Packaged-host agent-process spool remains open. |
| Kafka manual offset commit after synchronous event write | `CODE COMPLETE` | Commit requires event **and** required alerts. Duplicate async+sync event write removed from the Kafka path. Optional enrichments remain after persist. Live OpenSearch crash injection was not run. |

## Deprecated or replacement-required surfaces

Only surfaces with an explicit timestamp and successor are deprecated. The other entries remain replacement-required candidates and must not be described as deprecated merely by appearing here.

| Surface | Reason | Intended successor |
|---|---|---|
| Unwrapped `plugins.Log` on `hivearmor.raw.events` — `DEPRECATED` 2026-08-14 11:57:50 IST, target sunset 2027-02-14 | Lacks transport schema, producer and independently validated tenant/event/source identity. | `ha.raw-event.v1`; removal requires zero measured legacy traffic and replay/outage acceptance. |
| Production/deployment references to `frontend-v2` | Active UI is `frontend-v3`; current packaging is stale. | Versioned `frontend-v3` production image and canonical pilot profile. |
| Installer manager/worker path without Redpanda topics | Does not represent the current durable raw-event architecture. | Canonical Redpanda-backed composition. |
| Shared connection-key agent enrollment — `DEPRECATED` 2026-08-14 14:01:07 IST, default disabled; temporary opt-in `ALLOW_LEGACY_AGENT_ENROLLMENT=true` only | Reusable secret, CLI exposure and no tenant/expiry binding. | Tenant-bound one-time hashed enrollment token plus opaque revocable device identity. Remove the opt-in only after supported installer migration and real-agent acceptance. |
| Plaintext agent-key list synchronization — `DEPRECATED` 2026-08-18 16:16:32 IST | Leaked the complete credential authority to the input worker through unbounded `ListAgents`/`ListCollector` pages. | `VerifyConnectorIdentity` plus bounded secret-free `ListConnectorAuthorization`; inputs verify presented secrets and cache identity, not plaintext keys. |
| Legacy direct engine socket as production ingress | Bypasses the canonical broker durability and replay controls. | Authenticated input gateway to versioned raw-event topic. |
| Test `/v1/inject` in production profile | Test-only bypass boundary. | Real protocol/agent acceptance in isolated test profiles. |

## Update template

When a work item changes, update its row and append to `validation-evidence.md`:

```text
Timestamp:
Work ID / contracts:
Files/migrations changed:
Automated commands and outcomes:
Running environment and live IDs:
Security/tenant/failure cases verified:
Remaining limitation:
```
