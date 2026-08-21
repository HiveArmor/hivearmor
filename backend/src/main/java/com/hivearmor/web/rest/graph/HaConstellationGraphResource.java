package com.hivearmor.web.rest.graph;

import com.hivearmor.multitenancy.MsspIndexResolver;
import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.graph.GraphExplorationService;
import com.hivearmor.service.graph.GraphExpansionService;
import com.hivearmor.service.graph.GraphRelationshipService;
import com.hivearmor.service.graph.GraphSnapshotStore;
import com.hivearmor.service.graph.GraphSseService;
import com.hivearmor.service.sse.HaSseRateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * REST controller for Threat Constellation graph endpoints (CON-001 through CON-005).
 *
 * <p>Uses {@code /api/ha-constellation} prefix to avoid conflict with the older
 * {@code /api/ha-graph} controller from Sprint 43 (INV-06).
 *
 * <p>All endpoints require ALERT_QUEUE_AUTH and clear TenantContext in finally blocks.
 *
 * <p>Sprint 48 — Threat Constellation.
 */
@RestController
@RequestMapping("/api/ha-constellation")
public class HaConstellationGraphResource {

    private static final Logger log = LoggerFactory.getLogger(HaConstellationGraphResource.class);
    private static final String CLASSNAME = "HaGraphResource[constellation]";

    private static final String ALERT_QUEUE_AUTH =
        "hasAuthority('ROLE_SOC_ANALYST') or hasAuthority('ROLE_SOC_MANAGER') "
        + "or hasAuthority('ROLE_ANALYST') or hasAuthority('ROLE_ADMIN')";

    private final GraphExplorationService explorationService;
    private final GraphExpansionService expansionService;
    private final GraphRelationshipService relationshipService;
    private final GraphSnapshotStore snapshotStore;
    private final GraphSseService sseService;
    private final MsspIndexResolver indexResolver;
    private final HaSseRateLimiter rateLimiter;

    public HaConstellationGraphResource(GraphExplorationService explorationService,
                           GraphExpansionService expansionService,
                           GraphRelationshipService relationshipService,
                           GraphSnapshotStore snapshotStore,
                           GraphSseService sseService,
                           MsspIndexResolver indexResolver,
                           HaSseRateLimiter rateLimiter) {
        this.explorationService = explorationService;
        this.expansionService = expansionService;
        this.relationshipService = relationshipService;
        this.snapshotStore = snapshotStore;
        this.sseService = sseService;
        this.indexResolver = indexResolver;
        this.rateLimiter = rateLimiter;
    }

    // =========================================================================
    // CON-001: POST /ha-constellation/explore
    // =========================================================================

    /**
     * Explores the graph from a seed entity/query/incident/alert.
     *
     * <p>Body: { "seed": { "type": "entity", "value": "ent-host-fin-wks-044" },
     *            "options": { "hopDepth": 2, "nodeLimit": 200, ... } }
     *
     * @param body request body with seed and options
     * @return exploration response with snapshotId, graph, metadata
     */
    @PostMapping("/explore")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> explore(@RequestBody Map<String, Object> body) {
        try {
            // Validate required fields
            Map<String, Object> seed = (Map<String, Object>) body.get("seed");
            if (seed == null || !seed.containsKey("type") || !seed.containsKey("value")) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("error", "Invalid request: seed must contain type and value");
                return ResponseEntity.badRequest().body(error);
            }

            Map<String, Object> options = (Map<String, Object>) body.getOrDefault("options",
                Map.of());

            String tenantIndexPattern = indexResolver.resolveIndexPattern("entity");
            Map<String, Object> result = explorationService.explore(seed, options,
                tenantIndexPattern);

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.explore: {}", CLASSNAME, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Exploration failed: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // CON-002: POST /ha-constellation/explore/{snapshotId}/expand
    // =========================================================================

    /**
     * Expands a node in an existing constellation snapshot.
     *
     * <p>Body: { "nodeId": "ent-host-eng-srv-012", "hopDepth": 1,
     *            "nodeLimit": 50, "edgeLimit": 100, "direction": "both" }
     *
     * @param snapshotId the snapshot UUID from a previous explore call
     * @param body       request body with nodeId and expansion options
     * @return expansion response with addedNodes, addedEdges, removedNodes, snapshot
     */
    @PostMapping("/explore/{snapshotId}/expand")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> expand(
            @PathVariable String snapshotId,
            @RequestBody Map<String, Object> body) {
        try {
            // Validate required fields
            String nodeId = (String) body.get("nodeId");
            if (nodeId == null || nodeId.isBlank()) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("error", "Invalid request: nodeId is required");
                return ResponseEntity.badRequest().body(error);
            }

            String tenantIndexPattern = indexResolver.resolveIndexPattern("entity");
            Map<String, Object> options = new LinkedHashMap<>(body);
            options.remove("nodeId"); // nodeId is separate from options

            Map<String, Object> result = expansionService.expand(
                snapshotId, nodeId, options, tenantIndexPattern);

            return ResponseEntity.ok(result);
        } catch (GraphExpansionService.SnapshotNotFoundException e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Snapshot not found or expired: " + snapshotId);
            return ResponseEntity.status(404).body(error);
        } catch (GraphExpansionService.NodeNotInSnapshotException e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Node not found in snapshot: " + body.get("nodeId"));
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            log.error("{}.expand: {}", CLASSNAME, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Expansion failed: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // CON-003: GET /ha-constellation/relationships/{relationshipId}
    // =========================================================================

    /**
     * Fetches detailed evidence for a relationship (edge) in the constellation graph.
     *
     * <p>Returns the relationship with source/target entities, supporting events,
     * related alerts, timeline with milestones, and a communication pattern summary.
     *
     * @param relationshipId the relationship document ID
     * @return relationship evidence or 404 if not found
     */
    @GetMapping("/relationships/{relationshipId}")
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public ResponseEntity<Map<String, Object>> getRelationshipEvidence(
            @PathVariable String relationshipId) {
        try {
            String tenantIndexPattern = indexResolver.resolveIndexPattern("relationship");
            Map<String, Object> result = relationshipService.getRelationshipEvidence(
                relationshipId, tenantIndexPattern);

            if (result == null) {
                Map<String, Object> error = new LinkedHashMap<>();
                error.put("error", "Relationship not found: " + relationshipId);
                return ResponseEntity.status(404).body(error);
            }

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("{}.getRelationshipEvidence: {}", CLASSNAME, e.getMessage(), e);
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Failed to fetch relationship evidence: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        } finally {
            TenantContext.clear();
        }
    }

    // =========================================================================
    // CON-005: GET /ha-constellation/stream
    // =========================================================================

    /**
     * Opens an SSE connection for real-time constellation graph updates.
     *
     * <p>Validates the snapshot exists and belongs to the user's tenant.
     * Creates a 30-minute SseEmitter, registers it with GraphSseService,
     * and replays buffered events if Last-Event-ID is provided.
     *
     * @param snapshotId  the snapshot to subscribe to
     * @param lastEventId optional Last-Event-ID header for replay
     * @return SseEmitter streaming graph events
     */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(ALERT_QUEUE_AUTH)
    public SseEmitter stream(
            @RequestParam("snapshot") String snapshotId,
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        try {
            // Validate snapshot exists and belongs to user's tenant
            GraphSnapshotStore.SnapshotEntry snapshot = snapshotStore.peekSnapshot(snapshotId);
            if (snapshot == null) {
                SseEmitter errorEmitter = new SseEmitter(0L);
                errorEmitter.completeWithError(
                    new IllegalArgumentException("Snapshot not found or expired: " + snapshotId));
                return errorEmitter;
            }

            // Validate tenant ownership
            String currentTenant = TenantContext.getClientPrefix();
            String effectiveTenant = currentTenant != null ? currentTenant : "__default__";
            if (!effectiveTenant.equals(snapshot.getTenantId())) {
                SseEmitter errorEmitter = new SseEmitter(0L);
                errorEmitter.completeWithError(
                    new SecurityException("Snapshot does not belong to current tenant"));
                return errorEmitter;
            }

            // HAR-006: Check SSE rate limits before creating emitter
            String endpoint = "/ha-constellation/stream";
            rateLimiter.checkLimit(effectiveTenant, endpoint, snapshotId);
            HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(effectiveTenant, endpoint, snapshotId);

            // Create SseEmitter with 30-minute timeout
            SseEmitter emitter = new SseEmitter(GraphSseService.EMITTER_TIMEOUT_MS);

            // Register emitter (also resets snapshot TTL)
            sseService.register(snapshotId, emitter);

            // Register rate limiter cleanup on disconnect
            emitter.onCompletion(connectionHandle::close);
            emitter.onTimeout(connectionHandle::close);
            emitter.onError(e -> connectionHandle.close());

            // Replay buffered events if Last-Event-ID provided
            if (lastEventId != null && !lastEventId.isBlank()) {
                sseService.replayFrom(snapshotId, lastEventId, emitter);
            }

            log.debug("{}.stream: SSE connection established for snapshot {}",
                CLASSNAME, snapshotId);

            return emitter;
        } catch (Exception e) {
            log.error("{}.stream: {}", CLASSNAME, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        } finally {
            TenantContext.clear();
        }
    }
}
