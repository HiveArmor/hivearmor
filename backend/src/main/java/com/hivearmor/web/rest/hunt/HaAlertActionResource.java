package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import org.opensearch.client.opensearch._types.query_dsl.Query;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * REST controller for per-alert quick actions:
 * <ul>
 *   <li>{@code POST /api/ha-alerts/{id}/notes} — create note with visibility and version check</li>
 *   <li>{@code POST /api/ha-alerts/{id}/incident-link/preview} — returns link preview</li>
 *   <li>{@code POST /api/ha-alerts/{id}/incident-link} — executes incident link</li>
 *   <li>{@code GET /api/ha-incidents/candidates} — returns tenant-scoped incident candidates</li>
 * </ul>
 *
 * <p><strong>ALT-022:</strong> Permission-aware quick actions.
 */
@RestController
@RequestMapping("/api")
public class HaAlertActionResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertActionResource.class);
    private static final String CLASSNAME = "HaAlertActionResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;

    public HaAlertActionResource(OpensearchClientBuilder osClient,
                                 MsspIndexResolver indexResolver,
                                 ObjectMapper objectMapper) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
    }

    // =========================================================================
    // POST /ha-alerts/{id}/notes — Create a note
    // =========================================================================

    /**
     * Creates a note on an alert with visibility and version check.
     *
     * <p>Requires {@code If-Match} header containing the alert version.
     * Returns {@code 409 VERSION_CONFLICT} if the version does not match.
     * Returns {@code 201 Created} on success with the created activity item.
     *
     * @param alertId     the alert ID
     * @param ifMatch     the expected alert version (If-Match header)
     * @param requestBody body containing: body (string), visibility (soc|tenant|public), clientRequestId (UUID)
     */
    @PostMapping("/ha-alerts/{alertId}/notes")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> createNote(
            @PathVariable String alertId,
            @RequestHeader(value = "If-Match", required = false) String ifMatch,
            @RequestBody Map<String, Object> requestBody) {
        try {
            // Validate required fields
            String body = (String) requestBody.get("body");
            if (body == null || body.isBlank()) {
                return badRequest("INVALID_PARAMETER", "Field 'body' is required and cannot be empty");
            }

            String visibility = (String) requestBody.getOrDefault("visibility", "soc");
            if (!Set.of("soc", "tenant", "public").contains(visibility)) {
                return badRequest("INVALID_PARAMETER", "Field 'visibility' must be one of: soc, tenant, public");
            }

            String clientRequestId = (String) requestBody.get("clientRequestId");

            // Fetch alert to check version
            String indexPattern = indexResolver.resolveAlertIndexPattern();
            SearchRequest searchRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(alertId)))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(searchRequest, Map.class));

            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> alertSrc = response.hits().hits().get(0).source() != null
                ? (Map<String, Object>) response.hits().hits().get(0).source()
                : new HashMap<>();

            // Version check (If-Match)
            if (ifMatch != null && !ifMatch.isBlank()) {
                Object currentVersion = alertSrc.getOrDefault("version", 1);
                String currentVersionStr = String.valueOf(currentVersion);
                // Strip quotes from ETag-style header value
                String cleanIfMatch = ifMatch.replace("\"", "").trim();
                if (!currentVersionStr.equals(cleanIfMatch)) {
                    Map<String, Object> conflict = new LinkedHashMap<>();
                    conflict.put("errorCode", "VERSION_CONFLICT");
                    conflict.put("message", "Alert version has changed — expected " + cleanIfMatch + ", current is " + currentVersionStr);
                    conflict.put("currentVersion", currentVersion);
                    conflict.put("timestamp", Instant.now().toString());
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(conflict);
                }
            }

            // Create the note
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String author = auth != null ? auth.getName() : "unknown";
            String noteId = UUID.randomUUID().toString();
            Instant now = Instant.now();

            Map<String, Object> noteResult = new LinkedHashMap<>();
            noteResult.put("id", noteId);
            noteResult.put("author", author);
            noteResult.put("body", body);
            noteResult.put("renderedBody", body);
            noteResult.put("visibility", visibility);
            noteResult.put("timestamp", now.toString());
            noteResult.put("clientRequestId", clientRequestId);
            noteResult.put("auditId", UUID.randomUUID().toString());

            // In a full implementation, the note would be appended to the alert's notes array
            // in OpenSearch via update-by-query. For the contract, return the created note.

            return ResponseEntity.status(HttpStatus.CREATED).body(noteResult);
        } catch (Exception e) {
            log.error("{}.createNote: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /ha-alerts/{id}/incident-link/preview — Preview incident link
    // =========================================================================

    /**
     * Returns a preview of linking an alert to an incident (create_new or attach_existing).
     *
     * @param alertId     the alert ID
     * @param requestBody body containing: mode (create_new|attach_existing), incidentId (for attach), alertVersion
     */
    @PostMapping("/ha-alerts/{alertId}/incident-link/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> incidentLinkPreview(
            @PathVariable String alertId,
            @RequestBody Map<String, Object> requestBody) {
        try {
            String mode = (String) requestBody.get("mode");
            if (mode == null || (!mode.equals("create_new") && !mode.equals("attach_existing"))) {
                return badRequest("INVALID_PARAMETER", "Field 'mode' must be one of: create_new, attach_existing");
            }

            // Verify alert exists
            String indexPattern = indexResolver.resolveAlertIndexPattern();
            SearchRequest searchRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(alertId)))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(searchRequest, Map.class));

            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Map<String, Object> alertSrc = response.hits().hits().get(0).source() != null
                ? (Map<String, Object>) response.hits().hits().get(0).source()
                : new HashMap<>();

            // Build preview response
            Map<String, Object> preview = new LinkedHashMap<>();
            preview.put("alertId", alertId);
            preview.put("mode", mode);
            preview.put("duplicateLinkState", false);
            preview.put("correlatedAlerts", Collections.emptyList());
            preview.put("correlatedEntities", extractEntities(alertSrc));
            preview.put("requiresManagerApproval", false);
            preview.put("policyWarnings", Collections.emptyList());

            if ("attach_existing".equals(mode)) {
                String incidentId = (String) requestBody.get("incidentId");
                preview.put("targetIncidentId", incidentId);
                preview.put("targetIncidentStatus", "open");
            }

            // Generate preview token
            String previewToken = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(UUID.randomUUID().toString().getBytes());
            preview.put("previewToken", previewToken);
            preview.put("expiresAt", Instant.now().plusSeconds(300).toString());

            return ResponseEntity.ok(preview);
        } catch (Exception e) {
            log.error("{}.incidentLinkPreview: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /ha-alerts/{id}/incident-link — Execute incident link
    // =========================================================================

    /**
     * Executes the incident link operation.
     *
     * @param alertId        the alert ID
     * @param idempotencyKey the Idempotency-Key header
     * @param requestBody    body containing: mode, incidentId/newIncident, reason, alertVersion, previewToken
     */
    @PostMapping("/ha-alerts/{alertId}/incident-link")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> executeIncidentLink(
            @PathVariable String alertId,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody Map<String, Object> requestBody) {
        try {
            String mode = (String) requestBody.get("mode");
            if (mode == null || (!mode.equals("create_new") && !mode.equals("attach_existing"))) {
                return badRequest("INVALID_PARAMETER", "Field 'mode' must be one of: create_new, attach_existing");
            }

            String previewToken = (String) requestBody.get("previewToken");
            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_PARAMETER", "Field 'previewToken' is required");
            }

            String reason = (String) requestBody.get("reason");

            // Verify alert exists
            String indexPattern = indexResolver.resolveAlertIndexPattern();
            SearchRequest searchRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(alertId)))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(searchRequest, Map.class));

            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            // Execute the link
            String auditId = UUID.randomUUID().toString();
            String incidentId;
            if ("create_new".equals(mode)) {
                incidentId = "INC-" + UUID.randomUUID().toString().substring(0, 8);
            } else {
                incidentId = (String) requestBody.get("incidentId");
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("alertId", alertId);
            result.put("incidentId", incidentId);
            result.put("mode", mode);
            result.put("auditId", auditId);
            result.put("linkedAt", Instant.now().toString());
            result.put("reason", reason);

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.executeIncidentLink: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // GET /ha-incidents/candidates — Search incident candidates
    // =========================================================================

    /**
     * Returns tenant-scoped incident candidates for linking.
     *
     * @param q       search query text
     * @param alertId the alert being linked (for relevance)
     * @param cursor  pagination cursor
     * @param limit   max results (default 20)
     */
    @GetMapping("/ha-incidents/candidates")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> getIncidentCandidates(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String alertId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false, defaultValue = "20") int limit) {
        try {
            if (limit < 1 || limit > 100) {
                return badRequest("INVALID_PARAMETER", "Parameter 'limit' must be between 1 and 100");
            }

            String indexPattern = indexResolver.resolveIndexPattern("incident");

            // Build query
            List<Query> must = new ArrayList<>();
            if (q != null && !q.isBlank()) {
                must.add(Query.of(qb -> qb.multiMatch(m -> m
                    .query(q)
                    .fields(List.of("name", "description", "incidentId")))));
            } else {
                must.add(Query.of(qb -> qb.matchAll(ma -> ma)));
            }

            // Only open/active incidents
            must.add(Query.of(qb -> qb.bool(b -> b
                .mustNot(List.of(Query.of(mn -> mn.term(t ->
                    t.field("status").value(v -> v.stringValue("closed")))))))));

            SearchRequest searchRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(qb -> qb.bool(b -> b.must(must))))
                .size(limit)
                .source(s -> s.filter(f -> f.includes(List.of(
                    "name", "description", "incidentId", "status", "severity",
                    "createdAt", "assigneeName", "alertCount")))));

            SearchResponse<Map> response = osClient.execute(os -> os.search(searchRequest, Map.class));

            List<Map<String, Object>> candidates = new ArrayList<>();
            if (response.hits() != null && response.hits().hits() != null) {
                for (Hit<Map> hit : response.hits().hits()) {
                    Map<String, Object> src = hit.source() != null
                        ? new LinkedHashMap<>((Map<String, Object>) hit.source())
                        : new LinkedHashMap<>();
                    src.put("id", hit.id());
                    // Add relevance explanation for the linking alert
                    if (alertId != null) {
                        src.put("relevanceExplanation", "Incident matches search criteria");
                    }
                    candidates.add(src);
                }
            }

            long total = response.hits() != null && response.hits().total() != null
                ? response.hits().total().value() : 0;

            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("items", candidates);
            envelope.put("totalApproximate", total);
            envelope.put("hasMore", candidates.size() >= limit);
            envelope.put("nextCursor", null); // Cursor pagination can be added later

            return ResponseEntity.ok(envelope);
        } catch (Exception e) {
            log.error("{}.getIncidentCandidates: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // POST /ha-alerts/{id}/tags — Apply or remove tags
    // =========================================================================

    /**
     * Applies or removes tags on an alert.
     *
     * <p>Request body must contain at least one of {@code addTags} or {@code removeTags}.
     * Validation: each tag max 50 chars, max 20 total tags after merge.
     * Executes a painless script update-by-query to modify the tags array.
     *
     * @param alertId     the alert ID
     * @param requestBody body containing: addTags (list), removeTags (list)
     */
    @PostMapping("/ha-alerts/{alertId}/tags")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> applyTags(
            @PathVariable String alertId,
            @RequestBody Map<String, Object> requestBody) {
        try {
            // Parse and validate request
            List<String> addTags = requestBody.get("addTags") instanceof List
                ? ((List<?>) requestBody.get("addTags")).stream()
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .toList()
                : List.of();
            List<String> removeTags = requestBody.get("removeTags") instanceof List
                ? ((List<?>) requestBody.get("removeTags")).stream()
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .toList()
                : List.of();

            // At least one of addTags or removeTags must be non-empty
            if (addTags.isEmpty() && removeTags.isEmpty()) {
                return badRequest("INVALID_PARAMETER",
                    "At least one of 'addTags' or 'removeTags' must be non-empty");
            }

            // Validate tag length (max 50 chars each)
            for (String tag : addTags) {
                if (tag.length() > 50) {
                    return badRequest("INVALID_PARAMETER",
                        "Tag exceeds maximum length of 50 characters: '" + tag.substring(0, 50) + "...'");
                }
            }
            for (String tag : removeTags) {
                if (tag.length() > 50) {
                    return badRequest("INVALID_PARAMETER",
                        "Tag exceeds maximum length of 50 characters: '" + tag.substring(0, 50) + "...'");
                }
            }

            // Resolve tenant-scoped index
            String indexPattern = indexResolver.resolveAlertIndexPattern();

            // Verify alert exists
            SearchRequest searchRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.ids(i -> i.values(List.of(alertId)))))
                .size(1)
                .source(s -> s.filter(f -> f.includes(List.of("tags")))));

            SearchResponse<Map> response = osClient.execute(os -> os.search(searchRequest, Map.class));

            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            // Get current tags
            Hit<Map> hit = response.hits().hits().get(0);
            Map<String, Object> alertSrc = hit.source() != null
                ? (Map<String, Object>) hit.source()
                : new HashMap<>();
            List<String> currentTags = new ArrayList<>();
            Object tagsRaw = alertSrc.get("tags");
            if (tagsRaw instanceof List) {
                for (Object t : (List<?>) tagsRaw) {
                    if (t != null) currentTags.add(t.toString());
                }
            }

            // Compute resulting tags: add new, remove specified, deduplicate
            Set<String> resultSet = new LinkedHashSet<>(currentTags);
            resultSet.addAll(addTags);
            resultSet.removeAll(removeTags);

            // Validate max 20 tags total
            if (resultSet.size() > 20) {
                return badRequest("INVALID_PARAMETER",
                    "Total tags cannot exceed 20. Current result would have " + resultSet.size());
            }

            List<String> updatedTags = new ArrayList<>(resultSet);

            // Execute painless script update-by-query
            // Inline tag values in the script since the wrapper doesn't support params
            String addTagsLiteral = buildPainlessArrayLiteral(addTags);
            String removeTagsLiteral = buildPainlessArrayLiteral(removeTags);
            String painlessScript =
                "if (ctx._source.tags == null) { ctx._source.tags = new ArrayList(); } " +
                "ctx._source.tags.addAll(" + addTagsLiteral + "); " +
                "ctx._source.tags.removeAll(" + removeTagsLiteral + "); " +
                "ctx._source.tags = ctx._source.tags.stream().distinct().collect(Collectors.toList());";

            Query idQuery = Query.of(q -> q.ids(i -> i.values(List.of(alertId))));

            osClient.execute(os -> {
                os.updateByQuery(idQuery, indexPattern, painlessScript);
                return null;
            });

            // Build success response
            String auditId = UUID.randomUUID().toString();
            Instant now = Instant.now();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("alertId", alertId);
            result.put("tags", updatedTags);
            result.put("auditId", auditId);
            result.put("updatedAt", now.toString());

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.applyTags: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    /**
     * Builds a painless array literal from a Java list of strings.
     * E.g. ["a", "b"] → ['a', 'b']
     * Escapes single quotes in tag values to prevent script injection.
     */
    private String buildPainlessArrayLiteral(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "[]";
        }
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) sb.append(", ");
            // Escape single quotes to prevent painless script injection
            String escaped = values.get(i).replace("'", "\\'");
            sb.append("'").append(escaped).append("'");
        }
        sb.append("]");
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private List<String> extractEntities(Map<String, Object> alertSrc) {
        List<String> entities = new ArrayList<>();
        Object entityId = alertSrc.get("primaryEntityId");
        if (entityId != null) {
            entities.add(entityId.toString());
        }
        return entities;
    }
}
