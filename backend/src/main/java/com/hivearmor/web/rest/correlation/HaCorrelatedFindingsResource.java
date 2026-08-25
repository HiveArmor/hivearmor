package com.hivearmor.web.rest.correlation;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.correlation.*;
import com.hivearmor.service.correlation.CorrelatedFindingService.FindingFilters;
import com.hivearmor.service.correlation.FindingLifecycleService.FindingNotFoundException;
import com.hivearmor.service.correlation.FindingLifecycleService.InvalidTransitionException;
import com.hivearmor.service.correlation.FindingPromotionService.InvalidPreviewTokenException;
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
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.security.Principal;
import java.time.Instant;
import java.util.*;

/**
 * REST controller for Correlated Findings (COR-001 through COR-006).
 * Endpoints are prefixed with /api/ha-correlated-findings.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Findings", description = "Correlated findings: list, detail, timeline (FND-001, FND-002)")
public class HaCorrelatedFindingsResource {

    private static final Logger log = LoggerFactory.getLogger(HaCorrelatedFindingsResource.class);
    private static final String CLASSNAME = "HaCorrelatedFindingsResource";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') " +
        "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    /** Default page size. */
    private static final int DEFAULT_LIMIT = 25;

    /** Maximum page size. */
    private static final int MAX_LIMIT = 100;

    private final CorrelatedFindingService correlatedFindingService;
    private final FindingEvidenceService evidenceService;
    private final FindingLifecycleService lifecycleService;
    private final FindingPromotionService promotionService;
    private final FindingSseService sseService;
    private final MsspIndexResolver indexResolver;
    private final HaSseRateLimiter rateLimiter;

    public HaCorrelatedFindingsResource(CorrelatedFindingService correlatedFindingService,
                                        FindingEvidenceService evidenceService,
                                        FindingLifecycleService lifecycleService,
                                        FindingPromotionService promotionService,
                                        FindingSseService sseService,
                                        MsspIndexResolver indexResolver,
                                        HaSseRateLimiter rateLimiter) {
        this.correlatedFindingService = correlatedFindingService;
        this.evidenceService = evidenceService;
        this.lifecycleService = lifecycleService;
        this.promotionService = promotionService;
        this.sseService = sseService;
        this.indexResolver = indexResolver;
        this.rateLimiter = rateLimiter;
    }

    // =========================================================================
    // COR-001: Queue listing with preview projection
    // =========================================================================

    /**
     * GET /ha-correlated-findings — Queue listing with preview projection (COR-001).
     */
    @GetMapping("/ha-correlated-findings")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List correlated findings with cursor pagination",
        description = "Returns a cursor-paginated list of correlated findings. Supports filtering by severity, "
            + "status, MITRE tactics, and assignee. Supports queue and timeline view projections. (FND-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Finding list with cursor for next page"),
        @ApiResponse(responseCode = "400", description = "Invalid filter parameter or limit out of range"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listFindings(
            @RequestParam(required = false) String view,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) String severity,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String tactics,
            @RequestParam(required = false) String assignee,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            int effectiveLimit = resolveLimit(limit);
            FindingFilters filters = parseFilters(severity, status, tactics, assignee, from, to);

            Map<String, Object> result = correlatedFindingService.listFindings(
                view != null ? view : "queue",
                sort, cursor, effectiveLimit, filters, indexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.listFindings: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // COR-002: Complete attack-story detail
    // =========================================================================

    /**
     * GET /ha-correlated-findings/{id} — Complete finding detail (COR-002).
     */
    @GetMapping("/ha-correlated-findings/{id}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Get correlated finding detail by ID",
        description = "Returns the complete attack-story detail for a correlated finding including MITRE mapping, "
            + "entity relationships, and timeline. Returns 404 for not-found or unauthorized findings. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Full finding detail projection"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Finding not found or not visible to current tenant"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> getFinding(@PathVariable("id") String id) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");

            Optional<Map<String, Object>> findingOpt = correlatedFindingService.getFinding(id, indexPattern);
            if (findingOpt.isEmpty()) {
                return notFound("Finding not found: " + id);
            }

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("finding", findingOpt.get());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("{}.getFinding: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // COR-003: Paginated supporting evidence
    // =========================================================================

    /**
     * GET /ha-correlated-findings/{id}/signals — Linked alert signals (COR-003).
     */
    @GetMapping("/ha-correlated-findings/{id}/signals")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List linked alert signals for a finding",
        description = "Returns paginated alert signals that contributed to this correlated finding. (FND-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Signal list with cursor for next page"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listSignals(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            int effectiveLimit = resolveLimit(limit);

            Map<String, Object> result = evidenceService.listSignals(id, cursor, effectiveLimit, indexPattern);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.listSignals: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * GET /ha-correlated-findings/{id}/events — Raw events backing the finding (COR-003).
     */
    @GetMapping("/ha-correlated-findings/{id}/events")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List raw events backing a finding",
        description = "Returns paginated raw log events that are evidence for this correlated finding. (FND-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Event list with cursor for next page"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listEvents(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            int effectiveLimit = resolveLimit(limit != null ? limit : 50);

            Map<String, Object> result = evidenceService.listEvents(id, cursor, effectiveLimit, indexPattern);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.listEvents: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * GET /ha-correlated-findings/{id}/relationships — Entity relationships (COR-003).
     */
    @GetMapping("/ha-correlated-findings/{id}/relationships")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "List entity relationships for a finding",
        description = "Returns paginated entity relationships associated with this correlated finding. (FND-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Relationship list with cursor for next page"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> listRelationships(
            @PathVariable("id") String id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            int effectiveLimit = resolveLimit(limit != null ? limit : 50);

            Map<String, Object> result = evidenceService.listRelationships(id, cursor, effectiveLimit, indexPattern);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.listRelationships: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // COR-004: Lifecycle mutations with idempotency
    // =========================================================================

    /**
     * POST /ha-correlated-findings/{id}/status — Change finding status (COR-004).
     */
    @PostMapping("/ha-correlated-findings/{id}/status")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Change finding status",
        description = "Transitions a correlated finding to a new lifecycle status. Validates transition rules "
            + "and returns 422 for invalid state transitions. Supports idempotency keys. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Status changed successfully"),
        @ApiResponse(responseCode = "400", description = "Missing or invalid status field"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Finding not found"),
        @ApiResponse(responseCode = "422", description = "Invalid status transition"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> changeStatus(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body,
            Principal principal) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            Long tenantId = TenantContext.getClientId();
            String userId = principal != null ? principal.getName() : "system";

            String newStatus = body.get("status") != null ? body.get("status").toString() : null;
            String reason = body.get("reason") != null ? body.get("reason").toString() : null;
            String idempotencyKey = body.get("idempotencyKey") != null ? body.get("idempotencyKey").toString() : null;

            if (newStatus == null || newStatus.isBlank()) {
                return badRequest("MISSING_STATUS", "Request body must include 'status' field");
            }

            Map<String, Object> result = lifecycleService.changeStatus(
                id, newStatus, reason, idempotencyKey, userId, tenantId, indexPattern);

            return ResponseEntity.ok(result);
        } catch (InvalidTransitionException e) {
            return unprocessableEntity(e.getFromStatus(), e.getToStatus(), e.getAllowedTransitions());
        } catch (FindingNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.changeStatus: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-correlated-findings/{id}/assignment — Assign/reassign finding (COR-004).
     */
    @PostMapping("/ha-correlated-findings/{id}/assignment")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Assign or reassign a finding",
        description = "Assigns a correlated finding to an analyst or reassigns to a different analyst. "
            + "Supports idempotency keys for safe retries. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Assignment updated successfully"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Finding not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> assignFinding(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body,
            Principal principal) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            Long tenantId = TenantContext.getClientId();
            String userId = principal != null ? principal.getName() : "system";

            String assignee = body.get("assignee") != null ? body.get("assignee").toString() : null;
            String idempotencyKey = body.get("idempotencyKey") != null ? body.get("idempotencyKey").toString() : null;

            Map<String, Object> result = lifecycleService.assignFinding(
                id, assignee, idempotencyKey, userId, tenantId, indexPattern);

            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_ASSIGNEE", e.getMessage());
        } catch (FindingNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.assignFinding: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-correlated-findings/{id}/notes — Add analyst note (COR-004).
     */
    @PostMapping("/ha-correlated-findings/{id}/notes")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Add an analyst note to a finding",
        description = "Appends an analyst note to the finding's activity log. Supports mentions and "
            + "idempotency keys for safe retries. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Note added successfully"),
        @ApiResponse(responseCode = "400", description = "Missing or empty content field"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> addNote(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body,
            Principal principal) {
        try {
            Long tenantId = TenantContext.getClientId();
            String userId = principal != null ? principal.getName() : "system";

            String content = body.get("content") != null ? body.get("content").toString() : null;
            String mentions = body.get("mentions") != null ? body.get("mentions").toString() : null;
            String idempotencyKey = body.get("idempotencyKey") != null ? body.get("idempotencyKey").toString() : null;

            if (content == null || content.isBlank()) {
                return badRequest("MISSING_CONTENT", "Request body must include 'content' field");
            }

            Map<String, Object> result = lifecycleService.addNote(
                id, content, mentions, idempotencyKey, userId, tenantId);

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.addNote: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // COR-005: Incident promotion
    // =========================================================================

    /**
     * POST /ha-correlated-findings/{id}/incident-promotion/preview — Preview promotion (COR-005).
     */
    @PostMapping("/ha-correlated-findings/{id}/incident-promotion/preview")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Preview incident promotion for a finding",
        description = "Generates a preview of what an incident would look like if this finding were promoted. "
            + "Returns a preview token required by the execute endpoint. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Promotion preview generated with preview token"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Finding not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> previewPromotion(@PathVariable("id") String id) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");

            Map<String, Object> result = promotionService.previewPromotion(id, indexPattern);
            return ResponseEntity.ok(result);
        } catch (FindingNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.previewPromotion: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * POST /ha-correlated-findings/{id}/incident-promotion/execute — Execute promotion (COR-005).
     */
    @PostMapping("/ha-correlated-findings/{id}/incident-promotion/execute")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Execute incident promotion for a finding",
        description = "Promotes a correlated finding to a full incident. Requires a valid preview token from the "
            + "preview endpoint. Creates the incident and transitions the finding status. (FND-002)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Finding promoted to incident successfully"),
        @ApiResponse(responseCode = "400", description = "Missing or invalid preview token"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "404", description = "Finding not found"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<Map<String, Object>> executePromotion(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> body,
            Principal principal) {
        try {
            String indexPattern = indexResolver.resolveIndexPattern("correlation");
            Long tenantId = TenantContext.getClientId();
            String userId = principal != null ? principal.getName() : "system";

            String title = body.get("title") != null ? body.get("title").toString() : null;
            String description = body.get("description") != null ? body.get("description").toString() : null;
            String severity = body.get("severity") != null ? body.get("severity").toString() : null;
            String assignee = body.get("assignee") != null ? body.get("assignee").toString() : null;
            String previewToken = body.get("previewToken") != null ? body.get("previewToken").toString() : null;

            if (previewToken == null || previewToken.isBlank()) {
                return badRequest("MISSING_TOKEN", "Request body must include 'previewToken' field");
            }

            Map<String, Object> result = promotionService.executePromotion(
                id, title, description, severity, assignee, previewToken, userId, tenantId, indexPattern);

            return ResponseEntity.ok(result);
        } catch (InvalidPreviewTokenException e) {
            return ResponseEntity.badRequest().body(Map.of(
                "errorCode", "INVALID_TOKEN",
                "message", e.getMessage(),
                "timestamp", Instant.now().toString()
            ));
        } catch (FindingNotFoundException e) {
            return notFound(e.getMessage());
        } catch (Exception e) {
            log.error("{}.executePromotion: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // COR-006: Resumable SSE stream
    // =========================================================================

    /**
     * GET /ha-correlated-findings/stream — Resumable correlation updates SSE (COR-006).
     */
    @GetMapping(value = "/ha-correlated-findings/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @Operation(
        summary = "Stream real-time finding updates via SSE",
        description = "Opens a Server-Sent Events stream for real-time correlated finding updates. "
            + "Supports Last-Event-ID for resumable reconnection. Scoped to the requesting tenant. (FND-001)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE stream established"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "429", description = "SSE connection limit exceeded")
    })
    public SseEmitter streamFindingUpdates(
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        Long tenantId = TenantContext.getClientId();
        // Default to 0 for non-MSSP / admin users where tenant context is not set
        if (tenantId == null) {
            tenantId = 0L;
        }
        final Long effectiveTenantId = tenantId;
        try {
            log.debug("GET /api/ha-correlated-findings/stream Last-Event-ID={} tenant={}",
                lastEventId, effectiveTenantId);

            // HAR-006: Check SSE rate limits before creating emitter
            String endpoint = "/ha-correlated-findings/stream";
            String tenantStr = String.valueOf(effectiveTenantId);
            rateLimiter.checkLimit(tenantStr, endpoint, null);
            HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantStr, endpoint, null);

            // Create emitter with 30-minute timeout
            SseEmitter emitter = new SseEmitter(FindingSseService.EMITTER_TIMEOUT_MS);

            // Register emitter for this tenant
            sseService.register(effectiveTenantId, emitter);

            // Register rate limiter cleanup on disconnect
            emitter.onCompletion(connectionHandle::close);
            emitter.onTimeout(connectionHandle::close);
            emitter.onError(e -> connectionHandle.close());

            // Replay missed events if Last-Event-ID provided
            if (lastEventId != null && !lastEventId.isBlank()) {
                sseService.replayFrom(effectiveTenantId, lastEventId, emitter);
            }

            return emitter;
        } catch (Exception e) {
            log.error("{}.streamFindingUpdates: {}", CLASSNAME, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // Filter parsing
    // =========================================================================

    private FindingFilters parseFilters(String severity, String status, String tactics,
                                        String assignee, String from, String to) {
        FindingFilters filters = new FindingFilters();

        if (severity != null && !severity.isBlank()) {
            filters.severity = Arrays.asList(severity.split(","));
        }
        if (status != null && !status.isBlank()) {
            filters.status = Arrays.asList(status.split(","));
        }
        if (tactics != null && !tactics.isBlank()) {
            filters.tactics = Arrays.asList(tactics.split(","));
        }
        if (assignee != null && !assignee.isBlank()) {
            filters.assignee = assignee.trim();
        }
        if (from != null && !from.isBlank()) {
            filters.from = from.trim();
        }
        if (to != null && !to.isBlank()) {
            filters.to = to.trim();
        }

        return filters;
    }

    // =========================================================================
    // Limit resolution
    // =========================================================================

    private int resolveLimit(Integer limit) {
        if (limit == null) return DEFAULT_LIMIT;
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new IllegalArgumentException(
                "Parameter 'limit' must be between 1 and " + MAX_LIMIT + " inclusive, got: " + limit);
        }
        return limit;
    }

    // =========================================================================
    // Error response helpers
    // =========================================================================

    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }

    private ResponseEntity<Map<String, Object>> notFound(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", "NOT_FOUND");
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(404).body(error);
    }

    private ResponseEntity<Map<String, Object>> unprocessableEntity(String fromStatus, String toStatus,
                                                                     Set<String> allowedTransitions) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", "INVALID_TRANSITION");
        error.put("message", "Cannot transition from '" + fromStatus + "' to '" + toStatus + "'");
        error.put("currentStatus", fromStatus);
        error.put("requestedStatus", toStatus);
        error.put("allowedTransitions", allowedTransitions);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.unprocessableEntity().body(error);
    }
}
