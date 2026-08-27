# Prompt 08 — Correlated Findings (`/correlated-findings`) OEM research

Retrieved: **2026-08-27**

Purpose: decide `/correlated-findings` information architecture so it is an **offense-class / correlated-finding workbench** — related signals rolled into one finding — clearly distinct from `/alerts` (raw inventory) and `/incidents` (owned cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue (`prompt06-analyst-queue-oem.md`); Prompt 07 Alerts (`prompt07-alerts-list-oem.md`).

Base tip: `main` includes Prompt 07 Alerts (`d74e90c` / `42e8cfa` lineage) — `based_on_main_includes_pr93: yes`.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — Risk notables / correlation → Incident Review

| Item | Detail |
|---|---|
| Sources | [How to create risk notables](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.2/introduction/how-to-create-risk-notables-using-splunk-enterprise-security), [Analyze risk](https://help.splunk.com/en/splunk-enterprise-security-7/user-guide/7.2/risk-analysis/analyze-risk-in-splunk-enterprise-security), [Run risk incident rules](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.2/identify-threat/run-risk-incident-rules-in-splunk-enterprise-security) |
| Access date | **2026-08-27** |
| Finding vs raw alert | Risk incident rules **aggregate** risk events on a risk object (asset/identity). A **risk notable** is the rolled-up work unit when threshold is crossed — not each contributing detection. Classic notables remain triage tasks; RBA emphasizes correlated behavior over single-rule noise. |
| First viewport | Incident Review / findings queue: filterable notable table as primary surface; urgency/status/owner; optional risk context — not a raw event Discover page. |
| Status + assignment | Assign owner; status/disposition transitions; comments often required. Risk score and risk message carry story context. |
| Related alerts | Drill into contributing risk events / annotations (tactics, messages) under the notable. |
| Promote / escalate | Notable → investigation / Mission Control case workflow; adaptive responses may create tickets — escalation is case-bound, not “open another alert row.” |

### IBM QRadar — Offenses (classic offense queue)

| Item | Detail |
|---|---|
| Sources | [QRadar components / Magistrate](https://www.ibm.com/docs/en/qsip/7.5.0?topic=overview-qradar-components), [GET /siem/offenses](https://ibmsecuritydocs.github.io/qradar_api_16.0/16.0--siem-offenses-GET.html), [POST /siem/offenses/{id}](https://ibmsecuritydocs.github.io/qradar_api_16.0/16.0--siem-offenses-offense_id-POST.html) |
| Access date | **2026-08-27** |
| Finding vs raw alert | An **offense** is the Magistrate-managed correlation unit: CRE matches contribute events/flows into one offense (magnitude, credibility, categories, source/dest counts). Log Activity events remain raw telemetry. |
| First viewport | **Offenses** tab: dense offense list (status OPEN/HIDDEN/CLOSED, assigned_to, severity/magnitude, event_count, last_updated). List is the workbench hero. |
| Status + assignment | Status OPEN → HIDDEN / CLOSED (closing reason required to close); `assigned_to` for ownership. |
| Related alerts | Offense detail exposes contributing events/flows and rules that fired — not a separate “alerts inventory.” |
| Promote / escalate | Offense is already the case-like unit in classic QRadar; external ticketing/SOAR is optional. HiveArmor maps this layer to **Correlated Findings**, then promotes to **Incidents** when case ownership is needed. |

### Microsoft Sentinel / Defender XDR — Incidents as grouped alerts

| Item | Detail |
|---|---|
| Sources | [Relate alerts to incidents](https://learn.microsoft.com/en-us/azure/sentinel/relate-alerts-to-incidents), [Alerts–incidents correlation (Defender)](https://learn.microsoft.com/en-us/defender-xdr/alerts-incidents-correlation), [Automate incident handling](https://learn.microsoft.com/en-us/azure/sentinel/automate-incident-handling-with-automation-rules) |
| Access date | **2026-08-27** |
| Finding vs raw alert | Detection **alerts** are signals. **Incidents** are the correlation/grouping layer: related alerts roll into one incident by proprietary logic (or manual relate). Analysts triage incidents, not every alert. |
| First viewport | Incident queue: status/severity/owner chips + dense list + details pane. Alerts remain available as inventory/deep-dive. |
| Status + assignment | Incident status (New / Active / Resolved…), owner, tags, comments; automation rules for assignment. |
| Related alerts | Incident detail lists linked alerts; expand/relate/remove alerts as investigation unfolds. |
| Promote / escalate | In Sentinel/Defender the incident **is** the escalate unit. HiveArmor splits: correlated finding ≈ intermediate grouping; **Incident** ≈ owned response case (Prompt 09). |

### Optional 4th — Google SecOps / Chronicle case aggregation

Cases aggregate detections/alerts for investigation handoff. Same pattern: do not make the raw alert list the primary “offense” surface. Not required for this decision.

---

## A2. Open-source / open-core (≥3)

### TheHive — Alert → case / observables

| Item | Detail |
|---|---|
| Sources | [thehive4py alert promote / merge](https://thehive-project.github.io/TheHive4py/latest/examples/alert/) |
| Access date | **2026-08-27** |
| Borrow | Explicit **signal → owned case** promote; observables copy with provenance; merge into existing case when overlap exists. |
| Avoid | Treating promote as silent auto-close of inventory; promote without preview/duplicate honesty. |

### Wazuh — Security events aggregation

| Item | Detail |
|---|---|
| Sources | [Searching for alerts (Wazuh Kibana app)](https://wazuh.com/blog/searching-for-alerts-using-the-wazuh-app-for-kibana/), [Wazuh Query Language](https://documentation.wazuh.com/current/user-manual/wazuh-dashboard/queries.html) |
| Access date | **2026-08-27** |
| Borrow | Dense searchable event inventory is **not** the offense workbench — keep inventory on `/alerts`. Rule-level grouping informs filters, not a second alert clone. |
| Avoid | Cloning Discover chrome onto correlated findings; stacking permanent viz rows above the work list. |

### Security Onion — Alerts → Hunt / Cases

| Item | Detail |
|---|---|
| Sources | [Alerts (SO 2.4)](https://docs.securityonion.net/en/2.4/alerts), [Cases (SO 2.4)](https://docs.securityonion.net/en/2.4/cases) |
| Access date | **2026-08-27** |
| Borrow | Clear escalate path from alerts to **Cases**; cases hold events + observables + ownership. Keep Alerts, Hunt, and Cases as distinct jobs. |
| Avoid | Making correlated findings a duplicate of Cases (that is `/incidents`) or of Alerts inventory. |

---

## A3. HiveArmor implication table

| Leader pattern | HiveArmor today (`/correlated-findings`) | Keep / Restructure / Gap |
|---|---|---|
| Offense/finding = rolled-up related signals (not raw alerts) | Copy says “related alerts as one attack story” — good intent; link still says “Alert queue” (wrong job) | **Restructure** job + cross-links |
| Dense list ≥50% viewport (QRadar/Sentinel) | Card feed ~31% + preview ~69%; five KPI tiles + views + toolbar stacked | **Restructure** — list primary; compact controls |
| Status lifecycle + assignment | Workbench shows status; SEC-03 gates live in `findingStatus.capabilities` but list/preview do not mutate via `/api/offenses/{id}/status` | **Restructure** — gate with `canMutateFindingStatus`; human deny labels |
| Related alerts on detail | Workbench Evidence tab uses COR `signals`; `GET /api/offenses/{id}/alerts` exists in `offenses.service` but list page calls `/ha-correlated-findings` | **Restructure** — wire confirmed `/api/offenses*` as primary staging path |
| Promote → incident/case | `FindingPromotionDialog` posts COR promotion paths; may not match staging offense docs | **Gap / honesty** — promote only when contract returns preview; else honest unavailable |
| Distinct from Alerts inventory & Incidents | Overlaps Queue with “Needs review / SLA / Unassigned” views + KPI strip | **Restructure** — scopes for findings, not shift-triage KPIs |
| Legacy `/offenses` redirects | Router `OffenseIdRedirect` present | **Keep** |
| Fixtures excluded from prod | `correlatedFindings.fixture-disabled.ts` | **Keep** |
| No AG Grid on first paint (perf test) | Performance test forbids `SiemDataGrid` on list | **Keep** dense card/list (prompt allows “AG Grid **or** existing dense list”) |
| Human role labels on deny | Capability helpers ready; UI underuses them | **Restructure** |

---

## A4. Explicit decision

**RESTRUCTURE** — with clear **list vs detail SPLIT** of responsibilities:

1. **Identity** — Title “Correlated Findings”; job sentence: offense-class grouping of related alerts into one finding (not raw inventory, not owned incident case). Meta: Mission Control · Analyst Queue · Alerts · Incidents.
2. **List (`/correlated-findings`)** — Primary dense finding list ≥50% viewport; compact status/severity/search filters as APIs allow; remove five-tile Queue-style KPI strip; default broader “All / Open” scopes (not shift SLA chrome).
3. **Data** — Primary staging contract: `GET /api/offenses` (+ `X-Total-Count` when present). Map rows into the existing finding card/DTO projection without inventing endpoints. Keep COR `/api/ha-correlated-findings*` only as optional enrichment / fixture path — never claim COR-001 PRODUCTION READY.
4. **Detail (`/correlated-findings/:id`)** — Workbench: narrative/evidence when projected; **related alerts** from `GET /api/offenses/{id}/alerts` (honest empty if none). Status mutate only via `PUT /api/offenses/{id}/status` when `canMutateFindingStatus`; human deny title otherwise. Promote via confirmed COR promotion only when preview succeeds — else honesty + link to Incidents.
5. **Retain** — Legacy `/offenses` redirects; fixture-disabled production path; SEC-03 `GAP_SEC_03_RESOLVED` honesty; no rewrite of `/alerts` or `/queue`.

Status after implement + staging smoke: **STAGING CANDIDATE** only.
