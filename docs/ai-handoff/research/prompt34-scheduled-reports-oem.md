# Prompt 34 — Scheduled Reports (`/reports/scheduled`) OEM research

Retrieved: **2026-08-31**

Purpose: decide scheduled-reporting honesty so **delivery schedule inventory and last-execution stamps** stay distinct from `/dashboards` (gallery discover), `/dashboards/studio` (low-code authoring), `/dashboards/:id` (runtime panels), `/reports/templates` (template inventory), and `/compliance` (framework assurance). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 31 gallery + Prompt 32 Studio MERGED on `main` @ `4808ef4`. Parallel siblings: Prompt 33 runtime panels, Prompt 35 templates — do not edit those routes.

Base tip: `main` @ `4808ef4` includes gallery + Studio honesty — `based_on_main_includes_pr31_pr32: yes`.

Confirmed APIs for this slice (verified in frontend service / endpoint map — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-reports/scheduled` | Legacy schedule list | Inventory (no fake bound/tenant claims) |
| `POST /api/ha-reports/scheduled/{id}/run` | Stamps `lastExecutionTime` only (REP-004) | Honest stamp action — never toast “report generated” |
| `PATCH …/pause` · `PATCH …/resume` | Active flag | Admin-gated; no delivery claim |
| `POST/PUT/DELETE …/scheduled` | CRUD | Available in service; create not required for honesty chrome |

**Forbidden:** Claiming artifact generation/distribution from schedule run; conflating empty inventory with API error; fictional Northwind/Contoso tenants; inventing delivery-health endpoints; merging gallery/Studio into this surface.

---

## A1. Commercial scheduled reporting UX (≥2)

### Splunk Enterprise — schedule vs generation

| Item | Detail |
|---|---|
| Sources | [Splunk schedule reports](https://help.splunk.com/en/splunk-enterprise/create-dashboards-and-reports/reporting-manual/9.3/report-management/schedule-reports) |
| Access date | **2026-08-31** |
| Borrow | Schedule definition, run identity, and delivery are separate from one-shot generation. |
| Avoid | Treating “run now” as proof a PDF/email was produced when the API only stamps execution time. |

### Microsoft Sentinel / Azure Workbooks — templates vs schedules

| Item | Detail |
|---|---|
| Sources | [Azure Monitor workbooks overview](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview) |
| Access date | **2026-08-31** |
| Borrow | Template inventory is a sibling surface to scheduled delivery. |
| Avoid | Collapsing Templates into Scheduled Reports chrome. |

---

## A2. Standards borrow

### NIST SP 800-61 Rev. 3 — communications integrity

| Item | Detail |
|---|---|
| Sources | [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) |
| Access date | **2026-08-31** |
| Implication | SOC communications require accurate, authorized reporting — UI must not imply distribution without a governed pipeline. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/reports/scheduled` | **RESTRUCTURE** | Dedicated honesty chrome; SCHEDULED REPORTS eyebrow + STAGING CANDIDATE; meta Gallery · Studio · Templates · Compliance; empty-honesty ≠ filter-empty ≠ API error; StatusDock historical; REP-004 stamp-only run. |
| `/dashboards` | **KEEP** (sibling) | Gallery discover — Prompt 31. |
| `/dashboards/studio` | **KEEP** (sibling) | Studio authoring — Prompt 32. |
| `/dashboards/:id` | **KEEP** (sibling) | Runtime panels — Prompt 33 (parallel). |
| `/reports/templates` | **KEEP** (sibling) | Template inventory — Prompt 35 (parallel). |
| `/compliance` | **KEEP** (sibling) | Framework assurance — Prompt 30. |

---

## Next recommended slice

**`/reports/templates`** (Prompt 35) — template inventory honesty, distinct from scheduled delivery and dashboard authoring.
