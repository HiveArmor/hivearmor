package com.hivearmor.web.rest.entity;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.elasticsearch.OpensearchClientBuilder;
import com.hivearmor.service.entity.EntityActivityService;
import com.hivearmor.service.entity.EntityAlertService;
import com.hivearmor.service.entity.EntityDossierService;
import com.hivearmor.service.entity.EntityIncidentLinkService;
import com.hivearmor.service.entity.EntityInventoryService;
import com.hivearmor.service.entity.EntityPreviewService;
import com.hivearmor.service.entity.EntityRelationshipService;
import com.hivearmor.service.entity.EntitySseService;
import com.hivearmor.service.sse.HaSseRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;

/**
 * REST controller for Entity Intelligence endpoints (ENT-001 through ENT-005).
 * Endpoints are prefixed with /api/ha-entities.
 *
 * <p>Sprint 45 — Entity Intelligence Core module.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Entities", description = "Entity inventory: list, detail, enrichment, SSE (ENT-001, ENT-002)")
public class HaEntityResource {

    private static final Logger log = LoggerFactory.getLogger(HaEntityResource.class);
    private static final String CLASSNAME = "HaEntityResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final EntityInventoryService entityInventoryService;
    private final EntityPreviewService entityPreviewService;
    private final EntitySseService entitySseService;
    private final EntityDossierService entityDossierService;
    private final EntityActivityService entityActivityService;
    private final EntityAlertService entityAlertService;
    private final EntityRelationshipService entityRelationshipService;
    private final EntityIncidentLinkService entityIncidentLinkService;
    private final MsspIndexResolver indexResolver;
    private final OpensearchClientBuilder osClient;
    private final HaSseRateLimiter rateLimiter;

    public HaEntityResource(EntityInventoryService entityInventoryService,
                            EntityPreviewService entityPreviewService,
                            EntitySseService entitySseService,
                            EntityDossierService entityDossierService,
                            EntityActivityService entityActivityService,
                            EntityAlertService entityAlertService,
                            EntityRelationshipService entityRelationshipService,
                            EntityIncidentLinkService entityIncidentLinkService,
                            MsspIndexResolver indexResolver,
                            OpensearchClientBuilder osClient,
                            HaSseRateLimiter rateLimiter) {
        this.entityInventoryService = entityInventoryService;
        this.entityPreviewService = entityPreviewService;
        this.entitySseService = entitySseService;
        this.entityDossierService = entityDossierService;
        this.entityActivityService = entityActivityService;
        this.entityAlertService = entityAlertService;
        this.entityRelationshipService = entityRelationshipService;
        this.entityIncidentLinkService = entityIncidentLinkService;
        this.indexResolver = indexResolver;
        this.osClient = osClient;
        this.rateLimiter = rateLimiter;
    }

    // =========================================================================
    // ENT-001: Entity inventory listing
    // =========================================================================

    /**
     * GET /ha-entities — Bounded entity inventory with multi-dimensional filtering (ENT-001).
     *
     * <p>Supports filters: types, riskLevels, criticality, q (free-text),
     * alertsActive, trendRising. Supports cursor-based pagination and multiple sort options.
     */
    @GetMapping("/ha-entities")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List entities with cursor pagination",
        description = "Returns a cursor-paginated entity inventory with multi-dimensional filtering. "
            + "Supports filters by type, risk level, criticality, free-text search, active alerts, "
            + "and rising trends. Uses cursor-based pagination with multiple sort options. (ENT-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Entity list with cursor for next page"),
        @ApiResponse(responseCode = "400", description = "Invalid filter parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listEntities(
            @RequestParam(required = false) String types,
            @RequestParam(required = false) String riskLevels,
            @RequestParam(required = false) String criticality,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean alertsActive,
            @RequestParam(required = false) Boolean trendRising) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("entity");

            // Parse comma-separated filter params
            List<String> typeList = parseCommaSeparated(types);
            List<String> riskLevelList = parseCommaSeparated(riskLevels);
            List<String> criticalityList = parseCommaSeparated(criticality);

            Map<String, Object> result = entityInventoryService.listEntities(
                typeList, riskLevelList, criticalityList,
                sort, cursor, limit, q,
                alertsActive, trendRising, indexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.listEntities: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-002: Summary and facets
    // =========================================================================

    /**
     * GET /ha-entities/summary — Summary statistics and facet aggregations (ENT-002).
     *
     * <p>Returns aggregate counters (total, highRisk, rising, activeAlerts, newEntities24h)
     * and faceted breakdowns (byType, byRiskLevel, byCriticality, byObservationSource).
     * Accepts the same filter params as the listing endpoint so facets reflect narrowed state.
     */
    @GetMapping("/ha-entities/summary")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get entity summary and facets",
        description = "Returns aggregate counters (total, highRisk, rising, activeAlerts, newEntities24h) "
            + "and faceted breakdowns (byType, byRiskLevel, byCriticality, byObservationSource). "
            + "Accepts the same filter params as listing so facets reflect narrowed state. (ENT-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Summary statistics and facet aggregations"),
        @ApiResponse(responseCode = "400", description = "Invalid filter parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getSummary(
            @RequestParam(required = false) String types,
            @RequestParam(required = false) String riskLevels,
            @RequestParam(required = false) String criticality,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Boolean alertsActive,
            @RequestParam(required = false) Boolean trendRising) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("entity");

            // Parse comma-separated filter params
            List<String> typeList = parseCommaSeparated(types);
            List<String> riskLevelList = parseCommaSeparated(riskLevels);
            List<String> criticalityList = parseCommaSeparated(criticality);

            Map<String, Object> result = entityInventoryService.getSummaryAndFacets(
                typeList, riskLevelList, criticalityList,
                q, alertsActive, trendRising, indexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getSummary: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-003: Entity preview
    // =========================================================================

    /**
     * GET /ha-entities/{id}/preview — Lightweight entity preview with activity and alert
     * summaries (ENT-003).
     *
     * <p>Returns the entity document enriched with:
     * <ul>
     *   <li>Activity summary (event counts for last 24h and 7d)</li>
     *   <li>Alert summary (active count, total 30d, highest severity)</li>
     *   <li>Pivot descriptors (dossier, hunt, alerts, incidents)</li>
     * </ul>
     *
     * @param id the entity document ID
     * @return 200 with entity preview or 404 if not found
     */
    @GetMapping("/ha-entities/{id}/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get entity preview",
        description = "Returns a lightweight entity preview enriched with activity summary (event counts "
            + "for last 24h and 7d), alert summary (active count, total 30d, highest severity), "
            + "and pivot descriptors (dossier, hunt, alerts, incidents). (ENT-003)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Entity preview with enrichment summaries"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Entity not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getPreview(@PathVariable("id") String id) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("entity");

            Optional<Map<String, Object>> preview = entityPreviewService.getPreview(id, indexPattern);

            if (preview.isEmpty()) {
                return notFound("ENTITY_NOT_FOUND",
                    "Entity with ID '" + id + "' not found");
            }

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("entity", preview.get());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("{}.getPreview: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-006: Entity Dossier
    // =========================================================================

    /**
     * GET /ha-entities/{id}/dossier — Progressive dossier core (ENT-006).
     *
     * <p>Returns the complete entity dossier with identity, risk profile, baseline metrics,
     * source coverage, ATT&amp;CK techniques, and summary sections.
     *
     * @param id     the entity document ID
     * @param window time window in days (default 30, max 90)
     * @return 200 with dossier or 404 if entity not found
     */
    @GetMapping("/ha-entities/{id}/dossier")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get entity dossier",
        description = "Returns the complete entity dossier with identity, risk profile, baseline metrics, "
            + "source coverage, ATT&CK techniques, and summary sections. Supports configurable time window. (ENT-006)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Full entity dossier"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter (e.g., window out of range)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Entity not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getDossier(
            @PathVariable("id") String id,
            @RequestParam(required = false) Integer window) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("entity");

            Optional<Map<String, Object>> dossier = entityDossierService.getDossier(
                id, window, indexPattern);

            if (dossier.isEmpty()) {
                return notFound("ENTITY_NOT_FOUND",
                    "Entity with ID '" + id + "' not found");
            }

            return ResponseEntity.ok(dossier.get());
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getDossier: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-007: Activity timeline
    // =========================================================================

    /**
     * GET /ha-entities/{id}/activity — PIT-based activity timeline (ENT-007).
     *
     * <p>Returns paginated activity events for the entity using Point-in-Time
     * for consistent pagination. First request opens a PIT; subsequent cursor
     * requests reuse it.
     *
     * @param id     the entity document ID
     * @param cursor encoded cursor from previous page
     * @param limit  page size (default 50, max 200)
     * @param types  comma-separated event type filter
     * @param from   time range start (ISO-8601, default last 24h)
     * @param to     time range end (ISO-8601, default now)
     * @return 200 with items, cursor, total, window
     */
    @GetMapping("/ha-entities/{id}/activity")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get entity activity timeline",
        description = "Returns paginated activity events for the entity using Point-in-Time for consistent "
            + "pagination. Supports event type filtering and time range selection. (ENT-007)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Activity timeline with items, cursor, total, and window"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Entity not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getActivity(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String types,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        try {
            String entityIndexPattern = indexResolver.resolveIndexPattern("entity");
            String logIndexPattern = indexResolver.resolveIndexPattern("log");

            // First, fetch entity to get type and value
            Optional<Map<String, Object>> entityOpt = fetchEntityTypeAndValue(id, entityIndexPattern);
            if (entityOpt.isEmpty()) {
                return notFound("ENTITY_NOT_FOUND",
                    "Entity with ID '" + id + "' not found");
            }

            Map<String, Object> entity = entityOpt.get();
            String entityType = entity.get("type") != null ? entity.get("type").toString() : "host";
            String entityValue = entity.get("value") != null ? entity.get("value").toString() : "";

            Map<String, Object> result = entityActivityService.getActivity(
                id, entityType, entityValue, cursor, limit, types, from, to, logIndexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getActivity: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-008: Related alerts
    // =========================================================================

    /**
     * GET /ha-entities/{id}/alerts — Related alerts for entity (ENT-008).
     *
     * <p>Returns paginated alerts associated with the entity, including the entity's
     * role in each alert (source, target, actor, asset).
     *
     * @param id       the entity document ID
     * @param cursor   encoded cursor for pagination
     * @param limit    page size (default 25, max 100)
     * @param severity comma-separated severity filter
     * @param status   comma-separated status filter
     * @param from     time range start (ISO-8601)
     * @param to       time range end (ISO-8601)
     * @return 200 with items, cursor, total
     */
    @GetMapping("/ha-entities/{id}/alerts")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get related alerts for entity",
        description = "Returns paginated alerts associated with the entity, including the entity's role "
            + "in each alert (source, target, actor, asset). Supports severity, status, and time range filters. (ENT-008)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Related alerts with items, cursor, total"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Entity not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getRelatedAlerts(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        try {
            String entityIndexPattern = indexResolver.resolveIndexPattern("entity");
            String alertIndexPattern = indexResolver.resolveIndexPattern("alert");

            // Fetch entity to get type and value
            Optional<Map<String, Object>> entityOpt = fetchEntityTypeAndValue(id, entityIndexPattern);
            if (entityOpt.isEmpty()) {
                return notFound("ENTITY_NOT_FOUND",
                    "Entity with ID '" + id + "' not found");
            }

            Map<String, Object> entity = entityOpt.get();
            String entityType = entity.get("type") != null ? entity.get("type").toString() : "host";
            String entityValue = entity.get("value") != null ? entity.get("value").toString() : "";

            Map<String, Object> result = entityAlertService.getRelatedAlerts(
                id, entityType, entityValue, cursor, limit, severity, status, from, to, alertIndexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getRelatedAlerts: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-009: Relationships
    // =========================================================================

    /**
     * GET /ha-entities/{id}/relationships — Evidence-backed entity relationships (ENT-009).
     *
     * <p>Returns paginated relationships for the entity, including evidence arrays
     * backing each connection, direction, strength, and related entity summaries.
     *
     * @param id     the entity document ID
     * @param cursor encoded cursor for pagination
     * @param limit  page size (default 50, max 200)
     * @param types  comma-separated relationship type filter
     * @return 200 with items, cursor, total
     */
    @GetMapping("/ha-entities/{id}/relationships")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get entity relationships",
        description = "Returns paginated relationships for the entity, including evidence arrays backing each "
            + "connection, direction, strength, and related entity summaries. (ENT-009)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Relationships with items, cursor, total"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getRelationships(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String types) {
        try {
            String relationshipIndexPattern = indexResolver.resolveIndexPattern("relationship");

            Map<String, Object> result = entityRelationshipService.getRelationships(
                id, cursor, limit, types, relationshipIndexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getRelationships: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-010: Incident linking
    // =========================================================================

    /**
     * POST /ha-entities/{id}/incident-link/preview — Preview incident linking (ENT-010).
     *
     * <p>Generates a preview of what linking the entity to an incident would look like.
     * No side effects — returns a previewToken for use in the execute step.
     *
     * @param id   the entity document ID
     * @param body request body: { incidentId?, createNew }
     * @return 200 with preview and previewToken
     */
    @PostMapping("/ha-entities/{id}/incident-link/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Preview incident link",
        description = "Generates a preview of what linking the entity to an incident would look like. "
            + "No side effects — returns a previewToken for use in the execute step. (ENT-010)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Link preview with previewToken"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> previewIncidentLink(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        try {
            String entityIndexPattern = indexResolver.resolveIndexPattern("entity");

            Map<String, Object> result = entityIncidentLinkService.previewLink(
                id, body, entityIndexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.previewIncidentLink: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-entities/{id}/incident-link/execute — Execute incident linking (ENT-010).
     *
     * <p>Validates the previewToken, then creates or updates an incident document
     * and updates the entity document with the incident link.
     *
     * @param id   the entity document ID
     * @param body request body: { incidentId?, createNew, title?, severity?, previewToken }
     * @return 200 with incidentId, status, linkedAlerts, linkedEvidence; 400 if token invalid
     */
    @PostMapping("/ha-entities/{id}/incident-link/execute")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Execute incident link",
        description = "Validates the previewToken, then creates or updates an incident document and updates "
            + "the entity document with the incident link. Returns the linked incident details. (ENT-010)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Incident linked successfully with incidentId and status"),
        @ApiResponse(responseCode = "400", description = "Invalid or expired previewToken, or invalid parameter"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> executeIncidentLink(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body) {
        try {
            String previewToken = body.get("previewToken") != null
                ? body.get("previewToken").toString() : null;

            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("INVALID_TOKEN", "previewToken is required");
            }

            String entityIndexPattern = indexResolver.resolveIndexPattern("entity");

            // Get current user ID
            String userId = getCurrentUserId();

            Map<String, Object> result = entityIncidentLinkService.executeLink(
                id, body, previewToken, userId, entityIndexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            // Invalid/expired token or entity not found
            if (e.getMessage() != null && e.getMessage().contains("token")) {
                return badRequest("INVALID_TOKEN", e.getMessage());
            }
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.executeIncidentLink: entityId={} error={}", CLASSNAME, id, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // ENT-005: Entity SSE stream
    // =========================================================================

    /**
     * GET /ha-entities/stream — Resumable entity updates SSE (ENT-005).
     *
     * <p>Creates an SseEmitter with 30-minute timeout, registers it for the tenant,
     * and supports Last-Event-ID replay from in-memory buffer.
     *
     * <p>Event types broadcast:
     * <ul>
     *   <li>entity.risk_changed</li>
     *   <li>entity.discovered</li>
     *   <li>entity.trend_changed</li>
     *   <li>entity.alert_linked</li>
     *   <li>entity.baseline_deviation</li>
     * </ul>
     *
     * @param lastEventId Last-Event-ID header for replay (optional)
     * @return SseEmitter producing live entity events
     */
    @GetMapping(value = "/ha-entities/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Stream entity updates via SSE",
        description = "Creates a resumable Server-Sent Events stream for live entity updates. Supports "
            + "Last-Event-ID replay from in-memory buffer. Event types: entity.risk_changed, "
            + "entity.discovered, entity.trend_changed, entity.alert_linked, entity.baseline_deviation. (ENT-005)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE stream established"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "429", description = "SSE connection limit exceeded"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public SseEmitter streamEntityUpdates(
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        Long tenantId = TenantContext.getClientId();
        // Default to 0 for non-MSSP / admin users where tenant context is not set
        if (tenantId == null) {
            tenantId = 0L;
        }
        final Long effectiveTenantId = tenantId;
        try {
            log.debug("GET /api/ha-entities/stream Last-Event-ID={} tenant={}",
                lastEventId, effectiveTenantId);

            // HAR-006: Check SSE rate limits before creating emitter
            String endpoint = "/ha-entities/stream";
            String tenantStr = String.valueOf(effectiveTenantId);
            rateLimiter.checkLimit(tenantStr, endpoint, null);
            HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantStr, endpoint, null);

            // Create emitter with 30-minute timeout
            SseEmitter emitter = new SseEmitter(EntitySseService.EMITTER_TIMEOUT_MS);

            // Register emitter for this tenant
            entitySseService.register(effectiveTenantId, emitter);

            // Register rate limiter cleanup on disconnect
            emitter.onCompletion(connectionHandle::close);
            emitter.onTimeout(connectionHandle::close);
            emitter.onError(e -> connectionHandle.close());

            // Replay missed events if Last-Event-ID provided
            if (lastEventId != null && !lastEventId.isBlank()) {
                entitySseService.replayFrom(effectiveTenantId, lastEventId, emitter);
            }

            return emitter;
        } catch (Exception e) {
            log.error("{}.streamEntityUpdates: {}", CLASSNAME, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Fetches the entity type and value for a given entity ID.
     * Used by activity and alert endpoints that need entity context to build queries.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private Optional<Map<String, Object>> fetchEntityTypeAndValue(String entityId, String indexPattern) throws Exception {
        org.opensearch.client.opensearch.core.SearchRequest request =
            org.opensearch.client.opensearch.core.SearchRequest.of(r -> r
                .index(indexPattern)
                .query(q -> q.ids(ids -> ids.values(entityId)))
                .size(1)
                .source(sc -> sc.filter(f -> f.includes(List.of("type", "value"))))
            );

        org.opensearch.client.opensearch.core.SearchResponse<Map> response =
            osClient.execute(os -> os.search(request, Map.class));

        if (response.hits() == null || response.hits().hits() == null
                || response.hits().hits().isEmpty()) {
            return Optional.empty();
        }

        org.opensearch.client.opensearch.core.search.Hit<Map> hit = response.hits().hits().get(0);
        if (hit.source() == null) return Optional.empty();

        return Optional.of((Map<String, Object>) hit.source());
    }

    /**
     * Gets the current authenticated user's login/ID.
     */
    private String getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null) {
            return auth.getName();
        }
        return "system";
    }

    /**
     * Parses a comma-separated string into a list of trimmed, non-blank values.
     */
    private List<String> parseCommaSeparated(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Arrays.stream(value.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .toList();
    }

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    private ResponseEntity<Map<String, Object>> notFound(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(404).body(error);
    }
}
