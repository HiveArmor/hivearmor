# Production-pilot threat model, data classification and secrets inventory

Recorded: **2026-08-14 11:26:51 IST (UTC+05:30)**  
Scope: single-node pilot server, Windows/Linux agents and the raw-event-to-alert path.

## Protected outcomes

1. An event is attributed to the correct tenant and device.
2. An acknowledged event is not silently lost.
3. Stored raw events and alerts preserve integrity and source lineage.
4. Analysts see only authorized tenant/field data.
5. Device, service and user credentials are not exposed through logs, URLs, process arguments, images or support bundles.
6. A compromised agent cannot impersonate another tenant or exhaust the entire platform.
7. Operators can detect, contain and recover from ingestion/storage failure.

## Trust boundaries and primary threats

| Boundary | Threat | Required control / work ID |
|---|---|---|
| Installer to server | Malicious/floating image, leaked configuration, unsafe defaults | Pinned images, signatures/SBOM, protected secret files, preflight and rejection of defaults (`PILOT-06/07`). |
| Agent enrollment | Stolen reusable key, replay, wrong tenant, token in shell history | Hashed one-time token, expiry/use limit, tenant/policy binding, stdin/file bootstrap, immutable audit (`PILOT-01`). |
| Agent to inputs | Device impersonation, TLS interception, oversized/flooded payload | mTLS/device identity, CA/hostname verification, revocation, size/rate/connection limits (`PILOT-01/02/06`). |
| Inputs to broker | Forged tenant metadata, schema downgrade, partial broker acknowledgement | Identity-derived scope, v1 envelope/header cross-check, `RequireAll`, no auto-create (`PILOT-00/02/03`). |
| Broker to processor | Poison record, replay, partition starvation, committed data loss | Bounded retry, DLQ/quarantine, stable key, manual commit after recoverable outcome (`PILOT-03/04`). |
| Processor to OpenSearch | TLS bypass, swallowed write, duplicate/partial outcome | Verified TLS, typed errors, deterministic IDs, processing ledger/outbox (`PILOT-04/06`). |
| Backend/API to datastore | BOLA/BFLA, tenant-filter omission, raw-field leakage | Principal/tenant predicates, field-level security, bounded DTOs, audit and negative tests (`PILOT-06`). |
| Backup/operator path | Unencrypted backup, overprivileged operator, untested restore | Least-privilege backup identity, encryption, retention, audit and restore drill (`PILOT-08`). |
| Raw log to AI/analyst | Prompt injection or malicious displayed content | Treat logs as untrusted, escape output, permission-filter AI context, no autonomous action. AI is outside the pilot gate. |

## Data classification

| Class | Examples | Storage/display rule |
|---|---|---|
| `SECRET` | Enrollment tokens, device private keys, agent compatibility keys, internal keys, DB/OpenSearch credentials, signing keys | Never in event envelopes, logs, URLs, process arguments, handoff or support bundles. Hash or encrypt as designed; redact by default. |
| `RESTRICTED SECURITY TELEMETRY` | Raw events, commands, script blocks, registry paths, usernames, IPs, process/network evidence | Tenant-bound encryption in transit, protected storage, field-level access, audited export, retention/disposal policy. |
| `INTERNAL SECURITY METADATA` | Rule IDs/versions, parser version, health/lag, agent software version, schema version | Authenticated operational access; safe bounded projections. |
| `PUBLIC/RELEASE` | Product version, signed checksums, supported-platform matrix, public ATT&CK references | May be published after release verification. |

## Secrets inventory

This records names and ownership only. Never add actual values.

| Secret/identity | Current consumer | Target source/owner | Rotation/revocation requirement |
|---|---|---|---|
| Operator TLS private key | Reverse proxy/input endpoints | Operator-provided protected file or external secret manager | Certificate renewal with documented reload/restart. |
| Pilot CA trust bundle | Agents/services | Operator PKI | Versioned trust overlap and removal procedure. |
| Enrollment token | Agent bootstrap/agent-manager | Backend token service, hash stored | One time, short expiry, revoke before use. |
| Device private key/certificate | Agent and input verifier | Generated/provisioned device identity | Rotate, revoke and re-enroll without deleting history. |
| Legacy agent key | Agent/agent-manager/inputs | Compatibility store only | Hash/redact, rotate, sunset after certificate migration. |
| `INTERNAL_KEY` | Internal service calls/plugins | Protected runtime secret file | Independent from DB/encryption keys; rotation plan. |
| PostgreSQL service credentials | Backend/agent-manager/jobs | Per-service least-privilege accounts | Rotate without image rebuild. |
| OpenSearch service credentials/certificates | Backend/event processor/jobs | Per-service roles/PKI | Rotate; no universal admin account. |
| Redpanda credentials/certificates | Inputs/event processor/topic bootstrap | Per-service broker identities | Rotate and enforce topic ACLs in later HA tier/pilot where supported. |
| Agent build `REPLACE_KEY` | Agent build/release | CI secret | Never stored in artifact metadata/logs; planned replacement review. |
| Signing keys | Agent/container release | External signing service/HSM where available | Separation of duties, revocation and provenance. |

## Abuse cases required in acceptance

- Reuse an enrollment token after success.
- Enroll with an expired, revoked or wrong-platform token.
- Submit a validly signed event carrying another tenant ID.
- Declare the v1 Kafka header but send a legacy or mismatched body.
- Flood oversized events and exhaust an agent spool/input channel.
- Kill inputs, broker, processor and OpenSearch at each acknowledgement/commit boundary.
- Replay a previously accepted event and verify idempotent event/alert outcomes.
- Revoke a connected agent and verify its stream and future submissions fail.
- Query events/alerts with a user from another tenant and with a role lacking raw-field access.
- Restore backups on a clean server and confirm permissions and lineage survive.

## Residual risk after Phase 0

The versioned envelope prevents silent wire-schema ambiguity and downgrade, but it does not yet make tenant claims trustworthy. The current input handler still supplies the compatibility default tenant and the envelope carries that value. Until `PILOT-01/02` derives it from verified connector identity, real-agent multitenancy remains blocked.
