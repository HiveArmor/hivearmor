# Prompt 21 — Response Library (`/response/library`) OEM research

Retrieved: **2026-08-29**

Purpose: decide catalog-inventory-first IA so **governed SOAR action primitives + connector readiness** are clearly distinct from `/response/playbooks` (orchestration), `/response/activity` (execution ledger), `/response/authority` (approval queue), `/response/quarantine` (containment inventory), `/detection-rules` (detection content), and `ActionPalette` (in-playbook static palette). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 20 Response Quarantine (merged @ `ed08b02` via PR #107).

Base tip: `main` @ `ed08b02` includes Prompt 20 — `based_on_main_includes_pr20: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/response/actions` | `HaResponseActionResource` | Primary action catalog |
| `POST /api/response/actions/{actionId}/preview` | Preview contract | **Do not wire on library page** |
| `POST /api/response/actions/{actionId}/execute` | Execute contract | **Forbidden on library page** |

Deprecated (document only — do not adopt as primary):

| Endpoint | Note |
|---|---|
| `GET /api/ha-response-actions/library` | Thinner schema; `Deprecation: true` + `Link: </api/response/actions>; rel="successor-version"` on staging |
| `GET /api/soar/actions` | **Does not exist** |

---

## A1. Commercial SOAR (≥3)

### Splunk SOAR (Phantom) — Custom functions & action library

| Item | Detail |
|---|---|
| Sources | [Custom functions](https://docs.splunk.com/Documentation/SOAR/latest/CustomizeUI/CustomFunctions), [Playbook editor actions](https://docs.splunk.com/Documentation/SOAR/latest/Playbook/Editor) |
| Access date | **2026-08-29** |
| Catalog-first | Dedicated action/function inventory browsable outside playbook run — schema, inputs, and connector binding visible before authoring. |
| Governance | Functions are added to playbooks; execution always requires playbook context + asset selection — never one-click run from catalog. |
| Connector readiness | Asset/connector health surfaced per action; advisory until run-time validation. |
| Avoid | Hero KPI tiles counting “healthy actions” as platform health when catalog is paginated or tenant-empty. |

### Palo Alto Cortex XSOAR — Integrations & automation actions catalog

| Item | Detail |
|---|---|
| Sources | [Integrations catalog](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSOAR/8/Cortex-XSOAR-Administrator-Guide/Integrations), [Automation scripts](https://docs-cortex.paloaltonetworks.com/r/Cortex-XSOAR/8/Cortex-XSOAR-Administrator-Guide/Automations) |
| Access date | **2026-08-29** |
| Catalog-first | Marketplace-style integration browser with category sidebar, search, and per-action parameter schema in drawer. |
| Authoring pivot | “Use in playbook” / drag-to-playbook — catalog is read-only for execution. |
| Risk labeling | High-impact actions tagged; approval workflows referenced but enforced at execution. |
| Avoid | Inline “Test” / “Run” buttons on catalog rows without target context. |

### Microsoft Sentinel — Logic Apps connectors & playbook actions

| Item | Detail |
|---|---|
| Sources | [Logic Apps connectors](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-overview), [Sentinel automation](https://learn.microsoft.com/en-us/azure/sentinel/automation/automation) |
| Access date | **2026-08-29** |
| Catalog-first | Connector gallery with readiness state, schema inspection, and “add to workflow” affordance — not direct execution. |
| Separation | Connector catalog distinct from automation rule inventory and run history. |
| Empty honesty | Empty connector list ≠ healthy tenant — explicit empty-state copy. |
| Avoid | Conflating connector browse with incident response execution ledger. |

---

## A2. Open-source / open-core (≥3)

### Shuffle — Apps & actions marketplace

| Item | Detail |
|---|---|
| Sources | [Shuffle apps](https://shuffler.io/docs/apps), [Workflow editor](https://shuffler.io/docs/workflows) |
| Access date | **2026-08-29** |
| Borrow | Category sidebar + dense action list; drawer shows parameters before drag-to-workflow. |
| Avoid | Treating Shuffle app install UX as HiveArmor connector admin — `/admin/connectors` owns that. |

### StackStorm — Pack action catalog

| Item | Detail |
|---|---|
| Sources | [StackStorm packs](https://docs.stackstorm.com/reference/packs.html), [Action metadata](https://docs.stackstorm.com/reference/actions.html) |
| Access date | **2026-08-29** |
| Borrow | Pack/action browse with input schema, runner type, and enabled/disabled readiness — execution only via rule/workflow. |
| Avoid | CLI-style action execution from catalog UI. |

### n8n — Node catalog

| Item | Detail |
|---|---|
| Sources | [n8n nodes](https://docs.n8n.io/integrations/builtin/node-types/), [Node credentials](https://docs.n8n.io/credentials/) |
| Access date | **2026-08-29** |
| Borrow | Searchable node catalog with credential-readiness hints; add-to-workflow only. |
| Avoid | Borrowing workflow canvas into library page — builder lives on `/response/playbooks`. |

---

## A3 → A4: KEEP | RESTRUCTURE | SPLIT

| Area | Decision | Rationale |
|---|---|---|
| Category sidebar + filter toolbar (risk, readiness, search) | **KEEP** | OEM catalog pattern — dense SOC browse |
| Dense action table + pagination + drawer tabs | **KEEP** | Schema/governance inspection before authoring |
| Add to playbook affordance (`/response/playbooks/new?action=…`) | **KEEP** | Splunk/XSOAR authoring pivot — no Run/Execute |
| Drawer “Never execute from the catalog” governance notice | **KEEP** | Strengthen in governance tab + identity projection note |
| `fixtureMode` dev-only | **KEEP** | Visual review without backend |
| Honest “Not reported” for missing metadata | **KEEP** | Fail-closed honesty |
| Stale snapshot warning on refresh failure | **KEEP** | Partial data honesty |
| Hero `.ral-metrics` 6-tile strip | **RESTRUCTURE** | Demote to `.ral-inline-stats` in results toolbar (action count + ≤2 stats) |
| Legacy eyebrow “Response automation” / title “Action & Connector Library” | **RESTRUCTURE** | **Response Library** + RESPOND + STAGING CANDIDATE |
| Status-dock “side-effect free” duplicate note | **RESTRUCTURE** | Fold into `ral-page__projection-note` in identity chrome |
| Job sentence + meta cross-links + role note | **ADD** | Match Prompt 16–20 honesty chrome |
| Empty-catalog honesty banner (`library-empty-honesty`) | **ADD** | `[]` with no filters — distinct from API error and filtered empty |
| Catalog workspace ≥50vh (`.ral-inventory`) | **ADD** | Inventory owns viewport |
| `ResponseLibraryUxHonesty.sourceScan.test.ts` | **ADD** | Regression guard |
| SOAR playbook inventory | **SPLIT** | Lives on `/response/playbooks` (P17) |
| Execution ledger | **SPLIT** | Lives on `/response/activity` (P18) |
| Approval queue | **SPLIT** | Lives on `/response/authority` (P19) |
| Containment inventory | **SPLIT** | Lives on `/response/quarantine` (P20) |
| Detection content manager | **SPLIT** | Lives on `/detection-rules` (P16) |
| In-playbook static palette | **SPLIT** | `ActionPalette` in builder — separate from catalog hub |
| Direct preview/execute from library | **FORBIDDEN** | Route to playbook authoring only |

---

## Next recommended slice

**`/edr/fim` (Prompt 22 — Wave B1)** — file integrity monitoring inventory with honesty gates.
