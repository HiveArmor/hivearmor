# F-07: Vulnerability Scanner (Real API)

**Priority:** Tier 2  
**Effort:** 2 days  
**Impact:** 🟠 High — currently 100% mock data

---

## What Exists Today

### Backend (COMPLETE)
- `UtmNetworkScanResource.java` — scan management
- `UtmAssetGroupResource.java` — asset groups
- `UtmAssetTypesResource.java` — asset type catalog
- `UtmPortsResource.java` — port scan data
- DB domain: `network_scan/`

### Frontend (STUB)
- `/vulnerability-scanner/page.tsx` — full UI but all `MOCK_*` data
- `MOCK_OVERVIEW`, `MOCK_TASKS`, `MOCK_RESULTS` — entirely static

---

## What Needs to Be Built

### 1. Scanner service (`src/services/scanner.service.ts`)
```typescript
getOverview()               → GET /api/utm-network-scans/overview (verify)
listScanTasks()             → GET /api/utm-network-scans
getScanTask(id)             → GET /api/utm-network-scans/{id}
createScanTask(body)        → POST /api/utm-network-scans
deleteScanTask(id)          → DELETE /api/utm-network-scans/{id}
runScan(id)                 → POST /api/utm-network-scans/{id}/run (verify)
getScanResults(taskId)      → GET /api/utm-network-scans/{id}/results (verify)
listAssetGroups()           → GET /api/utm-asset-groups
listPorts(assetId)          → GET /api/utm-ports?assetId=X
```

### 2. Rewrite `/vulnerability-scanner/page.tsx`
- Replace all MOCK_ constants with API calls
- Overview KPIs from real data
- Scan task list with real status, real findings count
- Results table with real CVE data (if backend returns CVEs)
- "Create Scan" modal: target IP range, port profile, schedule

### 3. "Create Scan" modal
- Target IP range input (CIDR: 192.168.1.0/24)
- Port profile: Fast / Full / Custom
- Credential profile (for authenticated scans, if supported)
- Schedule: One-time / Recurring

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/services/scanner.service.ts` |
| MODIFY | `src/app/(app)/vulnerability-scanner/page.tsx` — replace MOCK data |

---

## 📋 SESSION PROMPT

```
I want to implement F-07: Vulnerability Scanner real API wiring for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/vulnerability-scanner/page.tsx — complete UI, ALL DATA IS MOCK
- grep for MOCK_OVERVIEW, MOCK_TASKS, MOCK_RESULTS in that file — replace all of these

Backend APIs (from UtmNetworkScanResource.java):
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmNetworkScanResource.java for exact paths
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmAssetGroupResource.java
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmPortsResource.java

What to build:
1. src/services/scanner.service.ts — typed service for scan task management and results
2. Rewrite vulnerability-scanner/page.tsx:
   - Load real scan tasks from API
   - Load real vulnerability results
   - Overview KPIs computed from real data
   - "Create Scan" modal that POSTs to API
   - "Run Now" trigger button
   - Real status polling for running scans (poll every 5s if status=running)

Important: Read the backend resource files FIRST to understand exact API paths and response shapes.
Use existing toast, EmptyState, TableSkeleton components for loading/error states.
```
