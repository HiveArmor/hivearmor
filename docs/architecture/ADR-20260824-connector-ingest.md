# ADR-20260824 — Connector SDK alert ingest path

**Status:** Accepted  
**Date:** 2026-08-24  
**Context:** P1 Connector SDK (`HaConnector.fetchAlerts` / `normalize`)

## Decision

Normalized connector alerts **must not** be written directly to OpenSearch alert indices by the Connector SDK.

| Allowed now | Forbidden without a new ADR |
|-------------|-------------------------------|
| Dry-run `POST /api/ha-connectors/instances/{id}/fetch-alerts` returning JSON | Writing `v3-hive-alert-*` (or any alert index) from connector code |
| Persist connector instance config/secrets only | Bypassing event-processor correlation / enrichment |
| **PostgreSQL staging queue** `ha_connector_alert_staging` via `POST .../ingest-alerts` or playbook `pull_alerts` | Frontend inventing alert rows from connector payloads |
| Scheduled pull into the same staging table (5 min) | Claiming “alert created in SIEM” without EP proof |

## Chosen interim path (no Kafka)

**Sidecar / raw queue in PostgreSQL** — table `ha_connector_alert_staging`.

Rationale vs alternatives:

- OpenSearch staging index (`v3-hive-connector-staging-*`) would still touch OS write paths and risk pattern drift; PG matches existing HA config/audit storage and needs no new broker.
- Event-processor `/v1/inject` would create real correlation alerts — requires a **follow-up ADR** before connectors may use it.
- No Kafka/Redpanda in this platform.

Auditable APIs:

- `POST /api/ha-connectors/instances/{id}/ingest-alerts`
- `GET /api/ha-connectors/instances/{id}/staged-alerts`
- Playbook action `pull_alerts` / `connector.pull_alerts` → staging persist (`persisted: true`, `destination: ha_connector_alert_staging`)

## Rationale

HiveArmor’s correlation spine is **event-processor → OpenSearch**. AiSOC-style connector pulls are useful for hybrid SOC, but short-circuiting EP would recreate the dual-write / schema-drift problems already called out in platform audits.

## Consequences

- `fetch-alerts` without `persist=true` remains a **preview / dry-run**.
- Ingest responses and playbook `pull_alerts` must say staging was written — **not** that SIEM alerts were created.
- A follow-up ADR is required before any connector→EP bridge (plugin binary, HTTP inject, or topic).

## Related

- `.plan/research/P1-IMPLEMENTATION-PLAN.md`
- `ConnectorAlertIngestService` / `HaConnectorResource` ingest-alerts
- OpenSearch index pattern lock: `v3-hive-<type>-YYYY.MM.DD`
