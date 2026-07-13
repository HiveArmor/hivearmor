# ArmorSight SIEM — Session Prompts Index

Copy the prompt from the relevant feature file and paste it to Claude.
Each prompt is self-contained: no re-audit needed.

---

## Full System Audit Prompt (Deep Dive)

**File:** `FULL-AUDIT-PROMPT.md`
**Purpose:** Complete end-to-end audit — UI↔API stitching, feature gaps, RBAC mapping, mock data, dead code, enterprise SIEM gap analysis, security review, performance review. Use when you want a comprehensive health check before starting new features, or when onboarding a new collaborator.
**Open in a new session — paste everything between the === BEGIN PROMPT === and === END PROMPT === markers.**

---

| ID | Feature | Effort | File |
|---|---|---|---|
| **BLOCK-0** | | | |
| SEC-ALL | All 4 security fixes (do first) | 1 day | `features/SEC-FIXES.md` → SESSION PROMPT |
| **TIER 1 — Foundation** | | | |
| F-01 | Live Alert SSE Streaming | 1.5 days | `features/F-01-live-alert-streaming.md` → SESSION PROMPT |
| F-02 | Reports Generation & Scheduling | 3 days | `features/F-02-reports.md` → SESSION PROMPT |
| F-03 | Log Analyzer Saved Queries + Pivot | 4 days | `features/F-03-log-analyzer.md` → SESSION PROMPT |
| F-04 | Logstash Pipeline & Filter Management | 3 days | `features/F-04-logstash-management.md` → SESSION PROMPT |
| F-05 | Getting Started Wizard | 2 days | `features/F-05-getting-started.md` → SESSION PROMPT |
| **TIER 2 — SOC Workflows** | | | |
| F-06 | Compliance Framework (Full) | 5 days | `features/F-06-compliance-full.md` → SESSION PROMPT |
| F-07 | Vulnerability Scanner (Real) | 2 days | `features/F-07-vuln-scanner.md` → SESSION PROMPT |
| F-08 | Network Asset Scanner (Real) | 2 days | `features/F-08-asset-scanner.md` → SESSION PROMPT |
| F-09 | Active Directory Deep Features | 5 days | `features/F-09-active-directory.md` → SESSION PROMPT |
| F-10 | Incident Response Console + SOAR | 4 days | `features/F-10-incident-console.md` → SESSION PROMPT |
| **TIER 3 — Admin & Config** | | | |
| F-11 | App Management Suite | 5 days | `features/F-11-app-management.md` → SESSION PROMPT |
| F-12 | Data Parsing (same as F-04) | — | See F-04 |
| **TIER 4 — Intelligence** | | | |
| F-15 | AI SOC Assistant | 3 days | `features/F-15-soc-ai.md` → SESSION PROMPT |
| **TIER 5 — Architecture** | | | |
| ARCH-01 | Redis Caching Layer | 2 days | `features/ARCH-01-redis-cache.md` → SESSION PROMPT |
| **TIER 6 — Own The Stack** | | | |
| OWN-01 | Own Event Processor | 8-12 wks | `features/OWN-01-eventprocessor.md` → SESSION PROMPT |
| OWN-02 | Own Agent Manager | 2 weeks | `features/OWN-02-agent-manager.md` → SESSION PROMPT |
| OWN-03 | Replace PDF Service | 3 days | `features/OWN-03-pdf-service.md` → SESSION PROMPT |

---

## How to Use

1. Pick the feature you want to work on from the table above
2. Open the corresponding `.md` file
3. Scroll to the `## 📋 SESSION PROMPT` section at the bottom
4. Copy everything inside the triple-backtick code block
5. Paste as your first message to Claude in a new session
6. Claude will have full context without reading this entire audit

---

## Quick Reference — Key File Locations

```
Backend REST:   backend/src/main/java/com/nilachakra/web/rest/
Backend Service: backend/src/main/java/com/nilachakra/service/
New UI pages:   frontend-v2/src/app/(app)/
New UI services: frontend-v2/src/services/
New UI components: frontend-v2/src/components/
Agent:          agent/
Agent Manager:  agent-manager/
Filters:        filters/
Rules:          rules/
Plugins:        plugins/
Docker:         local-dev/docker-compose.yml
```

## Auth for API Testing
```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
echo $TOKEN
```

## Recommended Feature Start Order for Maximum SIEM Value

**Start here (my recommendation):**
→ **F-01: Live Alert Streaming** — 1.5 days, zero backend work needed, transforms the feel of the entire app

**Then:**
→ **F-03: Log Analyzer** — makes it a real threat hunting tool
→ **F-02: Reports** — customer/compliance value, quick win
→ **F-04: Logstash Management** — ops team unblocked
→ **SEC-ALL** — security hygiene

**Or if you want a complete vertical slice (one area end-to-end):**
→ **F-07 + F-08** — scanners real in 4 days combined, very visible

**For enterprise demo readiness:**
→ **F-06 Compliance + F-02 Reports + F-01 Streaming** — 3 features that make it look enterprise
