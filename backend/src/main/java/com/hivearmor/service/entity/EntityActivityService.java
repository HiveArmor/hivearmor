package com.hivearmor.service.entity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.opensearch.enums.HttpMethod;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import okhttp3.Response;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldSort;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.Pit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service for PIT-based entity activity timeline (ENT-007).
 *
 * <p>Uses OpenSearch Point-in-Time (PIT) to provide consistent pagination
 * over entity activity events in v3-hive-log-*. First request opens a PIT,
 * subsequent requests reuse it via cursor-encoded PIT ID and search_after values.
 */
@Service
public class EntityActivityService {

    private static final Logger log = LoggerFactory.getLogger(EntityActivityService.class);
    private static final String CLASSNAME = "EntityActivityService";

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;
    private static final String PIT_KEEP_ALIVE = "5m";

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public EntityActivityService(OpensearchClientBuilder osClient,
                                 ObjectMapper objectMapper,
                                 MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    /**
     * Retrieves paginated activity events for an entity using PIT-based pagination.
     *
     * @param entityId            the entity document ID
     * @param entityType          entity type (host, user, ip, domain)
     * @param entityValue         entity value to filter on
     * @param cursor              encoded cursor from previous page (null for first page)
     * @param limit               page size (default 50, max 200)
     * @param types               comma-separated event types filter (optional)
     * @param from                start of time range (ISO-8601, default 24h ago)
     * @param to                  end of time range (ISO-8601, default now)
     * @param tenantIndexPattern  tenant-scoped log index pattern
     * @return map with items, cursor, total, window
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> getActivity(String entityId, String entityType, String entityValue,
                                           String cursor, Integer limit, String types,
                                           String from, String to,
                                           String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".getActivity";
        int effectiveLimit = resolveLimit(limit);

        // Resolve time range defaults
        Instant now = Instant.now();
        String effectiveFrom = (from != null && !from.isBlank()) ? from : now.minus(24, ChronoUnit.HOURS).toString();
        String effectiveTo = (to != null && !to.isBlank()) ? to : now.toString();

        String pitId;
        List<String> searchAfter = null;

        if (cursor != null && !cursor.isBlank()) {
            // Decode cursor: Base64 JSON { "pitId": "...", "after": [...], "from": "...", "to": "..." }
            Map<String, Object> cursorData = decodeCursor(cursor);
            pitId = (String) cursorData.get("pitId");
            searchAfter = (List<String>) cursorData.get("after");
            // Preserve time range from original request for consistency
            if (cursorData.containsKey("from")) effectiveFrom = (String) cursorData.get("from");
            if (cursorData.containsKey("to")) effectiveTo = (String) cursorData.get("to");
        } else {
            // First request: open a PIT
            pitId = openPit(tenantIndexPattern);
        }

        // Build filter queries
        List<Query> filters = new ArrayList<>();

        // Entity field filter
        String entityField = resolveEntityField(entityType);
        if ("ip".equals(entityType)) {
            // IP entities match on either source.ip or destination.ip
            filters.add(Query.of(q -> q.bool(b -> b
                .should(List.of(
                    Query.of(sq -> sq.term(t -> t.field("source.ip").value(v -> v.stringValue(entityValue)))),
                    Query.of(sq -> sq.term(t -> t.field("destination.ip").value(v -> v.stringValue(entityValue))))
                ))
                .minimumShouldMatch("1")
            )));
        } else {
            final String field = entityField;
            filters.add(Query.of(q -> q.term(t -> t.field(field).value(v -> v.stringValue(entityValue)))));
        }

        // Time range filter
        final String fromVal = effectiveFrom;
        final String toVal = effectiveTo;
        filters.add(Query.of(q -> q.range(r -> r.field("@timestamp")
            .gte(JsonData.of(fromVal))
            .lte(JsonData.of(toVal)))));

        // Type filter
        if (types != null && !types.isBlank()) {
            List<String> typeList = Arrays.stream(types.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
            if (!typeList.isEmpty()) {
                List<FieldValue> fieldValues = typeList.stream()
                    .map(t -> FieldValue.of(t))
                    .toList();
                filters.add(Query.of(q -> q.bool(b -> b
                    .should(List.of(
                        Query.of(sq -> sq.terms(t -> t.field("event.action").terms(tv -> tv.value(fieldValues)))),
                        Query.of(sq -> sq.terms(t -> t.field("event.category").terms(tv -> tv.value(fieldValues))))
                    ))
                    .minimumShouldMatch("1")
                )));
            }
        }

        // Build search request with PIT
        final String pitIdFinal = pitId;
        final List<String> searchAfterFinal = searchAfter;
        SearchRequest.Builder requestBuilder = new SearchRequest.Builder()
            .size(effectiveLimit)
            .query(Query.of(q -> q.bool(b -> b.filter(filters))))
            .pit(Pit.of(p -> p.id(pitIdFinal).keepAlive(PIT_KEEP_ALIVE)))
            .sort(List.of(
                SortOptions.of(s -> s.field(FieldSort.of(f -> f.field("@timestamp").order(SortOrder.Desc)))),
                SortOptions.of(s -> s.field(FieldSort.of(f -> f.field("_shard_doc").order(SortOrder.Asc))))
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

                Map<String, Object> item = mapActivityEvent(hit.id(), source);
                items.add(item);

                // Track last sort values for cursor
                if (hit.sort() != null && !hit.sort().isEmpty()) {
                    lastSort = hit.sort().stream().map(String::valueOf).toList();
                }
            }
        }

        // Build response
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", items);

        // Encode next cursor if there are more results
        if (!items.isEmpty() && lastSort != null && items.size() == effectiveLimit) {
            String nextCursor = encodeCursor(pitIdFinal, lastSort, effectiveFrom, effectiveTo);
            result.put("cursor", nextCursor);
        } else {
            result.put("cursor", null);
        }

        long total = (response.hits() != null && response.hits().total() != null)
            ? response.hits().total().value() : 0;
        result.put("total", total);

        Map<String, Object> window = new LinkedHashMap<>();
        window.put("from", effectiveFrom);
        window.put("to", effectiveTo);
        result.put("window", window);

        return result;
    }

    // =========================================================================
    // PIT management
    // =========================================================================

    /**
     * Opens a Point-in-Time on the given index pattern.
     */
    private String openPit(String indexPattern) throws Exception {
        String path = "/" + indexPattern + "/_search/point_in_time";
        Map<String, String> params = Map.of("keep_alive", PIT_KEEP_ALIVE);

        try (Response response = osClient.execute(os ->
                os.executeHttpRequest(path, params, null, HttpMethod.POST))) {
            if (!response.isSuccessful()) {
                throw new RuntimeException("Failed to open PIT: HTTP " + response.code());
            }
            String body = response.body().string();
            Map<String, Object> pitResponse = objectMapper.readValue(body, new TypeReference<>() {});
            return (String) pitResponse.get("pit_id");
        }
    }

    // =========================================================================
    // Cursor encoding/decoding
    // =========================================================================

    private String encodeCursor(String pitId, List<String> after, String from, String to) throws Exception {
        Map<String, Object> cursorData = new LinkedHashMap<>();
        cursorData.put("pitId", pitId);
        cursorData.put("after", after);
        cursorData.put("from", from);
        cursorData.put("to", to);
        String json = objectMapper.writeValueAsString(cursorData);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> decodeCursor(String cursor) throws Exception {
        byte[] decoded = Base64.getUrlDecoder().decode(cursor);
        return objectMapper.readValue(decoded, new TypeReference<>() {});
    }

    // =========================================================================
    // Event mapping
    // =========================================================================

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapActivityEvent(String hitId, Map<String, Object> source) {
        Map<String, Object> event = new LinkedHashMap<>();

        event.put("id", hitId != null ? hitId : UUID.randomUUID().toString());
        event.put("timestamp", source.get("@timestamp"));

        // Determine type and category from event fields
        String eventAction = getNestedStr(source, "event.action");
        String eventCategory = getNestedStr(source, "event.category");
        String type = mapEventType(eventAction, eventCategory);
        String category = mapEventCategory(eventCategory, type);

        event.put("type", type);
        event.put("category", category);

        // Build description
        String description = buildDescription(source, type);
        event.put("description", description);

        // Source
        event.put("source", getNestedStr(source, "agent.type"));

        // Severity
        String severity = getNestedStr(source, "event.severity");
        if (severity.isEmpty()) {
            severity = inferSeverity(type, source);
        }
        event.put("severity", severity);

        // Details - extract key fields
        Map<String, Object> details = extractDetails(source, type);
        event.put("details", details);

        // Related entity IDs (empty for now - would need join/lookup)
        event.put("relatedEntityIds", List.of());

        return event;
    }

    private String mapEventType(String eventAction, String eventCategory) {
        if (eventAction != null && !eventAction.isEmpty()) {
            String lower = eventAction.toLowerCase();
            if (lower.contains("process") || lower.contains("exec")) return "process_execution";
            if (lower.contains("connection") || lower.contains("network") || lower.contains("connect"))
                return "network_connection";
            if (lower.contains("auth") || lower.contains("login") || lower.contains("logon"))
                return "authentication";
            if (lower.contains("file") || lower.contains("write") || lower.contains("create") || lower.contains("delete"))
                return "file_operation";
            if (lower.contains("registry")) return "registry_change";
            if (lower.contains("service")) return "service_change";
            if (lower.contains("dns") || lower.contains("query")) return "dns_query";
            if (lower.contains("alert")) return "alert_triggered";
        }
        if (eventCategory != null && !eventCategory.isEmpty()) {
            String lower = eventCategory.toLowerCase();
            if (lower.contains("process")) return "process_execution";
            if (lower.contains("network")) return "network_connection";
            if (lower.contains("authentication") || lower.contains("identity")) return "authentication";
            if (lower.contains("file")) return "file_operation";
        }
        return "process_execution";
    }

    private String mapEventCategory(String eventCategory, String type) {
        if (eventCategory != null && !eventCategory.isEmpty()) {
            String lower = eventCategory.toLowerCase();
            if (lower.contains("execution") || lower.contains("process")) return "execution";
            if (lower.contains("network")) return "network";
            if (lower.contains("identity") || lower.contains("authentication")) return "identity";
            if (lower.contains("file")) return "file";
            if (lower.contains("security")) return "security";
        }
        // Infer from type
        return switch (type) {
            case "process_execution" -> "execution";
            case "network_connection", "dns_query" -> "network";
            case "authentication" -> "identity";
            case "file_operation" -> "file";
            case "registry_change", "service_change" -> "system";
            case "alert_triggered" -> "security";
            default -> "system";
        };
    }

    @SuppressWarnings("unchecked")
    private String buildDescription(Map<String, Object> source, String type) {
        return switch (type) {
            case "process_execution" -> {
                String processName = getNestedStr(source, "process.name");
                String commandLine = getNestedStr(source, "process.command_line");
                yield !processName.isEmpty()
                    ? processName + (!commandLine.isEmpty() ? " " + truncate(commandLine, 100) : "")
                    : "Process execution event";
            }
            case "network_connection" -> {
                String destIp = getNestedStr(source, "destination.ip");
                String destPort = getNestedStr(source, "destination.port");
                yield !destIp.isEmpty()
                    ? "Connection to " + destIp + (!destPort.isEmpty() ? ":" + destPort : "")
                    : "Network connection event";
            }
            case "authentication" -> {
                String user = getNestedStr(source, "user.name");
                String action = getNestedStr(source, "event.action");
                yield !user.isEmpty()
                    ? action + " for " + user
                    : "Authentication event";
            }
            case "file_operation" -> {
                String filePath = getNestedStr(source, "file.path");
                String action = getNestedStr(source, "event.action");
                yield !filePath.isEmpty()
                    ? action + ": " + truncate(filePath, 80)
                    : "File operation event";
            }
            case "dns_query" -> {
                String domain = getNestedStr(source, "dns.question.name");
                yield !domain.isEmpty()
                    ? "DNS query: " + domain
                    : "DNS query event";
            }
            default -> {
                String action = getNestedStr(source, "event.action");
                yield !action.isEmpty() ? action : "Activity event";
            }
        };
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractDetails(Map<String, Object> source, String type) {
        Map<String, Object> details = new LinkedHashMap<>();
        switch (type) {
            case "process_execution" -> {
                putIfPresent(details, source, "process.name");
                putIfPresent(details, source, "process.pid");
                putIfPresent(details, source, "process.parent.name");
                putIfPresent(details, source, "process.command_line");
            }
            case "network_connection" -> {
                putIfPresent(details, source, "destination.ip");
                putIfPresent(details, source, "destination.port");
                putIfPresent(details, source, "source.ip");
                putIfPresent(details, source, "network.bytes");
            }
            case "authentication" -> {
                putIfPresent(details, source, "user.name");
                putIfPresent(details, source, "source.ip");
                putIfPresent(details, source, "event.outcome");
            }
            case "file_operation" -> {
                putIfPresent(details, source, "file.path");
                putIfPresent(details, source, "file.name");
                putIfPresent(details, source, "event.action");
            }
            case "dns_query" -> {
                putIfPresent(details, source, "dns.question.name");
                putIfPresent(details, source, "dns.question.type");
                putIfPresent(details, source, "dns.resolved_ip");
            }
            default -> {
                putIfPresent(details, source, "event.action");
                putIfPresent(details, source, "event.outcome");
            }
        }
        return details;
    }

    private String inferSeverity(String type, Map<String, Object> source) {
        return switch (type) {
            case "alert_triggered" -> "high";
            case "process_execution" -> {
                String cmd = getNestedStr(source, "process.command_line").toLowerCase();
                if (cmd.contains("-enc") || cmd.contains("certutil") || cmd.contains("mimikatz"))
                    yield "critical";
                yield "low";
            }
            case "network_connection" -> "medium";
            case "authentication" -> {
                String outcome = getNestedStr(source, "event.outcome");
                yield "failure".equalsIgnoreCase(outcome) ? "medium" : "low";
            }
            default -> "low";
        };
    }

    // =========================================================================
    // Utility methods
    // =========================================================================

    private String resolveEntityField(String entityType) {
        if (entityType == null) return "host.name.keyword";
        return switch (entityType) {
            case "host" -> "host.name.keyword";
            case "user" -> "user.name.keyword";
            case "ip" -> "source.ip"; // handled specially in query building
            case "domain" -> "dns.question.name.keyword";
            default -> "host.name.keyword";
        };
    }

    private int resolveLimit(Integer limit) {
        if (limit == null || limit < 1) return DEFAULT_LIMIT;
        return Math.min(limit, MAX_LIMIT);
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

    @SuppressWarnings("unchecked")
    private void putIfPresent(Map<String, Object> target, Map<String, Object> source, String path) {
        String[] parts = path.split("\\.");
        Object current = source;
        for (String part : parts) {
            if (current instanceof Map<?, ?> m) {
                current = m.get(part);
            } else {
                return;
            }
            if (current == null) return;
        }
        target.put(path, current);
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
