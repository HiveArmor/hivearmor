# F-09: Active Directory Deep Features

**Priority:** Tier 2  
**Effort:** 5 days  
**Impact:** 🟠 High — AD monitoring is table stakes for enterprise security

---

## What Exists Today

### Backend
- AD monitoring domain in OpenSearch (AD events indexed as logs)
- No dedicated AD REST resource found — likely served through log/alert pipeline

### Legacy Angular UI (Full Feature Set — reference)
- `/active-directory/dashboard/` — overview + user detail
- `/active-directory/notifications/` — AD-specific alerts
- `/active-directory/tracker/` — behavior tracking per user/group
- `/active-directory/reports/` — AD scheduled reports
- `/active-directory/view/` — full AD tree view

### New UI
- `/active-directory/page.tsx` — overview + user list via API (`api.get`)
- Missing: tracker, notifications config, reports, user detail drill-down, AD tree

---

## What Needs to Be Built

### 1. AD User Detail Page (`/active-directory/[userId]`)
- Full user profile: groups, privileges, last login, login history
- Event timeline: all AD events for this user
- Risk score and anomaly indicators
- "Add to watchlist" button
- "Lock account" / "Reset password" action (if backend supports)

### 2. AD Tracker Page
- Watch specific users, groups, or OUs for behavioral changes
- Alert when: new group membership, privilege escalation, unusual login hour
- CRUD for tracker items via backend (verify if `UtmAuditorUsersResource` covers this)

### 3. AD Event Timeline
- Timeline visualization for AD events (login attempts, group changes, GPO changes)
- Filter by: event type, user, date range
- Powered by OpenSearch log query

### 4. AD Notifications Config
- Configure notification rules specific to AD events
- Trigger: "When user X logs in from new country → send email"
- CRUD for AD notification configs

### 5. AD Reports
- Pre-built AD report templates (privileged users, failed logins, dormant accounts)
- Schedule and export

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/app/(app)/active-directory/[userId]/page.tsx` |
| CREATE | `src/app/(app)/active-directory/tracker/page.tsx` |
| CREATE | `src/components/active-directory/ad-event-timeline.tsx` |
| CREATE | `src/components/active-directory/ad-user-detail.tsx` |
| MODIFY | `src/app/(app)/active-directory/page.tsx` — add user click → detail nav |

---

## 📋 SESSION PROMPT

```
I want to implement F-09: Active Directory Deep Features for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Current state:
- /frontend-v2/src/app/(app)/active-directory/page.tsx — overview + user list, real API wired
- No user detail page exists
- No tracker page exists

Backend APIs to investigate:
- Read /backend/src/main/java/com/nilachakra/web/rest/user_auditor/ directory
- Read /backend/src/main/java/com/nilachakra/web/rest/uba/UbaResource.java (may cover behavioral tracking)
- AD events are indexed in OpenSearch — use elastic.service.ts to query ad-specific indices

Also reference the legacy Angular implementation for the data model:
- /frontend/src/app/active-directory/shared/services/ — contains Angular service files with API calls

What to build:
1. AD User Detail page at /active-directory/[userId]/page.tsx:
   - User profile: groups, privileges, last login
   - Login history timeline (query OpenSearch for this user's events)
   - Risk indicators
2. AD Tracker at /active-directory/tracker/page.tsx:
   - Watch list management: add/remove users and groups to watch
   - Recent tracked events
3. Add user click-through from the existing overview page to user detail

Read the Angular service files in /frontend/src/app/active-directory/shared/services/ for the exact API endpoints — they contain the URL patterns.
```
