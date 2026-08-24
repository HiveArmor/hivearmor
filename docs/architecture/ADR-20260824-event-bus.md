# ADR-20260824 — Event bus for AI worker decoupling

**Status:** Accepted  
**Date:** 2026-08-24  
**Context:** P2 agentic / SOC AI workers (async triage, enrich, investigation steps)

## Decision

HiveArmor **does not** introduce a platform event bus (Kafka, Redpanda topics for app jobs, Redis Streams, RabbitMQ, or equivalent) in this change set.

| Default (required) | Allowed only after a follow-up ADR |
|--------------------|-------------------------------------|
| Correlation spine remains **event-processor → OpenSearch** (`v3-hive-<type>-YYYY.MM.DD`) | Publishing detection/alert side-effects onto a broker as a second source of truth |
| AI / SOC-AI work stays **request/response or backend-scheduled** (HTTP, existing Spring workers, DB job rows) until triggers below are met | Shipping Kafka/Redis/RabbitMQ (or new broker clients) for AI worker queues |
| Pilot Redpanda (if present) is **ingest transport into EP only**, not a general app job bus | Using broker topics to bypass EP correlation / enrichment |

**Kafka (or any broker) for AI workers requires an explicit architecture decision** — this ADR states *when* that decision may be opened; it does **not** authorize implementation.

## When an event bus would be justified

Open a **new** ADR (and implementation plan) only if **all** of the following are true:

1. **Back-pressure / latency** — Synchronous `POST /api/ha-ai/*` or `POST /api/ha-soc-ai/*` (or in-process agentic FSM) regularly blocks HTTP threads or UI SLOs under realistic SOC load.
2. **Independent scale** — AI workers must scale and fail independently of the API JVM / EP workers (GPU/Ollama pools, multi-tenant fan-out, long multi-step investigation chains).
3. **Durability** — Jobs must survive API restart with at-least-once delivery, replay, and dead-letter handling that PostgreSQL job tables or Spring `@Scheduled` cannot meet without undue complexity.
4. **Non-detection path** — The bus carries **AI work commands / results** (triage requests, enrich jobs, investigation step tokens). It must **not** become an alternate write path for alerts/events that skips EP.

Until then: prefer PostgreSQL-backed outbox / job tables, bounded in-process queues, or existing scheduled workers.

## Rationale

`CLAUDE.md` **Firm Constraints** and service-communication rules:

- OpenSearch index pattern is **version-locked**: `v3-hive-<type>-YYYY.MM.DD`.
- Correlation runs **before** OpenSearch — do not short-circuit event-processor.
- **`INTERNAL_KEY`** couples backend ↔ agent-manager ↔ event-processor; a broker must not invent a parallel trust domain without a security review.
- Plugin binaries remain `com.hivearmor.<name>.plugin`.
- Liquibase changesets stay immutable once merged.
- Go module paths remain `github.com/hivearmor/...`.
- Explicit CLAUDE.md rule: **No message broker. Do not add Kafka or RabbitMQ without an explicit architecture decision.**

`CONTRIBUTING.md` echoes the same broker gate (record the decision before introducing Kafka/RabbitMQ/etc.).

Adding a bus “for AI” without those gates risks dual-write / schema drift (already called out for connector ingest — see related ADR) and collapses pilot Redpanda ingest semantics into an ad-hoc application bus.

## Consequences

- **No code, Compose, or client libraries** for Kafka/Redis/RabbitMQ are introduced by this ADR.
- Agentic FSM / SOC-AI features continue on the current sync or DB-scheduled model until a follow-up ADR names transport, topics/queues, auth, idempotency, and retention.
- Detection and alert correctness continue to be judged on **EP → OpenSearch**, not on AI bus delivery.
- If a follow-up ADR chooses Kafka-compatible transport, prefer reusing an already-operated pilot broker **only** for clearly namespaced AI job topics — never for short-circuiting EP or rewriting alert indices from workers.

## Related

- `CLAUDE.md` — Architecture Overview (data flow, “No message broker…”), Firm Constraints
- `CONTRIBUTING.md` — Go Services broker gate
- `docs/architecture/ADR-20260824-connector-ingest.md` — connectors must not bypass EP
- `docs/architecture/production-pilot-topology.md` — Redpanda as pilot **ingest** transport, not AI job bus
