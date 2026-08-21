package com.hivearmor.service.correlation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.*;
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
 * Service for querying correlated findings from OpenSearch (v3-hive-correlation-*).
 * Provides queue listing with preview projection, summary aggregations,
 * and cursor-based pagination via search_after.
 */
@Service
public class CorrelatedFindingService {

    private static final Logger log = LoggerFactory.getLogger(CorrelatedFindingService.class);
    private static final String CLASSNAME = "CorrelatedFindingService";

    /** Preview projection fields — lightweight list view (no full narrative/entities). */
    private static final List<String> PREVIEW_FIELDS = List.of(
        "id", "title", "severity", "status", "createdAt", "updatedAt",
        "attackStageCount", "signalCount", "entityCount", "leadEntity",
        "mitreTactics", "mitreTechniques", "correlationReasons", "assignee",
        "findingId", "description", "confidence", "riskScore", "alerts",
        "entities", "timeline", "firstSeen", "lastSeen", "@timestamp"
    );

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;

    public CorrelatedFindingService(OpensearchClientBuilder osClient, ObjectMapper objectMapper) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
    }

    /**
     * Lists correlated findings with preview projection, filters, sort, pagination, and summary.
     *
     * @param view              "queue" for preview projection, "full" for complete documents
     * @param sort              sort key: severity_desc, created_desc, updated_desc, stage_count_desc
     * @param cursor            Base64-encoded search_after cursor (null for first page)
     * @param limit             page size (default 25, max 100)
     * @param filters           filter parameters
     * @param indexPattern      tenant-scoped index pattern (e.g. v3-hive-correlation-*)
     * @return map containing items, cursor, total, and summary
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> listFindings(String view, String sort, String cursor,
                                            int limit, FindingFilters filters,
                                            String indexPattern) throws Exception {
        final String ctx = CLASSNAME + ".listFindings";

        // Build query with filters
        Query query = buildFilterQuery(filters);

        // Build sort options
        List<SortOptions> sortOptions = buildSortOptions(sort);

        // Build search request
        SearchRequest.Builder searchBuilder = new SearchRequest.Builder()
            .index(indexPattern)
            .query(query)
            .size(limit)
            .sort(sortOptions)
            .trackTotalHits(t -> t.enabled(true));

        // Apply source filtering for preview projection
        if ("queue".equals(view) || view == null) {
            searchBuilder.source(s -> s.filter(f -> f.includes(PREVIEW_FIELDS)));
        }

        // Apply cursor (search_after) if present
        if (cursor != null && !cursor.isBlank()) {
            List<String> searchAfterValues = decodeCursor(cursor);
            if (searchAfterValues != null && !searchAfterValues.isEmpty()) {
                searchBuilder.searchAfter(searchAfterValues);
            }
        }

        // Add aggregations for summary stats
        searchBuilder.aggregations("by_severity", a -> a.terms(t ->
            t.field("severity").size(4)));
        searchBuilder.aggregations("by_status", a -> a.terms(t ->
            t.field("status").size(4)));
        searchBuilder.aggregations("avg_signals", a -> a.avg(av ->
            av.field("signalCount")));

        SearchRequest request = searchBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Extract total
        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        // Map hits to preview projections
        List<Map<String, Object>> items = new ArrayList<>();
        String nextCursor = null;

        if (response.hits() != null && response.hits().hits() != null) {
            List<Hit<Map>> hits = response.hits().hits();
            for (int i = 0; i < hits.size(); i++) {
                Hit<Map> hit = hits.get(i);
                Map<String, Object> item = mapHitToPreview(hit);
                items.add(item);

                // Capture sort values from last hit for next cursor
                if (i == hits.size() - 1 && hit.sort() != null && !hit.sort().isEmpty()) {
                    nextCursor = encodeCursor(hit.sort());
                }
            }
        }

        // Only return cursor if there might be more results
        if (items.size() < limit) {
            nextCursor = null;
        }

        // Build summary from aggregations
        Map<String, Object> summary = buildSummary(response.aggregations(), total);

        // Build response envelope
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("cursor", nextCursor);
        result.put("total", total);
        result.put("summary", summary);

        return result;
    }

    // =========================================================================
    // Single finding detail (COR-002)
    // =========================================================================

    /**
     * Fetches the complete finding document by ID from v3-hive-correlation-*.
     *
     * <p>Returns the full document including narrative, stages, entities, and
     * relationship graph. Builds the relationship graph from entities and
     * determines available actions based on the finding's current status.
     *
     * @param findingId    the finding document ID
     * @param indexPattern tenant-scoped index pattern
     * @return Optional containing the finding map if found, empty otherwise
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Optional<Map<String, Object>> getFinding(String findingId, String indexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getFinding";

        // Search by the "id" field within the document
        Query query = Query.of(q -> q.bool(b -> b
            .should(s -> s.term(t -> t.field("id").value(v -> v.stringValue(findingId))))
            .should(s -> s.term(t -> t.field("findingId").value(v -> v.stringValue(findingId))))
            .should(s -> s.ids(i -> i.values(findingId)))
            .minimumShouldMatch("1")));

        SearchRequest request = new SearchRequest.Builder()
            .index(indexPattern)
            .query(query)
            .size(1)
            .build();

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() == null || response.hits().hits() == null || response.hits().hits().isEmpty()) {
            return Optional.empty();
        }

        Hit<Map> hit = response.hits().hits().get(0);
        Map<String, Object> finding = hit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) hit.source())
            : new LinkedHashMap<>();

        // Ensure ID is present
        if (!finding.containsKey("id") || finding.get("id") == null) {
            finding.put("id", finding.get("findingId") != null ? finding.get("findingId") : hit.id());
        }

        // Build relationship graph from entities
        Map<String, Object> graph = buildRelationshipGraph(finding);
        finding.put("relationshipGraph", graph);

        // Determine available actions based on current status
        List<Map<String, Object>> actions = determineAvailableActions(finding);
        finding.put("availableActions", actions);

        return Optional.of(finding);
    }

    /**
     * Builds the relationship graph from the entities and relationships fields.
     *
     * <p>Extracts nodes (entity ID, type, value, riskScore) and edges (from relationships array).
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildRelationshipGraph(Map<String, Object> finding) {
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        // Extract nodes from entities
        Object entitiesObj = finding.get("entities");
        if (entitiesObj instanceof List<?> entitiesList) {
            for (Object entity : entitiesList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Map<String, Object> node = new LinkedHashMap<>();
                    node.put("id", entityMap.get("id"));
                    node.put("type", entityMap.get("type"));
                    node.put("value", entityMap.get("value"));
                    node.put("riskScore", entityMap.get("riskScore"));
                    nodes.add(node);
                }
            }
        }

        // Extract edges from relationships array
        Object relationshipsObj = finding.get("relationships");
        if (relationshipsObj instanceof List<?> relList) {
            for (Object rel : relList) {
                if (rel instanceof Map<?, ?> relMap) {
                    Map<String, Object> edge = new LinkedHashMap<>();
                    edge.put("source", relMap.get("sourceEntity") != null ? relMap.get("sourceEntity") : relMap.get("source"));
                    edge.put("target", relMap.get("targetEntity") != null ? relMap.get("targetEntity") : relMap.get("target"));
                    edge.put("type", relMap.get("type"));
                    edge.put("evidence", relMap.get("evidence"));
                    edges.add(edge);
                }
            }
        }

        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("nodes", nodes);
        graph.put("edges", edges);
        return graph;
    }

    /**
     * Determines available actions based on the finding's current status.
     *
     * <p>Action logic:
     * <ul>
     *   <li>new → [review, assign, dismiss]</li>
     *   <li>reviewing → [confirm, dismiss, promote, assign]</li>
     *   <li>confirmed → [promote, reopen]</li>
     *   <li>dismissed → [reopen]</li>
     * </ul>
     */
    private List<Map<String, Object>> determineAvailableActions(Map<String, Object> finding) {
        String status = finding.get("status") != null ? finding.get("status").toString().toLowerCase(Locale.ROOT) : "new";
        List<Map<String, Object>> actions = new ArrayList<>();

        switch (status) {
            case "new":
                actions.add(actionDescriptor("review", "Start Review", "status_change"));
                actions.add(actionDescriptor("assign", "Assign", "assignment"));
                actions.add(actionDescriptor("dismiss", "Dismiss", "status_change"));
                break;
            case "reviewing":
                actions.add(actionDescriptor("confirm", "Confirm", "status_change"));
                actions.add(actionDescriptor("dismiss", "Dismiss", "status_change"));
                actions.add(actionDescriptor("promote", "Promote to Incident", "promotion"));
                actions.add(actionDescriptor("assign", "Assign", "assignment"));
                break;
            case "confirmed":
                actions.add(actionDescriptor("promote", "Promote to Incident", "promotion"));
                actions.add(actionDescriptor("reopen", "Reopen", "status_change"));
                break;
            case "dismissed":
                actions.add(actionDescriptor("reopen", "Reopen", "status_change"));
                break;
            default:
                break;
        }

        return actions;
    }

    private Map<String, Object> actionDescriptor(String id, String label, String type) {
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("id", id);
        action.put("label", label);
        action.put("type", type);
        action.put("enabled", true);
        action.put("requiredRole", "SOC_ANALYST");
        return action;
    }

    // =========================================================================
    // Query building
    // =========================================================================

    private Query buildFilterQuery(FindingFilters filters) {
        List<Query> filterClauses = new ArrayList<>();

        // Severity filter (terms query on severity — already keyword type)
        if (filters.severity != null && !filters.severity.isEmpty()) {
            List<FieldValue> severityValues = filters.severity.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(q -> q.terms(t ->
                t.field("severity").terms(tv -> tv.value(severityValues)))));
        }

        // Status filter (terms query on status — already keyword type)
        if (filters.status != null && !filters.status.isEmpty()) {
            List<FieldValue> statusValues = filters.status.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(q -> q.terms(t ->
                t.field("status").terms(tv -> tv.value(statusValues)))));
        }

        // Tactics filter (terms query on mitreTactics)
        if (filters.tactics != null && !filters.tactics.isEmpty()) {
            List<FieldValue> tacticValues = filters.tactics.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(q -> q.terms(t ->
                t.field("mitreTactics").terms(tv -> tv.value(tacticValues)))));
        }

        // Assignee filter (term query)
        if (filters.assignee != null && !filters.assignee.isBlank()) {
            String assignee = filters.assignee;
            filterClauses.add(Query.of(q -> q.term(t ->
                t.field("assignee").value(v -> v.stringValue(assignee)))));
        }

        // Correlation producers currently emit one of several canonical event-time
        // fields. Treat them as aliases so a valid live finding is not excluded
        // merely because its producer has not yet adopted createdAt.
        if (filters.from != null || filters.to != null) {
            List<Query> timeAliases = List.of("createdAt", "updatedAt", "firstSeen", "lastSeen", "@timestamp")
                .stream()
                .map(field -> Query.of(q -> q.range(r -> {
                    var rb = r.field(field);
                    if (filters.from != null) rb.gte(JsonData.of(filters.from));
                    if (filters.to != null) rb.lte(JsonData.of(filters.to));
                    return rb;
                })))
                .toList();
            filterClauses.add(Query.of(q -> q.bool(b -> b
                .should(timeAliases)
                .minimumShouldMatch("1"))));
        }

        if (filterClauses.isEmpty()) {
            return Query.of(q -> q.matchAll(m -> m));
        }

        return Query.of(q -> q.bool(b -> b.filter(filterClauses)));
    }

    // =========================================================================
    // Sort building
    // =========================================================================

    private List<SortOptions> buildSortOptions(String sort) {
        List<SortOptions> options = new ArrayList<>();

        if (sort == null || sort.isBlank()) {
            sort = "severity_desc";
        }

        switch (sort) {
            case "severity_desc":
                // Sort by severity descending, then createdAt descending as tiebreaker
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("severity").order(SortOrder.Desc))));
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("createdAt").order(SortOrder.Desc))));
                break;
            case "created_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("createdAt").order(SortOrder.Desc))));
                break;
            case "updated_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("updatedAt").order(SortOrder.Desc))));
                break;
            case "stage_count_desc":
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("attackStageCount").order(SortOrder.Desc))));
                break;
            default:
                // Fallback to severity_desc
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("severity").order(SortOrder.Desc))));
                options.add(SortOptions.of(s -> s.field(f ->
                    f.field("createdAt").order(SortOrder.Desc))));
                break;
        }

        // Always append _id as stable tie-breaker
        options.add(SortOptions.of(s -> s.field(f ->
            f.field("_id").order(SortOrder.Asc))));

        return options;
    }

    // =========================================================================
    // Summary aggregation extraction
    // =========================================================================

    private Map<String, Object> buildSummary(Map<String, Aggregate> aggregations, long total) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", total);

        // Severity breakdown
        Map<String, Object> bySeverity = new LinkedHashMap<>();
        bySeverity.put("critical", 0L);
        bySeverity.put("high", 0L);
        bySeverity.put("medium", 0L);
        bySeverity.put("low", 0L);

        if (aggregations != null && aggregations.containsKey("by_severity")) {
            Aggregate sevAgg = aggregations.get("by_severity");
            if (sevAgg.isSterms()) {
                for (StringTermsBucket bucket : sevAgg.sterms().buckets().array()) {
                    bySeverity.put(bucket.key().toLowerCase(Locale.ROOT), bucket.docCount());
                }
            }
        }
        summary.put("bySeverity", bySeverity);

        // Status breakdown
        Map<String, Object> byStatus = new LinkedHashMap<>();
        byStatus.put("new", 0L);
        byStatus.put("reviewing", 0L);
        byStatus.put("confirmed", 0L);
        byStatus.put("dismissed", 0L);

        if (aggregations != null && aggregations.containsKey("by_status")) {
            Aggregate statusAgg = aggregations.get("by_status");
            if (statusAgg.isSterms()) {
                for (StringTermsBucket bucket : statusAgg.sterms().buckets().array()) {
                    byStatus.put(bucket.key().toLowerCase(Locale.ROOT), bucket.docCount());
                }
            }
        }
        summary.put("byStatus", byStatus);

        // Average signals per finding
        double avgSignals = 0.0;
        if (aggregations != null && aggregations.containsKey("avg_signals")) {
            Aggregate avgAgg = aggregations.get("avg_signals");
            if (avgAgg.isAvg() && !Double.isNaN(avgAgg.avg().value())) {
                avgSignals = Math.round(avgAgg.avg().value() * 10.0) / 10.0;
            }
        }
        summary.put("avgSignalsPerFinding", avgSignals);

        return summary;
    }

    // =========================================================================
    // Hit mapping
    // =========================================================================

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapHitToPreview(Hit<Map> hit) {
        Map<String, Object> src = hit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) hit.source())
            : new LinkedHashMap<>();

        // Use document _id as the finding ID if not in source
        if (!src.containsKey("id") || src.get("id") == null) {
            src.put("id", src.get("findingId") != null ? src.get("findingId") : hit.id());
        }

        // Normalize the current correlation-engine producer into the bounded queue shape.
        // Derived counts are structural only; risk and confidence remain distinct values.
        Object alerts = src.get("alerts");
        Object entities = src.get("entities");
        Object timeline = src.get("timeline");
        if (!src.containsKey("signalCount") && alerts instanceof List<?> alertList) {
            src.put("signalCount", alertList.size());
        }
        if (!src.containsKey("entityCount") && entities instanceof List<?> entityList) {
            src.put("entityCount", entityList.size());
        }
        if (!src.containsKey("attackStageCount") && timeline instanceof List<?> stageList) {
            src.put("attackStageCount", stageList.size());
        }
        if (!src.containsKey("leadEntity") && entities instanceof List<?> entityList && !entityList.isEmpty()) {
            Object selected = entityList.get(0);
            for (Object candidate : entityList) {
                if (candidate instanceof Map<?, ?> candidateMap
                    && Set.of("target", "victim", "compromised").contains(String.valueOf(candidateMap.get("role")).toLowerCase(Locale.ROOT))) {
                    selected = candidate;
                    break;
                }
            }
            if (selected instanceof Map<?, ?> selectedMap) {
                Map<String, Object> leadEntity = new LinkedHashMap<>();
                leadEntity.put("type", selectedMap.get("type"));
                leadEntity.put("value", selectedMap.get("value") != null ? selectedMap.get("value") : selectedMap.get("label"));
                src.put("leadEntity", leadEntity);
            }
        }
        if (!src.containsKey("createdAt")) {
            src.put("createdAt", firstTimelineTimestamp(timeline, src.get("@timestamp")));
        }
        if (!src.containsKey("updatedAt")) {
            src.put("updatedAt", lastTimelineTimestamp(timeline, src.get("@timestamp")));
        }
        if (!src.containsKey("status")) {
            src.put("status", "new");
        }

        // For correlationReasons in preview, extract only the type field
        Object reasons = src.get("correlationReasons");
        if (reasons instanceof List) {
            List<String> reasonTypes = new ArrayList<>();
            for (Object reason : (List<?>) reasons) {
                if (reason instanceof Map) {
                    Object type = ((Map<String, Object>) reason).get("type");
                    if (type != null) {
                        reasonTypes.add(type.toString());
                    }
                } else if (reason instanceof String) {
                    reasonTypes.add((String) reason);
                }
            }
            src.put("correlationReasons", reasonTypes);
        }

        return src;
    }

    private Object firstTimelineTimestamp(Object timeline, Object fallback) {
        if (timeline instanceof List<?> stages && !stages.isEmpty() && stages.get(0) instanceof Map<?, ?> stage) {
            Object timestamp = stage.get("timestamp");
            if (timestamp != null) return timestamp;
        }
        return fallback;
    }

    private Object lastTimelineTimestamp(Object timeline, Object fallback) {
        if (timeline instanceof List<?> stages && !stages.isEmpty() && stages.get(stages.size() - 1) instanceof Map<?, ?> stage) {
            Object timestamp = stage.get("timestamp");
            if (timestamp != null) return timestamp;
        }
        return fallback;
    }

    // =========================================================================
    // Cursor encode / decode
    // =========================================================================

    /**
     * Encodes search_after sort values into a Base64 JSON cursor.
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
     * Decodes a Base64 JSON cursor back to search_after values.
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
    // Filter DTO
    // =========================================================================

    /**
     * Value object holding parsed filter parameters for the queue listing.
     */
    public static class FindingFilters {
        public List<String> severity;
        public List<String> status;
        public List<String> tactics;
        public String assignee;
        public String from;
        public String to;
    }
}
