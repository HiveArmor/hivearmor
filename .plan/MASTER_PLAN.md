# ArmorSight Enterprise SIEM — Master Build Plan
**Last updated:** 2026-07-05  
**Audited by:** Claude (Sonnet 4.6)  
**Goal:** Build a globally competitive enterprise SIEM rivaling Splunk/QRadar

---

## Project Context (Quick Reference)

| Item | Value |
|---|---|
| Root | `/Users/encryptshell/GIT/UTMStack-11/` |
| Backend | Spring Boot 3.3 + JHipster 8, port 8088, package `com.nilachakra` |
| New Frontend | `/frontend-v2/` — Next.js 14 + React 18 + Tailwind |
| Legacy Frontend | `/frontend/` — Angular 17, being phased out |
| DB | PostgreSQL 5438, database `nilachakra` |
| Search | OpenSearch 9200 |
| Agents | Go binaries in `agent/`, `agent-manager/`, `utmstack-collector/` |
| Auth | JWT, `localStorage` key `utm_token`, POST `/api/authenticate` |
| API Proxy | Next.js catch-all at `src/app/api/[...path]/route.ts` → port 8088 |
| Local creds | admin / localdev123! |

---

## AI Tool Folders — DEFER (review at production deployment)
- `.cursor-audit/` — keep for now
- `.kiro/` — keep for now  
- `.github/ai-prompts/` — keep for now

---

## Critical Security Fixes (Block-0 — do before anything else)

| ID | Fix | File | Effort |
|---|---|---|---|
| SEC-01 | Password in GET query param → POST | `AccountResource.java` | 1h |
| SEC-02 | JWT signing key persisted in DB | `TokenProvider.java` | 2h |
| SEC-03 | CORS wildcard in prod config | `application-prod.yml` | 30min |
| SEC-04 | gRPC insecure TLS → mutual TLS | `GrpcConfiguration.java` | 4h |

---

## Upstream-Locked Services — Ownership Plan

Services currently pulled from `ghcr.io/utmstack/utmstack/`:
- `eventprocessor` — **highest value to own**
- `agent-manager` — already have source in `agent-manager/`
- `user-auditor` — have source in `user-auditor/`
- `web-pdf` — have source in `web-pdf/`
- `postgres` — use standard `postgres:16` image
- `opensearch` — use standard `opensearchproject/opensearch:2.18.0`

**Plan:** Feature `OWN-01` through `OWN-06` — see features file.

---

## Feature Priority Order (SOC Impact × Effort)

### Tier 1 — Foundation (do first, everything depends on these)
1. **F-01: Live Alert Streaming** — SSE wiring, real-time badge, new-alert banner
2. **F-02: Reports Generation & Scheduling** — wire stub page to real backend
3. **F-03: Log Analyzer Saved Queries + Pivot** — missing from new UI
4. **F-04: Logstash Pipeline & Filter Management** — ops-critical
5. **F-05: Getting Started Wizard** — onboarding, new installs

### Tier 2 — SOC Workflows
6. **F-06: Compliance Framework (Full)** — templates, control eval, history
7. **F-07: Vulnerability Scanner (Real)** — wire mock page to real API
8. **F-08: Network Asset Scanner (Real)** — wire mock page to real API
9. **F-09: Active Directory Deep Features** — tracker, notifications, user detail
10. **F-10: Incident Response — Interactive Console** — SOAR console

### Tier 3 — Admin & Config
11. **F-11: App Management Suite** — health checks, metrics, identity provider, index patterns, connection keys
12. **F-12: Data Parsing (Logstash UI)** — pipeline editor with real API
13. **F-13: Index Lifecycle Management** — rollover config + ISM policies
14. **F-14: SAML/SSO Identity Provider Config** — enterprise auth

### Tier 4 — Intelligence
15. **F-15: AI SOC Assistant** — soc-ai plugin wired to alert detail
16. **F-16: UBA Real Behavioral Models** — replace demo data
17. **F-17: MITRE ATT&CK Coverage Heatmap** — from real rule-technique mapping
18. **F-18: Threat Intelligence Auto-Enrichment** — enrich alerts with TI feeds

### Tier 5 — Architecture & Scale
19. **ARCH-01: Redis Caching Layer** — dashboard KPIs, alert stats
20. **ARCH-02: OpenSearch Search Acceleration** — faster log queries
21. **ARCH-03: Agent Log Delivery Guarantee** — local SQLite queue + retry
22. **ARCH-04: API Versioning** — `/api/v1/` prefix strategy
23. **ARCH-05: Multi-tenancy** — per-client index namespacing

### Tier 6 — Own The Stack
24. **OWN-01: Own eventprocessor** — fork/rewrite correlation engine
25. **OWN-02: Own agent-manager** — already have source, build local image
26. **OWN-03: Own user-auditor** — merge into main backend
27. **OWN-04: Own web-pdf** — replace Selenium with Puppeteer service
28. **OWN-05: Own postgres/opensearch** — switch to standard images

---

## Phase Groupings

| Phase | Features | Duration | Outcome |
|---|---|---|---|
| Phase 0 | SEC-01..04 | 1 week | Security baseline |
| Phase 1 | F-01, F-02, F-03 | 2 weeks | Live alerts, reports, log search |
| Phase 2 | F-04, F-05, F-07, F-08 | 3 weeks | Ops workflows, scanner real data |
| Phase 3 | F-06, F-09, F-10, F-11 | 4 weeks | Compliance, AD, incident response, admin |
| Phase 4 | F-12, F-13, F-14, F-15 | 4 weeks | Data pipeline, auth, AI assist |
| Phase 5 | F-16, F-17, F-18, ARCH-01..05 | 6 weeks | Intelligence + performance |
| Phase 6 | OWN-01..05 | 8 weeks | Full stack ownership |

---

## Feature Files Index

Each feature has a dedicated file at `.plan/features/F-XX-name.md`

| File | Feature |
|---|---|
| `F-01-live-alert-streaming.md` | Live SSE alert stream |
| `F-02-reports.md` | Reports generation & scheduling |
| `F-03-log-analyzer.md` | Log analyzer saved queries + pivot |
| `F-04-logstash-management.md` | Pipeline & filter management |
| `F-05-getting-started.md` | Getting started wizard |
| `F-06-compliance-full.md` | Full compliance framework |
| `F-07-vuln-scanner.md` | Vulnerability scanner (real) |
| `F-08-asset-scanner.md` | Network asset scanner (real) |
| `F-09-active-directory.md` | AD deep features |
| `F-10-incident-console.md` | Interactive incident console |
| `F-11-app-management.md` | App management suite |
| `F-12-data-parsing.md` | Data parsing / logstash UI |
| `F-13-index-lifecycle.md` | Index lifecycle management |
| `F-14-saml-sso.md` | SAML/SSO identity provider |
| `F-15-soc-ai.md` | AI SOC assistant |
| `F-16-uba-ml.md` | UBA behavioral models |
| `F-17-mitre-heatmap.md` | MITRE ATT&CK heatmap |
| `F-18-ti-enrichment.md` | Threat intel auto-enrichment |
| `ARCH-01-redis-cache.md` | Redis caching layer |
| `ARCH-02-search-accel.md` | OpenSearch acceleration |
| `ARCH-03-agent-queue.md` | Agent delivery guarantee |
| `OWN-01-eventprocessor.md` | Own eventprocessor |
| `OWN-02-agent-manager.md` | Own agent-manager |
| `OWN-03-pdf-service.md` | Own web-pdf service |

---

## Token-Optimized Session Prompts

See bottom of each `F-XX-*.md` file for the copy-paste session prompt.
Also see `PROMPTS_INDEX.md` for all prompts in one place.
