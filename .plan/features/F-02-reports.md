# F-02: Reports Generation & Scheduling

**Priority:** Tier 1  
**Effort:** 3 days  
**Impact:** 🟠 High — currently 100% mock/static data

---

## What Exists Today

### Backend (COMPLETE)
- `UtmReportResource.java` — GET `/api/utm-reports`
- `UtmReportSectionResource.java` — GET `/api/utm-report-sections`
- `CustomReportsResource.java` — custom report generation
- `ComplianceReportExportResource.java` — export compliance reports
- `UtmComplianceReportScheduleResource.java` — schedule management
- `PdfGeneratorResource.java` — PDF generation via web-pdf service
- DB tables: `utm_report`, `utm_report_section`, `utm_compliance_report_schedule`

### Frontend (STUB — 100% static)
- `/reports/page.tsx` — has UI shell with static `TEMPLATES` array, no API calls
- No download, no generation trigger, no scheduling

---

## What Needs to Be Built

### 1. Reports service (`src/services/report.service.ts`)
```typescript
// Key methods needed:
listTemplates()          → GET /api/utm-reports
listSections(reportId)   → GET /api/utm-report-sections?reportId=X
generate(reportId)       → POST /api/utm-report-generate (verify exact endpoint)
download(reportId)       → GET /api/pdf-report/{id} with blob response
listSchedules()          → GET /api/utm-compliance-report-schedule
createSchedule(body)     → POST /api/utm-compliance-report-schedule
deleteSchedule(id)       → DELETE /api/utm-compliance-report-schedule/{id}
listGenerated()          → GET /api/utm-compliance-report-config
```

### 2. Wire `/reports/page.tsx`
Replace static TEMPLATES with API data:
- Templates tab: load from `listTemplates()`, show real categories
- "Run Now" button: call `generate()`, poll status, show toast
- Download button: `download()` → blob → browser download trigger
- "Generated Reports" tab: load from `listGenerated()`, real timestamps, real sizes

### 3. Schedule Modal
- Frequency picker: Daily / Weekly / Monthly
- Time picker
- Email delivery option (if backend supports)
- CRUD via `UtmComplianceReportScheduleResource`

### 4. Report Viewer
- Preview panel showing report sections
- PDF download button
- Share link (copy URL)

---

## Key Backend API Verification Needed
Before building: run these to confirm exact response shapes:
```bash
# Get auth token first
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')

curl -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/utm-reports
curl -H "Authorization: Bearer $TOKEN" http://localhost:8088/api/utm-report-sections
```

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/services/report.service.ts` |
| CREATE | `src/components/reports/report-schedule-modal.tsx` |
| CREATE | `src/components/reports/report-viewer-drawer.tsx` |
| MODIFY | `src/app/(app)/reports/page.tsx` — replace static with real API |

---

## Test Criteria
1. Templates list loads from API (not static array)
2. "Run Now" generates a report and shows a download button when done
3. PDF downloads as a file
4. Schedule can be created, listed, deleted
5. Empty state shows when no reports exist

---

## 📋 SESSION PROMPT

```
I want to implement F-02: Reports Generation & Scheduling for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088, auth: POST /api/authenticate → {id_token}
- API proxy: src/app/api/[...path]/route.ts

Current state of /frontend-v2/src/app/(app)/reports/page.tsx:
- Complete UI shell with tabs: Templates, Generated Reports, Schedule
- ALL DATA IS STATIC — const TEMPLATES = [...] hardcoded array
- No API calls, no service imports, no real functionality

Backend APIs available (verified in source):
- GET /api/utm-reports → report templates list
- GET /api/utm-report-sections?reportId={id}
- GET /api/utm-compliance-report-schedule → schedules
- POST /api/utm-compliance-report-schedule → create schedule
- DELETE /api/utm-compliance-report-schedule/{id}
- GET /api/utm-compliance-report-config → generated reports list
- POST /api/utm-compliance-report-config → generate report
- GET /api/utm-compliance-report-config/{id}/export → download (returns file)

What to build:
1. src/services/report.service.ts — typed service with all API methods
2. src/components/reports/report-schedule-modal.tsx — create/edit schedule form
3. src/components/reports/report-viewer-drawer.tsx — view generated report
4. Rewrite src/app/(app)/reports/page.tsx — replace all static data with API calls

Requirements:
- Read /frontend-v2/src/services/incident.service.ts first as a pattern reference
- Read the current reports/page.tsx fully before rewriting
- Download should trigger browser file download (blob URL)
- Use toast for success/error feedback (toast component exists at src/components/ui/toast.tsx)
- Loading skeleton while fetching (TableSkeleton exists at src/components/ui/loading-skeleton.tsx)
- Empty state when no data (EmptyState exists at src/components/ui/empty-state.tsx)
```
