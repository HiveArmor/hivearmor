# Prompt 35 — Report Templates (`/reports/templates`) OEM research

Retrieved: **2026-08-31**

Purpose: decide report-templates inventory honesty so **reusable SOC communication definitions** stay distinct from `/dashboards/studio` (dashboard authoring), `/reports/scheduled` (schedule delivery ops), and gallery/runtime dashboard surfaces. Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 32 `/dashboards/studio` honesty — Wave C1 slice 2 (merged @ `4808ef4` via PR #140). Sibling slices 3–4 run in parallel on `/dashboards/:id` and `/reports/scheduled`.

Base tip: `main` @ `4808ef4` includes Prompt 31 + 32 — `based_on_main_includes_pr32: yes`.

Confirmed APIs / contracts for this slice (verified — do **not** invent):

| Endpoint / contract | Backend | UI use |
|---|---|---|
| `GET /api/ha-reports?repType=TEMPLATE` | Legacy `UtmReport` TEMPLATE rows (seeded) | Templates inventory list |
| `GET/POST/PUT/DELETE /api/ha-reports/templates` | **Not shipped** (GAP-BE-09) | Fail-closed create/edit |
| Governed generation / distribute | **Not shipped** (REP) | Fail-closed Generate — no fake success |

**Forbidden:** Toast “report generated”; fictional Northwind/Contoso tenants; production fixture import; inventing `/api/ha-reports/templates` CRUD; merging Studio authoring or schedule ops into templates inventory.

---

## A1. Commercial reporting / template UX (≥3)

### Splunk reporting — schedule vs definition

| Item | Detail |
|---|---|
| Sources | [Splunk report scheduling](https://docs.splunk.com/Documentation/Splunk/latest/Report/Schedulereports) |
| Access date | **2026-08-31** |
| Borrow | Report definitions/templates stay separate from schedule delivery and run history. |
| Avoid | Treating a definition list as proof of successful generation or delivery. |

### Microsoft Sentinel workbooks / reporting — parameters without fake tenants

| Item | Detail |
|---|---|
| Sources | [Azure Monitor workbooks overview](https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-overview) |
| Access date | **2026-08-31** |
| Borrow | Shared parameters and templates drive queries; decorative tenant chrome misleads. |
| Avoid | Fictional Contoso/Northwind scopes when the API does not return tenant scope. |

### ServiceNow SecOps — communications integrity

| Item | Detail |
|---|---|
| Sources | [ServiceNow Security Incident Response](https://www.servicenow.com/products/security-incident-response.html) |
| Access date | **2026-08-31** |
| Borrow | Template/catalog inventory ≠ authorized distribute; approval gates remain explicit. |
| Avoid | Claiming generation success from an inventory browse action. |

---

## A2. Open-source / standards borrow (≥2)

### Grafana reporting / dashboard export honesty

| Item | Detail |
|---|---|
| Sources | [Grafana reporting](https://grafana.com/docs/grafana/latest/dashboards/create-reports/) |
| Access date | **2026-08-31** |
| Borrow | Report generation is a distinct contract from dashboard authoring and from schedule configuration. |
| Avoid | Implying PDF/email success when only template metadata is listed. |

### NIST SP 800-61 Rev. 3 — communications integrity

| Item | Detail |
|---|---|
| Sources | [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) |
| Access date | **2026-08-31** |
| Implication | SOC communications integrity requires governed generation, approval, and distribution — template inventory alone is not that pipeline. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/reports/templates` | **RESTRUCTURE** | Dedicated inventory honesty chrome: job sentence, STAGING CANDIDATE, Link+ROUTES meta, empty≠error, fail-closed create/generate; StatusDock historical. |
| `/reports/scheduled` | **KEEP** (sibling Prompt 34) | Schedule delivery ops — do not edit in this slice. |
| `/dashboards/:id` | **KEEP** (sibling Prompt 33) | Runtime panels — do not edit in this slice. |
| `/dashboards/studio` | **KEEP** | Dashboard authoring — meta link only. |
| `/compliance` | **KEEP** | Framework assurance — meta link. |

---

## Next recommended slice

Wave C1 closes when Prompt 33 (`/dashboards/:id`) and Prompt 34 (`/reports/scheduled`) also land as STAGING CANDIDATE. This slice (35) alone does **not** close the wave.
