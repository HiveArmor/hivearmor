# HIVEARMOR P0-A2 — Tenant Isolation Follow-On (tracking)

> Opened 2026-09-10. Successor batch to P0-A1 (tenant security closure). Captures the
> tenant-isolation work found DURING P0-A1's T19 verification and T20 spike that is out
> of P0-A1's chartered scope (endpoint-scoped agent/EDR/collector/response resources).
> P0-A1 fixed the two HIGH EDR read gaps adjacent to its own work (G1, G2); everything
> below is deferred here.

## Source of these items
- `HIVEARMOR_P0A1_T19_VISIBLEBY_VERIFICATION.md` — OpenSearch read-path tenant-scope audit.
- `HIVEARMOR_P0A1_T20_RLS_SPIKE.md` — Postgres RLS defense-in-depth spike.

## Already fixed in P0-A1 (for reference — do NOT re-do)
- **G1 — `HaEdrFimService`**: routed FIM reads through `MsspIndexResolver.resolveIndexPattern("fim")` (was hardcoded `v3-hive-fim-*`).
- **G2 — `HaEdrService.fetchTimeline`**: its local `resolveIndexPattern(types)` now builds each type pattern via the injected `MsspIndexResolver` (was hardcoded, shadowing the resolver used by the sibling `fetchProcessNodes`).

---

## Open items

### A2-1 (HIGH) — `EntityGraphResource` cross-tenant alert reads
- **Gap (T19 G3):** reads `v3-hive-alert-*` hardcoded (`:34,87,135` in `buildGraph`/`expandSecondHop`); `@PreAuthorize(ROLE_ADMIN/ROLE_USER)` but no tenant scoping → entity-graph spans all tenants' alerts in MSSP mode.
- **Fix:** inject `MsspIndexResolver`, resolve `resolveIndexPattern("alert")` for both query sites.
- **Test:** cross-tenant entity-graph read returns only caller-tenant alerts.

### A2-2 (HIGH) — `OffenseResource` cross-tenant offense/alert reads
- **Gap (T19 G4):** reads `v3-hive-offense-*` and `v3-hive-alert-*` hardcoded (`:37-38,79,113,194,207`) via `elasticsearchService.search(...)` with no `validateTenantScope`/resolver.
- **Fix:** route through `MsspIndexResolver` (offense + alert types) OR the `TenantScopeGuard` used by the generic search endpoints.
- **Test:** offense list + alert lookups scoped to caller tenant.

### A2-3 (MEDIUM) — `UbaSyncService` scheduled cross-tenant aggregation
- **Gap (T19 G5):** `@Scheduled` job reads `v3-hive-alert-*` globally (no request `TenantContext`) and writes into shared relational UBA tables → cross-tenant aggregation.
- **Fix APPLIED (feat/p0a2-uba-per-tenant):** `syncAnomalies` and `decayRiskScores` now run via `TenantScopedBackgroundExecutor.runForEachTenant` — each pass resolves the alert index via `MsspIndexResolver` (per-tenant `v3-hive-alert-<prefix>-*`) and reads/writes under that tenant's scope. Added `tenant_id` to `hive_uba_anomaly` + `hive_uba_entity_risk` (Liquibase `20260910004`, nullable); dedup/upsert/decay are now tenant-scoped (`existsByTenantIdAndDetailsJsonContaining`, `findByTenantIdAndEntityIdAndEntityType`, `findByTenantId`) so two tenants sharing an entityId no longer collide. Writes stamp `tenant_id` from the sync scope (single-tenant → 0). NOT-NULL + backfill deferred (same rollout pattern as the other tenant columns).
- **Test:** UBA rows attributed to the correct tenant; no cross-tenant peer-group bleed.

### A2-4 (LOW) — `ElasticsearchResource` metadata endpoints skip tenant scope
- **Gap (T19 open item):** `getFieldValues`, `getFieldValuesWithCount`, `getIndexProperties`, `getAllIndexes` accept a client `indexPattern`/`index`/`pattern` and do NOT call `validateTenantScope`. Lower severity (returns field names/values, not documents) but distinct field values can still leak across tenants.
- **Fix:** apply `validateTenantScope`/`TenantScopeGuard` to these metadata endpoints too, or constrain the accepted pattern to the caller's tenant.

### A2-5 (INFO) — confirm log/statistics indexes are tenant-free by design
- **Open item (T19):** `v3-hive-backend-logs` and `v3-hive-statistics-*` readers (audit-log resources, `ApplicationEventService`) were classified N/A provisionally. Confirm they are admin-`@PreAuthorize`'d and genuinely tenant-agnostic, or scope them.

### A2-B (MSSP BACKFILL CONTRACT) — application-level tenant backfill + NOT NULL for MSSP
- **Context:** changeset `20260910003_tenant_backfill_notnull.xml` backfills `tenant_id = 0`
  and enforces NOT NULL for the four EDR/response tables, but is GATED to SINGLE-TENANT
  deployments (precondition: no MSSP-managed client with a prefix). It MARK_RANs on MSSP,
  because the authoritative agent→tenant mapping lives in the agent-manager's SEPARATE
  Postgres (the `agents` table, reachable only over gRPC) — there is no in-DB join.
- **Required for MSSP:** an application-level backfill job that, for each legacy row with
  NULL `tenant_id` in `hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine`,
  `hive_alert_response_rule_execution`, resolves the owning agent's tenant via the manager
  (`agent_id`/`agent` → tenant), stamps the row, and reports rows it could not resolve
  (orphaned agents) rather than defaulting them to 0. Run it per-tenant via the
  `TenantScopedBackgroundExecutor` pattern, idempotent, resumable.
- **Then:** a follow-up changeset enforces NOT NULL on MSSP (guarded by the INVERSE
  precondition — MSSP-managed clients exist AND zero NULL rows remain), so NOT NULL is
  only applied once the job has completed. Do NOT enforce NOT NULL on MSSP before the job.
- **DELIVERED (PR #278, merged `5992dbd4`):** `TenantBackfillService.backfill()` + admin-only
  `POST /api/ha-tenant-backfill`. Idempotent (only touches `tenant_id IS NULL`).
  Single-tenant → blanket `SET tenant_id = 0` across ALL six tables (also closes the
  T19-G5/L-3 legacy single-tenant UBA orphaning). MSSP → per-tenant via
  `TenantScopedBackgroundExecutor` over the FOUR agent-linked tables only
  (`hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine` by `agent_id`,
  `hive_alert_response_rule_execution` by `agent`): lists each tenant's agents and stamps
  matching rows; per-tenant agent-enumeration failures are caught + counted (`failedTenants`),
  never silently reported as orphans. The two UBA tables are DELIBERATELY EXCLUDED from MSSP
  host-matching (independent review C1): `entity_id` is a user/ip/host value, not an agent
  identifier, so matching it against agent hostnames would orphan user/ip entities or
  mis-stamp a colliding username cross-tenant. New UBA rows are already tenant-stamped at
  insert (A2-3), so only LEGACY MSSP UBA rows remain NULL, reported as unresolvable-by-agent.
- **NOT-NULL enforcement DELIVERED (feat/p0a2-notnull-enforcement) — APPLICATION-LEVEL, not
  Liquibase.** `TenantBackfillService.enforceNotNull()` + admin-only `POST /api/ha-tenant-notnull`.
  It enforces `tenant_id NOT NULL` on every tenant table (the four EDR/response tables + both
  UBA tables) that is PROVABLY CLEAN (zero NULLs), skips any table that still has NULL rows
  (reported, never defaulted to a wrong tenant), and is a no-op on an already-NOT-NULL column.
  Idempotent and re-runnable: after the operator runs the backfill and re-runs this, newly-clean
  tables get locked. WHY NOT LIQUIBASE: a changeset gated on a TRANSIENT data state
  (`sqlCheck` for zero NULLs) with `onFail="MARK_RAN"` is UNSOUND — MARK_RAN is sticky
  (recorded in DATABASECHANGELOG, never re-evaluated), so once it ran on a still-dirty deploy
  the constraint would be skipped FOREVER on exactly the MSSP deployments that need it. An
  independent review of the first attempt (PR #279) caught this as Critical; the enforcement was
  moved to the application layer, which re-checks on every call and mirrors the app-level backfill
  precedent (authoritative agent→tenant map lives outside this DB). Single-tenant EDR/response
  NOT-NULL is still additionally covered by the stable-signal changeset `20260910003` (gated on
  deployment shape, where MARK_RAN-forever is correct). MSSP legacy UBA rows stay skipped until a
  UBA-specific migration resolves them from the originating alert's tenant.

### A2-6 (DESIGN) — Postgres RLS defense-in-depth
- **From T20:** adopt RLS as a second layer beneath app-level scoping, but ONLY after backfill + NOT NULL on `tenant_id`. Pilot on the four P0-A1 EDR/response tables
  (`hive_edr_event`, `hive_edr_quarantine`, `ha_edr_quarantine`, `hive_alert_response_rule_execution`).
- **Prerequisites (blockers):** (1) backfill + NOT NULL on `tenant_id`; (2) a dedicated
  unprivileged app DB role (single superuser role bypasses RLS today, silently no-op);
  (3) transaction-local GUC (`set_config(..., true)`) wired to `TenantContextFilter`
  set/clear + the `TenantScopedBackgroundExecutor` per-tenant loop, with a fail-closed
  default so an unset GUC denies rather than exposes.
- **Top risks:** connection-pool GUC bleed; the nullable rollout window; superuser bypass.

### A2-7 (DESIGN) — agent-manager Go/GORM datasource
- **From both T19 & T20:** the agent-manager uses a SEPARATE Postgres datasource (GORM) that neither the Java `MsspIndexResolver` nor a backend RLS policy covers. P0-A1 forced tenant predicates in its list queries (T03/T07/T11), but a broader review of its `findAll`/`Unscoped` surface + its own RLS story is a distinct workstream.

---

## Suggested sequencing
1. **A2-1, A2-2** (HIGH, small, same pattern as G1/G2) — quick wins.
2. **A2-3** (MEDIUM, needs the per-tenant executor refactor).
3. **A2-4, A2-5** (LOW/INFO clean-up).
4. **Backfill + NOT NULL** (also a standing P0-A1 carry-forward) — unblocks A2-6.
5. **A2-6, A2-7** (DESIGN) after the prerequisites land.
