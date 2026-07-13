# F-05: Getting Started Wizard

**Priority:** Tier 1  
**Effort:** 2 days  
**Impact:** 🟡 Medium-High — critical for new installs and demos

---

## What Exists Today

### Backend
- `UtmGettingStartedResource.java` — manages checklist state
- `GettingStartedInit.java` + `GettingStartedComplete.java` — DTOs

### Legacy Angular UI
- `/getting-started` route existed but was behind auth

### New UI
- Missing entirely — no route, no component

---

## What Needs to Be Built

### Route: `/getting-started`
Show after first login if checklist not complete.
Also accessible from nav (help menu or profile dropdown).

### Checklist Steps
Based on UTMStack's original getting-started flow:
1. ✅ Platform installed (auto-complete)
2. ⬜ Connect first agent / data source
3. ⬜ Verify logs are flowing (check log count in OpenSearch)
4. ⬜ Review pre-built dashboards
5. ⬜ Configure notification channel (email/Slack/webhook)
6. ⬜ Create first custom correlation rule
7. ⬜ Run your first compliance check

### UI Pattern
- Progress bar at top (X of 7 steps complete)
- Each step: icon, title, description, "Do it →" link to relevant page
- "Skip for now" per step
- Confetti/celebration on 100% complete
- Persist state via `UtmGettingStartedResource`

### Auto-redirect Logic
- After login, check if getting-started is complete
- If not complete AND first login: redirect to `/getting-started`
- If skipped: show "Getting Started" chip in nav header

---

## Files to Create/Modify

| Action | File |
|---|---|
| CREATE | `src/app/(app)/getting-started/page.tsx` |
| CREATE | `src/components/getting-started/checklist-step.tsx` |
| CREATE | `src/services/getting-started.service.ts` |
| MODIFY | `src/app/(app)/layout.tsx` (or auth guard) — add first-login redirect |
| MODIFY | Nav component — add "Getting Started" link if incomplete |

---

## 📋 SESSION PROMPT

```
I want to implement F-05: Getting Started Wizard for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Backend APIs:
- GET /api/utm-getting-started → current checklist state
- POST /api/utm-getting-started/complete → mark step complete (check exact body from GettingStartedComplete.java)
- POST /api/utm-getting-started/init → initialize for new user (check GettingStartedInit.java)

What to build:
1. src/services/getting-started.service.ts — typed methods for the checklist API
2. src/app/(app)/getting-started/page.tsx — wizard page with:
   - Progress bar (X of 7 steps)
   - Step cards: icon, title, description, action link, skip button
   - Steps: Connect agent, Verify logs, Review dashboards, Set notification, Create rule, Run compliance check
   - Confetti/celebration on completion (use CSS animation, no new lib)
3. src/components/getting-started/checklist-step.tsx — individual step component
4. In src/app/(app)/layout.tsx: after auth, check getting-started status. If incomplete and firstLogin=true, redirect to /getting-started

Read GettingStartedComplete.java and GettingStartedInit.java first for exact API shapes.
Read src/app/(app)/layout.tsx or wherever the layout/auth guard is to understand redirect pattern.
Look at how firstLogin is returned in the auth flow (src/app/login/page.tsx or auth context).
```
