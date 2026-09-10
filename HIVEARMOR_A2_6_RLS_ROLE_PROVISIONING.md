# HiveArmor A2-6 — RLS Role Provisioning Runbook (Phase P0)

> **Type:** Operator runbook + SQL provisioning script. This is an **operational prerequisite**
> for Postgres Row-Level Security (RLS), NOT a Liquibase changeset — role creation and grant
> management are privileged, environment-specific operations that must not run inside an app
> migration (a failure mid-migration would be hard to recover, and the app role must exist
> *before* the app boots pointing at it).
> **Grounded in:** `HIVEARMOR_P0A1_T20_RLS_SPIKE.md` §3.5 and §4 (Phase P0).
> **Ships alongside:** `TenantGucAspect` (RLS phase P1 — the transaction-local
> `app.current_tenant` GUC choke point). Both are **inert** until the pilot policies (P2) are
> enabled in a later, deliberate go/no-go PR.

---

## 1. Why the role split is required

Today the HiveArmor backend authenticates to Postgres with a **single** role — `${DB_USER}` —
used for BOTH Liquibase migrations AND the running application (`application-prod.yml:16`), and
in dev/functional that role is `postgres`, a **superuser** (`application-functional.yml:16`).

**A PostgreSQL superuser — and any role with `BYPASSRLS` — ignores RLS policies unconditionally.**
So if we enabled RLS today, the app would keep bypassing every policy and the backstop would be a
silent no-op: green tests, zero protection. This is the single most dangerous failure mode in §3.5
and §6 of the spike.

RLS therefore needs a **two-role model**:

| Role | Used by | Privileges | Subject to RLS? |
|------|---------|-----------|-----------------|
| `hivearmor_migrator` (privileged) | Liquibase migrations | can `BYPASSRLS`, owns/alters schema | **No** (must see/alter all rows to migrate) |
| `hivearmor_app` (unprivileged) | the running app (Hikari) | `NOSUPERUSER`, `NOBYPASSRLS`, DML grants only | **Yes** — `FORCE ROW LEVEL SECURITY` applies |

The app role is deliberately powerless outside its granted DML: a fresh non-owner role has **no**
table privileges by default, so the grants in §2 are mandatory or the app cannot read/write at all.

---

## 2. Provisioning SQL (idempotent)

Run as a superuser / the DB owner, against the `hivearmor` database. `CREATE ROLE` has no
`IF NOT EXISTS`, so guard with `DO $$` blocks. Replace the password placeholders with secrets from
your secret store (never commit real passwords).

```sql
-- ============================================================================
-- HiveArmor A2-6 P0 — RLS role split. Run as superuser against the hivearmor DB.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Privileged migration role (Liquibase). BYPASSRLS so migrations see all rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hivearmor_migrator') THEN
        CREATE ROLE hivearmor_migrator LOGIN PASSWORD 'REPLACE_MIGRATOR_PASSWORD'
            NOSUPERUSER BYPASSRLS;
    END IF;
END$$;

-- 2. Unprivileged application role (Hikari). NO superuser, NO bypass — subject to RLS.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hivearmor_app') THEN
        CREATE ROLE hivearmor_app LOGIN PASSWORD 'REPLACE_APP_PASSWORD'
            NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END$$;

-- 3. Schema + DML grants for the app role (a fresh non-owner role has none).
GRANT USAGE ON SCHEMA public TO hivearmor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hivearmor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hivearmor_app;

-- 4. Default privileges so FUTURE tables/sequences created by the migrator are usable by the
--    app role without re-granting after each migration. Run as the migrator (object owner):
ALTER DEFAULT PRIVILEGES FOR ROLE hivearmor_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hivearmor_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hivearmor_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO hivearmor_app;

-- 5. Fail-closed default GUC: an app connection that never set app.current_tenant evaluates a
--    future policy against an IMPOSSIBLE tenant id (-1) → zero rows, never a leak. (Belt-and-
--    suspenders; TenantGucAspect sets it transaction-locally on every real tx.)
ALTER DATABASE hivearmor SET app.current_tenant = '-1';
```

> **Ownership note:** so that `FORCE ROW LEVEL SECURITY` (added in the P2 pilot) actually applies
> to the app role, tables must be owned by the migrator (or another role) — the app role must
> **not** own them, and must not have `BYPASSRLS`. With JHipster/Liquibase, objects are owned by
> whichever role runs the migration, i.e. `hivearmor_migrator`. Good — the app role is a pure
> DML consumer.

### 2a. Existing-table ownership (REQUIRED before P2, or P2 will silently fail on legacy tables)

**Hazard (review H1):** all tables that exist TODAY were created by the ORIGINAL single role
(`${DB_USER}` / `postgres`), NOT by `hivearmor_migrator`. `ALTER TABLE ... FORCE ROW LEVEL
SECURITY` and `CREATE POLICY` (the P2 step) must be run by the table OWNER (or a superuser). If
ownership is left with the old role and P2 later runs its policy DDL as `hivearmor_migrator`, it
will FAIL on those legacy tables — the exact "silently doesn't apply" class this runbook warns
about. Resolve it explicitly, ONE of:

- **Option A (recommended) — transfer ownership of existing objects to the migrator** (run as
  superuser or the current owner):
  ```sql
  -- Reassign every object owned by the old single role to the migrator, in the hivearmor DB:
  REASSIGN OWNED BY <OLD_DB_USER> TO hivearmor_migrator;
  -- (or per-table: ALTER TABLE public.hive_edr_event OWNER TO hivearmor_migrator; ...)
  ```
  Then P2's `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + `CREATE POLICY` run cleanly as the
  migrator on all tables, old and new.
- **Option B — run the P2 policy DDL as a superuser / the current table owner** rather than the
  migrator. Simpler operationally, but P2 must then document that its DDL role ≠ the migration
  role. Option A is preferred so the migrator uniformly owns the schema.

Verify current ownership before choosing:
```sql
SELECT tablename, tableowner FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('hive_edr_event','hive_edr_quarantine','ha_edr_quarantine',
                    'hive_alert_response_rule_execution');
```

---

## 3. Application configuration change

**Do not** change any application-*.yml in this PR beyond documenting the intended state — the
switch is coordinated with the operator provisioning the roles. The intended prod state:

- **Datasource (the app)** points at the unprivileged role:
  - `spring.datasource.username = ${DB_USER}` → provision `${DB_USER}` = `hivearmor_app`
    (or add `DB_APP_USER`/`DB_APP_PASS` env vars and set `username: ${DB_APP_USER}` /
    `password: ${DB_APP_PASS}`).
- **Liquibase** points at the privileged role. Today `spring.liquibase` in `application-prod.yml`
  has only `contexts: prod` and therefore **inherits the datasource credentials**. Add explicit
  Liquibase credentials so it uses the migrator role independent of the app role:
  ```yaml
  spring:
    liquibase:
      contexts: prod
      user: ${DB_MIGRATOR_USER}      # = hivearmor_migrator
      password: ${DB_MIGRATOR_PASS}
      # url inherits the datasource url unless overridden
  ```
  (JHipster wires Liquibase via `LiquibaseConfiguration`/`spring.liquibase`; setting `user`/
  `password` there makes migrations authenticate as the migrator while Hikari uses the app role.)

**Sequencing at deploy time:** provision roles (§2) → set the new env vars → deploy. Liquibase
runs as migrator (BYPASSRLS), the app connects as `hivearmor_app`. Until P2 policies exist this is
behaviourally identical to today (no policy = no filtering), so it can ship ahead of the pilot.

---

## 4. Verification

```sql
-- App role must be NEITHER superuser NOR bypassrls (else RLS silently no-ops).
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles WHERE rolname IN ('hivearmor_app','hivearmor_migrator');
-- Expect: hivearmor_app     → rolsuper=f, rolbypassrls=f, rolcanlogin=t
--         hivearmor_migrator → rolsuper=f, rolbypassrls=t, rolcanlogin=t

-- App role can actually read/write its tables (grants applied):
SET ROLE hivearmor_app;
SELECT count(*) FROM hive_edr_event;   -- should succeed (no policy yet → all rows)
RESET ROLE;

-- Default GUC is present and fail-closed:
SHOW app.current_tenant;               -- expect -1 on a fresh connection
```

**Post-P2 verification — MANDATORY go/no-go once the pilot policies (changeset 20260910006)
are enabled.** On a deployment still running as a single superuser, the changeset "succeeds"
(policy created, RLS enabled) but enforces NOTHING — a superuser bypasses RLS — so "migration
applied" must NOT be mistaken for "isolation enforced." Prove enforcement is live by connecting
as the unprivileged `hivearmor_app` role and confirming the policy actually filters:

```sql
-- Connect AS hivearmor_app (not the superuser / migrator), then:
SELECT set_config('app.current_tenant', '101', true);   -- pretend to be tenant 101
SELECT count(*) FROM hive_edr_event;                     -- should return ONLY tenant 101's rows
SELECT set_config('app.current_tenant', '-1', true);     -- an impossible tenant
SELECT count(*) FROM hive_edr_event;                     -- MUST return 0 (fail-closed proof)
-- Repeat for hive_edr_quarantine, ha_edr_quarantine, hive_alert_response_rule_execution.
-- Also run the P0A1-T18 cross-tenant matrix against a policied hivearmor_app connection.
```
If the `-1` query returns a non-zero count, RLS is NOT enforcing (you are likely still on a
superuser/BYPASSRLS connection) — do NOT treat the pilot as live.

**GUC value contract (defense-in-depth):** `app.current_tenant` must only ever be set to a
NUMERIC string (or left unset). The policy casts it `::bigint`, so a hand-typed
`SET app.current_tenant = 'notanumber'` on a live session would raise a cast error on every
query against a policied table until reset. In-app this cannot happen — `TenantGucAspect` only
ever binds a numeric client id / `0` / `-1`, and the DB-level default is `'-1'` — so this is only
a warning against manual operator misuse.

**PostgreSQL floor:** the policy uses `current_setting('app.current_tenant', true)` (the
`missing_ok` two-arg form), which requires PostgreSQL ≥ 9.6. Any supported HiveArmor Postgres is
far newer; noted for future maintainers.

---

## 5. Rollback

Fully reversible; nothing here is load-bearing until P2 policies exist:

```sql
-- Point the app back at the original role (revert §3 config first), then optionally:
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hivearmor_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM hivearmor_app;
REVOKE USAGE ON SCHEMA public FROM hivearmor_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hivearmor_migrator IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM hivearmor_app;
-- Drop the roles only after nothing connects as them:
DROP ROLE IF EXISTS hivearmor_app;
DROP ROLE IF EXISTS hivearmor_migrator;
ALTER DATABASE hivearmor RESET app.current_tenant;
```

Reverting the `application-*.yml` credentials to the original single `${DB_USER}` restores the
exact pre-A2-6 posture. The `TenantGucAspect` (P1) remains inert regardless — it only issues a
transaction-local GUC that nothing reads until a policy exists.

---

## 6. What this does NOT do (scope boundary)

- **No RLS policy is enabled here.** `ENABLE`/`FORCE ROW LEVEL SECURITY` + the `tenant_isolation`
  policy on the four EDR/response tables is Phase **P2**, a separate deliberate PR gated on the
  P0A1-T18 cross-tenant matrix.
- **agent-manager (`hivearmor_agents`, Go/GORM) is out of scope** (spike §3.4) — it is a separate
  process, pool, and database; its own RLS (if wanted) needs its own role split and GUC wiring
  (A2-7).
