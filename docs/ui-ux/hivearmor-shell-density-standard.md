# HiveArmor operational shell density standard

Date: 2026-08-02  
Status: active for completed and future `frontend-v3` operational routes

## Decision

HiveArmor uses a compact, persistent shell so the analyst's working surface begins as high as possible without hiding tenant, search, health, notification, mode, or primary-action context.

At desktop widths:

- masthead: 50px;
- fixture or environment strip: 28px when present;
- list/board page identity: 58px target, including icon, eyebrow, title, route switch, live/historical mode, and primary actions;
- detail command bars: 50–86px depending on whether status context requires a second row;
- page subtitles are omitted from dense operational routes when the title and adjacent controls already establish purpose;
- filters, saved views, metrics, and data start immediately below identity;
- page-level left/right padding must not interrupt edge-to-edge queue metrics or tables.

The user account lives at the bottom of the auto-collapsing left navigation. Tenant scope, global search, pipeline health, EPS, notifications, and help remain in the masthead because they are global operational context.

## Product comparison

- Microsoft Defender keeps notifications and global discovery in the portal top bar while incident and alert work remains in the primary workspace.
- Elastic Security exposes its query and time controls consistently at the top of working pages, minimizing the distance between global context and results.
- Splunk Enterprise Security centers triage in the Mission Control analyst queue, with saved/default views and time range directly supporting the queue.
- Google Security Operations routes analysts from navigation into alert tables, then exposes details, entities, events, and graph context inside the investigation surface.

References:

- https://learn.microsoft.com/en-us/microsoft-365/security/defender/microsoft-365-defender-portal?view=o365-worldwide
- https://www.elastic.co/guide/en/security/current/es-ui-overview.html
- https://docs.splunk.com/Documentation/ES/8.1.0/Admin/ManageAnalystWorkflows
- https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert

## Implementation contract

Foundation tokens in `frontend-v3/src/styles/foundation.css` are authoritative:

- `--ha-masthead-height`
- `--ha-page-header-height`
- `--ha-page-header-padding-inline`
- `--ha-page-header-icon-size`
- `--ha-page-title-compact`
- `--ha-fixture-strip-height`
- `--ha-scrollbar-size`

New operational pages must consume these tokens instead of defining large route-specific hero headers. A larger header requires evidence that the header itself contains investigation state or decision controls that cannot move into the workspace.

## Interaction rules

- Opening a queue route never auto-opens the first row or changes selection.
- A preview opens only after explicit row activation or a deliberate deep link.
- Horizontal scrolling is local to controls or dense tables, never the document body.
- Scrollbars remain visible enough to communicate overflow but use the thin matte-carbon shell treatment.
- Collapsed navigation shows the user avatar; hover/focus expansion reveals login and account label.
- Navigation sections use a restrained separator between functional domains. The divider remains visible in the collapsed rail so icon groups keep their meaning without labels; expanded rows target 36px for a denser scan path.

## Select controls

- Dense operational selects use `HaCompactSelect`; route-specific native-select styling is not permitted.
- Retain the native `<select>` interaction model for keyboard, screen-reader, and operating-system reliability.
- Remove the browser chrome with `appearance: none`, provide one consistent chevron, and request a dark native option surface with `color-scheme: dark`.
- Inline selects show a short uppercase field label when space allows. Popover and dialog selects use the stacked variant.
- Focus is communicated by the control border and inset focus ring; do not fill the complete control with a bright selection color.

## Scroll ownership and sticky operations

- Card boards and vertically expanding workflows use document scrolling. Do not create independent vertical scrollbars inside every lane.
- Virtualized tables and synchronized split panes may retain bounded internal scrolling because row virtualization and persistent side-by-side context depend on it.
- On document-scrolling boards, the filter toolbar and workload metrics form one sticky operations stack at `top: var(--ha-masthead-height)`.
- Page identity and fixture notices scroll away; they are orientation context, not continuous decision context.
- The compact status dock may remain sticky at the viewport bottom so stream health and EPS remain visible.
- Sticky stacks must preserve horizontal-only overflow at narrow widths and must never increase document width beyond the viewport.
- A sticky stack may become static below 700px when its controls would consume an unsafe share of the viewport; controls remain adjacent and horizontally scrollable instead of covering results.

## High-volume rendering strategy

- Severity Board is a workload projection, not an unbounded list. It shows the four highest-risk records per severity lane, preserves the complete lane count, and routes “View lane in queue” to the equivalent filtered Alert Queue. `ALT-023` permits an explicit `laneLimit` from 1–10 and defaults to four.
- Alert Queue owns the one intentional internal vertical scrollbar. AG Grid stays in normal layout with row virtualization, requests 100-row blocks, and retains at most ten blocks in memory. Do not use grid `autoHeight` for this route because it renders the complete row set and defeats the high-volume safety model.
- Correlated Findings uses document scrolling over a bounded 25-story projection. `COR-001` cursor pagination supplies later batches; off-screen cards use `content-visibility: auto` as a progressive rendering optimization while remaining in the DOM and accessibility tree.
- Avoid multiple nested vertical scrollbars. A route may combine document scrolling with one bounded virtual data viewport, but card lanes, card feeds, and adjacent preview panels stay in document flow.
