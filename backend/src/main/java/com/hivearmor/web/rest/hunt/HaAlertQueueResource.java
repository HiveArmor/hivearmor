package com.hivearmor.web.rest.hunt;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.hunt.AlertActionResolver;
import com.hivearmor.service.hunt.HaAlertFacetService;
import com.hivearmor.service.hunt.HaAlertKqlParser;
import com.hivearmor.service.hunt.HaAlertQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.opensearch.client.json.JsonData;
import org.opensearch.client.opensearch._types.FieldValue;
import org.opensearch.client.opensearch._types.SortOptions;
import org.opensearch.client.opensearch._types.SortOrder;
import org.opensearch.client.opensearch._types.aggregations.*;
import org.opensearch.client.opensearch._types.query_dsl.*;
import org.opensearch.client.opensearch.core.SearchRequest;
import org.opensearch.client.opensearch.core.SearchResponse;
import org.opensearch.client.opensearch.core.search.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
@Tag(name = "Alerts", description = "Alert queue listing, filtering, and detail retrieval (ALT-014)")
public class HaAlertQueueResource {

    private static final Logger log = LoggerFactory.getLogger(HaAlertQueueResource.class);
    private static final String CLASSNAME = "HaAlertQueueResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    /** Cursor expiry duration in minutes. */
    private static final long CURSOR_EXPIRY_MINUTES = 10;

    /** Allowlisted sort fields for the alert queue. */
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of(
        "severity", "@timestamp", "riskScore", "status", "name", "_id", "id"
    );

    /** Default limit when none is provided. */
    private static final int DEFAULT_LIMIT = 50;

    private final OpensearchClientBuilder osClient;
    private final MsspIndexResolver indexResolver;
    private final ObjectMapper objectMapper;
    private final HaAlertQueryService alertQueryService;
    private final HaAlertFacetService facetService;
    private final AlertActionResolver actionResolver;

    public HaAlertQueueResource(OpensearchClientBuilder osClient,
                                MsspIndexResolver indexResolver,
                                ObjectMapper objectMapper,
                                HaAlertQueryService alertQueryService,
                                HaAlertFacetService facetService,
                                AlertActionResolver actionResolver) {
        this.osClient = osClient;
        this.indexResolver = indexResolver;
        this.objectMapper = objectMapper;
        this.alertQueryService = alertQueryService;
        this.facetService = facetService;
        this.actionResolver = actionResolver;
    }

    /**
     * Cursor-paginated alert queue query using OpenSearch search_after.
     *
     * <p>Accepts an opaque {@code cursor} token to resume from a previous position.
     * The deprecated {@code page}/{@code size} parameters are kept as fallback
     * for backward compatibility during the frontend migration window.
     */
    @GetMapping("/ha-alerts")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List alerts with cursor pagination",
        description = "Returns a cursor-paginated list of alerts from the queue. Supports filtering by severity, "
            + "status, category, assignee, tags, risk score, SLA, and threat intelligence. "
            + "Uses OpenSearch search_after for efficient deep pagination. (ALT-014)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Alert list with cursor for next page"),
        @ApiResponse(responseCode = "400", description = "Invalid filter, sort field, or expired/invalid cursor"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<?> getAlerts(
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String assignee,
            @RequestParam(required = false) String tags,
            @RequestParam(required = false) String riskMin,
            @RequestParam(required = false) String sla,
            @RequestParam(required = false) String threatIntel,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) String fields,
            // Deprecated page/size fallback for backward compatibility
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            HttpServletRequest httpRequest) {

        try {
            // Validate filter allowlist — reject unknown parameters
            Set<String> paramNames = httpRequest.getParameterMap().keySet();
            alertQueryService.validateFilterAllowlist(paramNames);

            String indexPattern = indexResolver.resolveAlertIndexPattern();

            // Determine effective limit
            int effectiveLimit = resolveLimit(limit, size);

            // Parse and validate sort specification
            List<SortSpec> sortSpecs = parseSortSpec(sort);

            // Build filters via service
            List<Query> filters = alertQueryService.buildFilters(
                severity, status, from, to, category, assignee, tags,
                riskMin, sla, threatIntel, tenantId);

            // Build query from q parameter (KQL-like parsing)
            List<Query> must = new ArrayList<>();
            Query parsedQuery = alertQueryService.parseQueryParam(q);
            must.add(parsedQuery);

            Query query = Query.of(qb -> qb.bool(b -> {
                b.must(must);
                if (!filters.isEmpty()) b.filter(filters);
                return b;
            }));

            // Build sort options
            List<SortOptions> sortOptions = buildSortOptions(sortSpecs);

            // Build search request
            SearchRequest.Builder searchBuilder = new SearchRequest.Builder()
                .index(indexPattern)
                .query(query)
                .size(effectiveLimit)
                .sort(sortOptions)
                .trackTotalHits(t -> t.enabled(true));

            // Apply cursor (search_after) or deprecated page/size offset
            if (cursor != null && !cursor.isBlank()) {
                CursorPayload cursorPayload = decodeCursor(cursor);
                if (cursorPayload == null) {
                    return badRequest("CURSOR_EXPIRED", "Cursor is invalid or could not be decoded");
                }
                // Validate cursor expiry
                if (cursorPayload.exp < Instant.now().getEpochSecond()) {
                    return badRequest("CURSOR_EXPIRED", "Cursor has expired — refetch from the beginning");
                }
                // Validate cursor is scoped to the current tenant
                String currentTenant = TenantContext.get();
                if (!Objects.equals(cursorPayload.t, currentTenant)) {
                    return badRequest("CURSOR_EXPIRED", "Cursor does not match the current tenant scope");
                }
                // Validate filter hash
                String currentFilterHash = computeFilterHash(severity, status, from, to, category, assignee, tags, q, riskMin, sla, threatIntel);
                if (!Objects.equals(cursorPayload.f, currentFilterHash)) {
                    return badRequest("CURSOR_EXPIRED", "Cursor does not match the current filter parameters");
                }
                // Validate sort hash
                String currentSortHash = computeSortHash(sortSpecs);
                if (!Objects.equals(cursorPayload.s, currentSortHash)) {
                    return badRequest("CURSOR_EXPIRED", "Cursor does not match the current sort parameters");
                }
                // Apply search_after
                searchBuilder.searchAfter(cursorPayload.sv);
            } else if (page != null && page > 0) {
                // Deprecated fallback: offset-based pagination
                int fromIdx = page * effectiveLimit;
                searchBuilder.from(fromIdx);
            }

            SearchRequest request = searchBuilder.build();
            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            // Extract total
            long total = response.hits().total() != null ? response.hits().total().value() : 0;

            // Map hits to alert projections
            List<Map<String, Object>> items = new ArrayList<>();
            String nextCursor = null;
            Set<String> fieldSet = parseFieldsParam(fields);

            if (response.hits() != null && response.hits().hits() != null) {
                List<Hit<Map>> hits = response.hits().hits();
                for (int i = 0; i < hits.size(); i++) {
                    Hit<Map> hit = hits.get(i);
                    Map<String, Object> alertProjection = mapHitToProjection(hit, fieldSet);
                    items.add(alertProjection);

                    // Capture sort values from the last hit for cursor
                    if (i == hits.size() - 1 && hit.sort() != null && !hit.sort().isEmpty()) {
                        nextCursor = encodeCursor(hit.sort(), sortSpecs,
                            severity, status, from, to, category, assignee, tags, q, riskMin, sla, threatIntel);
                    }
                }
            }

            // Determine hasMore
            boolean hasMore = items.size() >= effectiveLimit && nextCursor != null;
            if (!hasMore) {
                nextCursor = null;
            }

            // Build envelope response
            Map<String, Object> envelope = new LinkedHashMap<>();
            envelope.put("items", items);
            envelope.put("nextCursor", nextCursor);
            envelope.put("hasMore", hasMore);
            envelope.put("snapshotAt", Instant.now().toString());
            envelope.put("totalApproximate", total);

            return ResponseEntity.ok(envelope);

        } catch (HaAlertKqlParser.KqlParseException e) {
            // KQL parse error — return structured error with offset and expected tokens
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("errorCode", "QUERY_PARSE_ERROR");
            error.put("message", e.getMessage());
            error.put("offset", e.getOffset());
            error.put("expectedTokens", e.getExpectedTokens());
            error.put("timestamp", Instant.now().toString());
            return ResponseEntity.badRequest().body(error);
        } catch (HaAlertQueryService.InvalidFilterException e) {
            // Invalid filter value
            return badRequest("INVALID_FILTER", e.getMessage());
        } catch (IllegalArgumentException e) {
            // Validation errors (bad sort field, bad limit, etc.)
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}: {}", CLASSNAME + ".getAlerts", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/ha-alerts/summary")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get alert queue summary facets",
        description = "Returns aggregated facet counts for the alert queue, including severity distribution, "
            + "status breakdown, and category counts. Accepts the same filter parameters as the alert list endpoint. (ALT-014)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Summary facets computed successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid filter parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getAlertSummary(
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String assignee,
            @RequestParam(required = false) String tags,
            @RequestParam(required = false) String riskMin,
            @RequestParam(required = false) String sla,
            @RequestParam(required = false) String threatIntel) {
        try {
            Map<String, Object> summary = facetService.computeSummary(
                severity, status, from, to, category, assignee, tags,
                riskMin, sla, threatIntel, q);
            return ResponseEntity.ok(summary);
        } catch (HaAlertQueryService.InvalidFilterException e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("errorCode", "INVALID_FILTER");
            error.put("message", e.getMessage());
            error.put("timestamp", Instant.now().toString());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            log.error("{}: {}", CLASSNAME + ".getAlertSummary", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    @GetMapping("/ha-alerts/{alertId:(?!severity-board).+}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get alert detail by ID",
        description = "Returns comprehensive alert detail including MITRE ATT&CK mapping, risk breakdown, "
            + "threat intelligence matches, timeline, related alerts, and available actions. "
            + "Returns 404 for both not-found and unauthorized alerts to prevent ID enumeration. (ALT-014)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Full alert detail projection"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Alert not found or not visible to current tenant"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    @SuppressWarnings({"unchecked", "rawtypes"})
    public ResponseEntity<Map<String, Object>> getAlertDetail(@PathVariable String alertId) {
        try {
            String indexPattern = indexResolver.resolveAlertIndexPattern();

            SearchRequest request = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(qr -> qr.ids(i -> i.values(List.of(alertId)))))
                .size(1));

            SearchResponse<Map> response = osClient.execute(os -> os.search(request, Map.class));

            // Return 404 for both not-found and unauthorized (no enumeration)
            if (response.hits() == null || response.hits().hits().isEmpty()) {
                return ResponseEntity.notFound().build();
            }

            Hit<Map> hit = response.hits().hits().get(0);
            Map<String, Object> src = hit.source() != null
                ? new LinkedHashMap<>((Map<String, Object>) hit.source())
                : new LinkedHashMap<>();

            // Build comprehensive detail projection
            Map<String, Object> detail = buildDetailProjection(hit.id(), src);

            return ResponseEntity.ok(detail);
        } catch (Exception e) {
            log.error("{}: {}", CLASSNAME + ".getAlertDetail", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Detail projection builder
    // =========================================================================

    /**
     * Builds a comprehensive alert detail projection from the OpenSearch hit.
     * Includes: core identity, MITRE ATT&CK, risk breakdown, threat intel,
     * timeline, related alerts, available actions, and metadata.
     *
     * <p>Target response below 75KB compressed — excludes raw event payloads.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildDetailProjection(String alertId, Map<String, Object> src) {
        src = normalizeAlertSource(src);
        Map<String, Object> detail = new LinkedHashMap<>();

        // ── Core identity fields ──────────────────────────────────────────────
        detail.put("id", alertId);
        detail.put("title", src.get("name"));
        detail.put("summary", src.get("description"));
        detail.put("severity", src.get("severity"));
        detail.put("riskScore", src.get("riskScore"));
        detail.put("confidence", src.get("confidence"));
        detail.put("status", src.get("status"));
        detail.put("statusLabel", mapStatusLabel(src.get("status")));
        detail.put("category", src.get("category"));
        detail.put("detectedAt", src.get("@timestamp"));
        detail.put("updatedAt", src.get("updatedAt"));
        putIfPresent(detail, "ruleId", src.get("ruleId"));
        putIfPresent(detail, "ruleName", src.get("ruleName"));

        Object sev = src.get("severity");
        if (sev instanceof Number) {
            detail.put("severityLabel", mapSeverityLabel(((Number) sev).intValue()));
        }

        // ── MITRE ATT&CK mapping ─────────────────────────────────────────────
        Map<String, Object> mitre = new LinkedHashMap<>();
        putIfPresent(mitre, "tacticId", src.get("mitreTacticId"));
        putIfPresent(mitre, "tacticName", src.get("mitreTacticName"));
        putIfPresent(mitre, "techniqueName", src.get("mitreTechniqueName"));
        putIfPresent(mitre, "techniqueId", src.get("mitreTechniqueId"));
        putIfPresent(mitre, "subTechnique", src.get("mitreSubTechnique"));
        if (!mitre.isEmpty()) {
            detail.put("mitreAttack", mitre);
        }

        // ── Risk score breakdown ──────────────────────────────────────────────
        Object riskFactorsRaw = src.get("riskFactors");
        if (riskFactorsRaw instanceof List) {
            detail.put("riskBreakdown", riskFactorsRaw);
        } else {
            detail.put("riskBreakdown", Collections.emptyList());
        }

        // ── Threat intelligence matches ───────────────────────────────────────
        Object threatIntelRaw = src.get("threatIntelIndicators");
        if (threatIntelRaw instanceof List) {
            detail.put("threatIntelMatches", threatIntelRaw);
        } else {
            // Try individual threatIntel* fields
            Map<String, Object> intelEntry = new LinkedHashMap<>();
            putIfPresent(intelEntry, "source", src.get("threatIntelSource"));
            putIfPresent(intelEntry, "type", src.get("threatIntelType"));
            putIfPresent(intelEntry, "confidence", src.get("threatIntelConfidence"));
            putIfPresent(intelEntry, "lastSeen", src.get("threatIntelLastSeen"));
            if (!intelEntry.isEmpty()) {
                detail.put("threatIntelMatches", List.of(intelEntry));
            } else {
                detail.put("threatIntelMatches", Collections.emptyList());
            }
        }

        // ── Timeline ──────────────────────────────────────────────────────────
        List<Map<String, Object>> timeline = buildTimeline(src);
        detail.put("timeline", timeline);

        // ── Related alerts ────────────────────────────────────────────────────
        List<Map<String, Object>> relatedAlerts = findRelatedAlerts(src, alertId);
        detail.put("relatedAlerts", relatedAlerts);

        // ── Available actions ─────────────────────────────────────────────────
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userLogin = auth != null ? auth.getName() : null;
        Collection<String> userRoles = auth != null
            ? auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList())
            : Collections.emptyList();
        String tenantPrefix = TenantContext.get();
        List<Map<String, Object>> availableActions = actionResolver.resolveAvailableActions(
            src, userLogin, userRoles, tenantPrefix);
        detail.put("availableActions", availableActions);

        // ── Occurrence count ──────────────────────────────────────────────────
        detail.put("occurrenceCount", src.getOrDefault("occurrenceCount", 1));

        // ── Rendered reason ───────────────────────────────────────────────────
        detail.put("renderedReason", buildRenderedReason(src));

        // ── Metadata ──────────────────────────────────────────────────────────
        detail.put("version", src.getOrDefault("version", 1));
        detail.put("dataCompleteness", determineDataCompleteness(src));

        // Primary entity
        Map<String, Object> primaryEntity = new LinkedHashMap<>();
        putIfPresent(primaryEntity, "id", src.get("primaryEntityId"));
        putIfPresent(primaryEntity, "type", src.get("primaryEntityType"));
        putIfPresent(primaryEntity, "label", src.get("primaryEntityLabel"));
        putIfPresent(primaryEntity, "riskScore", src.get("primaryEntityRiskScore"));
        if (!primaryEntity.isEmpty()) {
            detail.put("primaryEntity", primaryEntity);
        } else {
            // Fallback: try nested object
            Object peObj = src.get("primaryEntity");
            detail.put("primaryEntity", peObj != null ? peObj : Collections.emptyMap());
        }

        // Assignee
        Map<String, Object> assignee = new LinkedHashMap<>();
        putIfPresent(assignee, "id", src.get("assigneeId"));
        putIfPresent(assignee, "displayName", src.get("assigneeName"));
        detail.put("assignee", assignee.isEmpty() ? null : assignee);

        // Tenant
        Map<String, Object> tenant = new LinkedHashMap<>();
        putIfPresent(tenant, "id", src.get("tenantId"));
        putIfPresent(tenant, "name", src.get("tenantName"));
        detail.put("tenant", tenant.isEmpty() ? null : tenant);

        // SLA
        Map<String, Object> sla = new LinkedHashMap<>();
        putIfPresent(sla, "status", src.get("slaStatus"));
        putIfPresent(sla, "dueAt", src.get("slaDueAt"));
        detail.put("sla", sla.isEmpty() ? null : sla);

        // Tags
        Object tagsRaw = src.get("tags");
        if (tagsRaw instanceof List) {
            detail.put("tags", tagsRaw);
        } else {
            detail.put("tags", Collections.emptyList());
        }

        // ── Investigation fields (Sprint 39 — ALT-001 enhancement) ───────────

        // 2.1 Detection object
        Map<String, Object> detection = new LinkedHashMap<>();
        putIfPresent(detection, "ruleId", src.get("ruleId"));
        putIfPresent(detection, "ruleName", src.get("ruleName"));
        // detector is derived from category field
        Object categoryVal = src.get("category");
        detection.put("detector", categoryVal != null ? categoryVal.toString() : "Unknown");
        // dataSources — stored as a list in the alert document
        Object dataSourcesRaw = src.get("dataSources");
        if (dataSourcesRaw instanceof List) {
            detection.put("dataSources", dataSourcesRaw);
        } else {
            detection.put("dataSources", Collections.emptyList());
        }
        detail.put("detection", detection);

        // 2.2 Asset object with criticality derivation from riskScore
        Map<String, Object> asset = new LinkedHashMap<>();
        putIfPresent(asset, "id", src.get("primaryEntityId"));
        putIfPresent(asset, "name", src.get("primaryEntityLabel"));
        putIfPresent(asset, "owner", src.get("assetOwner"));
        asset.put("criticality", deriveCriticality(src.get("riskScore")));
        detail.put("asset", asset);

        // 2.3 Counts object — secondary aggregation against v3-hive-log-*
        detail.put("counts", buildEventCounts(alertId, src));

        // 2.4 Verdict derivation
        detail.put("verdict", deriveVerdict(src));

        // 2.5 Snapshot version
        Object versionRaw = src.get("version");
        int snapshotVersion = 1;
        if (versionRaw instanceof Number) {
            snapshotVersion = ((Number) versionRaw).intValue();
        }
        detail.put("snapshotVersion", snapshotVersion);

        return detail;
    }

    /**
     * Builds a human-readable rendered reason string from the alert source fields.
     * Format: "{name} detected {mitreTacticName} activity targeting {primaryEntityLabel}. {description}"
     * Null-safe: skips parts when the corresponding field is absent.
     */
    private String buildRenderedReason(Map<String, Object> src) {
        String name = src.get("name") != null ? src.get("name").toString() : null;
        String tacticName = src.get("mitreTacticName") != null ? src.get("mitreTacticName").toString() : null;
        String entityLabel = src.get("primaryEntityLabel") != null ? src.get("primaryEntityLabel").toString() : null;
        String description = src.get("description") != null ? src.get("description").toString() : null;

        StringBuilder sb = new StringBuilder();

        if (name != null) {
            sb.append(name);
            if (tacticName != null) {
                sb.append(" detected ").append(tacticName).append(" activity");
                if (entityLabel != null) {
                    sb.append(" targeting ").append(entityLabel);
                }
            }
        } else if (tacticName != null) {
            sb.append("Detected ").append(tacticName).append(" activity");
            if (entityLabel != null) {
                sb.append(" targeting ").append(entityLabel);
            }
        } else if (entityLabel != null) {
            sb.append("Activity targeting ").append(entityLabel);
        }

        if (description != null) {
            if (sb.length() > 0) {
                sb.append(". ");
            }
            sb.append(description);
        }

        return sb.length() > 0 ? sb.toString() : null;
    }

    // =========================================================================
    // Investigation field helpers (Sprint 39 — ALT-001)
    // =========================================================================

    /**
     * Derives asset criticality label from riskScore.
     * ≥80 → critical, ≥60 → high, ≥40 → medium, else → low.
     */
    private String deriveCriticality(Object riskScoreRaw) {
        if (riskScoreRaw instanceof Number) {
            int score = ((Number) riskScoreRaw).intValue();
            if (score >= 80) return "critical";
            if (score >= 60) return "high";
            if (score >= 40) return "medium";
        }
        return "low";
    }

    /**
     * Derives the investigation verdict from status and confidence.
     * true_positive (status=3) → "malicious", false_positive (status=4) → "benign",
     * confidence ≥ 85 → "suspicious", else → "unknown".
     */
    private String deriveVerdict(Map<String, Object> src) {
        Object statusRaw = src.get("status");
        if (statusRaw instanceof Number) {
            int status = ((Number) statusRaw).intValue();
            if (status == 6) return "malicious";
            if (status == 7) return "benign";
        }
        Object confidenceRaw = src.get("confidence");
        if (confidenceRaw instanceof Number) {
            int confidence = ((Number) confidenceRaw).intValue();
            if (confidence >= 85) return "suspicious";
        }
        return "unknown";
    }

    /**
     * Builds event counts by querying v3-hive-log-* for events linked to this alert.
     * Aggregates by event.category to produce process/network/indicator counts.
     * Wrapped in try/catch — defaults to all zeros if no events exist or query fails.
     */
    @SuppressWarnings("rawtypes")
    private Map<String, Object> buildEventCounts(String alertId, Map<String, Object> src) {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("events", 0);
        counts.put("processes", 0);
        counts.put("connections", 0);
        counts.put("indicators", 0);
        counts.put("relatedAlerts", 0);

        try {
            String logIndexPattern = indexResolver.resolveIndexPattern("log");

            List<Query> associationQueries = new ArrayList<>();
            associationQueries.add(Query.of(q -> q.term(t ->
                t.field("alert.id.keyword").value(FieldValue.of(alertId)))));

            Object sourceEventsRaw = src.get("sourceEvents");
            if (!(sourceEventsRaw instanceof List)) {
                sourceEventsRaw = src.get("sourceEventIds");
            }
            if (sourceEventsRaw instanceof List) {
                List<String> sourceEventIds = ((List<?>) sourceEventsRaw).stream()
                    .filter(Objects::nonNull)
                    .map(Object::toString)
                    .filter(value -> !value.isBlank())
                    .distinct()
                    .limit(500)
                    .collect(Collectors.toList());
                if (!sourceEventIds.isEmpty()) {
                    associationQueries.add(Query.of(q -> q.ids(i -> i.values(sourceEventIds))));
                    associationQueries.add(Query.of(q -> q.terms(t -> t
                        .field("event.id.keyword")
                        .terms(v -> v.value(sourceEventIds.stream()
                            .map(FieldValue::of)
                            .collect(Collectors.toList()))))));
                }
            }

            Query associationQuery = Query.of(q -> q.bool(b -> b
                .should(associationQueries)
                .minimumShouldMatch("1")));

            // Query events linked to this alert, aggregate by event.category.
            SearchRequest countRequest = SearchRequest.of(r -> r
                .index(logIndexPattern)
                .query(associationQuery)
                .size(0)
                .aggregations("by_category", a -> a.terms(t ->
                    t.field("event.category.keyword").size(20)))
                .aggregations("has_threat_intel", a -> a.filter(f ->
                    f.exists(e -> e.field("threat.indicator.type"))))
            );

            SearchResponse<Map> countResponse = osClient.execute(os -> os.search(countRequest, Map.class));

            // Total events
            long totalEvents = 0;
            if (countResponse.hits() != null && countResponse.hits().total() != null) {
                totalEvents = countResponse.hits().total().value();
            }
            counts.put("events", (int) totalEvents);

            // Parse category buckets
            Aggregate catAgg = countResponse.aggregations().get("by_category");
            if (catAgg != null && catAgg.isSterms()) {
                for (StringTermsBucket bucket : catAgg.sterms().buckets().array()) {
                    String category = bucket.key();
                    long docCount = bucket.docCount();
                    if ("process".equalsIgnoreCase(category)) {
                        counts.put("processes", (int) docCount);
                    } else if ("network".equalsIgnoreCase(category)) {
                        counts.put("connections", (int) docCount);
                    }
                }
            }

            // Indicator count from threat intel filter aggregation
            Aggregate intelAgg = countResponse.aggregations().get("has_threat_intel");
            if (intelAgg != null && intelAgg.isFilter()) {
                counts.put("indicators", (int) intelAgg.filter().docCount());
            }

            // Related alerts count from the alert document itself
            Object relatedAlertCount = src.get("relatedAlertCount");
            if (relatedAlertCount instanceof Number) {
                counts.put("relatedAlerts", ((Number) relatedAlertCount).intValue());
            }

        } catch (Exception e) {
            log.warn("{}.buildEventCounts: failed for alertId={} — {}", CLASSNAME, alertId, e.getMessage());
            // Return default zeros (already set above)
        }

        return counts;
    }

    /**
     * Builds a timeline from the alert's creation event, status history, and notes.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> buildTimeline(Map<String, Object> src) {
        List<Map<String, Object>> timeline = new ArrayList<>();

        // Creation event
        Object createdAt = src.get("@timestamp");
        if (createdAt != null) {
            Map<String, Object> creation = new LinkedHashMap<>();
            creation.put("timestamp", createdAt);
            creation.put("action", "created");
            creation.put("actor", "system");
            creation.put("detail", "Alert created");
            timeline.add(creation);
        }

        // Status history
        Object statusHistory = src.get("statusHistory");
        if (statusHistory instanceof List) {
            for (Object entry : (List<?>) statusHistory) {
                if (entry instanceof Map) {
                    Map<String, Object> histEntry = (Map<String, Object>) entry;
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("timestamp", histEntry.get("timestamp"));
                    event.put("action", "status_change");
                    event.put("actor", histEntry.getOrDefault("actor", "system"));
                    event.put("detail", histEntry.get("detail"));
                    timeline.add(event);
                }
            }
        }

        // Notes
        Object notes = src.get("notes");
        if (notes instanceof List) {
            for (Object entry : (List<?>) notes) {
                if (entry instanceof Map) {
                    Map<String, Object> noteEntry = (Map<String, Object>) entry;
                    Map<String, Object> event = new LinkedHashMap<>();
                    event.put("timestamp", noteEntry.get("timestamp"));
                    event.put("action", "note_added");
                    event.put("actor", noteEntry.getOrDefault("author", "unknown"));
                    event.put("detail", noteEntry.get("body"));
                    timeline.add(event);
                }
            }
        }

        // Sort by timestamp descending
        timeline.sort((a, b) -> {
            String tsA = a.get("timestamp") != null ? a.get("timestamp").toString() : "";
            String tsB = b.get("timestamp") != null ? b.get("timestamp").toString() : "";
            return tsB.compareTo(tsA);
        });

        return timeline;
    }

    /**
     * Finds related alerts by shared primaryEntity or parentId.
     * Returns a lightweight list (max 10 entries to keep under 75KB).
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> findRelatedAlerts(Map<String, Object> src, String currentAlertId) {
        try {
            String indexPattern = indexResolver.resolveAlertIndexPattern();
            List<Query> shouldClauses = new ArrayList<>();

            // Match by shared primaryEntity
            Object primaryEntityId = src.get("primaryEntityId");
            if (primaryEntityId != null && !primaryEntityId.toString().isBlank()) {
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("primaryEntityId").value(v -> v.stringValue(primaryEntityId.toString())))));
            }

            // Match by parentId
            Object parentId = src.get("parentId");
            if (parentId != null && !parentId.toString().isBlank()) {
                shouldClauses.add(Query.of(q -> q.term(t ->
                    t.field("parentId").value(v -> v.stringValue(parentId.toString())))));
            }

            // Also find children if this alert is a parent
            shouldClauses.add(Query.of(q -> q.term(t ->
                t.field("parentId").value(v -> v.stringValue(currentAlertId)))));

            if (shouldClauses.isEmpty()) {
                return Collections.emptyList();
            }

            // Exclude the current alert from results
            Query mustNot = Query.of(q -> q.ids(i -> i.values(List.of(currentAlertId))));

            SearchRequest relatedRequest = SearchRequest.of(r -> r
                .index(indexPattern)
                .query(Query.of(q -> q.bool(b -> b
                    .should(shouldClauses)
                    .minimumShouldMatch("1")
                    .mustNot(List.of(mustNot)))))
                .size(10)
                .source(s -> s.filter(f -> f.includes(List.of(
                    "name", "severity", "@timestamp", "status", "primaryEntityId", "parentId")))));

            SearchResponse<Map> relatedResponse = osClient.execute(os -> os.search(relatedRequest, Map.class));

            List<Map<String, Object>> related = new ArrayList<>();
            if (relatedResponse.hits() != null && relatedResponse.hits().hits() != null) {
                for (Hit<Map> relHit : relatedResponse.hits().hits()) {
                    Map<String, Object> relSrc = relHit.source() != null
                        ? new LinkedHashMap<>((Map<String, Object>) relHit.source())
                        : new LinkedHashMap<>();
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("id", relHit.id());
                    entry.put("title", relSrc.get("name"));
                    entry.put("severity", relSrc.get("severity"));
                    entry.put("relationship", determineRelationship(src, relSrc, currentAlertId, relHit.id()));
                    entry.put("sharedEntities", extractSharedEntities(src, relSrc));
                    related.add(entry);
                }
            }
            return related;
        } catch (Exception e) {
            log.warn("{}.findRelatedAlerts: {}", CLASSNAME, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Determines the relationship between the current alert and a related alert.
     */
    private String determineRelationship(Map<String, Object> current, Map<String, Object> related,
                                         String currentId, String relatedId) {
        Object relatedParentId = related.get("parentId");
        if (relatedParentId != null && currentId.equals(relatedParentId.toString())) {
            return "child";
        }
        Object currentParentId = current.get("parentId");
        if (currentParentId != null && relatedId.equals(currentParentId.toString())) {
            return "parent";
        }
        return "correlated";
    }

    /**
     * Extracts shared entity identifiers between two alerts.
     */
    private List<String> extractSharedEntities(Map<String, Object> current, Map<String, Object> related) {
        List<String> shared = new ArrayList<>();
        Object currentEntity = current.get("primaryEntityId");
        Object relatedEntity = related.get("primaryEntityId");
        if (currentEntity != null && relatedEntity != null
            && currentEntity.toString().equals(relatedEntity.toString())) {
            shared.add(currentEntity.toString());
        }
        return shared;
    }

    /**
     * Determines data completeness level based on available fields.
     */
    private String determineDataCompleteness(Map<String, Object> src) {
        boolean hasMitre = src.containsKey("mitreTacticId") || src.containsKey("mitreTechniqueName");
        boolean hasRisk = src.containsKey("riskFactors");
        boolean hasTimeline = src.containsKey("statusHistory") || src.containsKey("notes");

        if (hasMitre && hasRisk && hasTimeline) return "full";
        if (hasMitre || hasRisk) return "core";
        return "triage";
    }

    /**
     * Maps numeric status to a symbolic label.
     */
    private String mapStatusLabel(Object status) {
        if (status == null) return "open";
        int code;
        if (status instanceof Number) {
            code = ((Number) status).intValue();
        } else {
            return status.toString();
        }
        switch (code) {
            case 1: return "automatic_review";
            case 2: return "open";
            case 3: return "in_review";
            case 4: return "ignored";
            case 5: return "completed";
            case 6: return "true_positive";
            case 7: return "false_positive";
            default: return "unknown";
        }
    }

    /**
     * Puts a value into the map only if it is non-null.
     */
    private void putIfPresent(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    // =========================================================================
    // Cursor encoding / decoding
    // =========================================================================

    /**
     * Encodes search_after sort values into an opaque cursor token.
     * The cursor contains:
     * <ul>
     *   <li>{@code sv} — sort values from the last hit</li>
     *   <li>{@code t} — tenant prefix (for validation on decode)</li>
     *   <li>{@code f} — SHA-256 hash of the filter params (invalidates if filters change)</li>
     *   <li>{@code s} — SHA-256 hash of the sort spec (invalidates if sort changes)</li>
     *   <li>{@code exp} — expiry epoch-second (10 minutes from now)</li>
     * </ul>
     */
    private String encodeCursor(List<String> sortValues, List<SortSpec> sortSpecs,
                                String severity, String status, String from, String to,
                                String category, String assignee, String tags, String q,
                                String riskMin, String sla, String threatIntel) {
        if (sortValues == null || sortValues.isEmpty()) return null;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sv", sortValues);
            payload.put("t", TenantContext.get());
            payload.put("f", computeFilterHash(severity, status, from, to, category, assignee, tags, q, riskMin, sla, threatIntel));
            payload.put("s", computeSortHash(sortSpecs));
            payload.put("exp", Instant.now().plusSeconds(CURSOR_EXPIRY_MINUTES * 60).getEpochSecond());

            String json = objectMapper.writeValueAsString(payload);
            return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(json.getBytes(StandardCharsets.UTF_8));
        } catch (JsonProcessingException e) {
            log.warn("{}: failed to encode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    /**
     * Decodes an opaque cursor token back to its payload.
     * Returns {@code null} if the token is malformed.
     */
    private CursorPayload decodeCursor(String cursor) {
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(cursor);
            String json = new String(decoded, StandardCharsets.UTF_8);
            Map<String, Object> map = objectMapper.readValue(json, new TypeReference<>() {});

            CursorPayload payload = new CursorPayload();

            Object svObj = map.get("sv");
            if (svObj instanceof List<?> svList) {
                List<String> sv = new ArrayList<>();
                for (Object item : svList) {
                    sv.add(item != null ? item.toString() : "");
                }
                payload.sv = sv;
            } else {
                return null;
            }

            payload.t = map.get("t") != null ? map.get("t").toString() : null;
            payload.f = map.get("f") != null ? map.get("f").toString() : null;
            payload.s = map.get("s") != null ? map.get("s").toString() : null;

            Object expObj = map.get("exp");
            if (expObj instanceof Number) {
                payload.exp = ((Number) expObj).longValue();
            } else {
                return null;
            }

            return payload;
        } catch (Exception e) {
            log.warn("{}: failed to decode cursor: {}", CLASSNAME, e.getMessage());
            return null;
        }
    }

    // =========================================================================
    // Sort parsing
    // =========================================================================

    /**
     * Parses the sort parameter. Supports multi-field with direction prefix:
     * {@code -severity,+@timestamp} or {@code severity,desc} (legacy Spring Data style).
     * Always appends {@code _id} as a stable tie-breaker.
     */
    private List<SortSpec> parseSortSpec(String sort) {
        List<SortSpec> specs = new ArrayList<>();

        if (sort == null || sort.isBlank()) {
            // Default: @timestamp desc
            specs.add(new SortSpec("@timestamp", SortOrder.Desc));
        } else {
            // Support comma-separated multi-field: "-severity,+@timestamp"
            // Also support legacy "field,direction" single-field format
            String[] parts = sort.split(",");

            // Detect legacy format: exactly 2 parts where second is "asc" or "desc"
            if (parts.length == 2 && isDirection(parts[1].trim())) {
                String field = canonicalizeSortField(parts[0].trim());
                SortOrder order = "asc".equalsIgnoreCase(parts[1].trim()) ? SortOrder.Asc : SortOrder.Desc;
                validateSortField(field);
                specs.add(new SortSpec(field, order));
            } else {
                for (String part : parts) {
                    String trimmed = part.trim();
                    if (trimmed.isEmpty()) continue;

                    SortOrder order = SortOrder.Asc;
                    String field;
                    if (trimmed.startsWith("-")) {
                        order = SortOrder.Desc;
                        field = trimmed.substring(1);
                    } else if (trimmed.startsWith("+")) {
                        order = SortOrder.Asc;
                        field = trimmed.substring(1);
                    } else {
                        field = trimmed;
                    }
                    field = canonicalizeSortField(field);
                    validateSortField(field);
                    specs.add(new SortSpec(field, order));
                }
            }
        }

        // Always append _id as a stable tie-breaker if not already present
        boolean hasIdSort = specs.stream().anyMatch(s -> "_id".equals(s.field));
        if (!hasIdSort) {
            specs.add(new SortSpec("_id", SortOrder.Asc));
        }

        return specs;
    }

    /** AG Grid and some clients send {@code timestamp}; OpenSearch stores {@code @timestamp}. */
    private String canonicalizeSortField(String field) {
        if ("timestamp".equals(field) || "detectedAt".equals(field)) {
            return "@timestamp";
        }
        return field;
    }

    private void validateSortField(String field) {
        if (!ALLOWED_SORT_FIELDS.contains(field)) {
            throw new IllegalArgumentException(
                "Invalid sort field: '" + field + "'. Allowed: " + ALLOWED_SORT_FIELDS);
        }
    }

    private boolean isDirection(String s) {
        return "asc".equalsIgnoreCase(s) || "desc".equalsIgnoreCase(s);
    }

    private List<SortOptions> buildSortOptions(List<SortSpec> specs) {
        List<SortOptions> options = new ArrayList<>();
        for (SortSpec spec : specs) {
            SortOrder order = spec.order;
            // Map "id" alias to OpenSearch's "_id" field
            String field = "id".equals(spec.field) ? "_id" : spec.field;
            options.add(SortOptions.of(s -> s.field(f -> f.field(field).order(order))));
        }
        return options;
    }

    // =========================================================================
    // Filter building (delegated to HaAlertQueryService)
    // =========================================================================

    // =========================================================================
    // Projection
    // =========================================================================

    /**
     * Normalizes supported alert producer shapes into the canonical queue fields.
     *
     * <p>Current correlation output may carry rule, ATT&CK, and entity context as
     * nested objects while historical indices use flat fields. Keeping this adapter
     * at the API boundary prevents the frontend from depending on producer-specific
     * document layouts and supports progressive schema migration.</p>
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> normalizeAlertSource(Map<String, Object> source) {
        Map<String, Object> normalized = new LinkedHashMap<>(source);

        Object ruleRaw = normalized.get("rule");
        if (ruleRaw instanceof Map<?, ?> rule) {
            normalized.putIfAbsent("ruleId", rule.get("id"));
            normalized.putIfAbsent("ruleName", rule.get("name"));
        }

        Object mitreRaw = normalized.get("mitre");
        if (mitreRaw instanceof Map<?, ?> mitre) {
            Object tacticRaw = mitre.get("tactic");
            if (tacticRaw instanceof Map<?, ?> tactic) {
                normalized.putIfAbsent("mitreTacticId", tactic.get("id"));
                normalized.putIfAbsent("mitreTacticName", tactic.get("name"));
            } else {
                normalized.putIfAbsent("mitreTacticId", mitre.get("tacticId"));
                normalized.putIfAbsent("mitreTacticName", tacticRaw);
            }

            Object techniqueRaw = mitre.get("technique");
            if (techniqueRaw instanceof Map<?, ?> technique) {
                normalized.putIfAbsent("mitreTechniqueId", technique.get("id"));
                normalized.putIfAbsent("mitreTechniqueName", technique.get("name"));
            } else {
                normalized.putIfAbsent("mitreTechniqueId", techniqueRaw);
                normalized.putIfAbsent("mitreTechniqueName", mitre.get("name"));
            }
        }

		// Event-processor compatibility: early v3 alerts published a combined
		// `technique` label before canonical ATT&CK fields were introduced.
		Object legacyTechnique = normalized.get("technique");
		if (legacyTechnique instanceof String technique && !technique.isBlank()) {
			String[] parts = technique.trim().split("\\s+-\\s+", 2);
			if (parts.length > 0 && parts[0].toUpperCase(Locale.ROOT).startsWith("T")) {
				normalized.putIfAbsent("mitreTechniqueId", parts[0]);
				if (parts.length == 2 && !parts[1].isBlank()) {
					normalized.putIfAbsent("mitreTechniqueName", parts[1]);
				}
			}
		}

		Object legacyEventIds = normalized.get("eventIds");
		if (!normalized.containsKey("sourceEventIds") && legacyEventIds instanceof List<?>) {
			normalized.put("sourceEventIds", legacyEventIds);
		}

		Object legacyDataSource = normalized.get("dataSource");
		if (!normalized.containsKey("dataSources") && legacyDataSource instanceof String dataSource && !dataSource.isBlank()) {
			normalized.put("dataSources", List.of(dataSource));
		}

        Object entitiesRaw = normalized.get("entities");
        if (!normalized.containsKey("primaryEntityId") && entitiesRaw instanceof List<?> entities) {
            for (Object entityRaw : entities) {
                if (!(entityRaw instanceof Map<?, ?> entity)) continue;
                Object id = entity.get("id");
                Object type = entity.get("type");
                Object label = entity.get("value");
                if (id == null && label == null) continue;
                if (id != null) normalized.put("primaryEntityId", id);
                if (type != null) normalized.put("primaryEntityType", type);
                if (label != null) normalized.put("primaryEntityLabel", label);
                break;
            }
        }

        normalized.putIfAbsent("@timestamp", normalized.get("detectedAt"));
        Object status = normalized.get("status");
        if (status != null) normalized.put("statusLabel", mapStatusLabel(status));

        if (!normalized.containsKey("primaryEntity") && normalized.get("primaryEntityLabel") != null) {
            Map<String, Object> primaryEntity = new LinkedHashMap<>();
            putIfPresent(primaryEntity, "id", normalized.get("primaryEntityId"));
            putIfPresent(primaryEntity, "type", normalized.get("primaryEntityType"));
            putIfPresent(primaryEntity, "label", normalized.get("primaryEntityLabel"));
            putIfPresent(primaryEntity, "riskScore", normalized.get("primaryEntityRiskScore"));
            normalized.put("primaryEntity", primaryEntity);
        }

        return normalized;
    }

    private Set<String> parseFieldsParam(String fields) {
        if (fields == null || fields.isBlank()) return Collections.emptySet();
        Set<String> fieldSet = new LinkedHashSet<>();
        for (String f : fields.split(",")) {
            String trimmed = f.trim();
            if (!trimmed.isEmpty()) fieldSet.add(trimmed);
        }
        return fieldSet;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapHitToProjection(Hit<Map> hit, Set<String> fieldSet) {
        Map<String, Object> rawSource = hit.source() != null
            ? new LinkedHashMap<>((Map<String, Object>) hit.source())
            : new LinkedHashMap<>();
        Map<String, Object> src = normalizeAlertSource(rawSource);
        src.put("id", hit.id());

        // Add computed fields
        if (src.containsKey("@timestamp")) src.putIfAbsent("timestamp", src.get("@timestamp"));
        Object sev = src.get("severity");
        if (sev instanceof Number) src.put("severityLabel", mapSeverityLabel(((Number) sev).intValue()));

        // Add available actions (ALT-022: include in queue projection)
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String userLogin = auth != null ? auth.getName() : null;
        Collection<String> userRoles = auth != null
            ? auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList())
            : Collections.emptyList();
        String tenantPrefix = TenantContext.get();
        src.put("availableActions", actionResolver.resolveAvailableActions(
            src, userLogin, userRoles, tenantPrefix));

        // Apply field projection if requested
        if (!fieldSet.isEmpty()) {
            // Always include 'id'
            Map<String, Object> projected = new LinkedHashMap<>();
            projected.put("id", hit.id());
            for (String field : fieldSet) {
                if (src.containsKey(field)) {
                    projected.put(field, src.get(field));
                }
            }
            return projected;
        }

        return src;
    }

    // =========================================================================
    // Hashing helpers
    // =========================================================================

    private String computeFilterHash(String severity, String status, String from, String to,
                                     String category, String assignee, String tags, String q,
                                     String riskMin, String sla, String threatIntel) {
        String canonical = String.join("|",
            nullSafe(severity), nullSafe(status), nullSafe(from), nullSafe(to),
            nullSafe(category), nullSafe(assignee), nullSafe(tags), nullSafe(q),
            nullSafe(riskMin), nullSafe(sla), nullSafe(threatIntel));
        return sha256Short(canonical);
    }

    private String computeSortHash(List<SortSpec> specs) {
        StringBuilder sb = new StringBuilder();
        for (SortSpec spec : specs) {
            if (sb.length() > 0) sb.append(",");
            sb.append(spec.field).append(":").append(spec.order.jsonValue());
        }
        return sha256Short(sb.toString());
    }

    private String sha256Short(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            // Use first 16 bytes (32 hex chars) for brevity
            StringBuilder hex = new StringBuilder();
            for (int i = 0; i < 16 && i < hash.length; i++) {
                hex.append(String.format("%02x", hash[i]));
            }
            return hex.toString();
        } catch (Exception e) {
            // Fallback: use hashCode if SHA-256 unavailable (extremely unlikely)
            return Integer.toHexString(input.hashCode());
        }
    }

    private String nullSafe(String s) {
        return s != null ? s : "";
    }

    // =========================================================================
    // Limit resolution
    // =========================================================================

    /**
     * Resolves the effective limit. Validates range 1–200, defaults to 50.
     * Prefers {@code limit} over deprecated {@code size}.
     */
    private int resolveLimit(Integer limit, Integer size) {
        int raw;
        if (limit != null) {
            raw = limit;
        } else if (size != null) {
            raw = size;
        } else {
            return DEFAULT_LIMIT;
        }
        if (raw < 1 || raw > 200) {
            throw new IllegalArgumentException(
                "Parameter 'limit' must be between 1 and 200 inclusive, got: " + raw);
        }
        return raw;
    }

    // =========================================================================
    // Error response helpers
    // =========================================================================

    private ResponseEntity<?> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    // =========================================================================
    // Severity mapping
    // =========================================================================

    private String mapSeverityLabel(int severity) {
        if (severity >= 9) return "Critical";
        if (severity >= 7) return "High";
        if (severity >= 4) return "Medium";
        if (severity >= 1) return "Low";
        return "Info";
    }

    // =========================================================================
    // Inner types
    // =========================================================================

    private static class SortSpec {
        final String field;
        final SortOrder order;

        SortSpec(String field, SortOrder order) {
            this.field = field;
            this.order = order;
        }
    }

    private static class CursorPayload {
        List<String> sv;
        String t;
        String f;
        String s;
        long exp;
    }
}
