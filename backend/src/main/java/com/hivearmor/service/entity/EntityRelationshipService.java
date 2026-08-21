package com.hivearmor.service.entity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.FieldSort;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service for fetching evidence-backed entity relationships (ENT-009).
 *
 * <p>Queries v3-hive-relationship-* for edges where the entity is either the source
 * or target. Determines relationship direction relative to the queried entity and
 * enriches each edge with related entity summaries via batch mget.
 */
@Service
public class EntityRelationshipService {

    private static final Logger log = LoggerFactory.getLogger(EntityRelationshipService.class);
    private static final String CLASSNAME = "EntityRelationshipService";

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public EntityRelationshipService(OpensearchClientBuilder osClient,
                                     ObjectMapper objectMapper,
                                     MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    /**
     * Retrieves paginated relationships for an entity.
     *
     * @param entityId            the entity document ID
     * @param cursor              encoded cursor for pagination (null for first page)
     * @param limit               page size (default 50, max 200)
     * @param types               comma-separated relationship type filter (optional)
     * @param tenantIndexPattern  tenant-scoped relationship index pattern
     * @return map with items, cursor, total
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> getRelationships(String entityId, String cursor, Integer limit,
                                                String types, String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getRelationships";
        int effectiveLimit = resolveLimit(limit);

        // Build query: entity is either sourceEntityId or targetEntityId
        List<Query> shouldQueries = List.of(
            Query.of(q -> q.term(t -> t.field("sourceEntityId.keyword").value(v -> v.stringValue(entityId)))),
            Query.of(q -> q.term(t -> t.field("targetEntityId.keyword").value(v -> v.stringValue(entityId))))
        );

        // Build filters
        List<Query> filters = new ArrayList<>();

        // Type filter
        if (types != null && !types.isBlank()) {
            List<FieldValue> typeValues = Arrays.stream(types.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(FieldValue::of)
                .toList();
            if (!typeValues.isEmpty()) {
                filters.add(Query.of(q -> q.terms(t -> t.field("relationshipType.keyword").terms(tv -> tv.value(typeValues)))));
            }
        }

        // Decode cursor for search_after
        List<String> searchAfter = null;
        if (cursor != null && !cursor.isBlank()) {
            Map<String, Object> cursorData = decodeCursor(cursor);
            searchAfter = (List<String>) cursorData.get("after");
        }

        // Build search request
        final List<String> searchAfterFinal = searchAfter;
        SearchRequest.Builder requestBuilder = new SearchRequest.Builder()
            .index(tenantIndexPattern)
            .size(effectiveLimit)
            .query(Query.of(q -> q.bool(b -> {
                b.should(shouldQueries).minimumShouldMatch("1");
                if (!filters.isEmpty()) {
                    b.filter(filters);
                }
                return b;
            })))
            .sort(List.of(
                SortOptions.of(s -> s.field(FieldSort.of(f -> f.field("strength").order(SortOrder.Desc)))),
                SortOptions.of(s -> s.field(FieldSort.of(f -> f.field("lastSeen").order(SortOrder.Desc))))
            ))
            .trackTotalHits(th -> th.enabled(true));

        if (searchAfterFinal != null && !searchAfterFinal.isEmpty()) {
            requestBuilder.searchAfter(searchAfterFinal);
        }

        SearchRequest request = requestBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Collect relationship hits and related entity IDs for batch lookup
        List<Hit<Map>> hits = new ArrayList<>();
        Set<String> relatedEntityIds = new LinkedHashSet<>();
        List<String> lastSort = null;

        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                hits.add(hit);
                Map<String, Object> source = hit.source();
                if (source != null) {
                    String sourceEntityId = getStr(source, "sourceEntityId");
                    String targetEntityId = getStr(source, "targetEntityId");
                    // The related entity is the one that's NOT the queried entity
                    if (!sourceEntityId.equals(entityId)) relatedEntityIds.add(sourceEntityId);
                    if (!targetEntityId.equals(entityId)) relatedEntityIds.add(targetEntityId);
                }
                if (hit.sort() != null && !hit.sort().isEmpty()) {
                    lastSort = hit.sort().stream().map(String::valueOf).toList();
                }
            }
        }

        // Batch-fetch related entity summaries
        String entityIndexPattern = indexResolver.resolveIndexPattern("entity");
        Map<String, Map<String, Object>> entitySummaries = batchFetchEntitySummaries(
            relatedEntityIds, entityIndexPattern);

        // Map results
        List<Map<String, Object>> items = new ArrayList<>();
        for (Hit<Map> hit : hits) {
            Map<String, Object> source = hit.source();
            if (source == null) continue;

            Map<String, Object> item = mapRelationship(hit.id(), source, entityId, entitySummaries);
            items.add(item);
        }

        // Build response
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);

        if (!items.isEmpty() && lastSort != null && items.size() == effectiveLimit) {
            result.put("cursor", encodeCursor(lastSort));
        } else {
            result.put("cursor", null);
        }

        long total = (response.hits() != null && response.hits().total() != null)
            ? response.hits().total().value() : 0;
        result.put("total", total);

        return result;
    }

    // =========================================================================
    // Batch entity summary fetch
    // =========================================================================

    /**
     * Batch-fetches entity summaries (id, type, value, riskScore, riskLevel)
     * for the given set of entity IDs using multi-search.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Map<String, Object>> batchFetchEntitySummaries(
            Set<String> entityIds, String entityIndexPattern) throws Exception {
        Map<String, Map<String, Object>> summaries = new LinkedHashMap<>();
        if (entityIds == null || entityIds.isEmpty()) return summaries;

        // Use a terms query to fetch all entities in one search
        List<FieldValue> idValues = entityIds.stream()
            .map(FieldValue::of)
            .toList();

        SearchRequest request = SearchRequest.of(r -> r
            .index(entityIndexPattern)
            .size(entityIds.size())
            .query(Query.of(q -> q.ids(ids -> ids.values(entityIds.stream().toList()))))
            .source(sc -> sc.filter(f -> f.includes(List.of("type", "value", "riskScore", "riskLevel", "displayName"))))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> source = hit.source();
                if (source == null) continue;

                Map<String, Object> summary = new LinkedHashMap<>();
                summary.put("id", hit.id());
                summary.put("type", source.getOrDefault("type", "unknown"));
                summary.put("value", source.getOrDefault("value", ""));
                summary.put("riskScore", source.getOrDefault("riskScore", 0));
                summary.put("riskLevel", source.getOrDefault("riskLevel", "low"));
                summaries.put(hit.id(), summary);
            }
        }

        return summaries;
    }

    // =========================================================================
    // Relationship mapping
    // =========================================================================

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapRelationship(String hitId, Map<String, Object> source,
                                                String entityId,
                                                Map<String, Map<String, Object>> entitySummaries) {
        Map<String, Object> rel = new LinkedHashMap<>();

        rel.put("id", hitId != null ? hitId : getStr(source, "id"));

        // Determine direction and related entity
        String sourceEntityId = getStr(source, "sourceEntityId");
        String targetEntityId = getStr(source, "targetEntityId");

        String direction;
        String relatedId;
        if (sourceEntityId.equals(entityId) && targetEntityId.equals(entityId)) {
            direction = "bidirectional";
            relatedId = entityId; // self-reference edge
        } else if (sourceEntityId.equals(entityId)) {
            direction = "outbound";
            relatedId = targetEntityId;
        } else {
            direction = "inbound";
            relatedId = sourceEntityId;
        }

        // Related entity summary
        Map<String, Object> relatedEntity = entitySummaries.getOrDefault(relatedId,
            buildFallbackEntitySummary(source, relatedId, direction));
        rel.put("relatedEntity", relatedEntity);

        rel.put("relationshipType", source.getOrDefault("relationshipType", "unknown"));
        rel.put("direction", direction);
        rel.put("strength", source.getOrDefault("strength", 0.5));

        // Evidence array
        Object evidenceObj = source.get("evidence");
        if (evidenceObj instanceof List<?> evidenceList) {
            rel.put("evidence", evidenceList);
        } else {
            rel.put("evidence", List.of());
        }

        rel.put("firstSeen", source.get("firstSeen"));
        rel.put("lastSeen", source.get("lastSeen"));
        rel.put("eventCount", source.getOrDefault("eventCount", 0));

        return rel;
    }

    /**
     * Builds a fallback entity summary when the entity wasn't found in the batch fetch.
     * Uses fields from the relationship document itself.
     */
    private Map<String, Object> buildFallbackEntitySummary(Map<String, Object> relSource,
                                                            String relatedId, String direction) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("id", relatedId);

        // Try to get type/value from the relationship document fields
        if ("outbound".equals(direction)) {
            summary.put("type", relSource.getOrDefault("targetEntityType", "unknown"));
            summary.put("value", relSource.getOrDefault("targetEntityValue", ""));
        } else {
            summary.put("type", relSource.getOrDefault("sourceEntityType", "unknown"));
            summary.put("value", relSource.getOrDefault("sourceEntityValue", ""));
        }
        summary.put("riskScore", 0);
        summary.put("riskLevel", "low");

        return summary;
    }

    // =========================================================================
    // Cursor encoding/decoding
    // =========================================================================

    private String encodeCursor(List<String> after) throws Exception {
        Map<String, Object> cursorData = new LinkedHashMap<>();
        cursorData.put("after", after);
        String json = objectMapper.writeValueAsString(cursorData);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> decodeCursor(String cursor) throws Exception {
        byte[] decoded = Base64.getUrlDecoder().decode(cursor);
        return objectMapper.readValue(decoded, new TypeReference<>() {});
    }

    // =========================================================================
    // Utility methods
    // =========================================================================

    private int resolveLimit(Integer limit) {
        if (limit == null || limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
    }

    private String getStr(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }
}
