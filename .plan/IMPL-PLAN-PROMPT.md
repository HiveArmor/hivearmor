You are a senior engineering lead building ArmorSight Enterprise SIEM to production quality.

Project root: /Users/encryptshell/GIT/UTMStack-11/

## Context files — read these FIRST before doing anything:
1. /Users/encryptshell/GIT/UTMStack-11/.plan/MASTER_PLAN.md
2. /Users/encryptshell/GIT/UTMStack-11/.plan/PROMPTS_INDEX.md
3. /Users/encryptshell/GIT/UTMStack-11/.plan/FULL-AUDIT-PROMPT.md
4. All files under /Users/encryptshell/GIT/UTMStack-11/.plan/features/

From these files you have: the full feature list, all known bugs, all known mock/stub pages, all security issues, the API paths, the file locations, and the architecture context. Do NOT re-audit the codebase. Use only what's in those plan files.

---

## YOUR JOB

Produce individual micro-task prompt files under `.plan/impl/`. Every file is a self-contained prompt a developer pastes into a new Claude session to implement EXACTLY that one micro task.

Rules for every task file:
- One file = one atomic unit of work (under 2-3 hours for a senior dev)
- Each file has TWO sections: ## IMPLEMENT and ## TEST
- IMPLEMENT section: exact files to read first, exact changes to make, exact code patterns to follow, exact API paths, no ambiguity
- TEST section: exact curl commands or browser steps to verify it works, expected response/behavior, what failure looks like
- File names use the pattern: `NNN-short-description.md` where NNN is the execution order number
- Every file starts with: dependencies (which NNN files must be completed before this one), estimated time, and affected files

---

## SEQUENCE RULES — resolve in this order:

**Phase 0 — Security (blocker for everything)**
S-001: Fix password in GET query param (AccountResource.java + frontend caller)
S-002: Fix JWT key persistence across restarts (TokenProvider.java + DB param)
S-003: Fix CORS wildcard in application-prod.yml
S-004: Fix gRPC InsecureTrustManagerFactory (GrpcConfiguration.java)

**Phase 1 — UI Foundation (blocker for all feature phases)**
UX-001: Establish design token system (colors, spacing, typography in Tailwind config)
UX-002: Build reusable PageShell component (page header, breadcrumb, action bar pattern)
UX-003: Build reusable DataTable component (TanStack Table, sorting, pagination, column visibility)
UX-004: Build reusable EmptyState and ErrorBoundary components
UX-005: Build global toast/notification system (Zustand store + toast component)
UX-006: Wire global error handling for all API calls (axios interceptor or fetch wrapper)

**Phase 2 — RBAC Foundation (blocker for all protected pages)**
RBAC-001: Read backend SecurityConfiguration.java — document which endpoints require which roles
RBAC-002: Build usePermissions hook in frontend-v2 (reads JWT claims, exposes hasRole/canAccess)
RBAC-003: Build ProtectedRoute/ProtectedSection component (conditionally renders based on role)
RBAC-004: Apply role guards to every page in app/(app)/ layout

**Phase 3 — Live Data Foundation (blocker for dashboard/alerts)**
ARCH-001: Add spring-boot-starter-data-redis to backend, configure Redis cache (TTL per service)
ARCH-002: Add @Cacheable to OverviewService, UtmAlertService stats methods
ARCH-003: Build SSE hook in frontend-v2 (useAlertStream, EventSource with auth header polyfill)
ARCH-004: Wire AlertNewBanner component to SSE stream (real-time alert count in nav)
ARCH-005: Wire EPS widget on dashboard to LiveEpsResource SSE endpoint

**Phase 4 — Feature: F-01 Live Alert Streaming**
F01-001: Connect alerts list page to real UtmAlertResource paginated API (replace any static data)
F01-002: Add alert status update (acknowledge, resolve, escalate) actions wired to API
F01-003: Add alert detail drawer/modal with full alert fields
F01-004: Add alert filters (severity, status, date range, source) wired to query params

**Phase 5 — Feature: F-02 Reports**
F02-001: Replace static TEMPLATES array — fetch from UtmReportResource GET /api/utm-reports
F02-002: Build schedule modal (cron picker, email recipient, format: PDF/CSV)
F02-003: Wire PDF download to report download endpoint (blob response → browser download)
F02-004: Build report run history list per report

**Phase 6 — Feature: F-03 Log Analyzer**
F03-001: Wire search bar to OpenSearch query via backend (GET /api/utm-logs/search)
F03-002: Build timeline histogram (date histogram aggregation, brush-to-zoom)
F03-003: Build field stats popover (terms aggregation per field on click)
F03-004: Implement saved queries (POST/GET /api/utm-log-analyzer-queries)
F03-005: Add pivot actions (from selected log row: create alert, create incident, TI lookup)
F03-006: Column visibility persistence (localStorage per user)

**Phase 7 — Feature: F-04 Data Parsing / Logstash**
F04-001: Replace static pipeline demo — fetch pipeline list from UtmLogstashPipelineResource
F04-002: Build pipeline editor (name, input type, filter body — codemirror or textarea)
F04-003: Build filter group management (UtmLogstashFilterGroupResource CRUD)
F04-004: Build test pipeline UI (send sample log, view parsed output)
F04-005: Build reload pipeline action (POST /api/utm-logstash-pipelines/{id}/reload)

**Phase 8 — Feature: F-05 Getting Started**
F05-001: Build 7-step wizard UI shell (step indicators, next/back navigation)
F05-002: Wire each step to UtmGettingStartedResource (read status, mark complete)
F05-003: Add first-login redirect (check /api/utm-getting-started → if not complete, redirect)
F05-004: Add wizard link in nav for users who haven't completed it

**Phase 9 — Feature: F-06 Compliance**
F06-001: Replace DEMO_FRAMEWORKS — fetch from UtmComplianceStandardResource
F06-002: Wire control list to UtmComplianceControlLatestEvaluationResource (filter by framework)
F06-003: Build compliance score gauge (% controls passing per framework)
F06-004: Build control evaluation history chart (per control, last 30 evaluations)
F06-005: Build custom compliance framework builder (name, control YAML editor)
F06-006: Wire compliance report to PDF download endpoint

**Phase 10 — Feature: F-07 Vulnerability Scanner**
F07-001: Replace MOCK_OVERVIEW — fetch from UtmNetworkScanResource summary endpoint
F07-002: Replace MOCK_TASKS — fetch scan job list, wire pagination
F07-003: Replace MOCK_RESULTS — fetch scan findings list, wire severity filter
F07-004: Build create scan modal (target IP/range, scan profile, schedule)
F07-005: Build scan status polling (poll every 5s while scan running, show progress bar)

**Phase 11 — Feature: F-08 Asset Scanner**
F08-001: Replace MOCK_ASSETS — fetch from asset discovery API with pagination
F08-002: Build asset detail drawer (OS, services, open ports, last seen, risk score)
F08-003: Wire asset group management (UtmAssetGroupResource CRUD)
F08-004: Add asset search and filter (by IP, hostname, OS, group, risk)

**Phase 12 — Feature: F-09 Active Directory**
F09-001: Build AD user list page wired to AD events API
F09-002: Build user detail page (login history, group membership, risk timeline)
F09-003: Build AD event tracker (logon failures, group changes, GPO changes — real data)
F09-004: Build AD notification config (alert on N failed logins, account disable, group change)
F09-005: Wire AD reports to PDF export

**Phase 13 — Feature: F-10 Incident Console + SOAR**
F10-001: Build STOMP WebSocket hook (useIncidentConsole, connect to UTMIncidentCommandWebsocket)
F10-002: Build terminal-style command output component (scrollable, monospace, timestamped)
F10-003: Build command input bar (send to WebSocket, capture response)
F10-004: Wire SOAR execution overlay on xyflow canvas (executing node highlighted, log panel)
F10-005: Build SOAR execution audit log list (playbook name, trigger, start/end, status)
F10-006: Build incident creation from alert (select alerts → create incident, assign, set severity)
F10-007: Build incident timeline (auto-stitch related logs/alerts to incident)

**Phase 14 — Feature: F-11 App Management**
F11-001: Build connection keys page (list, generate, revoke via UtmClientResource)
F11-002: Build index patterns page (list, create, delete — OpenSearch index pattern management)
F11-003: Build collector health page (per collector: last seen, EPS, error rate — real data)
F11-004: Build app audit log page (who did what, when — read from audit_event table)
F11-005: Build identity provider config page (SAML endpoint, entity ID, certificate)
F11-006: Build JVM + HTTP metrics page (memory, GC, request latency — Actuator endpoints)

**Phase 15 — Feature: F-15 AI SOC Assistant**
F15-001: Build floating AI drawer component (trigger button in nav, slide-in panel)
F15-002: Wire chat to UtmSocAiResource POST /api/utm-soc-ai/chat
F15-003: Add "Ask AI" button on alert detail (sends alert JSON as context)
F15-004: Add "Summarize Incident" button on incident page
F15-005: Add NL log query bar in Log Analyzer (translates English → Lucene query)

**Phase 16 — Own The Stack**
OWN-001: Build agent-manager from source (docker build from agent-manager/, update docker-compose)
OWN-002: Evaluate iText7 PDF generation (test UtmReportResource PDF endpoint — if works, kill web-pdf service)
OWN-003: If iText7 insufficient: build Playwright PDF service to replace Selenium web-pdf

---

## OUTPUT FORMAT

For each task, create a file at:
`.plan/impl/{PHASE_PREFIX}/{NNN}-{short-name}.md`

Example path: `.plan/impl/sec/S-001-password-get-param.md`

Each file must contain:

```
# {NNN}: {Task Title}
**Phase:** {phase name}
**Depends on:** {comma-separated NNN codes, or "none"}
**Estimated time:** {X hours}
**Affected files:**
- path/to/file1
- path/to/file2

---
## IMPLEMENT

{Full self-contained implementation prompt — include:}
- Project root, exact file paths to read first
- Exact code to change or add (with before/after or full snippet)
- API endpoint path, HTTP method, request/response shape
- Any env vars or config to add
- Exact component/hook/service names to use
- Error handling requirements
- Do NOT use placeholders — be specific

---
## TEST

{Full self-contained test/validation prompt — include:}
- Exact curl command(s) to verify backend (with auth token pattern)
- Exact browser steps to verify UI
- Expected response body or UI state
- What a passing test looks like
- What a failing test looks like and how to diagnose
```

After creating all task files, create `.plan/impl/SEQUENCE.md` — a master table:

| # | Task | Phase | Depends On | Time | Status |
|---|---|---|---|---|---|
| S-001 | Fix password GET param | Phase 0 - Security | none | 1h | TODO |
| ... | ... | ... | ... | ... | ... |

Mark any task that is a "gate" (blocks an entire phase) with 🔒 in the Status column.

Create all files now. Start with Phase 0 tasks, work through to Phase 16. Do not summarize — produce all files.
