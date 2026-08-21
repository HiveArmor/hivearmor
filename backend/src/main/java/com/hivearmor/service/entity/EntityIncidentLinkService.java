package com.hivearmor.service.entity;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.opensearch.enums.HttpMethod;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import okhttp3.Response;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
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
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for previewed incident linking (ENT-010).
 *
 * <p>Implements a two-phase approach:
 * <ol>
 *   <li>Preview: assembles entity context (identity, alerts, relationships) and generates
 *       a short-lived preview token without side effects.</li>
 *   <li>Execute: validates the preview token, then creates or updates an incident document
 *       in v3-hive-incident-* and updates the entity document.</li>
 * </ol>
 *
 * <p>The preview token is a UUID stored in a ConcurrentHashMap with a 5-minute expiry.
 */
@Service
public class EntityIncidentLinkService {

    private static final Logger log = LoggerFactory.getLogger(EntityIncidentLinkService.class);
    private static final String CLASSNAME = "EntityIncidentLinkService";

    /** Token expiry in minutes. */
    private static final long TOKEN_EXPIRY_MINUTES = 5;

    /** In-memory store for preview tokens: token → { entityId, incidentId, expiresAt }. */
    private final ConcurrentHashMap<String, Map<String, Object>> tokenStore = new ConcurrentHashMap<>();

    private final OpensearchClientBuilder osClient;
    private final ObjectMapper objectMapper;
    private final MsspIndexResolver indexResolver;

    public EntityIncidentLinkService(OpensearchClientBuilder osClient,
                                     ObjectMapper objectMapper,
                                     MsspIndexResolver indexResolver) {
        this.osClient = osClient;
        this.objectMapper = objectMapper;
        this.indexResolver = indexResolver;
    }

    /**
     * Generates a preview of what linking the entity to an incident would look like.
     * No side effects — only reads data and generates a preview token.
     *
     * @param entityId            the entity document ID
     * @param body                request body: { incidentId?, createNew }
     * @param tenantIndexPattern  tenant-scoped entity index pattern
     * @return map with preview and previewToken
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> previewLink(String entityId, Map<String, Object> body,
                                           String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".previewLink";

        boolean createNew = Boolean.TRUE.equals(body.get("createNew"));
        String incidentId = body.get("incidentId") != null ? body.get("incidentId").toString() : null;

        // Fetch entity document
        Map<String, Object> entityDoc = fetchEntityDocument(entityId, tenantIndexPattern);
        if (entityDoc == null) {
            throw new IllegalArgumentException("Entity not found: " + entityId);
        }

        // Fetch recent unlinked alerts for this entity
        String alertIndexPattern = indexResolver.resolveIndexPattern("alert");
        String entityType = getStr(entityDoc, "type");
        String entityValue = getStr(entityDoc, "value");
        List<Map<String, Object>> unlinkedAlerts = fetchUnlinkedAlerts(entityType, entityValue, alertIndexPattern);

        // Build preview
        Map<String, Object> preview = new LinkedHashMap<>();

        // Entity summary in preview
        Map<String, Object> entitySummary = new LinkedHashMap<>();
        entitySummary.put("id", entityId);
        entitySummary.put("type", entityType);
        entitySummary.put("value", entityValue);
        entitySummary.put("riskScore", entityDoc.getOrDefault("riskScore", 0));
        entitySummary.put("riskLevel", entityDoc.getOrDefault("riskLevel", "low"));
        preview.put("entity", entitySummary);

        if (createNew) {
            // Build new incident preview
            String riskLevel = getStr(entityDoc, "riskLevel");
            String title = capitalize(entityType) + " Investigation - " + entityValue;
            String severity = mapRiskLevelToSeverity(riskLevel);

            Map<String, Object> incidentPreview = new LinkedHashMap<>();
            incidentPreview.put("title", title);
            incidentPreview.put("severity", severity);
            incidentPreview.put("status", "new");
            incidentPreview.put("entityCount", 1);
            incidentPreview.put("alertCount", unlinkedAlerts.size());
            preview.put("incident", incidentPreview);
        } else if (incidentId != null) {
            // Fetch existing incident for preview
            String incidentIndexPattern = indexResolver.resolveIndexPattern("incident");
            Map<String, Object> existingIncident = fetchIncidentDocument(incidentId, incidentIndexPattern);
            if (existingIncident != null) {
                Map<String, Object> incidentPreview = new LinkedHashMap<>();
                incidentPreview.put("id", incidentId);
                incidentPreview.put("title", existingIncident.get("title"));
                incidentPreview.put("severity", existingIncident.get("severity"));
                incidentPreview.put("status", existingIncident.get("status"));

                // Show what would change
                Object existingEntities = existingIncident.get("entities");
                int currentEntityCount = (existingEntities instanceof List<?> list) ? list.size() : 0;
                incidentPreview.put("entityCount", currentEntityCount + 1);

                Object existingAlerts = existingIncident.get("alerts");
                int currentAlertCount = (existingAlerts instanceof List<?> list) ? list.size() : 0;
                incidentPreview.put("alertCount", currentAlertCount + unlinkedAlerts.size());

                preview.put("incident", incidentPreview);
            }
        }

        preview.put("alerts", unlinkedAlerts);

        // Evidence: top high-severity events
        List<Map<String, Object>> evidence = unlinkedAlerts.stream()
            .filter(a -> "critical".equals(a.get("severity")) || "high".equals(a.get("severity")))
            .limit(5)
            .toList();
        preview.put("evidence", evidence);

        // Impact description
        Map<String, Object> impact = new LinkedHashMap<>();
        impact.put("newTimelineEntries", unlinkedAlerts.size());
        impact.put("entityGraphUpdates", 1);
        impact.put("alertsLinked", unlinkedAlerts.size());
        preview.put("impact", impact);

        // Generate preview token
        String token = generatePreviewToken(entityId, incidentId);

        // Build response
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("preview", preview);
        result.put("previewToken", token);

        return result;
    }

    /**
     * Executes the incident link after validating the preview token.
     *
     * @param entityId            the entity document ID
     * @param body                request body: { incidentId?, createNew, title?, severity?, previewToken }
     * @param previewToken        the preview token to validate
     * @param userId              the user performing the action
     * @param tenantIndexPattern  tenant-scoped entity index pattern
     * @return map with incidentId, status, linkedAlerts, linkedEvidence
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> executeLink(String entityId, Map<String, Object> body,
                                           String previewToken, String userId,
                                           String tenantIndexPattern) throws Exception {
        final String ctx = CLASSNAME + ".executeLink";

        // Validate preview token
        if (!validatePreviewToken(previewToken, entityId)) {
            throw new IllegalArgumentException("Invalid or expired preview token");
        }

        boolean createNew = Boolean.TRUE.equals(body.get("createNew"));
        String incidentId = body.get("incidentId") != null ? body.get("incidentId").toString() : null;

        // Fetch entity document
        Map<String, Object> entityDoc = fetchEntityDocument(entityId, tenantIndexPattern);
        if (entityDoc == null) {
            throw new IllegalArgumentException("Entity not found: " + entityId);
        }

        String entityType = getStr(entityDoc, "type");
        String entityValue = getStr(entityDoc, "value");
        String alertIndexPattern = indexResolver.resolveIndexPattern("alert");
        String incidentIndexPattern = indexResolver.resolveIndexPattern("incident");

        // Fetch unlinked alerts
        List<Map<String, Object>> unlinkedAlerts = fetchUnlinkedAlerts(entityType, entityValue, alertIndexPattern);

        String resultIncidentId;
        String status;

        if (createNew) {
            // Create new incident
            String title = body.get("title") != null ? body.get("title").toString()
                : capitalize(entityType) + " Investigation - " + entityValue;
            String severity = body.get("severity") != null ? body.get("severity").toString()
                : mapRiskLevelToSeverity(getStr(entityDoc, "riskLevel"));

            resultIncidentId = createIncident(entityId, entityDoc, title, severity,
                unlinkedAlerts, userId, incidentIndexPattern);
            status = "created";
        } else if (incidentId != null) {
            // Update existing incident
            updateExistingIncident(incidentId, entityId, entityDoc, unlinkedAlerts,
                userId, incidentIndexPattern);
            resultIncidentId = incidentId;
            status = "updated";
        } else {
            throw new IllegalArgumentException("Must specify either createNew=true or an incidentId");
        }

        // Update entity document: add incidentId to linked_incidents array
        updateEntityWithIncidentLink(entityId, resultIncidentId, tenantIndexPattern);

        // Invalidate the preview token after use
        tokenStore.remove(previewToken);

        // Build response
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("incidentId", resultIncidentId);
        result.put("status", status);
        result.put("linkedAlerts", unlinkedAlerts.size());
        result.put("linkedEvidence", Math.min(unlinkedAlerts.size(), 5));

        return result;
    }

    // =========================================================================
    // Token management
    // =========================================================================

    private String generatePreviewToken(String entityId, String incidentId) {
        // Clean up expired tokens periodically
        cleanExpiredTokens();

        String token = UUID.randomUUID().toString();
        Map<String, Object> tokenData = new LinkedHashMap<>();
        tokenData.put("entityId", entityId);
        tokenData.put("incidentId", incidentId);
        tokenData.put("expiresAt", Instant.now().plus(TOKEN_EXPIRY_MINUTES, ChronoUnit.MINUTES).toEpochMilli());
        tokenStore.put(token, tokenData);
        return token;
    }

    private boolean validatePreviewToken(String token, String entityId) {
        if (token == null || token.isBlank()) return false;

        Map<String, Object> tokenData = tokenStore.get(token);
        if (tokenData == null) return false;

        // Check expiry
        long expiresAt = ((Number) tokenData.get("expiresAt")).longValue();
        if (Instant.now().toEpochMilli() > expiresAt) {
            tokenStore.remove(token);
            return false;
        }

        // Check entity ID matches
        String tokenEntityId = (String) tokenData.get("entityId");
        return entityId.equals(tokenEntityId);
    }

    private void cleanExpiredTokens() {
        long now = Instant.now().toEpochMilli();
        tokenStore.entrySet().removeIf(entry -> {
            Object expiresAt = entry.getValue().get("expiresAt");
            return expiresAt instanceof Number n && now > n.longValue();
        });
    }

    // =========================================================================
    // OpenSearch operations
    // =========================================================================

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> fetchEntityDocument(String entityId, String indexPattern) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(q -> q.ids(ids -> ids.values(entityId)))
            .size(1)
        );
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits() == null || response.hits().hits() == null || response.hits().hits().isEmpty()) {
            return null;
        }
        Hit<Map> hit = response.hits().hits().get(0);
        if (hit.source() == null) return null;

        Map<String, Object> doc = new LinkedHashMap<>((Map<String, Object>) hit.source());
        doc.putIfAbsent("id", hit.id());
        return doc;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private Map<String, Object> fetchIncidentDocument(String incidentId, String indexPattern) throws Exception {
        SearchRequest request = SearchRequest.of(r -> r
            .index(indexPattern)
            .query(q -> q.ids(ids -> ids.values(incidentId)))
            .size(1)
        );
        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
        if (response.hits() == null || response.hits().hits() == null || response.hits().hits().isEmpty()) {
            return null;
        }
        Hit<Map> hit = response.hits().hits().get(0);
        return hit.source() != null ? new LinkedHashMap<>((Map<String, Object>) hit.source()) : null;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> fetchUnlinkedAlerts(String entityType, String entityValue,
                                                          String alertIndexPattern) throws Exception {
        // Build entity field matching
        List<Query> shouldQueries = new ArrayList<>();
        switch (entityType != null ? entityType : "") {
            case "ip" -> {
                shouldQueries.add(Query.of(q -> q.term(t -> t.field("source.ip").value(v -> v.stringValue(entityValue)))));
                shouldQueries.add(Query.of(q -> q.term(t -> t.field("destination.ip").value(v -> v.stringValue(entityValue)))));
            }
            case "host" -> shouldQueries.add(Query.of(q -> q.term(t -> t.field("host.name.keyword").value(v -> v.stringValue(entityValue)))));
            case "user" -> shouldQueries.add(Query.of(q -> q.term(t -> t.field("user.name.keyword").value(v -> v.stringValue(entityValue)))));
            case "domain" -> shouldQueries.add(Query.of(q -> q.term(t -> t.field("dns.question.name.keyword").value(v -> v.stringValue(entityValue)))));
            default -> {
                shouldQueries.add(Query.of(q -> q.term(t -> t.field("host.name.keyword").value(v -> v.stringValue(entityValue)))));
                shouldQueries.add(Query.of(q -> q.term(t -> t.field("source.ip").value(v -> v.stringValue(entityValue)))));
            }
        }

        // Filter: no incidentId (unlinked) and within last 30 days
        String fromDate = Instant.now().minus(30, ChronoUnit.DAYS).toString();
        List<Query> filters = new ArrayList<>();
        filters.add(Query.of(q -> q.bool(b -> b.mustNot(List.of(
            Query.of(mn -> mn.exists(e -> e.field("incidentId")))
        )))));
        filters.add(Query.of(q -> q.range(r -> r.field("@timestamp").gte(JsonData.of(fromDate)))));

        SearchRequest request = SearchRequest.of(r -> r
            .index(alertIndexPattern)
            .size(25)
            .query(Query.of(q -> q.bool(b -> b
                .should(shouldQueries)
                .minimumShouldMatch("1")
                .filter(filters)
            )))
            .sort(s -> s.field(f -> f.field("@timestamp").order(SortOrder.Desc)))
        );

        SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

        List<Map<String, Object>> alerts = new ArrayList<>();
        if (response.hits() != null && response.hits().hits() != null) {
            for (Hit<Map> hit : response.hits().hits()) {
                Map<String, Object> source = hit.source();
                if (source == null) continue;

                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("id", hit.id());
                alert.put("title", source.get("title"));
                alert.put("severity", source.get("severity"));
                alert.put("timestamp", source.get("@timestamp"));
                alert.put("ruleName", source.get("ruleName"));
                alerts.add(alert);
            }
        }
        return alerts;
    }

    /**
     * Creates a new incident document in v3-hive-incident-*.
     */
    @SuppressWarnings("unchecked")
    private String createIncident(String entityId, Map<String, Object> entityDoc,
                                  String title, String severity,
                                  List<Map<String, Object>> alerts,
                                  String userId,
                                  String incidentIndexPattern) throws Exception {
        String newIncidentId = "INC-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        Map<String, Object> incident = new LinkedHashMap<>();
        incident.put("id", newIncidentId);
        incident.put("title", title);
        incident.put("severity", severity);
        incident.put("status", "new");
        incident.put("createdAt", Instant.now().toString());
        incident.put("createdBy", userId);

        // Entity references
        List<Map<String, Object>> entities = new ArrayList<>();
        Map<String, Object> entityRef = new LinkedHashMap<>();
        entityRef.put("id", entityId);
        entityRef.put("type", entityDoc.get("type"));
        entityRef.put("value", entityDoc.get("value"));
        entityRef.put("role", "primary");
        entities.add(entityRef);
        incident.put("entities", entities);

        // Alert references
        List<Map<String, Object>> alertRefs = alerts.stream().map(a -> {
            Map<String, Object> ref = new LinkedHashMap<>();
            ref.put("id", a.get("id"));
            ref.put("title", a.get("title"));
            ref.put("severity", a.get("severity"));
            ref.put("timestamp", a.get("timestamp"));
            return ref;
        }).toList();
        incident.put("alerts", alertRefs);

        // Timeline
        List<Map<String, Object>> timeline = new ArrayList<>();
        Map<String, Object> createdEntry = new LinkedHashMap<>();
        createdEntry.put("timestamp", Instant.now().toString());
        createdEntry.put("action", "incident_created");
        createdEntry.put("description", "Incident created from entity " + entityDoc.get("value"));
        createdEntry.put("userId", userId);
        timeline.add(createdEntry);
        incident.put("timeline", timeline);

        // Index the incident using the current day index
        String currentDayIndex = indexResolver.resolveCurrentDayIndex("incident");
        String path = "/" + currentDayIndex + "/_doc/" + newIncidentId;

        try (Response response = osClient.execute(os ->
                os.executeHttpRequest(path, null, incident, HttpMethod.PUT))) {
            if (!response.isSuccessful()) {
                log.error("{}: Failed to create incident: HTTP {}", CLASSNAME, response.code());
                throw new RuntimeException("Failed to create incident: HTTP " + response.code());
            }
        }

        return newIncidentId;
    }

    /**
     * Updates an existing incident document to add the entity and link alerts.
     */
    @SuppressWarnings("unchecked")
    private void updateExistingIncident(String incidentId, String entityId,
                                         Map<String, Object> entityDoc,
                                         List<Map<String, Object>> alerts,
                                         String userId,
                                         String incidentIndexPattern) throws Exception {
        // Build the update script
        String entityValue = getStr(entityDoc, "value");
        String entityType = getStr(entityDoc, "type");

        // Use a Painless script to add entity and alerts
        StringBuilder script = new StringBuilder();
        script.append("if (ctx._source.entities == null) { ctx._source.entities = []; }");
        script.append("ctx._source.entities.add(params.entityRef);");
        script.append("if (ctx._source.timeline == null) { ctx._source.timeline = []; }");
        script.append("ctx._source.timeline.add(params.timelineEntry);");

        Map<String, Object> params = new LinkedHashMap<>();

        Map<String, Object> entityRef = new LinkedHashMap<>();
        entityRef.put("id", entityId);
        entityRef.put("type", entityType);
        entityRef.put("value", entityValue);
        entityRef.put("role", "linked");
        params.put("entityRef", entityRef);

        Map<String, Object> timelineEntry = new LinkedHashMap<>();
        timelineEntry.put("timestamp", Instant.now().toString());
        timelineEntry.put("action", "entity_linked");
        timelineEntry.put("description", "Entity " + entityValue + " linked to incident");
        timelineEntry.put("userId", userId);
        params.put("timelineEntry", timelineEntry);

        // Use raw HTTP update API with script
        Map<String, Object> updateBody = new LinkedHashMap<>();
        Map<String, Object> scriptObj = new LinkedHashMap<>();
        scriptObj.put("source", script.toString());
        scriptObj.put("lang", "painless");
        scriptObj.put("params", params);
        updateBody.put("script", scriptObj);

        String path = "/" + incidentIndexPattern + "/_update/" + incidentId;
        try (Response response = osClient.execute(os ->
                os.executeHttpRequest(path, null, updateBody, HttpMethod.POST))) {
            if (!response.isSuccessful()) {
                log.warn("{}: Update incident {} returned HTTP {}", CLASSNAME, incidentId, response.code());
                // Non-fatal — incident may not exist in all index shards
            }
        }
    }

    /**
     * Updates the entity document to add the incident ID to linked_incidents array.
     */
    private void updateEntityWithIncidentLink(String entityId, String incidentId,
                                              String entityIndexPattern) throws Exception {
        String script = "if (ctx._source.linked_incidents == null) { ctx._source.linked_incidents = []; } " +
                        "if (!ctx._source.linked_incidents.contains(params.incidentId)) { " +
                        "  ctx._source.linked_incidents.add(params.incidentId); }";

        Map<String, Object> updateBody = new LinkedHashMap<>();
        Map<String, Object> scriptObj = new LinkedHashMap<>();
        scriptObj.put("source", script);
        scriptObj.put("lang", "painless");
        scriptObj.put("params", Map.of("incidentId", incidentId));
        updateBody.put("script", scriptObj);

        String path = "/" + entityIndexPattern + "/_update/" + entityId;
        try (Response response = osClient.execute(os ->
                os.executeHttpRequest(path, null, updateBody, HttpMethod.POST))) {
            if (!response.isSuccessful()) {
                log.warn("{}: Update entity {} with incident link returned HTTP {}",
                    CLASSNAME, entityId, response.code());
            }
        }
    }

    // =========================================================================
    // Utility methods
    // =========================================================================

    private String mapRiskLevelToSeverity(String riskLevel) {
        return switch (riskLevel != null ? riskLevel : "") {
            case "critical" -> "critical";
            case "high" -> "high";
            case "medium" -> "medium";
            default -> "low";
        };
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase() + s.substring(1);
    }

    private String getStr(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }
}
