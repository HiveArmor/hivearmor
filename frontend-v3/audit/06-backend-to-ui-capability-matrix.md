# 06 — Backend-to-UI Capability Matrix
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** `.plan/frontend-v3-spec/visual-approval/backend-to-ui-capability-matrix.md` (verified 2026-07-22), router/index.tsx, skip.ts enumeration

**Status Key:**
- `COMPLIANT` — Backend endpoint exists and is protected; frontend is wired correctly
- `BACKEND_READY_UI_MISSING` — Backend exists; frontend route/component not built or not wired
- `PARTIALLY_IMPLEMENTED` — Both sides exist; integration incomplete
- `FULL_STACK_DEVELOPMENT_REQUIRED` — Neither side implemented
- `BROKEN` — Frontend calls the endpoint but backend has a critical security gap blocking use
- `DEPRECATED` — Old route; to be removed

---

## 1. Authentication & Session

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| POST | /api/authenticate | NONE (public) | N/A | LoginPage.tsx | COMPLIANT |
| POST | /api/authenticate (MFA) | NONE (public) | N/A | TfaPage.tsx | COMPLIANT |
| GET | /api/account | Filter chain | N/A | auth.store.ts bootstrap | COMPLIANT |
| GET | /api/ha-providers | UNPROTECTED (SEC-GAP-11) | N/A | PlatformSettingsPage | BROKEN |
| GET/POST | /api/tfa/* | Implicit only | N/A | TfaPage.tsx | PARTIALLY_IMPLEMENTED |

---

## 2. Alerts

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-alerts | UNPROTECTED (SEC-GAP-01) | NONE | AlertsListPage (alerts.service.skip.ts) | BROKEN |
| GET | /api/ha-alerts/count-open-alerts | UNPROTECTED (SEC-GAP-01) | NONE | CommandCenterPage (not wired) | BACKEND_READY_UI_MISSING |
| POST | /api/ha-alerts/status | UNPROTECTED (SEC-GAP-01) | NONE | AlertContextDrawer (partial) | BROKEN |
| POST | /api/ha-alerts/notes | UNPROTECTED (SEC-GAP-01) | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| POST | /api/ha-alerts/tags | UNPROTECTED (SEC-GAP-01) | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| POST | /api/ha-alerts/convert-to-incident | UNPROTECTED (SEC-GAP-01) | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| GET | /api/alerts/stream (SSE) | Filter chain only | NONE | useAlertStream.ts hook | PARTIALLY_IMPLEMENTED |
| GET | /api/eps/stream (SSE) | Filter chain only | NONE | useEpsStream.ts hook | PARTIALLY_IMPLEMENTED |

---

## 3. Overview / Command Dashboard

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/overview/count-alerts-today-and-last-week | UNPROTECTED | NONE | CommandCenterPage KPI tiles | PARTIALLY_IMPLEMENTED |
| GET | /api/overview/count-alerts-by-severity | UNPROTECTED | NONE | Not wired in Command Center | BACKEND_READY_UI_MISSING |
| GET | /api/overview/count-alerts-by-status | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| GET | /api/overview/top-alerts | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| GET | /api/overview/alert-timeline | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| GET | /api/overview/events-in-time | UNPROTECTED | NONE | EpsChart (data=[] empty) | BROKEN |
| GET | /api/overview/geo-threats | UNPROTECTED | NONE | Not wired (no globe widget) | BACKEND_READY_UI_MISSING |

---

## 4. Incidents

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-incidents | UNPROTECTED (SEC-GAP-17) | NONE | IncidentListPage (skip.ts) | BROKEN |
| POST | /api/ha-incidents | UNPROTECTED (SEC-GAP-17) | NONE | No dialog | BACKEND_READY_UI_MISSING |
| GET | /api/ha-incidents/{id} | UNPROTECTED (SEC-GAP-17) | NONE | IncidentDetailPage (skip.ts) | BROKEN |
| PUT | /api/ha-incidents (body) | UNPROTECTED (SEC-GAP-17) | NONE | No edit form | BACKEND_READY_UI_MISSING |
| PUT | /api/ha-incidents/{id}/priority | UNPROTECTED (SEC-GAP-17) | NONE | No priority control | BACKEND_READY_UI_MISSING |
| GET | /api/ha-incidents/{id}/timeline | VERIFIED PROTECTED | NONE | Not wired in detail page | BACKEND_READY_UI_MISSING |
| GET | /api/ha-incidents/{id}/entities | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-incidents/{id}/ai-summary | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| GET | /api/ha-incidents/sla-stats | UNPROTECTED | NONE | SlaIndicator component exists but not wired | BACKEND_READY_UI_MISSING |
| GET | /api/ha-incidents/{id}/evidence-items | VERIFIED PROTECTED | NONE | EvidenceCard component exists; not wired | BACKEND_READY_UI_MISSING |
| POST/PUT/DELETE | /api/ha-incidents/{id}/evidence-items/{itemId} | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| GET/POST | /api/ha-incidents/{id}/evidence-boards | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| GET/POST | /api/ha-incidents/{id}/evidence-relationships | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| PUT | /api/ha-incidents/change-status | UNPROTECTED | NONE | No status control wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-incidents/add-alerts | UNPROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |

---

## 5. Correlated Findings (Offenses)

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/offenses | UNPROTECTED | NONE | CorrelatedFindingsPage (offenses.service.skip.ts) | BROKEN |
| GET | /api/offenses/{id} | UNPROTECTED | NONE | CorrelatedFindingDetailPage (skip.ts) | BROKEN |
| PUT | /api/offenses/{id} (status) | UNPROTECTED + Groovy injection (SEC-GAP-05) | NONE | Intentionally disabled in UI | BROKEN — P0 SECURITY |
| GET | /api/offenses/{id}/alerts | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |

---

## 6. Investigation Sessions

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-investigation-sessions | VERIFIED PROTECTED | NONE | InvestigationsPage (partial) | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-investigation-sessions | VERIFIED PROTECTED | NONE | No create dialog | BACKEND_READY_UI_MISSING |
| GET | /api/ha-investigation-sessions/{id} | VERIFIED PROTECTED | NONE | InvestigationDetailPage (partial) | PARTIALLY_IMPLEMENTED |
| PUT | /api/ha-investigation-sessions/{id} | VERIFIED PROTECTED | NONE | No edit form | BACKEND_READY_UI_MISSING |
| DELETE | /api/ha-investigation-sessions/{id} | VERIFIED PROTECTED | NONE | No delete control | BACKEND_READY_UI_MISSING |
| POST | /api/ha-investigation-sessions/{id}/items | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| GET | /api/ha-investigation-sessions/{id}/items | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| POST | /api/ha-investigation-sessions/{id}/convert-to-incident | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |

---

## 7. Search & Hunt

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| POST | /api/ha-search/nl-query | VERIFIED PROTECTED | NONE | SearchHuntPage (skip.ts — stub only) | BROKEN |
| GET | /api/ha-saved-queries | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-saved-queries | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| PUT | /api/ha-saved-queries/{id} | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| DELETE | /api/ha-saved-queries/{id} | VERIFIED PROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |

---

## 8. Detection Rules

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/correlation-rule/search-by-filters | UNPROTECTED (SEC-GAP-07) | NONE | DetectionRulesPage (skip.ts) | BROKEN |
| POST | /api/correlation-rule | UNPROTECTED (SEC-GAP-07) | NONE | RuleEditorPage (skip.ts) | BROKEN |
| GET | /api/correlation-rule/{id} | UNPROTECTED (SEC-GAP-07) | NONE | RuleEditorPage (skip.ts) | BROKEN |
| PUT | /api/correlation-rule | UNPROTECTED (SEC-GAP-07) | NONE | RuleEditorPage (skip.ts) | BROKEN |
| DELETE | /api/correlation-rule/{id} | UNPROTECTED (SEC-GAP-07) | NONE | DetectionRulesPage (skip.ts) | BROKEN |
| PUT | /api/correlation-rule/activate-deactivate | UNPROTECTED (SEC-GAP-07) | NONE | Rule toggle in list | BROKEN |
| POST | /api/correlation-rule/test | UNPROTECTED (SEC-GAP-07) | NONE | RuleTestPage | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-sigma-sync/trigger | VERIFIED PROTECTED (ADMIN) | NONE | Not implemented | BACKEND_READY_UI_MISSING |

---

## 9. SOAR / Response

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/soar/playbooks | UNPROTECTED (SEC-GAP-08) | NONE | ResponsePlaybooksPage (skip.ts) | BROKEN |
| POST | /api/soar/playbooks | UNPROTECTED (SEC-GAP-08) | NONE | PlaybookBuilderPage (create flow partial) | PARTIALLY_IMPLEMENTED |
| GET | /api/soar/playbooks/{id} | UNPROTECTED (SEC-GAP-08) | NONE | PlaybookBuilderPage (load partial) | PARTIALLY_IMPLEMENTED |
| PUT | /api/soar/playbooks/{id} | UNPROTECTED (SEC-GAP-08) | NONE | PlaybookBuilderPage (save partial) | PARTIALLY_IMPLEMENTED |
| DELETE | /api/soar/playbooks/{id} | UNPROTECTED (SEC-GAP-08) | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/soar/playbooks/{id}/execute | UNPROTECTED (SEC-GAP-08) | NONE | Disabled in UI (correct) | BROKEN — P0 SECURITY |
| GET | /api/soar/audit | UNPROTECTED | NONE | ResponseActivityPage (skip.ts) | BROKEN |
| GET/POST/PUT/DELETE | /api/authority/* (4 ep) | COMPLETELY UNPROTECTED (SEC-GAP-02) | N/A | ResponseAuthorityPage | BROKEN — CRITICAL |

---

## 10. Posture / Assets / Sensors

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-network-scans/* | UNPROTECTED (SEC-GAP-09) | NONE | AssetsPage (skip.ts) | BROKEN |
| GET/PUT | /api/edr/* (14 ep) | UNPROTECTED (SEC-GAP-06) | NONE | SensorGridPage (EDR disabled) | BROKEN — P0 SECURITY |
| GET | /api/plugin-health | VERIFIED PROTECTED (ADMIN) | NONE | Not wired | BACKEND_READY_UI_MISSING |
| WS | @MessageMapping /command/{hostname} | Auth only — no role (SEC-GAP-13) | NONE | Not wired | BROKEN |
| GET/PUT | /api/uba/* (6 ep) | UNPROTECTED (SEC-GAP-10) | NONE | IdentitiesPage (partial) | BROKEN |
| GET | /api/mitre/coverage | UNPROTECTED (SEC-GAP-04) | NONE | ExposurePage (partial) | BROKEN |
| GET | /api/mitre/exportCoverage | NO AUTH AT ALL (SEC-GAP-04) | NONE | Not wired | BROKEN — CRITICAL |

---

## 11. Dashboards

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-dashboards | UNPROTECTED (SEC-GAP-12) | NONE | DashboardGalleryPage | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-dashboards/{id} | UNPROTECTED (SEC-GAP-12) | NONE | DashboardViewPage | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-dashboards | UNPROTECTED (SEC-GAP-12) | NONE | DashboardStudioPage (skip.ts) | BROKEN |
| PUT | /api/ha-dashboards/{id} | UNPROTECTED (SEC-GAP-12) | NONE | DashboardViewPage save layout | PARTIALLY_IMPLEMENTED |
| DELETE | /api/ha-dashboards/{id} | UNPROTECTED (SEC-GAP-12) | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-visualizations/run | UNPROTECTED (SEC-GAP-15) | NONE | DashboardViewPage (GAP_SEC_06_RESOLVED=false) | BROKEN — gated |
| GET/POST/PUT/DELETE | /api/ha-visualizations/* | UNPROTECTED | NONE | MetricsBuilderPage (partial) | BROKEN |

---

## 12. Reports

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-reports | UNPROTECTED | NONE | ReportTemplatesPage (stub) | BACKEND_READY_UI_MISSING |
| GET | /api/ha-reports/scheduled | UNPROTECTED | NONE | ScheduledReportsPage | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-reports/scheduled | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| PUT | /api/ha-reports/scheduled/{id} | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-reports/scheduled/{id}/run | UNPROTECTED | NONE | Not wired | BACKEND_READY_UI_MISSING |
| POST | /api/ha-reports/generate/sitrep | DOES NOT EXIST | N/A | SitrepReportPage (skip.ts) | FULL_STACK_DEVELOPMENT_REQUIRED |
| GET | /api/ha-incidents/{id}/report | DOES NOT EXIST | N/A | IncidentReportsPage (skip.ts) | FULL_STACK_DEVELOPMENT_REQUIRED |
| GET/POST | /api/ha-incidents/{id}/after-action | DOES NOT EXIST | N/A | AfterActionReportsPage (skip.ts) | FULL_STACK_DEVELOPMENT_REQUIRED |

---

## 13. Administration

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET/POST/PUT/DELETE | /api/users/* | VERIFIED PROTECTED (ADMIN) | NONE | AdminUsersPage (skip.ts) | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-tenants | VERIFIED PROTECTED (ADMIN) | N/A | TenantsPage | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-clients | UNPROTECTED + clientPass plaintext (SEC-GAP-03) | N/A | TenantsPage | BROKEN — CRITICAL |
| GET/POST/PUT/DELETE | /api/ha-integrations/* | UNPROTECTED | NONE | AdminIntegrationsPage | PARTIALLY_IMPLEMENTED |
| GET/POST/PUT/DELETE | /api/notifications/* (18 ep) | UNPROTECTED (SEC-GAP-16) | NONE | AdminNotificationsPage | BROKEN |
| GET | /api/ha-audit-events | VERIFIED PROTECTED (ADMIN) | NONE | AuditPage | PARTIALLY_IMPLEMENTED |
| GET/POST/DELETE | /api/api-keys/* | VERIFIED PROTECTED (USER class-level) | NONE | AdminConnectionKeysPage | PARTIALLY_IMPLEMENTED |
| GET/PUT | /api/ha-settings | UNPROTECTED | NONE | PlatformSettingsPage | PARTIALLY_IMPLEMENTED |
| GET/PUT | /api/ha-retention-policies/* | UNPROTECTED | NONE | RetentionPage | PARTIALLY_IMPLEMENTED |
| GET/POST/PUT/DELETE | /api/ha-parsers/* | UNPROTECTED | NONE | DataParsingPage | PARTIALLY_IMPLEMENTED |

---

## 14. Threat Intelligence

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-threat-intel/feeds | UNPROTECTED (SEC-GAP-14 — wrong prefix) | NONE | HiveIntelligencePage | PARTIALLY_IMPLEMENTED |
| PUT | /api/ha-threat-intel/feeds/{id} | UNPROTECTED | NONE | HiveIntelligencePage toggle | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-threat-intel/feeds/{id}/sync | UNPROTECTED | NONE | HiveIntelligencePage sync | PARTIALLY_IMPLEMENTED |
| POST | /api/ha-threat-intel/lookup | UNPROTECTED | NONE | HiveIntelligencePage enrichment | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-threat-intel/iocs | UNPROTECTED | NONE | HiveIntelligencePage IOC table | PARTIALLY_IMPLEMENTED |
| GET | /api/v1/threat-intel/ioc | UNPROTECTED (wrong prefix — SEC-GAP-14) | NONE | HiveIntelligencePage | BROKEN — wrong prefix |

---

## 15. Graph / Constellation

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-graph/nodes | VERIFIED PROTECTED (isAuthenticated) | NONE | ThreatConstellationPage (via constellationService) | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-graph/edges | VERIFIED PROTECTED (isAuthenticated) | NONE | ThreatConstellationPage | PARTIALLY_IMPLEMENTED |
| GET | /api/ha-entities/{type}/{id}/graph | VERIFIED PROTECTED (ADMIN, USER) | NONE | Not wired in EntityDetailPage | BACKEND_READY_UI_MISSING |
| WS | /ws/topic, /ws/** | ADMIN-only topic; /ws/** permitAll | NONE | Not wired | BROKEN (/ws/** permitAll = critical) |

---

## 16. Compliance

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| GET | /api/ha-posture/frameworks | VERIFIED PROTECTED (ROLE_USER) | NONE | CompliancePage (partial) | PARTIALLY_IMPLEMENTED |
| GET | /api/compliance/control-config | VERIFIED PROTECTED (ROLE_USER) | NONE | CompliancePage (partial) | PARTIALLY_IMPLEMENTED |
| GET | /api/compliance/standard | VERIFIED PROTECTED (ROLE_USER) | NONE | CompliancePage (partial) | PARTIALLY_IMPLEMENTED |

---

## 17. SOC AI

| Method | Path | @PreAuthorize | Tenant Filter | Frontend Component | Status |
|---|---|---|---|---|---|
| POST | /api/ha-ai/chat (SSE) | VERIFIED PROTECTED (ADMIN, USER) | NONE | SocAiChatDrawer — NOT IMPLEMENTED | BACKEND_READY_UI_MISSING |
| POST | /api/ha-soc-ai/query | VERIFIED PROTECTED (ADMIN, SOC_MANAGER, ANALYST) | NONE | Not implemented | BACKEND_READY_UI_MISSING |
| POST | /api/ha-soc-ai/enrich-alert | VERIFIED PROTECTED | NONE | Not implemented | BACKEND_READY_UI_MISSING |

---

## 18. Full-Stack Development Required (No Backend)

| Feature Area | Backend Status | Frontend Status |
|---|---|---|
| Vulnerability Management (/posture/vulnerabilities) | No VulnerabilityResource | VulnerabilitiesPage.skip.ts |
| MSSP Tenant Isolation (all data) | clientPrefix unused; no tenant_id columns | No tenant selector, no tenant columns |
| Readiness Matrix | No /api/ha-readiness endpoint | ReadinessMatrixPage no-data |
| SITREP Report Generation | No /api/ha-reports/generate/sitrep | SitrepReportPage.skip.ts |
| Incident Reports | No /api/ha-incidents/{id}/report | IncidentReportsPage.skip.ts |
| After-Action Reviews | No after-action endpoints | AfterActionReportsPage.skip.ts |
| Active Directory Integration | No /api/ha-ad endpoints | active-directory.service.ts fully stubbed |
| Parser Intelligence (health, drift, AI) | No parser intelligence endpoints | DataParsingPage shows basic CRUD only |
| SOC AI Chat Drawer | Backend exists | Frontend not implemented |

---

## 19. Security Gap Summary (from Matrix)

| SEC-GAP-ID | Affected Endpoints | Severity | Frontend Action |
|---|---|---|---|
| SEC-GAP-01 | All alert mutation endpoints | HIGH | Do not call without user confirmation; P0 fix |
| SEC-GAP-02 | /api/authority/* | CRITICAL | ResponseAuthorityPage must be disabled until fixed |
| SEC-GAP-03 | /api/ha-clients + clientPass | CRITICAL | Never render clientPass field |
| SEC-GAP-04 | /api/mitre/exportCoverage | HIGH | Button disabled until fixed |
| SEC-GAP-05 | PUT /api/offenses/{id} | CRITICAL | Status control disabled (done correctly) |
| SEC-GAP-06 | /api/edr/* (14 endpoints) | CRITICAL | EDR actions disabled in SensorGridPage |
| SEC-GAP-07 | /api/correlation-rule/* (17 endpoints) | HIGH | All rule CRUD unprotected — note in UI |
| SEC-GAP-08 | /api/soar/playbooks/* | HIGH | Execute disabled; builder loads but unprotected |
| SEC-GAP-09 | /api/ha-network-scans/* | HIGH | AssetPage degraded |
| SEC-GAP-10 | /api/uba/* | HIGH | IdentitiesPage degraded |
| SEC-GAP-11 | GET /api/ha-providers | HIGH | IdP config not rendered |
| SEC-GAP-12 | /api/ha-dashboards/* | HIGH | Dashboards load but unprotected |
| SEC-GAP-13 | WS /command/{hostname} | HIGH | Agent terminal not built |
| SEC-GAP-14 | /api/v1/threat-intel/* | MEDIUM | Wrong prefix used in threatIntel.service |
| SEC-GAP-15 | POST /api/ha-visualizations/run | HIGH | GAP_SEC_06_RESOLVED=false gates this correctly |
| SEC-GAP-16 | /api/notifications/* (18 ep) | HIGH | Notification config unprotected |
| SEC-GAP-17 | /api/ha-incidents/* (main CRUD) | HIGH | Core incident operations unprotected |
| SEC-GAP-18 | /api/ha-incident-actions/*, /api/ha-incident-jobs/* | HIGH | Not wired yet — do not wire until protected |
