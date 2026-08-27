# Prompt 09 — Incidents (`/incidents`) OEM research

Retrieved: **2026-08-27**

Purpose: decide `/incidents` list + `/incidents/:id` detail IA so Incidents are **owned response cases** (SLA, assignment, evidence, timeline) — clearly distinct from `/queue` (shift triage), `/alerts` (inventory), and `/correlated-findings` (offense-class grouping). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue; Prompt 07 Alerts; Prompt 08 Correlated Findings.

Base tip: `main` includes Prompt 08 Correlated Findings (`412aaf5` / `bbc4831` lineage) — `based_on_main_includes_pr94: yes`.

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security / Mission Control — Investigations vs findings

| Item | Detail |
|---|---|
| Sources | [Overview of Mission Control](https://help.splunk.com/en/splunk-enterprise-security-8/user-guide/8.5/mission-control/overview-of-mission-control-in-splunk-enterprise-security), [Investigate an incident (Mission Control)](https://docs.splunk.com/Documentation/MC/latest/Detect/Investigate), [Triage incidents — Incident review](https://docs.splunk.com/Documentation/MC/latest/Detect/IncidentReview) |
| Access date | **2026-08-27** |
| Case vs alert/offense | Detections produce **findings** in the analyst queue. An **investigation** is a structured case for gathering evidence and remediating — built from one or more findings. Findings triage; investigations own response. |
| List first viewport | Incident review / investigations queue: dense table (newest first), filters for owner/status/urgency/type, time range; side preview then full details. Grid is the hero. |
| Detail workbench | Info side panel; notes & files; response plan phases/tasks; Automation tab for playbooks/actions; disposition at close (true/benign/false/undetermined). |
| Status / priority / assignment | Assign owner; update status while working; disposition on conclusion; response templates standardize phases. |
| AI assist | Assistive enrichment / automation results — not silent ownership or status mutation. |

### Microsoft Sentinel — Incident queue + details

| Item | Detail |
|---|---|
| Sources | [Manage incidents (ownership, status, severity)](https://learn.microsoft.com/en-us/training/modules/incident-management-sentinel/5-manage-incidents), [Automate incident handling](https://learn.microsoft.com/en-us/azure/sentinel/automate-incident-handling-with-automation-rules), [Incidents REST (owner/status)](https://learn.microsoft.com/en-us/rest/api/securityinsights/incidents/get?view=rest-securityinsights-2025-09-01) |
| Access date | **2026-08-27** |
| Case vs alert/offense | **Alerts** are detection signals. **Incidents** group related alerts into the owned work unit: owner, New → Active → Closed, severity, classification on close. |
| List first viewport | Incidents queue: status / severity / owner filters; dense list; details pane then full incident page. |
| Detail workbench | Full details: related alerts, entities, timeline/activity, comments/tasks; ownership + status + severity in header. |
| Status / priority / assignment | New → Active while investigating; Closed requires classification (true/benign/false/undetermined). Owner is accountable for investigation. |
| AI assist | Automation rules / playbooks assist triage; human remains accountable for close classification. |

### Elastic Security — Cases

| Item | Detail |
|---|---|
| Sources | [Security cases](https://www.elastic.co/docs/solutions/security/investigate/security-cases), [Attach objects to cases](https://www.elastic.co/docs/explore-analyze/cases/attach-objects-to-cases), [Automate security ops → cases](https://www.elastic.co/docs/explore-analyze/workflows/use-cases/security/automate-security-operations) |
| Access date | **2026-08-27** |
| Case vs alert/offense | Detection **alerts** remain inventory. A **case** is the collaborative IR container: assignees, status/severity, comments, attachments (alerts, events, timelines, observables, files). |
| List first viewport | Cases list with metrics; filters for status/severity/assignees; create or attach from alerts. |
| Detail workbench | Activity + Attachments (alerts, events, timelines, entities, files); closing reason when closing; case metrics. |
| Status / priority / assignment | Assign reviewers; set status/severity; close with reason; attach evidence without mutating raw alert inventory semantics. |
| AI assist | Workflow AI steps may summarize/enrich; case mutations remain explicit steps with provenance. |

### Optional — ServiceNow SecOps / XSOAR

Case/ticket lifecycle (assignment, SLA, work notes, evidence) mirrors owned-response UX. Only used as pattern confirmation: incidents are cases, not another alert grid.

---

## A2. Open-source / open-core (≥3)

### TheHive — Case management

| Item | Detail |
|---|---|
| Sources | [TheHive product (case lifecycle)](https://strangebee.com/thehive/), [thehive4py Case / observables](https://thehive-project.github.io/TheHive4py/latest/examples/case/) |
| Access date | **2026-08-27** |
| Borrow | Explicit **alert → case** promote; case as collaborative workspace with tasks, observables/evidence, tags/IOCs; analyzers/responders are opt-in actions. |
| Avoid | Silent auto-close of source alerts; conflating observable enrichment UI with the case list itself. |

### DFIR-IRIS — Incident response cases

| Item | Detail |
|---|---|
| Sources | [Case management overview](https://deepwiki.com/dfir-iris/iris-web/3-case-management), [IRIS API v2 (timeline, evidence)](https://docs.dfir-iris.org/latest/_static/iris_api_reference_v2.0.0.html) |
| Access date | **2026-08-27** |
| Borrow | Case-centric tabs: timeline, assets/IOCs, tasks, notes, evidence files; open/closed lifecycle; chronology as first-class investigation surface. |
| Avoid | Treating hunts or raw log search as the primary case identity. |

### Security Onion — Cases

| Item | Detail |
|---|---|
| Sources | [Cases (SOC)](https://docs.securityonion.net/en/2.4/cases.html) |
| Access date | **2026-08-27** |
| Borrow | Escalate from Alerts/Hunt into a **case**; list overview + assignee/status/severity/priority; attachments + observables + comments as evidence trail. |
| Avoid | Making the case list look like another Alerts Discover page; Velociraptor **hunts ≠ cases** — do not conflate. |

---

## A3. Implication table

| OEM pattern | HiveArmor implication |
|---|---|
| Case ≠ alert ≠ offense | Keep product copy: Queue = triage; Alerts = inventory; Correlated Findings = offense grouping; **Incidents = owned cases**. |
| List grid is hero (≥50%) | Drop stacked permanent KPI chrome that crowds the incident grid (current 6-tile summary + views + toolbar). |
| Filters: status / priority / owner / search | Compact strip above grid; assignee via API filters (`incidentAssignedTo` / unassigned). |
| Detail: header owns status/priority/assignee/SLA | Keep `IncidentHeader`; reinforce SLA chip; human role deny labels. |
| Tabs: timeline, evidence, linked alerts, notes, response | Keep tabbed workbench; wire confirmed `/api/ha-incidents*` paths; honesty for empty/404 extended panels (tasks/activity/similar when unavailable). |
| AI summary assistive only | Show provenance / “does not mutate case”; never silent status/priority write from AI. |
| Cross-links to sibling surfaces | Mission Control · Queue · Alerts · Correlated Findings (mirror Prompt 07/08 meta row). |

---

## A4. Decision: **RESTRUCTURE**

| Surface | Decision | Rationale |
|---|---|---|
| `/incidents` list | **RESTRUCTURE** | Today reads as a second “Incident Command” queue (COMMAND mark, 6 KPI tiles, queue-like views, status labels “Completed/Merged”). Re-identity as owned response cases; compact filters; grid-primary; sibling cross-links. |
| `/incidents/:id` detail | **KEEP** (tighten) | Tabbed workbench + header already match Sentinel/Elastic/TheHive case pattern. Remove decorative phase rail / hardcoded “investigation focus” advice cards; strengthen honesty on non-confirmed or empty panels; AI assist provenance banner at usage site. |
| List vs detail routes | **KEEP split** | Already separate routes — do not merge into one queue+drawer-only product. Drawer preview may remain as optional triage aid. |

**Not KEEP** for the list as-is: chrome and copy compete with `/queue` and bury SLA/ownership job.

**Not SPLIT** into new products: one PR covering list + detail coherence.

---

## Implementation plan (Phase B summary)

### List IA
1. Job sentence constant: owned response cases (SLA, assignment, priority).
2. Compact header + meta links (Mission Control, Queue, Alerts, Correlated Findings).
3. Collapse permanent 6-tile strip → compact SLA / active chips tied to `GET /api/ha-incidents/sla-stats` + bounded summary counts.
4. Filters: status, priority, assignee scope (mine/unassigned), search — APIs via existing criteria adapter.
5. AG Grid primary (≥50% viewport); fixture-disabled production path.

### Detail workbench
1. Keep tabs: Overview, Timeline, Evidence, Linked alerts, Notes; retain Events/Tasks/Response/Activity with honest empty/unavailable when endpoints fail.
2. Live confirmed: detail, timeline, entities, evidence-items, change-status, priority, ai-summary, sla-stats; linked alerts via `GET /api/ha-alerts?incidentId=`.
3. Role gates: mutate Analyst+; create-from-alerts SOC Manager / Platform Administrator — human deny titles.
4. AI: assistive banner in overview slot — no silent mutate.

### Staging UX tests
Admin smoke `/incidents` → open `/incidents/{id}`; filters; timeline/evidence honesty; cross-links; HTTP codes only for Phase D.
