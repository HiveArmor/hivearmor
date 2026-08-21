# HiveArmor Alert Triage Queue — Research and Design Rationale

Date: 2026-08-02

## Objective

Redesign `/alerts` as the fastest path from a high-volume signal stream to a defensible analyst decision. The route must support rapid scanning and batch lifecycle work while preserving the deeper evidence path in `/alerts/:id`.

## Sources reviewed

- [Elastic — Manage detection alerts](https://www.elastic.co/docs/solutions/security/detect-and-alert/manage-detection-alerts): KQL and structured controls, customizable columns and views, grouping, inline field actions, bulk lifecycle actions, assignments, tags, case promotion, timeline pivots, process analysis, and response actions.
- [Google Security Operations — Investigate alerts](https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert): alert overview, detection inputs, graph/entities, history, similar alerts, severity/priority changes, enrichment, and composite-detection transparency.
- [Microsoft Sentinel — Navigate, triage, and manage incidents](https://learn.microsoft.com/en-us/azure/sentinel/incident-navigate-triage): queue search/filtering, ownership, status/severity updates, classification when closing, tags, comments, and permission-dependent actions.
- [Microsoft Sentinel — Investigate incidents in depth](https://learn.microsoft.com/en-us/azure/sentinel/investigate-incidents): persistent investigation context, tasks, activity, logs, entities, timeline, and relationship exploration without leaving the investigation flow.

## Findings applied to HiveArmor

### 1. Separate scanning from investigation depth

The list shows only fields required to prioritize and route work: severity, time, risk, alert reason, primary entity, ATT&CK context, status, owner, tenant, and SLA. Raw JSON, full process trees, network evidence, correlations, and response execution remain deferred to the drawer or full investigation route.

### 2. Preserve spatial and temporal context

A single click opens a push drawer while keeping the queue visible. Double-click or the drawer expand control opens the full investigation board. The drawer has compact triage, evidence, and activity views; it is not a duplicate of the investigation page.

### 3. New live data must not move the analyst's target

SSE arrivals are buffered and announced. Analysts explicitly load the new rows. Disconnection leaves current rows visible with a delayed/stale state and automatic retry; it does not force a mode change or reload the whole page.

### 4. Bulk actions require consequence visibility

Selection reveals one action bar. Assignment, acknowledgement, classification, tagging, and promotion are designed around preview, eligibility, reason, confirmation, idempotency, audit, and partial-failure reporting. Current backend mismatches are documented rather than hidden behind optimistic UI.

### 5. Saved views are operational instruments

Built-in views target common decisions: needs triage, my priority, critical, SLA risk, unassigned, and threat-intel matches. A future user-scoped contract stores filter AST, sort, visible columns, density, grouping, and sharing; browser storage is not represented as enterprise persistence.

### 6. Keyboard flow follows analyst intent

- `J` / `K`: next or previous visible alert.
- `Space`: toggle the focused row selection.
- `A`: begin assignment for selected alerts.
- `C`: begin classification/closure for selected alerts.
- `Shift+F`: focus the query and filter workspace.
- `Enter`: open the focused alert context; double-click opens full investigation.

Shortcuts do not fire while typing in an input, select, textarea, or editable element.

## Information architecture

1. Compact operational header with queue identity, count, live/freshness state, and route switch to severity board.
2. Priority snapshot counters that also act as transparent filters.
3. Built-in and saved-view rail.
4. Query, structured filters, time range, fields, density, and explicit refresh controls.
5. Virtualized alert table with stable selection and a buffered-live-update banner.
6. Selection action bar with safe bulk workflow entry points.
7. Resizable context drawer with overview, evidence, activity, and response readiness.
8. Persistent stream/EPS/status dock.

## Visual direction

- Matte carbon surfaces remain the operational foundation; gold/orange is reserved for the brand mark.
- Critical red, high amber, medium blue, healthy green, and SLA states remain operational semantics and are always paired with labels.
- A restrained honeycomb marker is used for alert identity and section anchors; it never competes with severity.
- Panels use subtle borders and surface elevation rather than glow, glass, or decorative gradients.
- IDs, IPs, hashes, and timestamps use tabular/monospace presentation with copy affordances where truncation is possible.

## Accessibility and responsive strategy

- AG Grid remains the virtualized desktop/tablet data surface; headers, selection, focus, and sort remain keyboard accessible.
- The table preserves a minimum operational width on small screens and uses intentional horizontal scrolling rather than removing decision-critical columns.
- The drawer is a push panel on wide screens, an overlay on tablet, and a full-width sheet on mobile.
- Drawer resize has pointer and keyboard/button alternatives, satisfying WCAG 2.2 dragging requirements.
- All severity and status colors have text labels; visible focus treatment uses the Hive Carbon teal focus token.
- Live updates use a polite status region and never steal focus.

## Performance decisions

- Preserve AG Grid infinite row loading and route-level code splitting.
- Request projection-only list fields in blocks of at most 100.
- Keep stable rows visible during background refresh and stream reconnect.
- Parse and apply filters outside row renderers; avoid client-side filtering of production datasets.
- Defer alert details until drawer open and deeper evidence until an explicit tab or full investigation navigation.
- Avoid charting libraries in the queue route.
- Require abortable queries and a server cursor/snapshot contract before backend stitching.

## Backend boundary

The checked-in controller does not expose the list or detail GET routes currently called by the frontend, and several mutation DTOs disagree. The cumulative [frontend-backend-contract-register.md](../frontend-backend-contract-register.md) records the audit and requirements as `ALT-LV01`–`ALT-LV06` and `ALT-014`–`ALT-021`.

Design fixtures remain fictional and are only available through `VITE_USE_FOUNDATION_FIXTURES=true`. Production rendering must not infer alert evidence, counts, ownership, provenance, or action success.
