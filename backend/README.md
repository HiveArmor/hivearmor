# HiveArmor Backend

**HiveArmor** — Hyper-scale Incident Visibility Engine

This is the core REST API backend for the HiveArmor enterprise SIEM/XDR platform. It provides alert management, incident lifecycle, compliance reporting, user/RBAC administration, SOAR automation, and scheduled data-pipeline workers.

---

## Tech Stack

| Component | Version |
|---|---|
| Java | 17 |
| Spring Boot | 3.3 |
| Spring Security | 6 |
| JHipster scaffolding | 8 |
| JPA / Hibernate | 6 |
| Liquibase | schema migrations |
| PostgreSQL | app database |
| OpenSearch client | log event queries |

---

## Prerequisites

- **Java 17** (JDK)
- **Maven 3.9+**
- **`MAVEN_TK` environment variable** — a GitHub Personal Access Token with `read:packages` scope, required to pull dependencies from GitHub Packages

```bash
export MAVEN_TK=ghp_your_token_here
```

- A running PostgreSQL instance (`hivearmor` database) and OpenSearch cluster. For local development, start both with Docker Compose:

```bash
cd ../local-dev && docker compose up -d
```

---

## Running in Development

```bash
cd backend
mvn -s settings.xml -B
```

The API server starts on port **8080**. In the local Docker stack it is reverse-proxied to port **8088**.

Local credentials: `admin` / `localdev123!`

Get a JWT for curl testing:

```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

---

## Building for Production

```bash
mvn -B -Pprod clean package -s settings.xml
```

Output: `target/hivearmor.war`

---

## Running Tests

```bash
mvn -s settings.xml test
```

---

## API Overview

### Base path

All HiveArmor endpoints are prefixed with `/api/ha-*`. The authentication endpoint is `/api/authenticate`.

### Authentication

Every protected request must include a JWT Bearer token:

```
Authorization: Bearer <token>
```

Tokens are issued by `POST /api/authenticate` and expire per the configured TTL. The JWT signing key is **ephemeral** — it regenerates on every server restart, which invalidates all active sessions (tracked as DEBT-14).

### Key endpoint groups

| Prefix | Description |
|---|---|
| `POST /api/authenticate` | Obtain JWT token |
| `/api/ha-alerts/` | Alert ingestion, status, tagging |
| `/api/ha-incidents/` | Incident lifecycle management |
| `/api/ha-compliance/` | Compliance report generation |
| `/api/ha-users/` | User management |
| `/api/ha-roles/` | RBAC role and permission management |
| `/api/ha-soar/` | SOAR automation rules |
| `/api/ha-agents/` | Agent registry queries |
| `/api/ha-dashboard/` | Dashboard configuration |
| `/api/ha-filters/` | Log filter management |

### Authorization

Every endpoint must have either a `@PreAuthorize` annotation on the controller method **or** an explicit entry in `SecurityConfiguration.java`. Public endpoints (e.g., `/api/authenticate`) must be explicitly allowlisted in the public path list. Do not create endpoints without authorization checks.

---

## Scheduled Workers

The backend runs several background workers:

| Worker | Interval | Purpose |
|---|---|---|
| Alert tagger | 30 s | Applies rule-based tags to new alerts |
| SOAR rule executor | 30 s | Evaluates SOAR response rules |
| Pipeline sync | 20 s | Syncs EventProcessor pipeline state |
| OpenSearch health check | 60 s | Monitors index health |
| Compliance report builder | 5 s | Incremental compliance aggregation |
| User cleanup | Daily 01:00 | Removes expired sessions and stale tokens |

---

## Database Migrations (Liquibase)

All schema changes are managed by Liquibase. Rules:

1. Add a new changelog file:
   `src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml`
2. Include it in `src/main/resources/config/liquibase/master.xml` in **strict date order**.
3. New columns must have a default value or be `NULL`-able.
4. Never edit or delete a changeset that has already been merged (changesets are immutable once shipped).
5. `DROP COLUMN` and `RENAME COLUMN` require a 2-release deprecation cycle.
6. Validate before merging:

```bash
mvn -s settings.xml liquibase:validate
```

---

## Security Rules

Follow these rules for all new code:

- Every endpoint requires `@PreAuthorize` or an explicit `SecurityConfiguration` entry.
- Never put passwords or secrets in URL query parameters.
- All OpenSearch queries must use `SearchUtil` DSL builders — never build query strings by concatenating user input.
- Audit trail entries are required for: alert status changes, incident status changes, user login/logout, agent remote commands, API key usage.

Known open security issues are tracked in `.plan/features/SEC-FIXES.md` and `docs/baseline/12-risk-register.md`. These must be resolved before shipping new features to production:

| ID | Issue |
|---|---|
| SEC-01 | Password in GET query param (`AccountResource.java`) |
| SEC-02 | JWT key regenerates on restart (`TokenProvider.java`) |
| SEC-03 | CORS wildcard in prod config |
| SEC-04 | `InsecureTrustManagerFactory` in gRPC/TLS |

---

## Service Communication

| From | To | Protocol | Auth |
|---|---|---|---|
| Browser | Backend | HTTPS | JWT Bearer |
| Backend | OpenSearch | HTTPS | env var basic auth |
| Backend | AgentManager | gRPC | `INTERNAL_KEY` env var |
| Backend | EventProcessor | HTTP | `X-Internal-Key` header |

The `INTERNAL_KEY` is shared by the backend, AgentManager, and EventProcessor. Changing it requires a simultaneous redeploy of all three services.

---

## OpenSearch Index Pattern

Log events and alerts are indexed as:

```
_v3_hive_<type>-YYYY.MM.DD
```

This pattern is **version-locked**. Do not change it — doing so requires migrating every existing index and every query across all services.

---

## API Change Policy

- No versioning — all endpoints are at `/api/`.
- Breaking changes (removed or renamed endpoints/fields) require keeping the old endpoint with a `Deprecation` response header for at least 2 releases.
- Additive changes (new fields, new endpoints) are always safe to ship.

---

## Project Structure

```
backend/
  src/main/java/com/hivearmor/
    web/rest/          REST controllers
    service/           Business logic and scheduled workers
    repository/        Spring Data JPA repositories
    domain/            JPA entity classes
    security/          JWT, SecurityConfiguration
    config/            Application configuration beans
  src/main/resources/
    config/
      application.yml          Base config
      application-dev.yml      Dev profile
      application-prod.yml     Prod profile
      liquibase/
        master.xml             Liquibase changelog master
        changelog/             Individual migration files
```

---

## Related Services

| Service | Role |
|---|---|
| `frontend-v2/` | Next.js 14 UI (active frontend) |
| `agent/` | Go endpoint agent (Windows/Linux/macOS) |
| `agent-manager/` | Go gRPC agent registry |
| `hivearmor-collector/` | Go log collector (syslog/UDP/TCP) |
| `event-processor/` | Go correlation engine |
| `local-dev/` | Docker Compose full-stack environment |

---

## Support

- Documentation: https://docs.hivearmor.io
- Support: support@hivearmor.io
- GitHub: https://github.com/hivearmor

**Version policy:** v11.x LTS is supported until November 2030.
