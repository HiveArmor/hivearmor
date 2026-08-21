# 09 — Workflow Audit
## HiveArmor frontend-v3

**Audit date:** 2026-07-25
**Evidence:** router/index.tsx, AlertContextDrawer.tsx, IncidentDetailPage.skip.ts, InvestigationsPage.tsx, SearchHuntPage.skip.ts, backend-to-ui-capability-matrix.md

For each workflow, every step is traced end-to-end: confirmed (file+line evidence), partially broken, or completely missing.

---

## Workflow 1: Alert Triage

**Expected flow:** List → Filter → Detail Drawer → Status Change → Note → Tag → Convert to Incident

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. Alert list with grid | AlertsListPage shows alerts grid | PARTIALLY_IMPLEMENTED | AlertsListPage.tsx present; alerts.service.skip.ts — service stubbed | Service calls are stub-only |
| 2. Filter alerts | FilterChipsRow, LiveModeToggle | PARTIALLY_IMPLEMENTED | FilterChipsRow.tsx, LiveModeToggle.tsx both exist as shared components | Not verified wired into AlertsListPage |
| 3. Open detail drawer | AlertContextDrawer opens on row click | PARTIALLY_IMPLEMENTED | AlertContextDrawer.tsx and .test.tsx present | Drawer existence confirmed; trigger mechanism not verified |
| 4. Change status | POST /api/ha-alerts/status | BROKEN | Endpoint exists but UNPROTECTED (SEC-GAP-01); alerts.service.skip.ts stubs the call | SEC-GAP-01 must be fixed; service unstubbed |
| 5. Add note | POST /api/ha-alerts/notes | BACKEND_READY_UI_MISSING | Endpoint exists (UNPROTECTED); no NoteForm component found in active code | Implement NoteForm |
| 6. Add tag | POST /api/ha-alerts/tags | BACKEND_READY_UI_MISSING | Endpoint exists (UNPROTECTED); no TagEditor found | Implement TagEditor |
| 7. Convert to incident | POST /api/ha-alerts/convert-to-incident | BACKEND_READY_UI_MISSING | Endpoint exists (UNPROTECTED); no ConvertToIncidentDialog found | Implement dialog |

**Overall Workflow Status: BROKEN**
Steps 4-7 are broken or missing. An analyst cannot complete a full triage cycle.

**Blocking issues:**
- alerts.service.skip.ts stubs ALL alert service calls
- SEC-GAP-01: All alert mutation endpoints unprotected

---

## Workflow 2: Correlated Findings Review

**Expected flow:** Findings List → Filter → Detail → Related Alerts → Promote to Incident

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. Findings list | CorrelatedFindingsPage at /offenses | PARTIALLY_IMPLEMENTED | .tsx active in router; offenses.service.skip.ts stubs service | Service stubbed |
| 2. Filter findings | FilterChipsRow, time range | PARTIALLY_IMPLEMENTED | Components exist; wiring unverified | — |
| 3. Open finding detail | CorrelatedFindingDetailPage at /offenses/:id | PARTIALLY_IMPLEMENTED | .tsx active; .skip.ts also exists | Detail limited |
| 4. View related alerts | GET /api/offenses/{id}/alerts | BACKEND_READY_UI_MISSING | Endpoint exists; no RelatedAlertsPanel found | Implement panel |
| 5. Promote to incident | POST /api/ha-incidents with alertIds | BACKEND_READY_UI_MISSING | Endpoint exists (UNPROTECTED); no dialog | Implement dialog |
| 6. Change finding status | PUT /api/offenses/{id} | INTENTIONALLY DISABLED | Groovy injection SEC-GAP-05; frontend correctly disables this | Leave disabled |

**Overall Workflow Status: BROKEN**
Steps 4-5 missing; service stub prevents steps 1-3 from loading real data.

---

## Workflow 3: Incident Lifecycle

**Expected flow:** Create → Assign → Add Alerts → Status Change → SLA tracking → Evidence → Close

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. Create incident | CreateIncidentDialog | BACKEND_READY_UI_MISSING | POST /api/ha-incidents exists (UNPROTECTED); no dialog | Implement dialog |
| 2. Assign to analyst | AssigneeControl | BACKEND_READY_UI_MISSING | PUT /api/ha-incidents/{id} exists; no assignee control | Implement |
| 3. Add alerts to incident | AddAlertsDialog | BACKEND_READY_UI_MISSING | POST /api/ha-incidents/add-alerts exists; no dialog | Implement |
| 4. Status change | StatusChipRenderer (in incidents page) | PARTIALLY_IMPLEMENTED | StatusChipRenderer.tsx found; wiring in IncidentDetailPage unverified due to .skip.ts | Unstub IncidentDetailPage |
| 5. SLA tracking | SlaIndicator component | PARTIALLY_IMPLEMENTED | SlaIndicator.tsx and .test.tsx exist; not wired to incident list/detail | Wire SlaIndicator |
| 6. Incident priority | PriorityControl | BACKEND_READY_UI_MISSING | PUT /api/ha-incidents/{id}/priority exists; no priority control | Implement |
| 7. Add evidence | EvidenceCard / EvidencePanel | BACKEND_READY_UI_MISSING | EvidenceCard.tsx component exists; not wired to incident detail | Wire to evidence-items endpoint |
| 8. View timeline | IncidentTimeline | BACKEND_READY_UI_MISSING | GET /api/ha-incidents/{id}/timeline VERIFIED PROTECTED; no timeline component wired | Implement timeline panel |
| 9. AI summary | AiSummaryBlock | BACKEND_READY_UI_MISSING | POST /api/ha-incidents/{id}/ai-summary VERIFIED PROTECTED; not implemented | Implement |
| 10. Close incident | Status → 'closed' | PARTIALLY_IMPLEMENTED | Status control exists (partial) | Complete status control |

**Overall Workflow Status: BROKEN**
8 of 10 steps are broken or missing. Incident lifecycle is not executable end-to-end.

---

## Workflow 4: Evidence Chain

**Expected flow:** Create evidence item → Attach to incident → Board placement → Relationship

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. Add evidence item | AddEvidenceDialog | BACKEND_READY_UI_MISSING | POST /api/ha-incidents/{id}/evidence-items VERIFIED PROTECTED; no dialog | Implement |
| 2. Edit evidence item | EvidenceItemEditForm | BACKEND_READY_UI_MISSING | PUT endpoint VERIFIED PROTECTED; no form | Implement |
| 3. Delete evidence | EvidenceItemDeleteControl | BACKEND_READY_UI_MISSING | DELETE endpoint VERIFIED PROTECTED; no control | Implement |
| 4. View evidence board | EvidenceBoard | MISSING | POST/GET /api/ha-incidents/{id}/evidence-boards VERIFIED PROTECTED; no board component | Implement |
| 5. Link evidence (relationship) | LinkEvidenceDialog | MISSING | POST /api/ha-incidents/{id}/evidence-relationships VERIFIED PROTECTED; no component | Implement |
| 6. View relationship graph | EvidenceRelationshipGraph | MISSING | GET endpoint VERIFIED PROTECTED; no graph | Implement |

**Overall Workflow Status: MISSING**
All 6 steps are missing from the UI. The backend is fully built and protected for this workflow — it is purely a frontend gap.

---

## Workflow 5: Investigation Sessions

**Expected flow:** Create session → Pin events → Add entities → Convert to incident → Export

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. View sessions list | InvestigationsPage | PARTIALLY_IMPLEMENTED | InvestigationsPage.tsx active | Backend wiring partial |
| 2. Create session | StartInvestigationDialog | BACKEND_READY_UI_MISSING | POST /api/ha-investigation-sessions VERIFIED PROTECTED; no dialog | Implement |
| 3. Open session detail | InvestigationDetailPage | PARTIALLY_IMPLEMENTED | InvestigationDetailPage.tsx active | Limited functionality |
| 4. Pin events from search | (pin mechanism in search) | MISSING | No pin button in SearchHuntPage or session detail | Implement |
| 5. Add items to session | Session items panel | BACKEND_READY_UI_MISSING | POST /api/ha-investigation-sessions/{id}/items VERIFIED PROTECTED; no panel | Implement |
| 6. View session items | Session items list | BACKEND_READY_UI_MISSING | GET /api/ha-investigation-sessions/{id}/items VERIFIED PROTECTED; no list | Implement |
| 7. Convert to incident | ConvertSessionToIncidentButton | BACKEND_READY_UI_MISSING | POST /api/ha-investigation-sessions/{id}/convert-to-incident VERIFIED PROTECTED; not built | Implement |
| 8. Export session | Export button | MISSING | No export functionality; no backend export endpoint | FULL_STACK_DEVELOPMENT_REQUIRED |

**Overall Workflow Status: BROKEN**
Steps 2-8 are missing or broken. Backend is ready for steps 1-7.

---

## Workflow 6: Search & Hunt

**Expected flow:** Select dataset → Set time range → Enter query → View histogram → Results grid → Event drawer → Add as evidence

| Step | Expected Component/Action | Status | Evidence | Gap |
|---|---|---|---|---|
| 1. Open search page | SearchHuntPage at /hunt | STATIC_UI_ONLY | SearchHuntPage.skip.ts — entire page stubbed | Implement full page |
| 2. Dataset selector | DatasetSelector | MISSING | Not found | Implement |
| 3. Time range picker | TimeRangeSelector component | PARTIALLY_IMPLEMENTED | TimeRangeSelector.tsx and .test.tsx exist as shared component | Wire into SearchHuntPage |
| 4. Query editor (Monaco) | Monaco query bar | MISSING | Monaco is in package.json; DataParsingPage uses lazy import; not in SearchHuntPage | Implement query bar |
| 5. Submit query | POST /api/ha-search/nl-query | BROKEN | Endpoint VERIFIED PROTECTED; SearchHuntPage.skip.ts stubs it | Unstub page |
| 6. Histogram display | EventHistogramChart | MISSING | No histogram component found | FULL_STACK_DEVELOPMENT_REQUIRED (no histogram endpoint) |
| 7. Results grid | Event data grid | MISSING | Not implemented | Implement |
| 8. Event detail drawer | EventDetailDrawer | MISSING | Not found | Implement |
| 9. Add event as evidence | Add to investigation | MISSING | Not found | Implement |
| 10. Save query | SaveQueryDialog | BACKEND_READY_UI_MISSING | POST /api/ha-saved-queries VERIFIED PROTECTED; no dialog | Implement |

**Overall Workflow Status: MISSING**
10 of 10 steps are missing or broken. Search & Hunt is the most critical missing workflow.

---

## Workflow Priority Summary

| Workflow | Overall Status | Critical Path Blockers | Estimated Frontend Sessions |
|---|---|---|---|
| Alert Triage | BROKEN | alerts.service.skip.ts; SEC-GAP-01 | 3-4 sessions |
| Correlated Findings | BROKEN | offenses.service.skip.ts; SEC-GAP-05 | 2 sessions |
| Incident Lifecycle | BROKEN | Multiple missing components; SEC-GAP-17 | 5-6 sessions |
| Evidence Chain | MISSING | Frontend only — backend ready | 3 sessions |
| Investigation Sessions | BROKEN | Multiple missing dialogs | 3 sessions |
| Search & Hunt | MISSING | SearchHuntPage.skip.ts; no histogram endpoint | 4-5 sessions |

**Total unblocked frontend work (backend exists): ~18-21 sessions**
**Work blocked on backend security fixes: SEC-GAP-01, 05, 17 must be resolved first**
