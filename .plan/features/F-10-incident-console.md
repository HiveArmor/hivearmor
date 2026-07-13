# F-10: Incident Response — Interactive Console & Full SOAR

**Priority:** Tier 2  
**Effort:** 4 days  
**Impact:** 🟠 High — IR console enables live response; playbook execution is the SOAR killer feature

---

## What Exists Today

### Backend (COMPLETE)
- `UTMIncidentCommandWebsocket.java` — WebSocket for live command execution
- `UtmIncidentActionCommandResource.java` — command management
- `UtmIncidentActionResource.java` — IR actions
- `UtmIncidentJobResource.java` — job tracking
- `UtmIncidentVariableResource.java` — automation variables
- `UtmSoarPlaybookResource.java` — SOAR playbook CRUD
- Incident domain: `domain/incident_response/`

### New UI
- `/soar/flows/page.tsx` — visual playbook builder with @xyflow/react ✅
- `/soar/page.tsx` — playbook list ✅
- `/soar/console/page.tsx` — interactive console (need to verify what's built)
- `/soar/audit/page.tsx` — SOAR audit log (need to verify)
- `/incidents/[id]/page.tsx` — incident detail (need to verify SOAR launch)

---

## What Needs to Be Built

### 1. Interactive Console (`/soar/console/page.tsx`)
- Split-pane terminal-style UI
- Left: list of connected agents (from agentService)
- Right: terminal-like command input/output
- Connect to `UTMIncidentCommandWebsocket` via WebSocket (STOMP over SockJS)
- Command history (up/down arrow)
- Output colorization (errors in red, success in green)
- "Send to Incident" button: link console session to an incident

### 2. Playbook Execution Tracking
- When SOAR playbook runs, show real-time execution status per node
- Visual indicator in flow canvas: node turns green (success) / red (fail) / spinning (running)
- Execution log panel below canvas
- Connect to playbook execution endpoint for status polling

### 3. Incident → SOAR Launch
- In `/incidents/[id]/page.tsx`, "Run Playbook" button
- Opens modal: select playbook from list
- Fills playbook variables from incident context (IP, hostname, user)
- Shows execution status in incident timeline

### 4. SOAR Audit Log (`/soar/audit/page.tsx`)
- Timeline of all playbook executions
- Per-run: playbook name, triggered by (alert/manual/schedule), start/end time, status, steps passed/failed
- Filter by status, date range, playbook name

---

## Backend WebSocket URL
```
ws://localhost:8088/api/incident-command
STOMP topic: /topic/incident-commands/{incidentId}
```

---

## Files to Create/Modify

| Action | File |
|---|---|
| MODIFY | `src/app/(app)/soar/console/page.tsx` — wire to WebSocket |
| MODIFY | `src/app/(app)/soar/flows/page.tsx` — add execution status overlay |
| MODIFY | `src/app/(app)/soar/audit/page.tsx` — wire to execution history API |
| MODIFY | `src/app/(app)/incidents/[id]/page.tsx` — add "Run Playbook" action |
| CREATE | `src/hooks/use-incident-command-ws.ts` — STOMP WebSocket hook |

---

## 📋 SESSION PROMPT

```
I want to implement F-10: Interactive Incident Response Console for ArmorSight SIEM.

Project context:
- Root: /Users/encryptshell/GIT/UTMStack-11/
- Frontend: /frontend-v2/ (Next.js 14, React 18, Tailwind)
- Backend port: 8088

Backend WebSocket:
- Protocol: STOMP over SockJS (same as legacy Angular — check /frontend/src/app/core/tracker/tracker.service.ts for the pattern)
- WebSocket handler: UTMIncidentCommandWebsocket.java at /backend/src/main/java/com/nilachakra/web/rest/incident_response/
- REST APIs: UtmIncidentActionCommandResource.java, UtmIncidentJobResource.java

Current state of console:
- Read /frontend-v2/src/app/(app)/soar/console/page.tsx to see current implementation
- Read /frontend-v2/src/app/(app)/soar/audit/page.tsx for current state

What to build:
1. src/hooks/use-incident-command-ws.ts — STOMP WebSocket hook:
   - Connect to ws://localhost:8088/websocket (SockJS)
   - Subscribe to /topic/incident-commands/{incidentId}
   - Send commands to /app/incident-commands
   - Expose: sendCommand(cmd), messages[], isConnected
2. Rewrite /soar/console/page.tsx:
   - Left panel: agent selector (connected agents from agentService)
   - Right panel: terminal UI (dark bg, monospace, command history, output)
   - Wire sendCommand to WebSocket
3. Wire /soar/audit/page.tsx to UtmIncidentJobResource API

Read UtmIncidentActionCommandResource.java and UTMIncidentCommandWebsocket.java before building.
The legacy Angular console is at /frontend/src/app/incident-response/interactive-console/ — read it for the WebSocket message format.
```
