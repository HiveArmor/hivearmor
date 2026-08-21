package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HaHuntIdempotencyService;
import com.hivearmor.service.hunt.InvestigationEventPublisher;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * REST controller for bulk triage lifecycle actions on alerts.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>POST /api/ha-alerts/bulk/status/preview — preview status change consequences
 *   <li>POST /api/ha-alerts/bulk/status — execute status change with idempotency
 *   <li>POST /api/ha-alerts/bulk/tags/preview — preview tag modifications
 *   <li>POST /api/ha-alerts/bulk/tags — execute tag add/remove
 *   <li>POST /api/ha-alerts/bulk/promote/preview — preview incident promotion
 *   <li>POST /api/ha-alerts/bulk/promote — execute incident promotion
 * </ul>
 *
 * <p>All endpoints require {@code ROLE_SOC_ANALYST} or higher authority.
 *
 * <p>Sprint 36 — Bulk triage lifecycle actions (S36-T05 + S36-T06).
 */
@RestController
@RequestMapping("/api")
public class HaAlertBulkResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertBulkResource.class);
    private static final String ENTITY_NAME = "haAlertBulk";

    private static final String BULK_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    /** Symbolic status → numeric code mapping. */
    private static final Map<String, Integer> STATUS_CODE_MAP = Map.of(
        "open", 2,
        "in_review", 3,
        "completed", 5,
        "closed", 5,
        "true_positive", 6,
        "false_positive", 7
    );

    /** Statuses that require a reasonCode. */
    private static final Set<String> REASON_REQUIRED_STATUSES = Set.of(
        "closed", "completed", "true_positive", "false_positive"
    );

    /** Preview tokens — UUID → PreviewData, expires after 10 minutes. */
    private final ConcurrentHashMap<String, BulkPreviewData> previewTokenStore = new ConcurrentHashMap<>();

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final UserRepository userRepository;
    private final HaHuntIdempotencyService idempotencyService;
    private final InvestigationEventPublisher investigationEventPublisher;

    public HaAlertBulkResource(OpensearchClientBuilder osClient,
                               MsspIndexResolver indexResolver,
                               ObjectMapper objectMapper,
                               UserRepository userRepository,
                               HaHuntIdempotencyService idempotencyService,
                               InvestigationEventPublisher investigationEventPublisher) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.userRepository = userRepository;
        this.idempotencyService = idempotencyService;
        this.investigationEventPublisher = investigationEventPublisher;
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/status/preview
    // =========================================================================

    /**
     * Previews the consequences of a bulk status change.
     *
     * <p>Counts eligible, excluded, and consequence impacts for the given alert IDs
     * and target status. Returns a previewToken for the execute step.
     */
    @PostMapping("/ha-alerts/bulk/status/preview")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> previewStatusChange(@RequestBody Map<String, Object> body) {
        try {
            List<String> alertIds = (List<String>) body.get("alertIds");
            String targetStatus = (String) body.get("targetStatus");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required and must not be empty");
            }
            if (targetStatus == null || !STATUS_CODE_MAP.containsKey(targetStatus)) {
                return badRequest("INVALID_PARAMETER",
                    "targetStatus must be one of: open, in_review, true_positive, false_positive, benign_positive, closed");
            }

            String tenantPrefix = TenantContext.get();
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            int selected = alertIds.size();
            int eligible = 0;
            int excluded = 0;
            int alreadyInStatus = 0;
            int correlatedGroupImpact = 0;

            Integer targetCode = STATUS_CODE_MAP.get(targetStatus);

            try {
                SearchRequest searchRequest = new SearchRequest.Builder()
                    .index(alertIndex)
                    .size(alertIds.size())
                    .query(q -> q.ids(ids -> ids.values(alertIds)))
                    .build();

                SearchResponse<Map> searchResponse = osClient.execute(os -> os.search(searchRequest, Map.class));

                Set<String> foundIds = new HashSet<>();
                for (Hit<Map> hit : searchResponse.hits().hits()) {
                    foundIds.add(hit.id());
                    Map<String, Object> source = hit.source();
                    if (source == null) {
                        excluded++;
                        continue;
                    }

                    // Check if already in target status
                    Object currentStatus = source.get("status");
                    if (currentStatus != null && targetCode.equals(parseIntSafe(currentStatus))) {
                        alreadyInStatus++;
                    } else {
                        eligible++;
                    }

                    // Check for correlated group impact
                    if (source.get("correlationId") != null) {
                        correlatedGroupImpact++;
                    }
                }

                // Alerts not found are excluded
                excluded += (alertIds.size() - foundIds.size());

            } catch (Exception e) {
                log.error("Failed to query alerts for status preview: {}", e.getMessage(), e);
                eligible = selected;
            }

            // Generate preview token
            String previewToken = UUID.randomUUID().toString();
            BulkPreviewData data = new BulkPreviewData(
                "status", alertIds, tenantPrefix, Instant.now().plusSeconds(600));
            previewTokenStore.put(previewToken, data);
            cleanupExpiredTokens();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("selected", selected);
            response.put("eligible", eligible);
            response.put("excluded", excluded);
            response.put("alreadyInStatus", alreadyInStatus);
            response.put("ruleFeedbackImpact", 0);
            response.put("exceptionSuggestions", Collections.emptyList());
            response.put("correlatedGroupImpact", correlatedGroupImpact);
            response.put("linkedCaseImpact", 0);
            response.put("previewToken", previewToken);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/status
    // =========================================================================

    /**
     * Executes a bulk status change with idempotency and optimistic locking.
     *
     * <p>Requires an {@code Idempotency-Key} header. Maps symbolic status to numeric
     * code server-side. Validates that reasonCode is provided for closing/classifying
     * statuses. Returns per-alert outcomes.
     */
    @PostMapping("/ha-alerts/bulk/status")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> executeStatusChange(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody Map<String, Object> body) {

        try {
            // Validate Idempotency-Key header
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                return badRequest("MISSING_HEADER", "Idempotency-Key header is required");
            }

            String tenantPrefix = TenantContext.get();
            Long userId = resolveCurrentUserId();

            // Check idempotency — return cached response if already processed
            Optional<String> cached = idempotencyService.findCachedResponse(idempotencyKey, tenantPrefix, userId);
            if (cached.isPresent()) {
                log.debug("Returning cached response for Idempotency-Key={}", idempotencyKey);
                try {
                    Map<String, Object> cachedResponse = objectMapper.readValue(
                        cached.get(), new TypeReference<Map<String, Object>>() {});
                    return ResponseEntity.ok(cachedResponse);
                } catch (JsonProcessingException e) {
                    log.warn("Failed to parse cached response, re-executing: {}", e.getMessage());
                }
            }

            // Validate request body
            List<String> alertIds = (List<String>) body.get("alertIds");
            String targetStatus = (String) body.get("targetStatus");
            String reasonCode = (String) body.get("reasonCode");
            String note = (String) body.get("note");
            String previewToken = (String) body.get("previewToken");
            Map<String, Object> itemVersions = (Map<String, Object>) body.get("itemVersions");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required");
            }
            if (targetStatus == null || !STATUS_CODE_MAP.containsKey(targetStatus)) {
                return badRequest("INVALID_PARAMETER",
                    "targetStatus must be one of: open, in_review, true_positive, false_positive, benign_positive, closed");
            }

            // Validate reasonCode requirement for closing/classifying statuses
            if (REASON_REQUIRED_STATUSES.contains(targetStatus)
                    && (reasonCode == null || reasonCode.isBlank())) {
                return badRequest("REASON_REQUIRED",
                    "reasonCode is required when targetStatus is " + targetStatus);
            }

            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_PARAMETER", "previewToken is required");
            }

            // Validate preview token
            BulkPreviewData preview = previewTokenStore.remove(previewToken);
            if (preview == null || Instant.now().isAfter(preview.expiresAt)) {
                return badRequest("INVALID_PREVIEW_TOKEN", "Preview token is invalid or expired");
            }

            Integer targetCode = STATUS_CODE_MAP.get(targetStatus);
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            // Execute status change with per-item results
            List<Map<String, Object>> results = new ArrayList<>();
            String auditId = UUID.randomUUID().toString();

            for (String alertId : alertIds) {
                Map<String, Object> itemResult = processStatusChange(
                    alertId, alertIndex, targetCode, targetStatus, reasonCode, note, itemVersions);
                results.add(itemResult);
            }

            // Write audit event
            writeAuditEvent("BULK_STATUS_CHANGE", auditId, userId, tenantPrefix,
                alertIds.size(), targetStatus, reasonCode);

            // Build response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", UUID.randomUUID().toString());
            response.put("auditId", auditId);
            response.put("results", results);
            response.put("targetStatus", targetStatus);
            response.put("processedAt", Instant.now().toString());

            // Store result for idempotency
            try {
                String responseJson = objectMapper.writeValueAsString(response);
                idempotencyService.storeResult(idempotencyKey, tenantPrefix, userId, body, responseJson);
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize response for idempotency cache: {}", e.getMessage());
            }

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Processes a single alert status change with optimistic locking.
     */
    private Map<String, Object> processStatusChange(String alertId, String alertIndex,
            Integer targetCode, String targetStatus, String reasonCode, String note,
            Map<String, Object> itemVersions) {

        Map<String, Object> itemResult = new LinkedHashMap<>();
        itemResult.put("alertId", alertId);

        try {
            SearchRequest alertSearchReq = new SearchRequest.Builder()
                .index(alertIndex)
                .size(1)
                .query(q -> q.ids(ids -> ids.values(Collections.singletonList(alertId))))
                .build();

            SearchResponse<Map> alertSearch = osClient.execute(os -> os.search(alertSearchReq, Map.class));

            if (alertSearch.hits().hits().isEmpty()) {
                itemResult.put("status", "excluded");
                itemResult.put("error", "Alert not found");
                return itemResult;
            }

            Hit<Map> hit = alertSearch.hits().hits().get(0);
            Map<String, Object> source = hit.source();
            Long currentVersion = source != null && source.get("version") != null
                ? Long.valueOf(source.get("version").toString())
                : null;

            // Optimistic locking check
            if (itemVersions != null && itemVersions.containsKey(alertId)) {
                Long expectedVersion = Long.valueOf(itemVersions.get(alertId).toString());
                if (currentVersion != null && !currentVersion.equals(expectedVersion)) {
                    itemResult.put("status", "conflict");
                    itemResult.put("error", "Version mismatch: expected " + expectedVersion + ", found " + currentVersion);
                    itemResult.put("newVersion", currentVersion);
                    return itemResult;
                }
            }

            // Build update script
            long newVersion = (currentVersion != null ? currentVersion : 0) + 1;
            StringBuilder script = new StringBuilder();
            script.append("ctx._source.status = ").append(targetCode).append("; ");
            script.append("ctx._source.statusLabel = '").append(targetStatus).append("'; ");
            script.append("ctx._source.statusChangedAt = '").append(Instant.now().toString()).append("'; ");
            script.append("ctx._source.version = ").append(newVersion).append("; ");
            if (reasonCode != null && !reasonCode.isBlank()) {
                script.append("ctx._source.reasonCode = '").append(sanitizeScriptValue(reasonCode)).append("'; ");
            }
            if (note != null && !note.isBlank()) {
                script.append("ctx._source.statusNote = '").append(sanitizeScriptValue(note)).append("'; ");
            }

            Query updateQuery = Query.of(uq -> uq.ids(ids -> ids.values(Collections.singletonList(alertId))));
            final String updateScript = script.toString();
            osClient.execute(os -> {
                os.updateByQuery(updateQuery, alertIndex, updateScript);
                return null;
            });

            itemResult.put("status", "success");
            itemResult.put("newVersion", newVersion);

            // Publish alert.updated SSE event to connected investigation clients
            try {
                Object oldStatus = source != null ? source.get("status") : null;
                Map<String, Object> eventPayload = new LinkedHashMap<>();
                eventPayload.put("field", "status");
                eventPayload.put("oldValue", oldStatus);
                eventPayload.put("newValue", targetCode);
                eventPayload.put("actor", SecurityUtils.getCurrentUserLogin().orElse("system"));
                eventPayload.put("timestamp", Instant.now().toString());
                investigationEventPublisher.publish(alertId, "alert.updated", eventPayload);
            } catch (Exception sseEx) {
                log.debug("Failed to publish SSE event for alert [{}]: {}", alertId, sseEx.getMessage());
            }

        } catch (Exception e) {
            log.error("Failed to update status for alert {}: {}", alertId, e.getMessage(), e);
            itemResult.put("status", "error");
            itemResult.put("error", "Internal error: " + e.getMessage());
        }

        return itemResult;
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/tags/preview
    // =========================================================================

    /**
     * Previews the consequences of bulk tag modifications.
     *
     * <p>Returns affected count, already-tagged count, and tag validation results.
     */
    @PostMapping("/ha-alerts/bulk/tags/preview")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> previewTagChange(@RequestBody Map<String, Object> body) {
        try {
            List<String> alertIds = (List<String>) body.get("alertIds");
            List<String> addTags = (List<String>) body.get("addTags");
            List<String> removeTags = (List<String>) body.get("removeTags");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required and must not be empty");
            }
            if ((addTags == null || addTags.isEmpty()) && (removeTags == null || removeTags.isEmpty())) {
                return badRequest("INVALID_PARAMETER", "At least one of addTags or removeTags must be provided");
            }

            String tenantPrefix = TenantContext.get();
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            int selected = alertIds.size();
            int affected = 0;
            int alreadyTagged = 0;

            try {
                SearchRequest searchRequest = new SearchRequest.Builder()
                    .index(alertIndex)
                    .size(alertIds.size())
                    .query(q -> q.ids(ids -> ids.values(alertIds)))
                    .build();

                SearchResponse<Map> searchResponse = osClient.execute(os -> os.search(searchRequest, Map.class));

                for (Hit<Map> hit : searchResponse.hits().hits()) {
                    Map<String, Object> source = hit.source();
                    if (source == null) continue;

                    List<String> currentTags = extractTagsList(source);
                    boolean willChange = false;

                    if (addTags != null) {
                        for (String tag : addTags) {
                            if (!currentTags.contains(tag)) {
                                willChange = true;
                                break;
                            }
                        }
                    }
                    if (!willChange && removeTags != null) {
                        for (String tag : removeTags) {
                            if (currentTags.contains(tag)) {
                                willChange = true;
                                break;
                            }
                        }
                    }

                    if (willChange) {
                        affected++;
                    } else {
                        alreadyTagged++;
                    }
                }
            } catch (Exception e) {
                log.error("Failed to query alerts for tags preview: {}", e.getMessage(), e);
                affected = selected;
            }

            // Generate preview token
            String previewToken = UUID.randomUUID().toString();
            BulkPreviewData data = new BulkPreviewData(
                "tags", alertIds, tenantPrefix, Instant.now().plusSeconds(600));
            previewTokenStore.put(previewToken, data);
            cleanupExpiredTokens();

            // Validate tags (basic: non-empty, no special chars)
            List<Map<String, Object>> tagValidation = new ArrayList<>();
            if (addTags != null) {
                for (String tag : addTags) {
                    Map<String, Object> v = new LinkedHashMap<>();
                    v.put("tag", tag);
                    v.put("valid", tag != null && !tag.isBlank() && tag.length() <= 100);
                    tagValidation.add(v);
                }
            }

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("selected", selected);
            response.put("affected", affected);
            response.put("alreadyTagged", alreadyTagged);
            response.put("tagValidation", tagValidation);
            response.put("previewToken", previewToken);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/tags
    // =========================================================================

    /**
     * Executes bulk tag add/remove with idempotency and per-alert outcomes.
     */
    @PostMapping("/ha-alerts/bulk/tags")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> executeTagChange(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody Map<String, Object> body) {

        try {
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                return badRequest("MISSING_HEADER", "Idempotency-Key header is required");
            }

            String tenantPrefix = TenantContext.get();
            Long userId = resolveCurrentUserId();

            // Check idempotency
            Optional<String> cached = idempotencyService.findCachedResponse(idempotencyKey, tenantPrefix, userId);
            if (cached.isPresent()) {
                log.debug("Returning cached response for Idempotency-Key={}", idempotencyKey);
                try {
                    Map<String, Object> cachedResponse = objectMapper.readValue(
                        cached.get(), new TypeReference<Map<String, Object>>() {});
                    return ResponseEntity.ok(cachedResponse);
                } catch (JsonProcessingException e) {
                    log.warn("Failed to parse cached response, re-executing: {}", e.getMessage());
                }
            }

            List<String> alertIds = (List<String>) body.get("alertIds");
            List<String> addTags = (List<String>) body.get("addTags");
            List<String> removeTags = (List<String>) body.get("removeTags");
            String previewToken = (String) body.get("previewToken");
            Map<String, Object> itemVersions = (Map<String, Object>) body.get("itemVersions");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required");
            }
            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_PARAMETER", "previewToken is required");
            }

            // Validate preview token
            BulkPreviewData preview = previewTokenStore.remove(previewToken);
            if (preview == null || Instant.now().isAfter(preview.expiresAt)) {
                return badRequest("INVALID_PREVIEW_TOKEN", "Preview token is invalid or expired");
            }

            String alertIndex = indexResolver.resolveAlertIndexPattern();
            String auditId = UUID.randomUUID().toString();

            // Execute tag modifications per-alert
            List<Map<String, Object>> results = new ArrayList<>();
            for (String alertId : alertIds) {
                Map<String, Object> itemResult = processTagChange(
                    alertId, alertIndex, addTags, removeTags, itemVersions);
                results.add(itemResult);
            }

            // Write audit event
            writeAuditEvent("BULK_TAG_CHANGE", auditId, userId, tenantPrefix,
                alertIds.size(), "tags", null);

            // Build response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", UUID.randomUUID().toString());
            response.put("auditId", auditId);
            response.put("results", results);
            response.put("processedAt", Instant.now().toString());

            // Store result for idempotency
            try {
                String responseJson = objectMapper.writeValueAsString(response);
                idempotencyService.storeResult(idempotencyKey, tenantPrefix, userId, body, responseJson);
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize response for idempotency cache: {}", e.getMessage());
            }

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Processes tag add/remove for a single alert with optimistic locking.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> processTagChange(String alertId, String alertIndex,
            List<String> addTags, List<String> removeTags, Map<String, Object> itemVersions) {

        Map<String, Object> itemResult = new LinkedHashMap<>();
        itemResult.put("alertId", alertId);

        try {
            SearchRequest alertSearchReq = new SearchRequest.Builder()
                .index(alertIndex)
                .size(1)
                .query(q -> q.ids(ids -> ids.values(Collections.singletonList(alertId))))
                .build();

            SearchResponse<Map> alertSearch = osClient.execute(os -> os.search(alertSearchReq, Map.class));

            if (alertSearch.hits().hits().isEmpty()) {
                itemResult.put("status", "excluded");
                itemResult.put("error", "Alert not found");
                return itemResult;
            }

            Hit<Map> hit = alertSearch.hits().hits().get(0);
            Map<String, Object> source = hit.source();
            Long currentVersion = source != null && source.get("version") != null
                ? Long.valueOf(source.get("version").toString())
                : null;

            // Optimistic locking check
            if (itemVersions != null && itemVersions.containsKey(alertId)) {
                Long expectedVersion = Long.valueOf(itemVersions.get(alertId).toString());
                if (currentVersion != null && !currentVersion.equals(expectedVersion)) {
                    itemResult.put("status", "conflict");
                    itemResult.put("error", "Version mismatch: expected " + expectedVersion + ", found " + currentVersion);
                    itemResult.put("newVersion", currentVersion);
                    return itemResult;
                }
            }

            // Build tag modification script
            long newVersion = (currentVersion != null ? currentVersion : 0) + 1;
            StringBuilder script = new StringBuilder();

            if (addTags != null && !addTags.isEmpty()) {
                String tagsArray = addTags.stream()
                    .map(t -> "'" + sanitizeScriptValue(t) + "'")
                    .reduce((a, b) -> a + "," + b).orElse("");
                script.append("if (ctx._source.tags == null) { ctx._source.tags = []; } ");
                script.append("for (def tag : [").append(tagsArray).append("]) { ");
                script.append("  if (!ctx._source.tags.contains(tag)) { ctx._source.tags.add(tag); } ");
                script.append("} ");
            }

            if (removeTags != null && !removeTags.isEmpty()) {
                String removeArray = removeTags.stream()
                    .map(t -> "'" + sanitizeScriptValue(t) + "'")
                    .reduce((a, b) -> a + "," + b).orElse("");
                script.append("if (ctx._source.tags != null) { ");
                script.append("  ctx._source.tags.removeAll([").append(removeArray).append("]); ");
                script.append("} ");
            }

            script.append("ctx._source.version = ").append(newVersion).append("; ");

            Query updateQuery = Query.of(uq -> uq.ids(ids -> ids.values(Collections.singletonList(alertId))));
            final String updateScript = script.toString();
            osClient.execute(os -> {
                os.updateByQuery(updateQuery, alertIndex, updateScript);
                return null;
            });

            itemResult.put("status", "success");
            itemResult.put("newVersion", newVersion);

        } catch (Exception e) {
            log.error("Failed to update tags for alert {}: {}", alertId, e.getMessage(), e);
            itemResult.put("status", "error");
            itemResult.put("error", "Internal error: " + e.getMessage());
        }

        return itemResult;
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/promote/preview
    // =========================================================================

    /**
     * Previews the consequences of promoting alerts to incidents.
     *
     * <p>Returns eligible alerts, proposed incident grouping, and policy warnings.
     */
    @PostMapping("/ha-alerts/bulk/promote/preview")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> previewPromote(@RequestBody Map<String, Object> body) {
        try {
            List<String> alertIds = (List<String>) body.get("alertIds");
            String targetIncidentType = (String) body.get("targetIncidentType");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required and must not be empty");
            }
            if (targetIncidentType == null || targetIncidentType.isBlank()) {
                return badRequest("INVALID_PARAMETER", "targetIncidentType is required");
            }

            String tenantPrefix = TenantContext.get();
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            int selected = alertIds.size();
            int eligible = 0;
            int alreadyPromoted = 0;
            List<Map<String, Object>> proposedGrouping = new ArrayList<>();

            try {
                SearchRequest searchRequest = new SearchRequest.Builder()
                    .index(alertIndex)
                    .size(alertIds.size())
                    .query(q -> q.ids(ids -> ids.values(alertIds)))
                    .build();

                SearchResponse<Map> searchResponse = osClient.execute(os -> os.search(searchRequest, Map.class));

                Map<String, List<String>> groupByCategory = new LinkedHashMap<>();

                for (Hit<Map> hit : searchResponse.hits().hits()) {
                    Map<String, Object> source = hit.source();
                    if (source == null) continue;

                    // Check if already an incident
                    Object isIncident = source.get("alertIsIncident");
                    if (Boolean.TRUE.equals(isIncident) || "true".equals(String.valueOf(isIncident))) {
                        alreadyPromoted++;
                    } else {
                        eligible++;
                        // Group by category for proposed incident grouping
                        String category = source.get("category") != null
                            ? source.get("category").toString() : "uncategorized";
                        groupByCategory.computeIfAbsent(category, k -> new ArrayList<>()).add(hit.id());
                    }
                }

                // Build proposed grouping
                for (Map.Entry<String, List<String>> entry : groupByCategory.entrySet()) {
                    Map<String, Object> group = new LinkedHashMap<>();
                    group.put("category", entry.getKey());
                    group.put("alertIds", entry.getValue());
                    group.put("count", entry.getValue().size());
                    proposedGrouping.add(group);
                }

            } catch (Exception e) {
                log.error("Failed to query alerts for promote preview: {}", e.getMessage(), e);
                eligible = selected;
            }

            // Generate preview token
            String previewToken = UUID.randomUUID().toString();
            BulkPreviewData data = new BulkPreviewData(
                "promote", alertIds, tenantPrefix, Instant.now().plusSeconds(600));
            previewTokenStore.put(previewToken, data);
            cleanupExpiredTokens();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("selected", selected);
            response.put("eligible", eligible);
            response.put("alreadyPromoted", alreadyPromoted);
            response.put("proposedGrouping", proposedGrouping);
            response.put("correlationData", Collections.emptyList());
            response.put("policyWarnings", Collections.emptyList());
            response.put("previewToken", previewToken);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/promote
    // =========================================================================

    /**
     * Executes bulk promotion of alerts to incidents with idempotency.
     *
     * <p>Creates incident(s), links alerts, and returns per-alert outcomes.
     */
    @PostMapping("/ha-alerts/bulk/promote")
    @PreAuthorize(BULK_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> executePromote(
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody Map<String, Object> body) {

        try {
            if (idempotencyKey == null || idempotencyKey.isBlank()) {
                return badRequest("MISSING_HEADER", "Idempotency-Key header is required");
            }

            String tenantPrefix = TenantContext.get();
            Long userId = resolveCurrentUserId();

            // Check idempotency
            Optional<String> cached = idempotencyService.findCachedResponse(idempotencyKey, tenantPrefix, userId);
            if (cached.isPresent()) {
                log.debug("Returning cached response for Idempotency-Key={}", idempotencyKey);
                try {
                    Map<String, Object> cachedResponse = objectMapper.readValue(
                        cached.get(), new TypeReference<Map<String, Object>>() {});
                    return ResponseEntity.ok(cachedResponse);
                } catch (JsonProcessingException e) {
                    log.warn("Failed to parse cached response, re-executing: {}", e.getMessage());
                }
            }

            List<String> alertIds = (List<String>) body.get("alertIds");
            String targetIncidentType = (String) body.get("targetIncidentType");
            String reason = (String) body.get("reason");
            String previewToken = (String) body.get("previewToken");
            Map<String, Object> itemVersions = (Map<String, Object>) body.get("itemVersions");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required");
            }
            if (targetIncidentType == null || targetIncidentType.isBlank()) {
                return badRequest("INVALID_PARAMETER", "targetIncidentType is required");
            }
            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_PARAMETER", "previewToken is required");
            }

            // Validate preview token
            BulkPreviewData preview = previewTokenStore.remove(previewToken);
            if (preview == null || Instant.now().isAfter(preview.expiresAt)) {
                return badRequest("INVALID_PREVIEW_TOKEN", "Preview token is invalid or expired");
            }

            String alertIndex = indexResolver.resolveAlertIndexPattern();
            String auditId = UUID.randomUUID().toString();
            String incidentId = "INC-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
            List<String> incidentIds = new ArrayList<>();
            incidentIds.add(incidentId);

            // Execute promotion per-alert: mark as incident and link
            List<Map<String, Object>> results = new ArrayList<>();
            for (String alertId : alertIds) {
                Map<String, Object> itemResult = processPromote(
                    alertId, alertIndex, incidentId, targetIncidentType, reason, itemVersions);
                results.add(itemResult);
            }

            // Write audit event
            writeAuditEvent("BULK_PROMOTE", auditId, userId, tenantPrefix,
                alertIds.size(), targetIncidentType, reason);

            // Build response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("jobId", UUID.randomUUID().toString());
            response.put("auditId", auditId);
            response.put("incidentIds", incidentIds);
            response.put("results", results);
            response.put("processedAt", Instant.now().toString());

            // Store result for idempotency
            try {
                String responseJson = objectMapper.writeValueAsString(response);
                idempotencyService.storeResult(idempotencyKey, tenantPrefix, userId, body, responseJson);
            } catch (JsonProcessingException e) {
                log.warn("Failed to serialize response for idempotency cache: {}", e.getMessage());
            }

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * Processes a single alert promotion to incident with optimistic locking.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> processPromote(String alertId, String alertIndex,
            String incidentId, String targetIncidentType, String reason,
            Map<String, Object> itemVersions) {

        Map<String, Object> itemResult = new LinkedHashMap<>();
        itemResult.put("alertId", alertId);

        try {
            SearchRequest alertSearchReq = new SearchRequest.Builder()
                .index(alertIndex)
                .size(1)
                .query(q -> q.ids(ids -> ids.values(Collections.singletonList(alertId))))
                .build();

            SearchResponse<Map> alertSearch = osClient.execute(os -> os.search(alertSearchReq, Map.class));

            if (alertSearch.hits().hits().isEmpty()) {
                itemResult.put("status", "excluded");
                itemResult.put("error", "Alert not found");
                return itemResult;
            }

            Hit<Map> hit = alertSearch.hits().hits().get(0);
            Map<String, Object> source = hit.source();
            Long currentVersion = source != null && source.get("version") != null
                ? Long.valueOf(source.get("version").toString())
                : null;

            // Optimistic locking check
            if (itemVersions != null && itemVersions.containsKey(alertId)) {
                Long expectedVersion = Long.valueOf(itemVersions.get(alertId).toString());
                if (currentVersion != null && !currentVersion.equals(expectedVersion)) {
                    itemResult.put("status", "conflict");
                    itemResult.put("error", "Version mismatch: expected " + expectedVersion + ", found " + currentVersion);
                    itemResult.put("newVersion", currentVersion);
                    return itemResult;
                }
            }

            // Build promote script
            long newVersion = (currentVersion != null ? currentVersion : 0) + 1;
            StringBuilder script = new StringBuilder();
            script.append("ctx._source.alertIsIncident = true; ");
            script.append("ctx._source.incidentId = '").append(sanitizeScriptValue(incidentId)).append("'; ");
            script.append("ctx._source.incidentType = '").append(sanitizeScriptValue(targetIncidentType)).append("'; ");
            script.append("ctx._source.promotedAt = '").append(Instant.now().toString()).append("'; ");
            script.append("ctx._source.version = ").append(newVersion).append("; ");
            if (reason != null && !reason.isBlank()) {
                script.append("ctx._source.promoteReason = '").append(sanitizeScriptValue(reason)).append("'; ");
            }

            Query updateQuery = Query.of(uq -> uq.ids(ids -> ids.values(Collections.singletonList(alertId))));
            final String updateScript = script.toString();
            osClient.execute(os -> {
                os.updateByQuery(updateQuery, alertIndex, updateScript);
                return null;
            });

            itemResult.put("status", "success");
            itemResult.put("newVersion", newVersion);
            itemResult.put("incidentId", incidentId);

        } catch (Exception e) {
            log.error("Failed to promote alert {}: {}", alertId, e.getMessage(), e);
            itemResult.put("status", "error");
            itemResult.put("error", "Internal error: " + e.getMessage());
        }

        return itemResult;
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Writes an audit event for bulk mutations.
     */
    private void writeAuditEvent(String action, String auditId, Long userId,
            String tenantPrefix, int alertCount, String detail, String reason) {
        log.info("[AUDIT] action={}, auditId={}, userId={}, tenant={}, alertCount={}, detail={}, reason={}",
            action, auditId, userId, tenantPrefix, alertCount, detail, reason);
    }

    /**
     * Resolves the current authenticated user's ID.
     */
    private Long resolveCurrentUserId() {
        String login = SecurityUtils.getCurrentUserLogin()
            .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));
        return userRepository.findOneByLogin(login)
            .orElseThrow(() -> new BadRequestAlertException("User not found", ENTITY_NAME, "usernotfound"))
            .getId();
    }

    /**
     * Returns a 400 BAD_REQUEST response with the given error code and message.
     */
    private ResponseEntity<?> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        return ResponseEntity.badRequest().body(error);
    }

    /**
     * Removes expired preview tokens from the store.
     */
    private void cleanupExpiredTokens() {
        Instant now = Instant.now();
        previewTokenStore.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt));
    }

    /**
     * Sanitizes a value for use in Painless scripts to prevent injection.
     * Escapes single quotes and backslashes.
     */
    private String sanitizeScriptValue(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("'", "\\'");
    }

    /**
     * Extracts a list of tags from an alert source document.
     */
    @SuppressWarnings("unchecked")
    private List<String> extractTagsList(Map<String, Object> source) {
        Object tags = source.get("tags");
        if (tags instanceof List) {
            return (List<String>) tags;
        }
        return Collections.emptyList();
    }

    /**
     * Safely parses an Object to Integer, returning null on failure.
     */
    private Integer parseIntSafe(Object value) {
        if (value == null) return null;
        if (value instanceof Number) return ((Number) value).intValue();
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // =========================================================================
    // Inner classes
    // =========================================================================

    /**
     * Preview token data stored in-memory with 10-minute expiry.
     */
    private static class BulkPreviewData {
        final String operationType;
        final List<String> alertIds;
        final String tenantPrefix;
        final Instant expiresAt;

        BulkPreviewData(String operationType, List<String> alertIds,
                        String tenantPrefix, Instant expiresAt) {
            this.operationType = operationType;
            this.alertIds = alertIds;
            this.tenantPrefix = tenantPrefix;
            this.expiresAt = expiresAt;
        }
    }
}
