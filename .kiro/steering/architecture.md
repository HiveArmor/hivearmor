---
inclusion: always
---

# Architecture

## Service Topology

| Service | Lang/Runtime | Key ports | Role |
|---|---|---|---|
| `frontend` | Angular 7 + nginx | 80, 443 | SPA; nginx is the reverse proxy for all services |
| `backend` | Java 17 / Spring Boot 3.1 | 8080 | REST API, business logic, DB migrations |
| `agentmanager` | Go 1.25.5 | 9000 gRPC, 9001 | Registers agents/collectors; proxies remote commands |
| `eventprocessor` | Go base + 16 plugins | 50051, 8000, 8090 | Correlation engine; hosts SOC AI |
| `opensearch` | OpenSearch | 9200 | All log events and alerts (indices: `v11-<type>-YYYY.MM.DD`) |
| `postgres` | PostgreSQL | 5432 | App data: users, rules, incidents, dashboards, config |
| `user-auditor` | Java 11 / Spring Boot 2.7 | internal | User session and activity audit |
| `web-pdf` | Java 11 / Spring Boot 2.7 | internal | HTML → PDF via headless Chrome (Selenium) |

Reference: `local-dev/docker-compose.yml`, `docs/baseline/01-architecture-overview.md`

## Communication Contracts (do not break)

| From | To | Protocol | Auth token |
|---|---|---|---|
| Browser | nginx → backend | HTTPS | JWT `Authorization: Bearer` header |
| Frontend | Backend | WebSocket (STOMP/SockJS) | JWT |
| Backend | OpenSearch | HTTPS + basic auth | env vars |
| Backend | AgentManager | gRPC (no cert verify — known gap) | `INTERNAL_KEY` env var in metadata |
| Backend | EventProcessor | HTTP | `X-Internal-Key` header |
| Agent/Collector | AgentManager | gRPC TLS 1.3 | `REPLACE_KEY` (ldflags) + `key/id/type` metadata |

**No message broker.** gRPC handles agent↔server; HTTP handles backend↔eventprocessor. Do not add Kafka or RabbitMQ without an explicit architecture decision.

## The Fundamental Data Flow

```
Log source → Agent/Collector → gRPC → EventProcessor
  → parse (YAML filters) → enrich (geo, feeds) → correlate (YAML rules)
  → index to OpenSearch → backend queries → frontend displays
```

**Correlation runs before data reaches OpenSearch.** This is intentional and a core differentiator. Do not short-circuit it.

## Databases

| DB | Engine | Owner | Managed by |
|---|---|---|---|
| `utmstack` | PostgreSQL | backend | Liquibase (200+ changesets) |
| `agentmanager` | PostgreSQL | agentmanager | GORM auto-migrate |
| `userauditor` | PostgreSQL | user-auditor | JPA / migrations |
| `v11-*` indices | OpenSearch | eventprocessor, backend | Dynamic mapping + ISM policies |
| local state | SQLite | each agent/collector binary | In-process |

## Firm Constraints

- **OpenSearch index pattern `v11-<type>-YYYY.MM.DD` is version-locked.** All query code assumes it. Changing it requires migrating every existing index and every query in backend, frontend, and plugins.
- **`INTERNAL_KEY` is shared by backend, agentmanager, and eventprocessor.** Changing it requires simultaneous coordinated redeploy of all three.
- **Adding a new Go service** requires updates to: `local-dev/docker-compose.yml`, `v11-deployment-pipeline.yml`, and `AGENTS.md`.
- **Liquibase changesets are immutable once merged** — never edit a shipped changeset, only add new ones.
