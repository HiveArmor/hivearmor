# 19 — Affected File Forecast
## HiveArmor frontend-v3

**Audit date:** 2026-07-26  
**Author:** Phase 2 audit  
**Purpose:** For every batch defined in document 18, forecast which files will be created or modified. Actual paths used where confirmed by Phase 1 audit; forecast paths marked `[FORECAST]`.

Legend: **E** = existing file, **N** = new file to be created, **R** = file to be removed/replaced

---

## Domain: Authentication and Security (Backend Java)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `backend/src/main/java/com/hivearmor/web/rest/UtmAlertResource.java` | E | H0-SEC-01 | Add `@PreAuthorize` to 4 mutation methods | HIGH | All alert workflows | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/AuthorityResource.java` | E | H0-SEC-02 | Add `@PreAuthorize("hasRole('ADMIN')")` to all CRUD | HIGH | Role management UI | Security lead |
| `backend/src/main/java/com/hivearmor/service/dto/UtmClientDTO.java` | E | H0-SEC-03 | Remove `clientPass` field | HIGH | Any UI rendering client data | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/UtmClientResource.java` | E | H0-SEC-03 | Verify no residual `clientPass` serialization | MED | — | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/OffenseResource.java` | E | H0-SEC-04 | Replace Groovy evaluator; add `@PreAuthorize` | HIGH | Correlated findings | Security + Arch lead |
| `backend/src/main/java/com/hivearmor/security/jwt/JwtKeyService.java` | E | H0-SEC-05 | Read key from env var instead of generating | HIGH | All auth sessions | Backend lead |
| `backend/src/main/java/com/hivearmor/web/rest/UtmIncidentResource.java` | E | H0-SEC-06 | Add `@PreAuthorize` to CRUD methods | HIGH | Incident workflows | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/VisualizationsResource.java` | E | H0-SEC-07 | Add `@PreAuthorize` to `run` endpoint | HIGH | Dashboard widgets | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/UtmNotificationResource.java` | E | H0-SEC-08 | Add `@PreAuthorize("hasRole('ADMIN')")` | MED | Notification config UI | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/CorrelationRuleResource.java` | E | H0-SEC-08 | Add `@PreAuthorize` for SOC_MANAGER, ADMIN | HIGH | Detection rules editor | Security lead |
| `backend/src/main/java/com/hivearmor/web/rest/SoarPlaybookResource.java` [FORECAST] | E | H0-SEC-08 | Add `@PreAuthorize` for SOC_MANAGER, ADMIN | HIGH | SOAR playbook builder | Security lead |
| `backend/src/test/UtmAlertResourceSecurityTest.java` [FORECAST] | N | H0-SEC-01 | Security unit tests for alert mutations | LOW | — | Backend QA |
| `backend/src/test/AuthorityResourceSecurityTest.java` [FORECAST] | N | H0-SEC-02 | Security unit tests for authority CRUD | LOW | — | Backend QA |

---

## Domain: Foundation (Router, App Shell, Providers)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/router/index.tsx` | E | H1-FND-01 | Wrap all page imports in `React.lazy()` | HIGH | Every page route | Frontend lead |
| `frontend-v3/src/components/app-layout/AppLayout.tsx` | E | H1-FND-01, H1-FND-02, H1-FND-03 | Add Suspense wrapper; mount ToastStack; add skip nav | HIGH | All protected pages | Frontend lead |
| `frontend-v3/src/components/app-suspense-fallback/AppSuspenseFallback.tsx` | N | H1-FND-01 | New route loading fallback spinner | LOW | — | Frontend |
| `frontend-v3/src/components/toast/ToastStack.tsx` | E | H1-FND-02 | Wire toastStore to PatternFly AlertGroup | MED | All toast notifications | Frontend |
| `frontend-v3/src/components/engineering-notice/EngineeringNotice.tsx` | N | H0-FE-02 | Visible stub notice for unimplemented routes | LOW | All stub pages | Frontend |

---

## Domain: Design System (Tokens, CSS, Shared Components)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/components/charts/HaChart.tsx` | E | H1-FND-03 | Add `aria-label` prop; propagate to render | MED | All chart instances | Accessibility |
| `frontend-v3/src/pages/intelligence/HiveIntelligencePage.tsx` | E | H3-INTEL-02 | Replace `rgba()` with `color-mix()` (DESIGN-02) | LOW | Brand consistency | Design system |
| `frontend-v3/src/pages/command-center/CommandCenterPage.tsx` | E | H2 + H3 | Fix inline rgba(); wire EPS data; add missing widgets | MED | Command Center | Frontend lead |

---

## Domain: Core SOC Workflows (Alerts, Incidents, Search, Investigations)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/search/SearchHuntPage.tsx` | N | H2-SEARCH-01 | New implementation replacing skip stub | MED | Search/hunt feature | Frontend |
| `frontend-v3/src/pages/search/SearchHuntPage.skip.ts` | R | H2-SEARCH-01 | Removed when active implementation exists | LOW | — | Frontend lead |
| `frontend-v3/src/services/search.service.ts` | N | H2-SEARCH-01 | New service file for search API calls | LOW | — | Frontend |
| `frontend-v3/src/pages/incidents/IncidentDetailPage.tsx` | N | H2-INCIDENT-01 | New full implementation | HIGH | Incident workflows | Frontend lead |
| `frontend-v3/src/pages/incidents/IncidentDetailPage.skip.ts` | R | H2-INCIDENT-01 | Removed | LOW | — | — |
| `frontend-v3/src/pages/incidents/components/EvidencePanel.tsx` | N | H2-INCIDENT-01 | Evidence items list panel | LOW | — | Frontend |
| `frontend-v3/src/pages/incidents/components/EvidenceBoard.tsx` | N | H2-EVIDENCE-01 | Evidence board with drag-drop | LOW | — | Frontend |
| `frontend-v3/src/pages/incidents/components/IncidentTimeline.tsx` | N | H2-INCIDENT-01 | Timeline panel using timeline endpoint | LOW | — | Frontend |
| `frontend-v3/src/pages/incidents/components/AiSummaryBlock.tsx` | N | H2-INCIDENT-01 | AI summary SSE streaming block | MED | SOC AI | Frontend |
| `frontend-v3/src/services/evidence.service.ts` | N | H2-EVIDENCE-01 | Evidence items CRUD service | LOW | — | Frontend |
| `frontend-v3/src/services/incidents.service.ts` | E | H2-INCIDENT-01 | Remove stub methods; wire real endpoints | MED | Incidents | Frontend lead |
| `frontend-v3/src/services/incidents.service.skip.ts` | R | H0-FE-01 + H2 | Convert to `.test.ts` then remove | LOW | — | — |
| `frontend-v3/src/services/incidents.service.test.ts` | N | H0-FE-01 | Vitest test replacing node:test stub | LOW | — | QA |
| `frontend-v3/src/services/alerts.service.skip.ts` | R | H0-FE-01 | Convert to `.test.ts` then remove | LOW | — | — |
| `frontend-v3/src/services/alerts.service.test.ts` | N | H0-FE-01 | Vitest test replacing node:test stub | LOW | — | QA |
| `frontend-v3/src/pages/correlated-findings/CorrelatedFindingsPage.tsx` | N | H2-FINDING-01 | New implementation | MED | Offense/finding views | Frontend |

---

## Domain: Detection and Response

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/detection/DetectionRulesPage.tsx` | N | H3-DETECT-01 | New full implementation | MED | Detection rules | Frontend |
| `frontend-v3/src/pages/detection/components/RuleEditorPanel.tsx` | N | H3-DETECT-01 | Monaco-based YAML editor | MED | Rule editing | Frontend |
| `frontend-v3/src/pages/detection/components/MitreMappingPanel.tsx` | N | H3-DETECT-01 | MITRE ATT&CK technique picker | LOW | MITRE heatmap | Frontend |
| `frontend-v3/src/pages/detection/components/SigmaSyncPanel.tsx` | N | H3-DETECT-01 | Sigma sync trigger + status | LOW | — | Frontend |
| `frontend-v3/src/pages/response/PlaybookBuilderPage.tsx` | E | H3-RESPONSE-01 | Complete partial ReactFlow implementation | HIGH | SOAR workflows | Frontend lead |
| `frontend-v3/src/pages/detection/MitreCoverageHeatmapPage.tsx` | N | H3-INTEL-01 | New ECharts heatmap page | LOW | MITRE coverage | Frontend |

---

## Domain: Posture and Compliance

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/posture/VulnerabilitiesPage.tsx` | N | H4-POSTURE-01 | New implementation; backend also required | MED | Vuln management | Frontend + Backend |
| `frontend-v3/src/pages/posture/VulnerabilitiesPage.skip.ts` | R | H4-POSTURE-01 | Removed | LOW | — | — |
| `frontend-v3/src/pages/compliance/ComplianceFrameworkDetailPage.tsx` [FORECAST] | N | H4-POSTURE-02 | Framework detail view | LOW | Compliance | Frontend |

---

## Domain: Dashboards and Reports

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/dashboards/DashboardStudioPage.tsx` | N | H4-DASH-01 | New build (no active .tsx counterpart) | HIGH | Dashboard creation | Frontend lead |
| `frontend-v3/src/pages/dashboards/DashboardStudioRenderers.tsx` | N | H4-DASH-01 | Widget renderer registry | MED | All dashboard widgets | Frontend lead |
| `frontend-v3/src/pages/dashboards/DashboardStudioPage.skip.ts` | R | H4-DASH-01 | Removed | LOW | — | — |
| `frontend-v3/src/pages/dashboards/DashboardViewPage.tsx` | E | H0-SEC-07 | Set `GAP_SEC_06_RESOLVED = true` | HIGH | All dashboard widgets | Frontend lead |
| `frontend-v3/src/pages/reports/SitrepReportPage.tsx` | N | H4-REPORT-01 | New implementation | MED | Reports | Frontend |
| `frontend-v3/src/pages/reports/IncidentReportsPage.tsx` | N | H4-REPORT-01 | New implementation | MED | Reports | Frontend |
| `frontend-v3/src/pages/reports/AfterActionReportsPage.tsx` | N | H4-REPORT-01 | New implementation | MED | Reports | Frontend |

---

## Domain: Administration

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/admin/LoginPage.tsx` | E | H4-ADMIN-02 | Add SSO redirect entry point | MED | Auth flows | Frontend + Security |
| `frontend-v3/src/services/active-directory.service.ts` | E | H4-ADMIN-03 | Add PLACEHOLDER comments; do not import until backend ready | LOW | AD integration | Frontend lead |

---

## Domain: Parser Intelligence

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/pages/parsers/ParserHealthPage.tsx` [FORECAST] | N | H5-PARSER-01 | New parser health dashboard | LOW | Parser admin | Frontend |
| `frontend-v3/src/services/parser-health.service.ts` [FORECAST] | N | H5-PARSER-01 | Parser health API client | LOW | — | Frontend |
| `frontend-v3/src/pages/parsers/ParserDeploymentLifecyclePage.tsx` [FORECAST] | N | H5-PARSER-04 | Shadow/canary/promote UI | MED | Parser governance | Frontend + Backend |

---

## Domain: Tests (Vitest, Storybook, Playwright)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `frontend-v3/src/services/incidents.service.test.ts` | N | H0-FE-01 | Replace node:test stub | LOW | — | QA |
| `frontend-v3/src/services/alerts.service.test.ts` | N | H0-FE-01 | Replace node:test stub | LOW | — | QA |
| `frontend-v3/src/pages/incidents/IncidentDetailPage.test.tsx` [FORECAST] | N | H2-INCIDENT-01 | Page test with axe | LOW | — | QA |
| `frontend-v3/.storybook/main.ts` | N | H1-TEST-01 | Storybook configuration | LOW | — | QA lead |
| `frontend-v3/.storybook/preview.ts` | N | H1-TEST-01 | Import tokens.css; PatternFly decorators | LOW | All stories | QA lead |
| `frontend-v3/playwright.config.ts` | N | H1-TEST-01 | Playwright configuration | LOW | — | QA lead |
| `frontend-v3/src/test/setup-axe.ts` | N | H1-TEST-01 | axe-core test setup | LOW | All page tests | Accessibility |
| `frontend-v3/e2e/login.spec.ts` [FORECAST] | N | H1-TEST-01 | Login E2E test | LOW | — | QA |
| `frontend-v3/e2e/alert-triage.spec.ts` [FORECAST] | N | H1-TEST-01 | Alert triage E2E test | LOW | — | QA |
| `frontend-v3/src/components/**/*.stories.tsx` [FORECAST] | N | H1-TEST-01 | Stories for 9+ Ha* components | LOW | — | QA |

---

## Domain: Database (Liquibase)

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `backend/src/main/resources/config/liquibase/changelog/2026NNN001_add_tenant_id_alerts.xml` [FORECAST] | N | H6-TENANT-01 | Add tenant_id to UtmAlert | HIGH | All alert queries | DBA + Arch |
| `backend/src/main/resources/config/liquibase/changelog/2026NNN002_add_tenant_id_incidents.xml` [FORECAST] | N | H6-TENANT-01 | Add tenant_id to UtmIncident | HIGH | All incident queries | DBA + Arch |
| `backend/src/main/resources/config/liquibase/master.xml` | E | H6-TENANT-01 | Include new changelogs | HIGH | DB bootstrap | DBA |

---

## Domain: OpenSearch

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| All OpenSearch query builder classes in `backend/src/main/java/com/hivearmor/service/` [FORECAST] | E | H6-TENANT-02 | Inject tenant_id term filter into every DSL query | HIGH | All log queries | Backend lead + Arch |

---

## Domain: Infrastructure

| Path | E/N | Batch | Why It Changes | Risk | Shared Impact | Review Owner |
|---|---|---|---|---|---|---|
| `local-dev/.env.example` | E | H0-SEC-05 | Add `JWT_SECRET=` entry | LOW | All devs onboarding | Backend lead |
| `local-dev/.env` | E | H0-SEC-05 | Set `JWT_SECRET` value (not committed) | LOW | Local dev only | — |
| `.github/workflows/pr-checks.yml` [FORECAST] | E | H1-TEST-01 | Add Playwright + Storybook jobs | LOW | All PRs | DevOps |

---

## High-Risk File Summary

Files classified HIGH risk that require cross-team review before modification:

| File | Risk Reason |
|---|---|
| `router/index.tsx` | Central routing for all 182 pages — breaking change here affects every route |
| `AppLayout.tsx` | Shell wrapper for all protected pages — failure breaks entire app |
| `apiClient.ts` | All API calls flow through here — regression affects every feature |
| `auth.store.ts` | Auth state for entire application — regression logs out all users |
| `JwtKeyService.java` | JWT signing — wrong implementation invalidates all sessions |
| `OffenseResource.java` | Contains RCE vulnerability — fix must be reviewed by security lead |
| `DashboardViewPage.tsx` | `GAP_SEC_06_RESOLVED` change enables all widgets — high blast radius |
| Any Liquibase changelog | Changesets are immutable once merged — errors require new reversal changeset |
