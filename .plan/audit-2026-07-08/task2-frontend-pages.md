# Frontend-v2 Page Audit — 2026-07-08

## Audit Methodology

All 53 `page.tsx` files under `frontend-v2/src/app` were read in full. For each page, the following were assessed:
- Data source pattern (real API service call, DEMO/MOCK constant, EmptyState stub, or fallback hybrid)
- Backend API endpoints called (via service files where imported)
- Role applicability
- RBAC enforcement presence
- UX quality for an 8-hour SOC analyst shift

Auth guard pattern is documented separately in Section 2.

---

## Section 1 — Complete Page Map

### Legend
- **Real Data**: Y = real API call, MOCK = hardcoded static data only, DEMO = DEMO_ fallback (real call attempted, falls back to demo), PARTIAL = some real, some mock, STUB = EmptyState only
- **RBAC in UI**: whether the page itself checks user authorities before rendering
- **UX Quality**: OPERATIONAL | FUNCTIONAL | DEGRADED | STUB | BROKEN

| Route | Feature | Real Data | Primary APIs Called | Target Roles | RBAC in UI | UX Quality |
|-------|---------|-----------|---------------------|--------------|-----------|------------|
| `/` | Root redirect | N/A | none (redirect to /login) | all | no | N/A |
| `/login` | Authentication | Y | `POST /api/authenticate`, `GET /api/account` | all (pre-auth) | no | OPERATIONAL |
| `/getting-started` | Setup wizard | Y | `GET /api/getting-started/steps`, `POST /api/getting-started/steps/:id/complete` | ROLE_ADMIN | no | FUNCTIONAL |
| `/dashboard` | Security Operations overview | Y | `GET /api/overview/stats`, `/api/overview/timeline`, `/api/overview/top-sources`, `/api/overview/collectors`, `/api/overview/critical-alerts`, `/api/overview/geo-threats`, `/api/overview/mitre-tactics` | ROLE_ANALYST, ROLE_MANAGER, ROLE_VIEWER | no | OPERATIONAL |
| `/dashboard/threat-activity` | Threat activity feed | STUB | none | ROLE_ANALYST, ROLE_MANAGER | no | STUB |
| `/dashboard/render/[id]/[name]` | Custom dashboard renderer | Y | `GET /api/utm-dashboards/:id/visualizations` + widget queries via OpenSearch | ROLE_ANALYST, ROLE_MANAGER, ROLE_VIEWER | no | FUNCTIONAL |
| `/alerts` | Alert triage (board + list) | Y | `GET /api/utm-alerts` (paginated, filterable), `POST /api/utm-alerts/status`, `POST /api/utm-alerts/tags`, `POST /api/utm-alerts/notes`, `POST /api/utm-alerts/convert-to-incident` | ROLE_ANALYST, ROLE_MANAGER | no | OPERATIONAL |
| `/alerts/adversary` | Adversary view | STUB | none | ROLE_ANALYST, ROLE_MANAGER | no | STUB |
| `/alerts/tagging-rules` | Alert tagging rules | STUB | none | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | STUB |
| `/incidents` | Incident board/table | Y | `GET /api/utm-incidents` (paginated), `POST /api/utm-incidents`, `PUT /api/utm-incidents/:id/status`, `PUT /api/utm-incidents/:id/priority` | ROLE_ANALYST, ROLE_MANAGER | no | OPERATIONAL |
| `/incidents/[id]` | Incident investigation workspace | PARTIAL | `GET /api/utm-incidents/:id`; evidence board, timeline, and entity graph use DEMO_EVIDENCE/DEMO_TIMELINE/DEMO_GRAPH hardcoded data | ROLE_ANALYST, ROLE_MANAGER | no | DEGRADED |
| `/incidents/demo` | Demo investigation workspace | MOCK | none (re-renders [id] page with id="demo") | any | no | FUNCTIONAL |
| `/logs` | Log explorer (multi-tab) | Y | `GET /api/elastic/index-patterns`, `POST /api/elastic/search`, `GET /api/elastic/field-stats` | ROLE_ANALYST, ROLE_MANAGER, ROLE_VIEWER | no | OPERATIONAL |
| `/rules` | Detection rules (4-tab: detection/response/packs/coverage) | Y | `GET /api/correlation-rule` (list), `POST/PUT/DELETE /api/correlation-rule`, `PUT /api/correlation-rule/activate-deactivate`, `POST /api/correlation-rule/import`, `GET /api/correlation-rule/packs`, `GET /api/utm-alert-response-rules` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | OPERATIONAL |
| `/rules/coverage` | MITRE ATT&CK coverage matrix | Y | `GET /mitre-attack-v15.json` (static file), `GET /api/mitre/coverage`, `GET /api/mitre/rules?techniqueId=`, `PUT /api/correlation-rule/activate-deactivate` | ROLE_ANALYST, ROLE_MANAGER | no | OPERATIONAL |
| `/compliance` | Compliance posture + reports | Y | `GET /api/compliance/standard`, `GET /api/compliance/standard/:id/sections`, `GET /api/compliance/controls/:id/latest-evaluation`, `GET /api/utm-compliance-report-config`, `POST /api/utm-compliance-report-config`, `GET /api/compliance-report-schedules`, `POST /api/compliance-report-schedules` | ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/reports` | Security reports | Y | `GET /api/utm-report-sections` (templates), `GET /api/utm-compliance-report-config` (generated), `GET /api/compliance-report-schedules`, `POST /api/utm-compliance-report-config`, `DELETE /api/compliance-report-schedules/:id` | ROLE_MANAGER, ROLE_ADMIN, ROLE_VIEWER | no | FUNCTIONAL |
| `/threat-intel` | Threat intelligence + IOC lookup | PARTIAL | `GET /api/v1/threat-intel/feeds`, `PUT /api/v1/threat-intel/feeds/:id`, `POST /api/v1/threat-intel/feeds/:id/sync`; IOC query tries `GET /api/v1/threat-intel/lookup` then falls back to DEMO_RESULT_185 | ROLE_ANALYST, ROLE_MANAGER | no | DEGRADED |
| `/uba` | User/entity behavior analytics | DEMO | `GET /api/uba/summary`, `GET /api/uba/entities`, `GET /api/uba/anomalies`; initializes state with DEMO_ENTITIES/DEMO_ANOMALIES, replaces on successful load; KPI row falls back to DEMO_SUMMARY if API fails | ROLE_ANALYST, ROLE_MANAGER | no | DEGRADED |
| `/active-directory` | Active Directory monitoring | MOCK | none (all state initialized from MOCK_OVERVIEW / MOCK_USERS / MOCK_EVENTS / MOCK_REPORTS; no API calls made) | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | BROKEN |
| `/offenses` | Offense/case management | Y | `GET /api/offenses` (paginated, tab-filtered) | ROLE_ANALYST, ROLE_MANAGER | no | FUNCTIONAL |
| `/offenses/[id]` | Offense detail | Y | `GET /api/offenses/:id`, `PUT /api/offenses/:id/status` | ROLE_ANALYST, ROLE_MANAGER | no | FUNCTIONAL |
| `/edr` | Endpoint Detection & Response | Y | `GET /api/edr/events`, `GET /api/edr/rules`, `GET /api/edr/isolations` (via edrService) | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/edr/[agentId]` | Agent-specific EDR detail | Y | `GET /api/edr/events?agentId=`, agent-scoped edrService queries | ROLE_ANALYST, ROLE_MANAGER | no | FUNCTIONAL |
| `/agents` | Agent management (agents/groups/policies) | Y | `GET /api/agent-manager/agents`, `GET /api/agent-manager/groups`, `GET /api/agent-manager/policies` | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/agents/[id]` | Individual agent detail | Y | `GET /api/agent-manager/agents/:id` + config operations | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/soar` | Playbooks list | Y | `GET /api/soar/playbooks`, `DELETE /api/soar/playbooks/:id` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/soar/flows` | Playbook builder (drag-and-drop) | Y | `GET /api/soar/playbooks/:id` (load), `POST /api/soar/playbooks` (save), `POST /api/soar/playbooks/:id/execute` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/soar/audit` | SOAR execution audit log | Y | `GET /api/soar/playbooks/:id/executions` (NotificationService) | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/soar/console` | SOAR live console (WebSocket) | Y | `GET /api/agent-manager/agents`, WebSocket incident command stream | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/scanner` | Network scanner + asset management | Y | `GET /api/scanner/assets`, `POST /api/scanner/scan`, `GET /api/scanner/asset-groups`, `POST /api/scanner/asset-groups`, `DELETE /api/scanner/assets/:id` | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/vulnerability-scanner` | Vulnerability management | Y | full scanner + CVE management via `scannerService` | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/integrations` | Integration catalog | MOCK | all state from DEMO_INTEGRATIONS hardcoded array; no service calls | ROLE_ADMIN | no | BROKEN |
| `/data-sources` | Agent + collector management (4-tab) | Y | `GET /api/agent-manager/agents`, `GET /api/agent-manager/groups`, `GET /api/collectors` | ROLE_ADMIN, ROLE_MANAGER | no | FUNCTIONAL |
| `/data-sources/collectors` | Cloud/SaaS collectors | STUB | none | ROLE_ADMIN | no | STUB |
| `/data-sources/collector-groups` | Collector groups | STUB | none | ROLE_ADMIN | no | STUB |
| `/data-sources/groups` | Source groups | STUB | none | ROLE_ADMIN | no | STUB |
| `/data-parsing` | Logstash pipeline editor | Y | `GET /api/logstash/pipelines`, `POST/PUT/DELETE /api/logstash/pipelines`, `POST /api/logstash/pipelines/:id/toggle` | ROLE_ADMIN | no | FUNCTIONAL |
| `/opensearch` | OpenSearch admin (cluster/indices/ISM) | Y | `GET /api/opensearch/cluster`, `GET /api/opensearch/indices`, `GET /api/opensearch/templates`, `DELETE /api/opensearch/indices/:index`, `POST /api/opensearch/snapshots` etc. | ROLE_ADMIN | no | FUNCTIONAL |
| `/creator` | Dashboard creator hub | Y | `GET /api/utm-dashboards` (via dashboardService) | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/creator/dashboards` | Dashboard list | Y | `GET /api/utm-dashboards` (paginated, searchable), `DELETE /api/utm-dashboards/:id` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/creator/dashboards/new` | Dashboard editor/builder | Y | `GET /api/utm-dashboards/:id/visualizations`, `POST/PUT/DELETE /api/utm-dashboards`, widget queries | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/creator/visualizations` | Visualization list | Y | `GET /api/utm-visualizations` (via visualizationService) | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/creator/visualizations/new` | New visualization wizard | Y | `POST /api/utm-visualizations` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/creator/visualizations/builder` | Visualization builder (chart editor) | Y | `GET /api/elastic/index-patterns`, `POST /api/elastic/search`, `POST /api/utm-visualizations` | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | FUNCTIONAL |
| `/admin` | Admin console (users/roles/audit/health) | PARTIAL | Health tab: real `GET /api/utm-service-manager/services`, other tabs use DEMO_USERS / DEMO_ROLES / DEMO_AUDIT; users tab calls `GET /api/account` on load | ROLE_ADMIN | no | DEGRADED |
| `/admin/users` | User management | Y | `GET /api/users` (paginated), `POST /api/register`, `PUT /api/users/:login`, `DELETE /api/users/:login` | ROLE_ADMIN | yes (checks `ROLE_ADMIN` in authorities on display, but no guard blocking non-admins) | FUNCTIONAL |
| `/admin/settings` | System configuration | Y | `GET /api/utm-application-events/sections`, `PUT /api/utm-application-events/:id` | ROLE_ADMIN | no | FUNCTIONAL |
| `/admin/notifications` | Notification channels + routes | Y | `GET/POST/PUT/DELETE /api/notification-channels`, `GET/POST/DELETE /api/notification-routes`, `GET /api/utm-notifications` | ROLE_ADMIN | no | FUNCTIONAL |
| `/admin/connection-keys` | API / connection key management | Y | `GET /api/utm-connection-key`, `POST /api/utm-connection-key/:name/generate`, `DELETE /api/utm-connection-key/:name` | ROLE_ADMIN | no | FUNCTIONAL |
| `/admin/search-acceleration` | OpenSearch index acceleration settings | Y | `GET /api/search-acceleration`, `PUT /api/search-acceleration`, `POST /api/search-acceleration/apply` | ROLE_ADMIN | no | FUNCTIONAL |
| `/admin/variables` | Automation variables | STUB | none | ROLE_ADMIN | no | STUB |
| `/settings` | User/system settings (profile, notifications, API keys, appearance) | MOCK | API keys section uses DEMO_API_KEYS; health checks use DEMO_HEALTH_CHECKS; general/appearance sections have no API calls | ROLE_ANALYST, ROLE_MANAGER, ROLE_ADMIN | no | BROKEN |
| `/settings/soc-ai` | SOC AI / LLM provider config | Y | `GET /api/utm-module-group-conf?moduleGroup=SOC_AI`, `POST/PUT /api/utm-module-group-conf` | ROLE_ADMIN | no | FUNCTIONAL |

---

## Section 2 — Authentication and Route Protection Architecture

### How Auth Works

**Global guard** is in `/frontend-v2/src/components/layout/app-shell.tsx`. It:
1. Calls `useAuthStore().checkAuth()` on mount — makes `GET /api/account` to verify the JWT is still valid
2. Watches `isLoading + isAuthenticated` state — if not authenticated after load, calls `router.replace("/login")`
3. Shows a loading spinner while `isLoading === true`
4. On `firstLogin`, hits `gettingStartedService.getSteps()` and redirects to `/getting-started` if any step is incomplete

**All `(app)` routes** are wrapped in `(app)/layout.tsx` which renders `<AppShell>`. This is the only route guard. There is **no Next.js middleware** (`middleware.ts` does not exist).

**Login flow** (`/login/page.tsx`):
- Calls `POST /api/authenticate` with credentials
- If `tfaConfigured`, redirects to `/login/tfa` (page does not exist yet — future phase)
- On success, calls `GET /api/account` to hydrate user + `authorities[]` into Zustand store

**Auth store** (`/src/store/auth.ts`):
- User object includes `authorities: string[]` (e.g. `["ROLE_ADMIN"]`, `["ROLE_USER"]`)
- `isAuthenticated` is set based on JWT presence + account fetch success
- No role-based routing logic exists in the store itself

### RBAC Enforcement Summary

| Enforcement Level | Count | Notes |
|---|---|---|
| No route guard at all | 51/53 pages | Only authentication (logged-in check) is enforced |
| Partial authority display | 1/53 pages | `/admin/users` renders `ROLE_ADMIN` badges on users but does not block non-admins from accessing the page |
| True RBAC enforcement | 0/53 pages | No page checks `user.authorities` before rendering or performing actions |
| Global auth guard | All `(app)` routes | AppShell redirects to `/login` if unauthenticated — but no role checking |

**Critical finding:** A `ROLE_USER`/viewer account can navigate to `/admin`, `/admin/connection-keys`, `/admin/users`, `/opensearch`, `/data-parsing`, and every destructive action page. The server-side backend is the only enforcement layer.

---

## Section 3 — Top 10 UX Gaps for SOC Operations

Ranked by impact on analyst effectiveness during an 8-hour shift:

### 1. Investigation workspace uses hardcoded demo data (CRITICAL)
**Page:** `/incidents/[id]`
**Problem:** The evidence board, attack timeline, and entity graph are all populated with `DEMO_EVIDENCE`, `DEMO_TIMELINE`, and `DEMO_GRAPH` constants even when a real incident ID is loaded. The header metadata (name, severity, status) loads from the real API, but the investigative content is fake. An analyst investigating a real incident sees fabricated evidence.
**Impact:** Any analyst action taken on what appears to be evidence is meaningless. The page rating is DEGRADED — it looks operational but serves false data for the most critical SOC workflow.

### 2. No inline alert → incident escalation path (HIGH)
**Page:** `/alerts`
**Problem:** The alert list has a `POST /api/utm-alerts/convert-to-incident` call wired in, but the UX does not present a clear "Escalate to Incident" button in the bulk toolbar or alert detail panel. The SOAR launcher exists, but the escalation path requires users to know the API exists.
**Impact:** Analysts doing triage cannot quickly push critical alerts into incident management without navigating away or using SOAR.

### 3. Active Directory page is entirely mocked (HIGH)
**Page:** `/active-directory`
**Problem:** All four data sections (overview stats, user list, login events, reports) are set from `MOCK_` constants at `useState` init. No API call is ever made. For environments using Windows AD, this page provides zero operational value.
**Impact:** Identity-related investigations — one of the most common SOC workflows — are blocked. There is no indication to the analyst that the data is not real.

### 4. No real-time alert acknowledgment / ownership (HIGH)
**Page:** `/alerts`
**Problem:** Alerts can have status changed (open → in_review → closed) and notes added, but there is no "Assign to me" or "Claim" action. The analyst cannot mark an alert as being actively worked, meaning concurrent analysts on an 8-hour shift will step on each other.
**Impact:** Alert duplication of effort, no accountability, no SLA tracking at the alert level.

### 5. UBA page silently shows demo data on API failure (MEDIUM-HIGH)
**Page:** `/uba`
**Problem:** `DEMO_ENTITIES` and `DEMO_ANOMALIES` are the initial state. If the real `/api/uba/*` calls fail (e.g., backend not running), the page looks populated with plausible-looking risk data. The KPI row falls back to `DEMO_SUMMARY`. There is no error state indicating the data is synthetic.
**Impact:** Analyst may investigate a "critical" UBA anomaly that does not exist, wasting shift time and potentially triggering unnecessary escalations.

### 6. No pagination or infinite scroll on Incidents page (MEDIUM-HIGH)
**Page:** `/incidents`
**Problem:** `incidentService.list(0, 100)` hardcodes page=0 and size=100. There is no pagination UI. SOC environments with hundreds of incidents will hit the 100-record cap silently — the analyst sees no indicator that there are more results.
**Impact:** Older incidents become invisible, SLA breaches go unnoticed.

### 7. Integrations page is entirely mocked (MEDIUM)
**Page:** `/integrations`
**Problem:** `DEMO_INTEGRATIONS` is a hardcoded array with fake "connected" statuses and event counts. No API calls are made. Admins configuring data feeds see fake connection states.
**Impact:** Admins cannot trust any integration status shown. Configuration actions (clicking "Configure") show a modal that saves to no backend.

### 8. Settings page shows mock API keys and health checks (MEDIUM)
**Page:** `/settings`
**Problem:** `DEMO_API_KEYS` and `DEMO_HEALTH_CHECKS` are static data. The settings page that analysts and admins use daily shows fabricated API key names and fake component health. The general, appearance, and system sections have no save path.
**Impact:** Users cannot manage their actual API keys, cannot see real health status, and any changes made are not persisted.

### 9. Zero role-based access control in the UI (MEDIUM)
**Problem (global):** Any authenticated user can navigate to `/admin/users`, `/admin/connection-keys`, `/opensearch`, and `/data-parsing`. While the backend may enforce permissions server-side, the UI provides no feedback — a viewer-role account sees all admin pages with no indication they are restricted. Destructive actions appear available.
**Impact:** Risk of accidental or unauthorized destructive actions. Security audit finding. Analysts see admin clutter irrelevant to their workflow, increasing cognitive load.

### 10. No bulk assign / triage actions on alerts board (MEDIUM)
**Page:** `/alerts`
**Problem:** The `AlertBulkToolbar` component exists but reviewing the alert service calls, bulk operations are limited to status changes and tags. There is no bulk assignment to an analyst, no bulk escalation to incident, and no way to mark a set of alerts as false positives in a single action.
**Impact:** During high-volume attack waves (exactly when SOC analysts are most stressed), triage is bottlenecked to one-at-a-time operations.

---

## Section 4 — Data Quality Summary by Category

| Category | Pages | Real Data | Mock/Stub | Degraded/Demo |
|---|---|---|---|---|
| Core SOC (alerts, incidents, logs) | 6 | 4 | 0 | 2 (incident workspace, threat-intel) |
| Detection & Rules | 3 | 3 | 0 | 0 |
| Dashboards & Reporting | 6 | 6 | 0 | 0 |
| Infrastructure (agents, EDR, scanners) | 8 | 8 | 0 | 0 |
| Admin & Config | 10 | 8 | 1 (variables) | 1 (admin main page) |
| Identity & Behavior | 2 | 0 | 1 (AD) | 1 (UBA) |
| SOAR | 4 | 4 | 0 | 0 |
| Settings & Integrations | 3 | 1 (soc-ai) | 2 (settings, integrations) | 0 |
| Stub pages | 6 | 0 | 6 | 0 |

**Total pages:** 53
- **OPERATIONAL** (production-ready, full UX): 7 (dashboard, alerts, incidents list, logs, rules, rules/coverage, login)
- **FUNCTIONAL** (works end-to-end, minor gaps): 28
- **DEGRADED** (renders but with mock/partial data or missing key actions): 6 (incidents/[id], threat-intel, uba, active-directory, admin main, settings)
- **STUB** (EmptyState only): 8 (threat-activity, adversary, tagging-rules, collectors, collector-groups, groups, variables, + incidents/demo is intentional)
- **BROKEN** (shows mock as if real, no indication): 3 (active-directory, integrations, settings)
