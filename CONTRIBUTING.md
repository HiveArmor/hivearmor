# Contributing to HiveArmor

HiveArmor (Hyper-scale Incident Visibility Engine) is an enterprise SIEM/XDR platform. We welcome contributions from the community — bug fixes, new features, documentation improvements, and more. Please read these guidelines before opening a pull request.

## Getting Started

1. Fork the [HiveArmor repository](https://github.com/hivearmor) on GitHub.
2. Clone your fork to your local machine.
3. Create a feature branch from `main`: `git checkout -b your-feature-name`.
4. Make your changes and commit them with a clear, descriptive message.
5. Push your branch to your fork and open a pull request against `upstream/main`.
6. Respond to reviewer feedback and update your branch as needed.
7. Once approved, a maintainer will merge your pull request.

## Environment Requirements

All contributors must have the following tools installed and available in PATH before building any component:

| Tool | Minimum Version | Notes |
|---|---|---|
| Go | 1.25.5+ | Required for agent, agent-manager, collector, event-processor, plugins, and installer |
| Java | 17 (LTS) | Required for the backend (Spring Boot 3.3) |
| Node.js | 20 LTS | Required for the Next.js frontend (frontend-v2/) |
| Maven | 3.9+ | Backend builds; must use `settings.xml` from repo root with `MAVEN_TK` env var set |
| Docker + Compose | Current stable | Required for local-dev full-stack environment |

### Maven and MAVEN_TK

The backend reads GitHub Packages dependencies. Before running any `mvn` command you must export a GitHub Personal Access Token with `read:packages` scope:

```bash
export MAVEN_TK=ghp_your_token_here
mvn -s settings.xml -B ...
```

Without `MAVEN_TK` the build will fail to resolve dependencies. Do not commit a token to the repository.

## Repository Layout

| Directory | Language | Role |
|---|---|---|
| `frontend-v2/` | Next.js 14 + React 18 + TypeScript | Active UI — all new UI work goes here |
| `frontend/` | Angular 17 | Legacy UI — do not touch, scheduled for removal |
| `backend/` | Java 17 + Spring Boot 3.3 | REST API, DB migrations, scheduled workers |
| `agent/` | Go | Endpoint agent (Windows/Linux/macOS) |
| `agent-manager/` | Go | gRPC agent registry |
| `hivearmor-collector/` | Go | Log collector (syslog/UDP/TCP) |
| `event-processor/` | Go | Core correlation engine |
| `plugins/*/` | Go | 17 correlation engine plugins |
| `local-dev/` | Docker Compose | Full-stack local development environment |

## Local Development

```bash
# 1. Copy the example env file and fill in any required values
cp local-dev/.env.example local-dev/.env

# 2. Start the full Docker stack
cd local-dev && docker compose up -d

# 3. Start the Next.js dev server (port 3000)
cd frontend-v2 && npm run dev

# 4. Start the backend dev server (port 8080, proxied to 8088 by Docker)
export MAVEN_TK=ghp_your_token_here
cd backend && mvn -s settings.xml -B
```

| Service | URL | Default Credentials |
|---|---|---|
| HiveArmor UI | http://localhost:3000 | admin / localdev123! |
| Backend API | http://localhost:8088 | admin / localdev123! |
| OpenSearch Dashboards | http://localhost:5601 | admin / LocalDev@2024! |
| PostgreSQL | localhost:5438 | postgres / localdev123! |

## Build Commands

### Frontend (Next.js)
```bash
cd frontend-v2
npm run dev       # development server
npm run build     # production build
npm run lint      # ESLint
npm run test      # Vitest (single run)
```

### Backend (Java)
```bash
cd backend
mvn -s settings.xml -B                        # development server
mvn -B -Pprod clean package -s settings.xml   # production WAR
mvn -s settings.xml liquibase:validate        # validate DB migrations
mvn -s settings.xml test                      # unit tests
```

Always run `liquibase:validate` before opening a pull request that touches database migrations.

### Go Components
```bash
cd agent && go build -o hivearmor_agent_service .
cd agent-manager && go build .
```

**Important:** `agent`, `hivearmor-collector`, and the `as400` plugin require the `REPLACE_KEY` ldflag injected at build time. Builds without this flag are for local testing only and must not be distributed. CI injects `$AGENT_SECRET_PREFIX` automatically.

## Code Style

- **Go:** Follow the [Google Go Style Guide](https://google.github.io/styleguide/go/guide). Run `gofmt` and `go vet` before committing.
- **Java:** Follow the [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html). The formatter is configured in the Maven build.
- **TypeScript/React:** Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). ESLint enforces project rules via `npm run lint`.
- Use descriptive variable and function names. Avoid abbreviations that are not universally understood.
- Add comments that explain *why*, not just *what*.
- Keep functions focused and small.

## HiveArmor-Specific Contribution Rules

### Backend (Java)

- Every new REST endpoint must be under the `/api/ha-*` prefix.
- Every new endpoint must have either a `@PreAuthorize` annotation or an explicit entry in `SecurityConfiguration.java`. There are no unauthenticated endpoints except those already on the public path list.
- An audit trail entry is required for: alert status changes, incident status changes, user login/logout, agent remote commands, and API key usage.
- Database migrations go in `backend/src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml` and must be added to `master.xml` in strict date order. Changesets that have been merged are immutable — never edit them, only add new ones.
- New columns must have a default value or be nullable.
- No `DROP COLUMN` or `RENAME COLUMN` without a 2-release deprecation cycle.

### Frontend (Next.js)

- New pages go in `frontend-v2/src/app/(app)/` (protected route group).
- New services go in `frontend-v2/src/services/` using TanStack Query v5.
- New components go in `frontend-v2/src/components/`.
- State management uses Zustand stores in `frontend-v2/src/store/`.
- The JWT localStorage key is `hivearmor_auth_token` — do not change it.
- Do not add direct backend calls from components; all API traffic goes through the proxy at `src/app/api/[...path]/route.ts`.

### Go Services

- Go module paths must use `github.com/hivearmor/...`.
- Docker images must be tagged `hivearmor/<name>` (local) or `ghcr.io/hivearmor/<name>` (CI/prod).
- Plugin binary names must be `com.hivearmor.<name>.plugin` — the event processor loads plugins by this exact name.
- The OpenSearch index pattern `_v3_hive_<type>-YYYY.MM.DD` is locked. Do not change it; doing so would require migrating every existing index and every query across all services.
- Do not introduce a message broker (Kafka, RabbitMQ, etc.) without an explicit architecture decision recorded in `.plan/`.

### Security

Never replicate the following known gaps in new code:

- Password or secret values in URL query parameters.
- CORS `allowed-origins: '*'` in production configuration.
- `InsecureTrustManagerFactory` for gRPC/TLS connections.
- OpenSearch queries built by string concatenation with user input — use `SearchUtil` DSL builders only.

## Testing

- Add unit tests for all new logic. Backend tests use JUnit 5; frontend tests use Vitest; Go tests use the standard `testing` package.
- Ensure your changes do not break any existing tests before opening a pull request.
- For backend schema changes, always run `mvn -s settings.xml liquibase:validate` and confirm it exits cleanly.

## Documentation

- Update or add documentation for any changed or new behavior.
- Full documentation is at [https://docs.hivearmor.io](https://docs.hivearmor.io).
- If your change affects the admin guide, user guide, or agent deployment guide, note it in the pull request description.

## Pull Request Checklist

Before marking your pull request ready for review, confirm:

- [ ] Code follows the style guides for the affected language(s).
- [ ] `MAVEN_TK` is exported and `mvn -s settings.xml test` passes (backend changes).
- [ ] `npm run lint` and `npm run test` pass (frontend changes).
- [ ] `go vet ./...` passes (Go changes).
- [ ] Liquibase migrations validated with `mvn -s settings.xml liquibase:validate` (schema changes).
- [ ] New endpoints have `@PreAuthorize` or a `SecurityConfiguration` entry (backend changes).
- [ ] No secrets, tokens, or credentials are committed.
- [ ] Pull request description explains the motivation and any breaking changes.

## Community Guidelines

- Be respectful and constructive in all interactions.
- Assume good intent from other contributors.
- Keep discussions focused on the technical merits of the change.
- Be patient — reviews take time, especially for larger changes.

## Contact

- General contribution questions: [contribute@hivearmor.io](mailto:contribute@hivearmor.io)
- Security vulnerabilities: [support@hivearmor.io](mailto:support@hivearmor.io) (do not open a public issue for security bugs)
- Documentation: [https://docs.hivearmor.io](https://docs.hivearmor.io)
- GitHub: [https://github.com/hivearmor](https://github.com/hivearmor)

**Thank you for contributing to HiveArmor.**