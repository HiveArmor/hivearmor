# 14 — Missing Feature Register
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Source:** Documents 02, 06, 09, 10, 11, 12, 13

This register enumerates every MISSING or FULL_STACK_DEVELOPMENT_REQUIRED requirement identified in the audit. Each entry includes classification, severity, dependencies, and recommended implementation batch.

---

## Group A: Frontend-Only Gaps (Backend Ready, No Security Blocker)

These items have confirmed backend endpoints, no open security gaps blocking them, and are pure frontend implementation work.

| Gap ID | Requirement | Current State | Frontend Gap | Backend Gap | Security Impact | Tenant Impact | UX Impact | Severity | Dependencies | Recommended Batch |
|---|---|---|---|---|---|---|---|---|---|---|
| FE-01 | Evidence items panel in incident detail | EvidenceCard component exists; not wired | Wire to GET/POST/PUT/DELETE /api/ha-incidents/{id}/evidence-items | None — VERIFIED PROTECTED | None | PARTIAL (no tenant_id yet) | HIGH — analysts cannot attach evidence | P1 | IncidentDetailPage unstubbed | Batch 2 (Incident workflow) |
| FE-02 | Evidence boards in incident detail | No EvidenceBoard component | Build EvidenceBoard component | None — VERIFIED PROTECTED | None | PARTIAL | HIGH | P1 | FE-01 | Batch 2 |
| FE-03 | Evidence relationships graph | No EvidenceRelationshipGraph | Build relationship graph (ECharts force-graph) | None — VERIFIED PROTECTED | None | PARTIAL | HIGH | P1 | FE-02 | Batch 2 |
| FE-04 | Incident AI summary | No AiSummaryBlock | Build AiSummaryBlock with SSE streaming | None — VERIFIED PROTECTED | PARTIAL | MEDIUM | P2 | IncidentDetailPage unstubbed | Batch 2 |
| FE-05 | Incident timeline panel | No IncidentTimeline component | Build timeline using GET /api/ha-incidents/{id}/timeline | None — VERIFIED PROTECTED | PARTIAL | HIGH | P1 | IncidentDetailPage unstubbed | Batch 2 |
| FE-06 | Investigation session create dialog | No StartInvestigationDialog | Implement dialog | None — VERIFIED PROTECTED | PARTIAL | HIGH | P1 | None | Batch 3 (Investigation workflow) |
| FE-07 | Investigation session items panel | No items panel | Build items list + add-item dialog | None — VERIFIED PROTECTED | PARTIAL | HIGH | P1 | FE-06 | Batch 3 |
| FE-08 | Convert session to incident | No ConvertSessionToIncidentButton | Implement | None — VERIFIED PROTECTED | PARTIAL | HIGH | P1 | FE-06 | Batch 3 |
| FE-09 | Saved queries panel in Search & Hunt | No SavedQueriesPanel | Build panel with CRUD | None — VERIFIED PROTECTED | PARTIAL | MEDIUM | P2 | SearchHuntPage rebuilt | Batch 4 (Search) |
| FE-10 | SOC AI global chat drawer | SocAiChatDrawer not implemented | Build AI chat drawer with SSE streaming | None — VERIFIED PROTECTED (ADMIN, USER) | PARTIAL | MEDIUM — AI assistant absent | P2 | AppLayout updated | Batch 5 (AI) |
| FE-11 | SOC AI alert enrichment | No AlertEnrichButton | Implement in AlertContextDrawer | None — VERIFIED PROTECTED | PARTIAL | MEDIUM | P2 | FE-10 | Batch 5 |
| FE-12 | Sigma sync panel in detection rules | No SigmaSyncPanel | Implement ADMIN-gated panel | None — VERIFIED PROTECTED (ADMIN) | PARTIAL | MEDIUM | P2 | DetectionRulesPage unstubbed | Batch 6 (Detection) |
| FE-13 | Skip navigation link | MISSING | Add `<a href="#main-content">` to AppLayout | N/A | N/A | MEDIUM — WCAG A failure | P1 | None | Batch 0 (Quick wins) |
| FE-14 | Chart aria-label | MISSING in HaChart | Add aria-label prop to HaChart | N/A | N/A | HIGH — WCAG A failure | P1 | None | Batch 0 |
| FE-15 | Route code splitting | All routes eagerly loaded | React.lazy() + Suspense for all major pages | N/A | N/A | MEDIUM — initial load time | P1 | None | Batch 0 |
| FE-16 | Live-region for SSE alerts | No aria-live regions | Add aria-live to LiveAlertStream | N/A | N/A | MEDIUM — WCAG AA | P2 | None | Batch 0 |
| FE-17 | ECharts reduced-motion | Not implemented | Pass animation:false on prefers-reduced-motion | N/A | N/A | LOW | P2 | None | Batch 0 |
| FE-18 | Defensive Posture widget in Command Center | Not in CommandCenterPage | Build widget; wire /api/ha-posture/score | None | PARTIAL | HIGH — MC incomplete | P1 | None | Batch 1 (MC) |
| FE-19 | Priority Work Queue widget in Command Center | Not present | Build mini queue widget | None — VERIFIED PROTECTED | PARTIAL | HIGH | P1 | None | Batch 1 |
| FE-20 | Sensor Coverage widget in Command Center | Not present | Build mini sensor widget | ADMIN restriction limits | PARTIAL | MEDIUM | P2 | SensorGridPage endpoint | Batch 1 |
| FE-21 | Geo Threats widget in Command Center | Not present | Build ECharts MapChart with choropleth | None — UNPROTECTED (SEC-GAP note) | PARTIAL | MEDIUM | P2 | None | Batch 1 |
| FE-22 | Focus mode for Command Center | Not present | Implement fullscreen + nav hide toggle | N/A | N/A | LOW | P2 | None | Batch 1 |
| FE-23 | EpsChart historical data | data=[] hardcoded | Wire /api/overview/events-in-time | None | PARTIAL | HIGH — chart always blank | P1 | None | Batch 1 |
| FE-24 | Playbook delete action | No DeletePlaybookControl | Implement DELETE /api/soar/playbooks/{id} | SEC-GAP-08 must be fixed first | PARTIAL | MEDIUM | P2 | SEC-GAP-08 fix | Batch 6 |
| FE-25 | Per-tenant localStorage key namespacing | Standard (non-tenant) keys | Add userId+tenantPrefix to grid state keys | N/A | N/A | MEDIUM — grid state leaks | P1 | None | Batch 0 |
| FE-26 | Tenant switch cache invalidation | selectedTenantId change has no side effect | Call queryClient.clear() in setSelectedTenant | N/A | N/A | HIGH — stale cross-tenant data | P0 | MSSP mode | Batch 0 |

---

## Group B: Backend-Only Gaps (Frontend Ready, Backend Missing or Broken)

| Gap ID | Requirement | Current State | Frontend Gap | Backend Gap | Security Impact | Tenant Impact | UX Impact | Severity | Dependencies | Recommended Batch |
|---|---|---|---|---|---|---|---|---|---|---|
| BE-01 | @PreAuthorize on alert mutation endpoints | UNPROTECTED (SEC-GAP-01) | None | Add @PreAuthorize(ANALYST+) to all /api/ha-alerts mutations | CRITICAL | PARTIAL | None (works after fix) | P0 | MUST fix before prod | Sprint 0 (Security) |
| BE-02 | @PreAuthorize on /api/authority/* | UNPROTECTED (SEC-GAP-02) — any user can manage roles | None | Add @PreAuthorize(ADMIN) | CRITICAL | N/A | None | P0 | MUST fix before prod | Sprint 0 |
| BE-03 | Fix clientPass exposure in /api/ha-clients | clientPass returned in plaintext (SEC-GAP-03) | Never render clientPass | Remove clientPass from DTO response | CRITICAL | N/A | None | P0 | MUST fix before prod | Sprint 0 |
| BE-04 | @PreAuthorize on /api/edr/* | UNPROTECTED (SEC-GAP-06) — kill-process | EDR actions disabled in UI | Add @PreAuthorize(ADMIN) to all EDR endpoints | CRITICAL | PARTIAL | None (disabled) | P0 | Sprint 0 |
| BE-05 | @PreAuthorize on /api/offenses/{id} + Groovy fix | Groovy injection (SEC-GAP-05) | Status control disabled | Fix Groovy execution; add @PreAuthorize | CRITICAL | PARTIAL | None (disabled) | P0 | Sprint 0 |
| BE-06 | Persistent JWT signing key (DEBT-14) | Key regenerated on restart | None | Persist key in database or env var | HIGH — all sessions wiped on restart | N/A | HIGH operational impact | P0 | Sprint 0 |
| BE-07 | @PreAuthorize on /api/ha-incidents CRUD | UNPROTECTED (SEC-GAP-17) | None | Add role-based protection | HIGH | PARTIAL | None | P0 | Sprint 0 |
| BE-08 | @PreAuthorize on notification endpoints (18) | UNPROTECTED (SEC-GAP-16) | None | Add @PreAuthorize(ADMIN) | HIGH | PARTIAL | None | P1 | Sprint 0 |
| BE-09 | Fix /api/mitre/exportCoverage — no auth | No auth at all (SEC-GAP-04) | Button disabled | Add Spring Security filter | HIGH | N/A | None | P1 | Sprint 1 |
| BE-10 | @PreAuthorize on /api/correlation-rule/* | UNPROTECTED (SEC-GAP-07) | None | Add @PreAuthorize(SOC_MANAGER, ADMIN) | HIGH | PARTIAL | None | P1 | Sprint 1 |
| BE-11 | @PreAuthorize on /api/soar/playbooks/* | UNPROTECTED (SEC-GAP-08) | None | Add @PreAuthorize | HIGH | PARTIAL | None | P1 | Sprint 1 |
| BE-12 | @PreAuthorize on /api/ha-visualizations/run | UNPROTECTED (SEC-GAP-15) | GAP_SEC_06_RESOLVED=false gates this | Add @PreAuthorize(ANALYST+) | HIGH | PARTIAL | Dashboard widgets blocked | P0 | Sprint 0 |

---

## Group C: Full-Stack Development Required

| Gap ID | Requirement | Current State | Frontend Gap | Backend Gap | Security Impact | Tenant Impact | UX Impact | Severity | Dependencies | Recommended Batch |
|---|---|---|---|---|---|---|---|---|---|---|
| FS-01 | MSSP tenant isolation — all data | clientPrefix unused | No tenant selector | Add tenant_prefix to 12 tables; OpenSearch filter injection; SSE filter | CRITICAL (data leak between tenants) | COMPLETE BLOCKER | MSSP not deployable | P0 | ~21 sessions | Phase MSSP |
| FS-02 | Vulnerability Management (/posture/vulnerabilities) | VulnerabilitiesPage.skip.ts; no backend | Build VulnerabilitiesPage | Build VulnerabilityResource | None directly | PARTIAL | HIGH — CVE tracking absent | P1 | None (greenfield) | Phase Posture |
| FS-03 | Readiness Matrix (/posture/readiness) | ReadinessMatrixPage; no backend | Build matrix UI | Build /api/ha-readiness/matrix | None | PARTIAL | MEDIUM | P2 | FS-04 | Phase Posture |
| FS-04 | SITREP Report (/reports/sitrep) | SitrepReportPage.skip.ts; no backend | Build report viewer + PDF | Build /api/ha-reports/generate/sitrep | None | PARTIAL | HIGH | P1 | None | Phase Reports |
| FS-05 | Incident Report (/reports/incidents) | IncidentReportsPage.skip.ts; no backend | Build report viewer | Build /api/ha-incidents/{id}/report | None | PARTIAL | HIGH | P1 | None | Phase Reports |
| FS-06 | After-Action Review (/reports/after-action) | AfterActionReportsPage.skip.ts; no backend | Build AAR form + viewer | Build /api/ha-incidents/{id}/after-action | None | PARTIAL | HIGH | P1 | None | Phase Reports |
| FS-07 | Active Directory Integration | active-directory.service.ts fully stubbed | Remove stubs; build AD page | Build /api/ha-ad/* endpoints | None | PARTIAL | MEDIUM | P2 | AD infrastructure | Phase Posture |
| FS-08 | Search & Hunt histogram | SearchHuntPage missing; no histogram endpoint | Build histogram chart | Build histogram aggregation endpoint | None | PARTIAL | HIGH | P1 | Search page rebuilt | Phase Search |
| FS-09 | Analyst Capacity widget | Not possible | Build widget | Build capacity endpoint | None | PARTIAL | MEDIUM | P2 | None | Phase MC Advanced |
| FS-10 | Threat Conditions widget | Not possible | Build widget | Build threat-level endpoint | None | PARTIAL | MEDIUM | P2 | None | Phase MC Advanced |
| FS-11 | Response Readiness widget | Not possible | Build widget | Build readiness score endpoint | None | PARTIAL | MEDIUM | P2 | None | Phase MC Advanced |
| FS-12 | Detection Health widget | Not possible | Build widget | Build detection health endpoint | None | PARTIAL | MEDIUM | P2 | None | Phase MC Advanced |
| FS-13 | Parser health dashboard | Not possible | Build health panel | Build /api/ha-parsers/{id}/health | None | PARTIAL | HIGH | P1 | None | Phase Parser |
| FS-14 | Parser drift detection | Not possible | Build alert surface | Build drift detection in event-processor | None | PARTIAL | HIGH | P1 | Parser health | Phase Parser |
| FS-15 | AI-generated draft parsers | Not possible | Build draft workflow | Build AI parser generation | None | PARTIAL | HIGH | P1 | SOC AI infrastructure | Phase Parser AI |
| FS-16 | Parser deployment governance | Not possible | Build lifecycle UI | Build shadow/canary/promote in event-processor | None | PARTIAL | HIGH — safe deployment blocked | P1 | Parser versions | Phase Parser |
| FS-17 | MSSP masthead tenant selector | Not built | Build tenant selector | Build user-tenant association API | CRITICAL if FE-only | BLOCKER | MSSP UX absent | P0 | FS-01 (data isolation) | Phase MSSP |

---

## Group D: Testing Infrastructure Gaps

| Gap ID | Requirement | Current State | Gap | Severity | Recommended Batch |
|---|---|---|---|---|---|
| TI-01 | Convert .skip.ts node:test to Vitest | 3 files using wrong runner | Change imports to vitest; fix assertions | P1 | Batch 0 (Quick wins) |
| TI-02 | Add Storybook | Completely absent | Install and configure Storybook + stories for all shared components | P1 | Batch QA-1 |
| TI-03 | Add Playwright E2E | Completely absent | Install playwright; write login, alert triage, incident flows | P1 | Batch QA-1 |
| TI-04 | Add axe-core accessibility testing | Completely absent | Add @axe-core/react to test setup; smoke test in each page test | P1 | Batch QA-1 |
| TI-05 | Golden screen coverage (550 screens) | 0/550 | Requires Storybook + Chromatic or Playwright screenshots | P1 | Batch QA-2 |
| TI-06 | Hook test coverage | Unknown | Write tests for useAlertStream, useEpsStream, useAuthBootstrap | P2 | Batch QA-1 |

---

## Summary by Priority

| Priority | Count | Categories |
|---|---|---|
| P0 | 12 | Security fixes (BE-01..12), MSSP isolation (FS-01, FS-17), DEBT-14 (BE-06) |
| P1 | 24 | Core workflow components (FE-01..23), accessibility basics (FE-13..16), testing (TI-01..05) |
| P2 | 14 | Advanced widgets, parser intelligence, AD integration, responsive design |
| P3 | 3 | Minor cleanup, focus mode, deprecated routes |
