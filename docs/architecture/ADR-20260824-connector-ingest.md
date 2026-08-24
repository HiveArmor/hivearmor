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
| Future: enqueue to an approved ingest adapter (agent/collector/EP plugin) | Frontend inventing alert rows from connector payloads |

## Rationale

HiveArmor’s correlation spine is **event-processor → OpenSearch**. AiSOC-style connector pulls are useful for hybrid SOC, but short-circuiting EP would recreate the dual-write / schema-drift problems already called out in platform audits.

## Consequences

- `fetchAlerts` is intentionally a **preview / dry-run** until an ingest adapter exists.
- Playbook steps may call connector `test` / dry-run `pull_alerts` for automation checks; they must not claim “alert created in SIEM” unless EP ingest is proven.
- A follow-up ADR is required before any connector→EP bridge (plugin binary, HTTP ingest, or Redpanda topic).

## Related

- `.plan/research/P1-IMPLEMENTATION-PLAN.md`
- `HaConnectorResource` fetch-alerts `persisted: false`
- OpenSearch index pattern lock: `v3-hive-<type>-YYYY.MM.DD`
