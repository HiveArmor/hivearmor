# Prompt 31 — Dashboard Gallery (`/dashboards`) OEM research

Retrieved: **2026-08-31**

Purpose: decide gallery-first discover hub IA so **dashboard inventory, managed content, health, and owner context** stay distinct from `/dashboards/studio` (low-code authoring), `/dashboards/:id` (runtime panels), `/reports/scheduled` (scheduled reporting), and `/compliance` (framework assurance). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 30 `/compliance` — Wave B2 closure (merged @ `8264de1` via CMP-015 / PR #138).

Base tip: `main` @ `8264de1` includes Prompt 30 + CMP drawer program through CMP-015 — `based_on_main_includes_pr30: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-dashboards` | Legacy dashboard entity list | Gallery inventory (normalize panels; no fake bound/tenant claims) |
| `GET /api/ha-dashboards/{id}` | Legacy dashboard detail | Runtime open (sibling route — not this slice) |
| `POST /api/ha-visualizations/run` | SEC-06 gated run | Panel execution on runtime — not gallery |

**Forbidden:** Claiming bounded/tenant-scoped inventory when list lacks `X-Total-Count`; toast “report generated” from gallery; fictional Northwind/Contoso tenants; production fixture import; inventing versioned save/publish.

---

## A1. Commercial dashboard gallery UX (≥3)

### Splunk Dashboard Studio — gallery vs authoring

| Item | Detail |
|---|---|
| Sources | [Splunk Dashboard Studio overview](https://docs.splunk.com/Documentation/Splunk/latest/DashStudio/WhatIsDashStudio) |
| Access date | **2026-08-31** |
| Gallery-first | Discovery/gallery is separate from Studio authoring; permissions gate edit vs view. |
| Honesty | Drilldowns are intentional pivots — not silent raw payload export. |
| Avoid | Merging Studio canvas into the gallery list surface. |

### Microsoft Sentinel / Azure Workbooks — shared parameters without fake tenants

| Item | Detail |
|---|---|
| Sources | [Azure Monitor workbooks overview](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview) |
| Access date | **2026-08-31** |
| Parameters | Workbooks bind parameters that drive queries; decorative selectors mislead. |
| Avoid | Fictional tenant chrome until variable contracts apply filters to run. |

### Elastic Dashboards — managed content and clone-to-edit

| Item | Detail |
|---|---|
| Sources | [Elastic dashboards workflow](https://www.elastic.co/docs/explore-analyze/dashboards) |
| Access date | **2026-08-31** |
| Borrow | Managed dashboards duplicate before edit; gallery lists ownership/health. |
| Avoid | Mutating managed definitions in place from the gallery card. |

---

## A2. Open-source / standards borrow (≥2)

### Grafana — permissions and version honesty

| Item | Detail |
|---|---|
| Sources | [Grafana dashboard permissions](https://grafana.com/docs/grafana/latest/administration/user-management/manage-dashboard-permissions/), [version history](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/manage-version-history/) |
| Access date | **2026-08-31** |
| Borrow | Explicit owner/access; version/history as first-class — disable save until contracts exist. |
| Avoid | Fake “Ready to publish” when versioned save is fixture-only. |

### NIST SP 800-61 Rev. 3 — communications integrity

| Item | Detail |
|---|---|
| Sources | [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) |
| Access date | **2026-08-31** |
| Implication | Reporting/distribution integrity lives on `/reports/*` — gallery does not generate SOC communications. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/dashboards` | **RESTRUCTURE** | Gallery-first hub with Wave C1 honesty chrome; demote 5-tile `.dsh-summary` hero; DASHBOARDS eyebrow + STAGING CANDIDATE; meta cross-links via `Link` + `ROUTES`; empty-honesty distinct from filter-empty and API error; StatusDock historical for snapshot inventory. |
| `/dashboards/studio` | **KEEP** (sibling) | Low-code authoring — Prompt 32 (next). |
| `/dashboards/:id` | **KEEP** (sibling) | Runtime panels — later Wave C1 slice. |
| `/reports/scheduled` | **KEEP** (sibling) | Scheduled reporting workspace — meta link. |
| `/reports/templates` | **KEEP** (sibling) | Template inventory — meta link. |
| `/compliance` | **KEEP** (sibling) | Framework assurance (Prompt 30) — meta link. |

---

## Next recommended slice

**`/dashboards/studio`** (Prompt 32) — Studio authoring honesty chrome, distinct from gallery discover and report generation; preserve fixture-only save fail-closed until DSH versioned contracts land. *(Implemented — see `prompt32-dashboards-studio-oem.md`.)*
