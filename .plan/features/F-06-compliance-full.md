# F-06: Compliance Framework (Full Implementation)

**Priority:** Tier 2  
**Effort:** 5 days  
**Impact:** 🟠 High — compliance is a major enterprise SIEM selling point

---

## What Exists Today

### Backend (COMPLETE)
- `UtmComplianceStandardResource.java` — frameworks (HIPAA, PCI, ISO27001, NIST, SOC2)
- `UtmComplianceStandardSectionResource.java` — framework sections
- `UtmComplianceControlConfigResource.java` — control configuration
- `UtmComplianceControlLatestEvaluationResource.java` — latest evaluation results
- `UtmComplianceControlEvaluationHistoryResource.java` — historical evaluations
- `UtmComplianceReportConfigResource.java` — report configuration
- `UtmComplianceReportScheduleResource.java` — scheduling
- `ComplianceReportExportResource.java` — export
- `HipaaResource.java` — HIPAA specific
- `CustomComplianceResource.java` — custom compliance frameworks
- Plugin: `plugins/compliance-orchestrator/` — automated control evaluation

### Frontend (PARTIAL)
- `/compliance/page.tsx` — has 3 tabs: posture, reports, schedule
- Posture tab uses `DEMO_FRAMEWORKS` static data
- Reports tab calls real API (compliance report config)
- Schedule tab is partial

---

## What Needs to Be Built

### 1. Compliance service (`src/services/compliance.service.ts`)
```typescript
listStandards()
getStandard(id)
listSections(standardId)
listControls(sectionId)
getLatestEvaluation(standardId)
getEvaluationHistory(controlId, dateRange)
runEvaluation(standardId)
listReports()
createReport(body)
scheduleReport(body)
exportReport(id)
```

### 2. Rewrite Posture Tab
- Replace `DEMO_FRAMEWORKS` with real data from `listStandards()` + `getLatestEvaluation()`
- Framework cards: each framework with pass/fail counts, overall score %
- Click framework → drill down to section view
- Section view → control list with pass/fail status
- Control detail: rule mapping, last evaluation timestamp, remediation guidance

### 3. Control Evaluation History
- Timeline chart per control showing pass/fail over time
- Trigger manual re-evaluation
- Link to the alert/log that caused a failure

### 4. Custom Compliance Framework Builder
- Use `CustomComplianceResource`
- Create custom framework with custom controls
- Map controls to correlation rules or log queries

### 5. Compliance Dashboard Widget
- Add compliance score widget to main dashboard
- Shows top 3 failing controls with links

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/services/compliance.service.ts` |
| CREATE | `src/components/compliance/compliance-control-detail.tsx` |
| CREATE | `src/components/compliance/compliance-eval-history-chart.tsx` |
| CREATE | `src/components/compliance/compliance-custom-builder.tsx` |
| MODIFY | `src/app/(app)/compliance/page.tsx` — replace DEMO data, add eval history |
| MODIFY | `src/app/(app)/dashboard/page.tsx` — add compliance widget |

---

## 📋 SESSION PROMPT

```
I want to implement F-06: Full Compliance Framework for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind, echarts-for-react)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/compliance/page.tsx — 3 tabs, posture tab uses DEMO_FRAMEWORKS static data
- Reports tab has partial real API calls
- src/components/compliance/ has: compliance-posture-kpi.tsx, compliance-framework-heatmap.tsx, compliance-trend-chart.tsx, compliance-control-drawer.tsx

Backend APIs (verified):
- GET /api/utm-compliance-standard — list frameworks
- GET /api/utm-compliance-standard-section?standardId={id}
- GET /api/utm-compliance-control-config?sectionId={id}
- GET /api/utm-compliance-control-latest-evaluation?standardId={id}
- GET /api/utm-compliance-control-evaluation-history?controlId={id}
- POST /api/hipaa (HIPAA evaluation trigger)
- GET/POST/DELETE /api/utm-compliance-report-config
- GET/POST/DELETE /api/utm-compliance-schedule
- GET /api/utm-compliance-report-config/{id}/export

What to build:
1. src/services/compliance.service.ts — full typed service
2. Replace DEMO_FRAMEWORKS in compliance/page.tsx with real API data
3. Framework drill-down: framework → sections → controls → control detail with evaluation history
4. src/components/compliance/compliance-eval-history-chart.tsx — timeline chart of pass/fail
5. Trigger manual evaluation button per framework

Read the existing compliance component files before modifying the page.
Read UtmComplianceStandardResource.java and UtmComplianceControlLatestEvaluationResource.java for exact response shapes.
```
