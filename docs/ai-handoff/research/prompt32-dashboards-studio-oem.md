# Prompt 32 — Dashboard Studio (`/dashboards/studio`) OEM research

Retrieved: **2026-08-31**

Purpose: decide Studio authoring honesty so **low-code panel layout and draft definitions** stay distinct from `/dashboards` (gallery discover), `/dashboards/:id` (runtime panels), `/reports/scheduled` (scheduled reporting), and `/reports/templates` (template inventory). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 31 `/dashboards` gallery honesty — Wave C1 opener (merged @ `bba98b1`).

Base tip: `main` @ `bba98b1` includes Prompt 31 — `based_on_main_includes_pr31: yes`.

Confirmed APIs / contracts for this slice (verified — do **not** invent):

| Endpoint / contract | Backend | UI use |
|---|---|---|
| `GET /api/ha-dashboards/{id}` | Legacy dashboard detail | Load definition for edit (clone managed) |
| Versioned save / publish | **Not shipped** | Fail-closed outside DEV fixtures (`dashboardOperationsService.save`) |
| `POST /api/ha-visualizations/run` | SEC-06 gated run | Runtime panel execution — sibling `/dashboards/:id`, not Studio save |

**Forbidden:** Fake “Ready to publish”; production fixture import; inventing versioned save; toast “report generated”; merging gallery discover into Studio; claiming SOC communications generation.

---

## A1. Commercial Studio UX (≥3)

### Splunk Dashboard Studio — authoring vs gallery

| Item | Detail |
|---|---|
| Sources | [Splunk Dashboard Studio overview](https://docs.splunk.com/Documentation/Splunk/latest/DashStudio/WhatIsDashStudio) |
| Access date | **2026-08-31** |
| Borrow | Separate Studio canvas from gallery discovery; edit permissions gated. |
| Avoid | Publishing language when only local draft validation exists. |

### Elastic — clone managed before edit

| Item | Detail |
|---|---|
| Sources | [Elastic dashboards workflow](https://www.elastic.co/docs/explore-analyze/dashboards) |
| Access date | **2026-08-31** |
| Borrow | Managed definitions duplicate before edit (already in Studio load path). |
| Avoid | Mutating managed system definitions in place. |

### Grafana — version honesty

| Item | Detail |
|---|---|
| Sources | [Grafana version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/) |
| Access date | **2026-08-31** |
| Borrow | Disable save/publish until version contracts exist; local validation ≠ publish gate. |
| Avoid | Implying production persistence from fixture-only drafts. |

---

## A2. Open-source / standards borrow (≥2)

### Azure Monitor Workbooks — parameters without fake readiness

| Item | Detail |
|---|---|
| Sources | [Azure Monitor workbooks overview](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview) |
| Access date | **2026-08-31** |
| Borrow | Structural completeness is local; connector/source contracts gate runtime. |
| Avoid | Decorative “publish ready” chrome. |

### NIST SP 800-61 Rev. 3 — communications integrity

| Item | Detail |
|---|---|
| Sources | [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) |
| Access date | **2026-08-31** |
| Implication | SOC communications / reporting integrity lives on `/reports/*` — Studio authors views, does not generate reports. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/dashboards/studio` (+ `/dashboards/:id/edit`) | **RESTRUCTURE** | Studio honesty chrome: job sentence, STAGING CANDIDATE, Link+ROUTES meta, fail-closed save, no fake publish; StatusDock historical for definition authoring. |
| `/dashboards` | **KEEP** (sibling) | Gallery discover — Prompt 31 done. |
| `/dashboards/:id` | **KEEP** (sibling) | Runtime panels — Prompt 33 (next). |
| `/reports/scheduled` | **KEEP** (sibling) | Scheduled reporting — meta link. |
| `/reports/templates` | **KEEP** (sibling) | Template inventory — meta link. |
| `/compliance` | **KEEP** (sibling) | Framework assurance — meta link. |

---

## Next recommended slice

**`/dashboards/:id`** (Prompt 33) — Runtime panel honesty chrome; visualization run stays SEC-06 gated; no fake bound/tenant panel claims; distinct from Studio authoring and report generation.
