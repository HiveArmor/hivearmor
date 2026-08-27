# Prompt 07 — Alerts List (`/alerts`) OEM research

Retrieved: **2026-08-27**

Purpose: decide `/alerts` information architecture so it is a **full alert inventory / notables search**, clearly distinct from `/queue` (shift triage). Paraphrase only. Product claim stays **STAGING CANDIDATE**.

Prior: Prompt 06 Queue research (`prompt06-analyst-queue-oem.md`); Wave A1 (`autonomous-soc-command-triage.md`).

---

## A1. Commercial SIEM (≥3)

### Splunk Enterprise Security — Incident Review / notables

| Item | Detail |
|---|---|
| Sources | [Triage notables on Incident Review](https://help.splunk.com/en/splunk-enterprise-security-7/user-guide/7.3/incident-review/triage-notables-on-incident-review-in-splunk-enterprise-security), [Customize Incident Review](https://help.splunk.com/en/splunk-enterprise-security-7/administer/7.3/incident-review-and-investigations/customize-incident-review-in-splunk-enterprise-security) |
| Access date | **2026-08-27** |
| Primary job | Review and disposition **notable events** — sort/filter by urgency, status, owner, domain; assign; update status; dispositions; saved views. |
| First viewport | Time + filter/search + notables table as the work surface; optional saved views; refresh; column customization. Charts are not the hero. |
| Row / bulk | Per-notable edit + multi-select dispositions; assign owner; status transitions; comments often required. |
| Detail drill-down | Expand/row detail on Incident Review; deeper investigation elsewhere (Mission Control / investigations). |
| vs queue | ES 8 Mission Control **Analyst Queue** focuses findings/investigations for shift workflow; classic Incident Review remains the broad notables inventory with filters and saved views. |

### Elastic Security — Alerts table + details flyout

| Item | Detail |
|---|---|
| Sources | [Manage detection alerts](https://www.elastic.co/docs/solutions/security/detect-and-alert/manage-detection-alerts), [View detection alert details](https://www.elastic.co/docs/solutions/security/detect-and-alert/view-detection-alert-details) |
| Access date | **2026-08-27** |
| Primary job | **Alerts page** is the hub to filter, trend, change status, add to cases, and investigate detection alerts (full inventory of detections). |
| First viewport | Status + severity (+ assignee/host) filters; time picker; KQL search; optional trend charts (collapsible); dense Alerts table ≥ majority of viewport. |
| Row / bulk | Row “more actions”; selection → “Selected x” bulk status / workflow / case. |
| Detail drill-down | **Details flyout** over the table (resize, Overview/Table/JSON); full page/timeline secondary. |
| vs queue | Cases / attack chains are separate surfaces; Alerts remains searchable inventory, not a shift-only open workbench. |

### Microsoft Sentinel / Defender XDR — Alerts vs Incidents

| Item | Detail |
|---|---|
| Sources | [SOC migration processes](https://learn.microsoft.com/en-us/azure/sentinel/migration-security-operations-center-processes), [Navigate and triage incidents](https://learn.microsoft.com/en-us/azure/sentinel/incident-navigate-triage), [Defender incident queue](https://learn.microsoft.com/en-us/defender-xdr/incident-queue) |
| Access date | **2026-08-27** |
| Primary job | Shift work centers on the **incident queue** (grouped related alerts). Raw **alerts** remain available for deeper dive and inventory. |
| First viewport (queue) | Filter chip bar (status, severity, owner); dense list; details pane. Default New + In progress. |
| Row / bulk | Assign, status, tags, comments; manage selected. |
| Detail drill-down | Side details pane + investigation graph / entities. |
| vs queue | Explicit product split: **queue = triage units of work**; **alerts = contributing signals / inventory**. HiveArmor maps Queue→shift triage, `/alerts`→signal inventory. |

### Optional 4th — Security Onion Alerts (also OSS)

Covered under A2; commercial Falcon/Chronicle patterns align with “inventory table + pivot to hunt/case” and are not required for this decision.

---

## A2. Open-source / open-core (≥3)

### Wazuh — Security Events / Alerts

| Item | Detail |
|---|---|
| Sources | [Searching for alerts (Wazuh Kibana app)](https://wazuh.com/blog/searching-for-alerts-using-the-wazuh-app-for-kibana/), [Wazuh Query Language](https://documentation.wazuh.com/current/user-manual/wazuh-dashboard/queries.html) |
| Access date | **2026-08-27** |
| Borrow | Discover-style inventory: search bar, time range, field columns, filter-for / filter-out on cell values, dashboards as optional overlays. |
| Avoid | Stacking many permanent visualization rows above the events table (hurts density); forcing rebuild of filters without chip dismiss. |

### TheHive — Alert → case workflow

| Item | Detail |
|---|---|
| Sources | [thehive4py alert promote / merge](https://thehive-project.github.io/TheHive4py/latest/examples/alert/) |
| Access date | **2026-08-27** |
| Borrow | Clear **inventory → promote/merge to case** path; alerts are signals, cases are owned work. |
| Avoid | Making the inventory page the only triage workbench; promote without audit/role gates. |

### Security Onion — Alerts + Hunt

| Item | Detail |
|---|---|
| Sources | [Alerts (SO 2.4)](https://docs.securityonion.net/en/2.4/alerts), [Hunt](https://docs.securityonion.net/en/2.4/hunt) |
| Access date | **2026-08-27** |
| Borrow | Alerts overview with query bar, drill-down, escalate to Cases; **pivot to Hunt** for broader search; keep Alerts distinct from Hunt. |
| Avoid | Defaulting to heavy advanced dashboard chrome; hiding the path to shift triage / cases. |

---

## A3. HiveArmor implication table

| Pattern from leaders | HiveArmor today (`/alerts`) | Keep / Restructure / Gap |
|---|---|---|
| Grid is primary (≥50% viewport) | AG Grid infinite + drawer | **Keep** |
| Compact filters above grid (severity/status/time/search) | Metrics strip + view strip + query toolbar (stacked) | **Restructure** — one compact strip |
| Inventory default = broad status / history | Defaults to “Needs triage” (`status: active`) — overlaps Queue | **Restructure** — default All; Queue owns open+in_progress |
| Job sentence distinguishes queue vs inventory | Copy: “Prioritize… without losing queue context” (sounds like Queue) | **Restructure** |
| Cross-links to queue / incidents / home | Only Severity board link | **Restructure** — Queue, Incidents, Mission Control |
| Flyout detail + full investigation | Drawer + dbl-click `/alerts/:id` | **Keep** |
| Bulk status/notes/tags/promote | Selection bar + real `/api/ha-alerts/*` | **Keep** (inventory may still disposition) |
| Shared columns / severity helpers | `alertColumns`, `@/lib/severity` | **Keep** |
| Live/historical honesty | LiveModeToggle + StatusDock | **Keep** |
| Human role labels on deny | Assign title uses “SOC Manager”; triage buttons lack deny title | **Polish** |
| KPI triage tiles (SLA/unassigned) | Five metric buttons | **Move intent to Queue** — remove from `/alerts` chrome |
| Saved views | Built-in triage views (My priority, SLA risk…) | **Restructure** — inventory scopes (All / Open / Closed / Critical) |
| Summary/KPI API completeness | `fetchAlertQueueSummary` may be partial | **Gap** — honesty if summary missing; do not fake |

---

## A4. Explicit decision

**RESTRUCTURE** — concrete layout changes for `/alerts`:

1. **Identity** — Title “Alerts”; job sentence: full inventory / notables search; meta links: Mission Control · Analyst Queue · Incidents · Severity board.
2. **Remove** the five-tile priority metrics strip (Queue owns shift pressure KPIs).
3. **Default filters** — empty / All alerts (not Needs triage). Inventory scopes: All · Open · In review · Closed · Critical.
4. **Single compact control strip** — Severity + Status selects + search + Live/Historical + time (historical) + columns/density/refresh; dismissible filter chips; no second permanent toolbar.
5. **Primary surface** — AG Grid ≥50% viewport; row click → drawer; dbl-click → `/alerts/:id`.
6. **Retain** selection bulk actions, StatusDock honesty, shared `alertColumns`, confirmed `/api/ha-alerts*` only.
7. **Do not** rewrite `/queue`; do not add backend endpoints.

Status after implement + staging smoke: **STAGING CANDIDATE** only.
