# S01-T01 — Fix SQL Injection in Sort + Filter Parameters

**Sprint:** 1 (Security-Critical)  
**Severity:** CRITICAL  
**Issue IDs:** SEC-NEW-05, SEC-NEW-06  
**Dependencies:** None — implement first  
**Estimated time:** 4 hours

---

## Context

Two backend service files build raw SQL strings by directly concatenating HTTP request parameters using `String.format()`. An authenticated attacker (any USER or ADMIN role) can inject arbitrary SQL into the ORDER BY clause and WHERE filters, enabling database enumeration, data exfiltration, or table destruction.

**Vulnerable files:**
- `backend/src/main/java/com/nilachakra/service/network_scan/UtmAssetGroupService.java`
- `backend/src/main/java/com/nilachakra/service/collectors/CollectorOpsService.java`

**Proof of concept (do not run in production):**
```
GET /api/utm-asset-groups/searchGroupsByFilter?sort=1;DROP TABLE utm_asset_group;--,asc
GET /api/utm-asset-groups/searchGroupsByFilter?assetType=x' OR '1'='1
```

---

## What to Read First

Before writing any code, read these files completely:

1. `backend/src/main/java/com/nilachakra/service/network_scan/UtmAssetGroupService.java` — focus on `searchGroupsByFilter()` method (~line 126-220)
2. `backend/src/main/java/com/nilachakra/service/collectors/CollectorOpsService.java` — focus on the same method pattern (~line 290-360)
3. `backend/src/main/java/com/nilachakra/web/rest/network_scan/UtmAssetGroupResource.java` — to understand what sort params come in from HTTP
4. `backend/src/main/java/com/nilachakra/web/rest/collectors/CollectorOpsResource.java` — same for collectors

---

## Implementation Steps

### Step 1: Create a sort column allowlist utility

Create a new file: `backend/src/main/java/com/nilachakra/util/SqlSortValidator.java`

```java
package com.nilachakra.util;

import org.springframework.data.domain.Sort;
import java.util.Set;

public final class SqlSortValidator {

    private SqlSortValidator() {}

    public static Sort validateAndFilter(Sort sort, Set<String> allowedColumns) {
        if (sort.isUnsorted()) return sort;
        var validOrders = sort.stream()
            .filter(o -> allowedColumns.contains(o.getProperty()))
            .toList();
        return validOrders.isEmpty() ? Sort.unsorted() : Sort.by(validOrders);
    }
}
```

### Step 2: Fix `UtmAssetGroupService.java`

In `searchGroupsByFilter()` and `countGroupsByFilter()`:

**Replace all `String.format()` calls for filter values with JPA `EntityManager.createNativeQuery` with positional parameters.**

Define allowed sort columns as a constant at the top of the class:
```java
private static final Set<String> ASSET_GROUP_SORT_COLS = Set.of(
    "utm_asset_group.id",
    "utm_asset_group.group_name",
    "utm_asset_group.group_description",
    "utm_network_scan.asset_ip",
    "utm_network_scan.asset_name",
    "utm_network_scan.os",
    "utm_network_scan.type",
    "created_date",
    "last_modified_date"
);
```

**Before appending sort to SQL:**
```java
Sort validatedSort = SqlSortValidator.validateAndFilter(pageable.getSort(), ASSET_GROUP_SORT_COLS);
```

**Replace each `String.format("AND type = '%s'\n", filters.getAssetType())` pattern** with a parameterized approach. Use a `StringBuilder` for the SQL template with `?1`, `?2`, etc. placeholders, and pass values via `.setParameter()`:

```java
List<Object> params = new ArrayList<>();
StringBuilder sb = new StringBuilder();
sb.append("SELECT ... FROM ...\n");
sb.append("WHERE 1=1\n");

if (StringUtils.hasText(filters.getAssetType())) {
    sb.append("AND type = ?\n");
    params.add(filters.getAssetType());
}
if (StringUtils.hasText(filters.getGroupName())) {
    sb.append("AND lower(utm_asset_group.group_name) LIKE ?\n");
    params.add("%" + filters.getGroupName().toLowerCase() + "%");
}
// ... same pattern for all other filter fields

// Append ORDER BY from validated sort only
if (validatedSort.isSorted()) {
    sb.append("ORDER BY ");
    // Safe: columns came from ASSET_GROUP_SORT_COLS allowlist
    sb.append(validatedSort.stream()
        .map(o -> o.getProperty() + " " + o.getDirection().name())
        .collect(Collectors.joining(", ")));
}

Query query = entityManager.createNativeQuery(sb.toString(), UtmAssetGroup.class);
for (int i = 0; i < params.size(); i++) {
    query.setParameter(i + 1, params.get(i));
}
```

For the IP list (`IN` clause), use a separate `@NamedNativeQuery` or pass using Hibernate's `setParameterList` via `TypedQuery`.

### Step 3: Apply the same fix to `CollectorOpsService.java`

Define:
```java
private static final Set<String> COLLECTOR_SORT_COLS = Set.of(
    "id", "collector_ip", "collector_name", "collector_status",
    "last_seen", "created_date"
);
```

Apply the identical parameterized query pattern to all `String.format()` filter concatenations in this file.

### Step 4: Integration test file

Create: `backend/src/test/java/com/nilachakra/service/network_scan/UtmAssetGroupServiceSqlInjectionTest.java`

```java
@SpringBootTest
@Transactional
class UtmAssetGroupServiceSqlInjectionTest {

    @Autowired UtmAssetGroupService service;

    @Test
    void sortParameterInjectionAttempt_doesNotExecuteArbitrarySql() {
        // Arrange: sort property is a SQL injection payload
        Sort injectedSort = Sort.by(Sort.Order.asc("1; DROP TABLE utm_asset_group; --"));
        Pageable pageable = PageRequest.of(0, 10, injectedSort);
        UtmAssetGroupFilter filters = new UtmAssetGroupFilter();

        // Act + Assert: should return empty results (sort ignored), not throw or drop table
        assertDoesNotThrow(() -> service.searchGroupsByFilter(filters, pageable));
        // Table must still exist
        assertDoesNotThrow(() -> service.searchGroupsByFilter(new UtmAssetGroupFilter(), 
            PageRequest.of(0, 1)));
    }

    @Test
    void assetTypeFilterInjection_doesNotReturnExtraRows() {
        UtmAssetGroupFilter filters = new UtmAssetGroupFilter();
        filters.setAssetType("x' OR '1'='1");
        Pageable pageable = PageRequest.of(0, 100);

        // Should return 0 rows, not all rows
        var results = service.searchGroupsByFilter(filters, pageable);
        assertThat(results.getContent()).isEmpty();
    }

    @Test
    void groupNameFilterWithSpecialChars_isSafe() {
        UtmAssetGroupFilter filters = new UtmAssetGroupFilter();
        filters.setGroupName("O'Brien"); // legitimate apostrophe in name
        Pageable pageable = PageRequest.of(0, 10);

        assertDoesNotThrow(() -> service.searchGroupsByFilter(filters, pageable));
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

# Run the specific test class
./mvnw test -pl . -Dtest=UtmAssetGroupServiceSqlInjectionTest -DfailIfNoTests=false

# Run all service tests to catch regressions
./mvnw test -pl . -Dtest="*Service*" -DfailIfNoTests=false

# Full backend build to ensure compilation
./mvnw compile -q

# Manual smoke test (requires running backend at port 8088):
# Normal request — should work
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-asset-groups/searchGroupsByFilter?page=0&size=10" | jq '.length'

# SQL injection attempt — should return empty array, not error 500
curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-asset-groups/searchGroupsByFilter?sort=1;DROP+TABLE;--,asc" | jq '.'
```

To get a JWT for manual testing:
```bash
JWT=$(curl -s -X POST http://localhost:8088/api/authenticate \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"localdev123!","rememberMe":false}' | jq -r '.id_token')
```

---

## Acceptance Criteria

- [ ] All `String.format()` calls that concatenate HTTP-sourced values into SQL are replaced with parameterized queries
- [ ] An unknown sort column in the HTTP request is silently ignored (not rejected with 400, not passed to SQL)
- [ ] The SQL injection unit tests pass
- [ ] `GET /api/utm-asset-groups/searchGroupsByFilter?sort=legit_col,asc` still returns correct sorted results
- [ ] `GET /api/utm-asset-groups/searchGroupsByFilter?assetType=server` still filters correctly
- [ ] `./mvnw compile` succeeds with zero errors
- [ ] No existing service tests in `*AssetGroup*` or `*CollectorOps*` are broken

---

## Regression Checklist

After implementation, verify these pages still work in the running app:
- `/agents` page — uses collector list (backend: `CollectorOpsService`)
- `/data-sources` page — uses asset groups
- `/data-sources/collectors` page
