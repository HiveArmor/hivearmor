# HiveArmor frontend-v3 redesign roadmap

The redesign should follow analyst workflow, not the current route list. Each phase produces reusable components and performance rules for the following phases.

## Phase 1 — visual foundation and Mission Control

Status: complete

- Hive Carbon Hybrid foundation, shell, hover-expanding navigation, login, Mission Control.

## Phase 2 — incident investigation

Status: complete

- Incident Workbench, case context, entity risk, timeline, evidence, linked alerts, supported response controls.

## Phase 3 — triage queue

Status: complete

- Merge the best of Incident Queue and Analyst Queue into a consistent triage grammar.
- Server-driven pagination, saved views, keyboard row navigation, bulk triage with confirmation.
- Preview drawer that reuses Incident Workbench context patterns.
- Performance target: first usable rows under 1.5 seconds; preserve previous data during filters.

## Phase 4 — alert investigation

Status: complete

- Alert list, alert detail, severity board, and correlated finding detail.
- Investigation guide, highlighted fields, raw event/JSON, MITRE and threat-intelligence context.
- Resizable push/overlay drawer with navigation history.
- Performance target: load overview fields first; defer JSON, correlations, and visualizations.

## Phase 5 — search, hunt, and entities

- Search & Hunt, saved queries, timeline, entity list/detail, threat constellation.
- Query field projection, cursor pagination, cancellable searches, streamed result counts.
- Entity dossier with baseline, related alerts, risk history, and incident-scoped time window.

## Phase 6 — detection engineering

- Detection rules, rule import, MITRE coverage, custom-rule editor, correlation rules.
- Draft/validate/test/publish workflow with version history and clear test-data boundaries.
- Lazy-load Monaco and large coverage visualizations only on demand.

## Phase 7 — response automation

- Playbook library, builder, response activity, approvals, quarantine, and endpoint workflows.
- Every disruptive action shows target, blast radius, permission, approval state, and rollback guidance.
- Stream execution steps rather than polling entire pages.

## Phase 8 — posture and exposure

- Assets, identities, Active Directory, vulnerabilities, exposure, CIS, and compliance.
- Shared risk grammar, evidence-linked findings, asset criticality, and remediation ownership.
- Aggregate first; request large finding tables only after drill-down.

## Phase 9 — operations and administration

- Dashboards, reports, tenants, users, integrations, data sources, audit, and settings.
- Separate daily operational controls from low-frequency platform administration.
- Virtualize large inventories and audit feeds; export asynchronously.

## Cross-phase quality gates

- Operational routes follow `docs/ui-ux/hivearmor-shell-density-standard.md`: 50px masthead, compact page identity, edge-aligned work surfaces, explicit-only preview opening, and shared thin scrollbars.
- WCAG 2.2 AA structure, focus, keyboard, labels, and contrast.
- No fake production data or unsupported controls.
- Skeletons match final geometry; no full-page spinner for partial data.
- Heavy editors, grids, graphs, maps, and AI panels are code-split.
- Queries use bounded payloads, explicit field selection where supported, and stable cache keys.
- Error states preserve usable stale data and explain recovery.
- Desktop, tablet, and mobile visual review before a route is marked complete.
- Typecheck, lint, full unit suite, and production build must pass for every phase.
