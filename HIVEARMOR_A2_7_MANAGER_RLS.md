# HiveArmor A2-7 §3.2 — agent-manager Postgres Row-Level Security (design + runbook)

> **Status: DELIVERED (code merged to `release/v3`; enforcement pending operator role split).**
> The design below is retained as the rationale of record. Delivery summary:
>
> | Item | PR | Merge commit | State |
> |------|----|--------------|-------|
> | §3.1 app-layer forced-tenant scope (prereq) | #290 | `98603a76` | merged |
> | (adjacent) GetFirst/Delete args-spread fix | #291 | `cb91d4b3` | merged |
> | §3.2a RLS `tenant_isolation` policies (inert) | #292 | `4f7e3fb7` | merged |
> | §3.2b steps 1-2 system pool + `WithTenantTx` GUC + reads | #293 | `d255b8cf` | merged |
> | §3.2b step 3 all writes tenant-GUC'd + integration matrix | #294 | `72ab32d6` | merged |
>
> **Remaining to ENABLE enforcement (no code):** the operator role split —
> `HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`. Until then the policies are inert
> because the app connects as the superuser `DB_USER=postgres`, which ignores RLS.
> The PHASE 1 live prototype (all read/write/agent_commands/fail-closed assertions) and
> the merged `//go:build integration` matrix (T-CANARY/T-SCOPE/T-CMD/T-WRITE/T-MISSING-GUC/
> T-POOL-BLEED/T-CONCURRENT) both passed against a real unprivileged Postgres role.

---

> **Original status: DESIGN.** This scoped the defense-in-depth DB-layer tenant
> backstop for the agent-manager's own database (`hivearmor_agents`), mirroring the
> backend RLS pilot (#281 GUC aspect, #282 policy pilot — merged, inert). It records
> the recommended split, the mechanism, the system-context carve-out, and a test plan.
>
> Author: platform / P0-A2 tenant-isolation programme. Companion docs:
> `HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md` (backend role provisioning, reused here),
> `HIVEARMOR_A2_7_AGENT_MANAGER_DATASOURCE_REVIEW.md` (the audit; §3.1 shipped in #290,
> this is §3.2), `HIVEARMOR_A2_7_MANAGER_RLS_3_2B_SCOPE.md` (§3.2b implementation scope
> + PHASE 1 results), `HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md` (operator enablement).

---

## 0. TL;DR

- App-layer forced-tenant scoping already shipped (#290 `TenantScope` + `ScopedFind` /
  `ScopedGetByPagination`, fail-closed, on the tenant-facing reads). **RLS is the
  *second* layer** — it makes the tenant predicate a property of the TABLE, so a query
  that forgets its `WHERE tenant_id` returns zero rows regardless of app code.
- The manager is **not** a copy-paste of the backend: it has **no Liquibase, no
  per-transaction GUC aspect, and no two-role app/migrator split**. Those must be built.
- The single biggest risk is **boot-time agent authentication**: the manager warms an
  in-memory credential cache at startup with an all-tenant `GetAll(&agents,"")`. Under
  `FORCE ROW LEVEL SECURITY` with no GUC set, that read fails **closed to zero rows**,
  the cache is empty, and **no agent can authenticate**. The system-context carve-out is
  therefore load-bearing, not optional.
- **Recommended split** (see §5): **§3.2a — policy migration**, inert **only** where PHASE 0
  proves the app role is superuser/BYPASSRLS (every shipped deployment uses `DB_USER=postgres`,
  a superuser — so inert *there*, but for the superuser reason, NOT "owner is exempt": FORCE
  makes the owner subject to RLS). Then **§3.2b — the runtime two-role connection +
  transaction-bound GUC + system-context BYPASSRLS pool**. §3.2b is where the boot-cache risk
  lives and needs the §7 matrix.
- **Concrete blocker found (§2.2):** every tenant-facing helper today runs **tx-less** on
  `d.conn`. A transaction-local GUC therefore cannot be "folded into ScopedFind" as-is — §3.2b
  must introduce a `WithTenantTx` wrapper so `set_config(...,true)` and the tenant SQL share
  one transaction, else the GUC leaks across pooled connections (T-POOL-BLEED / T-CONCURRENT).

---

## 1. Why RLS here, on top of #290

The agent-manager runs on a **separate process, pool, and database** (`hivearmor_agents`)
that the backend's RLS policies (#282) do **not** reach. #290 made the *default* app-layer
read path tenant-scoped and fail-closed. RLS adds the property that the DB itself rejects
a mis-scoped query — closing the residual risk that a *future* handler is written against
the raw `GetAll`/`GetByPagination`/`GetFirst` helpers and forgets to scope. It is
defense-in-depth: after RLS, both the app layer (#290) AND the database enforce isolation,
and neither alone is the single point of failure.

---

## 2. Current state of the manager DB (facts, verified on `release/v3`)

| Fact | Value | Source |
|------|-------|--------|
| Driver / ORM | GORM + `gorm.io/driver/postgres`, single datasource | `database/db.go` |
| Connection role | ONE role from `DB_USER` env — no app/migrator split | `config/global_const.go:75` |
| **`DB_USER` value in all shipped deployments** | **`postgres` — a SUPERUSER** (local-dev `run-backend-local.sh:7`; `docker-compose.yml:108,148,354`) | verified `release/v3` |
| Schema management | **GORM `AutoMigrate`** (NOT Liquibase) | `database/db.go:29`, `database/migration.go:19` |
| Per-tx tenant GUC | **None** — tenant arrives per-RPC as `req.GetTenantId()` | audit §1 |
| Tenant-bearing tables (own `tenant_id`) | `agents`, `enrollment_tokens`, `enrollment_audit_events`, `collectors` — all `tenant_id int64 NOT NULL` (agents/collectors `DEFAULT 0`) | `models/agent.go`, `models/collector.go` |
| Tenant-bearing via owner | `agent_commands` — **no own `tenant_id`**; tenant is its agent's (`agent_id` → `agents.id`) | `models/agent.go:86` |
| Non-tenant table | `last_seen` (heartbeat cache) — no tenant column | `models/lastSeen.go` |

**Consequence:** the backend had #281 (GUC aspect) and Liquibase two-role migrations
already in place before #282 could bite. The manager has neither, so §3.2 must supply the
role split, the migration mechanism, AND the GUC wiring — that is why it is bigger and
riskier than #282 and is split below.

### 2.1 PostgreSQL role semantics — the corrected "inert" claim (gate 1)

An earlier draft called §3.2a "no runtime behaviour change" on the assumption the current
role is *owner*. **That reasoning was wrong and is corrected here.** PostgreSQL RLS role
rules:

| Role attribute of the connecting role | Effect of `ENABLE` + `FORCE ROW LEVEL SECURITY` |
|---|---|
| **SUPERUSER** | **RLS is IGNORED entirely** — policies never apply. |
| **BYPASSRLS** | RLS is ignored. |
| Table **OWNER** (not super/bypass) | `ENABLE` alone: owner is EXEMPT. **`FORCE`: owner IS subject to RLS.** |
| Ordinary role | Always subject to RLS. |

So the inert-ness of §3.2a depends **entirely** on the connecting role:
- In every deployment shipped today `DB_USER=postgres` is a **SUPERUSER** → §3.2a is a
  genuine no-op **because superuser ignores RLS**, *not* because "owner is exempt" (FORCE
  makes the owner subject). The conclusion (inert) holds for the shipped config, but for
  the correct reason.
- **This must NOT be asserted for any deployment whose `DB_USER` is a non-superuser owner
  or an ordinary role** — there, §3.2a's `FORCE` would immediately subject the app to RLS
  with no GUC set → **fail closed to zero rows → boot auth outage** the moment the
  migration runs. §3.2a is therefore gated on **PHASE 0** (§8) verifying role semantics for
  every supported deployment before the policy migration ships.

### 2.2 Transaction behaviour of the helpers — the GUC blocker (gate 2)

Verified in `database/db.go`: **every read/write helper executes on `d.conn` directly, NOT
inside an explicit transaction.** `SkipDefaultTransaction` is not set, so GORM wraps each
single write in its *own* implicit tx, and each read runs with no tx at all.

| Helper | Runs in explicit tx? |
|---|---|
| `ScopedFind`, `ScopedGetByPagination`, `GetAll`, `GetFirst`, `SystemContextFind` | **No** — `d.conn.Find/First` |
| `Create`, `Upsert`, `Updates`, `Delete`, `Exec` | **No** — GORM implicit per-statement tx only |
| `Transaction(fn)` | **Yes** — the only explicit-tx path |

`Transaction(fn)` is used by the enrollment surface (`enrollment.go:183,215,244,299`,
`enrollment_audit.go:95`) and one agent path (`agent_imp.go:86`). Everything else is
tx-less.

**Why this blocks a naive GUC design:** a transaction-local `set_config('app.current_tenant',
…, true)` only lives for the current tx. Issued as a *separate* call on `d.conn` (outside
an explicit tx), it either binds to a one-statement implicit tx that has already closed
before the tenant SQL runs, or it sets a **session-local** GUC on a *pooled* connection
that then **bleeds** to the next borrower of that connection (see T-POOL-BLEED, §7).
Therefore §3.2b CANNOT "fold `set_config` into `ScopedFind`" as loose statements — the GUC
set and the tenant SQL must be in the **same explicit transaction** (§3.2b step 2 defines
the required wrapper).

---

## 3. System-context carve-out — per-path re-review (gate 4)

RLS must NOT break these legitimate all-tenant reads, but **a path is NOT classified
BYPASSRLS merely because the #290 app-layer audit called it "system-context."** Each is
re-reviewed below on its own merits before earning a place on the system pool (§5.3).
Anything that does not *require* cross-tenant access stays tenant-scoped.

**Boot credential cache warm-up — `agent/agent_imp.go:59` `GetAll(&agents,"")`**
- Purpose: load every tenant's agent credential material into the in-memory auth cache at startup.
- Why all-tenant: agents from ALL tenants authenticate against this one manager; the cache is not per-tenant.
- Why tenant scope can't satisfy it: there is no request tenant at boot — it runs before any RPC.
- Data exposed: agent key hashes / credential versions for all tenants (already in-process).
- External/user-controlled input: **No** — startup, no request.
- Required privilege: cross-tenant read of `agents`. → **BYPASSRLS (system pool).**
- Audit: log a single startup line (row count, no per-tenant detail); not per-call.
- Failure behavior: if it returns zero rows (RLS misfire) → total auth outage. T-BOOT is the go/no-go.

**Collector cache — `agent/collector_imp.go:72`**
- Same shape as boot cache, for collectors. All-tenant, no request context, startup. → **BYPASSRLS.**

**Last-seen cache — `agent/lastseen_imp.go:53`**
- Purpose: heartbeat/liveness state for all agents. Table `last_seen` has **no tenant column**.
- Why all-tenant: liveness is not tenant-partitioned; and the table is not RLS-protected (no `tenant_id`).
- Required privilege: none special (table not under RLS). → runs fine on either pool; **not a carve-out**, listed for completeness.

**`ListConnectorAuthorization` — `agent/identity.go:89,101`**
- Purpose: all-tenant, secret-free projection consumed by the event-processor to reconcile its revocation cache.
- Why all-tenant: the event-processor reconciles across every tenant in one pass.
- Why tenant scope can't satisfy it: the caller is a service, not a tenant; there is no single request tenant.
- Data exposed: connector ids + authorization/revocation state only (no secrets).
- External/user-controlled input: **No** — internal endpoint on the `global_const.go:48` allowlist, not tenant-facing.
- Required privilege: cross-tenant read. → **BYPASSRLS (system pool).**
- Audit: internal-endpoint access is already logged; add row-count.
- Failure behavior: empty result → event-processor keeps stale revocations (fails safe-ish, but a bug); T-CROSS/T-BOOT cover it.

**`VerifyConnectorIdentity` — `agent/identity.go:28,52`** — *needs a design decision, NOT auto-BYPASSRLS.*
- **RESOLVED (PHASE 1, code-verified):** `VerifyConnectorIdentityRequest` has exactly three fields — `connector_id` (1), `presented_key` (2), `connector_type` (3); **no `tenant_id`, no `GetTenantId()`** (`agent.pb.go:1762`, methods at `:1801/1808/1815`). The RPC therefore CANNOT be tenant-scoped — there is no tenant at verify time. → **BYPASSRLS (system pool).**
- **Why the cross-tenant lookup is safe (not IDOR):** the `presented_key` is a per-connector secret; the id only selects the candidate row, and `verifiedAgentIdentity`/`verifiedCollectorIdentity` reject a wrong/absent key. An attacker supplying another tenant's `connector_id` gets `NotFound`/auth-failure without the key. Authorization is the key check, not tenant membership.
- Data exposed: one connector row (key hash) — never returned; used only to verify the presented key.
- External/user-controlled input: **Yes** — `connectorId`. Mitigated by the key check above; log already records the resolved tenant on success.
- Required privilege: cross-tenant read → **system pool**. (Alternative — add `tenant_id` to the proto — rejected: it changes the agent↔manager wire contract and the agent has no numeric tenant at verify time.)

Everything else (ListAgents / ListCollector endpoint reads, the whole enrollment surface)
is tenant-facing and MUST be tenant-scoped under RLS with a per-tx GUC.

---

## 4. The policy (mirrors #282, adapted)

### 4.1 Tables with an own `tenant_id` — `agents`, `collectors`, `enrollment_tokens`, `enrollment_audit_events`
```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;   -- applies even to the table owner
CREATE POLICY tenant_isolation ON <t>
  USING      (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1))
  WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1));
```
- `current_setting('app.current_tenant', true)` — the `true` (missing_ok) returns NULL,
  not an ERROR, when the GUC was never set → an un-GUC'd query fails **closed** (matches
  against `-1`, an impossible tenant) instead of throwing. Identical to #282.
- `-1` is never a real tenant id (single-tenant = 0, MSSP ids positive).
- `WITH CHECK` blocks cross-tenant INSERT/UPDATE, not just reads.
- `FORCE` prevents the owner (migrator) from being a silent bypass.

### 4.2 `agent_commands` — no own `tenant_id` (gate 5)

Keep the parent relationship `agent_commands.agent_id → agents.id → agents.tenant_id`.
**Do NOT add a redundant `tenant_id` column** unless the prototype (PHASE 1) shows a
concrete need. Use **explicit `USING` and `WITH CHECK`** rather than relying on implicit
PostgreSQL defaulting (a policy with only `USING` leaves INSERT/UPDATE unconstrained by
that predicate on the NEW row):
```sql
ALTER TABLE agent_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_commands FORCE ROW LEVEL SECURITY;

-- Reads/updates/deletes: the command's owning agent must belong to the current tenant.
CREATE POLICY tenant_isolation_using ON agent_commands
  USING (EXISTS (
    SELECT 1 FROM agents a
     WHERE a.id = agent_commands.agent_id
       AND a.tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1)
  ));

-- Inserts/updates: the NEW row's agent must belong to the current tenant (blocks
-- creating a command against another tenant's agent).
CREATE POLICY tenant_isolation_check ON agent_commands
  FOR ALL
  WITH CHECK (EXISTS (
    SELECT 1 FROM agents a
     WHERE a.id = agent_commands.agent_id
       AND a.tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1)
  ));
```
**Prototype + test (PHASE 1, blocking) — cover every verb explicitly:**
- **SELECT**: tenant A sees only commands whose agent is A's.
- **INSERT**: creating a command for A's agent succeeds; for B's agent is **rejected** by `WITH CHECK`.
- **UPDATE**: A cannot update a command owned (via agent) by B; cannot re-point `agent_id` to B's agent.
- **DELETE**: A cannot delete B's command.
- **RLS-on-parent interaction**: `agents` is itself under RLS — confirm the sub-select resolves under the same GUC (a command whose parent agent is invisible to A must also be invisible), and that this does not need a separate GUC context.
- **GUC absent**: with no `app.current_tenant`, both policies evaluate the parent against `-1` → **zero rows / rejected write** (fail closed).
- Confirm the two-policy form (separate USING and WITH CHECK) behaves as one combined policy in PostgreSQL's OR-of-permissive evaluation — or collapse to a single `FOR ALL` policy carrying BOTH `USING` and `WITH CHECK` if the prototype shows that is clearer/safer.

### 4.3 Not under RLS
`last_seen` — no tenant column, pure system-context heartbeat cache. Left out (documented,
not forgotten). Open question #4 (§9): give it a `tenant_id`, or keep it system-context?
Recommendation: keep it system-context (heartbeat, not tenant-facing data).

---

## 5. Recommended split — §3.2a then §3.2b

### §3.2a — policy migration, inert ONLY under a verified role (gate 1)
- Add the `ENABLE/FORCE RLS + tenant_isolation` policy for the tables in §4, via a guarded
  SQL exec in `database/migration.go` (run by the migrator role — see §3.2b step 1).
- **Inert-ness is conditional, not assumed (§2.1):** the policy is a runtime no-op *only*
  while the app connects as a **SUPERUSER or BYPASSRLS** role. In every shipped deployment
  `DB_USER=postgres` is a superuser, so §3.2a is inert **there**. It is **NOT** safe to
  ship §3.2a to a deployment whose `DB_USER` is a non-superuser owner or ordinary role —
  `FORCE` would subject it to RLS with no GUC → boot auth outage. **Blocked on PHASE 0**
  (§8) verifying role semantics for every supported deployment.
- Prerequisite: every row has non-null `tenant_id` (agents/collectors `DEFAULT 0`;
  enrollment tables `NOT NULL`). No backfill needed — the manager's columns were born
  `NOT NULL`, unlike the backend.
- Rollback: `DROP POLICY` + `DISABLE RLS` per table — instant, no data change.

### §3.2b — runtime enforcement (the risky part, separate PR + full §7 matrix)

**1. Two roles.** Provision `hivearmor_agents_app` (unprivileged, NOT superuser, NOT
BYPASSRLS) for the normal GORM pool, and `hivearmor_agents_migrator` (BYPASSRLS, table
owner) for AutoMigrate. AutoMigrate MUST run as the migrator so `FORCE RLS` does not block
schema changes. (Mirrors A2-6 §1; operator/infra + env plumbing.)

**2. Transaction-bound GUC — concrete design (gate 2).** The GUC and the tenant SQL MUST
run in the SAME explicit transaction:
```
BEGIN
  SELECT set_config('app.current_tenant', $tenantId::text, true)   -- true = is_local (this tx only)
  <tenant SQL: SELECT / INSERT / UPDATE / DELETE>
COMMIT   (or ROLLBACK)
```
Because §2.2 found **every tenant-facing helper runs tx-less today**, §3.2b must first
introduce a tenant-tx wrapper — a single choke point, e.g.:
```go
// db.go — the ONLY tenant-scoped entry point once §3.2b lands.
func (d *DB) WithTenantTx(tenantID int64, fn func(tx *gorm.DB) error) error {
    if tenantID <= 0 { return status.Error(codes.PermissionDenied, "no tenant") } // fail closed
    return d.conn.Transaction(func(tx *gorm.DB) error {
        if err := tx.Exec("SELECT set_config('app.current_tenant', ?::text, true)", tenantID).Error; err != nil {
            return err
        }
        return fn(tx) // all tenant reads/writes use THIS tx handle
    })
}
```
Then reimplement `ScopedFind` / `ScopedGetByPagination` (and the write helpers used on
tenant-facing paths: `Create`/`Upsert`/`Updates`/`Delete`) to run **inside** `WithTenantTx`,
using the passed `tx` — never `d.conn`. The app-layer `TenantScope` predicate (#290) stays
(belt-and-suspenders with the DB GUC). Paths already inside `Transaction(fn)` (enrollment,
`agent_imp.go:86`) get `set_config` added as their first statement.
- **Inventory to convert (from §2.2), each verified in T-CONCURRENT/T-POOL-BLEED:**
  `ScopedFind`, `ScopedGetByPagination`, and every tenant-facing `Create`/`Upsert`/`Updates`/`Delete`/`GetFirst`
  caller. `GetAll`/`SystemContextFind` do NOT get a GUC — they run on the system pool (step 3).
- **Why not session-local GUC + reset:** a `set_config(..., false)` (session) on a pooled
  connection persists after return and bleeds to the next borrower unless perfectly reset
  on every path including panics — fragile. Transaction-local (`true`) is auto-scoped to
  the tx and cannot leak. T-POOL-BLEED and T-CONCURRENT are the proof (§7).

**3. System-context capability — a tightly restricted BYPASSRLS pool (gate 3).**
A **second GORM pool** connected as a BYPASSRLS system role, reachable ONLY through the
`SystemContextFind` abstraction (already the named escape from #290). Rules:
- **Only these methods may use the system pool**, and only for the reasons re-reviewed in §3:
  the boot credential cache warm-up, the collector cache, and `ListConnectorAuthorization`.
  (`last_seen` isn't RLS-protected; `VerifyConnectorIdentity` is TBD per §3 — prefer
  tenant-scoped.)
- Each is a **read-only, all-tenant** need with **no per-request tenant** (startup or
  service-to-service reconciliation) — a tenant-scoped call literally cannot express it.
- **Not externally reachable as a tenant** — boot has no request; `ListConnectorAuthorization`
  is on the internal-endpoint allowlist (`global_const.go:48`).
- **Audit:** the system pool logs every use (method name + row count) at INFO; a lint/review
  rule flags any NEW `SystemContextFind` call site so cross-tenant reads can't be added silently.
- **Prevented from accidental tenant-facing use:** the system pool is a private field only
  `SystemContextFind` closes over; it is NOT the pool the RPC handlers hold. New tenant-facing
  code physically cannot reach it without adding a `SystemContextFind` call, which is greppable
  and review-gated. It must NEVER become a general repository connection.
- **Why not `app.current_tenant = -1` = "all":** that turns the fail-closed sentinel into an
  all-access key — one mis-set or silently-no-op'd GUC becomes a cross-tenant read across the
  whole app. A narrow BYPASSRLS pool keeps the escape an auditable code path, not a magic value.
  This is the recommended design; the two-pool cost is accepted.

---

## 6. Risks & failure modes

| Risk | Trigger | Mitigation |
|------|---------|-----------|
| **Boot auth outage** | RLS on `agents` + boot cache read has no GUC/BYPASSRLS | System-context reads on the BYPASSRLS pool (§5.3). Test T-BOOT in §7 is the go/no-go. |
| Silent no-op | App still connects as SUPERUSER/BYPASSRLS role | §3.2a is a no-op ONLY under a superuser/BYPASSRLS role (§2.1). In shipped deployments `DB_USER=postgres` is superuser, so this is expected until §3.2b provisions the unprivileged role. T-CANARY proves RLS actually bites once the app role is unprivileged. A non-superuser owner deployment is NOT inert — PHASE 0 gates this. |
| Inert claim wrong on non-superuser deploy | `DB_USER` is a non-superuser owner/ordinary role + §3.2a's FORCE ships | PHASE 0 audits role semantics for EVERY supported deployment before §3.2a ships. |
| Migration blocked | AutoMigrate runs as unprivileged role under FORCE RLS | AutoMigrate must run as `hivearmor_agents_migrator` (BYPASSRLS). |
| `agent_commands` subquery mis-resolves | RLS-on-RLS parent lookup / WITH CHECK on insert | Prototype §4.2 before committing; T-CMD in §7. |
| GUC leak across pooled connections | `set_config(..., true)` not transaction-local | Use the `true` (is_local) form; verify with T-LEAK (a second query on a returned pool connection sees no GUC). |

---

## 7. Test matrix (§3.2b acceptance — extends the T18 cross-tenant matrix)

Integration tests (`//go:build integration`, real Postgres via testcontainers), run as the
**unprivileged** role so RLS is active:

- **T-BOOT** — with RLS enabled + unprivileged app role, the boot credential cache (via the
  BYPASSRLS system pool) loads agents for ALL tenants; agent auth succeeds. *Go/no-go.*
- **T-CANARY** — a raw `SELECT * FROM agents` (no GUC) on the app pool returns **zero rows**
  (proves RLS bites; if it returns rows, the role is still BYPASSRLS → misconfigured).
- **T-SCOPE** — with GUC set to tenant A, reads/writes see only tenant A's rows across all
  four tables.
- **T-CROSS** — tenant A's GUC cannot read/update/delete tenant B's agent, collector,
  enrollment token, or audit event (the T18 matrix, DB-enforced).
- **T-CMD** — command reads/inserts resolve the owning agent's tenant correctly (§4.2).
- **T-WRITE** — INSERT/UPDATE with the wrong/absent GUC is rejected by `WITH CHECK`.
- **T-LEAK** — GUC is transaction-local: a subsequent query on the same pooled connection
  (new tx, no GUC) sees zero rows, not the previous tenant's.
- **T-MIGRATE** — AutoMigrate as the migrator role succeeds with FORCE RLS on.
- **T-POOL-BLEED** — the connection-reuse proof. NOTE: the manager is **Go/GORM**, so the
  pool is Go's `database/sql` pool (NOT Java HikariCP — that is the backend). Sequence:
  tenant A tx → COMMIT → connection returned to the pool → a NEW tx with **no GUC** on a
  reused connection returns **zero** tenant rows (the A GUC did not survive) → then a
  tenant B tx sees **only** B's rows. Run with `SetMaxOpenConns(1)` to FORCE reuse of the
  same physical connection so the test is deterministic.
- **T-CONCURRENT** — many interleaved tenant transactions (A, B, C, A, B, …) over the
  shared pool, run in parallel goroutines, repeated; assert no goroutine ever observes
  another tenant's rows. Catches a GUC set on the wrong connection or a non-tx-local leak
  under contention (the failure T-LEAK/T-POOL-BLEED can miss single-threaded).
- **T-MISSING-GUC** — with the unprivileged app role, no `app.current_tenant`, on a
  tenant-protected table: **reads return zero rows AND writes are rejected** (fail closed).
  Test both read and write explicitly, on every RLS table including `agent_commands`.

---

## 8. Rollout — phased sequence (gate 7)

```
PHASE 0  Deployment compatibility audit (BLOCKS §3.2a)
         - Audit current DB role privileges for EVERY supported deployment.
         - Verify superuser / BYPASSRLS / owner / ordinary semantics of DB_USER.
         - Confirm which deployments would be inert vs immediately-enforcing under §3.2a's FORCE.
PHASE 1  Prototype the RLS policies against real PostgreSQL
         - The §4.1 column policies and the §4.2 agent_commands parent policy.
         - Run the per-verb agent_commands matrix (§4.2) and the missing-GUC fail-closed check.
PHASE 2  §3.2a — ship the policy migration (inert only where PHASE 0 proved it)
PHASE 3  Provision the app / migrator / system roles on hivearmor_agents
PHASE 4  Implement the transaction-bound GUC (WithTenantTx) + convert tenant-facing helpers (§5 step 2)
PHASE 5  Implement the system-context abstraction (BYPASSRLS pool, restricted per §5 step 3)
PHASE 6  Run the FULL §7 integration + concurrency matrix (incl. T-POOL-BLEED, T-CONCURRENT)
PHASE 7  Staging canary — T-BOOT + T-CANARY are go/no-go; watch agent auth success rate
PHASE 8  Production rollout
         - Rollback path: revert the app pool to a superuser/BYPASSRLS role (instant RLS no-op)
           or DROP POLICY per §3.2a rollback — the app-layer #290 scoping still protects every table.
```

## 8b. Acceptance gates — ALL must pass before §3.2b is complete (gate 8)

```
[ ] Current DB role semantics verified (every supported deployment)   (PHASE 0)
[ ] FORCE RLS behavior verified for that role                         (PHASE 0)
[ ] RLS policy prototype passes                                       (PHASE 1)
[ ] agent_commands policy passes (SELECT/INSERT/UPDATE/DELETE)         (PHASE 1)
[ ] transaction/GUC same-transaction guarantee proven                 (T-LEAK)
[ ] missing-GUC fail-closed test passes (read AND write)              (T-MISSING-GUC)
[ ] T-POOL-BLEED passes                                               (§7)
[ ] T-CONCURRENT passes                                               (§7)
[ ] T-BOOT passes                                                     (§7 / PHASE 7)
[ ] T-CANARY proves RLS actually bites                                (§7 / PHASE 7)
[ ] system-context call sites reviewed + greppable                    (§5 step 3)
[ ] BYPASSRLS system pool restricted (only §3-approved methods)       (§5 step 3)
[ ] migration path verified (AutoMigrate as migrator, FORCE on)       (T-MIGRATE)
[ ] rollback path verified                                            (PHASE 8)
```

**Objective (not merely "add RLS"):**
`app tenant isolation (#290)` + `transaction-bound tenant GUC` + `PostgreSQL RLS` +
`explicit system-context capability` + `connection-pool isolation` + `concurrency
verification` = defense-in-depth tenant isolation.

---

## 9. Open questions for review (before §3.2b code)

1. **§4.2 `agent_commands`** — prototype (PHASE 1) the parent-subquery policy under
   RLS-on-`agents` across SELECT/INSERT/UPDATE/DELETE and confirm the two-policy
   (USING + WITH CHECK) vs single `FOR ALL` form. **Blocking.**
2. **System pool credentials** — new `DB_SYSTEM_USER`/`DB_SYSTEM_PASSWORD` env pair, or a
   documented operator-provisioned role? (Also: app-pool creds for `hivearmor_agents_app`.)
3. **`VerifyConnectorIdentity` (§3)** — does the RPC carry a tenant? If yes, make it
   tenant-scoped (safer, closes an IDOR-shaped surface) instead of BYPASSRLS. Resolve in
   PHASE 1 — it is the only carve-out candidate with attacker-controlled input.
4. **`last_seen`** — add a `tenant_id`, or keep it a system-context table? Recommendation:
   keep system-context (heartbeat cache, not tenant-facing data).
5. **PHASE 0 finding to confirm:** every shipped deployment today uses `DB_USER=postgres`
   (superuser). Confirm there is no non-superuser-owner deployment in the field, since that
   config would make §3.2a's `FORCE` enforce immediately (not inert).
