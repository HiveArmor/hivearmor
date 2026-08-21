package com.hivearmor.service.entity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.json.JsonData;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service for fetching related alerts for an entity (ENT-008).
 *
 * <p>Queries v3-hive-alert-* for alerts that involve the entity based on
 * entity type field matching (source.ip, destination.ip, host.name, user.name).
 * Determines the entity's role in each alert and supports filtering by
 * severity, status, and time range.
 */
@Service
public class EntityAlertService {

    private static final Logger log = LoggerFactory.getLogger(EntityAlertService.class);
    private static final String CLASSNAME = "EntityAlertService";

    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public EntityAlertService(OpensearchClientBuilder osClient,
                              ObjectMapper objectMapper,
                              MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    /**
     * Retrieves paginated alerts related to an entity.
     *
     * @param entityId            the entity document ID
     * @param entityType          entity type (host, user, ip, domain)
     * @param entityValue         entity value to match in alert fields
     * @param cursor              encoded cursor for pagination (null for first page)
     * @param limit               page size (default 25, max 100)
     * @param severity            comma-separated severity filter (optional)
     * @param status              comma-separated status filter (optional)
     * @param from                start of time range (ISO-8601)
     * @param to                  end of time range (ISO-8601)
     * @param tenantIndexPattern  tenant-scoped alert index pattern
     * @return map with items, cursor, total
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> getRelatedAlerts(String entityId, String entityType, String entityValue,
                                                String cursor, Integer limit,
                                                String severity, String status,
                                                String from, String to,
                                                String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getRelatedAlerts";
        int effectiveLimit = resolveLimit(limit);

        // Build entity involvement query — bool should on relevant fields
        List<Query> shouldQueries = buildEntityInvolvementQueries(entityType, entityValue);

        // Build filter queries
        List<Query> filters = new ArrayList<>();

        // Time range filter
        Instant now = Instant.now();
        String effectiveFrom = (from != null && !from.isBlank()) ? from : now.minus(30, ChronoUnit.DAYS).toString();
        String effectiveTo = (to != null && !to.isBlank()) ? to : now.toString();

        final String fromVal = effectiveFrom;
        final String toVal = effectiveTo;
        filters.add(Query.of(q -> q.range(r -> r.field("@timestamp")
            .gte(JsonData.of(fromVal))
            .lte(JsonData.of(toVal)))));

        // Severity filter
        if (severity != null && !severity.isBlank()) {
            List<FieldValue> severityValues = Arrays.stream(severity.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(FieldValue::of)
                .toList();
            if (!severityValues.isEmpty()) {
                filters.add(Query.of(q -> q.terms(t -> t.field("severity").terms(tv -> tv.value(severityValues)))));
            }
        }

        // Status filter
        if (status != null && !status.isBlank()) {
            List<FieldValue> statusValues = Arrays.stream(status.split(","))
                .map(String::trim).filter(s -> !s.isEmpty())
                .map(FieldValue::of)
                .toList();
            if (!statusValues.isEmpty()) {
                filters.add(Query.of(q -> q.terms(t -> t.field("status").terms(tv -> tv.value(statusValues)))));
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
            .query(Query.of(q -> q.bool(b -> b
                .should(shouldQueries)
                .minimumShouldMatch("1")
                .filter(filters)
            )))
            .sort(List.of(
                SortOptions.of(s -> s.field(FieldSort.of(f -> f.field("@timestamp").order(SortOrder.Desc))))
            ))
            .trackTotalHits(th -> th.enabled(true));

        if (searchAfterFinal != null && !searchAfterFinal.isEmpty()) {
            requestBuilder.searchAfter(searchAfterFinal);
        }

        SearchRequest request = requestBuilder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        // Map results
        List<Map<String, Object>> items = new ArrayList<>();
        List<String> lastSort = null;

        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> source = hit.source();
                if (source == null) continue;

                Map<String, Object> item = mapRelatedAlert(hit.id(), source, entityType, entityValue);
                items.add(item);

                if (hit.sort() != null && !hit.sort().isEmpty()) {
                    lastSort = hit.sort().stream().map(String::valueOf).toList();
                }
            }
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
    // Entity involvement query building
    // =========================================================================

    /**
     * Builds should queries to match alerts where the entity is involved.
     * For IP entities, checks both source.ip and destination.ip.
     * For hosts, checks host.name. For users, checks user.name.
     */
    private List<Query> buildEntityInvolvementQueries(String entityType, String entityValue) {
        List<Query> queries = new ArrayList<>();

        switch (entityType != null ? entityType : "") {
            case "ip" -> {
                queries.add(Query.of(q -> q.term(t -> t.field("source.ip").value(v -> v.stringValue(entityValue)))));
                queries.add(Query.of(q -> q.term(t -> t.field("destination.ip").value(v -> v.stringValue(entityValue)))));
            }
            case "host" -> {
                queries.add(Query.of(q -> q.term(t -> t.field("host.name.keyword").value(v -> v.stringValue(entityValue)))));
            }
            case "user" -> {
                queries.add(Query.of(q -> q.term(t -> t.field("user.name.keyword").value(v -> v.stringValue(entityValue)))));
            }
            case "domain" -> {
                queries.add(Query.of(q -> q.term(t -> t.field("dns.question.name.keyword").value(v -> v.stringValue(entityValue)))));
            }
            default -> {
                // Broad match across common entity fields
                queries.add(Query.of(q -> q.term(t -> t.field("host.name.keyword").value(v -> v.stringValue(entityValue)))));
                queries.add(Query.of(q -> q.term(t -> t.field("source.ip").value(v -> v.stringValue(entityValue)))));
                queries.add(Query.of(q -> q.term(t -> t.field("destination.ip").value(v -> v.stringValue(entityValue)))));
                queries.add(Query.of(q -> q.term(t -> t.field("user.name.keyword").value(v -> v.stringValue(entityValue)))));
            }
        }

        return queries;
    }

    // =========================================================================
    // Alert mapping
    // =========================================================================

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapRelatedAlert(String hitId, Map<String, Object> source,
                                                String entityType, String entityValue) {
        Map<String, Object> alert = new LinkedHashMap<>();

        alert.put("id", hitId != null ? hitId : getStr(source, "id"));
        alert.put("title", getStr(source, "title"));
        alert.put("severity", getStr(source, "severity"));
        alert.put("status", getStr(source, "status"));
        alert.put("ruleName", getStr(source, "ruleName"));
        alert.put("timestamp", source.get("@timestamp"));

        // MITRE technique
        Object mitreObj = source.get("mitre");
        if (mitreObj instanceof Map<?, ?> mitre) {
            Object techObj = mitre.get("technique");
            if (techObj instanceof Map<?, ?> tech) {
                alert.put("mitreTechnique", tech.get("id"));
            } else if (techObj instanceof List<?> techList && !techList.isEmpty()) {
                Object first = techList.get(0);
                if (first instanceof Map<?, ?> techMap) {
                    alert.put("mitreTechnique", techMap.get("id"));
                } else {
                    alert.put("mitreTechnique", first);
                }
            } else {
                alert.put("mitreTechnique", null);
            }
        } else {
            alert.put("mitreTechnique", null);
        }

        // Incident ID (if alert has been linked to an incident)
        alert.put("incidentId", source.get("incidentId"));

        // Determine entity role
        String entityRole = determineEntityRole(source, entityType, entityValue);
        alert.put("entityRole", entityRole);

        return alert;
    }

    /**
     * Determines the role of the entity in the alert based on which fields match.
     */
    @SuppressWarnings("unchecked")
    private String determineEntityRole(Map<String, Object> alertSource, String entityType, String entityValue) {
        if (entityType == null) return "asset";

        switch (entityType) {
            case "ip" -> {
                String sourceIp = getNestedStr(alertSource, "source.ip");
                String destIp = getNestedStr(alertSource, "destination.ip");
                if (entityValue.equals(sourceIp)) return "source";
                if (entityValue.equals(destIp)) return "target";
                return "source"; // default for IP
            }
            case "user" -> {
                return "actor";
            }
            case "host" -> {
                return "asset";
            }
            case "domain" -> {
                return "target";
            }
            default -> {
                return "asset";
            }
        }
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

    @SuppressWarnings("unchecked")
    private String getNestedStr(Map<String, Object> map, String path) {
        String[] parts = path.split("\\.");
        Object current = map;
        for (String part : parts) {
            if (current instanceof Map<?, ?> m) {
                current = m.get(part);
            } else {
                return "";
            }
            if (current == null) return "";
        }
        return current.toString();
    }
}
