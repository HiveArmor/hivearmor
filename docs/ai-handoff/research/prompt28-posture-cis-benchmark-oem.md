# Prompt 28 — Posture CIS Benchmark (`/posture/cis-benchmark`) OEM research

Retrieved: **2026-08-30**

Purpose: decide inventory-first CIS SCA hub IA so **host-file assessment checks, pass/fail/error outcomes, and observed packs** stay distinct from `/posture/vulnerabilities` (CVE findings), `/posture/assets` (host inventory), `/compliance` (framework assurance), `/posture/readiness` (detection coverage / MITRE), and `/posture/exposure` (attack-path analysis). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 27 `/posture/vulnerabilities` — Wave B2 slice 5 (merged @ `758e7fd` via PR #114).

Base tip: `main` @ `758e7fd` includes Prompt 27 — `based_on_main_includes_pr27: yes`.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-cis/results` | Paginated SCA checks | Primary inventory |
| `GET /api/ha-cis/results/summary` | Per-agent/pack pass/fail/error counts | Compact inline stats (failed, errors, pass rate **only if denominator > 0**) |
| `GET /api/ha-cis/results/{id}` | Check detail | Drawer |
| `GET /api/ha-cis/catalog` | Observed pack catalog | Compact catalog / projection note — **not** official CIS applicability |
| `GET /api/ha-cis/results/agent/{agentId}` | Agent-scoped results | Optional pivot (not a second hero) |
| `POST /api/ha-cis/actions/preview` and `POST /api/ha-cis/actions` | Throw `CIS_MUTATION_UNAVAILABLE` | **Fail-closed** — `CIS_MUTATION_AVAILABLE = false`; no preview/execute CTA |

**Forbidden:** Official CIS recommendation text / licensed catalog claims; fake pass rates when summary is empty or errors dominate; CVE findings from `/api/ha-vuln` as CIS checks; live mutation CTAs; missing-contract panel when the contract exists but inventory is empty.

**Honesty:** Empty HTTP 200 ≠ missing contract ≠ API error. Default filter is `status === 'FAIL'` (priority view). Empty with **no extra filters beyond default FAIL** is **priority-view empty**, distinct from **all-outcomes truly empty** and **filter-empty**. SOC Analyst is **not** in nav — role note is Analyst · SOC Manager · Platform Administrator.

**Staging probe label:** `CIS-EMPTY-STAGING` when results/summary are empty; otherwise record populated counts. Official CIS `LICENSE_REQUIRED_NOT_SHIPPED` is honesty, not a product defect.

---

## A1. Commercial CIS / benchmark UX (≥3)

### CIS-CAT Pro Dashboard — assessment results list

| Item | Detail |
|---|---|
| Sources | [About Dashboard](https://ciscat-pro-dashboard.docs.cisecurity.org/en/latest/source/About%20Dashboard/), [Dashboard User’s Guide](https://ciscat-pro-dashboard.docs.cisecurity.org/en/latest/source/Dashboard%20User%27s%20Guide/), [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks) |
| Access date | **2026-08-30** |
| Inventory-first | Operators search and open **assessment results** (target × benchmark) rather than living in a six-tile score hero. High-level graphs exist, but drill-down lands on the individual result list aligned with the assessor report order. |
| License honesty | CIS-CAT Pro and official benchmark text are SecureSuite / licensed content. HiveArmor must not copy recommendation wording or claim an official CIS catalog when packs are observed host-file checks. |
| Avoid | Treating a dashboard average as a compliance attestation; implying HiveArmor ships CIS-CAT Pro content. |

### Tenable — CIS Benchmarks / host audit findings

| Item | Detail |
|---|---|
| Sources | [Host Audit Filters](https://docs.tenable.com/vulnerability-management/Content/Explore/host-audit-filters.htm), [Benchmarks (host audit)](https://docs.tenable.com/cyber-exposure-studies/host-audit-data/Content/benchmarks.htm), [Generate Host Audit Reports](https://docs.tenable.com/vulnerability-management/Content/Explore/generate-host-audit-reports.htm) |
| Access date | **2026-08-30** |
| Inventory-first | CIS (and STIG) results sit on a **Host Audits / Findings** workbench: check result, benchmark identity, asset, filters for pass/fail/manual. Failed checks are the operational queue; pass-rate reports are secondary. |
| Outcome honesty | Pass / fail / manual (needs human verification) stay distinct. Manual is not “failed” and not a silent pass. Collection/unknown states should stay visible. |
| Avoid | Mixing CVE plugin findings with CIS audit checks; a 6-tile KPI strip that duplicates the grid; inventing a pass rate with no eligible denominator. |

### Qualys Policy Compliance — control posture

| Item | Detail |
|---|---|
| Sources | [Viewing Compliance by Control](https://docs.qualys.com/en/pa/latest/compliance_posture/controls_and_assets_view.htm), [CIS Data-Driven Report](https://docs.qualys.com/en/pa/latest/report/cic_report_for_cis_policies.htm), [PC Get Started](https://docs.qualys.com/en/pcui/1.3.0.0/get_started/get_started.htm) |
| Access date | **2026-08-30** |
| Inventory-first | Control instances (PASS/FAIL) with **expected vs actual evidence** in the drawer; failed controls are prioritized. Framework/CIS mapping reports are a sibling, not the SCA queue. |
| License / mapping | Official CIS-aligned scoring often requires licensed policy content and control-chaining. HiveArmor observed packs must not be labeled as that licensed mapping. |
| Avoid | One-click ungoverned remediations; presenting empty SCA coverage as “secure configuration”; conflating Policy Compliance scores with CVE VMDR findings. |

---

## A2. Open-source borrow patterns (≥3)

### OpenSCAP / SCAP Workbench — OVAL / XCCDF results

| Item | Detail |
|---|---|
| Sources | [SCAP Workbench](https://www.open-scap.org/tools/scap-workbench/), [SCAP Workbench user manual](https://static.open-scap.org/scap-workbench-1.1/), [Getting started](https://www.open-scap.org/getting-started/) |
| Access date | **2026-08-30** |
| Borrow | Result table: rule/check id, pass/fail/error/notapplicable, observed vs expected; empty evaluation means no results in that run, not a hardened estate. Error is unknown, not fail. |
| Avoid | Copying SCAP HTML chrome; implying official CIS XCCDF content is licensed in HiveArmor. |

### Wazuh SCA dashboard

| Item | Detail |
|---|---|
| Sources | [Wazuh SCA how it works](https://documentation.wazuh.com/current/user-manual/capabilities/sec-config-assessment/how-it-works.html), [SCA capability](https://documentation.wazuh.com/current/user-manual/capabilities/sec-config-assessment/index.html) |
| Access date | **2026-08-30** |
| Borrow | Agent-scoped SCA inventory: check id, title, status, policy/pack, hostname; default attention on **failed** checks; expand row for observed command/file evidence. Empty failed queue ≠ no checks exist — switch to all outcomes. |
| Avoid | Claiming Wazuh CIS YAML packs as HiveArmor’s official CIS license; auto-remediate CTAs. |

### Lynis — report table

| Item | Detail |
|---|---|
| Sources | [Lynis](https://cisofy.com/lynis/), Lynis hardening-index / suggestion tables (CLI HTML report) |
| Access date | **2026-08-30** |
| Borrow | Dense suggestion/finding table as the workspace; warnings vs suggestions vs passed tests as separate statuses; a score is a technical index with a documented denominator, not a compliance stamp. |
| Avoid | Lynis branding; inventing a fleet index when the summary API is empty or error-dominated. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/posture/cis-benchmark` | **RESTRUCTURE** | Inventory-first CIS SCA hub with Wave B2 honesty chrome; demote 6-tile `.cis-summary` hero; POSTURE eyebrow + STAGING CANDIDATE; meta cross-links via `Link` + `ROUTES`; default FAIL priority view; empty-honesty distinct from filter-empty and API error. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | CVE findings inventory (Prompt 27) — meta link; not CIS checks. |
| `/posture/assets` | **KEEP** (sibling) | Host/asset posture inventory (Prompt 23) — meta link. |
| `/compliance` | **KEEP** (sibling) | Framework assurance (Prompt 30) — meta link. |
| `/posture/readiness` | **KEEP** (sibling) | Detection coverage / MITRE (Prompt 29) — meta link; add `ROUTES.READINESS` if missing. |
| `/posture/exposure` | **KEEP** (sibling) | Attack-path analysis (Prompt 26) — meta link. |

---

## Next recommended slice

**`/posture/readiness`** (Prompt 29) — detection coverage / MITRE readiness with Wave B2 honesty chrome, distinct from CIS SCA checks and compliance framework assurance.
