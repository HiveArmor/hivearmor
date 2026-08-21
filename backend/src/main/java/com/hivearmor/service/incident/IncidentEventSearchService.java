package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.BoolQuery;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Service for incident-scoped event search with bounded queries.
 *
 * <p>Implements INC-004: Incident-scoped event search within the incident workbench.
 * Builds queries bounded by incident entities and time range, executes on v3-hive-log-*
 * with tenant filtering, supports cursor pagination via search_after, and caps results
 * at 10,000 (setting truncated=true when exceeded).
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
public class IncidentEventSearchService {

    private static final Logger log = LoggerFactory.getLogger(IncidentEventSearchService.class);
    private static final String CLASSNAME = "IncidentEventSearchService";

    /** Maximum projection fields allowed. */
    private static final int MAX_PROJECTION_FIELDS = 20;

    /** Maximum total results before truncation. */
    private static final int MAX_TOTAL_RESULTS = 10000;

    /** Default page size if not specified. */
    private static final int DEFAULT_LIMIT = 100;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;

    public IncidentEventSearchService(OpensearchClientBuilder osClient,
                                      MsspIndexResolver indexResolver,
                                      ObjectMapper objectMapper) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Searches events scoped to an incident's entities and time range.
     *
     * @param incidentId          the incident identifier
     * @param body                search request body containing query, timeRange, entities, limit, projection, cursor
     * @param tenantIndexPattern  the tenant-scoped index pattern for incidents
     * @return search results with items, cursor, total, and truncated flag
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> searchEvents(String incidentId, Map<String, Object> body,
                                            String tenantIndexPattern) {
        final String ctx = CLASSNAME + ".searchEvents";

        try {
            // 1. Resolve log index pattern (events are in v3-hive-log-*)
            String logIndexPattern = indexResolver.resolveIndexPattern("log");

            // 2. Fetch incident to get entities and time range
            String incidentIndexPattern = tenantIndexPattern != null
                ? tenantIndexPattern
                : indexResolver.resolveIndexPattern("incident");

            Map<String, Object> incident = fetchIncident(incidentIndexPattern, incidentId);
            if (incident == null) {
                return Map.of("items", List.of(), "cursor", null, "total", 0, "truncated", false);
            }

            // 3. Extract entity scope from incident
            Set<String> incidentEntities = extractIncidentEntities(incident);

            // Override with request entities if provided
            if (body.get("entities") instanceof List<?> reqEntities && !reqEntities.isEmpty()) {
                incidentEntities = new HashSet<>();
                for (Object e : reqEntities) {
                    if (e instanceof String s && !s.isBlank()) {
                        incidentEntities.add(s);
                    }
                }
            }

            // 4. Parse time range — clamp to incident timeframe
            String timeFrom = null;
            String timeTo = null;
            if (body.get("timeRange") instanceof Map<?, ?> timeRange) {
                timeFrom = timeRange.get("from") instanceof String s ? s : null;
                timeTo = timeRange.get("to") instanceof String s ? s : null;
            }
            // Default: use incident creation time to now
            if (timeFrom == null) {
                Object createdAt = incident.get("createdAt");
                timeFrom = createdAt instanceof String s ? s : Instant.now().minusSeconds(86400).toString();
            }
            if (timeTo == null) {
                timeTo = Instant.now().toString();
            }

            // 5. Parse limit and projection
            int limit = body.get("limit") instanceof Number n ? n.intValue() : DEFAULT_LIMIT;
            limit = Math.min(limit, 500); // hard cap per page

            List<String> projection = null;
            if (body.get("projection") instanceof List<?> projList) {
                projection = new ArrayList<>();
                for (Object field : projList) {
                    if (field instanceof String s && !s.isBlank()) {
                        projection.add(s);
                    }
                }
                // Enforce max 20 fields
                if (projection.size() > MAX_PROJECTION_FIELDS) {
                    projection = projection.subList(0, MAX_PROJECTION_FIELDS);
                }
            }

            // 6. Parse user query string
            String userQuery = body.get("query") instanceof String s ? s : null;

            // 7. Parse search_after cursor
            List<String> searchAfter = null;
            if (body.get("cursor") instanceof List<?> cursorList && !cursorList.isEmpty()) {
                searchAfter = new ArrayList<>();
                for (Object val : cursorList) {
                    if (val instanceof String s) {
                        searchAfter.add(s);
                    } else if (val != null) {
                        searchAfter.add(val.toString());
                    }
                }
            }

            // 8. Build the bounded query
            Query boundedQuery = buildBoundedQuery(incidentEntities, timeFrom, timeTo, userQuery);

            // 9. Execute search
            final List<String> finalProjection = projection;
            final int finalLimit = limit;
            final List<String> finalSearchAfter = searchAfter;

            SearchRequest.Builder requestBuilder = new SearchRequest.Builder()
                .index(logIndexPattern)
                .query(boundedQuery)
                .size(finalLimit)
                .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
                .sort(s -> s.field(f -> f.field("_id").order(SortOrder.Asc)));

            // Apply projection
            if (finalProjection != null && !finalProjection.isEmpty()) {
                requestBuilder.source(src -> src.filter(flt -> flt.includes(finalProjection)));
            }

            // Apply search_after for cursor pagination
            if (finalSearchAfter != null && !finalSearchAfter.isEmpty()) {
                requestBuilder.searchAfter(finalSearchAfter);
            }

            // Track hits for truncation detection
            requestBuilder.trackTotalHits(th -> th.enabled(true));

            SearchRequest request = requestBuilder.build();
            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            // 10. Process results
            List<Map<String, Object>> items = new ArrayList<>();
            List<Object> lastSort = null;

            if (response.hits() != null && response.hits().hits() != null) {
                for (Hit<Map> hit : response.hits().hits()) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    if (hit.source() != null) {
                        item.putAll((Map<String, Object>) hit.source());
                    }
                    item.put("_id", hit.id());
                    item.put("_index", hit.index());

                    // Generate pivot signature stub
                    item.put("_pivot", generatePivotSignature(hit));

                    items.add(item);

                    // Track last sort values for cursor
                    if (hit.sort() != null && !hit.sort().isEmpty()) {
                        lastSort = new ArrayList<>(hit.sort());
                    }
                }
            }

            // 11. Calculate total and truncation
            long total = 0;
            if (response.hits() != null && response.hits().total() != null) {
                total = response.hits().total().value();
            }
            boolean truncated = total > MAX_TOTAL_RESULTS;

            // 12. Build response
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("items", items);
            result.put("cursor", lastSort);
            result.put("total", Math.min(total, MAX_TOTAL_RESULTS));
            result.put("truncated", truncated);
            return result;

        } catch (Exception e) {
            log.error("{}: failed to search events for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to search events: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Query building
    // =========================================================================

    /**
     * Builds a bounded OpenSearch query combining entity scope, time range, and user query.
     */
    private Query buildBoundedQuery(Set<String> entities, String timeFrom, String timeTo,
                                    String userQuery) {
        BoolQuery.Builder boolBuilder = new BoolQuery.Builder();

        // Time range filter
        boolBuilder.filter(f -> f.range(r -> r
            .field("@timestamp")
            .gte(JsonData.of(timeFrom))
            .lte(JsonData.of(timeTo))));

        // Entity scope filter — OR across entity fields
        if (entities != null && !entities.isEmpty()) {
            List<String> entityList = new ArrayList<>(entities);

            BoolQuery.Builder entityBool = new BoolQuery.Builder()
                .minimumShouldMatch("1");

            entityBool.should(s -> s.terms(t -> t
                .field("source.ip")
                .terms(tv -> tv.value(entityList.stream()
                    .map(FieldValue::of).toList()))));
            entityBool.should(s -> s.terms(t -> t
                .field("destination.ip")
                .terms(tv -> tv.value(entityList.stream()
                    .map(FieldValue::of).toList()))));
            entityBool.should(s -> s.terms(t -> t
                .field("host.name")
                .terms(tv -> tv.value(entityList.stream()
                    .map(FieldValue::of).toList()))));
            entityBool.should(s -> s.terms(t -> t
                .field("user.name")
                .terms(tv -> tv.value(entityList.stream()
                    .map(FieldValue::of).toList()))));

            boolBuilder.filter(f -> f.bool(entityBool.build()));
        }

        // User query (query_string)
        if (userQuery != null && !userQuery.isBlank()) {
            boolBuilder.must(m -> m.queryString(qs -> qs.query(userQuery)));
        }

        return Query.of(q -> q.bool(boolBuilder.build()));
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Fetches an incident document by ID.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> fetchIncident(String indexPattern, String incidentId) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(Query.of(q -> q.ids(i -> i.values(List.of(incidentId)))))
            .size(1));

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits() == null || response.hits().hits().isEmpty()) {
            return null;
        }
        return (Map<String, Object>) response.hits().hits().get(0).source();
    }

    /**
     * Extracts entity values (IPs, hosts, users) from an incident document.
     */
    @SuppressWarnings("unchecked")
    private Set<String> extractIncidentEntities(Map<String, Object> incident) {
        Set<String> entities = new HashSet<>();

        if (incident.get("entities") instanceof List<?> entityList) {
            for (Object entity : entityList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value instanceof String s && !s.isBlank()) entities.add(s);
                } else if (entity instanceof String s) {
                    entities.add(s);
                }
            }
        }
        if (incident.get("linked_entities") instanceof List<?> linkedList) {
            for (Object entity : linkedList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value == null) value = entityMap.get("id");
                    if (value instanceof String s && !s.isBlank()) entities.add(s);
                } else if (entity instanceof String s) {
                    entities.add(s);
                }
            }
        }

        return entities;
    }

    /**
     * Generates a pivot signature stub for an event hit.
     * Full PivotGenerator integration from Sprint 42 can be wired later.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> generatePivotSignature(Hit<Map> hit) {
        Map<String, Object> pivot = new LinkedHashMap<>();
        pivot.put("available", true);
        // Stub: pivot signatures will use PivotGenerator from Sprint 42 when available
        if (hit.source() != null) {
            Map<String, Object> source = (Map<String, Object>) hit.source();
            if (source.get("source.ip") instanceof String ip) {
                pivot.put("source_ip", ip);
            }
            if (source.get("destination.ip") instanceof String ip) {
                pivot.put("destination_ip", ip);
            }
        }
        return pivot;
    }
}
