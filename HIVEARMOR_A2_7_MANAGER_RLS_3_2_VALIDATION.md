# A2-7 §3.2 — Final Architecture / Security Validation (Agent Manager PostgreSQL RLS)

> **STATUS (2026-09-12): DELIVERED — verdict was GO WITH CONDITIONS; ALL conditions now resolved & merged to `release/v3`.**
>
> This report was produced as a post-implementation security gate on the already-merged
> §3.2 RLS design (PRs #290–#294). Its verdict — **GO WITH CONDITIONS** — has since been
> fully actioned:
>
> | Tier | Conditions | PR | State |
> |------|-----------|-----|-------|
> | Blocking | C1 (collector cross-tenant dup-check → SystemContextGetFirst), C4 (fail-fast boot guard on missing `DB_SYSTEM_USER`) | #304 | ✅ merged |
> | Required | C2 (`ListAgentCommands` under RLS GUC via `ScopedCommandsByPagination`), C3 (tenant-0 clarified — no gap), C5 (T-BOOT/T-MIGRATE/T-CROSS/T-LEAK tests) | #305 | ✅ merged |
> | Recommended | C6 (least-privilege system role — runbook matrix), C7 (RLS observability metrics), C8 (`agent_commands.agent_id` index) | #306 | ✅ merged |
>
> RLS remains **inert** until an operator provisions the unprivileged role split
> (`HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`); with every condition closed, that
> enablement is fully unblocked. The findings below are retained as the audit record.

---

## 1. Executive Verdict

**The single most important finding: §3.2 is NOT pre-implementation — it is already IMPLEMENTED and MERGED on `release/v3`** (this session's PRs #290–#294). `database/rls.go`, the `Scoped*`/`SystemContext*`/`WithTenantTx`/`ResolveTenantByID` helpers in `database/db.go`, the two-pool design, and a 9-case `//go:build integration` matrix all exist on disk. So this gate is really a **post-implementation architecture audit**, and the correct question is not "can it start" but "is the merged design sound and what remains before it is *enforcing* in production."

The design is **sound and fail-closed by construction**. RLS is currently **INERT** (the app connects as superuser `postgres`, which ignores RLS even under FORCE) — enforcement flips on via an **operator role split only, no code change**. Verdict: **GO WITH CONDITIONS** — the conditions are a small, concrete set (below), none of which are architectural rewrites.

---

## 2. Verified Codebase Facts

- **Helpers exist** (`database/db.go`): `ScopedFind`, `ScopedGetByPagination`, `ScopedCreate`, `ScopedUpsert`, `ScopedDelete`, `WithTenantTx`, `SystemContextFind/GetFirst/GetByPagination/Upsert`, `ResolveTenantByID`.
- **RLS installer** (`database/rls.go`): `buildRlsStatements()` emits `ENABLE`+`FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy on `agents`, `collectors`, `enrollment_tokens`, `enrollment_audit_events`, and a **parent-subquery** policy on `agent_commands`. Wired into `MigrateDatabase()` after AutoMigrate, idempotent (`DROP POLICY IF EXISTS` before each `CREATE`).
- **Two GORM pools** (`db.go`): `conn` (app, `DB_USER`) and `sysConn` (system, `DB_SYSTEM_USER` → falls back to app creds when unset).
- **GUC** is transaction-local: `WithTenantTx` runs `SELECT set_config('app.current_tenant', ?::text, true)` inside `d.conn.Transaction(...)`, fail-closed on `tenantID <= 0`.
- **Default deployment** (`local-dev/docker-compose.yml`): `DB_USER=postgres`, `DB_SYSTEM_USER` unset → **RLS is a runtime no-op today**.
- **Integration matrix** (`database/rls_integration_test.go`): 9 cases, runs as an unprivileged role off `RLS_TEST_DSN`, all previously green on postgres:16.

---

## 3. Plan-vs-Code Contradictions

1. **The task frames this as "final pre-implementation" — the code contradicts that: it is already merged.** No implementation PR sequence is needed for §3.2a/§3.2b core; what remains is enablement + a few hardening items. (Severity: framing; must be understood before acting.)
2. **Design doc "inert" claim — CONFIRMED true, but only for the shipped superuser config.** `rls.go` itself documents it. Contradiction risk only if any deployment runs the app as a non-superuser without the system role provisioned (then boot caches fail closed → agent-auth outage). See §9.
3. No other doc-vs-code contradictions found; the merged helpers match the design.

---

## 4. Security Findings (raw/unscoped tenant-facing access)

Four data-access sites touch tenant tables **without** a `Scoped*`/`SystemContext*`/`WithTenantTx` helper. **None is a confirmed leak on `release/v3`** (superuser today; and each fails closed under an unprivileged role), but all four are cut-over hazards or review-discipline gaps:

| # | Site | Issue | Severity |
|---|------|-------|----------|
| S1 | `collector_imp.go:138` `GetFirst("hostname = ? and module = ?")` | **Cross-tenant read with NO tenant predicate** (collector dup-check spans all tenants). Under the unprivileged role it returns 0 rows → **breaks legitimate collector re-registration** (fails closed the wrong way for availability). Also leaks cross-tenant existence today. | **HIGH (blocking condition)** |
| S2 | `agent_imp.go:~415` `ListAgentCommands` → raw `GetByPagination` | Only inventory read still NOT on a scoped helper; isolation rests entirely on `tenantScopedCommandFilters`. Must be verified to reject `tenant_id <= 0` and be un-wideable by `SearchQuery`. | **MEDIUM (condition)** |
| S3 | `agent_imp.go:186` `GetFirst("id = ? AND tenant_id = ?")` (DeleteAgent probe) | Manual tenant predicate, rejects `tenant<=0`, fails closed — but bypasses the helper layer (no GUC). Cosmetic/consistency. | LOW |
| S4 | `agent_imp.go:135` `SystemContextGetFirst` (UpdateAgent self-read) | Uses a system helper for a *tenant-facing* self-read (reads any tenant's row by id); the subsequent write is correctly GUC'd. Read-only cross-tenant peek gated by a context-authenticated id. | LOW |

`last_seen` writes (`lastseen_imp.go:133` raw `Upsert`) are **correctly unscoped** — that table has no `tenant_id` and is deliberately outside RLS. **Flag for the future:** if `tenant_id` is ever added to `last_seen`, the 30s flush ticker becomes an unscoped cross-tenant write.

---

## 5. RLS Policy Findings

- **Column tables** (`agents`/`collectors`/`enrollment_tokens`/`enrollment_audit_events`): `USING` = `WITH CHECK` = `tenant_id = COALESCE(NULLIF(current_setting('app.current_tenant', true), '')::bigint, -1)`. Correct for all four verbs; **fail-closed** via the `-1` sentinel on missing/empty GUC. Invalid/malformed GUC (`::bigint` cast failure) raises an error → transaction aborts → still closed, never an all-tenant bypass. ✅
- **`agent_commands`** parent-subquery (`EXISTS (SELECT 1 FROM agents a WHERE a.id = agent_commands.agent_id AND a.tenant_id = <GUC>)`): SELECT (invisible), DELETE (silent 0-row no-op — caught by affected-row checks), UPDATE (fails USING), INSERT (fails WITH CHECK, errors) — **all cross-tenant denied**. The parent `agents` RLS does not interfere; it runs under the same GUC and *reinforces* the explicit `a.tenant_id` clause. One benign edge: "belongs to another tenant" is indistinguishable from "does not exist" (both deny). ✅

---

## 6. Transaction / GUC Findings

- GUC set with `is_local = true` inside one `gorm.Transaction` → **same connection** for GUC + queries; **cannot leak** to the next pool borrower (proven by T-POOL-BLEED with `MaxOpenConns(1)` and T-CONCURRENT with 30 interleaved tenants). ✅
- Every `Scoped*` helper runs **inside** `WithTenantTx` on the passed `tx` (never `d.conn`), so DB-level RLS + app-level `TenantScope` predicate both apply (defense in depth). Tenant scope is applied *before* user `FilterScope` — cannot be widened by search. ✅
- **`tenantID <= 0` fails closed** at the app layer before any query. ⚠️ **CONDITION:** the guard rejects tenant id **0**; the design describes single-tenant as tenant **0**. Confirm no live single-tenant install passes 0 into these helpers (it would be denied — safe, never a leak, but a correctness/availability bug). The RLS predicate itself treats 0 as valid (only -1 is the sentinel); the mismatch is purely the Go guard.
- Background workers never inherit tenant state (tx-local GUC); no ambient/thread-local tenant anywhere (that's the Java backend pattern, absent here). ✅

---

## 7. System-context / BYPASSRLS Findings

- Exactly **6** methods touch `sysConn`; each documented "the ONLY method that uses d.sysConn." Surface is tiny and greppable. No accessor hands out the system handle; misuse is prevented by review + doc comment, not the type system (acceptable, but note it). ✅
- Justified all-tenant operations: **boot credential/collector/last-seen caches** (must be all-tenant or agent auth breaks), **`VerifyConnectorIdentity`** (no request tenant — the presented key is the authenticator), **`ListConnectorAuthorization`** (event-processor revocation reconcile, secret-free projection), **`resolveEnrollmentTenant`** (token is the authenticator), **`ResolveTenantByID`** (id→tenant resolve for write paths), **`SystemContextUpsert`** (the one collector tenant-rebind that no single GUC can satisfy). Each is genuinely cross-tenant-necessary. ✅
- **BYPASSRLS write scope:** the system role needs `SELECT` on all tables + `UPDATE on collectors` only (rebind). It should NOT be a general write handle. **CONDITION:** grant the system role least privilege (SELECT-all + UPDATE-collectors), not blanket write.
- **S1 (`collector_imp.go:138`) should move to `SystemContextGetFirst`** to make its all-tenant intent explicit and greppable (or be redesigned per-tenant).

---

## 8. Migration Findings

- RLS DDL runs at **every boot** via AutoMigrate → `installTenantRlsPolicies`; idempotent and correctly ordered (after `agents` exists). Safe under the current superuser role. ✅
- **Cut-over hazard:** once `DB_USER` is the unprivileged app role, `FORCE`/`CREATE POLICY`/AutoMigrate DDL require **table ownership**. The runbook's model (app role *owns* tables but is NOT superuser/BYPASSRLS) keeps boot DDL viable while FORCE still binds its DML. If migrations move out-of-band, boot AutoMigrate on a DML-only role fails and must be disabled. **CONDITION:** pick and document one model (owner-app vs out-of-band migrator) before enablement.
- **No `CREATE ROLE`/`GRANT` in code** — role provisioning is entirely operator-side (correct).

---

## 9. Boot / Availability Findings

- Startup: `MigrateDatabase()` → `InitGrpcServer()` warms **agent-key, collector-key, last-seen** caches **all via the system (`sysConn`) path**, before serving — so RLS **cannot** starve the credential cache. ✅ This is the design's most important availability property and it is correctly wired.
- **The failure mode to prevent:** switching `DB_USER` to the app role **without** setting `DB_SYSTEM_USER`. Then `sysConn` falls back to the unprivileged app creds, boot caches fail closed → **empty credential cache → total agent-auth outage.** The runbook flags this; it is not enforced in code. **CONDITION:** add a startup assertion that refuses to boot if the app role is non-superuser AND `DB_SYSTEM_USER` is unset (fail fast, loudly), OR a T-BOOT gate in CI.

---

## 10. Missing Coverage

- **T-BOOT** — absent in code (system-pool cache warm-up + agent-auth-stays-up). Only manual in runbook §4. **Highest-value gap.**
- **T-MIGRATE** — absent (idempotent re-run + boot DDL as the unprivileged owner under FORCE).
- **T-CROSS / T-LEAK** — exist only *implicitly* inside T-SCOPE / T-CONCURRENT / T-POOL-BLEED; no dedicated bidirectional cross-tenant-read or leak case.
- No test for the **tenant-0 guard** interaction (§6).
- No **observability**: no metric/log for RLS denial, missing-GUC, or system-context usage frequency.

---

## 11. Required Changes (conditions before "enforcing" go-live)

**C1 (HIGH).** Fix `collector_imp.go:138` cross-tenant dup-check — route via `SystemContextGetFirst` (explicit all-tenant intent) or redesign collector uniqueness per-tenant. As-is it breaks re-registration under the unprivileged role.
**C2 (MED).** Verify `tenantScopedCommandFilters` (used by `ListAgentCommands`) fails closed on `tenant_id <= 0` and cannot be widened by `SearchQuery`; add a test. Ideally migrate `ListAgentCommands` to `ScopedGetByPagination`.
**C3 (MED).** Resolve the **tenant-0** question: confirm single-tenant tenant id, and either allow 0 in the helpers or confirm single-tenant never calls them with 0.
**C4 (MED).** Add a **fail-fast boot assertion**: refuse to start if app role is non-superuser and `DB_SYSTEM_USER` is unset (prevents the agent-auth-outage cut-over mistake).
**C5 (MED).** Add **T-BOOT** and **T-MIGRATE** integration tests; promote T-CROSS/T-LEAK to explicit cases.
**C6 (LOW).** Least-privilege the system role (SELECT-all + UPDATE-collectors only); document the migrator model (C8).
**C7 (LOW).** Add observability: counter/log for RLS-denied (0-row scoped writes), missing-GUC rejections, and per-method system-context usage.
**C8 (LOW).** Confirm required **indexes** for the RLS predicates: `agents(tenant_id)`, `collectors(tenant_id)`, `enrollment_tokens(tenant_id)`, `enrollment_audit_events(tenant_id)`, and `agent_commands(agent_id)` + `agents(id)` for the parent subquery. (Models show `tenant_id index` tags; verify `agent_commands.agent_id` is indexed.)

---

## 12. Final PR Breakdown (for the remaining hardening + enablement — §3.2 core is already merged)

- **PR-A (C1):** collector dup-check → system-context/greppable; test. *Risk: MED (touches registration). Rollback: revert.*
- **PR-B (C2+C3):** `ListAgentCommands` scoping + tenant-0 resolution; tests. *Risk: MED. Rollback: revert.*
- **PR-C (C4):** fail-fast boot assertion on missing `DB_SYSTEM_USER`. *Risk: LOW. Rollback: revert.*
- **PR-D (C5):** T-BOOT, T-MIGRATE, explicit T-CROSS/T-LEAK. *Risk: LOW (tests only).*
- **PR-E (C6+C8):** least-privilege system role grants doc + index verification (+ add missing index if any). *Risk: LOW.*
- **PR-F (C7):** observability metrics/logs. *Risk: LOW.*
- **PR-G (enablement, operator, no code):** provision `hivearmor_agents_app` (unprivileged, owner) + `hivearmor_agents_system` (BYPASSRLS, SELECT-all+UPDATE-collectors) → set env → staging T-CANARY+T-BOOT gate → rollout. Rollback: revert `DB_USER` to superuser (instant, no DDL).

Dependencies: PR-A/B/C before PR-G (they close the cut-over hazards). PR-D/E/F can land in parallel.

---

## 13. Test Acceptance Matrix

| Test | Present? | Purpose / property proven |
|------|----------|---------------------------|
| T-CANARY | ✅ | app role, no GUC → 0 rows (fail-closed read) |
| T-SCOPE | ✅ | GUC=N sees only tenant N |
| T-CMD | ✅ | agent_commands parent policy scopes read + rejects cross-tenant insert |
| T-WRITE | ✅ | WITH CHECK blocks cross-tenant insert; cross-tenant delete = 0 rows |
| T-MISSING-GUC | ✅ | no GUC → write rejected |
| T-POOL-BLEED | ✅ | tx-local GUC never survives across tx on a reused conn |
| T-CONCURRENT | ✅ | 30 interleaved tenants, 0 leaks |
| T-CROSS | ⚠️ implicit | dedicated bidirectional cross-tenant read — ADD |
| T-LEAK | ⚠️ implicit | dedicated leak assertion — ADD |
| T-BOOT | ❌ | boot cache via system pool, agent auth stays up — ADD (highest value) |
| T-MIGRATE | ❌ | idempotent re-run + boot DDL as unprivileged owner under FORCE — ADD |

---

## 14. Final Decision

**GO WITH CONDITIONS.**

The merged §3.2 RLS design is architecturally sound, fail-closed, and correctly reasoned (tx-local GUC, parent-subquery for `agent_commands`, two-pool system context, boot caches on the BYPASSRLS path). It is safe to *keep* on `release/v3` as-is because it is **inert** under the shipped superuser role. It is **not yet safe to ENFORCE** (flip to the unprivileged role) until the cut-over conditions are closed.

---

## 15. Conditions Before Enforcement

**Blocking:** C1 (collector cross-tenant dup-check), C4 (fail-fast on missing `DB_SYSTEM_USER`).
**Required:** C2 (ListAgentCommands scoping proof), C3 (tenant-0), C5 (T-BOOT + T-MIGRATE).
**Recommended:** C6 (least-privilege system role), C7 (observability), C8 (index verification).

None require an architectural redesign. Closing C1–C5 makes the role-split enablement (PR-G) safe.
