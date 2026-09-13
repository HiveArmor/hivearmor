# HiveArmor A2-7 — agent-manager Go/GORM datasource tenant-enforcement review

> **Type:** AUDIT / WRITE-UP ONLY. No code changed. Grounded by direct reading of
> `agent-manager/` on `release/v3`, cited path:line. Scope: does the agent-manager's
> **own** Postgres datasource (a SEPARATE database from the Java backend's `hivearmor`,
> which the P0-A2 backend RLS pilot does NOT cover — see `HIVEARMOR_P0A1_T20_RLS_SPIKE.md`
> §3.4) enforce tenant isolation on its reads/writes, and what does it still need?

---

## 0. TL;DR

The agent-manager is a **separate process, pool, and database** (`hivearmor_agents`,
GORM auto-migrate — `database/db.go:135`). Neither the Java `MsspIndexResolver` nor the
backend RLS pilot (changeset `20260910006`) touches it. P0-A1 already forced tenant
predicates on the **endpoint-scoped list/command reads** (T03/T07/T11), and the
enrollment surface is uniformly tenant-scoped. The residual risk is the same **convention-only**
class the whole programme has been closing at the app layer: the DB helpers in `db.go` are
generic (`GetAll(data, query, args…)`, `GetByPagination(data, p, filters, join, getDeleted)`,
`GetFirst`, `Delete`, `Upsert`) and enforce **nothing** on their own — every caller must
remember to pass a tenant predicate. Today the unscoped callers are all either **system-context**
(all-tenant by design) or **key-authenticated** (row-by-id gated by a presented secret, not by
tenant), so there is **no identified cross-tenant read leak** — but there is no structural
backstop, and that is the gap A2-7 should close. Recommended: a GORM-level forced-tenant
mechanism (a scope/callback keyed off a per-call tenant), and/or the agent-manager's own RLS
once it gets an unprivileged role — mirroring the backend's #281/#282 path.

---

## 1. The data layer (what exists)

- **Separate datasource:** `database/db.go:135` — `gorm.Open(postgres.Open(dsn), …)` where the
  DSN is built from `config.DBHost/DBPort/DBUser/DBPassword/DBName`. This is `hivearmor_agents`,
  GORM-managed, distinct from the Liquibase-managed `hivearmor` DB. **Backend RLS does not apply here.**
- **Generic, unscoped-by-default DB helpers** (`database/db.go`): `Create` (:36), `Exec` (:44),
  `Upsert` (:49), `GetFirst` (:66), `GetAll` (:77), `GetByPagination` (:91, with an `Unscoped()`
  soft-delete-bypass branch at :97), `Delete` (:109, `Unscoped()` hard-delete at :114),
  `Transaction` (:123). None of these inject a tenant predicate; they apply exactly the
  `query`/`filters` the caller passes. **Tenant safety is 100% caller-convention.**
- **The tenant column exists:** `models.Agent.TenantID int64 ... not null default:0`
  (`models/agent.go`), first column of the per-tenant `idx_hostname_deleted` unique index
  (P0A1-T13), so a global hostname probe cannot leak across tenants. `Collector` and the
  enrollment models carry `TenantID`/`tenant_id` too.
- **The P0-A1 forced-predicate helpers** (`agent/tenant_scope.go`): `tenantScopedFilters(tenantID,
  userFilters)` (:24) prepends a constant-field `tenant_id = ?` (bound param) ahead of any
  user search filter and **fails closed** (`PermissionDenied`) when `tenantID <= 0`;
  `tenantScopedCommandFilters` (:45) does the same for `AgentCommand` by JOINing to `agents` and
  forcing `agents.tenant_id = ?` (commands have no tenant column of their own). These are the
  T03/T07/T11 remediation — but they are **opt-in per caller**, not enforced by `db.go`.

---

## 2. Caller-by-caller classification (the actual read/write surface)

**Correctly tenant-scoped (forced predicate, fail-closed):**
- `GetInstalledAgents` list read → `tenantScopedFilters(req.GetTenantId(), …)` then
  `GetByPagination` (`agent/agent_imp.go:232` via the helper) — endpoint-scoped, safe.
- Agents-with-commands read → `tenantScopedCommandFilters` + join (`agent/agent_imp.go:403`) — safe.
- Collector list read → `tenantScopedFilters` (`agent/collector_imp.go:258,264`) — safe.
- Delete-agent authorization probe → `GetFirst(&scoped, "id = ? AND tenant_id = ?", idInt,
  req.GetTenantId())` with a `req.GetTenantId() <= 0` fail-closed guard (`agent/agent_imp.go:176`) — safe.
- The entire **enrollment** surface (`agent/enrollment.go`, `enrollment_audit.go`) — uniformly
  `Where("tenant_id = ?", req.GetTenantId())` with `GetTenantId() <= 0` rejection
  (e.g. :137, :199, :216-219, :245, :300, :374; audit :56,:96). Consistently scoped.

**Unscoped by design — SYSTEM CONTEXT (all-tenant is correct here):**
- `GetAll(&agents, "")` startup cache load (`agent/agent_imp.go:59`) — populates the in-memory
  `CacheAgentKey` (agent-id → key hash) for ALL agents at boot. Legitimately all-tenant: it is a
  process-local credential cache, not an endpoint response. Same shape for the collector/lastseen
  caches (`collector_imp.go:72`, `lastseen_imp.go:53`).

**Unscoped by id — KEY-AUTHENTICATED (not an IDOR, but no tenant defense-in-depth):**
- `VerifyConnectorIdentity` → `GetFirst(&agent/&collector, "id = ?", req.GetConnectorId())`
  (`agent/identity.go:28,52`). The row is looked up by id ACROSS tenants, but the caller must then
  present that connector's **secret key** (`verifiedAgentIdentity(agent, req.GetPresentedKey())`) —
  so possessing the id alone yields nothing; the key is the authorization. Not a cross-tenant leak,
  but the lookup itself is not tenant-bounded.
- `GetFirst(agent, "id = ?", idInt)` in `UpdateAgent`/registration-adjacent paths
  (`agent/agent_imp.go:127,158`) — agent self-update, authenticated as the device; by-id is the
  device acting on its own row.

- **Unscoped by id — SYSTEM CONTEXT, confirmed internal-only:**
- `ListConnectorAuthorization` → `GetByPagination(&agents/&collectors, page, utils.NewFilter(""),
  "", false)` (`agent/identity.go:89,101`) returns a **secret-free, page-bounded projection** of
  ALL agents/collectors across ALL tenants. **Verified:** its only caller is the event-processor
  **Inputs** plugin reconciling its revocation cache (`plugins/inputs/auth.go:168`), and the method
  is in the manager's internal-endpoint allowlist (`config/global_const.go:48`). No tenant-facing
  caller exists — all-tenant is correct system context, NOT a leak.

**No SQL injection:** every scoped predicate uses a constant field name (`"tenant_id"` /
`"agents.tenant_id"`) with the value bound as a parameter (`utils.Filter{…Value: tenantID}` →
`FilterScope`, and `Where("… = ?", v)`); user `search_query` is appended as additional filters,
never concatenated into the tenant predicate. Consistent with the backend's constant-field pattern.

---

## 3. What tenant enforcement it still needs

The manager is currently **safe by convention** (no identified leak) but **not safe by
construction** — identical to the residual risk the backend closed with RLS. Two complementary
options, in priority order:

### 3.1 (Recommended, primary) A GORM-level forced-tenant mechanism — DELIVERED
**Shipped as the option-1 `TenantScope(tenantID)` GORM scope** (`agent-manager/utils/tenant_scope.go`):
- `utils.TenantScope(tenantID)` / `utils.QualifiedTenantScope(col, tenantID)` — standard GORM
  `Scopes(...)` funcs (compose with the existing `FilterScope`/`PagingScope`) that force a
  constant-column, bound-value `tenant_id = ?` predicate and **fail closed** to an always-false
  `1 = 0` (zero rows) when `tenantID <= 0`.
- `DB.ScopedFind` / `DB.ScopedGetByPagination` (`database/db.go`) — the BLESSED DEFAULT read path
  that applies the scope; `DB.SystemContextFind` — the explicit, distinctly-named all-tenant escape
  for the boot cache + the ListConnectorAuthorization reconciliation projection.
- Migrated the two endpoint-scoped list readers (`ListAgents`, `ListCollector`) onto
  `ScopedGetByPagination` — they keep the up-front loud `PermissionDenied` guard AND now enforce the
  tenant predicate structurally. The command-JOIN read still uses `tenantScopedCommandFilters`
  (unchanged; `QualifiedTenantScope` is available for a future migration).
- Unit-tested (`utils/tenant_scope_test.go`, DryRun over a stub ConnPool, no live DB): forced bound
  predicate, fail-closed at tenantID ≤ 0, qualified-column form. The §3.3 `Unscoped()` note stands:
  any future hard-delete/get-deleted caller should also go through the scoped path.

The recommended options were, in priority order:

### 3.1-alt (considered) A GORM-level forced-tenant mechanism
Make the *default* safe instead of relying on every caller. Options:
- A `TenantScope(tenantID)` GORM `func(*gorm.DB) *gorm.DB` scope that adds
  `Where("tenant_id = ?", tenantID)` (or the `agents.tenant_id` join form for commands), applied
  by a thin tenant-aware wrapper on the endpoint-scoped reads — so a new list/read handler is
  scoped unless it explicitly opts out for a documented system-context reason. This generalizes
  `tenant_scope.go` from "two helpers callers may use" to "the default path". ← THIS is what shipped.
- A GORM registered callback / `NamedArg` that reads a per-call tenant (threaded through
  `context.Context`, since the manager has no ThreadLocal) and injects the predicate on
  `Query`/`Update`/`Delete` for tenant-bearing models — with an explicit, audited
  `WithSystemContext()` escape for the boot cache and the reconciliation projection. This is the
  Go analogue of the backend's `TenantContext` + `TenantGucAspect`. (Deferred — the explicit-scope
  approach is lower-risk and doesn't silently touch writes.)

### 3.2 (Defense-in-depth, secondary) agent-manager's own Postgres RLS — DELIVERED
**Shipped:** §3.2a RLS policies (#292 `4f7e3fb7`, inert), §3.2b steps 1-2 system pool +
`WithTenantTx` per-transaction GUC + converted reads (#293 `d255b8cf`), §3.2b step 3 all
tenant-facing writes tenant-GUC'd with affected-row no-op detection + a `//go:build integration`
matrix (#294 `72ab32d6`). Design of record: `HIVEARMOR_A2_7_MANAGER_RLS.md` +
`HIVEARMOR_A2_7_MANAGER_RLS_3_2B_SCOPE.md`. Enforcement is enabled by the operator role split
(`HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`); the code is inert until then because the app
connects as the superuser `DB_USER=postgres`. The recommendation as originally written:

Mirror the backend #281/#282 path on `hivearmor_agents`:
- Introduce an **unprivileged app role** for the manager's GORM connection + a `BYPASSRLS`
  migration role (GORM auto-migrate currently runs as one role — same superuser-bypass gotcha as
  the backend, `HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md` §1).
- A per-transaction GUC (`set_config('app.current_tenant', …, true)`) set from the request's
  tenant on the manager's connection, and `ENABLE/FORCE ROW LEVEL SECURITY` + a `tenant_isolation`
  policy on `agents`, `collectors`, and the enrollment tables. Prerequisite: every manager row has
  a non-null `tenant_id` (Agent already defaults 0 not-null; verify collectors/enrollment).
- Caveat: RLS on `agents` must not break the legitimate **system-context** reads (boot cache,
  reconciliation) — those would need to run under a `BYPASSRLS` path or a "-1"/all-tenant system
  identity, exactly the classification §2 already draws.

### 3.3 Housekeeping
- The `Unscoped()` branches (`db.go:97` soft-delete, `db.go:114` hard-delete) bypass GORM's
  soft-delete, not tenancy — but combined with an empty `query` they would return/delete across
  tenants. Any future caller passing `getDeleted=true`/`hardDelete=true` must still carry a tenant
  predicate; fold this into the §3.1 default so it cannot be forgotten.

---

## 4. Verdict

- **No confirmed cross-tenant leak today.** Endpoint-scoped reads are forced-predicate scoped
  (P0-A1) and enrollment is uniformly scoped; the unscoped reads are system-context or
  key-authenticated. The one initially-uncertain path (`ListConnectorAuthorization`) was verified
  as internal-only (event-processor Inputs reconciliation, `plugins/inputs/auth.go:168`).
- **The structural gap is real:** tenancy is caller-convention, with no DB-level or ORM-level
  backstop, on a datastore the backend's RLS cannot reach. Closing it (§3.1 GORM forced-tenant as
  the primary, §3.2 manager-side RLS as defense-in-depth) is the natural completion of the
  tenant-isolation programme for the second datastore. Both are their own workstreams (Go code +,
  for §3.2, a manager role split), out of scope for this write-up.
