# HiveArmor Severity Board — design and implementation review

Date: 2026-08-02  
Route: `/alerts/board` (legacy `/alerts/severity` redirects here)  
Status: implementation complete; production data stitching awaits `ALT-023`

## Outcome

The Severity Board is an operational workload surface rather than a decorative KPI dashboard. It answers four analyst questions in one scan: where the critical work is, what is under response pressure, who owns it, and which alert should be opened next.

The redesign replaces five equal oversized tiles and six independent network requests with:

- critical-first lanes containing bounded, investigation-ready alert cards;
- a compact severity distribution with direct queue drill-down;
- explicit critical-open, SLA, unassigned, and threat-intelligence pressure signals;
- a lightweight 12-bucket arrival pulse without a charting dependency;
- active/all, ownership, time, live/historical, refresh, and buffered-update controls;
- semantic severity colors used as signals rather than ambient decoration;
- responsive internal lane scrolling while preserving the application viewport;
- fixture-only data isolation and explicit production failure behavior.

## Research decisions

Microsoft Defender documents severity alongside priority score, asset criticality, threat intelligence, MITRE context, status, assignment, tags, and entities for incident prioritization. Google Security Operations similarly separates severity, priority, and risk while exposing entity and history context. Elastic supports grouping and actions from alert groups while keeping the alert table for bulk triage. Those patterns support a bounded workload board that links into the queue, not a second full table.

Official references:

- https://learn.microsoft.com/en-us/defender-xdr/incident-queue
- https://learn.microsoft.com/en-us/defender-xdr/manage-incidents
- https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert
- https://docs.cloud.google.com/chronicle/docs/detection/risk-analytics-overview
- https://www.elastic.co/guide/en/security/8.19/alerts-ui-manage.html
- https://www.elastic.co/docs/solutions/security/detect-and-alert/visualize-detection-alerts

## Performance and data boundary

The frontend performs one cached, cancellable board request. Each lane returns at most four records and the whole projection is expected below 120 KB compressed with p95 below 300 ms for a 24-hour scope. The board does not import ECharts or React Flow. Full queue rows, raw events, graphs, and investigation evidence load only after drill-down.

The cumulative backend handoff is `docs/frontend-backend-contract-register.md`. Severity Board uses `ALT-023`; the checked-in legacy overview mismatch is captured as `ALT-SB01` and `ALT-SB02`.

## Verification gates

- TypeScript typecheck and ESLint must pass.
- The projection tests prove critical-first ordering, count reconciliation, ownership filtering, bounded lane size, deterministic risk order, route laziness, and absence of heavy visualization libraries.
- Full unit suite and production build must pass.
- Browser review covers desktop, compact desktop, and phone widths; the application viewport must not acquire horizontal overflow.

## Next surface

Correlated Findings is next. It should reuse the same severity, entity, ownership, and status grammar while focusing on relationship confidence, contributing signals, time span, and incident promotion rather than duplicating the Severity Board.
