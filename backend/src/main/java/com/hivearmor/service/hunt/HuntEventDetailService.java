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
            .size(1);
        // Raw JSON needs the full physical document. Bounded ECS-only includes strip HiveArmor fields.
        if (!includeRaw) {
            List<String> logical = fieldRegistry.boundedProjection(List.of(
                "host.ip", "host.os.name", "user.domain", "source.port", "destination.port",
                "process.name", "process.command_line", "process.pid", "file.name", "file.path",
                "file.hash.sha256", "network.direction", "network.transport", "network.bytes"
            ));
            builder.source(s -> s.filter(f -> f.includes(fieldRegistry.sourceIncludes(logical))));
        }
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
        Map<String, Object> origin = nested(source, "origin");
        Map<String, Object> target = nested(source, "target");
        Map<String, Object> log = nested(source, "log");

        Object severityValue = event.get("severity") != null ? event.get("severity") : source.get("severity");
        String category = firstNonBlank(string(event.get("category")), string(source.get("dataType")), string(log.get("channel")));
        String action = firstNonBlank(string(event.get("action")), string(source.get("action")), string(log.get("eventName")));
        String hostName = firstNonBlank(
            string(host.get("name")),
            string(origin.get("host")),
            string(source.get("origin.host")),
            string(log.get("computer")));
        String userName = firstNonBlank(
            string(user.get("name")),
            string(origin.get("user")),
            string(source.get("origin.user")),
            string(target.get("user")),
            string(source.get("target.user")),
            string(log.get("eventDataTargetUserName")),
            string(log.get("eventDataSubjectUserName")));
        String sourceIp = firstNonBlank(
            string(sourceNetwork.get("ip")),
            string(origin.get("ip")),
            string(source.get("origin.ip")),
            string(log.get("eventDataIpAddress")));
        String destinationIp = firstNonBlank(
            string(destination.get("ip")),
            string(target.get("ip")),
            string(source.get("target.ip")));
        String message = firstNonBlank(
            string(source.get("message")),
            string(source.get("name")),
            string(log.get("eventName")));
        String dataset = firstNonBlank(
            string(nested(source, "data_stream").get("dataset")),
            string(source.get("dataType")),
            string(log.get("channel")));
        String tenantId = firstNonBlank(string(source.get("tenantId")), string(source.get("visibleBy")), "authorized");
        String tenantName = firstNonBlank(string(source.get("tenantName")), string(source.get("visibleBy")), "Authorized scope");

        Map<String, Object> normalized = new LinkedHashMap<>();
        put(normalized, "@timestamp", source.get("@timestamp"));
        put(normalized, "event.severity", severityValue);
        put(normalized, "event.category", category);
        put(normalized, "event.action", action);
        put(normalized, "event.outcome", firstNonBlank(string(event.get("outcome")), string(source.get("actionResult"))));
        put(normalized, "host.name", hostName);
        put(normalized, "host.ip", host.get("ip"));
        put(normalized, "user.name", userName);
        put(normalized, "user.domain", firstNonBlank(string(user.get("domain")), string(origin.get("domain")), string(log.get("eventDataSubjectDomainName"))));
        put(normalized, "source.ip", sourceIp);
        put(normalized, "source.port", sourceNetwork.get("port"));
        put(normalized, "destination.ip", destinationIp);
        put(normalized, "destination.port", destination.get("port"));
        put(normalized, "dataSource", source.get("dataSource"));
        put(normalized, "dataType", source.get("dataType"));
        put(normalized, "log.eventCode", log.get("eventCode"));
        put(normalized, "log.channel", log.get("channel"));

        List<Map<String, Object>> pivots = pivotGenerator.generate(source);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", hit.id());
        result.put("timestamp", string(source.get("@timestamp")));
        result.put("ingestedAt", string(source.get("ingestedAt")));
        result.put("severity", HuntEventDTO.mapSeverity(severityValue));
        result.put("category", category);
        result.put("action", action);
        result.put("dataSource", string(source.get("dataSource")));
        result.put("dataset", dataset);
        result.put("host", hostName);
        result.put("user", userName);
        result.put("sourceIp", sourceIp);
        result.put("destinationIp", destinationIp);
        result.put("message", message);
        result.put("tenantId", tenantId);
        result.put("tenantName", tenantName);
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
        if (value != null) {
            if (value instanceof String text) {
                String trimmed = text.trim();
                if (trimmed.isEmpty() || "-".equals(trimmed)) {
                    return;
                }
                target.put(key, trimmed);
                return;
            }
            target.put(key, value);
        }
    }

    private static String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null) {
                String trimmed = value.trim();
                if (!trimmed.isEmpty() && !"-".equals(trimmed)) {
                    return trimmed;
                }
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> nested(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Collections.emptyMap();
    }
}
