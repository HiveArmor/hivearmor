# HIVEARMOR P0-A1 — T18 CROSS-TENANT NEGATIVE TEST MATRIX

> Date: 2026-09-09 · **TEST SPECIFICATION ONLY — no test code written, no code changed, no commits.** Concrete named cases the implementation must add. Each maps to a real endpoint/layer traced this session and to the P0-A1 acceptance gate.

## Shared fixture (`CrossTenantFixture`)
- **Tenant A** (clientId=101, prefix `acme`) and **Tenant B** (clientId=202, prefix `globex`).
- Agents: `A-web01` (id 1001, tenant A), `B-web01` (id 2002, tenant B) — **same hostname `web01`, different tenants**; ids chosen adjacent to a paging window to catch boundary bleed.
- One `AgentCommand` per agent: `cmdA` (agent 1001), `cmdB` (agent 2002).
- One `hive_edr_event` per agent (agent_id "1001"/"2002").
- One collector owned by each tenant (where a collector carries an owning tenant).
- Actors: `userA` (ROLE_ANALYST/SOC_MANAGER, tenant A), `userB` (tenant B), `adminA` (ROLE_ADMIN scoped to A — NOT implicit cross-tenant, per §14).

## Error-semantics convention under test (§15)
- Cross-tenant **object** access (by id/hostname) → **404** (no existence disclosure).
- Authenticated actor lacking the RBAC authority → **403**.
- **List/search** → **empty result** scoped to the actor's tenant (never another tenant's rows).

---

## 1. Agent inventory reads (T03/T04)

| Test | Actor → target | Layer | Expected |
|---|---|---|---|
| `listAgents_tenantA_excludesTenantBAgents` | userA lists agents | Spring integration | 200, body contains `A-web01`, NOT `B-web01`; `X-Total-Count` = A's count only |
| `listAgents_searchQueryCannotOverrideTenant` | userA with `?searchQuery=tenant_id.Is=202` | Spring | 200, still only A's agents (forced predicate dominates the user filter) |
| `listAgents_missingTenantContext_mssp_denied` | authenticated, no tenant in `TenantContext`, MSSP mode | Spring/unit | 403 (fail-closed) |
| `manager_listAgents_forcedTenantPredicate` | manager `ListAgents(tenant=101)` | gRPC integration | returns only tenant-101 agents; SQL includes `WHERE tenant_id = 101` |
| `manager_listAgents_tenantZero_nonSystem_rejected` | manager `ListAgents(tenant=0)`, no system context | gRPC/unit | `PermissionDenied` |
| `listAgents_pagingBoundary_noBleed` | userA paginates across the window bordering id 2002 | gRPC integration | `B-web01` (2002) never appears on any A page |

## 2. Get agent by hostname (T05)

| Test | Actor → target | Expected |
|---|---|---|
| `getByHostname_tenantA_resolvesOwnWeb01` | userA GET `agent-by-hostname?hostname=web01` | 200, returns `A-web01` (id 1001), never `B-web01` |
| `getByHostname_duplicateHostname_perTenantIsolation` | userB GET `?hostname=web01` | 200, returns `B-web01` (id 2002) |
| `getByHostname_crossTenantOnly_notFound` | userA GET `?hostname=<B-only-host>` | **404** (no existence disclosure) |
| `canRunCommand_inheritsTenantScope` | userA GET `can-run-command?hostname=<B-only-host>` | 404 (inherits `getAgentByHostname` scoping) |
| `manager_getByHostname_scopedQuery` | manager resolves hostname with tenant=101 | SQL includes `tenant_id = 101 AND hostname = 'web01'` |

## 3. Agents-with-commands (T06)

| Test | Expected |
|---|---|
| `agentsWithCommands_tenantA_onlyAAgents` | userA: body has A agents only |
| `agentsWithCommands_noForeignCommandsJoined` | userA: no command belonging to `B-web01` (`cmdB`) appears in any returned agent |
| `agentsWithCommands_pagingBoundary_noCommandBleed` | at the paging boundary near agent 2002, `cmdB` never attaches to an A row |
| `manager_agentsWithCommands_commandsScopedByOwningAgentTenant` | gRPC: command attachment filters `agent_id ∈ (agents WHERE tenant_id=101)` |

## 4. Agent command reads (T07)

| Test | Expected |
|---|---|
| `listAgentCommands_tenantA_excludesBCommands` | userA: `cmdA` present, `cmdB` absent |
| `listAgentCommands_scopedAtQueryNotPostFilter` | manager query JOINs `agents ON agent_id WHERE agents.tenant_id=101` (assert SQL/join, prove not fetch-then-filter) |
| `listAgentCommands_searchTargetingBAgentId_empty` | userA `?searchQuery` targeting agent id 2002 → empty |
| `listAgentCommands_missingTenant_mssp_denied` | no tenant context, MSSP → 403 |

## 5. EDR event tenant attribution — write (T08)

| Test | Layer | Expected |
|---|---|---|
| `ingest_setsTenantFromAuthenticatedAgent` | Spring/service | agent enrolled in A ingests → stored row `tenant_id = 101` |
| `ingest_payloadTenantIgnored` | service | ingest body carries `tenant_id=202` while authenticated as an A agent → stored as **101** (overwritten) |
| `ingest_unauthenticated_rejected` | Spring | no device identity → 401/403 (ingest requires authenticated agent) |
| `ingest_unknownAgent_noRealTenantAssigned` | service | ingest from an agent id not in registry → not stored under any real tenant (rejected or unknown-sentinel) |
| `edrEventEntity_tenantColumnPersisted` | repository | `UtmEdrEvent.tenantId` round-trips to `hive_edr_event.tenant_id` |

## 6. EDR event reads (T09)

| Test | Endpoint | Expected |
|---|---|---|
| `edrTimeline_tenantScoped` | `HaEdrResource` GET timeline `?agentId=2002` as userA | empty/404 — A cannot read B's agent timeline |
| `edrProcessTree_tenantScoped` | process-tree `?agentId=2002` as userA | empty/404 |
| `edrQueryEvents_excludesForeignTenant` | `EdrResource.queryEvents` as userA | never returns tenant-B events |
| `edrQuarantineList_tenantScoped` | quarantine list `?agentId=2002` as userA | empty/404 |

## 7. Collector authorization + tenant (T10/T11)

| Test | Expected |
|---|---|
| `collectorRead_requiresAuthority` | anonymous/insufficient-role GET `/api/collectors` → 401/403 (was unauthorized before) |
| `collectorRead_analystAllowed` | userA (ANALYST) GET `/api/collectors` → 200 |
| `collectorCreate_analystDenied` | ANALYST POST `/api/collectors/config` → 403 (mutation needs ADMIN/SOC_MANAGER) |
| `collectorCreate_socManagerAllowed` | userA (SOC_MANAGER) POST config → 200/201 |
| `collectorDelete_crossTenant_notFound` | userA DELETE B's collector id → 404 (where collector carries owning tenant) |
| `collectorModify_crossTenant_denied` | userA PUT `/asset-group` on B's collector → 403/404 |

## 8. Response target authorization (T12)

| Test | Entry point | Expected |
|---|---|---|
| `isolate_crossTenantTarget_denied` | userA → `EdrResource` isolate targeting `B-web01` | 403/404 **before** any INTERNAL_KEY gRPC dispatch |
| `kill_crossTenantTarget_denied` | userA kill on B agent | 403/404 pre-dispatch |
| `quarantine_crossTenantTarget_denied` | userA quarantine on B agent | 403/404 pre-dispatch |
| `restore_crossTenantTarget_denied` | userA restore on B agent | 403/404 pre-dispatch |
| `incidentWebsocket_sendCommand_crossTenant_denied` | userA `UTMIncidentCommandWebsocket.sendCommand` → B agent | rejected before dispatch |
| `response_sameTenant_authorized` | userA (SOC_MANAGER) isolate `A-web01` | dispatched (positive control) |
| `response_sameTenant_wrongRole_denied` | userA (ANALYST) kill `A-web01` where kill needs MUTATE | 403 (authorization ≠ tenant check) |

## 9. Admin / selected-tenant model (T14/T15)

| Test | Expected |
|---|---|
| `admin_noImplicitCrossTenant` | `adminA` (ROLE_ADMIN scoped to A) lists agents without selecting a tenant → sees A only, NOT B (ADMIN ≠ unrestricted) |
| `admin_selectedTenantContext_audited` | admin selects tenant B context explicitly → sees B; an audit record is written for the cross-tenant access |
| `backgroundJob_noSilentAllTenants` | a scheduled agent job with no interactive tenant → runs under an explicit system context or per-tenant, never an unscoped all-tenants query (assert the query is scoped or system-flagged) |

## 10. Audit logging (T17)

| Test | Expected |
|---|---|
| `crossTenantDenied_emitsAuditEvent` | any blocked cross-tenant attempt above → an `ApplicationEventService` audit event with actor, actor_tenant, target_type, target_id, operation, decision=DENY, reason; **no secrets/payload** in the record |

---

## Test-layer mapping (item 9 of the plan)

| Layer | Cases |
|---|---|
| **Unit** | `TenantScope.requireTenant` (null→403, system-context bypass); manager `tenantFilter` builder; `ingest` tenant-overwrite logic |
| **Repository** | manager `ListAgents`/`ListAgentCommands` SQL includes tenant predicate/join (assert generated SQL); `UtmEdrEvent` tenant round-trip |
| **Spring integration** | all controller-level cases (`@WithMockUser` + `TenantContext` set to A/B); status codes 200/403/404/empty |
| **gRPC integration** | manager against test Postgres seeded across A/B; forced-predicate + paging-boundary + command-join scoping |
| **E2E API** | full HTTP path: authenticate as userA, attempt each B-targeted operation, assert the convention (empty/403/404) and an audit event |

## Acceptance linkage
Green run of this matrix IS the P0-A1 acceptance gate: it proves each gate bullet (no cross-tenant enumeration, by-hostname, command reads, response dispatch, collector modify; server-authoritative EDR tenant; client tenant cannot override; scoped EDR searches; no silent all-tenants background flow). All cases automated; the paging-boundary and payload-override cases are the highest-signal regressions and must be part of CI.
