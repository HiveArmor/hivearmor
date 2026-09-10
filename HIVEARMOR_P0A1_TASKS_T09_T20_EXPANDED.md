# HIVEARMOR P0-A1 — TASK BREAKDOWNS T09–T20 (EXPANDED)

> Date: 2026-09-09 · **PLAN ONLY — no code, no migrations, no `.proto` edits, no commits.**
> Companion to `HIVEARMOR_P0A1_TENANT_SECURITY_IMPLEMENTATION_PLAN.md` and the T02–T08 expansion. Anchors re-verified this session. Template per task: Problem · Current · Target · Files/methods · DB · API · gRPC · Security · Backward compat · Steps · Unit · Integration · Negative · Rollback · Complexity · Risk · Deps · Acceptance.

---

## P0A1-T09 — EDR event tenant scoping (read paths)

**Problem:** EDR reads (timeline, process tree, query, quarantine list) filter by `agentId` only, no tenant — an actor can read another tenant's events by supplying that tenant's agent id.
**Current:** `EdrResource.queryEvents` (`/api/edr/events`, `@PreAuthorize(READ_AUTH)`) takes `agentId` and calls `edrService.queryEvents(agentId, …)` (`EdrResource.java:127`). `HaEdrResource` timeline/process-tree/quarantine (`:84,:115,:150`) take `agentId` and call `haEdrService`/`haEdrQuarantineService` — none scope by tenant. `UtmEdrEventRepository` has `findByAgentId`/`findByEventType`/`findFiltered` with no tenant param.
**Target:** every EDR read resolves `tenant_id = ? AND …`; the `tenant_id` column added in T08 is the scope key.
**Files/methods:** `EdrService.queryEvents`; `HaEdrService.fetchTimeline`/`fetchProcessNodes`; `HaEdrQuarantineService.listQuarantinedFiles`; `UtmEdrEventRepository` (add tenant-scoped finders, e.g. `findByTenantIdAndAgentId…`); controllers pass `TenantScope.requireTenant()`.
**DB:** uses T08 `tenant_id` column + composite index `(tenant_id, event_time)`. **API:** unchanged shape; scoped. **gRPC:** none.
**Security:** an `agentId` belonging to another tenant returns empty/404 — never that tenant's events; scope at the repository query, not post-filter.
**Backward compat:** during T08 backfill, rows with null tenant are excluded from tenanted reads (safe — no cross-tenant leak); after backfill they resolve normally.
**Steps:** 1. Add tenant-scoped repository finders. 2. Thread `long tenant = requireTenant()` through `EdrService`/`HaEdrService`/`HaEdrQuarantineService` read methods. 3. Return 404 when a requested `agentId` is not in the actor's tenant (verify agent ownership first, §15).
**Unit:** service passes tenant into the repo call. **Integration (Spring):** userA GET timeline `?agentId=<B agent>` → empty/404; queryEvents never returns B events. **Negative:** `edrTimeline_tenantScoped`, `edrQueryEvents_excludesForeignTenant` (T18 §6).
**Rollback:** flag `edr_event_tenant` (shared with T08). **Cx:** M · **Risk:** High · **Deps:** T08 · **Acceptance:** no EDR read returns another tenant's events.

---

## P0A1-T10 — `/api/collectors` authorization

**Problem:** `UtmCollectorResource` has NO `@PreAuthorize` (class or method) and is not in `SecurityConfiguration` permitAll → authenticated but unauthorized; any authenticated principal can upsert/delete collector config.
**Current:** `UtmCollectorResource` (`:37-114`): `@PostMapping("/config")`, `@GetMapping`, `@GetMapping("/{collectorId}/module-groups")`, `@PutMapping("/asset-group")`, `@GetMapping("/asset-groups")`, `@GetMapping("/search-by-filters")`, `@DeleteMapping("/{id}")` — none annotated; has `@AuditEvent` only.
**Target:** per-method `@PreAuthorize` using existing HiveArmor RBAC constants (mirror `AgentPolicyResource` READ_AUTH/MUTATE_AUTH); no new framework.
**Files/methods:** `UtmCollectorResource` (add annotations + `READ_AUTH`/`MUTATE_AUTH` constants).
**DB:** none. **API:** authorization added (behavior). **gRPC:** none.
**Security:** reads → `hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER','ROLE_ANALYST')`; mutations (`POST /config`, `PUT /asset-group`, `DELETE /{id}`) → `hasAnyAuthority('ROLE_ADMIN','ROLE_SOC_MANAGER')`.
**Backward compat:** callers with the right role unaffected; unauthorized callers now correctly 403 (was a silent gap).
**Steps:** 1. Add `READ_AUTH`/`MUTATE_AUTH` constants. 2. Annotate each method. 3. Confirm `SecurityConfiguration` default `.anyRequest().authenticated()` still covers the path (it does — not in permitAll).
**Unit/Spring:** `collectorRead_requiresAuthority`, `collectorRead_analystAllowed`, `collectorCreate_analystDenied`, `collectorCreate_socManagerAllowed` (T18 §7).
**Rollback:** remove annotations (reverts to gap) — flag not needed; annotation is low-risk.
**Cx:** S · **Risk:** High · **Deps:** — · **Acceptance:** every `/api/collectors` method requires authorization.

---

## P0A1-T11 — Collector tenant scoping

**Problem:** collectors must not be read/mutated across tenants where they carry an owning tenant.
**Current:** `UtmCollector` domain (`domain/collector/UtmCollector.java`) has `status, collector_key, ip, hostname, version, module, last_seen, group_id` — **no direct `tenant_id` column**; tenancy is via the **asset-group / `group_id`** ownership (agent-groups carry tenant). So collector→tenant resolves through its group.
**Target:** scope collector reads/mutations to the actor's tenant via the owning group's tenant; a collector whose group belongs to another tenant is 404 on access / 403 on mutate.
**Files/methods:** `UtmCollectorResource`, the collector service, and the group→tenant resolution (reuse `AgentGroupResource`/group ownership). If group→tenant is indirect, resolve `group_id → group.tenant_id`.
**DB:** no new column on collector (uses `group_id` → group tenant); verify agent-group carries tenant (it does per policy/group model). **API:** scoped. **gRPC:** none.
**Security:** cross-tenant collector by id → 404; cross-tenant modify → 403/404.
**Backward compat:** collectors with no group (`group_id` null) → treat as system/shared or tenant-unassigned per the admin model (T15); do not silently expose across tenants.
**Steps:** 1. Resolve owning tenant via `group_id`. 2. Scope list/get/delete/asset-group to the actor's tenant. 3. Handle null-group collectors explicitly (flag for the admin model).
**Unit:** group→tenant resolver. **Integration:** `collectorDelete_crossTenant_notFound`, `collectorModify_crossTenant_denied` (T18 §7).
**Rollback:** flag `collector_tenant_scope`. **Cx:** M · **Risk:** Med · **Deps:** T10 · **Acceptance:** collectors tenant-scoped where an owning group exists; null-group handled explicitly. *(NOTE: if collector tenancy proves to require a direct column, that is a small follow-on — flag, do not expand scope here.)*

---

## P0A1-T12 — Response target tenant authorization (pre-dispatch)

**Problem:** response actions dispatch to an agent by id/hostname with no actor-tenant vs target-tenant check.
**Current:** all EDR response paths funnel through `EdrService.sendCommand(...)` (`EdrService.java:155,187,243,266,282`) → `PanelService.processCommand` gRPC stream (`service/grpc/PanelService.java:17-30`, INTERNAL_KEY). Entry points: `EdrResource` isolate (`:246`), `HaEdrResource` quarantine PATCH/bulk, incident websocket `sendCommand(agentDTO.getId(),…)` (`UTMIncidentCommandWebsocket.java:63`), `HaResponseActionResource` (`:201`). None verify the target agent's tenant against the actor's.
**Target:** before ANY `sendCommand`/dispatch, enforce `actor tenant == target agent tenant` AND the action's RBAC authority. Check happens **before** the INTERNAL_KEY gRPC call.
**Files/methods:** `EdrService` (add a `requireSameTenantTarget(agentId/hostname)` guard at the top of each `sendCommand`-calling method); the incident websocket path; `HaResponseActionResource`.
**DB:** none (uses tenant-scoped agent lookup from T05). **API:** behavior. **gRPC:** guard sits before `PanelService.processCommand`.
**Security:** authorization only (no signing yet — that is a later batch); resolve target tenant via the tenant-scoped `getAgentByHostname`/by-id (T05) so a cross-tenant target simply doesn't resolve.
**Backward compat:** same-tenant same-role actions unchanged (positive control).
**Steps:** 1. Add a central guard: resolve target agent within the actor's tenant (reuse T05); if not found → 404 pre-dispatch. 2. Check the action's RBAC authority (kill/quarantine/isolate = MUTATE-class). 3. Apply the guard at every `sendCommand` call site + the websocket + response-action service. 4. Emit an audit event on deny (T17).
**Unit:** guard rejects cross-tenant target; allows same-tenant. **Integration:** `isolate/kill/quarantine/restore_crossTenantTarget_denied`, `incidentWebsocket_sendCommand_crossTenant_denied`, `response_sameTenant_authorized`, `response_sameTenant_wrongRole_denied` (T18 §8).
**Rollback:** flag `response_tenant_authz`. **Cx:** L · **Risk:** Critical · **Deps:** T05 · **Acceptance:** no actor can dispatch a response to another tenant's endpoint; check is pre-dispatch.

---

## P0A1-T13 — `unique(tenant_id, hostname)` agent constraint

**Problem:** `Agent.Hostname` is **globally unique** (`uniqueIndex:idx_hostname_deleted`), which (a) blocks two tenants from using the same hostname and (b) leaks existence across tenants.
**Current:** manager `models.Agent` — `Hostname string gorm:"uniqueIndex:idx_hostname_deleted;not null"` (+ `DeletedAt` in the same index).
**Target:** `unique(tenant_id, hostname, deleted)` so a hostname is unique **within** a tenant, not globally. (Only this constraint is in P0-A1 scope; full identity redesign is P0-B.)
**Files/methods:** manager `models/agent.go` gorm tag; the manager GORM auto-migrate (`database/migration.go:7`) applies the index change — but an index redefinition on an existing table needs a guarded migration step, not a silent auto-migrate diff.
**DB:** drop `idx_hostname_deleted`, create `idx_tenant_hostname_deleted (tenant_id, hostname, deleted_at)`. Pre-check: no existing duplicate `(tenant_id, hostname)` before adding unique (data-integrity guard).
**API/gRPC:** none.
**Security:** removes the global-hostname existence leak; enables per-tenant duplicate hostnames (needed for T05 duplicate handling).
**Backward compat:** existing rows must satisfy the new uniqueness; if a legacy duplicate exists across tenants it now becomes valid (was previously impossible), so no conflict; a within-tenant duplicate (shouldn't exist) is flagged by the pre-check.
**Steps:** 1. Data pre-check for within-tenant duplicates. 2. Change the gorm uniqueIndex to include `tenant_id`. 3. Guarded migration (drop old index, create new) — not a blind auto-migrate. 4. Verify T05 duplicate-hostname tests pass.
**Unit:** model tag reflects composite unique. **Integration:** two tenants create `web01` successfully; within-tenant duplicate rejected.
**Rollback:** revert index (blocks cross-tenant duplicates again) — coordinate with T05.
**Cx:** M · **Risk:** Med · **Deps:** T02/T03 (tenant on agent) · **Acceptance:** hostname unique per tenant, not globally.

---

## P0A1-T14 — Background/internal service tenant context

**Problem:** agent-touching jobs that don't run under an interactive `TenantContext` could query all tenants silently.
**Current (enumerated this session):** `@Scheduled` services touching agents/collectors: `service/agent_manager/AgentService.java`, `service/agents_manager/UtmAgentPolicyService.java`, `service/UtmDataInputStatusService.java`, `service/network_scan/AssetSynchronizationService.java`, `service/alert_response_rule/UtmAlertResponseRuleService.java`, `service/sigma/SigmaSyncService.java`.
**Target:** each either (a) iterates tenants explicitly and sets `TenantContext.set(tenantId, prefix)` per tenant with a matching `clear()`, or (b) runs under a clearly-labeled, audited **system context** — never an implicit all-tenants query.
**Files/methods:** the six services above (audit each; classify per-tenant vs system).
**DB:** none. **API/gRPC:** none.
**Security:** no silent tenant-boundary bypass in background flows; a system context is explicit and audited.
**Steps:** 1. For each service, determine whether its query is endpoint-scoped. 2. If per-tenant: loop tenants, set/clear TenantContext. 3. If genuinely cross-tenant system work (e.g. sync): mark a documented system context + audit. 4. Add a code-review rule: no endpoint-scoped query in a scheduled worker without an explicit tenant or system flag.
**Unit:** each worker sets a tenant or a system context. **Integration:** `backgroundJob_noSilentAllTenants` (T18 §9) — assert the query is scoped or system-flagged.
**Rollback:** per-service; low blast radius. **Cx:** M · **Risk:** Med · **Deps:** T01 · **Acceptance:** no background flow silently spans all tenants.

---

## P0A1-T15 — Admin / selected-tenant model + audit

**Problem:** ADMIN must not implicitly bypass tenant filters.
**Current:** `TenantContext` supports a client id/prefix; there's no explicit "system-admin selects a tenant" model documented for agent flows.
**Target:** document the intended model — an MSSP admin operates within a **selected tenant context** (explicit switch, audited), not an implicit filter bypass. If genuine cross-tenant admin is required, design system-admin-context + selected-tenant + audit record.
**Files/methods:** `TenantContext`, the admin/tenant-switch flow, audit via `ApplicationEventService`.
**DB:** none. **API:** an explicit tenant-selection is authoritative for the request. **gRPC:** the selected tenant flows as the `ListRequest.tenant_id` (T02).
**Security:** ADMIN ≠ unrestricted; cross-tenant access is explicit + audited.
**Steps:** 1. Document current intended model. 2. Ensure agent reads use the *selected* tenant, not "all". 3. If system-admin cross-tenant is required, gate it behind an explicit system context + audit. 4. Tests below.
**Unit:** ADMIN with no selected tenant → own tenant only. **Integration:** `admin_noImplicitCrossTenant`, `admin_selectedTenantContext_audited` (T18 §9).
**Rollback:** doc + flag. **Cx:** M · **Risk:** Med · **Deps:** T02,T14 · **Acceptance:** admin cross-tenant access is explicit and audited, never implicit.

---

## P0A1-T16 — Error-semantics convention

**Problem:** inconsistent 403/404/empty responses risk tenant-existence disclosure.
**Current:** controllers return mixed error responses via `ResponseUtil`.
**Target:** codify the convention: cross-tenant **object** access (by id/hostname) → **404** (no existence disclosure); missing **authority** → **403**; **list/search** → **empty** scoped result.
**Files/methods:** all P0-A1 controllers/services (`AgentManagerResource`, `EdrResource`, `HaEdrResource`, `UtmCollectorResource`) — apply consistently; a shared helper for the 404-on-cross-tenant decision.
**DB/API/gRPC:** none (response semantics).
**Security:** an actor cannot distinguish "exists in another tenant" from "does not exist."
**Steps:** 1. Define the convention in a shared helper. 2. Apply at each cross-tenant decision point. 3. Assert in tests.
**Unit:** helper returns 404 for cross-tenant object, 403 for authority. **Integration:** the 404/403/empty expectations across T18 §1–8.
**Rollback:** low. **Cx:** S · **Risk:** Low · **Deps:** T04-T12 · **Acceptance:** consistent, non-disclosing error semantics platform-wide for P0-A1 endpoints.

---

## P0A1-T17 — Cross-tenant audit logging

**Problem:** blocked cross-tenant attempts aren't audited.
**Current:** `ApplicationEventService.createEvent(...)` exists and is used for error events across controllers.
**Target:** on any blocked cross-tenant attempt, emit an audit event: actor, actor_tenant, target_resource_type, target_resource_id, operation, timestamp, decision=DENY, reason — **no secrets/payload**.
**Files/methods:** the deny paths in T04–T12 call `ApplicationEventService` with a structured cross-tenant-deny event type.
**DB:** uses existing application-event storage. **API/gRPC:** none.
**Security:** SOC visibility into cross-tenant probing; no sensitive data logged.
**Steps:** 1. Define a `CROSS_TENANT_DENY` event type/shape. 2. Emit at each deny point. 3. Assert no secrets in the payload.
**Unit:** deny emits the event with required fields, no secrets. **Integration:** `crossTenantDenied_emitsAuditEvent` (T18 §10).
**Rollback:** low. **Cx:** S · **Risk:** Low · **Deps:** T04-T12,T16 · **Acceptance:** every cross-tenant denial is audited safely.

---

## P0A1-T18 — Cross-tenant negative test matrix

Fully specified in `HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md` (~45 named cases across 10 surfaces + layer mapping). **Cx:** L · **Risk:** High · **Deps:** T02-T17 · **Acceptance:** green run = the P0-A1 gate; paging-boundary + payload-override cases mandatory in CI.

---

## P0A1-T19 — OpenSearch `visibleBy` tenant-safety verification (recommendations)

**Problem:** EDR/endpoint event data at rest in OpenSearch must be tenant-scoped; the mechanism exists but its application must be verified, not assumed.
**Current:** the SDK uses `visibleBy` + `SearchIn`/`WideSearchIn` (`sdk/os/`, values like `public`/`private`/prefix per `builder_integration_test.go`). Whether EDR event write/index/search/hunt/timeline paths actually set and enforce `visibleBy = owning tenantPrefix` is unverified.
**Target (recommendations only, no code):** trace each EDR/endpoint read/write path; identify every place `visibleBy` must be set on write and scoped on read; recommend reuse of the existing `visibleBy` ACL (version-locked in mappings) rather than a new scheme.
**Files/methods:** trace `sdk/os/search.go` `SearchIn`/`WideSearchIn`, and every EDR OpenSearch write/query (if EDR events are mirrored to OpenSearch in addition to the relational `hive_edr_event`).
**Deliverable:** a gap list: which write paths set `visibleBy`, which read paths scope by it, and where it's missing.
**Steps:** 1. Trace write→index→search→hunt→timeline. 2. List every place tenant scoping must apply. 3. Recommend fixes (do not implement).
**Cx:** M · **Risk:** Med · **Deps:** — · **Acceptance:** a verified gap list + reuse-`visibleBy` recommendation; do not assume correctness because the mechanism exists.

---

## P0A1-T20 — RLS defense-in-depth spike (report)

**Problem:** app-layer tenant checks are the primary fix; a DB-enforced backstop would catch a future missed `WHERE tenant_id`.
**Current:** no RLS today; app/service/repo enforcement is being added (T01-T17).
**Target (spike report only, DEFER-decision, per table):** evaluate PostgreSQL RLS on sensitive tables — `agents`, `agent_commands`, `agent_policies`, `response_actions`, EDR relational metadata (`hive_edr_event`), `quarantine`.
**Cover:** connection-pool tenant propagation (`SET LOCAL app.tenant_id` per txn), admin bypass role, background/migration jobs, cross-tenant SOC use cases, Liquibase impact, testability.
**Recommendation per table:** ADOPT (`agents`, `agent_commands`, `agent_policies`, `response_actions`, `hive_edr_event`, `quarantine`) as a follow-on backstop **after** the app-layer fix ships and passes the gate; DEFER/REJECT for low-risk operational tables.
**Hard rule:** the confirmed vulnerability is fixed at app/service/repository level first and must NOT wait for RLS.
**Deliverable:** a spike doc with the per-table ADOPT/DEFER/REJECT verdict + the connection-pool propagation approach.
**Cx:** M · **Risk:** Low · **Deps:** T01-T17 shipped · **Acceptance:** a decision-ready RLS spike report; no RLS implemented in P0-A1.

---

## Sequencing note
T09 follows T08 (needs the tenant column); T11 follows T10 (authz before tenant scope); T12 follows T05 (reuses tenant-scoped lookup); T13 pairs with T05 (duplicate hostname); T14/T15/T16/T17 are cross-cutting and land alongside the endpoint tasks; T18 is the gate (last); T19/T20 are verification/spike and can run in parallel with the endpoint work. All behind `tenant_scoped_reads` (+ `edr_event_tenant`, `response_tenant_authz`, `collector_tenant_scope`) for atomic staging/rollback.
