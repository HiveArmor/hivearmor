# HiveArmor — backend RLS pilot activation runbook (operator)

> **Audience: operators / SRE.** Turns the backend's inert Row-Level-Security pilot
> from present-but-dormant into enforcing on the four P0-A1 EDR/response tables. All
> code is merged (#281 the per-transaction GUC aspect, #282 the pilot policies). This
> runbook is Postgres roles + a backfill + a verification gate — **no code change**.
>
> Companion: `HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md` (role design of record),
> `HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md` (the acceptance matrix),
> `HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md` (the *agent-manager* equivalent —
> a SEPARATE database; do that one too, they are independent).

---

## 0. What this enables and why it is off today

The backend PostgreSQL (`hivearmor`) has a `tenant_isolation` RLS policy on four tables:
`hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine`,
`hive_alert_response_rule_execution`. The policy makes the tenant predicate a property
of the TABLE: any query that forgets its `WHERE tenant_id` returns only the current
tenant's rows (or zero), enforced by Postgres beneath the app-level scoping.

It enforces **nothing today** for two reasons, both of which this runbook resolves:
1. The pilot changeset (#282) is **gated** with a precondition that stays skipped until
   every row on each table has a non-null `tenant_id` (`onFail="CONTINUE"`, so it
   re-evaluates each deploy and lands automatically once the data is clean — §1).
2. Even once the policy is on, a **SUPERUSER or BYPASSRLS** connection ignores RLS
   entirely. The backend must connect as an **unprivileged role** for the policy to
   bite (§2).

The `app.current_tenant` GUC that the policy reads is already set per-transaction by the
`TenantGucAspect` (#281, merged) — you do not configure that.

**Order matters and is not optional:** backfill first, then the unprivileged role, then
verify. Enabling RLS before backfill completes would make any null-tenant row invisible
to *every* tenant — including to the backfill job itself.

---

## 1. Backfill — eliminate null tenant_id (unblocks the pilot)

1. Run the backfill (admin auth required — `SEC_ADMIN` on the endpoint):
   ```
   POST /api/ha-tenant-backfill
   ```
   It stamps `tenant_id` across the agent-linked tables and returns a per-table result
   list. (`TenantBackfillResource` → `TenantBackfillService`.)
2. Confirm zero remaining nulls on each pilot table:
   ```sql
   SELECT 'hive_edr_event' t, count(*) FROM hive_edr_event WHERE tenant_id IS NULL
   UNION ALL SELECT 'hive_edr_quarantine', count(*) FROM hive_edr_quarantine WHERE tenant_id IS NULL
   UNION ALL SELECT 'ha_edr_quarantine', count(*) FROM ha_edr_quarantine WHERE tenant_id IS NULL
   UNION ALL SELECT 'hive_alert_response_rule_execution', count(*) FROM hive_alert_response_rule_execution WHERE tenant_id IS NULL;
   ```
   **Every count must be 0.** If any table still has nulls, the backfill could not derive
   a tenant for those rows (e.g. rows whose linkage column is not an agent identifier —
   see the A2-B backfill notes). Resolve those rows before proceeding; do NOT force RLS
   on a null-bearing table.
3. On the **next deploy** after nulls hit zero, the #282 changeset's precondition passes
   and the pilot policies + `FORCE ROW LEVEL SECURITY` are applied automatically. Confirm:
   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
    WHERE relname IN ('hive_edr_event','hive_edr_quarantine','ha_edr_quarantine','hive_alert_response_rule_execution');
   -- expect relrowsecurity = t AND relforcerowsecurity = t for each
   SELECT tablename, policyname FROM pg_policies
    WHERE tablename IN ('hive_edr_event','hive_edr_quarantine','ha_edr_quarantine','hive_alert_response_rule_execution');
   -- expect one 'tenant_isolation' row per table
   ```

---

## 2. Provision the unprivileged app role + migrator (make RLS bite)

Mirror `HIVEARMOR_A2_6_RLS_ROLE_PROVISIONING.md`. Run as a superuser on `hivearmor`:

```sql
-- App role: ordinary login, NOT superuser, NOT bypassrls. The backend connects as this.
CREATE ROLE hivearmor_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Migrator role: BYPASSRLS, owns the schema, runs Liquibase so migrations (incl. the
-- pilot ALTER/CREATE POLICY) are not blocked by FORCE RLS.
CREATE ROLE hivearmor_migrator LOGIN PASSWORD :'mig_pw' NOSUPERUSER BYPASSRLS;

-- Grant the app role DML on the app schema (adjust to your grant model / JHipster owner).
GRANT USAGE ON SCHEMA public TO hivearmor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hivearmor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hivearmor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO hivearmor_app;
```

Then:
- Point the backend's **runtime datasource** at `hivearmor_app`
  (`spring.datasource.username/password`, i.e. the deployment's DB env/secret).
- Run **Liquibase migrations as `hivearmor_migrator`** (the migration datasource /
  `liquibase.*` credentials), so schema changes keep working under FORCE RLS.

> The A2-6 doc has the definitive grant list and the aspect-ordering note (#281 C1: the
> `TenantGucAspect` is `@Order(LOWEST_PRECEDENCE)` so it runs INSIDE the transaction —
> already merged, listed here only so you don't "fix" it).

---

## 3. Verify — the T18 cross-tenant matrix (go/no-go)

Run `HIVEARMOR_P0A1_T18_CROSS_TENANT_TEST_MATRIX.md` against **staging**, connected as
the unprivileged `hivearmor_app` role so RLS is active. The decisive checks:

- **Canary:** as the app role, a raw `SELECT * FROM hive_edr_event` with no
  `app.current_tenant` set returns **zero rows** (proves RLS bites; if it returns rows,
  the role is still superuser/bypassrls → misconfigured, stop).
- **Scope:** with the GUC set to tenant A, reads/writes see only tenant A's rows on all
  four tables.
- **Cross-tenant:** tenant A cannot read/update/delete tenant B's EDR events,
  quarantine records, or response-rule executions.
- **Write guard:** an INSERT/UPDATE with the wrong/absent GUC is rejected by `WITH CHECK`.
- **Healthy path:** the EDR/response features (event listing, quarantine, response-rule
  execution) work normally for an in-tenant user — no regression.

**Do not proceed to production until the T18 matrix is green on staging** and the healthy
path is confirmed. Watch the app error rate on the EDR/response endpoints during the
staging soak.

---

## 4. Production rollout & rollback

**Rollout:** deploy the §2 credential change to production in a low-traffic window. After
the first boot on `hivearmor_app`, watch:
- EDR/response endpoint error rate (flat),
- alert-response-rule execution worker success (the `TenantScopedBackgroundExecutor`
  per-tenant summary line — now emitted for both overloads after #296 — shows
  `ok=/failed=` per run),
- no spike in empty-result responses (a sign of a missing/mis-set GUC).

**Rollback (instant, no data change):** revert the backend datasource to the superuser
role and redeploy — RLS goes dormant immediately; the app-level tenant scoping (P0-A1)
still protects every path. To remove the policies entirely, the #282 changeset's rollback
drops the policy and disables RLS per table.

---

## 5. Acceptance checklist

```
[ ] POST /api/ha-tenant-backfill run; per-table result reviewed
[ ] zero NULL tenant_id on all four pilot tables (SQL in §1.2)
[ ] next deploy applied the pilot policies; relrowsecurity/relforcerowsecurity = t (§1.3)
[ ] hivearmor_app (unprivileged) + hivearmor_migrator (BYPASSRLS) provisioned + granted
[ ] backend runtime datasource -> hivearmor_app; Liquibase datasource -> hivearmor_migrator
[ ] T18 canary: app role, no GUC -> zero rows
[ ] T18 scope + cross-tenant + write-guard green on staging
[ ] EDR/response healthy path confirmed (no regression)
[ ] production: error rate flat, no empty-result spike, response-rule worker ok
[ ] rollback verified (revert datasource to superuser = instant RLS off)
```

---

## 6. Relationship to the agent-manager RLS

This is the **backend** database (`hivearmor`). The **agent-manager** runs on a separate
database (`hivearmor_agents`) with its own inert RLS and its own enablement runbook
(`HIVEARMOR_A2_7_MANAGER_RLS_ENABLEMENT_RUNBOOK.md`). They are independent: enabling one
does not enable the other, and each has its own app/system/migrator role split. Do both
to close tenant isolation at the database layer across the platform.
