# ADR-20260824 — Connector staging → SIEM bridge (promote)

**Status:** Accepted (STAGING CANDIDATE)  
**Date:** 2026-08-24  
**Supersedes / follows:** [ADR-20260824-connector-ingest.md](./ADR-20260824-connector-ingest.md)

## Context

Connector pulls already land in PostgreSQL `ha_connector_alert_staging` via
`POST .../ingest-alerts` / playbook `pull_alerts`. That ADR forbids claiming
OpenSearch `v3-hive-alert-*` rows and forbids calling event-processor
`/v1/inject` without a follow-up decision.

Operators need an **auditable, opt-in** path to move staged rows toward the
SIEM data plane without:

- inventing “correlated” customer alerts,
- using the staging-forbidden `/v1/inject` listener,
- introducing Kafka / a new broker (no event-bus ADR for this path).

## Decision

**Chosen path: Backend promote worker (HA spine)**

A Spring service in the Java backend, triggered by **admin-gated REST**
(and an optional scheduled job), promotes `PENDING` staging rows by:

1. Writing a **clearly labeled** document through the existing authenticated
   backend OpenSearch client (`ElasticsearchService.index`).
2. Targeting index type **`connector-promoted`** only:
   `v3-hive-connector-promoted-YYYY.MM.DD`
   (via `HaIndexNames.buildCurrentDayIndex("connector-promoted")`).
3. Updating the staging row to **`PROMOTED`** or **`FAILED`** with promote
   metadata (batch id, timestamp, index name, document id / error).

Documents MUST carry provenance fields such that no UI or API may honestly
treat them as EP-correlated alerts, for example:

| Field | Value |
|-------|--------|
| `ha.document.kind` | `connector_staging_promoted` |
| `ha.correlation.status` | `not_correlated` |
| `ha.provenance` | `connector_staging_bridge` |
| `ha.staging.id` | staging row primary key |

Promote is **not** “alert created in SIEM correlation.” It is “staged vendor
signal published to a dedicated promoted index for audit / downstream use.”

### Explicitly rejected

| Option | Why rejected (this ADR) |
|--------|-------------------------|
| **`POST /v1/inject`** | Staging profile keeps inject disabled; would create real EP correlation alerts and violate ADR-20260824-connector-ingest. |
| **EP plugin consume-from-Postgres** | Higher blast radius (new Go plugin + EP deploy coupling); not needed for a thin staging promote. May be revisited in a later ADR if correlation spine ingest is required. |
| **Write `v3-hive-alert-*`** | Dishonest: implies EP-normalized / correlated alerts. Forbidden. |
| **Kafka / Redpanda topic** | No broker ADR for connector promote; firm “no Kafka without ADR.” |

## APIs

Admin-only (`ROLE_ADMIN`):

- `POST /api/ha-connectors/staged-alerts/promote` — body `{ "ids": [1,2,…] }` (batch)
- `POST /api/ha-connectors/staged-alerts/{id}/promote` — single id convenience

Responses report per-id `PROMOTED` / `FAILED` / skipped, destination index type
`connector-promoted`, and never claim `v3-hive-alert-*` or inject success.

Optional scheduler (property-gated, default off) may promote a small batch of
`PENDING` rows using the same service path.

## Schema

Liquibase **new** changeset only (never edit `20260824006`):

- `status` — `PENDING` \| `PROMOTED` \| `FAILED` (default `PENDING`)
- `promote_batch_id`, `promoted_at`, `promoted_index`, `promoted_doc_id`, `promote_error`

## Consequences

- Staging remains the source of truth until promote; duplicates stay idempotent
  on `(instance, external_id)`.
- Analysts can search `v3-hive-connector-promoted-*` without polluting alert
  triage indices.
- A future ADR is still required before any path that creates true correlated
  alerts (EP inject, EP plugin, or writing `v3-hive-alert-*`).

## Related

- `ConnectorStagingPromoteService` / `HaConnectorResource` promote endpoints
- `ElasticsearchService.index` — authenticated backend OS write path
- OpenSearch index pattern lock: `v3-hive-<type>-YYYY.MM.DD`
- Staging inject gate: event-processor staging profile rejects `/v1/inject`
