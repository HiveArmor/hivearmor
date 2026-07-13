# F-03: Log Analyzer — Saved Queries, Pivot & Timeline

**Priority:** Tier 1  
**Effort:** 4 days  
**Impact:** 🔴 Critical — this IS the core threat hunting tool in any SIEM

---

## What Exists Today

### Backend
- `LogAnalyzerResource.java` — GET/POST `/api/log-analyzer`
- `ElasticsearchResource.java` — direct OpenSearch query proxy
- `UtmSearchAccelerationResource.java` — search acceleration config

### Frontend (PARTIAL — good bones, missing features)
- `/logs/page.tsx` — full log explorer: query bar, field browser, results table, time picker, filters
- `elasticService` — handles OpenSearch queries
- `LogSavedQueries` component exists but only saves to localStorage
- Missing: server-side saved queries, timeline histogram, field stats, pivot to alert/incident

---

## What Needs to Be Built

### 1. Server-side Saved Queries
- `LogAnalyzerResource` handles saved queries on backend
- Modify `LogSavedQueries` component to call `/api/log-analyzer` for CRUD
- Support: save, list, delete, share (copy URL with encoded query)

### 2. Timeline Histogram
- Bar chart above results table showing log count over time
- X-axis: time buckets (auto-scale: 1min/5min/1hr based on range)
- Click bucket → zooms time range to that bucket
- Uses OpenSearch date histogram aggregation

### 3. Field Statistics Panel
- When clicking a field in the field browser, show:
  - Top 10 values (with bar chart showing distribution)
  - Count / % of docs with this field
  - "Filter for value" / "Filter out value" quick buttons
- Driven by OpenSearch `terms` aggregation

### 4. Log Detail Pivot Actions
- In `LogDetailDrawer`, add action buttons:
  - "Create Alert from this log" → navigates to `/alerts` with pre-filled filter
  - "Create Incident" → opens incident create modal pre-filled
  - "Search related logs" → adds source IP / host to query bar
  - "Look up in Threat Intel" → opens `/threat-intel` with IP pre-filled

### 5. Syntax Mode — Natural Language
- Query bar already has `SyntaxMode` (KQL/SQL/natural)
- Wire "natural language" mode to `/api/utm-soc-ai/...` (soc-ai plugin)
  - User types: "show failed logins from 192.168.1.1 last hour"
  - Backend translates to OpenSearch DSL
  - Shows translated query to user before executing

### 6. Column Persistence
- Currently columns reset on page reload
- Save selected columns to `localStorage` (key: `armorsight_log_columns_<index>`)
- Save column widths

---

## Files to Create/Modify

| Action | File |
|---|---|
| MODIFY | `src/components/logs/log-saved-queries.tsx` — add server-side CRUD |
| CREATE | `src/components/logs/log-timeline-histogram.tsx` |
| CREATE | `src/components/logs/log-field-stats-popover.tsx` |
| MODIFY | `src/components/logs/log-detail-drawer.tsx` — add pivot actions |
| MODIFY | `src/components/logs/field-browser.tsx` — trigger field stats on click |
| MODIFY | `src/app/(app)/logs/page.tsx` — add histogram, wire column persistence |
| MODIFY | `src/services/elastic.service.ts` — add histogram aggregation method |

---

## Backend API Verification
```bash
# Saved queries
GET  /api/log-analyzer          # list saved queries
POST /api/log-analyzer          # save query
DELETE /api/log-analyzer/{id}   # delete query

# Histogram aggregation — verify this endpoint
POST /api/elasticsearch/query   # or similar direct query endpoint
```

---

## Test Criteria
1. Save a query → survives page reload, appears in saved list
2. Timeline histogram renders and clicking a bar zooms the time range
3. Click field in field browser → popover shows top values with counts
4. "Create Alert" pivot action works from log detail drawer
5. Natural language query (if soc-ai is running) translates correctly

---

## 📋 SESSION PROMPT

```
I want to implement F-03: Log Analyzer Enhancements for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind, echarts-for-react)
- Backend port: 8088

Current state of log feature:
- /frontend-v2/src/app/(app)/logs/page.tsx — full explorer: query bar, field browser, results table
- /frontend-v2/src/services/elastic.service.ts — OpenSearch query service
- /frontend-v2/src/components/logs/log-saved-queries.tsx — saves to localStorage only
- /frontend-v2/src/components/logs/log-detail-drawer.tsx — shows full log fields
- /frontend-v2/src/components/logs/field-browser.tsx — left panel field list

Backend APIs:
- GET/POST/DELETE /api/log-analyzer — server-side saved queries
- POST /api/elasticsearch/query (verify exact path from ElasticsearchResource.java)
- The backend uses OpenSearch; date histogram aggregation is supported

What to build (in order):
1. Upgrade LogSavedQueries to use /api/log-analyzer for server-side save/list/delete (keep localStorage as cache)
2. Create src/components/logs/log-timeline-histogram.tsx — date histogram bar chart above results
3. Create src/components/logs/log-field-stats-popover.tsx — top values for a field (shown when clicking field in field browser)
4. Add pivot actions to log-detail-drawer.tsx: "Create Alert", "Search related", "Threat Intel lookup"
5. Column selection persistence via localStorage

Read each file fully before modifying. Read /frontend-v2/src/services/elastic.service.ts first.
Use echarts-for-react for histogram (already installed). 
Use existing toast, EmptyState, TableSkeleton components.
```
