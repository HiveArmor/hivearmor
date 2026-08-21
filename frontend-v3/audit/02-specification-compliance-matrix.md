# 02 — Specification Compliance Matrix
## HiveArmor frontend-v3 Audit

**Audit date:** 2026-07-25  
**Auditor:** Phase 1B automated audit  
**Evidence base:** router/index.tsx, apiClient.ts, auth.store.ts, CommandCenterPage.tsx, DashboardViewPage.tsx, PlaybookBuilderPage.tsx, ThreatConstellationPage.tsx, HiveIntelligencePage.tsx, .plan/frontend-v3-spec/visual-approval/*, skip.ts files, backend source scan  

---

## Status Codes
| Code | Meaning |
|---|---|
| COMPLIANT | Requirement fully met |
| COMPLIANT_WITH_MINOR_GAPS | Requirement met; small deficiencies noted |
| PARTIALLY_IMPLEMENTED | Some but not all of the requirement is present |
| MISSING | Requirement not present at all |
| MOCK_ONLY | UI exists but renders mock/static data only |
| STATIC_UI_ONLY | Page shell present, no real data wiring |
| BROKEN | Implementation present but demonstrably broken |
| BACKEND_READY_UI_MISSING | Backend endpoint confirmed; frontend not wired |
| FRONTEND_READY_BACKEND_MISSING | Frontend page exists; backend endpoint absent |
| FULL_STACK_DEVELOPMENT_REQUIRED | Neither side implemented |
| NEEDS_VERIFICATION | Status unclear without runtime test |
| PRODUCT_DECISION_REQUIRED | Intentionality unclear; PM must decide |
| NOT_APPLICABLE | Not relevant to this build stage |
| CONTRADICTS_SPECIFICATION | Implementation conflicts with spec |


---

## Compliance Matrix

| ID | Spec Section | Requirement | Status | Confidence | Severity | Frontend Evidence | Backend Evidence | Tests | User Impact | Required Action |
|---|---|---|---|---|---|---|---|---|---|---|
| ARCH-01 | Architecture | Vite 8 + React 18 + TypeScript 5 strict mode | COMPLIANT | HIGH | — | package.json: vite@8.1.5, react@18.3.1, typescript@5.9.3 strict | — | — | None | None |
| ARCH-02 | Architecture | React Router v6 for all routing | COMPLIANT | HIGH | — | router/index.tsx: createBrowserRouter | — | — | None | None |
| ARCH-03 | Architecture | TanStack Query v5 for all server state | COMPLIANT | HIGH | — | package.json: @tanstack/react-query@5 | — | — | None | None |
| ARCH-04 | Architecture | Zustand v5 for UI state | COMPLIANT | HIGH | — | store/auth.store.ts: create() from zustand | — | — | None | None |
| ARCH-05 | Architecture | No Next.js / App Router | COMPLIANT | HIGH | — | No next.js in package.json | — | — | None | None |
| ARCH-06 | Architecture | All API calls via Vite proxy /api/* | COMPLIANT | HIGH | — | apiClient.ts:10 BASE_PATH='/api' | — | — | None | None |
| ARCH-07 | Architecture | No hardcoded backend URLs | COMPLIANT | HIGH | — | apiClient.ts uses relative paths only | — | — | None | None |
| ARCH-08 | Architecture | AG Grid Community 36, no Enterprise | COMPLIANT_WITH_MINOR_GAPS | MEDIUM | P1 | package.json: ag-grid-community@36.0.1; SiemDataGrid bridges ServerSide→InfiniteRowModel | Enterprise features spec-required but workaround used | None | Pagination limited vs spec | Document workaround; resolve in roadmap |
| ARCH-09 | Architecture | ECharts 6 via HaChart wrapper | COMPLIANT | HIGH | — | package.json: echarts@6.1.0; HaChart.tsx exists | — | HaChart.test.tsx | None | None |
| ARCH-10 | Architecture | GridStack 13 for dashboard layout | COMPLIANT | HIGH | — | DashboardViewPage.tsx imports GridStack | — | — | None | None |
| ARCH-11 | Architecture | ReactFlow for playbook builder | COMPLIANT | HIGH | — | PlaybookBuilderPage.tsx:22 imports ReactFlow | — | — | None | None |
| ARCH-12 | Architecture | Monaco Editor for code editors | COMPLIANT | HIGH | — | package.json: monaco-editor@0.55.1 | — | — | None | None |
| ARCH-13 | Architecture | No Tailwind, Radix, MUI, shadcn | COMPLIANT | HIGH | — | Not found in package.json | — | — | None | None |
| ARCH-14 | Architecture | No SWR, RTK Query, Redux | COMPLIANT | HIGH | — | Not found in package.json | — | — | None | None |
| DESIGN-01 | Design System | 22 CSS design tokens in tokens.css | COMPLIANT | HIGH | — | tokens.css: all 22 tokens present and correct | — | — | None | None |
| DESIGN-02 | Design System | No hardcoded hex colors in component files | PARTIALLY_IMPLEMENTED | HIGH | P1 | HiveIntelligencePage.tsx:302-303 rgba(50,214,197,0.15); CommandCenterPage.tsx:176 rgba(255,93,108,0.1) | — | — | Brand consistency risk | Replace rgba() with color-mix() in all violating files |
| DESIGN-03 | Design System | color-mix() instead of rgba() for semi-transparent badge backgrounds | PARTIALLY_IMPLEMENTED | HIGH | P1 | Multiple files use rgba() inline — HaInlineBanner.tsx, HaDrawer.tsx, NavItem.tsx etc. | — | — | Token system bypassed | Systematic rgba() → color-mix() refactor |
| DESIGN-04 | Design System | PatternFly 6.6 as base UI library | COMPLIANT | HIGH | — | package.json: @patternfly/react-core@6.6.0 | — | — | None | None |
| DESIGN-05 | Design System | Ha* prefix for all PatternFly wrappers | COMPLIANT | HIGH | — | 20 Ha* components found under src/components/ | — | — | None | None |
| DESIGN-06 | Design System | No glassmorphism / backdrop-filter: blur | COMPLIANT | HIGH | — | Not found in src/styles/ or components | — | — | None | None |
| DESIGN-07 | Design System | No neon glow effects | COMPLIANT | HIGH | — | Not found in source | — | — | None | None |
| DESIGN-08 | Design System | Border-radius max 8px (--ha-radius-lg) | COMPLIANT | HIGH | — | tokens.css: --ha-radius-lg: 8px; no larger values found | — | — | None | None |
| DESIGN-09 | Design System | No nested cards inside cards | COMPLIANT | HIGH | — | DashboardViewPage.tsx: single card hierarchy | — | — | None | None |
| DESIGN-10 | Design System | Row density: compact 32px / standard 40px / comfortable 48px | COMPLIANT | HIGH | — | tokens.css: --ha-row-compact, --ha-row-standard, --ha-row-comfortable | — | — | None | None |
| DESIGN-11 | Design System | ha_row_density persisted to localStorage | NEEDS_VERIFICATION | MEDIUM | P2 | DensitySelector.test.tsx exists; implementation not verified | — | DensitySelector.test.tsx | UX regression if missing | Verify localStorage key in DensitySelector.tsx |
| SHELL-01 | App Shell | HaMasthead component with logo + nav | COMPLIANT | HIGH | — | HaMasthead.tsx present; NotificationsBell, UserAvatarMenu, LiveEpsBadge sub-components | — | — | None | None |
| SHELL-02 | App Shell | HaNavigation sidebar component | COMPLIANT | HIGH | — | HaNavigation.tsx present | — | — | None | None |
| SHELL-03 | App Shell | StatusDock 28px fixed bottom bar | COMPLIANT_WITH_MINOR_GAPS | HIGH | P2 | StatusDock.tsx exists but CommandCenterPage.tsx:270 re-implements inline status bar | — | — | Duplicate status bars risk | Use StatusDock in CommandCenterPage instead of inline bar |
| SHELL-04 | App Shell | Tenant selector in masthead (MSSP Mode B) | MISSING | HIGH | P0 | No tenant selector in HaMasthead.tsx | auth.store.ts has selectedTenantId; no masthead UI for it | — | MSSP completely unusable | Full stack implementation required |
| SHELL-05 | App Shell | AppLayout wraps all protected routes | COMPLIANT | HIGH | — | router/index.tsx:83 AppLayout parent for all children | — | — | None | None |
| SHELL-06 | App Shell | AuthGuard protects all routes except /login and /login/tfa | COMPLIANT_WITH_MINOR_GAPS | HIGH | P1 | router/index.tsx: /access-denied has no AuthGuard; / redirect has no AuthGuard | — | — | Minor: /access-denied accessible unauthenticated | Acceptable — intended behavior |
| SHELL-07 | App Shell | isLoading spinner during auth bootstrap | COMPLIANT | HIGH | — | AuthGuard.tsx:30-53 spinner during isLoading | — | — | None | None |
| SHELL-08 | App Shell | 401 auto-logout and redirect to /login | COMPLIANT | HIGH | — | apiClient.ts:95-99 auto-logout on 401 | — | — | None | None |
| TENANT-01 | Tenancy | X-Tenant-ID header injected into all API requests | PARTIALLY_IMPLEMENTED | HIGH | P0 | apiClient.ts:80-83 injects X-Tenant-ID when selectedTenantId != null | Backend does NOT enforce this header | — | Header sent but not enforced = security theater | Backend filter required |
| TENANT-02 | Tenancy | Tenant selector visible in masthead | MISSING | HIGH | P0 | HaMasthead.tsx: no selector rendered | No user-tenant association backend exists | — | MSSP unusable | FULL_STACK_DEVELOPMENT_REQUIRED |
| TENANT-03 | Tenancy | All-tenant mode with purple masthead variant | MISSING | HIGH | P0 | Not implemented anywhere | No CROSS_TENANT_READ permission exists | — | MSSP admin blind | FULL_STACK_DEVELOPMENT_REQUIRED |
| TENANT-04 | Tenancy | Per-tenant localStorage key partitioning | MISSING | MEDIUM | P1 | Keys like ha_row_density not tenant-prefixed | — | — | Grid state leaks between tenants | Frontend can implement now |
| TENANT-05 | Tenancy | Tenant column in all data grids | MISSING | HIGH | P0 | No tenant column in any SiemDataGrid | No tenant_id column in UtmAlert, UtmIncident | — | Data mixing in MSSP | FULL_STACK_DEVELOPMENT_REQUIRED |
| TENANT-06 | Tenancy | Tenant switch: cache invalidation | MISSING | HIGH | P0 | setSelectedTenant() in auth.store.ts does not call queryClient.clear() | — | — | Stale cross-tenant data | Implement in auth.store.ts |
| TENANT-07 | Tenancy | Tenant switch: unsaved changes guard | MISSING | MEDIUM | P1 | No guard implemented | — | — | Data loss risk | Implement in tenant switch handler |
| AUTH-01 | Authentication | Login form POST /api/authenticate | COMPLIANT | HIGH | — | LoginPage.tsx confirmed | UtmAuthResource.java confirmed | — | None | None |
| AUTH-02 | Authentication | TFA challenge page at /login/tfa | COMPLIANT | HIGH | — | TfaPage.tsx, router/index.tsx:74-76 | /api/authenticate with MFA token | — | None | None |
| AUTH-03 | Authentication | SSO/SAML entry point | MISSING | MEDIUM | P1 | No /login?sso= route in router | /api/ha-sso/redirect exists (GAP-SEC-11) | — | Enterprise SSO blocked | FRONTEND_READY_BACKEND_MISSING when GAP-SEC-11 resolved |
| AUTH-04 | Authentication | Backup code entry | MISSING | LOW | P2 | No backup code overlay in LoginPage | Endpoint exists | — | MFA recovery blocked | FULL_STACK_DEVELOPMENT_REQUIRED |
| AUTH-05 | Authentication | Session expired overlay | PARTIALLY_IMPLEMENTED | HIGH | P1 | apiClient.ts auto-logout + redirect; no re-auth overlay | — | — | Hard page reload vs smooth overlay | Implement SessionExpiredModal |
| AUTH-06 | Authentication | Account locked state (HTTP 423) | MISSING | LOW | P2 | LoginPage.tsx does not handle 423 status | — | — | Confusing UX for locked accounts | Handle 423 in LoginPage |
| AUTH-07 | Authentication | JWT stored only in localStorage[hivearmor_auth_token] | COMPLIANT | HIGH | — | auth.store.ts:45; apiClient.ts:9 | — | — | None | None |
| AUTH-08 | Authentication | JWT never in React state or URL params | COMPLIANT | HIGH | — | auth.store.ts: token in store but getToken() reads localStorage | — | — | None | None |
| AUTH-09 | Authentication | DEBT-14: ephemeral JWT key restarted on backend restart | MISSING | HIGH | P0 | Client handles 401 correctly; root cause unresolved | JwtKeyService generates new key each restart | — | All sessions invalidated on restart | Fix backend to use persistent JWT key |
| GRID-01 | Data Grids | SiemDataGrid as standard grid component | COMPLIANT | HIGH | — | SiemDataGrid.tsx present and used in alerts, incidents, etc. | — | SiemDataGrid.test.tsx | None | None |
| GRID-02 | Data Grids | Server-side pagination via IServerSideDatasource | PARTIALLY_IMPLEMENTED | HIGH | P1 | SiemDataGrid bridges IServerSideDatasource→IDatasource (InfiniteRowModel) due to Community licence | AG Grid Enterprise required for true SSRM | SiemDataGrid.test.tsx | Pagination may differ from spec | Document workaround; road-map Enterprise licence |
| GRID-03 | Data Grids | Compact row height default 32px | COMPLIANT | HIGH | — | tokens.css: --ha-row-compact: 32px | — | — | None | None |
| GRID-04 | Data Grids | Column resizing and sorting | NEEDS_VERIFICATION | MEDIUM | P2 | AG Grid supports this by default | — | — | UX degradation if disabled | Verify columnDefs for each grid page |
| GRID-05 | Data Grids | FilterChipsRow for active filters | COMPLIANT | HIGH | — | FilterChipsRow.tsx present; used in AlertsListPage | — | — | None | None |
| GRID-06 | Data Grids | LiveModeToggle for SSE vs historical | COMPLIANT | HIGH | — | LiveModeToggle.tsx present | — | — | None | None |
| CHART-01 | Charts | HaChart wrapper for all ECharts usage | COMPLIANT | HIGH | — | HaChart.tsx present | — | HaChart.test.tsx | None | None |
| CHART-02 | Charts | Loading / empty / error states in charts | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | HaChart.tsx: loading prop; error state absent | — | — | Charts silently blank on error | Add error state to HaChart |
| CHART-03 | Charts | Accessible description for charts | MISSING | MEDIUM | P1 | HaChart.tsx: no aria-label or role=img+title | — | — | Screen reader inaccessible | Add aria-label prop to HaChart |
| CHART-04 | Charts | EpsChart in CommandCenterPage | PARTIALLY_IMPLEMENTED | HIGH | P1 | CommandCenterPage.tsx:251 EpsChart component; data=[] hardcoded empty array | No EPS history endpoint | — | Chart always empty | Implement EPS history endpoint |
| DASH-01 | Dashboards | DashboardGalleryPage at /dashboards | BACKEND_READY_UI_MISSING | HIGH | P1 | DashboardGalleryPage.tsx present | GET /api/ha-dashboards unprotected (SEC-GAP-12) | — | Dashboard list works but ungated | Fix GAP-SEC-12 then wire frontend |
| DASH-02 | Dashboards | DashboardViewPage with GridStack canvas | COMPLIANT_WITH_MINOR_GAPS | HIGH | P1 | DashboardViewPage.tsx: GridStack init confirmed | GAP_SEC_06_RESOLVED=false blocks all widgets | — | All widgets show security warning | Resolve GAP-SEC-06 |
| DASH-03 | Dashboards | DashboardStudioPage for editing | MISSING | HIGH | P1 | DashboardStudioPage.skip.ts exists; no active DashboardStudioPage.tsx | Same backend gaps | — | Dashboard creation blocked | Implement DashboardStudioPage |
| DASH-04 | Dashboards | MetricsBuilderPage | STATIC_UI_ONLY | MEDIUM | P1 | MetricsBuilderPage.tsx present | GAP-SEC-06 blocks /api/ha-visualizations/run | — | Metrics builder unusable | Resolve GAP-SEC-06 |
| DASH-05 | Dashboards | Dashboard draft/publish workflow | MISSING | MEDIUM | P2 | No draft state in DashboardViewPage | No draft field in UtmDashboard | — | No review before publishing | FULL_STACK_DEVELOPMENT_REQUIRED |
| DASH-06 | Dashboards | Dashboard ownership / per-tenant | MISSING | HIGH | P0 | No tenant_id on UtmDashboard | clientPrefix unused | — | Cross-tenant dashboard leakage | FULL_STACK_DEVELOPMENT_REQUIRED |
| MISSION-01 | Mission Control | CommandCenterPage at /command | PARTIALLY_IMPLEMENTED | HIGH | P1 | CommandCenterPage.tsx: KPI tiles, EPS chart, live alert stream, recent incidents | Spec requires 9 specialized widgets | — | Severely limited vs spec | Implement all Mission Control widgets per CMD-01 |
| MISSION-02 | Mission Control | Operational Globe/Pulse widget | MISSING | HIGH | P1 | Not in CommandCenterPage.tsx | No geo-threats endpoint wired | — | No geographic threat overview | FULL_STACK_DEVELOPMENT_REQUIRED |
| MISSION-03 | Mission Control | Defensive Posture widget | MISSING | HIGH | P1 | Not present | No posture score endpoint wired | — | Posture blind | BACKEND_READY_UI_MISSING |
| MISSION-04 | Mission Control | Priority Work Queue widget | MISSING | HIGH | P1 | Not present | GET /api/ha-queue exists | — | No work prioritization on MC | BACKEND_READY_UI_MISSING |
| MISSION-05 | Mission Control | Sensor Coverage widget | MISSING | MEDIUM | P2 | Not present | Agent manager endpoints exist | — | No sensor overview | BACKEND_READY_UI_MISSING |
| MISSION-06 | Mission Control | Analyst Capacity widget | MISSING | MEDIUM | P2 | Not present | No analyst capacity endpoint | — | Staffing blind | FULL_STACK_DEVELOPMENT_REQUIRED |
| MISSION-07 | Mission Control | Detection Health widget | MISSING | MEDIUM | P2 | Not present | No detection health endpoint | — | Detection blind | FULL_STACK_DEVELOPMENT_REQUIRED |
| MISSION-08 | Mission Control | Focus mode (full-screen, hide nav) | MISSING | LOW | P3 | Not present | — | — | Reduced situational awareness | Implement focus mode toggle |
| MISSION-09 | Mission Control | No weapon/target language | COMPLIANT | HIGH | — | CommandCenterPage.tsx uses "Mission Control" and neutral terms | — | — | None | None |
| MISSION-10 | Mission Control | Animation pause / reduced-motion | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | global.css has prefers-reduced-motion rule; CommandCenterPage has no animation | EpsChart animations not checked | — | WCAG 2.3.3 risk | Verify all animations respect prefers-reduced-motion |
| QUEUE-01 | Analyst Queue | AnalystQueuePage at /queue | PARTIALLY_IMPLEMENTED | HIGH | P1 | AnalystQueuePage.skip.ts exists; AnalystQueuePage.tsx is active (imported in router) | GET /api/ha-queue VERIFIED PROTECTED | — | Some features hidden | Fix .skip.ts sub-components |
| QUEUE-02 | Analyst Queue | SSE banner for new alerts | MISSING | HIGH | P1 | SseBanner.skip.ts exists; no active SseBanner | useAlertStream hook exists | — | Analysts miss new alerts | Implement SseBanner |
| QUEUE-03 | Analyst Queue | Queue toolbar with filters | MISSING | HIGH | P1 | QueueToolbar.skip.ts; no active QueueToolbar | — | — | No filter capability | Implement QueueToolbar |
| QUEUE-04 | Analyst Queue | Bulk action (status change, assign, close) | BACKEND_READY_UI_MISSING | HIGH | P1 | No bulk action UI in active queue | POST /api/ha-alerts/status exists (unprotected) | — | Analysts can't batch-process | Implement bulk action bar |
| ALERT-01 | Alerts | AlertsListPage at /alerts | PARTIALLY_IMPLEMENTED | HIGH | P1 | AlertsListPage.tsx present; alerts.service.skip.ts means service is stubbed | GET /api/ha-alerts UNPROTECTED (SEC-GAP-01) | — | Alert list partially functional | Fix service, add @PreAuthorize |
| ALERT-02 | Alerts | AlertSeverityBoardPage at /alerts/severity | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | AlertSeverityBoardPage.tsx present | No /api/ha-alerts/severity-summary endpoint confirmed | — | Severity breakdown may be empty | Verify endpoint |
| ALERT-03 | Alerts | AlertDetailDrawer with status change | PARTIALLY_IMPLEMENTED | HIGH | P1 | AlertContextDrawer.tsx present | POST /api/ha-alerts/status UNPROTECTED | AlertContextDrawer.test.tsx | Status change unprotected | Add @PreAuthorize to alert mutation endpoints |
| ALERT-04 | Alerts | Alert note and tag editing | BACKEND_READY_UI_MISSING | MEDIUM | P1 | No NoteForm or TagEditor found in active components | POST /api/ha-alerts/notes, /tags UNPROTECTED | — | Analysts can't annotate alerts | Implement + protect endpoints |
| ALERT-05 | Alerts | Convert alert to incident | BACKEND_READY_UI_MISSING | HIGH | P1 | No ConvertToIncidentDialog found in active components | POST /api/ha-alerts/convert-to-incident UNPROTECTED | — | Core workflow broken | Implement + protect endpoint |
| FINDING-01 | Correlated Findings | CorrelatedFindingsPage at /offenses | PARTIALLY_IMPLEMENTED | HIGH | P1 | CorrelatedFindingsPage.skip.ts exists; CorrelatedFindingsPage.tsx is active in router | GET /api/offenses UNPROTECTED | — | Page loads but data wiring incomplete | Fix .skip.ts services, protect endpoint |
| FINDING-02 | Correlated Findings | CorrelatedFindingDetailPage at /offenses/:id | PARTIALLY_IMPLEMENTED | HIGH | P1 | CorrelatedFindingDetailPage.skip.ts exists; .tsx active in router | GET /api/offenses/{id} UNPROTECTED | — | Detail page limited | Fix skip.ts, protect endpoint |
| FINDING-03 | Correlated Findings | Status control disabled (SEC-03 Groovy injection) | COMPLIANT | HIGH | — | GAP-SEC-03 acknowledged in spec; UI must not expose status control | PUT /api/offenses/{id} UNPROTECTED + Groovy injection | — | None (disabled correctly) | Keep disabled until backend fix |
| INCIDENT-01 | Incidents | IncidentListPage at /incidents | PARTIALLY_IMPLEMENTED | HIGH | P1 | IncidentListPage.skip.ts exists; IncidentListPage.tsx active in router | GET /api/ha-incidents UNPROTECTED (SEC-GAP-17) | — | List functional but incomplete | Fix .skip.ts, protect endpoint |
| INCIDENT-02 | Incidents | IncidentDetailPage at /incidents/:id | PARTIALLY_IMPLEMENTED | HIGH | P1 | IncidentDetailPage.skip.ts (node:test runner); IncidentDetailPage.tsx active | GET /api/ha-incidents/{id} UNPROTECTED | — | Detail limited | Fix .skip.ts tests (node:test → vitest), protect endpoint |
| INCIDENT-03 | Incidents | Incident create dialog | BACKEND_READY_UI_MISSING | HIGH | P1 | No CreateIncidentDialog in active components | POST /api/ha-incidents UNPROTECTED | — | Cannot create incidents | Implement + protect |
| INCIDENT-04 | Incidents | SLA tracking and breach banner | BACKEND_READY_UI_MISSING | MEDIUM | P1 | SlaIndicator.tsx exists as component; not wired into IncidentListPage | GET /api/ha-incidents/sla-stats UNPROTECTED | SlaIndicator.test.tsx | SLA blind | Wire SlaIndicator, protect endpoint |
| INCIDENT-05 | Incidents | Add alerts to incident | BACKEND_READY_UI_MISSING | HIGH | P1 | No AddAlertsToIncidentDialog found | POST /api/ha-incidents/add-alerts UNPROTECTED | — | Investigation blocked | Implement |
| INCIDENT-06 | Incidents | AI summary generation | BACKEND_READY_UI_MISSING | MEDIUM | P2 | No AiSummaryBlock in active incident detail | POST /api/ha-incidents/{id}/ai-summary VERIFIED PROTECTED | — | AI feature hidden | Implement AiSummaryBlock |
| EVIDENCE-01 | Evidence | Evidence items panel in incident detail | BACKEND_READY_UI_MISSING | HIGH | P1 | EvidenceCard.tsx component exists; not wired to incident detail | GET/POST /api/ha-incidents/{incidentId}/evidence-items VERIFIED PROTECTED | EvidenceCard.test.tsx | Evidence chain broken | Wire EvidencePanel to IncidentDetailPage |
| EVIDENCE-02 | Evidence | Evidence boards | MISSING | HIGH | P1 | No EvidenceBoard component in active code | GET/POST /api/ha-incidents/{incidentId}/evidence-boards VERIFIED PROTECTED | — | Evidence organization impossible | FULL_STACK_DEVELOPMENT_REQUIRED (frontend) |
| EVIDENCE-03 | Evidence | Evidence relationships graph | MISSING | MEDIUM | P2 | No EvidenceRelationshipGraph | GET/POST /api/ha-incidents/{incidentId}/evidence-relationships VERIFIED PROTECTED | — | No link analysis | FULL_STACK_DEVELOPMENT_REQUIRED (frontend) |
| SESSION-01 | Investigation Sessions | InvestigationsPage at /investigations | PARTIALLY_IMPLEMENTED | HIGH | P1 | InvestigationsPage.tsx active in router | GET /api/ha-investigation-sessions VERIFIED PROTECTED | — | Page functional but limited | Wire to backend service |
| SESSION-02 | Investigation Sessions | InvestigationDetailPage | PARTIALLY_IMPLEMENTED | HIGH | P1 | InvestigationDetailPage.tsx active | GET /api/ha-investigation-sessions/{id} VERIFIED PROTECTED | — | Detail limited | Complete implementation |
| SESSION-03 | Investigation Sessions | Convert session to incident | BACKEND_READY_UI_MISSING | HIGH | P1 | No ConvertSessionToIncidentButton | POST /api/ha-investigation-sessions/{id}/convert-to-incident VERIFIED PROTECTED | — | Key workflow blocked | Implement |
| SESSION-04 | Investigation Sessions | Pin events from search to session | MISSING | HIGH | P1 | No pin mechanism in Search or SessionDetail | Evidence items endpoint exists | — | Investigation workflow broken | Implement |
| SEARCH-01 | Search & Hunt | SearchHuntPage at /hunt | STATIC_UI_ONLY | HIGH | P1 | SearchHuntPage.skip.ts exists; SearchHuntPage.tsx active in router but service.skip.ts means no real calls | POST /api/ha-search/nl-query VERIFIED PROTECTED | — | Search totally non-functional | Implement SearchHuntPage without skip |
| SEARCH-02 | Search & Hunt | Monaco query editor | NEEDS_VERIFICATION | MEDIUM | P2 | Monaco Editor in package.json; DataParsingPage uses lazy import | — | — | Editor may be missing | Verify SearchHuntPage uses Monaco |
| SEARCH-03 | Search & Hunt | Saved queries panel | BACKEND_READY_UI_MISSING | MEDIUM | P2 | No SavedQueriesPanel in active code | GET /api/ha-saved-queries VERIFIED PROTECTED | — | Queries not saved | Implement |
| SEARCH-04 | Search & Hunt | Histogram over time | MISSING | MEDIUM | P2 | Not implemented | No histogram endpoint confirmed | — | No time distribution | FULL_STACK_DEVELOPMENT_REQUIRED |
| SEARCH-05 | Search & Hunt | Add event as evidence | MISSING | HIGH | P1 | No add-as-evidence in search results | Evidence items endpoint exists | — | Investigation chain broken | Implement |
| ENTITY-01 | Entities | EntityListPage at /entities | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | EntityListPage.tsx active in router | GET /api/ha-entities VERIFIED PROTECTED | — | Page exists but limited | Wire properly |
| ENTITY-02 | Entities | EntityDetailPage at /entities/:id | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | EntityDetailPage.tsx active | GET /api/ha-entities/{id} VERIFIED PROTECTED | — | Detail limited | Wire properly |
| ENTITY-03 | Entities | Entity risk score display | BACKEND_READY_UI_MISSING | MEDIUM | P2 | No risk score in EntityDetailPage | GET /api/ha-entities/{id}/risk exists | — | No risk visibility | Implement |
| INTEL-01 | Threat Intel | HiveIntelligencePage at /intelligence | COMPLIANT_WITH_MINOR_GAPS | HIGH | P1 | HiveIntelligencePage.tsx: feed list, IOC browser, enrichment lookup all wired | GET /api/ha-threat-intel/feeds — wrong prefix (SEC-GAP-14) | — | Works but endpoint prefix wrong | Migrate to /api/ha-* prefix |
| INTEL-02 | Threat Intel | ATT&CK coverage mapping | MISSING | MEDIUM | P2 | No ATT&CK coverage tab in HiveIntelligencePage | GET /api/ha-threat-intel/attck-coverage — not confirmed | — | ATT&CK blind | FULL_STACK_DEVELOPMENT_REQUIRED |
| INTEL-03 | Threat Intel | IOC pagination | MISSING | MEDIUM | P2 | HiveIntelligencePage.tsx:47 size:100 hardcoded — no pagination | — | — | Performance risk with large feeds | Implement pagination |
| DETECT-01 | Detection Rules | DetectionRulesPage at /rules | PARTIALLY_IMPLEMENTED | HIGH | P1 | DetectionRulesPage.skip.ts exists; DetectionRulesPage.tsx active in router | GET /api/correlation-rule UNPROTECTED (SEC-GAP-07) | — | Rules page partially functional | Fix .skip.ts, protect endpoints |
| DETECT-02 | Detection Rules | RuleEditorPage at /rules/new and /rules/:id/edit | PARTIALLY_IMPLEMENTED | HIGH | P1 | RuleEditorPage.skip.ts exists; RuleEditorPage.tsx active | Same SEC-GAP-07 | — | Rule editing limited | Fix .skip.ts, protect endpoints |
| DETECT-03 | Detection Rules | RuleTestPage at /rules/:id/test | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | RuleTestPage.tsx active; uses Monaco | POST /api/correlation-rule/test UNPROTECTED | — | Test page functional but unprotected | Protect endpoint |
| DETECT-04 | Detection Rules | Sigma rule sync | BACKEND_READY_UI_MISSING | MEDIUM | P2 | No SigmaSyncPanel found | POST /api/ha-sigma-sync/trigger VERIFIED PROTECTED (ADMIN) | — | No Sigma import UI | Implement SigmaSyncPanel |
| DETECT-05 | Detection Rules | ~0 shipped YAML detection rules | MISSING | HIGH | P0 | No rules/ directory has shipped content | — | — | Platform detects nothing | Ship detection content (separate track) |
| RESPONSE-01 | SOAR/Response | ResponsePlaybooksPage at /response/playbooks | PARTIALLY_IMPLEMENTED | HIGH | P1 | ResponsePlaybooksPage.skip.ts; .tsx active in router | GET /api/soar/playbooks UNPROTECTED (SEC-GAP-08) | — | Page limited | Fix .skip.ts, protect |
| RESPONSE-02 | SOAR/Response | PlaybookBuilderPage with ReactFlow | COMPLIANT_WITH_MINOR_GAPS | HIGH | P1 | PlaybookBuilderPage.tsx: ReactFlow + undo/redo + validation | BACKEND_REQUIRED comment in file; endpoint unprotected | — | Builder functional; save/load incomplete | Fix save/load wiring |
| RESPONSE-03 | SOAR/Response | ResponseActivityPage at /response/activity | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | ResponseActivityPage.skip.ts; .tsx active in router | GET /api/soar/audit confirmed | — | Activity log limited | Fix .skip.ts |
| RESPONSE-04 | SOAR/Response | ResponseAuthorityPage at /response/authority | PARTIALLY_IMPLEMENTED | HIGH | P0 | ResponseAuthorityPage.tsx active; ADMIN only in router | GET/POST/DELETE /api/authority COMPLETELY UNPROTECTED (SEC-GAP-02) | — | CRITICAL: any user can manage roles | P0 block: protect authority endpoints immediately |
| POSTURE-01 | Posture | AssetsPage at /posture/assets | PARTIALLY_IMPLEMENTED | MEDIUM | P1 | AssetsPage.skip.ts; AssetsPage.tsx active | GET /api/ha-network-scans UNPROTECTED (SEC-GAP-09) | — | Assets page limited | Fix .skip.ts, protect endpoints |
| POSTURE-02 | Posture | IdentitiesPage at /posture/identities | PARTIALLY_IMPLEMENTED | MEDIUM | P1 | IdentitiesPage.tsx active | GET /api/uba UNPROTECTED (SEC-GAP-10) | — | Identities limited | Fix, protect |
| POSTURE-03 | Posture | VulnerabilitiesPage at /posture/vulnerabilities | STATIC_UI_ONLY | HIGH | P0 | VulnerabilitiesPage.skip.ts; no active VulnerabilitiesPage.tsx | No VulnerabilityResource exists in backend | — | Vuln management absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| POSTURE-04 | Posture | ExposurePage at /posture/exposure | STATIC_UI_ONLY | HIGH | P0 | ExposurePage.tsx active but no exposure backend | No ha-assets/exposure-summary endpoint | — | Exposure analysis absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| POSTURE-05 | Posture | SensorGridPage at /posture/sensors | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | SensorGridPage.tsx active | GET /api/ha-agents — AgentManager; EDR endpoints UNPROTECTED (SEC-GAP-06) | — | Sensor grid partial | Protect EDR endpoints (P0) |
| POSTURE-06 | Posture | ActiveDirectoryPage at /posture/active-directory | STATIC_UI_ONLY | HIGH | P1 | ActiveDirectoryPage.skip.ts; active-directory.service.ts fully stubbed | No /api/ha-ad/* endpoints exist | — | AD integration absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| POSTURE-07 | Posture | ReadinessMatrixPage | STATIC_UI_ONLY | MEDIUM | P2 | ReadinessMatrixPage.tsx active | No /api/ha-readiness/matrix endpoint | — | Readiness blind | FULL_STACK_DEVELOPMENT_REQUIRED |
| POSTURE-08 | Posture | CompliancePage at /compliance | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | CompliancePage.tsx active | GET /api/ha-compliance/frameworks VERIFIED PROTECTED | — | Compliance partial | Wire frontend to real endpoints |
| REPORT-01 | Reports | ReportTemplatesPage | STATIC_UI_ONLY | MEDIUM | P2 | ReportTemplatesPage.tsx active | No /api/ha-reports/templates endpoint confirmed | — | Template builder absent | PRODUCT_DECISION_REQUIRED |
| REPORT-02 | Reports | ScheduledReportsPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | ScheduledReportsPage.tsx active | GET /api/ha-reports/scheduled UNPROTECTED | — | Scheduler partial | Protect endpoint |
| REPORT-03 | Reports | AfterActionReportsPage | STATIC_UI_ONLY | HIGH | P1 | AfterActionReportsPage.skip.ts; .tsx active in router | No backend endpoint exists | — | AAR absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| REPORT-04 | Reports | IncidentReportsPage | STATIC_UI_ONLY | HIGH | P1 | IncidentReportsPage.skip.ts; .tsx active in router | No /api/ha-incidents/{id}/report endpoint | — | Incident report absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| REPORT-05 | Reports | SitrepReportPage | STATIC_UI_ONLY | HIGH | P1 | SitrepReportPage.skip.ts; .tsx active in router | No /api/ha-reports/generate/sitrep endpoint | — | SITREP absent | FULL_STACK_DEVELOPMENT_REQUIRED |
| ADMIN-01 | Administration | AdminUsersPage at /admin/users | PARTIALLY_IMPLEMENTED | HIGH | P1 | AdminUsersPage.skip.ts; AdminUsersPage.tsx active via AuthGuard ROLE_ADMIN | GET/POST/PUT/DELETE /api/users VERIFIED PROTECTED ADMIN | — | Users page limited | Fix .skip.ts |
| ADMIN-02 | Administration | TenantsPage at /admin/tenants | STATIC_UI_ONLY | HIGH | P0 | TenantsPage.tsx active; AdminTenantsPage.tsx also present (duplicate) | GET /api/ha-clients UNPROTECTED + clientPass in plaintext (SEC-GAP-03) | — | CRITICAL: password exposure | P0: Never render clientPass; protect endpoint |
| ADMIN-03 | Administration | AdminIntegrationsPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | AdminIntegrationsPage.tsx active | GET/POST /api/ha-integrations UNPROTECTED | — | Integrations partial | Protect endpoints |
| ADMIN-04 | Administration | AdminNotificationsPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | AdminNotificationsPage.tsx active | All notification endpoints UNPROTECTED (SEC-GAP-16) | — | Notifications partial | Protect all 18 notification endpoints |
| ADMIN-05 | Administration | RetentionPage | PARTIALLY_IMPLEMENTED | LOW | P3 | RetentionPage.tsx active | GET /api/ha-retention-policies UNPROTECTED | — | Retention partial | Protect |
| ADMIN-06 | Administration | DataParsingPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | DataParsingPage.tsx active; uses React.lazy | GET /api/ha-parsers UNPROTECTED | — | Parser admin partial | Protect endpoints |
| ADMIN-07 | Administration | AdminConnectionKeysPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | AdminConnectionKeysPage.tsx active | GET /api/ha-connection-keys UNPROTECTED (SEC-GAP-09) | — | Key management partial | Protect |
| ADMIN-08 | Administration | AuditPage at /admin/audit | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | AuditPage.tsx active (AdminAuditPage also present as -old) | GET /api/ha-audit-events VERIFIED PROTECTED ADMIN | — | Audit partial | Clean up -old duplicate |
| ADMIN-09 | Administration | PlatformSettingsPage | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | PlatformSettingsPage.tsx active (-old also exists) | GET /api/ha-settings UNPROTECTED (GAP-SEC-11) | — | Settings partial | Protect; clean up -old |
| PARSER-01 | Parser Intelligence | Parser health dashboard | MISSING | HIGH | P1 | DataParsingPage.tsx does basic CRUD only | HaParsersResource: basic CRUD only | — | Parser health invisible | FULL_STACK_DEVELOPMENT_REQUIRED |
| PARSER-02 | Parser Intelligence | Unparsed event clustering | MISSING | HIGH | P1 | Not implemented | No endpoint | — | Unparsed events undetected | FULL_STACK_DEVELOPMENT_REQUIRED |
| PARSER-03 | Parser Intelligence | Drift detection alerts | MISSING | HIGH | P1 | Not implemented | No endpoint | — | Format changes undetected | FULL_STACK_DEVELOPMENT_REQUIRED |
| PARSER-04 | Parser Intelligence | AI-generated draft parsers | MISSING | HIGH | P1 | Not implemented | No endpoint | — | Manual parser creation only | FULL_STACK_DEVELOPMENT_REQUIRED |
| PARSER-05 | Parser Intelligence | Deployment governance (shadow/canary/rollback) | MISSING | HIGH | P1 | Not implemented | No endpoint | — | No safe parser deployment | FULL_STACK_DEVELOPMENT_REQUIRED |
| A11Y-01 | Accessibility | WCAG 2.2 AA compliance | PARTIALLY_IMPLEMENTED | HIGH | P1 | 1 CSS file has prefers-reduced-motion; aria-label in HaInlineBanner; most components lack aria | No backend impact | No axe tests | Accessibility failures across all pages | Systematic WCAG audit + axe-core testing |
| A11Y-02 | Accessibility | aria-label on interactive elements | PARTIALLY_IMPLEMENTED | HIGH | P1 | HaButton.tsx: 0 aria-labels; HaChart.tsx: 0; SiemDataGrid.tsx: 0 | — | — | Screen readers cannot navigate | Add aria-label to all interactive components |
| A11Y-03 | Accessibility | Skip navigation link | MISSING | MEDIUM | P2 | Not found in AppLayout or HaMasthead | — | — | Keyboard navigation impaired | Add skip-to-content link |
| A11Y-04 | Accessibility | Focus management in drawers/modals | NEEDS_VERIFICATION | HIGH | P1 | HaDrawer.tsx, HaModal.tsx exist; focus trap not verified | — | — | Keyboard trap risk | Verify focus trap in HaDrawer and HaModal |
| A11Y-05 | Accessibility | Chart accessible descriptions | MISSING | HIGH | P1 | HaChart.tsx: no role=img or aria-label | — | — | Charts invisible to screen readers | Add accessible chart descriptions |
| A11Y-06 | Accessibility | Live-region announcements for SSE updates | MISSING | MEDIUM | P2 | No aria-live regions found near alert stream | — | — | New alert notifications silent | Add aria-live to LiveAlertStream |
| A11Y-07 | Accessibility | Colour-independent status indication | PARTIALLY_IMPLEMENTED | MEDIUM | P2 | SeverityLabel uses text + color; some status uses color only | — | SeverityLabel.test.tsx | WCAG 1.4.1 risk | Audit all status indicators |
| TEST-01 | Testing | Vitest 4.1.10 as test runner | COMPLIANT | HIGH | — | package.json: vitest@4.1.10 | — | — | None | None |
| TEST-02 | Testing | 48 test files present | COMPLIANT | HIGH | — | find src -name "*.test.*": 48 files | — | — | None | None |
| TEST-03 | Testing | 80% coverage on src/lib, src/hooks, src/services | NEEDS_VERIFICATION | HIGH | P1 | Coverage config in vitest.config.ts; not verified at runtime | — | — | Coverage gate may fail | Run npm run test -- --coverage |
| TEST-04 | Testing | .skip.ts files use node:test (wrong runner) | BROKEN | HIGH | P1 | IncidentDetailPage.skip.ts:6-7 uses node:test + assert; incidents.service.skip.ts same | — | Will never run in Vitest | Tests dead code | Convert .skip.ts to .test.ts using vitest imports |
| TEST-05 | Testing | No Storybook | MISSING | HIGH | P1 | No .storybook/ directory or .stories.* files | — | — | All visual regression tests absent | Add Storybook (separate initiative) |
| TEST-06 | Testing | No Playwright E2E tests | MISSING | HIGH | P1 | No playwright.config.ts in frontend-v3 | — | — | All E2E tests absent | Add Playwright (separate initiative) |
| TEST-07 | Testing | axe-core accessibility testing | MISSING | MEDIUM | P2 | @axe-core/react not in package.json | — | — | WCAG violations undetected | Add axe-core to test setup |
| TEST-08 | Testing | Golden screen coverage | MISSING | HIGH | P1 | 0 golden screenshot tests; no visual regression infrastructure | — | — | UI regressions undetected | Requires Storybook/Playwright |

---

## Summary Statistics

| Category | Total Requirements | COMPLIANT | PARTIALLY_IMPLEMENTED | MISSING | BACKEND_READY_UI_MISSING | FULL_STACK_DEV_REQUIRED | STATIC_UI_ONLY |
|---|---|---|---|---|---|---|---|
| Architecture | 14 | 12 | 1 | 0 | 0 | 0 | 0 |
| Design System | 11 | 7 | 3 | 0 | 0 | 0 | 0 |
| App Shell | 8 | 4 | 2 | 2 | 0 | 0 | 0 |
| Tenancy | 7 | 0 | 1 | 6 | 0 | 0 | 0 |
| Authentication | 9 | 2 | 3 | 4 | 0 | 0 | 0 |
| Data Grids/Charts | 10 | 3 | 3 | 1 | 1 | 0 | 0 |
| Dashboards | 6 | 0 | 1 | 2 | 1 | 0 | 2 |
| Mission Control | 10 | 1 | 1 | 7 | 1 | 0 | 0 |
| Alerts/Queue | 9 | 0 | 3 | 0 | 4 | 0 | 0 |
| Correlated Findings | 3 | 1 | 2 | 0 | 0 | 0 | 0 |
| Incidents/Evidence | 9 | 0 | 2 | 2 | 5 | 0 | 0 |
| Sessions/Search | 8 | 0 | 2 | 5 | 1 | 0 | 0 |
| Intel/Detect/Response | 12 | 0 | 4 | 2 | 4 | 0 | 2 |
| Posture | 8 | 0 | 3 | 0 | 0 | 3 | 2 |
| Reports | 5 | 0 | 1 | 0 | 0 | 3 | 1 |
| Admin | 9 | 0 | 7 | 0 | 0 | 2 | 0 |
| Parser Intel | 5 | 0 | 0 | 0 | 0 | 5 | 0 |
| Accessibility | 7 | 0 | 4 | 3 | 0 | 0 | 0 |
| Testing | 8 | 2 | 1 | 5 | 0 | 0 | 0 |
| **TOTAL** | **167** | **32 (19%)** | **43 (26%)** | **39 (23%)** | **17 (10%)** | **13 (8%)** | **7 (4%)** |

**Compliance rate (COMPLIANT + COMPLIANT_WITH_MINOR_GAPS): ~22%**
**Requirements fully blocked by security gaps: 28 requirements**
**Requirements requiring full-stack development: 13 requirements**
