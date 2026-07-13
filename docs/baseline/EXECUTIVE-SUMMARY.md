# UTMStack v11 — Audit Executive Summary

**Date**: June 28, 2026  
**Scope**: Full end-to-end codebase audit of the UTMStack-11 monorepo  
**Purpose**: Establish a durable baseline before backend versioning, branding, and architecture changes

---

## 1. Architecture Summary

UTMStack is an enterprise SIEM/XDR platform deployed as a Docker Swarm stack on Ubuntu 22.04. It is a multi-language monorepo with 8 runtime services, 17 Go plugin modules, 3 agent binaries, and a custom correlation engine that processes logs before they reach storage.

**Services**: Angular 7 frontend (nginx) → Spring Boot 3.1 backend → OpenSearch (logs) + PostgreSQL (app data), with a Go-based agent-manager (gRPC), event processor (plugin host), user auditor (Java 11), and web-pdf renderer (Selenium).

**Key design principle**: Correlation runs *before* data is written to OpenSearch — this is intentional and a product differentiator. Do not change it.

**Communication**: gRPC (agent↔agentmanager), HTTP (backend↔eventprocessor), WebSocket/STOMP (backend↔frontend). No message broker.

---

## 2. Current Feature List

| Feature | Status |
|---|---|
| Log ingestion (25+ sources: Windows, Linux, macOS, Cisco, FortiGate, PaloAlto, AWS, Azure, GCP, O365, CrowdStrike, Sophos, Bitdefender, Netflow, Suricata, and more) | Active |
| Real-time correlation engine (YAML rules, 23 categories) | Active |
| Alert management (triage, tagging, dedup, grouping, SOC AI analysis) | Active |
| Incident / case management | Active |
| SOAR (automated response rules, playbooks, agent command execution) | Active |
| Custom dashboards + visualization builder (ECharts) | Active |
| Log analyzer (OpenSearch-backed, Monaco editor queries) | Active |
| Compliance reporting (PDF via Selenium, scheduled email delivery) | Active |
| Threat intelligence (ThreatWinds feeds) | Active |
| Active Directory integration | Active |
| Data parsing pipeline management (Logstash-compatible filters) | Active |
| User management + RBAC (ADMIN/USER) | Active |
| SAML2 SSO + TOTP/email 2FA | Active |
| API key management | Active |
| User activity auditing | Active |
| Getting started wizard | Active |
| Vulnerability scanner | **Disabled** (code present) |
| Reporting module | **Disabled** (code present) |
| File browser | **Disabled** (code present) |
| compliance-orchestrator plugin | **Built, not deployed** |

---

## 3. Critical Risks

These require attention before any major change work begins.

| # | Risk | Area | Impact |
|---|---|---|---|
| CR-1 | **Zero automated test coverage** — no backend `src/test/`, no Go tests, minimal frontend specs | All | Any change can silently break detection or auth |
| CR-2 | **Angular 7.2.0 (EOL 2019)** + **Node 14.16.1 (EOL 2023)** — unpatched CVEs, `node-sass@4` blocks all upgrades | Frontend | Security exposure, blocked modernization |
| CR-3 | **Password in GET query parameter** — `GET /api/check-credentials?password=...` logged by every reverse proxy and server | Backend | Password leakage in logs |
| CR-4 | **SSRF risk in web-pdf Selenium** — accepts user-controlled URL; no allowlist enforcement observed | web-pdf | Internal service access via attacker-supplied URL |
| CR-5 | **No automated backup/restore** for PostgreSQL or OpenSearch | Operations | Data loss on failure with no recovery path |
| CR-6 | **Hibernate 5.4.32 forcibly pinned** in Spring Boot 3.1 (expects Hibernate 6.x) | Backend | Silent ORM compatibility issues |
| CR-7 | **JWT signing key ephemeral** — rotates on every backend restart; all sessions lost on every deployment | Backend | Poor UX; sessions not recoverable after deploy |
| CR-8 | **`/root/utmstack.yml` is the only copy of all generated secrets** — loss = stack cannot restart | Operations | Complete service failure if file is lost |

---

## 4. Suggested First 10 Improvements

Ordered by highest impact vs. lowest risk ratio.

| # | Improvement | Effort | Risk | Benefit |
|---|---|---|---|---|
| 1 | Fix `jib-maven-plugin.image` in `pom.xml` (Java 11 → Java 17) | 5 min | Zero | Prevents broken container builds via jib |
| 2 | Create `local-dev/.env.example` with all required variables | 1 hour | Zero | Eliminates onboarding reverse-engineering |
| 3 | Change `GET /api/check-credentials?password=` to `POST` with JSON body | 2 hours | Low | Eliminates password-in-logs security gap |
| 4 | Set `CORS allowed-origins` in `application-prod.yml` to the actual frontend hostname | 30 min | Low | Tightens API exposure |
| 5 | Set `DEBUG_INFO_ENABLED: false` in `environment.prod.ts` | 5 min | Zero | Stops debug info leaking to production clients |
| 6 | Add `backend/src/test/` with a `TokenProvider` unit test and a `/api/authenticate` integration test | 1 day | Zero | First regression safety net for the most critical path |
| 7 | Add `go test ./...` step to PR checks workflow for agent-manager | 2 hours | Zero | Catches future agent auth regressions in CI |
| 8 | Make JWT signing key persistent (stored in DB or env var, loaded on startup) | 1 day | Medium | Prevents session loss on every deployment |
| 9 | Migrate `node-sass` → `sass` (dart-sass) in `frontend/package.json` | 4 hours | Medium | Unblocks Node 14 → 18 upgrade path |
| 10 | Add OpenSearch ISM snapshot policy via `IndexPolicyResource` API | 2 hours | Low | Enables automated backup for log data |

---

## 5. Files Most Likely Affected by Backend Changes

When making backend API, schema, or auth changes, these files are the highest-impact touch points.

**Security / Auth**
- `backend/src/main/java/com/park/utmstack/config/SecurityConfiguration.java`
- `backend/src/main/java/com/park/utmstack/security/jwt/TokenProvider.java`
- `backend/src/main/java/com/park/utmstack/security/jwt/JWTFilter.java`

**API Contracts**
- `backend/src/main/java/com/park/utmstack/web/rest/UserJWTController.java` (login)
- `backend/src/main/java/com/park/utmstack/web/rest/UtmAlertResource.java` (alerts)
- `backend/src/main/java/com/park/utmstack/web/rest/incident/UtmIncidentResource.java`
- `backend/src/main/java/com/park/utmstack/web/rest/correlation/rules/UtmCorrelationRulesResource.java`
- All `*Resource.java` files under `backend/src/main/java/com/park/utmstack/web/rest/`

**Database Schema**
- `backend/src/main/resources/config/liquibase/master.xml`
- `backend/src/main/resources/config/liquibase/changelog/` (add new files here)

**Frontend API Consumers**
- `frontend/src/app/core/auth/auth-jwt.service.ts`
- `frontend/src/app/core/auth/account.service.ts`
- `frontend/src/app/data-management/alert-management/shared/` (all alert services)
- `frontend/src/app/incident/` (incident services)

**Configuration**
- `backend/src/main/resources/config/application-prod.yml`
- `backend/src/main/resources/config/application.yml`

---

## 6. Files Most Likely Affected by Branding Changes

| File | What Changes |
|---|---|
| `frontend/src/styles/_tokens.scss` | Primary brand color (`$accent`), all surface/text/severity variables |
| `frontend/src/assets/img/*.svg/png/gif` | All 11+ logo files replacement |
| `frontend/src/favicon.ico` | Browser tab icon |
| `frontend/src/index.html` | `<title>`, favicon `<link>`, loading text, `.bg-image-utmstack` CSS class |
| `frontend/src/styles.scss` | CSS class names `.bg-image-utmstack`, `.bg-image-utmstack-blurry` |
| `frontend/src/app/shared/constants/global.constant.ts` | `DEMO_URL`, `ONLINE_DOCUMENTATION_BASE` |
| `frontend/src/app/app.constants.ts` | `COOKIE_AUTH_TOKEN = 'utmauth'` (**high risk — invalidates sessions**) |
| `backend/src/main/resources/config/application.yml` | `spring.application.name: UTMStack-API` |
| `backend/src/main/resources/templates/mail/*.html` | All 9 email templates (product name in body/subject) |
| `backend/src/main/resources/templates/mail/fragments/` | Shared email layout (header/footer) |
| `frontend/src/app/app-module/guides/*.component.html` | Integration guide text, agent install paths |
| `backend/pom.xml` | `<name>UTMStack-API</name>` |
| `agent/cmd/root.go` | CLI help text ("UTMStack Agent CLI") |
| `installer/main.go` | Help text ("### UTMStack ###") |
| `utmstack-collector/main.go` | Help text ("### UTMStack Collector ###") |

---

## 7. Recommended Development Workflow Using Kiro

### For Feature Work

1. **Use Kiro Specs** for any change touching 3+ files or requiring design decisions:
   ```
   .kiro/specs/<feature-name>/requirements.md
   .kiro/specs/<feature-name>/design.md
   .kiro/specs/<feature-name>/tasks.md
   ```
2. Let Kiro work through tasks in Autopilot mode; switch to Supervised mode for security-sensitive files
3. The 8 steering files in `.kiro/steering/` are always active — Kiro will apply them automatically

### Steering File Coverage

| Working On | Active Steering Context |
|---|---|
| Any work | `product.md` + `architecture.md` |
| Frontend | `frontend-ui.md` + `branding.md` |
| Backend API | `backend-api.md` + `security-rbac.md` |
| Security/Auth | `security-rbac.md` (primary) |
| SIEM features (alerts, rules, SOAR) | `siem-domain.md` |
| Tests | `testing.md` |
| Branding/rebrand | `branding.md` |
| CI/CD or workflow | `development-workflow.md` |

### Recommended Hooks to Add

```
postTaskExecution  → npm test -- --single-run (frontend tasks)
postTaskExecution  → mvn -s settings.xml test (backend tasks)
fileEdited *.ts    → ng lint (frontend lint on save)
fileEdited *.java  → mvn checkstyle:check (backend lint on save)
```

### Safe Change Sequence (Summary)

Before any major work, follow `docs/baseline/14-change-readiness-plan.md`:
1. **Phase 0**: Fix quick critical bugs + add first tests + document env vars
2. **Phase 1**: API versioning (add `/api/v1/` on new endpoints; keep old ones alive)
3. **Phase 2**: Branding (tokens → logos → text constants → email templates → cookie last)
4. **Phase 3**: Angular upgrade (separate sprint — highest risk, requires test coverage first)

---

## 8. Baseline Document Index

| Document | Contents |
|---|---|
| `00-product-overview.md` | Product purpose, personas, feature list, deployment model |
| `01-architecture-overview.md` | Service map, communication matrix, data flow, CI/CD pipeline |
| `02-ui-feature-map.md` | Routing map, module structure, state management, design system |
| `03-backend-api-inventory.md` | All 50+ REST endpoints grouped by domain, versioning assessment |
| `04-data-model-and-storage.md` | Full PostgreSQL schema, OpenSearch indices, sensitive data map |
| `05-agent-worker-automation-map.md` | All agents, collectors, plugins, backend schedulers |
| `06-security-and-rbac-baseline.md` | Auth flows, RBAC, TFA, known security gaps |
| `07-siem-data-flow.md` | End-to-end pipeline from log ingestion to alert display |
| `08-integrations-and-connectors.md` | All 25+ integrations, external services, removed integrations |
| `09-testing-quality-baseline.md` | Test coverage gaps, frameworks, CI quality gates |
| `10-deployment-operations-baseline.md` | All env vars, Docker setup, observability, backup gaps |
| `11-branding-impact-analysis.md` | Complete branding inventory, risk map, recommended abstractions |
| `12-risk-register.md` | 35+ risks rated by severity and likelihood across all categories |
| `13-known-issues-and-technical-debt.md` | 25 tracked debt items with severity and affected files |
| `14-change-readiness-plan.md` | Phased safe change sequence with checklists |
| `EXECUTIVE-SUMMARY.md` | This document |
