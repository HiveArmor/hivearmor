# Task 5 — Dead Code Audit
**Date:** 2026-07-08  
**Scope:** Backend Java, frontend-v2 (Next.js), Angular → Next.js migration gap analysis

---

## 1. Backend Dead Services

### 1a. Top-Level Services With Zero REST Callers

The following service classes in `backend/src/main/java/com/nilachakra/service/` have **zero injections** in any `web/rest/` Resource class:

| Service | REST callers | Broader usage | Verdict |
|---------|-------------|---------------|---------|
| `ApplicationPropertyService` | 0 | Used by `NetworkScanService` internally | LOW-RISK to remove from REST layer — only called internally by another service |
| `DefinitionSyncService` | 0 | No usages found anywhere outside its own file | **DEAD — HIGH confidence** |
| `UtmAlertLastService` | 0 | No usages found | **DEAD — HIGH confidence** |
| `UtmAlertSocaiProcessingRequestService` | 0 | No usages found | **DEAD — HIGH confidence** |

All four services have corresponding `@Entity` domain objects (`UtmAlertLast`, `UtmAlertSocaiProcessingRequest`) and presumably repository interfaces. If the services are removed, the domain classes and repos can be cleaned up too.

### 1b. Notable: Single-Point Services (Low Risk, Not Dead)
These have exactly one REST caller — fine to leave but worth noting for future consolidation:
- `AuditEventService` (1)
- `UtmAlertLogQueryService` (1)
- `UtmAlertLogService` (1)
- `UtmAlertTagQueryService` (1)
- `UtmAlertTagRuleService` (1)
- `UtmAssetMetricsService` (1)
- `UtmClientService` (1)
- `UtmConfigurationParameterQueryService` (1)

---

## 2. Orphaned Domain Entities

### 2a. `federation_service/` Subdomain
**Files:**
- `domain/federation_service/UtmFederationServiceClient.java` — JPA entity for `utm_federation_service_client` table
- `domain/federation_service/ClientDTO.java`

**Status:** The `UtmFederationServiceClientResource` REST controller **IS implemented** and exposes two endpoints:
- `GET /api/federation-service/generateApiToken`
- `GET /api/federation-service/token`

However, **neither endpoint is called from frontend-v2** (zero grep matches for `federation-service` in `frontend-v2/src/`). Angular also had `api/federation-service` in its service URLs, suggesting this was called from the old UI. Since the frontend-v2 migration is incomplete for this feature, the backend is live but the front end has not been migrated.

**Verdict:** Not dead backend code — but a migration-dependent endpoint (see Section 6).

### 2b. `getting_started/` Subdomain
**Files:**
- `domain/getting_started/UtmGettingStarted.java` — JPA entity for `utm_getting_started` table
- `domain/getting_started/GettingStartedStepEnum.java`

**Status:** The `UtmGettingStartedResource` REST controller IS implemented (`POST /api/utm-getting-started/init`, `GET /api/utm-getting-started`, etc.). The frontend-v2 has a `getting-started/page.tsx` and a `getting-started.service.ts`. This appears **actively used** — not orphaned.

### 2c. No `UtmAlertLast` / `UtmAlertSocaiProcessingRequest` REST Callers
The domain entities `UtmAlertLast.java` and `UtmAlertSocaiProcessingRequest.java` correspond to the dead services identified in §1a. Both are likely **safe to remove** along with their services and repositories.

---

## 3. `@Deprecated` Inventory

Only **one** `@Deprecated` annotation found in the entire codebase:

```
backend/src/main/java/com/nilachakra/service/dto/incident/NewIncidentDTO.java:38
```

A field in `NewIncidentDTO` is deprecated. Low priority — review whether callers still use the deprecated field before removing.

---

## 4. Large Commented-Out Code Blocks

Top files by comment-line density:

| File | Commented lines |
|------|----------------|
| `web/rest/compliance/CustomComplianceResource.java` | **335** |
| `service/compliance/hipaa/HipaaService.java` | **138** |
| `web/rest/compliance/HipaaResource.java` | **61** |
| `service/ApplicationPropertyService.java` | 32 |
| `config/Constants.java` | 29 |
| `web/rest/incident/UtmIncidentHistoryResource.java` | 26 |

**High priority:** `CustomComplianceResource.java` has 335 commented lines — this is likely either dead feature code or code commented out during a migration. Needs manual review to determine if the commented blocks represent working logic that should be restored or legacy code to delete.

The gRPC stub files (`service/grpc/UtmCommand.java`, etc.) each have ~7 commented lines — these are generated protobuf stubs and the comments are auto-generated; no action needed.

Also notable: In `app-routing.module.ts` (Angular), two routes are commented out:
- `explore` (FileBrowser module)  
- `reports` (Report module)

These indicate partially-completed features in Angular itself.

---

## 5. Frontend-v2 Unused Components

### 5a. Truly Unused (zero external imports)
After cross-referencing all components against pages, other components, and barrel files:

| Component | Path | Notes |
|-----------|------|-------|
| `stat-card` | `components/ui/stat-card.tsx` | **Unused** — `kpi-card` covers the same use case; `stat-card` exports `StatCard` but nothing imports it |
| `alert-filters-panel` | `components/alerts/alert-filters-panel.tsx` | **Unused** — alert page uses inline filter logic instead |

### 5b. Apparently Zero-Import But Actually Used (via intermediate component)
These showed zero direct page imports but are imported by a component that is itself imported:

| Component | Imported by |
|-----------|-------------|
| `stream-status-dot` | `topbar.tsx` (which is imported by `app-shell.tsx`) |
| `command-palette` | `topbar.tsx` |
| `delta-badge` | `kpi-card.tsx` |
| `alert-risk-card` | `alert-board-column.tsx` |
| `alert-status-badge` | `alert-detail-panel.tsx` |
| `compliance-eval-history-chart` | `compliance-control-drawer.tsx` |
| `sidebar`, `topbar`, `status-bar`, `ai-assistant-drawer` | All imported in `app-shell.tsx` |

All layout components (`sidebar`, `topbar`, `status-bar`, `stream-status-dot`, `ai-assistant-drawer`) flow through `app-shell.tsx` and are live.

---

## 6. Frontend-v2 TODO/WIP Inventory

No `TODO`, `WIP`, `FIXME`, `HACK`, or `// stub` / `// mock` comments were found in `.tsx` or `.ts` files under `frontend-v2/src/`.

However, two significant **mock-data patterns** were identified:

| File | Issue |
|------|-------|
| `(app)/active-directory/page.tsx` | Entire page uses **hardcoded mock data** (`MOCK_OVERVIEW`, `MOCK_USERS`, `MOCK_EVENTS`, `MOCK_REPORTS`) — no real API calls. This is a stub page that renders static fixture data. |
| `(app)/incidents/demo/page.tsx` | Named route `/incidents/demo` exists as a convenience route that loads `InvestigationPage` with `id = "demo"` — this is intentional scaffolding but should be removed before production. |

The `compliance/page.tsx` uses the variable name `placeholders` but this is legitimate loading-state code (builds skeleton entries while data loads), not mock data.

---

## 7. Angular vs Next.js Feature Parity Table

Angular route paths come from `app-routing.module.ts` and sub-routing modules.

| Angular Route | Feature | Next.js Page | Status |
|---------------|---------|-------------|--------|
| `/dashboard` | SOC dashboard | `/dashboard/page.tsx` | **REPLICATED** |
| `/data` → alert-management | Alert management | `/alerts/page.tsx` | **REPLICATED** |
| `/data-sources` → assets-discover | Data sources / asset discovery | `/data-sources/page.tsx` | **REPLICATED** |
| `/management` → admin | Admin panel | `/admin/page.tsx` | **PARTIAL** (see below) |
| `/creator` | Chart/dashboard builder | `/creator/page.tsx` | **REPLICATED** |
| `/integrations` → app-module | Integrations / modules | `/integrations/page.tsx` | **REPLICATED** |
| `/variables` | Automation variables | `/admin/variables/page.tsx` | **REPLICATED** |
| `/active-directory` | Active Directory analytics | `/active-directory/page.tsx` | **PARTIAL** — page exists but uses 100% hardcoded mock data, no real API calls |
| `/discover` → log-analyzer | Log analyzer / discover | `/logs/page.tsx` | **REPLICATED** |
| `/compliance` | Compliance frameworks | `/compliance/page.tsx` | **REPLICATED** |
| `/data-parsing` → logstash | Data parsing / logstash | `/data-parsing/page.tsx` | **REPLICATED** |
| `/soar` | SOAR / incident response | `/soar/page.tsx` | **REPLICATED** |
| `/incident` | Incident management | `/incidents/page.tsx` | **REPLICATED** |
| `/getting-started` | Getting started wizard | `/getting-started/page.tsx` | **REPLICATED** |
| `/threat-intelligence` → threatwind | Threat intelligence | `/threat-intel/page.tsx` | **REPLICATED** (1725 lines, real API) |
| `/alerting-rules` → rule-management | Correlation/alerting rules | `/rules/page.tsx` | **REPLICATED** |
| `/app-management/settings/rollover` | Index rollover / data retention | — | **MISSING** |
| `/app-management/settings/menu-management` | Menu/nav management | — | **MISSING** |
| `/app-management/settings/identity-provider` | SSO / IdP config | — | **MISSING** |
| `/app-management/settings/app-logs` | Application logs viewer | — | **MISSING** |
| `/app-management/settings/api-doc` | Swagger/API documentation | — | **MISSING** |
| `/app-management/settings/index-pattern` | Index pattern management | — | **MISSING** |
| `[commented out]` `/vulnerability-scanner` | OpenVAS vuln scanner | `/vulnerability-scanner/page.tsx` | **PARTIAL** — page uses `scanner.service.ts` wrapping `utm-network-scans` (not openvas); the OpenVAS API endpoints are not exposed in frontend-v2 |
| `[commented out]` `/reports` | Scheduled reports | `/reports/page.tsx` | **PARTIAL** — page exists (466 lines), wiring needs verification |
| `[commented out]` `/explore` → filebrowser | File browser | — | **MISSING** (and commented out in Angular too — likely abandoned) |

### Admin Sub-Feature Breakdown
The Angular `/management` → `app-management` settings has these child routes. Next.js covers some via `/admin/`:

| Angular child | Next.js equivalent | Status |
|---------------|--------------------|--------|
| `connection-key` | `/admin/connection-keys/page.tsx` | REPLICATED |
| `notifications` | `/admin/notifications/page.tsx` | REPLICATED |
| `users` / `audits` | `/admin/page.tsx` (includes user mgmt + audit log) | REPLICATED |
| `api-keys` | `/settings/page.tsx` (API keys section) | REPLICATED |
| `rollover` | — | **MISSING** |
| `menu-management` | — | **MISSING** |
| `identity-provider` | — | **MISSING** |
| `app-logs` | — | **MISSING** |
| `api-doc` | — | **MISSING** |
| `index-pattern` | — | **MISSING** |
| `health-checks` | Partially in `/admin/page.tsx` | PARTIAL |
| `index-management` | `/opensearch/page.tsx` + `/admin/search-acceleration/page.tsx` | PARTIAL |
| `app-theme` | Absorbed into settings | REPLICATED |
| `[commented out] license` | — | MISSING (SaaS-only, may be intentional) |

---

## 8. Migration-Dependent Endpoints (5d)

These backend API paths are **called by Angular but not by frontend-v2**. They must remain live until the corresponding frontend-v2 page is implemented or the feature is consciously dropped.

| API Path | Angular caller | frontend-v2 status | Priority |
|----------|---------------|-------------------|----------|
| `api/openvas/*` (tasks, results, targets, scanners, etc.) | `vs-task.service.ts`, `vs-vulnerability-overview.service.ts` | Not called — frontend-v2 `vulnerability-scanner` page uses `utm-network-scans` instead | Medium — OpenVAS integration dropped or rearchitected |
| `api/utm-gvm-tasks/`, `api/utm-gvm-scan-result/` | Angular vulnerability scanner | Not in frontend-v2 | Medium — same as above |
| `api/utm-ad-reports`, `api/ad/dashboard/`, `api/ad/utm-ad-*` | Angular active-directory module | Not called — frontend-v2 AD page uses mock data | **High** — AD page is all stubs |
| `api/federation-service/generateApiToken`, `api/federation-service/token` | Angular (resourceUrl `'api/federation-service'`) | Not in frontend-v2 | High — multi-tenant feature not migrated |
| `api/licence` | Angular license module (commented out) | Not in frontend-v2 | Low — feature disabled |
| `api/isLiteMode` | Angular lite-mode routing | Not in frontend-v2 | Low — may be intentionally dropped |
| `api/system-restart/` | Angular app-management | Not in frontend-v2 | Medium — admin feature not yet in Next.js settings |
| `api/utm-softwares` | Angular network-scan module | Not in frontend-v2 | Low |
| `api/winlogbeat-info-by-filter` | Angular data sources | Not in frontend-v2 | Low |
| `api/utm-auditor-users-by-src` | Angular admin auditor | Not in frontend-v2 | Low |
| `api/utm-ad-reports` | Angular AD module | Not in frontend-v2 | High — AD page is a stub |
| `api/utm-getting-started` | Angular getting-started | **Covered** by `getting-started.service.ts` in frontend-v2 | None |
| `api/log-analyzer/*` | Angular discover module | **Covered** by `log-analyzer.service.ts` in frontend-v2 | None |

---

## Summary / Action Priority

### Remove Now (High Confidence Dead Code)
1. `DefinitionSyncService.java` + any impl + repo
2. `UtmAlertLastService.java` + `UtmAlertLast.java` domain entity
3. `UtmAlertSocaiProcessingRequestService.java` + `UtmAlertSocaiProcessingRequest.java` domain entity
4. `components/ui/stat-card.tsx` — unused, `kpi-card` is the canonical alternative
5. `components/alerts/alert-filters-panel.tsx` — unused, inline logic in page replaces it
6. `(app)/incidents/demo/page.tsx` — development convenience route, not a real page

### Investigate Before Removing
7. `CustomComplianceResource.java` — 335 commented lines need manual review
8. `HipaaService.java` — 138 commented lines (hipaa compliance logic possibly gutted)
9. `NewIncidentDTO.java` — single `@Deprecated` field; verify no callers before removing

### Build Before Cutting Angular
10. `/active-directory` page — **stub, all mock data** — must wire to `api/ad/*` before Angular can be decommissioned
11. Federation service feature — not migrated at all
12. Admin sub-features: rollover, menu-management, identity-provider, app-logs, index-pattern
