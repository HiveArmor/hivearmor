# F-15: AI SOC Assistant

**Priority:** Tier 4  
**Effort:** 3 days  
**Impact:** 🟠 High — major differentiator vs competitors; "AI copilot for analysts"

---

## What Exists Today

### Backend
- `UtmSocAiResource.java` — AI endpoints at `/api/utm-soc-ai/...`
- `plugins/soc-ai/` — Go plugin that calls an AI backend
- `soc_ai` domain in backend

### Frontend
- No UI for soc-ai at all

---

## What to Build

### 1. AI Assistant Drawer (global)
- Floating "AI" button in bottom-right corner (or sidebar)
- Slide-in drawer: chat interface
- Persists conversation per session
- Capabilities:
  - "Explain this alert" — paste alert JSON, get plain English explanation
  - "Suggest response" — get recommended remediation steps
  - "Write a correlation rule" — describe in English, get YAML/Sigma
  - "Query builder" — describe in English, get OpenSearch DSL

### 2. Alert Detail — AI Analysis Button
- In `AlertDetailPanel`, add "AI Analysis" button
- Sends alert JSON to `/api/utm-soc-ai/analyze`
- Shows: threat context, likely attack chain, recommended actions
- MITRE mapping suggestion

### 3. Log Query Natural Language
- In log query bar, "NL" mode calls soc-ai for query translation
- User types: "failed SSH logins from external IPs last 6 hours"
- AI returns OpenSearch DSL → auto-fills query bar

### 4. Incident Summary Generation
- In incident detail, "Generate Summary" button
- Sends incident alerts to soc-ai
- Returns executive-summary paragraph
- Can be used as incident description or exported to report

---

## 📋 SESSION PROMPT

```
I want to implement F-15: AI SOC Assistant for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Backend AI API:
- Read /backend/src/main/java/com/nilachakra/web/rest/soc_ai/UtmSocAiResource.java for exact endpoints
- Read /plugins/soc-ai/ to understand what AI capabilities are available

What to build:
1. src/services/soc-ai.service.ts — typed wrapper for all soc-ai API endpoints
2. src/components/layout/ai-assistant-drawer.tsx:
   - Floating button bottom-right
   - Slide-in drawer with chat interface
   - Message history (session-only, not persisted)
   - Send message → POST to appropriate soc-ai endpoint
   - Context-aware: if user is on /alerts page, pre-fill context
3. Add "AI Analysis" button to src/components/alerts/alert-detail-panel.tsx
4. Add "Generate Summary" button to incident detail page

Read UtmSocAiResource.java FIRST — understand what endpoints exist.
If soc-ai plugin is not running locally, build with graceful degradation (show "AI not available" if endpoint returns 503).
```
