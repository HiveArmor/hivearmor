package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.domain.HaTenantUser;
import com.hivearmor.domain.User;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.repository.HaTenantUserRepository;
import com.hivearmor.repository.UserRepository;
import com.hivearmor.security.SecurityUtils;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.HaHuntIdempotencyService;
import com.hivearmor.web.rest.errors.BadRequestAlertException;
import org.opensearch.client.opensearch._types.FieldValue;
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
import java.util.stream.Collectors;

/**
 * REST controller for assignment candidate queries and bulk alert assignment.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>GET  /api/ha-alert-assignees         — tenant-scoped user list with queue load
 *   <li>POST /api/ha-alerts/bulk/assignment/preview — preview assignment consequences
 *   <li>POST /api/ha-alerts/bulk/assignment   — execute with idempotency + optimistic lock
 * </ul>
 *
 * <p>All endpoints require {@code ROLE_SOC_MANAGER} or {@code ROLE_ADMIN} authority.
 *
 * <p>Sprint 36 — Assignment candidates and bulk assignment (S36-T04).
 */
@RestController
@RequestMapping("/api")
public class HaAlertAssignmentResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertAssignmentResource.class);
    private static final String ENTITY_NAME = "haAlertAssignment";

    private static final String ASSIGNMENT_AUTH =
        "hasAuthority('ROLE_SOC_MANAGER') or hasAuthority('ROLE_ADMIN')";

    /** Preview tokens — UUID → PreviewData, expires after 10 minutes. */
    private final ConcurrentHashMap<String, PreviewData> previewTokenStore = new ConcurrentHashMap<>();

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final HaTenantUserRepository tenantUserRepository;
    private final UserRepository userRepository;
    private final HaHuntIdempotencyService idempotencyService;

    public HaAlertAssignmentResource(OpensearchClientBuilder osClient,
                                     MsspIndexResolver indexResolver,
                                     ObjectMapper objectMapper,
                                     HaTenantUserRepository tenantUserRepository,
                                     UserRepository userRepository,
                                     HaHuntIdempotencyService idempotencyService) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.tenantUserRepository = tenantUserRepository;
        this.userRepository = userRepository;
        this.idempotencyService = idempotencyService;
    }

    // =========================================================================
    // GET /api/ha-alert-assignees
    // =========================================================================

    /**
     * Returns tenant-scoped assignment candidates with queue load metrics.
     *
     * <p>Queries {@code jhi_user} joined with {@code ha_tenant_user} for the current
     * tenant. For each user, counts open alerts currently assigned to them.
     */
    @GetMapping("/ha-alert-assignees")
    @PreAuthorize(ASSIGNMENT_AUTH)
    public ResponseEntity<?> getAssignees(
            @RequestParam(name = "q", required = false) String searchText,
            @RequestParam(name = "cursor", required = false) String cursor,
            @RequestParam(name = "limit", defaultValue = "20") int limit,
            @RequestParam(name = "availability", required = false) Boolean availability) {

        try {
            if (limit < 1 || limit > 100) {
                return badRequest("INVALID_PARAMETER", "limit must be between 1 and 100");
            }

            String tenantPrefix = TenantContext.get();
            Long clientId = TenantContext.getClientId();

            // Get tenant users
            List<HaTenantUser> tenantUsers;
            if (clientId != null) {
                tenantUsers = tenantUserRepository.findByClientId(clientId);
            } else {
                // Non-MSSP: return all users
                tenantUsers = tenantUserRepository.findAll();
            }

            // Get user IDs for this tenant
            List<Long> userIds = tenantUsers.stream()
                    .map(HaTenantUser::getJhiUserId)
                    .collect(Collectors.toList());

            if (userIds.isEmpty()) {
                return ResponseEntity.ok(Map.of(
                        "items", Collections.emptyList(),
                        "hasMore", false
                ));
            }

            // Load user details
            List<User> users = userRepository.findUserByIdIn(userIds);

            // Filter by search text if provided
            if (searchText != null && !searchText.isBlank()) {
                String lowerQ = searchText.toLowerCase();
                users = users.stream()
                        .filter(u -> (u.getLogin() != null && u.getLogin().toLowerCase().contains(lowerQ))
                                || (u.getFirstName() != null && u.getFirstName().toLowerCase().contains(lowerQ))
                                || (u.getLastName() != null && u.getLastName().toLowerCase().contains(lowerQ)))
                        .collect(Collectors.toList());
            }

            // Apply limit
            boolean hasMore = users.size() > limit;
            if (hasMore) {
                users = users.subList(0, limit);
            }

            // Build assignee response with queue load
            String alertIndex = indexResolver.resolveAlertIndexPattern();
            List<Map<String, Object>> assignees = new ArrayList<>();

            for (User user : users) {
                Map<String, Object> assignee = new LinkedHashMap<>();
                assignee.put("id", user.getId());
                assignee.put("displayName", buildDisplayName(user));
                assignee.put("role", resolveRole(user, tenantUsers));
                assignee.put("queueLoad", countOpenAlerts(alertIndex, user.getId()));
                assignee.put("slaRiskLoad", countSlaRiskAlerts(alertIndex, user.getId()));
                assignee.put("shiftStatus", "available"); // default — no shift system yet
                assignee.put("assignableReason", null);
                assignees.add(assignee);
            }

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("items", assignees);
            response.put("hasMore", hasMore);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/assignment/preview
    // =========================================================================

    /**
     * Previews the consequences of a bulk assignment operation.
     *
     * <p>Counts eligible, excluded, and already-assigned alerts from the provided IDs.
     * Returns a previewToken that must be submitted with the execute request.
     */
    @PostMapping("/ha-alerts/bulk/assignment/preview")
    @PreAuthorize(ASSIGNMENT_AUTH)
    public ResponseEntity<?> previewAssignment(@RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<String> alertIds = (List<String>) body.get("alertIds");
            Object assigneeIdRaw = body.get("assigneeId");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required and must not be empty");
            }
            if (assigneeIdRaw == null) {
                return badRequest("INVALID_PARAMETER", "assigneeId is required");
            }

            Long assigneeId = Long.valueOf(assigneeIdRaw.toString());
            String tenantPrefix = TenantContext.get();
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            int selected = alertIds.size();
            int eligible = 0;
            int excluded = 0;
            int alreadyAssigned = 0;
            int crossTenantExcluded = 0;

            // Query OpenSearch for the alert documents to check their state
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

                    // Check if already assigned to this user
                    Object currentAssignee = source.get("assigneeId");
                    if (currentAssignee != null && assigneeId.toString().equals(currentAssignee.toString())) {
                        alreadyAssigned++;
                    } else {
                        eligible++;
                    }
                }

                // Alerts not found are excluded
                excluded += (alertIds.size() - foundIds.size());

            } catch (Exception e) {
                log.error("Failed to query alerts for preview: {}", e.getMessage(), e);
                // Fall back to treating all as eligible for a graceful degradation
                eligible = selected;
            }

            // Generate preview token
            String previewToken = UUID.randomUUID().toString();
            PreviewData data = new PreviewData(alertIds, assigneeId, tenantPrefix, Instant.now().plusSeconds(600));
            previewTokenStore.put(previewToken, data);

            // Cleanup expired tokens opportunistically
            cleanupExpiredTokens();

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("selected", selected);
            response.put("eligible", eligible);
            response.put("excluded", excluded);
            response.put("alreadyAssigned", alreadyAssigned);
            response.put("crossTenantExcluded", crossTenantExcluded);
            response.put("previewToken", previewToken);

            return ResponseEntity.ok(response);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /api/ha-alerts/bulk/assignment
    // =========================================================================

    /**
     * Executes a bulk assignment with idempotency guarantees and optimistic locking.
     *
     * <p>Requires an {@code Idempotency-Key} header. If the same key+tenant+user
     * combination has been processed within 24 hours, the cached response is returned.
     *
     * <p>For each alert, compares the submitted version against the current version.
     * Mismatches are reported as "conflict" in per-item results.
     */
    @PostMapping("/ha-alerts/bulk/assignment")
    @PreAuthorize(ASSIGNMENT_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<?> executeAssignment(
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
            Object assigneeIdRaw = body.get("assigneeId");
            String previewToken = (String) body.get("previewToken");
            String reason = (String) body.get("reason");
            Map<String, Object> itemVersions = (Map<String, Object>) body.get("itemVersions");

            if (alertIds == null || alertIds.isEmpty()) {
                return badRequest("INVALID_PARAMETER", "alertIds is required");
            }
            if (assigneeIdRaw == null) {
                return badRequest("INVALID_PARAMETER", "assigneeId is required");
            }
            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_PARAMETER", "previewToken is required");
            }

            // Validate preview token
            PreviewData preview = previewTokenStore.remove(previewToken);
            if (preview == null || Instant.now().isAfter(preview.expiresAt)) {
                return badRequest("INVALID_PREVIEW_TOKEN", "Preview token is invalid or expired");
            }

            Long assigneeId = Long.valueOf(assigneeIdRaw.toString());
            String alertIndex = indexResolver.resolveAlertIndexPattern();

            // Resolve assignee display name
            String assigneeName = userRepository.findById(assigneeId)
                    .map(this::buildDisplayName)
                    .orElse("Unknown");

            // Execute assignment with per-item results
            List<Map<String, Object>> results = new ArrayList<>();

            for (String alertId : alertIds) {
                Map<String, Object> itemResult = new LinkedHashMap<>();
                itemResult.put("alertId", alertId);

                try {
                    // Fetch current alert to check version (optimistic locking)
                    SearchRequest alertSearchReq = new SearchRequest.Builder()
                            .index(alertIndex)
                            .size(1)
                            .query(q -> q.ids(ids -> ids.values(Collections.singletonList(alertId))))
                            .build();

                    SearchResponse<Map> alertSearch = osClient.execute(os -> os.search(alertSearchReq, Map.class));

                    if (alertSearch.hits().hits().isEmpty()) {
                        itemResult.put("status", "excluded");
                        itemResult.put("error", "Alert not found");
                        results.add(itemResult);
                        continue;
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
                            results.add(itemResult);
                            continue;
                        }
                    }

                    // Execute the assignment via update-by-query
                    long newVersion = (currentVersion != null ? currentVersion : 0) + 1;
                    String script = "ctx._source.assigneeId = '" + assigneeId + "'; " +
                            "ctx._source.assigneeName = '" + assigneeName.replace("'", "\\'") + "'; " +
                            "ctx._source.assignedAt = '" + Instant.now().toString() + "'; " +
                            "ctx._source.version = " + newVersion + ";";

                    Query updateQuery = Query.of(uq -> uq.ids(ids -> ids.values(Collections.singletonList(alertId))));
                    final String updateScript = script;
                    osClient.execute(os -> {
                        os.updateByQuery(updateQuery, alertIndex, updateScript);
                        return null;
                    });

                    itemResult.put("status", "success");
                    itemResult.put("newVersion", newVersion);

                } catch (Exception e) {
                    log.error("Failed to assign alert {}: {}", alertId, e.getMessage(), e);
                    itemResult.put("status", "excluded");
                    itemResult.put("error", "Internal error: " + e.getMessage());
                }

                results.add(itemResult);
            }

            // Build response
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("results", results);
            response.put("assigneeId", assigneeId);
            response.put("assigneeName", assigneeName);
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

    // =========================================================================
    // Helper methods
    // =========================================================================

    private String buildDisplayName(User user) {
        if (user.getFirstName() != null && user.getLastName() != null) {
            return user.getFirstName() + " " + user.getLastName();
        }
        if (user.getFirstName() != null) {
            return user.getFirstName();
        }
        return user.getLogin();
    }

    private String resolveRole(User user, List<HaTenantUser> tenantUsers) {
        // Find the tenant role for this user
        return tenantUsers.stream()
                .filter(tu -> tu.getJhiUserId().equals(user.getId()))
                .map(HaTenantUser::getTenantRole)
                .findFirst()
                .orElse("ANALYST");
    }

    private int countOpenAlerts(String alertIndex, Long userId) {
        try {
            SearchRequest request = new SearchRequest.Builder()
                    .index(alertIndex)
                    .size(0)
                    .query(q -> q.bool(b -> b
                            .must(m -> m.term(t -> t.field("assigneeId").value(FieldValue.of(userId.toString()))))
                            .must(m -> m.term(t -> t.field("status").value(FieldValue.of("1"))))))
                    .trackTotalHits(t -> t.enabled(true))
                    .build();

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
            return (int) (response.hits().total() != null ? response.hits().total().value() : 0);
        } catch (Exception e) {
            log.debug("Failed to count open alerts for user {}: {}", userId, e.getMessage());
            return 0;
        }
    }

    private int countSlaRiskAlerts(String alertIndex, Long userId) {
        try {
            SearchRequest request = new SearchRequest.Builder()
                    .index(alertIndex)
                    .size(0)
                    .query(q -> q.bool(b -> b
                            .must(m -> m.term(t -> t.field("assigneeId").value(FieldValue.of(userId.toString()))))
                            .must(m -> m.term(t -> t.field("slaStatus").value(FieldValue.of("at_risk"))))))
                    .trackTotalHits(t -> t.enabled(true))
                    .build();

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));
            return (int) (response.hits().total() != null ? response.hits().total().value() : 0);
        } catch (Exception e) {
            log.debug("Failed to count SLA risk alerts for user {}: {}", userId, e.getMessage());
            return 0;
        }
    }

    private Long resolveCurrentUserId() {
        String login = SecurityUtils.getCurrentUserLogin()
                .orElseThrow(() -> new BadRequestAlertException("Not authenticated", ENTITY_NAME, "notauthenticated"));
        return userRepository.findOneByLogin(login)
                .orElseThrow(() -> new BadRequestAlertException("User not found", ENTITY_NAME, "usernotfound"))
                .getId();
    }

    private ResponseEntity<?> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        return ResponseEntity.badRequest().body(error);
    }

    private void cleanupExpiredTokens() {
        Instant now = Instant.now();
        previewTokenStore.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt));
    }

    // =========================================================================
    // Inner classes
    // =========================================================================

    /**
     * Preview token data stored in-memory with 10-minute expiry.
     */
    private static class PreviewData {
        final List<String> alertIds;
        final Long assigneeId;
        final String tenantPrefix;
        final Instant expiresAt;

        PreviewData(List<String> alertIds, Long assigneeId, String tenantPrefix, Instant expiresAt) {
            this.alertIds = alertIds;
            this.assigneeId = assigneeId;
            this.tenantPrefix = tenantPrefix;
            this.expiresAt = expiresAt;
        }
    }
}
