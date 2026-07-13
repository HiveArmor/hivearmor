# UTMStack v11 Frontend UI Audit Report
**Date**: 2026-06-30
**App URL**: http://localhost:8880
**Angular Version**: 17.3.12
**Pages Audited**: 20

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total pages audited | 20 |
| Pages that loaded successfully | 20 |
| Pages that redirected | 18 |
| 🔴 Critical issues | 1 |
| 🟠 Major issues | 37 |
| 🟡 Minor issues | 0 |

### Key Observations

- Login credentials tested: admin/admin@123
- Backend services: eventprocessor and agentmanager are unhealthy in local dev — some data pages will show empty states (expected)
- Audit scope: UI structure, layout, navigation, component rendering

---

## Issues by Severity

### 🔴 CRITICAL (Blocks core workflow)

- **/**: No username input field found

### 🟠 MAJOR (Feature broken/unusable)

- **/getting-started**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/getting-started**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/dashboard**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/dashboard**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/dashboard/view/1**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/dashboard/view/1**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/data**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/data**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/discover**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/discover**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/data-sources**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/data-sources**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/integrations**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/integrations**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/app-management**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/app-management**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/soar**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/soar**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/incident**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/incident**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/compliance**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/compliance**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/data-parsing**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/data-parsing**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/active-directory**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/active-directory**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/alerting-rules**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/alerting-rules**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/threat-intelligence**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/threat-intelligence**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/creator**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/creator**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/variables**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/variables**: 1 network error(s): HTTP 401: http://localhost:8880/api/account
- **/management**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/profile**: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- **/profile**: 1 network error(s): HTTP 401: http://localhost:8880/api/account

### 🟡 MINOR (Cosmetic / alignment / UX)

_No minor issues found._

---

## Page-by-Page Findings

### `/` — login

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ✅ None |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ✅ None |
| Screenshot | `screenshots/login.png` |

**Issues Found on This Page:**
- 🔴 `CRITICAL`: No username input field found

---

### `/getting-started` — getting-started

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/getting-started`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/getting-started.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/dashboard` — dashboard-overview

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/dashboard`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/dashboard-overview.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/dashboard/view/1` — dashboard-view-1

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/dashboard/view/1`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/dashboard-view-1.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/data` — data-alerts

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/data`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/data-alerts.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/discover` — discover

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/discover`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/discover.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/data-sources` — data-sources

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/data-sources`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/data-sources.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/integrations` — integrations

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/integrations`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/integrations.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/app-management` — app-management

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/app-management`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/app-management.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/soar` — soar

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/soar`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/soar.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/incident` — incident

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/incident`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/incident.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/compliance` — compliance

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/compliance`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/compliance.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/data-parsing` — data-parsing

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/data-parsing`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/data-parsing.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/active-directory` — active-directory

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/active-directory`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/active-directory.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/alerting-rules` — alerting-rules

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/alerting-rules`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/alerting-rules.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/threat-intelligence` — threat-intelligence

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/threat-intelligence`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/threat-intelligence.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/creator` — creator

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/creator`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/creator.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/variables` — variables

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/variables`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/variables.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

### `/management` — management

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/management` |
| Page title | Your request cannot be processed |
| H1 | Your request cannot be processed |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | — |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ✅ None |
| Screenshot | `screenshots/management.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)

---

### `/profile` — profile

| Field | Value |
|-------|-------|
| Page loaded | ✅ Yes |
| Final URL | `http://localhost:8880/` |
| Redirected | ⚠️ Yes (from `/profile`) |
| Page title | UTMSTACK Technology |
| H1 | NilaChakra |
| Sidebar / nav | ⚠️ Not found |
| Breadcrumb | — Not present |
| Date/time filter | — Not found |
| Search input | — Not found |
| Broken images | ✅ None |
| Stuck spinners | ✅ None |
| Disabled buttons | Sign In |
| Console errors | ❌ 1 |
| Console warnings | ✅ None |
| API 404s | ✅ None |
| Other network errors | ❌ 1 |
| Screenshot | `screenshots/profile.png` |

**Console Errors:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Network Errors (non-404):**
- `HTTP 401: http://localhost:8880/api/account`

**Issues Found on This Page:**
- 🟠 `MAJOR`: 1 JS console error(s): Failed to load resource: the server responded with a status of 401 (Unauthorized)
- 🟠 `MAJOR`: 1 network error(s): HTTP 401: http://localhost:8880/api/account

---

## Appendix: Navigation Links Observed

_No navigation links collected._

---
*Generated by UTMStack Automated UI Audit — 2026-06-30*
