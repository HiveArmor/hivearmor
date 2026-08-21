# HiveArmor raw-event envelope v1

Implemented: **2026-08-18 16:59:20 IST (UTC+05:30)**  
Schema identifier: `ha.raw-event.v1`  
Topic: `hivearmor.raw.events`  
Machine schema: `docs/contracts/schemas/ha-raw-event-v1.schema.json`

## Purpose

The envelope gives the input producer and event processor an explicit, versioned transport contract without changing the existing `plugins.Log` payload used by normalizers and rules. It is the migration boundary for identity-derived tenancy, replay provenance and future schema compatibility.

## Required fields

| Field | Authority | Rule |
|---|---|---|
| `schemaVersion` | Input gateway | Exactly `ha.raw-event.v1`. Unknown versions fail closed. |
| `eventId` | Source/input gateway | Must be non-empty and equal `payload.id`. |
| `tenantId` | Authenticated ingress | Must be non-empty and equal `payload.tenantId`. After `SIEM-003`, this value is derived from verified connector identity; producer-supplied tenants that differ fail closed. |
| `observedAt` | Source | RFC 3339 with nanoseconds accepted; equals `payload.timestamp`. |
| `receivedAt` | Input gateway | Gateway UTC receipt time in RFC 3339 form. |
| `source` | Authenticated ingress | `dataType` and `dataSource` must equal the payload. `connectorType` and `connectorId` are required on new `ha.raw-event.v1` records. |
| `producer` | Input gateway build | Producer name and version are required. Development builds identify themselves as `development`. |
| `traceId` | Gateway/trace context | Optional, bounded trace correlation. Never contains a credential. |
| `payload` | Source/input gateway | Serialized `plugins.Log`, retained for the existing normalization pipeline. |

## Kafka headers

New producers emit:

- `content-type: application/vnd.hivearmor.raw-event+json`
- `ha-schema-version: ha.raw-event.v1`
- `ha-event-id`
- `ha-tenant-id`
- `ha-connector-id`
- `ha-connector-type`
- `ha-producer`

The partition key is `tenantId:connectorId`. Headers and envelope identity values must agree; mismatches are rejected rather than downgraded.

## Compatibility and deprecation

Unwrapped `plugins.Log` Kafka values are **DEPRECATED as of 2026-08-14 11:57:50 IST**. The event processor accepts them only when no schema header is present, validates their minimum identity/source/time fields and emits deprecation telemetry on the first record and every 1,000 records.

Target sunset: **2027-02-14**. Removal requires:

1. all checked-in producers emitting `ha.raw-event.v1` or a declared successor;
2. zero legacy messages throughout the supported retention window and at least two released versions;
3. migration confirmation for external producers;
4. a timestamped contract-register update.

If a producer declares `ha.raw-event.v1` in a header but sends a legacy body, the consumer rejects it as an attempted schema downgrade.

## Validation behavior

- Unknown schema: reject and route to `hivearmor.raw.events.quarantine` with a redacted reason header; commit the original offset only after the quarantine write succeeds.
- Invalid JSON: reject and route to quarantine the same way. If the quarantine write fails, the original offset stays uncommitted.
- Missing/mismatched event, tenant, source or timestamp: reject and quarantine.
- Duplicate delivery: permitted at transport; downstream deterministic persistence under `SIEM-005` provides idempotency.
- Producer tenant values do not establish authorization. `SIEM-003` makes authenticated connector identity authoritative.

Malformed-record quarantine does not replay automatically. `hivearmor.raw.events.retry` is reserved for a later retry budget; write failures currently remain uncommitted so the broker redelivers.

## Current implementation boundary

Implemented now:

- inputs producer emits the v1 envelope and headers;
- Kafka requires all in-sync acknowledgements and automatic topic creation is disabled;
- consumer parses/validates v1, rejects header/body downgrade and accepts validated legacy records with deprecation telemetry;
- producer and consumer unit tests cover success, missing identity, mismatch, legacy compatibility and downgrade rejection;
- after `SIEM-003`, new v1 records require connector type/id, derive tenant from verified identity and use `tenantId:connectorId` keys;
- after `SIEM-004` code, collectors spool to SQLite before the send queue, Kafka has no socket fallback, malformed records go to `hivearmor.raw.events.quarantine`, and raw/quarantine/retry topics pin `max.message.bytes=4194304`.

Not implemented by this contract slice:

- live identity/forged-tenant/rate-limit acceptance against running services;
- collector and cloud-plugin tenant binding;
- broker restart/outage/replay acceptance;
- deterministic datastore processing transaction;
- full schema-registry service or external producer SDK.
