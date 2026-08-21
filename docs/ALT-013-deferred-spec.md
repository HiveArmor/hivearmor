# ALT-013: Artifact and Sandbox Analysis — Deferred Spec

## Status: DEFERRED

---

## What Is ALT-013?

ALT-013 is the **Artifact and Sandbox Analysis** module for HiveArmor. It provides automated malware detonation and file analysis capabilities integrated into the alert triage workflow.

When an analyst encounters a suspicious file referenced in an alert (e.g., a dropped executable, a PowerShell script, an email attachment), ALT-013 enables them to:
1. Submit the artifact to an automated sandbox for detonation
2. View behavioral analysis results (process trees, network activity, registry changes, file drops)
3. Get a maliciousness verdict with confidence score
4. Enrich the parent alert with sandbox findings (IOCs, MITRE techniques observed)
5. Cross-reference sandbox-discovered IOCs with other alerts in the environment

---

## Why It's Deferred

ALT-013 requires **third-party sandbox integration** — it cannot function without an external analysis engine. HiveArmor does not include its own sandbox (building one is a multi-year effort outside scope).

**Blockers:**
1. **No sandbox API available in local-dev** — sandboxes require dedicated VMs/containers with full OS images for safe detonation
2. **Third-party API keys required** — commercial sandbox services (Any.Run, Joe Sandbox, VMRay) require paid subscriptions; open-source options (Cuckoo/CAPE) require dedicated infrastructure
3. **Network isolation requirements** — sandbox detonation must occur in an isolated network segment (malware may attempt lateral movement, C2 communication)
4. **Result latency** — sandbox analysis takes 2-10 minutes per sample; the API contract must handle async results, which differs from all other HiveArmor endpoints (synchronous or SSE)
5. **Legal/compliance considerations** — uploading customer files to third-party cloud sandboxes may violate data residency requirements for government/MSSP customers

**Decision:** Defer until a sandbox integration strategy is chosen (self-hosted vs. cloud, specific vendor selection, and customer deployment requirements are finalized).

---

## Sandbox API Requirements

ALT-013 needs connectivity to at least one of:

| Sandbox | Type | API | Notes |
|---------|------|-----|-------|
| **CAPE Sandbox** | Self-hosted (open source) | REST API | Fork of Cuckoo, actively maintained. Requires: dedicated analysis VMs, result storage, MongoDB |
| **Cuckoo Sandbox** | Self-hosted (open source) | REST API | Original project, less active. Same infra requirements as CAPE |
| **Any.Run** | Cloud SaaS | REST API v2 | Commercial. Paid plans start at $XXX/month. Cloud-hosted — data leaves network |
| **Joe Sandbox** | Cloud or On-Prem | REST API | Commercial. Offers on-prem appliance for sensitive environments |
| **VMRay** | Cloud or On-Prem | REST API | Commercial. Enterprise-focused, expensive |
| **Hatching Triage** | Cloud SaaS | REST API | Commercial. Fast turnaround, good API |

**Minimum sandbox capabilities required:**
- File submission (binary, script, document, archive)
- URL submission (for phishing link detonation)
- Behavioral analysis: process tree, network connections, file system changes, registry modifications
- IOC extraction: contacted IPs/domains, dropped files (with hashes), mutex names
- MITRE ATT&CK mapping of observed behaviors
- Verdict: malicious / suspicious / benign with confidence score
- Analysis timeout configuration (2-10 minutes)
- Result retrieval by submission ID (async polling or webhook)

---

## API Endpoints (When Implemented)

### Submit Artifact for Analysis

```
POST /api/ha-artifacts/analyze
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
  file: <binary file>
  metadata: {
    "alertId": "alert-001",           // Parent alert (optional)
    "entityId": "ent-host-fin-wks-044", // Source entity (optional)
    "fileName": "beacon.dll",
    "fileHash": "sha256:a4f8b2c1d3e5...",
    "analysisProfile": "windows_10_x64",
    "timeout": 300,                   // seconds
    "networkEnabled": false           // sandbox network access
  }

Response 202 Accepted:
{
  "submissionId": "sub-2026-0901-001",
  "status": "queued",
  "estimatedCompletion": "2026-09-01T14:35:00.000Z",
  "pollUrl": "/api/ha-artifacts/analyze/sub-2026-0901-001"
}
```

### Check Analysis Status

```
GET /api/ha-artifacts/analyze/{submissionId}
Authorization: Bearer <token>

Response 200 (pending):
{
  "submissionId": "sub-2026-0901-001",
  "status": "analyzing",    // queued | analyzing | complete | failed | timeout
  "progress": 65,           // percentage
  "startedAt": "2026-09-01T14:30:15.000Z"
}

Response 200 (complete):
{
  "submissionId": "sub-2026-0901-001",
  "status": "complete",
  "result": { ... }         // See SandboxResult below
}
```

### Get Analysis Result

```
GET /api/ha-artifacts/analyze/{submissionId}/result
Authorization: Bearer <token>

Response 200:
{
  "submissionId": "sub-2026-0901-001",
  "verdict": {
    "malicious": true,
    "confidence": 0.94,
    "classification": "trojan.cobalt_strike",
    "family": "Cobalt Strike",
    "tags": ["apt", "backdoor", "c2"]
  },
  "behavioral": {
    "processTree": [
      { "pid": 1204, "name": "explorer.exe", "children": [
        { "pid": 4892, "name": "beacon.dll", "children": [
          { "pid": 5100, "name": "cmd.exe", "cmdline": "cmd /c whoami" },
          { "pid": 5200, "name": "powershell.exe", "cmdline": "powershell -enc ..." }
        ]}
      ]}
    ],
    "network": [
      { "type": "dns", "query": "cdn-update.xyz", "answer": "203.0.113.88" },
      { "type": "http", "method": "GET", "url": "https://203.0.113.88/api/beacon", "status": 200 },
      { "type": "http", "method": "POST", "url": "https://203.0.113.88/api/data", "bodySize": 15360 }
    ],
    "fileSystem": [
      { "action": "create", "path": "C:\\Users\\victim\\AppData\\Local\\Temp\\beacon.log" },
      { "action": "modify", "path": "C:\\Windows\\System32\\drivers\\etc\\hosts" }
    ],
    "registry": [
      { "action": "create", "key": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\UpdateSvc", "value": "C:\\Users\\victim\\beacon.dll" }
    ],
    "mutexes": ["Global\\CobaltStrike_Beacon_v4"]
  },
  "iocs": {
    "ips": ["203.0.113.88"],
    "domains": ["cdn-update.xyz"],
    "urls": ["https://203.0.113.88/api/beacon", "https://203.0.113.88/api/data"],
    "fileHashes": [
      { "sha256": "a4f8b2c1...", "fileName": "beacon.dll", "fileType": "PE32 DLL" },
      { "sha256": "c6d3e4f5...", "fileName": "beacon.log", "fileType": "data" }
    ],
    "mutexes": ["Global\\CobaltStrike_Beacon_v4"],
    "registryKeys": ["HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\UpdateSvc"]
  },
  "mitre": [
    { "tactic": "Persistence", "technique": "T1547.001", "name": "Registry Run Keys" },
    { "tactic": "Discovery", "technique": "T1033", "name": "System Owner/User Discovery" },
    { "tactic": "Command and Control", "technique": "T1071.001", "name": "Web Protocols" },
    { "tactic": "Execution", "technique": "T1059.001", "name": "PowerShell" }
  ],
  "screenshots": [
    { "timestamp": "2026-09-01T14:31:00.000Z", "url": "/api/ha-artifacts/analyze/sub-001/screenshots/1" }
  ],
  "analysisMetadata": {
    "sandbox": "cape",
    "profile": "windows_10_x64",
    "duration": 245,
    "startedAt": "2026-09-01T14:30:15.000Z",
    "completedAt": "2026-09-01T14:34:20.000Z"
  }
}
```

### List Analysis History

```
GET /api/ha-artifacts/history?alertId={alertId}&page=0&size=20
Authorization: Bearer <token>

Response 200:
{
  "content": [
    {
      "submissionId": "sub-2026-0901-001",
      "fileName": "beacon.dll",
      "fileHash": "sha256:a4f8b2c1...",
      "status": "complete",
      "verdict": "malicious",
      "confidence": 0.94,
      "submittedAt": "2026-09-01T14:30:00.000Z",
      "completedAt": "2026-09-01T14:34:20.000Z"
    }
  ],
  "totalElements": 1,
  "page": 0,
  "size": 20
}
```

### SSE for Analysis Progress

```
GET /api/ha-artifacts/analyze/{submissionId}/stream
Accept: text/event-stream

event: progress
data: {"submissionId":"sub-001","status":"analyzing","progress":35,"stage":"behavioral_analysis"}

event: progress
data: {"submissionId":"sub-001","status":"analyzing","progress":70,"stage":"ioc_extraction"}

event: complete
data: {"submissionId":"sub-001","status":"complete","verdict":"malicious","confidence":0.94}
```

---

## Frontend Components Needed

| Component | Description |
|-----------|-------------|
| `ArtifactSubmitDialog.tsx` | Modal for file upload + analysis options (profile, timeout, network) |
| `ArtifactAnalysisPanel.tsx` | Side panel showing analysis progress and results (appears in alert detail) |
| `SandboxProcessTree.tsx` | Interactive process tree visualization (similar to investigation process tree) |
| `SandboxNetworkGraph.tsx` | Network connections visualization (IPs, domains contacted) |
| `SandboxIOCList.tsx` | Table of extracted IOCs with copy/pivot actions |
| `SandboxMitreMapping.tsx` | ATT&CK matrix mini-view highlighting observed techniques |
| `SandboxVerdictBadge.tsx` | Verdict display (malicious/suspicious/benign) with confidence meter |
| `ArtifactHistoryTable.tsx` | Table of past submissions for an alert/entity |
| `SandboxScreenshots.tsx` | Carousel of sandbox screenshots |
| `useArtifactAnalysis.ts` | TanStack Query hook for submission + polling |
| `useArtifactStream.ts` | SSE hook for real-time progress updates |

---

## Estimated Effort

**1 sprint (Sprint 55 or later)**

| Area | Effort |
|------|--------|
| Backend: sandbox adapter pattern + service | 3 days |
| Backend: async result polling + storage | 2 days |
| Backend: IOC cross-referencing with existing alerts | 2 days |
| Backend: SSE progress stream | 1 day |
| Frontend: submit dialog + progress panel | 2 days |
| Frontend: result visualization (process tree, network, IOCs) | 3 days |
| Frontend: MITRE mapping + verdict display | 1 day |
| Integration testing with sandbox API | 2 days |
| Documentation + OpenAPI | 1 day |
| **Total** | **~17 days (1 sprint)** |

---

## Prerequisites Before Starting

1. **Sandbox vendor decision** — Choose between:
   - CAPE (self-hosted, no cost, requires infra)
   - Any.Run (cloud, fast to integrate, data leaves network)
   - Joe Sandbox (on-prem option for government customers)
   - Multi-sandbox adapter (support multiple backends)

2. **Infrastructure provisioned** (if self-hosted):
   - Dedicated analysis VMs (Windows 10/11, various configurations)
   - Isolated network segment (no access to production)
   - Result storage (large — screenshots, memory dumps, PCAPs)
   - MongoDB or equivalent for CAPE/Cuckoo metadata

3. **API access configured**:
   - API keys or credentials for chosen sandbox
   - Network connectivity from HiveArmor backend to sandbox API
   - File upload size limits agreed (typical: 50MB-100MB)
   - Rate limits understood (submissions/day)

4. **Data residency policy decided**:
   - Can customer files be sent to cloud sandboxes?
   - If not: self-hosted sandbox mandatory
   - Per-tenant sandbox routing for MSSP (different tenants → different policies)

5. **Async pattern established**:
   - ALT-013 is the first async-result endpoint in HiveArmor
   - Need to decide: polling vs. webhook vs. SSE for result delivery
   - Recommendation: SSE for real-time progress + REST for final result retrieval

6. **Sprint 49 (API hardening) complete**:
   - OpenAPI schema generation (docs auto-generated)
   - Unified error handling (consistent error responses)
   - Idempotency keys (prevent duplicate submissions)
   - Request validation (file size limits, required fields)

---

## Architecture Notes

- **Adapter pattern**: `SandboxAdapter` interface with implementations per vendor (CapeAdapter, AnyRunAdapter, JoeSandboxAdapter). Backend configurable via `ha.sandbox.provider` property.
- **Async storage**: Submission metadata and results stored in PostgreSQL (not OpenSearch) since they're transactional records, not searchable event data.
- **IOC enrichment**: When sandbox discovers IOCs, cross-reference against `v3-hive-alert-*` and `v3-hive-entity-*` to find other alerts/entities connected to same IOCs. This creates new relationship edges in the Threat Constellation.
- **File storage**: Submitted artifacts stored in a dedicated volume (not in DB). Reference by hash. Deduplication: if same hash already analyzed, return cached result.
- **Security**: Files uploaded are UNTRUSTED — never execute on backend host. Validate file type/size before submission. Sandbox network isolation is critical.
- **Rate limiting**: Limit submissions per tenant per hour (sandbox resources are expensive). Return 429 if exceeded.

---

## Related Tickets

| ID | Title | Relationship |
|----|-------|-------------|
| ALT-014 | Alert Queue | Parent — artifacts referenced from alerts |
| ENT-002 | Entity Dossier | Consumer — file entities link to sandbox results |
| CON-001 | Constellation Explore | Consumer — sandbox IOCs create new graph edges |
| INC-001 | Incident Workbench | Consumer — artifact analysis as investigation action |
| HAR-003 | Idempotency Keys | Dependency — prevents duplicate file submissions |
