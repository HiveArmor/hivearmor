package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.IncidentActivity;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.IncidentActivityRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Service for incident response action catalog, preview, and execution.
 *
 * <p>Implements INC-005: Response action catalog within the incident workbench.
 * Provides a catalog of available response actions filtered by incident context,
 * preview with impact estimation and token generation, and execution with
 * activity recording and SSE broadcast.
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
public class IncidentResponseActionService {

    private static final Logger log = LoggerFactory.getLogger(IncidentResponseActionService.class);
    private static final String CLASSNAME = "IncidentResponseActionService";

    /** Preview token expiry duration (5 minutes). */
    private static final long PREVIEW_TOKEN_EXPIRY_SECONDS = 300;

    /** HMAC key for preview token generation. Uses a fixed key for simplicity;
     *  production should use a rotating secret from config. */
    private static final String TOKEN_SECRET = System.getenv("HA_RESPONSE_ACTION_SECRET") != null
        ? System.getenv("HA_RESPONSE_ACTION_SECRET")
        : "ha-response-action-default-secret-key-2026";

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final IncidentActivityRepository activityRepository;

    @Autowired(required = false)
    private IncidentSseService sseService;

    public IncidentResponseActionService(OpensearchClientBuilder osClient,
                                         MsspIndexResolver indexResolver,
                                         ObjectMapper objectMapper,
                                         IncidentActivityRepository activityRepository) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.activityRepository = activityRepository;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Lists available response actions for an incident, filtered by entity compatibility.
     *
     * @param incidentId the incident identifier
     * @param tenantId   the numeric tenant ID
     * @return map containing action catalog grouped by category
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> listActions(String incidentId, Long tenantId) {
        final String ctx = CLASSNAME + ".listActions";

        try {
            // Fetch incident entities to determine applicable actions
            String indexPattern = indexResolver.resolveIndexPattern("incident");
            Map<String, Object> incident = fetchIncident(indexPattern, incidentId);

            Set<String> entityTypes = new HashSet<>();
            if (incident != null) {
                entityTypes = detectEntityTypes(incident);
            }

            // Build action catalog filtered by available entities
            List<Map<String, Object>> actions = buildActionCatalog(incidentId, entityTypes);

            // Group by category
            Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
            grouped.put("containment", new ArrayList<>());
            grouped.put("eradication", new ArrayList<>());
            grouped.put("recovery", new ArrayList<>());
            grouped.put("investigation", new ArrayList<>());

            for (Map<String, Object> action : actions) {
                String category = action.get("category") instanceof String c ? c : "investigation";
                grouped.computeIfAbsent(category, k -> new ArrayList<>()).add(action);
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("incidentId", incidentId);
            result.put("actions", actions);
            result.put("categories", grouped);
            result.put("total", actions.size());
            return result;

        } catch (Exception e) {
            log.error("{}: failed to list actions for incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to list response actions: " + e.getMessage(), e);
        }
    }

    /**
     * Previews a response action: resolves targets, estimates impact, generates preview token.
     *
     * @param incidentId the incident identifier
     * @param actionId   the action identifier
     * @param tenantId   the numeric tenant ID
     * @return preview result with targets, impact estimate, and previewToken
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Map<String, Object> previewAction(String incidentId, String actionId, Long tenantId) {
        final String ctx = CLASSNAME + ".previewAction";

        try {
            // Fetch incident
            String indexPattern = indexResolver.resolveIndexPattern("incident");
            Map<String, Object> incident = fetchIncident(indexPattern, incidentId);
            if (incident == null) {
                return Map.of("error", "Incident not found", "status", 404);
            }

            // Find action definition
            Map<String, Object> actionDef = findActionDefinition(actionId);
            if (actionDef == null) {
                return Map.of("error", "Action not found: " + actionId, "status", 404);
            }

            // Resolve targets from incident entities
            List<Map<String, Object>> targets = resolveTargets(incident, actionDef);

            // Estimate impact
            Map<String, Object> impact = estimateImpact(actionDef, targets);

            // Generate preview token (HMAC-based, 5-minute expiry)
            String previewToken = generatePreviewToken(incidentId, actionId, tenantId);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("incidentId", incidentId);
            result.put("actionId", actionId);
            result.put("actionName", actionDef.get("name"));
            result.put("category", actionDef.get("category"));
            result.put("targets", targets);
            result.put("impact", impact);
            result.put("previewToken", previewToken);
            result.put("expiresAt", Instant.now().plus(PREVIEW_TOKEN_EXPIRY_SECONDS, ChronoUnit.SECONDS).toString());
            return result;

        } catch (Exception e) {
            log.error("{}: failed to preview action {} for incident {}: {}", ctx, actionId, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to preview action: " + e.getMessage(), e);
        }
    }

    /**
     * Executes a response action after validating the preview token.
     *
     * @param incidentId the incident identifier
     * @param actionId   the action identifier
     * @param body       execution body containing previewToken and optional parameters
     * @param userId     the executing user
     * @param tenantId   the numeric tenant ID
     * @return execution result with job status
     */
    public Map<String, Object> executeAction(String incidentId, String actionId,
                                              Map<String, Object> body, String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".executeAction";

        try {
            // Validate preview token
            String previewToken = body.get("previewToken") instanceof String t ? t : null;
            if (previewToken == null || previewToken.isBlank()) {
                return Map.of("error", "previewToken is required", "status", 400);
            }

            if (!validatePreviewToken(previewToken, incidentId, actionId, tenantId)) {
                return Map.of("error", "Invalid or expired previewToken", "status", 403);
            }

            // Find action definition
            Map<String, Object> actionDef = findActionDefinition(actionId);
            if (actionDef == null) {
                return Map.of("error", "Action not found: " + actionId, "status", 404);
            }

            // Submit job (stub — in production this would dispatch to an action executor)
            String jobId = UUID.randomUUID().toString();
            Instant submittedAt = Instant.now();

            // Record response_action activity
            recordResponseActionActivity(incidentId, actionId, actionDef, userId, tenantId, jobId);

            // Broadcast via SSE
            broadcastActionExecution(incidentId, actionId, actionDef, userId, jobId);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("incidentId", incidentId);
            result.put("actionId", actionId);
            result.put("actionName", actionDef.get("name"));
            result.put("jobId", jobId);
            result.put("status", "submitted");
            result.put("submittedAt", submittedAt.toString());
            result.put("submittedBy", userId);
            return result;

        } catch (Exception e) {
            log.error("{}: failed to execute action {} for incident {}: {}", ctx, actionId, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to execute action: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Action catalog
    // =========================================================================

    /**
     * Builds the response action catalog based on available entity types.
     */
    private List<Map<String, Object>> buildActionCatalog(String incidentId, Set<String> entityTypes) {
        List<Map<String, Object>> catalog = new ArrayList<>();

        // Containment actions
        if (entityTypes.contains("host") || entityTypes.contains("ip")) {
            catalog.add(buildAction("isolate-host", "Isolate Host", "containment",
                "Isolate affected host from network", "host",
                "Prevents lateral movement by disconnecting the host"));
            catalog.add(buildAction("block-ip", "Block IP Address", "containment",
                "Block malicious IP at firewall", "ip",
                "Prevents communication with known-bad IP"));
        }
        if (entityTypes.contains("user")) {
            catalog.add(buildAction("disable-account", "Disable User Account", "containment",
                "Disable compromised user account", "user",
                "Prevents further unauthorized access"));
        }

        // Eradication actions
        if (entityTypes.contains("host")) {
            catalog.add(buildAction("remove-malware", "Remove Malware", "eradication",
                "Remove detected malware from host", "host",
                "Eliminates persistence mechanism"));
        }
        if (entityTypes.contains("user")) {
            catalog.add(buildAction("reset-credentials", "Reset Credentials", "eradication",
                "Force password reset for compromised account", "user",
                "Invalidates stolen credentials"));
        }

        // Recovery actions
        if (entityTypes.contains("host")) {
            catalog.add(buildAction("restore-backup", "Restore from Backup", "recovery",
                "Restore host to known-good state from backup", "host",
                "Returns system to pre-compromise state"));
        }
        if (entityTypes.contains("user")) {
            catalog.add(buildAction("re-enable-account", "Re-enable Account", "recovery",
                "Re-enable user account after remediation", "user",
                "Restores user access after verification"));
        }

        // Investigation actions (always available)
        catalog.add(buildAction("collect-forensics", "Collect Forensics", "investigation",
            "Collect forensic artifacts from affected systems", "any",
            "Preserves evidence for analysis"));
        catalog.add(buildAction("expand-search", "Expand Search Scope", "investigation",
            "Search for additional indicators across infrastructure", "any",
            "Identifies additional compromise indicators"));

        return catalog;
    }

    private Map<String, Object> buildAction(String id, String name, String category,
                                             String description, String targetType,
                                             String impactDescription) {
        Map<String, Object> action = new LinkedHashMap<>();
        action.put("id", id);
        action.put("name", name);
        action.put("category", category);
        action.put("description", description);
        action.put("targetType", targetType);
        action.put("impactDescription", impactDescription);
        action.put("requiresApproval", "containment".equals(category) || "eradication".equals(category));
        return action;
    }

    /**
     * Finds an action definition by ID from the built-in catalog.
     */
    private Map<String, Object> findActionDefinition(String actionId) {
        // Build full catalog with all entity types to find the action
        Set<String> allTypes = Set.of("host", "ip", "user");
        List<Map<String, Object>> catalog = buildActionCatalog("", allTypes);
        for (Map<String, Object> action : catalog) {
            if (actionId.equals(action.get("id"))) {
                return action;
            }
        }
        return null;
    }

    // =========================================================================
    // Entity and target resolution
    // =========================================================================

    /**
     * Detects entity types present in the incident document.
     */
    @SuppressWarnings("unchecked")
    private Set<String> detectEntityTypes(Map<String, Object> incident) {
        Set<String> types = new HashSet<>();

        if (incident.get("entities") instanceof List<?> entities) {
            for (Object entity : entities) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object type = entityMap.get("type");
                    if (type instanceof String t) types.add(t.toLowerCase());
                    // Infer type from value if not explicitly set
                    Object value = entityMap.get("value");
                    if (value instanceof String v) {
                        if (v.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) types.add("ip");
                        else if (v.contains("-") && (v.contains("WKS") || v.contains("SRV") || v.contains("LPT")))
                            types.add("host");
                        else if (v.contains(".") || v.contains("@")) types.add("user");
                    }
                }
            }
        }

        if (incident.get("linked_entities") instanceof List<?> linked) {
            for (Object entity : linked) {
                if (entity instanceof Map<?, ?> entityMap) {
                    Object type = entityMap.get("type");
                    if (type instanceof String t) types.add(t.toLowerCase());
                }
            }
        }

        // Default: at least add common types if entities exist
        if (types.isEmpty() && incident.get("entities") != null) {
            types.add("host");
            types.add("ip");
            types.add("user");
        }

        return types;
    }

    /**
     * Resolves action targets from incident entities.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> resolveTargets(Map<String, Object> incident, Map<String, Object> actionDef) {
        List<Map<String, Object>> targets = new ArrayList<>();
        String targetType = actionDef.get("targetType") instanceof String t ? t : "any";

        if (incident.get("entities") instanceof List<?> entities) {
            for (Object entity : entities) {
                if (entity instanceof Map<?, ?> entityMap) {
                    String type = entityMap.get("type") instanceof String t ? t : "unknown";
                    if ("any".equals(targetType) || targetType.equalsIgnoreCase(type)) {
                        Map<String, Object> target = new LinkedHashMap<>();
                        target.put("type", type);
                        target.put("value", entityMap.get("value"));
                        target.put("id", entityMap.get("id") != null ? entityMap.get("id") : entityMap.get("value"));
                        targets.add(target);
                    }
                }
            }
        }

        return targets;
    }

    /**
     * Estimates the impact of executing an action.
     */
    private Map<String, Object> estimateImpact(Map<String, Object> actionDef, List<Map<String, Object>> targets) {
        Map<String, Object> impact = new LinkedHashMap<>();
        impact.put("targetCount", targets.size());
        impact.put("severity", "containment".equals(actionDef.get("category"))
            || "eradication".equals(actionDef.get("category")) ? "high" : "low");
        impact.put("reversible", !"eradication".equals(actionDef.get("category")));
        impact.put("description", actionDef.get("impactDescription"));
        impact.put("estimatedDuration", "30-120 seconds");
        return impact;
    }

    // =========================================================================
    // Token management
    // =========================================================================

    /**
     * Generates an HMAC-based preview token with 5-minute expiry.
     */
    private String generatePreviewToken(String incidentId, String actionId, Long tenantId) {
        try {
            long expiresAt = Instant.now().plusSeconds(PREVIEW_TOKEN_EXPIRY_SECONDS).toEpochMilli();
            String payload = incidentId + "|" + actionId + "|" + tenantId + "|" + expiresAt;
            String signature = hmacSha256(payload);
            // Token format: base64(payload):signature
            String encodedPayload = Base64.getEncoder()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
            return encodedPayload + ":" + signature;
        } catch (Exception e) {
            log.error("{}: failed to generate preview token: {}", CLASSNAME, e.getMessage());
            throw new RuntimeException("Failed to generate preview token", e);
        }
    }

    /**
     * Validates a preview token — checks signature and expiry.
     */
    private boolean validatePreviewToken(String token, String incidentId, String actionId, Long tenantId) {
        try {
            String[] parts = token.split(":");
            if (parts.length != 2) return false;

            String encodedPayload = parts[0];
            String signature = parts[1];

            String payload = new String(Base64.getDecoder().decode(encodedPayload), StandardCharsets.UTF_8);

            // Verify signature
            String expectedSignature = hmacSha256(payload);
            if (!signature.equals(expectedSignature)) return false;

            // Parse and verify payload
            String[] payloadParts = payload.split("\\|");
            if (payloadParts.length != 4) return false;

            String tokenIncidentId = payloadParts[0];
            String tokenActionId = payloadParts[1];
            long tokenTenantId = Long.parseLong(payloadParts[2]);
            long expiresAt = Long.parseLong(payloadParts[3]);

            // Verify matches
            if (!incidentId.equals(tokenIncidentId)) return false;
            if (!actionId.equals(tokenActionId)) return false;
            if (tenantId != tokenTenantId) return false;

            // Check expiry
            return Instant.now().toEpochMilli() < expiresAt;

        } catch (Exception e) {
            log.warn("{}: preview token validation failed: {}", CLASSNAME, e.getMessage());
            return false;
        }
    }

    /**
     * Generates an HMAC-SHA256 signature for the given data.
     */
    private String hmacSha256(String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        SecretKeySpec keySpec = new SecretKeySpec(
            TOKEN_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        mac.init(keySpec);
        byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    }

    // =========================================================================
    // Activity and SSE
    // =========================================================================

    /**
     * Records a response_action activity entry.
     */
    private void recordResponseActionActivity(String incidentId, String actionId,
                                               Map<String, Object> actionDef,
                                               String userId, Long tenantId, String jobId) {
        try {
            IncidentActivity activity = new IncidentActivity();
            activity.setId(UUID.randomUUID().toString());
            activity.setIncidentId(incidentId);
            activity.setType("response_action");
            activity.setActorId(userId);
            activity.setContent("Executed response action: " + actionDef.get("name"));
            activity.setTenantId(tenantId);

            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("actionId", actionId);
            metadata.put("actionName", actionDef.get("name"));
            metadata.put("category", actionDef.get("category"));
            metadata.put("jobId", jobId);
            metadata.put("status", "submitted");
            activity.setMetadata(objectMapper.writeValueAsString(metadata));

            activityRepository.save(activity);
        } catch (Exception e) {
            log.warn("{}: failed to record response action activity: {}", CLASSNAME, e.getMessage());
        }
    }

    /**
     * Broadcasts action execution via SSE.
     */
    private void broadcastActionExecution(String incidentId, String actionId,
                                           Map<String, Object> actionDef,
                                           String userId, String jobId) {
        if (sseService == null) return;
        try {
            Map<String, Object> eventData = new LinkedHashMap<>();
            eventData.put("type", "response_action.executed");
            eventData.put("timestamp", Instant.now().toString());
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("actionId", actionId);
            data.put("actionName", actionDef.get("name"));
            data.put("jobId", jobId);
            data.put("status", "submitted");
            eventData.put("data", data);
            eventData.put("actor", userId);
            sseService.broadcast(incidentId, "response_action.executed", eventData, userId);
        } catch (Exception e) {
            log.warn("{}: failed to broadcast SSE for response action: {}", CLASSNAME, e.getMessage());
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

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
}
