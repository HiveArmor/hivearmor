# Prompt 12 — Entities (`/entities` + `/entities/:id/dossier`) OEM research

Retrieved: **2026-08-27**

Purpose: decide Entity inventory + risk dossier IA so hosts/users/IPs are **investigation pivots** — find entities by risk/type, open a dossier to understand risk and related alerts/events, then pivot to hunt / investigations / incidents / sensors — clearly distinct from `/search` (ad-hoc hunt), `/investigations` (evidence sessions), and `/incidents` (owned response cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue; Prompt 07 Alerts; Prompt 08 Correlated Findings; Prompt 09 Incidents; Prompt 10 Search & Hunt; Prompt 11 Investigations.

Base tip: `main` includes Prompt 11 Investigations (`87cc44b` merge of #97) — `based_on_main_includes_pr97: yes`.

Confirmed APIs for this slice (do not invent):
- `GET /api/ha-entities`
- `GET /api/ha-entities/{id}`
- `GET /api/ha-entities/{id}/alerts`
- `GET /api/ha-entities/{id}/events`
- `GET /api/ha-entities/{id}/risk`

Canonical detail route remains **dossier** (`/entities/:id` → `/entities/:id/dossier`). Do not revive router-mounted `EntityDetailPage`.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — Asset / Identity investigators + risk objects

| Item | Detail |
|---|---|
| Sources | [Asset and identity investigator dashboards](https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.0/analytics/asset-and-identity-investigator-dashboards), [How risk objects impact risk scores](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.3/create-risk-objects/how-risk-objects-impact-risk-scores-in-splunk-enterprise-security), [Classify risk objects](https://help.splunk.com/en/splunk-enterprise-security-7/risk-based-alerting/7.3/identify-threat/classify-risk-objects-for-targeted-threat-investigation-in-splunk-enterprise-security) |
| Access date | **2026-08-27** |
| Inventory vs dossier | Asset/Identity Investigator is a **per-entity workbench** (swim lanes of auth, malware, notables, risk modifiers). Risk objects (system/user/other) accumulate scores from correlation searches — inventory of risky objects feeds investigation of a single object. |
| Risk presentation | Risk score + modifiers + MITRE annotation charts on risk workbench panels — score is explainable via modifiers, not a decorative gauge alone. |
| Related alerts / events | Swim lanes aggregate notables and category activity over time for the chosen asset/identity. |
| Pivot | Workflow actions from Incident Review / Workbench open risk-as-asset panels; investigators sit beside hunt/notable review, not as a second alert queue. |

### Elastic Security — Host / User / Entity analytics

| Item | Detail |
|---|---|
| Sources | [Entity risk scoring](https://www.elastic.co/guide/en/security/8.19/entity-risk-scoring.html), [View and analyze risk score data](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/view-analyze-risk-score-data), [Turn on risk scoring](https://www.elastic.co/docs/solutions/security/advanced-entity-analytics/turn-on-risk-scoring-engine) |
| Access date | **2026-08-27** |
| Inventory vs dossier | **Entity analytics / Hosts / Users** list risky entities (score, level, criticality, alert counts). Host/user **details** pages expose overview + risk tab — inventory to find, detail to understand. |
| Risk presentation | Normalized 0–100 score with levels (Unknown→Critical); inputs from aggregated alert risk + asset criticality / privileged / watchlist weights. Empty risk when engine off or no alerts — not fabricated charts. |
| Related alerts / events | Alert count columns link into Alerts; detail pages surface contributing risk inputs. |
| Pivot | From entity analytics → Alerts / Hosts / Users details → continue investigation; separate from Cases and Timelines. |

### Microsoft Sentinel — Entity pages / UEBA

| Item | Detail |
|---|---|
| Sources | [Entity pages](https://learn.microsoft.com/en-us/azure/sentinel/entity-pages), [Investigate incidents](https://learn.microsoft.com/en-us/azure/sentinel/investigate-incidents), [UEBA reference](https://learn.microsoft.com/en-us/azure/sentinel/ueba-reference) |
| Access date | **2026-08-27** |
| Inventory vs dossier | Entity behavior search finds entities; **entity page** is the dossier (identity panel + timeline of alerts/bookmarks/activities + behavioral insights). Accessible from incidents, bookmarks, or direct search. |
| Risk presentation | Investigation priority / behavioral insights from UEBA — shown when BehaviorAnalytics data exists; otherwise identity + timeline still usable. |
| Related alerts / events | Center timeline of notable events; insights panel for anomalous behavior. |
| Pivot | Entity page ↔ Logs hunt, incident graph, playbooks (typed). Entity is a pivot, not a case ownership surface. |

### Optional — CrowdStrike / Falcon Identity

Host search + identity risk surfaces reinforce: inventory of hosts/identities with risk, drill to host detail, pivot to detections — not a fake UEBA graph without backend.

---

## A2. Open-source / open-core (≥3)

### Wazuh — Agents / agent details + inventory

| Item | Detail |
|---|---|
| Sources | [System inventory](https://documentation.wazuh.com/current/user-manual/capabilities/system-inventory/index.html), [Listing agents](https://documentation.wazuh.com/current/user-manual/agent/agent-management/listing/listing.html) |
| Access date | **2026-08-27** |
| Borrow | Clear **list → agent detail** path; inventory tabs (OS, packages, processes) only when Syscollector data exists. |
| Avoid | Painting synthetic risk heatmaps when only agent keepalive exists. |

### Security Onion — Hosts / Hunt pivots

| Item | Detail |
|---|---|
| Sources | [Hunt](https://docs.securityonion.net/en/2.4/hunt), [Alerts](https://docs.securityonion.net/en/2.4/alerts.html), [Introduction](https://docs.securityonion.net/en/2.4/introduction.html) |
| Access date | **2026-08-27** |
| Borrow | Value-click pivots from Alerts/Dashboards → Hunt; escalate to Cases. Host/entity values are pivots into hunt, not a second alert inventory. |
| Avoid | Conflating Hunt with Cases; do not treat entity dossier as the owned IR case. |

### TheHive — Observables / case entities

| Item | Detail |
|---|---|
| Sources | [TheHive](https://strangebee.com/thehive/), [thehive4py Case / observables](https://thehive-project.github.io/TheHive4py/latest/examples/case/) |
| Access date | **2026-08-27** |
| Borrow | Observables (IPs, hosts, users) attach to cases; analyzers optional. Entity identity is evidence, case owns response. |
| Avoid | Making entity inventory look like the case list. |

### Optional — OpenSearch Security Analytics

Findings/detectors can group by entity fields when documented — borrow honesty: empty findings stay empty; no decorative relationship constellation without a graph API in this slice.

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Inventory ≠ dossier ≠ hunt ≠ incident | Job copy: **entity inventory / risk pivots**. Cross-link Search · Alerts · Investigations · Incidents · Mission Control · Sensors (hosts) — do not re-litigate those pages. |
| List grid is hero (≥50%) | Drop stacked permanent KPI chrome that invents non-confirmed summary metrics. Compact type/risk/search filters; inventory primary. |
| Risk score with honesty | Show score/level from confirmed detail or `/risk`; if empty/5xx, honesty — no fake baseline sparkline or ATT&CK heat without projection. |
| Related alerts / events | Wire confirmed `.../alerts` and `.../events` with empty/error honesty. Prefer these over unconfirmed `/activity` / `/relationships` for this slice. |
| Canonical dossier route | Keep `/entities/:id/dossier`; `/entities/:id` redirect stays. Do not remount legacy `EntityDetailPage`. |
| Pivot links | Prefill Search safely; Alerts; Investigations; Incidents; Sensors for host entities when applicable. |
| No constellation rewrite | Out of scope — link only if already present elsewhere. |
| Fixture-disabled | Production builds must not receive foundation fixtures. |

---

## A4. Decision: **RESTRUCTURE** (inventory + dossier) — **KEEP** route split

| Surface | Decision | Rationale |
|---|---|---|
| `/entities` (+ `/entities/inventory`) inventory | **RESTRUCTURE** | Today reads as “Entity Intelligence” investigation chrome with permanent summary badges + dense filter toggles. Re-identity as entity inventory / risk pivots; compact type·risk·search; grid ≥50% viewport; sibling meta links. |
| `/entities/:id/dossier` | **RESTRUCTURE** (tighten to confirmed APIs) | Dossier route stays canonical, but current page loads `/dossier` + baseline/techniques/relationships/activity that over-claim vs Prompt 12 confirmed set. Re-wire identity + risk + related alerts/events from confirmed APIs with honesty; remove fake baseline/graph claims. |
| List vs dossier routes | **KEEP split** | Already separate — one PR for coherence. Do not merge into Search or UEBA risk page. |
| `EntityDetailPage` | **KEEP retired** | Router must not remount it (A2-ENT-01). |

**Not KEEP** for inventory/dossier as-is: chrome and unconfirmed dossier panels compete with Search/UEBA and risk fake-completeness claims.

**Not SPLIT** into new products: one PR covering inventory + dossier honesty.

---

## Implementation plan (Phase B summary)

### Inventory IA
1. Job sentence: entity inventory / risk pivots (hosts, users, IPs).
2. Meta links: Mission Control · Search & Hunt · Alerts · Investigations · Incidents · Sensors.
3. Compact Type + Risk + Search (+ optional Clear); demote permanent 5-badge summary strip.
4. Primary grid region `min-height: 50vh`; row open → `/entities/:id/dossier`.
5. Confirmed `GET /api/ha-entities`; summary/facets honesty if partial.

### Dossier IA
1. Identity header from `GET /api/ha-entities/{id}` (honesty on 404/5xx).
2. Risk panel from `GET /api/ha-entities/{id}/risk` and/or detail score — no decorative history when absent.
3. Tabs/panels: Related alerts (`.../alerts`), Events (`.../events`) with empty/5xx honesty.
4. Pivot row: Search (safe prefill), Alerts, Investigations, Incidents, Sensors (hosts).
5. Soften/remove Baseline / ATT&CK / Relationships / fake sparkline unless projected by confirmed APIs.
6. Human role labels on any mutate (incident link) if present.

### Staging UX tests
1. Deploy FE tip; admin open `/entities`.
2. Prefer host matching `EC2AMAZ-8F0Q7DL` / agent id **20** if present in inventory.
3. Open dossier; verify risk/alerts/events or honesty; verify cross-links.
4. Record codes + counts only (no PII dumps) in `prompt12-entities.json`.
