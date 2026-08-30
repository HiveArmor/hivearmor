# Prompt 27 — Posture Vulnerabilities (`/posture/vulnerabilities`) OEM research

Retrieved: **2026-08-30**

Purpose: decide inventory-first vulnerability findings hub IA so **CVE findings, severity, CISA KEV, affected assets, and read-only remediation guidance** stay distinct from `/posture/assets` (host inventory), `/posture/exposure` (attack-path analysis), `/posture/cis-benchmark` (CIS SCA), and `/compliance` (framework assurance). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 26 `/posture/exposure` — Wave B2 slice 4 (merged @ `f2e96d8` via PR #113).

Base tip: `main` @ `f2e96d8` includes Prompt 26 — `based_on_main_includes_pr26: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-vuln/findings` | Paginated CVE findings | Primary inventory |
| `GET /api/ha-vuln/findings/summary` | Fleet summary | Compact inline stats (critical, high, kevCount, affectedAgents) |
| `GET /api/ha-vuln/findings/{id}` | Finding detail | Drawer |
| `GET /api/ha-vuln/findings/{id}/remediation` | Remediation guidance | Read-only drawer note |
| `GET /api/ha-vuln/remediation-connectors` | Connector catalog | Projection note (not configured list) |
| `POST /api/ha-vuln/findings/{id}/remediation/execute` | Throws unavailable | **Fail-closed** — `VULN_REMEDIATION_EXECUTE_AVAILABLE = false`; no Execute CTA |

**Forbidden:** Fake CVE counts when API returns empty; `/api/v1/threat-intel` as vuln source; Execute/patch job mutations; missing-contract panel when the contract exists but inventory is empty.

**Honesty:** empty inventory (HTTP 200, 0 rows, no filters) ≠ filter-empty ≠ API error. SOC Analyst is **not** in nav — role note is Analyst · SOC Manager · Platform Administrator.

**Staging probe label:** `VULN-EMPTY-STAGING` when findings/summary are empty; otherwise record populated counts.

---

## A1. Commercial vulnerability management (≥3)

### Tenable Vulnerability Management — Findings workbench

| Item | Detail |
|---|---|
| Sources | [Tenable Vulnerability Management](https://www.tenable.com/products/vulnerability-management), [Explore Findings](https://docs.tenable.com/vulnerability-management/Content/Explore/Findings.htm), [Workbenches](https://docs.tenable.com/vulnerability-management/Content/Explore/Workbenches.htm) |
| Access date | **2026-08-30** |
| Inventory-first | Findings (plugin/CVE × asset) are the operational queue — severity, VPR/exploitability, and asset context as columns. Fleet KPI tiles are secondary; operators live in the filtered list. |
| KEV / exploit | Known exploited and plugin exploitability sit as filters and row signals, not a six-tile hero that duplicates grid aggregates. |
| Progressive detail | Row → finding/asset drawer with description, plugin output, and recommended fix — execute is a separate governed workflow. |
| Avoid | Hero KPI strip duplicating summary counts; implying a patch job from a findings list; treating empty scan coverage as a zero-risk score. |

### Rapid7 InsightVM — Vulnerability findings and remediation

| Item | Detail |
|---|---|
| Sources | [InsightVM](https://www.rapid7.com/products/insightvm/), [InsightVM user guide](https://docs.rapid7.com/insightvm/), [Remediation projects](https://docs.rapid7.com/insightvm/working-with-remediation-projects/) |
| Access date | **2026-08-30** |
| Inventory-first | Vulnerability and asset views are coordinated lists with severity, age, and solution columns; remediation projects are a later step, not an inline Execute on every row. |
| Filters | Severity, exploit status, and time windows sit above a dense table. Empty filtered results are distinct from “no assessments yet.” |
| Honesty | Missing scanner coverage is a visibility gap. Do not fabricate finding counts. Solution text is guidance until a verified rescan. |
| Avoid | Conflating VM findings with attack-path graphs; auto-patch CTAs when the connector is not configured. |

### Qualys VMDR — Detection, prioritization, response

| Item | Detail |
|---|---|
| Sources | [Qualys VMDR](https://www.qualys.com/apps/vulnerability-management-detection-response/), [VMDR documentation](https://docs.qualys.com/en/vmdr/latest/get_started/get_started.htm), [TruRisk / prioritization](https://docs.qualys.com/en/vmdr/latest/search/tru_risk.htm) |
| Access date | **2026-08-30** |
| Inventory-first | Detections are the primary surface; TruRisk/KEV-style prioritization is a column and filter, not a dashboard hero that replaces the queue. |
| Asset coupling | Affected hosts remain first-class but host posture inventory is a sibling (Assets). VMDR detections should not become the asset CMDB. |
| Remediation | Patch/response is gated by integration health — list “not configured” connectors instead of inventing a job. |
| Avoid | Empty inventory shown as “secure”; six KPI tiles eating vertical space above the findings grid. |

---

## A2. Open-source borrow patterns (≥3)

### OpenVAS — Findings list

| Item | Detail |
|---|---|
| Sources | [OpenVAS](https://www.openvas.org/), Greenbone/OpenVAS scan result NVTs |
| Access date | **2026-08-30** |
| Borrow | Result inventory: CVE/NVT, severity, host, first/last detection as a filterable table; empty means no results in scope, not “no vulns exist.” |
| Avoid | OpenVAS product chrome as HiveArmor copy; do not imply a live scanner from an empty `/ha-vuln` page. |

### Wazuh — Vulnerability detector

| Item | Detail |
|---|---|
| Sources | [Wazuh vulnerability detection](https://documentation.wazuh.com/current/user-manual/capabilities/vulnerability-detection/index.html), [Vulnerability detection inventory](https://documentation.wazuh.com/current/user-manual/capabilities/vulnerability-detection/how-it-works.html) |
| Access date | **2026-08-30** |
| Borrow | Agent-scoped CVE inventory (package, installed vs fixed, severity) with agent hostname as a first-class column; deep-link from an asset (`?asset=` / agentId). |
| Avoid | Implying Wazuh-specific indexer queries; do not invent EPSS/KEV when the DTO omits them. |

### Greenbone — Report / result table

| Item | Detail |
|---|---|
| Sources | [Greenbone reports](https://docs.greenbone.net/GSM-Manual/gos-22.04/en/reports.html), [Scanning](https://docs.greenbone.net/GSM-Manual/gos-22.04/en/scanning.html) |
| Access date | **2026-08-30** |
| Borrow | Dense results table as the workspace (≥50vh); QoD/severity as row chrome; report empty vs failed scan as distinct states. |
| Avoid | Greenbone dashboard widgets as HiveArmor hero KPIs; do not use threat-intel lookup APIs as the vuln inventory source. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/vulnerabilities` | **RESTRUCTURE** | Inventory-first vuln hub with Wave B2 honesty chrome; demote 6-tile `.vuln-summary` hero; POSTURE eyebrow + STAGING CANDIDATE; meta cross-links via `Link` + `ROUTES`; empty inventory honesty distinct from filter-empty and API error. |
| `/posture/assets` | **KEEP** (sibling) | Host/asset posture inventory (Prompt 23) — meta link; `?asset=` deep-link into findings via `agentId`. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis (Prompt 26) — meta link; not a substitute for CVE findings. |
| `/posture/identities` | **KEEP** (sibling) | Identity inventory (Prompt 24) — meta link. |
| `/posture/cis-benchmark` | **KEEP** (sibling) | CIS SCA checks (Prompt 28) — meta link. |
| `/compliance` | **KEEP** (sibling) | Framework assurance — meta link. |

---

## Next recommended slice

**`/posture/cis-benchmark`** (Prompt 28) — CIS benchmark posture with Wave B2 honesty chrome, distinct from CVE findings inventory and compliance framework assurance.
