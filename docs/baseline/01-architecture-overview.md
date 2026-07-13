# 01 — Architecture Overview

## High-Level Architecture

UTMStack is a **microservices platform** deployed as a Docker Swarm stack. Services communicate via gRPC (for agent/collector management) and HTTP/REST (for backend/event-processor coordination). The frontend is served as a static Angular SPA behind nginx, which also acts as the reverse proxy.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                          │
│                  HTTPS → nginx (port 443/80)                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ reverse proxy
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐    ┌──────────────┐   ┌──────────────┐
   │Frontend  │    │  Backend     │   │  Web-PDF     │
   │Angular 7 │    │Spring Boot   │   │Java 11+      │
   │nginx     │    │Java 17       │   │Selenium      │
   └──────────┘    │port: 8080    │   └──────────────┘
                   └──────┬───────┘
              ┌───────────┼──────────────────┐
              ▼           ▼                  ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  PostgreSQL  │ │  OpenSearch  │ │ AgentManager │
   │  (app data)  │ │ (log storage)│ │  Go gRPC     │
   └──────────────┘ └──────────────┘ │  port: 9000  │
                                     └──────┬───────┘
                             ┌──────────────┼───────────────┐
                             ▼              ▼               ▼
                      ┌──────────┐  ┌──────────┐  ┌──────────────┐
                      │  Agent   │  │Collector │  │EventProcessor│
                      │Win/Lin/  │  │  Cloud   │  │ Go + plugins │
                      │ macOS    │  │ SaaS     │  │ port: 50051  │
                      └──────────┘  └──────────┘  └──────────────┘
```

---

## Service Inventory

| Service | Language | Image | Ports | Purpose |
|---|---|---|---|---|
| **frontend** | Angular 7 (nginx) | `ghcr.io/.../frontend` | 80, 443 | Angular SPA + reverse proxy |
| **backend** | Java 17 (Spring Boot 3.1) | `ghcr.io/.../backend` | 8080 | REST API, business logic, DB migrations |
| **agentmanager** | Go 1.25.5 | `ghcr.io/.../agent-manager` | 9000 (gRPC), 9001 | Agent/collector registration & management |
| **eventprocessor** | Go (external base + plugins) | `ghcr.io/.../eventprocessor` | 50051, 8000, 8090 | Log correlation, SOC AI, plugin host |
| **user-auditor** | Java 11 (Spring Boot 2.7) | `ghcr.io/.../user-auditor` | internal | User session & activity auditing |
| **web-pdf** | Java 11 (Spring Boot 2.7) | `ghcr.io/.../web-pdf` | internal | HTML→PDF via Selenium |
| **opensearch** | OpenSearch | `ghcr.io/.../opensearch` | 9200 | Log storage, full-text search, analytics |
| **postgres** | PostgreSQL | `ghcr.io/.../postgres` | 5432 | App data: users, config, incidents, rules |
| **Agent binary** | Go 1.25.5 | distributed binary | — | Endpoint agent (Win/Lin/macOS) |
| **Collector** | Go 1.25.5 | distributed binary | — | Cloud/SaaS log collector |
| **AS400 Collector** | Go 1.25.5 | distributed binary | — | IBM AS/400 dedicated collector |

---

## Communication Map

| From | To | Protocol | Auth |
|---|---|---|---|
| Browser | nginx | HTTPS | — |
| nginx | frontend (static) | file serve | — |
| nginx | backend | HTTP proxy | JWT cookie |
| Backend | PostgreSQL | JDBC (TLS off in prod default) | DB credentials (env vars) |
| Backend | OpenSearch | HTTPS REST | Basic auth (env vars) |
| Backend | AgentManager | gRPC (TLS, no cert verify) | `internal-key` header |
| Backend | EventProcessor manager | HTTP (`SOC_AI_BASE_URL`) | `X-Internal-Key` header |
| Backend → Frontend | WebSocket (STOMP over SockJS) | — | JWT |
| AgentManager | Backend | HTTP | `connection-key` validation |
| AgentManager | PostgreSQL | JDBC | DB credentials (env vars) |
| Agent | AgentManager | gRPC (TLS 1.3) | `REPLACE_KEY` (ldflags) + `key/id/type` headers |
| Collector | AgentManager | gRPC (TLS 1.3) | `REPLACE_KEY` (ldflags) |
| EventProcessor | OpenSearch | HTTPS | Basic auth (plugin config) |
| EventProcessor | PostgreSQL | direct (config plugin) | DB credentials (plugin config) |

---

## Database Layout

| Database | Engine | Consumer Services | Schema Owner |
|---|---|---|---|
| `utmstack` | PostgreSQL | backend | Liquibase (200+ changelogs) |
| `agentmanager` | PostgreSQL | agentmanager | GORM auto-migrate |
| `userauditor` | PostgreSQL | user-auditor | JPA DDL or Liquibase |
| `v11-*` indices | OpenSearch | eventprocessor, backend | Dynamic mapping |
| local | SQLite | agent (on endpoint) | SQLite migrations |
| local | SQLite | utmstack-collector | SQLite migrations |
| local | SQLite | as400 collector | SQLite migrations |

### OpenSearch Index Naming

All indices follow the pattern `v11-<type>-<date>`:
- `v11-alert-YYYY.MM.DD` — generated alerts
- `v11-*` — all log event indices (type = log data type)
- `v11-statistics-YYYY.MM` — ingestion statistics

---

## Event Processing Pipeline

```
Log Source                Event Processor                OpenSearch         Backend
    │                          │                             │                │
    │──(gRPC/HTTP)────────────▶│ 1. Parse (filters)          │                │
    │                          │ 2. Enrich (geolocation,      │                │
    │                          │    threat feeds)             │                │
    │                          │ 3. Correlate (YAML rules)    │                │
    │                          │ 4. Generate Alert            │                │
    │                          │──(HTTPS)────────────────────▶│ Index logs     │
    │                          │──(HTTPS)────────────────────▶│ Index alerts   │
    │                          │                             │                │
    │                          │                             │──(poll/WS)────▶│
    │                          │                             │                │ Notify UI
```

**Key design principle**: Correlation happens **before** writing to OpenSearch. The event processor holds the full correlation engine and all plugins. Data is never written to storage unless it passes the analysis pipeline.

---

## Plugin Architecture

The event processor loads 16 compiled Go binaries at runtime. Each plugin registers itself by type:

| Plugin Type | Plugin Name(s) | Role |
|---|---|---|
| Parsing | `geolocation`, `aws`, `azure`, `gcp`, `o365`, `bitdefender`, `crowdstrike`, `sophos`, `modules-config` | Transform/enrich raw log fields |
| Analysis | `events` | Forward processed events |
| Correlation | `alerts` | Alert deduplication, grouping, indexing |
| Notification | `stats` | Statistics aggregation to OpenSearch |
| Configuration | `config` | Polls PostgreSQL for rule/filter/tenant changes, writes YAML files to event processor working directory |
| Input | `inputs` | HTTP and gRPC log intake endpoint |
| Intelligence | `feeds` | ThreatWinds threat intelligence |
| AI | `soc-ai` | SOC AI analysis endpoint |

---

## Deployment Topology (local-dev docker-compose)

Services with memory limits:
- EventProcessor: 2048 MB
- Backend: 1536 MB
- OpenSearch: 3072 MB
- AgentManager: 512 MB
- User-Auditor: 512 MB
- Web-PDF: 1024 MB
- Postgres: 1024 MB
- Frontend: 256 MB

**Total baseline**: ~10.5 GB RAM for all services

---

## Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Frontend | Angular | 7.2.0 |
| Frontend language | TypeScript | 3.2.2 |
| Frontend UI | Bootstrap + ng-bootstrap | 4.3.1 / 4.1.0 |
| Frontend charts | ECharts | 4.4.0 |
| Frontend CSS | SCSS (node-sass) | 4.x |
| Frontend build | Node.js | 14.16.1 (REQUIRED) |
| Frontend linter | TSLint | 5.11.0 |
| Backend | Spring Boot | 3.1.5 |
| Backend language | Java | 17 |
| Backend ORM | Hibernate | 5.4.32 (pinned, mismatched) |
| Backend DB migrations | Liquibase | 4.24.0 |
| Backend security | Spring Security + JWT + SAML2 | — |
| Backend build | Maven | 3.3.9+ |
| Go services | Go | 1.25.5 (agents/plugins) / 1.25.1 (installer/shared) |
| Relational DB | PostgreSQL | latest (GHCR) |
| Search/log store | OpenSearch | latest (GHCR) |
| gRPC | io.grpc / google.golang.org/grpc | 1.65.1 / 1.81.1 |
| Orchestration | Docker Swarm | — |
| Container registry | GHCR | `ghcr.io/utmstack/utmstack/` |
| CI/CD | GitHub Actions | — |

---

## CI/CD Pipeline Summary

### Triggers
- **PR to `release/**`, `v10`, `v11`**: `pr-checks.yml` — Go dependency scan + AI code review + approver
- **Push to `release/v11**`**: dev build, auto-increment version via CM API
- **GitHub release event**: production build + sign + changelog + publish + deploy

### Build Jobs (v11 pipeline)
1. Agent binaries (5 OS/arch combos)
2. Windows agent signing (GCP KMS)
3. macOS agent signing (codesign + notarytool)
4. Collector binaries
5. AgentManager Docker image (bundles all agent binaries inside)
6. EventProcessor Docker image (builds 16 plugins + downloads geolocation CSVs)
7. Backend Docker image (Maven prod build, copies filters/ and rules/)
8. Frontend Docker image (Node 14.16.1 npm build)
9. UserAuditor Docker image
10. WebPDF Docker image
11. AI changelog generation
12. Installer binary (ldflags-injected)
13. Version publish to Customer Manager
14. Schedule deployment to instances
