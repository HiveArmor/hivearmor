# UX Assessment: ArmorSight SIEM Frontend-v2
**Date:** 2026-07-08
**Auditor:** Senior UX Analyst (automated trace)
**Scope:** 4 critical SOC workflows traced against actual source files

---

## Preparation: Page & Component Inventory

### Pages found (relevant)
- `/alerts/page.tsx` — Threat Management (board + list)
- `/alerts/adversary/page.tsx` — Adversary tracker
- `/alerts/tagging-rules/page.tsx` — Tag rules
- `/incidents/page.tsx` — Incidents kanban + table
- `/incidents/[id]/page.tsx` — Investigation workspace
- `/uba/page.tsx` — User Behavior Analytics
- `/active-directory/page.tsx` — AD identity monitor
- `/soar/page.tsx` — Playbook list
- `/soar/flows/page.tsx` — Playbook builder
- `/rules/page.tsx` — Detection + response + packs + ATT&CK coverage
- `/compliance/page.tsx` — Compliance posture + reports
- `/reports/page.tsx` — Report templates + generated + schedules
- `/logs/page.tsx` — Log explorer

### Key component clusters
- `components/alerts/` — alert-detail-panel, alert-board-column, alert-bulk-toolbar, alert-soar-launcher, alert-status-badge, alert-filters-panel, alert-active-filters, alert-new-banner
- `components/rules/` — rules-list-panel, rules-editor-panel, rule-history-drawer, rule-packs-panel, response-rules-panel
- `components/compliance/` — compliance-posture-kpi, compliance-framework-heatmap, compliance-trend-chart, compliance-control-drawer, compliance-eval-history-chart
- `components/investigation/` — investigation-header, investigation-evidence-board, investigation-timeline, investigation-entity-graph
- `components/reports/` — report-schedule-modal, report-viewer-drawer
- `services/` — alert.service.ts, uba.service.ts, detection.service.ts, compliance.service.ts, report.service.ts, playbook.service.ts, incident.service.ts

---

## WORKFLOW 1: Triage an Incoming Critical Alert

**Path:** Alert list → Open detail → View related logs → Add note → Change status to "In Progress" → Escalate to incident → Assign to senior analyst

### Step-by-step trace

#### Step 1: Alert appears in list
- **Page:** `/alerts/page.tsx`
- **Component:** `AlertsPage` (board view default, also list view)
- **API:** `alertService.search()` → `POST /api/elasticsearch/search?indexPattern=v11-alert-*`
- **Status: WORKING**
- The page loads with a default 7-day window, auto-refreshes every 30 seconds, and shows a live SSE-driven "new alerts" banner (`useAlertStreamStore`). Board view groups by severity (critical / high / medium / low). KPI cards show open critical count with sparklines.
- **Friction:** The board view loads `pageSize = 40` alerts and splits them by severity client-side — if there are >40 alerts only 40 are visible across all four columns. An analyst with 200 open criticals will silently miss most of them. There is no per-column pagination or a "show all critical" affordance from the board view.

#### Step 2: Open alert detail
- **Component:** `AlertDetailPanel` (slide-in drawer, 700 px wide, maximizable)
- **API:** None on open — alert data is passed as prop from the row
- **Status: WORKING**
- Drawer shows rule name, severity badge, status badge with inline dropdown, description, solution callout, target/adversary fields with copy buttons, MITRE technique, tags, references, impact CIA scores.
- **Friction:**
  - The `Events` tab is conditionally shown only when `alert.events?.length > 0`. If the backend does not embed events in the alert document, this tab never appears, and the analyst has no in-context log pivot.
  - The `History` tab content is a placeholder: `"Alert change history will appear here."` — this is not implemented.
  - The `Map` tab is only shown when `alert.target?.geolocation?.latitude` is populated — silently absent most of the time with no explanation.
  - No "view in log explorer" link from within the detail panel. Analyst must manually navigate to `/logs`.

#### Step 3: View related logs
- **Component:** None embedded in alert detail — analyst must navigate manually to `/logs/page.tsx`
- **Status: PARTIALLY BROKEN**
- There is no direct "view related logs" button or link in `AlertDetailPanel`. The Events tab shows raw JSON of events embedded in the alert document, but is hidden when events are absent (common). No cross-link to the Log Explorer pre-populated with the alert's source IP, hostname, or time window.
- **Gap:** A critical triage step requires leaving context entirely and rebuilding the query manually in Logs.

#### Step 4: Add note (comment)
- **Component:** `AlertDetailPanel` → "Comment" section
- **API:** `alertService.updateNotes(alertId, noteText)` → `POST /api/utm-alerts/notes?alertId=<id>`
- **Status: WORKING**
- Text area with 512-char limit, character counter, Save/Cancel buttons. Saves with toast feedback.
- **Friction:** Only one note field per alert — no threaded comments, no timestamp, no attribution to the current user. An analyst cannot see who added the note or when. In multi-analyst environments this is a meaningful gap.

#### Step 5: Change status to "In Progress" (In Review)
- **Component:** `AlertDetailPanel` → status dropdown OR inline `InlineStatusDropdown` in list view OR footer action buttons
- **API:** `alertService.updateStatus([alertId], AlertStatus.IN_REVIEW)` → `POST /api/utm-alerts/status`
- **Status: WORKING**
- Three affordances exist: the status badge dropdown in the detail panel, the footer "In Review" button, and the inline dropdown in list view rows. Good redundancy.
- **Friction:** The status model uses `OPEN / IN_REVIEW / COMPLETED / AUTOMATIC_REVIEW`. The term "In Review" maps to "In Progress" in SOC parlance but the label mismatch may confuse analysts. The bulk toolbar also exposes status changes.

#### Step 6: Escalate to incident
- **Component:** `AlertsPage.handleCreateIncident()` in alerts page OR the `FolderPlus` icon in list view row actions
- **API:** `alertService.convertToIncident(eventIds, incidentName)` → `POST /api/utm-alerts/convert-to-incident`
- **Status: WORKING (with friction)**
- The incident is created with a generated name `"Incident — N alerts"` — there is no dialog to set an incident name, severity, or priority before creation. The analyst cannot choose which incident to add the alert to (create-new only from here).
- **Friction (significant):**
  - No confirmation dialog before creating incident — accidental clicks create orphaned incidents.
  - Auto-generated name is useless (`"Incident — 1 alerts"`).
  - No option to add alert to an existing incident (only create new).
  - After creation, no navigation link to the newly created incident — analyst must manually go to `/incidents`.

#### Step 7: Assign to senior analyst
- **Component:** Incidents detail panel in `/incidents/page.tsx`
- **API:** No direct "assign" API call visible in the source of the incidents list page. The `Incident` type has `incidentAssignedTo` field, but the incidents list detail panel only displays the assignee — it does not have an edit control for it.
- **Status: BROKEN**
- The incidents list page shows `incidentAssignedTo` as display-only text. There is no UI to change the assignee. The investigation page (`/incidents/[id]/page.tsx`) loads demo data (`DEMO_INCIDENT`) rather than fetching the real incident by ID, so assignment is also not available there.

### Workflow 1 Summary

| Step | Status | Notes |
|------|--------|-------|
| Alert list with new banner | WORKING | Board pagination gap for >40 alerts |
| Open alert detail | WORKING | History tab unimplemented |
| View related logs | PARTIALLY BROKEN | No in-context log pivot |
| Add note | WORKING | Single unattributed note only |
| Change status to In Review | WORKING | Label mismatch vs SOC conventions |
| Escalate to incident | PARTIALLY WORKING | No name dialog, no add-to-existing, no nav link |
| Assign to senior analyst | BROKEN | No assignment UI anywhere |

**Overall: PARTIALLY BROKEN**

---

## WORKFLOW 2: Investigate Suspicious User Behavior

**Path:** Alert mentions username → Look up user in AD → View user's recent log activity → Check UBA risk score → Create incident → Run SOAR playbook to disable account

### Step-by-step trace

#### Step 1: Alert mentions username
- **Component:** `AlertDetailPanel` → "Target" section shows `alert.target.user`
- **Status: WORKING**
- The target user is displayed with a copy button. However, there is no hyperlink from the username to the AD page or UBA page.

#### Step 2: Look up user in AD
- **Page:** `/active-directory/page.tsx`
- **API:** None — the page uses `MOCK_OVERVIEW`, `MOCK_USERS`, `MOCK_EVENTS`, `MOCK_REPORTS` hardcoded constants. The `setLoading(l => !l)` refresh button toggles the loading spinner but makes no API call.
- **Status: BROKEN (demo data only)**
- The AD page has no backend integration whatsoever. All data is hardcoded. The `const [overview] = useState<AdOverview>(MOCK_OVERVIEW)` and similar patterns confirm no data is fetched from a real API endpoint.
- There is no cross-navigation from the alert username to a pre-filtered AD user search.
- **Critical Gap:** The AD page is entirely non-functional from a real-data perspective.

#### Step 3: View user's recent log activity
- **Page:** `/logs/page.tsx`
- **Status: PARTIALLY WORKING**
- There is no automatic pre-population of a log query from any user identity discovered in an alert or on the AD page. The analyst must manually navigate to Logs and construct the query.

#### Step 4: Check UBA risk score
- **Page:** `/uba/page.tsx`
- **API:** `ubaService.getSummary()` → `GET /api/uba/summary`, `ubaService.listEntities()` → `GET /api/uba/entities`, `ubaService.listAnomalies()` → `GET /api/uba/anomalies`
- **Status: PARTIALLY WORKING**
- The UBA page attempts real API calls but falls back to rich demo data (`DEMO_ENTITIES`, `DEMO_ANOMALIES`) when the API fails. A "demo data" badge appears in the header when using fallback.
- The entity detail drawer (`EntityDrawer`) shows a 7-day risk trend chart (ECharts gauge + sparkline), contributing factors, and related anomalies. This is well-implemented.
- **Friction:**
  - No direct navigation from an alert's target user to UBA — analyst must search manually. The UBA leaderboard has no search bar; it only has type and risk-level dropdowns. To find a specific user by name, the analyst must scroll.
  - The EntityDrawer has no "Create Incident" or "Launch SOAR Playbook" button. From UBA you cannot take action — you must navigate back to alerts.
  - Watchlist toggle works but state is local (no persistence confirmed via API call checking — `ubaService.setWatchlist` makes a PUT to `/api/uba/entities/:id/watchlist` which may not be implemented backend-side).

#### Step 5: Create incident
- **Component:** Same as Workflow 1, Step 6 — from alerts page
- **Status: PARTIALLY WORKING (same gaps)**
- No ability to create incident directly from UBA page.

#### Step 6: Run SOAR playbook to disable account
- **Component:** `AlertSoarLauncher` modal (accessible from alerts page per-alert action or bulk toolbar)
- **API:** `playbookService.execute(numId, alertId)` → presumably `POST /api/playbook/:id/execute`
- **Status: PARTIALLY WORKING**
- The SOAR launcher loads real playbooks from `playbookService.list()`. It allows selecting a playbook and launching it, with an execution ID returned and displayed. However:
  - There is no "disable AD account" built-in playbook template — the analyst would need one pre-built. The UI shows custom playbooks only.
  - The SOAR launcher cannot be opened from the UBA page — only from the alerts page.
  - The `onLaunch` callback in `AlertsPage` has a 1.8-second fake delay (`await new Promise((r) => setTimeout(r, 1800))`), suggesting the launch confirmation is partially simulated even when a real execution ID is returned.

### Workflow 2 Summary

| Step | Status | Notes |
|------|--------|-------|
| Alert mentions username | WORKING | No hyperlink to AD or UBA |
| Look up user in AD | BROKEN | All AD data is mock/hardcoded |
| View user's recent logs | PARTIALLY WORKING | No pre-populated context |
| Check UBA risk score | PARTIALLY WORKING | Real API with demo fallback; no user search |
| Create incident | PARTIALLY WORKING | Same gaps as WF1 |
| Run SOAR playbook | PARTIALLY WORKING | Real execution, no account-disable template, launch only from alerts page |

**Overall: COMPLETELY BROKEN** (the AD integration — the only way to confirm user identity in a domain environment — is entirely non-functional)

---

## WORKFLOW 3: Build and Deploy a New Detection Rule

**Path:** Identify attack pattern → Open rule editor → Write correlation rule → Test against historical data → Set severity and MITRE mapping → Activate rule → Confirm alerts fire

### Step-by-step trace

#### Step 1: Identify attack pattern
- **Entry point:** `/rules/page.tsx` → ATT&CK Coverage tab → `MitreCoveragePage` (embedded at `/rules/coverage/page.tsx`)
- **Status: WORKING**
- Coverage tab shows MITRE ATT&CK matrix with visual heatmap. Clicking a technique links to the rules page with `?ruleId=<backendId>` deep-link that pre-selects the rule after load.

#### Step 2: Open rule editor
- **Component:** `RulesListPanel` (left panel, 320px) + `RulesEditorPanel` (right panel)
- **API:** `detectionService.search()` → `GET /api/correlation-rule/search-by-filters`
- **Status: WORKING**
- "New Playbook" button calls `handleNewRule()` which shows the editor with a Sigma YAML template. Monaco editor loads lazily (with textarea fallback on failure). Rules list loads up to 200 rules on mount.

#### Step 3: Write correlation rule (Sigma YAML)
- **Component:** `RulesEditorPanel` → "Sigma YAML" tab with Monaco editor
- **Status: WORKING**
- Monaco editor with YAML syntax, VS Dark theme, line numbers, word wrap. Default template provided. Copy, Reset, and Save buttons in toolbar.
- **Friction:**
  - The Sigma YAML is stored in the `sigma` state field, but the `handleSave` function calls `onSave({ ...rule, sigma, severity, status, mitreIds, mitreTactics, logSources: tags })` — and `handleSave` only works when `rule !== null` (line: `if (!rule) return`). For a new rule (`isNew = true, rule = null`) pressing Save does nothing. **This is a bug** — new rules cannot be saved from the editor.
  - No autocomplete for Sigma field names. No schema validation in the editor. An analyst typing an incorrect field name (e.g., `EventId` instead of `EventID`) gets no feedback until test time.
  - The Monaco editor loads from `@monaco-editor/react` with a manual forwardRef workaround that includes an edge-case failure path falling back to a plain textarea — this fragile loading pattern may produce a broken editor silently.

#### Step 4: Test against historical data
- **Component:** `RulesEditorPanel` → "Test Run" tab
- **API (real):** `detectionService.testRule(bId)` → `POST /api/correlation-rule/test`
- **Status: PARTIALLY WORKING**
- When editing an existing rule with a backend ID, `onTest` calls the real API. When creating a new rule (`isNew = true`), `onTest` is `undefined`, so the test tab falls back to demo data after a fake 1.4s delay.
- **Friction:**
  - Test results show matched events, duration, FP rate, and sample match fields — well-designed.
  - Demo test result is displayed for new rules, misleading an analyst into thinking the rule was actually tested.
  - No ability to specify a custom time range for the test (always "last 30 days" per the loading message).

#### Step 5: Set severity and MITRE mapping
- **Component:** `RulesEditorPanel` → "Metadata" tab
- **Status: WORKING**
- Severity picker (5 levels), status picker (enabled/testing/disabled), MITRE tactics checkboxes (12 standard tactics), MITRE technique ID free-text input with Enter-to-add, log sources tags.
- **Friction:**
  - MITRE technique ID is free-text only — no validation against known T-codes, no autocomplete from the ATT&CK taxonomy. Analyst can type garbage like "T9999" without feedback.
  - Suppression rules (`suppressions` state) are local-only — there is no API call to persist suppressions to the backend.

#### Step 6: Activate rule
- **API:** `detectionService.setActive(bId, true)` → `PUT /api/correlation-rule/activate-deactivate?id=N&active=true`
- **Status: WORKING**
- Toggle in rules list and in the editor metadata tab. Optimistic update in list state. Toast feedback.

#### Step 7: Confirm alerts fire
- **Status: MISSING**
- There is no "live test" mode, no ability to see alerts generated by a specific rule ID from the rule detail. The Stats tab shows alert count (30-day) and a mock bar chart (hardcoded values `[12, 8, 15, 22, 9, 31, 18]`). No real alert-count-by-rule data is fetched. An analyst has no way from the rules interface to confirm the rule is producing alerts after activation.

### Workflow 3 Summary

| Step | Status | Notes |
|------|--------|-------|
| Identify attack pattern via ATT&CK | WORKING | Deep-link to rule works |
| Open rule editor | WORKING | |
| Write correlation rule | PARTIALLY WORKING | New rule save is broken (rule=null guard) |
| Test against historical data | PARTIALLY WORKING | Demo data for new rules; real API for existing |
| Set severity and MITRE mapping | WORKING | Technique ID not validated |
| Activate rule | WORKING | |
| Confirm alerts fire | BROKEN | Stats tab uses hardcoded mock chart data |

**Overall: PARTIALLY BROKEN**

---

## WORKFLOW 4: Generate Monthly Compliance Report

**Path:** Navigate to compliance → Select framework (ISO 27001) → Run evaluation → View failing controls → Generate PDF report → Schedule monthly delivery

### Step-by-step trace

#### Step 1: Navigate to compliance
- **Page:** `/compliance/page.tsx`
- **Status: WORKING**
- Navigation entry in sidebar. Page has three main tabs: Posture Dashboard, Reports, Schedule.

#### Step 2: Select framework (ISO 27001)
- **Component:** `ComplianceFrameworkHeatmap` (embedded in Posture Dashboard tab)
- **API:** `complianceService.getStandards()` → `GET /api/compliance/standard?page=0&size=100`
- **Status: WORKING (backend-dependent)**
- Standards load from API. If the backend returns standards, tabs appear and the first standard is auto-selected. A `frameworkCache` ref avoids redundant fetches on tab switching. An `abbreviate()` function creates short names (e.g., "ISO 27001" → "I2").
- **Friction:** If the backend returns no standards (unconfigured), the compliance page shows an empty heatmap with no meaningful empty state or instructions on how to configure standards.

#### Step 3: Run evaluation
- **Component:** Compliance page → Reports tab → Templates sub-tab → "Run" (Play) button per template
- **API:** `handleTriggerEvaluation()` re-fetches section controls, which triggers the backend's "latest evaluation" endpoint. This is not an explicit `/evaluate` API call — it re-reads current control evaluations.
- **Status: PARTIALLY WORKING**
- There is no dedicated "run evaluation" trigger in the Posture Dashboard tab. The evaluation trigger is buried in the Reports > Templates sub-tab as a small play button icon beside "Generate Report." The analyst must switch to Reports > Templates to find it.
- **Friction (significant):**
  - The "Re-evaluate" button is an icon-only `<Play />` with no label — a completely undiscoverable affordance.
  - On the Posture Dashboard, there is no refresh/re-evaluate button. The data is stale until the analyst discovers the hidden trigger elsewhere.
  - `handleTriggerEvaluation` doesn't actually trigger a backend evaluation job — it refetches the existing evaluation data. If the backend hasn't re-run evaluations, pressing this button shows old data as "refreshed."

#### Step 4: View failing controls
- **Component:** `ComplianceFrameworkHeatmap` → clicking a domain cell → `ComplianceControlDrawer`
- **API:** `complianceService.getControlsWithLatestEval(sectionId)` → `GET /api/compliance/control-config/get-by-section?sectionId=N`
- **Status: WORKING**
- Heatmap shows pass rates per domain as colored cells. Clicking opens `ComplianceControlDrawer` which shows controls with their last evaluation status and timestamp. Controls can be filtered by status (PASS/FAIL/PARTIAL/NOT_EVALUATED).
- **Friction:**
  - `ComplianceEvalHistoryChart` component exists but was not confirmed to be wired into the drawer.
  - Failing controls show `controlSolution` and `controlRemediation` fields but there is no action to create a task/ticket from a failing control.

#### Step 5: Generate PDF report
- **Component:** Compliance page → Reports tab → Generated Reports sub-tab → download button
- **API:**
  - Generate: `POST /api/utm-compliance-report-config` (creates a report config with status=Pending)
  - Download: `GET /api/utm-compliance-report-config/:id/export`
- **Status: PARTIALLY WORKING**
- The "Generate Report" button (in Templates sub-tab) creates a report record with `status: "Pending"` but does not poll for completion. The analyst must manually switch to the "Generated Reports" sub-tab and check status. No auto-refresh. No notification when the report is ready.
- The "View" (Eye) button in the generated reports list exists in the source but opens an `AlertDetailPanel`-based drawer — the `ReportViewerDrawer` component is referenced but its content was not checked in detail. There is risk of it showing placeholder content.
- **Friction:**
  - Two parallel places to generate reports: Compliance page (Reports > Templates) and the separate `/reports/page.tsx`. The analyst may not know which to use.
  - No progress indication after triggering generation — the record appears with "Pending" status and a spinner badge but no ETA or auto-completion notification.

#### Step 6: Schedule monthly delivery
- **Component:** `/reports/page.tsx` → Schedules tab → "New Schedule" → `ReportScheduleModal`
- **API:** `reportService.*` methods
- **Status: PARTIALLY WORKING**
- The Reports page (separate from the Compliance page) has a full Schedules tab with `ReportScheduleModal`. The schedule table shows cron string, status, last run, and a "Delivery" column — but the delivery column always shows "—", meaning email/Slack delivery target is either not configured or not displayed.
- **Friction:**
  - The schedule shows "Report #N" (using `complianceId`) instead of the report name in the schedules table.
  - The delivery method column is completely blank — the analyst cannot confirm where the scheduled report will be delivered.
  - Two separate schedule UIs exist: Compliance page > Schedule tab (uses `/api/utm-compliance-schedule`) and Reports page > Schedules tab (uses `reportService.getSchedules()`). Unclear if these are the same backend resource.

### Workflow 4 Summary

| Step | Status | Notes |
|------|--------|-------|
| Navigate to compliance | WORKING | |
| Select framework | WORKING (backend-dependent) | Empty state on unconfigured backend |
| Run evaluation | PARTIALLY WORKING | Hidden trigger, not a real backend trigger |
| View failing controls | WORKING | No action path from failing control |
| Generate PDF report | PARTIALLY WORKING | No polling/completion notification |
| Schedule monthly delivery | PARTIALLY WORKING | Delivery target always blank; duplicate schedule UIs |

**Overall: MOSTLY WORKING**

---

## Cross-Cutting Assessment

### Loading States

**Good:** The application has consistent skeleton/shimmer loading patterns:
- `TableSkeleton` component used in incidents, UBA, reports, compliance
- `Skeleton` component used in reports templates
- `shimmer` CSS class on table cells during alert list load
- Spinner (`animate-spin`) on refresh buttons and individual operations
- Loading text messages during initial loads ("Loading playbooks…", "Loading rules…")

**Gaps:**
- Alert detail panel has no loading state — alert data is passed directly. If the API returned a stale version and the panel opens, there is no indication that fresher data might be available.
- UBA entity drawer anomaly fetch has no skeleton — `echoesLoading` pattern with spinner is present but the drawer content flashes before anomalies load.
- The compliance heatmap shows `frameworksLoading` spinner for initial load but domain loading (`domainsLoading`) is not surfaced to the user with a clear per-framework skeleton.

### Error Handling

**Good:**
- All service calls are wrapped in try/catch
- `Promise.allSettled()` is used throughout to prevent a single failing API from breaking the whole page
- `toast("error", ...)` shown on failures
- Demo/fallback data prevents blank pages (UBA, AD)

**Gaps:**
- Alert service `search()` silently returns `{ content: [], totalElements: 0 }` on any error — the analyst sees an empty list with no error message. There is no distinction between "no alerts" and "API failed."
- The AD page's refresh button is wired to `setLoading(l => !l)` — it toggles the spinner variable but makes no API call. This is a silent non-functional control.
- In `AlertDetailPanel`, the SOC AI tab handles `status === "error"` by showing the same "not available" warning as `status === "queued"` — an analyst cannot distinguish a configuration error from a transient queue state.
- Rules editor: the save function silently fails for new rules (`if (!rule) return` with no toast or console error visible). Analyst presses Save, nothing happens, no feedback.

### Mobile/Responsive (1280px analyst workstation)

**The layout is designed for wide screens and should work at 1280px with some constraints:**
- Alert board view uses `grid grid-cols-2 xl:grid-cols-4` — at 1280px this renders 2 columns, hiding half the severity bands. The analyst sees only Critical + High (or whichever two) without scrolling.
- The alert detail panel is `w-[700px]` fixed — at 1280px this occupies >50% of viewport and leaves only ~580px for the alerts list behind it.
- Incident investigation page uses a 3-column grid layout for investigation tabs — renders acceptably at 1280px.
- The rules page uses a 2-panel layout (`w-[320px]` list + flexible editor) — works well at 1280px.
- Compliance heatmap uses `grid grid-cols-1 xl:grid-cols-3` — at 1280px this is 1 column, stacking the heatmap and trend chart vertically. Acceptable.
- UBA leaderboard table with sparkline charts (80×32px ECharts) — renders fine at 1280px.
- The incidents board uses `grid grid-cols-3` without responsive breakpoints — at narrow widths this can overflow. At 1280px it is acceptable but tight.

### Accessibility

**Issues identified:**
- `InlineStatusDropdown` uses a `<button>` that opens a dropdown without `aria-haspopup`, `aria-expanded`, or role annotations. Screen readers cannot announce the dropdown state.
- Alert board cards use `onClick` on `<div>` elements inside `AlertBoardColumn` — likely missing `role="button"` and keyboard handler.
- The SOAR launcher modal does not trap focus — keyboard users can tab behind the overlay.
- Severity pills and badges use color alone (red/orange/yellow/green) to convey severity without text alternative or `aria-label` in all cases.
- The compliance heatmap uses colored cells without accessible labels — a colorblind analyst cannot read the pass rates from the heatmap without mousing over.
- Icon-only buttons (`Eye`, `Download`, `Trash2` in reports and compliance) use `title` attributes for tooltip but no `aria-label`, which is not reliable across screen readers.

### Navigation / Context Preservation

**Good:**
- The command palette (`Ctrl+K`, `components/layout/command-palette.tsx`) allows fast navigation without losing page state.
- The alert detail panel is a drawer overlay — closing it returns to the full alerts list without a page reload.
- Rules page uses URL search params (`?ruleId=`) for deep-linking from ATT&CK coverage back to a specific rule.
- Investigation page has breadcrumbs back to incidents.

**Gaps:**
- When an alert is escalated to an incident, there is no navigation link to the created incident. The analyst loses context and must manually find the incident.
- When navigating from an alert's target user to UBA, there is no "back to alert" link — the analyst must use browser back, which may reset the alert list state.
- The incidents detail panel (right-side panel in `/incidents/page.tsx`) and the full investigation page (`/incidents/[id]/page.tsx`) have overlapping but different data — the investigation page loads `DEMO_INCIDENT` hardcoded data, not the real incident from the list. An analyst clicking "Open Full Investigation" will see a demo incident, not their actual incident.

---

## Operational Readiness Score

| Workflow | Status | Score |
|----------|--------|-------|
| WF1: Triage Critical Alert | PARTIALLY BROKEN | 5/10 |
| WF2: Investigate User Behavior | COMPLETELY BROKEN | 2/10 |
| WF3: Build & Deploy Detection Rule | PARTIALLY BROKEN | 5/10 |
| WF4: Monthly Compliance Report | MOSTLY WORKING | 7/10 |

**Overall Operational Readiness: 4.75/10 — NOT PRODUCTION READY**

---

## Priority Issues (Ordered by SOC Impact)

### P0 — Blockers (prevent core workflows)

1. **Active Directory page is entirely mock data.** (`/active-directory/page.tsx` lines 58–90, 134–142) — All overview, user, event and report data is hardcoded. No API calls are made. The entire identity investigation workflow is non-functional.

2. **Investigation page (`/incidents/[id]/page.tsx`) loads demo incident, not real data.** The `DEMO_INCIDENT` constant is used as the initial state and no API call fetches the real incident by `params.id`. An analyst following up on a real incident sees fake data.

3. **New rule cannot be saved.** `RulesEditorPanel.handleSave()` has `if (!rule) return` — for new rules (`rule = null, isNew = true`) the Save button silently does nothing. No rule authored from scratch can be persisted.

4. **No "assign incident" UI.** Escalation to incident works, but assigning to an analyst is not possible through the UI. The `incidentAssignedTo` field is display-only everywhere.

### P1 — High severity UX gaps

5. **Alert escalation to incident has no name dialog, no add-to-existing, no post-creation navigation.** Auto-generated name "Incident — N alerts" is meaningless. No confirmation gate for accidental clicks.

6. **No pivot from alert to logs.** No "view related logs" link in `AlertDetailPanel`. The Events tab is hidden when `alert.events?.length === 0` (common). Analyst must manually reconstruct log queries.

7. **Alert board view paginates 40 total alerts across all severity columns.** Critical alerts beyond the first ~10 visible per column are silently hidden. No per-column "show more" affordance.

8. **Alert status history tab is a placeholder.** `"Alert change history will appear here."` — not implemented.

9. **Suppression rules in rule editor are local-only (no API persistence).**

10. **Rule stats tab shows hardcoded mock chart data** (`[12, 8, 15, 22, 9, 31, 18]`) — gives false confidence about rule performance.

### P2 — Medium severity friction

11. **No search/filter by entity name in UBA leaderboard** — only type and risk-level dropdowns.

12. **Compliance evaluation trigger is an unlabeled icon in Reports > Templates sub-tab** — highly undiscoverable.

13. **Report schedule delivery target column always blank** — analyst cannot confirm where scheduled reports are sent.

14. **Duplicate schedule UIs** — Compliance page and Reports page both have scheduling interfaces that may or may not write to the same backend endpoint.

15. **SOC AI polling is one-shot with a 4s delay** — if analysis takes longer, the analyst sees no progress and must manually re-click.

16. **Alert error handling is silent** — empty list on API failure is indistinguishable from "no alerts."

### P3 — Polish / Accessibility

17. Status dropdowns missing ARIA attributes.
18. Color-only severity indicators.
19. SOAR modal does not trap focus.
20. Icon-only action buttons lack `aria-label`.
