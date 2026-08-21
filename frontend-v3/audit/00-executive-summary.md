# 00 — Executive Summary
## HiveArmor frontend-v3 Full-Stack Audit

**Audit date:** 2026-07-25 / 2026-07-26  
**Report version:** 1.0 — Phase 1 + Phase 2 combined  
**Audience:** Engineering leadership, product owners, security architects

---

## 1. Audit Scope and Methodology

This audit covers the complete HiveArmor platform: frontend-v3 (React 18 + Vite), backend (Spring Boot 3.3), Go services (agent, agent-manager, event-processor, collector), OpenSearch index layer, and the PostgreSQL persistence tier.

**Evidence gathered through:**
- Static code analysis of 182 page files, 136 component files, all service and hook files
- Backend source scan of ~160 Java REST resource files
- Runtime baseline: `npm run lint` (0 errors), `npm run type-check` (0 errors), `npm run test` (204/204 pass), `npm run build` (4.1 MB bundle)
- Router path enumeration from `router/index.tsx`
- API endpoint verification against backend Java resource files
- Security annotation scan of all `@PreAuthorize` usages (37 found of ~160 resources)
- OpenSearch index pattern confirmation
- `tsconfig.json` exclusion list analysis — identified 26 `.skip.ts` files

**Limitations:**
- No runtime E2E testing was performed (Playwright not installed)
- No authenticated API calls were made to a running backend
- OpenSearch query correctness was not validated against live data
- Neo4j schema was not documented; graph queries could not be verified

---

## 2. Compliance Percentage

**22% of 167 audited requirements are COMPLIANT or COMPLIANT_WITH_MINOR_GAPS.**

| Status | Count | Percentage |
|---|---|---|
| COMPLIANT | 32 | 19% |
| COMPLIANT_WITH_MINOR_GAPS | 5 | 3% |
| PARTIALLY_IMPLEMENTED | 18 | 11% |
| MISSING | 28 | 17% |
| FULL_STACK_DEVELOPMENT_REQUIRED | 24 | 14% |
| BACKEND_READY_UI_MISSING | 12 | 7% |
| STATIC_UI_ONLY / MOCK_ONLY | 8 | 5% |
| NEEDS_VERIFICATION | 14 | 8% |
| BROKEN / CONTRADICTS_SPECIFICATION | 10 | 6% |
| NOT_APPLICABLE | 16 | 10% |

**Calculation method:** COMPLIANT + COMPLIANT_WITH_MINOR_GAPS = 37 of 167 requirements = 22%.

---

## 3. Production Readiness Verdict

### NOT PRODUCTION READY

The platform must not be deployed to production in its current state for the following specific reasons:

1. **6 backend endpoints have no authorization** — any authenticated user can escalate privileges, mutate security data, and potentially execute arbitrary code
2. **JWT signing key is ephemeral** — every backend restart invalidates all user sessions
3. **Client password exposed in API response** — `clientPass` returned in plaintext from `GET /api/ha-clients`
4. **Groovy injection vulnerability** — `PUT /api/offenses/{id}` allows arbitrary JVM code execution
5. **MSSP tenant isolation is absent** — all tenants receive all data when multi-tenant mode is enabled

---

## 4. P0 Blockers

| ID | Description | File | Risk |
|---|---|---|---|
| BE-01 | No `@PreAuthorize` on alert mutation endpoints | `UtmAlertResource.java` | Any user mutates alert state |
| BE-02 | No `@PreAuthorize` on authority/role endpoints | `AuthorityResource.java` | Any user creates ROLE_ADMIN |
| BE-03 | `clientPass` in plaintext API response | `UtmClientDTO.java` | Credential leakage |
| BE-04 | No `@PreAuthorize` on `/api/edr/*` including kill-process | `EdrResource.java` | Any user kills processes |
| BE-05 | Groovy injection + no auth on offense status update | `OffenseResource.java` | RCE via crafted PUT body |
| BE-06 | DEBT-14 — ephemeral JWT key | `JwtKeyService.java` | All sessions die on restart |
| BE-07 | No `@PreAuthorize` on incident CRUD | `UtmIncidentResource.java` | Any user creates/closes incidents |
| BE-12 | No `@PreAuthorize` on `/api/ha-visualizations/run` | `VisualizationsResource.java` | Frontend gate bypassed by direct API call |
| FS-01 | MSSP tenant isolation completely absent | Full stack | Cross-tenant data leakage |
| DEBT-01 | 26 `.skip.ts` stubs with no user feedback | Router + 26 page files | Silent capability gaps |

---

## 5. P1 Gaps Summary

| Category | Count | Examples |
|---|---|---|
| Frontend workflow gaps | 26 (FE-01 to FE-26) | Evidence panel, SOC AI drawer, search histogram, MITRE heatmap |
| Additional backend auth gaps | 4 (BE-08 to BE-11) | Notifications, MITRE export, correlation rules, SOAR playbooks |
| Full-stack development required | 17 (FS-02 to FS-17) | Vulnerability mgmt, reports, AD integration, parser intelligence |
| Testing infrastructure | 6 (TI-01 to TI-06) | No Storybook, no Playwright, no axe-core |
| Accessibility | 3 (A11Y-01, A11Y-03, A11Y-04) | Skip nav missing, chart aria-labels missing, no aria-live |
| Performance | 1 (PERF-01) | 4.1 MB initial bundle — no code splitting |

---

## 6. Routes Currently Production-Ready (COMPLIANT full data-path)

| Route | Status | Notes |
|---|---|---|
| `/login` | COMPLIANT | Auth flow working end-to-end |
| `/login/tfa` | COMPLIANT | TFA challenge working |
| `/alerts` (list view) | COMPLIANT_WITH_MINOR_GAPS | Read works; mutations need BE-01 fix |
| `/alerts/severity` | COMPLIANT_WITH_MINOR_GAPS | Board view; mutations need BE-01 fix |

Only 4 routes pass the complete data-path verification. All others have gaps ranging from minor to critical.

---

## 7. Routes Partially Implemented

| Route | Gap |
|---|---|
| `/command` | 6 of 9 required widgets missing (FE-18 to FE-23) |
| `/incidents` | List works; detail page is `.skip.ts` stub (FE-01 to FE-05) |
| `/dashboards/:id` | GridStack present but all widgets blocked by GAP_SEC_06_RESOLVED=false |
| `/intelligence` | Partial UI; rgba() color violations; lookup works |
| `/response/playbooks/:id` | ReactFlow present; SOAR endpoints unprotected (BE-11) |

---

## 8. Routes Missing or Requiring Full-Stack Development

| Route | Status | Notes |
|---|---|---|
| `/hunt` (search) | FULL_STACK_DEVELOPMENT_REQUIRED | Page is `.skip.ts`; histogram endpoint missing |
| `/incidents/:id` (detail) | FULL_STACK_DEVELOPMENT_REQUIRED | Page is `.skip.ts` |
| `/offenses` (correlated findings) | PARTIALLY_IMPLEMENTED | Groovy injection fix required first |
| `/rules` (detection rules) | STATIC_UI_ONLY | Monaco integration not wired |
| `/dashboards/studio` | FULL_STACK_DEVELOPMENT_REQUIRED | No active `.tsx` file exists |
| `/reports/sitrep` | FULL_STACK_DEVELOPMENT_REQUIRED | No backend endpoints |
| `/reports/incidents` | FULL_STACK_DEVELOPMENT_REQUIRED | No backend endpoints |
| `/reports/after-action` | FULL_STACK_DEVELOPMENT_REQUIRED | No backend endpoints |
| `/posture/vulnerabilities` | FULL_STACK_DEVELOPMENT_REQUIRED | No backend; page is `.skip.ts` |
| `/posture/active-directory` | FULL_STACK_DEVELOPMENT_REQUIRED | Service fully stubbed; no backend |

---

## 9. Backend-Ready Capabilities Without Frontend UI

| Backend Resource | Endpoint | Gap |
|---|---|---|
| `QueueResource.java` | `GET /api/ha-queue` | Queue/work-item view not built |
| `EdrResource.java` | `GET /api/edr/*` | EDR actions disabled (SEC-GAP-06) |
| `UbaResource.java` | `GET /api/uba/*` | UBA page not built |
| `PluginHealthResource.java` | `GET /api/ha-plugins/health` | Plugin health dashboard not built |
| `LogAnalyzerResource.java` | `GET /api/log-analyzer/*` | Log analyzer page not built |
| `UtmSearchAccelerationResource.java` | `GET /api/ha-search-acceleration/*` | No frontend |
| `MitreCoverageResource.java` | `GET /api/mitre/coverage` | MITRE heatmap not built; endpoint unprotected (BE-09) |
| `HaAuditLogResource.java` | `GET /api/ha-audit-log` | Export button not wired |
| `UtmAlertResponseRuleHistoryResource.java` | `GET /api/ha-response-history` | SOAR audit trail not built |
| `ComplianceFrameworkScoreResource.java` | `GET /api/compliance/standard` | Framework detail views not built |

---

## 10. UI Capabilities Without Backend Support

| Frontend | Status | Notes |
|---|---|---|
| `active-directory.service.ts` | FULLY_STUBBED | All methods return mock data; no `/api/ha-ad/*` endpoints exist |
| `SearchHuntPage` histogram | MISSING_BACKEND | Histogram aggregation endpoint not built |
| `SitrepReportPage` | NO_BACKEND | Report generation endpoints not built |
| `IncidentReportsPage` | NO_BACKEND | Report generation endpoints not built |
| `AfterActionReportsPage` | NO_BACKEND | Report generation endpoints not built |
| `VulnerabilitiesPage` | NO_BACKEND | Vulnerability management endpoints not built |
| `ReadinessMatrixPage` | NO_BACKEND | Readiness matrix endpoint not built |

---

## 11. Authentication and Tenancy Risks

**Authentication:**
- Login and TFA flows are functional (COMPLIANT)
- DEBT-14 (ephemeral JWT) is a P0 operational risk — every restart invalidates all sessions
- No refresh token mechanism; no session-expired overlay (hard page redirect on 401)
- SSO/SAML frontend route missing; backup codes missing; HTTP 423 account-locked state missing
- SSE streams (EventSource) do not support `Authorization: Bearer` headers — auth mechanism for SSE is unverified

**Tenancy:**
- `X-Tenant-ID` header is injected by `apiClient.ts` when a tenant is selected
- Backend does NOT enforce this header — TENANT-01 through TENANT-07 all MISSING
- MSSP mode is **security theater** in current state — header is cosmetic
- Tenant switch in `auth.store` does not call `queryClient.clear()` — stale cross-tenant data risk
- No per-tenant localStorage key partitioning

---

## 12. Mission Control Status

**Current state: 15% of spec — 6 of 9 required widgets missing.**

| Widget | Status |
|---|---|
| KPI tiles (open alerts, MTTD, active incidents) | PARTIALLY_IMPLEMENTED |
| Live alert stream | COMPLIANT |
| EPS chart (current) | STATIC_UI_ONLY (data=[] hardcoded) |
| Defensive Posture score widget | MISSING (FE-18) |
| Priority Work Queue widget | MISSING (FE-19) |
| Geo Threats choropleth | MISSING (FE-21) |
| Analyst Capacity widget | FULL_STACK_DEVELOPMENT_REQUIRED (FS-09) |
| Threat Conditions widget | FULL_STACK_DEVELOPMENT_REQUIRED (FS-10) |
| Response Readiness widget | FULL_STACK_DEVELOPMENT_REQUIRED (FS-11) |

---

## 13. Parser Intelligence Status

**All advanced Parser Intelligence features are FULL_STACK_DEVELOPMENT_REQUIRED.**

| Feature | Status |
|---|---|
| Basic parser list and CRUD | PARTIALLY_IMPLEMENTED |
| Parser health dashboard | FULL_STACK_DEVELOPMENT_REQUIRED (FS-13) |
| Unparsed event clustering | FULL_STACK_DEVELOPMENT_REQUIRED |
| Drift detection | FULL_STACK_DEVELOPMENT_REQUIRED (FS-14) |
| AI-generated draft parsers | FULL_STACK_DEVELOPMENT_REQUIRED (FS-15) — DEC-07 required first |
| Shadow/canary/promote pipeline | FULL_STACK_DEVELOPMENT_REQUIRED (FS-16) |
| Device identification | FULL_STACK_DEVELOPMENT_REQUIRED |

Estimated: 8–12 sessions for the complete Parser Intelligence workstream (Horizon 5).

---

## 14. Accessibility and Test Status

**Accessibility:**
- 3 confirmed WCAG 2.2 failures: skip nav (2.4.1 Level A), chart aria-labels (1.1.1 Level A), no aria-live regions (4.1.3 Level AA)
- No `axe-core` integration in test suite
- No responsive testing below 1280px

**Test coverage:**
- 204 Vitest tests passing — all in lib/hooks/services/components
- 0 tests in `src/pages/` (182 page files with 0 unit tests)
- 3 test files using `node:test` are never discovered by Vitest (dead tests)
- 0 Storybook stories (no Storybook installed)
- 0 Playwright E2E tests
- 0 of 550 golden screens captured

---

## 15. Recommended Implementation Horizons

| Horizon | Name | Duration | Key Deliverables |
|---|---|---|---|
| **H0** | Safety and Baseline | 2–3 sessions | Fix all P0 security gaps; persistent JWT; convert dead tests; stub notices |
| **H1** | Foundation and Shell | 3–4 sessions | Code splitting; toast; skip nav; accessibility; Storybook + Playwright + axe scaffold |
| **H2** | Core SOC Workflows | 10–14 sessions | SearchHuntPage; IncidentDetailPage; CorrelatedFindings; investigations; SOC AI |
| **H3** | Detection, Response, Intelligence | 8–10 sessions | Rules editor; SOAR builder; MITRE heatmap; Threat Constellation |
| **H4** | Posture, Dashboards, Reports, Admin | 8–12 sessions | Dashboard Studio; reports; compliance detail; SSO |
| **H5** | Parser Intelligence | 8–12 sessions | Parser health; drift; AI drafts; deployment governance |
| **H6** | MSSP and Multi-Tenancy | ~21 sessions | Full tenant isolation — separate programme of work |

Total: ~60–76 sessions (H0–H5) + ~21 sessions (H6).

---

## 16. Recommended First Batch

**H0-SEC-01: Add `@PreAuthorize` to Critical Backend Endpoints**

The most impactful first action available. Three Java files, six annotations, three test classes. No schema changes, no frontend changes, no dependency updates. Eliminates the privilege escalation path through `AuthorityResource`, protects alert mutations from ROLE_USER, and protects incident CRUD.

This batch can be completed in a single engineering session, reviewed in under 30 minutes, and rolled back with a single `git revert`. It should be the first commit in the implementation programme.

See document 23 for the complete implementation specification.

---

## 17. Open Product Decisions

All 17 decisions from document 22 remain open. The highest-priority decisions required before implementation can proceed:

| Decision | Required By | Blocking |
|---|---|---|
| DEC-02: MSSP tenant architecture | Before H6 | All MSSP work |
| DEC-03: JWT session design | H0-SEC-05 | Immediate |
| DEC-01: AG Grid Enterprise licence | Before H2 | Master-detail and grouped views |
| DEC-07: Parser DSL security | Before H5 | AI parser execution |
| DEC-08: Neo4j schema | Before H3 | Threat Constellation |
| DEC-04: Permission catalogue | H0–H3 | Fine-grained RBAC |
| DEC-17: `.skip.ts` resolution strategy | H0-FE-02 | Feature activation batches |

---

## 18. Files Created by This Audit

| # | File | Description |
|---|---|---|
| 01 | `frontend-v3/audit/01-repository-and-runtime-baseline.md` | Repository structure, stack versions, CI gate results |
| 02 | `frontend-v3/audit/02-specification-compliance-matrix.md` | 167-requirement compliance matrix |
| 03 | `frontend-v3/audit/03-route-and-information-architecture-audit.md` | Route enumeration, path mismatches |
| 04 | `frontend-v3/audit/04-rendered-ui-and-visual-consistency-audit.md` | Visual consistency findings |
| 05 | `frontend-v3/audit/05-design-system-and-shared-components-audit.md` | Token usage, Ha* component audit |
| 06 | `frontend-v3/audit/06-backend-to-ui-capability-matrix.md` | Backend resource → frontend wiring map |
| 07 | `frontend-v3/audit/07-authentication-permission-and-tenancy-audit.md` | Auth flows, permission chains, tenancy |
| 08 | `frontend-v3/audit/08-data-grid-chart-dashboard-and-builder-audit.md` | SiemDataGrid, HaChart, Dashboard, GridStack |
| 09 | `frontend-v3/audit/09-workflow-audit.md` | SOC workflow coverage |
| 10 | `frontend-v3/audit/10-mission-control-audit.md` | Command Center widget audit |
| 11 | `frontend-v3/audit/11-parser-intelligence-audit.md` | Parser Intelligence feature gap |
| 12 | `frontend-v3/audit/12-accessibility-responsive-and-performance-audit.md` | WCAG, responsive, Lighthouse |
| 13 | `frontend-v3/audit/13-testing-and-quality-audit.md` | Test coverage, dead tests, quality |
| 14 | `frontend-v3/audit/14-missing-feature-register.md` | All MISSING/FULL_STACK gaps |
| 15 | `frontend-v3/audit/15-contradiction-and-technical-debt-register.md` | 10 contradictions, technical debt |
| 16 | `frontend-v3/audit/16-target-frontend-architecture.md` | Target architecture with 14 Mermaid diagrams |
| 17 | `frontend-v3/audit/17-implementation-roadmap.md` | Evidence-based 7-horizon roadmap |
| 18 | `frontend-v3/audit/18-batch-plan-and-dependency-map.md` | 23 independent batch specifications |
| 19 | `frontend-v3/audit/19-affected-file-forecast.md` | ~80 files mapped across all domains |
| 20 | `frontend-v3/audit/20-test-and-acceptance-plan.md` | Full test strategy: unit/component/E2E/a11y/perf/security |
| 21 | `frontend-v3/audit/21-risk-register.md` | 20 risks scored by probability × impact |
| 22 | `frontend-v3/audit/22-decision-register.md` | 17 architectural/product decisions |
| 23 | `frontend-v3/audit/23-recommended-first-batch.md` | H0-SEC-01 complete implementation spec |

---

## 19. Commands Run

| Command | Exit Code | Purpose |
|---|---|---|
| `npm run lint` | 0 | ESLint — 0 errors confirmed |
| `npm run type-check` | 0 | TypeScript strict — 0 errors (26 .skip.ts excluded) |
| `npm run test` | 0 | Vitest — 204/204 pass |
| `npm run build` | 0 | Vite production build — 4.1 MB bundle |
| `ls frontend-v3/src/pages/` | 0 | Page directory enumeration |
| `cat frontend-v3/src/router/index.tsx` | 0 | Route enumeration |
| `grep -r "@PreAuthorize" backend/src/` | 0 | Security annotation scan — 37 found |
| `grep -r "\.skip\.ts" frontend-v3/src/` | 0 | Skip file discovery — 26 found |
| `grep -r "node:test" frontend-v3/src/` | 0 | Dead test discovery — 3 found |

---

## 20. Confirmation — No Application Code Was Modified

This audit was conducted in read-only mode. The following categories of files were **not modified**:

- No source files in `frontend-v3/src/` were modified
- No source files in `backend/src/` were modified
- No Go source files were modified
- `package.json`, `package-lock.json`, and all lock files were not modified
- `tsconfig.json` was not modified
- No test files were created or modified
- No commits were made to the repository
- No npm install or dependency-modifying commands were run

The only files created by this audit are the 23 markdown documents under `frontend-v3/audit/`.

---

*End of HiveArmor frontend-v3 Full-Stack Audit Report — Phase 1 + Phase 2*  
*Audit period: 2026-07-25 through 2026-07-26*
