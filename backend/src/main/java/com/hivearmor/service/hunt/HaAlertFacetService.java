package com.hivearmor.service.hunt;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service responsible for computing alert queue summary counters and filter facets.
 *
 * <p>Runs OpenSearch aggregations scoped to the current tenant via {@link MsspIndexResolver}.
 * Facets that exceed 200ms computation time are marked as {@code availability: "deferred"}
 * rather than delaying the response.
 *
 * <p>Satisfies: Sprint 36 Task 3 — S36-T02 (Requirement 2: ALT-015)
 */
@Service
public class HaAlertFacetService {

    private static final Logger log = LoggerFactory.getLogger(HaAlertFacetService.class);

    /** Maximum time (ms) a facet aggregation may take before being marked deferred. */
    private static final long FACET_TIMEOUT_MS = 200;

    private static final int FACET_BUCKET_SIZE = 50;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final HaAlertQueryService alertQueryService;

    // =========================================================================
    // Status code → symbolic name mapping (reverse of HaAlertQueryService)
    // =========================================================================

    private static final Map<Integer, String> STATUS_LABEL_MAP;
    static {
        Map<Integer, String> m = new LinkedHashMap<>();
        m.put(1, "automatic_review");
        m.put(2, "open");
        m.put(3, "in_review");
        m.put(4, "ignored");
        m.put(5, "completed");
        m.put(6, "true_positive");
        m.put(7, "false_positive");
        STATUS_LABEL_MAP = Collections.unmodifiableMap(m);
    }

    // =========================================================================
    // Constructor (injection)
    // =========================================================================

    public HaAlertFacetService(OpensearchClientBuilder osClient,
                               MsspIndexResolver indexResolver,
                               HaAlertQueryService alertQueryService) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.alertQueryService = alertQueryService;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Computes the full alert queue summary including priority counters and facets.
     *
     * @param severity    severity filter (comma-separated levels)
     * @param status      status filter (symbolic name)
     * @param from        time range start (ISO timestamp)
     * @param to          time range end (ISO timestamp)
     * @param category    category filter
     * @param assignee    assignee filter
     * @param tags        tags filter (comma-separated)
     * @param riskMin     minimum risk score
     * @param sla         SLA filter (at_risk, breached)
     * @param threatIntel threat intel filter (matched)
     * @param q           KQL-like free text query
     * @return map containing summary counters, statusCounts, and facets array
     */
    @SuppressWarnings("rawtypes")
    public Map<String, Object> computeSummary(String severity, String status, String from,
                                              String to, String category, String assignee,
                                              String tags, String riskMin, String sla,
                                              String threatIntel, String q) throws Exception {

        String indexPattern = indexResolver.resolveAlertIndexPattern();

        // Build the base filter query (same as queue endpoint)
        List<Query> filters = alertQueryService.buildFilters(
            severity, status, from, to, category, assignee, tags,
            riskMin, sla, threatIntel, null);

        // Parse q parameter
        Query parsedQuery = alertQueryService.parseQueryParam(q);

        Query baseQuery = Query.of(qb -> qb.bool(b -> {
            b.must(List.of(parsedQuery));
            if (!filters.isEmpty()) b.filter(filters);
            return b;
        }));

        // Run main summary aggregations (counters + statusCounts)
        Map<String, Object> result = computeCounters(indexPattern, baseQuery);

        // Run facets with timeout tracking
        List<Map<String, Object>> facets = computeFacets(indexPattern, baseQuery,
            severity, status, category, assignee);
        result.put("facets", facets);

        result.put("snapshotAt", Instant.now().toString());
        return result;
    }

    // =========================================================================
    // Counter Aggregations
    // =========================================================================

    @SuppressWarnings("rawtypes")
    private Map<String, Object> computeCounters(String indexPattern, Query baseQuery) throws Exception {
        Instant now = Instant.now();
        String nowStr = now.toString();
        String oneHourLater = now.plus(1, ChronoUnit.HOURS).toString();

        // Build a single search with multiple sub-aggregations via filters agg
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(baseQuery)
            .size(0)
            .trackTotalHits(t -> t.enabled(true))
            .aggregations("criticalOpen", a -> a.filter(f -> f.bool(b -> b
                .must(Query.of(mq -> mq.range(RangeQuery.of(rq -> rq.field("severity").gte(JsonData.of(9))))))
                .filter(statusQuery(2))
            )))
            .aggregations("highOpen", a -> a.filter(f -> f.bool(b -> b
                .must(Query.of(mq -> mq.range(RangeQuery.of(rq -> rq.field("severity").gte(JsonData.of(7)).lt(JsonData.of(9))))))
                .filter(statusQuery(2))
            )))
            .aggregations("slaAtRisk", a -> a.filter(f -> f.bool(b -> b
                .must(Query.of(q -> q.range(RangeQuery.of(rq ->
                    rq.field("slaDueAt").gte(JsonData.of(nowStr)).lte(JsonData.of(oneHourLater))))))
                .filter(activeAnalystStatusesQuery())
            )))
            .aggregations("slaBreached", a -> a.filter(f -> f.bool(b -> b
                .must(Query.of(q -> q.range(RangeQuery.of(rq ->
                    rq.field("slaDueAt").lt(JsonData.of(nowStr))))))
                .filter(activeAnalystStatusesQuery())
            )))
            .aggregations("unassigned", a -> a.filter(f -> f.bool(b -> b
                .filter(activeAnalystStatusesQuery())
                .mustNot(Query.of(mn -> mn.exists(e -> e.field("assigneeId"))))
            )))
            .aggregations("threatIntelMatched", a -> a.filter(f -> f.bool(b -> b
                .must(Query.of(q -> q.term(t -> t
                    .field("threatIntelMatched").value(v -> v.booleanValue(true)))))
                .filter(activeAnalystStatusesQuery())
            )))
            // Filter aggregations work across numeric and legacy text mappings. A terms
            // aggregation on status causes partial-shard responses when old indices map
            // the field as text, which previously made summary totals disagree with rows.
            .aggregations("status1", a -> a.filter(statusQuery(1)))
            .aggregations("status2", a -> a.filter(statusQuery(2)))
            .aggregations("status3", a -> a.filter(statusQuery(3)))
            .aggregations("status4", a -> a.filter(statusQuery(4)))
            .aggregations("status5", a -> a.filter(statusQuery(5)))
            .aggregations("status6", a -> a.filter(statusQuery(6)))
            .aggregations("status7", a -> a.filter(statusQuery(7)))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        long totalApproximate = response.hits().total() != null ? response.hits().total().value() : 0;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalApproximate", totalApproximate);
        result.put("criticalOpen", extractFilterAggCount(response, "criticalOpen"));
        result.put("highOpen", extractFilterAggCount(response, "highOpen"));
        result.put("slaAtRisk", extractFilterAggCount(response, "slaAtRisk"));
        result.put("slaBreached", extractFilterAggCount(response, "slaBreached"));
        result.put("unassigned", extractFilterAggCount(response, "unassigned"));
        result.put("threatIntelMatched", extractFilterAggCount(response, "threatIntelMatched"));
        result.put("statusCounts", extractStatusCounts(response));

        return result;
    }

    // =========================================================================
    // Facet Aggregations
    // =========================================================================

    /**
     * Computes facets for severity, status, category, and assignee.
     * Tracks aggregation time and marks slow facets as deferred.
     */
    @SuppressWarnings("rawtypes")
    private List<Map<String, Object>> computeFacets(String indexPattern, Query baseQuery,
                                                    String activeSeverity, String activeStatus,
                                                    String activeCategory, String activeAssignee) {
        List<Map<String, Object>> facets = new ArrayList<>();

        // Numeric filter aggregations remain valid when older rollover indices map
        // these fields differently. Terms aggregations otherwise fail individual
        // shards and silently remove valid alert values from the filter experience.
        facets.add(computeSeverityFacet(indexPattern, baseQuery, activeSeverity));
        facets.add(computeStatusFacet(indexPattern, baseQuery, activeStatus));

        // Category facet
        facets.add(computeSingleFacet(indexPattern, baseQuery, "category", "category.keyword",
            activeCategory, this::mapDirectBuckets));

        // Assignee facet
        facets.add(computeSingleFacet(indexPattern, baseQuery, "assignee", "assigneeName.keyword",
            activeAssignee, this::mapDirectBuckets));

        return facets;
    }

    @SuppressWarnings("rawtypes")
    private Map<String, Object> computeSeverityFacet(String indexPattern, Query baseQuery,
                                                     String activeFilter) {
        LinkedHashMap<String, Query> filters = new LinkedHashMap<>();
        filters.put("critical", Query.of(q -> q.range(r -> r.field("severity").gte(JsonData.of(9)))));
        filters.put("high", Query.of(q -> q.range(r -> r.field("severity").gte(JsonData.of(7)).lt(JsonData.of(9)))));
        filters.put("medium", Query.of(q -> q.range(r -> r.field("severity").gte(JsonData.of(4)).lt(JsonData.of(7)))));
        filters.put("low", Query.of(q -> q.range(r -> r.field("severity").lt(JsonData.of(4)))));
        return computeFilterFacet(indexPattern, baseQuery, "severity", filters, activeFilter);
    }

    private Map<String, Object> computeStatusFacet(String indexPattern, Query baseQuery,
                                                   String activeFilter) {
        LinkedHashMap<String, Query> filters = new LinkedHashMap<>();
        STATUS_LABEL_MAP.forEach((code, label) -> filters.put(label, statusQuery(code)));
        return computeFilterFacet(indexPattern, baseQuery, "status", filters, activeFilter);
    }

    @SuppressWarnings("rawtypes")
    private Map<String, Object> computeFilterFacet(String indexPattern, Query baseQuery,
                                                   String facetName,
                                                   LinkedHashMap<String, Query> filters,
                                                   String activeFilter) {
        Map<String, Object> facet = new LinkedHashMap<>();
        facet.put("field", facetName);
        long startTime = System.currentTimeMillis();

        try {
            SearchRequest.Builder request = new SearchRequest.Builder()
                .index(indexPattern)
                .query(baseQuery)
                .size(0);
            filters.forEach((name, query) -> request.aggregations(name, a -> a.filter(query)));

            SearchResponse<Map> response = osClient.execute(os -> os.search(request.build(), Map.class));
            long elapsed = System.currentTimeMillis() - startTime;
            if (elapsed > FACET_TIMEOUT_MS) {
                facet.put("availability", "deferred");
                facet.put("entries", Collections.emptyList());
                log.info("Facet '{}' marked as deferred — took {}ms (threshold: {}ms)",
                    facetName, elapsed, FACET_TIMEOUT_MS);
                return facet;
            }

            Set<String> selected = parseActiveValues(activeFilter);
            List<Map<String, Object>> entries = new ArrayList<>();
            filters.keySet().forEach(value -> {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("value", value);
                entry.put("displayLabel", value.replace('_', ' '));
                entry.put("count", extractFilterAggCount(response, value));
                entry.put("selected", selected.contains(value));
                entries.add(entry);
            });
            facet.put("availability", "immediate");
            facet.put("entries", entries);
        } catch (Exception e) {
            log.error("Failed to compute facet '{}': {}", facetName, e.getMessage());
            facet.put("availability", "deferred");
            facet.put("entries", Collections.emptyList());
        }
        return facet;
    }

    @FunctionalInterface
    private interface BucketMapper {
        List<Map<String, Object>> map(List<StringTermsBucket> buckets, String activeFilter);
    }

    @SuppressWarnings("rawtypes")
    private Map<String, Object> computeSingleFacet(String indexPattern, Query baseQuery,
                                                   String facetName, String fieldName,
                                                   String activeFilter, BucketMapper mapper) {
        Map<String, Object> facet = new LinkedHashMap<>();
        facet.put("field", facetName);

        long startTime = System.currentTimeMillis();

        try {
            SearchRequest request = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(baseQuery)
                .size(0)
                .aggregations("facet", a -> a.terms(t -> t
                    .field(fieldName)
                    .size(FACET_BUCKET_SIZE)
                ))
            );

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
            long elapsed = System.currentTimeMillis() - startTime;

            if (elapsed > FACET_TIMEOUT_MS) {
                facet.put("availability", "deferred");
                facet.put("entries", Collections.emptyList());
                log.info("Facet '{}' marked as deferred — took {}ms (threshold: {}ms)",
                    facetName, elapsed, FACET_TIMEOUT_MS);
            } else {
                Aggregate agg = response.aggregations().get("facet");
                List<StringTermsBucket> buckets = agg.sterms().buckets().array();
                List<Map<String, Object>> entries = mapper.map(buckets, activeFilter);
                facet.put("availability", "immediate");
                facet.put("entries", entries);
            }
        } catch (Exception e) {
            log.error("Failed to compute facet '{}': {}", facetName, e.getMessage());
            facet.put("availability", "deferred");
            facet.put("entries", Collections.emptyList());
        }

        return facet;
    }

    // =========================================================================
    // Bucket Mappers
    // =========================================================================

    /**
     * Maps severity buckets: numeric severity values to human labels.
     */
    private List<Map<String, Object>> mapSeverityBuckets(List<StringTermsBucket> buckets,
                                                         String activeFilter) {
        Set<String> activeValues = parseActiveValues(activeFilter);
        List<Map<String, Object>> entries = new ArrayList<>();

        for (StringTermsBucket bucket : buckets) {
            String value = bucket.key();
            String displayLabel = mapSeverityLabel(value);
            long count = bucket.docCount();
            boolean selected = isSelected(value, displayLabel, activeValues);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", value);
            entry.put("displayLabel", displayLabel);
            entry.put("count", count);
            entry.put("selected", selected);
            entries.add(entry);
        }
        return entries;
    }

    /**
     * Maps status buckets: numeric status codes to symbolic names.
     */
    private List<Map<String, Object>> mapStatusBuckets(List<StringTermsBucket> buckets,
                                                       String activeFilter) {
        Set<String> activeValues = parseActiveValues(activeFilter);
        List<Map<String, Object>> entries = new ArrayList<>();

        for (StringTermsBucket bucket : buckets) {
            String value = bucket.key();
            String displayLabel = mapStatusLabel(value);
            long count = bucket.docCount();
            boolean selected = isSelected(value, displayLabel, activeValues);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", value);
            entry.put("displayLabel", displayLabel);
            entry.put("count", count);
            entry.put("selected", selected);
            entries.add(entry);
        }
        return entries;
    }

    /**
     * Maps generic string buckets (category, assignee) — value and displayLabel are the same.
     */
    private List<Map<String, Object>> mapDirectBuckets(List<StringTermsBucket> buckets,
                                                       String activeFilter) {
        Set<String> activeValues = parseActiveValues(activeFilter);
        List<Map<String, Object>> entries = new ArrayList<>();

        for (StringTermsBucket bucket : buckets) {
            String value = bucket.key();
            long count = bucket.docCount();
            boolean selected = activeValues.contains(value.toLowerCase());

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("value", value);
            entry.put("displayLabel", value);
            entry.put("count", count);
            entry.put("selected", selected);
            entries.add(entry);
        }
        return entries;
    }

    // =========================================================================
    // Aggregation result extraction
    // =========================================================================

    @SuppressWarnings("rawtypes")
    private long extractFilterAggCount(SearchResponse<Map> response, String aggName) {
        Aggregate agg = response.aggregations().get(aggName);
        if (agg != null && agg.isFilter()) {
            return agg.filter().docCount();
        }
        return 0;
    }

    @SuppressWarnings("rawtypes")
    private Map<String, Long> extractStatusCounts(SearchResponse<Map> response) {
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (Map.Entry<Integer, String> entry : STATUS_LABEL_MAP.entrySet()) {
            Aggregate aggregate = response.aggregations().get("status" + entry.getKey());
            statusCounts.put(entry.getValue(), aggregate != null && aggregate.isFilter()
                ? aggregate.filter().docCount()
                : 0L);
        }
        return statusCounts;
    }

    private Query statusQuery(int status) {
        return Query.of(q -> q.term(t -> t.field("status").value(v -> v.longValue(status))));
    }

    private Query activeAnalystStatusesQuery() {
        return Query.of(q -> q.bool(b -> b
            .should(statusQuery(2))
            .should(statusQuery(3))
            .minimumShouldMatch("1")));
    }

    // =========================================================================
    // Label Mappers
    // =========================================================================

    private String mapSeverityLabel(String value) {
        try {
            int numVal = Integer.parseInt(value);
            if (numVal >= 9) return "Critical";
            if (numVal >= 7) return "High";
            if (numVal >= 4) return "Medium";
            if (numVal >= 1) return "Low";
            return "Info";
        } catch (NumberFormatException e) {
            // If the value is already a label string, return as-is
            return capitalize(value);
        }
    }

    private String mapStatusLabel(String value) {
        try {
            int code = Integer.parseInt(value);
            String label = STATUS_LABEL_MAP.get(code);
            return label != null ? label : "status_" + code;
        } catch (NumberFormatException e) {
            // Already a symbolic name
            return value;
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Set<String> parseActiveValues(String filter) {
        if (filter == null || filter.isBlank()) return Collections.emptySet();
        Set<String> values = new LinkedHashSet<>();
        for (String part : filter.split(",")) {
            String trimmed = part.trim().toLowerCase();
            if (!trimmed.isEmpty()) values.add(trimmed);
        }
        return values;
    }

    private boolean isSelected(String value, String displayLabel, Set<String> activeValues) {
        if (activeValues.isEmpty()) return false;
        return activeValues.contains(value.toLowerCase()) ||
               activeValues.contains(displayLabel.toLowerCase());
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1).toLowerCase();
    }
}
