# 10 — Executive Summary: Technology Migration Plan

**Date:** June 28, 2026  
**Platform:** UTMStack v11 — Enterprise SIEM/XDR  
**Prepared by:** Architecture & Migration Audit

---

## 1. Current Technology Stack Summary

UTMStack v11 is a multi-language microservices platform with 8 runtime services, deployed on Docker Swarm.

| Layer | Current State | Status |
|---|---|---|
| Frontend framework | Angular **7.2.0** (2018) | 🔴 EOL — no security patches since 2019 |
| Frontend runtime | Node.js **14.16.1** | 🔴 EOL — April 2023 |
| Frontend CSS build | node-sass **4.x** | 🔴 Unmaintained — blocks all Node upgrades |
| Frontend linter | TSLint **5.11.0** | 🟡 Deprecated — replaced by ESLint |
| Frontend E2E | Protractor **7.0.0** | 🟡 Deprecated |
| Backend (main) | Spring Boot **3.1.5**, Java **17** | 🟡 Functional; minor version behind |
| Backend ORM | Hibernate **5.4.32** (pinned) | 🟠 Wrong version for Spring Boot 3.1 |
| Backend ES client | `elasticsearch-rest-high-level-client` **7.12.1** | 🟠 EOL — should have been removed |
| user-auditor | Spring Boot **2.7.14**, Java **11** | 🔴 EOL — November 2023 |
| web-pdf | Spring Boot **2.7.14**, Java **11** | 🔴 EOL — November 2023 |
| Go services | Go **1.25.5 / 1.25.1** | 🟢 Current |
| Databases | PostgreSQL + OpenSearch | 🟢 Current (custom GHCR images) |
| Orchestration | Docker Swarm | 🟡 Functional; K8s preferred for scale |
| Test coverage | Near-zero | 🔴 Critical gap across all languages |

---

## 2. Recommended Updates Table

| Update | Current | Target | Priority | Risk | Business Benefit |
|---|---|---|---|---|---|
| node-sass → sass | 4.x | sass@1.x | 🔴 CRITICAL | Low | Unblocks Node upgrade |
| Node.js | 14.16.1 | 20 LTS | 🔴 CRITICAL | Low | Eliminates EOL CVE chain |
| Spring Boot (user-auditor/web-pdf) | 2.7.14 | 3.3.x | 🔴 CRITICAL | Medium | Eliminates EOL security risk |
| Java (user-auditor/web-pdf) | 11 | 17 | 🔴 CRITICAL | Medium | Eliminates EOL runtime |
| Angular | 7.2.0 | 17.x | 🔴 CRITICAL | High | Modern UI, security patches, performance |
| Hibernate | 5.4.32 | 6.4.x | 🟠 HIGH | High | Correctness + performance |
| Spring Boot (backend) | 3.1.5 | 3.3.x | 🟠 HIGH | Medium | Security patches + virtual threads |
| Bootstrap | 4.3.1 | 5.3.x | 🟠 HIGH | Medium | Security + remove jQuery |
| TypeScript | 3.2.2 | 5.4.x | 🟠 HIGH | Medium | Type safety improvements |
| TSLint → ESLint | deprecated | angular-eslint | 🟡 MEDIUM | Low | Modern tooling |
| ECharts | 4.4.0 | 5.5.x | 🟡 MEDIUM | Medium | Dashboard performance |
| Springdoc OpenAPI | 1.6.15 | 2.x | 🟡 MEDIUM | Low | Boot 3.x compatibility |
| ES REST client (remove) | 7.12.1 | remove | 🟡 MEDIUM | Low | Reduce attack surface |
| Selenium (web-pdf) | 4.5.0 | 4.20.x | 🟢 LOW | Low | Stability |
| Leaflet | 1.6.0 | 1.9.x | 🟢 LOW | Low | Minor fixes |

---

## 3. Benefits Summary

| Category | Primary benefits |
|---|---|
| **Security** | Eliminate 5 EOL components (Node 14, Angular 7, Spring Boot 2.7×2, Java 11×2); patch Spring Security 5.x CVEs |
| **Performance** | Angular Ivy (20-40% smaller bundles); ECharts 5 (better chart rendering); Spring Boot virtual threads (I/O throughput) |
| **Reliability** | Hibernate 6 correct ORM behavior; RxJS 7 subscription management |
| **Compliance** | EOL runtime components are audit liabilities for SOC 2, ISO 27001, FedRAMP |
| **Developer velocity** | Modern Angular DX; ESLint; TypeScript 5; Node 20 |
| **Maintainability** | Unified Java 17 across all services; no mixed Spring Boot versions |
| **Observability** | Spring Boot 3.2+ native OpenTelemetry auto-instrumentation |

---

## 4. Impacted Functionality by Priority

### Critical-impact migrations
1. **Security config rewrite** (Spring Boot 3.x) → affects every authenticated endpoint, every user session, all RBAC rules, SAML2 SSO
2. **Angular upgrade** → affects all 18 active UI routes, auth flow, real-time notifications, dashboard charts
3. **Hibernate upgrade** → affects all data queries: alerts, incidents, compliance, rules, users

### High-impact migrations
4. **Bootstrap 4→5** → affects all forms, modals, tables, navigation
5. **ECharts 4→5** → affects all custom dashboards and visualizations
6. **Java 11→17 (user-auditor, web-pdf)** → affects audit trail and PDF reports

### Low-impact migrations
7. **node-sass, Node.js, TSLint, Go modules** → build-time changes only; no runtime behavior change

---

## 5. Required Changes Summary

The most impactful code changes:

1. **`SecurityConfiguration.java`** — Full rewrite required. `WebSecurityConfigurerAdapter` removed in Spring Security 6. All 4 auth mechanisms (JWT, SAML2, API Key, Internal Key) must be ported to `SecurityFilterChain` bean pattern. **Do not implement without T-001 and T-002 tests passing.**

2. **All `javax.*` → `jakarta.*`** — Affects every Java file in user-auditor, web-pdf, and the main backend (~100+ files). Can be done with automated tooling but must be verified.

3. **Angular lazy loading syntax** — Every `loadChildren: './module#Class'` string must become a function import. Migration schematics handle most of this automatically.

4. **JPQL queries** — All implicit `FROM` queries in Hibernate must become explicit `SELECT ... FROM`. Must audit all 30+ service classes.

5. **Bootstrap class renames** — `ml-*`→`ms-*`, `mr-*`→`me-*`, `form-group` removal, `data-toggle`→`data-bs-toggle`. Hundreds of templates affected.

---

## 6. Risk Summary

| Risk | Level | Mitigation |
|---|---|---|
| Security config rewrite breaks auth | 🔴 CRITICAL | Write T-001/T-002 tests first; staged deploy |
| Hibernate query behavior changes | 🔴 CRITICAL | Write T-003 baseline tests; query audit |
| Angular breaks auth flow | 🔴 CRITICAL | Write T-004/T-005 tests first |
| node-sass compilation failure | 🔴 CRITICAL | Migrate sass BEFORE any Node upgrade |
| javax→jakarta incomplete | 🟠 HIGH | Automated tooling + grep verification |
| ECharts chart option changes | 🟠 HIGH | Visual regression testing per chart type |
| Bootstrap form class removal | 🟠 HIGH | Bulk find/replace + manual form testing |

---

## 7. Recommended Migration Order

```
Phase 0: Baseline capture (no code changes)
Phase 1: node-sass → sass          [1 day, Low risk]
Phase 2: Node 14 → 20              [1 day, Low risk]
Phase 3: TSLint → ESLint           [1 day, Low risk]
Phase 4: Java 17 + Boot 3.3        [3–5 days, Medium risk — user-auditor + web-pdf]
Phase 5: Angular 7 → 17            [3–6 weeks, HIGH risk — largest change]
Phase 6: Spring Boot 3.3 + Sec     [1–2 weeks, CRITICAL risk — security config]
Phase 7: Hibernate 6               [3–5 days, HIGH risk — data layer]
Phase 8: Go modules                [2–3 days, Low risk]
Phase 9: ECharts 5                 [3–5 days, Medium risk]
Phase 10: Bootstrap 5              [1–2 weeks, High risk — all UI forms]
Phase 11: Branding abstraction     [1 week, Medium risk]
```

**Total estimated duration:** 14–22 weeks (with parallel workstreams possible for phases 3–4)

---

## 8. Tests Required Before Each Phase

| Phase | Required tests before starting |
|---|---|
| Phase 5 (Angular) | T-004 auth guard tests, T-005 interceptor tests |
| Phase 6 (Spring Boot/Security) | T-001 auth flow tests, T-002 RBAC tests |
| Phase 7 (Hibernate) | T-003 alert query baseline tests |
| All phases | Phase 0 baseline capture |

---

## 9. Items That Should NOT Be Updated Yet

| Item | Reason |
|---|---|
| OpenSearch index naming (`v11-*`) | Load-bearing constant; changing requires data migration |
| gRPC proto definitions | Requires coordinated binary release and agent reinstall |
| `COOKIE_AUTH_TOKEN = 'utmauth'` | Invalidates all active sessions |
| `Utm-Internal-Key` header name | Breaking API contract for all integrations |
| Agent filesystem paths (`/opt/utmstack-linux-agent/`) | Live paths on deployed endpoints |
| `INTERNAL_KEY` / `REPLACE_KEY` | Requires coordinated deployment of all services + agent reinstall |
| Alert status integers (1–5) | Load-bearing contract between frontend, backend, and OpenSearch |
| Correlation rule YAML structure | Event processor compatibility constraint |
| Docker Swarm → Kubernetes | Requires dedicated infrastructure project |

---

## 10. Items Requiring Manual Approval Before Proceeding

The following require explicit sign-off from the lead architect or security lead:

1. **Phase 6 security config rewrite** — Any change to `SecurityConfiguration.java` requires security review and sign-off. This file controls all authentication and authorization.

2. **SAML2 SSO changes** — Any changes affecting SAML2 integration must be tested with the actual enterprise IdP and approved by the security lead.

3. **Liquibase changesets with DROP/RENAME** — Any changeset that is not purely additive requires architecture review and an explicit approved exception.

4. **gRPC proto definition changes** — These are cross-service contracts that affect deployed agents. Require architecture approval and a coordinated rollout plan.

5. **Production deploy timing for Phase 6** — Due to session invalidation, the Phase 6 backend deploy timing must be communicated to all users and approved by operations.

---

## 11. Recommended Development Workflow Using Kiro

For each migration phase:
1. Create a Kiro Spec under `.kiro/specs/migration-phase-N/`
2. Use Supervised mode for security-sensitive files (SecurityConfiguration.java, auth-related components)
3. Use Autopilot mode for mechanical changes (javax→jakarta, class renames, lazy loading syntax)
4. Run relevant steering file context for each layer:
   - Backend changes: `backend-api.md` + `security-rbac.md`
   - Frontend changes: `frontend-ui.md`
   - All changes: `testing.md` (enforce test-first discipline)
5. The `doc-sync-api-routes` hook will remind about documentation updates when controllers change
6. The `branding-violation-check` hook will catch any new hardcoded branding during code changes

---

*Do not implement any phase until explicitly approved.*  
*Reference: `docs/migration/07-step-by-step-migration-plan.md` for full implementation details.*  
*Reference: `docs/migration/08-rollback-plan.md` for all rollback procedures.*
