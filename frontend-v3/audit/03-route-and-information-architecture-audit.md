# 03 — Route and Information Architecture Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** `frontend-v3/src/router/index.tsx` (full read), `.plan/frontend-v3-spec/visual-approval/complete-route-catalogue.md`, skip.ts enumeration

---

## 1. Complete Route Catalogue (Actual vs Spec)

### Source of truth: `router/index.tsx` — 55 route definitions confirmed

| Route Path | Component | AuthGuard | allowedRoles | Spec Route-ID | Status | Notes |
|---|---|---|---|---|---|---|
| `/login` | LoginPage | None | Any | AUTH-01 | COMPLIANT | Public |
| `/login/tfa` | TfaPage | None | Any | AUTH-02 | COMPLIANT | Public |
| `/access-denied` | AccessDeniedPage | None | Any | AUTH-06 | COMPLIANT | Public |
| `/` → redirect | Navigate to /queue | AppLayout | — | — | COMPLIANT | Default landing |
| `/command` | CommandCenterPage | AuthGuard | Any authenticated | CMD-01 | PARTIALLY_IMPLEMENTED | No role restriction; spec requires VIEWER+ |
| `/queue` | AnalystQueuePage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | CMD-02 | PARTIALLY_IMPLEMENTED | Sub-components in .skip.ts |
| `/alerts` | AlertsListPage | AuthGuard | Any authenticated | CMD-05 | PARTIALLY_IMPLEMENTED | alerts.service.skip.ts |
| `/alerts/severity` | AlertSeverityBoardPage | AuthGuard | Any authenticated | CMD-06 | PARTIALLY_IMPLEMENTED | — |
| `/offenses` | CorrelatedFindingsPage | AuthGuard | Any authenticated | CMD-08 | PARTIALLY_IMPLEMENTED | offenses.service.skip.ts |
| `/offenses/:id` | CorrelatedFindingDetailPage | AuthGuard | Any authenticated | CMD-09 | PARTIALLY_IMPLEMENTED | .skip.ts exists |
| `/incidents` | IncidentListPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | CMD-03 | PARTIALLY_IMPLEMENTED | IncidentListPage.skip.ts |
| `/incidents/:id` | IncidentDetailPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | CMD-04 | PARTIALLY_IMPLEMENTED | IncidentDetailPage.skip.ts |
| `/hunt` | SearchHuntPage | AuthGuard | Any authenticated | INV-01 | STATIC_UI_ONLY | SearchHuntPage.skip.ts |
| `/investigations` | InvestigationsPage | AuthGuard | Any authenticated | INV-02 | PARTIALLY_IMPLEMENTED | — |
| `/investigations/:id` | InvestigationDetailPage | AuthGuard | Any authenticated | INV-03 | PARTIALLY_IMPLEMENTED | — |
| `/entities` | EntityListPage | AuthGuard | ANALYST, ADMIN | INV-04 | PARTIALLY_IMPLEMENTED | — |
| `/entities/:id` | EntityDetailPage | AuthGuard | ANALYST, ADMIN | INV-05 | PARTIALLY_IMPLEMENTED | — |
| `/constellation` | ThreatConstellationPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | INV-06 | COMPLIANT | Uses ECharts force-graph |
| `/intelligence` | HiveIntelligencePage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | INV-07 | COMPLIANT_WITH_MINOR_GAPS | Wrong API prefix |
| `/rules` | DetectionRulesPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-01 | PARTIALLY_IMPLEMENTED | DetectionRulesPage.skip.ts |
| `/rules/new` | RuleEditorPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-02 | PARTIALLY_IMPLEMENTED | RuleEditorPage.skip.ts |
| `/rules/:id/edit` | RuleEditorPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-02 | PARTIALLY_IMPLEMENTED | Same skip.ts |
| `/rules/:id/test` | RuleTestPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-03 | PARTIALLY_IMPLEMENTED | — |
| `/response/playbooks` | ResponsePlaybooksPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-04 | PARTIALLY_IMPLEMENTED | ResponsePlaybooksPage.skip.ts |
| `/response/playbooks/new/build` | PlaybookBuilderPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-05 | COMPLIANT_WITH_MINOR_GAPS | ReactFlow builder works |
| `/response/playbooks/:id/build` | PlaybookBuilderPage | AuthGuard | SOC_MANAGER, ADMIN | DEF-05 | COMPLIANT_WITH_MINOR_GAPS | Same |
| `/response/activity` | ResponseActivityPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | DEF-07 | PARTIALLY_IMPLEMENTED | ResponseActivityPage.skip.ts |
| `/response/authority` | ResponseAuthorityPage | AuthGuard | ADMIN only | DEF-06 | PARTIALLY_IMPLEMENTED | Backend SEC-GAP-02 critical |
| `/posture/assets` | AssetsPage | AuthGuard | Any authenticated | POS-01 | PARTIALLY_IMPLEMENTED | AssetsPage.skip.ts |
| `/posture/identities` | IdentitiesPage | AuthGuard | Any authenticated | POS-02 | PARTIALLY_IMPLEMENTED | — |
| `/posture/active-directory` | ActiveDirectoryPage | AuthGuard | SOC_MANAGER, ADMIN | POS-AD | STATIC_UI_ONLY | ActiveDirectoryPage.skip.ts; service fully stubbed |
| `/posture/exposure` | ExposurePage | AuthGuard | Any authenticated | POS-04 | STATIC_UI_ONLY | No backend |
| `/posture/sensors` | SensorGridPage | AuthGuard | ADMIN only | POS-05 | PARTIALLY_IMPLEMENTED | EDR unprotected |
| `/posture/vulnerabilities` | VulnerabilitiesPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | POS-03 | STATIC_UI_ONLY | VulnerabilitiesPage.skip.ts; no backend |
| `/posture/readiness` | ReadinessMatrixPage | AuthGuard | ANALYST, SOC_MANAGER, ADMIN | POS-06 | STATIC_UI_ONLY | No backend |
| `/compliance` | CompliancePage | AuthGuard | Any authenticated | POS-07 | PARTIALLY_IMPLEMENTED | — |
| `/dashboards` | DashboardGalleryPage | AuthGuard | Any authenticated | DSH-01 | PARTIALLY_IMPLEMENTED | — |
| `/dashboards/studio` | DashboardStudioPage | AuthGuard | Any authenticated | DSH-03 | MISSING | DashboardStudioPage.skip.ts |
| `/dashboards/:id` | DashboardViewPage | AuthGuard | Any authenticated | DSH-02 | PARTIALLY_IMPLEMENTED | GAP_SEC_06_RESOLVED=false |
| `/dashboards/:id/edit` | DashboardStudioPage | AuthGuard | Any authenticated | DSH-03 | MISSING | Same skip.ts |
| `/dashboards/metrics/builder` | MetricsBuilderPage | AuthGuard | Any authenticated | DSH-04 | PARTIALLY_IMPLEMENTED | GAP-SEC-06 |
| `/reports/sitrep` | SitrepReportPage | AuthGuard | Any authenticated | RPT-01 | STATIC_UI_ONLY | SitrepReportPage.skip.ts |
| `/reports/incidents` | IncidentReportsPage | AuthGuard | Any authenticated | RPT-02 | STATIC_UI_ONLY | IncidentReportsPage.skip.ts |
| `/reports/after-action` | AfterActionReportsPage | AuthGuard | Any authenticated | RPT-03 | STATIC_UI_ONLY | AfterActionReportsPage.skip.ts |
| `/reports/scheduled` | ScheduledReportsPage | AuthGuard | Any authenticated | RPT-04 | PARTIALLY_IMPLEMENTED | — |
| `/reports/templates` | ReportTemplatesPage | AuthGuard | Any authenticated | RPT-05 | STATIC_UI_ONLY | No backend |
| `/admin/users` | AdminUsersPage | AuthGuard | ADMIN | ADM-01 | PARTIALLY_IMPLEMENTED | AdminUsersPage.skip.ts |
| `/admin/tenants` | TenantsPage | AuthGuard | ADMIN | ADM-09 | STATIC_UI_ONLY | New TenantsPage; SEC-GAP-03 |
| `/admin/tenants-old` | AdminTenantsPage | AuthGuard | ADMIN | — | DEPRECATED | Remove; duplicates /admin/tenants |
| `/admin/retention` | RetentionPage | AuthGuard | ADMIN | ADM-04 | PARTIALLY_IMPLEMENTED | — |
| `/admin/data-parsing` | DataParsingPage | AuthGuard | ADMIN | ADM-05 | PARTIALLY_IMPLEMENTED | — |
| `/admin/integrations` | AdminIntegrationsPage | AuthGuard | ADMIN | ADM-02 | PARTIALLY_IMPLEMENTED | — |
| `/admin/notifications` | AdminNotificationsPage | AuthGuard | ADMIN | ADM-03 | PARTIALLY_IMPLEMENTED | — |
| `/admin/connection-keys` | AdminConnectionKeysPage | AuthGuard | ADMIN | ADM-06 | PARTIALLY_IMPLEMENTED | — |
| `/admin/audit` | AuditPage | AuthGuard | ADMIN | ADM-07 | PARTIALLY_IMPLEMENTED | — |
| `/admin/audit-old` | AdminAuditPage | AuthGuard | ADMIN | — | DEPRECATED | Duplicate; remove |
| `/admin/settings` | PlatformSettingsPage | AuthGuard | ADMIN | ADM-08 | PARTIALLY_IMPLEMENTED | — |
| `/admin/settings-old` | AdminSettingsPage | AuthGuard | ADMIN | — | DEPRECATED | Duplicate; remove |
| `*` | NotFoundPage | None (within AppLayout) | — | — | COMPLIANT | 404 handler |

---

## 2. IA Section Coverage

| IA Group | Spec Screen Count | Routes Present | Routes Missing | Coverage |
|---|---|---|---|---|
| Authentication (AUTH) | 6 | 3 (login, tfa, access-denied) | AUTH-03 SSO, AUTH-04 backup code, AUTH-05 session-expired overlay | 50% |
| Command Center (CMD) | 10 | 8 (queue, alerts, offenses, incidents, command, severity, offenses/:id, incidents/:id) | CMD-10 promote-alert modal | 80% |
| Investigation (INV) | 7 | 7 (hunt, investigations, investigations/:id, entities, entities/:id, constellation, intelligence) | 0 missing routes (all present) | 100% routes; functionality varies |
| Defence (DEF) | 7 | 7 (rules, rules/new, rules/:id/edit, rules/:id/test, playbooks, playbooks/build, activity, authority) | 0 missing routes | 100% routes |
| Posture (POS) | 7 | 7 (assets, identities, active-directory, exposure, sensors, vulnerabilities, readiness, compliance) | 0 missing routes | 100% routes; most STATIC_UI_ONLY |
| Dashboards (DSH) | 4 | 4 present | DashboardStudioPage.skip.ts breaks studio route | 75% functional |
| Reports (RPT) | 5 | 5 present | All 5 have .skip.ts or no backend | 0% functional |
| Administration (ADM) | 9 | 9 present + 3 deprecated -old routes | 0 missing | 100% routes; quality varies |

---

## 3. Routes Missing from Spec

The following spec Route-IDs have **no corresponding route** in `router/index.tsx`:

| Spec Route-ID | Display Name | Expected URL | Reason Missing |
|---|---|---|---|
| AUTH-03 | SSO Entry | `/login?sso=<provider>` | Backend GAP-SEC-11 not resolved |
| AUTH-04 | Backup Code Entry | `/login` overlay | Not implemented |
| AUTH-05 | Session Expired Overlay | Any route overlay | Modal not built |
| CMD-10 | Promote Alert to Incident | Modal over /alerts | No dedicated route (should be modal) |

**Note:** 4 missing routes are not critical — AUTH-03/04/05 are auth flows that can be added as overlays, and CMD-10 is a modal.

---

## 4. Navigation Label Accuracy

| Spec Label | Actual Sidebar Label | Status | File |
|---|---|---|---|
| Mission Control | "Mission Control" | COMPLIANT | CommandCenterPage.tsx:91 page title |
| Analyst Queue | "Analyst Queue" (inferred) | NEEDS_VERIFICATION | HaNavigation.tsx not fully read |
| Correlated Findings | — UI uses "Correlated Findings" | COMPLIANT | CorrelatedFindingsPage path: /offenses |
| Search & Hunt | — | NEEDS_VERIFICATION | — |
| Threat Constellation | — | NEEDS_VERIFICATION | — |
| Hive Intelligence | — | NEEDS_VERIFICATION | — |

**Action:** Full read of `HaNavigation.tsx` required to verify all sidebar labels match spec.

---

## 5. Feature Flag Gating

No `VITE_FEATURE_*` environment variable gating was found in any scanned file. Features are instead hidden by:

1. **`.skip.ts` mechanism** — TypeScript compilation excluded; component imported from stub
2. **`GAP_SEC_06_RESOLVED = false`** constant in `DashboardViewPage.tsx:33` — blocks all visualization data
3. **`showSecurityWarning={true}`** in `ThreatConstellationPage.tsx:255` — permanent security warning until GAP-SEC-INV-06 resolved

**Risk:** No runtime toggle mechanism; feature activation requires code changes and re-deployment.

---

## 6. `.skip.ts` Routes — Reachability Analysis

26 `.skip.ts` files found. Routes whose **active .tsx** is in the router are reachable but degraded:

| .skip.ts File | Impact | Router Route Reachable? | Functional? |
|---|---|---|---|
| AnalystQueuePage.skip.ts | Sub-components excluded | YES (/queue) | DEGRADED — toolbar and SSE banner missing |
| QueueToolbar.skip.ts | Toolbar excluded from queue | YES | DEGRADED |
| SseBanner.skip.ts | New-alert banner excluded | YES | DEGRADED |
| DetectionRulesPage.skip.ts | Core column defs may be excluded | YES (/rules) | DEGRADED |
| RuleEditorPage.skip.ts | Editor sub-components excluded | YES (/rules/new, /rules/:id/edit) | DEGRADED |
| IncidentListPage.skip.ts | List sub-components excluded | YES (/incidents) | DEGRADED |
| IncidentDetailPage.skip.ts | Detail tabs excluded; uses node:test (DEAD TESTS) | YES (/incidents/:id) | DEGRADED |
| CorrelatedFindingsPage.skip.ts | Core list features excluded | YES (/offenses) | DEGRADED |
| CorrelatedFindingDetailPage.skip.ts | Detail excluded | YES (/offenses/:id) | DEGRADED |
| ResponsePlaybooksPage.skip.ts | Playbook list excluded | YES (/response/playbooks) | DEGRADED |
| ResponseActivityPage.skip.ts | Activity log excluded | YES (/response/activity) | DEGRADED |
| AdminUsersPage.skip.ts | User management excluded | YES (/admin/users) | DEGRADED |
| AssetsPage.skip.ts | Asset list excluded | YES (/posture/assets) | DEGRADED |
| VulnerabilitiesPage.skip.ts | Replaced by stub | YES (/posture/vulnerabilities) | STUB ONLY |
| ActiveDirectoryPage.skip.ts | AD page excluded | YES (/posture/active-directory) | STUB ONLY |
| DashboardStudioPage.skip.ts | Studio excluded | YES (/dashboards/studio, /dashboards/:id/edit) | BROKEN — renders stub |
| DashboardStudioRenderers.skip.ts | Studio renderers excluded | YES | BROKEN |
| SearchHuntPage.skip.ts | Entire search excluded | YES (/hunt) | STUB ONLY |
| SitrepReportPage.skip.ts | SITREP excluded | YES (/reports/sitrep) | STUB ONLY |
| IncidentReportsPage.skip.ts | Excluded | YES (/reports/incidents) | STUB ONLY |
| AfterActionReportsPage.skip.ts | Excluded | YES (/reports/after-action) | STUB ONLY |
| useOpenAlertCount.skip.ts | Hook excluded | Affects /queue | DEGRADED |
| EngineeringNotice.skip.ts | Notice component excluded | Affects various | — |
| alerts.service.skip.ts | Alert service stubbed | Affects /alerts, /queue | BROKEN — no real calls |
| offenses.service.skip.ts | Offense service stubbed | Affects /offenses | BROKEN |
| incidents.service.skip.ts | Incident service stubbed | Affects /incidents | BROKEN — uses node:test (DEAD) |

---

## 7. Permission Guard Coverage

| Route | AuthGuard Present? | Role Restriction | Spec Minimum Role | Status |
|---|---|---|---|---|
| /command | YES | None (any auth) | VIEWER | COMPLIANT (any auth = VIEWER) |
| /queue | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /alerts | YES | None | ANALYST | NEEDS_VERIFICATION — spec says ANALYST; no role restriction |
| /offenses | YES | None | ANALYST | UNDER-RESTRICTED |
| /incidents | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /hunt | YES | None | ANALYST | UNDER-RESTRICTED |
| /investigations | YES | None | ANALYST | UNDER-RESTRICTED |
| /entities | YES | ANALYST, ADMIN | ANALYST | COMPLIANT |
| /constellation | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /intelligence | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /rules | YES | SOC_MANAGER, ADMIN | OPERATOR/SOC_MANAGER | COMPLIANT |
| /response/playbooks | YES | SOC_MANAGER, ADMIN | OPERATOR | COMPLIANT |
| /response/activity | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /response/authority | YES | ADMIN | ADMIN | COMPLIANT |
| /posture/assets | YES | None | ANALYST | UNDER-RESTRICTED |
| /posture/sensors | YES | ADMIN | ANALYST (view), OPERATOR (EDR) | OVER-RESTRICTED (blocks analysts from viewing) |
| /posture/vulnerabilities | YES | ANALYST, SOC_MANAGER, ADMIN | ANALYST | COMPLIANT |
| /dashboards | YES | None | VIEWER | COMPLIANT |
| /admin/* | YES | ADMIN | ADMIN | COMPLIANT |

**Issues:**
- `/alerts`, `/hunt`, `/investigations`, `/posture/assets` have no role restriction — READ_ONLY users can access
- `/posture/sensors` is ADMIN-only in router but spec allows ANALYST to view sensor health (EDR actions should require OPERATOR)

---

## 8. Deprecated Routes (should be removed)

| Route | Component | Issue |
|---|---|---|
| `/admin/tenants-old` | AdminTenantsPage | Replaced by `/admin/tenants` (TenantsPage) |
| `/admin/audit-old` | AdminAuditPage | Replaced by `/admin/audit` (AuditPage) |
| `/admin/settings-old` | AdminSettingsPage | Replaced by `/admin/settings` (PlatformSettingsPage) |

These dead routes increase bundle size and confuse future developers. Remove in next cleanup sprint.
