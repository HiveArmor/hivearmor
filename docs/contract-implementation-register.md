# HiveArmor Contract Implementation Register

Last updated: 2026-08-08
Covers: Sprints 35–48

## Purpose

This document maps every contract from `frontend-backend-contract-register.md` to its actual implementation in the codebase. It serves as a traceability matrix for the frontend–backend integration phase, confirming which contracts are production-ready, which backend files implement them, and which frontend files consume them.

## Summary

| Route | Contracts | Status | Sprint(s) |
|-------|-----------|--------|-----------|
| `/alerts` — Alert Triage Queue | ALT-014 to ALT-022 | IMPLEMENTED | 36–38 |
| `/alerts/:id` — Alert Investigation | ALT-001 to ALT-012 | IMPLEMENTED | 39–41 |
| `/alerts/board` — Severity Board | ALT-023 | IMPLEMENTED | 36 |
| `/search` — Search & Hunt | HNT-001 to HNT-009 | IMPLEMENTED | 42 |
| `/incidents/:id` — Incident Workbench | INC-001 to INC-008 | IMPLEMENTED | 43 |
| `/correlated-findings` — Correlated Findings | COR-001 to COR-006 | IMPLEMENTED | 44 |
| `/entities` — Entity Intelligence | ENT-001 to ENT-010 | IMPLEMENTED | 45–46 |
| `/detection-rules` — Detection Rules | DET-008 to DET-016 | IMPLEMENTED | 47 |
| `/constellation` — Threat Constellation | CON-001 to CON-005 | IMPLEMENTED | 48 |
| Deferred | ALT-013 | DEFERRED | — |

---

## Route: `/alerts` — Alert Triage Queue

Frontend files: `frontend-v3/src/pages/alerts/AlertsListPage.tsx`, `AlertDetailDrawer.tsx`, `alertColumns.tsx`, `alertsListDatasource.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| ALT-014 | Canonical alert queue query | REQUIRED | IMPLEMENTED | 36 | `web/rest/hunt/HaAlertQueueResource.java` | `GET /ha-alerts` |
| ALT-015 | Queue summary and filter facets | REQUIRED | IMPLEMENTED | 36 | `web/rest/hunt/HaAlertQueueResource.java` | `GET /ha-alerts/summary` |
| ALT-016 | User-scoped saved triage views | REQUIRED | IMPLEMENTED | 36 | `web/rest/hunt/HaAlertViewResource.java` | `GET/POST/PATCH/DELETE /ha-alert-views` |
| ALT-017 | Assignment candidates and bulk assignment | REQUIRED | IMPLEMENTED | 37 | `web/rest/hunt/HaAlertAssignmentResource.java` | `GET /ha-alert-assignees`, `POST /ha-alerts/bulk/assignment` |
| ALT-018 | Bulk triage lifecycle actions | REQUIRED | IMPLEMENTED | 37 | `web/rest/hunt/HaAlertBulkResource.java` | `POST /ha-alerts/bulk/status`, `POST /ha-alerts/bulk/tags`, `POST /ha-alerts/bulk/promote` |
| ALT-019 | Resumable alert-stream updates | REQUIRED | IMPLEMENTED | 38 | `web/rest/hunt/HaAlertStreamResource.java` | `GET /ha-alerts/stream` |
| ALT-020 | Lightweight triage drawer projection | REQUIRED | IMPLEMENTED | 38 | `web/rest/hunt/HaAlertQueueResource.java` | `GET /ha-alerts/{alertId}?view=triage` |
| ALT-021 | Suppression and exception preview | REQUIRED | IMPLEMENTED | 38 | `web/rest/hunt/HaSuppressionPreviewResource.java` | `POST /ha-alerts/{alertId}/suppression-preview` |
| ALT-022 | Permission-aware single-alert quick actions | REQUIRED | IMPLEMENTED | 38 | `web/rest/hunt/HaAlertActionResource.java` | `POST /ha-alerts/{alertId}/notes`, `POST /ha-alerts/{alertId}/incident-link` |

### Key response shapes

**ALT-014** — `{ items: AlertRow[], nextCursor, hasMore, snapshotAt, totalApproximate }`
**ALT-015** — `{ snapshotAt, total, criticalOpen, slaAtRisk, unassigned, facets: { severity, status, tenant, category } }`
**ALT-016** — `{ id, name, filter, sort, columns, density, isDefault, owner, version }`
**ALT-019** — SSE events: `alert.created`, `alert.updated`, `alert.removed`, `summary.updated`, `stream.heartbeat`

### Frontend consumers

- `AlertsListPage.tsx` — uses ALT-014, ALT-015, ALT-019
- `AlertDetailDrawer.tsx` — uses ALT-020
- `alertsListDatasource.ts` — cursor pagination via ALT-014
- `BulkActionBar.tsx` — uses ALT-017, ALT-018
- `SavedViewSelector.tsx` — uses ALT-016

### Seed data

- `local-dev/seed-alert-queue.sh` — 500 alerts across 3 tenants with severity distribution

---

## Route: `/alerts/:id` — Alert Investigation Board

Frontend files: `frontend-v3/src/pages/alerts/AlertInvestigationPage.tsx`, `alertInvestigation.service.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| ALT-001 | Canonical alert investigation summary | MISMATCH | IMPLEMENTED | 39 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}` |
| ALT-002 | Ordered attack story and ATT&CK progression | REQUIRED | IMPLEMENTED | 39 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/story` |
| ALT-003 | Process lineage | REQUIRED | IMPLEMENTED | 40 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/processes` |
| ALT-004 | Network activity | REQUIRED | IMPLEMENTED | 40 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/network` |
| ALT-005 | Indicators, enrichment, and provenance | REQUIRED | IMPLEMENTED | 40 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/indicators` |
| ALT-006 | Entity relationship and correlation graph | REQUIRED | IMPLEMENTED | 41 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/relationships` |
| ALT-007 | Related alerts and correlation reasons | REQUIRED | IMPLEMENTED | 41 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/related` |
| ALT-008 | Alert history, notes, and capability analysis | PARTIAL | IMPLEMENTED | 39 | `web/rest/hunt/HaAlertActionResource.java` | `GET /ha-alerts/{alertId}/activity`, `POST /ha-alerts/{alertId}/notes` |
| ALT-009 | Detection reason and investigation guide | REQUIRED | IMPLEMENTED | 41 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/guide` |
| ALT-010 | Response catalog, preview, approval, execution | REQUIRED | IMPLEMENTED | 41 | `web/rest/hunt/HaResponseActionResource.java` | `GET /response/actions`, `POST /response/actions/{id}/preview`, `POST /response/actions/{id}/execute` |
| ALT-011 | Highlighted fields and raw source events | REQUIRED | IMPLEMENTED | 40 | `web/rest/hunt/HaAlertInvestigationResource.java` | `GET /ha-alerts/{alertId}/events/{eventId}` |
| ALT-012 | Live investigation updates and snapshot consistency | REQUIRED | IMPLEMENTED | 39 | `web/rest/hunt/HaAlertStreamResource.java` | `GET /ha-alerts/{alertId}/stream` |

### Key response shapes

**ALT-001** — `{ id, title, summary, severity, status, verdict, riskScore, confidence, occurredAt, asset, sla, detection, counts, snapshotVersion }`
**ALT-002** — `{ stages[], items[], nextCursor, hasMore, snapshotAt, snapshotVersion }`
**ALT-010** — Catalog: `{ id, label, description, targetTypes, available, impact, requiresApproval, integration }`
**ALT-012** — SSE events: `alert.updated`, `story.appended`, `process.updated`, `network.appended`, `indicator.enriched`, `correlation.updated`, `response.updated`

### Frontend consumers

- `AlertInvestigationPage.tsx` — layout orchestrating all panels
- `AttackStoryPanel.tsx` — uses ALT-002
- `ProcessTreePanel.tsx` — uses ALT-003
- `NetworkPanel.tsx` — uses ALT-004
- `IndicatorsRail.tsx` — uses ALT-005
- `RelatedAlertsPanel.tsx` — uses ALT-007
- `ResponseConsole.tsx` — uses ALT-010
- `useAlertStream.ts` — uses ALT-012

### Seed data

- `local-dev/seed-alert-investigation.sh` — 50 fully-enriched alerts with processes, network, indicators, and relationships

---

## Route: `/alerts/board` — Severity Board

Frontend files: `frontend-v3/src/pages/alerts/AlertSeverityBoardPage.tsx`, `SeverityTile.tsx`, `severityBoard.service.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| ALT-023 | Bounded Severity Board workload projection | REQUIRED | IMPLEMENTED | 36 | `web/rest/hunt/HaSeverityBoardResource.java` | `GET /ha-alerts/severity-board` |

### Key response shape

```json
{
  "overview": { "total", "active", "criticalOpen", "needsTriage", "slaPressure", "unassigned", "threatIntelMatched", "highestRisk" },
  "lanes": [{ "severity", "count", "activeCount", "slaPressure", "unassigned", "alerts": [...] }],
  "trend": [{ "start", "end", "label", "total", "critical", "high", "medium", "low", "info" }],
  "snapshotAt", "totalApproximate", "dataCompleteness"
}
```

### Frontend consumers

- `AlertSeverityBoardPage.tsx` — overview KPIs, lane rendering, trend chart
- `SeverityTile.tsx` — individual lane tile rendering
- Drill-down navigates to `/alerts` with equivalent severity/status/ownership filter (ALT-014)

### Seed data

- Reuses `seed-alert-queue.sh` from Sprint 36 (same 500-alert dataset)

---

## Route: `/search` — Search & Hunt

Frontend files: `frontend-v3/src/pages/search-hunt/SearchHuntPage.tsx`, `searchHunt.service.ts`, `searchHunt.types.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| HNT-001 | Canonical bounded hunt execution | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `POST /ha-hunts/search` |
| HNT-002 | Cancellable execution and query diagnostics | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `DELETE /ha-hunts/search/{searchId}`, `GET /ha-hunts/search/{searchId}/status` |
| HNT-003 | Authorized schema, autocomplete, field statistics | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `GET /ha-hunts/schema`, `GET /ha-hunts/search/{searchId}/fields/{field}/values` |
| HNT-004 | Progressive normalized and raw event detail | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `GET /ha-hunts/events/{eventId}` |
| HNT-005 | Unified Search Manager for saved hunts and history | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntSavedResource.java` | `GET/POST/PATCH/DELETE /ha-hunts/saved`, `GET /ha-hunts/history` |
| HNT-006 | Signed investigation pivots | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | Embedded in event detail responses |
| HNT-007 | Evidence, investigation, and incident promotion | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntActionsResource.java` | `POST /ha-hunts/actions/preview`, `POST /ha-hunts/actions` |
| HNT-008 | Resumable long-running search updates | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `GET /ha-hunts/search/{searchId}/stream` |
| HNT-009 | Query-language capability discovery | REQUIRED | IMPLEMENTED | 42 | `web/rest/hunt/HaHuntResource.java` | `GET /ha-hunts/query-capabilities` |

### Key response shapes

**HNT-001** — `{ searchId, items[], nextCursor, hasMore, snapshotAt, totalApproximate, totalIsExact, tookMs, histogram[], partialFailures[] }`
**HNT-003** — Schema: `{ field, label, type, operators[], searchable, aggregatable, sortable }`; Values: `{ value, count, includeQuery, excludeQuery }`
**HNT-005** — `{ id, name, query, language, timePolicy, fields, sort, owner, sharing, version }`
**HNT-009** — `{ languages: [{ id, name, version, resultShape, operators, functions, limits }] }`

### Frontend consumers

- `SearchHuntPage.tsx` — query workspace, execution, results grid
- `MonacoQueryEditor.tsx` — uses HNT-003 for autocomplete, HNT-009 for language modes
- `SearchResultsGrid.tsx` — uses HNT-001 cursor pagination
- `EventDetailDrawer.tsx` — uses HNT-004
- `SavedHuntsPanel.tsx` — uses HNT-005
- `useSearchStream.ts` — uses HNT-008

### Seed data

- `local-dev/seed-hunt-events.sh` — 50,000 log events across v3-hive-log-* with realistic ECS fields

---

## Route: `/incidents/:id` — Incident Workbench

Frontend files: `frontend-v3/src/pages/incidents/IncidentDetailPage.tsx`, `IncidentWorkbench.tsx`, `incident-workbench.service.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| INC-001 | Edit incident metadata and assignment | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `PATCH /ha-incidents/{id}` |
| INC-002 | Tasks and analyst checklist | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `GET/POST/PATCH /ha-incidents/{id}/tasks` |
| INC-003 | Similar incidents with explainable reasons | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `GET /ha-incidents/{id}/similar` |
| INC-004 | Incident-scoped raw event search and pivot | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `POST /ha-incidents/{id}/events/search` |
| INC-005 | Response action catalog and safety state | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `GET/POST /ha-incidents/{id}/response-actions` |
| INC-006 | Collaboration activity and comments | PARTIAL | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `GET /ha-incidents/{id}/activity`, `POST /ha-incidents/{id}/activity/notes` |
| INC-007 | Evidence provenance and chain of custody | PARTIAL | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `POST /ha-incidents/{id}/evidence/{eid}/custody`, `PATCH /ha-incidents/{id}/evidence/{eid}` |
| INC-008 | Workbench live updates | REQUIRED | IMPLEMENTED | 43 | `web/rest/incident/UtmIncidentResource.java` (extended) | `GET /ha-incidents/{id}/stream` |

### Key response shapes

**INC-001** — `{ id, name, description, assignedTo, priority, updatedAt, updatedBy, version }` with `If-Match`/`ETag` headers
**INC-002** — `{ id, title, status, priority, assignedTo, dueAt, source, playbookStepId, checklist: [{id, label, checked}], version }`
**INC-003** — `{ incidentId, title, severity, status, similarityScore, reasons: [{type, label, sharedValue, source}] }`
**INC-008** — SSE events: `incident.updated`, `timeline.appended`, `evidence.created`, `task.updated`, `alert.linked`, `response.updated`

### Backend services (Sprint 43)

| Service | Responsibility |
|---------|---------------|
| `IncidentPatchService.java` | Optimistic concurrency merge, conflict detection, version tracking |
| `IncidentTaskService.java` | Task CRUD, checklist merge, status transitions |
| `SimilarIncidentService.java` | Weighted signal matching (entities 0.4, rules 0.3, indicators 0.2, semantic 0.1) |
| `IncidentEventSearchService.java` | Entity-scoped OpenSearch queries with pivot signing |
| `IncidentResponseActionService.java` | Filtered action catalog, preview token (JWT, 5-min), execution |
| `IncidentActivityService.java` | Cursor-paginated activity feed, note creation, @mentions |
| `EvidenceProvenanceService.java` | Append-only custody chain, classification updates |
| `IncidentSseService.java` | Per-incident SSE with 30-min timeout, 100-event replay buffer |

### Frontend consumers

- `IncidentHeader.tsx` — uses INC-001 (inline edit with conflict modal)
- `TaskPanel.tsx` — uses INC-002 (checklist toggles, optimistic update)
- `SimilarIncidentsPanel.tsx` — uses INC-003
- `EventSearchPanel.tsx` — uses INC-004
- `ResponseActionsPanel.tsx` — uses INC-005
- `ActivityFeed.tsx` — uses INC-006
- `EvidenceProvenanceCard.tsx` — uses INC-007
- `useIncidentStream.ts` — uses INC-008

### Seed data

- `local-dev/seed-incident-workbench.sh` — 30 incidents across 3 tenants with tasks, activity, evidence, custody chains

---

## Route: `/correlated-findings` — Correlated Findings

Frontend files: `frontend-v3/src/pages/correlations/CorrelatedFindingsPage.tsx`, `FindingWorkbench.tsx`, `CorrelatedFindingDetailPage.tsx`, `correlation.service.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| COR-001 | Bounded correlated-finding queue | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `GET /ha-correlated-findings` |
| COR-002 | Complete explainable attack-story | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `GET /ha-correlated-findings/{id}` |
| COR-003 | Cursor-paginated supporting evidence | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `GET /ha-correlated-findings/{id}/signals`, `/events`, `/relationships` |
| COR-004 | Finding lifecycle, assignment, and notes | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `POST /ha-correlated-findings/{id}/status`, `/assignment`, `/notes` |
| COR-005 | Previewed incident promotion | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `POST /ha-correlated-findings/{id}/incident-promotion/preview`, `/execute` |
| COR-006 | Resumable correlation updates | REQUIRED | IMPLEMENTED | 44 | `web/rest/correlation/HaCorrelatedFindingsResource.java` | `GET /ha-correlated-findings/stream` |

### Key response shapes

**COR-001** — `{ summary: {total, open, critical, unassigned, slaPressure}, items: FindingPreview[], nextCursor, snapshotAt, totalApproximate }`
**COR-002** — Full finding: `{ narrative, stages[], entities[], signals[], relationships {nodes[], edges[]}, correlationReasons[], availableActions[], version }`
**COR-004** — Status state machine: `new → reviewing → confirmed → promoted`; `new/confirmed → dismissed`; `dismissed/confirmed → reviewing` (reopen)
**COR-005** — Preview: `{ proposedTitle, severity, alertCount, entityCount, warnings[], previewToken }`
**COR-006** — SSE events: `finding.created`, `finding.updated`, `finding.escalated`, `finding.stage_added`, `finding.signal_added`

### Backend services (Sprint 44)

| Service | Responsibility |
|---------|---------------|
| `CorrelatedFindingService.java` | Queue listing with preview projection, full detail assembly |
| `FindingEvidenceService.java` | Paginated signals, events, and relationships |
| `FindingLifecycleService.java` | Status state machine, assignment, notes with idempotency |
| `FindingIdempotencyStore.java` | PostgreSQL-backed idempotency (5-min TTL, scheduled cleanup) |
| `FindingPromotionService.java` | Preview → execute promotion with JWT token (5-min expiry) |
| `FindingSseService.java` | Tenant-scoped SSE with 30-min timeout, 100-event replay |

### Frontend consumers

- `CorrelatedFindingsPage.tsx` — queue table with filters, summary badges
- `FindingQueueTable.tsx` — severity, stages, signals, tactics columns
- `CorrelatedFindingDetail.tsx` — narrative, entity graph, stages timeline
- `AttackNarrativePanel.tsx` — markdown narrative rendering
- `EntityGraphPanel.tsx` — ECharts force-directed graph
- `SignalsTab.tsx` — paginated alert list
- `FindingActionsBar.tsx` — contextual status transitions
- `PromotionModal.tsx` — preview and confirm incident creation
- `useFindingStream.ts` — uses COR-006

### Seed data

- `local-dev/seed-correlated-findings.sh` — 20 findings across 3 tenants with attack chains, narrative, MITRE mappings
- OpenSearch index: `v3-hive-correlation-*`

---

## Route: `/entities` — Entity Intelligence

Frontend files: `frontend-v3/src/pages/entities/EntityListPage.tsx`, `EntityDossierPage.tsx`, `entity.service.ts`, `dossier.service.ts`

### ENT-001 through ENT-005 (Sprint 45 — Core Inventory)

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| ENT-001 | Bounded entity inventory | REQUIRED | IMPLEMENTED | 45 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities` |
| ENT-002 | Inventory summary and filter facets | REQUIRED | IMPLEMENTED | 45 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/summary` |
| ENT-003 | Progressive lightweight entity preview | REQUIRED | IMPLEMENTED | 45 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/{id}/preview` |
| ENT-004 | Authorized entity pivots and dossier handoff | REQUIRED | IMPLEMENTED | 45 | `web/rest/entity/HaEntityResource.java` | Embedded in entity responses (HMAC-signed) |
| ENT-005 | Resumable risk and freshness updates | REQUIRED | IMPLEMENTED | 45 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/stream` |

### ENT-006 through ENT-010 (Sprint 46 — Entity Dossier)

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| ENT-006 | Progressive entity dossier core | REQUIRED | IMPLEMENTED | 46 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/{id}/dossier` |
| ENT-007 | Snapshot-bound entity activity | REQUIRED | IMPLEMENTED | 46 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/{id}/activity` |
| ENT-008 | Bounded related-alert projection | REQUIRED | IMPLEMENTED | 46 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/{id}/alerts` |
| ENT-009 | Evidence-backed entity relationships | REQUIRED | IMPLEMENTED | 46 | `web/rest/entity/HaEntityResource.java` | `GET /ha-entities/{id}/relationships` |
| ENT-010 | Previewed incident linking | REQUIRED | IMPLEMENTED | 46 | `web/rest/entity/HaEntityResource.java` | `POST /ha-entities/{id}/incident-link/preview`, `/execute` |

### Key response shapes

**ENT-001** — `{ items: [{id, type, value, displayName, riskScore, riskLevel, riskTrend, criticality, alertCount, lastSeen, sources, baselineDeviation, tags}], nextCursor, hasMore, snapshotAt, totalApproximate }`
**ENT-002** — `{ summary: {total, highRisk, rising, activeAlerts, new24h}, facets: {type, riskLevel, criticality, sources} }`
**ENT-006** — `{ identity, riskProfile: {score, level, trend, drivers[], history[]}, baseline: {metrics[], deviations[]}, sourceCoverage[], attackTechniques[], summary }`
**ENT-007** — PIT-based pagination: `{ items[], nextCursor (contains pitId + search_after), hasMore, snapshotAt }`
**ENT-009** — `{ items: [{relatedEntity, relationshipType, direction, strength, firstSeen, lastSeen, evidence[], eventCount}], nextCursor }`

### Backend services

| Service | Sprint | Responsibility |
|---------|--------|---------------|
| `EntityInventoryService.java` | 45 | Listing with multi-dimensional filters, summary aggregations |
| `EntityPreviewService.java` | 45 | Preview with multi-search (activity + alert summaries) |
| `EntityPivotService.java` | 45 | HMAC-signed pivot descriptors (dossier, hunt, alerts, incidents) |
| `EntitySseService.java` | 45 | Tenant-scoped SSE for risk/freshness updates |
| `EntityDossierService.java` | 46 | Dossier assembly via _msearch (entity + coverage + techniques) |
| `EntityActivityService.java` | 46 | PIT-based activity timeline with entity-type field mapping |
| `EntityAlertService.java` | 46 | Related alerts with entity role determination |
| `EntityRelationshipService.java` | 46 | Evidence-backed relationships from v3-hive-relationship-* |
| `EntityIncidentLinkService.java` | 46 | Preview/execute incident linking with JWT token |

### Frontend consumers (Sprint 45)

- `EntityInventoryPage.tsx` — uses ENT-001, ENT-002, ENT-005
- `EntityInventoryTable.tsx` — AG Grid with server-side cursor pagination
- `EntitySummaryBar.tsx` — uses ENT-002
- `EntityFilterPanel.tsx` — uses ENT-002 facets
- `EntityPreviewPopover.tsx` — uses ENT-003 (hover with 300ms debounce)
- `EntityPivotButtons.tsx` — uses ENT-004

### Frontend consumers (Sprint 46)

- `EntityDossierPage.tsx` — uses ENT-006, ENT-007, ENT-008, ENT-009, ENT-010
- `RiskProfilePanel.tsx` — risk circle, history sparkline, driver cards
- `BaselineMetricsPanel.tsx` — deviation indicators
- `ActivityTimeline.tsx` — infinite scroll with type filter chips
- `RelatedAlertsPanel.tsx` — paginated with entity role badges
- `RelationshipGraphPanel.tsx` — ECharts force graph
- `IncidentLinkModal.tsx` — create new or link existing

### Seed data

- `local-dev/seed-entity-inventory.sh` — 200 entities (hosts, users, IPs, domains) across 3 tenants
- `local-dev/seed-entity-dossier.sh` — risk drivers, activity events, relationships for 40 key entities
- OpenSearch indices: `v3-hive-entity-*`, `v3-hive-relationship-*`

---

## Route: `/detection-rules` — Detection Rules

Frontend files: `frontend-v3/src/pages/detection/DetectionRulesPage.tsx`, `RuleEditorPage.tsx`, `detection.service.ts`, `detection.types.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| DET-008 | Bounded detection-rule inventory and facets | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `GET /ha-detection-rules`, `GET /ha-detection-rules/summary` |
| DET-009 | Rule execution monitoring and gap repair | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `GET /ha-detection-rules/executions`, `POST /{id}/manual-run`, `POST /{id}/gap-fill` |
| DET-010 | Versioned, previewed lifecycle and bulk ops | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `POST /ha-detection-rules/bulk/status`, `/export`, `/duplicate`, `/delete` |
| DET-011 | Authoritative validation and historical preview | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `POST /ha-detection-rules/validate`, `POST /ha-detection-rules/preview` |
| DET-012 | Safe Sigma import and Detection-as-Code | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `POST /ha-detection-rules/import/validate`, `/preview`, `/execute`, `POST /managed-updates/check`, `/apply` |
| DET-013 | Resumable detection-health stream | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `GET /ha-detection-rules/stream` |
| DET-015 | Snapshot-bound ATT&CK coverage | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `GET /ha-detection-rules/coverage` |
| DET-016 | Canonical rule-authoring and publish lifecycle | REQUIRED | IMPLEMENTED | 47 | `web/rest/detection/HaDetectionRuleResource.java` | `GET/POST/PATCH /ha-detection-rules/{id}`, `POST /{id}/submit-review`, `/{id}/approve`, `/{id}/reject`, `/{id}/revert` |

### Key response shapes

**DET-008** — `{ items: [{id, name, scope, status, severity, mitreTactics, schedule, health: {status, errorRate, avgDuration}, lastExecution, version}], summary, facets, nextCursor }`
**DET-011** — Validate: `{ valid, diagnostics: [{code, severity, message, path, line, column}], complexity: {score, level} }`; Preview: `{ executionId, histogram[], totalMatches, samples[], tookMs }`
**DET-012** — Import validate: `{ candidates: [{filename, valid, title, severity, technique, logsource, issues[]}] }`; Preview: `{ rules: [{originalYaml, convertedCel, fieldMapping, warnings[]}] }`
**DET-015** — `{ framework, version, tactics: [{id, name, techniques: [{id, name, coverageStatus, ruleCount, dataSourceReady}]}], gaps[], recommendations[] }`
**DET-016** — `{ id, name, expression, filters, schedule, status, severity, mitre, versions[], approvals[], capabilities[], version, etag }`

### Backend services (Sprint 47)

| Service | Responsibility |
|---------|---------------|
| `DetectionRuleInventoryService.java` | Listing with health computation from execution history |
| `RuleExecutionService.java` | Execution history, manual-run, gap detection and fill |
| `RuleBulkOperationService.java` | Bulk status/export/duplicate/delete (max 50 per op) |
| `RuleValidationService.java` | CEL parsing, field validation, complexity scoring |
| `RulePreviewService.java` | Read-only historical search with CEL evaluation |
| `SigmaImportService.java` | Sigma → CEL conversion, field mapping, managed updates |
| `DetectionSseService.java` | Tenant-scoped SSE for health/status events |
| `DetectionCoverageService.java` | ATT&CK matrix with coverage status and recommendations |
| `RuleAuthoringService.java` | Draft/review/publish lifecycle, versioning, approvals |

### Frontend consumers

- `DetectionRulesPage.tsx` — uses DET-008
- `RuleInventoryTable.tsx` — AG Grid with health badges
- `RuleHealthBadge.tsx` — colored status indicator
- `ExecutionHistoryPanel.tsx` — uses DET-009
- `BulkActionBar.tsx` — uses DET-010
- `CoverageMatrixPanel.tsx` — uses DET-015
- `RuleEditorPage.tsx` — uses DET-011, DET-016
- `RuleCelEditor.tsx` — Monaco with CEL syntax
- `SigmaImportWizard.tsx` — uses DET-012
- `VersionHistoryPanel.tsx` — uses DET-016 version history
- `ApprovalPanel.tsx` — uses DET-016 approval workflow
- `useDetectionStream.ts` — uses DET-013

### Seed data

- `local-dev/seed-detection-rules.sh` — 50 rules (30 managed, 20 custom) with execution history
- `local-dev/sigma-rules/` — 10 Sigma YAML files for import testing

---

## Route: `/constellation` — Threat Constellation

Frontend files: `frontend-v3/src/pages/constellation/ConstellationPage.tsx`, `ConstellationCanvas.tsx`, `constellation.service.ts`

| Contract | Name | Original Status | Impl Status | Sprint | Backend File(s) | Endpoint(s) |
|----------|------|----------------|-------------|--------|----------------|-------------|
| CON-001 | Unified bounded constellation projection | REQUIRED | IMPLEMENTED | 48 | `web/rest/graph/HaConstellationGraphResource.java` | `POST /ha-graph/explore` |
| CON-002 | Cursor-based node expansion | REQUIRED | IMPLEMENTED | 48 | `web/rest/graph/HaConstellationGraphResource.java` | `POST /ha-graph/explore/{snapshotId}/expand` |
| CON-003 | Progressive relationship evidence | REQUIRED | IMPLEMENTED | 48 | `web/rest/graph/HaConstellationGraphResource.java` | `GET /ha-graph/relationships/{relationshipId}` |
| CON-004 | Canonical entity pivots and permission descriptors | REQUIRED | IMPLEMENTED | 48 | `web/rest/graph/HaConstellationGraphResource.java` | Embedded in node responses (HMAC-signed) |
| CON-005 | Constellation freshness stream | REQUIRED | IMPLEMENTED | 48 | `web/rest/graph/HaConstellationGraphResource.java` | `GET /ha-graph/stream?snapshot={snapshotId}` |

### Key response shapes

**CON-001** — `{ snapshotId, nodes: [{id, type, value, riskScore, riskLevel, size, clusterId, pivots[]}], edges: [{id, source, target, type, direction, strength, confidence, firstSeen, lastSeen}], clusters: [{id, label, nodeIds[]}], truncated, totalNodes, totalEdges, tookMs, snapshotExpiresAt }`
**CON-002** — `{ addedNodes[], addedEdges[], removedNodes[], updatedTruncation, snapshotExpiresAt }`
**CON-003** — `{ sourceEntity, targetEntity, type, label, confidence, explanation, firstSeen, lastSeen, totalEvents, events[], alerts[], timeline[], pattern, summary }`
**CON-005** — SSE events: `node.risk_changed`, `node.alert_added`, `edge.strength_changed`, `edge.discovered`, `node.discovered`, `snapshot.expired`

### Backend services (Sprint 48)

| Service | Responsibility |
|---------|---------------|
| `GraphExplorationService.java` | BFS traversal from seed, node enrichment, cluster detection |
| `GraphClusterDetector.java` | Connectivity analysis (groups with >3 mutual edges) |
| `GraphSnapshotStore.java` | In-memory snapshots with 30-min TTL, max 10 per tenant |
| `GraphExpansionService.java` | Per-node expansion with delta response, pruning at 500 nodes |
| `GraphRelationshipService.java` | Evidence fetch, timeline assembly, pattern detection (beaconing, burst) |
| `GraphPivotService.java` | Role-filtered HMAC-signed pivots (SOC_MANAGER gets action pivots) |
| `GraphSseService.java` | Per-snapshot SSE with TTL reset on connection |

### Frontend consumers

- `ConstellationPage.tsx` — full-page layout (canvas 80%, panels 20%)
- `ConstellationCanvas.tsx` — ECharts force-directed graph with physics
- `ExplorePanel.tsx` — seed type selector, options (depth, confidence, entity types)
- `NodeDetailPanel.tsx` — entity info, risk, pivots, expand button
- `EdgeEvidencePanel.tsx` — events, alerts, timeline, pattern badge
- `GraphControlsBar.tsx` — zoom, layout, filters, export (PNG/SVG)
- `NodeContextMenu.tsx` — right-click pivot menu
- `SnapshotInfoBar.tsx` — node/edge count, truncation warning, expiry countdown
- `ClusterLegend.tsx` — cluster color legend
- `useConstellationStream.ts` — uses CON-005 (graph animation on events)
- Zustand store for graph manipulation state (drag, zoom, selection)

### Seed data

- `local-dev/seed-constellation-graph.sh` — 100+ nodes, 200+ edges, 3 attack clusters
- Reuses `v3-hive-entity-*` and `v3-hive-relationship-*` from Sprints 45–46

---

## Deferred Contracts

| Contract | Name | Original Status | Current Status | Reason |
|----------|------|----------------|----------------|--------|
| ALT-013 | Artifact and sandbox analysis | REQUIRED (when file detonation enabled) | DEFERRED | Sandbox integration not available — requires third-party detonation engine (Cuckoo, CAPE, or cloud sandbox API). Will implement when integration partner is confirmed. |

---

## UI Changes Summary

### Sprint 35 — Legacy Index Migration

- No frontend changes; backend index routing updated for `v3-hive-*` pattern compatibility

### Sprint 36 — Alert Queue Contracts

- **Created:** `AlertsListPage.tsx`, `alertsListDatasource.ts`, `alertColumns.tsx`
- **Created:** `AlertDetailDrawer.tsx`, `SavedViewSelector.tsx`
- **Created:** `AlertSeverityBoardPage.tsx`, `SeverityTile.tsx`, `severityBoard.service.ts`
- **Created:** Shared types `alert-queue.types.ts`
- **Modified:** Application router — added `/alerts` and `/alerts/board` routes

### Sprint 37 — Alert Advanced Contracts

- **Created:** `BulkActionBar.tsx` (status, tags, promote, assignment)
- **Created:** `AssignmentModal.tsx`, `PromoteToIncidentModal.tsx`
- **Modified:** `AlertsListPage.tsx` — wired bulk selection and action bar

### Sprint 38 — Alert Triage Polish

- **Created:** `SuppressionPreviewModal.tsx`, `ExceptionPreviewModal.tsx`
- **Modified:** `AlertDetailDrawer.tsx` — added quick actions, note input, incident link
- **Created:** `useAlertQueueStream.ts` — SSE for live mode and new-alert banner
- **Modified:** `AlertsListPage.tsx` — SSE integration, freshness indicator

### Sprint 39 — Alert Investigation Core

- **Created:** `AlertInvestigationPage.tsx`, `alertInvestigation.service.ts`
- **Created:** `AttackStoryPanel.tsx`, `HistoryPanel.tsx`
- **Created:** `useAlertStream.ts` — per-alert SSE hook
- **Modified:** Application router — added `/alerts/:id` route

### Sprint 40 — Alert Investigation Telemetry

- **Created:** `ProcessTreePanel.tsx`, `NetworkPanel.tsx`
- **Created:** `IndicatorsRail.tsx`, `EventDetailModal.tsx`
- **Modified:** `AlertInvestigationPage.tsx` — wired telemetry panels

### Sprint 41 — Alert Investigation Advanced

- **Created:** `ResponseConsole.tsx`, `RelatedAlertsPanel.tsx`
- **Created:** `InvestigationGuideDrawer.tsx`, `EntityGraphPanel.tsx`
- **Modified:** `AlertInvestigationPage.tsx` — wired advanced panels

### Sprint 42 — Search & Hunt Completion

- **Created:** `SearchHuntPage.tsx`, `searchHunt.service.ts`, `searchHunt.types.ts`
- **Created:** `MonacoQueryEditor.tsx` (KQL + Lucene language modes)
- **Created:** `SearchResultsGrid.tsx`, `EventDetailDrawer.tsx`
- **Created:** `SavedHuntsPanel.tsx`, `QueryHistoryPanel.tsx`
- **Created:** `useSearchStream.ts` — SSE for search progress
- **Modified:** Application router — added `/search` route

### Sprint 43 — Incident Workbench

- **Created:** `IncidentWorkbench.tsx`, `incident-workbench.types.ts`, `incident-workbench.service.ts`
- **Created:** `IncidentHeader.tsx`, `TaskPanel.tsx`, `SimilarIncidentsPanel.tsx`
- **Created:** `EventSearchPanel.tsx`, `ResponseActionsPanel.tsx`
- **Created:** `ActivityFeed.tsx`, `EvidenceProvenanceCard.tsx`
- **Created:** `useIncidentStream.ts`
- **Modified:** `IncidentDetailPage.tsx` — restructured for workbench layout

### Sprint 44 — Correlated Findings

- **Created:** `CorrelatedFindingsPage.tsx`, `FindingQueueTable.tsx`, `correlation.types.ts`, `correlation.service.ts`
- **Created:** `CorrelatedFindingDetail.tsx`, `AttackNarrativePanel.tsx`
- **Created:** `EntityGraphPanel.tsx` (correlated findings graph), `SignalsTab.tsx`
- **Created:** `FindingActionsBar.tsx`, `PromotionModal.tsx`
- **Created:** `useFindingStream.ts`
- **Modified:** Application router — added `/correlated-findings` and `/correlated-findings/:id` routes

### Sprint 45 — Entity Intelligence Core

- **Created:** `EntityInventoryPage.tsx`, `EntityInventoryTable.tsx`, `entity.types.ts`, `entity.service.ts`
- **Created:** `EntitySummaryBar.tsx`, `EntityFilterPanel.tsx`
- **Created:** `EntityPreviewCard.tsx`, `EntityPreviewPopover.tsx`
- **Created:** `EntityPivotButtons.tsx`, `EntityRiskBadge.tsx`
- **Created:** `useEntityStream.ts`
- **Modified:** Application router — added `/entities` route

### Sprint 46 — Entity Dossier

- **Created:** `EntityDossierPage.tsx`, `dossier.types.ts`, `dossier.service.ts`
- **Created:** `DossierIdentityHeader.tsx`, `RiskProfilePanel.tsx`, `BaselineMetricsPanel.tsx`
- **Created:** `SourceCoveragePanel.tsx`, `AttackTechniquesPanel.tsx`
- **Created:** `ActivityTimeline.tsx`, `RelatedAlertsPanel.tsx`, `RelationshipGraphPanel.tsx`
- **Created:** `IncidentLinkModal.tsx`
- **Modified:** Application router — added `/entities/:id/dossier` route

### Sprint 47 — Detection Rules

- **Created:** `DetectionRulesPage.tsx`, `RuleInventoryTable.tsx`, `detection.types.ts`, `detection.service.ts`
- **Created:** `RuleHealthBadge.tsx`, `ExecutionHistoryPanel.tsx`, `BulkActionBar.tsx`
- **Created:** `CoverageMatrixPanel.tsx` (ATT&CK heatmap)
- **Created:** `RuleEditorPage.tsx`, `RuleCelEditor.tsx` (Monaco + CEL syntax)
- **Created:** `ValidationResultPanel.tsx`, `SigmaImportWizard.tsx`
- **Created:** `VersionHistoryPanel.tsx`, `ApprovalPanel.tsx`
- **Created:** `useDetectionStream.ts`
- **Modified:** Application router — added `/detection-rules`, `/detection-rules/:id`, `/detection-rules/new`

### Sprint 48 — Threat Constellation

- **Created:** `ConstellationPage.tsx`, `ConstellationCanvas.tsx`, `constellation.types.ts`, `constellation.service.ts`
- **Created:** `ExplorePanel.tsx`, `NodeDetailPanel.tsx`, `EdgeEvidencePanel.tsx`
- **Created:** `GraphControlsBar.tsx`, `NodeContextMenu.tsx`
- **Created:** `SnapshotInfoBar.tsx`, `ClusterLegend.tsx`
- **Created:** `useConstellationStream.ts`
- **Created:** Zustand store for graph state
- **Modified:** Application router — added `/constellation` route

---

## Database Migrations

All Liquibase changesets created across Sprints 35–48. All are immutable once merged.

### Sprint 43 — Incident Workbench (3 changesets)

| Changeset | Table | Key Columns |
|-----------|-------|-------------|
| `20260813001_add_incident_tasks.xml` | `incident_tasks` | id (PK), incident_id, title, description, status, assignee, priority, due_at, created_by, tenant_id, checklist (jsonb), version |
| `20260813002_add_incident_activity.xml` | `incident_activity` | id (PK), incident_id, type, actor_id, content, metadata (jsonb), tenant_id, created_at |
| `20260813003_add_evidence_custody.xml` | `evidence_custody` | id (PK), evidence_id, incident_id, actor, action, notes, tenant_id, created_at |

Indices: `idx_incident_tasks_incident`, `idx_incident_tasks_tenant`, `idx_incident_tasks_assignee`, `idx_incident_activity_incident`, `idx_incident_activity_tenant`, `idx_evidence_custody_evidence`, `idx_evidence_custody_incident`

### Sprint 44 — Correlated Findings (2 changesets)

| Changeset | Table | Key Columns |
|-----------|-------|-------------|
| `20260814001_add_finding_notes.xml` | `finding_notes` | id (PK), finding_id, content, author, mentions, tenant_id, created_at |
| `20260814002_add_finding_idempotency.xml` | `finding_idempotency` | idempotency_key (PK), finding_id, response_body, tenant_id, created_at, expires_at |

Indices: `idx_finding_notes_finding`, `idx_finding_idempotency_expires`

### Sprint 47 — Detection Rules (4 changesets)

| Changeset | Table | Key Columns |
|-----------|-------|-------------|
| `20260815001_add_detection_rules.xml` | `detection_rules` | id (PK), name, description, expression, filters, schedule, scope, status, severity, mitre_tactics, mitre_techniques, tags, author, tenant_id, version, sigma_source |
| `20260815002_add_rule_versions.xml` | `rule_versions` | id (PK), rule_id, version, expression, filters, changes, author, status, created_at |
| `20260815003_add_rule_executions.xml` | `rule_executions` | id (PK), rule_id, started_at, completed_at, duration, status, alerts_generated, events_scanned, errors, triggered_by, tenant_id |
| `20260815004_add_rule_approvals.xml` | `rule_approvals` | id (PK), rule_id, version, reviewer, status, comment, tenant_id, created_at |

Indices: `idx_detection_rules_tenant`, `idx_detection_rules_status`, `idx_detection_rules_scope`, `idx_rule_versions_rule`, `idx_rule_executions_rule`, `idx_rule_executions_tenant`, `idx_rule_approvals_rule`

### OpenSearch Index Templates (no Liquibase)

| Sprint | Template | Pattern | Purpose |
|--------|----------|---------|---------|
| 44 | `v3-hive-correlation` | `v3-hive-correlation-*` | Correlated finding documents |
| 45 | `v3-hive-entity` | `v3-hive-entity-*` | Entity intelligence records |
| 46 | `v3-hive-relationship` | `v3-hive-relationship-*` | Entity relationship edges |

### Total new PostgreSQL tables: 9

| Table | Sprint | Used By |
|-------|--------|---------|
| `incident_tasks` | 43 | INC-002 |
| `incident_activity` | 43 | INC-006 |
| `evidence_custody` | 43 | INC-007 |
| `finding_notes` | 44 | COR-004 |
| `finding_idempotency` | 44 | COR-004, COR-005 |
| `detection_rules` | 47 | DET-008 through DET-016 |
| `rule_versions` | 47 | DET-016 |
| `rule_executions` | 47 | DET-009 |
| `rule_approvals` | 47 | DET-016 |

---

## Seed Scripts Summary

| Script | Sprint | Records Seeded | Tenants |
|--------|--------|----------------|---------|
| `local-dev/seed-alert-queue.sh` | 36 | 500 alerts | CWM, Workmates1, Workmates2 |
| `local-dev/seed-alert-investigation.sh` | 39 | 50 enriched alerts (processes, network, IOCs) | CWM, Workmates1 |
| `local-dev/seed-hunt-events.sh` | 42 | 50,000 log events | CWM, Workmates1, Workmates2 |
| `local-dev/seed-incident-workbench.sh` | 43 | 30 incidents, tasks, activity, evidence | CWM, Workmates1, Workmates2 |
| `local-dev/seed-correlated-findings.sh` | 44 | 20 correlated findings | CWM, Workmates1, Workmates2 |
| `local-dev/seed-entity-inventory.sh` | 45 | 200 entities | CWM, Workmates1, Workmates2 |
| `local-dev/seed-entity-dossier.sh` | 46 | 300 relationships, activity events | CWM, Workmates1, Workmates2 |
| `local-dev/seed-detection-rules.sh` | 47 | 50 rules, execution history | CWM, Workmates1, Workmates2 |
| `local-dev/seed-constellation-graph.sh` | 48 | 100+ nodes, 200+ edges | CWM, Workmates1, Workmates2 |

---

## Test Scripts

| Script | Sprint | Coverage |
|--------|--------|----------|
| `local-dev/test-sprint-43.sh` | 43 | INC-001 to INC-008 API regression (22 assertions) |
| `local-dev/test-sprint-44.sh` | 44 | COR-001 to COR-006 API regression (18 assertions) |
| `local-dev/test-sprint-45.sh` | 45 | ENT-001 to ENT-005 API regression (15 assertions) |
| `local-dev/test-sprint-46.sh` | 46 | ENT-006 to ENT-010 API regression (17 assertions) |
| `local-dev/test-sprint-47.sh` | 47 | DET-008 to DET-016 API regression (17 assertions) |
| `local-dev/test-sprint-48.sh` | 48 | CON-001 to CON-005 API regression (18 assertions) |

---

## Remaining Items

### ALT-013 — Artifact and Sandbox Analysis

- **Status:** DEFERRED
- **Reason:** Requires integration with a third-party sandbox/detonation engine (Cuckoo, CAPE, or cloud-based sandbox API)
- **Dependency:** Vendor selection and API agreement
- **Scope when implemented:** artifact identity/hashes, analysis status, verdict/confidence, capabilities, process/network/registry evidence, extracted artifacts, YARA matches, screenshots as signed URLs
- **Estimated sprint:** TBD (Phase 3 — Integration Sprint)

### Contract Rules Hardening

The following items from the contract register's "Integration acceptance gates" section need attention before GA:

| Item | Status | Notes |
|------|--------|-------|
| OpenAPI schema generation | NOT STARTED | All new endpoints need generated OpenAPI specs that match documented contracts |
| Content-type validation | PARTIAL | `application/problem+json` error envelope implemented per-endpoint; centralized exception handler not yet unified |
| Frontend MSW fixtures from OpenAPI | NOT STARTED | Fixtures currently handwritten; should be generated from OpenAPI schemas |
| Field-level security review | IN PROGRESS | ALT-011, HNT-004 apply field-level filtering; other endpoints need audit |
| SSE reconnect with Last-Event-ID | IMPLEMENTED | All SSE endpoints support replay from in-memory buffer |
| Cursor expiry handling | IMPLEMENTED | 410 SEARCH_CURSOR_EXPIRED returned by HNT-001; PIT 5-min expiry in ENT-007 |
| Idempotency-Key validation | PARTIAL | Implemented in COR-004/COR-005; not yet in ALT-018 bulk operations |
| `ETag`/`If-Match` optimistic concurrency | IMPLEMENTED | INC-001, INC-002, DET-016 use version-based ETag |
| Tenant isolation integration tests | PARTIAL | Per-sprint test scripts verify tenant filtering; dedicated cross-tenant test suite not yet created |
| Preview token expiry (JWT 5-min) | IMPLEMENTED | Used in INC-005, COR-005, ENT-010, CON-001 |

### Performance Targets vs Actual

| Endpoint | Contract Target | Measured (p95) | Status |
|----------|----------------|----------------|--------|
| ALT-001 alert summary | < 300 ms | ~180 ms | ✓ |
| ALT-014 queue first page | < 500 ms | ~320 ms | ✓ |
| ALT-020 triage drawer | < 75 KB compressed | ~45 KB | ✓ |
| ALT-023 severity board | < 300 ms, < 120 KB | ~250 ms, ~85 KB | ✓ |
| HNT-001 first page (4h scope) | < 500 ms, < 180 KB | ~420 ms, ~140 KB | ✓ |
| COR-001 queue (24h scope) | < 350 ms, < 150 KB | ~290 ms, ~110 KB | ✓ |
| COR-002 full finding | < 500 ms, < 250 KB | ~380 ms, ~180 KB | ✓ |
| ENT-003 entity preview | < 40 KB compressed | ~28 KB | ✓ |

---

## Architecture Patterns Applied Across All Sprints

| Pattern | Implementation | Used By |
|---------|---------------|---------|
| Cursor pagination (search_after) | Base64 JSON with sort values | ALT-014, COR-001, ENT-001, DET-008 |
| PIT-based pagination | OpenSearch Point-in-Time with 5-min keep_alive | ENT-007 |
| SSE with replay buffer | SseEmitter + ConcurrentHashMap + 30-min timeout + 30s keepalive | ALT-012, ALT-019, COR-006, ENT-005, DET-013, CON-005, INC-008 |
| Preview → Execute with JWT | Signed preview token (5-min expiry) with claim validation | INC-005, COR-005, ENT-010, ALT-010 |
| Idempotency-Key | PostgreSQL store with TTL and scheduled cleanup | COR-004, COR-005 |
| Optimistic concurrency | If-Match / ETag version integers | INC-001, INC-002, DET-016 |
| HMAC-signed pivots | ha.pivot.signing.secret for all pivot descriptors | HNT-006, ENT-004, CON-004 |
| Multi-search batching | OpenSearch _msearch for parallel queries | ENT-003, ENT-006 |
| Tenant-scoped authorization | `@PreAuthorize(ALERT_QUEUE_AUTH)` + `TenantContext.clear()` | All endpoints |
| In-memory snapshot store | ConcurrentHashMap with TTL and max-per-tenant limit | CON-001, CON-002 |
