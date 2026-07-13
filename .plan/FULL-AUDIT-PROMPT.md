# Full-Stack Audit Session Prompt
# ArmorSight Enterprise SIEM
# Copy everything between the === markers and paste as your first message

=== BEGIN PROMPT ===

You are acting as three experts simultaneously throughout this session:
1. **Senior SIEM Product Expert** — 10+ years building/selling Splunk, IBM QRadar, Microsoft Sentinel. You know what enterprise security teams demand: real-time alerting, deep log search, compliance automation, SOAR, UEBA, threat intel, and operational reliability.
2. **Senior Security Engineer** — Red/Blue team background. You audit code for OWASP Top 10, auth weaknesses, data exposure, insecure service communication, privilege escalation, and gaps that attackers exploit.
3. **Senior Full-Stack Architect** — You assess code quality, dead code, integration consistency, performance bottlenecks, API contract completeness, and UI/UX for operational workflows.

## Project: ArmorSight Enterprise SIEM
- Forked from UTMStack-11, rebranded "ArmorSight"
- **Root:** `/Users/encryptshell/GIT/UTMStack-11/`
- **Backend:** Spring Boot 3.3 + JHipster 8, Java 17, package `com.nilachakra`, port 8088
- **New Frontend:** `/frontend-v2/` — Next.js 14, React 18, Tailwind CSS
- **Legacy Frontend:** `/frontend/` — Angular 17 (being phased out — reference only)
- **Database:** PostgreSQL port 5438, database `nilachakra`
- **Search/Analytics:** OpenSearch port 9200
- **Agent layer:** Go binaries — `agent/`, `agent-manager/`, `utmstack-collector/`, `as400/`
- **Event processor:** `ghcr.io/utmstack/utmstack/eventprocessor` (upstream-locked image)
- **Plugins:** `plugins/` — Go plugins: alerts, aws, azure, bitdefender, compliance-orchestrator, crowdstrike, events, feeds, gcp, geolocation, inputs, modules-config, o365, soc-ai, sophos, stats
- **Filters:** `filters/` — 20+ source-specific log normalization filter packs
- **Rules:** `rules/` — 20+ correlation rule packs (Windows, Linux, Cisco, Palo Alto, AWS, etc.)
- **Docker compose:** `/local-dev/docker-compose.yml`
- **Local dev creds:** admin / localdev123!, OpenSearch admin / LocalDev@2024!
- **Auth:** JWT via `POST /api/authenticate` → `{id_token}`, stored in `localStorage` as `utm_token`
- **API proxy:** Next.js catch-all `src/app/api/[...path]/route.ts` → proxies to port 8088

## Prior Audit Summary (2026-07-05)
A previous audit identified these known issues — your job is to go DEEPER on each and find new ones:

**Known stub/mock pages (must fix):**
- `/vulnerability-scanner/page.tsx` — 100% MOCK_* static data
- `/scanner/page.tsx` — 100% MOCK_* static data
- `/reports/page.tsx` — static TEMPLATES array, no real API
- `/data-sources/collectors/page.tsx` — EmptyState shell only
- `/data-parsing/page.tsx` — static pipeline demo, no API calls
- `compliance/page.tsx` — posture tab uses DEMO_FRAMEWORKS, uba/page.tsx uses DEMO_SUMMARY

**Known missing features (exist in legacy Angular, missing in new UI):**
- Log analyzer saved queries (server-side persistence)
- Logstash pipeline/filter management
- Getting Started wizard
- Compliance templates, control evaluation history
- App management: connection keys, index patterns, health checks, identity provider
- Active directory tracker, user detail, notifications
- Interactive incident response console (WebSocket)
- SOAR execution tracking and audit log

**Known security issues:**
- SEC-01: `GET /api/check-credentials?password=X` — password in URL/logs
- SEC-02: JWT signing key regenerates on restart — logs everyone out
- SEC-03: CORS wildcard `allowed-origins: '*'` in prod config
- SEC-04: `InsecureTrustManagerFactory.INSTANCE` in gRPC config — no cert verification

**Known architecture debt:**
- `service/agent_manager` AND `service/agents_manager` — duplicate package
- `elasticsearch-rest-high-level-client 7.12.1` (EOL) still in pom.xml alongside opensearch-connector
- `user-auditor` and `web-pdf` on Java 11 + Spring Boot 2.7 (EOL)
- Jib plugin uses wrong base image `eclipse-temurin:11` for a Java 17 app
- Zero test files across all layers (Go and Java)
- Redis in docker-compose but backend uses only Caffeine in-memory cache
- `compliance-orchestrator` plugin built but not in event_processor Dockerfile
- `.cursor-audit/` directory with committed debug scripts, build logs, node_modules (defer cleanup to prod)

---

## YOUR AUDIT TASKS — Execute in this exact order:

---

### TASK 1: Backend → Frontend-v2 API Contract Completeness

For each backend REST resource controller, verify whether the new UI:
(a) calls it correctly, (b) uses the right HTTP method/path, (c) handles errors, (d) maps response fields correctly

**Read every file in:** `backend/src/main/java/com/nilachakra/web/rest/`

For each Resource class found, search `frontend-v2/src/services/` and `frontend-v2/src/app/` for the matching API path. Create a table:

| Backend Resource | API Path | Frontend Service | Frontend Page | Status |
|---|---|---|---|---|
| UtmAlertResource | /api/utm-alerts/... | alert.service.ts | /alerts | ? |
| ... | ... | ... | ... | ? |

Statuses: ✅ WIRED | ⚠️ PARTIAL | ❌ NOT WIRED | 🔴 BROKEN (wrong path/method)

Flag any endpoint that exists in backend but has NO frontend caller — these are orphaned APIs.
Flag any frontend API call with a path that doesn't match any backend resource — these are broken calls.

---

### TASK 2: Frontend Page → Feature → Role Mapping

Read every `page.tsx` under `frontend-v2/src/app/(app)/`. For each page:

1. **What data does it show?** (real API vs mock vs empty stub)
2. **Which backend APIs does it call?** (list them)
3. **Which user roles should access it?** Map to these roles:
   - `ROLE_ADMIN` — full access, system config
   - `ROLE_ANALYST` — alerts, incidents, logs, rules, dashboards, reports (read + triage)
   - `ROLE_MANAGER` — all analyst + compliance, reporting, team management
   - `ROLE_VIEWER` — read-only: dashboards, reports, alerts (no actions)
   - `ROLE_API` — service account, API-only access
4. **Is there RBAC enforcement in the UI?** (are role checks implemented or does everyone see everything?)
5. **UI/UX assessment:** Is the page operational-quality for a SOC analyst working 8-hour shifts?

Output a complete page map table:

| Route | Feature | Real Data? | APIs Called | Roles | RBAC in UI? | UX Quality |
|---|---|---|---|---|---|---|
| /dashboard | SOC Overview | ? | ? | ALL | ? | ? |
| /alerts | Alert Triage | ? | ? | ANALYST+ | ? | ? |
| ... | ... | ... | ... | ... | ... | ? |

---

### TASK 3: End-to-End Data Flow Validation

Trace the COMPLETE path of a log event from collection to display:

```
[Device/Source] 
→ [Agent collector: which file, which collector type]
→ [Agent gRPC send: which proto message, which endpoint]
→ [Agent Manager: which handler, what processing]
→ [Event Processor: how connected, what it receives]
→ [Filter pipeline: which filter applied, field extraction]
→ [Rule evaluation: which rules fire, how alert is created]
→ [OpenSearch write: which index, what mapping]
→ [Backend read: which service, which query]
→ [API response: which endpoint, what fields returned]
→ [Frontend display: which component renders it]
```

Verify each hop by reading the actual source files. Identify where:
- **Logs can be lost** (no acknowledgment, no retry)
- **Alerts can be missed** (rule doesn't fire, wrong index)
- **Data is stale** (excessive caching, polling lag)
- **The chain is broken** (service not connected, wrong config)

Specifically check:
- `agent/collector/` → read collector.go, syslog/, netflow/, file/, platform/
- `agent/conn/` → how does agent connect to agent-manager
- `agent-manager/agent/` → how it receives and forwards
- `backend/src/main/java/com/nilachakra/service/grpc/` → backend gRPC service
- `plugins/alerts/main.go` → how alerts are deduplicated and written
- `plugins/events/` → how events flow
- `backend/src/main/java/com/nilachakra/service/elasticsearch/` → how backend queries OpenSearch

---

### TASK 4: Security Audit (Go Deeper Than Prior Audit)

**4a. Authentication & Authorization**
- Read `backend/src/main/java/com/nilachakra/security/` completely
- Read `backend/src/main/java/com/nilachakra/config/SecurityConfiguration.java`
- Verify: which endpoints are unprotected? Is `/api/authenticate` rate-limited?
- Check TFA implementation: `backend/.../tfa/` — is TFA bypassable?
- Check frontend auth guard: `frontend-v2/src/` — find the auth middleware/guard, test every bypass scenario
- Are there any endpoints returning sensitive data without auth?

**4b. Agent Security**
- Read `agent-manager/agent/interceptor.go` — how are agents authenticated?
- Read `agent-manager/agent/agent_imp.go` — ValidateAgentKey implementation
- Can a malicious agent impersonate a legitimate one?
- Is agent registration locked (only pre-approved agents can register)?
- Are agent commands (from interactive console) validated before execution?

**4c. Input Validation**
- Search backend for raw string concatenation into OpenSearch queries: `grep -r "query.*+" backend/src/`
- Search for any SQL queries not using JPA/parameterized: `grep -rn "createNativeQuery\|createQuery.*\"" backend/src/`
- Check `UtmCorrelationRulesResource` — are YAML rules validated before deployment?
- Check log/filter input validation in `UtmFilterResource` — can malformed filters crash logstash?

**4d. Secrets and Configuration**
- Find all hardcoded credentials, API keys, certificates in source code
- Check: `application-dev.yml`, `application-prod.yml`, `local-dev/.env`
- Check all docker-compose files for secrets in plaintext
- Check all Go config files for hardcoded values

**4e. New Issues Not in Prior Audit**
- Check for SSRF vectors (backend calling user-supplied URLs)
- Check for path traversal in file-related endpoints
- Check OpenSearch index access — can one tenant's data leak to another?
- Check WebSocket authentication in `UTMIncidentCommandWebsocket.java`
- Check for privilege escalation: can ROLE_ANALYST promote themselves to ROLE_ADMIN?

---

### TASK 5: Unused Code Identification

**5a. Backend dead code**
- Find backend service classes with zero REST resource callers: cross-reference `web/rest/` callers against `service/` classes
- Find DB entity classes that have no corresponding liquibase migration (orphaned domain objects)
- Check `domain/` subdirectories: `federation_service/`, `getting_started/` — are these fully implemented or abandoned?
- Find `@Deprecated` annotations
- Find commented-out code blocks > 5 lines

**5b. Frontend-v2 dead code**
- Find components in `frontend-v2/src/components/` that are imported nowhere: `grep -rn "import.*ComponentName" src/` for each component
- Find services in `frontend-v2/src/services/` with no page importing them
- Find types/interfaces defined but never used
- Find entire feature branches that were started but abandoned (look for `// TODO`, `// WIP`, `// placeholder` comments at component level)

**5c. Legacy Angular code that can be deleted**
The legacy Angular frontend at `/frontend/` is being phased out. Identify:
- Angular modules/components that are FULLY replicated in frontend-v2 (safe to track for deletion)
- Angular modules that are NOT replicated in frontend-v2 (must be built before deletion)
- Angular services with API patterns NOT yet replicated in frontend-v2 services (these are specs for what to build)

Output two lists:
1. **Safe to remove** (fully replicated in new UI) — with confirmation that the new UI version actually works
2. **Must build first** (functionality gap — Angular is the only implementation)

**5d. Backend code for Angular-only features**
- Find backend endpoints ONLY called by Angular frontend (these will eventually be unreachable once Angular is removed)
- These are NOT dead code yet — flag them as "migration-dependent"

---

### TASK 6: Event Processor & Plugin Integration Audit

**6a. Understand the eventprocessor contract**
Read these files to understand what the eventprocessor expects and produces:
- `agent-manager/protos/` — proto definitions
- `agent/protos/` — agent proto definitions
- `plugins/events/` — event routing
- `plugins/alerts/main.go` — alert creation logic
- `plugins/geolocation/` — IP enrichment
- `plugins/feeds/` — threat intel feed integration
- `filters/linux/` — example filter format (understand the normalization spec)
- `rules/linux/` — example rule format (understand the correlation engine spec)

Document:
- What gRPC message types flow from agent-manager to eventprocessor?
- What OpenSearch index pattern does eventprocessor write to?
- What fields are guaranteed to be present in every normalized log?
- What fields are optional/source-specific?
- How are alerts written — what's the full alert document structure?

**6b. Plugin health check**
For each plugin in `plugins/`:
- Is it compiled into the eventprocessor image or a separate service?
- Does backend have a health check for it?
- Is there a UI page that surfaces its status?
- If the plugin crashes, how does the system degrade?

**6c. compliance-orchestrator gap**
- Read `plugins/compliance-orchestrator/` fully
- It's built but NOT in the eventprocessor Dockerfile — is this intentional?
- What would happen if it were enabled?
- What compliance frameworks does it support?

---

### TASK 7: Enterprise SIEM Feature Gap Analysis

As a SIEM product expert, assess ArmorSight against these enterprise SIEM capabilities. For each, state: PRESENT | PARTIAL | MISSING | PLANNED.

**Core Detection:**
- [ ] Real-time alert streaming (sub-5-second latency)
- [ ] Correlation rules with time-window aggregation
- [ ] Multi-stage kill chain detection (sequence rules)
- [ ] Baseline + anomaly detection (statistical)
- [ ] MITRE ATT&CK technique mapping per rule
- [ ] Alert deduplication and suppression
- [ ] Alert tuning (whitelist/blacklist patterns)
- [ ] Custom alert severity scoring

**Log Management:**
- [ ] Full-text search with field-level syntax (KQL/Lucene)
- [ ] SQL-based log query
- [ ] Natural language log query (AI-powered)
- [ ] Saved searches with scheduled alerts
- [ ] Log retention policy management
- [ ] Index rollover and archival
- [ ] Log source health monitoring
- [ ] Per-source normalization (ECS/CEF field mapping)
- [ ] Raw log storage alongside normalized

**Investigation & Hunting:**
- [ ] Timeline reconstruction (pivot from alert → related logs)
- [ ] Entity timeline (all activity for a user/IP/host)
- [ ] Graph visualization (entity relationships)
- [ ] Notebook/investigation workspace
- [ ] Evidence tagging and case building
- [ ] Context enrichment (hostname resolution, ASN, reputation)

**Incident Management:**
- [ ] Incident creation from alert(s)
- [ ] Incident workflow (open → in-progress → resolved)
- [ ] SLA tracking (MTTD, MTTR)
- [ ] Incident collaboration (notes, assignment, comments)
- [ ] Incident timeline (automatic event stitching)
- [ ] External ticket creation (JIRA, ServiceNow integration)
- [ ] Incident reporting and metrics

**SOAR:**
- [ ] Visual playbook builder
- [ ] Automated playbook trigger (on alert condition)
- [ ] Manual playbook execution
- [ ] Live remote command execution on endpoints
- [ ] Integration actions (block IP, isolate host, disable user)
- [ ] Playbook execution audit trail
- [ ] Playbook version control
- [ ] Playbook marketplace/templates

**Compliance:**
- [ ] Framework support (PCI DSS, HIPAA, ISO 27001, NIST CSF, SOC2, GDPR)
- [ ] Automated control evaluation
- [ ] Compliance gap heatmap
- [ ] Control evidence collection
- [ ] Compliance report generation (PDF)
- [ ] Audit-ready evidence export
- [ ] Custom compliance framework builder
- [ ] Continuous compliance monitoring

**Threat Intelligence:**
- [ ] Commercial feed ingestion (STIX/TAXII)
- [ ] Open-source feed integration (AlienVault OTX, Abuse.ch, etc.)
- [ ] IOC enrichment on alerts in real-time
- [ ] IOC search across logs
- [ ] Feed health and freshness monitoring
- [ ] Custom IOC list management
- [ ] TI-driven alert suppression

**UEBA/UBA:**
- [ ] User behavioral baseline
- [ ] Peer group comparison
- [ ] Entity risk scoring
- [ ] Impossible travel detection
- [ ] Privileged account monitoring
- [ ] Data exfiltration detection
- [ ] Account takeover detection signals

**Asset & Vulnerability Management:**
- [ ] Asset discovery (network scan)
- [ ] Asset inventory with risk scoring
- [ ] Vulnerability scan integration
- [ ] CVE tracking per asset
- [ ] Patch status monitoring
- [ ] Asset grouping and tagging

**Active Directory / Identity:**
- [ ] AD event monitoring (logins, group changes, GPO)
- [ ] AD user risk profiling
- [ ] Privileged account activity tracking
- [ ] Dormant account detection
- [ ] AD tree visualization
- [ ] LDAP/SAML authentication integration

**Dashboards & Reporting:**
- [ ] Pre-built SOC dashboards (executive, analyst, compliance)
- [ ] Custom dashboard builder (drag-and-drop)
- [ ] Scheduled report delivery (email PDF)
- [ ] Export to CSV/PDF/JSON
- [ ] KPI tracking (MTTD, MTTR, alert volume, EPS)
- [ ] Dark/light mode

**Multi-tenancy & RBAC:**
- [ ] Tenant isolation (separate data per org)
- [ ] Role-based access control (RBAC)
- [ ] Data-level permissions (user sees only their assigned sources)
- [ ] Audit trail of all user actions
- [ ] SSO integration (SAML2, OIDC)
- [ ] MFA/2FA enforcement
- [ ] Session management and timeout
- [ ] API key management per user/role

**Operations & Reliability:**
- [ ] Service health dashboard
- [ ] Agent connectivity monitoring
- [ ] Log source health (last seen, EPS, error rate)
- [ ] Backup and restore
- [ ] HA/clustering support
- [ ] Performance metrics (JVM, DB, search latency)
- [ ] Capacity planning metrics (storage growth rate, EPS trend)

---

### TASK 8: UI/UX Operational Readiness Assessment

For each of these critical SOC workflows, trace the exact sequence of clicks a Level-1 analyst would take. Identify friction points, missing confirmations, poor error messages, or broken flows:

**Workflow 1: Triage an incoming critical alert**
1. Alert appears in list
2. Analyst opens detail
3. Views related logs (pivot)
4. Adds note
5. Changes status to "In Progress"
6. Escalates to incident
7. Assigns to senior analyst

**Workflow 2: Investigate suspicious user behavior**
1. Alert mentions username
2. Analyst looks up user in AD
3. Views user's recent log activity
4. Checks UBA risk score
5. Creates incident
6. Runs SOAR playbook to disable account

**Workflow 3: Build and deploy a new detection rule**
1. Analyst identifies a new attack pattern in logs
2. Opens rule editor
3. Writes correlation rule (Sigma format or YAML)
4. Tests against historical data
5. Sets severity and MITRE mapping
6. Activates rule
7. Confirms alerts start firing

**Workflow 4: Generate monthly compliance report**
1. Navigate to compliance
2. Select framework (e.g., ISO 27001)
3. Run evaluation
4. View failing controls
5. Generate PDF report
6. Schedule monthly delivery

For each workflow: identify every page/component involved, every API call made, and every broken/missing step.

---

### TASK 9: Performance & Reliability Assessment

**9a. Backend query performance risks**
- Find all OpenSearch queries in `backend/src/main/java/com/nilachakra/service/elasticsearch/`
- For each query: does it use pagination? Field filtering (`_source` includes)? Sort with `search_after`?
- Flag any query that fetches all documents (`size: 10000` or similar)
- Find N+1 query patterns: service methods that call OpenSearch in a loop

**9b. Frontend rendering performance**
- Find any component rendering large lists without virtualization
  - Check: alerts list (can be 10,000+ items), log results table, rule list
  - `@tanstack/react-virtual` is in deps — is it actually used?
- Find any `useEffect` with no dependency array (runs every render)
- Find any `useEffect` with polling that doesn't clean up on unmount
- Find components without `React.memo` or `useMemo` on expensive renders

**9c. Memory leak patterns**
- Find SSE connections that don't close on component unmount
- Find WebSocket subscriptions not cleaned up
- Find event listeners not removed on unmount

---

### TASK 10: Output a Complete Remediation Plan

After all tasks above, produce:

**10a. Priority Matrix** — Every issue found, ranked by:
- CRITICAL (security breach / data loss / system down) 
- HIGH (feature broken / SOC workflow blocked)
- MEDIUM (feature partial / UX degraded)
- LOW (cleanup / technical debt)

**10b. Page Status Report** — Every page in frontend-v2 with:
- Current status (working/partial/stub/broken)
- Data source (real API / mock / empty)
- Missing backend integration
- Missing UI features vs enterprise SIEM standard
- Recommended role access

**10c. Missing Enterprise Features** — Prioritized list of features not yet planned that would differentiate ArmorSight

**10d. Dead Code Removal Checklist** — Safe-to-remove files/directories with confirmation that nothing depends on them

**10e. Backend Service Upgrade Path** — Specific steps for `user-auditor` (Java 11→17) and `web-pdf` (Selenium→Playwright or eliminate)

**10f. Event Processor Ownership Readiness** — Assessment of how much work is needed to build a replacement, and what risks exist in the current upstream dependency

---

## How to Execute This Audit

Do the tasks in order. For each task:
1. Read the relevant source files (don't assume — read the actual code)
2. Test any API you can reach (backend is at http://localhost:8088 if running)
3. Note findings with exact file paths and line numbers
4. Flag anything surprising or dangerous immediately

Use this auth token pattern:
```bash
TOKEN=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id_token',''))")
```

Start with TASK 1. Report findings as you go — don't wait until the end.

Save any files you produce to `/Users/encryptshell/GIT/UTMStack-11/.plan/audit-YYYY-MM-DD/`

=== END PROMPT ===
