Warning: truncated output (original token count: 82070)
Total output lines: 2422

# HiveArmor Frontend–Backend Contract Register

Last updated: 2026-08-22 20:54:37 IST (UTC+05:30)
Owner: Frontend design and backend integration  
Status: Living reference — append every redesigned frontend route before backend stitching

## Purpose

This is the single cumulative handoff for frontend data and mutation requirements. It distinguishes verified backend capability from required contracts so the final integration phase does not rely on screenshots, fixture data, old inventory documents, or implicit field assumptions.

Design fixtures are fictional and exist only when `VITE_USE_FOUNDATION_FIXTURES=true`. A production route must never infer events, indicators, relationships, confidence, or response outcomes that were not returned by an authorized backend contract.

## Contract rules

- All paths are relative to `/api` and should be versioned before external release. Until versioning exists, additive fields are required for backwards compatibility.
- Every request is JWT authenticated unless explicitly public.
- Every response is tenant-scoped server-side. `X-Tenant-ID` is a selection hint, never an authorization boundary.
- Read roles: `ROLE_READ_ONLY`, `ROLE_USER`, `ROLE_ANALYST`, `ROLE_SOC_MANAGER`, `ROLE_ADMIN`, subject to tenant scope.
- Mutation roles: at least `ROLE_ANALYST`; destructive response actions require explicit permission plus policy evaluation. `ROLE_SOC_MANAGER` or approval policy may be required.
- Errors use `application/problem+json` with `type`, `title`, `status`, `detail`, `instance`, stable `code`, and optional `fieldErrors`.
- List endpoints use cursor pagination for mutable, high-volume evidence. Responses include `items`, `nextCursor`, `hasMore`, `snapshotAt`, and `totalApproximate` where an exact count is expensive.
- Timestamps are UTC ISO 8601 with millisecond precision. Durations are integer milliseconds. Byte counts are integers.
- IDs are opaque strings at the frontend boundary. Never require numeric parsing for alert, event, entity, or telemetry IDs.
- Fields derived by analytics include `source`, `confidence`, `computedAt`, `validUntil`, and evidence references.
- Destructive actions use preview → confirm → execute. Execution requires an idempotency key and returns an audit/job ID.
- All high-volume endpoints accept `AbortSignal` at the client and enforce bounded limits server-side.

## Status legend

| Status | Meaning |
|---|---|
| `VERIFIED` | Endpoint and controller were found in the checked-in backend. DTO compatibility still needs integration tests. |
| `PARTIAL` | Some fields or operations exist, but the redesigned page cannot complete its workflow. |
| `REQUIRED` | No suitable checked-in contract was found. |
| `MISMATCH` | Active frontend call, inventory, and checked-in controller disagree. Resolve before stitching. |

---

## Route: `/incidents` — Incident Command queue

Frontend files: `frontend-v3/src/pages/incidents/IncidentListPage.tsx`, `incidents.service.ts`, `incidents.types.ts`, and development-only `incidents.fixtures.ts`.

Implementation reconciled **2026-08-10 19:02:07 IST (UTC+05:30)** against the checked-in PostgreSQL incident entity, criteria query service, priority/SLA controller, and Kiro's incident-workbench additions:

- The frontend now sends the real JHipster criteria grammar (`incidentStatus.in`, `incidentSeverity.greaterThanOrEqual`, `incidentAssignedTo.equals`, `incidentCreatedDate.greaterThanOrEqual`, and related fields) instead of the former ignored flat `status`, `severity`, `assignedTo`, and `q` parameters.
- The backend criteria and specification now cover `incidentPriority`, `slaDeadline`, and `slaBreached`; the legacy list/detail/create/status/priority/SLA routes now have explicit incident SOC authorization.
- The queue uses cancellable 50-row pages, stable 15-second caching, exact bounded count requests, a partial-summary state, sticky pagination, row-density controls, keyboard navigation, and progressive row preview. Manual creation no longer posts an invented DTO; the command sends analysts to select authorized alerts first.
- Fictional queue records are dynamically loaded only when both development mode and `VITE_USE_FOUNDATION_FIXTURES=true` are active. The production path never returns them.

| ID | Status | Contract | Reconciliation / remaining work |
|---|---|---|---|
| INC-QV01 | `VERIFIED` | `GET /ha-incidents` with JHipster criteria, `Pageable`, and `X-Total-Count` | Supports bounded offset pages and the filters wired by the queue. It still returns the persistence entity instead of a versioned, tenant-safe queue DTO. |
| INC-QV02 | `VERIFIED` | `GET /ha-incidents/sla-stats`, `GET /ha-incidents/users-assigned`, `PUT /ha-incidents/{id}/priority` | Checked-in capabilities are now explicitly role protected. The queue deliberately does not download the complete user list for assignee search. |
| INC-Q01 | `PARTIAL` | Incident queue summary | The frontend currently issues five `size=1` count requests and exposes partial counters when a capability is unavailable. Add one same-scope/same-snapshot summary endpoint returning active, P1, breached, unassigned and assigned-to-me counts with exactness and source freshness. |
| INC-Q02 | `REQUIRED` | Searchable assignment candidates and narrow assignment command | Add bounded tenant-scoped people lookup and a versioned `{ assigneeId, expectedVersion }` command. Do not reuse entity-shaped `change-status`, accept a browser-supplied display name as authority, or download the full directory. |
| INC-Q03 | `PARTIAL` | Cross-field queue search and shareable views | Name search is supported with `incidentName.contains`; server-authorized OR search across ID, title, description, tags and affected entities is missing. Persisted saved views and signed/shareable filter state are also missing. |
| INC-Q04 | `PARTIAL` | Stable mutable-queue pagination and freshness | Offset pagination is bounded and functional. For large mutable queues add deterministic snapshot/cursor continuation, explicit `snapshotAt`, partial source failures, resumable incident deltas, and snapshot-bound export. |

The canonical future list projection should return opaque incident ID, title/summary, symbolic priority and severity, lifecycle status/classification, owner, created/updated/last-activity time, SLA state/deadline, bounded alert/entity/task/evidence counts, tags, tenant-safe source/freshness, permissions, record version and signed routes. Summary values must be computed over the same authorization and snapshot as the rows; the browser must not infer organization-wide health from a loaded page.

Verification recorded **2026-08-10 19:07:06 IST (UTC+05:30)**: Java 17 production main compilation passed; frontend TypeScript, scoped incident lint, 10 focused incident tests, all 1,013 frontend tests, and the production build passed. The authenticated fixture review rendered 29 active incidents with no document-level horizontal overflow and kept the compact pagination/status dock visible. Repository-wide frontend lint remains blocked by 27 errors and 8 warnings in pre-existing masthead, query-client, alert, constellation, correlation and alternate entity modules; no modified Incident Command file is listed. The backend full test lifecycle reached test compilation and stopped on the nine previously recorded stale rule-generation, alert-stream rate-limiter and alert-bulk publisher test references; the incident production sources compile successfully.

---

## Route: `/incidents/:id` — Incident Workbench

Frontend files: `frontend-v3/src/pages/incidents/IncidentDetailPage.tsx` and supporting incident components.

### Verified contracts used by the workbench

| ID | Status | Contract | Notes |
|---|---|---|---|
| INC-V01 | `VERIFIED` | `GET /ha-incidents/{id}` | Core incident record. Controller returns `UtmIncident`; define a stable frontend DTO before public API versioning. |
| INC-V02 | `VERIFIED` | `PUT /ha-incidents/change-status` | Body currently accepts an incident-shaped object. Replace with a narrow `{ id, status, observation?, version? }` command to prevent mass assignment. |
| INC-V03 | `VERIFIED` | `PUT /ha-incidents/{id}/priority` | Body `{ "priority": "P1" }`. Add authorization and optimistic versioning. |
| INC-V04 | `VERIFIED` | `GET /ha-incidents/{id}/timeline` | Aggregated timeline exists. Align its DTO with `TimelineEvent` and add cursor pagination for long-lived incidents. |
| INC-V05 | `VERIFIED` | `GET /ha-incidents/{id}/entities` | Entity context exists. Add stable entity IDs and pivot links. |
| INC-V06 | `VERIFIED` | `GET/POST/PUT/DELETE /ha-incidents/{id}/evidence-items` | Evidence item controller and role checks exist. UI integration must retain provenance and immutable audit fields. |
| INC-V07 | `VERIFIED` | `GET /ha-incidents/{id}/entity-graph` | Graph contract exists. Preserve an accessible list/table projection in addition to nodes and edges. |
| INC-V08 | `VERIFIED` | `GET /ha-investigation-sessions?incidentId={id}` | Session list exists. Confirm exact filter name, response envelope, and `X-Total-Count` behavior in an integration test. |

### INC-001 — Edit incident metadata and assignment

Status: `PARTIAL` — checked-in PATCH implementation was reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; workbench integration audit **2026-08-11 11:13:06 IST (UTC+05:30)** confirmed that it edits OpenSearch documents while the routed numeric `GET /ha-incidents/{id}` and queue use PostgreSQL `UtmIncident`. A canonical incident ID/store boundary and an explicit patch allow-list are still required; searchable assignment candidates remain under INC-Q02  
Consumer: persistent incident header and case context panel

```http
PATCH /ha-incidents/{incidentId}
If-Match: "incident-version"
Content-Type: application/json

{
  "name": "Suspicious privileged-account access",
  "description": "Validated investigation summary",
  "assignedToUserId": "usr-41",
  "priority": "P1"
}
```

Response `200`:

```json
{
  "id": "4821",
  "name": "Suspicious privileged-account access",
  "description": "Validated investigation summary",
  "assignedTo": { "id": "usr-41", "displayName": "Maya Chen" },
  "priority": "P1",
  "updatedAt": "2026-08-02T04:00:12.381Z",
  "updatedBy": { "id": "usr-41", "displayName": "Maya Chen" },
  "version": 8
}
```

Requirements:

- Allow a sparse patch; reject unknown or immutable fields.
- `409 VERSION_CONFLICT` includes the current version and changed fields.
- Assignment candidates come from a separate tenant-scoped, searchable people endpoint; do not download the entire user directory.
- Audit the previous and new values without logging sensitive descriptions in application logs.

### INC-002 — Tasks and analyst checklist

Status: `VERIFIED` — checked-in cursor task list/create/optimistic PATCH implementation reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**  
Consumer: workbench Tasks tab and response readiness

```http
GET  /ha-incidents/{incidentId}/tasks?status=open&cursor={cursor}&limit=50
POST /ha-incidents/{incidentId}/tasks
PATCH /ha-incidents/{incidentId}/tasks/{taskId}
```

Task DTO:

```json
{
  "id": "task-819",
  "title": "Validate sign-in with account owner",
  "description": null,
  "status": "open",
  "priority": "high",
  "assignedTo": { "id": "usr-41", "displayName": "Maya Chen" },
  "dueAt": "2026-08-02T04:20:00.000Z",
  "source": "playbook",
  "playbookStepId": "identity-validate-01",
  "createdAt": "2026-08-02T03:47:00.000Z",
  "completedAt": null,
  "version": 2
}
```

Requirements: cursor pagination, optimistic version, completion actor/time, deterministic ordering, and event publication into the incident timeline.

### INC-003 — Similar incidents with explainable reasons

Status: `VERIFIED` — checked-in endpoint and explainable result service reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; live tenant-isolation and scoring tests remain required  
Consumer: case context and scope expansion

```http
GET /ha-incidents/{incidentId}/similar?window=30d&limit=20
```

Each result includes `incidentId`, title, severity, status, occurred range, `similarityScore`, and `reasons[]`. Each reason contains `type` (`shared_entity`, `same_rule`, `shared_indicator`, `semantic_summary`), display label, shared value, source, and evidence reference. The UI must never receive an unexplained score alone.

### INC-004 — Incident-scoped raw event search and pivot

Status: `PARTIAL` — checked-in incident event-search endpoint reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; frontend/backend transport audit **2026-08-11 11:13:06 IST (UTC+05:30)** verified bounded projection and OpenSearch `search_after`, but the response still lacks the contracted `snapshotAt` and `tookMs`, uses a raw sort-value array cursor, and returns a per-row pivot stub rather than the contracted safe signed pivot reference. Field-security and performance acceptance remain required  
Consumer: timeline/evidence drill-down and in-context log inspection

```http
POST /ha-incidents/{incidentId}/events/search

{
  "query": "host.name:FIN-WKS-044",
  "from": "2026-08-02T02:42:00.000Z",
  "to": "2026-08-02T04:42:00.000Z",
  "cursor": null,
  "limit": 100,
  "fields": ["@timestamp", "event.action", "host.name", "user.name"]
}
```

Return a bounded event projection, `nextCursor`, `snapshotAt`, `tookMs`, and a signed `pivot` object containing a safe query reference—not raw index credentials. Field-level security is applied before serialization.

### INC-005 — Response action catalog and safety state

Status: `PARTIAL` — checked-in catalog, preview and execute routes reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; safety audit **2026-08-11 11:13:06 IST (UTC+05:30)** confirmed the catalog is currently built in-process and execution submits a stub job without authoritative connector, tenant policy, approval, target-support, idempotency, or rollback readiness. The frontend now normalizes Kiro's actual `{ actions, categories, total }` and object-target preview shapes, permits preview, and refuses production execution unless the backend explicitly returns `executionReady: true`  
Consumer: “Do this now” and incident response console

Use the shared response contract in ALT-010, with `scope.type=incident` and `scope.id={incidentId}`. The catalog must be derived from role, tenant policy, integration health, asset support, current containment state, and approval requirements.

### INC-006 — Collaboration activity and comments envelope

Status: `PARTIAL` — checked-in activity list and note creation reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; complete merged audit coverage remains partial  
Existing: incident notes, history, and activity resources  
Consumer: activity rail

Provide one cursor-paginated projection that merges notes, field changes, automation activity, response jobs, task activity, and alert linking. Each entry includes `kind`, actor, timestamp, human-readable summary, structured changes, visibility, and immutable audit reference. Creating a note must accept Markdown as plain source, sanitize rendering server-side, and return the created activity entry.

### INC-007 — Evidence provenance and chain of custody

Status: `PARTIAL` — checked-in custody append and evidence patch routes reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; authoritative file integrity/retention remains partial  
Existing: evidence item, board placement, provenance patch, and custody APIs  
Consumer: Evidence tab and future canvas

Add to every evidence item: `sourceSystem`, `sourceRecordId`, `collectedAt`, `collectedBy`, `sha256` for file artifacts, `classification`, `integrityStatus`, `retentionUntil`, and append-only custody events. Board position updates must never mutate evidence content or custody history.

### INC-008 — Workbench live updates

Status: `PARTIAL` — checked-in rate-limited SSE route reconciled **2026-08-10 19:02:07 IST (UTC+05:30)**; authentication audit **2026-08-11 11:13:06 IST (UTC+05:30)** found `/api/ha-incidents/*/stream` absent from `PlaybookSseTokenFilter.SSE_PATH_PATTERNS`, while the native EventSource hook can only supply the existing long-lived JWT through a query parameter. The routed workbench therefore keeps bounded snapshot refresh behavior and does not activate this stream until a short-lived, scoped SSE ticket or secure same-site cookie flow is implemented and reconnect/gap tests pass  
Consumer: header freshness, timeline, notes, tasks, linked alerts

```http
GET /ha-incidents/{incidentId}/stream
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Event envelope: `eventId`, `incidentId`, `version`, `type`, `occurredAt`, and minimal `payload`. Supported types: `incident.updated`, `timeline.appended`, `evidence.created`, `task.updated`, `alert.linked`, `response.updated`. Authorize on connect and revalidate tenant access during reconnect.

---

## Routes: `/investigations` and `/investigations/:id` — Investigation Sessions

Frontend files: `frontend-v3/src/pages/investigations/InvestigationsPage.tsx`, `InvestigationDetailPage.tsx`, `investigation.service.ts`, and related types/fixtures.

### Checked-in backend reconciliation

Reconciled **2026-08-11 12:30:40 IST (UTC+05:30)** against `InvestigationSessionResource`, `InvestigationSessionService`, `InvestigationSessionDTO`, `SessionItemDTO`, and their repositories. This entry records only incomplete or mismatched capabilities; it does not reopen Kiro's implemented session CRUD, paged list, item pin/list/unpin, or direct incident-conversion routes.

Implementation update **2026-08-13 11:43:50 IST (UTC+05:30)**: the checked-in backend now captures the verified tenant ID on new sessions, enforces tenant and owner scope on every session/item read and mutation, gives SOC managers the same documented within-tenant override as administrators, requires an optimistic version on updates, bounds list pages to 100 and item pages to 200, and uses one grouped item-count query for queue rows. The missing base session migration was also added to the master Liquibase ledger before the hardening migration. `X-Tenant-ID` and MSSP prefix selection now fail closed unless authentication, membership/privilege, and a canonical tenant record are valid. The legacy direct conversion route is explicitly deprecated with `Deprecation`, `Sunset`, and successor-link headers; governed promotion remains required before the frontend enables this action.

Full-stack verification **2026-08-13 12:58:43 IST (UTC+05:30)**: the hardened migration applied in the local Docker PostgreSQL database; fixture-disabled credential login, dashboard bootstrap, Search & Hunt, and the empty Investigation Sessions queue loaded through the approved `127.0.0.1:4176` review origin with no browser console errors. Public authentication requests now omit both stale bearer credentials and stale tenant selectors. The complete frontend gate passed **1,039/1,039 tests**, TypeScript checking, zero-warning ESLint, and the production build. Focused backend tenant/session, JWT database-key, search-parser, AI and compliance-report regressions plus the production Maven package passed. The repository-wide backend test run is not yet a production acceptance pass: legacy property tests still include environment-reflection, stale rule-generation fixture/path, overview mock, and sandbox-dependent database assumptions that must be repaired or explicitly isolated before release.

| Boundary | State at 2026-08-11 12:30:40 IST (UTC+05:30) | Verified capability and remaining mismatch |
|---|---|---|
| INV-LV01 | `PARTIAL` | `POST/GET/PUT/DELETE /api/ha-investigation-sessions` and `GET /{id}` are implemented, role-gated, tenant-scoped, and owner-scoped; update requires the returned optimistic `version`. Lists are offset-paged and server-bounded to 100. Missing: server search/status/assignment filters, saved views, same-snapshot summary/facets, stable cursor pagination, freshness/partial-source state, and permission descriptors. |
| INV-LV02 | `IMPLEMENTED` | Every session and item read/mutation resolves the current verified tenant first and then enforces owner or documented administrator/SOC-manager override. Cross-tenant numeric IDs return 404 to prevent enumeration. Tenant selector headers are validated as an authorization boundary rather than trusted routing input. |
| INV-LV03 | `PARTIAL` | Pinned items support `LOG_EVENT`, `ALERT`, `ENTITY`, `FINDING`, and `NOTE`; reads are paged and bounded to 200 with `X-Total-Count`, and queue counts use one indexed grouped aggregate. Still missing: canonical authorized evidence references, field-level redaction, provenance/integrity/classification, duplicate handling, retention, and progressive detail. Browser-supplied snapshot JSON remains transitional and must not be treated as authoritative evidence. |
| INV-LV04 | `PARTIAL / DEPRECATED` | Direct conversion now validates tenant/owner scope and accepts `CONVERTED`, but still creates hard-coded medium/P3 incidents without governed preview, idempotency, policy, evidence transfer, or audit outcomes. The route is deprecated as of 2026-08-13 and sunsets 2027-02-13; the advertised successor remains unimplemented. |

### INV-009 — Canonical bounded investigation queue

Status: `PARTIAL` — updated **2026-08-13 11:43:50 IST (UTC+05:30)**; tenant-safe bounded offset list and aggregate counts implemented, canonical cursor query and summary still required  
Consumer: Investigation Sessions queue, operational views, sticky pagination, and shift handoff

```http
GET /ha-investigation-sessions?view=active&status=ACTIVE&assignedTo=me&query=privileged&limit=25&cursor={opaque}
GET /ha-investigation-sessions/summary?view=active&status=ACTIVE&assignedTo=me&query=privileged
```

Resolve the authorized tenant set on the server and return a bounded safe projection with opaque globally stable session reference, name/objective excerpt, lifecycle phase and state, owner, hypothesis open/total counts, entity/alert/event/artifact counts, task progress, linked incident, last activity, source freshness, permission descriptors, snapshot/version, `nextCursor`, and exact-versus-approximate count metadata. Apply every filter before pagination. Cursor identity must bind principal, tenant scope, filters, sort, limit, and snapshot. Summary/facets must use the identical authorization and filter scope rather than loaded browser pages. Replace per-row item-list reads with an indexed aggregate count.

### INV-010 — Authorized investigation core, hypothesis ledger, and scope

Status: `PARTIAL` — updated **2026-08-13 11:43:50 IST (UTC+05:30)**; tenant/owner authorization and optimistic session version implemented, structured hypothesis/workspace contract remains missing  
Consumer: Prepare, Execute, Assess, Act, and Knowledge workspace; Hive Intelligence suggestions

```http
GET   /ha-investigation-sessions/{investigationRef}/workspace
PATCH /ha-investigation-sessions/{investigationRef}
POST  /ha-investigation-sessions/{investigationRef}/hypotheses
PATCH /ha-investigation-sessions/{investigationRef}/hypotheses/{hypothesisId}
```

The workspace projection requires tenant/owner authorization on every read and mutation, an optimistic version, phase, bounded hypothesis and objective, time range, authorized data sources, ATT&CK techniques, owner/collaborators, confidence provenance, task counts, next decisions, conclusion, knowledge artifacts, capabilities and freshness. Hypotheses are structured testable claims with outcome (`open`, `supported`, `refuted`, `inconclusive`), confidence, owner, timestamps, and cursor-paged confirming and denying evidence references. Phase changes, ownership changes and conclusions require reason, expected version and immutable audit activity. Hive Intelligence may return permission-filtered alternative hypotheses and evidence citations as untrusted reviewable proposals only; it cannot decide, promote, or mutate the session autonomously.

### INV-011 — Bounded evidence, notes, activity, and safe pivots

Status: `PARTIAL` — updated **2026-08-13 11:43:50 IST (UTC+05:30)**; tenant-safe paged item transport implemented, evidence-grade reference/preview/provenance remains required  
Consumer: Artifacts and Activity tabs, Search & Hunt “add to investigation,” alert/entity pivots

```http
GET  /ha-investigation-sessions/{investigationRef}/artifacts?type=LOG_EVENT&limit=50&cursor={opaque}
POST /ha-investigation-sessions/{investigationRef}/artifacts/preview
POST /ha-investigation-sessions/{investigationRef}/artifacts
GET  /ha-investigation-sessions/{investigationRef}/activity?limit=50&cursor={opaque}
POST /ha-investigation-sessions/{investigationRef}/notes
```

The browser submits only canonical authorized record references or a signed Search snapshot selection, never arbitrary index names, raw datastore IDs, tenant claims, or source snapshots. Preview resolves membership and returns eligible/duplicate/expired/redacted counts, source freshness, classification, policy warnings and an opaque execution token. Commit is idempotent and returns per-record outcomes, immutable provenance/custody references, safe signed pivots, and the new session version. Artifact detail is progressive and field-level redacted. Activity is append-only, cursor-paged and merges notes, queries, evidence, hypothesis, assignment, status, automation and promotion events. Notes are stored as sanitized plain/Markdown source with actor and server time.

### INV-012 — Governed incident promotion

Status: `PARTIAL` — updated **2026-08-13 11:43:50 IST (UTC+05:30)**; authorized direct conversion is deprecated and remains disabled in production UI, governed preview/commit remains required  
Consumer: “Promote to incident” from the investigation workspace

```http
POST /ha-investigation-sessions/{investigationRef}/promotion-preview
POST /ha-investigation-sessions/{investigationRef}/promote
```

Preview computes an incident summary, recommended severity/priority with explainable reasons, eligible evidence/entity/alert counts, duplicate/similar incidents, target tenant, policy/approval gates, missing prerequisites and blast radius. Execution accepts only an unexpired user/scope/version-bound preview token, expected session version, analyst reason and idempotency key. It creates or links the incident atomically, preserves all eligible artifacts with provenance, returns per-artifact outcomes plus incident/audit references, and is safe to retry. Direct hard-coded severity/priority conversion remains disabled in the frontend unless the backend advertises the governed capability.

### INV-013 — Resumable investigation updates and knowledge outputs

Status: `MISSING` — recorded **2026-08-11 12:30:40 IST (UTC+05:30)**  
Consumer: queue freshness, case wall, collaboration, and detection/coverage learning

```http
GET /ha-investigation-sessions/stream
GET /ha-investigation-sessions/{investigationRef}/stream
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Emit minimal authorized deltas for session, hypothesis, task, evidence, note, collaborator, promotion and source-freshness changes. Every event carries an opaque event ID, canonical session reference, version and server time. Reconnect revalidates authorization and reports resume gaps so the frontend can replace its bounded snapshot without duplicate or reordered activity. Knowledge outputs—negative results, reusable hunts, detection candidates, coverage gaps and response recommendations—are versioned, reviewable artifacts with evidence citations and explicit publish permissions, never implicit browser-only state.

---

## Route: `/alerts/:id` — Alert Investigation Board

Frontend files: `frontend-v3/src/pages/alerts/AlertInvestigationPage.tsx`, `alertInvestigation.service.ts`, and related types/fixtures.

### Live implementation reconciliation

Reconciled **2026-08-10 16:18:44 IST (UTC+05:30)** against the rebuilt local Docker backend and deterministic OpenSearch record `e2e-alert-investigation-rich-001`:

- `/ha-alerts/{id}` is the canonical live detail resource; its bounded summary now normalizes flat and nested producer rule, ATT&CK and entity shapes.
- Investigation evidence association accepts nested `alert.id`, correlation ID, OpenSearch document IDs in `sourceEvents`/`sourceEventIds`, and normalized `event.id`. The same bounded association is used for header counts and every evidence projection.
- Live probes returned 6 story events across 4 ATT&CK stages, one process tree, 2 network connections, one DNS record, 4 indicators, a 10-node/5-edge graph, one activity item, a guide, and 33 highlighted event fields.
- `IndicatorExtractor` no longer constructs null-bearing immutable maps, preventing enrichment requests from failing when optional prevalence values are absent.
- Remaining pagination, snapshot/version, field-level authorization and response-job gaps stay recorded under the individual contracts below; no frontend fixture records are used in this production-path verification.

### ALT-001 — Canonical alert investigation summary

Status: `VERIFIED` — live core projection reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: page header, “why it fired,” core fields, first render

```http
GET /ha-alerts/{alertId}
```

Target response:

```json
{
  "id": "ALT-7F3A91",
  "title": "Signed utility spawned an encoded PowerShell download chain",
  "summary": "Rendered alert reason in plain language.",
  "severity": "critical",
  "status": "in_progress",
  "verdict": "malicious",
  "riskScore": 94,
  "confidence": 91,
  "occurredAt": "2026-08-02T03:42:11.182Z",
  "updatedAt": "2026-08-02T03:47:28.017Z",
  "tenant": { "id": "tenant-19", "name": "Northstar Finance" },
  "asset": { "id": "asset-044", "name": "FIN-WKS-044", "owner": "Sarah Chen", "criticality": 5 },
  "sla": { "deadline": "2026-08-02T04:12:11.182Z", "breached": false },
  "detection": {
    "ruleId": "RULE-ENDPOINT-184",
    "ruleName": "Encoded script with persistence and outbound callback",
    "detector": "HiveArmor Endpoint Analytics",
    "dataSources": ["windows_edr", "dns", "firewall"]
  },
  "counts": { "events": 6, "processes": 6, "connections": 3, "indicators": 4, "relatedAlerts": 2 },
  "snapshotVersion": 17
}
```

Performance: p95 server time below 300 ms for the core record; compressed payload target below 40 KB. Supporting panels must not block this response.

### ALT-002 — Ordered attack story and ATT&CK progression

Status: `PARTIAL` — live bounded story projection; cursor and snapshot-version semantics remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: attack-chain ribbon and synchronized execution story

```http
GET /ha-alerts/{alertId}/story?cursor={cursor}&limit=100
```

Response includes:

- `stages[]`: stable ID, order, ATT&CK tactic/technique IDs and names, state (`observed`, `suspected`, `not_observed`), event count, first/last observed.
- `items[]`: event ID, timestamp, title, concise summary, category, severity, process/entity references, source system, stage ID, evidence IDs, and raw-event pivot reference.
- `nextCursor`, `hasMore`, `snapshotAt`, `snapshotVersion`.

The summary is a backend-rendered field backed by structured data; raw event values remain available through ALT-011. Composite detections retain references to their underlying detections.

### ALT-003 — Process lineage

Status: `PARTIAL` — live bounded lineage with cycle protection; request-driven ancestor/descendant pagination and redaction metadata remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: expandable process tree synchronized to story events

```http
GET /ha-alerts/{alertId}/processes?ancestors=5&descendants=8&limit=500
```

Process node:

```json
{
  "id": "proc-9120",
  "parentId": "proc-9068",
  "entityId": "entity-process-9120",
  "name": "powershell.exe",
  "pid": 9120,
  "user": "NORTHSTAR\\sarah.chen",
  "commandLine": "powershell.exe -NoP ...",
  "executablePath": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  "startedAt": "2026-08-02T03:42:12.041Z",
  "endedAt": null,
  "verdict": "malicious",
  "signature": { "status": "valid", "publisher": "Microsoft Windows" },
  "eventCount": 4,
  "alertCount": 2,
  "truncatedChildren": false
}
```

Requirements: stable IDs across pages, cycle protection, explicit truncation, command-line redaction by permission, and a flat list projection so the UI can render an accessible tree without a graph library.

### ALT-004 — Network activity

Status: `PARTIAL` — live bounded connection/DNS/TLS projection; process-scoped cursor pagination remains, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: evidence dock and selected-process scope

```http
GET /ha-alerts/{alertId}/network?processId={optional}&cursor={cursor}&limit=100&sort=timestamp:asc
```

Connection fields: ID, timestamp, process reference/name, protocol, source/destination address and port, direction, bytes sent/received, connection state, DNS/TLS summary, network sensor, reputation verdict, enrichment timestamp, and raw-event pivot. Cursor pagination is required; never return unlimited flows.

### ALT-005 — Indicators, enrichment, and provenance

Status: `PARTIAL` — live indicator extraction and enrichment; cursor pagination, licensed-source markings and full enforcement state remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: priority indicators rail and indicator evidence view

```http
GET /ha-alerts/{alertId}/indicators?cursor={cursor}&limit=100
```

Indicator fields: `id`, `type`, normalized `value`, display value, verdict, confidence, sources, TLP, first/last seen, tenant prevalence, global prevalence, evidence references, enrichment `computedAt/validUntil`, and enforcement state. Multiple sources remain distinct; the API may provide an aggregate verdict but must expose how it was derived.

Sensitive feed licensing and markings must be enforced before serialization. Hash type is explicit; never label an arbitrary hash as SHA-256.

### ALT-006 — Entity relationship and correlation graph

Status: `PARTIAL` — live bounded entity graph; time/depth expansion tokens and coverage reporting remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: future Graph mode and non-drag relationship table

```http
GET /ha-alerts/{alertId}/relationships?from={iso}&to={iso}&depth=2&limit=300
```

Return `nodes[]`, `edges[]`, `truncated`, and expansion tokens. Each node includes entity type, stable entity ID, label, role (`actor`, `target`, `observer`, `artifact`), risk, and evidence count. Each edge includes type, direction, strength, first/last observed, evidence IDs, and correlation explanation. Graph quality depends on normalized entity mappings; missing mappings are reported in `coverage` rather than silently omitted.

### ALT-007 — Related alerts and correlation reasons

Status: `PARTIAL` — live related-alert projection; typed relation filters and cursor pagination remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: related-alert evidence view and scope expansion

```http
GET /ha-alerts/{alertId}/related?types=source_event,session,process_ancestry,entity,rule&cursor={cursor}&limit=50
```

Each result includes core alert fields plus `relationType`, `relationLabel`, `sharedEntityIds`, `sharedEventIds`, `correlationScore`, `explanation`, case/incident links, and whether it is already assigned. This prevents analysts from opening duplicates without context.

### ALT-008 — Alert history, notes, and capability analysis

Status: `PARTIAL` — live paginated activity projection; resource-shaped notes mutation and complete capability provenance remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Existing mutations: `/ha-alerts/notes`, `/status`, `/tags`  
Consumer: History & response view and observed-capabilities rail

```http
GET  /ha-alerts/{alertId}/activity?cursor={cursor}&limit=50
POST /ha-alerts/{alertId}/notes
```

Activity merges alert creation, severity/priority/status changes, notes, tags, assignment, correlation updates, playbook runs, response jobs, and promotion to incident. Each entry has actor, timestamp, structured change, display summary, and audit ID.

Capability analysis fields: stable capability ID, label, description, severity, supporting event/evidence IDs, ATT&CK mappings, analytic version, confidence, and computed time. Capabilities must be evidence-backed, not generated solely for visual grouping.

Resolve the current notes mismatch: the backend accepts raw string body plus `alertId` query parameter, while the frontend service sends a request DTO. Adopt the resource-shaped path and a JSON body with validation.

### ALT-009 — Detection reason and investigation guide

Status: `PARTIAL` — live reason/guide projection; versioned parameterized pivots and role metadata remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: “why it fired” and rule-guided investigation drawer

```http
GET /ha-alerts/{alertId}/guide
```

Response contains rendered `alertReason`, rule description, guide version, ordered steps, optional queries/pivots, required roles, expected evidence, and rule ATT&CK metadata. Query templates use parameter references and server-side validation; never send executable secrets or unrestricted index access in guide text.

### ALT-010 — Response catalog, preview, approval, and execution

Status: `PARTIAL` — live catalog, preview, execute and job status; job cancellation and complete signed-preview/idempotency enforcement remain, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: response console on alert and incident pages

```http
GET  /response/actions?scopeType=alert&scopeId={alertId}
POST /response/actions/{actionId}/preview
POST /response/actions/{actionId}/execute
GET  /response/jobs/{jobId}
POST /response/jobs/{jobId}/cancel
```

Catalog item:

```json
{
  "id": "isolate-host",
  "label": "Isolate host",
  "description": "Restrict network access while retaining the EDR channel.",
  "targetTypes": ["host"],
  "available": true,
  "unavailableReason": null,
  "impact": "high",
  "requiresApproval": true,
  "requiredPermission": "response.host.isolate",
  "integration": { "id": "edr-1", "name": "Endpoint EDR", "health": "healthy" }
}
```

Preview request includes scope, selected target IDs, parameters, and requested reason. Preview response includes resolved targets, excluded targets with reasons, estimated effect, rollback support, current state, required approval, expiry, and a signed `previewToken`.

Execute requires `previewToken`, analyst reason, approval reference when required, and `Idempotency-Key`. Return `202` with `jobId`, audit ID, accepted target count, and status URL. Never treat UI confirmation as authorization.

### ALT-011 — Highlighted fields and raw source events

Status: `PARTIAL` — live highlighted/raw event views with alert association validation; complete redaction/integrity metadata remains, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: Event details and raw event tabs

```http
GET /ha-alerts/{alertId}/events/{eventId}?view=highlighted
GET /ha-alerts/{alertId}/events/{eventId}?view=raw
```

Highlighted response preserves ordered rule-defined fields, value types, display formatting, prevalence, sensitivity, and permitted pivots. Raw response includes field-level-security filtered JSON, source index alias, immutable event ID, ingest timestamp, schema/version, and integrity metadata. Return `403 FIELD_RESTRICTED` for explicitly requested forbidden fields rather than leaking existence through values.

### ALT-012 — Live investigation updates and snapshot consistency

Status: `PARTIAL` — live SSE endpoint; full snapshot-gap and reconnect consistency validation remains, reconciled **2026-08-10 16:18:44 IST (UTC+05:30)**  
Consumer: freshness indicator and incremental board updates

```http
GET /ha-alerts/{alertId}/stream
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Types: `alert.updated`, `story.appended`, `process.updated`, `network.appended`, `indicator.enriched`, `correlation.updated`, `response.updated`. Every event includes `snapshotVersion`; the client refetches affected queries when a version gap occurs. SSE contains identifiers and small deltas only, never full process trees or raw events.

### ALT-013 — Artifact and sandbox analysis

Status: `REQUIRED` when file detonation is enabled  
Consumer: future artifact analysis board inspired by the reference video

```http
GET /ha-artifacts/{artifactId}/analysis
```

Return artifact identity/hashes, claimed vs detected type, analysis status, environment/image, start/end/duration, verdict/confidence, capabilities, process/network/registry evidence references, extracted artifacts, YARA/signature matches, screenshots as authorized signed URLs, report availability, and analysis engine/version. Large reports and packet captures are separate signed downloads with expiry and audit. A failed or incomplete detonation must remain visibly distinct from a benign verdict.

---

## Route: `/alerts` — Alert Triage Queue and Context Drawer

Frontend files: `frontend-v3/src/pages/alerts/AlertsListPage.tsx`, `AlertDetailDrawer.tsx`, `alertColumns.tsx`, and `alertsListDatasource.ts`.

### Legacy contract audit — deprecated compatibility surface

Deprecation registered: **2026-08-11 18:10:50 IST**. All `/api/correlation-rule` and `/api/correlation-rule/**` endpoints remain temporarily callable for compatibility but are deprecated in Java and emit `Deprecation`, `Sunset`, `Link: rel="successor-version"`, and HTTP `Warning 299` headers. New consumers must use `/api/ha-detection-rules`; planned sunset is 2027-12-31 and removal still requires the published compatibility review.

| ID | Status | Contract | Notes |
|---|---|---|---|
| ALT-LV01 | `VERIFIED` | Frontend calls `GET /ha-alerts` | Reconciled **2026-08-10 15:29:49 IST (UTC+05:30)** against `HaAlertQueueResource`: the authorized bounded list, cursor, deterministic sorting and projected queue fields are live. Remaining ALT-014 gaps are recorded below. |
| ALT-LV02 | `VERIFIED` | Frontend calls `GET /ha-alerts/{id}` | Reconciled **2026-08-10 15:29:49 IST (UTC+05:30)** against `HaAlertQueueResource`: the authorized triage projection is live and now normalizes nested producer rule, ATT&CK and entity data. Remaining progressive-detail gaps stay under ALT-001/ALT-020. |
| ALT-LV03 | `VERIFIED` | `POST /ha-alerts/status` | Reconciled **2026-08-18 20:40:00 IST**. Frontend `AlertStatusUpdateRequest` / triage command sends `{ alertIds, status, statusObservation, addFalsePositiveTag }` with numeric codes. `UtmAlertResource` is `@PreAuthorize` Analyst/SOC Manager/Admin. Live mutation against a staging VM was not executed. |
| ALT-LV04 | `VERIFIED` | `POST /ha-alerts/tags` | Reconciled **2026-08-18 20:40:00 IST**. Frontend sends `{ alertIds, tags, createRule }`. Live tag mutation was not executed. |
| ALT-LV05 | `VERIFIED` | `POST /ha-alerts/notes` | Reconciled **2026-08-18 20:40:00 IST**. Backend accepts JSON `{ alertIds, note }` (`UpdateAlertNotesRequestBody`). Frontend `AlertNotesRequest` matches. Live note mutation was not executed. |
| ALT-LV06 | `PARTIAL` | `POST /ha-alerts/convert-to-incident` | Reconciled **2026-08-19**. `incidentId` 0/null now creates a PostgreSQL `hive_incident` row, then stamps OpenSearch `isIncident` with that id. Existing numeric `incidentId` attaches alerts to that incident. Live convert against staging was not executed. |
| ALT-LV07 | `PARTIAL` | Alert mutations method-level authorization | Reconciled **2026-08-18 20:40:00 IST**. Status/notes/tags/convert/open-count now have `@PreAuthorize` matching the alert queue. Tenant-scoped mutation tests against a running JVM were not added in this slice. |

### ALT-014 — Canonical alert queue query

Status: `PARTIAL` — first canonical slice implemented and live-verified **2026-08-10 15:29:49 IST (UTC+05:30)**  
Consumer: virtualized alert grid, keyboard triage, filter controls, sorting, and bounded export

```http
GET /ha-alerts?cursor={cursor}&limit=100&sort=-detectedAt,-riskScore,id
    &severity=critical,high&status=open,in_review&assignee=unassigned
    &tenantId={tenantId}&category=endpoint&riskMin=70&sla=at_risk
    &threatIntel=matched&q={escapedQuery}&from={iso}&to={iso}
    &fields=id,title,detectedAt,severity,riskScore,status,primaryEntity,rule,assignee,tenant,sla,tags
```

Response:

```json
{
  "items": [
    {
      "id": "ALT-7F3A91",
      "title": "Signed utility spawned an encoded PowerShell download chain",
      "summary": "Encoded execution, persistence, and outbound callback were correlated.",
      "detectedAt": "2026-08-02T03:42:11.182Z",
      "updatedAt": "2026-08-02T03:47:28.017Z",
      "severity": "critical",
      "riskScore": 94,
      "confidence": 91,
      "status": "in_review",
      "category": "endpoint",
      "rule": { "id": "RULE-ENDPOINT-184", "name": "Encoded script with persistence and outbound callback" },
      "primaryEntity": { "id": "host-fin-044", "type": "host", "label": "FIN-WKS-044", "riskScore": 94 },
      "assignee": { "id": "usr-41", "displayName": "Maya Chen" },
      "tenant": { "id": "tenant-northstar", "name": "Northstar Finance" },
      "sla": { "status": "at_risk", "dueAt": "2026-08-02T04:12:11.182Z" },
      "tags": ["encoded-script", "new-domain"],
      "threatIntelMatched": true,
      "relatedAlertCount": 2,
      "version": 7
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "snapshotAt": "2026-08-02T03:48:00.000Z",
  "totalApproximate": 2438
}
```

Requirements:

- Deterministic server sorting uses a stable ID tie-breaker. Unknown sort or filter fields return `400 INVALID_FILTER`; they are never interpolated into a datastore query.
- Query input supports an allowlisted grammar, escaped values, case-insensitive `AND`, `OR`, and `NOT`, quoted phrases, bounded wildcard contains, and a maximum serialized length. `AND` binds more tightly than `OR`; parentheses make any different precedence explicit. The server returns a structured parse error with offset and expected tokens.
- The server publishes query-field metadata used by autocomplete: canonical field, label, value type, allowed operators, bounded enum/facet suggestions, authorization visibility, and deprecation aliases. The submitted request is normalized to a canonical filter AST so the grid, summary, export, and saved-view contracts evaluate identical semantics.
- The first response is projection-only and bounded to the fields requested. Full events, graphs, raw JSON, and playbook history are deferred.
- Cursor tokens are scoped to tenant, filter, sort, snapshot, and user permissions and expire predictably. A filter change invalidates old cursors.
- Exact totals are optional. `totalApproximate` is explicitly labelled and must not block first usable rows.
- Export is an asynchronous job using the same authorized filter snapshot, not a client-side download of every row.

### ALT-015 — Queue summary and filter facets

Status: `PARTIAL` — summary and mapping-tolerant core facets implemented and live-verified **2026-08-10 15:29:49 IST (UTC+05:30)**  
Consumer: priority counters, saved-view counts, and filter option discovery

```http
GET /ha-alerts/summary?filter={canonicalFilter}&from={iso}&to={iso}
```

Return `snapshotAt`, approximate total, critical/high open, SLA at-risk/breached, unassigned, threat-intel matched, and status counts. Return bounded facets for severity, status, tenant, category, rule, primary-entity type, and assignee. Facets include `value`, display label, approximate count, and whether the value is currently selected. Expensive facets may return `availability=deferred` rather than delaying initial rows.

Implementation record — **2026-08-10 15:29:49 IST (UTC+05:30)**:

- Live Docker verification proved the active list and summary reconcile at 399 records with canonical analyst states (`open=339`, `in_review=60`). Numeric status codes are aligned to the established backend enum instead of Kiro's temporary alternate mapping.
- The summary now uses mapping-tolerant filter aggregations. Mixed legacy rollover mappings can no longer cause partial-shard totals that disagree with the grid; severity and status facets are returned immediately alongside category and assignee.
- The queue keeps bounded 100-row cursor blocks, cancellation, stable cache behavior and a projection-only first response. The frontend uses a timestamp-qualified visual row key so malformed duplicate source IDs cannot corrupt AG Grid virtualization or selection.
- Alert detail now normalizes both canonical flat fields and nested producer `rule`, `mitre` and `entities` objects. The real drawer rendered `FIN-WKS-044`, `Data Exfiltration Detected`, and ATT&CK `T1048` without fixtures.
- Remaining work: canonical tenant/rule/entity-type facets; one snapshot shared by rows and summary; explicit partial-failure metadata; durable saved views; full previewed mutations; and the identity invariant below.

Verification recorded **2026-08-10 15:33:05 IST (UTC+05:30)**: frontend TypeScript and production build passed; 34 focused Alert Triage tests passed; scoped lint returned no errors (one pre-existing hook-dependency warning remains in `AlertsListPage.tsx`). The full frontend suite now has only the two previously recorded failures in Correlated Findings lazy-route source inspection and Alert Investigation fixture keyboard selection—the stale Alert Triage envelope assertion was corrected. Java 17 production packaging passed and the rebuilt Docker backend is healthy. Maven's focused alert test request remains blocked at global test compilation by the same nine stale references already recorded: missing `HaRuleGenerationResource`, old alert-stream constructor calls without `HaSseRateLimiter`, and old alert-bulk constructor calls without `InvestigationEventPublisher`.

### ALT-024 — Globally unambiguous alert identity across rollover indices

Status: `REQUIRED`  
Recorded: **2026-08-10 15:29:49 IST (UTC+05:30)**  
Consumer: queue virtualization, detail drawer, investigation routing and every alert mutation

The real OpenSearch integration currently contains the same source alert ID in more than one index with different detection timestamps. An ID-only detail lookup can therefore return a different occurrence than the selected row, and an ID-only mutation cannot prove which stored record is authoritative. Production ingestion must enforce tenant-scoped global alert-ID uniqueness across the active alert alias and update the canonical document rather than copying it into multiple searchable indices. If that invariant cannot be guaranteed, ALT-014 must return an opaque, authorization-bound `alertRef` that uniquely identifies tenant, physical document and logical alert version; all detail, activity and mutation routes must accept that reference. Counts, facets, exports, related-alert queries and cursor continuation must apply the same documented de-duplication rule. The browser's timestamp-qualified grid key is only a defensive rendering measure and is not an authorization or mutation identity.

### ALT-016 — User-scoped saved triage views

Status: `REQUIRED`  
Consumer: My priority, unassigned, SLA risk, and analyst-created queue views

```http
GET    /ha-alert-views?scope=me
POST   /ha-alert-views
PATCH  /ha-alert-views/{viewId}
DELETE /ha-alert-views/{viewId}
POST   /ha-alert-views/{viewId}/set-default
```

A view stores name, canonical filter AST, sort, visible columns/order/widths, density, grouping, time-range policy, default flag, owner, sharing policy, version, and updated time. Built-in views have stable IDs and cannot be deleted. Browser-local state is only a temporary fallback and is never presented as cross-device persistence.

### ALT-017 — Assignment candidates and bulk assignment

Status: `REQUIRED`  
Consumer: drawer ownership control and `A` keyboard shortcut

```http
GET  /ha-alert-assignees?q={query}&cursor={cursor}&limit=20&availability=true
POST /ha-alerts/bulk/assignment/preview
POST /ha-alerts/bulk/assignment
```

Candidates are tenant-scoped users or teams with display name, role, current queue load, SLA-risk load, shift/availability state, and assignability reason. Preview reports selected, eligible, excluded, already-assigned, and cross-tenant counts. Execute requires preview token, reason, `Idempotency-Key`, and optimistic item versions; return per-item results for partial failure.

### ALT-018 — Bulk triage lifecycle actions

Status: `REQUIRED`  
Consumer: acknowledge, classify, close, tag, and promote actions from the selected-row bar

```http
POST /ha-alerts/bulk/status/preview
POST /ha-alerts/bulk/status
POST /ha-alerts/bulk/tags/preview
POST /ha-alerts/bulk/tags
POST /ha-alerts/bulk/promote/preview
POST /ha-alerts/bulk/promote
```

Status values are symbolic (`open`, `in_review`, `true_positive`, `false_positive`, `benign_positive`, `closed`) at the API boundary. Closing/classifying requires a reason code and optional note; policy may require evidence or manager approval. Preview returns consequences such as rule feedback, exception suggestions, correlated-group impact, linked-case impact, and excluded records. Execute uses idempotency and returns `jobId`, audit ID, and per-alert outcomes. Do not overload assignment into a generic status DTO.

### ALT-019 — Resumable alert-stream updates

Status: `REQUIRED`  
Consumer: Live mode, new-alert review banner, row patching, and freshness state

```http
GET /ha-alerts/stream?viewId={viewId}
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Events: `alert.created`, `alert.updated`, `alert.removed`, `summary.updated`, and `stream.heartbeat`. Payloads contain small projected deltas, `eventId`, `snapshotVersion`, server time, and whether the alert matches the active filter. New alerts are buffered until the analyst chooses “Load new alerts”; the server never causes unexpected row movement. Resume gaps return an explicit reset event so the client can preserve stale rows while refetching.

### ALT-020 — Lightweight triage drawer projection

Status: `PARTIAL` — core triage projection implemented and normalized **2026-08-10 15:29:49 IST (UTC+05:30)**  
Consumer: resizable context drawer opened from the alert table

```http
GET /ha-alerts/{alertId}?view=triage
```

Return ALT-001 core identity plus rendered reason, primary/related entities, rule and ATT&CK summary, priority indicators with provenance, highlighted evidence fields, occurrence/prevalence counts, owner, SLA, notes/activity preview, available lifecycle actions, permissions, and record version. Target first response below 75 KB compressed. Heavy process, network, graph, raw-event, and response catalogs remain behind their dedicated endpoints.

### ALT-021 — Suppression and exception impact preview

Status: `REQUIRED`  
Consumer: future “suppress similar” and rule-exception workflows from the queue

```http
POST /ha-alerts/{alertId}/suppression-preview
POST /ha-detection-rules/{ruleId}/exceptions/preview
```

Preview includes proposed condition AST, matching historical alerts, projected future volume reduction, affected tenants/data sources, false-negative risk prompts, expiry, owner, approval policy, and rollback instructions. Creating a suppression or exception is never a one-click row action and is unavailable without explainable impact data.

### ALT-022 — Permission-aware single-alert quick actions

Status: `REQUIRED`  
Consumer: pinned row action column for status, notes, tags, and incident linking

The queue and triage projections expose capabilities per record so the client never guesses whether an icon should be actionable:

```json
{
  "availableActions": [
    { "id": "change_status", "allowed": true, "requiresReason": true, "requiresPreview": false },
    { "id": "add_note", "allowed": true, "requiresReason": false, "requiresPreview": false },
    { "id": "apply_tags", "allowed": false, "reasonCode": "ROLE_REQUIRED", "reason": "SOC Analyst role required" },
    { "id": "link_incident", "allowed": true, "requiresReason": true, "requiresPreview": true }
  ]
}
```

Status and tag changes reuse ALT-018 with a single alert ID and current item version. Notes and incident linking use resource-shaped commands:

```http
POST /ha-alerts/{alertId}/notes
If-Match: "alert-version"
Content-Type: application/json

{
  "body": "Observed token reuse from the same client fingerprint.",
  "visibility": "soc",
  "clientRequestId": "uuid"
}
```

```http
GET  /ha-incidents/candidates?q={query}&alertId={alertId}&cursor={cursor}&limit=20
POST /ha-alerts/{alertId}/incident-link/preview
POST /ha-alerts/{alertId}/incident-link
Idempotency-Key: {uuid}

{
  "mode": "create_new | attach_existing",
  "incidentId": "INC-2026-00418",
  "newIncident": null,
  "reason": "Correlated identity and endpoint evidence",
  "alertVersion": 7,
  "previewToken": "opaque"
}
```

Requirements:

- Every icon has an accessible name and tooltip, but no mutation fires from the row itself. It opens a confirmation surface with current state, target state, reason/note, and impact.
- Capability decisions combine role, tenant, alert state/version, incident policy, retention/lock state, and approval requirements. The server revalidates them at execution time.
- Notes return the created activity item with author, sanitized rendered content, source text, timestamp, visibility, and audit ID. Notes are append-only; edits create a revision event.
- Incident candidates are tenant-scoped and explain why they are relevant. Preview returns duplicate-link state, correlated alerts/entities, target incident status, policy warnings, and whether manager approval is required.
- `create_new` and `attach_existing` are distinct commands. Neither accepts raw event IDs supplied only by the browser; the server resolves authorized evidence from the alert relationship.
- Success returns the updated row projection plus audit ID (or `202` job envelope where policy automation is asynchronous). `409 VERSION_CONFLICT`, `403 ACTION_NOT_ALLOWED`, and per-record validation errors use the common problem envelope.
- Suppression, exception creation, containment, isolation, or other destructive response actions are intentionally excluded from this quick-action column and continue to require dedicated preview workflows.

---

## Route: `/alerts/board` — Severity Board

Frontend files: `frontend-v3/src/pages/alerts/AlertSeverityBoardPage.tsx`, `SeverityTile.tsx`, and `severityBoard.service.ts`.

### Current contract audit

| ID | Status | Contract | Notes |
|---|---|---|---|
| ALT-SB01 | `PARTIAL` | `GET /overview/count-alerts-by-severity` | The checked-in `OverviewResource` exposes aggregate severity counts under `/api/overview`, but it does not return ownership, SLA, priority/risk, alert context, trend buckets, snapshot consistency, or lane drill-down records. It also has no visible method-level `@PreAuthorize` guard. It is insufficient for the operational board. |
| ALT-SB02 | `MISMATCH` | Previous frontend fetched one summary and five severity lists | No checked-in list endpoint supports the assumed `/ha-alerts` severity calls. Six independent requests also create inconsistent snapshots and unnecessary latency. The redesign replaces this N+1 pattern with ALT-023. |

### ALT-023 — Bounded Severity Board workload projection

Status: `REQUIRED`  
Consumer: critical-first workload lanes, response-pressure metrics, severity distribution, and arrival pulse

```http
GET /ha-alerts/severity-board?from={iso}&to={iso}
    &scope=active|all&ownership=all|mine|unassigned&laneLimit=4
```

Representative response:

```json
{
  "overview": {
    "total": 36,
    "active": 29,
    "criticalOpen": 9,
    "needsTriage": 12,
    "slaPressure": 8,
    "unassigned": 6,
    "threatIntelMatched": 10,
    "highestRisk": 98
  },
  "lanes": [
    {
      "severity": "critical",
      "count": 9,
      "activeCount": 9,
      "slaPressure": 4,
      "unassigned": 2,
      "alerts": [
        {
          "id": "ALT-7F3A91",
          "title": "Signed utility spawned an encoded PowerShell download chain",
          "summary": "Encoded execution and outbound callback correlated on a finance workstation.",
          "severity": "critical",
          "riskScore": 94,
          "confidence": 91,
          "detectedAt": "2026-08-02T03:42:11.000Z",
          "status": "in_review",
          "statusLabel": "In review",
          "category": "Endpoint",
          "primaryEntity": { "type": "host", "label": "FIN-WKS-044" },
          "assigneeName": "Maya Chen",
          "slaStatus": "at_risk",
          "threatIntelMatched": true,
          "relatedAlertCount": 2,
          "mitreTechniqueId": "T1059.001",
          "tenantName": "Northstar Finance",
          "tags": ["encoded-script"]
        }
      ]
    }
  ],
  "trend": [
    {
      "start": "2026-08-02T01:00:00.000Z",
      "end": "2026-08-02T03:00:00.000Z",
      "label": "01:00",
      "total": 7,
      "critical": 2,
      "high": 3,
      "medium": 2,
      "low": 0,
      "info": 0
    }
  ],
  "snapshotAt": "2026-08-02T03:48:00.000Z",
  "totalApproximate": false,
  "dataCompleteness": "complete"
}
```

Requirements:

- Return overview, all five severity lanes, and exactly 12 ordered trend buckets from the same authorized snapshot and filter semantics. Counts must reconcile: lane counts sum to `overview.total`, and trend totals sum to the same value when `dataCompleteness=complete`.
- Severities and lifecycle states are symbolic at the API boundary. Canonical lifecycle states are `open`, `in_review`, `true_positive`, `false_positive`, `benign_positive`, and `closed`; legacy numeric codes stay inside backend adapters.
- `active` includes only actionable lifecycle states. `mine` resolves the authenticated principal server-side; the client never supplies an analyst ID for that scope.
- Lanes are ordered `critical`, `high`, `medium`, `low`, `info`. Records within each lane are ordered by `riskScore DESC`, `detectedAt DESC`, then opaque `id ASC`. Enforce `1 <= laneLimit <= 10`; the default is four.
- Risk, severity, confidence, priority, SLA state, asset/entity criticality, threat-intelligence matches, and assignment remain distinct fields with provenance. The board must not relabel severity as risk or silently derive ownership.
- Use the same canonical alert query model and tenant rules as ALT-014. A lane drill-down opens the queue with equivalent severity, time, status, and ownership semantics rather than issuing an unrelated search.
- Protect the endpoint with explicit read authorization and tenant enforcement. Omit or redact field-level restricted entity/tenant values without changing aggregate authorization scope, and report `dataCompleteness=projection` when exact reconciliation is not possible.
- Target p95 below 300 ms for a 24-hour scope and a compressed payload below 120 KB. Compute aggregates in one backend projection/search plan; do not issue one downstream search per lane.
- `snapshotAt` is server time and `ETag`/conditional GET is recommended. Live `summary.updated` events reuse ALT-019 and only signal a refresh; they do not reorder visible workload until the analyst loads updates.
- Errors use the common problem envelope. Invalid ranges or limits return `400`; unauthorized scope returns `403`; unavailable analytics return `503` with a stable retryable code. The frontend distinguishes these from a legitimate zero-workload response.

---

## Routes: `/correlated-findings` and `/correlated-findings/:id`

Frontend files: `frontend-v3/src/pages/correlated-findings/CorrelatedFindingsPage.tsx`, `FindingWorkbench.tsx`, `CorrelatedFindingDetailPage.tsx`, and `correlatedFindings.service.ts`.

Live reconciliation **2026-08-10 16:54:08 IST (UTC+05:30)**: the canonical `/correlated-findings` routes now load the Phase 4 production workbench instead of the retired Sprint 44 table. The frontend accepts both the canonical `COR-*` DTO and the current correlation-engine producer (`findingId`, `description`, `alerts`, `entities`, `timeline`, fractional confidence) without inventing a risk score. `CorrelatedFindingService` now resolves detail by `id`, `findingId`, or OpenSearch `_id`, projects both producer shapes, and derives only structural counts, timestamps, and lead-entity identity. The live producer still does not supply authoritative risk, owner, SLA, lifecycle/version, data-source counts, relationship confidence, or the canonical summary/view envelope; those values remain explicitly unavailable rather than inferred.

Backend implementation verification **2026-08-10 17:07:06 IST (UTC+05:30)**: the COR-001 queue time window now treats `createdAt`, `updatedAt`, `firstSeen`, `lastSeen`, and `@timestamp` as producer aliases under one bounded `should` filter. This closes the live-queue omission where a valid correlation-engine finding had `@timestamp` but no `createdAt`. A fictional current-window E2E finding was indexed into the local Docker OpenSearch instance for authenticated real-backend validation; it is not a frontend fixture and is confined to the `e2e-finding-*` test namespace. Java 17 production packaging, the rebuilt backend image, backend health check, live queue/detail retrieval, the complete 1,009-test frontend suite, and the frontend production build all passed. Remaining COR-001/COR-002 gaps are unchanged and remain explicitly listed below.

### Current contract audit

| ID | Status | Contract | Notes |
|---|---|---|---|
| COR-LV01 | `PARTIAL` | `GET /offenses` | The checked-in `OffenseResource` returns raw OpenSearch `Map` records and supports only a status filter. It does not expose symbolic severity, risk, confidence, ownership, SLA, time/search filters, summary counts, deterministic story ordering, bounded previews, or field-level completeness. The former frontend also requested unsupported severity, time, search, and sort parameters and loaded up to 1,000 records client-side. |
| COR-LV02 | `PARTIAL` | `GET /offenses/{id}` and `/offenses/{id}/alerts` | A raw finding document and alert lookup exist, but the UI cannot safely reconstruct correlation reasons, ATT&CK progression, entity risk, narrative provenance, relationship graph, version, available actions, or incident overlap. Fetching detail plus an unbounded alert ID array also creates inconsistent snapshots. |
| COR-LV03 | `MISMATCH` | `PUT /offenses/{id}/status` | The checked-in controller accepts an arbitrary `Map<String,String>`, concatenates a validated-only-for-presence status into an OpenSearch script, and returns no updated DTO, version, or audit ID. Replace it with COR-004; do not re-enable lifecycle controls against this route. |
| COR-LV04 | `MISMATCH` | Offense endpoints lack explicit method authorization and DTO boundaries | The checked-in controller exposes raw maps and has no visible `@PreAuthorize` annotation on list, detail, status, or alert retrieval. Prove tenant isolation, field-level authorization, lifecycle policy, and safe DTO mapping before production stitching. |

### COR-001 — Bounded correlated-finding queue and preview projection

Status: `PARTIAL` — live bounded queue exists and current producer normalization was reconciled **2026-08-10 16:54:08 IST (UTC+05:30)**; canonical views/search, risk/owner/SLA projections, summary semantics, and `nextCursor`/snapshot metadata remain  
Consumer: attack-story master list, summary metrics, saved views, filters, and immediate selected-story preview

```http
GET /ha-correlated-findings?from={iso}&to={iso}
    &view=needs_review|mine|critical|multi_stage|sla_risk|unassigned|all
    &ownership=all|mine|unassigned&sort=risk_desc|newest|confidence_desc|alerts_desc
    &search={escaped}&cursor={cursor}&limit=25
```

Response envelope:

```json
{
  "summary": {
    "total": 12,
    "open": 9,
    "critical": 3,
    "unassigned": 4,
    "slaPressure": 6,
    "multiStage": 5,
    "newLast24h": 10
  },
  "items": [
    {
      "id": "FND-26-0841",
      "title": "Credential theft progressed to remote service execution",
      "summary": "LSASS access, privileged token use, and remote service creation converge on the same host and identity.",
      "severity": "critical",
      "riskScore": 97,
      "confidence": 94,
      "status": "investigating",
      "correlationKind": "attack_chain",
      "firstSeen": "2026-08-02T06:31:08.000Z",
      "lastSeen": "2026-08-02T09:14:42.000Z",
      "alertCount": 7,
      "eventCount": 126,
      "dataSourceCount": 3,
      "intelMatchCount": 2,
      "relatedFindingCount": 1,
      "tenantName": "Northstar Finance",
      "owner": { "id": "usr-41", "name": "Maya Chen" },
      "slaStatus": "breached",
      "mitreTactics": ["Credential Access", "Discovery", "Lateral Movement", "Command and Control"],
      "mitreTechniques": ["T1003.001", "T1087.002", "T1021.002", "T1071.001"],
      "entities": [],
      "correlationReasons": [],
      "stages": [],
      "signals": [],
      "relationshipNodes": [],
      "relationshipEdges": [],
      "narrative": {},
      "availableActions": [],
      "correlationEngine": {},
      "incident": null,
      "version": 7,
      "dataCompleteness": "projection"
    }
  ],
  "total": 9,
  "nextCursor": null,
  "snapshotAt": "2026-08-02T09:18:00.000Z",
  "totalApproximate": false,
  "dataCompleteness": "complete"
}
```

Requirements:

- Return summary and bounded preview rows from one tenant-authorized snapshot. `limit` defaults to 25 and is capped at 50. Cursor ordering is deterministic: the requested primary sort, then `lastSeen DESC`, then opaque `id ASC`.
- The preview row includes at most four entities, four correlation reasons, five stages, seven signals, and nine relationship nodes. Each collection includes its full count when truncated. Complete or raw evidence is deferred to COR-002/COR-003.
- `mine` resolves the authenticated principal server-side. Search covers authorized IDs, title/summary, entity values, tenant display name, and ATT&CK technique IDs; it never bypasses field-level redaction.
- Severity, risk score, confidence, priority, asset/entity criticality, correlation strength, and narrative confidence are distinct concepts. Every derived value includes provenance under the full detail contract.
- Summary counts reflect the time and tenant scope but not the selected view so analysts can move between views without misleading totals. The response explicitly labels exact versus approximate counts.
- Target first usable response below 150 KB compressed and p95 below 350 ms for a 24-hour scope. The UI preserves stale data during filter changes and buffers live insertions until analyst refresh.

### COR-002 — Complete explainable attack-story projection

Status: `PARTIAL` — live detail lookup now accepts stable `id`, `findingId`, and document `_id`, reconciled **2026-08-10 16:54:08 IST (UTC+05:30)**; authoritative canonical narrative, risk, relationship provenance, action permissions, version, and component completeness remain  
Consumer: `/correlated-findings/:id`, queue preview tabs when authorized fields are already projected

```http
GET /ha-correlated-findings/{findingId}
```

Return COR-001 identity plus:

- authoritative narrative summary, key judgments, author/source (`correlation_engine`, `analyst`, or `ai_assisted`), generation time, model/rule version where applicable, confidence, citations to supporting alert/event IDs, and expiry/re-evaluation state;
- correlation reasons with kind, human-readable explanation, strength, evidence count, calculation/provenance, and evidence references;
- ordered ATT&CK stages with timestamps, tactic, technique, title, and alert references;
- bounded supporting alert projection with rule, entity, severity, category, and timestamp;
- impacted entities with type, role, risk, asset criticality, alert count, and authorization/redaction state;
- relationship nodes and edges with stable IDs, type, label, edge meaning, confidence, and provenance—no client inference from raw event fields;
- tenant, owner, SLA, current incident link, available actions, correlation engine/version/rule IDs, record version, `snapshotAt`, and `dataCompleteness`.

The core projection should remain below 250 KB compressed and p95 below 500 ms. Relationship data is returned in the same snapshot, but large node sets are summarized and continue through COR-003. An unavailable graph store yields `dataCompleteness=projection` plus a component availability code; it does not fail the entire attack story.

### COR-003 — Cursor-paginated supporting evidence

Status: `REQUIRED`  
Consumer: expanded Evidence tab, raw chronology, export, and large relationship sets

```http
GET /ha-correlated-findings/{findingId}/signals?cursor={cursor}&limit=100&sort=detectedAt,id
GET /ha-correlated-findings/{findingId}/events?cursor={cursor}&limit=100&fields={allowlistedFields}
GET /ha-correlated-findings/{findingId}/relationships?cursor={cursor}&limit=100&type={node|edge}
```

Use stable snapshot/cursor semantics and enforce `1 <= limit <= 200`. Signal responses never embed unrestricted raw event sources. Raw event fields use ALT-010 field-level authorization, explicit redaction metadata, and a server allowlist. Exports are asynchronous and audited.

### COR-004 — Finding lifecycle, assignment, and notes

Status: `REQUIRED`  
Consumer: permission-aware triage controls in queue and detail views

```http
POST /ha-correlated-findings/{findingId}/status/preview
POST /ha-correlated-findings/{findingId}/status
POST /ha-correlated-findings/{findingId}/assignment/preview
POST /ha-correlated-findings/{findingId}/assignment
POST /ha-correlated-findings/{findingId}/notes
If-Match: "finding-version"
Idempotency-Key: {uuid}
```

Canonical states are `open`, `investigating`, `incident_created`, `resolved`, and `false_positive`. Status/classification changes require reason, optional note, impact preview, current version, and policy evaluation. Assignment preview includes assignee eligibility and workload. Notes are append-only, sanitized, tenant-scoped, and return audit metadata. Every response returns the updated projection or `202` job envelope, audit ID, and common problem errors for permission, validation, conflict, or approval failure.

### COR-005 — Previewed incident promotion

Status: `REQUIRED`  
Consumer: “Promote” action from preview and full investigation

```http
POST /ha-correlated-findings/{findingId}/incident-promotion/preview
POST /ha-correlated-findings/{findingId}/incident-promotion
Idempotency-Key: {uuid}
```

Preview returns proposed title, authorized alert/entity counts, candidate existing incidents with overlap reasons and percentages, policy warnings, finding version, and an opaque preview token. Execution accepts only the token plus an explicit `create_new` or `attach_existing` decision; the server resolves evidence membership and revalidates tenant, permissions, version, duplicate state, and approval. Success returns `incidentId`, `auditId`, and the updated finding. Promotion never silently merges incidents or trusts browser-supplied raw event IDs.

### COR-006 — Resumable correlation updates

Status: `REQUIRED`  
Consumer: live freshness, buffered insertions, selected-story refresh, and summary updates

```http
GET /ha-correlated-findings/stream?viewId={viewId}
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Events: `finding.created`, `finding.updated`, `finding.removed`, `finding.summary.updated`, and `stream.heartbeat`. Payloads contain small authorized deltas, `eventId`, `snapshotVersion`, server time, and active-view match state. New or re-ranked stories are buffered until the analyst loads updates; the server never unexpectedly replaces the selected story. Resume gaps emit reset instructions and preserve stale UI during refetch.

---

## Route: `/search` — Search & Hunt

Frontend files: `frontend-v3/src/pages/search-hunt/SearchHuntPage.tsx`, `searchHunt.service.ts`, `searchHunt.types.ts`, and supporting search components.

### Current contract audit

| ID | Status | Contract | Notes |
|---|---|---|---|
| HNT-LV01 | `DEPRECATED` | Frontend `executeSearch` no longer posts to `POST /ha-search/nl-query` | Reconciled **2026-08-18 20:40:00 IST**. Keyword hunt uses `GET /ha-search/timeline`. `POST /ha-search/nl-query` remains a translation-only SOC-AI path and must not be treated as event search. |
| HNT-LV02 | `PARTIAL` | `GET /ha-search/timeline?query&from&to` | Reconciled **2026-08-18 20:40:00 IST**. Timeline now searches `v3-hive-log-*` and `v3-hive-alert-*` (was `v3-hive-event-*`, which never received processor writes). Still a 500-hit unpaginated five-field projection; suitable as staging keyword search, not the full hunt grid. |
| HNT-LV03 | `PARTIAL` | `POST /elasticsearch/search?top&indexPattern&page&size` | Legacy filtered search returns raw map sources with offset pagination and `X-Total-Count`. The resource has no visible method-level authorization, accepts a client-supplied index pattern, does not expose cancellation or snapshot cursors, and can enrich child records with N+1 counts. It is not a safe canonical SOC hunt boundary. |
| HNT-LV04 | `PARTIAL` | `GET /elasticsearch/index/properties`, `/property/values`, and `/log-analyzer/top-x-values` | Field discovery and top-value primitives exist, but they expose datastore-oriented shapes, client-selected index patterns, no normalized field labels/descriptions/operator grammar, no authorization visibility, and no snapshot-aligned coverage. The checked-in methods also lack visible `@PreAuthorize` guards. |
| HNT-LV05 | `PARTIAL` | `/ha-saved-queries` and `/ha-saved-hunts` CRUD | Two overlapping persistence models exist. Saved queries permit read-only users to read and `ROLE_USER` to mutate; saved hunts permit only analyst/admin and store DSL/NL/filter JSON. Neither persists the complete canonical hunt scope, columns, density, sort, time policy, language version, or schema version. Unify before cross-device Search Manager integration. |
| HNT-LV06 | `MISMATCH` | Existing hunt-to-incident UI posts raw selected OpenSearch IDs directly to `POST /ha-incidents` | The browser must not define evidence membership by sending arbitrary datastore IDs. Incident creation, investigation creation, and evidence attachment require server-resolved authorized search snapshot references, preview, policy evaluation, idempotency, and audit results under HNT-007. |

### HNT-001 — Canonical bounded hunt execution

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: query workspace, event histogram, virtualized results grid, execution metrics, and cursor continuation

```http
POST /ha-hunts/search
Content-Type: application/json

{
  "query": "event.category:authentication AND event.action:logon_failed",
  "language": "kql",
  "timeRange": {
    "from": "2026-08-03T03:30:00.000Z",
    "to": "2026-08-03T07:30:00.000Z"
  },
  "tenantScope": "authorized",
  "fields": ["@timestamp", "event.severity", "event.action", "host.name", "user.name", "source.ip", "message"],
  "cursor": null,
  "limit": 100,
  "sort": [
    { "field": "@timestamp", "direction": "desc" },
    { "field": "_id", "direction": "asc" }
  ],
  "includeHistogram": true
}
```

Response:

```json
{
  "searchId": "HUNT-26-08421",
  "items": [],
  "nextCursor": "opaque-or-null",
  "hasMore": true,
  "snapshotAt": "2026-08-03T07:30:18.000Z",
  "totalApproximate": 18421,
  "totalIsExact": false,
  "tookMs": 284,
  "histogram": [
    { "from": "2026-08-03T03:30:00.000Z", "to": "2026-08-03T03:40:00.000Z", "count": 142 }
  ],
  "partialFailures": []
}
```

Requirements:

- The server parses an allowlisted Boolean grammar with `AND` precedence above `OR`, parentheses, `NOT`, quoted values, field-aware operators, bounded wildcards, maximum query length/depth/clause count, and structured parse errors containing offset and expected tokens.
- The browser never submits an ambiguous empty query. Activating Run or Enter with a blank editor sends the canonical match-all query `*:*`, still bounded by the authorized tenant scope, selected time range, projection, deterministic newest-first sort, `limit=100`, and cursor continuation. The server treats `*:*` as an explicit bounded query rather than an export request; an omitted or whitespace-only `query` remains a `422 QUERY_REQUIRED` validation error.
- `tenantScope=authorized` is resolved from the authenticated principal. A specific tenant remains a selection hint and is reauthorized server-side. Cursor tokens bind tenant scope, principal permissions, query AST, projection, sort, and snapshot.
- Enforce `1 <= limit <= 200`. Every result has an opaque event ID, parsed event time, ingest time, symbolic severity, normalized core fields, tenant display context when authorized, and an alert-association count. `_source` is not returned in the grid projection.
- Requested fields pass an allowlist and field-level security before query execution. Unknown, forbidden, deprecated, and unsupported fields produce distinct validation metadata; forbidden fields are not silently broadened.
- The histogram and first result page come from the same snapshot. The backend chooses an interval producing 20–80 buckets and returns UTC bucket boundaries, not localized labels.
- `totalApproximate` and `totalIsExact` are explicit. An exact count must not block first rows. Later cursor pages may omit the histogram and reuse the original `searchId` and snapshot.
- Cursor continuation is forward-only and opaque; the client retains cursor tokens for deterministic back/forward navigation while caching at most the active and adjacent page payloads. The server must not require offset pagination or re-run the first page to continue a snapshot.
- Deterministic ordering includes an opaque ID tie-breaker. Cursor expiry returns `410 SEARCH_CURSOR_EXPIRED` with restart guidance; it never falls back to offset zero without telling the analyst.
- Target first usable page p95 below 500 ms for a four-hour scope, compressed core payload below 180 KB, and projection-only OpenSearch queries. Preserve completed stale snapshots during retries or filter changes.

### HNT-002 — Cancellable execution and query diagnostics

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: Cancel control, execution duration, source coverage, stale/partial states, and troubleshooting

```http
DELETE /ha-hunts/search/{searchId}
GET    /ha-hunts/search/{searchId}/status
```

Cancellation is idempotent and returns `204` when the search is cancelled or already terminal. Status includes lifecycle (`queued`, `running`, `complete`, `partial`, `cancelled`, `failed`, `expired`), server and datastore duration breakdown, records scanned, bytes read, active/failed data sources, query plan warnings, start/completion times, snapshot, and safe remediation guidance. It never returns raw index credentials or unrestricted DSL. Client `AbortSignal` disconnect is propagated to downstream searches where supported.

### HNT-003 — Authorized schema, autocomplete, and field statistics

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: Monaco autocomplete, AND/OR condition construction, schema rail, column selection, and include/exclude pivots

```http
GET /ha-hunts/schema?tenantScope=authorized&from={iso}&to={iso}&q={optional}&cursor={cursor}&limit=200
GET /ha-hunts/search/{searchId}/fields/{field}/values?q={optional}&cursor={cursor}&limit=20
```

Field metadata includes canonical ECS/Hive name, label, description, data type, category, allowed operators, searchable/aggregatable/sortable flags, authorization visibility, deprecated aliases, schema version, approximate snapshot coverage, approximate cardinality, and at most five safe sample values. Value lookup is bound to the active authorized search snapshot, supports case-insensitive search within authorized values, and returns a bounded cursor page of `{ value, count, countIsExact, includeQuery, excludeQuery }` items plus `nextCursor`, `hasMore`, `totalDistinctApproximate`, `totalIsExact`, `state`, and `snapshotAt`. Counts and server-authored query fragments must describe the same snapshot and query language; the browser never constructs a raw datastore clause from an untrusted value. High-cardinality, sensitive, unavailable, and redacted values are explicit states. Schema responses are stable-cacheable by tenant authorization fingerprint and schema version; field-value pages use short snapshot-bound caching and enforce a maximum limit of 50.

### HNT-004 — Progressive normalized and raw event detail

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: full-height event context drawer, normalized fields, raw event, copy, provenance, and integrity state

```http
GET /ha-hunts/events/{eventId}?searchId={searchId}&views=normalized,raw,pivots,permissions
```

The first event detail projection returns normalized fields and provenance before raw content. Raw data may be delivered as a deferred subresource when large. The response includes source alias, immutable event ID, event and ingest times, schema/version, integrity status, redacted field names or categories, data classification, permitted views/actions, and safe pivot descriptors. Field-level security is applied before serialization; explicitly forbidden raw access returns `403 FIELD_RESTRICTED`, distinct from an absent field or expired event. Copy/export preserves redaction markers and never includes hidden values.

### HNT-005 — Unified Search Manager for saved hunts and history

Status: `PARTIAL — KIRO SCAFFOLD VERIFIED 2026-08-10 13:08:01 IST`  
Consumer: Saved Hunts and Query History overlays

```http
GET    /ha-hunts/saved?scope=mine,shared&cursor={cursor}&limit=50
POST   /ha-hunts/saved
PATCH  /ha-hunts/saved/{savedHuntId}
DELETE /ha-hunts/saved/{savedHuntId}
GET    /ha-hunts/history?cursor={cursor}&limit=50
DELETE /ha-hunts/history
```

A saved hunt stores name, owner, sharing policy, canonical query AST/source, language and version, relative/absolute time policy, tenant-scope policy, selected fields/order/widths, row density, sort, pinned schema fields, description, tags, version, and last-used time. Shared hunts are immutable to non-owners. Server history is opt-out capable, user-scoped, bounded by retention, and stores outcome/count/duration without raw results. Browser-local history remains a clearly labelled offline fallback only.

### HNT-006 — Signed investigation pivots

Status: `PARTIAL — KIRO SCAFFOLD VERIFIED 2026-08-10 13:08:01 IST`  
Consumer: host, user, IP, process, alert, and related-event pivots from a selected event

Every event detail returns permitted pivot descriptors with ID, label, target route or canonical query reference, time-window policy, tenant scope, source event reference, and expiry. The frontend must not infer an entity route solely by concatenating a raw value. Pivot execution revalidates field-level visibility and reports redacted, unavailable, and cross-tenant targets without leaking their existence.

### HNT-007 — Evidence, investigation, and incident promotion

Status: `PARTIAL — KIRO SCAFFOLD VERIFIED 2026-08-10 13:08:01 IST`  
Consumer: Add Evidence, Create Investigation, and Create Incident actions from selected events

```http
POST /ha-hunts/actions/preview
POST /ha-hunts/actions
Idempotency-Key: {uuid}
```

Preview accepts `searchId`, action type, selected opaque event references, target incident when applicable, proposed title, and analyst reason. The server resolves snapshot membership and returns authorized/ineligible/expired/duplicate/redacted counts, target state, evidence provenance, policy warnings, approval requirement, proposed incident/investigation summary, and an opaque preview token. Execution accepts only the preview token plus idempotency key and returns target ID, audit ID, per-event outcomes, and updated capability state. Arbitrary browser-supplied index names or datastore IDs are rejected. Partial success is explicit and retry-safe.

### HNT-008 — Resumable long-running search updates

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: streamed result counts, freshness, long-duration hunts, partial source recovery, and stable analyst viewport

```http
GET /ha-hunts/search/{searchId}/stream
Accept: text/event-stream
Last-Event-ID: {eventId}
```

Events include `search.progress`, `search.count`, `search.page.available`, `search.source.failed`, `search.source.recovered`, `search.completed`, `search.cancelled`, and `stream.heartbeat`. Payloads contain small deltas, server time, snapshot version, scanned/result counts, duration, and completeness—never raw events. Updates do not reorder loaded rows or replace the open event drawer. Resume gaps instruct a status refetch while preserving stale usable results.

### HNT-009 — Query-language capability discovery and diagnostics

Status: `PARTIAL — BACKEND HARDENED 2026-08-10 13:08:01 IST`  
Consumer: compact language selector, language-aware Monaco autocomplete, saved hunt portability, and safe execution

```http
GET /ha-hunts/query-capabilities
```

The response advertises only languages enabled for the authenticated tenant and deployment. Each capability includes a stable language ID (`kql`, `lucene`, `esql`, or restricted `opensearch_dsl`), display name, parser/version, result shape (`events` or `table`), allowed field types/operators/functions, autocomplete snippets, aggregation support, maximum query length/depth/clause count, and feature or permission restrictions. `POST /ha-hunts/search` rejects unadvertised languages with `422 QUERY_LANGUAGE_UNAVAILABLE` and returns structured parse diagnostics with source ranges and safe remediation.

Raw Lucene or OpenSearch DSL is never passed through from the browser to the datastore. It is parsed, allowlisted, tenant-scoped, projection-bounded, and cost-limited server-side. ES|QL/table queries use a separately declared tabular result projection and cannot silently feed event-detail, evidence, or incident actions without opaque source-event references. Until capability discovery exists, the frontend exposes KQL as the sole enabled language and labels other industry-standard modes as unavailable instead of simulating support.

### Search & Hunt backend implementation record

Recorded: **2026-08-10 13:08:01 IST (UTC+05:30)**

| Contract | Implemented or verified in this backend pass | Remaining before `COMPLETE` |
|---|---|---|
| HNT-001 | Replaced raw query-string construction with a bounded typed Boolean parser; added canonical field/projection and sort allowlists, explicit `*:*`, 90-day and page-size limits, PIT plus `search_after`, signed scope-bound cursors, request fingerprints, snapshot-aligned first-page histogram, partial-shard reporting, and approximate/exact total metadata. Client-selected physical index patterns are rejected in favor of resolved log/event aliases. | Resolve `authorized` to the complete per-principal tenant set, enforce field-level permissions from the authoritative policy service, publish measured payload/p95 gates, and add OpenSearch-backed tenant-isolation integration tests. |
| HNT-002 | Search ownership is bound to principal and tenant context; cancellation releases the PIT, marks the tracked search cancelled, and returns idempotent `204` for an existing terminal search; status describes the bounded parser and PIT pagination. | Execution is still request/response synchronous, so server task IDs, disconnect propagation, genuine in-flight OpenSearch cancellation, datastore/server timings, scanned records/bytes and source-level diagnostics remain required. |
| HNT-003 | Added a canonical allowlisted field registry used by parsing, sorting, projection, autocomplete metadata and value discovery. Field-value pages now use the active PIT/query, composite cursor pagination, signed owner/tenant-bound cursors, safe server-authored include/exclude fragments, prefix filtering and the registered maximum limit of 50. | Merge authorized live mappings through `_field_caps`; add schema version/cache fingerprint, coverage/cardinality/sample metadata, sensitive/redacted/high-cardinality states, case-normalized mapping-aware search and FLS tests. |
| HNT-004 | Event detail now requires a valid owner/tenant-bound `searchId`, resolves opaque IDs only inside that search PIT, uses a bounded detail projection, and progressively includes raw content only when requested. | Replace provisional permission flags with authoritative FLS/action capabilities, return real redaction/classification/integrity/provenance data, define a deferred large-raw subresource, and distinguish forbidden raw access from absent/expired records. |
| HNT-005 | Verified Kiro's saved-hunt/history scaffolding and restricted automatic history recording to the first page so cursor navigation does not create duplicate history entries. | Consolidate saved-query and saved-hunt persistence, add the complete canonical query/scope/layout/version model, bounded cursor history, sharing enforcement, retention/opt-out and migrations. |
| HNT-006 | Verified signed pivot generation scaffolding and ensured pivot-dependent event fields are present in the bounded detail projection. | Bind pivots to tenant, principal, source event, search snapshot, expiry and permission version; escape all query values through the typed query composer and replace legacy inline time clauses with the request time-range contract. |
| HNT-007 | Preview/execute require `searchId`; events are resolved only inside the owner/tenant hunt PIT or session indices; preview JWT binds `searchId`, `permissionVersion`, and principal. Escalate/investigation and large create_evidence set `approvalRequired`; execute without `parameters.approvalId` returns 400. create_evidence returns `eventOutcomes`. SOC Manager path: `POST /ha-hunts/approvals` + `POST .../decision` (SoD); execute consumes APPROVED `approvalId`. At **2026-08-21 15:25:00 IST**, staging live-verified approval path via `run-hnt007-approval-live.sh`. Gates live-verified **2026-08-21 14:00**; snapshot bind/404 **2026-08-19**. | UI still must not post raw OpenSearch IDs (HNT-LV06). Full RESP-020 governance queue remains separate. |
| HNT-008 | Search progress metadata and SSE access are principal/tenant bound; terminal completion/failure/cancellation and replay scaffolding are present. | Move execution to a resumable asynchronous job, emit real count/page/source recovery deltas and heartbeat IDs, persist a bounded replay window, and return an explicit reset event for resume gaps. |
| HNT-009 | Capability discovery now advertises only the implemented KQL subset, actual operators/features/limits and the canonical field registry. Hunt parse/field/cursor failures use stable RFC 9457 problem details with codes and offsets. | Add source-range/expected-token diagnostics, stable result-shape and language-version metadata, deployment/tenant permission filtering, autocomplete snippets and contract/OpenAPI generation. |

Verification recorded **2026-08-10 13:15:58 IST (UTC+05:30)**: Java 17 main compilation, the Search & Hunt frontend TypeScript check, 173 focused frontend tests, and eight isolated backend parser/cursor tests passed. Maven's global test lifecycle remains blocked during test compilation by unrelated stale constructor/class references in rule generation and alert test sources; this is recorded as a full-suite verification blocker rather than being misreported as a Search & Hunt failure or pass.

---

## Route: `/entities` — Entity Intelligence Inventory

Frontend files: `frontend-v3/src/pages/entities/EntityListPage.tsx`, `frontend-v3/src/services/entities.service.ts`, and `frontend-v3/src/types/entity.types.ts`.

The inventory follows the enterprise entity-analytics model: prioritize independently calculated risk and asset criticality, make change from baseline visible, retain explicit activity/freshness scope, and open a bounded context preview before the full dossier. Risk, criticality, alert severity, behavioral deviation, and data coverage remain separate concepts.

### Checked-in backend audit

| ID | Status | Contract | Notes |
|---|---|---|---|
| ENT-V01 | `PARTIAL` | `GET /ha-entities?type={type}&page={page}&size={size}` | `HaEntitiesResource` returns a Spring `Page` body as a raw DTO array plus pagination headers. It supports only one entity type and offset paging; the existing frontend sends `riskMin`, `riskMax`, and `search`, which are silently ignored. The API client also cannot read `X-Total-Count`, so exact pagination is unavailable. |
| ENT-V02 | `PARTIAL` | `GET /ha-entities/{id}` | Core name/type/risk/last-seen/alert count plus limited 30-day enrichment exists. It is too heavy and incomplete for a bounded list preview and does not return tenant, criticality, risk reason/provenance, source coverage, baseline deviation, permissions, or canonical pivots. |
| ENT-V03 | `PARTIAL` | `GET /ha-entities/{id}/risk` | Current response exposes score and a derived trend, but `riskDrivers` and `topAlertCategories` are always empty and calculation provenance/validity are absent. |
| ENT-V04 | `MISMATCH` | Entity read authorization | The router allows `ROLE_ANALYST` and `ROLE_ADMIN`; `HaEntitiesResource` allows `ROLE_ADMIN` and `ROLE_USER`. Align this with the platform read-role policy and tenant/field authorization before integration. |
| ENT-V05 | `MISMATCH` | Entity type vocabulary | Backend records may contain `ip`; the previous frontend union used `network` and omitted IP, service, cloud, and domain entities. Publish a versioned canonical vocabulary with an `unknown` fallback instead of allowing clients to guess. |

### Backend implementation reconciliation — 2026-08-11 14:46:18 IST (UTC+0530)

This reconciliation supersedes the earlier checked-in audit for implementation status only; it does not delete the target contracts below. Kiro's newer `HaEntityResource` and `com.hivearmor.service.entity` implementation now cover the complete ENT-001–ENT-010 route family. The frontend consumer is now `EntityInventoryPage.tsx` plus `EntityDossierPage.tsx`; the retired `EntityListPage.tsx` references above are historical. Remaining gaps are recorded against the target contract instead of creating duplicate backend requests.

| ID | Reconciled status | Implemented now | Remaining backend work |
|---|---|---|---|
| ENT-V01 / ENT-001 | `PARTIAL` | Tenant-resolved index pattern, multi-filter search, deterministic `search_after`, exact total, canonical row pivots, and a hard 100-row maximum are implemented at `GET /ha-entities`. | The inventory cursor is unsigned Base64 sort JSON and is not authorization/filter/snapshot-bound. Add snapshot/PIT metadata, exactness flags, bounded field projection, safe unknown-type metadata, freshness, permissions/redaction, record versions, partial failures, and stable cursor validation. |
| ENT-V02 / ENT-002 | `PARTIAL` | `GET /ha-entities/summary` returns total/high-risk/rising/active-alert/new-24h counters plus type/risk/criticality/source facets under the same tenant-resolved query filters. | Add snapshot identity and exactness, tenant/tag/recency facets, safe labels/availability, deferred-facet state, ingestion freshness, and independently reportable aggregation failures. |
| ENT-003 | `PARTIAL` | `GET /ha-entities/{id}/preview` returns identity, risk, criticality, baseline deviation, 24h/7d activity, 30d alert summary, tags, and HMAC-signed pivot descriptors. | Bind preview to the list snapshot/window; add provenance, tenant/redaction/permissions/version, source coverage and incident summary, payload budget metadata, `409 …32070 tokens truncated… page, total/facets, owner/team/access, managed/draft/published state, required-source health, freshness, favorite/recent metadata and RFC 9457 errors. Cross-tenant, redacted and permission-denied tests are mandatory. |
| DSH-002 | `MISSING` | Dashboard, visualization and layout entities are mutated independently. No canonical definition DTO, optimistic version, ETag, draft/publish state or atomic save exists. | Add one versioned dashboard definition containing metadata, variables, panel references/layout, filters, defaults and access policy. Create/update/clone/publish/archive require expected version, validation, idempotency and immutable audit. Managed definitions are clone-only outside authorized content administration. |
| DSH-003 | `PARTIAL` | `UtmDashboardVisualization` stores layout coordinates, while the dashboard entity separately references visualizations; no typed variable/panel schema or atomic consistency guarantee exists. | Define versioned schemas for variable types, panel configuration, layout bounds, query reference, transformations, visualization options and accessible alternatives. Validate panel minimum/maximum dimensions, source capability, variable dependencies and duplicate identifiers server-side; save atomically. |
| DSH-004 | `PARTIAL` | `/api/ha-visualizations/run` executes legacy visualization requests; it lacks explicit per-request cancellation, tenant/source authorization evidence, query budget, snapshot/freshness/partial-source metadata and can follow an unbounded default path. | Add bounded, cancellable panel execution using allowlisted sources/fields/operators, maximum lookback/buckets/rows/bytes/time, stable cache keys, opaque continuation where tabular, snapshot and observed/generated timestamps, query duration, scanned volume, partial-source errors and redaction. Cancellation must terminate downstream work. |
| DSH-005 | `MISSING` | Entity ownership strings and a system-owner flag do not provide folder/team/role permissions, favorites, shares or field-level access. | Add owner/team/role/folder access with inherited permissions, explicit view/edit/admin/share/export capabilities, tenant scope, favorites/recent views, permission version and audit. Sharing/export must enforce field-level security and authorized recipients. |
| DSH-006 | `MISSING` | No definition history, comparison, rollback or publication ledger is exposed. | Add cursor-paged immutable version history with actor, reason, timestamp, structured delta and publication state. Compare and restore create a new version; they never destroy history. |
| DSH-007 | `MISSING` | Existing visualization metadata does not provide governed dashboard/Hunt/entity/incident drilldowns or context-preservation rules. | Add allowlisted typed drilldowns that bind dashboard version, panel, global variables, clicked value, tenant/time scope and field permissions. Internal pivots use canonical route parameters; external URLs require template allowlisting and audit. No arbitrary script or raw URL execution. |
| DSH-008 | `MISSING` | No snapshot-bound asynchronous dashboard report/export/share job is exposed. | Add asynchronous render/export jobs with dashboard version, time/tenant context, field permission, redaction, progress, cancellation, expiry, signed download and immutable audit. Scheduled delivery requires versioned templates, authorized recipients and destination health. |
| DSH-009 | `PARTIAL` | Legacy `/ha-dashboards`, `/ha-dashboard-visualizations` and `/ha-visualizations` entity CRUD coexist without a canonical successor or standard deprecation metadata. | After DSH-001–DSH-008 cut over, publish versioned successors and advertise `Deprecation`, `Sunset` and successor `Link` headers on old routes for at least two releases. Record consumer telemetry and removal gates. Do not remove or mark deprecated until the successor is deployed. |
| DSH-010 | `MISSING` | Panel execution health, cache outcome, source dependency and query diagnostics are not projected to operators. | Add permission-filtered per-panel execution diagnostics and aggregate dashboard health: request/trace id, cache status, duration, freshness, scanned volume, dependency state, partial failures and retry guidance. Raw query plans and sensitive index details remain privileged. |

Frontend integration recorded **2026-08-21 17:06:45 IST (UTC+05:30)**: unified the incompatible dashboard type/service layers behind a canonical frontend model; added an enterprise gallery, explicit keyboard selection, access/health/freshness inventory, compact governed runtime with global time/tenant/variables, per-panel state/freshness/provenance, investigation pivots and detail drawer; and added a three-pane low-code Studio with panel catalogue, 12-column canvas, inspector, local readiness and fixture-only draft saving. Production normalizes legacy definitions for discovery but marks panel execution unavailable and disables unsafe canonical saves. Development fixtures load only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.

## Route family: `/reports/scheduled`, `/reports/templates`, `/reports/sitrep`, `/reports/incidents`, `/reports/after-action` — Reporting Operations

Reconciled: **2026-08-21 17:37:57 IST (UTC+05:30)**

Frontend: `frontend-v3/src/pages/reports/`
Existing backend surfaces inspected: `/api/ha-reports`, `/api/ha-reports/scheduled`, `/api/ha-report-sections`, `/api/utm-reports`, `/api/ha-custom-reports`, and the separate compliance report/export/schedule controllers

The existing report entity CRUD and compliance-schedule adapter are retained as compatibility reads. They do not prove a generated artifact, tenant-safe source snapshot, recipient authorization, redaction, approval, delivery, retention or immutable report history. The frontend therefore labels production results as legacy compatibility mode and withholds generation/distribution mutations until canonical contracts exist.

| ID | Status | Checked-in capability | Required backend contract |
|---|---|---|---|
| REP-001 | `PARTIAL` | `/api/ha-reports` returns pageable legacy `UtmReport` entities, but the frontend contract does not receive page metadata; the entity has no tenant/snapshot/lifecycle model and route-level authorization is inconsistent. | Add a tenant-derived, role-authorized maximum-100 cursor-paged reporting inventory with same-snapshot totals/facets and stable report ID, type, lifecycle state, classification, owner, template/version, tenant/time scope, source freshness, approval, artifact formats, redaction profile and generated/expiry timestamps. Bind signed cursors to principal, scope, filters, order and snapshot; use RFC 9457 errors. |
| REP-002 | `MISSING` | No canonical versioned report-template aggregate exists. Legacy report sections, report rows and dashboard references are independently mutable. | Add versioned draft/published/retired templates with typed ordered sections, data-query references, required/optional sources, accessible render alternatives, classification, redaction profile, locale/timezone, brand/layout options, optimistic version, validation and immutable audit. Managed templates are clone-only outside content administration. |
| REP-003 | `MISSING` | Generic report creation stores metadata; it does not create a snapshot-bound asynchronous generation job or durable artifact. | Add asynchronous generation jobs that bind template/version, requesting principal, tenant/entity/incident/time scope, source snapshots and field permissions. Return job ID/state/progress, cancellation/retry eligibility, warnings/partial sources, measured duration/volume, artifact hashes, expiry and signed-download descriptors. Cancellation must stop downstream work. |
| REP-004 | `PARTIAL` | `/api/ha-reports/scheduled` stores extended schedule fields as JSON in a legacy compliance schedule row, derives no tenant or user owner, uses a fixed compliance ID, calculates no next run and `run` merely updates `lastExecutionTime`. | Add a tenant-scoped scheduler with validated cron/cadence, timezone and DST policy, schedule window/priority, concurrency/misfire rule, immutable template version or explicit upgrade policy, run-as service identity, recipient/destination allowlists, output format, retry/backoff/dead-letter, last/next run, delivery health and execution history. Manual run queues the same generation pipeline and is idempotent. |
| REP-005 | `MISSING` | No report review, redaction review, approval, publication or distribution workflow exists. | Add versioned review with section comments, factual/citation checks, redaction preview, explicit approver/separation-of-duties policy, approve/reject reason, publication version and authorized delivery. Delivery cannot broaden the generating principal's field/tenant permissions and must revalidate recipients/destinations at send time. |
| REP-006 | `MISSING` | No typed SITREP, incident-report or after-action schema is exposed. | Define typed schemas: SITREP covers queue/incident/detection/source posture, decisions and actions due; incident report covers scope, evidence-linked timeline, impact, response and validation; after-action covers root cause, control gaps, response metrics, lessons and owned improvement actions. Every narrative assertion links to authorized evidence or is explicitly analyst-authored/inferred. |
| REP-007 | `MISSING` | No canonical artifact preview/download, classification watermark, field-level redaction or retention/legal-hold contract exists. | Add safe HTML preview plus PDF/CSV/JSON artifact descriptors; content-disposition, MIME, size, SHA-256, classification/watermark, redacted/excluded field counts, signed short-lived download and audited access. Apply retention policy, expiry, archive and legal hold without overwriting immutable published versions. |
| REP-008 | `MISSING` | No bounded generation, delivery or approval history is available; legacy application-event logging is not a report audit ledger. | Add cursor-paged immutable report/job/schedule/delivery audit with actor/service identity, tenant/scope, template/artifact versions, state transition, reason, destination class (not secret), trace/request ID and timestamps. Expose aggregate queue, latency, failure, stale-source and delivery-health signals without leaking recipients or report content. |
| REP-009 | `MISSING` | No governed Hive Intelligence report coauthoring contract exists. | Add permission-filtered narrative drafts grounded only in cited report evidence. Return factual versus inferred assertions, citations, uncertainty, missing-source warnings, model/prompt/policy versions and generated/expiry time with prompt-injection defenses. AI cannot change evidence, approve, publish, distribute, expand scope or silently regenerate an approved artifact. |
| REP-010 | `PARTIAL` | Legacy `/ha-reports`, report-section/custom-report and compliance report routes overlap without a designated successor or standard deprecation metadata. | After REP-001–REP-009 successors are deployed, inventory consumers and advertise `Deprecation`, `Sunset` and successor `Link` headers for at least two releases with usage telemetry and removal gates. Do not mark routes deprecated merely because this frontend no longer promotes them. |

Frontend integration recorded **2026-08-21 17:37:57 IST (UTC+05:30)**: consolidated five disconnected routes into one compact reporting lifecycle with generated, scheduled and template views; same-workspace report-type deep links; snapshot/scope/freshness/classification/redaction/approval signals; delivery health and run-as context; dense keyboard-operable tables; explicit context drawer; safe permission, loading, error, partial, empty and legacy-compatibility states; a governed generation setup dialog; sticky lifecycle/status surfaces; and Hive Intelligence boundaries. Fictional records load only in development when `VITE_USE_FOUNDATION_FIXTURES=true`; production uses existing APIs, labels their unproven guarantees and leaves canonical generation/distribution actions disabled.

## Route family: `/admin/pipeline-signals`, `/inputs/sources`, `/admin/data-parsing` — Pipeline and Ingestion Administration

Reconciled: **2026-08-21 18:46:15 IST (UTC+05:30)**

Frontend: `frontend-v3/src/pages/admin/pipeline-operations/`
Existing backend surfaces inspected: `/api/ha-pipeline-signals`, `/api/ha-inputs/sources`, `/api/ha-parsers`, `ha.raw-event.v1`, `hivearmor.raw.events.quarantine`, the reserved retry topic, `SIEM-004` and `SIEM-009` evidence.

This reconciliation preserves the existing live-verified pipeline-signal/soak work, raw envelope, agent spool and quarantine topic. It does not re-register those capabilities as missing. It records the bounded operator contracts that are absent or incomplete above those foundations. Existing routes remain compatibility surfaces and are not deprecated until a deployed successor, consumer telemetry and sunset policy exist.

| ID | Status | Checked-in capability | Required backend contract |
|---|---|---|---|
| ING-001 | `PARTIAL` | `GET /api/ha-inputs/sources` exposes source identity, state, EPS, last event, type and selected host health, but returns an unbounded list without canonical tenant/snapshot/filter/page semantics. | Add a tenant-derived, role-authorized maximum-100 cursor page with deterministic order, same-snapshot totals/facets, stable source ID, source/collector type, lifecycle state, owner/team, authorized scope, health provenance, observed/generated timestamps and RFC 9457 failures. Bind cursors to principal, scope, filters, order and snapshot. |
| ING-002 | `PARTIAL` | `POST /api/ha-inputs/sources` creates an in-memory UUID record and ignores most submitted connector configuration; restart durability, optimistic version, idempotency, audit and canonical creation response are absent. | Add durable versioned draft/activate/pause/retire source lifecycle with validated type-specific configuration, tenant-derived ownership, idempotency key, optimistic version/ETag, `Location`, immutable audit and safe secret references. Activation requires successful authoritative validation; deletion becomes governed retirement when evidence depends on a source. |
| ING-003 | `PARTIAL` | Existing enrolled-agent and signed raw-event work proves part of device identity and revocation, while generic source setup has no unified credential/secret/test lifecycle. | Add source-type-specific identity and secret-reference contracts with create/rotate/revoke/test state, expiry, last validation, connector capability, least-privilege guidance and audit. Secret values are write-only and never returned, logged or embedded in diagnostics. Reuse enrolled-device identity where applicable rather than creating parallel credentials. |
| ING-004 | `PARTIAL` | Source rows expose EPS and last event; `/api/ha-pipeline-signals` exposes aggregate cluster/host-sampler/soak data. Per-source freshness policy, acknowledged lag, bounded queue/backpressure and field-quality evidence are not projected. | Add per-source measured throughput, accepted/rejected/dropped counts, event/ingest/observed timestamps, freshness age versus configured policy, queue depth/age, broker lag, backpressure state, loss/duplicate counters, normalized coverage and partial dependency errors. Every value includes provenance and measurement window; configured thresholds are returned by the server and never invented by the UI. |
| ING-005 | `PARTIAL` | `/api/ha-parsers` provides persisted admin CRUD, but lists are unbounded and parser rows lack authoritative validation, immutable versions, fixtures/samples, deploy state, rollback and runtime execution telemetry. | Add tenant/global-scoped maximum-100 parser inventory and versioned draft/validate/test/approve/deploy/rollback lifecycle. Validation/test use bounded redacted samples and return structured diagnostics, normalized-field diffs, compatibility/schema version, measured duration and no side effects. Deployment and rollback are optimistic, idempotent and audited. |
| ING-006 | `PARTIAL` | Current parser records contain type/configuration and a stored `lastMatchedCount`; no canonical schema-quality or lineage projection proves runtime normalization. | Add bounded field/schema coverage by source/parser/version with matched/unmatched/failed counts, required-field presence, type conflicts, sample window, source-to-normalized lineage, observed/generated timestamps and permission-filtered progressive examples. Stored configuration counters must not be represented as live telemetry. |
| ING-007 | `PARTIAL` | Malformed raw records are written to `hivearmor.raw.events.quarantine` with redacted reason and commit-after-write behavior under `SIEM-004`; no secured operator API groups or pages quarantine/retry failures. | Add tenant-scoped cursor-paged failure groups and progressive items with channel/stage, normalized reason code, first/last seen, affected sources/parsers/versions, count, retry eligibility, provenance and redacted summary. Raw payload access requires separate privilege, field-level redaction and audited just-in-time retrieval. |
| ING-008 | `MISSING` | A retry topic is reserved, but no governed operator preview/confirm API exists for quarantine repair, parser-version replay or bounded retry. | Add preview-then-confirm replay with immutable source snapshot, maximum event/byte/time bounds, target parser/schema version, expected effect, excluded/redacted count, blast-radius/duplicate warning, permission version, reason, approval when policy requires, idempotency key, progress/cancel and immutable audit. Replay preserves original event identity and provenance and cannot bypass normal validation/detection controls. |
| ING-009 | `PARTIAL` | Admin `GET /api/ha-pipeline-signals` and soak history are live-verified for measured OpenSearch/PostgreSQL/host-sampler signals under `SIEM-009`; no complete per-stage topology, capacity budget or dependency-error projection exists. | Extend the measured projection with stable stage/dependency identifiers, in-flight/throughput/failure/latency windows, configured capacity/SLO provenance, partial dependency errors, request/trace ID and bounded historical points. Preserve the explicit distinction between observation, configured policy and derived status; do not infer health from one cluster value. |
| ING-010 | `PARTIAL` | Parser routes are admin-only; source routes allow Admin/Analyst while the frontend route includes Admin/Operator. Three legacy pages now share one workspace but backend role semantics and successor/deprecation policy are not aligned. | Define least-privilege view/onboard/test/activate/parser-admin/replay permissions and enforce the same matrix in route guards and backend methods with tenant tests. After canonical successors deploy, advertise `Deprecation`, `Sunset` and successor `Link` headers for at least two releases with consumer telemetry. Do not mark current endpoints deprecated before that cutover. |

Frontend integration recorded **2026-08-21 18:46:15 IST (UTC+05:30)**: replaced three disconnected pages with one compact source-to-index workspace spanning Flow, Sources, Parsers, Failures and Capacity; added explicit measured/unavailable provenance, partial-source warnings, dense keyboard-operable inventories, progressive context drawers, governed onboarding and replay previews, and shared sticky operational status. Production reads the three existing endpoints with request cancellation and partial-result handling but leaves unsafe source/replay mutations disabled. Fictional source/parser/failure records are dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.

## Route family: `/admin/integrations`, `/admin/notifications`, `/admin/connection-keys`, `/settings/api-keys` — Integration and Notification Operations

Reconciled: **2026-08-22 20:54:37 IST (UTC+05:30)**

Frontend: `frontend-v3/src/pages/admin/integration-operations/`
Existing backend surfaces inspected: `/api/ha-integrations`, `/api/ha-integration-confs`, `/api/ha-notification-rules`, `/api/notification-channels`, `/api/notification-routes`, `/api/notifications`, `/api/ha-connection-keys`, `/api/ha-admin/api-keys`

The checked-in API-key service is the strongest current foundation: it generates server-side tokens, persists bcrypt hashes, returns plaintext once, exposes fixed scopes, computes expiry/revocation state and protects management methods with `ROLE_ADMIN`. The legacy integration resources return persistence entities with no explicit controller guard or runtime-health contract. The notification-rule test is explicitly simulated. The newer notification-channel service can make real email/webhook/provider calls, but its controller has no explicit role guard, returns raw entities containing `configJson`, and dispatches arbitrary URLs with an unconfigured `RestTemplate`; the redesigned production frontend therefore does not call or mutate that unsafe surface.

| ID | Status | Checked-in capability | Required backend contract |
|---|---|---|---|
| INO-001 | `PARTIAL` | `/ha-integrations` provides pageable legacy integration metadata, but returns `UtmIntegration` entities, has no explicit route/method authorization, no tenant/owner/environment/support/version fields and no deterministic bounded frontend envelope. | Add an admin-authorized, tenant-derived maximum-100 cursor-paged connector catalog/configured-instance inventory. Separate catalog definition from configured connection; return stable ID, provider/support, version/update state, capability/direction, environment, owner/team, authorized scope, lifecycle, health evidence, observed/generated timestamps, totals/facets, partial failures and RFC 9457 errors. Bind signed cursors to principal, scope, filters, order and snapshot. |
| INO-002 | `MISMATCH` | Frontend legacy update calls `PUT /ha-integrations/{id}` and test calls `POST /ha-integrations/{id}/test`; checked-in integration resource updates at `PUT /ha-integrations` and exposes no test endpoint. Entity create/update accepts fields that do not match the frontend DTO. | Publish one versioned draft/configure/validate/activate/pause/retire aggregate with narrow DTOs, `Location`, optimistic version/ETag, idempotency and immutable audit. Preserve old routes as compatibility only after consumer inventory; do not mark them deprecated until the successor is deployed and advertises `Deprecation`, `Sunset` and successor `Link`. |
| INO-003 | `PARTIAL` | `/ha-integration-confs` persists `confValue` and returns the persistence entity. No write-only secret classification, vault reference, rotation, expiry or read redaction was found; updating config marks a module restart flag. | Separate endpoint/connection attributes from credentials. Accept secret material write-only into a managed secret store and return only opaque credential aliases plus type, version, expiry, rotation/validation state and permissions. Never return, log or audit raw secret values. Support controlled overlap rotation, immediate revoke and environment/child aliases. |
| INO-004 | `MISSING` | Integration rows expose no authoritative validation, activation or runtime receipt. | Add type-specific bounded dry validation with DNS/TLS/auth/capability/permission checks, redacted diagnostics, measured latency, provider request/receipt ID, observed time and expiry. Activation requires a current successful validation and authorized scope. Runtime health distinguishes configuration, provider reachability, permission, data/activity freshness and partial dependency failures; unknown is not healthy. |
| INO-005 | `PARTIAL` | `/ha-notification-rules` is admin-protected and supports unbounded CRUD, but stores destination configuration in rule JSON and its `/test` always returns a mocked success without dispatch. | Separate reusable destination records from routing policy. Destination DTOs expose channel, safe endpoint label, credential alias, verification and health—not configuration secrets. A test queues a real bounded delivery and returns a job/receipt whose state reaches provider accepted/delivered/failed; a simulated enqueue cannot be success. List endpoints are bounded and tenant-scoped. |
| INO-006 | `PARTIAL` | Notification routes support severity/source/type matches, enablement, one throttle interval and last-fired time. They lack precedence, deduplication, quiet windows, escalation, retry/dead-letter and delivery history. | Add versioned ordered routing with typed source/event/severity/entity/tenant predicates, destination references, dedup key/window, suppression/quiet/maintenance windows, grouping, rate limit, escalation/fallback and dry-run explanation. Evaluation is server-authoritative, deterministic, idempotent and audited. |
| INO-007 | `PARTIAL` | `NotificationChannelService` directly calls email, Slack, generic webhook, Teams and PagerDuty and records only last-test time/result. Failures are logged and a route timestamp is updated; no durable job, retry/dead-letter or delivery receipt ledger exists. | Add durable delivery jobs and attempts with idempotency/dedup key, redacted payload descriptor, destination/version, provider receipt, state transitions, bounded exponential retry+jitter, Retry-After, expiry, dead-letter reason, authorized replay/cancel and cursor-paged immutable history. Expose aggregate success/failure/latency/backlog health without leaking recipient or message content. |
| INO-008 | `REQUIRED` | Generic webhook/Slack/Teams URLs are parsed from returned/stored JSON and invoked through a default `RestTemplate`; no SSRF/egress, redirect, DNS re-resolution, signing, payload or response budget is visible. | Enforce HTTPS and allowlisted provider/tenant egress; deny loopback, private, link-local and metadata destinations after every DNS resolution/redirect; cap redirects, body/response, connect/read time and concurrency; sign generic webhooks with rotatable timestamped secrets; verify configuration ownership; redact diagnostics; and audit target class rather than secrets. Add SSRF/rebinding/redirect/timeout tests. |
| INO-009 | `PARTIAL` | `/ha-admin/api-keys` is admin-protected, uses one-time token return plus bcrypt storage, validates a fixed scope set, exposes expiry/last-use and revokes by timestamp. List is unbounded and keys have no tenant/service identity/owner, rotation, source restriction, per-key rate policy or usage ledger. `/ha-connection-keys` remains a separate user-bound legacy implementation. | Make the hashed API-key service canonical with maximum-100 cursor inventory, tenant/service identity, owner/contact, least-privilege scope discovery, required expiry policy, source/IP or workload constraints where applicable, rate/budget, last-used provenance, anomaly signal, overlap rotation and immutable create/use/rotate/revoke audit. Keep plaintext response one-time and never persist it client-side. Define migration from legacy connection keys before deprecation. |
| INO-010 | `PARTIAL` | Four frontend routes previously exposed disconnected admin CRUDs; backend role protection is inconsistent across integration/config/channel resources and multiple notification/key models overlap without a successor map. | Define least-privilege catalogue/view/configure/secret-admin/test/activate/delivery-replay/key-admin permissions and enforce them in controller and service methods with tenant, field-redaction and cross-role tests. Publish an endpoint ownership/successor map and consumer telemetry. Only then advertise standard deprecation headers for at least two releases; no existing route is marked deprecated by this frontend slice. |

Frontend integration recorded **2026-08-22 20:54:37 IST (UTC+05:30)**: replaced four disconnected CRUD screens with one compact workbench spanning Operations, Connections, Delivery, Service access and Activity; added catalog-to-activation trust-chain guidance, owner/support/environment/credential-alias separation, measured/unknown health states, reusable destination and routing views, delivery-receipt semantics, dense keyboard-operable inventories, progressive full-height context, one-time API-key compatibility, governed setup previews and shared sticky operational status. Production reads only the legacy integration metadata, admin notification rules and hardened API-key list with cancellation and partial-result handling. Unsafe channel/config entity routes and simulated delivery tests are not called. Fictional connector/delivery/activity records are dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.

## Route family: `/admin/users`, `/admin/tenants`, `/admin/sso`, `/admin/scim`, `/mssp/tenants` — Identity, Tenancy and MSSP Administration

Reconciled: **2026-08-22 21:39:31 IST (UTC+05:30)**

Frontend: `frontend-v3/src/pages/admin/identity-administration/`
Existing backend surfaces inspected: `/api/users`, `/api/users/authorities`, `/api/authority`, `/api/ha-tenants`, `/api/ha-mssp/tenants`, `/api/ha-mssp/tenants/{tenantId}/members`, `/api/ha-oidc/providers`, `/api/ha-oidc/enabled-providers`, `/api/ha-oidc/authorize`, `/api/ha-oidc/callback`, `/api/ha-admin/scim/token/**`, `/api/ha-scim/v2/Users`, and `/api/ha-scim/v2/Groups`.

This reconciliation preserves Kiro's checked-in administration, MSSP, OIDC and SCIM capabilities. It records only the missing or mismatched guarantees needed by the new control plane. The protected authority catalogue at `/api/users/authorities` is the frontend's compatibility read. The legacy `/api/authority` CRUD is not a safe successor and is not considered deprecated until it is secured and advertises the standard lifecycle headers.

| ID | Status | Checked-in capability | Required backend contract |
|---|---|---|---|
| IAM-001 | `PARTIAL` | Admin-protected `/api/users` supports pageable list/create/update/delete and `/api/users/authorities` returns authority names. The list filters only by login; the DTO/entity boundary exposes fields that are not an administration projection, update uses the collection route, create collapses expected conflicts into a generic server error, and source/MFA/sign-in/membership/review/version data are absent. | Add a tenant-derived, role-authorized maximum-100 cursor page with deterministic order, same-snapshot totals/facets, stable principal ID, display/email, source, lifecycle state, effective roles/capabilities, tenant memberships, MFA/authentication posture, last sign-in, review state and observed/generated timestamps. Bind cursors to principal/scope/filter/order/snapshot; redact enrollment/authenticator secrets; use optimistic version, idempotency and RFC 9457 errors for mutations. |
| IAM-002 | `MISSING` | No authoritative invitation or joiner/mover/leaver lifecycle exists. Direct user create/update/delete cannot represent expiry, acceptance, suspension, offboarding or downstream revocation. | Add invite preview/create/resend/revoke/accept and JML state transitions with normalized email, tenant/role scope, inviter authority, expiry, idempotency, separation-of-duties checks, downstream provisioning status and immutable audit. Offboarding suspends sessions/tokens and preserves referenced evidence; hard delete is not the default lifecycle action. |
| IAM-003 | `MISMATCH` | `/api/authority` exposes generic CRUD without the class-level `ROLE_ADMIN` guard used by `/api/users`; it projects role names only and has no capability, scope, inheritance, conflict or version model. The new frontend does not call it. | Protect or retire the legacy resource immediately. Add a canonical tenant-aware role/capability catalogue and effective-access preview using the same authorization engine as runtime requests. Create/update/retire require optimistic version, protected built-in roles, conflict/SoD validation, reason and immutable audit. After a successor is deployed, advertise `Deprecation`, `Sunset` and successor `Link` headers and monitor consumers before removal. |
| IAM-004 | `PARTIAL` | Admin-protected `/api/ha-tenants` provides pageable platform tenant CRUD. It does not return authoritative membership/privilege/federation/activity/freshness summaries; direct delete has no dependency preview, governed retirement, optimistic version or audit evidence. | Add a maximum-100 tenant inventory with stable opaque ID, prefix/domain, lifecycle, administration model, owner, region/residency, licence, member/privileged/federation counts, last activity and source freshness. Create/change/retire require derived platform authority, idempotency, optimistic version, dependency/blast-radius preview and immutable audit. |
| IAM-005 | `PARTIAL` | MSSP tenant and membership endpoints are authority-protected for `MSSP_ADMIN` and support membership CRUD, but member listing is unbounded, public numeric identifiers are used, and delegation validity, customer visibility, invitation/review/SoD, optimistic version and audit are absent. | Add cursor-paged delegated tenant/membership inventory with customer tenant boundary, opaque IDs, delegated role/capability/data scope, valid-from/until, source, status, reviewer, customer-visible reason and permission version. Govern invite/change/revoke with preview, SoD, expiry, idempotency and immutable customer/auditor-visible evidence. |
| IAM-006 | `PARTIAL` | Admin OIDC provider CRUD and public enabled-provider/authorize/callback routes exist. Provider metadata does not prove tenant/domain routing, claim/group mapping, configuration test, signing-key/secret rotation state, optimistic version, safe redirect policy or immutable audit. | Add versioned provider drafts with tenant/domain routing, issuer/discovery validation, allowlisted redirect origins, PKCE/state/nonce policy, claim/group mappings to effective roles, requested scopes, key/secret reference and rotation health. Test is side-effect-free and returns structured diagnostics; activation/rollback are audited and idempotent. |
| IAM-007 | `PARTIAL` | SCIM Users/Groups and admin one-time token lifecycle exist, with bearer filtering and a token-status projection. There is no bounded provisioning receipt/failure ledger, tenant/group-to-role mapping version, reconciliation job, token overlap policy or progressive object provenance. | Add tenant-aware SCIM connection/configuration, write-only credential rotation with overlap/expiry, versioned group-role mapping, cursor-paged provisioning receipts/failures, reconciliation preview/job/progress/cancel, retry/dead-letter state and immutable audit. SCIM deactivation must revoke effective access according to policy without destroying evidence. |
| IAM-008 | `MISSING` | No access-review/recertification API, reviewer assignment, recommendation, decision or expiry enforcement is exposed. | Add scheduled and on-demand access reviews for privileged roles, tenant memberships, service identities and dormant accounts. Return scope, owner/reviewers, cadence, due date, item counts, evidence/recommendation, decision/reason, escalation and enforcement result. Use cursor pages, optimistic decisions, SoD, resumable progress and immutable audit. |
| IAM-009 | `MISSING` | No administrative session inventory, risk/step-up state, session revocation, emergency-access activation or post-use review contract exists. | Add principal-bound cursor-paged sessions with device/client/IP/region, issued/last-used/expires, authentication strength, risk, tenant/scope and revocation state. Revoke and break-glass operations require step-up, reason, time-bound scope, approval/exception policy, idempotency, rapid propagation, monitoring and mandatory post-use review. Never return tokens. |
| IAM-010 | `MISSING` | Existing mutation/application logs do not provide one immutable, tenant-aware identity governance ledger or resumable delta stream. | Add a cursor-paged append-only identity/tenant/federation/review/session audit with actor/service identity, authority and tenant scope, target/type, before/after version-safe delta, reason, approval/reference, request/trace ID, result and server timestamp. Provide permission-filtered export/retention/legal hold and resumable authorization-filtered deltas; sensitive values remain redacted. |

Frontend integration recorded **2026-08-22 21:39:31 IST (UTC+05:30)**: replaced the generic user table and tenant placeholder with a compact Identity & Tenancy control plane covering Directory, Tenants, Access reviews, Federation and Audit activity. It provides authority/scope/source/MFA/review/freshness context, keyboard navigation, dense bounded tables, full-height progressive detail, explicit global/delegated/tenant-local administration boundaries, partial-result handling and safe contract-unavailable states. Production reads only the existing protected user, tenant, OIDC and SCIM projections and disables unsupported workflows; fictional review/audit/membership depth is dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.

Verification recorded **2026-08-22 21:55:08 IST (UTC+05:30)**: focused Identity/SSO/SCIM tests passed **16/16**, final TypeScript and zero-warning repository lint passed, the complete frontend suite passed **1,088/1,088 tests**, the production Vite build passed, and authenticated foundation-fixture review covered all five control-plane views, progressive context and governed setup at 1280×720. Browser review corrected the generic primary action so Federation routes to configuration and Audit activity remains read-only. A production-artifact marker scan caught and removed a lazily emitted identity-fixture chunk; the rebuilt artifact contains no identity fixture records while development fixture reload still passes. No backend endpoint was changed or deprecated in code.

## Route family: `/admin/audit`, `/admin/retention`, `/admin/settings`, `/settings/system` — Governance and Platform Settings

Reconciled: **2026-08-23 10:18:14 IST (UTC+05:30)**

Frontend: `frontend-v3/src/pages/admin/governance-operations/`
Existing backend surfaces inspected: `/api/ha-audit-log`, `/api/ha-retention-policies`, `/api/ha-admin/settings`, `/api/ha-admin/settings/general`, `/email`, `/security`, `/ai`, `/ai/test`, and legacy `/api/ha-settings`.

The checked-in backend already provides an Admin-only, offset-paged OpenSearch audit read, Admin-only retention policy CRUD, and a stronger masked aggregate settings resource with section updates and an AI connection test. This reconciliation preserves those Kiro capabilities. It does not treat the generic `v11-backend-logs` projection as integrity-proven evidence, and it does not mark legacy `/api/ha-settings` deprecated before a deployed successor, consumer inventory and lifecycle headers exist.

| ID | Status | Checked-in capability | Required backend contract |
|---|---|---|---|
| GOV-001 | `PARTIAL` | `GET /ha-audit-log` is Admin-only and accepts `page`, `size`, action, user and date filters. It returns a JSON array plus JHipster pagination headers from `v11-backend-logs`; the new frontend correctly consumes the array and caps its initial request at 100. Tenant/effective scope, snapshot, deterministic keyset continuation, same-scope facets and a typed response envelope are absent. | Add a tenant-derived, permission-filtered maximum-100 cursor page with stable order `(occurredAt,id)`, signed principal/scope/filter/order/snapshot-bound cursors, exact-or-qualified totals/facets, source coverage, generated/observed timestamps and RFC 9457 errors. Keep the list projection bounded and load payload/diff progressively. |
| GOV-002 | `PARTIAL` | Audit maps `actor`, `actionType`, resource, detail, IP and optional payload. Missing IDs can fall back to a generated value and missing timestamps to the request time; result, authority, tenant, request/trace/correlation, before/after version, reason and integrity chain are not authoritative. | Persist a server-generated immutable event ID and timestamp at the source transaction. Return actor/service identity, effective authority and tenant scope, category/action, target/type, redacted version-safe delta, reason/approval, request/trace/correlation ID, source, result and integrity checkpoint/proof reference. Never synthesize provenance during a read. |
| GOV-003 | `MISSING` | No single-event detail, authorized delta stream, asynchronous evidence export, export manifest/signature, retention/legal-hold context or integrity-verification endpoint was found. | Add progressive detail, resumable authorization-filtered deltas and an async export job with bounded filters, stable snapshot, format, field/redaction policy, manifest, digest/signature, row count, expiry and authorization recheck on download. Support independently verifiable integrity checkpoints and explicit unavailable proof state. |
| GOV-004 | `PARTIAL` | Admin-only `/ha-retention-policies` lists all policies and supports read/create/update/delete over a DTO containing name, data type, days, compression, archive target/path and `sourceImmutable`. The inventory is unbounded and does not report tenant/scope, effective index bindings, storage phase, enforcement status, volume or source coverage. | Add a maximum-100 tenant/scope-aware inventory with stable ID/version, data classification, index/data-source bindings, searchable/archive/delete phases, legal-hold precedence, current effective state, measured volume/cost estimate, owner, last decision/application, freshness and partial-source state. |
| GOV-005 | `MISMATCH` | The former retention page sent only `{retentionDays}` although the backend requires name, data type and retention days. Current create/update/delete applies immediately without optimistic version, idempotency, validation preview, approval, scheduled rollout, per-index receipts, rollback or immutable decision evidence. The redesigned frontend makes no retention mutation call. | Replace direct mutation with versioned draft/preview/submit/approve/schedule/apply/verify/rollback contracts. Require base version/ETag, reason, impact and role; preview affected indices/tenants, projected searchable/archive/delete volume and irreversible consequences; expose per-target receipts and safe retry/idempotency. |
| GOV-006 | `MISSING` | `sourceImmutable` is metadata on a policy, not a legal-hold or exception lifecycle. No hold inventory, custodian, preservation scope, authority, reason, expiry/review, conflict evaluation or release evidence exists. | Add authorized legal-hold/retention-exception inventory and governed create/change/release. A valid hold deterministically overrides expiry/deletion, is visible in policy preview and execution receipts, preserves reason/custodian/reference/effective window, requires periodic review and produces immutable audit evidence. |
| GOV-007 | `PARTIAL` | `/ha-admin/settings` is Admin-only, returns General/Email/Security/AI sections, masks stored secrets, updates sections and can test AI connectivity. It does not return aggregate/section version, effective-source provenance, apply/restart state, target scope, drift, approval, rollout or rollback. Read is limited to Admin even where a safe operational projection may be useful. | Return secret-safe effective configuration with schema, version/ETag, source layer, scope, last approved/applied version, target/application receipts, restart requirement, drift and freshness. Define separate least-privilege view/propose/secret-admin/approve/apply permissions. Secret values remain write-only aliases and are never returned in diffs, logs or audit. |
| GOV-008 | `MISMATCH` | Legacy `/ha-settings` exposes generic configuration-row reads and bulk writes while `/ha-admin/settings` exposes the stronger typed masked aggregate. Ownership, consumers and migration state are not published. Neither surface currently advertises standard deprecation metadata. | Declare `/ha-admin/settings` or a versioned successor canonical only after capability parity and consumer telemetry. Publish owner/successor/removal gate, migrate every consumer, then advertise `Deprecation`, `Sunset` and successor `Link` headers for the documented compatibility window. Keep unsafe legacy secret/config rows out of new clients. |
| GOV-009 | `MISSING` | No platform-wide configuration change-request, diff, validation, blast-radius, approval, separation-of-duties, maintenance-window, staged rollout, cancel, rollback or verification ledger was found. | Add versioned change drafts with typed normalized secret-safe diffs, reason, base version, validation and dependency/blast-radius preview; policy-driven approval and SoD; scheduled/canary rollout with per-instance receipts; cancel boundaries, verified rollback and immutable actor/decision/result audit. Hive Intelligence may draft/explain only and cannot approve or execute. |
| GOV-010 | `PARTIAL` | Deprecation filters appear on selected responses, but no governed API lifecycle inventory with owner, consumers, successor, migration evidence, sunset/removal gate or exception exists. Licence, migration and system-health administration remain fragmented and are not represented by one safe platform projection. | Add an Admin/Auditor API lifecycle registry plus read-safe platform metadata: route/version/owner, caller telemetry without secrets, successor and migration %, deprecation/sunset/removal gate/exception, licence entitlement/expiry without licence material, database/schema migration state, dependency health and generated/observed timestamps. Lifecycle changes use GOV-009 governance and cannot be inferred from frontend non-use. |

Frontend integration recorded **2026-08-23 10:18:14 IST (UTC+05:30)**: replaced the disconnected audit, retention and partial settings screens with one compact control plane spanning Audit ledger, Retention, Configuration, Change control and API lifecycle. Added dense keyboard navigation, bounded initial projections, cancellation, partial-result handling, progressive full-height evidence context, secret-safe effective configuration, explicit integrity/authority limits and disabled governed-workflow previews. Production reads only `/ha-audit-log`, `/ha-retention-policies` and `/ha-admin/settings`; unsupported change, legal-hold, export and lifecycle workflows remain unavailable. Fictional depth is dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`. No backend endpoint was added, implemented or marked deprecated in code.

## Threat intelligence operations (`/intelligence`, `/admin/threat-intel`)

Reconciled **2026-08-25 08:29:20 IST (UTC+05:30)** against secured `HaThreatIntelResource`, `HaThreatIntelStatsResource`, `HaTaxiiFeedResource`, `HaMispFeedResource`, and the unused legacy `ThreatIntelResource` under `/api/v1/threat-intel`. Chosen as the first orphan-operational family after route inventory (`docs/ai-handoff/research/orphan-operational-workflows-inventory.md`). Not `PRODUCTION READY`.

| ID | Status | Existing capability | Remaining requirement |
|---|---|---|---|
| TI-001 | `PARTIAL` | Frontend hub reads feeds/IOCs/lookup; Admin-gated feed enable/sync; this slice aligns SOC Manager with AuthGuard and wires `GET /ha-threat-intel/stats` on `/intelligence`. | Cursor/snapshot/freshness on IOC browse, cancellable lookup budgets, progressive indicator detail, hunt/alert pivots, and measured sync receipts remain incomplete. |
| TI-002 | `PARTIAL` | Feed list/get authorize Admin|User; lookup/IOC browse authorize Admin|User|Analyst|SOC Manager; feed mutate/sync authorize Admin only. | Make read authorities explicit for Analyst/SOC Manager without relying on ROLE_USER co-assignment; keep mutations Admin-only with immutable audit. |
| TI-003 | `MISSING` | Legacy `/api/v1/threat-intel` exposes feed list/toggle/sync and IOC GET without `@PreAuthorize` on the inspected controller. Frontend-v3 does not call it. | Deploy a secured successor (or harden in place), migrate consumers, then advertise `Deprecation`/`Sunset`/successor `Link`. Do not mark deprecated from frontend non-use alone. |
| TI-004 | `PARTIAL` | Admin TAXII/MISP CRUD + sync and stats tiles exist on `/admin/threat-intel`. | Sync job receipts, credential write-only aliases, tenant scope, TLP/marking enforcement evidence, and governed source onboarding remain incomplete. |

Frontend integration recorded **2026-08-25 08:29:20 IST (UTC+05:30)**: honesty fix on `/intelligence` (role alignment, stats read, non-admin mutation withholding with explicit copy) and Admin access-denied human role label. No backend endpoint was added, implemented or marked deprecated in code. Legacy `/api/v1/threat-intel` remains unused by frontend-v3.

## Cross-cutting detection-ingestion acceptance

### DET-ING-001 — Raw telemetry must prove alert generation

Status: `VERIFIED`  
Recorded and live-verified: **2026-08-13 13:55:37 IST (UTC+05:30)**  
Consumers: collectors, event processor, detection rules, OpenSearch event/alert projections, `/api/ha-alerts/{id}`, and `/alerts/:id`

Detection acceptance must start with a bounded raw source record and pass through normalization and the processing engine. Direct writes to `v3-hive-log-*`, `v3-hive-alert-*`, or derived entity/finding indices are dataset hydration only and cannot establish collector, parser, rule or alert-writer correctness. The local acceptance boundary is authenticated and fails closed without its injection key; production collector transports remain the authoritative ingress.

Implemented proof: a synthetic raw Windows PowerShell ETW Script Block record is submitted to the processor; the endpoint normalizer preserves the original payload and produces canonical host/process/action/severity plus `log.scriptBlock`; CEL evaluates the checked-in local-only T1059.001 rule; the writer persists both the normalized event and the engine-generated alert; and the authenticated backend projects the alert with canonical ATT&CK, data-source and source-event association. The strict test verifies IDs returned by the engine, then independently reads those same IDs from OpenSearch. Historical producer aliases (`technique`, `dataSource`, `eventIds`) are normalized at the API boundary while new alerts publish `mitreTechniqueId`, `mitreTechniqueName`, `dataSources`, and `sourceEventIds` directly.

Remaining production work: replace the local injection boundary in collector acceptance with protocol-specific raw ingress suites for Syslog, CEF/LEEF, Windows events, cloud audit and endpoint telemetry; assert tenant isolation, redaction and source authenticity; add dead-letter/retry/duplicate/replay and back-pressure cases; add measured throughput/latency gates; and ensure all rule packs compile at startup with a reported invalid-rule inventory. `origin.pid` and other normalized side attributes not represented by the current `plugins.Side` schema remain a separately tracked producer-schema limitation and must not be inferred from missing data.

## Production-minimum SIEM pilot foundation

Recorded: **2026-08-14 11:26:51 IST (UTC+05:30)**  
Consumers: installer, release pipeline, Windows/Linux agents, agent-manager, inputs plugin, Redpanda, event processor, OpenSearch, backend operational APIs and `frontend-v3`  
Implementation plan: `docs/ai-handoff/production-minimum-backend-plan.md`  
Execution ledger: `docs/ai-handoff/backend-implementation-ledger.md`

This reconciliation does not reopen Kiro's completed route work or the live raw-injection proofs under `DET-ING-001` and `DET-ING-002`. It records the missing cross-service guarantees required before a real-agent, single-node test-server pilot can be considered installable. A development compose success, controller presence or injected raw event is not sufficient evidence for these contracts.

| ID | Status | Checked-in capability | Required backend/deployment contract |
|---|---|---|---|
| SIEM-001 | `PARTIAL` | A local composition runs PostgreSQL, OpenSearch, agent-manager, backend, event-processor manager/worker and Redpanda, and raw Kafka processing is present. The active local/CI frontend remains `frontend-v2`; the legacy installer does not express the current broker-backed topology and floats database/search images. | Publish one versioned canonical single-node pilot topology and ownership map covering exact images/digests, ports, networks, volumes, health/readiness, dependencies, schemas/topics and supported upgrade edges. Package `frontend-v3`. Development, acceptance and pilot profiles are separate. Mark superseded frontend-v2 deployment and direct non-broker production-ingress surfaces through the standard dated deprecation/sunset mechanism before removal. |
| SIEM-002 | `PARTIAL` | At **2026-08-14 14:01:07 IST**, Admin/SOC Manager REST and internal gRPC contracts created/listed/revoked tenant-bound enrollment tokens and rotated/revoked device credentials; hash-only verifier/credential persistence, atomic consumption, opaque agent UUID, protected file/stdin bootstrap and default-disabled shared-key compatibility were implemented. At **2026-08-14 14:26:49 IST**, the token pre-hash became URL-safe Base64 before bcrypt; manager-authoritative lifetime/platform/input bounds and the explicit Spring route rule were added. At **2026-08-18 12:30:06 IST**, token create/consume/revoke and credential rotate/revoke gained allowlisted same-transaction audit events; a PostgreSQL trigger rejects audit update/delete; credential changes require reason; and internal gRPC plus tenant-derived Admin/SOC Manager REST expose a deterministic, maximum-100-row safe audit page with optional token UUID, agent UUID and event-type filters. At **2026-08-18 13:11:42 IST**, local device credentials gained an authenticated owner-only atomic v2 envelope and protected validate-before-save rotation; authenticated updates stopped echoing credentials; authorized post-revocation same-device re-enrollment was implemented; and the live manager lifecycle proved rotation, revoked-key denial, replacement identity/reconnect and audit evidence. At **2026-08-18 13:37:18 IST**, enrollment and tenant-filter rejection paths gained stable RFC problem status/detail without `/error` redispatch or duplicate extensions; the live admin REST matrix passed platform canonicalization, 24-hour expiry, page/size and missing/invalid/unknown/unauthenticated tenant behavior. Full/race/vet Go checks, focused Java tests and Linux/Windows amd64/arm64 cross-build/package inspection pass. Actual Windows SCM installation and compatibility removal remain incomplete. At **2026-08-19 20:00:00 IST**, Linux packaged-host Admin/SOC Manager/Analyst and unauthorized-tenant HTTP matrix passed on staging. | Install and exercise the generated packages under supported Windows Service Control Manager and Linux systemd, then pass the authenticated role/cross-tenant matrix from the packaged host. Verify service permissions and absence of bootstrap/device secrets from logs, arguments and diagnostics. Reconcile the recorded repository-wide Java baseline. Define audit retention, privileged read monitoring, backup/export/WORM policy under `SIEM-009`. Define migration telemetry and sunset for legacy plaintext rows plus the opt-in shared-key flag. Complete platform keystore/device mTLS work in `SIEM-007`; do not call this production ready until these gates pass. |
| SIEM-003 | `PARTIAL` | At **2026-08-18 16:16:32 IST**, inputs no longer assign a hard-coded default tenant and no longer synchronize plaintext keys through a 100,000-row list. Agent-manager verifies presented connector secrets, returns tenant-bound identity without echoing the secret, and exposes a maximum-100-row secret-free authorization projection. Ingress rejects missing, conflicting, revoked and unbound identity; gRPC/HTTP/OTLP messages are capped at 4 MiB; per-connector/tenant rate and connection limits emit Retry-After; new `ha.raw-event.v1` records require connector identity and are keyed `tenantId:connectorId`. Focused Go tests pass. Collectors have no tenant field and fail closed. Connection-key HTTP, GitHub HMAC, OTLP and cloud plugins (`aws`, `azure`, `gcp`, `sophos`, `crowdstrike`) still cannot bind a verified tenant. Live ingest/forged-tenant/size/rate acceptance and device mTLS were not executed. At **2026-08-18 16:59:20 IST**, `PILOT-02` closed as `CODE COMPLETE` for the implemented identity/rate/size gateway; live replay against rebuilt images, collector tenant binding, cloud-plugin identity and device mTLS remain open. At **2026-08-18 19:55:01 IST**, live enrolled ProcessLog identity, forged-tenant denial, oversized rejection, burst retry-after, revoked-credential denial and secret-free worker logs passed against rebuilt local-dev images; OpenSearch counted the accepted event id. Collector tenant binding, cloud-plugin identity and device mTLS remain open. | Complete live identity, forged-tenant, revoked, oversized-payload and rate-limit acceptance against running services. Bind collector and remaining cloud-plugin producers to verified tenant identity. Replace the compatibility API-secret path with locally verifiable certificate/claim identity under `SIEM-007`. Do not call this production ready until those gates pass. |
| SIEM-004 | `PARTIAL` | At **2026-08-18 16:59:20 IST**, endpoint collectors persist to SQLite before the send queue; unprocessed rows are not deleted to reclaim quota; default retention is 512 MB; Kafka publish retries with backoff and does not fall back to the engine socket; malformed records publish to `hivearmor.raw.events.quarantine` with a redacted reason and the original offset commits only after that write; raw/quarantine/retry topics pin `max.message.bytes=4194304`. Focused Go tests pass. `hivearmor-collector` and `as400` still drop on full memory queues. Encrypted spool contents, a write-failure retry budget, typed receipts and live restart/outage proof remain open. At **2026-08-18 19:55:01 IST**, live unsupported-schema quarantine and worker/eventprocessor restart retention passed after removing Message.Topic from quarantine publishes. Broker outage, agent-process spool, collector drop-on-full and encrypted spool remain open. | Every supported collector durably spools before send under a bounded quota and visible pressure policy. Complete typed receipts, agent-bound ordering, consistent limits, exponential retry with jitter, poison-record quarantine, bounded replay with authorization/provenance, lag/queue health, removal of the direct socket production fallback, and zero-acknowledged-loss outage tests. |
| SIEM-005 | `PARTIAL` | At **2026-08-18 20:40:00 IST**, Kafka and the engine socket analyze then `PersistRequired` (sync event + each required alert) before offset/ack. Duplicate async+sync event write is removed from the commit path. Alert writer returns classified HTTP errors. Alert IDs are deterministic per event+rule. Crash-point fake-store tests pass. Optional offense/compliance/sequence run only after persist. Live detect-to-alert on a staging VM was not executed. | Live-verify crash/retry against running OpenSearch and Kafka; keep optional enrichments partial. Do not call this production ready. |
| SIEM-006 | `PARTIAL` | At **2026-08-18 20:40:00 IST**, `event-processor/builtin-rules/pilot/` ships CEL rules `PILOT-WIN-PS-ENCODED`, `PILOT-WIN-FAILED-LOGON`, `PILOT-LIN-AUTH-FAIL` with positive/negative unit tests and `docs/ai-handoff/pilot-telemetry-matrix.md`. Invalid YAML is skipped; health is `degraded` when the pack is missing from a rules tree that includes `pilot/`. Real enrolled-agent IDs through UI were not executed. | Live-verify exact enrolled-agent source IDs through event, alert, API and UI. `DET-ING-001` remains a lab control. |
| SIEM-007 | `PARTIAL` | At **2026-08-18 20:40:00 IST**, event-processor OpenSearch HTTP clients and `sdk/os.Connect` verify TLS (`OPENSEARCH_CA_CERT`, no production `InsecureSkipVerify` in those writers). `HA_PROFILE=staging|production` rejects lab default secrets and disables `/v1/inject`. Agent/input gRPC TLS, hash-only enrollment, and signing fail-closed behavior from earlier slices remain. Device mTLS, non-root images, SBOM and scan gates remain open. Agents may still set skip-verify on some paths. | Require CA and hostname verification for remaining agent paths, use device mTLS where designed, run containers non-root, pin images, generate SBOMs and pass vulnerability/secret/signature/provenance gates. |
| SIEM-008 | `PARTIAL` | At **2026-08-18 20:40:00 IST**, `frontend-v3/Dockerfile` plus `deploy/staging/docker-compose.yml` publish only 443, 50051 and 9000; data ports stay private; inject is off; manager-only Kafka `KAFKA_WORKERS=1`. At **2026-08-19 18:45:08 IST**, staging also publishes **9001** for agent `version.json` download. Clean VM install/upgrade/rollback remains incomplete. | Prove clean-server install and upgrade on the reference VM. Keep `local-dev` lab-only. |
| SIEM-009 | `PARTIAL` | Individual services expose some health/metrics and OpenSearch volumes exist. At **2026-08-21 15:00:00 IST**, Admin `GET /api/ha-pipeline-signals` + `/admin/pipeline-signals` board live-verified (measured OS/PG + host soak lag; no invented thresholds); hourly soak timer enabled. Prior: enrollment-audit export, throwaway restore, named Redpanda volume, off-volume copy, ISM 14d. New-VM restore deferred post-PR. No WORM. | Complete 24h soak evidence pack; WORM/object-store copy; new-VM restore after production-ready. |
| SIEM-010 | `PARTIAL` | Raw injection and selected live API/UI paths have passed. At **2026-08-18 13:11:42 IST**, Linux/Windows amd64/arm64 agent and updater cross-builds, deterministic package assembly, embedded/external checksums, build-provenance publication and fail-closed production signing policy were implemented; full/race/vet checks and local archive inspection passed. No production-shaped release gate yet combines real-OS service installation, actual signatures, tenancy/revocation, outage/replay, load/soak, backup/restore and fixture/test isolation. | Complete the pilot acceptance gate: actual signed Windows/Linux artifacts installed as services, Go/Java/frontend/Compose checks, image/dependency/secret/SBOM/signature/provenance scans, API authorization/tenant tests, authentic raw positive and negative scenarios, restart/outage/replay, 24-hour soak, backup/restore, upgrade/rollback and proof that fixtures and `/v1/inject` are absent/disabled. Publish an evidence manifest and known limitations before tagging. |

## Integration acceptance gates

1. OpenAPI matches the route, method, request, response, and error behavior documented here.
2. Backend integration tests prove tenant isolation and role enforcement for every endpoint.
3. Mutation tests cover stale versions, duplicate idempotency keys, unsupported targets, partial failure, and approval expiry.
4. Frontend MSW/contract fixtures are generated from the same schemas, not handwritten independently.
5. Core alert/incident headers render before optional panels and remain usable when any optional endpoint fails.
6. Cursor endpoints enforce maximum limits and deterministic sort keys.
7. Raw event, command line, notes, and intel fields pass field-level security and data-classification review.
8. SSE reconnects without duplicates and recovers from version gaps through refetch.
9. No production build imports or returns the visual foundation fixture modules.
10. Empty, unavailable, redacted, stale, and permission-denied states are distinct in both API and UI.

## Append-only change log

| Date | Routes added or revised | Summary |
|---|---|---|
| 2026-08-02 | `/incidents/:id`, `/alerts/:id` | Established cumulative register; backfilled Incident Workbench gaps; added complete Alert Investigation summary, story, process, network, IOC, graph, related-alert, history, guide, response, raw-event, streaming, and sandbox requirements. |
| 2026-08-02 | `/alerts` | Added the Alert Triage Queue contract audit plus canonical list, facets, saved views, assignment, bulk lifecycle, resumable streaming, lightweight drawer, and suppression-preview requirements. |
| 2026-08-02 | `/alerts` | Revised query grammar for autocomplete and Boolean `AND`/`OR` semantics; added missing mutation-authorization audit `ALT-LV07` and permission-aware single-alert quick actions under `ALT-022`. |
| 2026-08-02 | `/alerts/board` | Replaced the legacy summary-plus-five-lists assumption with the single, bounded, tenant-authorized Severity Board projection `ALT-023`; documented snapshot reconciliation, symbolic states, deterministic lane ordering, and performance limits. |
| 2026-08-02 | `/correlated-findings`, `/correlated-findings/:id` | Replaced the legacy offense grid/raw-map assumptions with bounded explainable attack-story projections `COR-001` through `COR-006`; documented evidence pagination, lifecycle authorization, previewed incident promotion, and resumable correlation updates. |
| 2026-08-03 | `/search` | Audited the conflicting NL translation, timeline, raw Elasticsearch, schema, saved-query, and hunt-to-incident paths; added canonical bounded/cancellable hunt execution, authorized schema, progressive event detail, unified Search Manager, signed pivots, previewed evidence/investigation/incident actions, and resumable progress contracts `HNT-001` through `HNT-008`. |
| 2026-08-03 | `/search` | Clarified `HNT-001` cursor semantics for bounded active/adjacent page caching and deterministic back/forward analyst navigation without offset queries or snapshot restarts. |
| 2026-08-03 | `/search` | Expanded `HNT-003` with snapshot-bound, searchable, cursor-paginated top-value counts and safe include/exclude fragments; added language capability discovery, validated execution, and tabular-result safeguards under `HNT-009`. |
| 2026-08-03 | `/search` | Clarified the blank-editor behavior under `HNT-001`: the frontend emits explicit bounded `*:*`, loads the newest 100 projected events for the selected scope, and continues only through opaque cursors; empty server queries remain invalid. |
| 2026-08-03 | `/entities` | Audited the offset-only entity controller and role/type/filter mismatches; added the bounded snapshot inventory, summary/facets, progressive preview, authorized hunt/dossier pivots, and resumable risk/freshness contracts `ENT-001` through `ENT-005`. |
| 2026-08-03 | `/entities/:id` | Audited the blocking enriched detail, bounded-but-array alert/event lookups, incomplete relationship aggregation, and direct incident link; added progressive explainable dossier, activity/event detail, alert cursor, evidence-backed relationship, and previewed incident-link contracts `ENT-006` through `ENT-010`. |
| 2026-08-03 | `/constellation` | Added unified snapshot-bound graph exploration, cursor expansion, relationship evidence, canonical entity pivots, and freshness/partial-state contracts (`CON-001`–`CON-005`); audited the existing split OpenSearch aggregation endpoints. |
| 2026-08-03 | `/detection-rules` | Audited the correlation-rule DTO/mutation/Sigma/test mismatches plus the partial single-event Sigma evaluator; added bounded rule inventory/summary, execution monitoring, gap repair, previewed lifecycle and bulk actions, authoritative validation/history preview, safe Sigma/Detection-as-Code updates, resumable health, snapshot-bound ATT&CK coverage, and canonical draft/publish authoring contracts (`DET-008`–`DET-016`). |
| 2026-08-03 | `/response`, `/ha-playbooks`, `/ha-action-catalog` | Phase 7 response automation audit: documented GAP-SEC-08 (SoarResource no @PreAuthorize), dual service layer conflict (/soar/ vs /ha-playbooks/), missing preview/confirm/execute pattern, missing approval workflow, missing action catalog API, missing quarantine endpoint, missing cursor pagination on activity log; added RESP-001 through RESP-012. |
| 2026-08-09 12:10:59 IST (UTC+05:30) | `/response/playbooks/new`, `/response/playbooks/:id/edit` | Audited the newly redesigned low-code SOAR builder against the current secured linear playbook and response-action APIs; added timestamped canonical graph drafts, typed connector catalog, authoritative validation/compile preview, side-effect-free simulation/debugger, governed immutable publish/activation/rollback, and bounded execution/version/audit contracts (`RESP-013`–`RESP-018`). |
| 2026-08-09 12:29:44 IST (UTC+05:30) | `/response/playbooks/new`, `/response/playbooks/:id/edit` | Added the new governed Hive Intelligence coauthoring contract (`RESP-019`) after verifying Kiro's existing generic AI chat, triage, incident-summary, SOC query, and alert-enrichment endpoints; requires permission-filtered structured graph patches, explicit analyst disposition, provenance, redaction, prompt-injection controls, and deterministic validation/approval gates. |
| 2026-08-09 13:17:42 IST (UTC+05:30) | `/response/playbooks`, `/response/playbooks/new`, `/response/playbooks/:id`, `/response/playbooks/:id/edit`, `/response/activity` | Consolidated the advanced Playbook lifecycle on the canonical routes; expanded `RESP-013` for bounded parallel joins, version-pinned sub-playbooks, typed transforms, deterministic fallback/compensation semantics, and renamed the governed AI surface to Hive Intelligence. This is a timestamped refinement of the new builder contract and does not reopen Kiro's implemented legacy response or generic AI endpoints. |
| 2026-08-09 14:40:07 IST (UTC+05:30) | `/response/activity` | Audited the empty and three-state legacy activity UI against the checked-in backend and redesigned it as a bounded execution-control ledger. Refined `RESP-018` with the missing global tenant-scoped inventory and summary, complete lifecycle, bidirectional cursor/snapshot semantics, redacted progressive traces, resumable active-run updates, connector and approval state, audit correlation, and asynchronous export contract. No Kiro-implemented legacy response endpoint was reopened. |
| 2026-08-11 22:19:17 IST (UTC+05:30) | `/response/activity` | Migrated the frontend consumer from the provisional missing `/ha-playbooks/activity` request to the previously registered `RESP-018` canonical `/ha-playbooks/executions`, `/executions/summary`, and progressive `/executions/{executionId}/trace` contracts. The browser no longer infers global health from one loaded page or bundles full node traces into the list request. This is a timestamped frontend reconciliation only; `RESP-018` remains `MISSING` until the backend implements and verifies those endpoints. |
| 2026-08-12 10:52:32 IST (UTC+05:30) | `/response/library`, `/api/response/actions`, `/api/ha-response-actions/library` | Replaced the legacy card gallery with a bounded, keyboard-operable governed action-and-connector catalog and full-height schema/governance inspector. Migrated production reads to Kiro's stronger `/response/actions` catalog, added request cancellation and development-only dynamic fixtures, represented absent metadata honestly, and prevented direct catalog execution by routing additions into versioned playbook authoring. Reconciled `RESP-014` against the checked-in registry and marked the older `/ha-response-actions/library` compatibility endpoint deprecated with `/response/actions` as successor; the canonical paged connector-instance and typed-schema contract remains required. |
| 2026-08-12 11:24:03 IST (UTC+05:30) | `/posture/identities`, `/api/ha-entities*`, `/api/ha-entities-legacy*` | Replaced the generic user table with a bounded Identity Security posture workflow and reconciled it against Kiro's canonical entity inventory/summary/preview implementation. Added only the missing identity-specific risk, authentication/control, effective-access, timeline, governed Hive Intelligence, remediation, streaming and export contracts (`IDP-001`–`IDP-008`). Production preserves unsupported values as unknown; development-only fictional posture remains behind the explicit foundation fixture flag. Registered the already separated legacy entity controller family for standard deprecation/sunset/successor headers. |
| 2026-08-12 12:06:24 IST (UTC+05:30) | `/posture/active-directory`, proposed `/api/ha-ad/*` | Replaced the role-gated coming-soon placeholder and empty service stubs with an enterprise domain-security workspace covering posture assessments, domains/trusts, privileged changes, infrastructure/sensor/replication health, Tier‑0 exposure, evidence and governed response preview. Recorded the entirely new backend boundary as `ADP-001`–`ADP-008`; production displays an explicit integration-required state and never interprets missing AD data as healthy. Development fixtures remain dynamically isolated behind the foundation flag. |
| 2026-08-12 13:53:03 IST (UTC+05:30) | `/posture/exposure`, proposed `/api/ha-exposure/*` | Replaced the graph-model decision placeholder with the resolved entry-to-impact Exposure Management workflow. Recorded the new authoritative summary, attack-path, evidence, choke-point, critical-asset, remediation-impact, governed response, Hive Intelligence, streaming/exception/export requirements as `EXP-001`–`EXP-009`. Existing canonical asset/entity capabilities remain acknowledged inputs; production shows integration required until a graph service proves exposure. |
| 2026-08-09 15:06:06 IST (UTC+05:30) | `/response/authority` | Replaced the unrelated application-role CRUD concept with the Phase 7 response-governance workflow. Added `RESP-020` only for capabilities absent from Kiro's current secured response-action/playbook endpoints: bounded approval inventory and summary, blast-radius evidence, multi-level human decisions with optimistic state, separation of duties, change windows, versioned policy/delegation preview, emergency authority, resumable updates and immutable audit. Existing generic role administration and implemented response execution controls were acknowledged and not reopened. |
| 2026-08-09 15:35:52 IST (UTC+05:30) | `/response/authority/policies/new`, `/response/authority/policies/:id/edit`, `/response/authority/delegations/new`, `/response/authority/delegations/:id/edit` | Refined `RESP-020` for the newly added governed editors: single-record reads, create/update, optimistic versions, mandatory audit rationale, draft versus publish intent, deterministic validation, scope-escalation denial, and immutable audit results. This refinement covers only the still-missing governance service and does not reopen Kiro's implemented response execution endpoints. |
| 2026-08-09 21:51:15 IST (UTC+05:30) | `/response/quarantine`, `/edr/quarantine` | Added `RESP-021` after verifying Kiro's secured paged file-quarantine list and single/bulk restore/delete endpoints. Recorded only the remaining gaps: enriched evidence and summaries, cursor/snapshot/freshness semantics, a secured canonical endpoint-isolation inventory, action history, governed preview/approval/idempotency for restore/delete/release, resumable delivery state, and consistent SOC-manager authorization. The duplicate unsecured legacy `/edr/*` controller is not adopted. |
| 2026-08-10 11:31:45 IST (UTC+05:30) | `/posture/assets` | Audited the existing paged network-discovery endpoints and unbounded `/ha-clients` persistence projection before redesign. Added only the missing secure canonical asset inventory/summary/facets, progressive evidence-backed detail, governed classification, resumable deltas, and snapshot-bound export contracts (`AST-001`–`AST-004`). Existing legacy discovery, group/type, and new-asset count capabilities are acknowledged; the browser does not wire unsafe mutations or rely on client-side stripping of credential/licence fields as the server security boundary. |
| 2026-08-10 13:08:01 IST (UTC+05:30) | `/search`, `/api/ha-hunts/*` | Reconciled Kiro's Search & Hunt scaffolding against `HNT-001`–`HNT-009`; implemented typed allowlisted query execution, PIT/search-after pagination, signed scope-bound cursors, bounded projections, snapshot-bound field values and event detail, principal-bound status/SSE/cancel access, truthful query capabilities and structured problem responses. Added a per-contract implementation ledger with remaining tenant, FLS, asynchronous cancellation, governance and integration-test work explicitly retained as partial. |
| 2026-08-10 13:25:39 IST (UTC+05:30) | `/posture/assets`, `/api/ha-assets*` | Implemented the first canonical Asset Intelligence backend slice over Kiro's existing discovery repository: an explicitly authorized credential-free projection, bounded filters and same-scope summary, signed principal/tenant/filter/snapshot-bound keyset cursors, progressive safe detail and source coverage, RFC 9457 errors, and frontend cursor/detail integration. Recorded unimplemented facets, authoritative enrichment, governed edits, streaming and export under `AST-001`–`AST-004` without reopening legacy endpoints. |
| 2026-08-10 14:47:45 IST (UTC+05:30) | `/login`, `/dashboard`, `/search`, `/posture/assets`, local Docker delivery | Ran the fixture-disabled frontend against the real Docker backend, PostgreSQL and OpenSearch. Recorded and fixed dev CORS/bootstrap, stale-token public-auth, Search canonical projection, cursor identity, structured error precedence, asset ordering and backend WAR-path issues; live-verified authentication, bounded blank search, 5,623 historical hits, second cursor page and the safe real asset projection. Added `INT-001` for the newly observed missing Mission Control health route and retained all tenant/FLS/governance/enrichment gaps as partial. |
| 2026-08-10 15:29:49 IST (UTC+05:30) | `/alerts`, shared masthead, `/api/ha-alerts*`, `/api/ha-operational-health` | Live-verified the fixture-disabled Alert Triage queue against Docker/OpenSearch; reconciled the active queue and summary at 399 records, corrected canonical status semantics, replaced mapping-sensitive status/severity aggregations, normalized nested rule/ATT&CK/entity producer data, fixed future-relative time and virtual-row identity, and implemented the redacted operational-health projection. Marked ALT-014/ALT-015/ALT-020 and INT-001 by actual implementation state; added ALT-024 for the observed duplicate-ID rollover invariant without deleting or rewriting real integration data. |
| 2026-08-10 19:02:07 IST (UTC+05:30) | `/incidents`, `/api/ha-incidents*` | Replaced the legacy incident table and ignored flat filters with the bounded Incident Command queue, correct JHipster criteria mapping, exact/partial summary counters, saved operational views, keyboard navigation, progressive preview, sticky pagination/status, density controls, and development-only fixtures. Extended the checked-in incident criteria backend for priority/SLA filters, added explicit authorization to the legacy incident/priority/SLA routes, and reconciled Kiro's completed INC-001 through INC-008 work by actual endpoint state. Added only the remaining queue summary, assignment, cross-field search/saved-view and stable cursor/freshness gaps as INC-Q01 through INC-Q04. |
| 2026-08-11 11:13:06 IST (UTC+05:30) | `/incidents/:id`, `/api/ha-incidents/{id}*` | Reorganized the Incident Workbench around persistent triage/scope/preserve/contain/resolve stages, an evidence-first two-pane analyst layout, bounded in-context event hunting, tasks, activity, sessions, explainable similar cases, and governed response preview. Added development-only end-to-end workbench fixtures with production-disabled aliases, normalized Kiro's response catalog/object-target preview and OpenSearch cursor transports, and blocked production response execution unless the backend explicitly proves `executionReady`. Reconciled INC-001, INC-004, INC-005 and INC-008 to `PARTIAL` with the verified dual-store, response-readiness, cursor/telemetry and SSE-authentication gaps rather than duplicating Kiro's completed routes. |
| 2026-08-11 12:30:40 IST (UTC+05:30) | `/investigations`, `/investigations/:id`, `/api/ha-investigation-sessions*` | Replaced the placeholder investigation routes with a bounded operational session queue and PEAK-aligned hypothesis/evidence/knowledge workspace. Reconciled Kiro's existing session CRUD, paging, item CRUD and direct conversion as implemented capabilities; timestamped only the remaining authorization/tenant, filtering/snapshot, N+1/unbounded item, hypothesis/scope/activity, evidence-provenance, governed promotion and resumable-update gaps under `INV-009` through `INV-013`. Added development-only fictional workflows with production-disabled aliases. |
| 2026-08-11 18:20:37 IST (UTC+05:30) | `/api/soar/**`, `/api/ha-playbooks` | Deprecated the legacy SOAR compatibility endpoints in code and contract metadata; responses now advertise the secured `/api/ha-playbooks` successor plus a conditional 2027-12-31 sunset. Updated `RESP-013` to reflect partial repository persistence and retained incomplete list/update/activation/execution behavior as explicit backend work. |
| 2026-08-13 11:43:50 IST (UTC+05:30) | `/investigations`, `/investigations/:id`, `/api/ha-investigation-sessions*`, tenant selection | Hardened Investigation Sessions end to end: canonical tenant context now validates authentication, membership/privilege and tenant existence; every session/item operation is tenant/owner authorized; manager semantics are consistent; updates require optimistic versions; list/item pages are bounded; queue item counts use one indexed aggregate; and the missing base Liquibase include is ordered before the hardening migration. Marked the unsafe direct conversion route deprecated while retaining governed promotion as outstanding contract work. |
| 2026-08-13 12:58:43 IST (UTC+05:30) | `/login`, `/dashboard`, `/search`, `/investigations`, Docker integration | Revalidated the current frontend against the rebuilt local Docker backend with foundation fixtures disabled. Fixed the public-auth tenant-header leak that could cause login/dashboard flashing, retained the narrow approved local CORS origin, live-verified authenticated dashboard/Search/Investigation navigation without console errors, and recorded the green frontend/focused-backend gates plus the still-failing legacy backend property-suite categories. |
| 2026-08-13 13:55:37 IST (UTC+05:30) | Raw telemetry → event processor → `/alerts/:id`, `/api/ha-alerts/{id}` | Added and live-verified the strict raw PowerShell ETW acceptance path (`DET-ING-001`): authenticated raw injection, PowerShell normalization, CEL rule evaluation, generated alert persistence, normalized-event persistence, and real backend projection. Restored composed `safe`/`toLower`/regex CEL support used by checked-in detections, corrected canonical `log.*` persistence, and made the alert producer publish canonical ATT&CK, data-source and source-event associations while the backend normalizes historical `technique`, `dataSource`, and `eventIds` aliases. The generated proof alert resolved with one linked event and T1059.001. Marked direct OpenSearch dataset hydration/simulation scripts deprecated for detection acceptance; they may not be used to claim collector or rule-engine success. |
| 2026-08-13 15:23:20 IST (UTC+05:30) | Docker raw-log acceptance environment, `/api/ha-alerts/{id}/story`, `/alerts/:id` event detail | Closed the clean-rebuild acceptance gap discovered by the strict test: repository production filters are now mounted read-only into both local processing roles, so tests cannot bypass normalization. A fresh strengthened-gate raw ETW record generated alert `cbacf481-b155-4971-95a8-1238ef3f7c5a` and event `ca5e77f1-5e10-46fc-b4fd-b87347d2ba67`; canonical ATT&CK/data-source/source-event fields, backend story association, normalized fields, and raw JSON were verified through the real backend and fixture-disabled UI. Story projection now accepts the engine's top-level `action`, `origin.*`, `target.*`, `dataSource`, and `log.pid` during the ECS compatibility window. |
| 2026-08-13 17:11:32 IST (UTC+05:30) | Raw telemetry → alerts → `/correlated-findings/:id`, `/api/ha-correlated-findings/{id}*` | Implemented and live-verified the first canonical correlation producer (`DET-ING-002`): three authenticated raw PowerShell ETW records were independently normalized and detected, then tenant-bounded by a shared normalized adversary into finding `d8ff1243-fa77-41cd-bd2d-0373c4f6df0f`. The producer now writes the bounded `v3-hive-correlation-*` story projection with unique signal IDs, exact source-event lineage, entities, relationships, ATT&CK technique, structural counts, evidence-backed correlation reasons, analyst-validation language and producer provenance; generated alerts receive idempotent `findingId` links. The authenticated COR detail, signals and raw-events APIs accept the producer's canonical fields and mixed historical keyword/text ID mappings. `v3-hive-offense-*` is now a deprecated dual-written compatibility projection marked `deprecated: true` with `v3-hive-correlation-*` as successor; `/api/offenses*` must not gain new consumers and remains scheduled for removal after the published compatibility review. The raw-only acceptance script performs no direct OpenSearch writes and validated all three events, all three alerts, the canonical finding, signal/event evidence, alert back-links, and the deprecated projection. |
| 2026-08-13 17:22:45 IST (UTC+05:30) | Raw telemetry → alerts → `/correlated-findings/:id`, `/api/ha-correlated-findings/{id}*` | Tightened `DET-ING-002` after live visual provenance validation: canonical finding documents now include the UI-consumed `correlationEngine.version`, `correlationEngine.ruleIds`, `correlationEngine.evaluatedAt`, document `version`, and explicit `dataCompleteness` fields in addition to operational producer metadata. A fresh raw-only acceptance run generated finding `60dced9b-a497-4a60-b83f-1fa4c0659904`, three engine alerts and three source events; backend evidence APIs and the fixture-disabled Relationships view displayed the correlator version and `shared-adversary-2h` rule without fallback values. |
| 2026-08-13 18:36:41 IST (UTC+05:30) | `/posture/vulnerabilities`, `/api/ha-vuln/*` | Audited the existing role-protected JDBC CVE inventory before redesign and recorded only the missing or partial tenant/snapshot/cursor/failure semantics, progressive provenance, contextual priority, same-snapshot facets, governed remediation/verification, streaming/history/export and Hive Intelligence requirements as `VUL-001`–`VUL-007`. The production UI consumes existing CVSS, KEV, package, host and observation fields honestly and does not fabricate EPSS, exposure or remediation state. |
| 2026-08-14 10:53:08 IST (UTC+05:30) | `/posture/cis-benchmark`, `/api/ha-cis/*`, `/api/ha-telemetry/sca` | Audited the checked-in role-protected current-result JDBC projection, per-agent/pack summaries, schema and asynchronous untyped ingestion path before redesign. Recorded only the missing or partial tenant/snapshot/cursor/failure semantics, weighted same-snapshot coverage, typed producer acceptance, benchmark/version/applicability catalog, progressive evidence provenance, governed remediation/exception/rescan verification, immutable history/deltas/export and Hive Intelligence requirements as `CIS-001`–`CIS-008`. The production UI labels the aggregate a technical pass rate and withholds unsupported configuration mutations. |
| 2026-08-14 11:26:51 IST (UTC+05:30) | Installer, agents, agent-manager, inputs, Redpanda, event processor, OpenSearch, backend and `frontend-v3` | Reconciled the raw-injection proofs with the actual real-agent and deployment paths and recorded the production-minimum single-node pilot requirements as `SIEM-001`–`SIEM-010`. The audit found hard-coded default-tenant ingress, shared CLI enrollment credentials, plaintext agent-key synchronization, non-durable derived-output commits, swallowed writer failures, production TLS verification bypasses, split frontend-v2/v3 packaging and a stale non-Kafka installer. No backend implementation or production-readiness claim was made; the phased plan and timestamped execution ledger are in `docs/ai-handoff/`. |
| 2026-08-14 11:57:50 IST (UTC+05:30) | `hivearmor.raw.events`, inputs producer and event-processor consumer | Implemented the `PILOT-00` versioned raw-event boundary: machine-readable `ha.raw-event.v1` schema, synchronous `acks=all`, tenant/source key, schema and identity headers, strict envelope/header/cross-field validation, schema-downgrade rejection, measured legacy compatibility and a dated 2027-02-14 target sunset. Updated `SIEM-004` only for the proven subset; agent spooling, identity binding, typed receipts, retry/DLQ/replay, outage acceptance and full `SIEM-001`/`SIEM-010` release evidence remain incomplete. |
| 2026-08-14 14:01:07 IST (UTC+05:30) | `/api/ha-agent-enrollments`, agent-manager gRPC enrollment/credential lifecycle, agent install bootstrap | Implemented the `PILOT-01` secure-enrollment code slice and reconciled `SIEM-002`, `SIEM-003` and `SIEM-007`: tenant-bound hash-only one-time tokens, atomic consumption, opaque agent identity, hash-only device credential, rotate/revoke, protected file/stdin bootstrap, diagnostic redaction and a default-disabled dated legacy connection-key path. Focused Go/Java/race/package/image checks and a running REST-to-gRPC HTTP 201 create passed. The live concurrent replay/forged/revoked-key test and packaged Windows/Linux lifecycle were not executed, so `SIEM-002` and `PILOT-01` remain partial/in progress. |
| 2026-08-14 14:26:49 IST (UTC+05:30) | `/api/ha-agent-enrollments`, agent-manager image build | Hardened the still-partial `SIEM-002` path with an authoritative 24-hour token ceiling, canonical platform allowlist/alias, bounded manager inputs and explicit Admin/SOC Manager Spring route authorization. Reworked the agent-manager dependency layer to use locked `go.sum` resolution and BuildKit caching without `go mod tidy`; rebuilt/restarted agent-manager/backend healthy and revoked the unused acceptance token. The final local-port HTTP check was approval-blocked by the account usage ceiling, so no new live acceptance or production-readiness claim was added. |
| 2026-08-14 14:34:46 IST (UTC+05:30) | `/api/ha-agent-enrollments`, agent-manager/backend runtime | Confirmed the final Base64-verifier agent-manager image and packaged backend container were both healthy after restart. This is runtime health evidence only; post-hardening HTTP, concurrent replay/forged/revoked-key and packaged Windows/Linux lifecycle gates remain open, so `SIEM-002` stays `PARTIAL` and `PILOT-01` stays `IN PROGRESS`. |
| 2026-08-18 12:30:06 IST (UTC+05:30) | `/api/ha-agent-enrollments/audit`, credential rotate/revoke, agent-manager audit gRPC/database | Implemented and live-verified allowlisted same-transaction enrollment/credential audit events, database-enforced append-only mutation rejection, explicit mutation reasons and a tenant-derived Admin/SOC Manager safe bounded audit projection. Concurrent one-use enrollment, replay/forged/revoked denial, secret-field exclusion, token cleanup and direct SQL tamper rejection passed against rebuilt healthy services. `SIEM-002` stays `PARTIAL` and `PILOT-01` stays `IN PROGRESS` only because supported packaged Windows/Linux lifecycle acceptance, compatibility retirement and release-level retention/export evidence remain open. |
| 2026-08-18 13:11:42 IST (UTC+05:30) | Agent local credential lifecycle, agent-manager replacement enrollment, release packaging/signing/provenance | Added authenticated owner-only atomic credential persistence with legacy read migration, protected validate-before-save rotation, no credential echo, and authorized same-device replacement after explicit revocation. Extended live TLS acceptance through rotate/revoke/re-enroll/reconnect and secret-free audit checks. Added Linux/Windows amd64/arm64 agent/updater packages with install guide/checksums, external checksums, provenance and fail-closed production signing. Full/race/vet/cross-build/archive checks passed. `SIEM-002`, `SIEM-007` and `SIEM-010` remain `PARTIAL`; real Windows SCM/Linux systemd execution, live HTTP authorization/bounds, platform keystore/mTLS, actual signed CI artifacts and complete release evidence remain open. |
| 2026-08-18 16:16:32 IST (UTC+05:30) | agent-manager identity RPCs, inputs ingest, `hivearmor.raw.events` | Implemented the `PILOT-02` identity-derived ingress slice and reconciled `SIEM-003`: verify-on-miss connector identity, bounded secret-free authorization projection, tenant binding from authenticated agent identity, fail-closed missing/conflicting/revoked/unbound identity, 4 MiB and rate/connection limits with Retry-After, and mandatory connector identity on new v1 envelopes keyed `tenantId:connectorId`. Focused Go/race/vet checks passed. Live ingest replay, collector/cloud-plugin tenant binding, packaged-host `PILOT-01` gates and device mTLS remain open, so `SIEM-003` stays `PARTIAL` and `PILOT-02` stays `IN PROGRESS`. |
| 2026-08-18 16:59:20 IST (UTC+05:30) | agent spool, inputs Kafka path, `hivearmor.raw.events.quarantine` | Closed `PILOT-01` and `PILOT-02` as `CODE COMPLETE` on operator instruction without packaged-host or live-ingest `LIVE VERIFIED` claims. Implemented `PILOT-03`: durable endpoint spool before queue send, processed-first quota, Kafka-only production delivery, quarantine of malformed records and a 4 MiB broker cap. Focused agent/inputs/consumer Go/race/vet checks passed. `SIEM-002`, `SIEM-003` and `SIEM-004` stay `PARTIAL` because packaged-host execution, live identity ingest and live outage/replay remain open. |
| 2026-08-18 19:55:01 IST (UTC+05:30) | agent-manager ProcessLog ingest, `hivearmor.raw.events`, `hivearmor.raw.events.quarantine` | Live-verified `PILOT-02` identity/size/rate/revoke ingest against rebuilt images via `local-dev/tests/pilot-live-ingress.sh`. Fixed PILOT-03 quarantine writer dual-Topic so unsupported schema records reach quarantine and survive consumer restart; worker restart did not shrink raw.events end offset. `SIEM-003` and `SIEM-004` stay `PARTIAL` because collector/cloud tenant binding, mTLS, broker outage and agent-process spool remain open. No alert-UI or production-ready claim. |
| 2026-08-19 16:20:00 IST (UTC+05:30) | `/api/ha-vuln/*`, `/api/ha-cis/*`, `/api/ha-hunts/actions*` | Hardened VUL-001/002/004 and CIS-001/005: size cap 100, enum/time validation, RFC 9457 datastore failures, finding/result detail GETs, populated vulnerability references, filter-bound vuln summary, hunt promotion bound to search snapshot `searchId`. Tenant cursors, EPSS, CIS mutations and Hive Intelligence remain unimplemented. Not `PRODUCTION READY`. |
| 2026-08-19 16:45:00 IST (UTC+05:30) | `/api/ha-vuln/*`, `/api/ha-cis/*`, `/api/ha-alerts/convert-to-incident`, hunt promotion | Tenant columns + JDBC predicates, keyset cursors, honest EPSS/remediation and CIS mutation 503s, observed CIS catalog, hunt evidence items, convert-to-incident creates PostgreSQL incident then OpenSearch flag. Historical untagged telemetry rows are hidden by tenant filter. Not live-verified. Not `PRODUCTION READY`. |
| 2026-08-19 18:28:18 IST (UTC+05:30) | `/api/ha-telemetry/sca`, `/api/ha-telemetry/sbom`, Linux systemd agent | Linux install writes `HiveArmorAgent` drop-in `EnvironmentFile=-/etc/hivearmor/agent.env`. Staging `hivearmor-telemetry.service` (`telemetry-loop`) loaded that file (0600) with no key in the unit; `scanned_at` matched service start; 4 observed SCA rows and 400 SBOM components for `staging-vm`. Not enrolled `HiveArmorAgent` PILOT-01. Not official CIS. Not `PRODUCTION READY`. |
| 2026-08-19 18:45:08 IST (UTC+05:30) | `/api/ha-agent-enrollments`, Linux `HiveArmorAgent` systemd | Packaged Linux PILOT-01 on staging: Admin token create, install with skip-cert yes, systemd lifecycle, rotate via protected file, revoke, audit without secrets. Register maps distro platform to `linux`. Host publishes 9001. Windows SCM and SOC/Analyst/cross-tenant matrix remain open. Not `PRODUCTION READY`. |
| 2026-08-19 20:35:00 IST (UTC+05:30) | `/api/ha-agent-enrollments/audit/export`, `/api/ha-retention-policies/ENROLLMENT_AUDIT` | Staging live enrollment-audit export: 25 NDJSON rows matching postgres tenant 1, append-only DELETE rejected, S3 archive PUT 400, table dump 0600. Analyst 403 skipped. Not full SIEM-009 restore/SLO. Not `PRODUCTION READY`. |
| 2026-08-19 20:44:15 IST (UTC+05:30) | PostgreSQL dump/restore drill, OpenSearch `_snapshot/ha_fs` | Staging ACC-12 subset: throwaway `hivearmor_restore_drill` counts matched; snapshot SUCCESS; renamed restore 1 doc; daily backup timer enabled. Snapshots colocated with primary data. Redpanda unrestored. Not `PRODUCTION READY`. |
| 2026-08-21 13:25:00 IST (UTC+05:30) | SIEM-009 backup/restore, Redpanda volume, ISM | Staging LIVE: named `redpanda_data`, off-OpenSearch-volume backup copy, ISM `ha-hot-retention` 14d, throwaway PG/OS restore. Not new-VM / WORM / SLO. Not `PRODUCTION READY`. |
| 2026-08-21 13:05:00 IST (UTC+05:30) | `/api/ha-agent-enrollments`, Windows role matrix | Windows host role matrix LIVE: Admin 200, SOC Manager 200, Analyst 403, SOC Manager tenant 3812 403. Unauthorized-tenant check uses SOC token. Not `PRODUCTION READY`. |
| 2026-08-21 13:00:00 IST (UTC+05:30) | `/api/ha-agent-enrollments`, Windows `HiveArmorAgent` SCM | ACC-02 LIVE on Windows Server 2019: Admin token create, install agent 13, SCM lifecycle, rotate (one 1056 race recovered), revoke, secret-free audit. Role matrix skipped. Skip-cert yes. Not `PRODUCTION READY`. |
| 2026-08-19 21:45:00 IST (UTC+05:30) | `/api/ha-cis/catalog`, `/api/ha-vuln/remediation-connectors`, `/api/ha-telemetry/*` | Staging LIVE: catalog 2 packs, connectors not_configured, forged 401, FIRST probe 200 with no invented placeholder EPSS, signed telemetry-once agent 9 (4 SCA rows). Legacy INTERNAL_KEY still allowed. Not `PRODUCTION READY`. |
| 2026-08-21 16:37:00 IST (UTC+05:30) | `/compliance`, `/api/ha-posture/**`, legacy `/api/ha-compliance/frameworks` and `/api/compliance/**` | Audited the aggregate posture resource, DTOs, repositories and legacy evidence/report/config surfaces before redesign. Recorded tenant/snapshot/paging/scoring, bounded controls, evidence provenance, assessment/applicability/ownership, improvement-action/exception/remediation, report/export, history/deltas, Hive Intelligence and legacy deprecation requirements as `CMP-001`–`CMP-009`. The UI consumes only real aggregate fields and does not infer attestation or fabricate control evidence. No backend endpoint was added or deprecated in code in this slice. |
| 2026-08-21 17:37:57 IST (UTC+05:30) | `/reports/scheduled`, `/reports/templates`, `/reports/sitrep`, `/reports/incidents`, `/reports/after-action` | Audited generic report CRUD, compliance-backed schedule storage and separate report/export controllers before consolidating the UI. Recorded bounded tenant inventory, versioned templates, snapshot-bound asynchronous generation, governed scheduler/delivery, review/redaction/approval, typed SOC communications, artifact retention, immutable audit, Hive Intelligence and compatibility-route migration as `REP-001`–`REP-010`. No backend endpoint was added, implemented or deprecated in code in this frontend slice. |
| 2026-08-21 18:46:15 IST (UTC+05:30) | `/admin/pipeline-signals`, `/inputs/sources`, `/admin/data-parsing` | Reconciled the live pipeline-signals/soak evidence, raw envelope, agent spool and quarantine topic before replacing the disconnected frontend pages. Recorded only the missing bounded source lifecycle, identity/secret operations, per-source freshness/backpressure/quality, parser version/test/deploy, schema lineage, grouped failure inventory, governed replay, expanded measured topology and role/deprecation requirements as `ING-001`–`ING-010`. No backend endpoint was added, implemented or deprecated in code in this frontend slice. |
| 2026-08-22 20:54:37 IST (UTC+05:30) | `/admin/integrations`, `/admin/notifications`, `/admin/connection-keys`, `/settings/api-keys` | Audited legacy integration entities/config, notification rules, real notification-channel dispatch, user-bound connection keys and the newer hash-only API-key service before unifying the UI. Recorded bounded connector lifecycle, secret aliases, validation/health, destination/routing, durable delivery/retry, webhook egress security, service-key lifecycle and role/migration requirements as `INO-001`–`INO-010`. No backend endpoint was added, implemented or deprecated in code in this frontend slice. |
| 2026-08-22 21:39:31 IST (UTC+05:30) | `/admin/users`, `/admin/tenants`, `/admin/sso`, `/admin/scim`, `/mssp/tenants` | Audited the protected user/tenant/MSSP/OIDC/SCIM resources and the unprotected legacy authority CRUD before consolidating administration. Preserved implemented Kiro capabilities and recorded only the missing or mismatched bounded directory, invitation/JML, effective-role, tenant lifecycle, delegated-membership, federation, SCIM receipts, access-review, session/break-glass and immutable-audit guarantees as `IAM-001`–`IAM-010`. The frontend now reads `/users/authorities`, fixes the existing user-update contract to `PUT /users`, and does not adopt `/authority`. No backend endpoint was added, implemented or marked deprecated in code in this frontend slice. |
| 2026-08-23 10:18:14 IST (UTC+05:30) | `/admin/audit`, `/admin/retention`, `/admin/settings`, `/settings/system` | Reconciled Kiro's Admin-only audit list, retention CRUD and masked typed settings aggregate before consolidating governance administration. Recorded only the remaining bounded audit evidence/integrity/export, effective retention/legal hold, versioned configuration/change control and API lifecycle/migration requirements as `GOV-001`–`GOV-010`. The production frontend reads the three existing safe projections and does not invoke unsupported mutations. Legacy `/ha-settings` is recorded for successor migration but is not marked deprecated until the successor and lifecycle headers are live. No backend endpoint was added, implemented or deprecated in code in this frontend slice. |
| 2026-08-25 08:29:20 IST (UTC+05:30) | `/intelligence`, `/admin/threat-intel`, `/api/ha-threat-intel*`, `/api/v1/threat-intel` | Orphan operational inventory selected threat-intel as the first family. Recorded `TI-001`–`TI-004` after reconciling secured ha-threat-intel reads/mutations and the unsecured legacy v1 controller. Frontend honesty: SOC Manager page gate, stats strip, Admin-only feed mutations with explicit read-only copy, human Admin access label. No PRODUCTION READY claim. |
| 2026-08-25 08:45:00 IST (UTC+05:30) | `/response/quarantine`, `/edr/fim`, `/api/ha-edr/quarantine*`, `/api/ha-edr/timeline`, `/api/ha-edr/process-tree`, `/api/ha-edr/fim/summary` | Closed orphan inventory **H** quarantine SOC Manager gap: `HaEdrResource` list/mutate PreAuthorize adds `ROLE_SOC_MANAGER`; timeline/process-tree add Analyst + SOC Manager (keep Admin); FIM summary adds SOC Manager. FE quarantine/FIM page gates and FIM nav roles align with BE; honest human access-denied labels. Legacy `/api/edr/*` not adopted for quarantine inventory. `RESP-021` depth gaps remain. STAGING CANDIDATE — not PRODUCTION READY. |
| 2026-08-25 09:15:00 IST (UTC+05:30) | `/response/quarantine`, `/api/ha-edr/isolation` | Closed one `RESP-021` depth gap: secured canonical host-isolation inventory read (`GET /api/ha-edr/isolation`, Analyst\|SOC Manager\|Admin) over `hive_edr_isolation`, wired into Quarantine & Containment Endpoint isolation tab with honest empty/error states. Legacy `/api/edr/isolation` not adopted. Remaining RESP-021: enriched evidence/summaries, cursor/snapshot/freshness, action history, governed preview/approval/idempotency for restore/delete/release, resumable delivery. STAGING CANDIDATE — not PRODUCTION READY. |
