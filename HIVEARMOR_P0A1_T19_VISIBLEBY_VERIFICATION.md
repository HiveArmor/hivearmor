# HIVEARMOR P0A1-T19 — OpenSearch Tenant-Scope (index-pattern + `visibleBy` ACL) Verification

**Scope:** Read-only audit. No source was modified. Every claim carries `file:line` evidence.
**Repo:** `/Users/encryptshell/GIT/HiveArmor-v1`
**Goal:** Verify every tenant-scoped OpenSearch READ path enforces at least one of
(a) index-pattern scoping via `MsspIndexResolver.resolveIndexPattern` (Java) / `BuildTenantIndexPattern` (Go),
or (b) the `visibleBy.keyword` ACL enforced by `SearchIn` (Go SDK). Flag any read hitting `v3-hive-*`
without either.

---

## 0. Executive summary — verdict counts

| Verdict | Count |
|---|---|
| **UNSCOPED-GAP** (tenant data, no index scope, no `visibleBy`) | **5** |
| **CONFIRMED-SCOPED** (index-pattern via `MsspIndexResolver`) | large majority (~40+ read sites across ~35 services) |
| **N/A — platform-internal, not per-tenant data** | 3 clusters (`v3-hive-backend-logs` audit, statistics) |
| **N/A — relational (Postgres), not an OpenSearch read** | 1 (`EdrService.queryEvents`) |
| **Could-not-confirm** | 0 for the 5 gaps; a few metadata endpoints are lower-severity (see §3.6) |

**Top gaps (priority order):** `HaEdrFimService` (FIM), `HaEdrService.fetchTimeline` (EDR timeline),
`EntityGraphResource` (entity graph over alerts), `OffenseResource` (offenses + alerts), `UbaSyncService`
(scheduled anomaly sync). All read tenant-relevant data with a **hardcoded `v3-hive-*` pattern** and no
`MsspIndexResolver` / `visibleBy`, so in MSSP mode they read **across all tenants**.

---

## 1. Enforcement mechanisms (how scoping actually works)

### 1.a Java backend — index-pattern scoping via `MsspIndexResolver`
The Java backend talks to OpenSearch over the native client (`OpensearchClientBuilder` /
`ElasticsearchService`); it does **not** use the Go SDK's `visibleBy` path. Its sole tenant-isolation
mechanism on reads is the **resolved index pattern**.

`backend/src/main/java/com/hivearmor/multitenancy/MsspIndexResolver.java:31-37`
```
public String resolveIndexPattern(String type) {
    String prefix = TenantContext.get();
    if (prefix != null && !prefix.isBlank()) return "v3-hive-" + type + "-" + prefix + "-*";  // MSSP: tenant-scoped
    return "v3-hive-" + type + "-*";                                                          // single-tenant: global
}
```
- MSSP mode (`TenantContext.get()` returns a prefix) ⇒ `v3-hive-<type>-<prefix>-*` — **scoped**.
- Single-tenant (null prefix) ⇒ global `v3-hive-<type>-*` — correct (only one tenant exists).
- `resolveIndexPatternForPrefix(type, prefix)` (`:39-44`) is the deliberate cross-tenant path for MSSP-admin
  overview services (they pass an explicit tenant prefix).

**A read that injects a hardcoded `"v3-hive-<type>-*"` string instead of calling the resolver bypasses this
mechanism entirely and reads every tenant's data in MSSP mode.** That is the gap class this audit hunts.

### 1.b Java backend — client-supplied patterns guarded by `TenantScopeGuard`
The generic search surface (`/api/elasticsearch/*`) lets the CLIENT pass an `indexPattern`. Isolation there
depends on `TenantScopeGuard.validate()` being called before the search.
`backend/src/main/java/com/hivearmor/service/elasticsearch/TenantScopeGuard.java:34-60`
— in MSSP mode a pattern is in scope only when it starts with the tenant's resolved `alert` or `log` prefix;
non-MSSP mode allows any pattern (`:35-37`).

### 1.c Go SDK — `visibleBy.keyword` ACL via `SearchIn`
`sdk/os/search.go:15-60`: `SearchIn(ctx, index, groups)` appends a
`Terms{"visibleBy.keyword": groups}` filter to the bool/kNN query, then delegates to `WideSearchIn`.
- `WideSearchIn` (`sdk/os/search.go:66`) executes **without** any ACL filter — admin/system use only.
- `RawSearch` (`sdk/os/raw_search.go:16-17`) explicitly **does not inject** `visibleBy` — comment says so.
- `QuerySQL`/`SearchSQL` (`sdk/os/sql.go:28,63`) run raw SQL; the target index is inside the SQL string,
  so `visibleBy` is not applied by the SDK — the caller must scope.

The Go `visibleBy` path is used by the Go event-processor / SDK consumers, **not** by the Java read paths
under audit here. For the Java backend, "scoped" means **1.a** (resolved index pattern) or **1.b** (guard).

---

## 2. Read-path × enforcement × verdict

### 2.a UNSCOPED-GAP findings (tenant data, no scope)

| # | Read path (file:line of the `.search()`/`.index()`) | Index pattern | Mechanism | Verdict |
|---|---|---|---|---|
| G1 | `service/HaEdrFimService.java` — `queryChangesOverTime` `:124`, `queryTopPaths` `:172`, `querySuspiciousHashes` `:215` all `.index(FIM_INDEX)` | `FIM_INDEX = "v3-hive-fim-*"` (hardcoded, `:53`) | none — no resolver, no `visibleBy` | **UNSCOPED-GAP** |
| G2 | `service/HaEdrService.java` — `fetchTimeline` `.index(indexPattern)` `:171` where `indexPattern = resolveIndexPattern(types)` | hardcoded `"v3-hive-process-*,v3-hive-netconn-*,v3-hive-fim-*,v3-hive-dns-*"` (private method `:206-227`) | none | **UNSCOPED-GAP** |
| G3 | `web/rest/EntityGraphResource.java` — `buildGraph` `.index(ALERT_INDEX)` `:87`; `expandSecondHop` `.index(ALERT_INDEX)` `:135` (executed at `:98`/`:141`) | `ALERT_INDEX = "v3-hive-alert-*"` (hardcoded, `:34`) | none (has `@PreAuthorize` `:53` but that is role-only, not tenant) | **UNSCOPED-GAP** |
| G4 | `web/rest/OffenseResource.java` — `getOffenses` `:79`, `getOffense` `:113`, `getOffenseAlerts` `:194`+`:207` via `elasticsearchService.search(..., OFFENSE_INDEX/ALERT_INDEX, ...)` | `OFFENSE_INDEX="v3-hive-offense-*"`, `ALERT_INDEX="v3-hive-alert-*"` (hardcoded, `:37-38`) | none — passes hardcoded pattern straight to `ElasticsearchService.search`, no `validateTenantScope` | **UNSCOPED-GAP** |
| G5 | `service/uba/UbaSyncService.java` — `syncAnomalies` `.index(ALERT_INDEX_PATTERN)` `:69`, executed `:80` | `ALERT_INDEX_PATTERN="v3-hive-alert-*"` (hardcoded, `:34`) | none; `@Scheduled` (`:63`) background job — no request `TenantContext` | **UNSCOPED-GAP (background)** |

### 2.b CONFIRMED-SCOPED (representative — pattern resolved via `MsspIndexResolver`)

| Read path | Evidence (file:line) | Mechanism |
|---|---|---|
| `service/HaEdrService.fetchProcessNodes` (EDR process-tree) | `.index(indexResolver.resolveIndexPattern("event"))` `HaEdrService.java:97` | SCOPED-by-index ✅ |
| `service/overview/OverviewService` | `resolveIndexPattern("alert")` `:56,63,91` | SCOPED-by-index |
| `service/hunt/HaHuntService` | `resolveIndexPattern("log")` `:566,577` | SCOPED-by-index |
| `service/hunt/crosstab/HaHuntCrosstabPlanner` | `resolveIndexPattern(...)` `:548,557` | SCOPED-by-index |
| `web/rest/entity/HaEntityResource` | `resolveIndexPattern("entity")` `:122,179` | SCOPED-by-index |
| `web/rest/correlation/HaCorrelatedFindingsResource` | `resolveIndexPattern("correlation")` `:106,148` | SCOPED-by-index |
| `web/rest/incident/UtmIncidentResource` | `resolveIndexPattern("incident"/"evidence")` `:371,791,940` | SCOPED-by-index |
| `service/entity/EntityDossierService` / `EntityInventoryService` / `EntityIncidentLinkService` / `EntityRelationshipService` | `resolveIndexPattern("log"/"alert"/"entity"/"incident")` (e.g. `EntityDossierService.java:102-103`, `EntityIncidentLinkService.java:86,118`, `EntityRelationshipService.java:140`) | SCOPED-by-index |
| `service/graph/GraphExplorationService` / `GraphRelationshipService` / `GraphExpansionService` | `resolveIndexPattern("relationship")` `:104 / :134 / :145` | SCOPED-by-index |
| `web/rest/HaGraphResource` / `web/rest/graph/HaConstellationGraphResource` | `resolveIndexPattern("entity"/"relationship")` `HaGraphResource.java:345,392`; `HaConstellationGraphResource.java:96,140` | SCOPED-by-index |
| `service/correlation/FindingEvidenceService` / `CorrelatedFindingService` | `resolveIndexPattern("alert"/"log")` `FindingEvidenceService.java:88,190` | SCOPED-by-index |
| `service/incident/IncidentEventSearchService` / `IncidentResponseActionService` / `EvidenceProvenanceService` | `resolveIndexPattern("log"/"incident"/"evidence")` `IncidentEventSearchService.java:77,82`; `IncidentResponseActionService.java:83,133`; `EvidenceProvenanceService.java:193,293` | SCOPED-by-index |
| `service/compliance/ComplianceEvidenceService` / `ComplianceEvidenceScoringService` | `resolveIndexPattern(COMPLIANCE_EVIDENCE_DATA_TYPE)` `ComplianceEvidenceService.java:46`; `ComplianceEvidenceScoringService.java:118` | SCOPED-by-index |
| `service/ueba/OpenSearchActiveUserDirectory` / `HaUebaBaselineService` / `metrics/OpenSearchMetricObservationReader` | resolver-only per class docs; `OpenSearchMetricObservationReader.java:76` | SCOPED-by-index |
| `web/rest/hunt/HaAlertQueueResource` / `HaAlertActionResource` / `HaAlertBulkResource` / `HaAlertAssignmentResource` / `HaAlertInvestigationResource` | resolve `"alert"/"log"/"incident"` (e.g. `HaAlertInvestigationResource.java:127,338`; `HaAlertActionResource.java:320`) | SCOPED-by-index |
| `service/mssp/MsspOverviewService` / `MsspTenantService` | `resolveIndexPatternForPrefix("alert", <tenantPrefix>)` `MsspOverviewService.java:172`; `MsspTenantService.java:230` — **deliberate** cross-tenant, prefix supplied per tenant | SCOPED-by-index (per-prefix) |
| `web/rest/entity` `HaEntityResource`, `service/graph/*` seed lookups | resolver (see above) | SCOPED-by-index |
| Generic client-pattern endpoints `web/rest/elasticsearch/ElasticsearchResource` `/search` `:245`, `/search/csv` `:293`, `/generic-search` `:374`, `/count` `:449` | each calls `validateTenantScope(...)` **before** the search (`:243,296,376,452`) → `TenantScopeGuard.validate` | SCOPED-by-guard (1.b) |
| `web/rest/elasticsearch/ElasticsearchResource` `/search/sql` `:339` | `validateSqlTenantScope(sanitizedQuery)` `:348` parses every FROM/JOIN token and requires each in-scope, **fails closed** in MSSP mode (`:116-149`) | SCOPED-by-guard (SQL) |

### 2.c N/A — platform-internal (not per-tenant data)

| Read path | Evidence | Why N/A |
|---|---|---|
| `web/rest/HaAuditLogResource` (`AUDIT_INDEX="v3-hive-backend-logs"` `:55`) | single global backend-audit index (no date/tenant suffix) | Backend audit log is a single platform-internal index, not per-tenant SIEM data. Confirm `@PreAuthorize` restricts to admin (see §3.5). |
| `web/rest/UtmAuditEventResource` (`AUDIT_INDEX="v3-hive-backend-logs"` `:34`) | same index | same |
| `service/application_events/ApplicationEventService` (`V11_LOCAL_INDEX="v3-hive-backend-logs"` `:39`) | writes/reads platform events | same |
| `config/Constants.STATISTICS_INDEX_PATTERN="v3-hive-statistics-*"` `:143`; `network_scan/SourceActivityProvider` | platform statistics | Statistics are platform aggregates; treat as internal unless a tenant field exists (§3.5 open item). |

### 2.d N/A — relational (Postgres), not an OpenSearch read

| Read path | Evidence | Note |
|---|---|---|
| `service/edr/EdrService.queryEvents` | class uses JPA repos `UtmEdrEventRepository` etc. (`EdrService.java:5,27-30`), **no** `OpensearchClientBuilder`/`.search()` | Relational read; tenant scoping is the T09 `findFilteredForTenant` fix, out of T19 (OpenSearch) scope. `HaEdrService` (the OpenSearch-backed one) is covered in §2.a/§2.b. |

---

## 3. Prioritized gap detail + suggested fixes

### G1 — `HaEdrFimService` (FIM dashboard) — HIGH
- **File/line:** `service/HaEdrFimService.java:53` `FIM_INDEX="v3-hive-fim-*"`; injected at `:124`, `:172`, `:215`.
- **Why it's a gap:** File-Integrity-Monitoring events are per-endpoint (per-tenant) data. In MSSP mode this
  aggregates FIM changes, top paths and suspicious hashes **across every tenant** — a cross-tenant read leak.
  The class does not even inject `MsspIndexResolver` (constructor `:63` takes only `OpensearchClientBuilder`).
- **Suggested fix:** inject `MsspIndexResolver`; replace `FIM_INDEX` with `indexResolver.resolveIndexPattern("fim")`
  at the three `SearchRequest.of(...).index(...)` sites.

### G2 — `HaEdrService.fetchTimeline` (EDR timeline) — HIGH
- **File/line:** `service/HaEdrService.java:171` `.index(indexPattern)`, where `resolveIndexPattern(String types)`
  (`:206-227`) builds a hardcoded `"v3-hive-process-*,v3-hive-netconn-*,v3-hive-fim-*,v3-hive-dns-*"`.
- **Why it's a gap:** The EDR timeline (GET /api/ha-edr/... timeline) returns per-agent events across all
  tenants in MSSP mode. Note the **inconsistency**: the sibling method `fetchProcessNodes` in the same class
  **is** scoped via `indexResolver.resolveIndexPattern("event")` (`:97`) — so the resolver is already injected;
  only `fetchTimeline` bypasses it.
- **Suggested fix:** rename the private helper and route each type through
  `indexResolver.resolveIndexPattern("process"|"netconn"|"fim"|"dns")` so it emits
  `v3-hive-<type>-<prefix>-*` under MSSP, joining the tenant-scoped patterns with commas.

### G3 — `EntityGraphResource` (entity graph over alerts) — HIGH
- **File/line:** `web/rest/EntityGraphResource.java:34` `ALERT_INDEX="v3-hive-alert-*"`; used `:87` and `:135`.
- **Why it's a gap:** Builds an entity neighbourhood from alert aggregations. `@PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_USER')")`
  (`:53`) is role-only — a `ROLE_USER` scoped to Tenant A gets a graph built from **all tenants' alerts**.
  Class injects only `OpensearchClientBuilder` (`:36-39`), no resolver.
- **Suggested fix:** inject `MsspIndexResolver`; replace `ALERT_INDEX` with `indexResolver.resolveIndexPattern("alert")`
  at both `SearchRequest.of(...).index(...)` sites.

### G4 — `OffenseResource` (offenses + linked alerts) — HIGH
- **File/line:** `web/rest/OffenseResource.java:37-38` `OFFENSE_INDEX`/`ALERT_INDEX`; passed to
  `elasticsearchService.search(...)` at `:79`, `:113`, `:194`, `:207`. Also the `updateByQuery` at `:159`
  (write) uses the same hardcoded `OFFENSE_INDEX`.
- **Why it's a gap:** Offenses and their alerts are tenant data. `getOffenses`/`getOffense`/`getOffenseAlerts`
  read a hardcoded pattern with **no** `validateTenantScope` and **no** resolver, so any tenant's user lists/reads
  every tenant's offenses in MSSP mode. (Only `updateOffenseStatus` carries `@PreAuthorize`; the reads do not.)
- **Suggested fix:** inject `MsspIndexResolver`; replace the two constants with
  `indexResolver.resolveIndexPattern("offense"|"alert")`. (The `updateByQuery` write should be scoped too.)

### G5 — `UbaSyncService.syncAnomalies` (scheduled) — MEDIUM (background, not request-facing)
- **File/line:** `service/uba/UbaSyncService.java:34` `ALERT_INDEX_PATTERN="v3-hive-alert-*"`; `:69` `.index(...)`,
  `@Scheduled(fixedDelay=60_000)` (`:63`).
- **Why it's a gap:** A background job with no request `TenantContext`, it scans the **global** alert pattern and
  folds anomalies into shared relational UBA tables (`UtmUbaAnomaly`/`UtmUbaEntityRisk`) with no tenant column
  — mixing tenants' risk scores. This is the same class of gap as other `@Scheduled` aggregators (alert-tagging
  aspect, SOAR rules). It is not a direct read-API leak, but it does aggregate cross-tenant.
- **Suggested fix:** iterate the tenant registry and, per tenant, set `TenantContext` and resolve the pattern via
  `MsspIndexResolver.resolveIndexPatternForPrefix("alert", prefix)`, writing tenant-stamped UBA rows. Track as a
  UBA-tenant-attribution follow-on (parallel to the T08/T09 EDR-event and quarantine tenant-column work).

---

## 4. Cross-cutting notes / open items for the implementer

- **3.5 — `v3-hive-backend-logs` & `v3-hive-statistics-*` classification is provisional.** I classified them
  N/A (platform-internal) because they are single global indices with no tenant suffix, but I did **not**
  verify (a) whether the writer stamps any tenant field, or (b) that the audit/statistics read endpoints are
  `@PreAuthorize`-restricted to platform admins. If either is false, the audit-log endpoints
  (`HaAuditLogResource`, `UtmAuditEventResource`) become a lower-severity tenant-visibility question. **Recommend
  a focused check of the `@PreAuthorize` on those two controllers and of the audit writer's tenant handling.**
- **3.6 — Lower-severity metadata endpoints (could-not-fully-confirm as gaps):** in
  `ElasticsearchResource`, `getFieldValues` (`:158`, param `indexPattern`), `getFieldValuesWithCount`
  (`:172`, `rq.getIndex()`), `getIndexProperties` (`:205`), and `getAllIndexes` (`:216`, `pattern`) accept a
  client-supplied pattern but do **not** call `validateTenantScope`. These return field names / distinct
  field values / index metadata rather than documents, but distinct **field values** (e.g. usernames, hosts)
  can still leak across tenants in MSSP mode. Recommend routing these through `TenantScopeGuard.validate` too.
  Flagged as a judgment call rather than asserted as a hard document-read gap.
- **Consistency signal:** the gaps cluster in classes that inject `OpensearchClientBuilder` directly and hold a
  hardcoded `private static final String ...INDEX = "v3-hive-...-*"` constant. A useful lint/guard would be a
  test that fails on any `"v3-hive-"` string literal outside `MsspIndexResolver`/`HaIndexNames`/`Constants`
  (the `sdk/os/hardcoded_index_regex_property_test.go` already does the equivalent on the Go side).

---

## 5. Confirmed-scoped summary
The overwhelming majority of tenant-relevant OpenSearch reads in the Java backend (overview, hunt, crosstab,
alerts queue/action/bulk/assignment/investigation, entities, graph, correlation, incidents, compliance
evidence, UEBA, MSSP overview, and the EDR **process-tree** path) correctly resolve their index pattern through
`MsspIndexResolver.resolveIndexPattern` / `resolveIndexPatternForPrefix`, and the generic client-pattern surface
(`/search`, `/search/csv`, `/generic-search`, `/count`, `/search/sql`) is guarded by `TenantScopeGuard` /
`validateSqlTenantScope` (fails closed in MSSP mode). The Go SDK enforces the `visibleBy.keyword` ACL in
`SearchIn` and correctly documents that `WideSearchIn`, `RawSearch`, and the SQL helpers do not — those are the
admin/system-only escape hatches. The five gaps in §2.a are the exceptions: hardcoded `v3-hive-*` literals that
skip the resolver and read across tenants in MSSP mode.

*Recommendations only — no source files were changed by this audit.*
