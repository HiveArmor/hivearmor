# F-04: Logstash Pipeline & Filter Management

**Priority:** Tier 1 — Operations Critical  
**Effort:** 3 days  
**Impact:** 🟠 High — ops team cannot manage log parsing without this

---

## What Exists Today

### Backend (COMPLETE)
- `UtmLogstashPipelineResource.java` — CRUD for pipelines
- `UtmLogstashFilterGroupResource.java` — filter group management
- `UtmFilterResource.java` — individual filter CRUD
- DB tables: `utm_logstash_pipeline`, `utm_logstash_filter`, `utm_logstash_filter_group`

### Legacy Angular UI (COMPLETE — reference for features)
- `/frontend/src/app/logstash/logstash-pipelines/` — full pipeline management
- `/frontend/src/app/logstash/logstash-filters/` — full filter management

### New UI (`/data-parsing/page.tsx`)
- Has a nice UI shell with pipeline stages, filter editor
- ALL static — hardcoded sample data, no API calls
- Has Monaco editor for filter code

---

## What Needs to Be Built

### 1. Logstash service (`src/services/logstash.service.ts`)
```typescript
listPipelines()                   → GET /api/utm-logstash-pipelines
getPipeline(id)                   → GET /api/utm-logstash-pipelines/{id}
createPipeline(body)              → POST /api/utm-logstash-pipelines
updatePipeline(id, body)          → PUT /api/utm-logstash-pipelines/{id}
deletePipeline(id)                → DELETE /api/utm-logstash-pipelines/{id}
listFilterGroups()                → GET /api/utm-logstash-filter-groups
createFilterGroup(body)           → POST /api/utm-logstash-filter-groups
listFilters(groupId)              → GET /api/utm-logstash-filters?groupId=X
createFilter(body)                → POST /api/utm-logstash-filters
updateFilter(id, body)            → PUT /api/utm-logstash-filters/{id}
deleteFilter(id)                  → DELETE /api/utm-logstash-filters/{id}
testFilter(config, sampleLog)     → POST /api/utm-logstash-filters/test (verify)
```

### 2. Rewrite `/data-parsing/page.tsx`
Current tabs to wire up:
- **Pipelines tab**: list from API, create/delete/toggle active
- **Filters tab**: grouped by filter group, CRUD with Monaco editor
- **Test tab**: keep as-is (test filter against sample log, call backend test endpoint)

### 3. Pipeline Status Monitoring
- Show each pipeline's health: active/inactive, last update, error count
- "Reload pipeline" button → POST restart signal

### 4. Filter Import/Export
- Export filters as JSON
- Import filter pack from JSON file
- Relevant because `filters/` directory has 20+ pre-built filter packs

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/services/logstash.service.ts` |
| MODIFY | `src/app/(app)/data-parsing/page.tsx` — replace static with real API |

---

## 📋 SESSION PROMPT

```
I want to implement F-04: Logstash Pipeline & Filter Management for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind, @monaco-editor/react)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/data-parsing/page.tsx — complete UI with Monaco editor, static data
- No service file for logstash management exists yet

Backend APIs (verified in UtmLogstashPipelineResource.java and UtmFilterResource.java):
- GET/POST/PUT/DELETE /api/utm-logstash-pipelines
- GET/POST/PUT/DELETE /api/utm-logstash-filter-groups
- GET/POST/PUT/DELETE /api/utm-logstash-filters

Reference implementation (for UX patterns): 
- Look at /frontend/src/app/logstash/ for the Angular implementation to understand the data model

What to build:
1. src/services/logstash.service.ts — all CRUD methods with TypeScript types
2. Rewrite data-parsing/page.tsx to use real API data:
   - Pipelines tab: list, create, delete, toggle active/inactive
   - Filters tab: list by group, edit with Monaco, save, delete
   - Test tab: send sample log + filter config to backend, show parsed result
3. Filter import (JSON file upload) and export

Read the current data-parsing/page.tsx fully before modifying.
Read UtmLogstashPipelineResource.java and UtmFilterResource.java for exact API shapes.
Monaco editor is already used in the page — keep it.
```
