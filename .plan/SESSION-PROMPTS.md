# ArmorSight — Session Build Prompts

Each section below is a self-contained prompt you copy-paste into a new Claude Code session to build that feature end-to-end. Sessions are ordered by dependency (do earlier ones first).

---

## SESSION 1 — Quick Wins: Fix Blocking Gaps
**Estimated time: 2–3 hours**
**No dependencies**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
This is a Go + Java Spring Boot + Next.js SIEM platform.

Fix three blocking gaps in order. Each has a test. Do not move to the next until the current one passes.

---

### FIX 1 — Lookup Enrichment (Go, 10 lines)

File: event-processor/enterprise/lookup/service.go
Function: setStr() at line ~179

Current state: setStr() is an explicit no-op stub with comment "full integration is via pipeline enrichment."

What to do:
- Implement setStr() to write the field into the event's Log map using structpb.NewStringValue(value)
- Also write the flat dot-notation key to event.Log so OpenSearch stores both "asset.hostname" (flat) and the nested form
- Guard: if event == nil or value == "" return early

After implementing, rebuild the engine binary:
  cd event-processor && GOPATH=$HOME/go GOMODCACHE=$HOME/go/pkg/mod CGO_ENABLED=0 go build -o /tmp/claude-501/armorsight-engine .

Test:
1. Seed asset: curl -sk -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" -X PUT "https://localhost:9200/v11-lookup-assets/_doc/1" -H "Content-Type: application/json" -d '{"ip":"10.99.0.1","hostname":"test-asset-01","criticality":"high","businessUnit":"engineering"}'
2. Inject event: curl -s -X POST http://localhost:8090/v1/inject -H "Content-Type: application/json" -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"test from 10.99.0.1","originIP":"10.99.0.1"}'
3. Wait 7 seconds
4. Query: curl -sk -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" "https://localhost:9200/v11-log-linux-*/_search?q=origin.ip:10.99.0.1&size=1" | jq '._source["asset.hostname"]'
5. PASS if result = "test-asset-01"

---

### FIX 2 — Mount Upstream Pipeline Filters (Docker, 1 line)

File: local-dev/docker-compose.override.yml

Current state: The engine watches $WORK_DIR/pipeline/filters/ for YAML pipeline files, but there is no volume mount providing those files. The 37 upstream filter YAMLs live at filters/ in the repo root but are never mounted into the container. As a result, zero log normalization happens for real agent data.

What to do:
Add this line to the volumes section of the eventprocessor service in local-dev/docker-compose.override.yml:
  - ../filters:/workdir/pipeline/filters:ro

After the change, restart the eventprocessor service:
  cd local-dev && docker compose -f docker-compose.yml -f docker-compose.override.yml up -d eventprocessor

Test:
1. Wait 35 seconds for hot-reload to pick up the mounted YAMLs
2. Inject a real Linux syslog: curl -s -X POST http://localhost:8090/v1/inject -H "Content-Type: application/json" -d '{"dataType":"linux","dataSource":"test","tenantID":"default","raw":"Jul  8 12:34:56 myhost sshd[9999]: Failed password for root from 185.220.101.1 port 22 ssh2"}'
3. Wait 7 seconds
4. Query: curl -sk -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" "https://localhost:9200/v11-log-linux-*/_search?q=origin.ip:185.220.101.1&size=1" | jq '.hits.hits[0]._source | {"origin.ip": .["origin.ip"], "log.message": .log.message}'
5. PASS if origin.ip = "185.220.101.1" and log.message is non-empty (field extraction worked)
6. Repeat with a Windows event JSON to verify windows-events.yml also loads

---

### FIX 3 — Add Microsoft Teams Notification Channel (Java, ~30 lines)

File: backend/src/main/java/com/nilachakra/service/notification_channel/NotificationChannelService.java

Current state: dispatch() switch has cases for "email", "slack", "webhook" only.

What to do:
1. Add case "teams" to the dispatch() switch (line ~145)
2. Implement dispatchTeams() private method:
   - Channel config: ch.getWebhookUrl() contains the Teams Incoming Webhook URL
   - Payload format is Teams Adaptive Card:
     POST to webhookUrl with body:
     {"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{"type":"AdaptiveCard","$schema":"http://adaptivecards.io/schemas/adaptive-card.json","version":"1.2","body":[{"type":"TextBlock","text":"ArmorSight SIEM Alert","weight":"Bolder","size":"Medium","color":"<color>"},{"type":"TextBlock","text":"<message>","wrap":true}]}}]}
   - Color mapping: severity "high"/"critical" → "Attention", "medium" → "Warning", default → "Good"
   - Use the existing HttpClient pattern from dispatchWebhook() — same HTTP POST pattern, different URL and body format
3. Add case "pagerduty" to dispatch() switch
4. Implement dispatchPagerDuty() private method:
   - Channel config: ch.getApiKey() contains the PagerDuty routing key
   - Payload: POST to https://events.pagerduty.com/v2/enqueue
     {"routing_key":"<key>","event_action":"trigger","payload":{"summary":"<message>","severity":"<critical|warning|info>","source":"ArmorSight SIEM"}}
   - Severity mapping: "high"/"critical" → "critical", "medium" → "warning", default → "info"

After changes, rebuild the backend:
  cd backend && mvn package -DskipTests -q && docker build -t nilachakra/backend:local .

Test:
1. Use an existing Teams channel or create a test webhook URL at https://webhook.site (free)
2. POST to /api/notification-channels with {"name":"Test Teams","channelType":"teams","webhookUrl":"<url>"}
3. POST to /api/notification-channels/{id}/test
4. PASS if webhook.site receives a Teams-formatted JSON payload

Also verify existing email/slack/webhook dispatch still works (no regression).
```

---

## SESSION 2 — Offense Management UI
**Estimated time: 4–6 hours**
**Dependencies: None (offense engine already writes to v11-offense-* index)**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Next.js 14 (App Router) frontend in frontend-v2/, Java Spring Boot backend in backend/, Go event processor in event-processor/.

The offense engine is fully implemented in event-processor/enterprise/offense/engine.go — it groups 3+ related alerts (same adversary within 2h) into offense documents written to OpenSearch index v11-offense-*.

An offense document looks like:
{
  "@timestamp": "2026-07-08T12:00:00Z",
  "lastUpdate": "2026-07-08T12:30:00Z",
  "name": "Linux: Possible SSH Brute Force Attack",
  "magnitude": 7,            // 0-10 score
  "status": "open",          // open | closed | false-positive
  "alertCount": 5,
  "dataTypes": ["linux"],
  "adversary": {"ip": "185.220.101.1"},
  "target": {"ip": "10.0.0.5"},
  "alerts": ["alert-id-1", "alert-id-2"],
  "technique": "T1110.003",
  "category": "Credential Access"
}

Build the offense management feature end-to-end.

---

### PART 1 — Backend API

File to create: backend/src/main/java/com/nilachakra/web/rest/OffenseResource.java

Endpoints:
- GET /api/offenses?page=0&size=25&status=open&sort=magnitude,desc
  → Query v11-offense-* OpenSearch index. Use the existing ElasticsearchResource pattern (look at how UtmAlertResource.java or UtmIncidentResource.java query OpenSearch).
  → Return Page<Map<String,Object>> with total count and offense list
- GET /api/offenses/{id}
  → Single offense by document ID from v11-offense-*
- PUT /api/offenses/{id}/status
  → Body: {"status": "closed"} — update offense status field in OpenSearch
- GET /api/offenses/{id}/alerts
  → Fetch alert documents for IDs in the offense's alerts[] array from v11-alert-*
  → Return List<Map<String,Object>>

Look at how UtmAlertResource.java and AlertSseResource.java query OpenSearch to understand the existing patterns. Use the same ElasticsearchResource or ElasticsearchService dependencies.

---

### PART 2 — Frontend Service

File to create: frontend-v2/src/services/offense.service.ts

Service methods:
- listOffenses(params: {page, size, status?, sort?}): Promise<{content: Offense[], total: number}>
- getOffense(id: string): Promise<Offense>
- updateOffenseStatus(id: string, status: string): Promise<void>
- getOffenseAlerts(id: string): Promise<Alert[]>

Use the existing fetch wrapper pattern from frontend-v2/src/services/alert.service.ts as a model.

TypeScript type for Offense:
interface Offense {
  id: string;
  timestamp: string;
  lastUpdate: string;
  name: string;
  magnitude: number;  // 0-10
  status: "open" | "closed" | "false-positive";
  alertCount: number;
  dataTypes: string[];
  adversary: { ip?: string; user?: string };
  target?: { ip?: string };
  alerts: string[];
  technique?: string;
  category?: string;
}

---

### PART 3 — Offense List Page

File to create: frontend-v2/src/app/(app)/offenses/page.tsx

UI design:
- Page header: "Offenses" with count badge and filter tabs: All | Open | Closed | False Positive
- Table columns: Magnitude (0-10 progress bar with color: 8-10 red, 5-7 orange, 0-4 yellow), Name, Adversary IP/User, Alert Count, Data Types (badge chips), Last Updated, Status badge, Actions
- Click row → opens detail drawer or navigates to /offenses/[id]
- Pagination: 25 per page
- Status filter tabs update the query param

Reuse existing components from other pages:
- severity-badge.tsx or stat-card.tsx for magnitude
- mitre-badge.tsx for technique
- Pattern from alerts/page.tsx for the table layout
- Pattern from incidents/page.tsx for status badge styling

Also add "Offenses" to the sidebar navigation. Check frontend-v2/src/components/ for the nav component and add the entry after "Incidents" with a Shield icon (lucide-react).

---

### PART 4 — Offense Detail Page

File to create: frontend-v2/src/app/(app)/offenses/[id]/page.tsx

UI layout (two-column):
Left column:
- Offense header: name, magnitude bar, status badge + change dropdown, last updated
- Adversary card: IP (with geolocation flag if available), technique, category
- Timeline: list of contributing alerts sorted by @timestamp (reuse alert item component from alerts page)

Right column:
- KPI row: Alert Count, Magnitude, Active Duration (lastUpdate - @timestamp)
- Data types: badge chips
- Action buttons: "Mark Closed", "Mark False Positive", "View All Alerts"

---

### Testing

After building, run the dev server:
  cd frontend-v2 && npm run dev

Then:
1. Seed a test offense directly into OpenSearch:
   curl -sk -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" -X POST "https://localhost:9200/v11-offense-2026.07.08/_doc" -H "Content-Type: application/json" -d '{"@timestamp":"2026-07-08T10:00:00Z","lastUpdate":"2026-07-08T12:00:00Z","name":"SSH Brute Force Campaign","magnitude":8,"status":"open","alertCount":7,"dataTypes":["linux"],"adversary":{"ip":"185.220.101.1"},"technique":"T1110.003","category":"Credential Access","alerts":[]}'

2. Navigate to /offenses — offense appears in table with magnitude=8 (red bar)
3. Click row — detail page shows correct data
4. Change status to "closed" — status badge updates, row moves to Closed tab
5. Filter by status=open — closed offense no longer shown
6. Verify backend returns 404 for non-existent offense ID
```

---

## SESSION 3 — MITRE ATT&CK Coverage Heatmap
**Estimated time: 4–5 hours**
**Dependencies: None**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Next.js 14 frontend in frontend-v2/, Java Spring Boot backend in backend/.

There are 634 correlation rules stored in the database (utm_correlation_rules table). Each rule has a `technique` field (MITRE ATT&CK T-code like "T1110.003") and a `ruleActive` boolean.

Build a MITRE ATT&CK coverage heatmap showing which techniques are covered by active rules vs uncovered.

---

### PART 1 — Backend Endpoint

File to create: backend/src/main/java/com/nilachakra/web/rest/MitreCoverageResource.java

Endpoint: GET /api/mitre/coverage

Logic:
1. Query utm_correlation_rules table: SELECT technique, COUNT(*) as ruleCount, SUM(CASE WHEN ruleActive THEN 1 ELSE 0 END) as activeCount FROM utm_correlation_rules GROUP BY technique
2. Return list of {technique, ruleCount, activeCount}

Also create: GET /api/mitre/coverage/export  → returns CSV (technique, tactic, name, ruleCount, activeCount)

Look at UtmCorrelationRulesResource.java for the existing repository/service patterns.

---

### PART 2 — Static MITRE Data

File to create: frontend-v2/public/mitre-attack-v15.json

This file maps technique IDs to names and tactics. Create it with at minimum the following top-level tactics and their most common techniques (focus on what ArmorSight has rules for: T1110, T1059, T1055, T1003, T1078, T1021, T1562, T1027, T1070, T1566, T1190, T1133, T1053, T1543, T1547, T1082, T1083, T1057, T1018, T1046, T1041, T1071, T1048, T1102, T1486, T1490, T1489):

Format:
[
  {"id":"T1110","name":"Brute Force","tactic":"Credential Access","subtechniques":["T1110.001","T1110.002","T1110.003","T1110.004"]},
  ...
]

Include all 14 MITRE tactics. For each technique, include id, name, tactic. You can look up exact names from your training data — accuracy matters here.

---

### PART 3 — Heatmap Page

File to create: frontend-v2/src/app/(app)/rules/coverage/page.tsx

Also add tab/link to this from frontend-v2/src/app/(app)/rules/page.tsx

UI design:
Matrix layout (not a table):
- Columns = MITRE Tactics (14 columns): Reconnaissance, Resource Development, Initial Access, Execution, Persistence, Privilege Escalation, Defense Evasion, Credential Access, Discovery, Lateral Movement, Collection, Command & Control, Exfiltration, Impact
- Rows = technique cells under each tactic
- Cell states:
  * EMPTY (no rules): bg-muted/30, text-muted, no border
  * COVERED (1-2 active rules): bg-amber-500/20, border border-amber-500/40
  * WELL COVERED (3+ active rules): bg-green-500/20, border border-green-500/40
  * DISABLED ONLY (rules exist but all inactive): bg-slate-500/20, dashed border
- Cell content: technique ID (small, monospace) + rule count badge
- Hover: tooltip showing technique name + list of rule names covering it
- Click: side drawer with full technique detail + rule list + enable/disable toggles per rule

Header:
- KPI row: Total Techniques Covered / Total MITRE Techniques, Coverage % (donut chart or progress), Active Rules / Total Rules
- Export CSV button → calls /api/mitre/coverage/export

---

### PART 4 — Service

File to create: frontend-v2/src/services/mitre.service.ts

Methods:
- getCoverage(): Promise<{technique: string, ruleCount: number, activeCount: number}[]>
- exportCsv(): downloads file from /api/mitre/coverage/export

---

### Testing

1. Navigate to /rules/coverage — matrix renders with all 14 tactic columns
2. Technique T1110 (Brute Force) — should appear covered (multiple linux brute force rules exist)
3. Hover a covered cell — tooltip shows rule names
4. Click a cell — drawer opens with rule list
5. Toggle a rule inactive in the drawer — cell updates to "disabled only" state
6. Click "Export CSV" — file downloads with correct columns
7. An uncovered technique — shows in EMPTY state (light gray cell)
```

---

## SESSION 4 — CEL Rule Builder + Pipeline Test Panel
**Estimated time: 5–6 hours**
**Dependencies: None**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Next.js 14 frontend in frontend-v2/, Java Spring Boot backend in backend/, Go event processor in event-processor/.

Build two related features: (1) a guided CEL WHERE expression builder for correlation rules, and (2) a working pipeline test panel for data parsing.

---

### PART 1 — Pipeline Test Panel (Backend)

The Next.js data-parsing page at frontend-v2/src/app/(app)/data-parsing/page.tsx already has a raw log textarea with placeholder "Paste a raw log line here…" — but it is NOT wired to actually call the engine.

New backend endpoint:
File: backend/src/main/java/com/nilachakra/web/rest/PipelineTestResource.java

POST /api/pipeline/test
Request body: {"dataType": "linux", "raw": "Jul 8 12:34:56 server sshd[1234]: Failed password..."}
Response: {"fields": {"origin.ip":"1.2.3.4","log.message":"Failed password..."}, "stepsExecuted": 3, "dropped": false, "processingMs": 4, "error": null}

Implementation: Forward the request to the event processor HTTP endpoint:
  POST http://eventprocessor:8090/v1/inject with query param ?dryRun=true
  The event processor should return the extracted fields WITHOUT writing to OpenSearch.

You also need to add dry-run support to the event processor:
File: event-processor/http/ingest.go
- Check query param ?dryRun=true (or X-Dry-Run: true header)
- If dry run: run the pipeline executor and return the resulting field map as JSON, but skip:
  - writer.WriteEvent() (no OpenSearch write)
  - rules.Evaluate() (no rule matching)
  - enrichment.EnrichEvent() (no geolocation lookup)
- Return: {"fields": map[string]string, "stepsExecuted": int, "dropped": bool}

Wire the frontend:
In frontend-v2/src/app/(app)/data-parsing/page.tsx, find the raw log textarea (search for "Paste a raw log line here") and:
1. Add a "Test Pipeline" button next to it
2. On click: POST to /api/pipeline/test with selected dataType and raw value
3. Show results as a two-column key-value table: field name (monospace) | value
4. Highlight special fields: origin.ip in blue, log.message in green
5. Show "Dropped: ✓" or "Dropped: ✗" badge
6. Show processing time in ms

---

### PART 2 — CEL Rule Builder Component

The rules page at frontend-v2/src/app/(app)/rules/page.tsx shows rule editing via a Monaco editor (RulesEditorPanel). Add a guided builder mode alongside it.

File to create: frontend-v2/src/components/rules/cel-where-builder.tsx

This component builds a CEL WHERE expression interactively.

Known normalized fields (hardcode as a constant array — these come from the event processor's field schema):
const KNOWN_FIELDS = [
  { path: "log.message", type: "string", label: "Log Message" },
  { path: "log.eventID", type: "string", label: "Event ID" },
  { path: "log.processName", type: "string", label: "Process Name" },
  { path: "log.commandLine", type: "string", label: "Command Line" },
  { path: "log.category", type: "string", label: "Log Category" },
  { path: "log.signatureID", type: "string", label: "Signature ID" },
  { path: "log.signature", type: "string", label: "Signature" },
  { path: "log.user", type: "string", label: "Username (raw)" },
  { path: "origin.ip", type: "ip", label: "Source IP" },
  { path: "origin.user", type: "string", label: "Source User" },
  { path: "target.ip", type: "ip", label: "Target IP" },
  { path: "dataType", type: "string", label: "Data Type" },
  { path: "raw", type: "string", label: "Raw Log" },
]

For each field, available operators depend on type:
- string: "contains", "equals", "not equals", "starts with", "ends with", "exists", "not exists"
- ip: "equals", "not equals", "exists", "not exists"

UI for each condition row:
[Field dropdown ▼] [Operator dropdown ▼] [Value input (hidden for exists/not-exists)] [🗑 Remove]

Below the conditions: [+ AND condition] [+ OR condition] buttons

CEL output rules:
- "contains" field "log.message" value "Failed password" → contains("log.message", "Failed password")
- "equals" → safe("log.eventID", "") == "4688"
- "not equals" → safe("origin.ip", "") != "10.0.0.1"
- "starts with" → startsWith("log.processName", "cmd")  (NOTE: startsWith is a valid CEL func in go-sdk)
- "exists" → exists("origin.ip")
- "not exists" → !exists("origin.ip")
- AND chain: expr1 && expr2
- OR chain: expr1 || expr2

Props:
interface CelWhereBuilderProps {
  value: string;         // current CEL string (for initializing from existing rule)
  onChange: (cel: string) => void;
}

Add to the rules editor panel: a toggle "Visual Builder / Raw CEL" — Visual Builder shows the CelWhereBuilder component, Raw CEL shows the existing Monaco textarea. Both stay in sync: editing Raw CEL updates the builder's state, building visually updates the Monaco text.

---

### PART 3 — Rule Test Against Sample Event

Add a "Test Rule" button to the rule editor panel.

When clicked:
- Shows a modal with a textarea for pasting a sample raw log
- Dropdown to select dataType
- "Run Test" button → calls POST /api/pipeline/test (dry run) then evaluates the current WHERE clause client-side against the returned fields
- Shows: "✓ Rule WOULD fire" (green) or "✗ Rule would NOT fire" (red) + list of fields that matched/didn't match

For client-side CEL evaluation, use a simple approach:
- Parse the CEL string into condition objects (same structure as the builder)
- Evaluate each condition against the field map returned by the pipeline test
- This is a best-effort UX hint — actual evaluation is server-side when the rule is saved

---

### Testing

1. Open /data-parsing, select Linux data type, paste an SSH failure syslog line, click "Test Pipeline"
   → Table shows origin.ip, log.message, etc. extracted correctly
   → Processing time shown
2. Paste a log that would be dropped → "Dropped: ✓" shown
3. Open /rules, create a new rule, toggle to Visual Builder
   → Add condition: log.message contains "Failed password"
   → CEL preview shows: contains("log.message", "Failed password")
4. Add AND condition: origin.ip exists → CEL shows: contains("log.message", "Failed password") && exists("origin.ip")
5. Switch to Raw CEL mode → same string shown, editable
6. Edit Raw CEL → builder updates to reflect change
7. Click "Test Rule", paste SSH failure log → "Rule WOULD fire" shown
8. Paste normal log → "Rule would NOT fire" shown
```

---

## SESSION 5 — Sigma Rule Import
**Estimated time: 4–5 hours**
**Dependencies: None (standalone transpiler)**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Go event processor in event-processor/, Java Spring Boot backend in backend/, Next.js frontend in frontend-v2/.

Build a Sigma rule import pipeline that transpiles Sigma YAML detection rules into ArmorSight's native CEL+YAML rule format.

---

### PART 1 — Sigma-to-ArmorSight Transpiler (Go)

File to create: tools/sigma-import/main.go
Also: tools/sigma-import/transpiler.go

The transpiler takes a Sigma YAML rule and produces an ArmorSight rule YAML.

Sigma rule structure (what you need to parse):
title, id, status, description, logsource.{product, category, service}, detection.{selection fields, condition}, tags (attack.tXXXX), level, falsepositives

ArmorSight rule structure (what you produce):
id, dataTypes, name, description, category, technique, impact, where (CEL), correlation (optional), riskScore

Mapping logic:

logsource → dataTypes:
  product=windows → ["wineventlog"]
  product=linux → ["linux"]
  category=process_creation, product=windows → ["wineventlog"]
  category=network_connection → ["netflow", "linux", "wineventlog"]
  product=aws → ["aws"]
  If unknown → ["generic"]

detection.selection → CEL WHERE:
  Each field in selection maps to a CEL expression:
  - {EventID: 4688} → safe("log.eventID","") == "4688"
  - {CommandLine|contains: "mimikatz"} → contains("log.commandLine","mimikatz")
  - {CommandLine|contains|all: ["cmd","powershell"]} → contains("log.commandLine","cmd") && contains("log.commandLine","powershell")
  - {CommandLine|contains: ["mimikatz","meterpreter"]} → (contains("log.commandLine","mimikatz") || contains("log.commandLine","meterpreter"))
  - {CommandLine|startswith: "C:\\"} → startsWith("log.commandLine","C:\\")
  - {CommandLine|endswith: ".exe"} → endsWith("log.commandLine",".exe")
  - {Image|re: ".*evil.*"} → matches("log.processName",".*evil.*")  [if go-sdk supports regexp — fallback to contains if not]

Field name mapping (Sigma field → ArmorSight log.* field):
  EventID → log.eventID
  CommandLine → log.commandLine
  Image / NewProcessName → log.processName
  ParentImage → log.parentProcessName
  User → log.user / origin.user
  DestinationIp → target.ip
  SourceIp → origin.ip
  DestinationPort → log.destinationPort
  Hostname → log.hostname

detection.condition → correlation:
  "selection" → just the WHERE expression
  "selection | count() > 5" → WHERE + correlation {count:5, within:"10m"}
  "selection1 and selection2" → combine with &&
  "selection1 or selection2" → combine with ||
  "not selection1" → negate the WHERE

tags (attack.tXXXX) → technique:
  Extract first T-code: attack.t1059.001 → "T1059.001"

level → riskScore:
  critical → 90, high → 70, medium → 40, low → 20, informational → 5

---

### PART 2 — Backend Endpoint

File to create: backend/src/main/java/com/nilachakra/web/rest/SigmaImportResource.java

POST /api/rules/sigma/preview
Body: {"yaml": "<sigma rule text>"}
Response: {"armorsightYaml": "<converted yaml>", "warnings": ["field X not recognized, mapped to log.X"], "error": null}
→ Calls the Go transpiler via HTTP or subprocess, returns preview

POST /api/rules/sigma/import
Body: {"yaml": "<sigma rule text>", "confirm": true}
Response: {"ruleId": 123, "name": "...", "technique": "T1059"}
→ After transpiling, saves to utm_correlation_rules table (same as existing rule creation endpoint)
→ Sets systemOwner=false (custom rule, not builtin)

POST /api/rules/sigma/import-url
Body: {"url": "https://raw.githubusercontent.com/SigmaHQ/sigma/master/rules/windows/process_creation/proc_creation_win_mimikatz.yml"}
→ Fetches the URL, transpiles, returns preview (same as preview endpoint)

---

### PART 3 — Frontend

In frontend-v2/src/app/(app)/rules/page.tsx, add an "Import Sigma" button in the toolbar.

When clicked: opens a modal/drawer with:
- Tab 1 "Paste YAML": Monaco editor (or textarea) for pasting Sigma YAML
- Tab 2 "From URL": text input for a GitHub raw URL to a Sigma rule
- "Preview" button → calls POST /api/rules/sigma/preview → shows the ArmorSight YAML output in a read-only Monaco pane
- Any warnings shown below preview (e.g., "field X not recognized")
- "Import Rule" button (enabled only after successful preview) → calls POST /api/rules/sigma/import → closes modal, rule appears in list

---

### Testing

Test case 1: Import a basic Sigma rule
Paste this Sigma YAML:
title: Mimikatz In-Memory
status: experimental
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\mimikatz.exe'
  filter:
    CommandLine|contains: '-test'
  condition: selection and not filter
level: high
tags:
  - attack.credential_access
  - attack.t1003.001

Expected ArmorSight output:
- dataTypes: [wineventlog]
- technique: T1003.001
- riskScore: 70
- where: endsWith("log.processName","\\mimikatz.exe") && !contains("log.commandLine","-test")

Test case 2: Threshold rule
Paste a Sigma rule with "| count() > 5 by SourceIp"
Expected: correlation block with count:5, within:"10m", filter by origin.ip

Test case 3: Import via URL
Enter: https://raw.githubusercontent.com/SigmaHQ/sigma/master/rules/windows/process_creation/proc_creation_win_mimikatz.yml
Expected: rule fetched and transpiled (or graceful error if URL unreachable in sandbox)

Test case 4: Imported rule fires
After importing the Mimikatz rule, inject:
  curl -s -X POST http://localhost:8090/v1/inject -H "Content-Type: application/json" -d '{"dataType":"wineventlog","dataSource":"dc01","tenantID":"default","raw":"{}","log":{"processName":"C:\\Users\\attacker\\mimikatz.exe","commandLine":"sekurlsa::logonpasswords"}}'
Verify alert appears in /alerts within 5 seconds.
```

---

## SESSION 6 — UEBA Behavioral Profiles + Timeline
**Estimated time: 5–6 hours**
**Dependencies: Session 1 (lookup enrichment must work for identity fields)**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Java Spring Boot backend in backend/, Next.js frontend in frontend-v2/.

The UBA backend (UbaResource.java) has summary, entities, anomalies endpoints. The frontend page at frontend-v2/src/app/(app)/uba/page.tsx is 720 lines and has entity list and anomaly views. 

Build deeper behavioral profiling: per-entity login patterns, source location history, and anomaly explanation.

---

### PART 1 — Backend Enhancements

New endpoint in UbaResource.java (or new UbaProfileResource.java):

GET /api/uba/entities/{entityId}/profile
→ Queries v11-log-* for past 30 days filtered by origin.user={entityId} OR origin.ip={entityId}
→ Computes:
  - typicalLoginHours: array of {hour: 0-23, count: int} — histogram of event hours
  - typicalSourceIPs: top 5 origin.ip values with event counts
  - typicalCountries: top 3 countries from geolocation
  - dailyEventCounts: past 30 days array of {date, count} for sparkline
  - totalEvents30d: int
  - avgDailyEvents: float
→ Response: {entityId, entityType: "user"|"ip", typicalLoginHours[], typicalSourceIPs[], typicalCountries[], dailyEventCounts[], totalEvents30d, avgDailyEvents}

GET /api/uba/entities/{entityId}/timeline
→ Queries v11-log-* and v11-alert-* for entity, last 7 days
→ Returns mixed list sorted by @timestamp:
  [{type:"event", timestamp, dataType, message, sourceIP}, {type:"alert", timestamp, name, severity, technique}]
→ Pagination: page + size params

Look at how LogAnalyzerResource.java or ElasticsearchResource.java queries OpenSearch for events — use the same client injection pattern.

---

### PART 2 — Anomaly Explanation

Enhance existing GET /api/uba/entities/{entityId}/anomalies response to include a "reason" field for each anomaly:

Reason computation (compare event to entity profile):
- If event sourceIP not in typicalSourceIPs: reason = "Login from unusual IP {ip} — not seen in past 30 days"
- If event hour not in top 5 typical hours: reason = "Login at unusual time {hour}:00 — typical hours are {hrs}"
- If event country not in typicalCountries: reason = "Login from {country} — not a typical source country"
- If dailyEventCount > avgDailyEvents * 3: reason = "Unusual activity spike: {count} events vs avg {avg}"

---

### PART 3 — Frontend Enhancements

The existing frontend-v2/src/app/(app)/uba/page.tsx has entity list and anomaly views. Read it first to understand what's there.

Add to the entity detail view (clicking an entity row):

Entity Profile Panel:
- Clock-face visualization of login hours: 24 segments, filled segments = hours with activity, color intensity = count
  (Use SVG path arcs or a simple bar chart in circular arrangement)
  ALTERNATIVE if complex: horizontal heatmap with hours 0-23 on x-axis
- Top Source IPs: small table with IP, count, flag emoji for country
- 30-day sparkline of daily event counts (use the existing sparkline.tsx component)
- KPI row: Total Events (30d), Avg Daily, Typical Hours range

Entity Timeline Panel (below or tab):
- Mixed event + alert timeline
- Event items: gray dot, timestamp, dataType chip, message truncated to 80 chars
- Alert items: red/orange dot with severity color, timestamp, alert name, MITRE badge (reuse mitre-badge.tsx), technique
- Load more button (pagination)

Anomaly Panel enhancements:
- For each anomaly, show the "reason" string in a callout below the anomaly title
- "Why flagged" expand toggle

---

### Testing

1. Inject 20 events for user "alice" from IP 10.0.0.50 at hours 9, 10, 11 over 5 days
2. Call GET /api/uba/entities/alice/profile → typicalLoginHours shows 9,10,11 with counts
3. Navigate to /uba, find alice → click entity → profile panel shows correct hours heatmap
4. Inject 1 event for alice from 198.51.100.1 at 03:00 → anomaly created
5. Anomaly in UI shows reason "Login from unusual IP 198.51.100.1 — not seen in past 30 days"
6. Timeline shows mixed events and alerts sorted by timestamp
7. Sparkline shows daily event distribution matching injected data
```

---

## SESSION 7 — Alert Suppression + Maintenance Windows
**Estimated time: 3–4 hours**
**Dependencies: None**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Java Spring Boot backend in backend/, Go event processor in event-processor/, Next.js frontend in frontend-v2/.

Build alert suppression / maintenance windows: a mechanism to silence specific rules during scheduled periods (e.g., maintenance windows, known noisy periods) without deleting the rules.

---

### PART 1 — Backend

Database migration:
File: backend/src/main/resources/db/migration/V{NEXT}__add_suppression_rules.sql
  CREATE TABLE utm_suppression_rules (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    reason VARCHAR(1000),
    rule_id BIGINT REFERENCES utm_correlation_rules(id) ON DELETE CASCADE,
    rule_name_pattern VARCHAR(500),  -- wildcard match if rule_id is null
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,             -- null = permanent until deleted
    cron_schedule VARCHAR(100),      -- for recurring windows (standard 5-field cron)
    cron_duration_minutes INT,       -- how long after cron fire to suppress
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    enabled BOOLEAN DEFAULT TRUE
  );

REST resource:
File: backend/src/main/java/com/nilachakra/web/rest/SuppressionRuleResource.java
  GET    /api/suppression-rules          — list all, with isActiveNow computed field
  POST   /api/suppression-rules          — create
  PUT    /api/suppression-rules/{id}     — update
  DELETE /api/suppression-rules/{id}     — delete
  GET    /api/suppression-rules/active   — only currently active ones (isActiveNow=true)

isActiveNow computation:
- One-time: now >= startsAt AND (endsAt is null OR now <= endsAt)
- Recurring cron: evaluate whether current time falls within a cron-triggered window
  (Use a simple check: last cron fire before now + cronDurationMinutes > now)

---

### PART 2 — Event Processor Integration

File: event-processor/rules/engine.go

Add suppression check before writing an alert:
1. Add a SuppressionLoader: polls GET http://backend:8080/api/suppression-rules/active every 60 seconds
2. Cache the active suppressions in memory
3. In the Evaluate() function, before calling writer.WriteAlert():
   - Check if any active suppression matches: by ruleId, or by rule name matching the pattern
   - If suppressed: log "Alert suppressed by rule {suppressionName}" and return without writing
4. The suppression check must be fast (in-memory lookup), not a synchronous HTTP call per event

SuppressionCache struct:
type SuppressionCache struct {
  mu          sync.RWMutex
  suppressions []ActiveSuppression
  lastRefresh  time.Time
}
type ActiveSuppression struct {
  RuleID      int64
  NamePattern string  // "" means match by ruleId only
}

---

### PART 3 — Frontend

Add suppression management to frontend-v2/src/app/(app)/rules/page.tsx — new "Suppressions" tab alongside existing rule list.

Suppression list view:
- Table: Rule/Pattern, Reason, Start, End (or "Recurring: cron expression"), Status (Active/Scheduled/Expired)
- "Active Now" badge in green for currently active suppressions
- Create button → opens form drawer

Create suppression form:
- Name: text
- Target: radio "Specific rule" (dropdown of rule names) | "Pattern" (wildcard text input)
- Reason: textarea
- Type: radio "One-time window" | "Recurring"
  - One-time: date-time pickers for start/end
  - Recurring: cron expression input + duration in minutes
- Enabled toggle

Also: add a "Suppress" quick action to the alert detail page (when viewing an alert, a "Suppress Rule for 4h" button creates a one-time suppression for that rule).

---

### Testing

1. Create suppression for rule "Linux: Possible SSH Brute Force Attack", starts now, ends in 30 minutes
2. Inject 5 SSH failure events from same IP → no brute force alert fires (suppressed)
3. Check engine logs: "Alert suppressed by rule Maintenance Window"
4. Delete the suppression
5. Inject 5 more SSH failure events → alert fires again
6. Create recurring suppression: every day at 02:00 for 120 minutes
7. Verify cron evaluation logic in unit test (mock time to 02:30 → suppressed, mock to 05:00 → not suppressed)
8. Suppression list UI shows "Active Now" badge for the active suppression
9. Use "Suppress for 4h" quick action from alert detail page → suppression created, alert for that rule stops firing
```

---

## SESSION 8 — SOC-AI Campaign Summary + NL Threat Hunting
**Estimated time: 5–6 hours**
**Dependencies: None (uses existing SOC-AI plugin infrastructure)**

```
You are working in the ArmorSight SIEM codebase at /Users/encryptshell/GIT/UTMStack-11.
Stack: Java Spring Boot backend in backend/, plugins/soc-ai/ (Go), Next.js frontend in frontend-v2/.

The SOC-AI system currently triages individual alerts. The soc-ai plugin (plugins/soc-ai/) reads alerts from OpenSearch, calls an LLM (8 providers: OpenAI, Anthropic, Azure, Gemini, Ollama, Mistral, DeepSeek, Groq), and writes triage results back. The backend endpoint is UtmSocAiResource.java.

Build two enhancements: (1) incident/offense campaign summary, (2) natural language threat hunting in the log analyzer.

---

### PART 1 — Campaign-Level AI Summary

New backend endpoints in UtmSocAiResource.java:

POST /api/soc-ai/summarize-incident/{incidentId}
Logic:
1. Fetch incident from DB: title, description, status, priority
2. Fetch linked alerts from utm_incident_alert table, then fetch alert details from v11-alert-* OpenSearch
3. Build LLM prompt:
   SYSTEM: "You are a senior SOC analyst writing an incident report. Be concise, factual, and actionable. Do not invent details not in the data."
   USER: "Summarize this security incident:
   
   Incident: {title}
   Status: {status} | Priority: {priority}
   
   Contributing alerts ({count}):
   {for each alert: - [{severity}] {name} | Adversary: {adversary.ip} | Technique: {technique} | Time: {timestamp}}
   
   Write: (1) One paragraph narrative of what happened, (2) Attacker objective (one sentence), (3) 3-5 bullet recommended actions."
4. Call LLM via the existing soc-ai plugin HTTP API (check how UtmSocAiResource.java calls the soc-ai plugin today)
5. Return: {narrative: string, objective: string, recommendations: [string], model: string, generatedAt: string}
6. Cache result in v11-soc-ai-summaries-* OpenSearch index (so re-opening the incident doesn't re-call LLM unless explicitly regenerated)

POST /api/soc-ai/summarize-offense/{offenseId}
Same logic but fetching offense from v11-offense-* (built in Session 2)

---

### PART 2 — Frontend: Incident Summary Panel

In frontend-v2/src/app/(app)/incidents/[id]/page.tsx, add an "AI Summary" panel:
- Initially collapsed with "Generate AI Summary" button
- On click: POST to /api/soc-ai/summarize-incident/{id} → loading spinner
- When loaded: display in a card:
  - "What happened" section: narrative paragraph
  - "Attacker objective" section: italic sentence  
  - "Recommended actions" section: numbered list with checkbox items
  - Footer: "Generated by {model} at {time}" in muted text | "Regenerate" button
- If cached summary exists (from previous generation), load immediately without spinner

Same panel in offense detail page (/offenses/[id] from Session 2).

---

### PART 3 — Natural Language Threat Hunting

New backend endpoint:
File: LogAnalyzerResource.java (enhance existing)

POST /api/log-analyzer/nl-search
Request: {"question": "Show me all lateral movement from the last 7 days"}
Response: {"query": {OpenSearch DSL}, "explanation": "Searching for...", "warnings": [], "results": {...}}

LLM prompt:
SYSTEM: "You are a SOC analyst assistant. Convert the security question to an OpenSearch query. 
Available fields: @timestamp (date), dataType (string), origin.ip (ip), origin.user (keyword), target.ip (ip), log.message (text), log.eventID (keyword), log.processName (keyword), log.commandLine (keyword), log.category (keyword), raw (text).
Available index pattern: v11-log-*.
Return ONLY a JSON object with two keys: 'query' (valid OpenSearch query DSL) and 'explanation' (one sentence describing what was searched).
Do not include markdown. Do not add any fields not listed above."

Validation of returned DSL:
- Deserialize to Map<String, Object> — if parse fails, return error
- Check that no 'delete', 'update', 'script' keys are present — if found, return error
- Max size: 1000 results

After getting the DSL, execute it against v11-log-* using ElasticsearchResource and return combined response.

---

### PART 4 — Frontend: NL Search in Log Analyzer

In frontend-v2/src/app/(app)/logs/page.tsx:
1. Add a toggle button "🔍 NL Search" alongside the existing search/filter bar
2. When NL mode active: replace the structured search with a single text input:
   placeholder: "Ask a question about your logs, e.g. 'Show brute force attacks in the last hour'"
3. On submit: POST /api/log-analyzer/nl-search
4. Show: generated DSL in a collapsible "View Query" section (read-only)
5. Show: explanation badge above results: "Searching for authentication failures with >5 attempts per IP"
6. Results render the same as the existing log table
7. "Edit as DSL" button converts to manual query mode with the generated DSL pre-filled

---

### Testing

Campaign summary:
1. Create incident with 3+ linked alerts
2. Click "Generate AI Summary" in incident detail
3. Verify: narrative covers all alerts, objective is sensible, recommendations are actionable
4. Close and reopen incident → summary loads from cache without LLM call
5. Click "Regenerate" → new LLM call, new result

NL threat hunting:
1. Navigate to /logs, click "NL Search"
2. Type "failed SSH logins in the last hour" → query has @timestamp range + log.message match for "Failed password"
3. Results show only SSH failure events
4. Click "View Query" → valid OpenSearch DSL shown
5. Type a vague question → explanation helps user understand what was searched
6. LLM returns invalid JSON → graceful error "Could not parse AI response, please try rephrasing"
7. Query attempts to include 'delete' → blocked with security error
```

---

## ORDER OF SESSIONS

| Session | Feature | Effort | Do first because... |
|---------|---------|--------|---------------------|
| **1** | Quick Wins (lookup, filters, Teams, PagerDuty) | 2–3h | Fixes blockers, unblocks real data through pipeline |
| **2** | Offense Management UI | 4–6h | Engine already works, just needs UI |
| **3** | MITRE ATT&CK Heatmap | 4–5h | High visibility, standalone |
| **4** | CEL Rule Builder + Pipeline Test | 5–6h | Core admin self-service capability |
| **5** | Sigma Rule Import | 4–5h | Access to 3000+ community rules |
| **6** | UEBA Behavioral Profiles | 5–6h | Needs Session 1 (lookup) to work fully |
| **7** | Alert Suppression | 3–4h | Standalone, high operator value |
| **8** | SOC-AI Campaign + NL Hunt | 5–6h | Builds on existing SOC-AI infra |
