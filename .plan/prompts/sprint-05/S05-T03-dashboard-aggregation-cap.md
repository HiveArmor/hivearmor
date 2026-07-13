# S05-T03: Cap Dashboard Terms Aggregation Buckets and Cache Results

**Sprint:** 5 (Reliability + Performance)
**Severity:** High
**Issue ID:** PERF-02
**Dependencies:** None
**Estimated time:** 2–3 hours

---

## Context

`ElasticsearchService.getFieldValues(String keyword, String indexPattern)` (line 88) unconditionally passes `10_000` as the `size` argument to a Terms aggregation on every call. This method is invoked on every dashboard load and periodic refresh. A Terms aggregation with 10,000 buckets forces OpenSearch to sort and serialize thousands of bucket entries even when the caller only needs the top values for a dropdown or chart legend. Under any non-trivial tenant dataset this causes measurable query latency and cluster CPU spikes.

There is no cache of any kind protecting this query path. The project already has Caffeine on the classpath (`TfaCacheConfig.java` uses it for TFA state), so no new dependency is required. The fix is: reduce the hard-coded bucket cap to 500, and wrap the call in a 60-second Caffeine cache keyed on `(keyword, indexPattern)`.

The aggregation is constructed one level down in `OpenSearch.java` line 242; the parameter flows in from `ElasticsearchService` line 92. Only the caller side needs to change — `OpenSearch.getFieldValues(field, indexPattern, filter, size, order, sortOrder)` already accepts `size` as a parameter.

---

## What to Read First

1. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/service/elasticsearch/ElasticsearchService.java` — lines 56–120. Pay attention to `getFieldValues` (line 88) and `getFieldValuesWithCount` (line 107).
2. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/opensearch/OpenSearch.java` — lines 234–269. This is where the Terms aggregation is built; the `size` parameter arrives here.
3. `/Users/encryptshell/GIT/UTMStack-11/backend/src/main/java/com/nilachakra/config/TfaCacheConfig.java` — shows the existing Caffeine pattern in this codebase (raw `Cache<K,V>` bean, no Spring `CacheManager`).
4. `/Users/encryptshell/GIT/UTMStack-11/backend/pom.xml` — confirm `com.github.ben-manes.caffeine:caffeine` is already declared.

---

## Implementation Steps

### Step 1 — Add a cache configuration class

Create a new Spring `@Configuration` class alongside `TfaCacheConfig.java`. Do **not** add `@EnableCaching` or wire a `CacheManager` — keep it consistent with the existing raw-Caffeine pattern.

**File to create:** `backend/src/main/java/com/nilachakra/config/DashboardCacheConfig.java`

```java
package com.nilachakra.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.List;

@Configuration
public class DashboardCacheConfig {

    /**
     * Cache for ElasticsearchService.getFieldValues(keyword, indexPattern).
     * Key: "keyword::indexPattern"  Value: List<String> of bucket keys
     * TTL: 60 seconds (dashboard refresh cadence).
     * Max: 500 entries (number of distinct keyword+index combinations expected per tenant).
     */
    @Bean
    public Cache<String, List<String>> fieldValuesCache() {
        return Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(60))
                .maximumSize(500)
                .build();
    }
}
```

### Step 2 — Inject the cache into ElasticsearchService and cap the bucket size

Edit `ElasticsearchService.java`:

1. Inject the new cache bean.
2. Reduce the hard-coded `10_000` to `500`.
3. Wrap `getFieldValues(String, String)` to check the cache before calling OpenSearch, and populate it on a miss.

**Changes to `ElasticsearchService.java`:**

```java
// --- add to existing imports ---
import com.github.benmanes.caffeine.cache.Cache;
import java.util.List;
```

Add field injection (place with the other `@Autowired` or constructor-injected fields):

```java
@Autowired
private Cache<String, List<String>> fieldValuesCache;
```

Replace the existing `getFieldValues(String keyword, String indexPattern)` method (lines 88–96):

```java
private static final int FIELD_VALUES_MAX_BUCKETS = 500;

public List<String> getFieldValues(String keyword, String indexPattern) {
    final String ctx = CLASSNAME + ".getFieldValues";
    String cacheKey = keyword + "::" + indexPattern;
    List<String> cached = fieldValuesCache.getIfPresent(cacheKey);
    if (cached != null) {
        return cached;
    }
    try {
        List<String> result = new ArrayList<>(
                client.getClient().getFieldValues(
                        keyword, indexPattern, null,
                        FIELD_VALUES_MAX_BUCKETS,
                        TermOrder.Count, SortOrder.Desc
                ).keySet()
        );
        fieldValuesCache.put(cacheKey, result);
        return result;
    } catch (Exception e) {
        throw new RuntimeException(ctx + ": " + e.getLocalizedMessage());
    }
}
```

`getFieldValuesWithCount` (line 107) passes `top` from the caller — leave it unchanged, as it is not the hot path and the caller already controls the size.

### Step 3 — Add a cache-invalidation endpoint (optional but recommended for operators)

In `UtmStackResource.java` (or a new `CacheResource.java`), expose a secured endpoint so an operator can manually bust the cache when needed:

```java
@PostMapping("/api/cache/field-values/invalidate")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public ResponseEntity<Void> invalidateFieldValuesCache(
        @Autowired Cache<String, List<String>> fieldValuesCache) {
    fieldValuesCache.invalidateAll();
    return ResponseEntity.noContent().build();
}
```

---

## Test Commands

```bash
# 1. Build the backend
cd /Users/encryptshell/GIT/UTMStack-11/backend
./mvnw clean test -pl . -Dtest=ElasticsearchServiceTest,DashboardCacheConfigTest

# 2. Run the full unit test suite
./mvnw test

# 3. Verify no compilation errors
./mvnw compile

# 4. (Integration) Start the stack and observe OpenSearch query size
# In local-dev:
cd /Users/encryptshell/GIT/UTMStack-11/local-dev
docker compose up -d
# Then hit the dashboard endpoint twice within 60 s and confirm the
# second call does NOT generate an OpenSearch query (check OpenSearch
# slow-query log or add a debug log in the cache miss path).
```

Write these unit tests in `backend/src/test/java/com/nilachakra/service/elasticsearch/ElasticsearchServiceFieldValuesCacheTest.java`:

```java
@ExtendWith(MockitoExtension.class)
class ElasticsearchServiceFieldValuesCacheTest {

    @Mock private OpenSearchClientWrapper client;          // or whatever the wrapper type is
    @Mock private OpenSearchClient openSearchClient;

    private Cache<String, List<String>> fieldValuesCache;
    private ElasticsearchService service;

    @BeforeEach
    void setUp() {
        fieldValuesCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(60))
                .maximumSize(500)
                .build();
        service = new ElasticsearchService(/* inject mocks */);
        ReflectionTestUtils.setField(service, "fieldValuesCache", fieldValuesCache);
    }

    @Test
    void getFieldValues_callsOpenSearchOnCacheMiss() {
        when(openSearchClient.getFieldValues(anyString(), anyString(), isNull(), eq(500),
                any(), any())).thenReturn(Map.of("value1", 10L, "value2", 5L));

        List<String> result = service.getFieldValues("user.keyword", "v11-log-*");

        assertThat(result).containsExactlyInAnyOrder("value1", "value2");
        verify(openSearchClient, times(1)).getFieldValues(any(), any(), any(), eq(500), any(), any());
    }

    @Test
    void getFieldValues_returnsCachedValueOnSecondCall() {
        when(openSearchClient.getFieldValues(anyString(), anyString(), isNull(), eq(500),
                any(), any())).thenReturn(Map.of("value1", 10L));

        service.getFieldValues("user.keyword", "v11-log-*");
        service.getFieldValues("user.keyword", "v11-log-*");

        // OpenSearch must be called exactly once despite two invocations
        verify(openSearchClient, times(1)).getFieldValues(any(), any(), any(), any(), any(), any());
    }

    @Test
    void getFieldValues_neverRequestsMoreThan500Buckets() {
        when(openSearchClient.getFieldValues(anyString(), anyString(), isNull(), anyInt(),
                any(), any())).thenReturn(Collections.emptyMap());

        service.getFieldValues("host.keyword", "v11-log-*");

        verify(openSearchClient).getFieldValues(
                anyString(), anyString(), isNull(),
                intThat(size -> size <= 500),   // must never exceed 500
                any(), any());
    }
}
```

---

## Acceptance Criteria

- [ ] `ElasticsearchService.getFieldValues(String, String)` no longer passes `10_000` to the aggregation; it passes `500` (or less).
- [ ] A second call to `getFieldValues` with the same arguments within 60 seconds does not trigger an OpenSearch query.
- [ ] Cache entries expire after 60 seconds (verified with a `Ticker`-based test or by waiting).
- [ ] `getFieldValuesWithCount` is unchanged and still passes the caller-supplied `top` parameter.
- [ ] All existing unit tests pass (`./mvnw test` green).
- [ ] `DashboardCacheConfig` is wired as a Spring bean and the `fieldValuesCache` injects into `ElasticsearchService` without ambiguity.
- [ ] No `NullPointerException` when the cache is cold (first call after startup).
