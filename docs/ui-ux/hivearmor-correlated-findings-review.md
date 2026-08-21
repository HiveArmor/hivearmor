# HiveArmor Correlated Findings — design and implementation review

Date: 2026-08-02  
Routes: `/correlated-findings`, `/correlated-findings/:id`  
Status: frontend complete; production stitching awaits `COR-001` through `COR-006`

## Outcome

Correlated Findings is now an explainable attack-story triage workspace rather than a generic alert-shaped grid. Analysts can rank coordinated activity, retain queue context, understand why signals are grouped, inspect attack progression and supporting alerts, review impacted entities, validate relationship provenance, and preview incident promotion.

The redesign replaces a 1,000-record client-side grid, numeric filters, inline styles, raw `/offenses` assumptions, disabled status selector, and placeholder panels with:

- a bounded 25-story risk-ranked master list with server-ready views, ownership, search, time, and ordering controls;
- workload summaries for open, critical, SLA, unassigned, and multi-stage attack stories;
- an immediate selected-story workbench with Story, Evidence, and Relationships tabs;
- explicit risk, confidence, alert, entity, data-source, and activity-span context;
- explainable correlation reasons with evidence strength and observation counts;
- ordered ATT&CK progression and directly linked supporting alerts;
- entity risk and asset criticality without collapsing those into finding severity;
- a lightweight SVG relationship canvas using HiveArmor hexagonal nodes and no graphing dependency;
- a complete route that preserves the same investigation grammar;
- preview-before-execute incident promotion with duplicate-candidate and scope review;
- honest fixture isolation and explicit production contract errors.

## Research decisions

Microsoft Defender treats correlated alerts as an attack story and emphasizes chronological alerts, impacted entities, the reason alerts link, evidence, and relationship graphs. Google Security Operations organizes alert investigation around overview, relationships, entities, events, and history. Elastic Attack Discovery recommends triaging correlated findings as units using risk, alert diversity, detection quality, ATT&CK breadth, and entity risk before deciding to create a case or dismiss the finding.

Official references:

- https://learn.microsoft.com/en-sg/defender-xdr/investigate-incidents
- https://learn.microsoft.com/en-us/microsoft-365/security/defender/incidents-overview
- https://learn.microsoft.com/th-th/defender-xdr/alerts-incidents-correlation
- https://docs.cloud.google.com/chronicle/docs/investigation/investigate-alert
- https://www.elastic.co/docs/solutions/security/ai/triage-attack-discovery-findings
- https://www.elastic.co/docs/solutions/security/ai/attack-discovery/
- https://www.elastic.co/docs/solutions/security/investigate

## Performance boundary

The first-use route no longer imports AG Grid, ECharts, or React Flow. It requests at most 25 bounded story projections and renders the relationship canvas with native SVG. Large alert/event lists, raw evidence, and expanded relationships remain behind cursor endpoints. The selected story changes without route reload or a per-row detail request.

Production targets are p95 below 350 ms and 150 KB compressed for the queue projection, then p95 below 500 ms and 250 KB compressed for complete core detail. The cumulative backend handoff is `docs/frontend-backend-contract-register.md` under `COR-LV01` through `COR-LV04` and `COR-001` through `COR-006`.

## Verification gates

- TypeScript, ESLint, all 146 Vitest files / 920 tests, and the production build pass.
- Tests cover fixture uniqueness, projection reconciliation, analyst views, deterministic ordering, search, bounded payloads, relationship integrity, chronology, tab behavior, accessibility, route laziness, and absence of heavy libraries.
- Browser review covers 1440×900 wide desktop, 1159×808 compact desktop, and 390×844 phone layouts; filters, story selection, evidence/relationship tabs, full-detail navigation, and promotion preview all behave correctly with no page-level overflow. Dense evidence and metric surfaces use deliberate local scrolling at narrow widths.
