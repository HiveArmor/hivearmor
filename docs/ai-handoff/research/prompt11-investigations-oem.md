# Prompt 11 — Investigations (`/investigations` + `/investigations/:id`) OEM research

Retrieved: **2026-08-27**

Purpose: decide Investigations list + detail IA so sessions are **working investigations / evidence sessions (pre-incident)** — pin artifacts, build narrative, promote to owned incident via INV-012 — clearly distinct from `/search` (ad-hoc hunt), `/alerts` (inventory), and `/incidents` (owned response cases). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue; Prompt 07 Alerts; Prompt 08 Correlated Findings; Prompt 09 Incidents; Prompt 10 Search & Hunt.

Base tip: `main` includes Prompt 10 Search & Hunt (`199148c` merge) — `based_on_main_includes_pr96: yes`.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security / Mission Control — Investigations

| Item | Detail |
|---|---|
| Sources | [Overview of Mission Control](https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.5/mission-control/overview-of-mission-control-in-splunk-enterprise-security), [Investigate an incident (Mission Control)](https://docs.splunk.com/Documentation/MC/latest/Detect/Investigate) |
| Access date | **2026-08-27** |
| Session vs case | Findings land in triage. An **investigation** gathers evidence and response context; closing often yields a dispositioned incident/case. Session = working evidence container; incident = owned response. |
| Pin / add artifacts | Attach findings, notes, files, and response artifacts into the investigation workbench — not a second alert queue. |
| Timeline | Activity / response plan chronology sits beside evidence; not a raw Discover table. |
| Promote / escalate gates | Explicit escalate/promote into incident ownership with human accountability; automation assists, does not silently own. |

### Elastic Security — Timelines → Cases handoff

| Item | Detail |
|---|---|
| Sources | [Timelines](https://www.elastic.co/docs/solutions/security/investigate/timelines-ui), [Security cases](https://www.elastic.co/docs/solutions/security/investigate/security-cases), [Attach objects to cases](https://www.elastic.co/docs/explore-analyze/cases/attach-objects-to-cases) |
| Access date | **2026-08-27** |
| Session vs case | **Timeline** = investigative canvas (pin events/alerts, notes, filters). **Case** = collaborative IR container after escalate/attach. Hunt/Discover stays query-first; Timeline is the pin board. |
| Pin / add artifacts | Pin events and alerts onto Timeline; attach Timeline/alerts/files to a Case. |
| Timeline | First-class chronological pin board with analyst notes. |
| Promote / escalate gates | Create/attach to Case from investigation surfaces — explicit action, not silent conversion of the hunt page. |

### Microsoft Sentinel — Investigation workbench / notebooks patterns

| Item | Detail |
|---|---|
| Sources | [Investigate incidents](https://learn.microsoft.com/en-us/azure/sentinel/investigate-cases), [Hunting](https://learn.microsoft.com/en-us/azure/sentinel/hunting), [Notebooks](https://learn.microsoft.com/en-us/azure/sentinel/notebooks) |
| Access date | **2026-08-27** |
| Session vs case | **Incident** is the owned work unit. Investigation graph / workbench expands entities around an incident; hunting bookmarks / notebooks are pre-case evidence capture. |
| Pin / add artifacts | Bookmarks and notebook outputs preserve hunt evidence before or during incident work. |
| Timeline | Incident timeline + investigation graph; notebooks for deep analysis — separate from Logs hunt. |
| Promote / escalate gates | Create incident / add to investigation from hunt when entitlements allow; ownership stays on the incident. |

### Optional — Google SecOps / Chronicle case workflows

Case creation from hunt/alert pivots reinforces: investigation session collects evidence; case owns response.

---

## A2. Open-source / open-core (≥3)

### TheHive — Case build-up from alerts

| Item | Detail |
|---|---|
| Sources | [TheHive product](https://strangebee.com/thehive/), [thehive4py Case / observables](https://thehive-project.github.io/TheHive4py/latest/examples/case/) |
| Access date | **2026-08-27** |
| Borrow | Explicit **alert → case** promote; case workspace with observables/evidence, tasks, tags; analyzers are opt-in. |
| Avoid | Silent auto-close of source alerts; treating the case list as another alert Discover page. |

### DFIR-IRIS — Investigations / cases

| Item | Detail |
|---|---|
| Sources | [Case management overview](https://deepwiki.com/dfir-iris/iris-web/3-case-management), [IRIS API v2](https://docs.dfir-iris.org/latest/_static/iris_api_reference_v2.0.0.html) |
| Access date | **2026-08-27** |
| Borrow | Case-centric tabs: timeline, IOCs/assets, tasks, notes, evidence; open/closed lifecycle; chronology as first-class surface. |
| Avoid | Making raw log search the primary case identity. |

### Security Onion — Cases

| Item | Detail |
|---|---|
| Sources | [Cases (SOC)](https://docs.securityonion.net/en/2.4/cases.html) |
| Access date | **2026-08-27** |
| Borrow | Escalate from Alerts/Hunt into a **case**; list + assignee/status; attachments/observables/comments as evidence trail. Clear separation: Hunt ≠ Case. |
| Avoid | Velociraptor **hunts ≠ cases**; do not conflate endpoint collect notebooks with SIEM investigation sessions unless already wired. |

### Optional — Velociraptor notebooks

Relevant only as evidence-collection analogy — not a HiveArmor UI goal this prompt. Defer unless APIs exist.

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Session ≠ hunt ≠ incident | Job copy: **working investigation / evidence session (pre-incident)**. Cross-link Search · Alerts · Incidents · Mission Control — do not re-litigate those pages. |
| List grid is hero (≥50%) | Drop stacked permanent KPI chrome + queue-like “Needs decision” views that invent hypothesis metrics. Compact filters; list primary. |
| Pin / unpin artifacts | Wire confirmed `POST/GET/DELETE .../items` with honesty on empty; remove without confirmed API = forbidden. |
| Timeline / narrative | Notes + pinned items + tasks are the live narrative; do not claim structured hypothesis ledgers the session API does not project. |
| Promote gates (INV-012) | UI path = `promotion-preview` → `promote` with `previewToken` + `expectedVersion` + `reason`. Human deny labels (Analyst+). Keep deprecated `convert-to-incident` fail-closed. |
| Tasks | Confirmed `/tasks` may remain as case-task assist — honesty if empty/fail. |
| No constellation rewrite | Graph only if already wired; out of scope. |

---

## A4. Decision: **RESTRUCTURE**

| Surface | Decision | Rationale |
|---|---|---|
| `/investigations` list | **RESTRUCTURE** | Today reads as “Investigation Operations” queue (5 KPI tiles, decision view on non-projected hypothesis counts, phase column). Re-identity as working evidence sessions; compact scope + filters; list ≥50% viewport; sibling meta links. |
| `/investigations/:id` detail | **RESTRUCTURE** (tighten) | INV-012 promote path is already wired — keep and polish. Remove decorative phase rail; make artifacts pin/unpin honest; soften hypotheses/knowledge claims; add human promote deny labels + sibling cross-links. |
| List vs detail routes | **KEEP split** | Already separate — one PR for coherence. Do not merge into hunt or incidents. |

**Not KEEP** for the list as-is: chrome and copy compete with `/queue` and bury the evidence-session job.

**Not SPLIT** into new products: one PR covering list + detail + promote honesty.

---

## Implementation plan (Phase B summary)

### List IA
1. Job sentence: working investigation / evidence session (pre-incident).
2. Compact header + meta links (Mission Control · Search & Hunt · Alerts · Incidents).
3. Drop permanent 5-tile KPI strip; drop “Needs decision” view tied to non-API hypothesis counts.
4. Compact scope: Active · Mine · Promoted · Closed · All + status/search filters.
5. Primary list ≥50% viewport; honest columns (name, items, owner, updated, status — no fake phase/hypothesis).
6. Create session via confirmed POST; fixture banner only in fixture mode.

### Detail IA
1. Header: session identity + cross-links + Promote / Open incident.
2. Remove decorative INVESTIGATION PATH phase rail.
3. Artifacts tab: list + pin note + unpin via DELETE items; honesty empty.
4. Workspace: objective from description; tasks via confirmed `/tasks`; hypothesis/technique cards honesty-only.
5. Promote modal: preview → reason → promote; map 403 to human role labels; never call convert UI path.
6. Staging: list/detail/items/preview/promote codes; report JSON; gates.
