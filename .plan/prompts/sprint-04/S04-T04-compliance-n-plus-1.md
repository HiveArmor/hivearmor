# S04-T04 — Fix Compliance N+1 OpenSearch Queries

**Sprint:** 4 (Active Directory + Compliance)  
**Severity:** MEDIUM — 20 serial OpenSearch queries per page load  
**Issue ID:** PERF-01  
**Dependencies:** S04-T02 (compliance plugin deployed), S04-T03 (compliance wired)  
**Estimated time:** 3 hours

---

## Context

`UtmComplianceControlEvaluationLatestService.getControlsWithLastEvaluation()` fires one OpenSearch query per compliance control when loading the compliance controls tab. With a default of 20 controls per page, this causes 20 serial round-trips to OpenSearch on every page load, taking seconds.

**Affected file:** `backend/src/main/java/com/nilachakra/service/compliance/UtmComplianceControlEvaluationLatestService.java`

---

## What to Read First

1. `backend/src/main/java/com/nilachakra/service/compliance/UtmComplianceControlEvaluationLatestService.java` — entire file, find the loop that fires individual queries
2. `backend/src/main/java/com/nilachakra/domain/UtmComplianceControlEvaluationLatest.java` — entity structure
3. OpenSearch client setup in backend: `grep -r "RestHighLevelClient\|OpenSearchClient" backend/src/ --include="*.java" -l`
4. Any existing batch/multi-get OpenSearch calls in the codebase to use as a pattern

---

## Implementation Steps

### Step 1: Identify the N+1 pattern

In `getControlsWithLastEvaluation()`, find the loop like:

```java
// CURRENT (N+1 — fires one query per control):
List<ControlWithEvaluation> results = new ArrayList<>();
for (UtmComplianceControl control : controls) {
    UtmComplianceControlEvaluationLatest eval = 
        getLatestEvaluation(control.getId());  // ONE OpenSearch query per control
    results.add(new ControlWithEvaluation(control, eval));
}
return results;
```

### Step 2: Batch the evaluations with a single query

Replace the loop with a single OpenSearch query that fetches evaluations for ALL control IDs at once:

```java
public List<ControlWithEvaluation> getControlsWithLastEvaluation(List<UtmComplianceControl> controls) {
    if (controls.isEmpty()) return Collections.emptyList();
    
    List<Long> controlIds = controls.stream()
        .map(UtmComplianceControl::getId)
        .collect(Collectors.toList());
    
    // ONE query: get latest evaluations for all control IDs
    Map<Long, UtmComplianceControlEvaluationLatest> evaluationsByControlId =
        fetchLatestEvaluationsBatch(controlIds);
    
    return controls.stream()
        .map(control -> new ControlWithEvaluation(
            control,
            evaluationsByControlId.get(control.getId())  // null if no evaluation yet
        ))
        .collect(Collectors.toList());
}

private Map<Long, UtmComplianceControlEvaluationLatest> fetchLatestEvaluationsBatch(List<Long> controlIds) {
    // Build a single query: filter by controlId IN (controlIds), collapse by controlId, get latest
    SearchRequest request = new SearchRequest("v11-compliance-eval-*");
    SearchSourceBuilder source = new SearchSourceBuilder();
    
    source.query(QueryBuilders.termsQuery("controlId", controlIds))
          .size(0);  // No docs needed, only aggregations
    
    // Top-hits aggregation per controlId to get the latest evaluation
    source.aggregation(
        AggregationBuilders.terms("by_control_id")
            .field("controlId")
            .size(controlIds.size())
            .subAggregation(
                AggregationBuilders.topHits("latest")
                    .sort("evaluatedAt", SortOrder.DESC)
                    .size(1)
            )
    );
    
    request.source(source);
    
    try {
        SearchResponse response = openSearchClient.search(request, RequestOptions.DEFAULT);
        Terms byControlId = response.getAggregations().get("by_control_id");
        
        Map<Long, UtmComplianceControlEvaluationLatest> result = new HashMap<>();
        for (Terms.Bucket bucket : byControlId.getBuckets()) {
            long controlId = bucket.getKeyAsNumber().longValue();
            TopHits topHits = bucket.getAggregations().get("latest");
            if (topHits.getHits().getHits().length > 0) {
                SearchHit hit = topHits.getHits().getHits()[0];
                UtmComplianceControlEvaluationLatest eval = parseEvaluation(hit);
                result.put(controlId, eval);
            }
        }
        return result;
    } catch (IOException e) {
        log.error("Failed to batch fetch evaluations: {}", e.getMessage());
        return Collections.emptyMap();
    }
}
```

### Step 3: Add a result cache

Since compliance evaluation data doesn't change every second, add a 60-second Caffeine cache:

```java
@Service
public class UtmComplianceControlEvaluationLatestService {

    private final Cache<String, Map<Long, UtmComplianceControlEvaluationLatest>> evalCache =
        Caffeine.newBuilder()
            .expireAfterWrite(60, TimeUnit.SECONDS)
            .maximumSize(10)
            .build();

    private Map<Long, UtmComplianceControlEvaluationLatest> fetchLatestEvaluationsBatch(
            List<Long> controlIds) {
        String cacheKey = controlIds.stream().sorted().map(String::valueOf)
            .collect(Collectors.joining(","));
        
        return evalCache.get(cacheKey, key -> fetchFromOpenSearch(controlIds));
    }
}
```

### Step 4: Write performance test

Create: `backend/src/test/java/com/nilachakra/service/compliance/ComplianceEvaluationBatchTest.java`

```java
@SpringBootTest
@Transactional
class ComplianceEvaluationBatchTest {

    @Autowired UtmComplianceControlEvaluationLatestService service;
    @SpyBean RestHighLevelClient openSearchClient;  // or appropriate spy

    @Test
    void getControlsWithLastEvaluation_fires_singleQuery_not_N_queries() {
        // Arrange: 20 controls
        List<UtmComplianceControl> controls = createTestControls(20);
        
        // Clear any calls from setup
        clearInvocations(openSearchClient);
        
        // Act
        service.getControlsWithLastEvaluation(controls);
        
        // Assert: OpenSearch was called exactly once (batch), not 20 times
        verify(openSearchClient, times(1)).search(any(SearchRequest.class), any());
    }

    @Test
    void emptyControlList_returnsEmptyWithoutQuery() {
        clearInvocations(openSearchClient);
        
        var result = service.getControlsWithLastEvaluation(Collections.emptyList());
        
        assertThat(result).isEmpty();
        verify(openSearchClient, never()).search(any(), any());
    }
}
```

---

## Test Commands

```bash
cd /Users/encryptshell/GIT/UTMStack-11/backend

./mvnw compile -q

./mvnw test -Dtest=ComplianceEvaluationBatchTest -DfailIfNoTests=false

# Manual performance test:
# Before fix: measure compliance page load time
time curl -s -H "Authorization: Bearer $JWT" \
  "http://localhost:8088/api/utm-compliance-controls?page=0&size=20" > /dev/null

# After fix: same request should be significantly faster
# Expected reduction: from ~2-3 seconds (20 × 100ms queries) to ~200ms (1 query)
```

---

## Acceptance Criteria

- [ ] `getControlsWithLastEvaluation()` fires exactly 1 OpenSearch query regardless of control count
- [ ] Results are cached for 60 seconds (reduce repeat loads)
- [ ] Empty control list returns empty result without any query
- [ ] Compliance controls page load time reduces from >2s to <500ms
- [ ] Unit test `ComplianceEvaluationBatchTest` passes
- [ ] `./mvnw compile` succeeds
