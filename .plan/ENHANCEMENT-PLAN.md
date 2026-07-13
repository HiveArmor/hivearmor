# ArmorSight Enhancement Plan
## Codebase Audit → Gap Analysis → Prioritized Implementation Roadmap

> Audit date: 2026-07-08. Based on full codebase survey of all services.

---

## 1. What Already Exists (Inventory)

### ✅ Core Infrastructure
- **OpenSearch** single-node, ISM policies, snapshots, index templates
- **PostgreSQL** — backend, agent-manager, user-auditor (3 separate DBs)
- **Redis** — SSE pub/sub for alert streaming
- **web-pdf** service — Selenium-based PDF report generation

### ✅ Event Processing Engine
- Full Go pipeline with 9 operators (json, grok, rename, add, cast, trim, drop, delete, kv, dynamic)
- CEL-based WHERE evaluation with gjson path functions (`contains`, `safe`, `exists`)
- Correlation rules: threshold (count+window), dedup, groupBy
- Hot-reload for both pipeline YAML and rule YAML (30s polling)
- **Enterprise features all implemented:**
  - Risk-based alerting (accumulator + threshold + decay)
  - Offense engine (3+ related alerts → offense in `v11-offense-*`)
  - Sequence detection (stateful multi-step CEL rules)
  - Anomaly baselines (30-day rolling mean+3σ, per dataSource+action)
  - Lookup table service (asset + identity enrichment from OpenSearch) — **STUB**: `setStr()` is a no-op, fields computed but not written to event

### ✅ Log Collection
- Agent with collectors: syslog, NetFlow, filebeat, Linux (auditd), Windows (winlogbeat), macOS, EDR
- Cloud plugins: AWS CloudTrail, Azure EventHub, GCP, O365
- Security product plugins: CrowdStrike, Sophos, Bitdefender
- IBM AS/400 dedicated service
- **37 pipeline filter YAMLs** covering ~25 vendor sources
- **634 correlation rules** across Linux, Windows, macOS, cloud, network, antivirus, Suricata, Cisco, Fortinet, Palo Alto, SonicWall, pfSense, MikroTik, VMware, GitHub, IBM

### ✅ Backend API (Java Spring Boot, 135 REST resources)
- Full auth: JWT, TOTP 2FA, SAML/IDP, API keys, RBAC
- Alert CRUD + SSE streaming
- Alert tagging rules (auto-tag on condition)
- Alert auto-response rules (trigger SOAR on alert)
- **Incident/case management**: full CRUD, link alerts, notes, history, priority
- **SOAR**: playbooks (visual builder), actions, commands, jobs, variables, execution history
- **Notifications**: 3 channels implemented (email, Slack, webhook); routing rules
- **Compliance**: custom standards, HIPAA, evaluations, scheduling, reports, export
- **Threat intelligence**: IOC lookup, feed management (ThreatWinds API)
- **UBA**: entity anomaly detection, watchlist, anomaly status updates
- **SOC-AI**: LLM alert triage (8 providers: OpenAI, Anthropic, Azure, Gemini, Ollama, Mistral, DeepSeek, Groq)
- **EDR**: rules, per-agent enforcement, response actions
- Dashboard/visualization CRUD + execution
- Network scan + asset discovery
- OpenSearch cluster management (indices, ISM, templates, snapshots)
- User audit trail
- PDF report generation
- Search acceleration (materialized indices)
- Module activation system
- Federation/multi-tenant stubs

### ✅ Frontend (Angular v1 — production)
- Full alert management: status, tags, notes, incident assignment, SOC-AI panel, MITRE badge, timeline, related events, geolocation map, proposed solution
- Adversary management with alert graph
- Dashboard + visualization builder (chart types, Leaflet maps, bucket aggregations)
- Incident case management: create, link alerts, notes, history
- SOAR: visual playbook builder, automation view, interactive console, response rules
- Log analyzer (Kibana-style search)
- Compliance module with scheduling and print
- Active Directory audit
- Data parsing / pipeline management
- Rule management
- Admin: users, sources
- Getting started wizard
- **Disabled routes**: vulnerability-scanner, reports

### ✅ Frontend v2 (Next.js — active redesign)
- All major routes have real pages (not stubs)
- Live SSE alert streaming (`use-alert-stream.ts`, `use-eps-stream.ts`)
- Key pages fully implemented: alerts, dashboard, logs, incidents, SOAR, compliance, agents, data-sources, opensearch management, admin
- Key pages partially implemented (content exists but limited depth): UBA, threat-intel, rules, data-parsing, EDR

---

## 2. What Is Missing or Incomplete

### 🔴 Critical Gaps (blocking production readiness)

| ID | Component | Gap | Evidence |
|----|-----------|-----|----------|
| G-01 | Event Processor | **Lookup enrichment writes nothing** | `setStr()` in `enterprise/lookup/service.go:187` is explicit no-op: fields computed, not written to event documents |
| G-02 | Rules | **634 rules use pre-rewrite CEL syntax** | `grep 'log\["'` returns 0 hits — actually all rules were already rewritten. VERIFY: run a rule smoke test across all 634 to confirm CEL WHERE evaluates without `ok=false` |
| G-03 | Pipeline | **37 filter YAMLs not hot-loaded into engine** | Filters live at `filters/` but engine watches `$WORK_DIR/pipeline/filters/` — no mechanism copies upstream filters into the running container; zero parsing for real agent data |
| G-04 | Notifications | **Only 3 channels (email, Slack, webhook)** | Missing: Microsoft Teams, PagerDuty, Telegram, OpsGenie. Teams is the most commonly requested enterprise channel |
| G-05 | Frontend v2 | **Angular → Next.js migration incomplete** | Two frontend apps deployed simultaneously; Angular on :443, Next.js on :3000. No clear cutover plan; users land on Angular |
| G-06 | Reports | **Route disabled in Angular** | `/reports` is commented out in routing module; report module exists, web-pdf service exists, but feature is unreachable |
| G-07 | Vulnerability Scanner | **Route disabled in Angular** | `/vulnerability-scanner` commented out; module code exists |

### 🟡 Feature Gaps (present in some form, needs completion)

| ID | Component | Gap | Evidence |
|----|-----------|-----|----------|
| G-08 | Threat Intel | **No native IOC search UI** | Angular `/threat-intelligence` is an iframe to `galaxy.threatwinds.com`. Next.js `/threat-intel` page is 1725 lines — has a search UI but needs verification it calls the backend `/api/v1/threat-intel/ioc` endpoint |
| G-09 | MITRE ATT&CK | **No coverage heatmap** | `mitre-badge.tsx` exists (single badge per alert), but no heatmap showing which techniques are covered by active rules vs which have no coverage |
| G-10 | Rules | **No UI rule builder for CEL expressions** | Angular rule management exists for CRUD; Next.js `/rules` page exists. But writing CEL WHERE expressions is free-text only — no guided builder, no field autocomplete, no test-against-sample-event functionality |
| G-11 | Data Parsing | **No live test panel in Next.js UI** | Angular has data parsing page; Next.js data-parsing page has a raw log input field (`placeholder="Paste a raw log line here…"`) — verify if it actually calls the engine to test the pipeline |
| G-12 | Offense Engine | **No UI for offense management** | The offense engine writes to `v11-offense-*` OpenSearch index, but there is no frontend page to view, triage, or manage offenses |
| G-13 | UBA | **Backend exists, UI is 720 lines** | `UbaResource.java` has summary, entities, anomalies endpoints. Next.js `/uba` page has 720 lines — verify depth; likely needs entity profile views and behavioral timeline |
| G-14 | SOAR | **Next.js SOAR is 167 lines (shallow)** | Angular SOAR has full visual playbook builder. Next.js `/soar` page is only 167 lines — likely delegates to Angular or is stub |
| G-15 | Sigma | **No Sigma rule import** | No transpiler or import pipeline for the community Sigma library (3000+ rules) |
| G-16 | Graph / Lateral Movement | **No graph visualization** | No force-directed graph of IP→IP or user→host connections from netflow + auth data |
| G-17 | Notifications | **No per-severity routing in Next.js** | Channel routing logic exists in backend, but Next.js admin/notifications page — verify if it exposes route configuration with severity filters |
| G-18 | Multi-tenancy | **Federation stubs present, not functional** | `UtmFederationServiceClientResource.java` exists; no real isolation per tenant in OpenSearch indices (all use same `v11-*` prefix) |

### 🟢 Enhancement Opportunities (exists but can be improved)

| ID | Component | Gap | Notes |
|----|-----------|-----|-------|
| G-19 | SOC-AI | **Analysis is per-alert, no campaign-level summary** | LLM currently triages individual alerts; no "summarize this incident's 12 related alerts into one narrative" |
| G-20 | Dashboard | **No MITRE ATT&CK heatmap dashboard** | Builder supports many chart types but no ATT&CK matrix widget |
| G-21 | Compliance | **HIPAA only + custom; no PCI-DSS, SOC 2, ISO 27001 templates** | Framework exists but limited built-in standards |
| G-22 | Threat Intel | **ThreatWinds-only feed** | `plugins/feeds/` uses ThreatWinds API exclusively; no STIX/TAXII, MISP, or free feeds (AbuseIPDB, Feodo) |
| G-23 | Agent | **No browser-based agent deployment wizard** | Getting-started wizard exists but agent install requires manual shell commands |
| G-24 | Search | **No natural language hunt** | Log analyzer is manual DSL/query syntax only |
| G-25 | Alerting | **No suppression/maintenance windows** | No mechanism to temporarily silence rules during maintenance |
| G-26 | Rules (634) | **Old `afterEvents` field name** | Some rules may use the legacy `afterEvents` alias for `correlation` — the loader normalizes this but it's debt |

---

## 3. Prioritized Enhancement Roadmap

### Sprint 1 — Fix Blocking Gaps (Weeks 1–2)

**Priority: production blocker — fixes before any new features**

---

#### ENH-01: Fix Lookup Enrichment Write (G-01)
**What**: Implement `setStr()` in `event-processor/enterprise/lookup/service.go` to actually write enrichment fields into the event's Log map.

**Files to change:**
- `event-processor/enterprise/lookup/service.go` — lines 179–188

**Implementation:**
```go
func setStr(event *plugins.Event, field, value string) {
    if value == "" || event == nil {
        return
    }
    if event.Log == nil {
        event.Log = make(map[string]*structpb.Value)
    }
    event.Log[field] = structpb.NewStringValue(value)
    // Also write flat key for OpenSearch compatibility
    // The writer already stores flat keys alongside nested, so this is sufficient
}
```

Also add the flat key to the writer's `buildDoc()` function so `asset.hostname`, `asset.criticality`, `identity.fullName` etc. appear in the top-level OpenSearch document alongside `"origin.ip"`.

**Test cases:**
1. Seed asset record `{ip:"10.0.1.50", hostname:"prod-web-01", criticality:"critical"}` into `v11-lookup-assets`
2. Inject event from `10.0.1.50`
3. Wait 7s, query OpenSearch: `asset.hostname` must equal `"prod-web-01"`
4. Verify `asset.criticality` also present
5. Inject event from IP NOT in lookup — verify no `asset.*` fields present (no spurious enrichment)

---

#### ENH-02: Deploy Upstream Pipeline Filters to Engine (G-03)
**What**: The 37 upstream filter YAMLs in `filters/` are not reaching the running engine. The engine watches `$WORK_DIR/pipeline/filters/` but no mechanism populates it.

**Option A (recommended)**: Mount the `filters/` directory as a read-only volume alongside `ep_pipeline`:
```yaml
# local-dev/docker-compose.override.yml — add volume mount:
volumes:
  - ep_pipeline:/workdir/pipeline
  - ../filters:/workdir/pipeline/filters:ro   # ← ADD THIS
  - ep_logs:/workdir/logs
  - ep_rules:/workdir/rules
  - ./certs:/cert:ro
```

**Option B**: Copy filters into the Docker image at build time via `Dockerfile COPY`.

Option A is preferred — changes to filter YAMLs hot-reload into the engine without rebuilding the image.

**Test cases:**
1. Mount filters via override, restart eventprocessor
2. Inject a real Linux syslog line: `"Jul 8 12:34:56 server sshd[1234]: Failed password for root from 1.2.3.4 port 22 ssh2"`
3. Verify `log.message`, `origin.ip` are extracted (linux.yml pipeline ran)
4. Inject a Windows event JSON and verify `log.eventID` extracted (windows-events.yml ran)
5. Inject a Suricata JSON event, verify `log.signatureID` and `log.signature` extracted
6. Inject a Cisco ASA syslog, verify fields extracted

---

#### ENH-03: Add Microsoft Teams + PagerDuty Notification Channels (G-04)
**What**: Add two high-demand enterprise channels to `NotificationChannelService.java`.

**Files to change:**
- `backend/src/main/java/com/nilachakra/service/notification_channel/NotificationChannelService.java` — add `case "teams"` and `case "pagerduty"` to `dispatch()` switch
- `backend/src/main/java/com/nilachakra/domain/notification_channel/UtmNotificationChannel.java` — if channel config fields need extending (Teams uses webhook URL, PagerDuty uses routing key)
- Frontend v2: `frontend-v2/src/app/(app)/admin/notifications/` — add Teams and PagerDuty channel type options

**Teams implementation** (uses Incoming Webhook, same pattern as Slack):
```java
private void dispatchTeams(UtmNotificationChannel ch, String message, String severity) {
    // Teams Adaptive Card format
    String color = switch (severity) {
        case "high" -> "attention";
        case "medium" -> "warning";
        default -> "good";
    };
    String body = """
        {"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive",
        "content":{"type":"AdaptiveCard","version":"1.2","body":[
          {"type":"TextBlock","text":"ArmorSight Alert","weight":"bolder","size":"medium","color":"%s"},
          {"type":"TextBlock","text":"%s","wrap":true}
        ]}}]}""".formatted(color, message.replace("\"", "\\\""));
    // POST to ch.getWebhookUrl()
}
```

**PagerDuty implementation** (Events API v2):
```java
private void dispatchPagerDuty(UtmNotificationChannel ch, String message, String severity) {
    String urgency = severity.equals("high") ? "critical" : "warning";
    String body = """
        {"routing_key":"%s","event_action":"trigger",
         "payload":{"summary":"%s","severity":"%s","source":"ArmorSight"}}
        """.formatted(ch.getApiKey(), message.replace("\"", "\\\""), urgency);
    // POST to https://events.pagerduty.com/v2/enqueue
}
```

**Test cases:**
1. Create a Teams webhook URL (ngrok or real Teams channel)
2. Add notification channel with type `teams`, supply webhook URL
3. Trigger test dispatch via `POST /api/notification-channels/{id}/test`
4. Verify Teams message received with correct severity color
5. Repeat for PagerDuty with a test routing key

---

#### ENH-04: Enable Disabled Frontend Routes (G-06, G-07)
**What**: Uncomment reports and vulnerability-scanner routes in Angular routing module.

**File**: `frontend/src/app/app-routing.module.ts`

**Change**: Find and uncomment:
```typescript
{ path: 'reports', loadChildren: () => import('./report/report.module').then(m => m.ReportModule) },
{ path: 'vulnerability-scanner', loadChildren: () => import('./vulnerability-scanner/vulnerability-scanner.module').then(m => m.VulnerabilityScannerModule) },
```

Verify both modules load without runtime errors. If they depend on services not yet in the backend, those need enabling too.

**Test cases:**
1. Navigate to `/reports` — page loads without 404 or blank screen
2. Navigate to `/vulnerability-scanner` — page loads
3. Existing routes still work (no regression in routing)

---

### Sprint 2 — Complete Half-Done Features (Weeks 3–5)

---

#### ENH-05: Offense Management UI (G-12)
**What**: No frontend exists to view or triage offenses written to `v11-offense-*` by the engine.

**Backend** (new endpoint): `OffenseResource.java`
```
GET  /api/offenses?page=&size=&status=&severity=
GET  /api/offenses/{id}
PUT  /api/offenses/{id}/status  (open/closed/false-positive)
GET  /api/offenses/{id}/alerts  (all linked alert IDs)
```

The backend queries `v11-offense-*` via the existing ElasticsearchResource proxy pattern.

**Frontend v2** (new page): `/offenses/page.tsx`
- Table: offense name, magnitude (0–10 progress bar), adversary IP/user, alert count, first seen, last updated, status badge
- Detail view: timeline of contributing alerts, adversary profile card (reuse adversary components), status change dropdown, assign analyst, notes

**Components to reuse**: `severity-badge.tsx`, `kpi-card.tsx`, `mitre-badge.tsx`, existing alert list components.

**Test cases:**
1. Inject 3+ alerts for same adversary IP → offense created in `v11-offense-*`
2. Navigate to `/offenses` → table shows the offense with correct alert count
3. Click offense → detail view shows all contributing alerts on timeline
4. Change status to "false-positive" → status updates in OpenSearch
5. Filter by status=open → only open offenses returned
6. Verify offense magnitude reflects alert severity (high-severity alerts = higher magnitude)

---

#### ENH-06: Native Threat Intel IOC Search (G-08)
**What**: Verify and complete the Next.js threat-intel page's connection to the backend IOC endpoint. If broken, wire it up. Add STIX/TAXII feed support.

**Part A — Verify/fix IOC search UI** (`frontend-v2/src/app/(app)/threat-intel/page.tsx`):
- Confirm search calls `GET /api/v1/threat-intel/ioc?value={query}`
- Confirm results display correctly (IP reputation, tags, last seen, feed source)
- Add loading state and error state

**Part B — Add free feed support** in `plugins/feeds/`:
Currently hardcoded to ThreatWinds. Add configurable feed sources:
- **AbuseIPDB** (free tier: 1000 lookups/day) — `GET https://api.abuseipdb.com/api/v2/check?ipAddress={ip}`
- **Feodo Tracker** (free blocklist) — CSV download, cache locally, query without API key
- **MISP** feed support — if customer has MISP, poll via MISP REST API

Config: add feed type + API key to module configuration (existing `modules-config` service).

**Test cases:**
1. Search known malicious IP `185.220.101.1` → results show reputation score, categories, last seen date
2. Search known clean IP `8.8.8.8` → "not found in threat intel" or clean result
3. Search file hash → results if hash is in feed
4. AbuseIPDB feed: configure API key, confirm enrichment appears on events from malicious IPs
5. Feodo feed: inject C2 IP from Feodo blocklist → alert fires + threat intel tag on event

---

#### ENH-07: MITRE ATT&CK Coverage Heatmap (G-09)
**What**: Build a heatmap showing which MITRE tactics/techniques are covered by active rules vs which have zero coverage. Critical for gap analysis.

**Backend** (new endpoint): `MitreResource.java`
```
GET /api/mitre/coverage
Response: {
  "covered": [{"technique":"T1110.003","tactic":"Credential Access","ruleCount":3}],
  "uncovered": [{"technique":"T1566.001","tactic":"Initial Access"}],
  "totalRules": 634,
  "coveragePercent": 23.4
}
```
Backend queries `utm_correlation_rules` table, groups by `technique`, joins against a static MITRE ATT&CK techniques reference table.

**Frontend v2** (new widget in `/dashboard` and standalone `/rules/coverage` page):
- ATT&CK matrix grid (tactics as columns, techniques as rows)
- Cell color: `empty → covered by 1 rule → covered by 3+ rules` (3-shade gradient)
- Click cell: side drawer listing all rules covering that technique with enable/disable toggle
- Export as CSV

**Static MITRE data**: Ship ATT&CK Enterprise v14 techniques as a JSON file in the frontend bundle (`public/mitre-attack-v14.json`).

**Test cases:**
1. Navigate to `/rules/coverage` → matrix renders without error
2. Technique T1110 (Brute Force) — verify at least 1 rule shown (linux brute force rule exists)
3. Click an uncovered technique → side drawer shows "No rules cover this technique" + "Create rule" button
4. Disable a rule → its technique cell updates to reflect reduced count
5. Export CSV → download contains technique ID, name, tactic, rule count, rule names

---

#### ENH-08: CEL Rule Builder (G-10)
**What**: Add a guided WHERE expression builder to the rule management UI — so admins don't need to memorize CEL syntax and gjson path conventions.

**Frontend v2** — `frontend-v2/src/app/(app)/rules/` — add `RuleWhereBuilder` component:

Visual builder with:
- **Field selector**: dropdown of known normalized fields (`origin.ip`, `log.message`, `log.eventID`, `log.processName`, `origin.user`, etc.) loaded from a static schema + dynamic field discovery from OpenSearch mappings
- **Operator selector**: `contains`, `equals`, `not equals`, `starts with`, `exists`, `greater than`, `less than`
- **Value input**: free text; for IP fields, validates CIDR format
- **Condition chaining**: AND / OR buttons to combine multiple conditions
- **Preview pane**: shows the generated CEL string (e.g., `contains("log.message", "Failed password") && safe("origin.ip", "") != ""`)
- **Test panel**: paste a raw log → run through `POST /v1/inject` with `dry_run=true` → show which rules would match

New backend endpoint: `POST /api/rules/test` — accepts `{rule: RuleYAML, sample: RawLog}` → returns `{matched: bool, fields: map, error: string}`. This calls the event processor's `/v1/inject` in dry-run mode.

**Test cases:**
1. Open rule builder → select field `log.message`, operator `contains`, value `Failed password` → preview shows `contains("log.message", "Failed password")`
2. Add AND condition for `origin.ip` `exists` → preview shows compound expression
3. Paste sample SSH failure log into test panel → rule shows as matched
4. Paste normal auth log → rule shows as not matched
5. Save rule → appears in rule list, hot-reloads into engine within 35s
6. Invalid CEL (unmatched parens) → error shown before save

---

#### ENH-09: Pipeline Test Panel (G-11)
**What**: Complete the "paste raw log → test pipeline" feature in the Next.js data-parsing page.

The Angular version has this; the Next.js page already has the input field but needs to be wired.

**New backend endpoint**: `POST /api/pipeline/test`
```json
Request:  {"dataType": "linux", "raw": "Jul 8 12:34:56 server sshd[1234]: Failed password for root from 1.2.3.4 port 22 ssh2"}
Response: {"fields": {"log.message": "Failed password...", "origin.ip": "1.2.3.4", "log.pid": "1234"}, "steps_executed": 3, "dropped": false, "error": null}
```

The backend forwards this to `POST http://eventprocessor:8090/v1/inject?dry_run=true` and returns the resulting field map without writing to OpenSearch.

**Frontend v2** wiring (`frontend-v2/src/app/(app)/data-parsing/page.tsx`):
- Wire the existing raw log textarea to call `POST /api/pipeline/test`
- Show extracted fields as a key-value table with type indicators (IP fields highlighted, timestamps formatted)
- Show "Dropped: yes/no" indicator
- Show pipeline steps executed with pass/fail per step

**Test cases:**
1. Select data type `linux`, paste SSH failure syslog → extracted fields table shows `origin.ip: 1.2.3.4`, `log.message: "Failed password..."`
2. Paste Suricata JSON → `log.signatureID`, `log.category` extracted
3. Paste a log that matches a drop rule → "Dropped: yes" shown, no fields beyond drop step
4. Select a data type with no filter defined → "No pipeline configured for this data type" message
5. Break the YAML syntax in the filter editor → error message shown in test panel

---

### Sprint 3 — Intelligence & Detection Depth (Weeks 6–9)

---

#### ENH-10: UEBA — Behavioral Baseline per Entity (G-13)
**What**: Extend the existing `UbaResource.java` with behavioral profiling: per-user/IP login time patterns, typical source locations, peer group comparisons.

**Backend enhancements** to `UbaResource.java`:
- `GET /api/uba/entities/{id}/profile` — entity's behavioral profile:
  ```json
  {
    "entity": "alice@corp.com",
    "entityType": "user",
    "typicalLoginHours": [8, 9, 10, 17, 18],
    "typicalSourceIPs": ["10.0.0.15", "10.0.0.16"],
    "typicalCountries": ["US"],
    "avgDailyEvents": 145,
    "riskScore": 32
  }
  ```
- `GET /api/uba/entities/{id}/timeline` — all events for entity over last 30 days, binned by hour

**New background service** (`UbaProfileCollector.java`):
- Runs every 6h
- Queries `v11-log-*` for past 30 days, grouped by `origin.user` and `origin.ip`
- Computes: typical login hour distribution, location distribution, peer group average event rate
- Writes profiles to `v11-uba-profiles-*` index

**Anomaly detection** in existing `UbaResource`:
- Flag: login at unusual hour (>2 std devs from typical hour distribution)
- Flag: login from new country (not in typical countries)
- Flag: event rate spike (>3x peer group average for same role/department — requires lookup table identity enrichment to be working, i.e. ENH-01 first)

**Frontend v2** (`frontend-v2/src/app/(app)/uba/`):
- Entity list with risk score bars — likely mostly done given 720 lines
- Add entity profile page: radar chart (login hours clock), world map (source locations), peer comparison bar chart
- Anomaly feed: newest anomalies with "why flagged" explanation

**Test cases:**
1. Inject 30 days of user login events for `alice` always from `10.0.0.15` at 09:00
2. Run UBA profile collector (or trigger manually)
3. Profile for `alice` shows `typicalSourceIPs: ["10.0.0.15"]`, `typicalLoginHours: [9]`
4. Inject login from `198.51.100.1` at 03:00 → anomaly created with reason "unusual source IP + unusual hour"
5. Anomaly visible in `/uba` frontend with correct entity and reason
6. Watchlist: add entity to watchlist → all events from that entity appear in watchlist feed

---

#### ENH-11: Sigma Rule Import Pipeline (G-15)
**What**: Allow importing Sigma rules directly into ArmorSight as native CEL rules.

**Sigma-to-ArmorSight transpiler** — new Go CLI/service `tools/sigma-import/`:

Mapping logic:
| Sigma | ArmorSight |
|---|---|
| `logsource.category: process_creation` | `dataTypes: [wineventlog, linux]` |
| `logsource.product: windows` | `dataTypes: [wineventlog]` |
| `detection.selection.EventID: 4688` | `where: safe("log.eventID","") == "4688"` |
| `detection.selection.CommandLine|contains: mimikatz` | `where: contains("log.commandLine","mimikatz")` |
| `detection.condition: selection` | CEL AND of all selection fields |
| `condition: selection \| count() > 5` | `correlation: [{count: 5, within: "10m"}]` |
| `tags: [attack.t1059]` | `technique: T1059` |
| `level: high` | `riskScore: 75` |

**Backend endpoint**: `POST /api/rules/import-sigma`
- Accepts Sigma YAML text or URL
- Runs transpiler
- Returns preview of ArmorSight rule YAML
- On confirm: writes to `$WORK_DIR/rules/sigma-imported/`

**Frontend v2** (`/rules` page) — import panel:
- Paste Sigma YAML or enter sigma-rules.org/GitHub URL
- Preview generated ArmorSight rule
- "Import" button

**Test cases:**
1. Import Sigma rule for Mimikatz detection → preview shows correct `dataTypes: [wineventlog]`, `technique: T1003`, `where` with correct CEL
2. Import a threshold Sigma rule (count > N) → correlation block generated correctly
3. Import a rule with multiple selection conditions → CEL AND chain correct
4. Import via URL (Sigma GitHub raw URL) → fetches and transpiles
5. After import, rule appears in rule list, hot-reloads, fires on a matching injected event

---

#### ENH-12: Campaign-Level SOC-AI Summary (G-19)
**What**: Today SOC-AI triages individual alerts. Add incident-level and offense-level AI summarization.

**Backend** (`UtmSocAiResource.java`) — new endpoints:
```
POST /api/soc-ai/summarize-incident/{incidentId}
→ Fetches all alerts in incident, sends to LLM with prompt:
  "Summarize this security incident as a SOC analyst narrative. What happened, in what order, what is the attacker's apparent objective, what is the recommended response?"
→ Returns: {narrative: string, attackPhase: string, recommendations: [string], confidence: float}

POST /api/soc-ai/summarize-offense/{offenseId}
→ Same but for offense (from v11-offense-* + all contributing alerts)
```

**Frontend v2** — add AI summary panel to:
- Incident detail page (`/incidents/[id]`) — "Generate AI Summary" button
- Offense detail page (`/offenses/[id]`) — same

**Test cases:**
1. Create incident with 3 linked alerts (brute force + lateral movement + privilege escalation)
2. Click "Generate AI Summary" → loading spinner, then narrative paragraph displayed
3. Narrative correctly identifies attack pattern (not hallucinated field values)
4. Summary is regeneratable (new result on second click)
5. Works with at least Anthropic and OpenAI providers (test both)

---

#### ENH-13: Alert Suppression / Maintenance Windows (G-25)
**What**: Allow admins to suppress rule alerts during maintenance windows.

**Backend** (`SuppressionRuleResource.java`):
```
POST /api/suppression-rules  {ruleName, ruleId, reason, startsAt, endsAt, recurring: {cron}}
GET  /api/suppression-rules
DELETE /api/suppression-rules/{id}
```

**Event Processor** (`rules/engine.go`):
- Before writing an alert: check if a suppression rule matches (by rule ID or rule name pattern)
- If current time is within any suppression window, skip the alert write
- Suppression rules loaded from backend API at startup + polled every 60s

**Frontend v2** (new panel in `/rules` or `/admin/settings`):
- List active suppressions with time remaining
- Create: select rule, set time window or cron schedule, enter reason
- "Quick suppress for 1h/4h/24h" buttons on alert detail page

**Test cases:**
1. Create suppression for rule "Linux: Possible SSH Brute Force" from now for 2 hours
2. Inject 5 SSH failure events → no alert fires (suppressed)
3. Delete suppression → inject 5 more events → alert fires
4. Recurring suppression (every Sunday 02:00–04:00) — validate cron evaluation
5. Suppression for non-existent rule → error message returned
6. Expired suppression → alert fires again

---

### Sprint 4 — Scale & Compliance (Weeks 10–14)

---

#### ENH-14: Compliance Standard Templates (G-21)
**What**: Add PCI-DSS v4, SOC 2 Type II, and ISO 27001 built-in compliance templates alongside existing HIPAA.

**Implementation**:
- Create compliance standard seed data for PCI-DSS, SOC 2, ISO 27001 as SQL migrations
- Each standard: control ID, control name, description, mapped OpenSearch query (what log evidence satisfies the control), pass/fail threshold
- Example: PCI-DSS 10.2.1 "Implement audit logs" → query for `dataType:wineventlog AND log.eventID:4624` — if events exist in last 24h, pass

**Files:**
- `backend/src/main/resources/db/migration/V{N}__add_compliance_standards.sql` — seed data
- `backend/src/main/java/com/nilachakra/service/compliance/` — add standard-specific query builders for PCI/SOC2/ISO

**Test cases:**
1. Import PCI-DSS template → 12 requirements + sub-controls appear in compliance module
2. Evaluation runs → controls with matching log data show "Pass", missing controls show "Fail"
3. Export compliance report as PDF → web-pdf service generates report with control summary table
4. Schedule weekly evaluation → runs automatically, history recorded
5. Custom control within PCI-DSS standard → can add org-specific controls

---

#### ENH-15: Data Retention Policy Management (G-NA — new feature)
**What**: Per-source configurable retention with automated ISM policy creation.

**Backend** (`IndexPolicyResource.java` — already exists, enhance):
```
POST /api/index-policy/retention-rules  {dataType, retentionDays, rolloverGb}
→ Creates/updates OpenSearch ISM policy for v11-log-{dataType}-* indices
```

**Frontend v2** (`/admin/settings` or `/opensearch` page):
- Table: data type, current retention (days), storage used, estimated cost
- Edit inline: set retention days → backend creates ISM policy

**Test cases:**
1. Set netflow retention to 30 days → ISM policy `v11-log-netflow-retention` created in OpenSearch
2. Index older than 30 days → ISM deletes it on next evaluation
3. Set auth log retention to 365 days → ISM policy updated
4. Retention dashboard shows storage per data type

---

#### ENH-16: Natural Language Threat Hunting (G-24)
**What**: Add an AI-powered "ask a question" search bar to the log analyzer.

**Backend** (`LogAnalyzerResource.java` — enhance):
```
POST /api/log-analyzer/nl-search
Body: {"question": "Show me all lateral movement from the last 7 days"}
Response: {"query": {OpenSearch DSL}, "explanation": "Searching for logon events with destination IPs different from origin...", "results": [...]}
```

LLM prompt engineering:
- System: "You are a SOC analyst. Convert the security question to an OpenSearch query DSL. Available indices: v11-log-*. Available fields: origin.ip, origin.user, target.ip, log.message, log.eventID, dataType, @timestamp. Return JSON with 'query' (DSL) and 'explanation' (one sentence what you searched for)."
- Validate the returned DSL before executing (schema check, prevent wildcard delete)

**Frontend v2** (`/logs` page):
- Add NL search toggle button alongside existing query bar
- "Ask a question" text field → spinner → results table + explanation badge

**Test cases:**
1. Query "failed logins in the last hour" → DSL has `range @timestamp` + `term log.eventID:4625`
2. Query "brute force attacks from external IPs" → DSL filters private RFC1918 ranges
3. Query generates invalid DSL (edge case) → fallback to empty result + error message, no crash
4. Results match what a manual DSL query would return (verify with parallel manual query)
5. Works with Anthropic provider (test with `claude-haiku-4-5` for cost efficiency)

---

## 4. Full Gap-to-Enhancement Mapping

| Gap ID | Enhancement | Sprint | Effort | Priority |
|--------|-------------|--------|--------|----------|
| G-01 | ENH-01: Fix lookup enrichment write | 1 | 1h | P0 — blocker |
| G-03 | ENH-02: Mount upstream filters | 1 | 2h | P0 — blocker |
| G-04 | ENH-03: Teams + PagerDuty channels | 1 | 4h | P1 — high |
| G-06, G-07 | ENH-04: Enable disabled routes | 1 | 1h | P1 — easy win |
| G-12 | ENH-05: Offense management UI | 2 | 2 days | P1 — high |
| G-08 | ENH-06: Native threat intel IOC + feeds | 2 | 3 days | P1 — high |
| G-09 | ENH-07: MITRE ATT&CK heatmap | 2 | 2 days | P1 — high |
| G-10 | ENH-08: CEL rule builder | 2 | 3 days | P1 — high |
| G-11 | ENH-09: Pipeline test panel | 2 | 1 day | P2 — medium |
| G-13 | ENH-10: UEBA behavioral profiles | 3 | 4 days | P2 — medium |
| G-15 | ENH-11: Sigma rule import | 3 | 3 days | P2 — medium |
| G-19 | ENH-12: Campaign SOC-AI summary | 3 | 2 days | P2 — medium |
| G-25 | ENH-13: Alert suppression windows | 3 | 2 days | P2 — medium |
| G-21 | ENH-14: Compliance templates (PCI, SOC2) | 4 | 3 days | P3 — long-term |
| N/A | ENH-15: Data retention management | 4 | 2 days | P3 — long-term |
| G-24 | ENH-16: Natural language threat hunting | 4 | 3 days | P3 — long-term |

---

## 5. Frontend v2 Migration Completion (Cross-cutting)

The Angular (v1) → Next.js (v2) migration is in progress. Both run simultaneously. The following Angular features need porting to v2 before Angular can be decommissioned:

| Feature | Angular status | Next.js v2 status | Action |
|---|---|---|---|
| Alert management full detail | ✅ Complete | ✅ Complete | — |
| SOAR visual playbook builder | ✅ Complete | 🟡 167 lines (shallow) | Port playbook builder |
| Compliance | ✅ Complete | 🟡 Exists but verify depth | Verify + complete |
| Dashboard visualization builder | ✅ Complete | ✅ Exists | Verify feature parity |
| Log analyzer | ✅ Complete | ✅ Exists | — |
| Report module | 🔴 Route disabled | ✅ Route exists in v2 | Fix v1, ensure v2 works |
| Vulnerability scanner | 🔴 Route disabled | ✅ Route exists in v2 | Fix v1, ensure v2 works |
| Active Directory audit | ✅ Complete | ✅ Exists | — |
| Data parsing | ✅ Complete | 🟡 Pipeline test panel incomplete | ENH-09 |
| Rule management | ✅ Complete | 🟡 Exists, no CEL builder | ENH-08 |

Once Next.js covers 100% of Angular's functionality, remove Angular from `docker-compose.yml` and redirect `:443` to Next.js `:3000`.

---

## 6. Quick Wins (Do These First, Takes < 1 Day Each)

In order of effort:

1. **Fix `setStr()` stub** — 30 minutes, 10 lines of code (ENH-01)
2. **Mount filters volume** — 5 minutes, add one line to docker-compose.override.yml (ENH-02)
3. **Uncomment disabled routes** — 5 minutes (ENH-04)
4. **Add Teams channel dispatch** — 2 hours (ENH-03)
5. **Add PagerDuty channel dispatch** — 2 hours (ENH-03)

These 5 items alone fix 4 blocking gaps and add 2 major enterprise channels. Total effort: ~1 day.
