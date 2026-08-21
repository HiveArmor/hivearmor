package com.hivearmor.web.rest.hunt;

import com.hivearmor.multitenancy.TenantContext;
import com.hivearmor.service.hunt.HaSeverityBoardService;
import com.hivearmor.service.hunt.HaSeverityBoardSseService;
import com.hivearmor.service.hunt.dto.SeverityBoardResponse;
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

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HiveArmor REST controller for the severity board workload projection.
 *
 * <p>GET /api/ha-alerts/severity-board — returns a bounded severity-prioritized
 * workload board with overview counters, severity lanes (each containing up to
 * {@code laneLimit} alert previews), and a 12-bucket trend histogram.
 *
 * <p>Requires {@code ROLE_SOC_ANALYST} or higher authority.
 *
 * <p>Sprint 37 — ALT-023 (Requirement 1).
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Severity Board", description = "Severity-based alert board lanes and metrics (ALT-023)")
public class HaSeverityBoardResource {

    private static final Logger log = LoggerFactory.getLogger(HaSeverityBoardResource.class);
    private static final String CLASSNAME = "HaSeverityBoardResource";

    private static final String SEVERITY_BOARD_AUTH =
        "hasAnyAuthority('ROLE_SOC_ANALYST', 'ROLE_SOC_MANAGER', 'ROLE_SOC_LEAD', 'ROLE_ADMIN')";

    private final HaSeverityBoardService haSeverityBoardService;
    private final HaSeverityBoardSseService severityBoardSseService;
    private final HaSseRateLimiter rateLimiter;

    public HaSeverityBoardResource(HaSeverityBoardService haSeverityBoardService,
                                   HaSeverityBoardSseService severityBoardSseService,
                                   HaSseRateLimiter rateLimiter) {
        this.haSeverityBoardService = haSeverityBoardService;
        this.severityBoardSseService = severityBoardSseService;
        this.rateLimiter = rateLimiter;
    }

    /**
     * GET /api/ha-alerts/severity-board
     *
     * <p>Returns the severity board workload projection for the current tenant scope.
     *
     * @param from       start of the time range (ISO-8601); defaults to now minus 24 hours
     * @param to         end of the time range (ISO-8601); defaults to now
     * @param scope      alert scope filter: "active" (status &lt; 5) or "all"; defaults to "active"
     * @param ownership  ownership filter: "all", "mine", or "unassigned"; defaults to "all"
     * @param laneLimit  maximum number of alert previews per lane (1–10); defaults to 4
     * @return ResponseEntity containing the {@link SeverityBoardResponse}
     */
    @GetMapping("/ha-alerts/severity-board")
    @PreAuthorize(SEVERITY_BOARD_AUTH)
    @Operation(
        summary = "Get severity board workload projection",
        description = "Returns the severity-prioritized workload board with overview counters, "
            + "severity lanes (each containing up to laneLimit alert previews), and a 12-bucket "
            + "trend histogram for the specified time range and filters. (ALT-023)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Severity board with lanes, counters, and trend histogram"),
        @ApiResponse(responseCode = "400", description = "Invalid parameter (time range, scope, ownership, or laneLimit)"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges — requires SOC Analyst or higher"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public ResponseEntity<?> getSeverityBoard(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false, defaultValue = "active") String scope,
            @RequestParam(required = false, defaultValue = "all") String ownership,
            @RequestParam(required = false) Integer laneLimit) {
        try {
            // Resolve time range defaults
            Instant toInstant = (to != null && !to.isBlank()) ? Instant.parse(to) : Instant.now();
            Instant fromInstant = (from != null && !from.isBlank())
                ? Instant.parse(from)
                : toInstant.minusSeconds(86400);

            // Validate time range
            if (fromInstant.isAfter(toInstant)) {
                return badRequest("INVALID_TIME_RANGE", "Parameter 'from' must be before 'to'");
            }

            // Resolve and validate laneLimit
            int effectiveLaneLimit = (laneLimit != null) ? laneLimit : 4;
            if (effectiveLaneLimit < 1 || effectiveLaneLimit > 10) {
                return badRequest("INVALID_PARAMETER",
                    "Parameter 'laneLimit' must be between 1 and 10, got: " + effectiveLaneLimit);
            }

            // Validate scope
            if (!"active".equalsIgnoreCase(scope) && !"all".equalsIgnoreCase(scope)) {
                return badRequest("INVALID_PARAMETER",
                    "Parameter 'scope' must be 'active' or 'all', got: " + scope);
            }

            // Validate ownership
            if (!"all".equalsIgnoreCase(ownership)
                && !"mine".equalsIgnoreCase(ownership)
                && !"unassigned".equalsIgnoreCase(ownership)) {
                return badRequest("INVALID_PARAMETER",
                    "Parameter 'ownership' must be 'all', 'mine', or 'unassigned', got: " + ownership);
            }

            SeverityBoardResponse response = haSeverityBoardService.computeBoard(
                fromInstant, toInstant, scope, ownership, effectiveLaneLimit);

            return ResponseEntity.ok(response);

        } catch (IllegalArgumentException e) {
            return badRequest("INVALID_PARAMETER", e.getMessage());
        } catch (Exception e) {
            log.error("{}.getSeverityBoard: {}", CLASSNAME, e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        } finally {
            TenantContext.clear();
        }
    }

    /**
     * GET /api/ha-alerts/severity-board/stream
     *
     * <p>Opens an SSE connection for real-time severity board updates.
     * Supports Last-Event-ID header for reconnection replay from in-memory buffer.
     *
     * @param lastEventId Last-Event-ID header for replay (optional)
     * @return SseEmitter producing live severity board events
     */
    @GetMapping(value = "/ha-alerts/severity-board/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(SEVERITY_BOARD_AUTH)
    @Operation(
        summary = "Stream live severity board updates (SSE)",
        description = "Opens an SSE connection for real-time severity board lane and counter updates. "
            + "Supports Last-Event-ID header for reconnection replay from in-memory buffer. (ALT-023)"
    )
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "SSE stream opened successfully"),
        @ApiResponse(responseCode = "401", description = "Authentication required"),
        @ApiResponse(responseCode = "403", description = "Insufficient privileges"),
        @ApiResponse(responseCode = "500", description = "Internal server error")
    })
    public SseEmitter streamSeverityBoard(
            @RequestHeader(value = "Last-Event-ID", required = false) String lastEventId) {
        try {
            Long tenantId = resolveTenantId();
            log.debug("{}.streamSeverityBoard: opening SSE for tenant={} lastEventId={}",
                CLASSNAME, tenantId, lastEventId);

            // HAR-006: Check SSE rate limits before creating emitter
            String endpoint = "/ha-alerts/severity-board/stream";
            String tenantStr = String.valueOf(tenantId);
            rateLimiter.checkLimit(tenantStr, endpoint, null);
            HaSseRateLimiter.ConnectionHandle connectionHandle = rateLimiter.register(tenantStr, endpoint, null);

            SseEmitter emitter = new SseEmitter(HaSeverityBoardSseService.EMITTER_TIMEOUT_MS);

            // Register emitter for this tenant
            severityBoardSseService.register(tenantId, emitter);

            // Register rate limiter cleanup on disconnect
            emitter.onCompletion(connectionHandle::close);
            emitter.onTimeout(connectionHandle::close);
            emitter.onError(e -> connectionHandle.close());

            // Replay missed events if Last-Event-ID provided
            if (lastEventId != null && !lastEventId.isBlank()) {
                severityBoardSseService.replayFrom(tenantId, lastEventId, emitter);
            }

            return emitter;

        } catch (Exception e) {
            log.error("{}.streamSeverityBoard: {}", CLASSNAME, e.getMessage(), e);
            SseEmitter errorEmitter = new SseEmitter(0L);
            errorEmitter.completeWithError(e);
            return errorEmitter;
        }
    }

    /**
     * Resolves the effective tenant ID from the TenantContext.
     */
    private Long resolveTenantId() {
        String tenantPrefix = TenantContext.get();
        // Convert tenant prefix to a stable numeric ID (hash-based)
        if (tenantPrefix == null || tenantPrefix.isBlank()) {
            return 0L; // Default/global tenant
        }
        return (long) tenantPrefix.hashCode();
    }

    /**
     * Builds a 400 Bad Request response with a structured error body.
     */
    private ResponseEntity<Map<String, Object>> badRequest(String errorCode, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("errorCode", errorCode);
        error.put("message", message);
        error.put("timestamp", Instant.now().toString());
        return ResponseEntity.badRequest().body(error);
    }
}
