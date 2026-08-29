# Prompt 18 — Response Activity (`/response/activity`) OEM research

Retrieved: **2026-08-29**

Purpose: decide execution-history ledger IA so **time-ordered playbook runs, trace, and audit pivots** are clearly distinct from `/response/playbooks` (inventory + execute), `/response/authority` (approval queue), `/detection-rules` (detection content), and `/incidents` (owned cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 17 Response Playbooks (merged @ `9e75068`).

Base tip: `main` @ `9e75068` includes Prompt 17 — `based_on_main_includes_pr17: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-playbooks/executions` | RESP-018 inventory | Primary ledger grid |
| `GET /api/ha-playbooks/executions/summary` | summary counts | Compact inline toolbar stats (when data exists) |
| `GET /api/ha-playbooks/executions/{id}/trace` | steps_log projection | Drawer trace tab (best-effort) |
| `DELETE /api/ha-playbooks/{executionId}` | cancel run | Drawer cancel (ADMIN only) |
| `POST /api/ha-playbooks/executions/{id}/approve` | resume paused run | Drawer approve (ADMIN only) |
| `POST /api/ha-playbooks/executions/{id}/reject` | reject paused run | Drawer reject (ADMIN only) |
| `GET /api/ha-response-governance/approvals` | RESP-020 projection | Cross-link only |
| `GET /api/soar/audit` | legacy audit | Fallback when RESP_018_EXECUTION_INVENTORY=false |

Do **not** wire: `GET /api/ha-response-activity`, export endpoints, `/api/soar/actions`.

---

## A1. Commercial SOAR / SIEM (≥3)

### Splunk SOAR (Phantom) — Playbook run history

| Item | Detail |
|---|---|
| Sources | [Run a playbook](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/RunPlaybook), [Monitor playbook runs](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/PlaybookOverview) |
| Access date | **2026-08-29** |
| Ledger-first | Run history is a chronological list — playbook name, status, start time, trigger context; builder/inventory is a separate surface. |
| Trace | Per-action timeline in run detail; empty trace when run never started or logging restricted. |
| Approval pauses | Paused runs surface in history with explicit awaiting-approval state; decisions logged. |
| Avoid | Hero KPI band (success rate, median duration) dominating an empty ledger — Splunk-style summary tiles mislead when zero runs exist. |

### Elastic Security — Response action history

| Item | Detail |
|---|---|
| Sources | [Response actions history](https://www.elastic.co/docs/solutions/security/manage-detection-response/automatically-respond-to-alerts), [Endpoint response actions](https://www.elastic.co/docs/solutions/security/manage-detection-response/automatically-respond-to-alerts) |
| Access date | **2026-08-29** |
| Ledger-first | Action history tab lists endpoint/automation runs separately from rule inventory and detection content. |
| Filters | Status, time window, and entity context filters stay compact above the grid. |
| Trace honesty | Step-level output when available; partial/unavailable sources shown without fabricating steps. |
| Avoid | Conflating detection rule list with response execution history on one page. |

### Microsoft Sentinel — Automation run history

| Item | Detail |
|---|---|
| Sources | [Automation rules](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation-rules), [Logic Apps run history](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation) |
| Access date | **2026-08-29** |
| Ledger-first | Logic App / automation run blade is time-ordered; authoring and rule inventory are separate blades. |
| Approval | Human-in-the-loop runs show paused state with link to approval workflow. |
| Empty ledger | Explicit “no runs yet” — not implied platform health from empty data. |
| Avoid | Full-width operational KPI strip when the run list is empty. |

### Palo Alto Cortex XSOAR — War Room / playbook runs (optional)

| Item | Detail |
|---|---|
| Sources | [Cortex XSOAR playbooks — run and debug](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSOAR/8/Cortex-XSOAR-Administrator-Guide/Playbooks) |
| Access date | **2026-08-29** |
| Borrow | Run grid with status badges; drill-down trace panel; pivot to incident/context entity. |
| Avoid | War Room chat UX borrowed into a SIEM ledger — keep grid + drawer, not conversational shell. |

---

## A2. Open-source / open-core (≥3)

### Shuffle SOAR — Execution log

| Item | Detail |
|---|---|
| Sources | [Shuffle SOAR](https://github.com/Shuffle/Shuffle) |
| Access date | **2026-08-29** |
| Borrow | Separate execution log page from workflow editor; status filter + time window; click row for step detail. |
| Avoid | Inline mock executions in production builds. |

### StackStorm — Action execution history

| Item | Detail |
|---|---|
| Sources | [StackStorm action execution](https://docs.stackstorm.com/actions.html), [Execution history](https://docs.stackstorm.com/reference/execution.html) |
| Access date | **2026-08-29** |
| Borrow | Chronological action runs with exit status; expandable step output; cancel running execution from detail. |
| Avoid | Fake execution counts when audit log is empty. |

### TheHive — Case task timeline

| Item | Detail |
|---|---|
| Sources | [TheHive case management](https://docs.thehive-project.org/thehive/) |
| Access date | **2026-08-29** |
| Borrow | Task/responder timeline on case detail — UX pattern for step trace in drawer, not as primary nav. |
| Avoid | Treating case timeline as a substitute for platform-wide execution inventory. |

### n8n — Executions list (UX borrow only)

| Item | Detail |
|---|---|
| Sources | [n8n executions](https://docs.n8n.io/workflows/executions/) |
| Access date | **2026-08-29** |
| Borrow | Compact filter bar; execution list owns viewport; detail drawer for node-level trace. |
| Avoid | Borrowing n8n backend contracts — HiveArmor uses RESP-018 ha-playbooks endpoints only. |

---

## A3 → A4: KEEP | RESTRUCTURE | SPLIT

| Area | Decision | Rationale |
|---|---|---|
| Primary grid (executions ledger) | **KEEP** | Core job — time-ordered runs via AG Grid + cursor pagination |
| Compact filters (status · trigger · window · search) | **KEEP** | OEM pattern; dense SOC toolbar |
| Detail drawer (overview / trace / audit) | **KEEP** | Secondary to grid; keyboard J/K/Enter/ |
| Hero 6-tile `.act-summary` KPI strip | **RESTRUCTURE** | Demote to compact inline toolbar stats fed by `executions/summary` — only when rows exist |
| RESP-018 full-width technical banner | **RESTRUCTURE** | Fold trace best-effort copy into identity/honesty chrome |
| Legacy eyebrow “Response automation” | **RESTRUCTURE** | Replace with **RESPOND** section label (match Playbooks P17) |
| Job sentence + STAGING CANDIDATE badge | **ADD** | Bundle-visible honesty; distinct from playbooks/authority |
| Meta cross-links + role access note | **ADD** | Mission Control · Playbooks · Approvals · Detection · Incidents |
| Empty-window honesty banner | **ADD** | No executions yet — do not imply platform health |
| Grid workspace ≥50vh (`.act-inventory`) | **ADD** | Ledger owns viewport (P17 lesson) |
| Playbook inventory / authoring | **SPLIT** | Lives on `/response/playbooks` (P17) |
| Approval queue / policy CRUD | **SPLIT** | Lives on `/response/authority` (P19) |
| Detection content | **SPLIT** | Lives on `/detection-rules` (P16) |
| Export CSV (production) | **KEEP disabled** | No secured export contract — fixture dev-only |

---

## Next recommended slice

**`/response/authority` (Prompt 19)** — approval projection depth, policy/delegation honesty when RESP_020_GOVERNANCE ships.
