# HIVEARMOR P0-A1 — PROPOSED SCHEMA DRAFTS (proto + Liquibase)

> Date: 2026-09-09 · **PROPOSED DRAFTS ONLY — these are the exact edits to make during implementation. NOT applied to source in this planning phase. No files under `agent-manager/protos/`, `backend/src/main/java/`, or `backend/src/main/resources/config/liquibase/` were modified.**
> Backs tasks **P0A1-T02** (ListRequest tenant field) and **P0A1-T08** (UtmEdrEvent tenant column). Drafts match the current codebase conventions verified this session: `common.proto` already uses `int64 tenant_id` on `AuthResponse`/`DeleteRequest`; the Liquibase changelog uses `YYYYMMDDNNN_description.xml` with `addColumn`+`createIndex` guarded by `preConditions onFail="MARK_RAN"` (precedent: `20260907020_mssp_detection_pack_isolation.xml`).

---

## 1. Proto change — `ListRequest.tenant_id` (P0A1-T02)

**File:** `agent-manager/protos/common.proto`
**Current `ListRequest`:**
```proto
message ListRequest {
  int32 page_number = 1;
  int32 page_size = 2;
  string search_query = 3;
  string sort_by = 4;
}
```
**Proposed (add field 5 — next free number; never renumber existing fields, repo rule §5/§11):**
```proto
message ListRequest {
  int32 page_number = 1;
  int32 page_size = 2;
  string search_query = 3;
  string sort_by = 4;
  // Tenant scope for endpoint-scoped reads (agents/commands). Set server-side by the
  // backend from the authenticated identity (TenantContext), never from a client param.
  // Zero means "no tenant supplied" and is accepted ONLY under an explicit system context
  // (P0A1-T14); a normal MSSP read with tenant_id == 0 is rejected fail-closed by the manager.
  // Mirrors AuthResponse.tenant_id (field 3) and DeleteRequest.tenant_id (field 3).
  int64 tenant_id = 5;
}
```

**Regeneration (implementation step, not this phase):**
- Regenerate `agent-manager/agent/common.pb.go` from the updated proto (protoc / the repo's gen script); commit the regenerated `*.pb.go` (repo convention: generated `*.pb.go` are committed).
- `GetTenantId() int64` accessor becomes available on `ListRequest`.
- No other proto messages change; `int32`/`int64`/`string` field types unchanged.

**Consumer wiring (covered by T03–T07, not part of this draft):**
- Backend `AgentGrpcService` list builders set `.setTenantId(tenantScope.requireTenant())`.
- Manager `ListAgents`/`ListAgentCommands` prepend a forced `tenant_id` predicate from `req.GetTenantId()`.

**Compatibility:** additive proto3 field, default 0 → wire-compatible with any un-upgraded reader/writer; backend and manager are upgraded in lockstep, so a real MSSP read never sends 0.

---

## 2. Liquibase changeset — `tenant_id` on `hive_edr_event` (P0A1-T08)

**New file (PROPOSED):** `backend/src/main/resources/config/liquibase/changelog/20260909001_ha_edr_event_tenant.xml`
(Naming follows `YYYYMMDDNNN_description.xml`; `20260909001` is the next id for 2026-09-09. Table name from the entity: `@Table(name = "hive_edr_event")`.)

```xml
<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
                   http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-3.5.xsd">

    <!--
      P0A1-T08 — authoritative tenant attribution for EDR events.
      tenant_id is assigned SERVER-SIDE at ingest from the authenticated agent
      identity (agent registry lookup), never from the event payload.
      Added nullable so existing rows and in-flight ingests during rollout are
      tolerated; a backfill (changeset -2) populates existing rows from the
      owning agent; enforcement to NOT NULL is deferred to a later batch after
      backfill completes and all writers set it.
    -->
    <changeSet id="20260909001-1" author="hivearmor">
        <preConditions onFail="MARK_RAN">
            <not>
                <columnExists tableName="hive_edr_event" columnName="tenant_id"/>
            </not>
        </preConditions>
        <addColumn tableName="hive_edr_event">
            <column name="tenant_id" type="BIGINT">
                <constraints nullable="true"/>
            </column>
        </addColumn>
        <createIndex tableName="hive_edr_event" indexName="idx_hive_edr_event_tenant_id">
            <column name="tenant_id"/>
        </createIndex>
    </changeSet>

    <!--
      Composite index for the common tenant-scoped read pattern
      (WHERE tenant_id = ? ORDER BY event_time DESC), used by EDR timeline /
      query reads once tenant scoping (P0A1-T09) is wired.
    -->
    <changeSet id="20260909001-2" author="hivearmor">
        <preConditions onFail="MARK_RAN">
            <not>
                <indexExists indexName="idx_hive_edr_event_tenant_time"/>
            </not>
        </preConditions>
        <createIndex tableName="hive_edr_event" indexName="idx_hive_edr_event_tenant_time">
            <column name="tenant_id"/>
            <column name="event_time" descending="true"/>
        </createIndex>
    </changeSet>

</databaseChangeLog>
```

**Backfill note (separate operational job, NOT a schema changeset):** map existing `hive_edr_event` rows via `agent_id → agent → tenant_id` (reusing the telemetry agent→tenant resolver at `HaTelemetryService.java:252`). Rows whose agent no longer exists get an `unknown`/quarantine tenant sentinel, never a real tenant. Run as an idempotent batch after `20260909001-1` applies. A future `NOT NULL` enforcement changeset (later batch) only after backfill is verified and every writer sets `tenant_id`.

**Master include (PROPOSED):** append to `backend/src/main/resources/config/liquibase/master.xml` before `</databaseChangeLog>`, matching the existing include style:
```xml
    <!-- P0A1-T08 — authoritative tenant_id on EDR events -->
    <include file="/config/liquibase/changelog/20260909001_ha_edr_event_tenant.xml" relativeToChangelogFile="false"/>
```

**Entity change (PROPOSED, `UtmEdrEvent.java`) — pairs with the changeset:**
```java
    @Column(name = "tenant_id")
    private Long tenantId;
    // + getter/setter: public Long getTenantId() {...}  public void setTenantId(Long tenantId) {...}
```
(`Long` nullable to match the nullable column during the rollout window.)

---

## Conventions honored (verified this session)

- Proto: `int64 tenant_id` reuses the exact type already used by `AuthResponse.tenant_id` (field 3) and `DeleteRequest.tenant_id` (field 3); new field takes the next free number (5), never renumbering.
- Liquibase: `YYYYMMDDNNN_description.xml` naming; `preConditions onFail="MARK_RAN"` + `columnExists`/`indexExists` guards for idempotency; nullable BIGINT tenant_id + tenant index — identical pattern to the shipped `20260907020_mssp_detection_pack_isolation.xml` (which added `tenant_id` to `hive_correlation_rules` / `ha_detection_exception`).
- Changesets are immutable once merged (repo rule): these are NEW changesets, not edits to shipped ones.
- New column is nullable with no default → satisfies the "new columns must be nullable or have a default" rule.

## Validation step (implementation phase)
Before merge: `mvn -s settings.xml liquibase:validate` (per repo build rule) to confirm the changelog parses and there are no duplicate changeset ids. Proto: build `agent-manager` (`go build ./...`) after regen to confirm the new accessor compiles.
