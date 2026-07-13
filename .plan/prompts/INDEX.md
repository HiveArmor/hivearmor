# ArmorSight SIEM — Implementation Prompt Index

**Generated:** 2026-07-08  
**Total tasks:** 60 micro-tasks across 6 sprints  
**Usage:** Open any prompt file in a fresh Claude session and paste it directly. Each prompt is fully self-contained.

---

## How to use these prompts

1. Open a **new Claude Code session** from the repo root: `/Users/encryptshell/GIT/UTMStack-11/`
2. Paste the entire contents of the prompt file (or reference it with `/read .plan/prompts/sprint-01/S01-T01-...`)
3. Follow each prompt's **Acceptance Criteria** before marking complete
4. Run the **Test Commands** section after implementation
5. Open the next prompt only after the current one passes

---

## Sprint 1 — Security-Critical Fixes + Data Loss Prevention (Week 1-2)

> Must complete ALL of Sprint 1 before starting Sprint 2. These are live security vulnerabilities.

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S01-T01](sprint-01/S01-T01-sql-injection-fix.md) | SEC-NEW-05/06 | Fix SQL injection in sort + filter parameters | None |
| [S01-T02](sprint-01/S01-T02-saml-open-redirect.md) | SEC-NEW-04 | Fix SAML open redirect via X-Forwarded-Host | None |
| [S01-T03](sprint-01/S01-T03-brute-force-ip-spoofing.md) | SEC-NEW-01 | Fix brute-force bypass via X-Forwarded-For | None |
| [S01-T04](sprint-01/S01-T04-tfa-rate-limit.md) | SEC-NEW-02 | Add rate limiting to TFA verify-code endpoint | S01-T03 |
| [S01-T05](sprint-01/S01-T05-tfa-default-enabled.md) | SEC-NEW-03 | Enable TFA by default in docker-compose | None |
| [S01-T06](sprint-01/S01-T06-cors-production.md) | SEC-03 | Fix CORS wildcard in production config | None |
| [S01-T07](sprint-01/S01-T07-jwt-key-persistence.md) | SEC-02 | Persist JWT signing key across restarts | None |
| [S01-T08](sprint-01/S01-T08-eventprocessor-startup-race.md) | FLOW-02 | Block eventprocessor startup until OpenSearch ready | None |
| [S01-T09](sprint-01/S01-T09-inject-endpoint-auth.md) | FLOW-04 | Add authentication to POST :8090/v1/inject endpoint | S01-T08 |
| [S01-T10](sprint-01/S01-T10-unix-socket-permissions.md) | FLOW-05 | Secure Unix socket between inputs and event-processor | None |

---

## Sprint 2 — Core SOC Broken Workflows (Week 3-4)

> Security sprint must be complete. These fix analyst-blocking bugs.

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S02-T01](sprint-02/S02-T01-rule-save-fix.md) | UX-P0-01 | Fix new correlation rule save (null guard bug) | None |
| [S02-T02](sprint-02/S02-T02-investigation-real-data.md) | UX-P0-02 | Wire investigation workspace to real incident data | None |
| [S02-T03](sprint-02/S02-T03-agents-path-fix.md) | API-BROKEN-01 | Fix agent manager API path mismatch | None |
| [S02-T04](sprint-02/S02-T04-incident-status-fix.md) | API-BROKEN-02 | Fix incident status update method/path/body | None |
| [S02-T05](sprint-02/S02-T05-settings-field-names.md) | API-BROKEN-03 | Fix settings page field name mismatch | None |
| [S02-T06](sprint-02/S02-T06-password-in-url.md) | SEC-01 | Change check-credentials from GET to POST | None |
| [S02-T07](sprint-02/S02-T07-threat-intel-wire.md) | UX-P1-04 | Wire threat intel page to real API | None |
| [S02-T08](sprint-02/S02-T08-collectors-path-fix.md) | API-BROKEN | Fix collectors page API path | S02-T03 |

---

## Sprint 3 — Frontend RBAC + Key UX Features (Week 5-6)

> Sprint 2 must be complete. Authentication must be stable (Sprint 1).

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S03-T01](sprint-03/S03-T01-rbac-route-guards.md) | RBAC-01 | Add role-based route protection to AppShell | Sprint 1, S02-T06 |
| [S03-T02](sprint-03/S03-T02-incidents-pagination.md) | UX-P1-02 | Add pagination to incidents list | None |
| [S03-T03](sprint-03/S03-T03-incident-assignment.md) | UX-P1-03 | Add incident assignment UI | S03-T02 |
| [S03-T04](sprint-03/S03-T04-admin-variables-wire.md) | UX-P1-05 | Wire admin variables page to API | S03-T01 |
| [S03-T05](sprint-03/S03-T05-alert-polling-fix.md) | PERF-03 | Remove dual SSE+interval alert polling storm | None |
| [S03-T06](sprint-03/S03-T06-integrations-wire.md) | UX | Wire integrations page to API | S03-T01 |
| [S03-T07](sprint-03/S03-T07-scanner-wire.md) | UX-P1-06 | Wire network scanner page to real API | S03-T01 |
| [S03-T08](sprint-03/S03-T08-vuln-scanner-wire.md) | UX-P1-07 | Wire vulnerability scanner page to real API | S03-T01 |

---

## Sprint 4 — Active Directory + Compliance Deployment (Week 7-8)

> Sprint 3 must be complete. Requires user-auditor microservice to be running.

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S04-T01](sprint-04/S04-T01-active-directory-wire.md) | UX-P0-03 | Implement real Active Directory page | None |
| [S04-T02](sprint-04/S04-T02-compliance-plugin-deploy.md) | COMPLIANCE-01 | Deploy compliance orchestrator plugin | None |
| [S04-T03](sprint-04/S04-T03-compliance-posture-wire.md) | COMPLIANCE-01 | Wire compliance posture tab to real data | S04-T02 |
| [S04-T04](sprint-04/S04-T04-compliance-n-plus-1.md) | PERF-01 | Fix compliance N+1 OpenSearch queries | S04-T02 |
| [S04-T05](sprint-04/S04-T05-user-activate-fix.md) | API | Fix user activate endpoint (404 missing) | None |
| [S04-T06](sprint-04/S04-T06-user-auditor-upgrade.md) | DEBT | Upgrade user-auditor Java 11 → 17 | S04-T01 |

---

## Sprint 5 — Reliability, Performance & Data Integrity (Week 9-10)

> Sprint 4 must be complete. Affects production data pipeline.

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S05-T01](sprint-05/S05-T01-plugin-crash-cascade.md) | PLUGIN-01 | Fix eventprocessor plugin crash cascade | None |
| [S05-T02](sprint-05/S05-T02-plugin-health-checks.md) | OPS | Add plugin health endpoints to backend UI | S05-T01 |
| [S05-T03](sprint-05/S05-T03-dashboard-aggregation-cap.md) | PERF-02 | Cap 10K-bucket aggregations + caching | None |
| [S05-T04](sprint-05/S05-T04-websocket-memory-leak.md) | PERF-04 | Fix WebSocket memory leak in IR console | None |
| [S05-T05](sprint-05/S05-T05-ack-before-processing.md) | FLOW-01 | Fix ack-before-processing race in inputs plugin | None |
| [S05-T06](sprint-05/S05-T06-logqueue-backpressure.md) | FLOW-03 | Implement LogQueue backpressure / overflow disk buffer | S05-T05 |
| [S05-T07](sprint-05/S05-T07-must-not-term-operator.md) | FLOW-08 | Implement must_not_term rule operator | None |
| [S05-T08](sprint-05/S05-T08-rule-eval-error-logging.md) | FLOW-07 | Log CEL rule evaluation errors to admin index | S05-T07 |
| [S05-T09](sprint-05/S05-T09-offense-index-writer.md) | FLOW-06 | Verify/implement v11-offense-* index writer | None |
| [S05-T10](sprint-05/S05-T10-liquibase-health-check.md) | FLOW-10 | Add Liquibase index migration health check | None |
| [S05-T11](sprint-05/S05-T11-hikaricp-pool-size.md) | DEBT-09 | Set explicit HikariCP pool size | None |
| [S05-T12](sprint-05/S05-T12-tls-ssl-fixes.md) | SEC-04 | Fix trust-all TLS in Java RestTemplate + Go agent | None |

---

## Sprint 6 — Missing Admin Pages + Angular Migration Gate (Week 11-12)

> Sprint 5 must be complete. Final MVP hardening.

| File | Task ID | Title | Dependencies |
|------|---------|-------|-------------|
| [S06-T01](sprint-06/S06-T01-admin-search-accel.md) | UX | Wire search acceleration admin page | None |
| [S06-T02](sprint-06/S06-T02-sso-admin-page.md) | ADMIN | Build SSO/identity-provider admin page in Next.js | Sprint 3 RBAC |
| [S06-T03](sprint-06/S06-T03-menu-management.md) | ADMIN | Build menu management admin page in Next.js | S06-T02 |
| [S06-T04](sprint-06/S06-T04-index-rollover-ui.md) | ADMIN | Build index rollover UI (migrated from Angular) | None |
| [S06-T05](sprint-06/S06-T05-saved-log-queries.md) | ENT-01 | Implement saved log queries (server-side persistence) | None |
| [S06-T06](sprint-06/S06-T06-alert-pivot-to-logs.md) | ENT-02 | Implement alert → pivot to related logs | None |
| [S06-T07](sprint-06/S06-T07-dead-code-removal.md) | DEBT | Remove all confirmed dead code + demo routes | Sprint 3+ |
| [S06-T08](sprint-06/S06-T08-docker-health-checks.md) | DEBT-07 | Add health checks to all docker-compose services | None |
| [S06-T09](sprint-06/S06-T09-maxmind-bundle.md) | DEPLOY-01 | Bundle MaxMind GeoLite2 CSVs in eventprocessor image | None |
| [S06-T10](sprint-06/S06-T10-redis-or-remove.md) | DEBT-06 | Wire Redis as cache backend or remove from compose | None |

---

## Final Validation

| File | Title |
|------|-------|
| [PROD-VALIDATION.md](PROD-VALIDATION.md) | Production readiness validation — run after all 6 sprints complete |

---

*All prompts reference the ArmorSight SIEM codebase at `/Users/encryptshell/GIT/UTMStack-11/`*
*Audit source: `.plan/audit-2026-07-08/`*
