# HiveArmor A2-7 §3.2b — runtime RLS enforcement: implementation scope

> **Status: DELIVERED (code merged to `release/v3`).** §3.2b shipped as two PRs off this
> plan, plus §3.2a (#292) it built on:
>
> | Step | PR | Merge commit |
> |------|----|--------------|
> | §3.2a RLS policies (inert) | #292 | `4f7e3fb7` |
> | §3.2b steps 1-2 — system pool + `WithTenantTx` GUC + convert reads | #293 | `d255b8cf` |
> | §3.2b step 3 — all writes tenant-GUC'd + integration matrix | #294 | `72ab32d6` |
>
> PHASE 0 (role audit) and PHASE 1 (live policy prototype + VerifyConnectorIdentity check)
> completed — results in §5 below. Enforcement is enabled by the operator role split:
> `HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`. Until then the code is correct-under-RLS
> but inert (app connects as superuser). The original scope text is retained below as the
> implementation record.

---

> **Original status: SCOPE.** Turned the §3.2b design (`HIVEARMOR_A2_7_MANAGER_RLS.md`
> §5 step 1-3, §8 PHASE 3-6) into an ordered, code-grounded implementation plan. §3.2a
> (the policies) merged as PR #292 (`4f7e3fb7`), inert under the current superuser role.
> §3.2b is what makes RLS actually enforce.
>
> This was the RISKY PR: it changes the runtime DB connection and can brick agent auth at
> boot if the system-context path is wrong. It was gated behind the design's PHASE 0 (role
> audit) and PHASE 1 (policy prototype).

---

## 0. The three pieces (from the design)

1. **Two roles** — `hivearmor_agents_app` (unprivileged) for the normal pool;
   `hivearmor_agents_migrator` (BYPASSRLS, owner) for AutoMigrate.
2. **`WithTenantTx`** — a transaction that sets `set_config('app.current_tenant', …, true)`
   then runs the tenant SQL, so the GUC and the query share one tx (the GUC is tx-local).
3. **System-context pool** — a second BYPASSRLS GORM pool, reachable ONLY via
   `SystemContextFind`, for the all-tenant reads (boot cache, ListConnectorAuthorization).

---

## 1. Caller inventory (verified on `release/v3` post-#292)

### 1a. Reads that carry a request tenant → route through `WithTenantTx`
| Site | Current call | Note |
|------|--------------|------|
| `collector_imp.go:264` ListCollector | `ScopedGetByPagination(tenantID, …)` | already has tenant; wrap in tenant-tx |
| `agent_imp.go` ListAgents | `ScopedGetByPagination(tenantID, …)` | same |
| `agent_imp.go:176` credential self-lookup | `GetFirst("id = ? AND tenant_id = ?", id, tenantId)` | already tenant-carrying (fixed in #291) |
| enrollment list/revoke/audit | already inside `Transaction(fn)` with `Where tenant_id = ?` | just prepend `set_config` |

### 1b. Reads that are all-tenant system-context → route to the SYSTEM POOL (no GUC)
| Site | Call | Classification (design §3) |
|------|------|-----------|
| `agent_imp.go:59` boot cache | `GetAll(&agents,"")` | BYPASSRLS pool |
| `collector_imp.go:72` collector cache | `GetAll(&collectors,"")` | BYPASSRLS pool |
| `lastseen_imp.go:53` lastseen | `GetAll(&pings,"")` | table not RLS-protected; either pool |
| `identity.go:89,101` ListConnectorAuthorization | `GetByPagination(...)` all-tenant | BYPASSRLS pool |
| `identity.go:28,52` VerifyConnectorIdentity | `GetFirst("id = ?", connectorId)` | **OPEN Q (design §3): prefer tenant-scoped if the RPC carries a tenant; else system pool** |

### 1c. WRITES — the hard part (⚠️ several are keyed by `id` alone, NOT tenant)
Under RLS a write needs the GUC set to the row's tenant, but some callers only hold `id`:
| Site | Current call | Has request tenant at the write? |
|------|--------------|------------------|
| `collector_imp.go:162` Create collector | `Create(collector)` | YES — `tenantID` at :127; set GUC from it |
| `collector_imp.go:196,230` Upsert collector | `Upsert(..., "id = ?", ..., old.ID)` | tenant known nearby (bound/req); thread it |
| `collector_imp.go:235` Delete collector | `Delete(..., "id = ?", false, id)` | **needs the collector's tenant — from req** |
| `agent_imp.go:158` Upsert agent | `Upsert(&agent, "id = ?", nil, idInt)` | agent struct has TenantID; set GUC from it |
| `agent_imp.go:191` soft-delete agent | `Upsert(..., "id = ?", {deleted_by}, idInt)` | **id-only — must fetch/thread tenant** |
| `agent_imp.go:196` delete agent commands | `Delete(&AgentCommand{}, "agent_id = ?", false, idInt)` | RLS via parent agent policy; needs GUC = agent's tenant |
| `agent_imp.go:202` delete agent | `Delete(&Agent{}, "id = ?", false, idInt)` | **id-only — must thread tenant** |
| `agent_imp.go:340,361,380` command history | `Create/Upsert` | on the command path; tenant = agent's — thread it |

**This is the load-bearing scoping risk:** the `id`-only write paths (agent delete/soft-delete,
collector delete, command deletes) must be changed to also carry the caller's tenant so the
GUC can be set — otherwise, under RLS, the write matches zero rows (fail closed) and the
delete/upsert **silently no-ops**. Each must be traced to confirm the request tenant is
available at the call site (the `DeleteRequest`/`AuthResponse` protos DO carry `tenant_id`,
per `common.pb.go:313` / `agent.pb.go`), then threaded into a tenant-tx write.

---

## 2. Implementation order (smallest safe steps)

1. **System pool first, no policy dependency.** Add a second connection in `GetDB()`
   (second `sync.Once` field `sysConn`, its own DSN from new `DB_SYSTEM_USER/PASSWORD`,
   or the same creds until roles exist). Reimplement `SystemContextFind` to use `sysConn`.
   Migrate the four §1b system reads to `SystemContextFind`. **No behavior change yet**
   (both pools are the same superuser until roles split) — but it establishes the seam.
2. **`WithTenantTx` + convert reads.** Add `WithTenantTx(tenantID, fn)` to `db.go`.
   Reimplement `ScopedFind`/`ScopedGetByPagination` on top of it. Prepend `set_config` to
   the existing enrollment `Transaction(fn)` blocks. Still inert under superuser.
3. **Convert the writes (§1c).** Thread the request tenant into each write path and run it
   inside `WithTenantTx`. The `id`-only paths get a tenant argument. This is the step that
   needs the most review + the T-WRITE / T-MISSING-GUC tests.
4. **Role split (operator + config).** Provision the two roles; point the app pool DSN at
   `hivearmor_agents_app`, the system pool at a BYPASSRLS role, AutoMigrate at the migrator.
   THIS is the step that flips RLS from inert to enforcing.
5. **Run the full §7 matrix** (T-BOOT, T-CANARY, T-CROSS, T-CMD, T-WRITE, T-LEAK,
   T-MIGRATE, T-POOL-BLEED, T-CONCURRENT, T-MISSING-GUC) against a real Postgres
   (testcontainers, `//go:build integration`).

**Recommended PR boundary:** steps 1-3 (code, inert, testable) as the §3.2b PR; step 4
is an operator/config change (env + role provisioning) that can ride separately or as the
enabling flag. Steps 1-2 could even be their own PR if step 3 (writes) proves large.

---

## 3. Risks specific to §3.2b

| Risk | Mitigation |
|------|-----------|
| **Boot auth outage** — boot cache read fails closed under RLS | Step 1 routes it to the BYPASSRLS system pool BEFORE step 4 enables enforcement. T-BOOT is go/no-go. |
| **Silent write no-op** — an `id`-only delete/upsert matches zero rows under RLS | Step 3 threads the tenant into every write; T-WRITE asserts a correctly-GUC'd write succeeds and a mis-GUC'd one is rejected (not silently skipped). |
| **GUC leak across pooled conns** | `WithTenantTx` uses tx-local `set_config(...,true)`; T-POOL-BLEED + T-CONCURRENT prove no leak. |
| **DB-wide mutex + tx** | `WithTenantTx` wraps `d.conn.Transaction`; the existing `Transaction` already holds `d.locker` — confirm no double-lock when reads inside also call locked helpers (use the passed `tx`, never `d.*` helpers, inside `fn`). |
| **VerifyConnectorIdentity** | Resolve the design §3 open question (tenant-scope vs system pool) in PHASE 1 before wiring. |

---

## 4. Open decisions before coding (carry from design §9)

1. **System pool credentials** — new `DB_SYSTEM_USER`/`DB_SYSTEM_PASSWORD` env, plus
   `DB_APP_USER`/`DB_APP_PASSWORD` for the unprivileged pool? Or one env with a documented
   role the operator provisions? (Affects `config/global_const.go` + compose.) — **STILL OPEN.**
2. **`VerifyConnectorIdentity`** — **RESOLVED (PHASE 1, code):** the request has no
   `tenant_id` field (`agent.pb.go:1762`), so it cannot be tenant-scoped → **system
   (BYPASSRLS) pool**. Safe because the presented key is the authenticator, not tenant
   membership.
3. **PR shape** — steps 1-3 in one §3.2b PR, or split 1-2 (pool + reads) from 3 (writes)?
   — **STILL OPEN** (recommend split if step 3 proves large).
4. **agent_commands** — **RESOLVED (PHASE 1, live prototype on postgres:16, unprivileged
   role):** the parent-subquery policy works for both read and write; no redundant column.

---

## 5. PHASE 1 live-prototype results (postgres:16, role ha_app = non-super/non-bypass)

Ran the §292 policies + the agent_commands parent policy against a throwaway Postgres as
an unprivileged role. **All assertions passed exactly:**

| Test | Expected | Actual |
|------|----------|--------|
| T-CANARY (no GUC) | 0 rows | 0 — RLS bites |
| T-SCOPE t1 (agents/collectors/tokens/audit/commands) | 1 each | 1,1,1,1,1 |
| T-CROSS (t1 sees t2 agent 20) | 0 | 0 |
| T-CMD read (t2 sees own cmd, not t1's) | 1, 0 | 1, 0 |
| T-WRITE insert cross-tenant (t1 → t2 row) | REJECTED | ERROR: new row violates RLS |
| T-WRITE insert own | success | INSERT 0 1 |
| T-CMD insert for other tenant's agent | REJECTED | ERROR: violates RLS on agent_commands |
| T-CMD insert for own agent | success | INSERT 0 1 |
| **T-WRITE delete cross-tenant (t1 deletes t2 agent 20)** | **0 rows (silent no-op)** | **0; row survived** |
| T-MISSING-GUC write | REJECTED | ERROR (fail closed on writes) |

**Two confirmations that shape §3.2b:**
- The **`agent_commands` parent-subquery policy is correct** for SELECT and INSERT (USING +
  WITH CHECK). No redundant `tenant_id` column needed. Closes open questions #4/§9.1.
- The **silent-delete-no-op is REAL**: `DELETE ... WHERE id=<other tenant>` under a
  tenant GUC affects **0 rows and leaves the row intact** — no error. So §3.2b step 3 MUST
  thread the tenant into every `id`-only write path, and **T-WRITE must assert the affected
  row count** (a mis-scoped delete must be caught, not pass silently). This is the
  load-bearing correctness risk of §3.2b.

Prototype SQL: `$KIROCREW_SCRATCH/rls_setup.sql` + `rls_matrix.sql` (throwaway container,
torn down). PHASE 1 is complete except open decisions #1 (pool credentials/env) and #3 (PR
shape), which are choices for §3.2b, not correctness unknowns.
