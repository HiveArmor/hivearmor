# Prompt 17 — Response Playbooks (`/response/playbooks`) OEM research

Retrieved: **2026-08-29**

Purpose: decide SOAR playbook hub IA so **playbook inventory + governed execution** is clearly distinct from `/detection-rules` (detection content), `/response/activity` (execution history), `/response/authority` (approval ledger), and `/incidents` (owned response cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 16 Detection Rules (merged @ `67ea7a9`).

Base tip: `main` @ `67ea7a9` includes Prompt 16 — `based_on_main_includes_pr16: yes`.

Confirmed APIs for this slice (verified in backend source — secured successor is **ha-playbooks**, legacy `/api/soar/playbooks` deprecated):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-playbooks` | `PlaybookResource.getAllPlaybooks` | Primary inventory grid |
| `GET /api/ha-playbooks/metrics` | `PlaybookResource.getPlaybookMetrics` | Optional strip — **removed from UI** when empty/misleading |
| `POST /api/ha-playbooks` | create | New playbook (ADMIN) |
| `GET/PUT/DELETE /api/ha-playbooks/{id}` | CRUD | Workbench |
| `PATCH /api/ha-playbooks/{id}/status` | activate/deactivate | Grid toggle (ADMIN) |
| `POST /api/ha-playbooks/{id}/preview` | dry-run | Execute wizard |
| `POST /api/ha-playbooks/{id}/execute` | run | Execute (ADMIN) |
| `GET /api/ha-playbooks/executions` | RESP-018 inventory | Cross-link → Activity |
| `GET /api/ha-playbooks/executions/summary` | summary | Activity header |
| `GET /api/ha-playbooks/executions/{id}/trace` | step trace | Activity detail |
| `GET /api/ha-response-governance/approvals` | RESP-020 projection | Cross-link → Authority |
| `POST /api/ha-response-governance/approvals/{id}/decision` | ADMIN bridge | Authority decisions |

Legacy `GET/POST /api/soar/playbooks*` remains with Deprecation header → `/api/ha-playbooks`. Do **not** invent `/api/soar/actions` — static `ActionPalette` catalogue.

---

## A1. Commercial SOAR (≥3)

### Splunk SOAR (Phantom) — Playbooks

| Item | Detail |
|---|---|
| Sources | [Splunk SOAR playbook concepts](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/PlaybookOverview), [Run a playbook](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/RunPlaybook) |
| Access date | **2026-08-29** |
| Inventory-first | Playbook list is the primary landing — name, active state, last run, tags; builder is secondary drill-down. |
| Execute + approval | Disruptive actions can require analyst confirmation; approval queues surface before execution proceeds. |
| Trace honesty | Execution timeline shows per-action status; empty library is explicit, not seeded demo content. |
| Avoid | Hero KPI tiles implying coverage when no playbooks exist. |

### Elastic Security — Response actions & rules

| Item | Detail |
|---|---|
| Sources | [Configure response actions](https://www.elastic.co/docs/solutions/security/automatically-respond-to-alerts), [Response actions in Elastic Defend](https://www.elastic.co/docs/solutions/security/manage-detection-response/automatically-respond-to-alerts) |
| Access date | **2026-08-29** |
| Inventory-first | Response actions and connector-backed automations listed in management UI before inline edit. |
| Governed execute | Endpoint response actions require privileges; UI disables mutate with role copy. |
| Trace | Action history is separate from rule/detection inventory — cross-linked, not merged. |
| Avoid | Fabricated success-rate KPIs on zero executions. |

### Microsoft Sentinel — Automation rules + Logic Apps

| Item | Detail |
|---|---|
| Sources | [Automation rules](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation-rules), [SOAR content in Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation) |
| Access date | **2026-08-29** |
| Inventory-first | Automation rules blade lists name, status, trigger — playbook/Logic App authoring is secondary. |
| Approval | Human-in-the-loop patterns for high-impact containment; approval queue is its own surface. |
| Empty library | No playbooks → explicit empty state with create/import CTA, not fake metrics. |
| Avoid | Conflating detection rule inventory with response automation inventory. |

### Palo Alto Cortex XSOAR — Playbook library (optional)

| Item | Detail |
|---|---|
| Sources | [Cortex XSOAR playbooks](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSOAR/8/Cortex-XSOAR-Administrator-Guide/Playbooks) |
| Access date | **2026-08-29** |
| Borrow | Playbook marketplace + personal library split; status badges (active/draft); run-from-inventory affordance. |
| Avoid | Marketplace tiles masquerading as tenant-owned inventory. |

---

## A2. Open-source / open-core (≥3)

### Shuffle SOAR

| Item | Detail |
|---|---|
| Sources | [Shuffle SOAR](https://github.com/Shuffle/Shuffle) |
| Access date | **2026-08-29** |
| Borrow | Workflow list with enable/disable; execution history separate page; app/action palette static catalogue. |
| Avoid | Inline mock workflows in production builds. |

### TheHive + Cortex — Responders

| Item | Detail |
|---|---|
| Sources | [Cortex Analyzers/Responders](https://github.com/TheHive-Project/Cortex) |
| Access date | **2026-08-29** |
| Borrow | Responder catalogue vs case-triggered execution; analyst approval before destructive responders. |
| Avoid | Implied responder coverage without configured connectors. |

### StackStorm — Actions & rules

| Item | Detail |
|---|---|
| Sources | [StackStorm automation](https://docs.stackstorm.com/automation_rules.html) |
| Access date | **2026-08-29** |
| Borrow | Pack/action inventory; execution trace with step-level status; rule enable toggle on list. |
| Avoid | Fake execution counts when audit log is empty. |

### n8n — Workflow patterns (UX borrow only)

| Item | Detail |
|---|---|
| Sources | [n8n workflow UI](https://docs.n8n.io/workflows/) |
| Access date | **2026-08-29** |
| Borrow | List ↔ canvas split; compact filter bar; empty canvas CTA — not n8n backend. |
| Avoid | Treating borrow patterns as SOAR API contracts. |

---

## A3 → A4: KEEP | RESTRUCTURE | SPLIT

| Area | Decision | Rationale |
|---|---|---|
| Route `/response/playbooks` | **KEEP** | Correct product placement vs detection / activity / authority |
| List vs builder | **SPLIT** (same hub family) | Inventory page primary; builder at `/new`, `/:id`, `/:id/edit` secondary |
| Page chrome | **RESTRUCTURE** | Match Prompt 16 honesty pattern: job sentence, STAGING CANDIDATE, meta links |
| Metrics/KPI strip | **RESTRUCTURE → remove** | Splunk/Elastic/Sentinel avoid hero KPIs on empty libraries; success-rate misleading at zero runs |
| Filters | **KEEP** compact | Status · trigger · category · search — client-side on bounded list |
| Grid | **RESTRUCTURE** | min-height **≥50vh** inventory ownership |
| Execute / approve | **KEEP + honesty** | Preview → confirm; approval-required chip + link to `/response/authority` |
| Role gates | **KEEP aligned to BE** | View: SOC Manager \| Admin; mutate/execute: **Platform Administrator** (`ROLE_ADMIN` on `PlaybookResource`) |
| Empty library | **ADD** honesty banner | Explicit empty tenant — seed CTA for Admin only |
| Fixture playbooks | **KEEP dev-only** | `VITE_USE_FOUNDATION_FIXTURES` — never in production bundle |

**Next recommended slice:** `/response/activity` (Prompt 18).
