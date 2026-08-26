# Prompt 06 — Analyst Queue layout research (OEM)

Retrieved: **2026-08-26**

Purpose: decide `/queue` structure and element order from primary OEM docs before UI placement.
Paraphrase only. Product claim stays **STAGING CANDIDATE**.

## Sources

| OEM | Source | Date |
|---|---|---|
| Splunk ES | [Incident Review triage](https://help.splunk.com/en/splunk-enterprise-security-7/user-guide/7.3/incident-review/triage-notables-on-incident-review-in-splunk-enterprise-security), [Mission Control analyst queue](https://help.splunk.com/en/splunk-enterprise-security-8/administer/8.6/mission-control/manage-analyst-workflows-using-the-analyst-queue-in-splunk-enterprise-security) | 2026-08-26 |
| Elastic Security | [Manage detection alerts](https://www.elastic.co/docs/solutions/security/detect-and-alert/manage-detection-alerts), [Alert details flyout](https://www.elastic.co/docs/solutions/security/detect-and-alert/view-detection-alert-details) | 2026-08-26 |
| Microsoft Defender / Sentinel | [Incident queue](https://learn.microsoft.com/en-us/defender-xdr/incident-queue), [Manage incidents](https://learn.microsoft.com/en-us/defender-xdr/manage-incidents) | 2026-08-26 |
| Prior HiveArmor | `docs/ai-handoff/research/autonomous-soc-command-triage.md` | 2026-08-25 |

## Layout conclusions (paraphrased)

1. **Grid is the work surface** — Incident Review / Alerts / Incidents queue put the table (or list) center-stage; charts/timelines are optional and collapseable, not stacked permanent chrome.
2. **Filters sit immediately above the grid** — Elastic: Status + Severity (+ assignee/host) drop-downs; Defender: filter chip bar (Status, Severity, Owner…); Splunk: filter + urgency + saved views. Status is first-class; default is open/new (+ in-progress).
3. **Bulk actions are selection-scoped** — appear when rows are checked (Elastic “Selected x”, Defender Manage incidents toolbar), not as always-on primary chrome.
4. **Detail without navigation** — Elastic details flyout / Defender summary pane / Splunk side triage: open row → side panel for status/owner; full page is secondary.
5. **Primary dispositions** — assign owner, update status, escalate/add to case/investigation; suppress/false-positive as explicit disposition.
6. **Saved views / filter sets** — Splunk saved views; Defender saved filter queries; accelerate shift handoff without rebuilding filters.
7. **Time range + total count** near the queue header; severity pressure is scannable (Sentinel open-by-severity counts or Elastic severity filter).

## HiveArmor `/queue` placement decisions

| Zone | Position | Rationale |
|---|---|---|
| Identity | Compact header: title, job sentence, open count | One job: “Triage open alerts for this shift” |
| Related surfaces | Inline header meta links (Mission Control / Alerts / Incidents) | OEM queues do not use a second permanent nav strip |
| Controls | Single strip: **Status → Severity → Search**; bulk replaces right side on selection | Matches Elastic/Defender filter-above-grid |
| Default filters | `open` + `in_progress` | Defender default New + In progress |
| Banners | Conditional only (SSE down, new alerts, load error, RBAC deny) | Protect ≥50% viewport for grid |
| Live honesty | StatusDock live vs historical when SSE/EPS disconnected | No fake Live label |
| Detail | Right drawer; escalate/status gated with human role labels | Flyout pattern; assign = SOC Manager+ |

## Explicit non-copies

Do not add OEM severity treemaps, Queue Assistant ML scores, or adaptive-response catalogues on this slice. No new backend bulk endpoints.
