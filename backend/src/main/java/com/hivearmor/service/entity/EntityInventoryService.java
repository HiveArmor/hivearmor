package com.hivearmor.service.entity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.Aggregate;
import org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for querying the entity inventory from OpenSearch (v3-hive-entity-*).
 * Provides multi-dimensional filtering, sorting, and cursor-based pagination (ENT-001).
 */
@Service
public class EntityInventoryService {

    private static final Logger log = LoggerFactory.getLogger(EntityInventoryService.class);
    private static final String CLASSNAME = "EntityInventoryService";

    /** Maximum page size — hard cap at 100. */
    private static final int MAX_LIMIT = 100;

    /** Default page size. */
    private static final int DEFAULT_LIMIT = 25;

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final EntityPivotService pivotService;

    public EntityInventoryService(OpensearchClientBuilder osClient, ObjectMapper objectMapper,
                                  EntityPivotService pivotService) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.pivotService = pivotService;
    }

    /**
     * Lists entities with multi-dimensional filtering, sorting, and cursor-based pagination.
     *
     * @param types              comma-separated entity types (host, user, ip, domain)
     * @param riskLevels         comma-separated risk levels (critical, high, medium, low)
     * @param criticality        comma-separated criticality values
     * @param sort               sort key: risk_desc, risk_asc, last_seen_desc, alert_count_desc, name_asc
     * @param cursor             Base64-encoded search_after cursor (null for first page)
     * @param limit              page size (max 100)
     * @param q                  free-text search on value and displayName
     * @param alertsActive       if true, only entities with alertCount > 0
     * @param trendRising        if true, only entities with riskTrend = "rising"
     * @param tenantIndexPattern tenant-scoped index pattern (e.g. v3-hive-entity-*)
     * @return map containing items, cursor, total
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> listEntities(List<String> types, List<String> riskLevels,
                                            List<String> criticality, String sort,
                                            String cursor, Integer limit, String q,
                                            Boolean alertsActive, Boolean trendRising,
                                            String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".listEntities";

        int effectiveLimit = resolveLimit(limit);

        // Build bool query with all filter clauses
        Query query = buildFilterQuery(types, riskLevels, criticality, q, alertsActive, trendRising);

        // Build sort options
        List<SortOptions> sortOptions = buildSortOptions(sort);

        // Build search request
        SearchRequest.Builder searchBuilder = new SearchRequest.Builder()
            .index(tenantIndexPattern)
            .query(query)
            .size(effectiveLimit)
            .sort(sortOptions)
            .trackTotalHits(t -> t.enabled(true));

        // Apply cursor (search_after) if present
        if (cursor != null && !cursor.isBlank()) {
            List<String> searchAfterValues = decodeCursor(cursor);
            if (searchAfterValues != null && !searchAfterValues.isEmpty()) {
                searchBuilder.searchAfter(searchAfterValues);
            }
        }

        SearchRequest request = searchBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Extract total
        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        // Map hits to EntitySummary objects
        List<Map<String, Object>> items = new ArrayList<>();
        String nextCursor = null;

        if (response.hits() != null && response.hits().hits() != null) {
            List<Hit<Map>> hits = response.hits().hits();
            for (int i = 0; i < hits.size(); i++) {
                Hit<Map> hit = hits.get(i);
                Map<String, Object> item = mapHitToEntitySummary(hit);
                items.add(item);

                // Capture sort values from last hit for next cursor
                if (i == hits.size() - 1 && hit.sort() != null && !hit.sort().isEmpty()) {
                    nextCursor = encodeCursor(hit.sort());
                }
            }
        }

        // Only return cursor if there might be more results
        if (items.size() < effectiveLimit) {
            nextCursor = null;
        }

        // Build response envelope
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("cursor", nextCursor);
        result.put("total", total);

        return result;
    }

    // =========================================================================
    // ENT-002: Summary and Facets
    // =========================================================================

    /**
     * Returns summary statistics and facet aggregations for the entity inventory (ENT-002).
     *
     * <p>Runs a size:0 aggregation-only query with the same filters as the listing endpoint.
     * Summary counters: total, highRisk, rising, activeAlerts, newEntities24h.
     * Facets: byType, byRiskLevel, byCriticality, byObservationSource.
     *
     * @param types              entity type filter
     * @param riskLevels         risk level filter
     * @param criticality        criticality filter
     * @param q                  free-text search
     * @param alertsActive       only entities with active alerts
     * @param trendRising        only entities with rising trend
     * @param tenantIndexPattern tenant-scoped index pattern
     * @return map containing summary and facets
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> getSummaryAndFacets(List<String> types, List<String> riskLevels,
                                                   List<String> criticality, String q,
                                                   Boolean alertsActive, Boolean trendRising,
                                                   String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getSummaryAndFacets";

        // Build the same filter query as listing — facets reflect narrowed state
        Query query = buildFilterQuery(types, riskLevels, criticality, q, alertsActive, trendRising);

        // Build aggregation-only search (size: 0)
        SearchRequest request = SearchRequest.of(r -> r
            .index(tenantIndexPattern)
            .query(query)
            .size(0)
            .trackTotalHits(t -> t.enabled(true))
            // Summary aggregations
            .aggregations("total", a -> a.valueCount(vc -> vc.field("_id")))
            .aggregations("highRisk", a -> a.filter(f -> f.terms(t ->
                t.field("riskLevel.keyword").terms(tv -> tv.value(
                    List.of(FieldValue.of("critical"), FieldValue.of("high"))
                ))
            )))
            .aggregations("rising", a -> a.filter(f -> f.term(t ->
                t.field("riskTrend.keyword").value(v -> v.stringValue("rising"))
            )))
            .aggregations("activeAlerts", a -> a.filter(f -> f.range(rq ->
                rq.field("alertCount").gt(JsonData.of(0))
            )))
            .aggregations("newEntities24h", a -> a.filter(f -> f.range(rq ->
                rq.field("firstSeen").gte(JsonData.of("now-24h/h"))
            )))
            // Facet aggregations — use .keyword sub-field for text-mapped fields
            .aggregations("byType", a -> a.terms(t -> t.field("type.keyword").size(4)))
            .aggregations("byRiskLevel", a -> a.terms(t -> t.field("riskLevel.keyword").size(4)))
            .aggregations("byCriticality", a -> a.terms(t -> t.field("criticality.keyword").size(5)))
            .aggregations("byObservationSource", a -> a.terms(t -> t.field("observationSources.keyword").size(4)))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Extract total from hits (more reliable than value_count for doc count)
        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        // Extract summary counters
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", total);
        summary.put("highRisk", extractFilterCount(response, "highRisk"));
        summary.put("rising", extractFilterCount(response, "rising"));
        summary.put("activeAlerts", extractFilterCount(response, "activeAlerts"));
        summary.put("newEntities24h", extractFilterCount(response, "newEntities24h"));

        // Extract facet aggregations
        Map<String, Object> facets = new LinkedHashMap<>();
        facets.put("byType", extractTermsFacet(response, "byType"));
        facets.put("byRiskLevel", extractTermsFacet(response, "byRiskLevel"));
        facets.put("byCriticality", extractTermsFacet(response, "byCriticality"));
        facets.put("byObservationSource", extractTermsFacet(response, "byObservationSource"));

        // Build response envelope
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("facets", facets);

        return result;
    }

    // =========================================================================
    // Aggregation helpers
    // =========================================================================

    /**
     * Extracts the doc_count from a filter aggregation result.
     */
    @SuppressWarnings("rawtypes")
    private long extractFilterCount(SearchResponse<Map> response, String aggName) {
        Aggregate agg = response.aggregations().get(aggName);
        if (agg != null && agg.isFilter()) {
            return agg.filter().docCount();
        }
        return 0;
    }

    /**
     * Extracts a terms aggregation into a key→count map.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Long> extractTermsFacet(SearchResponse<Map> response, String aggName) {
        Map<String, Long> facet = new LinkedHashMap<>();
        Aggregate agg = response.aggregations().get(aggName);
        if (agg != null && agg.isSterms()) {
            List<StringTermsBucket> buckets = agg.sterms().buckets().array();
            for (StringTermsBucket bucket : buckets) {
                facet.put(bucket.key(), bucket.docCount());
            }
        }
        return facet;
    }

    // =========================================================================
    // Query building
    // =========================================================================

    /**
     * Builds the OpenSearch bool query with all filter clauses combined via AND logic.
     * Package-private to allow reuse by other methods (e.g., getSummaryAndFacets).
     */
    Query buildFilterQuery(List<String> types, List<String> riskLevels,
                           List<String> criticality, String q,
                           Boolean alertsActive, Boolean trendRising) {
        List<Query> filterClauses = new ArrayList<>();
        List<Query> mustClauses = new ArrayList<>();

        // Type filter: terms query on "type.keyword" field
        if (types != null && !types.isEmpty()) {
            List<FieldValue> typeValues = types.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(qb -> qb.terms(t ->
                t.field("type.keyword").terms(tv -> tv.value(typeValues)))));
        }

        // Risk level filter: terms query on "riskLevel.keyword" field
        if (riskLevels != null && !riskLevels.isEmpty()) {
            List<FieldValue> riskValues = riskLevels.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(qb -> qb.terms(t ->
                t.field("riskLevel.keyword").terms(tv -> tv.value(riskValues)))));
        }

        // Criticality filter: terms query on "criticality.keyword" field
        if (criticality != null && !criticality.isEmpty()) {
            List<FieldValue> critValues = criticality.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(qb -> qb.terms(t ->
                t.field("criticality.keyword").terms(tv -> tv.value(critValues)))));
        }

        // Free-text search (q): multi_match on "value" and "displayName" fields
        if (q != null && !q.isBlank()) {
            String searchText = q.trim();
            mustClauses.add(Query.of(qb -> qb.multiMatch(m ->
                m.query(searchText)
                 .fields("value", "displayName")
                 .type(TextQueryType.BestFields))));
        }

        // Active alerts filter: range query alertCount > 0
        if (Boolean.TRUE.equals(alertsActive)) {
            filterClauses.add(Query.of(qb -> qb.range(r ->
                r.field("alertCount").gt(org.opensearch.client.json.JsonData.of(0)))));
        }

        // Rising trend filter: term query riskTrend.keyword = "rising"
        if (Boolean.TRUE.equals(trendRising)) {
            filterClauses.add(Query.of(qb -> qb.term(t ->
                t.field("riskTrend.keyword").value(v -> v.stringValue("rising")))));
        }

        if (filterClauses.isEmpty() && mustClauses.isEmpty()) {
            return Query.of(qb -> qb.matchAll(m -> m));
        }

        return Query.of(qb -> qb.bool(b -> {
            if (!filterClauses.isEmpty()) {
                b.filter(filterClauses);
            }
            if (!mustClauses.isEmpty()) {
                b.must(mustClauses);
            }
            return b;
        }));
    }

    // =========================================================================
    // Sort building
    // =========================================================================

    /**
     * Builds sort options based on the sort parameter.
     * Available sorts:
     *   risk_desc   → riskScore DESC, _id ASC
     *   risk_asc    → riskScore ASC, _id ASC
     *   last_seen_desc → lastSeen DESC, _id ASC
     *   alert_count_desc → alertCount DESC, _id ASC
     *   name_asc    → value.keyword ASC, _id ASC
     */
    private List<SortOptions> buildSortOptions(String sort) {
        List<SortOptions> options = new ArrayList<>();

        if (sort == null || sort.isBlank()) {
            sort = "risk_desc";
        }

        switch (sort) {
            case "risk_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("riskScore").order(SortOrder.Desc))));
                break;
            case "risk_asc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("riskScore").order(SortOrder.Asc))));
                break;
            case "last_seen_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("lastSeen").order(SortOrder.Desc))));
                break;
            case "alert_count_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("alertCount").order(SortOrder.Desc))));
                break;
            case "name_asc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("value.keyword").order(SortOrder.Asc))));
                break;
            default:
                // Fallback to risk_desc
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("riskScore").order(SortOrder.Desc))));
                break;
        }

        // Always append _id as stable tie-breaker
        options.add(SortOptions.of(s -> s.field(f ->
            f.field("_id").order(SortOrder.Asc))));

        return options;
    }

    // =========================================================================
    // Hit mapping
    // =========================================================================

    /**
     * Maps an OpenSearch hit to an EntitySummary response object.
     * Generates pivot descriptors for each entity via EntityPivotService (ENT-004).
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> mapHitToEntitySummary(Hit<Map> hit) {
        Map<String, Object> src = hit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) hit.source())
            : new LinkedHashMap<>();

        // Use document _id as the entity ID if not in source
        if (!src.containsKey("id") || src.get("id") == null) {
            src.put("id", hit.id());
        }

        String entityId = src.get("id") != null ? src.get("id").toString() : hit.id();
        String entityType = src.get("type") != null ? src.get("type").toString() : "";
        String entityValue = src.get("value") != null ? src.get("value").toString() : "";

        // Generate pivot descriptors
        List<Map<String, Object>> pivots;
        try {
            pivots = pivotService.generatePivots(entityId, entityType, entityValue);
        } catch (Exception e) {
            log.warn("{}: failed to generate pivots for entity {}: {}",
                CLASSNAME, entityId, e.getMessage());
            pivots = List.of();
        }

        // Build EntitySummary with expected fields
        Map<String, Object> entity = new LinkedHashMap<>();
        entity.put("id", entityId);
        entity.put("type", src.get("type"));
        entity.put("value", src.get("value"));
        entity.put("displayName", src.get("displayName"));
        entity.put("riskScore", src.get("riskScore"));
        entity.put("riskLevel", src.get("riskLevel"));
        entity.put("riskTrend", src.get("riskTrend"));
        entity.put("criticality", src.get("criticality"));
        entity.put("alertCount", src.get("alertCount"));
        entity.put("lastSeen", src.get("lastSeen"));
        entity.put("firstSeen", src.get("firstSeen"));
        entity.put("baselineDeviation", src.get("baselineDeviation"));
        entity.put("tags", src.getOrDefault("tags", List.of()));
        entity.put("observationSources", src.getOrDefault("observationSources", List.of()));
        entity.put("pivots", pivots);

        return entity;
    }

    // =========================================================================
    // Cursor encode / decode
    // =========================================================================

    /**
     * Encodes search_after sort values into a Base64 URL-safe JSON cursor.
     */
    private String encodeCursor(List<String> sortValues) {
        if (sortValues == null || sortValues.isEmpty()) return null;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sa", sortValues);
            String json = objectMapper.writeValueAsString(payload);
            return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(json.getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            log.warn("{}: failed to encode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    /**
     * Decodes a Base64 URL-safe JSON cursor back to search_after values.
     */
    private List<String> decodeCursor(String cursor) {
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(cursor);
            String json = new String(decoded, StandardCharsets.UTF_8);
            Map<String, Object> map = objectMapper.readValue(json, new TypeReference<>() {});

            Object saObj = map.get("sa");
            if (saObj instanceof List<?> saList) {
                List<String> values = new ArrayList<>();
                for (Object item : saList) {
                    values.add(item != null ? item.toString() : "");
                }
                return values;
            }
            return null;
        } catch (Exception e) {
            log.warn("{}: failed to decode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // =========================================================================
    // Limit resolution
    // =========================================================================

    /**
     * Resolves the effective limit, capping at MAX_LIMIT (100).
     */
    private int resolveLimit(Integer limit) {
        if (limit == null || limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }
}
