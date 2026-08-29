# Prompt 19 — Response Authority (`/response/authority`) OEM research

Retrieved: **2026-08-29**

Purpose: decide approval-queue-first IA so **human approve/reject decisions with blast-radius evidence** are clearly distinct from `/response/playbooks` (inventory + execute), `/response/activity` (execution ledger), `/detection-rules` (detection content), and `/incidents` (owned cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 18 Response Activity (merged @ `40f757f` via PR #105).

Base tip: `main` @ `40f757f` includes Prompt 18 — `based_on_main_includes_pr18: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-response-governance/approvals` | RESP-020 projection | Primary approval queue |
| `POST /api/ha-response-governance/approvals/{id}/decision` | approve/reject bridge | Drawer decision (ADMIN only) |
| `POST /api/ha-playbooks/executions/{id}/approve` | underlying gate | Prefer governance decision POST in UI |
| `POST /api/ha-playbooks/executions/{id}/reject` | underlying gate | Prefer governance decision POST in UI |

Do **not** wire: policy/delegation CRUD, `GET /api/authority` (JHipster role CRUD), full governance ledger endpoints.

---

## A1. Commercial SOAR / SIEM (≥3)

### Splunk SOAR (Phantom) — Action approval queue

| Item | Detail |
|---|---|
| Sources | [Action approval](https://docs.splunk.com/Documentation/SOAR/latest/Admin/ConfigureActionApproval), [Playbook approval](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/PlaybookOverview) |
| Access date | **2026-08-29** |
| Queue-first | Pending approvals surface as a dedicated work queue — playbook builder and run history are separate surfaces. |
| Blast radius | Approver sees action scope, target assets, and connector state before releasing execution. |
| Decision audit | Approve/reject rationale is logged immutably; expired items leave the pending queue. |
| Avoid | Hero KPI tiles (median decision time, connector warnings) dominating an empty approval queue. |

### Elastic Security — Case / response action approval

| Item | Detail |
|---|---|
| Sources | [Response actions](https://www.elastic.co/docs/solutions/security/manage-detection-response/automatically-respond-to-alerts), [Endpoint response actions](https://www.elastic.co/docs/solutions/security/manage-detection-response/automatically-respond-to-alerts) |
| Access date | **2026-08-29** |
| Queue-first | Pending endpoint actions require explicit analyst approval before execution resumes. |
| Evidence | Approver reviews target host, action type, and triggering alert context in one panel. |
| Role separation | Only privileged roles can approve destructive actions; viewers see queue read-only. |
| Avoid | Conflating action approval queue with detection rule inventory or execution history ledger. |

### Microsoft Sentinel — Human-in-the-loop automation approval

| Item | Detail |
|---|---|
| Sources | [Automation rules — human-in-the-loop](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation), [Logic Apps approval connectors](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-overview) |
| Access date | **2026-08-29** |
| Queue-first | Automation runs pause at approval gates; pending items appear in a decision inbox separate from run history. |
| Blast radius | Approver sees affected entities, rule context, and timeout before the run expires. |
| Policy honesty | When governance policy authoring is unavailable, UI must not imply tenant-owned policy records exist. |
| Avoid | Full-width operational KPI strip when the pending queue is empty. |

### Palo Alto Cortex XSOAR — Manual task approval (optional)

| Item | Detail |
|---|---|
| Sources | [Cortex XSOAR playbooks — manual tasks](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSOAR/8/Cortex-XSOAR-Administrator-Guide/Playbooks) |
| Access date | **2026-08-29** |
| Borrow | Pending manual tasks in a queue grid; drawer with evidence and mandatory comment before approve. |
| Avoid | Borrowing War Room chat UX into a SIEM approval queue — keep grid + drawer. |

---

## A2. Open-source / open-core (≥3)

### TheHive — Case approval workflow

| Item | Detail |
|---|---|
| Sources | [TheHive case management](https://docs.thehive-project.org/thehive/) |
| Access date | **2026-08-29** |
| Borrow | Case-level approval steps with mandatory comment; approver sees affected observables before release. |
| Avoid | Treating case approval as a substitute for platform-wide playbook action approval queue. |

### Shuffle SOAR — Approval gates

| Item | Detail |
|---|---|
| Sources | [Shuffle SOAR](https://github.com/Shuffle/Shuffle) |
| Access date | **2026-08-29** |
| Borrow | Workflow pause at approval node; pending approvals list separate from workflow editor and execution log. |
| Avoid | Inline mock approval records in production builds when backend returns empty projection. |

### StackStorm — Action approval

| Item | Detail |
|---|---|
| Sources | [StackStorm action execution](https://docs.stackstorm.com/actions.html), [Rules and workflows](https://docs.stackstorm.com/rules.html) |
| Access date | **2026-08-29** |
| Borrow | Approval-required actions pause execution; approver reviews parameters and target scope in detail panel. |
| Avoid | Fake pending counts or median decision KPIs when the approval API returns zero items. |

### n8n — Wait for approval node (UX borrow only)

| Item | Detail |
|---|---|
| Sources | [n8n wait node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/) |
| Access date | **2026-08-29** |
| Borrow | Compact pending list; detail drawer for decision with timeout indicator. |
| Avoid | Borrowing n8n backend contracts — HiveArmor uses RESP-020 ha-response-governance endpoints only. |

---

## A3 → A4: KEEP | RESTRUCTURE | SPLIT

| Area | Decision | Rationale |
|---|---|---|
| Primary grid (approval queue) | **KEEP** | Core job — pending governed actions via AG Grid |
| Compact filters (state · risk · search) | **KEEP** | OEM pattern; dense SOC toolbar |
| ApprovalDrawer (blast radius, evidence, rationale) | **KEEP** | Secondary to grid; keyboard J/K/Enter |
| Tabs: queue · history · policy | **KEEP** | Policy tab read-only / empty honesty until RESP_020_GOVERNANCE |
| Hero 6-tile `.gov-summary` KPI strip | **RESTRUCTURE** | Demote pending count (+ at most 1–2 compact stats) to results toolbar — only when data exists |
| RESP-020 full-width technical banner | **RESTRUCTURE** | Fold into identity chrome (`gov-page__projection-note`) |
| Legacy eyebrow "Response automation" / title "Response Governance" | **RESTRUCTURE** | Replace with **Response Approvals** (match nav label) |
| Job sentence + STAGING CANDIDATE badge | **ADD** | Bundle-visible honesty; distinct from playbooks/activity |
| Meta cross-links + role access note | **ADD** | Mission Control · Playbooks · Activity · Detection · Incidents |
| Empty-queue honesty banner | **ADD** | No pending approvals — distinct from Activity empty ledger |
| Grid workspace ≥50vh (`.gov-inventory`) | **ADD** | Queue owns viewport (P17/P18 lesson) |
| canDecide ADMIN-only gate in drawer | **ADD** | Fix: SOC Manager can view but not approve/reject |
| Policy tab empty honesty | **ADD** | Explicit "not implemented" when RESP_020_GOVERNANCE=false |
| Playbook inventory / authoring | **SPLIT** | Lives on `/response/playbooks` (P17) |
| Execution history ledger | **SPLIT** | Lives on `/response/activity` (P18) |
| Detection content | **SPLIT** | Lives on `/detection-rules` (P16) |
| Policy/delegation CRUD | **KEEP disabled** | Fail-closed until RESP_020_GOVERNANCE ships |

---

## Next recommended slice

**`/response/quarantine` (Prompt 20)** — endpoint quarantine inventory and containment actions with SEC-05 honesty gates.
