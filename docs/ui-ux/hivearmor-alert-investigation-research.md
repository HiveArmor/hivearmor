# HiveArmor Alert Investigation — Research and Design Rationale

Date: 2026-08-02  
Route: `/alerts/:id`  
Reference video: `Incident_investigation_Screen.mp4` (interaction reference only)

## Outcome

The page is designed as a synchronized investigation board rather than a conventional detail form. Alert context remains persistent while analysts move between the ordered attack story, process lineage, evidence, raw data, related activity, and response actions. The default is an accessible story-and-tree workspace; a free-drag graph is intentionally not required for core investigation.

## Reference video analysis

The 21.6-second, 1918×942 reference showed a sandbox investigation with:

- persistent sample identity, risk, verdict, and response commands;
- an attack-chain progression across execution, defense evasion, persistence, and command-and-control;
- synchronized behavior summary, ordered execution timeline, and expandable process tree;
- a lower network table and IOC groups;
- independent scrolling within dense investigation panels.

The useful interaction model was retained. The visual language now uses HiveArmor’s matte carbon foundation, with teal reserved for interaction and the ordered severity scale reserved for operational meaning. The implementation also adds provenance, backend-unavailable states, keyboard navigation, response safety, and an accessible hierarchical process list.

## Primary-source product research

### Elastic Security

[Elastic’s alert detail documentation](https://www.elastic.co/docs/solutions/security/detect-and-alert/view-detection-alert-details) treats the alert reason, investigation guide, and highlighted fields as the first investigation layer. It then exposes process/session/entity visualizations, threat-intelligence matches, correlations, prevalence, and analyst notes. The documentation also makes the underlying fields interactive and supports raw alert detail.

Applied to HiveArmor:

- “Why it fired” and the rule guide are visible before raw JSON.
- Story/process/relationship views are evidence-backed, not decorative.
- IOCs include source and confidence.
- Related alerts require an explicit relation reason.
- Highlighted fields and raw data remain one action away.

### Google Security Operations

[Google SecOps alert investigation documentation](https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert) separates alert details, detection summary, events, inputs, graph, similar alerts, and alert history. It notes that graph quality depends on the entities and outcomes emitted by the detection rule, and that composite detections should expose their nested detections and events.

Applied to HiveArmor:

- Graph/relationship quality and coverage must be reported by the backend.
- The board preserves source/input provenance.
- History includes state changes and notes.
- Composite alerts require nested input references in the future contract.

### Microsoft Sentinel

[Microsoft Sentinel’s incident investigation guidance](https://learn.microsoft.com/en-us/azure/sentinel/investigate-incidents) keeps core case context persistent, reconstructs the attack timeline, exposes entity dossiers, links to the underlying query and events, and explains why incidents are considered similar. It also places playbooks and tasks in the same investigative context.

Applied to HiveArmor:

- Core alert status, severity, asset, tenant, risk, confidence, and SLA remain visible across tabs.
- Event pivots keep the analyst in context.
- Related activity includes a human-readable reason.
- Response actions remain close to the evidence but use preview and confirmation.

### OpenSearch Security Analytics

[OpenSearch’s correlation graph documentation](https://docs.opensearch.org/latest/security-analytics/usage/correlation-graph/) represents findings as nodes, relationships as edges, and correlation relevance as connection strength, with time/log-type/severity filtering.

Applied to HiveArmor:

- Any future graph contract needs typed nodes/edges, strength, evidence, filters, truncation, and time bounds.
- A relationship list/table remains available for keyboard and screen-reader use.
- The first implementation avoids eagerly loading an interactive graph library when story and lineage answer the primary question more efficiently.

## Information architecture

### Persistent header

- alert ID and copy action;
- severity, workflow status, verdict, risk, confidence;
- asset, tenant, detection time, SLA, and freshness;
- investigation guide and response entry points.

### Investigation Board

- attack-chain ribbon: observed ATT&CK progression;
- left context rail: detection reason, evidence-backed capabilities, investigation scope;
- center canvas: ordered story synchronized to expandable process lineage;
- right evidence rail: enriched IOCs and safe response console;
- evidence dock: network, indicators, related alerts, highlighted fields, and raw event.

### Event Details

- rendered detection narrative;
- searchable highlighted fields;
- raw source event.

### History & Response

- append-only analyst, automation, and state activity;
- response action catalog with target preview and execution safety.

## Interaction decisions

- `J` and `K` move between attack-story events; selection synchronizes the related process.
- Left/right arrow keys change the workspace tab using the ARIA tabs pattern.
- Process lineage is a real expandable list, not a chart-only canvas.
- Indicators, destinations, IDs, and fields have explicit copy controls.
- Response actions are disabled when eligibility is unavailable; destructive actions never infer authorization from the UI.
- Fixture actions simulate locally and state that no endpoint or asset changed.
- Production gaps use named contract IDs and never display fixture evidence.

## Visual decisions

- Matte carbon surfaces, restrained teal interaction, and a gold/orange mark establish the selected Hive Carbon Hybrid direction.
- Red is limited to critical severity, malicious verdicts, and destructive response semantics.
- Amber communicates high/suspicious states; green communicates verified healthy/success states.
- Hexagonal nodes appear in the alert beacon, attack-chain markers, capability cards, process lineage, and entity scope. The motif is operational and repeated sparingly rather than used as decoration.
- Dense tables use tabular numbers, compact 11–12 px metadata, sticky headers, and horizontal overflow instead of squeezing fields.

## Accessibility and performance

- Native buttons, headings, ordered lists, tables, and ARIA tabs are used before custom semantics.
- Default board passes automated WCAG 2.2 A/AA checks for serious/critical violations; color contrast remains part of browser-level visual review.
- The route is lazy-loaded.
- The core summary has its own short-lived query cache and does not wait on optional future telemetry contracts.
- High-volume future contracts are cursor-paginated and bounded.
- No ReactFlow/ECharts graph is loaded by the first board implementation.
- Skeletons have fixed geometry and reduced-motion behavior.
- Responsive layouts retain the story before secondary rails; narrow screens use overflow for attack chain and evidence categories.

## Backend handoff

All existing mismatches and required contracts are maintained in the single cumulative reference: [frontend-backend-contract-register.md](../frontend-backend-contract-register.md). Alert Investigation requirements are `ALT-001` through `ALT-013`; the previously redesigned Incident Workbench is backfilled under `INC-*`.
