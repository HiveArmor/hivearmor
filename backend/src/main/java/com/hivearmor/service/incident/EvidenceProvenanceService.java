package com.hivearmor.service.incident;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.EvidenceCustody;
import com.hivearmor.domain.IncidentActivity;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.repository.EvidenceCustodyRepository;
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
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Service for evidence provenance and chain of custody management.
 *
 * <p>Implements INC-007: Evidence provenance and custody within the incident workbench.
 * Manages append-only custody records, validates evidence belongs to an incident,
 * supports classification updates, and maintains the complete chain of custody.
 *
 * <p>Sprint 43 — Incident Workbench.
 */
@Service
@Transactional
public class EvidenceProvenanceService {

    private static final Logger log = LoggerFactory.getLogger(EvidenceProvenanceService.class);
    private static final String CLASSNAME = "EvidenceProvenanceService";

    /** Allowed custody actions (append-only). */
    private static final Set<String> VALID_CUSTODY_ACTIONS = Set.of(
        "collected", "analyzed", "transferred", "archived", "exported"
    );

    /** Allowed evidence classifications. */
    private static final Set<String> VALID_CLASSIFICATIONS = Set.of(
        "unclassified", "internal", "confidential", "restricted"
    );

    private final EvidenceCustodyRepository custodyRepository;
    private final IncidentActivityRepository activityRepository;
    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private IncidentSseService sseService;

    public EvidenceProvenanceService(EvidenceCustodyRepository custodyRepository,
                                     IncidentActivityRepository activityRepository,
                                     OpensearchClientBuilder osClient,
                                     MsspIndexResolver indexResolver,
                                     ObjectMapper objectMapper) {
        this.custodyRepository = custodyRepository;
        this.activityRepository = activityRepository;
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
    }

    /** Exposes the OpenSearch client builder for reuse by the controller. */
    public OpensearchClientBuilder getOsClient() {
        return osClient;
    }

    // =========================================================================
    // Result types
    // =========================================================================

    public static class CustodyResult {
        private final boolean success;
        private final Map<String, Object> data;
        private final String errorMessage;
        private final int errorStatus;

        private CustodyResult(boolean success, Map<String, Object> data, String errorMessage, int errorStatus) {
            this.success = success;
            this.data = data;
            this.errorMessage = errorMessage;
            this.errorStatus = errorStatus;
        }

        public static CustodyResult success(Map<String, Object> data) {
            return new CustodyResult(true, data, null, 0);
        }

        public static CustodyResult error(String message, int status) {
            return new CustodyResult(false, null, message, status);
        }

        public boolean isSuccess() { return success; }
        public Map<String, Object> getData() { return data; }
        public String getErrorMessage() { return errorMessage; }
        public int getErrorStatus() { return errorStatus; }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Adds a custody event to an evidence item's chain.
     *
     * @param incidentId the incident identifier
     * @param evidenceId the evidence item identifier
     * @param actor      the actor performing the custody action
     * @param action     the custody action (collected, analyzed, transferred, archived, exported)
     * @param notes      optional notes about the custody event
     * @param tenantId   the tenant identifier
     * @return the created custody event or error
     */
    public CustodyResult addCustodyEvent(String incidentId, String evidenceId,
                                          String actor, String action, String notes, Long tenantId) {
        final String ctx = CLASSNAME + ".addCustodyEvent";

        try {
            // Validate action
            if (action == null || !VALID_CUSTODY_ACTIONS.contains(action.toLowerCase())) {
                return CustodyResult.error(
                    "Invalid custody action. Allowed: " + VALID_CUSTODY_ACTIONS, 400);
            }

            // Validate evidence belongs to incident
            if (!validateEvidenceBelongsToIncident(incidentId, evidenceId)) {
                return CustodyResult.error(
                    "Evidence " + evidenceId + " does not belong to incident " + incidentId, 404);
            }

            // Create custody record
            EvidenceCustody custody = new EvidenceCustody();
            custody.setId(UUID.randomUUID().toString());
            custody.setEvidenceId(evidenceId);
            custody.setIncidentId(incidentId);
            custody.setActor(actor);
            custody.setAction(action.toLowerCase());
            custody.setNotes(notes);
            custody.setTenantId(tenantId);

            custody = custodyRepository.save(custody);

            // Broadcast via SSE
            Map<String, Object> custodyMap = custodyToMap(custody);
            broadcastCustodyEvent(incidentId, evidenceId, custodyMap, actor);

            return CustodyResult.success(custodyMap);

        } catch (Exception e) {
            log.error("{}: failed to add custody event for evidence {}: {}", ctx, evidenceId, e.getMessage(), e);
            throw new RuntimeException("Failed to add custody event: " + e.getMessage(), e);
        }
    }

    /**
     * Updates the classification of an evidence item and auto-creates a custody event.
     *
     * @param incidentId     the incident identifier
     * @param evidenceId     the evidence item identifier
     * @param classification the new classification
     * @param notes          optional notes about the classification change
     * @param userId         the user making the change
     * @param tenantId       the tenant identifier
     * @return the updated evidence or error
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    public CustodyResult updateClassification(String incidentId, String evidenceId,
                                               String classification, String notes,
                                               String userId, Long tenantId) {
        final String ctx = CLASSNAME + ".updateClassification";

        try {
            // Validate classification
            if (classification == null || !VALID_CLASSIFICATIONS.contains(classification.toLowerCase())) {
                return CustodyResult.error(
                    "Invalid classification. Allowed: " + VALID_CLASSIFICATIONS, 400);
            }

            // Validate evidence belongs to incident
            if (!validateEvidenceBelongsToIncident(incidentId, evidenceId)) {
                return CustodyResult.error(
                    "Evidence " + evidenceId + " does not belong to incident " + incidentId, 404);
            }

            // Update evidence document in OpenSearch (v3-hive-evidence-*)
            String evidenceIndexPattern = indexResolver.resolveIndexPattern("evidence");
            String updateScript = "ctx._source.classification = '"
                + classification.toLowerCase().replace("'", "\\'") + "'; "
                + "ctx._source.classifiedAt = '" + Instant.now().toString() + "'; "
                + "ctx._source.classifiedBy = '" + userId.replace("'", "\\'") + "'";

            Query updateQuery = Query.of(q -> q.ids(ids -> ids.values(List.of(evidenceId))));

            try {
                osClient.execute(os -> {
                    os.updateByQuery(updateQuery, evidenceIndexPattern, updateScript);
                    return null;
                });
            } catch (Exception e) {
                log.warn("{}: failed to update evidence in OpenSearch (may not exist): {}",
                    ctx, e.getMessage());
                // Continue — still record custody event
            }

            // Auto-create custody event for classification change
            String custodyNotes = notes != null ? notes
                : "Classification changed to " + classification.toLowerCase();
            EvidenceCustody custody = new EvidenceCustody();
            custody.setId(UUID.randomUUID().toString());
            custody.setEvidenceId(evidenceId);
            custody.setIncidentId(incidentId);
            custody.setActor(userId);
            custody.setAction("analyzed"); // classification change counts as analysis
            custody.setNotes(custodyNotes);
            custody.setTenantId(tenantId);
            custodyRepository.save(custody);

            // Record activity
            recordEvidenceActivity(incidentId, evidenceId, classification, userId, tenantId);

            // Broadcast via SSE
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("evidenceId", evidenceId);
            result.put("incidentId", incidentId);
            result.put("classification", classification.toLowerCase());
            result.put("classifiedBy", userId);
            result.put("classifiedAt", Instant.now().toString());
            result.put("custodyEvent", custodyToMap(custody));

            broadcastCustodyEvent(incidentId, evidenceId, result, userId);

            return CustodyResult.success(result);

        } catch (Exception e) {
            log.error("{}: failed to update classification for evidence {}: {}", ctx, evidenceId, e.getMessage(), e);
            throw new RuntimeException("Failed to update classification: " + e.getMessage(), e);
        }
    }

    /**
     * Retrieves the complete provenance chain for an evidence item.
     *
     * @param evidenceId the evidence item identifier
     * @param tenantId   the tenant identifier
     * @return list of custody events in chronological order
     */
    public Map<String, Object> getProvenanceChain(String evidenceId, Long tenantId) {
        final String ctx = CLASSNAME + ".getProvenanceChain";

        try {
            List<EvidenceCustody> chain = custodyRepository.findByEvidenceIdOrderByCreatedAtAsc(evidenceId);

            // Filter by tenant
            chain = chain.stream()
                .filter(c -> tenantId.equals(c.getTenantId()))
                .toList();

            List<Map<String, Object>> items = new ArrayList<>();
            for (EvidenceCustody custody : chain) {
                items.add(custodyToMap(custody));
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("evidenceId", evidenceId);
            result.put("custodyEvents", items);
            result.put("total", items.size());
            return result;

        } catch (Exception e) {
            log.error("{}: failed to get provenance chain for evidence {}: {}", ctx, evidenceId, e.getMessage(), e);
            throw new RuntimeException("Failed to get provenance chain: " + e.getMessage(), e);
        }
    }

    // =========================================================================
    // Validation
    // =========================================================================

    /**
     * Validates that an evidence item belongs to the specified incident.
     * Queries v3-hive-evidence-* for evidence with matching incident_id.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private boolean validateEvidenceBelongsToIncident(String incidentId, String evidenceId) {
        try {
            String evidenceIndexPattern = indexResolver.resolveIndexPattern("evidence");

            SearchRequest request = SearchRequest.of(r -> r
                .index(evidenceIndexPattern)
                .query(Query.of(q -> q.bool(b -> b
                    .must(m -> m.ids(i -> i.values(List.of(evidenceId))))
                    .must(m -> m.term(t -> t.field("incident_id").value(v -> v.stringValue(incidentId)))))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            if (response.hits() != null && response.hits().hits() != null
                && !response.hits().hits().isEmpty()) {
                return true;
            }

            // Also check without the incident_id filter — some evidence might be linked differently
            SearchRequest fallbackRequest = SearchRequest.of(r -> r
                .index(evidenceIndexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(evidenceId)))))
                .size(1));

            SearchResponse<Map> fallbackResponse = osClient.execute(os -> os.search(fallbackRequest, Map.class));
            if (fallbackResponse.hits() != null && fallbackResponse.hits().hits() != null
                && !fallbackResponse.hits().hits().isEmpty()) {
                // Evidence exists — check if incident_id matches in the document
                Map<String, Object> doc = (Map<String, Object>) fallbackResponse.hits().hits().get(0).source();
                if (doc != null) {
                    Object docIncidentId = doc.get("incident_id");
                    if (docIncidentId == null) docIncidentId = doc.get("incidentId");
                    return incidentId.equals(String.valueOf(docIncidentId));
                }
            }

            // Also check custody records — if there are existing custody records for this
            // evidence+incident combination, it's valid
            List<EvidenceCustody> existingCustody = custodyRepository.findByEvidenceIdOrderByCreatedAtAsc(evidenceId);
            return existingCustody.stream().anyMatch(c -> incidentId.equals(c.getIncidentId()));

        } catch (Exception e) {
            log.warn("{}: failed to validate evidence {} belongs to incident {}: {}",
                CLASSNAME, evidenceId, incidentId, e.getMessage());
            // On validation failure, allow (best-effort) to avoid blocking legitimate operations
            return true;
        }
    }

    // =========================================================================
    // Activity recording
    // =========================================================================

    private void recordEvidenceActivity(String incidentId, String evidenceId,
                                         String classification, String userId, Long tenantId) {
        try {
            IncidentActivity activity = new IncidentActivity();
            activity.setId(UUID.randomUUID().toString());
            activity.setIncidentId(incidentId);
            activity.setType("evidence_updated");
            activity.setActorId(userId);
            activity.setContent("Updated evidence classification to " + classification);
            activity.setTenantId(tenantId);

            Map<String, Object> metadata = new LinkedHashMap<>();
            metadata.put("evidenceId", evidenceId);
            metadata.put("classification", classification);
            activity.setMetadata(objectMapper.writeValueAsString(metadata));

            activityRepository.save(activity);
        } catch (Exception e) {
            log.warn("{}: failed to record evidence activity: {}", CLASSNAME, e.getMessage());
        }
    }

    // =========================================================================
    // SSE broadcast
    // =========================================================================

    private void broadcastCustodyEvent(String incidentId, String evidenceId,
                                        Map<String, Object> data, String actor) {
        if (sseService == null) return;
        try {
            Map<String, Object> eventData = new LinkedHashMap<>();
            eventData.put("type", "evidence.custody");
            eventData.put("timestamp", Instant.now().toString());
            eventData.put("data", data);
            eventData.put("actor", actor);
            sseService.broadcast(incidentId, "evidence.custody", eventData, actor);
        } catch (Exception e) {
            log.warn("{}: failed to broadcast SSE for custody event: {}", CLASSNAME, e.getMessage());
        }
    }

    // =========================================================================
    // Mapping helpers
    // =========================================================================

    private Map<String, Object> custodyToMap(EvidenceCustody custody) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", custody.getId());
        map.put("evidenceId", custody.getEvidenceId());
        map.put("incidentId", custody.getIncidentId());
        map.put("actor", custody.getActor());
        map.put("action", custody.getAction());
        map.put("notes", custody.getNotes());
        map.put("timestamp", custody.getCreatedAt() != null ? custody.getCreatedAt().toString() : null);
        return map;
    }
}
