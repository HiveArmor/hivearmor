# Prompt 10 — Search & Hunt (`/search`) OEM research

Retrieved: **2026-08-27**

Purpose: decide `/search` (legacy `/hunt` redirect) IA so Search & Hunt is **ad-hoc hunt / event search** (query → results → pivot) — clearly distinct from `/queue` (shift triage), `/alerts` (alert inventory), `/correlated-findings` (offense-class grouping), and `/incidents` (owned response cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue; Prompt 07 Alerts; Prompt 08 Correlated Findings; Prompt 09 Incidents.

Base tip: `main` includes Prompt 09 Incidents (`355c3ba` / `0b4c536` lineage) — `based_on_main_includes_pr95: yes`.

---

## A1. Commercial SIEM (≥3)

### Splunk — Search (SPL) + Events / Statistics / Visualization

| Item | Detail |
|---|---|
| Sources | [Basic searches and search results](https://help.splunk.com/en/splunk-enterprise/search/search-tutorial/9.1/part-4-searching-the-tutorial-data/basic-searches-and-search-results), [timechart](https://help.splunk.com/en/splunk-cloud-platform/search/search-reference/10.3.2512/search-commands/timechart) |
| Access date | **2026-08-27** |
| First viewport | Search bar + time range picker are the hero. After run: Events tab is primary — timeline of hits, fields sidebar, dense event list. Statistics / Visualization tabs appear when transforming commands run (not fake chrome). |
| Time picker | Relative presets (Last 15m / 24h / 7d…) + absolute ranges; default drives histogram bin span when span unset. |
| Histogram / timeline | Events timeline is a **real** count-over-time of the active search; click/zoom narrows the time window. |
| Event detail | Expand-in-list or event info column; raw + extracted fields. |
| Save / share / schedule | Save search / report / schedule exist as product features — only wire if APIs exist. |
| Pivot to case | Escalate from notable/finding into investigation/case outside the raw search surface. |

### Elastic Security — Discover / Timeline / ES\|QL (or KQL)

| Item | Detail |
|---|---|
| Sources | [Discover](https://www.elastic.co/docs/explore-analyze/discover), [Timelines](https://www.elastic.co/docs/solutions/security/investigate/timelines-ui), [ES\|QL](https://www.elastic.co/docs/explore-analyze/query-filter/languages/esql) |
| Access date | **2026-08-27** |
| First viewport | Discover: query/KQL bar + time picker + index pattern; results grid/document table dominates. Field browser is a secondary rail (progressive). Timeline is a separate investigation canvas for pinned events. |
| Time picker | Relative + absolute; histogram syncs to selected range. |
| Histogram / timeline | Document count histogram above results when the data view supports it — never invented. |
| Event detail | Document flyout / expanded row with field table + JSON. |
| Save / share | Saved searches / Discover sessions; share links. |
| Pivot to case | Attach events/alerts to Security **cases** from investigation flows — hunt surface remains query-first. |

### Microsoft Sentinel — Logs (KQL) + hunting queries

| Item | Detail |
|---|---|
| Sources | [Kusto Query Language in Azure Monitor / Logs](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/get-started-queries), [Hunting in Microsoft Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/hunting) |
| Access date | **2026-08-27** |
| First viewport | Logs blade: editor (KQL) + time range + Run; results table is the workspace. Hunting page catalogs reusable queries; run opens Logs with the query loaded. |
| Time picker | Explicit time range beside Run; relative windows common for hunts. |
| Histogram / timeline | Charts only when the query (or render) produces series — not a permanent fake strip. |
| Event detail | Row expand / results pane inspect. |
| Save / share | Save query; hunting bookmarks; scheduled analytics are separate from ad-hoc hunt. |
| Pivot to case | Create incident / add to investigation from hunt results when entitlements allow. |

### Optional — Google SecOps / Chronicle UDM Search

UDM Search is query → event table with entity pivots. Reinforces: search is not triage queue; results density and honest empty states matter more than decorative chrome.

---

## A2. Open-source / open-core (≥3)

### OpenSearch Dashboards — Discover / PPL

| Item | Detail |
|---|---|
| Sources | [Discover](https://opensearch.org/docs/latest/dashboards/discover/index-discover/), [Piped Processing Language](https://opensearch.org/docs/latest/search-plugins/sql/ppl/index/) |
| Access date | **2026-08-27** |
| Borrow | Query bar + index/time controls sticky; documents table ≥ half viewport; field sidebar toggleable; histogram only from real aggregations. |
| Avoid | Permanent multi-toolbar stacks that shrink the hit table; claiming stats tabs without transforming queries. |

### Security Onion — Hunt

| Item | Detail |
|---|---|
| Sources | [Hunt](https://docs.securityonion.net/en/2.4/hunt.html) |
| Access date | **2026-08-27** |
| Borrow | Dedicated **Hunt** job (not Alerts); query + filters → events; escalate to Case when ready. Clear product separation from triage. |
| Avoid | Making Hunt look like another Alerts queue; conflating Velociraptor hunts with SIEM event search. |

### Wazuh — Discover / threat hunting views

| Item | Detail |
|---|---|
| Sources | [Threat hunting](https://documentation.wazuh.com/current/user-manual/capabilities/threat-hunting/index.html), [Discover](https://documentation.wazuh.com/current/user-manual/wazuh-dashboard/index.html) |
| Access date | **2026-08-27** |
| Borrow | Discover-style event exploration with filters and time; hunting as investigative workflow over telemetry. |
| Avoid | Fake hit counts; burying empty/error honesty under loading skeletons forever. |

### Optional — Grafana Loki Explore

Query → dense log stream; minimal chrome. Borrow the density bias: after Run, results own the viewport.

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Hunt ≠ triage ≠ inventory ≠ case | Job copy: **ad-hoc hunt / event search**. Cross-link Mission Control · Alerts · Investigations · Incidents — do not re-litigate those pages. |
| Query bar + time range = hero | Sticky query workspace; Run primary; language honesty (KQL live; others unavailable). |
| Results ≥50% viewport after run | Compact secondary chrome (field browser / history / saved) via progressive disclosure; grid flex primary. |
| Histogram only when real | Show distribution only when `/ha-hunts/search` returns histogram buckets; otherwise honesty empty — never invent counts. |
| Event detail flyout | Keep row → flyout/drawer; pivots back into query. |
| Saved queries | Wire **confirmed** `GET/POST/PUT/DELETE /api/ha-saved-queries*` — honesty if empty/fail. Prefer over inventing `/ha-saved-hunts`. |
| NL assist | Confirmed `POST /api/ha-search/nl-query` (question → DSL/explanation). Show provenance/errors; do not invent `/execute`. Extra paths (`nl-to-dsl`, `suggestions`, `timeline`) only if verified live. |
| Promote / escalate | Use existing hunt promotion APIs when present; human role labels on deny; honesty if 403/empty. |
| No schedule/report claim | No hunt schedule UI without confirmed APIs. |

---

## A4. Decision: **RESTRUCTURE**

| Surface | Decision | Rationale |
|---|---|---|
| `/search` (Search & Hunt) | **RESTRUCTURE** | Foundation is strong (Monaco query, AG Grid, flyout, promotion) but identity reads as generic “INVESTIGATION” chrome; saved library points at `/ha-hunts/saved` while contract map + `SavedQueryResource` confirm `/ha-saved-queries`; NL not mounted on page; histogram/StatusDock risk fake density; missing sibling meta links and hunt job sentence. |
| Query vs results split | **KEEP** (tighten) | Sticky query workspace + results workspace already match Splunk/Discover. Compact controls; default field rail closed or secondary; results shell ≥50%. |
| `/hunt` redirect | **KEEP** | Router already redirects; do not invent a second product. |
| Full SIEM QL IDE / schedule | **SPLIT (defer)** | Out of scope — no new language IDE, no fake schedule/report. |

**Not KEEP** as-is: copy, saved-query contract, NL honesty, histogram/StatusDock honesty, missing cross-links.

**Not SPLIT** into new routes: one `/search` hunt console.

---

## Implementation plan (Phase B summary)

1. Job sentence constant: ad-hoc hunt / event search (not triage).
2. Meta links: Mission Control · Alerts · Investigations · Incidents.
3. Query + time hero; progressive disclosure for fields / history / saved / manager / help.
4. Results grid primary; histogram only when buckets present (honesty stub otherwise).
5. Saved queries via `/api/ha-saved-queries*` (list/create/delete); honesty on empty/error.
6. NL via `POST /api/ha-search/nl-query` with backend `{ question, indexPattern? }` — show explanation/error; apply suggested query text when returned.
7. Keep verified hunt execute `POST /api/ha-hunts/search` (exists in backend; not in short contract map — document honestly).
8. Promotion: human role labels on deny/approval copy; no fake success.
9. StatusDock: live EPS only — no fixture fake EPS when claiming live.
10. Staging: real query attempt + API codes; report JSON.
