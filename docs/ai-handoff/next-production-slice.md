# Next production slice

Updated: **2026-08-25 16:15:00 IST (UTC+05:30)**

## Active — Wave C1 Dashboards & reports audit + thin honesty (STAGING CANDIDATE)

Program: `docs/ai-handoff/frontend-autonomous-soc-audit-program.md`.
Routes: `/dashboards`, `/dashboards/studio`, `/reports/*`.
Status: **AUDIT + thin honesty IN PROGRESS (code)** — still **STAGING CANDIDATE**. Staging rebuild deferred.
Research: `docs/ai-handoff/research/autonomous-soc-dashboards-reports.md`.
Branch: `feat/c1-dashboards-reports-audit`.

| ID | Fix |
|---|---|
| C1-AUTH-01/02 | Studio/edit + report AuthGuards match nav |
| C1-API-01 | `dashboards.service` → relative `apiClient` |
| C1-FIX-01 | Fixture-disabled aliases for DSH/REP fixtures |
| C1-REP-01/02/03 | Stamp-only run honesty; KPI + field copy |
| C1-DSH-01/02 | Unbounded legacy list; no fictional tenants |
| C1-LIVE-01 | StatusDock historical outside fixtures |
| C1-AUTH-04 | Metrics builder Analyst+; save gated |

Still open: DSH-002 versioned save; REP-003/004 generation pipeline; GAP-SEC-12 method PreAuthorize.

## Completed this slice — Wave B2 Posture & compliance (#61)

Status: **MERGED** tip `298c550` — STAGING CANDIDATE. Staging rebuild deferred.

## Completed this slice — Wave B1 Endpoint defense (#60)

Status: **MERGED** tip `70f1130` — STAGING CANDIDATE. Staging rebuild deferred.

## Completed this slice — Wave A3 Defend/respond (#59)

Status: **MERGED** tip `cc7797b` — STAGING CANDIDATE. Staging rebuild deferred.

## Completed this slice — Wave A2 Investigate remaining gaps (#58)

Status: **MERGED** tip `e72ba83` — STAGING CANDIDATE. Staging FE rebuild deferred per operator request.

| ID | Fix |
|---|---|
| A2-SRCH-02 | Removed unused hunt helpers calling legacy TI / unmounted SOC AI |
| A2-UEBA-02 | Create Incident → guidance dialog → `/search?q=` |

## Active — Frontend Autonomous SOC audit program (next major arc)

Program: `docs/ai-handoff/frontend-autonomous-soc-audit-program.md`.
Next after C1 merge + staging smoke: **Wave C2 Platform admin**.
Status: **PROGRAM IN PROGRESS** — not `PRODUCTION READY`.

## Completed this slice — Wave A2 Investigate & AI audit (#57)

Status: **AUDIT COMPLETE + thin honesty** — merged + staging FE rebuilt to `ddeffc9` (STAGING CANDIDATE).

## Completed this slice — TI optional depth (MISP status + bounded Last Sync)

Routes: `/intelligence`, `/admin/threat-intel`; contracts `TI-001`–`TI-004`.
Status: **STAGING CANDIDATE** — TI-002–TI-004 depth (#47) + optional MISP `lastSyncStatus` / bounded Last Sync honesty. Not `PRODUCTION READY`. Not real-backend `LIVE VERIFIED`.
Branch: `feat/p1-ti-optional-depth`.

Shipped: MISP `last_sync_status` persist OK/ERROR; Admin Status column; bounded Last Sync (`>30d`); no v1 Deprecation/Sunset.

Still open under TI: IOC cursor/freshness; immutable mutation audit; v1 cutover headers; durable sync ledger / TLP governance.

## Prior active — Orphan Operational Workflows (TI-002–TI-004 depth)

Routes: inventory across UEBA/risk/timeline, endpoint timeline/quarantine/FIM/policies, and threat intelligence; **first bounded family = threat-intel ops** (`/intelligence`, `/admin/threat-intel`).
Status: **STAGING CANDIDATE** — inventory + TI-002–TI-004 depth + agent-policy enforcement evidence + POL-003 apply/ack honesty. Not `PRODUCTION READY`. Not real-backend `LIVE VERIFIED` for this slice.
Program: `docs/ai-handoff/remaining-page-program.md`.
Research: `docs/ai-handoff/research/orphan-operational-workflows-inventory.md`.
Contracts: `TI-001`–`TI-004`; follow-ons include `POL-001`–`POL-003`.

Branch (POL-003 apply/ack honesty): `feat/p1-pol003-apply-ack-honesty` (worktree `.worktrees/p1-pol003-apply-ack-honesty`); prior policies evidence merged via #48 (`feat/p1-agent-policies-enforcement-evidence`).

Completed in this depth slice:

1. TI-002: `HaThreatIntelResource` feed list/get + `HaThreatIntelStatsResource` authorize Admin\|User\|Analyst\|SOC Manager explicitly; mutations stay Admin-only.
2. TI-003: Legacy `/api/v1/threat-intel` `@PreAuthorize` harden in place (same ROLE_ matrix). No Deprecation/Sunset/Link until cutover evidence. Frontend-v3 still does not call v1.
3. TI-004: TAXII/MISP sync returns `ThreatFeedSyncReceipt` (`receiptId`, `lastSyncAt`, `status`, `iocCount`, `failedReason`); TAXII failures persist ERROR + lastSyncAt (no fake “Synced 0 IOCs”); Admin UI toasts receipt honesty.
4. Frontend capability flags + Vitest coverage; contract timestamps updated.

Required next actions (remaining orphans / depth):

1. ~~Follow-on UEBA: fix `HaUebaResource` `@PreAuthorize` authority strings~~ — **done** on `feat/p1-ueba-auth-fix` (STAGING CANDIDATE): `ROLE_ANALYST`/`ROLE_SOC_MANAGER`/`ROLE_ADMIN` + `/ueba/entity-timeline` route.
2. ~~Follow-on quarantine: reconcile SOC Manager nav vs Analyst|Admin backend (`RESP-021`).~~ **Closed** on `feat/p1-endpoint-quarantine-auth` (STAGING CANDIDATE) — SOC Manager on `/api/ha-edr/quarantine*`; FIM/timeline auth + nav/page gates aligned.
3. ~~Follow-on RESP-021 depth: secured host-isolation inventory.~~ **Closed** on `feat/p1-resp021-isolation-inventory` (STAGING CANDIDATE) — `GET /api/ha-edr/isolation` + Endpoint isolation tab.
4. ~~Follow-on RESP-021 depth: quarantine/isolation list freshness honesty.~~ **Closed** on `feat/p1-resp021-list-freshness` (STAGING CANDIDATE) — `snapshotAt`/`asOf` + `X-Snapshot-At`/`X-As-Of`. Remaining RESP-021 depth gaps stay open.
5. ~~Follow-on policies: enforcement evidence honesty~~ — **done** on `feat/p1-agent-policies-enforcement-evidence` (STAGING CANDIDATE): `GET /ha-edr/policies/{id}/enforcement` + UI unavailable/partial; host apply/ack still open (`POL-001`–`POL-003`).
6. Optional deeper threat-intel: IOC cursor/freshness, durable sync ledger, MISP persisted status, v1 deprecation headers after consumer cutover.
7. Timestamp any additional contracts; run focused/full gates and authenticated browser review before claiming broader UI IMPLEMENTED beyond this honesty strip.

## Completed this slice — RESP-021 list freshness honesty (thin depth)

Routes: `/response/quarantine`; `GET /api/ha-edr/quarantine`, `GET /api/ha-edr/isolation`.
Status: **STAGING CANDIDATE** — server `snapshotAt`/`asOf` (+ `X-Snapshot-At`/`X-As-Of`) on quarantine and isolation lists; Endpoint isolation freshness banner. Not cursor/PIT-bound. Not `PRODUCTION READY`. Not `LIVE VERIFIED`.

Still open under `RESP-021`: enriched evidence/summaries, full cursor/PIT freshness, action history, governed preview/approval/idempotency for restore/delete/release, resumable delivery state.

4. ~~Follow-on policies: enforcement evidence honesty~~ — **done** on `feat/p1-agent-policies-enforcement-evidence` (#48, STAGING CANDIDATE): `GET /ha-edr/policies/{id}/enforcement` + UI unavailable/partial.
5. ~~POL-003 apply/ack honesty~~ — **done** on `feat/p1-pol003-apply-ack-honesty` (STAGING CANDIDATE): missing `appliedVersion`/`lastAppliedAt` ⇒ apply/ack path unavailable; never green “enforced on host”. Live agent gRPC apply/ack remains open.
6. Optional deeper threat-intel: IOC cursor/freshness, durable sync ledger, MISP persisted status, v1 deprecation headers after consumer cutover.
7. Timestamp any additional contracts; run focused/full gates and authenticated browser review before claiming broader UI IMPLEMENTED beyond this honesty strip.

## Completed this slice — RESP-021 host isolation inventory (thin depth)

Routes: `/response/quarantine` Endpoint isolation tab; `GET /api/ha-edr/isolation`.
Status: **STAGING CANDIDATE** — secured host-isolation read wired with honest empty/partial states. Not `PRODUCTION READY`. Not `LIVE VERIFIED`.
Merged: `feat/p1-resp021-isolation-inventory` (#46).

Still open under `RESP-021`: enriched evidence/summaries, cursor/snapshot/freshness semantics, action history, governed preview/approval/idempotency for restore/delete/release, resumable delivery state.

## Completed this slice — Agentic INVESTIGATE soft session item pin (STAGING CANDIDATE)

Scope: after #45 soft session create, soft-pin the resolvable alert as an `ALERT` session item
(`itemRef` = alert id) via `InvestigationSessionService.pinItem` when available.
Status: **STAGING CANDIDATE** — not `PRODUCTION READY`. Not Neo4j / attack-path. Not auto-convert to incident.
Branch: `feat/p1-agentic-investigate-session-pin`.

Ledger keeps `stub=true`; records `sessionItemPinned` + `sessionItemId`/`sessionItemType` on success,
or sanitized `sessionItemPinError` (exception class only) on pin soft-fail without undoing `sessionLinked`.

Still open: Neo4j / attack-path; `openHypotheses`; convert-to-incident; staging LIVE verify of
createSession + pinItem from SOC-AI triage.

## Completed this slice — Agentic INVESTIGATE soft session link (STAGING CANDIDATE)

Scope: `TriageInvestigateStub` → optional soft link to `/api/ha-investigation-sessions` (id + status only).
Status: **STAGING CANDIDATE** — not `PRODUCTION READY`. Not Neo4j / attack-path. Not auto-convert to incident.
Merged: `feat/p1-agentic-investigate-session-link` (#45).

Follow-on soft ALERT item pin: see slice above. Remaining: Neo4j / attack-path; `openHypotheses`;
convert-to-incident; staging LIVE verify.

## Completed this slice — Governance and Platform Settings

Routes: `/admin/audit`, `/admin/retention`, `/admin/settings`, `/settings/system`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Type-check, zero-warning lint, focused tests, the complete 1,092-test suite and production build passed. Not `BACKEND IMPLEMENTED`, real-backend `LIVE VERIFIED` or `PRODUCTION READY` for `GOV-001`–`GOV-010`.

- Consolidated disconnected audit, retention and settings pages into one compact control plane with Audit ledger, Retention, Configuration, Change control and API lifecycle views.
- Corrected the audit wire contract to the checked-in `actor`/`actionType` array response, bounded its first projection to 100 and added cancellation/partial-result handling across all three existing reads.
- Added dense keyboard navigation, progressive full-height evidence context, a lifecycle consequence model, secret-safe effective settings and deliberately disabled proposal/export workflows where backend authority is incomplete.
- Browser review caught and fixed document growth when the context drawer opened, then added modal focus entry/trapping/Escape behavior. Fixture-mode shell polling was suppressed so the fresh review tab reports zero console warnings/errors.
- The API lifecycle fixture and durable contracts explicitly keep legacy `/ha-settings` at unknown migration state; it is not marked deprecated until successor, consumer cutover and lifecycle headers exist.
- Fictional governance depth is dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`; the production artifact contains none of the scanned fixture records.
- Research: `research/governance-platform-settings.md`. Contracts: `GOV-001`–`GOV-010`.

## Completed this slice — Identity, Tenancy and MSSP Administration

Routes: `/admin/users`, `/admin/tenants`, with linked `/admin/sso`, `/admin/scim` and existing `/mssp/tenants` administration surfaces.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Type-check, zero-warning lint, focused tests, the complete 1,088-test suite and production build passed. Not `BACKEND IMPLEMENTED`, real-backend `LIVE VERIFIED` or `PRODUCTION READY` for `IAM-001`–`IAM-010`.

- Consolidated the basic user grid and tenant placeholder into one compact control plane with Directory, Tenants, Access reviews, Federation and Audit activity views.
- Added source, effective-role, tenant-scope, MFA, review and freshness context; global/delegated/tenant-local administration boundaries; dense keyboard navigation; full-height progressive context and explicit partial/unavailable states.
- Corrected the existing user update call to the backend's `PUT /users` contract and changed the authority catalogue read to protected `/users/authorities`; the new frontend does not call unsafe legacy `/authority` CRUD.
- Production reads only the existing protected user, tenant, OIDC and SCIM surfaces with cancellation and partial-result handling. Invitation, review, session, break-glass and immutable-audit mutations remain disabled.
- Fictional membership, review and audit depth is dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.
- The production artifact was scanned for identity fixture markers after build. An initial static dynamic import emitted a lazy fixture chunk despite the runtime guard; the import was changed to a development-only Vite-ignored module path, the build dropped from 242 to 241 chunks, the fixture-marker scan passed, and a fresh development reload still loaded the fixture correctly.
- Authenticated fixture review covered Directory, Tenants, Access reviews, Federation and Audit activity; tenant/review context drawers; view-specific workflow setup; deep-link state; and the read-only audit boundary at 1280×720. The browser pass caught and corrected the generic workflow action on Federation/Audit activity. The deliverable tab remains open at `/admin/users`.
- Research: `research/identity-tenancy-administration.md`. Contracts: `IAM-001`–`IAM-010`.

## Completed this slice — Integration and Notification Operations

Routes: `/admin/integrations`, `/admin/notifications`, `/admin/connection-keys`, `/settings/api-keys`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Type-check, zero-warning lint, focused tests, the complete 1,084-test suite and production build passed. Not `BACKEND IMPLEMENTED`, real-backend `LIVE VERIFIED` or `PRODUCTION READY` for `INO-001`–`INO-010`.

- Consolidated four disconnected administration screens into one workbench with Operations, Connections, Delivery, Service access and Activity views.
- Added a catalog-to-activation trust chain, connector ownership/support/environment/credential-alias semantics, explicit measured-versus-unreported health and keyboard-operable dense inventories with full-height context.
- Added distinct reusable delivery destinations, routing policies and receipt semantics; added one-time API-key compatibility while keeping unavailable production mutation paths fail closed.
- Production reads only legacy connector metadata, admin notification rules and the hardened API-key list with cancellation and partial-result handling. Unsafe secret-bearing channel/config entities and simulated notification tests are not called.
- Fictional connector, delivery and audit records are dynamically imported only when `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`.
- Authenticated fixture review covered Operations, Connections, Delivery, Service access and Activity; connector/destination drawers; mode-specific guided setup; compatibility routes; reloadable activity deep links; and the shared sticky status surfaces at 1280×720. Browser warning/error logs were empty. The deliverable tab remains open at `/admin/integrations?view=connectors`.
- Research: `research/integration-notification-operations.md`. Contracts: `INO-001`–`INO-010`.

## Completed this slice — Pipeline and Ingestion Administration

Routes: `/admin/pipeline-signals`, `/inputs/sources`, `/admin/data-parsing`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Not `BACKEND IMPLEMENTED`, real-backend `LIVE VERIFIED` for the new operator contracts or `PRODUCTION READY`.

- Reconciled and preserved the previously live-verified pipeline-signals/soak evidence, raw envelope, agent spool and quarantine topic.
- Added one source-to-index workspace with Flow, Sources, Parsers, Failures and Capacity views, direct-measurement provenance and explicit unavailable/partial states.
- Added dense keyboard-operable source/parser/failure inventories, progressive context drawers, governed source onboarding and fail-closed replay preview.
- Production uses the existing endpoints with cancellation and partial-result handling; unsafe in-memory source creation and unavailable replay actions remain disabled.
- Authenticated fixture review covered all five views, dense inventories, source/failure context, onboarding and replay safeguards at 1280×720. The admin-capable development fixture profile is compile-time excluded from production. The deliverable tab remains open at `/admin/pipeline-signals`.
- Research: `research/pipeline-ingestion-operations.md`. Contracts: `ING-001`–`ING-010`.

## Completed this slice — Reporting and SOC Communications

Routes: `/reports/scheduled`, `/reports/templates`, `/reports/sitrep`, `/reports/incidents`, `/reports/after-action`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Focused checks, the complete 1,075-test suite and the production build passed. Not `BACKEND IMPLEMENTED`, real-backend `LIVE VERIFIED` or `PRODUCTION READY` for `REP-001`–`REP-010`.

- Consolidated five disconnected screens into one generated/scheduled/template lifecycle with route-specific report-type entry views.
- Added compact inventory/health measures, search/type filtering, snapshot/scope honesty, classification/redaction/approval/freshness signals, schedule run-as/recipient/delivery health and template provenance.
- Added keyboard-operable dense rows, explicit selection/context drawer, governed generation setup, permission/loading/error/partial/empty/legacy states, sticky operational status and development-only fictional data.
- Production continues to read the legacy report and scheduled-report endpoints but labels the unproven contract and withholds generation/distribution actions.
- Authenticated fixture review covered schedules, templates, generated SITREP and incident facets, record context, and the governed-generation dialog at 1280×720 with no console warnings or errors. The review tab remains open at `/reports/incidents`.
- Research: `research/reporting-soc-communications.md`. Contracts: `REP-001`–`REP-010`.

## Completed this slice — Dashboard Operations

Routes: `/dashboards`, `/dashboards/:id`, `/dashboards/studio`, `/dashboards/:id/edit`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**. Not `BACKEND IMPLEMENTED`, `LIVE VERIFIED` or `PRODUCTION READY` for `DSH-001`–`DSH-010`.

- Unified incompatible dashboard services and DTOs behind one canonical frontend definition with development-only fixture loading.
- Added a compact discovery gallery with access, owner, managed state, health, freshness, source coverage, search/filter/sort, grid/list density, keyboard navigation and sticky operational status.
- Added a governed runtime with global tenant/time/variable controls, a 12-column responsive panel grid, per-panel source/state/freshness, partial/stale states, detail provenance and investigation pivots.
- Added a three-pane low-code Studio with panel catalogue, canvas, inspector, readiness validation, unsaved-change guard and fixture-only draft saves. Production mutation and unsafe legacy panel execution fail closed.
- Authenticated fixture review at `http://127.0.0.1:4178` covered gallery, `SOC Mission Overview` runtime, and clean/add-panel Studio states. The review caught and corrected the `Not configured` source-readiness defect; the runtime tab is left open.
- Research: `research/dashboard-operations-workspace.md`. Contracts: `DSH-001`–`DSH-010`.

## Completed this slice — Compliance Assurance

Route: `/compliance`.
Status: **UI IMPLEMENTED**, **CONTRACT RECORDED** and **FIXTURE-BROWSER VERIFIED**; focused type/lint/tests, full 1,075-test suite and production build passed. Not `BACKEND IMPLEMENTED`, `LIVE VERIFIED` or `PRODUCTION READY` for `CMP-001`–`CMP-009`.

- Replaced the auto-selected empty control grid and false “controls compliant” copy with an evidence-honest framework/assessment inventory over `/api/ha-posture/score` and `/frameworks`.
- Added assurance boundary, compact aggregate/freshness measures, search/filter/sort, cancellable cached queries, virtual grid, icon density, keyboard navigation, permission/error/stale/empty states, sticky footer/status and explicit full-height framework context.
- Added development-only fictional aggregates behind `import.meta.env.DEV && VITE_USE_FOUNDATION_FIXTURES=true`; production calls only the backend.
- Authenticated fixture review at `http://127.0.0.1:4178/compliance` confirmed the assessment inventory, explicit framework drawer, compact sticky status surfaces and zero browser console warnings/errors. The deliverable tab is left open for operator review.
- Research: `research/compliance-assurance-workspace.md`. Contracts: `CMP-001`–`CMP-009`.

## Completed this slice — E2E agent→detect + staging UI walk LIVE

Status: staging **LIVE VERIFIED** for enroll+ProcessLog → OpenSearch → `PILOT-LIN-AUTH-FAIL` alert, plus Playwright UI walk of Mission Control, Alerts, Search & Hunt, Sensors, Incidents, Detection Rules, Queue. Search showed **177** events including `pilot-staging-mvp` rows at ProcessLog time. SSE live dock was **Disconnected / 0 EPS** during the walk (historical pages still worked). **Rotate staging admin password** (credential briefly exposed in local tool output). Not `PRODUCTION READY`.

- Driver: `deploy/staging/run-e2e-pipeline-ui.sh`. Report: `/var/tmp/hivearmor-e2e-pipeline-ui.json`.
- pos event `e20c1660-9ef8-413a-97a5-a7a4c89725aa`; alert `da10f27c-18e4-5171-91f5-8f592ec6f934` (deduped rule/host/user).

## Completed this slice — SIEM-009 object-store Object Lock drill LIVE (MinIO)

Status: staging **LIVE VERIFIED** for offhost stamp upload into MinIO bucket with **COMPLIANCE** Object Lock: locked version delete denied; locked version etag unchanged after second PUT (new version). **Not** a commercial AWS Glacier WORM claim (no IAM/S3 on the EC2). Optional `HA_WORM_MODE=s3` when operator credentials exist. Not `PRODUCTION READY`.

- Driver: `deploy/staging/run-siem009-worm-object-lock.sh`. Report: `/var/tmp/hivearmor-siem009-worm-object-lock.json`.
- Stamp `20260821T075407Z` → 3 objects / ~9.8MB; MinIO `127.0.0.1:19000` bucket `hivearmor-staging-worm-compliance`.

## Completed this slice — SIEM-009 soak pack collector + Admin soak history (PARTIAL)

Status: staging **LIVE VERIFIED** for soak evidence pack tooling and Admin pipeline-signals soak history. Wall-clock span is **~0.6h / 24h** → pack status **`PARTIAL_SOAK`** (not a completed 24h evidence pack). Timer remains enabled; re-run `collect-siem009-soak-pack.sh` after ~**2026-08-22 09:25 UTC** for `LIVE_VERIFIED_24H_SOAK`. **No invented SLO thresholds.** Not Grafana. Not `PRODUCTION READY`.

- Collector: `deploy/staging/collect-siem009-soak-pack.sh` → `/var/tmp/hivearmor-siem009-soak-pack.json` + `.tar.gz`.
- API/UI: `GET /api/ha-pipeline-signals` returns `soakHistory`, `soakSpanHours`, `soakSampleCount`; Admin `/admin/pipeline-signals` table.
- Series (measured): lag min/max **0**, OpenSearch **yellow**, backend/redpanda always healthy across samples so far.

## Completed this slice — HNT-007 SOC Manager approval path LIVE

Status: staging **LIVE VERIFIED** for gated hunt escalate: request approval → self-approve **400** `SEPARATION_OF_DUTIES` → `soc.manager` **APPROVE** → execute with `parameters.approvalId` **200** → replay consumed approval **400**. Liquibase `ha_hunt_promotion_approval`; REST under `/api/ha-hunts/approvals`. Not a full RESP-020 governance UI. Not `PRODUCTION READY`.

- Driver: `deploy/staging/run-hnt007-approval-live.sh`. Report: `/var/tmp/hivearmor-hnt007-approval.json`.
- APIs: `POST/GET /api/ha-hunts/approvals`, `POST /api/ha-hunts/approvals/{id}/decision`.
- Execute binds approval to action + `searchId` + eventIds hash + requester tenant; marks `CONSUMED`.

## Completed this slice — Pipeline signals Admin board + soak timer (SIEM-009)

Status: staging **LIVE VERIFIED** for Admin `GET /api/ha-pipeline-signals` and `/admin/pipeline-signals` UI (measured OpenSearch/Postgres + host soak lag). Hourly `hivearmor-slo-soak.timer` enabled. **No invented SLO thresholds.** Brand-new Linux VM restore **deferred post production-ready** per operator. Not a completed 24h evidence pack yet. Not Grafana. Not `PRODUCTION READY`.

- API: OpenSearch yellow, store ~5.4MB, postgres hivearmor ~94.5MB, consumer group `hivearmor-event-processor` lag **0**, topic `hivearmor.raw.events`.
- Driver: `deploy/staging/verify-pipeline-signals.sh` / `verify-pipeline-signals-lag.sh`. Report `/var/tmp/hivearmor-pipeline-signals.json`.
- Soak dir: `~/hivearmor-slo-soak/` mounted read-only into backend.

## Completed this slice — Windows SCM 1056 / STOP_PENDING rotate LIVE

Status: staging Windows ACC-02 **LIVE VERIFIED** for packaged rotate-credential **exit 0** with harness recovery **disabled**. Root cause was `WaitForServiceState(false)` treating `STOP_PENDING` as stopped (start raced shutdown). Agent `StartService` also treats SCM **1056** as success only after `RUNNING`. Not a new Linux VM restore. Not `PRODUCTION READY`.

- Agent id **17**; `rotate_rc=0`; `PASS: rotate-credential exit 0 (no harness recovery)`.
- Role matrix still green (SOC 200 / Analyst 403 / unauthorized tenant 403).
- Driver: `run-pilot01-windows-remote.ps1` + strict `verify-packaged-windows-staging.ps1` (default no harness recovery).
- Build: staging cross-compile with wrap key → `hivearmor-agent-11.0.0-staging-windows-amd64`.

## Completed this slice — HNT-007 gates LIVE (WAR redeploy)

Status: staging **LIVE VERIFIED** for HNT-007 preview `permissionVersion`, `approvalRequired`, escalate-without-`approvalId` **400**, and `eventOutcomes` on `create_evidence`. Offline local Maven `-o -Pprod -DskipTests package` (no `MAVEN_TK`); WAR rsynced; `hivearmor/backend:local` rebuilt; backend healthy. SOC Manager approval-decision path is **LIVE VERIFIED** in the slice above. Not `PRODUCTION READY`.

- Driver: `deploy/staging/run-hnt007-gates-live.sh`. Report: `/var/tmp/hivearmor-hnt007-gates.json` (0600).
- `create_evidence` (1 event): `approvalRequired=false`, `permissionVersion` present; execute → `eventOutcomes` count **1** on incident **135**.
- `escalate_incident` / `create_investigation` preview: `approvalRequired=true`; escalate execute without `parameters.approvalId` → **400** `VALIDATION_ERROR` containing `APPROVAL_REQUIRED`.

## Completed this slice — SIEM-009 volume persist / second-host copy / SLO signals / legacy key cutover / HNT-007 gates (mixed)

Status: staging **LIVE VERIFIED** for Redpanda volume persist, Windows second-host backup copy, measured SLO/lag signals, and `ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=false` with signed `telemetry-once` + INTERNAL_KEY-alone **401**. HNT-007 gates were CODE COMPLETE then **LIVE VERIFIED** in the slice above. Windows SCM **1056** start treated as success when already running (**CODE COMPLETE** in agent `StartService`). Not a new Linux VM restore. Not WORM. Not a Grafana board. Not `PRODUCTION READY`.

- Redpanda: HWM before/after recreate **35**; topic `hivearmor.raw.events` survived. Report `/var/tmp/hivearmor-siem009-redpanda-volume.json`.
- Off-box: stamp `20260821T075407Z` on Windows `C:\ha-agent-test\offbox-backups\...` (hivearmor.dump, agentmanager.dump, snapshot tar). Report `/var/tmp/hivearmor-siem009-offbox-copy.json`.
- SLO signals: OS yellow, store ~4.7MB, consumer lag 0, topics listed. Report `/var/tmp/hivearmor-siem009-slo-lag.json`.
- Telemetry: removed `HA_INTERNAL_KEY` from `/etc/hivearmor/agent.env`; backend env `ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=false`; signed telemetry-once **accepted**; INTERNAL_KEY-only POST **401**.
- HNT-007 code: preview binds `permissionVersion` + principal; `approvalRequired` for escalate/investigation and large evidence; execute requires `parameters.approvalId` when gated; `eventOutcomes` on create_evidence.

## Completed this slice — SIEM-009 off-volume copy / Redpanda volume / ISM hot retention

Status: `LIVE VERIFIED` on staging for named Redpanda volume, off-OpenSearch-volume backup copy, ISM `ha-hot-retention` (14d delete for `v3-hive-*`), plus prior throwaway Postgres/OpenSearch restore drill. Not a new-VM restore. Not off-box WORM. Not an SLO dashboard. Not `PRODUCTION READY`.

- Compose: `redpanda_data` named volume; data migrated from anonymous volume; Redpanda **healthy**.
- Drill: `redpanda_named_volume=true`; OpenSearch snapshot **SUCCESS**; offhost dumps + `opensearch-ha-snapshots.tar.gz` under `/var/backups/hivearmor-offhost/<stamp>/` (0600); confirmed path is outside OpenSearch data volume source.
- ISM policy `ha-hot-retention` present (`v3-hive-*` → delete after 14d).
- Throwaway restore counts matched (incidents 42, evidence 1, retention 9, users 8); renamed restore docs matched.
- Driver: `deploy/staging/run-siem009-backup-restore.sh`. Report: `/var/tmp/hivearmor-siem009-backup-restore.json` (0600). Runbook: `BACKUP-RESTORE.md`.

## Completed this slice — Windows SCM packaged-host (ACC-02 / PILOT-01 Windows)

Status: `LIVE VERIFIED` on Windows Server 2019 Datacenter x64 (`EC2AMAZ-8F0Q7DL`, `54.160.142.254` / `172.31.16.134`) against staging `172.31.17.117`. Includes Admin/SOC/Analyst role matrix. Lab used `skipCertValidation=yes`. Not `PRODUCTION READY`.

- Admin login 200; enrollment token create **201**; packaged install → `HiveArmorAgent` SCM; agent ids through **14** on successive runs.
- Credential rotate/revoke + secret-free audit passed (one SCM **1056** race recovered by harness).
- Role users `soc.manager` (`ROLE_SOC_MANAGER`) and `analyst.chen` (`ROLE_ANALYST`) bound to tenant **1**; passwords in `C:\ha-agent-test\secrets\*.pass` (not printed).
- From Windows host: Admin list **200**, SOC Manager list **200**, Analyst list **403**, SOC Manager + tenant **3812** **403**. Report: `C:\ha-agent-test\hivearmor-pilot01-windows-role-matrix.json`.
- Drivers: `deploy/staging/run-pilot01-windows-remote.ps1`, `run-pilot01-windows-role-matrix.ps1`, `verify-packaged-windows-staging.ps1` (unauthorized-tenant check uses SOC token, matching Linux).

## Completed this slice — CIS catalog / FIRST EPSS / signed ingest (staging live)

Status: `LIVE VERIFIED` on staging for catalog honesty, not-configured connectors, forged-key 401, FIRST.org reachability, and signed `telemetry-once` from enrolled agent **9**. Not official licensed CIS. Not `PRODUCTION READY`.

- `GET /api/ha-cis/catalog`: 2 packs — `ha-linux-observed-ssh` `SHIPPED_OBSERVED` (3 reporting agents) and `cis-linux` `LICENSE_REQUIRED_NOT_SHIPPED` (0). No CIS recommendation text.
- `GET /api/ha-vuln/remediation-connectors`: 3 connectors, all `not_configured`.
- Forged `X-Agent-Key`: **401**. Missing auth: **401**.
- Findings table has one placeholder CVE id that is not a FIRST CVE; EPSS was **not** stored. Host FIRST probe `CVE-2021-44228` HTTP **200**, 1 row. `findings_with_stored_epss=0`.
- Signed ingest: rebuilt `hivearmor_agent_service` posted SCA/SBOM with device identity. Agent id **9**. `ha_sca_result` count **4**, `ha_sca_summary` count **1**. Credential was not revoked.
- Staging still sets `ALLOW_LEGACY_TELEMETRY_INTERNAL_KEY=true` for `telemetry-loop`. Driver: `deploy/staging/run-cis-epss-signed-ingest.sh`. Report: `/var/tmp/hivearmor-cis-epss-signed.json` (0600).

## Completed this slice — PostgreSQL dump / OpenSearch snapshot restore drill (SIEM-009 / ACC-12 subset)

Status: `LIVE VERIFIED` on staging for throwaway Postgres restore counts and a renamed OpenSearch snapshot restore. Not a new-VM rebuild. Not off-host WORM. Not an SLO dashboard. Not `PRODUCTION READY`.

- `hivearmor` dump 8,887,462 bytes; `agentmanager` dump 24,326 bytes; files mode 0600 under `/var/backups/hivearmor`.
- Throwaway DB `hivearmor_restore_drill`: `hive_incident` 42/42, `hive_evidence_item` 1/1, `hive_retention_policy` 9/9, `jhi_user` 8/8, then dropped.
- OpenSearch cluster **yellow**, store **3,239,131** bytes, 6 `v3-hive-*` indices, snapshot **SUCCESS**, renamed restore **1** doc matched, restore-drill index deleted.
- Daily `hivearmor-backup.timer` enabled (next ~2026-08-20 00:11 UTC). Redpanda has no compose volume; broker restore was not attempted.
- Driver: `deploy/staging/run-siem009-backup-restore.sh`. Runbook: `deploy/staging/BACKUP-RESTORE.md`.

## Completed this slice — Enrollment audit retention/export (SIEM-009 subset)

Status: `LIVE VERIFIED` on staging for append-only source + safe NDJSON export + table dump. Not full PILOT-08 (SLO dashboards, OpenSearch snapshots, 24h soak, cluster restore). Not Analyst 403 on this host (pass file missing). Not `PRODUCTION READY`.

- `GET /api/ha-agent-enrollments/audit/export`: HTTP 200, **25** rows, `X-Audit-Source-Policy: append-only`, no forbidden secret field names. Counts matched list `X-Total-Count` and `agentmanager.enrollment_audit_events` tenant 1.
- `GET /api/ha-retention-policies/ENROLLMENT_AUDIT`: `sourceImmutable=true`, `archiveTarget=NONE`. PUT `archiveTarget=S3`: **400**.
- Postgres `DELETE` on `enrollment_audit_events` rejected. `pg_dump --data-only` of that table written mode **0600** (`dump_bytes` recorded; contents not printed).
- Driver: `deploy/staging/run-enrollment-audit-export.sh`. Runbook: `deploy/staging/ENROLLMENT-AUDIT-RETENTION.md`.

## Completed this slice — Hunt evidence live path (HNT-007)

Status: `LIVE VERIFIED` on staging for snapshot-bound `create_evidence` into `hive_evidence_item`. Not approval-gated. Not `PRODUCTION READY`.

- `POST /api/ha-hunts/search` `*:*` last 14 days: **11** events, `searchId` present.
- Preview without `searchId`: **400** `MISSING_SEARCH_ID`. Unknown search / event outside snapshot: **404**.
- Preview + execute `create_evidence` with `parameters.incidentId=135`: **200** `status=created`. `GET /api/ha-incidents/135/evidence-items` count **1**. Postgres `hive_evidence_item` matching `source_ref` **1**.
- Driver: `deploy/staging/run-hunt-evidence-live.sh`. Event payloads were not printed.

## Completed this slice — Packaged-host enrollment role matrix (PILOT-01 Linux)

Status: `LIVE VERIFIED` on the staging Ubuntu packaged host. Not Windows SCM. Not `PRODUCTION READY`.

- `GET /api/ha-agent-enrollments` from this host: Admin **200**, SOC Manager **200**, Analyst **403**, SOC Manager + existing tenant `3812` (no membership) **403**.
- Driver: `deploy/staging/run-pilot01-role-matrix.sh`. Passwords stay in `0600` files under `/home/ubuntu/ha-agent-test/role-matrix-secrets/`. SOC/Analyst are members of tenant **1** only.

## Completed this slice — Enrolled packaged Linux `HiveArmorAgent` (PILOT-01 Linux)

Status: `LIVE VERIFIED` on staging Ubuntu for packaged install, systemd start/stop/restart, credential rotate, revoke, and secret-free enrollment audit. Not Windows SCM. Not SOC Manager/Analyst or cross-tenant matrix from the packaged host. Lab used skip-cert `yes`. Not `PRODUCTION READY`.

- `RegisterAgent` sends platform `linux|windows|darwin` from OS type, not distro (`ubuntu`).
- Staging publishes **9001** for `version.json`. Driver: `deploy/staging/run-pilot01-linux.sh`.
- Evidence: token id `22c5b5de-2e73-4909-aa9f-e6cc264c089f`, agent id **8**, `HiveArmorAgent` **active**, report `/var/tmp/hivearmor-pilot01-linux-report.json`. Role matrix is a later slice.

## Completed this slice — Endpoint observed telemetry producer

Status: `CODE COMPLETE`. Producer path is `LIVE VERIFIED` via systemd `telemetry-loop` on staging. Not enrolled `HiveArmorAgent`. Not `PRODUCTION READY`. Not official CIS.

- Agent `telemetry` package posts `POST /api/ha-telemetry/sca` (`packId=ha-linux-observed-ssh`) and CycloneDX 1.5 `POST /api/ha-telemetry/sbom` when `HA_INTERNAL_KEY` is set. Optional `HA_TENANT_ID`.
- Linux checks read `/etc/ssh/sshd_config`, `/etc/login.defs`, `/etc/passwd`. Unset directives are `NOT_APPLICABLE`. Non-Linux hosts send one `NOT_APPLICABLE` OS check.
- SBOM components come from `dpkg-query` or `rpm`. Backend matches CVEs via OSV `querybatch` (air-gap skip). Numeric CVSS only when OSV returns a number. No EPSS, no invented KEV.
- Internal ingest accepts `Utm-Internal-Key` or `X-Internal-Key`. Sharing `INTERNAL_KEY` with agents is staging-only; agent-manager signed ingest is still required for fleet.

## Completed slice — Vulnerability Operations

Route: `/posture/vulnerabilities`

Objective: replace the basic CVE table with a compact, accessible, long-duration vulnerability-operations workspace while remaining honest about the existing backend.

### Existing capability inspected

- Frontend service calls `GET /api/ha-vuln/findings`, `/findings/summary` and `/findings/agent/{agentId}`.
- Backend accepts exact agent ID, severity, KEV flag, partial CVE, first-seen range, numeric page and size.
- Backend returns package/installed/fixed version, CVSS v3, severity, KEV flag, description and observation timestamps.
- Endpoint authorization currently allows Analyst, Admin and SOC Manager.
- Ordering is CVSS descending then KEV descending with offset pagination.

### Known limitations to preserve visibly

- No authoritative tenant-scope descriptor or visible tenant predicate was found in the service query.
- No signed snapshot cursor, deterministic ID tie-break, previous/next token or maximum size clamp was observed.
- Summary is a separate multi-query fleet snapshot and is not bound to the active filters or list snapshot.
- The DTO has references, but the inspected mapper does not populate them.
- Backend exceptions collapse to empty results, preventing the UI from distinguishing “no findings” from partial/dependency failure.
- No EPSS, exploit maturity, reachability, internet exposure, asset criticality, alert/path correlation, remediation workflow, provenance or governed risk acceptance is exposed.
- No row-detail endpoint or progressive evidence subresources exist.

### UI implementation boundary

Implement only defensible behavior over the existing contract:

- compact identity header and fleet summary;
- CVE search, severity, KEV and first-seen window filters;
- cancellable 50-row server pagination with stable client caching;
- virtualized dense grid, icon density controls and sticky pager/status dock;
- keyboard `/`, `J`, `K`, `Enter`, `Escape` behavior;
- full-height finding drawer with actual package, host, version, timestamps, description and copy/hunt/asset pivots;
- loading, empty, stale refresh, permission and dependency-error states;
- no simulated remediation, EPSS or “risk score” in production.

### Verification completed

- focused page and service tests: 7 passed;
- `npm run type-check`: passed;
- `npm run lint`: passed;
- complete `npm run test`: 1,046 passed across 165 files; two non-fatal jsdom navigation warnings were emitted;
- `npm run build`: passed;
- authenticated fixture-disabled browser review at `http://127.0.0.1:4176/posture/vulnerabilities`: passed with zero console warnings/errors. Live backend returned zero rows, so real row/drawer rendering remains test-verified rather than live-data-verified.

Backend requirements are timestamped as `VUL-001` through `VUL-007`. This slice is `UI IMPLEMENTED`, `CONTRACT RECORDED` and `LIVE VERIFIED` for the zero-row/error-safe workflow; it is not `PRODUCTION READY` because the backend remains partial.

## Completed slice — CIS Benchmark Posture

Route: `/posture/cis-benchmark`

Objective: replace the basic current-result table with an evidence-led, compact security-configuration assessment workspace while representing the partial backend honestly.

### Existing capability inspected

- Role-protected `GET /api/ha-cis/results`, `/results/summary` and `/results/agent/{agentId}` provide current checks and per-agent/pack counts.
- Exact agent/check/status/level filters and offset paging exist; results include observed/expected values, remediation text, mappings and scan time.
- `POST /api/ha-telemetry/sca` accepts an untyped asynchronous assessment payload and upserts current results/summaries.
- No checked-in endpoint-agent SCA producer was found. Tenant isolation, benchmark/version/applicability metadata, evidence provenance and remediation lifecycle remain incomplete.

### UI and research completed

- Compact failed-check priority view with weighted technical pass rate, explicit error and not-applicable measures, exact check/outcome/profile/endpoint filters, 50-row cancellable server paging, stable caching, virtualized dense grid, icon density controls and sticky pager/status dock.
- Keyboard `/`, `J`, `K`, `Enter`, `Escape`; permission, dependency, partial-summary, stale-refresh, filtered-empty and safe unfiltered-empty states.
- Full-height actual-field context with observed/expected evidence, remediation guidance, mappings, copy and asset/hunt/compliance pivots. Unsupported mutation controls are withheld.
- Offline research: `research/security-configuration-assessment.md`.
- Backend contracts: `CIS-001`–`CIS-008` with timestamped reconciliation.

### Verification completed

- focused page and service tests: 8 passed;
- `npm run type-check`: passed;
- `npm run lint`: passed with zero warnings;
- complete `npm run test`: 1,052 passed across 166 files; two non-fatal jsdom navigation notices were emitted;
- `npm run build`: passed;
- authenticated fixture-disabled browser review at `http://127.0.0.1:4176/posture/cis-benchmark`: passed with both priority and unfiltered safe-empty states and zero console warnings/errors. Live backend returned zero rows, so actual row/drawer rendering remains test-verified.

This slice is `UI IMPLEMENTED`, `CONTRACT RECORDED` and `LIVE VERIFIED` for the current zero-row workflow. It is not `BACKEND IMPLEMENTED` or `PRODUCTION READY` for the newly recorded requirements.

## Completed — Production-minimum SIEM pilot, Phase 0

Scope: installer, release pipeline, agents, agent-manager, inputs plugin, Redpanda, event processor, OpenSearch, backend operational APIs and `frontend-v3` packaging.

Objective: freeze the canonical pilot contract and establish a reproducible validation baseline before changing enrollment, ingestion or persistence behavior.

Mandatory references:

- `docs/ai-handoff/production-minimum-backend-plan.md`
- `docs/ai-handoff/backend-implementation-ledger.md`
- `docs/ai-handoff/research/production-siem-foundation.md`
- `docs/frontend-backend-contract-register.md` contracts `SIEM-001`–`SIEM-010` and `DET-ING-001`
- `.agents/skills/api-contract-review/SKILL.md`
- `.agents/skills/detection-engineering/SKILL.md`
- `.agents/skills/docker-patterns/SKILL.md`
- `.agents/skills/ship-gate/SKILL.md`

Implemented:

1. Canonical service/port/network/volume/topic/schema ownership and deprecation map in `docs/architecture/production-pilot-topology.md`.
2. Machine-readable `ha.raw-event.v1` schema and compatibility policy under `docs/contracts/`.
3. Inputs producer envelope, tenant/source partition key, schema/identity headers, `acks=all` and disabled topic auto-creation.
4. Event-processor envelope/header/cross-field validation, schema-downgrade rejection and measured legacy compatibility.
5. Producer and consumer automated tests plus cross-service Go, frontend, Compose and Java baseline evidence.
6. Pilot threat model, data classification, secrets inventory and timestamped legacy-envelope sunset.

Status: `CODE COMPLETE`; no live broker or real-agent claim. The full Java baseline remains red on pre-existing property-test errors and a Surefire fork exit; the 2026-08-18 rerun is itemized in `validation-evidence.md`.

## Completed — Production-minimum SIEM pilot, Phase 1 identity ingress

Work ID: `PILOT-02`  
Contract: `SIEM-003`  
Status: `LIVE VERIFIED` as of **2026-08-18 19:55:01 IST** for enrolled ProcessLog identity, forged-tenant denial, oversized rejection, burst retry-after and revoked-credential denial against rebuilt local-dev images. Not `PRODUCTION READY`.

Implemented:

1. Agent-manager internal-key RPCs `VerifyConnectorIdentity` and `ListConnectorAuthorization`. Verify returns tenant, opaque UUID and version and never echoes the presented secret. Authorization pages are clamped to 100 rows and contain no keys.
2. `ListAgents`, `ListCollector` and `ListAgentCommands` clamp page size to 100. Collector list/delete paths no longer project or log collector secrets.
3. Inputs stopped the 100,000-row plaintext key sync. Cache entries store identity plus a SHA-256 digest of the presented secret.
4. Ingress binds tenant from verified agent identity. Producer tenant values that differ are rejected. Connection-key HTTP, GitHub HMAC, OTLP and collector credentials without a tenant fail closed.
5. gRPC/HTTP ingest and OTLP receivers cap messages at 4 MiB. Per-connector and per-tenant token buckets, a two-stream connector cap and `Retry-After` are enforced.
6. `ha.raw-event.v1` producer keys are `tenantId:connectorId`. Connector type/id are required on new envelopes.

Remaining (not closed by this phase):

1. Collector tenant binding. Collectors currently have no tenant field; verify fails closed with `FailedPrecondition`.
2. Cloud input plugins still assign the hard-coded default tenant UUID.
3. Device mTLS remains `SIEM-007`. Backend Java stubs were not regenerated.

## Completed — Production-minimum SIEM pilot, Phase 1 enrollment

Work ID: `PILOT-01`  
Contract: `SIEM-002`  
Status: `CODE COMPLETE` as of **2026-08-18 16:59:20 IST**. Not packaged-host `LIVE VERIFIED`. Not `PRODUCTION READY`.

Remaining evidence is tracked under `PILOT-09` / `SIEM-010` / `SIEM-009`:

1. Run `agent/release/verify-packaged-linux.sh` on a supported Linux host and `agent/release/verify-packaged-windows.ps1` on a supported Windows host, then capture the generated JSON reports plus service-manager evidence.
2. From the actual packaged hosts, confirm the authenticated HTTP role matrix with Admin, SOC Manager and Analyst credentials, and include an unauthorized existing-tenant/cross-tenant case when a second tenant is available.
3. Define production retention/export for the append-only audit table — **live-verified 2026-08-19 20:35:00 IST** for NDJSON export, append-only DELETE rejection, and table dump. Full-cluster restore and WORM destination remain open.

## Completed — Production-minimum SIEM pilot, Phase 2 durable collection

Work ID: `PILOT-03`  
Contract: `SIEM-004`  
Status: `LIVE VERIFIED` as of **2026-08-18 22:14:41 IST** for local-dev broker-outage + agent SQLite spool (no acknowledged loss). Not a packaged systemd agent. Not `PRODUCTION READY`.

Implemented:

1. Endpoint collectors persist each log to SQLite before the memory send queue. A full queue is not a drop when the spool write succeeded; `CleanCountedLogs` retries unprocessed rows.
2. Quota reclaim deletes processed rows only. Default retention is 512 MB, capped at 4096 MB.
3. When Kafka is configured, publish retries with exponential backoff and returns an error; the engine socket is not a Kafka fallback.
4. Parse failures go to `hivearmor.raw.events.quarantine` with a redacted reason header. The original offset commits only after the quarantine write succeeds. Write failures stay uncommitted. `hivearmor.raw.events.retry` is reserved.
5. Raw, quarantine and retry topics pin `max.message.bytes=4194304`.

Remaining:

1. `hivearmor-collector` and `as400` still drop on full memory queues.
2. Encrypted spool contents and a write-failure retry budget.

## Completed slice — Wave 1 staging-minimum SIEM (`PILOT-04`–`07` + M6)

Branch: `staging/siem-mvp`  
Status: `CODE COMPLETE` / **`STAGING CANDIDATE` artifacts**. Not `LIVE VERIFIED` on a clean VM. Not `PRODUCTION READY`.

- PILOT-04: typed `ProcessingOutcome`, persist-before-commit, crash-point tests.
- PILOT-05: versioned CEL pilot pack and telemetry matrix.
- PILOT-06 subset: verified OpenSearch TLS, reject lab secrets, inject disabled on staging.
- PILOT-07: frontend-v3 image, edge TLS proxy, staging Compose with private data ports.
- M6: alert mutation DTOs + `@PreAuthorize`; keyword search via `GET /ha-search/timeline` on `v3-hive-log-*`.

## Completed — Localhost SIEM + admin completeness

Branch: `staging/siem-mvp` (worktree uncommitted in this slice).  
Status: `LIVE VERIFIED` on this Darwin local-dev host with fixtures off. Not a staging VM. Not `PRODUCTION READY`.

- Mission Control 24h trend uses `GET /api/overview/alert-timeline`. Analyst-capacity and recent-activity stay contract-unavailable. `GET /api/overview/events-in-time` is 500 and is not used.
- Masthead `selectedTenantId` persists in `sessionStorage["ha_selected_tenant_id"]`. Reload keeps **Acme**.
- Incident Notes tab wraps existing activity-notes (`GET/POST /api/ha-incidents/{id}/activity[/notes]`). PG-only seed incidents 404 on activity — honest empty/error.
- Admin tenants and audit stay honest on live HTTP 500. Scheduled Reports now allows Platform Administrator (Analyst-or-higher). Endpoint list uses `SiemDataGrid` without the AG Grid overlay console error.
- SEC-03 (finding status), SEC-05 (remote agent actions), and GAP-SEC-06 (visualization run) remain disabled.

Follow-on is still Wave 2 VM install below. Do not stamp `PRODUCTION READY`.

## Completed this slice — Packaged Linux systemd observed telemetry

Status: `LIVE VERIFIED` on staging Ubuntu for `hivearmor-telemetry.service` (`telemetry-loop` + `/etc/hivearmor/agent.env`). Not enrolled `HiveArmorAgent` rotate/revoke. Not official CIS. Not `PRODUCTION READY`.

- `hivearmor_agent_service install` writes `/etc/systemd/system/HiveArmorAgent.service.d/10-telemetry.conf` (`EnvironmentFile=-/etc/hivearmor/agent.env`). Existing env files are not overwritten.
- Packaged `hivearmor-telemetry.service` and `linux-telemetry.env.example` ship with Linux agent archives.
- Staging: unit active, env mode `0600`, unit has no `HA_INTERNAL_KEY`, `EnvironmentFiles=/etc/hivearmor/agent.env`, SCA `scanned_at=2026-08-19 12:58:18 UTC` matches `ActiveEnterTimestamp`. Agent `staging-vm`: 4 SCA checks (HA-LOGIN-01 FAIL, SSH N/A, USER PASS) and 400 SBOM components.

## Historical active record — Wave 2 live staging install (superseded as the active page slice)

Work ID: `PILOT-07` live install  
Contracts: `SIEM-008`, ACC-01/04/05/06/10/11/14

Objective: install `deploy/staging` on a dedicated Linux VM with non-default secrets. Do not start it on this Darwin host while local-dev owns 443/50051/9000. Enroll a Linux agent, fire one positive and one negative pilot detection into `/alerts` and keyword `/search` without `/v1/inject` (ACC-14), revoke, restart processor. Staging Compose now sets `POSTGRESQL_HOST=postgres` so tenant-prefix writes work. ACC-09 was rehearsed on local-dev (`local-dev/tests/pilot-broker-outage.sh`). Do not stamp `PRODUCTION READY`.

Mandatory references:

- `deploy/staging/INSTALL.md`
- `docs/ai-handoff/pilot-telemetry-matrix.md`
- `docs/ai-handoff/backend-implementation-ledger.md`

## Queue after the active slice

1. After wall-clock (~**2026-08-22 09:25 UTC**): re-run `deploy/staging/collect-siem009-soak-pack.sh` for `LIVE_VERIFIED_24H_SOAK` (timer already enabled; collector + Admin history shipped).
2. Restore onto a **brand-new Linux VM** — **deferred until after production-ready**.
3. Optional external AWS S3 Object Lock (`HA_WORM_MODE=s3`) when operator credentials/bucket exist (MinIO COMPLIANCE drill already live).
4. Optional external Grafana board (Admin soak history already covers measured series in-product).
