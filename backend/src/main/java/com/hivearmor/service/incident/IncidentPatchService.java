package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.IncidentActivity;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.IncidentActivityRepository;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Service for patching incident metadata with optimistic concurrency control.
 *
 * <p>Implements INC-001: Metadata edit with optimistic concurrency.
 * Uses a version integer field in the incident document (not ES _version)
 * as the ETag for conflict detection.
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
public class IncidentPatchService {

    private static final Logger log = LoggerFactory.getLogger(IncidentPatchService.class);
    private static final String CLASSNAME = "IncidentPatchService";

    /** Fields that cannot be patched (system-managed). */
    private static final Set<String> IMMUTABLE_FIELDS = Set.of(
        "id", "version", "createdAt", "createdBy", "tenantId"
    );

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final IncidentActivityRepository activityRepository;

    @Autowired(required = false)
    private IncidentSseService sseService;

    public IncidentPatchService(OpensearchClientBuilder osClient,
                                MsspIndexResolver indexResolver,
                                ObjectMapper objectMapper,
                                IncidentActivityRepository activityRepository) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.activityRepository = activityRepository;
    }

    /** Exposes the OpenSearch client builder for reuse by the controller. */
    public OpensearchClientBuilder getOsClient() {
        return osClient;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Result object for a patch operation.
     */
    public static class PatchResult {
        private final boolean success;
        private final Map<String, Object> updatedIncident;
        private final Map<String, Object> conflictBody;
        private final boolean notFound;

        private PatchResult(boolean success, Map<String, Object> updatedIncident,
                            Map<String, Object> conflictBody, boolean notFound) {
            this.success = success;
            this.updatedIncident = updatedIncident;
            this.conflictBody = conflictBody;
            this.notFound = notFound;
        }

        public static PatchResult success(Map<String, Object> updatedIncident) {
            return new PatchResult(true, updatedIncident, null, false);
        }

        public static PatchResult conflict(Map<String, Object> conflictBody) {
            return new PatchResult(false, null, conflictBody, false);
        }

        public static PatchResult notFound() {
            return new PatchResult(false, null, null, true);
        }

        public boolean isSuccess() { return success; }
        public Map<String, Object> getUpdatedIncident() { return updatedIncident; }
        public Map<String, Object> getConflictBody() { return conflictBody; }
        public boolean isNotFound() { return notFound; }
    }

    /**
     * Patches an incident document with optimistic concurrency control.
     *
     * <p>Flow:
     * 1. Fetch incident from v3-hive-incident-* by ID
     * 2. Compare If-Match value against incident.version
     * 3. Merge sparse patch into incident document
     * 4. Increment version field
     * 5. Index updated document to OpenSearch
     * 6. Record field_change entries in activity feed
     * 7. Broadcast incident.updated via SSE
     * 8. Return updated incident
     *
     * @param incidentId          the incident document ID
     * @param patchBody           map of fields to update (sparse merge)
     * @param ifMatchVersion      the version from If-Match header
     * @param tenantIndexPattern  the tenant-scoped index pattern (or null for global)
     * @param actorId             the user performing the patch
     * @param tenantId            the numeric tenant ID for activity records
     * @return PatchResult indicating success, conflict, or not-found
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public PatchResult patchIncident(String incidentId, Map<String, Object> patchBody,
                                     int ifMatchVersion, String tenantIndexPattern,
                                     String actorId, Long tenantId) {
        final String ctx = CLASSNAME + ".patchIncident";

        try {
            // 1. Resolve index pattern
            String indexPattern = tenantIndexPattern != null
                ? tenantIndexPattern
                : indexResolver.resolveIndexPattern("incident");

            // 2. Fetch incident by ID
            SearchRequest request = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(qr -> qr.ids(i -> i.values(List.of(incidentId)))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return PatchResult.notFound();
            }

            Hit<Map> hit = response.hits().hits().get(0);
            Map<String, Object> source = hit.source() != null
                ? new LinkedHashMap<>((Map<String, Object>) hit.source())
                : new LinkedHashMap<>();
            String actualIndex = hit.index();

            // 3. Compare version (optimistic concurrency check)
            int currentVersion = extractVersion(source);
            if (currentVersion != ifMatchVersion) {
                Map<String, Object> conflictBody = buildConflictResponse(
                    source, patchBody, currentVersion, ifMatchVersion);
                return PatchResult.conflict(conflictBody);
            }

            // 4. Sparse merge patch into document
            Map<String, Object> changedFields = sparseMerge(source, patchBody);

            // 5. Increment version
            int newVersion = currentVersion + 1;
            source.put("version", newVersion);
            source.put("updatedAt", Instant.now().toString());

            // 6. Re-index updated document via updateByQuery script
            String updateScript = buildPainlessScript(source, changedFields, newVersion);
            Query updateQuery = Query.of(uq -> uq.ids(ids -> ids.values(List.of(incidentId))));
            osClient.execute(os -> {
                os.updateByQuery(updateQuery, actualIndex, updateScript);
                return null;
            });

            // 7. Record field_change activity entries
            recordFieldChanges(incidentId, changedFields, source, patchBody, actorId, tenantId);

            // 8. Broadcast incident.updated via SSE
            broadcastUpdate(incidentId, changedFields, actorId);

            return PatchResult.success(source);

        } catch (Exception e) {
            log.error("{}: failed to patch incident {}: {}", ctx, incidentId, e.getMessage(), e);
            throw new RuntimeException("Failed to patch incident: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Sparse merge logic (subtask 3.3)
    // =========================================================================

    /**
     * Performs a sparse merge: only updates fields present in the patch body.
     * For tags[], uses add/remove semantics rather than full replacement.
     *
     * @param source    the current document (mutated in place)
     * @param patchBody the patch fields
     * @return map of fieldName → oldValue for each changed field
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> sparseMerge(Map<String, Object> source, Map<String, Object> patchBody) {
        Map<String, Object> changedFields = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : patchBody.entrySet()) {
            String key = entry.getKey();
            Object newValue = entry.getValue();

            // Skip immutable fields
            if (IMMUTABLE_FIELDS.contains(key)) {
                continue;
            }

            // Special handling for tags — add/remove semantics
            if ("tags".equals(key) && newValue instanceof Map) {
                Map<String, Object> tagOps = (Map<String, Object>) newValue;
                Object oldTags = source.get("tags");
                List<String> currentTags = oldTags instanceof List
                    ? new ArrayList<>((List<String>) oldTags)
                    : new ArrayList<>();

                List<String> toAdd = tagOps.get("add") instanceof List
                    ? (List<String>) tagOps.get("add") : Collections.emptyList();
                List<String> toRemove = tagOps.get("remove") instanceof List
                    ? (List<String>) tagOps.get("remove") : Collections.emptyList();

                for (String tag : toAdd) {
                    if (!currentTags.contains(tag)) {
                        currentTags.add(tag);
                    }
                }
                currentTags.removeAll(toRemove);

                if (!Objects.equals(oldTags, currentTags)) {
                    changedFields.put("tags", oldTags);
                    source.put("tags", currentTags);
                }
                continue;
            }

            // Standard field-level merge
            Object oldValue = source.get(key);
            if (!Objects.equals(oldValue, newValue)) {
                changedFields.put(key, oldValue);
                source.put(key, newValue);
            }
        }

        return changedFields;
    }

    // =========================================================================
    // Conflict detection (subtask 3.4)
    // =========================================================================

    /**
     * Builds a 409 conflict response body with field-level diff.
     *
     * @param currentDoc      the current document in OpenSearch (theirs)
     * @param patchBody       the user's proposed changes (yours)
     * @param serverVersion   the current version on server
     * @param clientVersion   the version the client thought it was editing (base)
     * @return conflict response map
     */
    private Map<String, Object> buildConflictResponse(Map<String, Object> currentDoc,
                                                       Map<String, Object> patchBody,
                                                       int serverVersion,
                                                       int clientVersion) {
        Map<String, Object> conflictResponse = new LinkedHashMap<>();
        conflictResponse.put("conflict", true);
        conflictResponse.put("serverVersion", serverVersion);

        Map<String, Object> fields = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : patchBody.entrySet()) {
            String key = entry.getKey();
            if (IMMUTABLE_FIELDS.contains(key)) continue;

            Object yours = entry.getValue();
            Object theirs = currentDoc.get(key);

            // We don't have the base value (what the user originally saw), so we
            // note it as the version they thought they were editing against
            Map<String, Object> fieldDiff = new LinkedHashMap<>();
            fieldDiff.put("yours", yours);
            fieldDiff.put("theirs", theirs);
            fieldDiff.put("base", null); // base not available without client sending it
            fields.put(key, fieldDiff);
        }

        conflictResponse.put("fields", fields);
        return conflictResponse;
    }

    // =========================================================================
    // Activity recording (subtask 3.5)
    // =========================================================================

    /**
     * Records field_change activity entries for each changed field.
     */
    private void recordFieldChanges(String incidentId, Map<String, Object> changedFields,
                                     Map<String, Object> updatedDoc, Map<String, Object> patchBody,
                                     String actorId, Long tenantId) {
        for (Map.Entry<String, Object> entry : changedFields.entrySet()) {
            String field = entry.getKey();
            Object oldValue = entry.getValue();
            Object newValue = updatedDoc.get(field);

            try {
                IncidentActivity activity = new IncidentActivity();
                activity.setId(UUID.randomUUID().toString());
                activity.setIncidentId(incidentId);
                activity.setType("field_change");
                activity.setActorId(actorId);
                activity.setContent("Changed " + field + " from " + stringify(oldValue) + " to " + stringify(newValue));
                activity.setTenantId(tenantId);

                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("field", field);
                metadata.put("oldValue", oldValue);
                metadata.put("newValue", newValue);
                activity.setMetadata(objectMapper.writeValueAsString(metadata));

                activityRepository.save(activity);
            } catch (Exception e) {
                log.warn("{}: failed to record field_change for field '{}': {}",
                    CLASSNAME, field, e.getMessage());
            }
        }
    }

    // =========================================================================
    // SSE broadcast (subtask 3.6)
    // =========================================================================

    /**
     * Broadcasts incident.updated event via SSE to all connected clients.
     */
    private void broadcastUpdate(String incidentId, Map<String, Object> changedFields, String actorId) {
        if (sseService == null) {
            return; // SSE service not yet available (Task 10)
        }

        try {
            Map<String, Object> eventData = new LinkedHashMap<>();
            eventData.put("type", "incident.updated");
            eventData.put("timestamp", Instant.now().toString());
            eventData.put("data", changedFields);
            eventData.put("actor", actorId);

            sseService.broadcast(incidentId, "incident.updated", eventData, actorId);
        } catch (Exception e) {
            log.warn("{}: failed to broadcast SSE for incident {}: {}",
                CLASSNAME, incidentId, e.getMessage());
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Extracts the version integer from an incident document.
     */
    private int extractVersion(Map<String, Object> source) {
        Object v = source.get("version");
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        return 1; // default if missing
    }

    /**
     * Builds a Painless update script for all changed fields.
     * Since updateByQuery in this codebase uses inline string scripts,
     * we serialize values carefully to prevent injection.
     */
    @SuppressWarnings("unchecked")
    private String buildPainlessScript(Map<String, Object> source, Map<String, Object> changedFields, int newVersion) {
        StringBuilder script = new StringBuilder();
        script.append("ctx._source.version = ").append(newVersion).append("; ");
        script.append("ctx._source.updatedAt = '").append(Instant.now().toString()).append("'; ");

        for (String field : changedFields.keySet()) {
            Object newValue = source.get(field);
            script.append("ctx._source.").append(sanitizeFieldName(field)).append(" = ");
            script.append(toPainlessLiteral(newValue));
            script.append("; ");
        }

        return script.toString();
    }

    /**
     * Converts a Java value to a Painless script literal.
     */
    @SuppressWarnings("unchecked")
    private String toPainlessLiteral(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof String) {
            return "'" + sanitizeScriptValue((String) value) + "'";
        }
        if (value instanceof Number) {
            return value.toString();
        }
        if (value instanceof Boolean) {
            return value.toString();
        }
        if (value instanceof List) {
            List<?> list = (List<?>) value;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(toPainlessLiteral(list.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (value instanceof Map) {
            // For nested maps, serialize as inline map
            Map<String, Object> map = (Map<String, Object>) value;
            StringBuilder sb = new StringBuilder("[");
            boolean first = true;
            for (Map.Entry<String, Object> e : map.entrySet()) {
                if (!first) sb.append(", ");
                sb.append("'").append(sanitizeScriptValue(e.getKey())).append("': ");
                sb.append(toPainlessLiteral(e.getValue()));
                first = false;
            }
            sb.append("]");
            return sb.toString();
        }
        // Fallback: stringify
        return "'" + sanitizeScriptValue(value.toString()) + "'";
    }

    /**
     * Sanitizes a string value for use in Painless scripts to prevent injection.
     */
    private String sanitizeScriptValue(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'");
    }

    /**
     * Validates a field name for use in Painless script (no injection).
     */
    private String sanitizeFieldName(String field) {
        // Only allow alphanumeric and underscore
        return field.replaceAll("[^a-zA-Z0-9_]", "");
    }

    /**
     * Converts a value to a displayable string for activity content.
     */
    private String stringify(Object value) {
        if (value == null) return "null";
        if (value instanceof List) {
            return ((List<?>) value).toString();
        }
        return value.toString();
    }
}
