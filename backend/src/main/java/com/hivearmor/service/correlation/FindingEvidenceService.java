package com.hivearmor.service.correlation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Service for paginated supporting evidence queries (COR-003).
 *
 * <p>Provides cursor-paginated access to:
 * <ul>
 *   <li>Signals — linked alert documents from v3-hive-alert-*</li>
 *   <li>Events — raw log events from v3-hive-log-* scoped to finding entities and time</li>
 *   <li>Relationships — entity relationships from the finding document (in-memory pagination)</li>
 * </ul>
 *
 * <p>Sprint 44 — Correlated Findings.
 */
@Service
public class FindingEvidenceService {

    private static final Logger log = LoggerFactory.getLogger(FindingEvidenceService.class);
    private static final String CLASSNAME = "FindingEvidenceService";

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final CorrelatedFindingService correlatedFindingService;
    private final MsspIndexResolver indexResolver;

    public FindingEvidenceService(OpensearchClientBuilder osClient,
                                  ObjectMapper objectMapper,
                                  CorrelatedFindingService correlatedFindingService,
                                  MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.correlatedFindingService = correlatedFindingService;
        this.indexResolver = indexResolver;
    }

    // =========================================================================
    // Signals (COR-003)
    // =========================================================================

    /**
     * Fetches linked alert documents from v3-hive-alert-* by signal IDs stored in the finding.
     *
     * @param findingId          the finding identifier
     * @param cursor             opaque cursor (Base64 search_after)
     * @param limit              page size
     * @param tenantIndexPattern tenant-scoped index pattern for correlation index
     * @return paginated response with items, cursor, total
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> listSignals(String findingId, String cursor, int limit,
                                           String tenantIndexPattern) throws Exception {
        // First, fetch the finding to get signal IDs
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, tenantIndexPattern);
        if (findingOpt.isEmpty()) {
            return emptyPage();
        }

        Map<String, Object> finding = findingOpt.get();

        // Extract all canonical stage signal IDs. During the producer migration,
        // accept the bounded top-level alert IDs written by the correlation engine.
        List<String> signalIds = extractSignalIds(finding);
        if (signalIds.isEmpty()) {
            return emptyPage();
        }

        // Query v3-hive-alert-* for these signal IDs
        String alertIndexPattern = indexResolver.resolveIndexPattern("alert");

        List<FieldValue> signalFieldValues = signalIds.stream()
            .map(FieldValue::of)
            .toList();

        // Alert generations coexist with both keyword IDs and text IDs that expose
        // an exact-match keyword subfield. Query both mappings during migration.
        Query query = Query.of(q -> q.bool(b -> b
            .should(
                Query.of(sq -> sq.terms(t -> t.field("id").terms(tv -> tv.value(signalFieldValues)))),
                Query.of(sq -> sq.terms(t -> t.field("id.keyword").terms(tv -> tv.value(signalFieldValues))))
            )
            .minimumShouldMatch("1")));

        List<SortOptions> sortOptions = List.of(
            SortOptions.of(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Asc))),
            SortOptions.of(s -> s.field(f -> f.field("_id").order(SortOrder.Asc)))
        );

        SearchRequest.Builder searchBuilder = new SearchRequest.Builder()
            .index(alertIndexPattern)
            .query(query)
            .size(limit)
            .sort(sortOptions)
            .trackTotalHits(t -> t.enabled(true));

        // Apply cursor
        if (cursor != null && !cursor.isBlank()) {
            List<String> searchAfter = decodeCursor(cursor);
            if (searchAfter != null && !searchAfter.isEmpty()) {
                searchBuilder.searchAfter(searchAfter);
            }
        }

        SearchRequest request = searchBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        List<Map<String, Object>> items = new ArrayList<>();
        String nextCursor = null;

        if (response.hits() != null && response.hits().hits() != null) {
            List<Hit<Map>> hits = response.hits().hits();
            for (int i = 0; i < hits.size(); i++) {
                Hit<Map> hit = hits.get(i);
                Map<String, Object> signal = mapHitToSignal(hit);
                items.add(signal);

                if (i == hits.size() - 1 && hit.sort() != null && !hit.sort().isEmpty()) {
                    nextCursor = encodeCursor(hit.sort());
                }
            }
        }

        if (items.size() < limit) {
            nextCursor = null;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("cursor", nextCursor);
        result.put("total", total);
        return result;
    }

    // =========================================================================
    // Events (COR-003)
    // =========================================================================

    /**
     * Queries v3-hive-log-* scoped to finding entities and time window.
     *
     * @param findingId          the finding identifier
     * @param cursor             opaque cursor (Base64 search_after)
     * @param limit              page size
     * @param tenantIndexPattern tenant-scoped index pattern for correlation index
     * @return paginated response with items, cursor, total
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> listEvents(String findingId, String cursor, int limit,
                                          String tenantIndexPattern) throws Exception {
        // Fetch the finding to get entity values and time window
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, tenantIndexPattern);
        if (findingOpt.isEmpty()) {
            return emptyPage();
        }

        Map<String, Object> finding = findingOpt.get();

        // Extract entity values for scoping
        List<String> entityValues = extractEntityValues(finding);
        if (entityValues.isEmpty()) {
            return emptyPage();
        }

        // Build time range from finding timestamps
        String createdAt = finding.get("createdAt") != null ? finding.get("createdAt").toString() : null;
        String updatedAt = finding.get("updatedAt") != null ? finding.get("updatedAt").toString() : null;

        // Query v3-hive-log-* scoped to entities + time
        String logIndexPattern = indexResolver.resolveIndexPattern("log");

        List<Query> filterClauses = new ArrayList<>();

        // Prefer exact source-event lineage emitted by the correlation engine.
        // Entity/time scoping remains as a compatibility fallback for older findings.
        List<String> sourceEventIds = extractEventIds(finding);
        if (!sourceEventIds.isEmpty()) {
            List<FieldValue> eventFieldValues = sourceEventIds.stream().map(FieldValue::of).toList();
            filterClauses.add(Query.of(q -> q.bool(b -> b
                .should(
                    Query.of(sq -> sq.ids(i -> i.values(sourceEventIds))),
                    Query.of(sq -> sq.terms(t -> t.field("id").terms(tv -> tv.value(eventFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("id.keyword").terms(tv -> tv.value(eventFieldValues))))
                )
                .minimumShouldMatch("1"))));
        } else {

            // Entity scope: match any entity value in common or normalized engine fields.
            List<FieldValue> entityFieldValues = entityValues.stream()
                .map(FieldValue::of)
                .toList();
            filterClauses.add(Query.of(q -> q.bool(b -> b
                .should(
                    Query.of(sq -> sq.terms(t -> t.field("source.ip").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("destination.ip").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("user.name.keyword").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("host.name.keyword").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("origin.ip").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("origin.user.keyword").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("origin.host.keyword").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("target.ip").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("target.user.keyword").terms(tv -> tv.value(entityFieldValues)))),
                    Query.of(sq -> sq.terms(t -> t.field("target.host.keyword").terms(tv -> tv.value(entityFieldValues))))
                )
                .minimumShouldMatch("1"))));

            // Time range
            if (createdAt != null) {
                filterClauses.add(Query.of(q -> q.range(r -> {
                    var rb = r.field("@timestamp");
                    if (createdAt != null) rb.gte(JsonData.of(createdAt));
                    if (updatedAt != null) rb.lte(JsonData.of(updatedAt));
                    return rb;
                })));
            }
        }

        Query query = Query.of(q -> q.bool(b -> b.filter(filterClauses)));

        List<SortOptions> sortOptions = List.of(
            SortOptions.of(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc))),
            SortOptions.of(s -> s.field(f -> f.field("_id").order(SortOrder.Asc)))
        );

        SearchRequest.Builder searchBuilder = new SearchRequest.Builder()
            .index(logIndexPattern)
            .query(query)
            .size(limit)
            .sort(sortOptions)
            .trackTotalHits(t -> t.enabled(true));

        // Apply cursor
        if (cursor != null && !cursor.isBlank()) {
            List<String> searchAfter = decodeCursor(cursor);
            if (searchAfter != null && !searchAfter.isEmpty()) {
                searchBuilder.searchAfter(searchAfter);
            }
        }

        SearchRequest request = searchBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        long total = response.hits().total() != null ? response.hits().total().value() : 0;

        List<Map<String, Object>> items = new ArrayList<>();
        String nextCursor = null;

        if (response.hits() != null && response.hits().hits() != null) {
            List<Hit<Map>> hits = response.hits().hits();
            for (int i = 0; i < hits.size(); i++) {
                Hit<Map> hit = hits.get(i);
                Map<String, Object> event = hit.source() != null
                    ? new LinkedHashMap<>((Map<String, Object>) hit.source())
                    : new LinkedHashMap<>();
                event.put("id", hit.id());
                items.add(event);

                if (i == hits.size() - 1 && hit.sort() != null && !hit.sort().isEmpty()) {
                    nextCursor = encodeCursor(hit.sort());
                }
            }
        }

        if (items.size() < limit) {
            nextCursor = null;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("cursor", nextCursor);
        result.put("total", total);
        return result;
    }

    // =========================================================================
    // Relationships (COR-003)
    // =========================================================================

    /**
     * Paginates relationships from the finding document (in-memory pagination).
     *
     * @param findingId          the finding identifier
     * @param cursor             opaque cursor (offset-based for in-memory)
     * @param limit              page size
     * @param tenantIndexPattern tenant-scoped index pattern for correlation index
     * @return paginated response with items, cursor, total
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listRelationships(String findingId, String cursor, int limit,
                                                 String tenantIndexPattern) throws Exception {
        // Fetch the finding to get relationships
        Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(findingId, tenantIndexPattern);
        if (findingOpt.isEmpty()) {
            return emptyPage();
        }

        Map<String, Object> finding = findingOpt.get();

        // Extract relationships from finding document
        Object relationshipsObj = finding.get("relationships");
        List<Map<String, Object>> allRelationships = new ArrayList<>();
        if (relationshipsObj instanceof List<?> relList) {
            for (Object rel : relList) {
                if (rel instanceof Map<?, ?> relMap) {
                    allRelationships.add(new LinkedHashMap<>((Map<String, Object>) relMap));
                }
            }
        }

        int total = allRelationships.size();

        // Determine offset from cursor
        int offset = 0;
        if (cursor != null && !cursor.isBlank()) {
            try {
                byte[] decoded = Base64.getUrlDecoder().decode(cursor);
                String json = new String(decoded, StandardCharsets.UTF_8);
                Map<String, Object> cursorMap = objectMapper.readValue(json, new TypeReference<>() {});
                Object offsetObj = cursorMap.get("offset");
                if (offsetObj instanceof Number) {
                    offset = ((Number) offsetObj).intValue();
                }
            } catch (Exception e) {
                log.warn("{}: failed to decode relationship cursor: {}", CLASSNAME, e.getMessage());
            }
        }

        // Paginate
        int end = Math.min(offset + limit, total);
        List<Map<String, Object>> items = (offset < total)
            ? allRelationships.subList(offset, end)
            : List.of();

        // Build next cursor
        String nextCursor = null;
        if (end < total) {
            try {
                Map<String, Object> cursorPayload = Map.of("offset", end);
                String json = objectMapper.writeValueAsString(cursorPayload);
                nextCursor = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(json.getBytes(StandardCharsets.UTF_8));
            } catch (JsonProcessingException e) {
                log.warn("{}: failed to encode relationship cursor: {}", CLASSNAME, e.getMessage());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);
        result.put("cursor", nextCursor);
        result.put("total", (long) total);
        return result;
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    @SuppressWarnings("unchecked")
    private List<String> extractSignalIds(Map<String, Object> finding) {
        Set<String> signalIds = new LinkedHashSet<>();
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stageList) {
            for (Object stage : stageList) {
                if (stage instanceof Map<?, ?> stageMap) {
                    Object sids = stageMap.get("signalIds");
                    if (sids instanceof List<?> sidList) {
                        for (Object sid : sidList) {
                            if (sid != null) signalIds.add(sid.toString());
                        }
                    }
                }
            }
        }
        Object alertsObj = finding.get("alerts");
        if (alertsObj instanceof List<?> alertList) {
            for (Object alertId : alertList) {
                if (alertId != null) signalIds.add(alertId.toString());
            }
        }
        return new ArrayList<>(signalIds);
    }

    @SuppressWarnings("unchecked")
    private List<String> extractEntityValues(Map<String, Object> finding) {
        List<String> values = new ArrayList<>();
        Object entitiesObj = finding.get("entities");
        if (entitiesObj instanceof List<?> entitiesList) {
            for (Object entity : entitiesList) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object value = entityMap.get("value");
                    if (value != null) values.add(value.toString());
                }
            }
        }
        return values;
    }

    private List<String> extractEventIds(Map<String, Object> finding) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        Object eventIdsObj = finding.get("eventIds");
        if (eventIdsObj instanceof List<?> eventIds) {
            for (Object id : eventIds) {
                if (id != null && !id.toString().isBlank()) ids.add(id.toString());
            }
        }
        Object stagesObj = finding.get("stages");
        if (stagesObj instanceof List<?> stages) {
            for (Object stage : stages) {
                if (stage instanceof Map<?, ?> stageMap && stageMap.get("eventIds") instanceof List<?> eventIds) {
                    for (Object id : eventIds) {
                        if (id != null && !id.toString().isBlank()) ids.add(id.toString());
                    }
                }
            }
        }
        return new ArrayList<>(ids);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapHitToSignal(Hit<Map> hit) {
        Map<String, Object> src = hit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) hit.source())
            : new LinkedHashMap<>();

        // Map to Signal response shape
        Map<String, Object> signal = new LinkedHashMap<>();
        signal.put("id", src.getOrDefault("id", hit.id()));
        signal.put("alertId", hit.id());
        signal.put("ruleName", src.getOrDefault("ruleName", src.get("name")));
        signal.put("severity", src.get("severity"));
        signal.put("timestamp", src.getOrDefault("@timestamp", src.get("timestamp")));
        signal.put("description", src.get("description"));
        signal.put("entities", signalEntities(src));
        signal.put("mitreTechnique", firstAvailable(src, "mitreTechnique", "mitreTechniqueId", "technique"));
        signal.put("stage", src.get("stage"));
        return signal;
    }

    @SuppressWarnings("unchecked")
    private List<String> signalEntities(Map<String, Object> source) {
        Object entities = source.get("entities");
        if (entities instanceof List<?> entityList) {
            return entityList.stream().filter(Objects::nonNull).map(Object::toString).toList();
        }
        LinkedHashSet<String> values = new LinkedHashSet<>();
        for (String sideName : List.of("adversary", "target")) {
            Object side = source.get(sideName);
            if (side instanceof Map<?, ?> sideMap) {
                for (String field : List.of("user", "ip", "host", "process", "domain")) {
                    Object value = sideMap.get(field);
                    if (value != null && !value.toString().isBlank()) values.add(value.toString());
                }
            }
        }
        return new ArrayList<>(values);
    }

    private Object firstAvailable(Map<String, Object> source, String... fields) {
        for (String field : fields) {
            Object value = source.get(field);
            if (value != null && !value.toString().isBlank()) return value;
        }
        return null;
    }

    private Map<String, Object> emptyPage() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", List.of());
        result.put("cursor", null);
        result.put("total", 0L);
        return result;
    }

    // =========================================================================
    // Cursor encode / decode
    // =========================================================================

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
}
