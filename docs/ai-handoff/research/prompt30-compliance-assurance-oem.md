# Prompt 30 — Compliance Assurance (`/compliance`) OEM research

Retrieved: **2026-08-30**

Purpose: decide inventory-first framework assurance hub IA so **aggregate posture score + per-framework assessment inventory** stays distinct from `/posture/cis-benchmark` (CIS SCA host checks), `/posture/readiness` (MITRE detection coverage), `/posture/vulnerabilities` (CVE findings), and `/reports/scheduled` (scheduled reporting workspace). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 29 `/posture/readiness` — Wave B2 slice 7 (merged @ `2dd17b3` via PR #116).

Base tip: `main` @ `2dd17b3` includes Prompt 29 — `based_on_main_includes_pr29: yes`.

**Wave B2 closure:** this is slice 8 of 8 — final posture & compliance program slice.

Confirmed APIs for this slice (verified in backend source — do **not** invent):

| Endpoint | Backend | UI use |
|---|---|---|
| `GET /api/ha-posture/score` | Aggregate score, passed/failed/total controls, trend | Compact inline stats + projection note |
| `GET /api/ha-posture/frameworks` | Framework inventory rows | Primary AG Grid inventory |

**Auth:** class-level `@PreAuthorize` on `HaPostureResource` — Analyst · SOC Manager · Platform Administrator (USER constant in backend; nav gate is Analyst/SOC Manager/Admin — SOC Analyst omitted).

**Forbidden:** Control-level outcomes, evidence lineage, owners, exceptions (CMP-002/CMP-003 — drawer stays blocked); certification / attestation claims from aggregate scores; CIS SCA or MITRE coverage as compliance evidence; fake framework scores when `lastAssessed` is null.

**Honesty:** Empty HTTP 200 (0 framework rows) ≠ missing contract ≠ API error. Unlike AD/Exposure, the backend contract **exists**. Empty inventory must not claim “compliant.”

**Staging probe label:** `COMPLIANCE-EMPTY-STAGING` when frameworks array is `[]`; otherwise record framework count and assessed count.

---

## A1. Commercial GRC/compliance UX (≥3)

### ServiceNow GRC — Compliance Management

| Item | Detail |
|---|---|
| Sources | [ServiceNow GRC](https://www.servicenow.com/products/grc.html), [Compliance Management](https://docs.servicenow.com/bundle/vancouver-grc/page/product/grc-compliance/concept/c_ComplianceManagement.html) |
| Access date | **2026-08-30** |
| Inventory-first | Operators land on **framework / control inventory** with assessment status and freshness — not a certification badge. Drill from framework into control outcomes when contracts exist; gaps stay visible. |
| Honesty | Compliance posture reflects configured assessments in scope — not legal attestation. Empty or stale assessments are operational signals, not “compliant by default.” |
| Avoid | Hero KPI tiles implying certification; conflating technical scan scores with audit sign-off. |

### RSA Archer — Compliance Program Dashboard

| Item | Detail |
|---|---|
| Sources | [RSA Archer GRC](https://www.archerirm.com/products/archer-grc-platform), [Compliance Management use case](https://www.archerirm.com/solutions/compliance-management) |
| Access date | **2026-08-30** |
| Inventory-first | Program dashboard emphasizes **authorized standards inventory**, assessment state, and evaluation freshness. Control evidence and exceptions are sibling workspaces — not implied from aggregate score alone. |
| Honesty | Aggregate scores summarize technical assessment signals within declared scope — not regulatory certification. |
| Avoid | Presenting a single percentage as attestation; hiding unassessed frameworks behind zero scores. |

### Vanta — Compliance Dashboard

| Item | Detail |
|---|---|
| Sources | [Vanta compliance automation](https://www.vanta.com/products/compliance), [Trust / monitoring UX](https://www.vanta.com/) |
| Access date | **2026-08-30** |
| Inventory-first | Dashboard lists **frameworks and control tests** with pass/fail/pending states and last-checked timestamps. Cross-links to evidence collection and reporting — not a single “compliant” banner. |
| Honesty | Status reflects monitored controls in connected integrations — absence of data is “not yet assessed,” not “pass.” |
| Avoid | CIS host checks or detection coverage presented as framework attestation; inventing control owners when API returns none. |

---

## A2. Open-source borrow patterns (≥3)

### OpenSCAP — Compliance Report

| Item | Detail |
|---|---|
| Sources | [OpenSCAP](https://www.open-scap.org/), [Compliance report guide](https://static.open-scap.org/reports/guide/) |
| Access date | **2026-08-30** |
| Borrow | Framework-centric report: profile, rule results, score as **technical evaluation** — explicit that report ≠ certification. Empty rule set = no evaluation, not full compliance. |
| Avoid | Shipping full SCAP report generation when HiveArmor only projects aggregate score + catalog size. |

### Wazuh — Regulatory Compliance Dashboard

| Item | Detail |
|---|---|
| Sources | [Wazuh compliance](https://documentation.wazuh.com/current/compliance/index.html), [PCI / HIPAA dashboards](https://documentation.wazuh.com/current/user-manual/capabilities/sec-config-assessment/index.html) |
| Access date | **2026-08-30** |
| Borrow | Regulatory framework cards with requirement counts and pass/fail breakdown; drill to SCA checks on sibling surface. Framework dashboard ≠ host SCA inventory on same page. |
| Avoid | Mixing MITRE detection coverage or CVE findings into framework assurance scores. |

### DefectDojo — Engagement Summary

| Item | Detail |
|---|---|
| Sources | [DefectDojo](https://github.com/DefectDojo/django-DefectDojo), [Engagement / test views](https://defectdojo.com/) |
| Access date | **2026-08-30** |
| Borrow | Engagement summary lists tests/findings with status and dates — honest about what was in scope. Blocked workspaces for evidence not yet imported. |
| Avoid | Fabricating control evidence or exception records when CMP contracts are missing. |

---

## A3. Decision table

| Surface | Decision | Rationale |
|---|---|---|
| `/compliance` | **RESTRUCTURE** | Inventory-first framework assurance hub with Wave B2 honesty chrome; title/nav = Compliance; empty-honesty distinct from filter-empty and API error; compact inline stats (not 6-tile hero); projection note replaces trust strip; Link + ROUTES pivots. |
| `/posture/cis-benchmark` | **KEEP** (sibling) | CIS SCA host-file checks (Prompt 28) — meta link. |
| `/posture/readiness` | **KEEP** (sibling) | MITRE detection coverage (Prompt 29) — meta link. |
| `/posture/vulnerabilities` | **KEEP** (sibling) | CVE findings (Prompt 27) — meta link. |
| `/posture/assets` | **KEEP** (sibling) | Asset inventory — meta link. |
| `/dashboard` | **KEEP** (sibling) | Mission Control — meta link. |
| `/reports/scheduled` | **KEEP** (sibling) | Scheduled reporting workspace — meta link. |

---

## Wave B2 program completion

All eight Wave B2 posture & compliance routes now carry honesty chrome:

| Slice | Route | Job |
|---|---|---|
| 1 | `/posture/assets` | Asset inventory |
| 2 | `/posture/identities` | Identity inventory |
| 3 | `/posture/active-directory` | AD posture (missing contract projection) |
| 4 | `/posture/exposure` | Attack-path analysis (missing contract projection) |
| 5 | `/posture/vulnerabilities` | CVE findings |
| 6 | `/posture/cis-benchmark` | CIS SCA host checks |
| 7 | `/posture/readiness` | MITRE detection coverage |
| 8 | `/compliance` | Framework assurance (**this slice — closure**) |
