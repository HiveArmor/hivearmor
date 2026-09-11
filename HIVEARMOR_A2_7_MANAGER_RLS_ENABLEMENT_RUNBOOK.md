# HiveArmor A2-7 — agent-manager RLS enablement runbook (operator role split)

> **Audience: operators / SRE.** This is the ONLY remaining step to turn the
> agent-manager's tenant Row-Level Security from *inert* to *enforcing*. All the code
> shipped to `release/v3`: PR #290 (app-layer scope), #292 §3.2a (RLS policies),
> #293 §3.2b steps 1-2 (system pool + WithTenantTx GUC), #294 §3.2b step 3 (all writes
> tenant-GUC'd + integration matrix). **No further code change is required** — this
> runbook only provisions Postgres roles and sets environment variables.
>
> Design + rationale: `HIVEARMOR_A2_7_MANAGER_RLS.md`. Prototype evidence:
> `HIVEARMOR_A2_7_MANAGER_RLS_3_2B_SCOPE.md` §5.

---

## 0. Why a role split is needed

The RLS policy (`tenant_isolation`, on `agents`, `collectors`, `enrollment_tokens`,
`enrollment_audit_events`, `agent_commands`) is **ignored by SUPERUSER and BYPASSRLS
roles**. Every agent-manager deployment today connects as `DB_USER=postgres` (a
superuser), so the policy is present but never enforced. Enforcement begins only when
the app connects as an **unprivileged, non-BYPASSRLS role**.

The manager opens **two** connection pools (PR #293):

| Pool | Env vars (code) | Role it must use | Why |
|------|-----------------|------------------|-----|
| App pool (`d.conn`) | `DB_USER` / `DB_PASSWORD` | **`hivearmor_agents_app`** — unprivileged, NO superuser, NO BYPASSRLS | tenant-facing reads/writes; RLS must bite here |
| System pool (`d.sysConn`) | `DB_SYSTEM_USER` / `DB_SYSTEM_PASSWORD` (falls back to `DB_USER` when unset) | **`hivearmor_agents_system`** — BYPASSRLS | all-tenant reads: boot caches, ListConnectorAuthorization, VerifyConnectorIdentity, enrollment-token tenant resolution, collector tenant rebind |

**CRITICAL — migrations:** `MigrateDatabase()` (AutoMigrate + the RLS policy install)
runs on the **app pool `d.conn`** at boot. Under FORCE RLS an unprivileged role
CANNOT run `ALTER TABLE ... FORCE ROW LEVEL SECURITY` / `CREATE POLICY` and may be
blocked on DDL. Therefore the app role must either (a) OWN the tables (owner may run
DDL; FORCE still subjects it to the row policy for DML, which is what we want) **and**
have BYPASSRLS temporarily withheld — but owner-without-BYPASSRLS is still subject to
FORCE RLS on DML, so migrations that only ALTER/CREATE are fine while DML in a
migration would be policy-bound; or (b) migrations are run once by a
BYPASSRLS/superuser migrator BEFORE the app cuts over to the unprivileged role, and
the app role is then granted only DML + table ownership is left with the migrator.

Because the manager runs AutoMigrate on `d.conn` every boot, the safe, simplest model
is:

- **`hivearmor_agents_app` OWNS the tables** (so its boot-time `ALTER TABLE` /
  `CREATE POLICY` / AutoMigrate DDL succeed) but is **NOT** superuser and **NOT**
  BYPASSRLS. FORCE ROW LEVEL SECURITY then makes even the owner subject to the row
  policy for SELECT/INSERT/UPDATE/DELETE — which is exactly the enforcement we want,
  while DDL (owner-only) still works.
- `hivearmor_agents_system` is BYPASSRLS for the all-tenant system pool.

This keeps AutoMigrate working on the app pool while enforcing RLS on data access.
Validate this in staging (§4) before production — if your platform runs migrations
out-of-band instead of at boot, use a dedicated BYPASSRLS `hivearmor_agents_migrator`
and grant the app role DML-only (see the variant in §6).

---

## 1. Pre-flight (PHASE 0 — do NOT skip)

On the target `hivearmor_agents` database:

```sql
-- 1a. Confirm the policies are installed (shipped by #292, applied on boot).
SELECT tablename, policyname FROM pg_policies
 WHERE tablename IN ('agents','collectors','enrollment_tokens','enrollment_audit_events','agent_commands');
-- expect one 'tenant_isolation' row per table.

-- 1b. Confirm FORCE RLS is on.
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
 WHERE relname IN ('agents','collectors','enrollment_tokens','enrollment_audit_events','agent_commands');
-- expect relrowsecurity = t AND relforcerowsecurity = t for each.

-- 1c. Confirm no NULL tenant_id (the policy compares tenant_id = <guc>; a NULL is
--     invisible to every tenant). Manager columns are NOT NULL by construction, but verify:
SELECT 'agents' t, count(*) FROM agents WHERE tenant_id IS NULL
UNION ALL SELECT 'collectors', count(*) FROM collectors WHERE tenant_id IS NULL
UNION ALL SELECT 'enrollment_tokens', count(*) FROM enrollment_tokens WHERE tenant_id IS NULL
UNION ALL SELECT 'enrollment_audit_events', count(*) FROM enrollment_audit_events WHERE tenant_id IS NULL;
-- every count must be 0.

-- 1d. Record the current DB_USER role's attributes (for rollback).
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

If 1a/1b show missing policies, the manager has not booted with the #292 code yet —
deploy that first. If 1c shows any NULLs, STOP and backfill before enabling (an RLS'd
NULL-tenant row vanishes from every tenant, including maintenance).

---

## 2. Provision the roles

Run as a superuser on `hivearmor_agents`. Replace the passwords with secrets from your
secret manager.

```sql
-- App role: unprivileged (NOT superuser, NOT bypassrls), will OWN the tables.
CREATE ROLE hivearmor_agents_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- System role: BYPASSRLS for the all-tenant system pool.
CREATE ROLE hivearmor_agents_system LOGIN PASSWORD :'system_pw' NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;

-- Transfer ownership of the RLS tables (and their sequences) to the app role so its
-- boot-time AutoMigrate / ALTER / CREATE POLICY succeed. Ownership does NOT exempt it
-- from FORCE RLS on DML.
DO $$
DECLARE r record;
BEGIN
  FOREACH r IN ARRAY ARRAY['agents','collectors','enrollment_tokens','enrollment_audit_events','agent_commands','last_seen'] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I OWNER TO hivearmor_agents_app', r);
  END LOOP;
  -- sequences
  PERFORM 1;
END $$;
ALTER TABLE IF EXISTS agents_id_seq OWNER TO hivearmor_agents_app;          -- adjust to actual seq names
ALTER TABLE IF EXISTS collectors_id_seq OWNER TO hivearmor_agents_app;

-- System role needs read + the specific writes the system pool performs
-- (SystemContextUpsert on collectors for tenant rebind; reads on all tables).
GRANT USAGE ON SCHEMA public TO hivearmor_agents_system;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hivearmor_agents_system;
GRANT UPDATE ON collectors TO hivearmor_agents_system;   -- for the tenant-rebind path
```

> The app role owning the tables is the pivot that lets AutoMigrate keep running on the
> app pool. If your deployment runs migrations out-of-band, use §6 instead.

---

## 3. Wire the environment

Set on the agent-manager service (container env / systemd / k8s Secret). **Only two new
vars; the existing DB_USER/DB_PASSWORD switch to the app role.**

```
DB_HOST=<unchanged>
DB_PORT=<unchanged>
DB_NAME=<unchanged>                      # hivearmor_agents (or agentmanager per compose)
DB_USER=hivearmor_agents_app             # was: postgres
DB_PASSWORD=<app_pw>
DB_SYSTEM_USER=hivearmor_agents_system   # NEW — enables the BYPASSRLS system pool
DB_SYSTEM_PASSWORD=<system_pw>
```

Leaving `DB_SYSTEM_USER` unset keeps the system pool on the app creds — which, once the
app role is unprivileged, would make the boot caches fail closed and **break agent auth**.
So when you switch `DB_USER` to the app role you MUST also set `DB_SYSTEM_USER`.

---

## 4. Staging canary (go/no-go)

Deploy to staging with the §3 env. **T-BOOT and T-CANARY are the gate.**

```sql
-- T-CANARY: as the APP role, a query with no GUC returns zero rows (RLS bites).
--   psql "host=... dbname=... user=hivearmor_agents_app password=..."
SELECT count(*) FROM agents;            -- expect 0 (no app.current_tenant set)
```

```
# T-BOOT: the manager boots and warms its credential cache via the SYSTEM pool.
#   - service logs show the boot cache loaded a non-zero agent/collector count
#   - agents from ALL tenants can authenticate (register/verify) after restart
#   - watch the agent-auth success rate: it must NOT drop
```

Also exercise, on staging, one of each in an app session with the GUC set, to confirm
normal operation:
- List agents / collectors for a tenant (returns that tenant's rows).
- Register + delete an agent in a tenant (delete affects 1 row; a wrong-tenant delete
  would surface NotFound, not silent success — that's the #294 guard).

If T-CANARY returns rows, the app role is still superuser/bypassrls → **stop**, fix the
role, do not proceed. If T-BOOT shows an empty cache or auth failures, the system pool
is misconfigured (likely `DB_SYSTEM_USER` unset or not BYPASSRLS) → **stop**, fix.

The automated matrix mirrors this and can be run against staging:
```
RLS_TEST_DSN='host=... user=<superuser> password=... dbname=hivearmor_agents' \
  go test -tags integration ./agent-manager/database/ -run RLSMatrix -v
```

---

## 5. Production rollout & rollback

**Rollout:** deploy the §3 env to production during a low-traffic window. Immediately
after the first boot on the new roles, watch:
- boot cache load count (non-zero) in logs,
- agent authentication success rate (flat, no dip),
- error rate on List/Delete/Register RPCs.

**Rollback (instant, no data change):** set `DB_USER` back to the superuser
(`postgres`) and redeploy. Superuser ignores RLS, so enforcement switches off
immediately; the app-layer #290 tenant scoping still protects every path. You may also
leave `DB_SYSTEM_USER` set (harmless). No migration or `DROP POLICY` is needed to roll
back. If you want to remove the policies entirely, the §3.2a rollback is
`DROP POLICY tenant_isolation ON <t>; ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;` per table.

---

## 6. Variant — out-of-band migrations (dedicated migrator)

If your platform does NOT run AutoMigrate at app boot (migrations are a separate job):

```sql
CREATE ROLE hivearmor_agents_migrator LOGIN PASSWORD :'mig_pw' NOSUPERUSER BYPASSRLS;
-- migrator owns the tables and runs all DDL / AutoMigrate.
ALTER TABLE agents OWNER TO hivearmor_agents_migrator;  -- ...and the rest
-- app role gets DML only, no ownership:
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO hivearmor_agents_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO hivearmor_agents_app;
```
Then run the migration job as `hivearmor_agents_migrator`, and the app pool as
`hivearmor_agents_app` (DML-only). The manager's boot-time AutoMigrate on `d.conn`
must be disabled in this model (it would fail as the DML-only app role) — gate it behind
your migration job instead.

---

## 7. Acceptance checklist

```
[ ] §1 pre-flight: policies present, FORCE on, zero NULL tenant_id
[ ] §2 roles provisioned: app (unpriv, owner), system (BYPASSRLS)
[ ] §3 env wired: DB_USER=app, DB_SYSTEM_USER=system set together
[ ] §4 staging T-CANARY: app role, no GUC -> 0 rows
[ ] §4 staging T-BOOT: cache warms via system pool, agent auth stable
[ ] §4 staging: tenant list/register/delete behave correctly
[ ] §4 integration matrix green against staging
[ ] §5 production: boot cache non-zero, auth rate flat, error rate flat
[ ] rollback verified (revert DB_USER to superuser = instant RLS off)
```

Once §7 is complete, agent-manager tenant isolation is enforced at BOTH the application
layer (#290) AND the database (RLS) — the defense-in-depth objective of A2-7.
