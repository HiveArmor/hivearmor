# Alert & Severity Board Contract Implementation Audit

Date: 2026-08-06  
Based on: `docs/frontend-backend-contract-register.md`  
Sprints completed: 35, 36, 37

---

## Summary

| Section | Contracts | Implemented | Remaining |
|---------|-----------|-------------|-----------|
| Alert Queue (`/alerts`) | ALT-014 to ALT-022 | ALT-014 ✓, ALT-015 ✓, ALT-016 ✓, ALT-017 ✓, ALT-018 ✓, ALT-019 ✓, ALT-020 (partial), ALT-022 (partial) | ALT-020 (triage drawer), ALT-021 ✓, ALT-022 (full quick actions) |
| Severity Board (`/alerts/board`) | ALT-023 | ALT-023 ✓ | — |
| Alert Investigation (`/alerts/:id`) | ALT-001 to ALT-013 | ALT-001 (partial via detail endpoint) | ALT-002–ALT-013 all REQUIRED |
| Search & Hunt (`/search`) | HNT-001 to HNT-009 | HNT-001 ✓, HNT-003 (partial) | HNT-002, HNT-004–HNT-009 |
| Suppression/Exception | ALT-021 | ALT-021 ✓ | — |

---

## IMPLEMENTED (Sprint 35/36/37)

### Sprint 35 — Legacy Index Migration
- ✅ All `SYS_INDEX_PATTERN` references migrated to `MsspIndexResolver`
- ✅ Tenant isolation verified across alert, overview, and elasticsearch services
- ✅ `SystemIndexPattern` enum removed

### Sprint 36 — Alert Queue Contracts (ALT-014 through ALT-019)
| Contract | Status | Implementation |
|----------|--------|---------------|
| ALT-014 | ✅ Done | `GET /ha-alerts` — cursor pagination, filters (severity, status, assignee, riskMin, sla, threatIntel, category, tags), KQL parser, multi-sort, projection |
| ALT-015 | ✅ Done | `GET /ha-alerts/summary` — totalApproximate, criticalOpen, slaAtRisk, unassigned, threatIntelMatched, status/severity/category/assignee facets |
| ALT-016 | ✅ Done | `GET/POST/PATCH/DELETE /ha-alert-views` — saved views CRUD, built-in views, set-default |
| ALT-017 | ✅ Done | `GET /ha-alert-assignees` — candidates with queue load; `POST /ha-alerts/bulk/assignment/preview` + execute with idempotency |
| ALT-018 | ✅ Done | `POST /ha-alerts/bulk/status/preview` + execute; `POST /ha-alerts/bulk/tags/preview` + execute; `POST /ha-alerts/bulk/promote/preview` + execute |
| ALT-019 | ✅ Done | `GET /ha-alerts/stream` — SSE with heartbeat, alert.created, alert.updated, summary.updated, Last-Event-ID resume |
| ALT-020 | ⚠️ Partial | `GET /ha-alerts/{id}` returns detail with MITRE, risk breakdown, availableActions, but not full triage drawer shape from the contract |
| ALT-022 | ⚠️ Partial | `availableActions` included in detail; notes + incident-link endpoints exist; but not full quick-action permission model |

### Sprint 37 — Severity Board & Suppression Preview
| Contract | Status | Implementation |
|----------|--------|---------------|
| ALT-021 | ✅ Done | `POST /ha-alerts/{alertId}/suppression-preview` — impact analysis with conditions, volume reduction, affected tenants/datasources, risk prompts |
| ALT-023 | ✅ Done | `GET /ha-alerts/severity-board` — overview, 5 severity lanes, 12-bucket trend, tenant scoping, parameter validation |
| Exception Preview | ✅ Done | `POST /ha-detection-rules/{ruleId}/exceptions/preview` — same impact model as suppression |

### Search & Hunt (baseline from earlier sprint)
| Contract | Status | Implementation |
|----------|--------|---------------|
| HNT-001 | ✅ Done | `POST /ha-hunts/search` — KQL, cursor, histogram, projection, sort, tenant scoping |
| HNT-003 | ⚠️ Partial | `GET /ha-hunts/schema` (field listing); `GET /ha-hunts/search/{id}/fields/{field}/values` (value lookup) |

---

## NOT YET IMPLEMENTED — Alert Investigation Page (ALT-001 full through ALT-013)

These are ALL `REQUIRED` contracts for the Alert Investigation Board page (`/alerts/:id`):

| Contract | Description | Complexity |
|----------|-------------|------------|
| ALT-001 | Full canonical alert investigation summary (rich DTO) | Medium |
| ALT-002 | Ordered attack story & ATT&CK progression | High |
| ALT-003 | Process lineage tree | High |
| ALT-004 | Network activity (connections) | Medium |
| ALT-005 | Indicators, enrichment, provenance | Medium |
| ALT-006 | Entity relationship/correlation graph | High |
| ALT-007 | Related alerts with correlation reasons | Medium |
| ALT-008 | Alert history, notes, capability analysis | Medium |
| ALT-009 | Detection reason & investigation guide | Medium |
| ALT-010 | Response catalog, preview, approval, execution | Very High |
| ALT-011 | Highlighted fields & raw source events | Low-Medium |
| ALT-012 | Live investigation updates (SSE) | Medium |
| ALT-013 | Artifact/sandbox analysis | High (deferred) |

**Note**: The current frontend (`AlertInvestigationPage.tsx`) uses `fetchAlertInvestigation()` which calls `GET /ha-alerts/{id}` and adapts the detail response into the investigation model. It works with degraded data completeness (`dataCompleteness: 'core'`), showing a notice that extended telemetry is unavailable.

---

## NOT YET IMPLEMENTED — Search & Hunt remaining

| Contract | Description | Complexity |
|----------|-------------|------------|
| HNT-002 | Cancellable execution & query diagnostics | Low |
| HNT-004 | Progressive normalized & raw event detail | Medium |
| HNT-005 | Unified Search Manager (saved hunts/history) | Medium |
| HNT-006 | Signed investigation pivots | Medium |
| HNT-007 | Evidence, investigation, incident promotion from search | High |
| HNT-008 | Resumable long-running search updates (SSE) | Medium |
| HNT-009 | Query language capability discovery | Low |

---

## NOT YET IMPLEMENTED — Other routes (not Alert/Severity Board)

| Route | Contracts | Status |
|-------|-----------|--------|
| `/incidents/:id` | INC-001 to INC-008 | All REQUIRED |
| `/correlated-findings` | COR-001 to COR-006 | All REQUIRED |
| `/entities` | ENT-001 to ENT-010 | All REQUIRED |
| `/constellation` | CON-001 to CON-005 | All REQUIRED |
| `/detection-rules` | DET-008 to DET-016 | All REQUIRED |

---

## RECOMMENDED NEXT SPRINTS

### Sprint 38: Alert Triage Drawer Polish (ALT-020, ALT-022 completion)
- Complete the triage drawer projection (rendered reason, entities, rule summary, indicators, evidence fields, occurrence counts, lifecycle actions)
- Full permission-aware quick actions model (per-record `availableActions` in queue rows)
- Notes creation with visibility and version check
- Incident link preview + execute flow

### Sprint 39: Alert Investigation — Core Contracts (ALT-001, ALT-002, ALT-008, ALT-009, ALT-011)
- Full alert investigation summary DTO
- Attack story ordered by stages + ATT&CK progression
- Alert history/activity merge (notes, status changes, correlation updates)
- Detection reason & investigation guide
- Highlighted fields & raw source events

### Sprint 40: Alert Investigation — Telemetry (ALT-003, ALT-004, ALT-005, ALT-007)
- Process lineage tree endpoint
- Network activity endpoint
- Indicators with enrichment & provenance
- Related alerts with correlation reasons

### Sprint 41: Alert Investigation — Advanced (ALT-006, ALT-010, ALT-012)
- Entity relationship/correlation graph
- Response action catalog, preview, execute
- Live SSE investigation updates

### Sprint 42: Search & Hunt Completion (HNT-002, HNT-004–HNT-009)
- Search cancellation & diagnostics
- Event detail (normalized + raw)
- Saved hunts/history manager
- Investigation pivots
- Evidence promotion to incident
- SSE for long-running searches
- Query capability discovery

---

## Bug Fix Applied During Regression

- **Fixed**: `HaAlertViewResource` — added `ROLE_ADMIN` to `@PreAuthorize` annotations (was missing, causing 500 for admin users)
