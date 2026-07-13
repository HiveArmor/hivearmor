# ArmorSight Enterprise SIEM — Complete Audit & Remediation Plan
**Date:** 2026-07-08  
**Auditor:** Three-expert panel (SIEM Product, Security Engineer, Full-Stack Architect)  
**Codebase:** UTMStack-11 fork, root `/Users/encryptshell/GIT/UTMStack-11/`

---

## 10a. Priority Matrix — All Issues

### 🔴 CRITICAL (Security Breach / Data Loss / System Down)

| ID | Area | Issue | File:Line | Remediation |
|----|------|-------|-----------|-------------|
| SEC-NEW-01 | Auth | **IP spoofing bypasses brute-force protection** — `LoginAttemptService` trusts `X-Forwarded-For` unconditionally, allowing an attacker with any proxy to try unlimited passwords | `LoginAttemptService.java:70` | Require explicit reverse-proxy trust config; never trust raw `X-Forwarded-For` without allowlisted proxy IPs |
| SEC-NEW-04 | Auth | **SAML open redirect** — `Saml2LoginSuccessHandler` builds the frontend redirect URL from the `X-Forwarded-Host` header; attacker-controlled host receives the user's full JWT | `Saml2LoginSuccessHandler.java:45` | Build redirect from `jhipster.security.saml2.successRedirectUrl` config; never from request headers |
| SEC-NEW-05 | Injection | **SQL injection via `sort` parameter** — `UtmAssetGroupService` and `CollectorOpsService` format sort/filter values directly into SQL strings using `String.format()` with no escaping | `UtmAssetGroupService.java`, `CollectorOpsService.java` | Replace with parameterized JPA `Sort` or JPQL named parameters |
| SEC-NEW-02 | Auth | **TFA verification has zero rate limiting** — `/api/tfa/verify-code` allows unlimited TOTP/email code guesses; 6-digit TOTP can be brute-forced in <100k attempts | `TfaResource.java:148` | Apply same `LoginAttemptService` check; lock TFA after 5 failures |
| SEC-NEW-03 | Config | **TFA disabled by default** — `APP_TFA_ENABLED=false` is set in docker-compose; all enterprise deployments ship with TFA off and the product default silently disables MFA enterprise-wide | `docker-compose.yml:172` | Default `APP_TFA_ENABLED=true`; add first-login prompt if not enrolled |
| PLUGIN-01 | Reliability | **Any companion plugin crash kills entire eventprocessor container** — `entrypoint.sh` uses `wait -n`; one failed plugin brings down all log processing | `eventprocessor/entrypoint.sh` | Supervise each plugin independently (supervisord or separate containers); add restart policy |
| FLOW-01 | Data Loss | **Ack-before-processing race** — inputs plugin sends gRPC Ack to collector before `go processLog()` completes; a crash mid-pipeline means events are permanently lost with no retry | `plugins/inputs/` | Ack only after successful enqueue or write; implement at-least-once delivery |
| FLOW-02 | Data Loss | **`eventQueue == nil` at startup** — if OpenSearch is not ready when the writer initializes, all incoming events are silently discarded with no queuing | `plugins/events/` | Block startup until OpenSearch is healthy; or buffer to disk until writer is ready |
| FLOW-03 | Data Loss | **LogQueue[10,000] drops silently** — file, auditd, and Windows collectors drop events when the buffer is full; no backpressure, no dead-letter queue | `agent/collector/` | Implement backpressure to source or write overflow to a local disk queue |
| FLOW-04 | Security | **Unauthenticated event injection endpoint** — `POST :8090/v1/inject` has no auth middleware; any local process can inject synthetic events into the pipeline | Event processor HTTP server | Add authentication to the inject endpoint; bind to loopback only |
| FLOW-05 | Security | **Unauthenticated Unix socket** — inputs→event-processor Unix socket has no TLS or auth; a co-located process can inject arbitrary events | `inputs` ↔ `event-processor` socket | Use a shared secret or Unix socket permissions (mode 0600 + same UID) |
| FLOW-06 | Data Loss | **`v11-offense-*` index is never written** — all offense/incident escalation endpoints return empty because no code in the repo writes to this index | `plugins/`, backend | Identify the missing writer; or confirm offenses are derived from alerts at query time |

### 🟠 HIGH (Feature Broken / SOC Workflow Blocked)

| ID | Area | Issue | File:Line | Remediation |
|----|------|-------|-----------|-------------|
| SEC-01 | Auth | **Password in URL** — `GET /api/check-credentials?password=X` exposes plaintext password in server logs, nginx access logs, browser history, and any proxy | `UserJWTController.java:132` | Change to `POST /api/check-credentials` with password in request body |
| SEC-02 | Auth | **JWT signing key regenerates on restart** — `private static final String SECRET = CipherUtil.generateSafeToken()` generates a new random key at JVM startup; all active sessions invalidated on restart/redeploy | `TokenProvider.java` | Load key from `ENCRYPTION_KEY` env var or a KMS-backed secret; key must survive restarts |
| SEC-03 | Config | **CORS wildcard in production config** — `allowed-origins: '*'` in `application-prod.yml`; any malicious web page can make authenticated requests on behalf of logged-in users | `application-prod.yml:50` | Set to specific allowed origins (e.g., `https://armorsight.yourdomain.com`) |
| SEC-04 | TLS | **TLS cert verification disabled** — `restTemplateWithSsl` bean uses trust-all SSLContext; `IsConnectionKeyValid()` in Go uses `InsecureSkipVerify: true`; ElasticsearchConnectionCheck also trusts all | `RestTemplateConfiguration.java:68`, `auth.go:13` | Load proper CA certs; use system trust store; remove all trust-all configs |
| UX-P0-01 | UX | **New correlation rules cannot be saved** — `handleSave()` in rules page contains `if (!rule) return` that silently exits on new-rule creation; analysts cannot build new detections | `rules/page.tsx` | Fix null guard logic: differentiate between edit (rule exists) and create (rule is null) |
| UX-P0-02 | Feature | **Investigation workspace loads demo data not real incident** — `/incidents/[id]` uses hardcoded `DEMO_INCIDENT` constant; analysts investigating real incidents see fabricated data | `incidents/[id]/page.tsx` | Replace demo constant with real API call to `GET /api/utm-incidents/{id}` |
| UX-P0-03 | Feature | **Active Directory page is 100% mock** — All data (`MOCK_OVERVIEW`, `MOCK_USERS`, `MOCK_EVENTS`, `MOCK_REPORTS`) is hardcoded; no API calls; refresh button is a no-op | `active-directory/page.tsx` | Wire to AD audit microservice APIs via `UtmAuditorUsersResource` |
| API-BROKEN-01 | API | **Agents page broken** — `agentService.listAgents()` calls `GET /api/agents`; backend path is `GET /api/agent-manager/agents` | `agent.service.ts:48` | Fix path to `/api/agent-manager/agents` |
| API-BROKEN-02 | API | **Incident status update fails** — Frontend calls `POST /api/utm-incidents/status`; backend expects `PUT /api/utm-incidents/change-status` with different body shape | `incident.service.ts`, `UtmIncidentResource.java` | Align HTTP method and path; fix request body mapping |
| API-BROKEN-03 | API | **Settings silently corrupts data** — Frontend `ConfigParameter` fields (`paramShort`, `paramValue`) don't match backend fields (`confParamShort`, `confParamValue`); updates send wrong field names and reads show null | `admin.service.ts` | Align TypeScript interface field names with backend Java serialization |
| RBAC-01 | Security | **Zero RBAC enforcement in frontend** — Every (app) page is accessible to any logged-in user; `ROLE_VIEWER` can navigate to and attempt destructive admin operations; only backend enforces roles | All `(app)` pages | Add role checks in `AppShell`; implement per-route guard against `ROLE_ADMIN`-only pages |
| COMPLIANCE-01 | Feature | **Compliance orchestrator not deployed** — Plugin is fully implemented (HIPAA, PCI, ISO27001, NIST, SOC2, custom frameworks) but not in any Dockerfile or docker-compose; compliance posture tab shows `DEMO_FRAMEWORKS` | `plugins/compliance-orchestrator/`, `docker-compose.yml` | Add compliance-orchestrator to eventprocessor Dockerfile or as sidecar service |

### 🟡 MEDIUM (Feature Partial / UX Degraded)

| ID | Area | Issue | File:Line | Remediation |
|----|------|-------|-----------|-------------|
| SEC-NEW-07 | Info Leak | `GET /api/utm-providers` is `permitAll()` and returns SAML SP certificate PEM + metadata URLs to unauthenticated callers | `SecurityConfiguration.java:121` | Protect behind authentication; SAML metadata doesn't need to be public |
| SEC-NEW-08 | Auth | JWT accepted in URL query param `?access_token=` — appears in server access logs | `JWTFilter.java`, WebSocket handshake | Remove query-param JWT extraction; use Authorization header only |
| SEC-NEW-09 | Agent | Any entity that can obtain a federation service connection key can self-register as an agent; no admin pre-approval gate | `agent_imp.go:RegisterAgent` | Add admin-approval workflow; require `REQUIRES_APPROVAL` flag before agent can stream data |
| SEC-NEW-10 | Agent | Shell commands forwarded to agents without content validation or allowlisting; arbitrary OS commands accepted | `UTMIncidentCommandWebsocket.java` | Implement command allowlist or shell-type restrictions; log all commands with user attribution |
| SEC-NEW-12 | Secrets | Hardcoded SMTP password `Admin123.` committed in `application-dev.yml` | `application-dev.yml` | Remove from source; use `SMTP_PASSWORD` env var |
| PERF-01 | Performance | **Compliance N+1 queries** — `getControlsWithLastEvaluation()` fires one OpenSearch query per control on page load (default 20 controls = 20 serial round-trips) | `UtmComplianceControlEvaluationLatestService.java` | Batch fetch evaluations with a single query; or use multi-get API |
| PERF-02 | Performance | **`getFieldValues(10000)` on every dashboard refresh** — Terms aggregation with 10,000 buckets fired every dashboard load cycle | `ElasticsearchService.java:88` | Cap at 100-500 buckets; cache result for 60 seconds |
| PERF-03 | Performance | **Alert SSE + 30s setInterval dual-firing** — During high-volume alert ingestion, SSE event triggers `loadAlerts()` AND the interval also fires; no debounce; continuous OpenSearch queries | `alerts/page.tsx` | Remove `setInterval` fallback when SSE is active; add debounce on SSE-triggered refresh |
| PERF-04 | Memory | **WebSocket `useIncidentCommandWs` hook leaks** — Unmount effect does not call `disconnect()`; WebSocket and heartbeat interval survive component unmount | `useIncidentCommandWs` hook | Add cleanup call to `disconnect()` in useEffect return |
| UX-P1-01 | UX | Integrations page (`/integrations`) shows hardcoded connected/disconnected statuses; no API calls | `integrations/page.tsx` | Wire to `GET /api/utm-integrations` and `GET /api/utm-server-modules` |
| UX-P1-02 | UX | Incidents page caps at 100 records with no pagination UI; SOC analysts cannot access older incidents | `incidents/page.tsx` | Implement pagination using `X-Total-Count` header and page controls |
| UX-P1-03 | UX | No incident assignment UI — no way to assign incident to a specific analyst | All incident pages | Add assignee selector calling `PUT /api/utm-incidents/{id}` with assignee field |
| UX-P1-04 | UX | Threat intel page (`/threat-intel`) has zero API calls despite 1,725 lines of UI code | `threat-intel/page.tsx` | Wire to `GET /api/v1/threat-intel/ioc`, `/feeds`, `/stats` endpoints |
| UX-P1-05 | UX | Admin variables page (`/admin/variables`) has no service calls; incident automation variables cannot be managed | `admin/variables/page.tsx` | Wire to `GET /api/utm-incident-variables` CRUD endpoints |
| UX-P1-06 | UX | Scanner page (`/scanner`) uses 100% `MOCK_*` static data | `scanner/page.tsx` | Wire to `GET /api/utm-network-scans` endpoints |
| UX-P1-07 | UX | Vulnerability scanner page uses 100% `MOCK_*` static data | `vulnerability-scanner/page.tsx` | Wire to actual vulnerability scan endpoints |
| DATA-01 | Architecture | No `search_after` deep pagination — SQL query path uses offset pagination (becomes slow past 10,000 hits) | `SqlQueryFilterService.java` | Implement cursor-based pagination for log search |
| DEPLOY-01 | Ops | MaxMind geo CSV files not bundled; geolocation enrichment silently does nothing if missing | `plugins/geolocation/` | Bundle default GeoLite2 CSVs in the image; add startup validation |
| FLOW-07 | Correctness | **CEL eval failures are silent** — a malformed `where` expression in any correlation rule produces zero alerts with no error logged | Rule engine | Log rule eval errors to a dedicated error index; surface in admin UI |
| FLOW-08 | Correctness | **`must_not_term` operator not implemented** — declared in the rule DSL but filter is silently omitted; rules relying on it never fire correctly | Rule engine | Implement `must_not_term` or throw on unknown operator |
| FLOW-09 | Correctness | **Dashboard auto-refresh broken** — `onRefreshTime()` has an empty callback body; `RefreshService` is never injected; dashboard never auto-updates | Angular frontend | Fix in Next.js version: ensure SSE or polling correctly triggers dashboard refresh |
| FLOW-10 | Correctness | **Index migration dependency gap** — if Liquibase migration `20241227001` was not applied, backend queries `log-*`/`alert-*` instead of `v11-log-*`/`v11-alert-*`; returns zero results with no error | Backend, Liquibase | Assert correct index pattern on startup; add migration health check |

### 🔵 LOW (Cleanup / Technical Debt)

| ID | Area | Issue | Remediation |
|----|------|-------|-------------|
| DEBT-01 | Code | `CustomComplianceResource.java` has 335 commented-out lines | Review and delete or restore |
| DEBT-02 | Code | `DefinitionSyncService`, `UtmAlertLastService`, `UtmAlertSocaiProcessingRequestService` are dead services (zero callers) | Delete with their domain classes and repositories |
| DEBT-03 | Frontend | `stat-card.tsx` and `alert-filters-panel.tsx` are unused components | Delete |
| DEBT-04 | Frontend | `/incidents/demo` convenience route should be removed before production | Delete `incidents/demo/page.tsx` |
| DEBT-05 | Code | Debug `printf("[CEL DEBUG]...")` and `printf("[CORR DEBUG]...")` statements in production rule engine | Remove before production release |
| DEBT-06 | Ops | Redis in docker-compose but backend uses only Caffeine; `maxmemory-policy: noeviction` will cause write errors when 128MB full | Either wire Redis as the cache backend or remove from compose |
| DEBT-07 | Ops | `web-pdf` and `frontend-v2` containers have no `healthcheck` in docker-compose | Add health checks |
| DEBT-08 | TLS | `InsecureSkipVerify` in Go eventprocessor OpenSearch client | Replace with proper CA cert loading |
| DEBT-09 | Config | HikariCP pool has no explicit `maximumPoolSize`; defaults to 10 | Set `maximumPoolSize: 20` or higher based on load |
| DEBT-10 | Deps | Jib plugin base image may still reference wrong Java version | Verify `eclipse-temurin:17` is used |
| DEBT-11 | Security | `SEC-NEW-13` — TFA error message includes username in exception body | Sanitize exception messages |
| DEBT-12 | Arch | `service/agent_manager` AND `service/agents_manager` duplicate package | Consolidate to single package |

---

## 10b. Page Status Report

| Route | Feature | Status | Data Source | Missing Backend | Missing Features | Recommended Roles |
|-------|---------|--------|-------------|-----------------|------------------|-------------------|
| `/dashboard` | SOC Overview | OPERATIONAL | Real API | — | SLA KPIs (MTTD/MTTR) | ALL |
| `/alerts` | Alert Triage | FUNCTIONAL | Real API | Alert log history (not wired) | Pivot-to-logs link, Alert assignment, "View related logs" | ANALYST+ |
| `/alerts/tagging-rules` | Auto-Tagging | FUNCTIONAL | Real API | — | Bulk actions | ANALYST+ |
| `/alerts/adversary` | Adversary Map | STUB | Static | `/api/adversary/*` | Entire feature | ANALYST+ |
| `/incidents` | Incident List | FUNCTIONAL | Real API | `/api/utm-incidents/users-assigned` | Pagination UI (hard-capped at 100), Assignee filter | ANALYST+ |
| `/incidents/[id]` | Investigation | DEGRADED | DEMO constant | Real incident fetch | Investigation replaces demo data, Evidence board, real timeline | ANALYST+ |
| `/offenses` | Offense Management | OPERATIONAL | Real API | — | — | ANALYST+ |
| `/logs` | Log Search | OPERATIONAL | Real API | — | Saved queries (persistence) | ANALYST+ |
| `/rules` | Detection Rules | FUNCTIONAL | Real API | — | **New rule save is broken** (P0), Rule test against historical data | ANALYST+, ADMIN |
| `/rules/coverage` | MITRE Coverage | OPERATIONAL | Real API | — | — | ANALYST+ |
| `/soar` | Playbook List | FUNCTIONAL | Real API | — | Auto-trigger config | ANALYST+ |
| `/soar/flows` | Playbook Builder | FUNCTIONAL | Real API | — | Templates marketplace | ANALYST+ |
| `/soar/audit` | Execution Audit | FUNCTIONAL | Real API | — | Export to CSV | ANALYST+ |
| `/soar/console` | IR Console | FUNCTIONAL | Real API + WS | — | Command history, WebSocket cleanup (memory leak) | ANALYST+, ADMIN |
| `/compliance` | Compliance | PARTIAL | Real API (evaluation) + DEMO (posture) | Compliance orchestrator not deployed | Posture dashboard uses demo data; PDF report schedule | MANAGER, ADMIN |
| `/uba` | User Behavior | DEGRADED | Real API + silent demo fallback | — | Demo fallback shows no error; entity timeline | ANALYST+ |
| `/active-directory` | AD Analytics | BROKEN | 100% MOCK | All AD API endpoints | Entire feature | ANALYST+, ADMIN |
| `/threat-intel` | Threat Intel | STUB | None (zero API calls) | `GET /api/v1/threat-intel/ioc`, feeds | Entire feature must be wired | ANALYST+, ADMIN |
| `/dashboard/threat-activity` | Threat Activity | STUB | Static | — | Entire feature | ANALYST+ |
| `/edr` | EDR Overview | FUNCTIONAL | Real API | — | — | ANALYST+, ADMIN |
| `/edr/[agentId]` | Agent EDR | FUNCTIONAL | Real API | — | — | ANALYST+, ADMIN |
| `/agents` | Agent List | BROKEN | Real API (wrong path) | Fix `/api/agents` → `/api/agent-manager/agents` | Agent path broken | ADMIN |
| `/agents/[id]` | Agent Detail | FUNCTIONAL | Real API | — | — | ADMIN |
| `/data-sources` | Data Sources | FUNCTIONAL | Real API | — | Source health metrics | ADMIN |
| `/data-sources/collectors` | Collector List | STUB | Empty shell | `GET /api/collectors` (path mismatch) | Entire feature | ADMIN |
| `/data-sources/groups` | Source Groups | STUB | Static | — | Entire feature | ADMIN |
| `/data-sources/collector-groups` | Collector Groups | STUB | Static | — | Entire feature | ADMIN |
| `/data-parsing` | Log Parsing | STUB | Static pipeline demo | Logstash filter/pipeline mgmt APIs | Real filter management | ADMIN |
| `/scanner` | Network Scanner | STUB | 100% MOCK | `GET /api/utm-network-scans` | Wire to real API | ANALYST+, ADMIN |
| `/vulnerability-scanner` | Vuln Scanner | STUB | 100% MOCK | Vulnerability scan API | Wire to real API | ANALYST+, ADMIN |
| `/reports` | Reports | PARTIAL | Real API (partial) | Report generation wiring verification | Schedule delivery target is blank | MANAGER, ANALYST |
| `/integrations` | Integrations | BROKEN | 100% hardcoded | `GET /api/utm-integrations` | Entire feature must be wired | ADMIN |
| `/creator` | Dashboard Creator | FUNCTIONAL | Real API | — | — | ANALYST+, ADMIN |
| `/creator/visualizations/builder` | Viz Builder | FUNCTIONAL | Real API | — | — | ANALYST+, ADMIN |
| `/opensearch` | Index Management | FUNCTIONAL | Real API | — | ISM policy editor | ADMIN |
| `/admin` | Admin Panel | FUNCTIONAL | Real API | — | — | ADMIN |
| `/admin/users` | User Management | FUNCTIONAL | Real API | `/api/users/activate/{login}` (doesn't exist) | Activate user action broken | ADMIN |
| `/admin/settings` | System Settings | BROKEN | Real API (field mismatch) | Field name alignment fix | Settings silently shows null, writes ignored | ADMIN |
| `/admin/variables` | IR Variables | STUB | None (zero calls) | `GET /api/utm-incident-variables` CRUD | Entire feature | ADMIN |
| `/admin/notifications` | Notifications | FUNCTIONAL | Real API | — | — | ADMIN |
| `/admin/connection-keys` | Connection Keys | FUNCTIONAL | Real API | — | — | ADMIN |
| `/admin/search-acceleration` | Search Accel | STUB | No calls | `GET /api/search-acceleration` | Wire to API | ADMIN |
| `/settings` | App Settings | DEGRADED | Partial mock | API keys section hardcoded | Health checks hardcoded | ADMIN |
| `/settings/soc-ai` | SOC AI | FUNCTIONAL | Real API | — | — | ADMIN |
| `/getting-started` | Onboarding | FUNCTIONAL | Real API | — | — | ADMIN |

---

## 10c. Missing Enterprise Features (Prioritized)

### Tier 1 — Would Block Enterprise Sales Today

1. **Log search saved queries (server-side)** — Analysts lose queries on page refresh; critical for shift handover and shared hunting logic
2. **Alert pivot to logs** — Click alert → see all related log events in the same time window; fundamental for triage
3. **Incident assignment and ownership** — Multiple SOC analysts work the same shift; without assignment, alerts get worked twice or not at all
4. **RBAC frontend enforcement** — ROLE_VIEWER currently has identical access to ROLE_ADMIN in the UI; fails any enterprise security audit
5. **Multi-tenancy data isolation** — If ArmorSight is deployed for multiple customers, there is no tenant-level data segmentation in OpenSearch queries; one tenant can potentially query another's indices

### Tier 2 — Expected in Any Enterprise SIEM

6. **Threat intel IOC matching at ingest** — Feed ingestion exists but IOC enrichment on incoming events not confirmed as real-time
7. **AD user risk profiling and entity timeline** — Active directory page is 100% mock; critical for identity-centric investigations
8. **External ticketing integration** (JIRA, ServiceNow) — No REST integration framework for incident escalation to external systems
9. **Scheduled report delivery** (email PDF) — Report schedule targets are blank; not confirmed working end-to-end
10. **Log retention policy management UI** — ISM policies exist in OpenSearch but no UI to configure them

### Tier 3 — Differentiators for Premium Tier

11. **Graph visualization of entity relationships** — Planned in incident workspace but shows demo data
12. **Statistical anomaly detection (UBA)** — Backend and plugin structure exists; UBA page has demo fallback; needs proper baseline computation
13. **Natural language log query** (SOC AI) — Settings page exists and wired; needs quality assessment against real queries
14. **Playbook marketplace/templates** — Framework exists but no pre-built playbook library
15. **Impossible travel detection** — UEBA signal that differentiates from basic correlation

---

## 10d. Dead Code Removal Checklist

Items confirmed safe to remove (verify nothing depends on them before deleting):

### Backend
- [ ] `service/DefinitionSyncService.java` — zero callers, zero tests
- [ ] `service/UtmAlertLastService.java` — zero callers
- [ ] `service/UtmAlertSocaiProcessingRequestService.java` — zero callers
- [ ] `domain/UtmAlertLast.java` + repository — corresponds to dead service
- [ ] `domain/UtmAlertSocaiProcessingRequest.java` + repository — corresponds to dead service
- [ ] 335 commented lines in `web/rest/compliance/CustomComplianceResource.java` — review and delete or restore

### Frontend-v2
- [ ] `components/ui/stat-card.tsx` — unused, `kpi-card.tsx` is the canonical replacement
- [ ] `components/alerts/alert-filters-panel.tsx` — unused, inline filter logic replaced it
- [ ] `app/(app)/incidents/demo/page.tsx` — development convenience route

### Angular (safe to track for deprecation once Next.js page is confirmed working)
Fully replicated features safe to eventually remove from `/frontend/`:
- `/dashboard` (Angular) — confirmed replicated in Next.js
- `/alerts` / alert management — confirmed replicated
- `/creator` — confirmed replicated
- `/soar` — confirmed replicated
- `/incidents` list — confirmed replicated
- `/getting-started` — confirmed replicated
- `/compliance` (partial) — Next.js version is partial but functional
- `/discover` / log analyzer — confirmed replicated

**Do NOT remove yet from Angular** (no Next.js equivalent):
- `/app-management/settings/rollover` — index rollover UI
- `/app-management/settings/menu-management` — nav configuration
- `/app-management/settings/identity-provider` — SSO configuration
- `/app-management/settings/app-logs` — application log viewer
- `/app-management/settings/index-pattern` — index pattern management
- `/active-directory` — Next.js version is 100% mock with no real API calls

---

## 10e. Backend Service Upgrade Path

### `user-auditor` (Java 11 → Java 17, Spring Boot 2.7 → 3.x)

Current state: Separate microservice calling `microServiceUrl` from backend (hardcoded to `http://user-auditor:8080/api`).

Steps:
1. Update `user-auditor/pom.xml`: `java.version` from `11` to `17`, `spring-boot.version` from `2.7.x` to `3.3.x`
2. Migrate from `javax.*` to `jakarta.*` imports (Spring Boot 3 breaking change)
3. Update deprecated `WebSecurityConfigurerAdapter` → `SecurityFilterChain` bean approach
4. Update Docker base image from `eclipse-temurin:11` to `eclipse-temurin:17`
5. Test: `UtmAuditorUsersResource` calls must still return correct data to main backend
6. Estimated effort: 3-4 days

### `web-pdf` (Selenium → Playwright or Elimination)

Current state: `web-pdf` is a Selenium-based PDF generator, Java 11 + Spring Boot 2.7.

Options:
- **Option A (Recommended): Playwright** — Replace Selenium with Playwright Java; better headless rendering, handles modern CSS, actively maintained; same API pattern
  - Steps: swap dependency, update browser launch code, test PDF generation end-to-end
  - Estimated effort: 2-3 days
  - Risk: Low (API surface is similar)
  
- **Option B: Eliminate** — If compliance PDF generation can be moved to a PDF library (e.g., iText, OpenPDF) without needing a browser render, eliminate the microservice entirely; reduces operational complexity
  - Applicable if compliance reports are data tables only (no complex CSS dashboards)
  - Estimated effort: 5-7 days for rewrite
  - Risk: Medium (report format may degrade)

In both cases, upgrade from Java 11 → 17 and Spring Boot 2.7 → 3.x is required as a prerequisite (same steps as `user-auditor`).

---

## 10f. Event Processor Ownership Readiness

### Current State Assessment

The event processor is built on **ThreatWinds go-sdk** (upstream open-source dependency). ArmorSight does not own the core engine; it inherits the filter/rule format, index naming conventions, and plugin protocol from upstream.

**What ArmorSight owns:**
- 36 filter YAML packs (custom, editable, hot-reloadable)
- 634 correlation rule files (custom, hot-reloadable)
- All 18 plugin implementations
- Deployment wiring (docker-compose, Dockerfiles)
- The compliance orchestrator plugin (fully custom, undeployed)

**What is upstream-dependent:**
- The CEL rule engine implementation
- gRPC server/client proto definitions for log ingestion
- OpenSearch index pattern (`v11-log-*`, `v11-alert-*`)
- The `wait -n` crash cascade behavior in `entrypoint.sh`

### Risks in Current Dependency

1. **Crash cascade** (HIGH) — A single plugin crash kills the entire container. This is an architectural risk in the entrypoint design. Fix: supervisord or per-plugin restart policy, regardless of ownership decision.

2. **Index naming coupling** (MEDIUM) — Frontend and backend use hardcoded `v11-log-*` and `v11-alert-*` patterns. Any upstream change to the index naming convention requires synchronized changes across all consumers.

3. **No UI for filter/rule state** (MEDIUM) — No visibility into which filters/rules are loaded or when they were last hot-reloaded. Debugging a missed detection requires SSH access to the container.

4. **Debug statements in production** (LOW) — `[CEL DEBUG]` and `[CORR DEBUG]` printf statements left in the upstream rule engine will flood logs at scale.

### Build-vs-Buy Assessment

**Build your own event processor:** ~6-9 months of engineering effort to replace the core engine (CEL evaluator, gRPC server, hot-reload, filter/rule parsing). Not recommended at current stage.

**Recommended path:** Stay on ThreatWinds go-sdk for the engine, but:
1. Immediately fix the crash cascade (2 days)
2. Implement per-plugin health endpoint surfaced in backend (1 week)
3. Add UI visibility into filter/rule reload state (2 days)
4. Deploy the compliance orchestrator plugin (2 days — it's fully built)
5. Document and lock the OpenSearch index schema to resist upstream drift

---

## Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| API Contract Coverage | 38% wired | ~85 wired, ~130 orphaned endpoints |
| Security Posture | 3/10 | 19 findings including 2 critical SQL injections, SAML open redirect |
| UI/UX Operational Readiness | 4.75/10 | New rules unsaveable, investigation shows demo data, AD is mock |
| Feature Completeness vs Enterprise SIEM | ~45% | Strong core detection and SOAR; compliance/UBA/AD/TI are stubs |
| Performance Risk | MEDIUM-HIGH | N+1 compliance queries, dual-poll alert storm, 10K-bucket aggregations |
| Dead Code Footprint | LOW | Only 2 unused components, 3 dead backend services |
| Deployment Reliability | LOW | Crash cascade risk, missing health checks, compliance plugin not deployed |

**Estimated effort to reach production-ready MVP (all P0/P1 issues):** 8-12 weeks of focused engineering.

---

## Recommended Sprint Plan

### Sprint 1 (Week 1-2): Security-Critical Fixes + Data Loss Prevention
- Fix SQL injection vectors (NEW-05)
- Fix SAML open redirect (NEW-04)
- Fix brute-force bypass via X-Forwarded-For (NEW-01)
- Add TFA rate limiting (NEW-02)
- Default TFA to enabled (NEW-03)
- Fix CORS in prod config (SEC-03)
- Fix JWT key persistence (SEC-02)
- Fix eventprocessor startup race: block until OpenSearch ready (FLOW-02)
- Add auth to `POST :8090/v1/inject` endpoint (FLOW-04)
- Fix Unix socket permissions to prevent local injection (FLOW-05)

### Sprint 2 (Week 3-4): Core SOC Workflows
- Fix new rule save bug (UX-P0-01)
- Wire investigation page to real incident data (UX-P0-02)
- Fix agent manager path (API-BROKEN-01)
- Fix incident status update method/path (API-BROKEN-02)
- Fix settings field name mismatch (API-BROKEN-03)
- Wire threat intel page (UX-P1-04)

### Sprint 3 (Week 5-6): Frontend RBAC + Key Features
- Add role-based route protection in AppShell (RBAC-01)
- Wire incidents pagination (UX-P1-02)
- Add incident assignment UI (UX-P1-03)
- Wire admin variables page (UX-P1-05)
- Fix alert SSE+polling dual storm (PERF-03)

### Sprint 4 (Week 7-8): Active Directory + Compliance
- Implement real AD page using auditor microservice APIs
- Deploy compliance orchestrator plugin
- Wire compliance posture tab to real data
- Fix compliance N+1 queries (PERF-01)

### Sprint 5 (Week 9-10): Reliability + Performance + Data Integrity
- Fix eventprocessor crash cascade (PLUGIN-01)
- Add plugin health checks to backend
- Add filter/rule state visibility to UI
- Fix 10K-bucket aggregations (PERF-02)
- Fix WebSocket memory leak (PERF-04)
- Fix ack-before-processing race in inputs plugin (FLOW-01)
- Implement LogQueue overflow handling / backpressure (FLOW-03)
- Implement `must_not_term` operator in rule engine (FLOW-08)
- Add rule eval error logging to admin-visible index (FLOW-07)
- Verify `v11-offense-*` index writer exists (FLOW-06)
- Add Liquibase migration health check on startup (FLOW-10)

### Sprint 6 (Week 11-12): Missing Admin Features + Angular Migration Gate
- Implement missing admin pages (rollover, SSO, menu management, index patterns)
- Wire scanner/vuln-scanner pages to real data
- Wire integrations page
- Begin Angular → Next.js migration gating (can Angular be turned off?)

---

*Report generated from full codebase audit 2026-07-08. Individual task reports in `/Users/encryptshell/GIT/UTMStack-11/.plan/audit-2026-07-08/`*
