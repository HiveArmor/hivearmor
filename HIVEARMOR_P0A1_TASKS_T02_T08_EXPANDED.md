# HIVEARMOR P0-A1 — TASK BREAKDOWNS T02–T08 (EXPANDED)

> Date: 2026-09-09 · **PLAN ONLY — no code, no migrations, no `.proto` edits, no commits.**
> Companion to `HIVEARMOR_P0A1_TENANT_SECURITY_IMPLEMENTATION_PLAN.md`. Expands tasks T02–T08 to full breakdowns. All anchors re-verified this session. Full template per task: Problem · Current · Target · Files/methods · DB · API · gRPC · Security · Backward compat · Steps · Unit tests · Integration tests · Negative tests · Rollback · Complexity · Risk · Dependencies · Acceptance.
> Shared foundation (T01): `TenantScope.requireTenant()` = `TenantContext.getClientId()` (`multitenancy/TenantContext.java:91`) or throw 403 when `isMssp()` (`:106`) and id is null. Manager rule: every endpoint-scoped list forces a tenant predicate independent of the user `SearchQuery`.

---

## P0A1-T02 — Add `tenant_id` to `ListRequest` (proto) + backend/manager plumbing

**Problem:** `ListRequest` carries no tenant, so agent reads cannot be tenant-scoped end to end.
**Current:** `common.proto:7-11` = `page_number(1), page_size(2), search_query(3), sort_by(4)` — no tenant. `DeleteRequest` already has `tenant_id = 3` (`common.proto:29`), proving the pattern.
**Target:** `ListRequest` gains `int64 tenant_id = 5;` (next free field number — never renumber, repo rule §11); backend sets it from `TenantScope.requireTenant()`; manager reads it and forces a `tenant_id` predicate.
**Files/methods:**
- `agent-manager/protos/common.proto` — add field 5 (PROPOSED, not edited this batch).
- regenerate `agent-manager/agent/common.pb.go` (+ any mirrored `plugins/inputs/protos/common.proto`) — commit generated `*.pb.go` (repo convention).
- backend `com.hivearmor.service.grpc.ListRequest` builder call sites (`AgentManagerResource`, `AgentGrpcService`).
**DB:** none. **API:** none (internal field). **gRPC:** new field 5 on `ListRequest`.
**Security:** the field is set server-side from authenticated identity; the manager MUST NOT trust a caller-supplied tenant from an unauthenticated path — only the backend (authenticated via INTERNAL_KEY) sets it.
**Backward compat:** field defaults to 0. Manager treats `0`/absent as **"no tenant supplied"** → allowed ONLY for an explicit system context (T14); for a normal MSSP read, missing tenant → reject (fail-closed). Old backend builds that don't set it are only the internal backend, upgraded in lockstep with the manager.
**Steps:**
1. Propose `int64 tenant_id = 5;` in `common.proto` `ListRequest`.
2. Regenerate `.pb.go`; confirm `GetTenantId()` present.
3. Add `long tenant` param threading in `AgentGrpcService` list builders (T04–T07 consume it).
4. Define manager helper `tenantFilter(tenantId)` returning a forced `utils.Filter{Field:"tenant_id", Op:Is, Value:tenantId}` prepended ahead of `NewFilter(req.SearchQuery)`.
**Unit tests:** proto round-trips tenant_id; `tenantFilter` builds the expected predicate; missing tenant in MSSP mode → error.
**Integration tests:** backend→manager gRPC call carries tenant_id; manager query includes `WHERE tenant_id = ?`.
**Negative tests:** caller cannot override tenant via `SearchQuery` (`tenant_id.Is=` in user query is ignored/rejected because the forced predicate wins and field is auth-set).
**Rollback:** field is additive; reverting the backend to not set it degrades to the current (insecure) behavior only if the manager also reverts — keep them coupled.
**Complexity:** M · **Risk:** Med · **Deps:** T01 · **Acceptance:** manager receives an authoritative tenant on every agent read; user search cannot alter it.

---

## P0A1-T03 — Manager forced tenant predicate on `ListAgents`

**Problem:** `ListAgents` applies only the user filter; no tenant scope (audit-confirmed).
**Current:** `agent_imp.go:223-234` — `filter := utils.NewFilter(req.SearchQuery)` → `GetByPagination(&agents, page, filter, "", false)`. `GetByPagination` applies `Scopes(utils.FilterScope(f))` (`database/db.go:91-105`).
**Target:** prepend the forced tenant filter (from T02) so the WHERE is `tenant_id = ? AND <user filters>`; reject if tenant missing in MSSP mode.
**Files/methods:** `agent-manager/agent/agent_imp.go` `ListAgents`; reuse `utils.FilterScope`/`GetByPagination` (no signature change — pass the augmented `[]Filter`).
**DB:** query predicate only (no schema). **API/gRPC:** consumes T02 field.
**Security:** tenant predicate is forced, not user-supplied; `IsValidFieldName` already guards field names (`utils/filter.go:31`).
**Backward compat:** system context (tenant 0 + explicit flag, T14) bypasses; all else requires tenant.
**Steps:** 1. In `ListAgents`, build `filters := append([]utils.Filter{tenantFilter(req.GetTenantId())}, utils.NewFilter(req.SearchQuery)...)`. 2. If `req.GetTenantId() == 0` and not system context → `codes.PermissionDenied`. 3. Pass `filters` to `GetByPagination`.
**Unit tests:** filter list begins with tenant predicate; tenant 0 non-system → denied.
**Integration tests:** seed agents in tenants A & B; `ListAgents(tenant=A)` returns only A's rows.
**Negative tests:** `ListAgents` with a `SearchQuery` attempting `tenant_id.Is=B` while auth tenant=A still returns only A (forced predicate dominates).
**Rollback:** remove the prepend (reverts to insecure) — gated by feature flag `tenant_scoped_reads`.
**Complexity:** M · **Risk:** High · **Deps:** T02 · **Acceptance:** cross-tenant agent enumeration impossible at the manager.

---

## P0A1-T04 — Backend agent-list tenant propagation

**Problem:** controller/service build `ListRequest` without tenant.
**Current:** `AgentManagerResource.listAgents` (`:52`) builds `ListRequest.newBuilder().setPageNumber/…/setSearchQuery` — no tenant; `AgentGrpcService.listAgents` (`:38-40`) forwards as-is.
**Target:** controller obtains tenant via `TenantScope.requireTenant()`, passes to the service, which sets `ListRequest.tenant_id`.
**Files/methods:** `AgentManagerResource.listAgents`; `AgentGrpcService.listAgents(ListRequest)` → set tenant on the builder (or accept a `long tenant` param and set it centrally).
**DB:** none. **API:** unchanged shape; behavior scoped. **gRPC:** sets T02 field.
**Security:** tenant from JWT-derived `TenantContext`, never a request param.
**Backward compat:** response shape unchanged; MSSP callers now see only their tenant (intended).
**Steps:** 1. `long tenant = tenantScope.requireTenant();` in the controller. 2. Thread into `agentGrpcService.listAgents(request, tenant)` (or set on the builder before the gRPC call). 3. Ensure `X-Total-Count` header reflects the scoped count.
**Unit tests:** controller calls `requireTenant`; service sets tenant on the request.
**Integration tests (Spring):** authenticated as tenant A → `GET /api/agent-manager/agents` returns only A; total count scoped.
**Negative tests:** no tenant in context (MSSP) → 403; passing `?searchQuery=tenant_id.Is=B` has no effect.
**Rollback:** flag `tenant_scoped_reads`. **Cx:** S · **Risk:** High · **Deps:** T02,T03 · **Acceptance:** `/agents` scoped end to end.

---

## P0A1-T05 — get-agent-by-hostname tenant scope + duplicate-hostname

**Problem:** hostname resolved globally, no tenant.
**Current:** `AgentManagerResource.getAgentByHostname` (`:111`) → `AgentGrpcService.getAgentByHostname` (`:256`) builds `searchQuery="hostname.Is="+hostname` with no tenant (`:259-262`) → `listAgents(req)`. `can-run-command` (`:166`) calls the same → inherits the leak.
**Target:** scope to `tenant_id = ? AND hostname = ?`; return 404 (not 403) on cross-tenant miss (no existence disclosure, per §15).
**Files/methods:** `AgentGrpcService.getAgentByHostname` (set tenant on the `ListRequest` it builds); `AgentManagerResource.getAgentByHostname` + `canRunCommand`.
**DB:** none (query predicate); pairs with T13 constraint. **API:** unchanged; behavior scoped. **gRPC:** T02 field.
**Security:** hostname never globally resolved.
**Backward compat:** duplicate hostname across tenants now resolves per-tenant (A→A's agent, B→B's).
**Steps:** 1. `getAgentByHostname(String hostname, long tenant)`; set `ListRequest.tenant_id=tenant` alongside `searchQuery="hostname.Is="+hostname`. 2. If empty → `AgentNotfoundException` → 404. 3. Update `canRunCommand` to pass tenant.
**Unit tests:** builder carries tenant + hostname filter.
**Integration tests:** tenants A & B each have host `web01`; A resolves A's `web01`, B resolves B's.
**Negative tests:** A requests B-only hostname → 404; A cannot use `can-run-command` against B's host.
**Rollback:** flag. **Cx:** M · **Risk:** High · **Deps:** T02,T04 · **Acceptance:** by-hostname + can-run-command tenant-safe; duplicates handled.

---

## P0A1-T06 — agents-with-commands tenant scope (agent + joined commands)

**Problem:** both the agent rows and their attached commands must be tenant-safe; no cross-tenant command joined.
**Current:** `AgentManagerResource.listAgentsWithCommands` (`:82`) → `AgentGrpcService.listAgentWithCommands` (`:184-185`, calls `blockingStub.listAgents`) — no tenant; the manager path that attaches commands isn't tenant-scoped.
**Target:** agent rows scoped by `tenant_id` (as T03); attached commands scoped to the same tenant's agents (join through owning agent, never a raw command table read).
**Files/methods:** `AgentGrpcService.listAgentWithCommands`; manager `ListAgents`/command-join path in `agent_imp.go` + `parser.go` (`convertModelToAgentCommandsProto`).
**DB:** query predicate/join. **gRPC:** T02 field.
**Security:** a command belonging to another tenant's agent can never be joined/returned.
**Steps:** 1. Set tenant on the request (T02). 2. In the manager, ensure the command attachment filters commands by `agent_id ∈ (agents WHERE tenant_id = ?)`. 3. Verify `parser.go` conversion only sees scoped commands.
**Unit tests:** command-join query includes the tenant-scoped agent set.
**Integration tests:** A's agents-with-commands returns A's agents and only A's commands; B's commands absent even if agent ids numerically adjacent.
**Negative tests:** craft B command on a B agent whose id collides in range with A's paging window → not returned to A.
**Rollback:** flag. **Cx:** M · **Risk:** High · **Deps:** T02,T03 · **Acceptance:** agents-with-commands fully tenant-safe (rows + commands).

---

## P0A1-T07 — agent-command reads (query-level scope, not post-filter)

**Problem:** commands read without tenant; must scope at the query, not after fetching.
**Current:** `AgentManagerResource.listAgentCommands` (`:129`) → `AgentGrpcService.listAgentCommands` (`:180`) → manager `ListAgentCommands` (`agent_imp.go:391-407`): `filter := NewFilter(req.SearchQuery)` → `GetByPagination(&commands, page, filter, "", false)` on `models.AgentCommand` — no tenant, and `AgentCommand` has `agent_id` but no tenant column.
**Target:** scope commands to the authenticated tenant by joining `AgentCommand.agent_id → Agent.tenant_id = ?` at the query level.
**Files/methods:** manager `ListAgentCommands` — add a join/scope so only commands whose owning agent is in the tenant are returned; `AgentGrpcService.listAgentCommands` sets T02 field.
**DB:** join predicate (`AgentCommand JOIN Agent ON agent_id WHERE agent.tenant_id = ?`); `GetByPagination` already accepts a `join` arg (`db.go:91`).
**gRPC:** T02 field.
**Security:** authorization order — authenticated tenant → target agent belongs to tenant? → yes → return commands (scoped in the query, never fetch-then-filter).
**Steps:** 1. Pass `join = "JOIN agents ON agents.id = agent_commands.agent_id"` + forced filter `agents.tenant_id = ?`. 2. Set tenant on request. 3. Ensure count reflects the join.
**Unit tests:** query includes the agent join + tenant predicate.
**Integration tests:** A sees only commands for A's agents; B's commands never returned to A.
**Negative tests:** A requests commands with `searchQuery` targeting a B agent id → empty.
**Rollback:** flag. **Cx:** M · **Risk:** High · **Deps:** T02 · **Acceptance:** command reads scoped at query level, no post-filtering.

---

## P0A1-T08 — Authoritative EDR event tenant attribution (write path)

**Problem:** ingested EDR events lack authoritative tenant; a client-supplied tenant would be trusted.
**Current:** `EdrResource.ingestEvent` (`:151-155`, no `@PreAuthorize`) → `EdrService.ingestEvent` (`:101-124`, blind `eventRepo.save(e)`) → `UtmEdrEvent` (no tenant column). Auth via `TelemetryAgentIdentityFilter` (device identity: `X-HiveArmor-Agent-Id`+`X-Agent-Key` → principal). **Existing pattern to reuse:** telemetry already resolves agent→tenant (`HaTelemetryService.java:252` threads `tenantForInsert`; `OsvEnrichmentService` takes `tenantId`) — mirror that resolution rather than inventing one.
**Target:** server derives tenant from the authenticated agent principal → agent registry → `tenant_id`, sets it on the stored event, and **ignores/overwrites** any payload tenant.
**Files/methods:** `UtmEdrEvent` (add `@Column tenant_id`); `EdrService.ingestEvent` (set tenant from resolved principal, not DTO); `EdrEventDTO` (drop/ignore any client tenant); resolution helper reusing the telemetry agent→tenant lookup.
**DB:** add nullable `tenant_id` to `UtmEdrEvent` via a NEW Liquibase changeset (PROPOSED, not written; nullable-then-enforce; include in `master.xml`); index `(tenant_id, event_time)` for scoped reads.
**API:** ingest body shape unchanged; server-authoritative tenant.
**gRPC:** none.
**Security:** payload tenant never trusted; principal→tenant is the only source. Also (feeds T-later) the missing ingest `@PreAuthorize`/device-auth binding is confirmed here.
**Backward compat:** old agents send no tenant — server assigns it; nullable column tolerates in-flight rows during rollout.
**Backfill:** batch job maps existing rows' `agent_id → agent → tenant`; rows with a deleted agent → an `unknown`/quarantine tenant, never a real one; after backfill, enforce not-null for new writes.
**Steps:** 1. Add `tenant_id` column + changeset (proposed). 2. In `ingestEvent`, resolve tenant from the authenticated agent principal (reuse telemetry pattern); set `e.setTenantId(resolved)`; ignore `dto` tenant. 3. Backfill job. 4. Add `tenant_id` to EDR read queries (handoff to T09).
**Unit tests:** `ingestEvent` sets the resolved tenant; a DTO-supplied tenant is overwritten.
**Integration tests:** agent enrolled in tenant A ingests → row stored with tenant A regardless of payload.
**Negative tests:** craft ingest with `tenant_id=B` in body while authenticated as an A agent → stored as A; unauthenticated ingest rejected.
**Rollback:** column nullable → revert code to ignore it (rows retain tenant); flag `edr_event_tenant`.
**Complexity:** L · **Risk:** Critical · **Deps:** telemetry agent→tenant resolver · **Acceptance:** every EDR event persists with server-assigned authoritative tenant; client tenant cannot override.

---

## Cross-task test harness notes

- **gRPC integration** (T03,T06,T07): stand up the manager against a test Postgres with agents/commands seeded across two tenants; assert scoped results.
- **Spring integration** (T04,T05,T08): `@WithMockUser` with a tenant claim + `TenantContext` set; assert scoping and 404/403 semantics.
- **Shared negative fixture:** two tenants (A,B), duplicate hostname `web01`, adjacent agent ids, one command per agent — reused across T05/T06/T07 to prove no cross-tenant bleed at paging boundaries.
- All behind feature flag `tenant_scoped_reads` (+ `edr_event_tenant` for T08) so the batch can be staged and rolled back atomically.
