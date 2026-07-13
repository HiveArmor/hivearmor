# F-08: Network Asset Scanner (Real API)

**Priority:** Tier 2  
**Effort:** 2 days  
**Impact:** 🟠 High — 100% mock data currently

---

## What Exists Today

### Backend
- Same as F-07: `UtmNetworkScanResource`, `UtmAssetGroupResource`, `UtmAssetTypesResource`

### Frontend (STUB)
- `/scanner/page.tsx` — complete UI, `MOCK_TASKS` + `MOCK_ASSETS` static

---

## What Needs to Be Built

This is a companion to F-07 but focused on asset discovery (network topology) rather than vulnerability findings.

### 1. Rewrite `/scanner/page.tsx`
- Scan Tasks tab: real task list, create, run, delete
- Discovered Assets tab: real asset inventory from API
- Asset detail: hostname, IP, OS, open ports, risk score
- Network topology view: simple force-directed graph of discovered assets (optional, use echarts graph)

### 2. Asset Group Management
- Create/edit asset groups (for organizing discovered assets)
- Assign assets to groups
- Group-based policy application

### 3. Asset Risk Scoring
- Show risk score per asset based on open ports + CVEs
- Sort/filter by risk score

---

## 📋 SESSION PROMPT

```
I want to implement F-08: Network Asset Scanner real API for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/scanner/page.tsx — complete UI, ALL DATA IS MOCK (MOCK_TASKS, MOCK_ASSETS)

Backend APIs:
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmNetworkScanResource.java
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmAssetGroupResource.java
- Read /backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmAssetTypesResource.java

What to build:
1. Wire scanner/page.tsx to real API (can share scanner.service.ts from F-07 if already built)
2. Scan tasks: list, create (IP range + schedule), run, delete
3. Assets: list discovered assets, sort by risk, filter by OS/type
4. Asset Groups: create group, assign assets to group
5. Real-time polling for running scans (every 5s when status=running)

Note: F-07 and F-08 share the same backend service (UtmNetworkScanResource). 
If src/services/scanner.service.ts already exists from F-07, extend it here.
```
