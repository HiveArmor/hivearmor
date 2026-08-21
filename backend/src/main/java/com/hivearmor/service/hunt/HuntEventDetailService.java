package com.hivearmor.service.hunt;

import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.web.rest.hunt.dto.HuntEventDTO;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.opensearch.client.opensearch.core.search.Pit;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Loads progressive event context from the caller's tenant-bound hunt snapshot. */
@Service
public class HuntEventDetailService {

    private final OpensearchClientBuilder osClient;
    private final AlertEventFieldClassifier fieldClassifier;
    private final PivotGenerator pivotGenerator;
    private final HuntFieldRegistry fieldRegistry;

    public HuntEventDetailService(OpensearchClientBuilder osClient,
                                  AlertEventFieldClassifier fieldClassifier,
                                  PivotGenerator pivotGenerator,
                                  HuntFieldRegistry fieldRegistry) {
        this.osClient = osClient;
        this.fieldClassifier = fieldClassifier;
        this.pivotGenerator = pivotGenerator;
        this.fieldRegistry = fieldRegistry;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> getEventDetail(String eventId, boolean includeRaw,
                                              HuntSearchSessionStore.Session session) throws Exception {
        if (eventId == null || eventId.isBlank() || eventId.length() > 512) {
            throw new HuntQueryException("HUNT_EVENT_ID_INVALID", "Event identifier is invalid", 0);
        }
        SearchRequest.Builder builder = new SearchRequest.Builder()
            .query(Query.of(q -> q.ids(i -> i.values(List.of(eventId)))))
            .source(s -> s.filter(f -> f.includes(fieldRegistry.boundedProjection(List.of(
                "host.ip", "host.os.name", "user.domain", "source.port", "destination.port",
                "process.name", "process.command_line", "process.pid", "file.name", "file.path",
                "file.hash.sha256", "network.direction", "network.transport", "network.bytes"
            )))))
            .size(1);
        if (session.pitId() == null || session.pitId().isBlank()) {
            builder.index(session.indices()).ignoreUnavailable(true).allowNoIndices(true);
        } else {
            builder.pit(Pit.of(p -> p.id(session.pitId()).keepAlive("2m")));
        }
        SearchRequest request = builder.build();
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits() == null || response.hits().hits().isEmpty()) return null;

        Hit<Map> hit = response.hits().hits().get(0);
        Map<String, Object> source = hit.source() == null ? Map.of() : hit.source();
        Map<String, Object> event = nested(source, "event");
        Map<String, Object> host = nested(source, "host");
        Map<String, Object> user = nested(source, "user");
        Map<String, Object> sourceNetwork = nested(source, "source");
        Map<String, Object> destination = nested(source, "destination");

        Map<String, Object> normalized = new LinkedHashMap<>();
        put(normalized, "@timestamp", source.get("@timestamp"));
        put(normalized, "event.severity", event.get("severity"));
        put(normalized, "event.category", event.get("category"));
        put(normalized, "event.action", event.get("action"));
        put(normalized, "event.outcome", event.get("outcome"));
        put(normalized, "host.name", host.get("name") != null ? host.get("name") : nested(source, "origin").get("host"));
        put(normalized, "host.ip", host.get("ip"));
        put(normalized, "user.name", user.get("name") != null ? user.get("name") : nested(source, "origin").get("user"));
        put(normalized, "user.domain", user.get("domain"));
        put(normalized, "source.ip", sourceNetwork.get("ip"));
        put(normalized, "source.port", sourceNetwork.get("port"));
        put(normalized, "destination.ip", destination.get("ip"));
        put(normalized, "destination.port", destination.get("port"));
        put(normalized, "dataSource", source.get("dataSource"));

        List<Map<String, Object>> pivots = pivotGenerator.generate(source);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", hit.id());
        result.put("timestamp", string(source.get("@timestamp")));
        result.put("ingestedAt", string(source.get("ingestedAt")));
        result.put("severity", HuntEventDTO.mapSeverity(
            event.get("severity") != null ? event.get("severity") : source.get("severity")));
        result.put("category", string(event.get("category")));
        result.put("action", string(event.get("action")));
        result.put("dataSource", string(source.get("dataSource")));
        result.put("dataset", string(nested(source, "data_stream").get("dataset")));
        result.put("host", string(host.get("name") != null ? host.get("name") : nested(source, "origin").get("host")));
        result.put("user", string(user.get("name") != null ? user.get("name") : nested(source, "origin").get("user")));
        result.put("sourceIp", string(sourceNetwork.get("ip")));
        result.put("destinationIp", string(destination.get("ip")));
        result.put("message", string(source.get("message") != null ? source.get("message") : source.get("name")));
        result.put("tenantId", string(source.getOrDefault("visibleBy", "authorized")));
        result.put("tenantName", string(source.getOrDefault("visibleBy", "Authorized scope")));
        result.put("alertCount", 0);
        result.put("normalized", normalized);
        result.put("sourceIndex", hit.index());
        result.put("schemaVersion", "1.0");
        result.put("integrityStatus", "unverified");
        result.put("rawRecord", includeRaw ? source : Map.of());
        result.put("redactedFields", Collections.emptyList());
        result.put("availablePivots", pivots);
        result.put("permissions", Map.of(
            "viewRaw", true,
            "addEvidence", true,
            "createInvestigation", true,
            "createIncident", true));

        // Compatibility shape retained for the existing flyout while it is migrated.
        result.put("fields", fieldClassifier.classify(source));
        result.put("raw", includeRaw ? source : null);
        result.put("pivots", pivots);
        return result;
    }

    private static void put(Map<String, Object> target, String key, Object value) {
        if (value != null) target.put(key, value);
    }

    private static String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> nested(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Collections.emptyMap();
    }
}
