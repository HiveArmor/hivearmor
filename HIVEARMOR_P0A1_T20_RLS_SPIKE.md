# HIVEARMOR P0A1-T20 — Postgres Row-Level Security (RLS) Defense-in-Depth Spike

> **Type:** SPIKE REPORT ONLY. No schema, code, or changeset changes are made or proposed for immediate merge. This evaluates PostgreSQL RLS as a *second* enforcement layer beneath the application-level tenant scoping shipped in P0-A1.
> **Date:** 2026-09-10 · **Repo:** `/Users/encryptshell/GIT/HiveArmor-v1`
> **Decision context:** the pre-P0-A brief (`HIVEARMOR_ENDPOINT_AGENT_PRE_P0A_DECISION_BRIEF.md`, Decision 3) recommended "PG-RLS on sensitive relational tables + `visibleBy` ACL on EDR events" as a targeted backstop, with the connection-pool tenant-propagation approach explicitly deferred to "a P0-A spike." This is that spike.

---

## 0. TL;DR — Recommendation

**Adopt RLS, but AFTER backfill + NOT NULL enforcement, and pilot it on the four EDR/response tables added in this batch first.**

RLS is genuinely worth adopting here — it closes the exact bug class P0-A1 just spent a batch fixing at the app layer (a read path that forgets its `tenant_id` predicate). But turning it on *today*, against **nullable, un-backfilled** `tenant_id` columns and a **single shared DB role**, would either leak (permissive null rows) or break (rows vanish under the policy) depending on how the policy treats `NULL`. The safe sequence is: backfill → `NOT NULL` → introduce a non-superuser app role → enable `FORCE ROW LEVEL SECURITY` on the pilot tables → widen. See §5 for the full justification and §4 for the phased plan.

---

## 1. What RLS buys us here

### 1.1 The exact failure mode P0-A1 closed at the app layer
P0-A1 made the primary tenant invariant explicit in `TenantScope` (`backend/src/main/java/com/hivearmor/multitenancy/TenantScope.java`):

> "every endpoint-scoped resource resolves through `tenant_id + resource_id`, never `resource_id` alone."

The audited defect class was precisely the inverse: a read that resolves by `resource_id` alone, or a repository `findAll(...)` with no tenant predicate. The remediation was to replace those with tenant-scoped finders — e.g. `EdrService.queryEvents` now calls `eventRepo.findFilteredForTenant(TenantScope.requireTenant(), ...)` (`backend/src/main/java/com/hivearmor/service/edr/EdrService.java:104`), and both quarantine services replaced their `findAll()` branch with `findByTenantId...` finders (`EdrService.java:142-148`, `HaEdrQuarantineService.java:59-68`, backed by `HaEdrQuarantineRepository.findByTenantId(...)` at `HaEdrQuarantineRepository.java:46-49`).

**The residual risk this leaves:** every one of those fixes is a *convention*, enforced only by the developer remembering to call the tenant-scoped finder. A grep for `findAll(` across the backend returns matches in **~183 files** — the surface where a future feature, or a refactor, can silently reintroduce an un-scoped read. Nothing in the database stops it. A single missed `WHERE tenant_id = ?` on any tenant table is a cross-tenant leak that compiles, passes type-checks, and looks correct in review.

**What RLS adds:** the `tenant_id` predicate becomes a property of the *table*, injected by PostgreSQL into every query on that table, regardless of what the ORM/SQL asked for. A query that forgets its tenant predicate returns only the current tenant's rows (or zero rows) instead of everyone's. It is a backstop, not a replacement — the app-layer checks stay primary (and stay the place where you get a clean 403/404 with correct error semantics); RLS is the seatbelt for the day a check is missed.

### 1.2 Why this codebase is a good RLS candidate
- The tenant key is already a **single uniform column** (`tenant_id BIGINT`) across the new tables (`hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine`, `hive_alert_response_rule_execution`) and pre-existing ones (dashboards via `20260824003`, detection packs via `20260907020`, telemetry via `20260819001`). One policy shape fits all of them.
- The request already carries an authoritative tenant in a single well-defined place (`TenantContext`), set by exactly one filter (`TenantContextFilter`). That is the one hook RLS needs (§2, §3.1).
- The primary enforcement already exists and is tested, so RLS can be introduced *incrementally* and *fail-closed* without being the only thing between a tenant and a leak during rollout.

---

## 2. The session-variable RLS pattern (how it would work)

The standard PostgreSQL pattern for app-enforced RLS is a per-request session variable (a custom GUC) that the policy reads:

```sql
-- 1. One-time, per table (illustrative — NOT a changeset in this spike):
ALTER TABLE hive_edr_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE hive_edr_event FORCE ROW LEVEL SECURITY;   -- see §3.5 re: table owner

CREATE POLICY tenant_isolation ON hive_edr_event
    USING (tenant_id = current_setting('app.current_tenant')::bigint);

-- 2. Per request/transaction, set by the app before any query runs:
SET app.current_tenant = '101';        -- or: SELECT set_config('app.current_tenant','101', true);
```

- `ENABLE ROW LEVEL SECURITY` turns policies on; with only a `USING` clause, rows failing the predicate are invisible to `SELECT/UPDATE/DELETE`. A `WITH CHECK` clause additionally blocks inserting/updating a row into another tenant.
- `FORCE ROW LEVEL SECURITY` makes the policy apply **even to the table owner** — important because without it the role that owns the table bypasses RLS entirely (§3.5).
- `current_setting('app.current_tenant')` reads the session GUC. `::bigint` matches the `tenant_id BIGINT` column type.

**The critical wiring point** is step 2: the app must set `app.current_tenant` on the *same physical connection* that then runs the tenant's queries, and must reset/clear it before that connection is returned to the pool. In this codebase that maps directly onto `TenantContextFilter.doFilterInternal`, which already does `TenantContext.set(clientId, prefix)` in a `try` and `TenantContext.clear()` in `finally` (`TenantContextFilter.java`). The GUC set/reset would ride alongside those two calls. The hard part is not the SQL — it is guaranteeing the "same connection" and "always reset" properties through a pool (§3.1).

Two ways to scope the GUC:
- `SET app.current_tenant = ...` — session-scoped; persists on the connection until reset. Requires disciplined reset-on-return.
- `set_config('app.current_tenant', ..., true)` — the `true` makes it **transaction-local**; it auto-resets at transaction end. Safer against pool bleed, but requires every tenant query to run inside a transaction. This codebase runs Hikari with **`auto-commit: false`** (`application-prod.yml:19`), which means work already runs in transactions — a point in favour of the transaction-local form.

---

## 3. The hard problems for THIS codebase

### 3.1 Connection pooling (HikariCP) — the central risk
Prod uses HikariCP (`application-prod.yml:13-27`): `maximumPoolSize: 20`, `minimumIdle: 5`, `auto-commit: false`, `connectionTestQuery: SELECT 1`. A pooled connection is handed to a request, used, and returned for reuse by a *different* request/tenant. Two failure modes:

1. **Leak-across-tenant (the dangerous one):** if `app.current_tenant` is set with session scope and *not* reset when the connection returns to the pool, the next request that borrows that connection inherits the previous tenant's GUC. If that next request forgets to set its own tenant, it reads the wrong tenant's data — RLS actively *causes* a leak it was meant to prevent.
2. **Fail-closed (the safe one):** if a query runs on a connection where `app.current_tenant` was never set, `current_setting('app.current_tenant')` throws `unrecognized configuration parameter` (unless declared) — or, if declared with a default, evaluates the policy against that default. A sensible default of an impossible tenant id (e.g. `-1`) makes the "forgot to set it" case return zero rows rather than leak.

**Mitigations, in order of robustness:**
- Prefer the **transaction-local** `set_config(..., true)` form (§2). With `auto-commit: false` already in place, the GUC dies at commit/rollback, so it cannot bleed to the next borrower. This is the single most important design choice.
- Set a **safe default** GUC (`ALTER DATABASE ... SET app.current_tenant = '-1'`) so an unset connection fails closed (zero rows), never open.
- Use a Hikari connection lifecycle hook to reset the GUC on return as belt-and-suspenders — but do **not** rely on reset alone; transaction-local scope is the real guarantee.
- **pgbouncer caveat:** there is no pgbouncer in the compose stack today (`local-dev/docker-compose.yml`), and prod connects Hikari straight to Postgres (`jdbc:postgresql://${DB_HOST}...`). If pgbouncer is ever introduced, **transaction-pooling mode is incompatible with session-scoped `SET`** (a `SET` on one server connection can be reused under a different client). Transaction-local `set_config(..., true)` is the only pgbouncer-safe form, and even then requires session/transaction pooling alignment. Flag this before any pgbouncer adoption.

The Hikari `connectionTestQuery: SELECT 1` and `keepaliveTime` do not interact with a transaction-local GUC (they run outside the app's transactions), so they are not a concern for the transaction-local form.

### 3.2 The single-tenant `tenant_id = 0` sentinel
`TenantScope.requireTenant()` returns **`0L`** on a single-tenant (non-MSSP) deployment (`TenantScope.java`), and the batch write paths stamp `0` in that mode (e.g. the ARR-execution changeset comment: "TenantScope.currentTenantOrNull → 0 for single-tenant"). RLS must not break single-tenant installs, which are the majority. Two clean options:
- On single-tenant deployments, set `app.current_tenant = '0'` for every request/background pass (the executor already resolves to "client id 0" in this mode — `TenantScopedBackgroundExecutor.runOne` clears context so `requireTenant()` yields 0). All rows carry `tenant_id = 0`, the policy `tenant_id = 0` matches everything, and RLS is a no-op that still guards against a stray write with a different id.
- Or gate RLS behind the MSSP-mode flag so single-tenant installs never enable it. Simpler, but loses the backstop for a single-tenant box that later becomes MSSP. Prefer the first (uniform behaviour, no mode-specific schema state).

### 3.3 Background / system-context flows (the T14 executor)
`TenantScopedBackgroundExecutor` (`backend/src/main/java/com/hivearmor/multitenancy/TenantScopedBackgroundExecutor.java`) is the sanctioned path for scheduled jobs: it enumerates tenants and runs work **once per tenant** under that tenant's `TenantContext` (`set(clientId, prefix)` → run → `clear()` in `runOne`). This is exactly the shape RLS wants — the GUC would be set from `TenantContext.getClientId()` at the top of `runOne`'s work and cleared with the context.

Two wrinkles:
- **The enumeration query itself.** The executor calls `clients.findByMsspManagedTrueAndClientPrefixIsNotNull()` on `ha_client` to *get the list of tenants*. That query legitimately spans all tenants and must run **before** any per-tenant GUC is set. `ha_client` (the tenant registry) must therefore **not** be under a tenant-isolation policy — it is metadata about tenants, not tenant-owned data (§3.7).
- **The per-tenant work runs on whatever thread the scheduler uses**, not a request thread. So the GUC-set logic cannot live only in `TenantContextFilter`; it must live wherever `TenantContext.set(...)` is honoured — ideally a single choke point (a JDBC connection-prepare hook keyed off `TenantContext.getClientId()`) so both request threads and background threads get the GUC without duplicated wiring. This is the main *new* infrastructure RLS requires: one place that reads `TenantContext` and issues `set_config` on the connection being checked out. Without it, background writes would run with no GUC and (with a `-1` default) fail closed — jobs would silently write/read nothing.

### 3.4 The agent-manager Go/GORM connection is a SEPARATE datasource
`agent-manager` opens its **own** Postgres connection via GORM (`agent-manager/database/db.go`: `gorm.Open(postgres.Open(dsn), ...)`, DSN built from `config.DBHost/DBPort/DBUser/...`). This is a different process, different pool, different code path from the Java backend's Hikari pool — and per the project notes it uses its own database (`hivearmor_agents`, GORM auto-migrate) rather than the Liquibase-managed `hivearmor` DB.

Implications:
- RLS enabled on the Java backend's `hivearmor` tables does **nothing** for agent-manager's tables. If the agent registry needs an RLS backstop, that is a separate workstream in Go, with its own GUC-set-per-`GetDB()`-operation wiring — and `db.go` has methods like `GetAll`, `Delete(..., hardDelete)`, and `GetByPagination(... getDeleted)` that call GORM `.Unscoped()` / `.Find()` with a caller-supplied `query` string. An empty `query` in `GetAll` runs an unfiltered `Find` — the same "forgot the predicate" surface, but in Go.
- **Scope decision for T20:** keep the RLS pilot to the Java backend's Liquibase-managed tables (which is where all four batch tables live). Treat agent-manager RLS as out of scope for this spike and note it as a follow-on — it cannot share the backend's connection wiring and would need its own design.

### 3.5 Migration / superuser bypass
- **Liquibase runs migrations.** Migrations must be able to see and alter all rows regardless of RLS. Liquibase typically runs as the DB owner/`${DB_USER}`. RLS policies apply to the roles you enable them for; the migration role should be exempt (either it is a superuser, or it is the table owner *without* `FORCE`, or it is explicitly granted `BYPASSRLS`). Because we would want `FORCE ROW LEVEL SECURITY` for the *app* role (so the owner doesn't silently bypass), the cleanest model is: **migrations run as a role with `BYPASSRLS`; the application runs as a distinct, non-superuser, non-`BYPASSRLS` role** subject to `FORCE`.
- **Today there is only one role.** Both Liquibase and the app authenticate as the single `${DB_USER}` (`application-prod.yml:16`), and in dev/functional that is `postgres` (`application-functional.yml:16`), a superuser. **A superuser bypasses RLS unconditionally** — so with the current setup, enabling RLS would have *no effect* on the running app. Therefore a prerequisite for RLS to do anything is **introducing a dedicated, unprivileged application DB role** and pointing Hikari at it, while migrations keep the privileged role. This is a real operational change (new secret, new grant management) and belongs in the phased plan, not a schema changeset.

### 3.6 Tables without `tenant_id`
Many tables have no tenant column: shared reference/config tables, `ha_client` itself, JHipster's `jhi_user` / authority tables, index-pattern and server config (`UtmIndexPattern`, `UtmServer` — both expose plain `findAll()`), report templates, etc. RLS is applied **per table**, so this is not a blocker — you simply do not put a tenant policy on a table that has no tenant. The discipline needed is a clear, documented classification: for each table, "tenant-owned (gets a policy)" vs "shared/metadata (no policy)". Getting a table into the wrong bucket is the risk — a tenant-owned table left un-policied is an un-backstopped leak; a shared table wrongly policied breaks cross-tenant/admin reads. This classification is the main design artifact the pilot should produce.

### 3.7 The nullable `tenant_id` rollout window — the reason not to enable now
Every batch changeset adds `tenant_id` as **`nullable="true"`** and explicitly defers backfill and NOT NULL:
- `20260909001_ha_edr_event_tenant.xml`: "Added nullable so existing rows and in-flight ingests during rollout are tolerated; a backfill (operational job) populates existing rows … enforcement to NOT NULL is deferred to a later batch."
- `20260910001_ha_edr_quarantine_tenant.xml` and `20260910002_ha_arr_execution_tenant.xml`: same pattern, NOT NULL deferred "after backfill."

The scoped finders already handle this by **excluding null rows** (the app-level fix; e.g. `findFilteredForTenant` filters on `tenant_id = ?`, so pre-backfill null rows are simply not returned). But an RLS policy of `USING (tenant_id = current_setting('app.current_tenant')::bigint)` behaves badly against nulls:
- `NULL = 101` evaluates to `NULL` (not `TRUE`), so **null-`tenant_id` rows are invisible to everyone** under the policy — including the backfill job if it runs as a policied role. That can make pre-backfill data appear to vanish, and can make a backfill written as a normal tenant-scoped `UPDATE` unable to see the rows it must fix.
- If someone "fixes" that by writing `USING (tenant_id = ... OR tenant_id IS NULL)` to keep null rows visible, they have created a **permissive hole**: every tenant can see every null row. During the rollout window (rows not yet backfilled) that is a cross-tenant read of exactly the data RLS was meant to protect.

There is no policy formulation that is both safe and non-breaking while `tenant_id` is nullable and unbackfilled. **This is the decisive reason to sequence RLS after backfill + NOT NULL** (§4, §5). Once `tenant_id` is `NOT NULL`, the simple `tenant_id = current_setting(...)` policy is both correct and leak-free.

---

## 4. Phased adoption plan (with rollback)

Each phase is independently shippable and independently reversible. No phase below is executed in this spike.

| Phase | Action | Precondition | Rollback |
|---|---|---|---|
| **P0 — Prereqs (no RLS yet)** | (a) Run the deferred backfill jobs to populate `tenant_id` on existing rows of the four batch tables from their owning agent/rule; (b) add NOT NULL changesets once backfill verified; (c) introduce a dedicated unprivileged **app DB role** and repoint Hikari (`${DB_USER}`) at it, keeping a privileged/`BYPASSRLS` role for Liquibase. | Backfill jobs exist and are verified; new role provisioned. | Revert Hikari to prior role; drop NOT NULL (add-back nullable). All reversible; no policy exists yet. |
| **P1 — Wiring choke point (no policy yet)** | Add the single connection-checkout hook that reads `TenantContext.getClientId()` (or 0/`-1` default) and issues transaction-local `set_config('app.current_tenant', ..., true)`. Ships **inert** because no table has a policy yet. Verify via a probe query that the GUC is set on request threads AND on `TenantScopedBackgroundExecutor` threads. | P0 done. | Remove the hook; it is a no-op until policies exist, so removal is safe any time. |
| **P2 — Pilot (the 4 batch tables)** | Enable `ENABLE`/`FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy on `hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine`, `hive_alert_response_rule_execution`. These are natural pilots: freshly added, tenant-partitioned, already read through tenant-scoped finders, and lower-blast-radius than core config. Run the P0A1-T18 cross-tenant matrix against them with RLS on. | P1 verified; these tables NOT NULL. | `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` / `DROP POLICY` — instant, per-table, no data change. App-layer scoping still protects them. |
| **P3 — Widen to pre-existing tenant tables** | Classify every table (tenant-owned vs shared, §3.6), then enable policies on dashboards (`20260824003`), detection packs (`20260907020`), telemetry (`20260819001`), and other tenant-owned relational tables, one changeset per small group. | Pilot stable in prod for an agreed soak; classification signed off. | Per-table DISABLE/DROP as P2. |
| **P4 — (separate track) agent-manager Go** | Decide whether `hivearmor_agents` needs its own RLS; if so, design GUC wiring in `db.go`. Out of scope for the backend track. | Explicit decision. | N/A (separate service). |

**Global rollback property:** because RLS is additive and the app-layer checks remain primary and tested, disabling RLS at any phase returns the system to exactly its current (P0-A1) security posture. There is no point at which RLS becomes load-bearing enough that its removal reopens a leak the app layer wasn't already guarding.

---

## 5. Recommendation & justification

**Adopt RLS as a defense-in-depth backstop — scheduled AFTER backfill + NOT NULL, piloted on the four batch tables (Phase P2), then widened.** Do **not** enable it in this batch.

Justification:
1. **It closes a real, demonstrated bug class.** The whole of P0-A1 was fixing un-scoped reads that the DB happily served. RLS makes the tenant predicate a table property, so the next forgotten `WHERE tenant_id` (across a ~183-file `findAll(` surface) fails closed instead of leaking. For the stated **government / MSSP** targets, a DB-enforced backstop on the highest-value tables is worth the operational cost — this matches the pre-P0-A brief's Decision 3 (Option B).
2. **Enabling it now would be actively harmful.** With `tenant_id` **nullable and un-backfilled** (§3.7) there is no policy that is simultaneously safe and non-breaking, and with a **single superuser DB role** (§3.5) RLS would either be silently bypassed (no effect) or, once a real app role exists, would hide un-backfilled rows. Both are worse than the current clean app-layer state.
3. **The prerequisites are genuine work, not schema toggles.** A dedicated unprivileged app role, verified backfill, NOT NULL enforcement, and a single connection-checkout GUC choke point that also covers the background executor — these are the actual deliverables. Sequencing them first is what makes RLS safe rather than a foot-gun.
4. **It is fully reversible at every step**, and never becomes the only line of defense, so the downside of proceeding cautiously is low and the option to stop is always open.

If the team wants a smaller commitment: ship Phases **P0 + P1** (backfill, NOT NULL, app role, inert GUC wiring) as a low-risk foundation, then make the P2 pilot a deliberate go/no-go with the T18 matrix as the gate.

---

## 6. Top 3 risks

1. **Connection-pool GUC bleed (leak) or unset GUC (breakage).** A session-scoped `SET` not reset on connection return leaks the prior tenant's scope to the next borrower; an unset GUC with an open default leaks globally. **Mitigation:** transaction-local `set_config(..., true)` (viable because Hikari already runs `auto-commit: false`), plus a fail-closed `-1` default GUC. This is the make-or-break design choice. (§3.1)
2. **The nullable/un-backfilled rollout window.** Any policy enabled while `tenant_id` is nullable either hides un-backfilled rows (breaks reads and the backfill job) or, if widened to include nulls, exposes every null row to every tenant. **Mitigation:** backfill + NOT NULL strictly before any policy (Phases P0→P2). (§3.7)
3. **Superuser / single-role bypass silently no-ops RLS.** Today both app and Liquibase use one `${DB_USER}` (superuser in dev), which bypasses RLS entirely — teams could "enable RLS," see green tests, and ship a backstop that does nothing. **Mitigation:** a dedicated unprivileged app role with `FORCE ROW LEVEL SECURITY`, a separate `BYPASSRLS`/privileged role for migrations, and a test that proves a policied role actually cannot cross tenants. (§3.5)

---

### Sources (grounded in repo)
- `backend/src/main/java/com/hivearmor/multitenancy/TenantScope.java` — `requireTenant()` (0 sentinel), `currentTenantOrNull()`, primary invariant.
- `backend/src/main/java/com/hivearmor/multitenancy/TenantContext.java` — thread-local `set/clear`, `getClientId()`.
- `backend/src/main/java/com/hivearmor/multitenancy/TenantContextFilter.java` — per-request `set(...)`/`clear()` (the GUC hook point).
- `backend/src/main/java/com/hivearmor/multitenancy/TenantScopedBackgroundExecutor.java` — per-tenant background loop; `ha_client` enumeration.
- `backend/src/main/java/com/hivearmor/service/edr/EdrService.java:104,142-148` and `HaEdrQuarantineService.java:59-68`, `HaEdrQuarantineRepository.java:46-49` — the tenant-scoped finders (app-layer fix).
- `backend/src/main/resources/config/application-prod.yml:13-27` (Hikari pool, `auto-commit:false`, single `${DB_USER}`); `application-functional.yml:16` (`postgres` superuser in dev).
- `backend/src/main/resources/config/liquibase/changelog/20260909001_ha_edr_event_tenant.xml`, `20260910001_ha_edr_quarantine_tenant.xml`, `20260910002_ha_arr_execution_tenant.xml` — nullable `tenant_id`, deferred backfill/NOT NULL. Pre-existing: `20260824003` (dashboards), `20260907020` (detection packs), `20260819001` (telemetry).
- `agent-manager/database/db.go` — separate GORM datasource (`gorm.Open`), `GetAll/Delete(hardDelete)/GetByPagination(getDeleted)` `.Unscoped()`/`.Find()` paths.
- `HIVEARMOR_ENDPOINT_AGENT_PRE_P0A_DECISION_BRIEF.md` — Decision 3 (Option B: PG-RLS on sensitive tables + `visibleBy`; propagation deferred to this spike).
