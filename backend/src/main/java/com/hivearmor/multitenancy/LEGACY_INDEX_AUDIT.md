# Legacy Index Pattern Audit — Sprint 35

**Generated for:** Sprint 35 (S35-T01)
**Purpose:** Complete inventory of all `Constants.SYS_INDEX_PATTERN` and `SystemIndexPattern` references in the Java backend, classified for migration.

---

## SystemIndexPattern Enum → Data Type String Mapping

| Enum Value | Legacy Pattern (from DB) | Replacement Data Type | MsspIndexResolver Method |
|---|---|---|---|
| `ALERTS` | `v3-hive-alert-*` | `"alert"` | `resolveAlertIndexPattern()` / `resolveIndexPattern("alert")` |
| `LOGS` | `v3-hive-log-*` | `"log"` | `resolveIndexPattern("log")` |
| `LOGS_WINDOWS` | `v3-hive-log-*` | `"log"` | `resolveIndexPattern("log")` |

> **Note:** `LOGS_WINDOWS` uses the same `"log"` data type — the Windows-specific filtering is done at the query level (field-based), not at the index level.

---

## Full Inventory Table

| # | File Path | Class | Method | Line(s) | Refs | Enum Value | Classification | Replacement Type |
|---|---|---|---|---|---|---|---|---|
| 1 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `checkForNewAlerts` | 87 | 1 | ALERTS | MIGRATE | `"alert"` |
| 2 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `getRelatedAlerts` | 144 | 1 | LOGS | MIGRATE | `"log"` |
| 3 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `updateStatus` | 189 | 1 | ALERTS | MIGRATE | `"alert"` |
| 4 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `updateStatusAndTag` | 224 | 1 | ALERTS | MIGRATE | `"alert"` |
| 5 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `updateTags` | 249 | 1 | ALERTS | MIGRATE | `"alert"` |
| 6 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `countAlertsByStatus` | 265, 269 | 2 | ALERTS | MIGRATE | `"alert"` |
| 7 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `updateNotes` | 315 | 1 | ALERTS | MIGRATE | `"alert"` |
| 8 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `convertToIncident` | 362 | 1 | ALERTS | MIGRATE | `"alert"` |
| 9 | `service/impl/UtmAlertServiceImpl.java` | `UtmAlertServiceImpl` | `getAlertsByIds` | 382 | 1 | ALERTS | MIGRATE | `"alert"` |
| 10 | `util/AlertUtil.java` | `AlertUtil` | `countAlertsByStatus` | 31, 41 | 2 | ALERTS | MIGRATE | `"alert"` |
| 11 | `util/AlertUtil.java` | `AlertUtil` | `countAllAlertsByStatus` | 56, 65 | 2 | ALERTS | MIGRATE | `"alert"` |
| 12 | `aop/logging/impl/AlertLoggingAspect.java` | `AlertLoggingAspect` | `getAlerts` | 402 | 1 | ALERTS | MIGRATE | `"alert"` |
| 13 | `service/UtmAlertTagRuleService.java` | `UtmAlertTagRuleService` | `revertToOpenStatus` | 186 | 1 | ALERTS | MIGRATE | `"alert"` |
| 14 | `service/UtmAlertTagRuleService.java` | `UtmAlertTagRuleService` | `applyTagRule` | 226 | 1 | ALERTS | MIGRATE | `"alert"` |
| 15 | `service/UtmAlertTagRuleService.java` | `UtmAlertTagRuleService` | `assignAssetGroupsToReviewAlerts` | 287 | 1 | ALERTS | MIGRATE | `"alert"` |
| 16 | `service/overview/OverviewService.java` | `OverviewService` | `countAlertsTodayAndLastWeek` | 53, 60 | 2 | ALERTS | MIGRATE | `"alert"` |
| 17 | `service/overview/OverviewService.java` | `OverviewService` | `topAlerts` | 84, 88 | 2 | ALERTS | MIGRATE | `"alert"` |
| 18 | `service/overview/OverviewService.java` | `OverviewService` | `countAlertsBySeverity` | 114, 118 | 2 | ALERTS | MIGRATE | `"alert"` |
| 19 | `service/overview/OverviewService.java` | `OverviewService` | `topAlertsByCategory` | 146, 150 | 2 | ALERTS | MIGRATE | `"alert"` |
| 20 | `service/overview/OverviewService.java` | `OverviewService` | `countEventsByType` | 180, 187 | 2 | LOGS | MIGRATE | `"log"` |
| 21 | `service/overview/OverviewService.java` | `OverviewService` | `eventsInTime` | 214, 221, 237 | 3 | LOGS | MIGRATE | `"log"` |
| 22 | `service/overview/OverviewService.java` | `OverviewService` | `topWindowsEvents` | 265, 273 | 2 | LOGS_WINDOWS | MIGRATE | `"log"` |
| 23 | `service/reports/CustomReportService.java` | `CustomReportService` | `buildThreatActivityForAlerts` | 75 | 1 | ALERTS | MIGRATE | `"alert"` |
| 24 | `service/reports/CustomReportService.java` | `CustomReportService` | `buildThreatActivityForIncidents` | 105 | 1 | ALERTS | MIGRATE | `"alert"` |
| 25 | `service/elasticsearch/ElasticsearchService.java` | `ElasticsearchService` | `deleteOldestIndices` | 299 | 1 | LOGS | ADMIN_GLOBAL | N/A |
| 26 | `service/index_policy/IndexPolicyService.java` | `IndexPolicyService` | `init` (addPolicy) | 132, 133 | 2 | LOGS, ALERTS | ADMIN_GLOBAL | N/A |
| 27 | `service/index_policy/IndexPolicyService.java` | `IndexPolicyService` | `updateIndexPolicy` | 279, 281, 283, 285, 297, 299, 301, 303, 305, 307 | 10 | LOGS, ALERTS | ADMIN_GLOBAL | N/A |
| 28 | `service/index_policy/IndexPolicyService.java` | `IndexPolicyService` | `buildPolicy` (ISM template) | 422, 423 | 2 | LOGS, ALERTS | ADMIN_GLOBAL | N/A |
| 29 | `service/application_modules/ModuleRequirementChecksService.java` | `ModuleRequirementChecksService` | `checkWindowsEvents` | 29 | 1 | LOGS_WINDOWS | ADMIN_GLOBAL | N/A |
| 30 | `service/compliance/hipaa/HipaaService.java` | `HipaaService` | (commented-out method) | 103 | 1 | LOGS_WINDOWS | DEPRECATED | N/A |
| 31 | `config/Constants.java` | `Constants` | (field declaration) | 54 | 1 | — | DEPRECATED | Remove field |
| 32 | `domain/index_pattern/enums/SystemIndexPattern.java` | `SystemIndexPattern` | (enum definition) | 1–7 | — | — | DEPRECATED | Remove enum |
| 33 | `service/impl/index_pattern/UtmIndexPatternServiceImpl.java` | `UtmIndexPatternServiceImpl` | `init` | 52–56 | 3 | LOGS, ALERTS, LOGS_WINDOWS | DEPRECATED | Remove init method |

---

## Classification Summary

| Classification | Count (files) | Total References |
|---|---|---|
| **MIGRATE** | 7 files | ~42 references |
| **ADMIN_GLOBAL** | 3 files | ~16 references |
| **DEPRECATED** | 3 files | ~5 references (incl. commented-out code) |

---

## MIGRATE Services (must inject MsspIndexResolver)

| Service | Current Injection | Refs to Migrate | Notes |
|---|---|---|---|
| `UtmAlertServiceImpl` | Constructor (`@RequiredArgsConstructor`) | 10 | All ALERTS except 1 LOGS |
| `AlertUtil` | Already `@Component` with constructor | 4 | Already a Spring bean; just inject `MsspIndexResolver` |
| `AlertLoggingAspect` | Constructor | 1 | Aspect runs in request thread; TenantContext available |
| `UtmAlertTagRuleService` | Constructor (`@RequiredArgsConstructor`) | 3 | All ALERTS |
| `OverviewService` | Constructor | 15 | 8 ALERTS + 5 LOGS + 2 LOGS_WINDOWS |
| `CustomReportService` | Constructor (inspect) | 2 | Both ALERTS |
| `ElasticsearchResource` | N/A (not in this audit — validation task) | 0 | Needs tenant scope validation (S35-T04) |

---

## ADMIN_GLOBAL Services (intentionally cross-tenant — DO NOT MIGRATE)

| Service | Justification |
|---|---|
| `IndexPolicyService` | Manages physical ISM (Index State Management) policies across ALL indices — must see all tenants |
| `ElasticsearchService.deleteOldestIndices` | Infrastructure disk management — deletes oldest log indices regardless of tenant |
| `ModuleRequirementChecksService` | System health module activation checks — scans ALL windows event indices |

---

## DEPRECATED References (to be removed in S35-T05)

| File | What to Remove |
|---|---|
| `Constants.java` | Remove `SYS_INDEX_PATTERN` field declaration (line 54) |
| `SystemIndexPattern.java` | Delete entire enum file |
| `UtmIndexPatternServiceImpl.init()` | Remove the `init()` method that populates `SYS_INDEX_PATTERN` at startup |
| `HipaaService.java` | Commented-out block at line ~103 — already dead code, clean up |

---

## Sprint 21 Conflict Check (Sub-task 1.5)

**Result: NO CONFLICTS FOUND** ✓

No Java file simultaneously imports/uses both `MsspIndexResolver` and `Constants.SYS_INDEX_PATTERN`. The Sprint 21 migration correctly introduced `MsspIndexResolver` in new services (e.g., `MsspOverviewService`, `HaSearchService`, `HaSearchSuggestionService`, `ComplianceReportGenerationService`, `HiveEntityService`, `HaEdrService`, `MsspTenantService`) without modifying the legacy services. There is no partial migration that reads from both sources in the same method.

---

## AlertUtil Static Caller Analysis (Sub-task 1.6)

`AlertUtil` is **already a `@Component`** (since it has `@Component` annotation and constructor injection of `ElasticsearchService`). It does NOT have static methods — `countAlertsByStatus` and `countAllAlertsByStatus` are instance methods.

**Current callers (all inject AlertUtil as a dependency — no breakage expected):**

| Caller | Injection Method | Will Break? |
|---|---|---|
| `UtmAlertTagRuleService` | `@RequiredArgsConstructor` field (`private final AlertUtil alertUtil`) | **No** — already injected |
| `UtmAlertResource` | Constructor parameter | **No** — already injected |
| `UtmNotificationService` | `@RequiredArgsConstructor` (but usage is **commented out** in `loadOpenAlerts`) | **No** — dead code |

**Conclusion:** Converting AlertUtil's index resolution to use `MsspIndexResolver` requires only adding `MsspIndexResolver` as an additional constructor parameter. No callers will break because AlertUtil is already a Spring bean with instance methods — there are **no static callers** to refactor.

---

## Migration Order Recommendation

1. `UtmAlertServiceImpl` — highest reference count among MIGRATE services, core alert functionality
2. `AlertUtil` — simple change (add `MsspIndexResolver` to existing constructor)
3. `UtmAlertTagRuleService` — 3 references, all ALERTS
4. `AlertLoggingAspect` — 1 reference, straightforward
5. `OverviewService` — 15 references across ALERTS, LOGS, LOGS_WINDOWS
6. `CustomReportService` — 2 references, both ALERTS
7. `ElasticsearchResource` — tenant validation (separate concern, S35-T04)
