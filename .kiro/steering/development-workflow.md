---
inclusion: always
---

# Development Workflow and Change Management

## Branch Strategy

| Pattern | CI trigger | Environment |
|---|---|---|
| `release/v11*` | push | Dev build — version auto-incremented via Customer Manager API |
| GitHub Release (tag `v11.x.y`) | `release.published` | Production build + sign + deploy |
| PR to `release/**`, `v10`, `v11` | PR open/update | PR checks only — no build |

**Never push directly to `v11` or `main`.** Work on a feature branch, open a PR.

## PR Gate (`pr-checks.yml`)

All PRs targeting `release/**` or `v11` must pass:
1. Go dependency scan
2. AI code review
3. Tier-3 approver sign-off (`Kbayero` or `osmontero`)

No automated test execution runs in CI today. Tests are a local responsibility until the pipeline is extended.

## Local Setup Prerequisites

| Tool | Required version | Note |
|---|---|---|
| Docker Desktop | latest | Apple Silicon: Rosetta emulation, ~20-30% overhead |
| Node.js | **20.20.2 LTS** | `nvm use 20` — upgraded from Node 14 in Phase 2 |
| Java | 17 | |
| Go | 1.25.5 | |
| Maven | 3.3.9+ | |
| `MAVEN_TK` env var | — | GitHub PAT with `read:packages` |

```bash
# Start full stack
cd local-dev && docker compose up -d

# Frontend dev server (separate terminal)
cd frontend && nvm use 20 && npm install && npm start

# Backend dev server (optional, separate terminal)
cd backend && mvn -s settings.xml -B
```

Local access: UI at `https://localhost` or `http://localhost:8880` · API at `http://localhost:8088`

## Change Management Rules

### Schema changes (Liquibase)
- Add a new file: `backend/src/main/resources/config/liquibase/changelog/YYYYMMDDNNN_description.xml`
- Include it in `master.xml` in strict date order
- **Never edit a shipped changeset**
- New columns must have a default value or be nullable — Liquibase runs against a live DB on startup
- No `DROP COLUMN`, `RENAME COLUMN`, or table removal without a 2-release deprecation cycle
- Run `mvn -s settings.xml liquibase:validate` locally before pushing

### API changes (backend REST)
- No versioning exists today — all endpoints are at `/api/`
- Additive changes (new endpoints, new optional response fields) are safe
- Breaking changes (removed endpoints, renamed/removed request fields, changed response shape) require:
  1. Keep the old endpoint active with a `Deprecation` response header
  2. Ship the new endpoint in the same release
  3. Remove the old endpoint no earlier than 2 releases later
  4. Update `docs/baseline/03-backend-api-inventory.md`

### Frontend route changes
- Register all new lazy-loaded modules in `app-routing.module.ts`
- Keep disabled routes (`/vulnerability-scanner`, `/reports`, `/explore`) commented out — do not remove them
- Role restrictions (`data: { authorities: [...] }`) must match the backend endpoint they call

### Go binary changes (agent, collector, plugins)
- Any change to gRPC proto definitions requires regenerating `.pb.go` files and updating both client and server simultaneously
- Any change to `REPLACE_KEY` usage requires a new binary release and reinstallation of all deployed agents
- Plugin binary names must remain `com.utmstack.<name>.plugin` — the eventprocessor loads by this name (**FROZEN — do not change**)
- Go module paths (`github.com/utmstack/UTMStack/...`) are **FROZEN** until new GitHub org `nilachakra` is created — see `REBRAND_NILACHAKRA_PLAN.md` SPEC 7

### Inter-service contract changes
These require a coordinated deployment of every affected service — plan before touching:
- `INTERNAL_KEY` — backend + agentmanager + eventprocessor
- gRPC proto definitions — agentmanager + backend (generated stubs) + agent
- `Utm-Internal-Key` header name — frontend + backend
- OpenSearch index pattern `v11-<type>-YYYY.MM.DD` — eventprocessor + backend + frontend

## Using Kiro for This Project

### When to use Specs
Use a Kiro Spec (`.kiro/specs/<name>/`) for any work that:
- Spans more than 3 files
- Requires a design decision before implementation
- Is part of a planned improvement from `docs/baseline/14-change-readiness-plan.md`

Workflow: requirements → design → tasks. Work through tasks one at a time in Autopilot mode. Switch to Supervised mode for security-sensitive files or destructive changes.

### Steering file activation by context

| Working on | Which steering files activate |
|---|---|
| Any code | `product.md` + `architecture.md` + `siem-domain.md` + `security-rbac.md` + `testing.md` + this file |
| `frontend/**` | + `frontend-ui.md` + `branding.md` |
| `backend/**` | + `backend-api.md` |
| `agent/**`, `agent-manager/**`, `plugins/**`, `utmstack-collector/**`, `as400/**`, `installer/**` | + `agents-workers.md` |

### Recommended hooks (not yet created — add as needed)
```
fileEdited *.ts   → askAgent "run ng lint and report any new warnings"
fileEdited *.java → askAgent "run mvn checkstyle:check and report violations"
postTaskExecution → runCommand "cd frontend && npm test -- --single-run"
```

## Key File Reference

| File | Purpose |
|---|---|
| `AGENTS.md` | Build commands, ldflags, gotchas — read this first |
| `local-dev/docker-compose.yml` | Full service topology |
| `local-dev/.env.example` | All required environment variables |
| `frontend/src/styles/_tokens.scss` | Single source for all design tokens |
| `frontend/src/app/app-routing.module.ts` | All frontend routes |
| `backend/src/main/resources/config/liquibase/master.xml` | DB migration orchestrator |
| `backend/src/main/resources/config/application-prod.yml` | Production configuration |
| `.github/workflows/v11-deployment-pipeline.yml` | CI/CD build and deploy pipeline |
| `docs/baseline/` | Full audit baseline (15 documents + executive summary) |
| `docs/baseline/14-change-readiness-plan.md` | Safe sequence for major changes |
| `docs/baseline/12-risk-register.md` | Risk catalogue with severity ratings |
| `docs/baseline/13-known-issues-and-technical-debt.md` | 25 tracked debt items |
